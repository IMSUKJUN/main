// 카드 사이 이동: 휠, 드래그, 좌우 카드 클릭, 클릭 유지.
window.CPV = window.CPV || {};

CPV.nav = (() => {
  const { config } = CPV;
  const V = CPV.view;

  let bound = null;
  let wheelAcc = 0;
  let wheelLock = false;
  let drag = null;
  let holdTimer = null;
  let holdRepeat = null;

  function attach(root) {
    detach();
    const track = V.track;
    bound = { root, track };

    track.addEventListener('wheel', onWheel, { passive: false });
    track.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    track.addEventListener('scroll', onScroll, { passive: true });
  }

  function detach() {
    if (!bound) return;
    const { track } = bound;
    track.removeEventListener('wheel', onWheel);
    track.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    track.removeEventListener('scroll', onScroll);
    stopHold();
    bound = null;
  }

  // 세로 휠을 가로 이동으로 바꾼다. 한 번에 한 페이지씩.
  function onWheel(e) {
    e.preventDefault();
    if (wheelLock) return;
    wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(wheelAcc) < 90) return;
    const dir = wheelAcc > 0 ? 1 : -1;
    wheelAcc = 0;
    wheelLock = true;
    setTimeout(() => { wheelLock = false; }, config.glide);
    V.focus(V.focused + dir);
  }

  function onDown(e) {
    if (e.button !== 0) return;
    const idx = V.pageAt(e.clientX);
    drag = {
      startX: e.clientX,
      startScroll: V.track.scrollLeft,
      moved: 0,
      index: idx
    };
    V.track.style.scrollBehavior = 'auto';
    // 좌우 카드를 누르고 있으면 그 방향으로 계속 이동한다.
    if (idx >= 0 && idx !== V.focused) {
      const dir = idx > V.focused ? 1 : -1;
      holdTimer = setTimeout(() => {
        holdRepeat = setInterval(() => V.focus(V.focused + dir), config.holdInterval);
      }, 420);
    }
  }

  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    if (drag.moved > 6) stopHold();
    V.track.scrollLeft = drag.startScroll - dx;
    V.syncLayer();
  }

  function onUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    stopHold();
    if (d.moved <= 6 && d.index >= 0 && d.index !== V.focused) {
      V.focus(d.index);          // 좌우 카드 클릭 = 그 카드로 이동
    } else {
      V.focusFromScroll();
      V.focus(V.focused);        // 드래그를 놓으면 가장 가까운 카드에 맞춘다
    }
  }

  function onKey(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); V.focus(V.focused + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); V.focus(V.focused - 1); }
    else if (e.key === 'Home') { e.preventDefault(); V.focus(0); }
    else if (e.key === 'End') { e.preventDefault(); V.focus(V.pages.length - 1); }
  }

  function onScroll() {
    if (drag) return;
    V.syncLayer();
  }

  function stopHold() {
    clearTimeout(holdTimer);
    clearInterval(holdRepeat);
    holdTimer = holdRepeat = null;
  }

  return { attach, detach };
})();
