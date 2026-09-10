// 대화 행 수집.
// 대화창은 가상 스크롤이라 화면 밖 행은 DOM에 없다(측정: 44행 중 4~15행만 존재).
// 그래서 한 번 훑어 내려가며 각 행이 나타날 때 복제해 둔다.
window.CPV = window.CPV || {};

CPV.harvest = (() => {
  const { config } = CPV;
  const S = CPV.source;

  // index -> record
  const store = new Map();

  function capture(row) {
    const index = S.rowIndex(row);
    if (index == null) return;
    const type = row.dataset.perfRow || 'unknown';
    const shot = S.shotInfo(row);
    const streaming = row.dataset.perfRowStreaming === 'true';
    const prev = store.get(index);

    // 생성 중인 행은 계속 자라므로 매번 다시 뜬다.
    if (prev && !prev.streaming && !streaming) return;

    store.set(index, {
      index,
      type,
      shot,
      streaming,
      height: Math.round(row.getBoundingClientRect().height),
      prompt: type === S.ROW.HUMAN ? S.promptText(row) : null,
      toolLabel: type === S.ROW.TOOL ? S.toolLabel(row) : null,
      markerText: type === S.ROW.MARKER
        ? row.textContent.replace(/\s+/g, ' ').trim()
        : null,
      content: type === S.ROW.HUMAN || type === S.ROW.MARKER
        ? null
        : S.contentClone(row)
    });
  }

  function captureMounted() {
    S.rows().forEach(capture);
  }

  // 전체 훑기. 스크롤 위치는 끝나면 되돌린다.
  async function all(onProgress) {
    const feed = S.feed();
    if (!feed) return records();
    const start = feed.scrollTop;
    const step = Math.max(200, feed.clientHeight * config.harvestStep);
    const total = Math.max(1, feed.scrollHeight - feed.clientHeight);

    captureMounted();
    for (let top = 0; top <= total; top += step) {
      feed.scrollTop = top;
      await wait(config.harvestWait);
      captureMounted();
      onProgress?.(Math.min(1, top / total));
    }
    feed.scrollTop = total;
    await wait(config.harvestWait);
    captureMounted();

    feed.scrollTop = start;
    onProgress?.(1);
    return records();
  }

  function records() {
    return [...store.values()].sort((a, b) => a.index - b.index);
  }

  function clear() {
    store.clear();
  }

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  return { all, captureMounted, records, clear };
})();
