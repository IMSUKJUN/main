// 대화 행 수집.
//
// 대화창은 가상 스크롤이라 화면 밖 행은 DOM에 없다(측정: 44행 중 4~15행만 존재).
// 그래서 한 번 훑어 내려가며 각 행이 나타날 때 복제해 둔다.
//
// 여기서 걸리는 것이 세 가지다.
//  1. 앱이 scroll-behavior: smooth 라 스크롤이 애니메이션으로 움직인다.
//     설정한 직후 위치를 읽으면 목표에 못 미친 값이 나온다.
//  2. 행 높이를 재는 동안 전체 높이가 계속 바뀐다(실측 28981 → 28626 → 35600).
//  3. 수집한 번호들 사이만 봐서는 맨 위를 통째로 못 읽은 경우를 알 수 없다.
//     행마다 붙어 있는 data-perf-row-from-tail(끝에서 몇 번째)로 전체 수를 알아낸다.
window.CPV = window.CPV || {};

CPV.harvest = (() => {
  const { config } = CPV;
  const S = CPV.source;

  const store = new Map();   // index -> record
  let total = 0;             // 전체 행 수 (from-tail 로 계산)
  let lastGaps = [];
  let lastLog = [];

  function capture(row) {
    const index = S.rowIndex(row);
    if (index == null) return;
    const fromTail = Number(row.dataset.perfRowFromTail);
    if (Number.isFinite(fromTail)) total = Math.max(total, index + fromTail + 1);

    const streaming = row.dataset.perfRowStreaming === 'true';
    const prev = store.get(index);
    if (prev && !prev.streaming && !streaming) return;

    const type = row.dataset.perfRow || 'unknown';
    const feed = S.feed();
    const rect = row.getBoundingClientRect();
    const offset = feed
      ? Math.round(rect.top - feed.getBoundingClientRect().top + feed.scrollTop)
      : 0;

    store.set(index, {
      index, type, streaming, offset,
      shot: S.shotInfo(row),
      height: Math.round(rect.height),
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

  async function all(onProgress) {
    const feed = S.feed();
    if (!feed) return records();
    const start = feed.scrollTop;
    lastLog = [];

    // 애니메이션 스크롤을 끄지 않으면 위치를 정확히 짚을 수 없다.
    const savedFeed = feed.style.scrollBehavior;
    const savedRoot = document.documentElement.style.scrollBehavior;
    feed.style.scrollBehavior = 'auto';
    document.documentElement.style.scrollBehavior = 'auto';

    try {
      await sweep(feed, config.harvestStep, onProgress);
      for (let round = 0; round < 3 && missing().length; round++) {
        await fillGaps(feed, onProgress);
      }
      if (missing().length) await sweep(feed, config.harvestStep / 2, onProgress);
      lastGaps = missing();
    } finally {
      feed.style.scrollBehavior = savedFeed;
      document.documentElement.style.scrollBehavior = savedRoot;
      await goTo(feed, start);
    }
    onProgress?.(1);
    return records();
  }

  // 위에서 아래로 훑는다. 위치가 어긋나도 중단하지 않고 다시 시도한다.
  async function sweep(feed, stepRatio, onProgress) {
    const step = Math.max(160, feed.clientHeight * stepRatio);
    await goTo(feed, 0);

    let top = 0;
    let stuck = 0;
    for (let guard = 0; guard < 3000; guard++) {
      const max = Math.max(0, feed.scrollHeight - feed.clientHeight);
      if (top >= max - 1) break;
      const want = Math.min(max, top + step);
      const got = await goTo(feed, want);
      onProgress?.(max ? Math.min(0.98, got / max) : 1);

      if (got > top + 1) { top = got; stuck = 0; }
      else if (++stuck >= 3) {
        // 세 번 눌러도 안 내려가면 그 지점은 건너뛰고 이어간다.
        lastLog.push(`${Math.round(want)} 에서 못 내려감`);
        top = want;
        stuck = 0;
      }
    }
    await goTo(feed, Math.max(0, feed.scrollHeight - feed.clientHeight));
  }

  // 빠진 줄만 다시 줍는다. 켠 뒤에 프로그램이 스스로 부른다.
  async function fillMissing(onProgress) {
    const feed = S.feed();
    if (!feed || !missing().length) return records();
    const start = feed.scrollTop;
    const savedFeed = feed.style.scrollBehavior;
    const savedRoot = document.documentElement.style.scrollBehavior;
    feed.style.scrollBehavior = 'auto';
    document.documentElement.style.scrollBehavior = 'auto';
    try {
      for (let round = 0; round < 3 && missing().length; round++) {
        await fillGaps(feed, onProgress);
      }
      lastGaps = missing();
    } finally {
      feed.style.scrollBehavior = savedFeed;
      document.documentElement.style.scrollBehavior = savedRoot;
      await goTo(feed, start);
    }
    return records();
  }

  // 빠진 번호가 있으면 이웃 행의 위치를 보고 그 자리로 직접 간다.
  async function fillGaps(feed, onProgress) {
    const gaps = missing();
    const h = feed.clientHeight;
    for (const i of gaps) {
      const below = nearest(i, -1);
      const above = nearest(i, +1);
      let at;
      if (below && above) at = (below.offset + below.height + above.offset) / 2;
      else if (below) at = below.offset + below.height;
      else if (above) at = Math.max(0, above.offset - h);
      else continue;
      // 어느 자리에서 붙는지는 앱이 정하므로 그 행 주변 몇 지점을 차례로 시도한다.
      for (const off of [h * 0.5, h * 0.9, h * 0.1, 0]) {
        if (store.has(i)) break;
        await goTo(feed, Math.max(0, at - off));
        onProgress?.(0.99);
      }
    }
  }

  function nearest(index, dir) {
    for (let i = index + dir; i >= 0 && i < Math.max(total, index + 200); i += dir) {
      const rec = store.get(i);
      if (rec) return rec;
    }
    return null;
  }

  // 목표 위치로 옮긴다.
  //
  // 시간을 정해 놓고 기다리면 안 된다. 앱은 스크롤 직후가 아니라 한 박자 뒤에
  // 행을 붙이고, 그 시간이 일정하지 않다. 모사에서 220ms 지연을 주자 150ms 고정으로는
  // 27행 중 5행만 읽혔다. 그래서 "자리에 도착했고 붙어 있는 행이 더 안 바뀔 때"까지
  // 기다렸다가 다음으로 넘어간다.
  async function goTo(feed, top) {
    let prev = '';
    let round = 0;
    for (const ms of config.harvestWaits) {
      round++;
      if (Math.abs(feed.scrollTop - top) > 2) feed.scrollTop = top;
      await wait(ms);
      captureMounted();
      const arrived = Math.abs(feed.scrollTop - top) <= 2;
      const filled = viewportFilled(feed);
      const nowKey = mountedKey();
      // 자리에 도착했고, 그 자리에 행이 실제로 채워졌고, 더 안 바뀌면 다음으로 간다.
      // 옮긴 직후에는 이전 자리의 행이 아직 남아 있어 "채워짐"으로 보인다.
      // 그래서 최소 세 번은 확인한 뒤에만 넘어간다.
      if (round >= 3 && arrived && filled && nowKey === prev) break;
      prev = nowKey;
    }
    return feed.scrollTop;
  }

  // 지금 보이는 자리에 행이 하나라도 걸쳐 있는지.
  // "붙어 있는 행이 안 바뀐다"만 보면 앱이 아직 시작도 안 한 상태를 다 붙은 것으로
  // 착각한다(모사에서 27행 중 5행만 읽힘). 그래서 자리가 실제로 채워졌는지를 본다.
  function viewportFilled(feed) {
    const fr = feed.getBoundingClientRect();
    return S.rows().some(r => {
      const rect = r.getBoundingClientRect();
      return rect.bottom > fr.top + 1 && rect.top < fr.bottom - 1;
    });
  }

  // 지금 DOM 에 붙어 있는 행의 번호 범위
  function mountedKey() {
    const idx = S.rows().map(r => S.rowIndex(r)).filter(v => v != null);
    if (!idx.length) return 'none';
    return Math.min(...idx) + '-' + Math.max(...idx) + '/' + idx.length;
  }

  // 0번부터 마지막 번호까지 중 없는 것
  function missing() {
    const keys = [...store.keys()];
    if (!keys.length) return [];
    const last = total ? total - 1 : Math.max(...keys);
    const out = [];
    for (let i = 0; i <= last; i++) if (!store.has(i)) out.push(i);
    return out;
  }

  function coverage() {
    const keys = [...store.keys()].sort((a, b) => a - b);
    return {
      수집한행: keys.length,
      전체행: total || keys.length,
      번호범위: keys.length ? [keys[0], keys[keys.length - 1]] : null,
      빠진개수: lastGaps.length,
      빠진번호: lastGaps.slice(0, 30),
      기록: lastLog.slice(0, 10)
    };
  }

  function records() {
    return [...store.values()].sort((a, b) => a.index - b.index);
  }

  function clear() { store.clear(); total = 0; lastGaps = []; }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  return { all, fillMissing, captureMounted, records, clear, coverage, missing };
})();
