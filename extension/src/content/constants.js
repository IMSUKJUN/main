/* Shared constants for the content-script world. */
(() => {
  "use strict";
  const NS = (window.__GDH_PAGER__ = window.__GDH_PAGER__ || {});
  if (NS.constants) return;

  NS.constants = {
    STORAGE_KEY: "gdhPagerSettings",

    ATTR_HIDDEN: "data-gdh-pager-hidden",
    ATTR_ANCHOR: "data-gdh-pager-anchor",
    ATTR_LABEL: "data-gdh-pager-label",
    ATTR_SCROLLER: "data-gdh-pager-scroller",
    HOST_ID: "gdh-pager-host",

    DEFAULTS: {
      enabled: true,
      pageSize: 6,
      position: "bottom-right",
      keyboardShortcuts: true,
      followLatest: true,
      showPageLabel: true,
      customTurnSelector: ""
    },

    PAGE_SIZES: [2, 4, 6, 10, 20],

    POSITIONS: [
      { value: "bottom-right", label: "오른쪽 아래" },
      { value: "bottom-center", label: "가운데 아래" },
      { value: "top-right", label: "오른쪽 위" },
      { value: "top-center", label: "가운데 위" }
    ],

    /*
     * Candidate selectors for one conversation turn, best guess first.
     * These are assumptions about claude.ai markup, not guarantees: the site can
     * change them at any time, so the adapter scores every candidate at runtime
     * and the user can override the list with a custom selector in options.
     */
    TURN_SELECTORS: [
      "[data-test-render-count]",
      "[data-testid='conversation-turn']",
      "[data-testid='chat-message']",
      "[data-testid='user-message']",
      "div.font-claude-message",
      "div.font-claude-response"
    ],

    /* Timing (ms). */
    REINDEX_DEBOUNCE: 140,
    HEALTH_INTERVAL: 800,
    DETECT_RETRY_INTERVAL: 400,
    DETECT_TIMEOUT: 20000,

    TEXT: {
      toolbarLabel: "대화 페이지 이동",
      prev: "이전 페이지",
      next: "다음 페이지",
      first: "첫 페이지",
      last: "마지막 페이지",
      pageLabel: "페이지",
      sizeLabel: "묶음 크기",
      sizeOption: (n) => `${n}개씩`,
      showAllOn: "전체 보기 켜기",
      showAllOff: "전체 보기 끄기",
      collapse: "도구 접기",
      expand: "도구 펼치기",
      turnOff: "페이지 보기 끄기",
      retry: "다시 찾기",
      loading: "대화 구조를 확인하는 중입니다.",
      empty: "페이지로 나눌 대화가 아직 없습니다.",
      error:
        "이 화면에서 대화 영역을 찾지 못했습니다. 설정에서 선택자를 지정하거나 다시 찾기를 눌러 주세요.",
      showAllNotice: "전체 보기 상태입니다. 페이지 이동은 잠시 꺼져 있습니다."
    }
  };
})();
