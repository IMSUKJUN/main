/* Options page controller. Every change writes immediately; there is no save
 * button to forget, and the status region reports the result. */
"use strict";

const STORAGE_KEY = "gdhPagerSettings";

const DEFAULTS = {
  enabled: true,
  pageSize: 6,
  position: "bottom-right",
  keyboardShortcuts: true,
  followLatest: true,
  showPageLabel: true,
  customTurnSelector: ""
};

const BOOLEAN_FIELDS = ["enabled", "keyboardShortcuts", "followLatest", "showPageLabel"];

const form = document.getElementById("form");
const statusNode = document.getElementById("status");
const selectorInput = document.getElementById("customTurnSelector");
const selectorError = document.getElementById("selector-error");
const selectorErrorText = selectorError.querySelector("[data-role='selector-error-text']");
const resetButton = document.getElementById("reset");

let saveTimer = null;

function readForm() {
  const value = { ...DEFAULTS };
  for (const name of BOOLEAN_FIELDS) value[name] = document.getElementById(name).checked;
  value.pageSize = Number(document.getElementById("pageSize").value);
  value.position = document.getElementById("position").value;
  value.customTurnSelector = selectorInput.value.trim();
  return value;
}

function writeForm(settings) {
  for (const name of BOOLEAN_FIELDS) document.getElementById(name).checked = Boolean(settings[name]);
  document.getElementById("pageSize").value = String(settings.pageSize);
  document.getElementById("position").value = settings.position;
  selectorInput.value = settings.customTurnSelector || "";
  validateSelector();
}

function setStatus(text) {
  statusNode.textContent = text;
}

function validateSelector() {
  const raw = selectorInput.value.trim();
  if (!raw) {
    selectorInput.removeAttribute("aria-invalid");
    selectorError.hidden = true;
    return true;
  }
  try {
    document.createDocumentFragment().querySelector(raw);
    selectorInput.removeAttribute("aria-invalid");
    selectorError.hidden = true;
    return true;
  } catch (_) {
    selectorInput.setAttribute("aria-invalid", "true");
    selectorErrorText.textContent = "CSS 선택자 형식이 아닙니다. 예: [data-test-render-count]";
    selectorError.hidden = false;
    return false;
  }
}

async function save() {
  if (!validateSelector()) {
    setStatus("선택자를 고치면 저장됩니다.");
    return;
  }
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: readForm() });
    setStatus("저장했습니다.");
  } catch (_) {
    setStatus("저장하지 못했습니다. 브라우저 동기화 저장 공간을 확인해 주세요.");
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setStatus("저장 중…");
  saveTimer = setTimeout(save, 200);
}

form.addEventListener("change", scheduleSave);
selectorInput.addEventListener("input", () => {
  validateSelector();
  scheduleSave();
});

resetButton.addEventListener("click", async () => {
  writeForm(DEFAULTS);
  await save();
  setStatus("기본값으로 되돌렸습니다.");
});

(async function init() {
  try {
    const bag = await chrome.storage.sync.get(STORAGE_KEY);
    writeForm({ ...DEFAULTS, ...(bag[STORAGE_KEY] || {}) });
    setStatus("");
  } catch (_) {
    writeForm(DEFAULTS);
    setStatus("설정을 불러오지 못해 기본값을 보여 줍니다.");
  }
})();
