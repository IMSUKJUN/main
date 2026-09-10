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

    document.documentElement.classList.add('cpv-on');
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

    V.render(records);
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
    setTimeout(() => n.remove(), 2200);
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
})();
