"use strict";

/* ================================================================
   イベントバインド
   ================================================================ */
document.getElementById("topInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
document.getElementById("resultInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(e.target.value.trim()); });
document.getElementById("detailInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(e.target.value.trim()); });

const topSearchTreeButtons = Array.from(document.querySelectorAll(".scope-tree-option"));
const topSearchMobileButtons = Array.from(document.querySelectorAll(".scope-mobile-option"));
const topSearchTypes = topSearchTreeButtons.map(button => button.dataset.searchType);
const topSearchDrum = document.getElementById("topSearchScopeDrum");
const topSearchDrumItems = document.querySelector(".scope-drum-items");
const DRUM_ITEM_HEIGHT = 16;
const DRUM_CENTER_OFFSET = 2;
const DRUM_LOOP_COUNT = 7;
const DRUM_HOME_POSITION = Math.floor(DRUM_LOOP_COUNT / 2) * topSearchTypes.length;
const DRUM_MIN_POSITION = topSearchTypes.length;
const DRUM_MAX_POSITION = (DRUM_LOOP_COUNT - 2) * topSearchTypes.length;
let drumPosition = DRUM_HOME_POSITION;
let drumDrag = null;

for (let loop = 0; loop < DRUM_LOOP_COUNT; loop += 1) {
  topSearchTypes.forEach((type, index) => {
    const item = document.createElement("span");
    item.className = "scope-drum-item";
    item.dataset.searchType = type;
    item.dataset.drumPosition = String(loop * topSearchTypes.length + index);
    item.textContent = topSearchTreeButtons[index].textContent;
    topSearchDrumItems.appendChild(item);
  });
}
const topSearchDrumOptions = Array.from(document.querySelectorAll(".scope-drum-item"));

function typeIndexForDrumPosition(position) {
  return ((position % topSearchTypes.length) + topSearchTypes.length) % topSearchTypes.length;
}

function moveDrumTo(position, animate = true) {
  topSearchDrumItems.style.transition = animate ? "" : "none";
  topSearchDrumItems.style.transform = `translateY(${DRUM_CENTER_OFFSET - position * DRUM_ITEM_HEIGHT}px)`;
  if (!animate) requestAnimationFrame(() => { topSearchDrumItems.style.transition = ""; });
}

function closestDrumPositionForType(type) {
  const typeIndex = Math.max(0, topSearchTypes.indexOf(type));
  let closest = typeIndex;
  let distance = Infinity;
  for (let loop = 0; loop < DRUM_LOOP_COUNT; loop += 1) {
    const candidate = loop * topSearchTypes.length + typeIndex;
    const candidateDistance = Math.abs(candidate - drumPosition);
    if (candidateDistance < distance) {
      closest = candidate;
      distance = candidateDistance;
    }
  }
  return closest;
}

function recenterDrumIfNeeded() {
  if (drumPosition > DRUM_MIN_POSITION && drumPosition < DRUM_MAX_POSITION) return;
  const scheduledPosition = drumPosition;
  const currentTypeIndex = typeIndexForDrumPosition(scheduledPosition);
  window.setTimeout(() => {
    if (drumPosition !== scheduledPosition) return;
    drumPosition = DRUM_HOME_POSITION + currentTypeIndex;
    moveDrumTo(drumPosition, false);
  }, 230);
}

function syncTopSearchType(value, preferredPosition) {
  const typeIndex = Math.max(0, topSearchTypes.indexOf(value));
  window.__topSearchType = value;
  drumPosition = preferredPosition === undefined ? closestDrumPositionForType(value) : preferredPosition;
  topSearchTreeButtons.concat(topSearchMobileButtons).forEach(button => {
    const active = button.dataset.searchType === value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  topSearchDrumOptions.forEach(item => item.classList.toggle("active", item.dataset.searchType === value));
  moveDrumTo(drumPosition);
  recenterDrumIfNeeded();
  return typeIndex;
}

function selectTopSearchType(value, preferredPosition) {
  const radio = document.querySelector(`input[name="searchType"][value="${value}"]`);
  if (radio) radio.checked = true;
  syncTopSearchType(value, preferredPosition);
  window.__userChangedType = true;
}

function selectRelativeDrumType(direction) {
  if ((direction > 0 && drumPosition >= DRUM_MAX_POSITION) || (direction < 0 && drumPosition <= DRUM_MIN_POSITION)) {
    drumPosition = DRUM_HOME_POSITION + typeIndexForDrumPosition(drumPosition);
    moveDrumTo(drumPosition, false);
  }
  const nextPosition = drumPosition + direction;
  const nextType = topSearchTypes[typeIndexForDrumPosition(nextPosition)];
  selectTopSearchType(nextType, nextPosition);
}

topSearchTreeButtons.concat(topSearchMobileButtons).forEach(button => button.addEventListener("click", () => {
  selectTopSearchType(button.dataset.searchType);
}));

topSearchDrum.addEventListener("wheel", e => {
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  e.preventDefault();
  selectRelativeDrumType(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

topSearchDrum.addEventListener("keydown", e => {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  selectRelativeDrumType(e.key === "ArrowDown" ? 1 : -1);
});

topSearchDrum.addEventListener("pointerdown", e => {
  drumDrag = { startY: e.clientY, startPosition: drumPosition, pointerId: e.pointerId };
  topSearchDrum.setPointerCapture(e.pointerId);
});

topSearchDrum.addEventListener("pointermove", e => {
  if (!drumDrag || e.pointerId !== drumDrag.pointerId) return;
  const position = drumDrag.startPosition - (e.clientY - drumDrag.startY) / DRUM_ITEM_HEIGHT;
  const clampedPosition = Math.max(DRUM_MIN_POSITION, Math.min(DRUM_MAX_POSITION, position));
  topSearchDrumItems.style.transition = "none";
  topSearchDrumItems.style.transform = `translateY(${DRUM_CENTER_OFFSET - clampedPosition * DRUM_ITEM_HEIGHT}px)`;
});

function finishDrumDrag(e) {
  if (!drumDrag || e.pointerId !== drumDrag.pointerId) return;
  const position = Math.round(Math.max(DRUM_MIN_POSITION, Math.min(DRUM_MAX_POSITION, drumDrag.startPosition - (e.clientY - drumDrag.startY) / DRUM_ITEM_HEIGHT)));
  drumDrag = null;
  selectTopSearchType(topSearchTypes[typeIndexForDrumPosition(position)], position);
}

topSearchDrum.addEventListener("pointerup", finishDrumDrag);
topSearchDrum.addEventListener("pointercancel", finishDrumDrag);
syncTopSearchType("all", DRUM_HOME_POSITION);

/* ================================================================
   検索履歴（このブラウザ内に最大10件保存）
   ================================================================ */
const SEARCH_HISTORY_KEY = "jeegle-search-history-v1";
const SEARCH_HISTORY_LIMIT = 10;
const searchTypeLabels = { all: "全て", title: "スレタイ", body: "レス本文", name: "名前", id: "ID", ai: "AIモード" };

function getSearchHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
    return Array.isArray(history) ? history.filter(item => item && item.query) : [];
  } catch (_) {
    return [];
  }
}

function isValidHistoryDate(value) {
  if (!/^\d{6}$/.test(value || "")) return false;
  const date = fromYMD(value);
  return Boolean(date && toYMD(date) === value);
}

function normalizeHistoryDateParam(value) {
  const parts = String(value || "").split("-");
  if (!isValidHistoryDate(parts[0])) return "";
  const end = parts[1] || parts[0];
  if (!isValidHistoryDate(end)) return "";
  return parts[0] <= end ? (parts.length > 1 ? `${parts[0]}-${end}` : parts[0]) : `${end}-${parts[0]}`;
}

function formatHistoryDate(value) {
  const dateParam = normalizeHistoryDateParam(value);
  if (!dateParam) return "日付未保存";
  const [from, to] = dateParam.split("-");
  const format = ymd => `${ymd.slice(0, 2)}/${ymd.slice(2, 4)}/${ymd.slice(4, 6)}`;
  return from === to || !to ? format(from) : `${format(from)}〜${format(to)}`;
}

function renderSearchHistory() {
  const section = document.getElementById("searchHistory");
  const list = document.getElementById("searchHistoryList");
  if (!section || !list) return;

  const history = getSearchHistory();
  section.hidden = history.length === 0;
  list.innerHTML = "";
  history.forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-history-item";
    button.title = `「${item.query}」を再検索`;

    const query = document.createElement("span");
    query.className = "search-history-query";
    query.textContent = item.query;
    const scope = document.createElement("span");
    scope.className = "search-history-scope";
    scope.textContent = searchTypeLabels[item.type] || searchTypeLabels.all;
    const date = document.createElement("span");
    date.className = "search-history-date";
    date.textContent = formatHistoryDate(item.date);
    button.append(query, scope, date);
    button.addEventListener("click", () => {
      const type = searchTypeLabels[item.type] ? item.type : "all";
      const dateParam = normalizeHistoryDateParam(item.date);
      applyDateParam(dateParam || null);
      selectTopSearchType(type);
      document.getElementById("topInput").value = item.query;
      doSearch(item.query);
    });
    list.appendChild(button);
  });
}

function recordSearchHistory(query, type) {
  const normalizedQuery = String(query).trim();
  if (!normalizedQuery) return;

  const normalizedType = searchTypeLabels[type] ? type : "all";
  const date = normalizeHistoryDateParam(getDateRange().urlParam);

  // 同じ語でも検索対象や日付範囲が違えば別の検索として残す。
  // 例: 「全て」→「ID」への再検索では、全ての履歴を残したままIDを追加する。
  const history = getSearchHistory().filter(item =>
    item.query !== normalizedQuery || item.type !== normalizedType || item.date !== date
  );
  history.unshift({
    query: normalizedQuery,
    type: normalizedType,
    date
  });
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, SEARCH_HISTORY_LIMIT)));
  } catch (_) {
    return;
  }
  renderSearchHistory();
}

document.getElementById("searchHistoryClear").addEventListener("click", () => {
  try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch (_) {}
  renderSearchHistory();
});
renderSearchHistory();

// ソート変更
document.querySelectorAll('input[name="sortOrder"]').forEach(r => r.addEventListener("change", () => {
  if (currentResults.length) renderAll(currentKeyword);
}));

// 検索モード・範囲変更
document.querySelectorAll('input[name="searchMode"],input[name="searchType"]').forEach(r => r.addEventListener("change", () => {
  // ユーザーが手動でラジオを操作した印。これが立っている間は
  // id:プレフィックスでも type を id に強制しない（手動選択を尊重する）。
  window.__userChangedType = true;
  if (r.name === "searchType") syncTopSearchType(r.value);
  const q = document.getElementById("resultInput").value.trim();
  if (q) doSearch(q, { userTypeChange: true });
}));


// 日付プリセット変更
document.querySelectorAll('input[name="dateRange"]').forEach(r => r.addEventListener("change", () => {
  const v = r.value;
  document.getElementById("dateCustomGroup").style.display = (v === "custom") ? "" : "none";
  if (v !== "custom") {
    const q = document.getElementById("resultInput").value.trim();
    if (q) doSearch(q, { userTypeChange: true });
  }
}));

// カスタム日付入力変更
document.getElementById("dateFrom").addEventListener("change", () => {
  const fromEl = document.getElementById("dateFrom");
  const toEl   = document.getElementById("dateTo");
  if (!fromEl.value || !toEl.value) return;
  if (fromEl.value > toEl.value) {
    [fromEl.value, toEl.value] = [toEl.value, fromEl.value];
  }
  const q = document.getElementById("resultInput").value.trim();
  if (q) doSearch(q, { userTypeChange: true });
});
document.getElementById("dateTo").addEventListener("change", () => {
  const fromEl = document.getElementById("dateFrom");
  const toEl   = document.getElementById("dateTo");
  if (!fromEl.value || !toEl.value) return;
  if (fromEl.value > toEl.value) {
    [fromEl.value, toEl.value] = [toEl.value, fromEl.value];
  }
  const q = document.getElementById("resultInput").value.trim();
  if (q) doSearch(q, { userTypeChange: true });
});


window.addEventListener("popstate", loadUrl);

// 初期化
loadUrl();
