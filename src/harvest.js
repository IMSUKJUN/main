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
  //
  // 한 번에 끝나지 않는다. 행 높이를 재는 동안 전체 높이가 계속 바뀌고,
  // 행 하나가 화면 두 배가 넘는 경우도 있다. 그래서 바닥에 닿을 때까지 돌고,
  // 빠진 번호가 남으면 더 촘촘한 간격으로 한 번 더 훑는다.
  async function all(onProgress) {
    const feed = S.feed();
    if (!feed) return records();
    const start = feed.scrollTop;

    await sweep(feed, config.harvestStep, onProgress);
    let gaps = missing();
    if (gaps.length) await sweep(feed, config.harvestStep / 2, onProgress);
    gaps = missing();

    feed.scrollTop = start;
    onProgress?.(1);
    lastGaps = gaps;
    return records();
  }

  async function sweep(feed, stepRatio, onProgress) {
    const step = Math.max(160, feed.clientHeight * stepRatio);
    feed.scrollTop = 0;
    await wait(config.harvestWait);
    captureMounted();

    let top = 0;
    for (let guard = 0; guard < 2000; guard++) {
      const max = Math.max(0, feed.scrollHeight - feed.clientHeight);
      if (top >= max) break;
      top = Math.min(max, top + step);
      feed.scrollTop = top;
      await wait(config.harvestWait);
      captureMounted();
      onProgress?.(max ? Math.min(1, top / max) : 1);
      // 앱이 스크롤 위치를 되돌리면 그 위치에서 이어간다.
      const actual = feed.scrollTop;
      if (Math.abs(actual - top) > 2) {
        if (actual <= top - step) break;   // 더 못 내려가면 멈춘다
        top = actual;
      }
    }
    feed.scrollTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
    await wait(config.harvestWait);
    captureMounted();
  }

  // 수집한 번호 사이에 빠진 것
  function missing() {
    const keys = [...store.keys()].sort((a, b) => a - b);
    if (!keys.length) return [];
    const out = [];
    for (let i = keys[0]; i <= keys[keys.length - 1]; i++) {
      if (!store.has(i)) out.push(i);
    }
    return out;
  }

  let lastGaps = [];
  function coverage() {
    const keys = [...store.keys()].sort((a, b) => a - b);
    return {
      수집한행: keys.length,
      번호범위: keys.length ? [keys[0], keys[keys.length - 1]] : null,
      빠진번호: lastGaps.slice(0, 20),
      빠진개수: lastGaps.length
    };
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

  return { all, captureMounted, records, clear, coverage, missing };
})();
