"use strict";

/* ================================================================
   イベントバインド
   ================================================================ */
document.getElementById("topInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
document.getElementById("resultInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(e.target.value.trim()); });
document.getElementById("detailInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(e.target.value.trim()); });

// ソート変更
document.querySelectorAll('input[name="sortOrder"]').forEach(r => r.addEventListener("change", () => {
  if (currentResults.length) renderAll(currentKeyword);
}));

// 検索モード・範囲変更
document.querySelectorAll('input[name="searchMode"],input[name="searchType"]').forEach(r => r.addEventListener("change", () => {
  // ユーザーが手動でラジオを操作した印。これが立っている間は
  // id:プレフィックスでも type を id に強制しない（手動選択を尊重する）。
  window.__userChangedType = true;
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
