// 진입점. 켜고 끄기, 수집, 다시 그리기.
window.CPV = window.CPV || {};

(() => {
  const S = CPV.source;
  const H = CPV.harvest;
  const V = CPV.view;
  const N = CPV.nav;

  let on = false;
  let host = null;
  let button = null;
  let observer = null;
  let rerenderTimer = null;

  function ensureButton() {
    if (button) return;
    button = document.createElement('button');
    button.className = 'cpv-toggle';
    button.type = 'button';
    button.textContent = '페이지 보기';
    button.title = '페이지 보기 켜기/끄기 (Alt+P)';
    button.addEventListener('click', toggle);
    document.body.appendChild(button);
  }

  async function turnOn() {
    const feed = S.feed();
    if (!feed) { flash('대화창을 찾지 못했다'); return; }
    on = true;
    button.classList.add('is-on');
    button.textContent = '스크롤 보기';

    host = document.createElement('div');
    host.className = 'cpv-host';
    document.body.appendChild(host);
    V.build(host);

    const progress = document.createElement('div');
    progress.className = 'cpv-progress';
    progress.textContent = '대화를 읽는 중…';
    host.appendChild(progress);

    // 가상 스크롤 때문에 화면 밖 행은 DOM에 없다. 한 번 훑어 모은다.
    // 켠 직후에는 앱이 아직 기록을 받아오는 중일 수 있어 먼저 그것을 기다린다.
    const records = await H.all((p, phase) => {
      progress.textContent =
        phase === 'load' ? '대화를 불러오는 중…' :
        phase === 'top' ? '이전 내역을 불러오는 중…' :
        `대화를 읽는 중… ${Math.round(p * 100)}%`;
    });
    progress.remove();

    // 다 읽은 뒤에 원본 대화를 감춘다.
    document.documentElement.classList.add('cpv-on');
    V.render(records);
    markCoverage();
    flash(`${H.coverage().수집한행}개 읽음`);

    // 못 읽은 줄이 있으면 사용자가 시키지 않아도 스스로 다시 줍는다.
    await autoFill();
    N.attach(V.root);
    V.root.addEventListener('cpv:rerender', () => V.render(H.records()));
    watch();
    watchRoute();
    window.addEventListener('resize', onResize);
  }

  // 빠진 줄을 스스로 다시 읽는다. 두 번까지 시도하고, 그래도 남으면 눌러서
  // 다시 시도할 수 있는 표시를 남긴다.
  async function autoFill() {
    for (let round = 0; round < 2; round++) {
      if (!on || !H.missing().length) break;
      showNote(`못 읽은 줄 ${H.missing().length}개 다시 읽는 중…`, null);
      await H.fillMissing();
      if (!on) return;
      V.render(H.records());
      markCoverage();
    }
    const left = H.missing().length;
    if (!on) return;
    if (left) showNote(`못 읽은 줄 ${left}개`, () => autoFill());
    else hideNote();
  }

  function markCoverage() {
    const cov = H.coverage();
    if (!V.root) return;
    V.root.dataset.rows = String(cov.수집한행);
    V.root.dataset.total = String(cov.전체행);
    V.root.dataset.gaps = String(cov.빠진개수);
    V.root.dataset.range = (cov.번호범위 || []).join('-');
    V.root.dataset.log = (cov.기록 || []).join('|');
  }

  let note = null;
  function showNote(text, onClick) {
    if (!host) return;
    if (!note) { note = document.createElement('button'); note.className = 'cpv-note'; host.appendChild(note); }
    note.textContent = text + (onClick ? ' · 다시 읽기' : '');
    note.onclick = onClick || null;
    note.disabled = !onClick;
  }
  function hideNote() { note?.remove(); note = null; }

  function turnOff() {
    on = false;
    document.documentElement.classList.remove('cpv-on');
    button.classList.remove('is-on');
    button.textContent = '페이지 보기';
    hideNote();
    N.detach();
    V.destroy();
    host?.remove();
    host = null;
    observer?.disconnect();
    observer = null;
    clearInterval(routeTimer);
    routeTimer = null;
    window.removeEventListener('resize', onResize);
  }

  function toggle() {
    on ? turnOff() : turnOn();
  }

  // 새 응답이 오거나 생성 중 내용이 늘어나면 다시 모아 그린다.
  function watch() {
    const sizer = S.sizer();
    if (!sizer) return;
    observer = new MutationObserver(() => {
      H.captureMounted();
      clearTimeout(rerenderTimer);
      rerenderTimer = setTimeout(() => {
        if (!on) return;
        V.render(H.records());
      }, S.isStreaming() ? 400 : 120);
    });
    observer.observe(sizer, { childList: true, subtree: true, characterData: true });
  }

  // 다른 대화로 옮기면 페이지 보기를 끈다.
  // 앱이 주소만 바꾸고 화면을 갈아 끼우는 방식(SPA)이라 주소를 지켜본다.
  let routeTimer = null;
  let routeAt = '';
  function watchRoute() {
    routeAt = S.conversationId();
    clearInterval(routeTimer);
    routeTimer = setInterval(() => {
      if (!on) return;
      if (S.conversationId() !== routeAt) {
        turnOff();
        flash('다른 대화로 옮겨 페이지 보기를 껐다');
      }
    }, 500);
  }

  function onResize() {
    if (on) V.render(H.records());
  }

  function flash(text) {
    const n = document.createElement('div');
    n.className = 'cpv-progress';
    n.textContent = text;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 1800);
  }

  window.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); toggle(); }
    if (e.key === 'Escape' && on) turnOff();
  });

  const boot = () => { ensureButton(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 테스트에서 부르기 위해 열어 둔다.
  CPV.toggle = toggle;
  CPV.isOn = () => on;
  // 콘솔에서 수집 상태를 확인할 때 쓴다.
  CPV.report = () => {
    const cov = H.coverage();
    const byType = {};
    for (const r of H.records()) byType[r.type] = (byType[r.type] || 0) + 1;
    const out = { ...cov, 종류별: byType, 페이지수: Number(V.root?.dataset.pages || 0) };
    console.table(H.records().map(r => ({
      행: r.index, 종류: r.type, 높이: r.height, 위치: r.offset,
      샷키: r.shot.entryKey ? String(r.shot.entryKey).slice(0, 10) : null
    })));
    console.log(JSON.stringify(out, null, 1));
    return out;
  };
})();
