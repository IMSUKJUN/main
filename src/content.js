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
    const records = await H.all(p => {
      progress.textContent = `대화를 읽는 중… ${Math.round(p * 100)}%`;
    });
    progress.remove();

    // 다 읽은 뒤에 원본 대화를 감춘다.
    document.documentElement.classList.add('cpv-on');
    const cov = H.coverage();
    // 몇 행을 읽었는지 잠깐 알려 준다. 빠진 게 있으면 같이 보여 준다.
    flash(cov.빠진개수
      ? `${cov.수집한행}개 읽음 · 못 읽은 줄 ${cov.빠진개수}개`
      : `${cov.수집한행}개 읽음`);
    V.render(records);
    if (V.root) {
      V.root.dataset.rows = String(cov.수집한행);
      V.root.dataset.gaps = String(cov.빠진개수);
      V.root.dataset.range = (cov.번호범위 || []).join('-');
    }
    N.attach(V.root);
    V.root.addEventListener('cpv:rerender', () => V.render(H.records()));
    watch();
    window.addEventListener('resize', onResize);
  }

  function turnOff() {
    on = false;
    document.documentElement.classList.remove('cpv-on');
    button.classList.remove('is-on');
    button.textContent = '페이지 보기';
    N.detach();
    V.destroy();
    host?.remove();
    host = null;
    observer?.disconnect();
    observer = null;
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
