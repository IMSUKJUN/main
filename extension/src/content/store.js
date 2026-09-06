/* Settings access. Never throws into callers: a dead extension context
 * degrades to the defaults instead of breaking the host page. */
(() => {
  "use strict";
  const NS = (window.__GDH_PAGER__ = window.__GDH_PAGER__ || {});
  if (NS.store) return;
  const { STORAGE_KEY, DEFAULTS } = NS.constants;

  function contextAlive() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function normalise(raw) {
    const value = Object.assign({}, DEFAULTS, raw || {});
    value.enabled = Boolean(value.enabled);
    value.keyboardShortcuts = Boolean(value.keyboardShortcuts);
    value.followLatest = Boolean(value.followLatest);
    value.showPageLabel = Boolean(value.showPageLabel);
    const size = Number(value.pageSize);
    value.pageSize = Number.isFinite(size) && size > 0 ? Math.min(200, Math.round(size)) : DEFAULTS.pageSize;
    if (!NS.constants.POSITIONS.some((p) => p.value === value.position)) {
      value.position = DEFAULTS.position;
    }
    value.customTurnSelector = String(value.customTurnSelector || "").trim().slice(0, 400);
    return value;
  }

  async function read() {
    if (!contextAlive()) return normalise(null);
    try {
      const bag = await chrome.storage.sync.get(STORAGE_KEY);
      return normalise(bag && bag[STORAGE_KEY]);
    } catch (_) {
      return normalise(null);
    }
  }

  async function write(patch) {
    if (!contextAlive()) return normalise(patch);
    const next = normalise(Object.assign({}, await read(), patch));
    try {
      await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    } catch (_) {
      /* Quota or dead context: the in-memory value still applies for this tab. */
    }
    return next;
  }

  function subscribe(handler) {
    if (!contextAlive()) return () => {};
    const listener = (changes, area) => {
      if (area !== "sync" || !changes[STORAGE_KEY]) return;
      handler(normalise(changes[STORAGE_KEY].newValue));
    };
    try {
      chrome.storage.onChanged.addListener(listener);
    } catch (_) {
      return () => {};
    }
    return () => {
      try {
        chrome.storage.onChanged.removeListener(listener);
      } catch (_) {
        /* context already gone */
      }
    };
  }

  NS.store = { read, write, subscribe, normalise, contextAlive };
})();
