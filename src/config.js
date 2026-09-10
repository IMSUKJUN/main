// 페이지 보기 전역 설정값.
// 앱 DOM은 읽기만 한다. 옮기거나 지우면 React가 자기 자식으로 알던 노드를 잃고
// removeChild 오류와 함께 대화가 통째로 사라진다(측정 확인됨).
window.CPV = window.CPV || {};

CPV.config = {
  // 카드 비율 가로:세로 = 8:10 (글줄 폭을 못 읽을 때 쓰는 값)
  ratio: 0.8,
  // 카드 폭을 원래 스크롤 화면의 글줄 폭에 맞출지
  matchColumnWidth: true,
  // 글줄 폭 상한. 채팅·coworker 화면 기준(768px)에 맞춘다.
  // Claude Code 화면은 이보다 넓어서 그대로 두면 카드가 커진다.
  columnMax: 768,
  // 카드 좌우 안여백 (overlay.css 의 .cpv-card padding 과 같아야 한다)
  cardPadX: 26,
  // 휠을 멈춘 뒤 가장 가까운 페이지에 맞추기까지 기다리는 시간(ms)
  settle: 160,
  // 카드 사이 간격 (카드 폭 대비)
  gapRatio: 0.176,
  // 카드 위 프롬프트 말풍선 자리
  bubbleH: 44,
  // 카드 아래 여백 (스크롤바·페이지 수가 놓이는 자리)
  bottomH: 40,
  // 트랙 위아래 여백
  padY: 16,
  // 켠 직후, 대화가 다 실려 올 때까지 기다리는 값들.
  // 버튼을 일찍 누르면 앱이 아직 기록을 받아오는 중이라 그대로 읽으면 빠진다.
  settleInterval: 160,   // 얼마나 자주 확인할지(ms)
  settleSame: 3,         // 이만큼 연속으로 안 변하면 다 실린 것으로 본다
  settleMax: 12000,      // 그래도 안 끝나면 이 시간(ms) 뒤에는 그냥 시작한다
  // 읽는 도중에 행이 늘어났을 때 다시 훑는 횟수
  regrowRounds: 2,
  // 수집할 때 한 번에 내리는 양 (화면 높이 대비)
  harvestStep: 0.9,
  // 수집 각 단계에서 기다리는 시간(ms). 행이 안 붙으면 뒤로 갈수록 더 기다린다.
  harvestWaits: [50, 90, 150, 250, 400],
  // 클릭 유지로 연속 이동할 때의 간격(ms)
  holdInterval: 260,
  // 카드 이동 애니메이션(ms)
  glide: 260,
  // 휠 한 번에 한 페이지. 이 간격 안에 들어온 휠은 한 번으로 친다.
  wheelCooldown: 220,
  // 이만큼 이상 굴려야 한 페이지로 친다 (터치패드 잔떨림 거르기)
  wheelThreshold: 8
};

CPV.sel = {
  feed: '[data-testid="epitaxy-virtual-transcript"], [role="feed"][data-autoscroll-container], [data-autoscroll-container]',
  sizer: '[data-testid="transcript-sizer"]',
  row: '[data-testid="transcript-row"]',
  entry: '[data-epitaxy-entry-index]',
  entryKey: '[data-entry-key]',
  codeBlock: '.epitaxy-diff[data-code-text]',
  shadowHost: 'diffs-container'
};

// 행 종류
CPV.ROW = {
  HUMAN: 'human',
  MARKER: 'marker',
  TOOL: 'assistant_tool',
  TEXT: 'assistant_text'
};
