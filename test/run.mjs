// 확장 프로그램을 크로미움에 얹고 모사 화면에서 켜본다.
//   node test/run.mjs            결과 요약 + 스크린샷
//   node test/run.mjs --keep     스크린샷을 test/shots 에 남긴다
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });

const PORT = 8137;
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'test/mock.html';
  const file = path.join(repo, rel);
  if (!file.startsWith(repo) || !fs.existsSync(file)) { res.writeHead(404); res.end('no'); return; }
  const type = file.endsWith('.css') ? 'text/css'
    : file.endsWith('.js') ? 'text/javascript'
    : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain';
  res.writeHead(200, { 'content-type': type });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(PORT, r));

// 배포용 manifest 는 claude.ai 만 대상으로 한다.
// 시험용으로는 로컬 주소를 더한 사본을 만들어 얹는다.
const extDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'cpv-ext-'));
fs.cpSync(path.join(repo, 'src'), path.join(extDir, 'src'), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'manifest.json'), 'utf8'));
const local = ['http://127.0.0.1/*', 'http://localhost/*'];
manifest.host_permissions.push(...local);
manifest.content_scripts[0].matches.push(...local);
fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

const ctx = await chromium.launchPersistentContext(
  fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'cpv-profile-')),
  {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1600, height: 1000 },
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`]
  }
);

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e.message).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140)); });

await page.goto(`http://127.0.0.1:${PORT}/test/mock.html`);
await page.waitForFunction(() => window.__ready === true);
await page.waitForFunction(() => !!document.querySelector('.cpv-toggle'), null, { timeout: 5000 });

const mock = await page.evaluate(() => window.__mock);
const mounted = await page.evaluate(() => document.querySelectorAll('[data-testid="transcript-row"]').length);
await page.screenshot({ path: path.join(shots, '01-before.png') });

await page.click('.cpv-toggle');
await page.waitForFunction(() => document.querySelectorAll('.cpv-strip').length > 0, null, { timeout: 60000 });
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(shots, '02-page-view.png') });

const state = await page.evaluate(() => {
  const root = document.querySelector('.cpv-root');
  const cs = getComputedStyle(root);
  const num = v => Math.round(parseFloat(cs.getPropertyValue(v)));
  const strips = [...document.querySelectorAll('.cpv-strip')].map(s => ({
    kind: s.dataset.kind, shot: s.dataset.shot, pages: Number(s.dataset.pages),
    fragments: (s.querySelector('.cpv-card') || s).getClientRects().length,
    width: Math.round(s.getBoundingClientRect().width)
  }));
  const cardW = num('--cpv-card-w'), cardH = num('--cpv-card-h');
  return {
    카드폭: cardW, 카드높이: cardH, 비율: +(cardW / cardH).toFixed(3),
    간격: num('--cpv-gap'),
    페이지수: Number(root.dataset.pages),
    strips,
    말풍선: document.querySelectorAll('.cpv-bubble').length,
    말풍선있는샷: new Set([...document.querySelectorAll('.cpv-bubble')].map(b => b.dataset.shot)).size,
    본문카드묶음: document.querySelectorAll('.cpv-strip[data-kind="body"]').length,
    카운터: document.querySelector('.cpv-counter')?.textContent || null,
    수집한행: Number(root.dataset.rows), 빠진행: Number(root.dataset.gaps),
    번호범위: root.dataset.range,
    스크롤바: (() => {
      const b = document.querySelector('.cpv-scrollbar');
      const th = document.querySelector('.cpv-thumb');
      if (!b || !th) return null;
      const br = b.getBoundingClientRect(), tr = th.getBoundingClientRect();
      return { 보임: getComputedStyle(b).display !== 'none',
               폭: Math.round(br.width), 높이: Math.round(br.height),
               손잡이폭: Math.round(tr.width),
               색: getComputedStyle(th).backgroundColor };
    })(),
    페이지번호: document.querySelectorAll('.cpv-pageno').length,
    칩: document.querySelectorAll('.cpv-chip').length,
    도구줄: document.querySelectorAll('.cpv-toolline').length,
    코드복원: document.querySelectorAll('.cpv-code').length,
    빈코드블록: document.querySelectorAll('.cpv-card diffs-container').length,
    카드그림자: getComputedStyle(document.querySelector('.cpv-card')).boxShadow.slice(0, 90),
    덮개배경: getComputedStyle(root).backgroundColor,
    덮개불투명: !/rgba\([^)]*,\s*0(\.\d+)?\)/.test(getComputedStyle(root).backgroundColor),
    앱대화보임: getComputedStyle(document.querySelector('[data-testid="epitaxy-virtual-transcript"]')).visibility,
    화면중앙에잡히는것: (() => {
      const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      if (!el) return null;
      return el.closest('.cpv-root') ? '페이지 보기 레이어'
           : el.closest('[data-testid="epitaxy-virtual-transcript"]') ? '원본 대화(문제)'
           : (el.className || el.tagName).toString().slice(0, 30);
    })()
  };
});

// 첫 페이지에서 프롬프트 접기/펼치기
await page.evaluate(() => document.querySelector('.cpv-bubble').click());
await page.waitForTimeout(220);
await page.screenshot({ path: path.join(shots, '03-prompt-open.png') });
const bubble = await page.evaluate(() => {
  const b = document.querySelector('.cpv-bubble.open');
  const card = document.querySelector('.cpv-card');
  if (!b) return null;
  const br = b.getBoundingClientRect(), cr = card.getBoundingClientRect();
  const hit = document.elementFromPoint(br.left + br.width / 2, cr.top + 12);
  return {
    말풍선높이: Math.round(br.height),
    카드와겹친px: Math.round(br.bottom - cr.top),
    겹친자리에보이는것: hit ? (hit.className || hit.tagName).toString().slice(0, 24) : null,
    카드는제자리: Math.round(cr.top)
  };
});
await page.evaluate(() => document.querySelector('.cpv-bubble').click());
await page.waitForTimeout(200);

// 오른쪽으로 세 칸 이동
for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(320); }
// 부드러운 이동이 끝날 때까지 기다린 뒤에 잰다
await page.waitForFunction(() => {
  const t = document.querySelector('.cpv-track');
  const now = Math.round(t.scrollLeft);
  const same = window.__lastScroll === now;
  window.__lastScroll = now;
  return same;
}, null, { timeout: 4000 });
await page.screenshot({ path: path.join(shots, '04-moved.png') });
const centering = await page.evaluate(() => {
  const root = document.querySelector('.cpv-root');
  const track = document.querySelector('.cpv-track');
  const i = Number(root.dataset.focus);
  const cards = [...document.querySelectorAll('.cpv-strip')]
    .flatMap(s => [...(s.querySelector('.cpv-card') || s).getClientRects()])
    .sort((a, b) => a.left - b.left);
  const cur = cards[i];
  const rr = root.getBoundingClientRect();
  return {
    초점번호: i, 페이지수: Number(root.dataset.pages),
    카드왼쪽: Math.round(cur.left - rr.left), 카드폭: Math.round(cur.width),
    덮개폭: Math.round(rr.width),
    중앙에서벗어난px: Math.round((cur.left - rr.left) - (rr.width - cur.width) / 2),
    스크롤: Math.round(track.scrollLeft), 최대스크롤: Math.round(track.scrollWidth - track.clientWidth)
  };
});

// 도구 내역 펼치기 (본문 오른쪽에 붙는지)
const beforeTool = await page.evaluate(() => Number(document.querySelector('.cpv-root').dataset.pages));
await page.evaluate(() => document.querySelector('.cpv-toolline')?.click());
await page.waitForTimeout(500);
const afterTool = await page.evaluate(() => Number(document.querySelector('.cpv-root').dataset.pages));
const toolPos = await page.evaluate(() => {
  const strips = [...document.querySelectorAll('.cpv-strip')];
  const key = strips.find(s => s.dataset.kind === 'body')?.dataset.shot;
  const body = strips.find(s => s.dataset.kind === 'body' && s.dataset.shot === key);
  const tool = strips.find(s => s.dataset.kind === 'tool' && s.dataset.shot === key);
  if (!body || !tool) return null;
  const order = strips.indexOf(tool) - strips.indexOf(body);
  return { 본문다음칸: order, 도구페이지수: Number(tool.dataset.pages),
           본문오른쪽에있나: tool.getBoundingClientRect().left > body.getBoundingClientRect().left };
});
// 그 도구 페이지로 이동
await page.evaluate(() => {
  const tool = document.querySelector('.cpv-strip[data-kind="tool"]');
  const card = tool.querySelector('.cpv-card');
  const track = document.querySelector('.cpv-track');
  const r = card.getClientRects()[0];
  const root = document.querySelector('.cpv-root').getBoundingClientRect();
  track.scrollLeft += (r.left - root.left) - (root.width - r.width) / 2;
  track.dispatchEvent(new Event('scroll'));
});
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(shots, '05-tool-open.png') });

// 페이지 밖으로 나간 글자가 있는지
const spill = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.cpv-strip')];
  let lines = 0, out = 0, straddle = 0; const who = [];
  const rng = document.createRange();
  for (const strip of cards) {
    const card = strip.querySelector('.cpv-card') || strip;
    const rects = [...card.getClientRects()];
    const walker = document.createTreeWalker(strip, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.nodeValue.trim()) continue;
      rng.selectNodeContents(n);
      for (const r of rng.getClientRects()) {
        if (r.height < 2) continue;
        lines++;
        const box = rects.find(b => r.left >= b.left - 1 && r.right <= b.right + 1);
        if (!box) {
          straddle++;
          const host = n.parentElement?.closest('table, .epitaxy-table-scroll, .cpv-code, pre, li, p');
          who.push(host ? (host.className || host.tagName).toString().slice(0, 30) : '?');
          continue;
        }
        if (r.top < box.top - 1 || r.bottom > box.bottom + 1) out++;
      }
    }
  }
  return { 검사한줄: lines, 페이지밖: out, 경계걸침: straddle, 걸친요소: [...new Set(who)].slice(0, 6) };
});

await page.click('.cpv-toggle');
await page.waitForTimeout(300);
const afterOff = await page.evaluate(() => ({
  덮개남음: !!document.querySelector('.cpv-root'),
  원본대화보임: getComputedStyle(document.querySelector('[data-testid="epitaxy-virtual-transcript"]')).visibility,
  원본행: document.querySelectorAll('[data-testid="transcript-row"]').length
}));
await page.screenshot({ path: path.join(shots, '06-after-off.png') });

console.log(JSON.stringify({
  모사화면: { 전체행: mock.rows, 전체높이: mock.total, 처음마운트된행: mounted },
  켠뒤: state,
  가운데정렬: centering,
  프롬프트겹침: bubble,
  도구펼침: { 이전페이지수: beforeTool, 이후페이지수: afterTool, 위치: toolPos },
  잘림검사: spill,
  끈뒤: afterOff,
  오류: errors
}, null, 1));

await ctx.close();
server.close();
