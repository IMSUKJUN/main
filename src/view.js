// 수집한 행을 가로 페이지 트랙으로 그린다.
//
// 카드 한 장 = 페이지 한 장. 페이지 나눔은 CSS 다단(column)이 하고,
// 카드 테두리는 box-decoration-break:clone 이 조각마다 온전히 그려준다.
// 그래서 페이지 수만큼 요소를 복제할 필요가 없다.
window.CPV = window.CPV || {};

CPV.view = (() => {
  const { config } = CPV;
  const S = CPV.source;

  let root = null;
  let track = null;
  let veil = null;
  let layer = null;   // 말풍선·페이지번호·액션바
  let bar = null;     // 직접 그리는 가로 스크롤바
  let thumb = null;
  let geom = null;
  let pages = [];     // 화면에 보이는 카드 목록 (x 순서)
  let focused = 0;
  const expandedTools = new Set();   // entryIndex 집합
  const expandedPrompts = new Set();

  function build(container) {
    destroy();
    root = el('div', 'cpv-root');
    track = el('div', 'cpv-track');
    veil = el('div', 'cpv-veil');
    layer = el('div', 'cpv-layer');
    bar = el('div', 'cpv-scrollbar');
    thumb = el('div', 'cpv-thumb');
    bar.append(thumb);
    root.append(track, veil, layer, bar);
    container.appendChild(root);
    return root;
  }

  function destroy() {
    root?.remove();
    root = track = veil = layer = bar = thumb = null;
    pages = [];
  }

  function measure() {
    const feed = S.feed();
    let r = feed ? feed.getBoundingClientRect() : { width: innerWidth, height: innerHeight, left: 0, top: 0 };
    // 입력창이 대화창 위에 떠 있는 화면이 있다. 그 위는 덮지 않는다.
    const comp = S.composerRect();
    if (comp && comp.top > r.top + 120 && comp.top < r.top + r.height) {
      r = { left: r.left, top: r.top, width: r.width, height: comp.top - r.top - 8 };
    }
    const availH = r.height - config.padY * 2 - config.bubbleH - config.bottomH;
    let cardH = Math.max(240, availH);
    // 폭은 원래 스크롤 화면의 글줄 폭에 맞춘다. 못 읽으면 8:10 비율로 돌아간다.
    let col = config.matchColumnWidth ? S.columnWidth() : 0;
    // 화면마다 글줄 폭이 다르다. 채팅·coworker 쪽 폭에 맞춰 상한을 둔다.
    if (col && config.columnMax) col = Math.min(col, config.columnMax);
    if (!col && config.matchColumnWidth) col = config.columnMax;
    // 카드 안쪽 글줄 폭이 원래 화면과 같아지도록 좌우 안여백과 테두리를 더한다.
    let cardW = col ? col + config.cardPadX * 2 + 2 : cardH * config.ratio;
    const maxW = r.width * 0.7;
    if (cardW > maxW) cardW = maxW;
    cardH = Math.min(cardH, Math.max(240, cardW / config.ratio));
    geom = {
      rect: r,
      cardW: Math.round(cardW),
      cardH: Math.round(cardH),
      gap: Math.round(cardW * config.gapRatio),
      lead: Math.round((r.width - cardW) / 2),
      cardTop: Math.round(config.padY + config.bubbleH)
    };
    root.style.setProperty('--cpv-card-w', geom.cardW + 'px');
    root.style.setProperty('--cpv-card-h', geom.cardH + 'px');
    root.style.setProperty('--cpv-gap', geom.gap + 'px');
    root.style.setProperty('--cpv-card-top', geom.cardTop + 'px');
    root.style.setProperty('--cpv-bubble-h', config.bubbleH + 'px');
    // 스크롤바 길이를 카드(= 입력창) 폭에 맞춘다.
    root.style.setProperty('--cpv-bar-w', geom.cardW + 'px');
    const t = S.theme();
    root.style.setProperty('--cpv-bg', t.bg);
    root.style.setProperty('--cpv-surface', t.surface);
    root.style.setProperty('--cpv-border', t.border);
    root.style.setProperty('--cpv-text', t.text);
    root.style.setProperty('--cpv-muted', t.muted);
    root.style.setProperty('--cpv-veil-color', t.bg);
    root.style.setProperty('--cpv-shadow-near', t.shadowNear);
    root.style.setProperty('--cpv-shadow-far', t.shadowFar);
    Object.assign(root.style, {
      left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px'
    });
    return geom;
  }

  // 행 목록을 샷 단위로 묶는다.
  // 실제 화면에서는 사용자 메시지와 답변의 entry-index 가 서로 다르다(0, 1, 2, 3 …).
  // 그래서 번호로 묶지 않고, 사용자 행이 나오면 새 샷이 시작하는 것으로 본다.
  function toShots(records) {
    const list = [];
    const chips = [];
    let cur = null;
    for (const rec of records) {
      if (rec.type === S.ROW.MARKER) { chips.push(rec); continue; }
      if (rec.type === S.ROW.HUMAN || !cur) {
        cur = {
          key: rec.shot.entryKey || 's' + rec.index,
          order: rec.index,
          prompt: null, body: [], tool: [], chips: []
        };
        list.push(cur);
      }
      if (rec.type === S.ROW.HUMAN) cur.prompt = rec;
      else if (rec.type === S.ROW.TOOL) cur.tool.push(rec);
      else cur.body.push(rec);
    }
    // marker 는 어느 샷에도 안 붙는다. 바로 뒤에 오는 샷 앞에 칩으로 세운다.
    for (const chip of chips) {
      const next = list.find(s => s.order > chip.index);
      (next || list[list.length - 1])?.chips.push(chip);
    }
    return list;
  }

  function render(records) {
    if (!root) return;
    measure();
    track.textContent = '';
    layer.textContent = '';

    const shots = toShots(records);
    track.append(spacer('cpv-lead'));

    for (const shot of shots) {
      for (const chip of shot.chips) track.append(makeChip(chip));
      const body = makeStrip(shot, 'body');
      if (body) track.append(body);
      if (expandedTools.has(shot.key) && shot.tool.length) {
        const tool = makeStrip(shot, 'tool');
        if (tool) track.append(tool);
      }
    }
    track.append(spacer('cpv-tail'));

    layoutStrips();
    collectPages(shots);
    paintLayer(shots);
    root.dataset.pages = String(pages.length);
    focus(Math.min(focused, Math.max(0, pages.length - 1)), false);
  }

  function spacer(cls) {
    const s = el('div', cls);
    s.style.flex = `0 0 ${geom.lead}px`;
    return s;
  }

  function makeChip(rec) {
    const c = el('div', 'cpv-chip');
    c.textContent = rec.markerText || '';
    c.title = rec.markerText || '';
    return c;
  }

  function makeStrip(shot, kind) {
    const rows = kind === 'body' ? shot.body : shot.tool;
    // 답변이 아직 없어도 프롬프트는 보여야 하므로 빈 카드를 만든다.
    if (!rows.length && !(kind === 'body' && shot.prompt)) return null;
    const strip = el('div', 'cpv-strip');
    strip.dataset.kind = kind;
    strip.dataset.shot = String(shot.key);
    const card = el('div', 'cpv-card');

    if (kind === 'body' && shot.tool.length) card.append(makeToolLine(shot));
    if (kind === 'body' && !rows.length) {
      const wait = el('div', 'cpv-waiting');
      wait.textContent = '응답을 기다리는 중…';
      card.append(wait);
    }
    for (const rec of rows) {
      const holder = el('div', 'cpv-row');
      if (rec.content) holder.append(rec.content.cloneNode(true));
      card.append(holder);
    }
    strip.append(card);
    return strip;
  }

  function makeToolLine(shot) {
    const line = el('button', 'cpv-toolline');
    const open = expandedTools.has(shot.key);
    line.dataset.shot = String(shot.key);
    line.setAttribute('aria-expanded', String(open));
    line.textContent = (open ? '▾ ' : '▸ ') + (shot.tool[0]?.toolLabel || '도구 실행');
    line.addEventListener('click', e => {
      e.stopPropagation();
      toggleTool(shot.key);
    });
    return line;
  }

  // 1차로 카드 한 장 폭에 넣어 페이지 수를 재고, 2차로 그 수만큼 단을 고정한다.
  function layoutStrips() {
    const strips = [...track.querySelectorAll('.cpv-strip')];
    for (const strip of strips) {
      strip.style.width = geom.cardW + 'px';
      strip.style.columnWidth = geom.cardW + 'px';
      strip.style.columnCount = '';
    }
    void track.offsetWidth;
    for (const strip of strips) {
      const pageCount = Math.max(1, Math.ceil(strip.scrollWidth / (geom.cardW + geom.gap)));
      strip.dataset.pages = String(pageCount);
      strip.style.columnCount = String(pageCount);
      strip.style.columnWidth = 'auto';
      strip.style.width = (pageCount * geom.cardW + (pageCount - 1) * geom.gap) + 'px';
      // 카드 상자 높이를 "페이지 수 × 카드 높이"로 못박는다.
      // 이러지 않으면 내용이 짧은 마지막 페이지만 낮게 그려진다.
      const card = strip.querySelector('.cpv-card');
      if (card) card.style.height = (pageCount * geom.cardH) + 'px';
    }
  }

  function collectPages(shots) {
    pages = [];
    const base = root.getBoundingClientRect();
    for (const strip of track.querySelectorAll('.cpv-strip')) {
      const shotKey = strip.dataset.shot;
      const shot = shots.find(s => String(s.key) === shotKey);
      const kind = strip.dataset.kind;
      // 다단 컨테이너(strip)는 상자 하나다. 페이지 조각은 그 안의 카드가 갖는다.
      const card = strip.querySelector('.cpv-card') || strip;
      [...card.getClientRects()].forEach((r, i) => {
        pages.push({
          strip, shot, kind,
          no: i + 1,
          label: (kind === 'tool' ? 'T' : '') + (i + 1) + (kind === 'tool' ? '' : 'p'),
          left: r.left - base.left + track.scrollLeft,
          width: r.width,
          top: r.top - base.top,
          height: r.height,
          first: i === 0
        });
      });
    }
    pages.sort((a, b) => a.left - b.left);
  }

  function paintLayer(shots) {
    layer.textContent = '';
    for (const page of pages) {
      const num = el('div', 'cpv-pageno');
      num.textContent = page.label;
      place(num, page.left, page.top + page.height, 'bl');
      layer.append(num);
      page.numEl = num;
    }

    // 프롬프트는 가운데 한 개만 떠 있다. 페이지를 넘겨도 그 자리에 있고,
    // 다른 샷으로 넘어갈 때만 내용이 바뀐다.
    const bubble = el('div', 'cpv-bubble');
    bubble.addEventListener('click', e => {
      e.stopPropagation();
      const key = bubble.dataset.shot;
      if (key) togglePrompt(key);
    });
    layer.append(bubble);
    layer.bubble = bubble;
    const counter = el('div', 'cpv-counter');
    layer.append(counter);
    layer.counter = counter;
  }

  function place(node, x, y, anchor) {
    node.style.position = 'absolute';
    node.style.left = (x - track.scrollLeft) + 'px';
    node.style.top = y + 'px';
    node.style.transform = anchor === 'bl' ? 'translate(0, -100%)' : 'translate(-100%, -100%)';
    node.dataset.x = String(x);
    node.dataset.y = String(y);
  }

  // 트랙을 움직이면 겹쳐 그린 것들도 같이 움직인다.
  function syncLayer() {
    const dx = track.scrollLeft;
    for (const page of pages) {
      if (page.numEl) page.numEl.style.left = (page.left - dx) + 'px';
    }
    const cur = pages[focused];
    // 가운데 프롬프트: 지금 보고 있는 페이지가 속한 샷의 질문을 보여 준다.
    if (layer.bubble) {
      const b = layer.bubble;
      const shot = cur?.shot;
      if (!shot?.prompt) { b.style.display = 'none'; }
      else {
        b.style.display = '';
        const key = String(shot.key);
        if (b.dataset.shot !== key) {
          b.dataset.shot = key;
          b.textContent = shot.prompt.prompt || '';
        }
        b.classList.toggle('open', expandedPrompts.has(key));
        b.style.width = cur.width + 'px';
        b.style.left = (cur.left - dx) + 'px';
        b.style.top = (cur.top - config.bubbleH) + 'px';
      }
    }
    if (layer.counter) {
      layer.counter.textContent = pages.length
        ? `${focused + 1} / ${pages.length}` + (cur?.label ? ` · ${cur.label}` : '')
        : '';
    }
    paintVeil();
    paintBar();
  }

  // 스크롤바 손잡이. 길이를 픽셀이 아니라 페이지 수로 나눈다.
  // 손잡이 하나 길이가 한 페이지이고, 한 칸 옮기면 한 페이지 넘어간다.
  function paintBar() {
    if (!bar || !track) return;
    const n = pages.length;
    if (n <= 1) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    const w = bar.clientWidth;
    const size = Math.max(28, Math.round(w / n));
    const max = w - size;
    const pos = Math.round(max * (focused / (n - 1)));
    thumb.style.width = size + 'px';
    thumb.style.left = Math.max(0, Math.min(max, pos)) + 'px';
  }

  // 스크롤바에서 x 위치를 페이지 번호로 바꾼다.
  function pageFromBar(clientX) {
    const n = pages.length;
    if (n <= 1) return 0;
    const r = bar.getBoundingClientRect();
    const size = Math.max(28, r.width / n);
    const max = r.width - size;
    const x = Math.max(0, Math.min(max, clientX - r.left - size / 2));
    return Math.round((x / max) * (n - 1));
  }

  // 중앙 카드만 또렷하게, 바깥으로 갈수록 흐리게.
  function paintVeil() {
    const cur = pages[focused];
    if (!cur) { veil.style.background = 'none'; return; }
    const w = geom.rect.width;
    const l = cur.left - track.scrollLeft;
    const r = l + cur.width;
    const p = x => Math.max(0, Math.min(100, (x / w) * 100));
    const c = 'var(--cpv-veil-color)';
    veil.style.background =
      `linear-gradient(to right,
        ${c} 0%,
        color-mix(in srgb, ${c} 55%, transparent) ${p(l - geom.gap)}%,
        transparent ${p(l - 8)}%,
        transparent ${p(r + 8)}%,
        color-mix(in srgb, ${c} 55%, transparent) ${p(r + geom.gap)}%,
        ${c} 100%)`;
  }

  function focus(i, animate = true) {
    if (!pages.length) return;
    focused = Math.max(0, Math.min(pages.length - 1, i));
    const cur = pages[focused];
    const target = cur.left - (geom.rect.width - cur.width) / 2;
    track.style.scrollBehavior = animate ? 'smooth' : 'auto';
    track.scrollLeft = target;
    root.dataset.focus = String(focused);
    requestAnimationFrame(syncLayer);
    root.dispatchEvent(new CustomEvent('cpv:focus', { detail: { index: focused, page: cur } }));
  }

  function focusFromScroll() {
    const center = track.scrollLeft + geom.rect.width / 2;
    let best = 0, bestD = Infinity;
    pages.forEach((p, i) => {
      const d = Math.abs(p.left + p.width / 2 - center);
      if (d < bestD) { bestD = d; best = i; }
    });
    focused = best;
    root.dataset.focus = String(focused);
    syncLayer();
  }

  function pageAt(clientX) {
    const x = clientX - geom.rect.left + track.scrollLeft;
    return pages.findIndex(p => x >= p.left && x <= p.left + p.width);
  }

  function toggleTool(key) {
    if (expandedTools.has(key)) expandedTools.delete(key);
    else expandedTools.add(key);
    root.dispatchEvent(new CustomEvent('cpv:rerender'));
  }

  function togglePrompt(key) {
    if (expandedPrompts.has(key)) expandedPrompts.delete(key);
    else expandedPrompts.add(key);
    layer.bubble?.classList.toggle('open', expandedPrompts.has(String(key)));
  }

  function el(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  return {
    build, destroy, render, focus, focusFromScroll, syncLayer, pageAt,
    get root() { return root; },
    get track() { return track; },
    get pages() { return pages; },
    get bar() { return bar; },
    get thumb() { return thumb; },
    pageFromBar,
    get focused() { return focused; },
    get geom() { return geom; }
  };
})();
