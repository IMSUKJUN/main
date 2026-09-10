// 페이지 보기 전역 설정값.
// 앱 DOM은 읽기만 한다. 옮기거나 지우면 React가 자기 자식으로 알던 노드를 잃고
// removeChild 오류와 함께 대화가 통째로 사라진다(측정 확인됨).
window.CPV = window.CPV || {};

CPV.config = {
  // 카드 비율 가로:세로 = 8:10
  ratio: 0.8,
  // 카드 사이 간격 (카드 폭 대비)
  gapRatio: 0.176,
  // 카드 위 프롬프트 말풍선 자리
  bubbleH: 44,
  // 카드 아래 액션 바 자리
  actionsH: 40,
  // 트랙 위아래 여백
  padY: 16,
  // 수집할 때 한 번에 내리는 양 (화면 높이 대비)
  harvestStep: 0.6,
  // 수집 각 단계에서 기다리는 시간(ms)
  harvestWait: 120,
  // 클릭 유지로 연속 이동할 때의 간격(ms)
  holdInterval: 260,
  // 카드 이동 애니메이션(ms)
  glide: 260
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
