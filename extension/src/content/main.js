/*
 * Controller: settings -> detection -> pagination -> toolbar.
 *
 * The host page is a single-page app that streams new turns into the DOM and
 * swaps conversations without a reload, so the controller re-checks its own
 * assumptions continuously and tears everything down cleanly when it is wrong.
 */
(() => {
  "use strict";
  const NS = (window.__GDH_PAGER__ = window.__GDH_PAGER__ || {});
  if (NS.controller) return;
  const C = NS.constants;
  const T = C.TEXT;
  const store = NS.store;
  const adapter = NS.adapter;

  const controller = {
    settings: Object.assign({}, C.DEFAULTS),
    paginator: new NS.Paginator(),
    toolbar: null,
    dom: null,
    observer: null,
    healthTimer: null,
    detectTimer: null,
    detectStartedAt: 0,
    reindexTimer: null,
    lastChildCount: -1,
    conversationKey: "",
    unsubscribe: null,
    started: false
  };

  /* --- theme ------------------------------------------------------------
   * Claude's light/dark switch is independent of the operating-system setting,
   * so the toolbar takes its palette from the page it sits on rather than from
   * prefers-color-scheme alone. Colours are resolved through a 1x1 canvas so
   * any CSS colour syntax the host page uses (lab, oklch, color-mix) works. */

  const theme = { ctx: null, current: "" };

  function resolveRgb(color) {
    if (!color) return null;
    if (!theme.ctx) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      theme.ctx = canvas.getContext("2d", { willReadFrequently: true });
    }
    const ctx = theme.ctx;
    if (!ctx) return null;
    try {
      ctx.fillStyle = "#010203";
      ctx.fillStyle = color;
      if (ctx.fillStyle === "#010203") return null; /* unparseable */
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      if (data[3] < 8) return null; /* transparent: keep looking */
      return [data[0], data[1], data[2]];
    } catch (_) {
      return null;
    }
  }

  function relativeLuminance(rgb) {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  }

  function pageIsDark() {
    for (const node of [document.body, document.documentElement]) {
      if (!node) continue;
      const rgb = resolveRgb(getComputedStyle(node).backgroundColor);
      if (rgb) return relativeLuminance(rgb) < 0.35;
    }
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function syncTheme() {
    const next = pageIsDark() ? "dark" : "light";
    if (next === theme.current) return;
    theme.current = next;
    document.documentElement.setAttribute("data-gdh-theme", next);
    if (controller.toolbar && controller.toolbar.host) {
      controller.toolbar.host.setAttribute("data-gdh-theme", next);
    }
  }

  function clearTheme() {
    theme.current = "";
    document.documentElement.removeAttribute("data-gdh-theme");
  }

  /* --- lifecycle ------------------------------------------------------- */

  async function start() {
    controller.settings = await store.read();
    controller.unsubscribe = store.subscribe(onSettingsChanged);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pagehide", stop);
    if (controller.settings.enabled) enable();
  }

  function stop() {
    disable();
    if (controller.unsubscribe) controller.unsubscribe();
    controller.unsubscribe = null;
    document.removeEventListener("keydown", onKeyDown, true);
  }

  async function enable() {
    if (controller.started) return;
    controller.started = true;
    controller.paginator.pageSize = controller.settings.pageSize;
    controller.paginator.showPageLabel = controller.settings.showPageLabel;
    controller.toolbar = new NS.Toolbar(handlers);
    await controller.toolbar.mount(controller.settings.position);
    syncTheme();
    controller.toolbar.setState("loading");
    controller.conversationKey = adapter.conversationKey();
    beginDetection();
    controller.healthTimer = setInterval(healthCheck, C.HEALTH_INTERVAL);
  }

  function disable() {
    controller.started = false;
    clearInterval(controller.healthTimer);
    clearInterval(controller.detectTimer);
    clearTimeout(controller.reindexTimer);
    controller.healthTimer = null;
    controller.detectTimer = null;
    controller.reindexTimer = null;
    controller.lastChildCount = -1;
    disconnectObserver();
    controller.paginator.restore();
    if (controller.dom && controller.dom.scroller && controller.dom.scroller.removeAttribute) {
      controller.dom.scroller.removeAttribute(C.ATTR_SCROLLER);
    }
    controller.dom = null;
    if (controller.toolbar) controller.toolbar.unmount();
    controller.toolbar = null;
    clearTheme();
  }

  function onSettingsChanged(next) {
    const previous = controller.settings;
    controller.settings = next;

    if (!next.enabled) {
      disable();
      return;
    }
    if (!controller.started) {
      enable();
      return;
    }
    if (next.position !== previous.position) controller.toolbar.setPosition(next.position);
    if (next.showPageLabel !== previous.showPageLabel) {
      controller.paginator.showPageLabel = next.showPageLabel;
    }
    if (next.pageSize !== previous.pageSize) {
      controller.paginator.setPageSize(next.pageSize);
    }
    if (next.customTurnSelector !== previous.customTurnSelector) {
      redetect();
      return;
    }
    render();
  }

  /* --- detection ------------------------------------------------------- */

  function beginDetection() {
    stopDetection();
    controller.detectStartedAt = Date.now();
    controller.toolbar.setState("loading");
    /* The first attempt is synchronous; only poll if it did not settle, so a
     * successful detection is never re-run over a page the user is reading. */
    if (attemptDetection()) return;
    controller.detectTimer = setInterval(attemptDetection, C.DETECT_RETRY_INTERVAL);
  }

  function stopDetection() {
    clearInterval(controller.detectTimer);
    controller.detectTimer = null;
  }

  /* Returns true when detection is settled (found, or given up). */
  function attemptDetection() {
    if (!controller.started) return true;
    if (controller.dom) return true;
    const found = adapter.detect(controller.settings);
    if (found) {
      stopDetection();
      adoptDom(found);
      return true;
    }
    if (Date.now() - controller.detectStartedAt > C.DETECT_TIMEOUT) {
      stopDetection();
      controller.toolbar.setState("error");
      return true;
    }
    return false;
  }

  function redetect() {
    stopDetection();
    disconnectObserver();
    controller.paginator.restore();
    if (controller.dom && controller.dom.scroller && controller.dom.scroller.removeAttribute) {
      controller.dom.scroller.removeAttribute(C.ATTR_SCROLLER);
    }
    controller.dom = null;
    beginDetection();
  }

  function adoptDom(found) {
    controller.dom = found;
    if (found.scroller && found.scroller.setAttribute) {
      found.scroller.setAttribute(C.ATTR_SCROLLER, "true");
    }
    controller.lastChildCount = found.root.childElementCount;
    controller.paginator.setTurns(found.turns, { followLatest: true });
    controller.paginator.pageIndex = controller.paginator.pageCount - 1;
    observeRoot(found.root);
    render({ scroll: true });
  }

  function observeRoot(root) {
    disconnectObserver();
    controller.observer = new MutationObserver(scheduleReindex);
    controller.observer.observe(root, { childList: true });
  }

  function disconnectObserver() {
    if (controller.observer) controller.observer.disconnect();
    controller.observer = null;
  }

  function scheduleReindex() {
    clearTimeout(controller.reindexTimer);
    controller.reindexTimer = setTimeout(reindex, C.REINDEX_DEBOUNCE);
  }

  function reindex() {
    if (!controller.started || !controller.dom) return;
    controller.lastChildCount = controller.dom.root.childElementCount;
    const turns = adapter.refresh(controller.dom);
    if (!turns) {
      redetect();
      return;
    }
    const changed =
      turns.length !== controller.paginator.turns.length ||
      turns.some((turn, index) => turn !== controller.paginator.turns[index]);
    if (!changed) return;
    controller.paginator.setTurns(turns, { followLatest: controller.settings.followLatest });
    render();
  }

  function healthCheck() {
    if (!controller.started) return;
    if (!store.contextAlive()) {
      stop();
      return;
    }
    syncTheme();
    const key = adapter.conversationKey();
    if (key !== controller.conversationKey) {
      controller.conversationKey = key;
      controller.paginator.showAll = false;
      redetect();
      return;
    }
    if (controller.dom && !controller.dom.root.isConnected) {
      redetect();
      return;
    }
    /* Cheap poll: only re-query the turn list when the container actually
     * changed, so a long conversation is not re-scanned every tick. */
    if (controller.dom) {
      const count = controller.dom.root.childElementCount;
      if (count !== controller.lastChildCount) reindex();
    }
  }

  /* --- rendering ------------------------------------------------------- */

  function pageCaption(paginator) {
    const [start, end] = paginator.range;
    return `${paginator.pageIndex + 1} / ${paginator.pageCount} 페이지 · 메시지 ${start + 1}–${end}`;
  }

  function render(options) {
    const opts = options || {};
    const p = controller.paginator;
    const toolbar = controller.toolbar;
    if (!toolbar) return;

    if (!controller.dom) {
      toolbar.setState("error");
      return;
    }
    if (!p.turns.length) {
      p.apply(null);
      toolbar.setState("empty");
      toolbar.update(viewModel());
      return;
    }

    p.apply(pageCaption(p));
    toolbar.setState("ready");
    toolbar.update(viewModel());

    if (opts.scroll) scrollToPageStart(opts.focus);
    if (opts.announce) {
      const [start, end] = p.range;
      toolbar.announce(
        p.showAll
          ? T.showAllNotice
          : `${p.pageCount}페이지 중 ${p.pageIndex + 1}페이지, 메시지 ${start + 1}부터 ${end}까지`
      );
    }
  }

  function viewModel() {
    const p = controller.paginator;
    const [start, end] = p.range;
    return {
      pageIndex: p.pageIndex,
      pageCount: p.pageCount,
      pageSize: p.pageSize,
      first: start + 1,
      last: end,
      total: p.turns.length,
      showAll: p.showAll
    };
  }

  function scrollToPageStart(moveFocus) {
    const p = controller.paginator;
    const scroller = controller.dom && controller.dom.scroller;
    const target = p.anchor;
    const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

    if (scroller && scroller.scrollTo) {
      try {
        scroller.scrollTo({ top: 0, behavior });
      } catch (_) {
        scroller.scrollTop = 0;
      }
    }
    if (moveFocus && target && target.focus) {
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }
    }
  }

  /* --- interactions ---------------------------------------------------- */

  const handlers = {
    go(value, relative) {
      const p = controller.paginator;
      if (p.showAll) return false;
      const target = relative ? p.pageIndex + value : value;
      const moved = p.goTo(target === Infinity ? p.pageCount - 1 : target);
      if (!moved) {
        /* Keep the input in sync when a rejected value is typed in. */
        controller.toolbar.update(viewModel());
        return false;
      }
      render({ scroll: true, focus: true, announce: true });
      return true;
    },
    setPageSize(size) {
      controller.paginator.setPageSize(size);
      render({ scroll: true, announce: true });
      store.write({ pageSize: size });
    },
    toggleShowAll(next) {
      const p = controller.paginator;
      p.showAll = Boolean(next);
      render({ scroll: !p.showAll, announce: true });
    },
    disable() {
      store.write({ enabled: false });
      disable();
    },
    retry() {
      redetect();
    }
  };

  function isTypingTarget(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    for (const node of path) {
      if (!node || node.nodeType !== 1) continue;
      if (node === controller.toolbar?.host) return false;
      const tag = node.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (node.isContentEditable) return true;
    }
    return false;
  }

  function onKeyDown(event) {
    if (!controller.started || !controller.settings.keyboardShortcuts) return;
    if (event.isComposing || event.keyCode === 229) return; /* IME in progress */
    if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
    if (isTypingTarget(event)) return;

    let handled = true;
    if (event.key === "ArrowLeft") handlers.go(-1, true);
    else if (event.key === "ArrowRight") handlers.go(1, true);
    else if (event.key === "Home") handlers.go(0);
    else if (event.key === "End") handlers.go(Infinity);
    else handled = false;

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  NS.controller = controller;
  start();
})();
