/*
 * Pager toolbar.
 *
 * Rendered into a closed-off shadow root so host-page CSS cannot restyle it and
 * its own CSS cannot leak out. Built with DOM calls rather than innerHTML so it
 * stays compatible with pages that enforce Trusted Types.
 */
(() => {
  "use strict";
  const NS = (window.__GDH_PAGER__ = window.__GDH_PAGER__ || {});
  if (NS.Toolbar) return;
  const C = NS.constants;
  const T = C.TEXT;

  /* Minimal styling applied if the packaged CSS cannot be fetched, so the
   * toolbar is still readable and operable instead of unstyled. */
  const FALLBACK_CSS = `
    :host { position: fixed; bottom: 24px; right: 24px; z-index: 2147483000;
            font-family: "Noto Sans KR", sans-serif, Arial, Helvetica, sans-serif; }
    .pager { display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
             padding: 8px; border: 1px solid #cbd5e1; border-radius: 32px;
             background: #ffffff; color: #171717; font-size: 16px; }
    .pager__btn, .pager__retry { min-width: 44px; min-height: 44px; border-radius: 999px;
             border: 1px solid #cbd5e1; background: #ffffff; color: #171717; cursor: pointer; }
    .pager__input { min-height: 44px; width: 4ch; text-align: center; }
    .pager__live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .pager__message { flex-basis: 100%; margin: 0; padding: 8px 12px; }
  `;

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const key of Object.keys(props)) {
        const value = props[key];
        if (value === null || value === undefined) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else node.setAttribute(key, value);
      }
    }
    for (const child of children || []) node.appendChild(child);
    return node;
  }

  function icon(pathData) {
    const NSURI = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NSURI, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "pager__icon");
    for (const d of pathData) {
      const path = document.createElementNS(NSURI, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }

  const ICONS = {
    first: ["M18 5 11 12l7 7", "M7 5v14"],
    prev: ["M15 5 8 12l7 7"],
    next: ["M9 5l7 7-7 7"],
    last: ["M6 5l7 7-7 7", "M17 5v14"],
    all: ["M4 6h16", "M4 12h16", "M4 18h16"],
    collapse: ["M6 15l6-6 6 6"],
    expand: ["M6 9l6 6 6-6"],
    close: ["M6 6l12 12", "M18 6 6 18"]
  };

  async function loadStyleSheets(shadow) {
    const files = ["src/content/tokens.css", "src/content/toolbar.css"];
    try {
      const texts = await Promise.all(
        files.map(async (file) => {
          const response = await fetch(chrome.runtime.getURL(file));
          if (!response.ok) throw new Error("style " + file + " " + response.status);
          return response.text();
        })
      );
      applyCss(shadow, texts.join("\n"));
      return true;
    } catch (_) {
      applyCss(shadow, FALLBACK_CSS);
      return false;
    }
  }

  function applyCss(shadow, cssText) {
    if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in shadow) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(cssText);
        shadow.adoptedStyleSheets = [sheet];
        return;
      } catch (_) {
        /* fall through to <style> */
      }
    }
    const style = document.createElement("style");
    style.textContent = cssText;
    shadow.appendChild(style);
  }

  class Toolbar {
    /* handlers: { go(index), setPageSize(n), toggleShowAll(next), disable(), retry() } */
    constructor(handlers) {
      this.handlers = handlers;
      this.host = null;
      this.shadow = null;
      this.nodes = {};
      this.state = "loading";
      this.collapsed = false;
      this.lastAnnouncement = "";
    }

    async mount(position) {
      if (this.host) return;
      const host = document.createElement("div");
      host.id = C.HOST_ID;
      host.setAttribute("data-position", position || C.DEFAULTS.position);
      this.host = host;
      this.shadow = host.attachShadow({ mode: "open" });
      this.build();
      document.documentElement.appendChild(host);
      await loadStyleSheets(this.shadow);
    }

    unmount() {
      if (this.host && this.host.parentNode) this.host.parentNode.removeChild(this.host);
      this.host = null;
      this.shadow = null;
      this.nodes = {};
    }

    setPosition(position) {
      if (this.host) this.host.setAttribute("data-position", position);
    }

    build() {
      const n = this.nodes;

      const btn = (act, variant, label, iconKey, text) => {
        const children = [];
        if (iconKey) children.push(icon(ICONS[iconKey]));
        if (text) children.push(el("span", { text }));
        const node = el(
          "button",
          {
            type: "button",
            class: "pager__btn" + (variant ? " pager__btn--" + variant : ""),
            "data-act": act,
            "aria-label": label,
            title: label
          },
          children
        );
        node.addEventListener("click", (event) => this.onAction(act, event));
        return node;
      };

      n.first = btn("first", "icon", T.first, "first");
      n.prev = btn("prev", "icon", T.prev, "prev");
      n.next = btn("next", "primary", T.next, "next");
      n.last = btn("last", "icon", T.last, "last");
      n.showAll = btn("showall", "icon", T.showAllOn, "all");
      n.showAll.setAttribute("aria-pressed", "false");
      n.off = btn("off", "icon", T.turnOff, "close");
      n.collapse = btn("collapse", "icon", T.collapse, "collapse");
      n.collapse.setAttribute("aria-expanded", "true");

      n.input = el("input", {
        type: "number",
        class: "pager__input",
        id: "gdh-pager-page",
        min: "1",
        step: "1",
        inputmode: "numeric",
        autocomplete: "off",
        "aria-describedby": "gdh-pager-total"
      });
      n.input.addEventListener("change", () => this.commitInput());
      n.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.commitInput();
        }
      });

      n.total = el("span", { class: "pager__total", id: "gdh-pager-total" });

      n.select = el("select", { class: "pager__select", id: "gdh-pager-size" });
      n.select.addEventListener("change", () => {
        this.handlers.setPageSize(Number(n.select.value));
      });

      n.summary = el("span", { class: "pager__summary" });

      n.messageIcon = el("span", { class: "pager__message-icon", "aria-hidden": "true", text: "!" });
      n.spinner = el("span", { class: "pager__spinner", "aria-hidden": "true" });
      n.messageText = el("span", {});
      n.retry = el("button", { type: "button", class: "pager__retry", text: T.retry });
      n.retry.addEventListener("click", () => this.handlers.retry());
      n.message = el("p", { class: "pager__message" }, [
        n.spinner,
        n.messageIcon,
        n.messageText,
        n.retry
      ]);

      n.live = el("span", { class: "pager__live", role: "status", "aria-live": "polite", "aria-atomic": "true" });

      const collapsible = el("div", { class: "pager__collapsible" }, [
        el("div", { class: "pager__group" }, [n.first, n.prev]),
        el("div", { class: "pager__status" }, [
          el("label", { class: "pager__label", for: "gdh-pager-page", text: T.pageLabel }),
          n.input,
          n.total
        ]),
        el("div", { class: "pager__group" }, [n.next, n.last]),
        el("span", { class: "pager__divider", "aria-hidden": "true" }),
        el("label", { class: "pager__label", for: "gdh-pager-size", text: T.sizeLabel }),
        n.select,
        n.showAll,
        n.off
      ]);

      n.root = el(
        "nav",
        { class: "pager", "aria-label": T.toolbarLabel, "data-state": "loading", "data-collapsed": "false" },
        [collapsible, n.summary, n.collapse, n.message, n.live]
      );

      n.root.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !this.collapsed) {
          event.stopPropagation();
          this.onAction("collapse");
        }
      });

      this.shadow.appendChild(n.root);
      this.setState("loading");
    }

    onAction(act, event) {
      if (event) event.preventDefault();
      const h = this.handlers;
      if (act === "first") h.go(0);
      else if (act === "prev") h.go(-1, true);
      else if (act === "next") h.go(1, true);
      else if (act === "last") h.go(Infinity);
      else if (act === "showall") h.toggleShowAll(this.nodes.showAll.getAttribute("aria-pressed") !== "true");
      else if (act === "off") h.disable();
      else if (act === "collapse") this.setCollapsed(!this.collapsed);
    }

    commitInput() {
      const raw = Number(this.nodes.input.value);
      if (!Number.isFinite(raw)) return;
      this.handlers.go(Math.round(raw) - 1);
    }

    setCollapsed(collapsed) {
      this.collapsed = collapsed;
      const n = this.nodes;
      n.root.setAttribute("data-collapsed", collapsed ? "true" : "false");
      n.collapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
      const label = collapsed ? T.expand : T.collapse;
      n.collapse.setAttribute("aria-label", label);
      n.collapse.setAttribute("title", label);
      n.collapse.replaceChildren(icon(collapsed ? ICONS.expand : ICONS.collapse));
    }

    setState(state, messageText) {
      this.state = state;
      const n = this.nodes;
      if (!n.root) return;
      n.root.setAttribute("data-state", state);
      const busy = state === "loading";
      n.messageIcon.hidden = state !== "error" && state !== "empty";
      n.retry.hidden = state !== "error";
      n.messageText.textContent =
        messageText || (state === "loading" ? T.loading : state === "empty" ? T.empty : state === "error" ? T.error : "");

      const controlsDisabled = state !== "ready";
      for (const key of ["first", "prev", "next", "last", "input", "select"]) {
        if (controlsDisabled) n[key].setAttribute("disabled", "");
        else n[key].removeAttribute("disabled");
      }
      n.showAll.toggleAttribute("disabled", state === "error");
      n.root.setAttribute("aria-busy", busy ? "true" : "false");
    }

    /* view: { pageIndex, pageCount, first, last, total, pageSize, showAll } */
    update(view) {
      const n = this.nodes;
      if (!n.root) return;

      this.syncSizeOptions(view.pageSize);

      const page = view.pageIndex + 1;
      n.input.max = String(view.pageCount);
      if (document.activeElement !== this.host || this.shadow.activeElement !== n.input) {
        n.input.value = String(page);
      }
      n.total.textContent = "/ " + view.pageCount;
      n.summary.textContent = page + " / " + view.pageCount;

      const pressed = view.showAll ? "true" : "false";
      n.showAll.setAttribute("aria-pressed", pressed);
      const showAllLabel = view.showAll ? T.showAllOff : T.showAllOn;
      n.showAll.setAttribute("aria-label", showAllLabel);
      n.showAll.setAttribute("title", showAllLabel);

      if (this.state === "ready") {
        const blocked = view.showAll;
        n.first.toggleAttribute("disabled", blocked || view.pageIndex === 0);
        n.prev.toggleAttribute("disabled", blocked || view.pageIndex === 0);
        n.next.toggleAttribute("disabled", blocked || view.pageIndex >= view.pageCount - 1);
        n.last.toggleAttribute("disabled", blocked || view.pageIndex >= view.pageCount - 1);
        n.input.toggleAttribute("disabled", blocked);
      }
    }

    syncSizeOptions(pageSize) {
      const n = this.nodes;
      const sizes = C.PAGE_SIZES.slice();
      if (sizes.indexOf(pageSize) === -1) sizes.push(pageSize);
      sizes.sort((a, b) => a - b);
      const signature = sizes.join(",");
      if (n.select.dataset.signature !== signature) {
        n.select.replaceChildren(
          ...sizes.map((size) => el("option", { value: String(size), text: T.sizeOption(size) }))
        );
        n.select.dataset.signature = signature;
      }
      n.select.value = String(pageSize);
    }

    announce(text) {
      const n = this.nodes;
      if (!n.live || !text || text === this.lastAnnouncement) return;
      this.lastAnnouncement = text;
      n.live.textContent = text;
    }
  }

  NS.Toolbar = Toolbar;
})();
