/* Sets first-run defaults and opens the options page from the toolbar icon. */
"use strict";

const STORAGE_KEY = "gdhPagerSettings";

const DEFAULTS = {
  enabled: true,
  pageSize: 6,
  position: "bottom-right",
  keyboardShortcuts: true,
  followLatest: true,
  showPageLabel: true,
  customTurnSelector: ""
};

chrome.runtime.onInstalled.addListener(async () => {
  const bag = await chrome.storage.sync.get(STORAGE_KEY);
  const merged = Object.assign({}, DEFAULTS, bag[STORAGE_KEY] || {});
  await chrome.storage.sync.set({ [STORAGE_KEY]: merged });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
