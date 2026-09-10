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
    root.append(track, veil, layer);
    container.appendChild(root);
    return root;
  }

  function destroy() {
    root?.remove();
    root = track = veil = layer = null;
    pages = [];
  }

  function measure() {
    const feed = S.feed();
    const r = feed ? feed.getBoundingClientRect() : { width: innerWidth, height: innerHeight, left: 0, top: 0 };
    const availH = r.height - config.padY * 2 - config.bubbleH - config.actionsH;
    let cardH = Math.max(240, availH);
    let cardW = cardH * config.ratio;
    const maxW = r.width * 0.62;
    if (cardW > maxW) { cardW = maxW; cardH = cardW / config.ratio; }
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
  function toShots(records) {
    const shots = new Map();
    const chips = [];
    for (const rec of records) {
      if (rec.type === S.ROW.MARKER) { chips.push(rec); continue; }
      const key = rec.shot.entryIndex ?? `x${rec.index}`;
      if (!shots.has(key)) {
        shots.set(key, { key, entryIndex: rec.shot.entryIndex, order: rec.index, prompt: null, body: [], tool: [], chips: [] });
      }
      const shot = shots.get(key);
      shot.order = Math.min(shot.order, rec.index);
      if (rec.type === S.ROW.HUMAN) shot.prompt = rec;
      else if (rec.type === S.ROW.TOOL) shot.tool.push(rec);
      else shot.body.push(rec);
    }
    const list = [...shots.values()].sort((a, b) => a.order - b.order);
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
    if (!rows.length) return null;
    const strip = el('div', 'cpv-strip');
    strip.dataset.kind = kind;
    strip.dataset.shot = String(shot.key);
    const card = el('div', 'cpv-card');

    if (kind === 'body' && shot.tool.length) card.append(makeToolLine(shot));
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
      place(num, page.left + page.width, page.top + page.height, 'br');
      layer.append(num);
      page.numEl = num;

      if (page.first && page.kind === 'body' && page.shot?.prompt) {
        const bubble = makeBubble(page.shot, page);
        layer.append(bubble);
        page.bubbleEl = bubble;
      }
    }
    const actions = el('div', 'cpv-actions');
    actions.innerHTML = '<span>복사</span><span>읽어주기</span><span>좋아요</span><span>싫어요</span><span>다시</span>';
    layer.append(actions);
    layer.actions = actions;
  }

  function makeBubble(shot, page) {
    const b = el('div', 'cpv-bubble');
    const open = expandedPrompts.has(shot.key);
    b.classList.toggle('open', open);
    b.textContent = shot.prompt?.prompt || '';
    b.style.width = page.width + 'px';
    b.style.left = (page.left - track.scrollLeft) + 'px';
    b.style.top = (page.top - config.bubbleH) + 'px';
    b.dataset.shot = String(shot.key);
    b.addEventListener('click', e => {
      e.stopPropagation();
      togglePrompt(shot.key);
    });
    return b;
  }

  function place(node, x, y, anchor) {
    node.style.position = 'absolute';
    if (anchor === 'br') {
      node.style.left = (x - track.scrollLeft) + 'px';
      node.style.top = y + 'px';
      node.style.transform = 'translate(-100%, -100%)';
    }
    node.dataset.x = String(x);
    node.dataset.y = String(y);
  }

  // 트랙을 움직이면 겹쳐 그린 것들도 같이 움직인다.
  function syncLayer() {
    const dx = track.scrollLeft;
    for (const page of pages) {
      if (page.numEl) page.numEl.style.left = (page.left + page.width - dx) + 'px';
      if (page.bubbleEl) page.bubbleEl.style.left = (page.left - dx) + 'px';
    }
    const cur = pages[focused];
    if (cur && layer.actions) {
      layer.actions.style.left = (cur.left - dx) + 'px';
      layer.actions.style.top = (cur.top + cur.height + 8) + 'px';
      layer.actions.style.width = cur.width + 'px';
    }
    paintVeil();
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
    for (const p of pages) {
      if (p.bubbleEl && p.bubbleEl.dataset.shot === String(key)) {
        p.bubbleEl.classList.toggle('open', expandedPrompts.has(key));
      }
    }
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
    get focused() { return focused; },
    get geom() { return geom; }
  };
})();
