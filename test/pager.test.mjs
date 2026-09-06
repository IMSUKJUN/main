/*
 * Integration test. Loads the real content scripts into a fixture page in
 * Chromium and drives the toolbar the way a person would.
 *
 * Run: node test/pager.test.mjs
 * Requires playwright (global install is fine; see package.json scripts).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json"
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`  ok   ${label}`);
  }
}

const shadow = (page) => page.locator("#gdh-pager-host .pager");
const control = (page, act) => page.locator(`#gdh-pager-host [data-act="${act}"]`);

async function state(page) {
  return page.evaluate(() => {
    const root = document.getElementById("gdh-pager-host").shadowRoot;
    const pager = root.querySelector(".pager");
    return {
      state: pager.getAttribute("data-state"),
      page: root.querySelector(".pager__input").value,
      total: root.querySelector(".pager__total").textContent,
      visible: window.__fixture.visibleTurns(),
      prevDisabled: root.querySelector('[data-act="prev"]').hasAttribute("disabled"),
      nextDisabled: root.querySelector('[data-act="next"]').hasAttribute("disabled"),
      live: root.querySelector(".pager__live").textContent,
      label: (document.querySelector("[data-gdh-pager-anchor]") || {}).getAttribute
        ? document.querySelector("[data-gdh-pager-anchor]").getAttribute("data-gdh-pager-label")
        : null
    };
  });
}

const run = async () => {
  const server = await serve();
  const { port } = server.address();
  const browser = await chromium.launch(
    process.env.GDH_CHROMIUM ? { executablePath: process.env.GDH_CHROMIUM } : {}
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto(`http://localhost:${port}/test/fixture.html`);
  await shadow(page).waitFor();
  await page.waitForFunction(
    () => document.getElementById("gdh-pager-host").shadowRoot.querySelector(".pager").getAttribute("data-state") === "ready"
  );

  console.log("initial state");
  let s = await state(page);
  check("starts on the newest page", s.page, "3");
  check("page count reflects 14 turns at 6 per page", s.total, "/ 3");
  check("last page shows the remaining 2 turns", s.visible, 2);
  check("next is disabled on the last page", s.nextDisabled, true);
  check("prev is enabled on the last page", s.prevDisabled, false);
  check("page caption is written on the first turn of the page", s.label, "3 / 3 페이지 · 메시지 13–14");

  console.log("previous / next");
  await control(page, "prev").click();
  s = await state(page);
  check("prev moves back one page", s.page, "2");
  check("a full page shows pageSize turns", s.visible, 6);
  check("page change is announced", s.live, "3페이지 중 2페이지, 메시지 7부터 12까지");

  await control(page, "first").click();
  s = await state(page);
  check("first jumps to page 1", s.page, "1");
  check("prev is disabled on the first page", s.prevDisabled, true);

  console.log("keyboard shortcuts");
  await page.keyboard.press("Alt+Shift+ArrowRight");
  s = await state(page);
  check("Alt+Shift+Right advances one page", s.page, "2");

  await page.locator("#composer").focus();
  await page.keyboard.press("Alt+Shift+ArrowRight");
  s = await state(page);
  check("shortcuts stay off while typing in a text field", s.page, "2");

  console.log("jump by number");
  await page.locator("#gdh-pager-host .pager__input").fill("9");
  await page.keyboard.press("Enter");
  s = await state(page);
  check("out-of-range input clamps to the last page", s.page, "3");

  console.log("page size");
  await page.locator("#gdh-pager-host .pager__select").selectOption("2");
  s = await state(page);
  check("smaller pages recount the total", s.total, "/ 7");
  check("smaller pages show fewer turns", s.visible, 2);
  check("page size is persisted", await page.evaluate(() => window.__fixture.settings().pageSize), 2);

  await page.locator("#gdh-pager-host .pager__select").selectOption("6");

  console.log("streaming: a new turn arrives");
  s = await state(page);
  check("restoring the page size keeps the reader on the newest page", s.page, "3");
  await page.evaluate(() => window.__fixture.addTurn("답변 8"));
  await page.waitForFunction(() => window.__fixture.visibleTurns() === 3);
  s = await state(page);
  check("a new turn keeps the reader on the newest page", s.page, "3");
  check("the new turn is visible", s.visible, 3);

  console.log("streaming while reading an earlier page");
  await control(page, "first").click();
  await page.evaluate(() => window.__fixture.addTurn("질문 9"));
  await page.waitForTimeout(400);
  s = await state(page);
  check("an earlier page is not yanked away", s.page, "1");
  check("total grows to 3 pages of 6", s.total, "/ 3");

  console.log("removed turns");
  await control(page, "last").click();
  await page.evaluate(() => window.__fixture.removeLastTurn());
  await page.waitForFunction(() => window.__fixture.visibleTurns() === 3);
  check(
    "every remaining turn is either shown or hidden, none left over",
    await page.evaluate(() => ({
      turns: document.querySelectorAll(".list > *").length,
      hidden: document.querySelectorAll('.list > [data-gdh-pager-hidden="true"]').length,
      shown: window.__fixture.visibleTurns()
    })),
    { turns: 15, hidden: 12, shown: 3 }
  );

  console.log("show all");
  await control(page, "showall").click();
  s = await state(page);
  check("show all reveals every turn", s.visible, 15);
  check("navigation is disabled while showing all", s.nextDisabled, true);
  await control(page, "showall").click();
  s = await state(page);
  check("turning show all off restores paging", s.visible, 3);

  console.log("collapse");
  await control(page, "collapse").click();
  check(
    "collapsed toolbar reports the page in its summary",
    await page.evaluate(() => document.getElementById("gdh-pager-host").shadowRoot.querySelector(".pager__summary").textContent),
    "3 / 3"
  );
  await control(page, "collapse").click();

  console.log("theme follows the host page");
  await page.evaluate(() => (document.body.style.background = "#0b0b0b"));
  await page.waitForFunction(() => document.documentElement.getAttribute("data-gdh-theme") === "dark");
  check(
    "a dark page gives the toolbar the dark palette",
    await page.evaluate(() => document.getElementById("gdh-pager-host").getAttribute("data-gdh-theme")),
    "dark"
  );
  await page.evaluate(() => (document.body.style.background = "#ffffff"));
  await page.waitForFunction(() => document.documentElement.getAttribute("data-gdh-theme") === "light");
  check(
    "switching the page back to light switches the toolbar back",
    await page.evaluate(() => document.getElementById("gdh-pager-host").getAttribute("data-gdh-theme")),
    "light"
  );

  console.log("conversation switch");
  await page.evaluate(() => {
    document.querySelector(".list").replaceChildren();
    for (let i = 1; i <= 4; i += 1) window.__fixture.addTurn("새 대화 " + i);
    window.__fixture.navigate("/test/fixture.html?chat=second");
  });
  await page.waitForFunction(
    () =>
      document.getElementById("gdh-pager-host").shadowRoot.querySelector(".pager__total").textContent === "/ 1"
  );
  s = await state(page);
  check("a new conversation restarts at its own last page", s.page, "1");
  check("all four turns of the short conversation are shown", s.visible, 4);

  console.log("empty conversation");
  await page.evaluate(() => document.querySelector(".list").replaceChildren());
  await page.waitForFunction(
    () => document.getElementById("gdh-pager-host").shadowRoot.querySelector(".pager").getAttribute("data-state") !== "ready"
  );
  check(
    "an empty conversation is not an error",
    await page.evaluate(() => document.getElementById("gdh-pager-host").shadowRoot.querySelector(".pager").getAttribute("data-state")),
    "empty"
  );

  console.log("turning the extension off");
  await page.evaluate(() => {
    for (let i = 1; i <= 6; i += 1) window.__fixture.addTurn("복구 " + i);
  });
  await page.waitForFunction(() => window.__fixture.visibleTurns() === 6);
  await control(page, "off").click();
  check("the toolbar is removed", await page.locator("#gdh-pager-host").count(), 0);
  check(
    "no pagination attributes are left on the page",
    await page.evaluate(
      () =>
        document.querySelectorAll(
          "[data-gdh-pager-hidden],[data-gdh-pager-anchor],[data-gdh-pager-label],[data-gdh-pager-scroller],[data-gdh-theme]"
        ).length
    ),
    0
  );
  check("the setting is stored as off", await page.evaluate(() => window.__fixture.settings().enabled), false);

  check("no uncaught page errors", errors, []);

  await browser.close();
  server.close();

  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
