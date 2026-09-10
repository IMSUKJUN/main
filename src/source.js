// 앱(claude.ai) DOM에서 값을 읽어오는 층. 읽기 전용이다.
window.CPV = window.CPV || {};

CPV.source = (() => {
  const { sel, ROW } = CPV;

  function feed() {
    return document.querySelector(sel.feed);
  }

  function sizer() {
    const f = feed();
    return f ? (f.querySelector(sel.sizer) || f) : null;
  }

  function rows() {
    return [...document.querySelectorAll(sel.row)];
  }

  function rowIndex(row) {
    const v = row.dataset.index ?? row.dataset.rsIndex;
    return v == null ? null : Number(v);
  }

  // 한 행에서 샷 식별자를 읽는다.
  // 같은 응답의 도구 행과 본문 행은 같은 entryKey / entryIndex 를 공유하고
  // itemIndex 로 도구(0)와 본문(1)이 갈린다. marker 행은 아무것도 없다.
  function shotInfo(row) {
    const entry = row.querySelector(sel.entry);
    const keyed = row.querySelector(sel.entryKey);
    return {
      entryKey: entry?.dataset.epitaxyEntry || keyed?.dataset.entryKey || null,
      entryIndex: entry ? Number(entry.dataset.epitaxyEntryIndex) : null,
      itemIndex: entry?.dataset.epitaxyItemIndex != null
        ? Number(entry.dataset.epitaxyItemIndex)
        : null
    };
  }

  // 사용자 메시지 본문. 화면에 안 보이는 안내 문구(sr-only)는 걷어낸다.
  function promptText(row) {
    const clone = row.cloneNode(true);
    clone.querySelectorAll('.sr-only, [data-find-omitted], button, svg').forEach(n => n.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  // 도구 행의 접힌 한 줄 문구 (예: "실행됨 · 명령 12개")
  function toolLabel(row) {
    const btn = row.querySelector('button[aria-expanded]');
    const text = (btn || row).textContent.replace(/\s+/g, ' ').trim();
    return text || '도구 실행';
  }

  // 화면에 보이는 본문만 남긴 복제본을 만든다.
  // 코드블록 안쪽은 shadow DOM 이라 복제하면 비어버리므로
  // data-code-text 에 남아 있는 원본 코드로 되살린다.
  function contentClone(row) {
    const clone = row.cloneNode(true);
    clone.querySelectorAll('.sr-only, [data-find-omitted]').forEach(n => n.remove());
    restoreCodeBlocks(row, clone);
    return clone;
  }

  function restoreCodeBlocks(liveRow, clone) {
    const liveBlocks = [...liveRow.querySelectorAll(sel.codeBlock)];
    const cloneBlocks = [...clone.querySelectorAll(sel.codeBlock)];
    cloneBlocks.forEach((block, i) => {
      const host = block.querySelector(sel.shadowHost);
      if (!host || host.childElementCount > 0) return;
      const pre = document.createElement('pre');
      pre.className = 'cpv-code';
      pre.textContent = readCode(block, liveBlocks[i]);
      host.replaceWith(pre);
    });
  }

  function readCode(cloneBlock, liveBlock) {
    const attr = cloneBlock.getAttribute('data-code-text');
    if (attr) return attr;
    const host = liveBlock?.querySelector(sel.shadowHost);
    if (host?.shadowRoot) return host.shadowRoot.textContent || '';
    return '';
  }

  function isStreaming() {
    const f = feed();
    if (!f) return false;
    if (f.getAttribute('aria-busy') === 'true') return true;
    return rows().some(r => r.dataset.perfRowStreaming === 'true');
  }

  function conversationId() {
    const m = location.pathname.match(/([0-9a-f-]{16,})/i);
    return m ? m[1] : location.pathname;
  }

  return {
    feed, sizer, rows, rowIndex, shotInfo,
    promptText, toolLabel, contentClone,
    isStreaming, conversationId, ROW
  };
})();
