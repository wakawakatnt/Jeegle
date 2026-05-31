"use strict";

/* ================================================================
   URL管理
   ================================================================ */
function pushUrl(q) {
  const url = new URL(window.location.href);
  ["search", "type", "mode"].forEach(k => url.searchParams.delete(k));

  const mode = document.querySelector('input[name="searchMode"]:checked').value;
  const type = document.querySelector('input[name="searchType"]:checked').value;
  const dr   = getDateRange();

  if (q) {
    url.searchParams.set("s", q);
    url.searchParams.set("t", TYPE_TO_URL[type] || "b");
    url.searchParams.set("m", MODE_TO_URL[mode] || "t");
    url.searchParams.set("d", dr.urlParam);
  } else {
    ["s", "t", "m", "d"].forEach(k => url.searchParams.delete(k));
  }
  history.pushState({}, "", url.toString());
}

function shareUrl() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const b = document.getElementById("shareBtn"); const o = b.textContent;
    b.textContent = "✅ コピーしました"; setTimeout(() => b.textContent = o, 2000);
  }).catch(() => prompt("URLをコピーしてください:", window.location.href));
}

function loadUrl() {
  const p = new URLSearchParams(window.location.search);
  let q, typeVal, modeVal, dateVal;

  if (p.has("search")) {
    q        = p.get("search") || "";
    typeVal  = LEGACY_TYPE[p.get("type")] || "all";
    modeVal  = LEGACY_MODE[p.get("mode")] || "default";
    const r7 = presetToRange("7days");
    const fromYmd = toYMD(r7.from);
    const toYmd   = toYMD(new Date(r7.to.getTime() - 86400000));
    dateVal = fromYmd + "-" + toYmd;
  } else {
    q        = p.get("s") || "";
    typeVal  = URL_TO_TYPE[p.get("t")] || "all";
    modeVal  = URL_TO_MODE[p.get("m")] || "default";
    dateVal  = p.get("d") || null;
  }

  // 検索クエリが無い → トップページ状態へ戻す（戻るボタン対策）
  if (!q) {
    showTopPage();
    return;
  }

  const te = document.querySelector(`input[name="searchType"][value="${typeVal}"]`);
  const me = document.querySelector(`input[name="searchMode"][value="${modeVal}"]`);
  if (te) te.checked = true;
  if (me) me.checked = true;

  applyDateParam(dateVal);

  document.getElementById("topInput").value = q;
  doSearch(q, { fromHistory: true });
}

/* ================================================================
   ナビゲーション
   ================================================================ */

/** トップページ表示状態にする（履歴は触らない） */
function showTopPage() {
  document.getElementById("topPage").classList.remove("hidden");
  document.getElementById("resultPage").classList.remove("active");
  document.getElementById("threadDetailPage").classList.remove("active");
  document.getElementById("topInput").value = "";
  currentResults = [];
  currentKeyword = "";
}

/** ロゴクリック等でトップへ戻る（履歴も積む） */
function goHome() {
  showTopPage();
  document.getElementById("topInput").focus();
  history.pushState({}, "", location.pathname);
}
