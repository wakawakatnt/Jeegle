"use strict";

/* ===== 日時フォーマット (曜日付き) ===== */
function fmtDate(posted_at) {
  if (!posted_at) return "";
  const d = new Date(posted_at);
  if (isNaN(d.getTime())) return String(posted_at);
  const yy  = String(d.getFullYear()).slice(2).padStart(2, "0");
  const mo  = String(d.getMonth() + 1).padStart(2, "0");
  const dy  = String(d.getDate()).padStart(2, "0");
  const dow = DAYS[d.getDay()];
  const hh  = String(d.getHours()).padStart(2, "0");
  const mi  = String(d.getMinutes()).padStart(2, "0");
  const ss  = String(d.getSeconds()).padStart(2, "0");
  return `${yy}/${mo}/${dy}(${dow}) ${hh}:${mi}:${ss}`;
}

/** YYMMDD形式の文字列を返す */
function toYMD(date) {
  const yy = String(date.getFullYear()).slice(2).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return yy + mm + dd;
}

/** YYMMDD文字列 → Dateオブジェクト */
function fromYMD(s) {
  if (!s || s.length !== 6) return null;
  const yy = parseInt(s.slice(0, 2), 10);
  const mm = parseInt(s.slice(2, 4), 10) - 1;
  const dd = parseInt(s.slice(4, 6), 10);
  return new Date(2000 + yy, mm, dd);
}

/** 今日 (ローカル時間 00:00:00) */
function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** n日前 */
function daysAgo(n) {
  const d = today();
  d.setDate(d.getDate() - n);
  return d;
}

/** 明日0時 */
function tomorrow() {
  const d = today();
  d.setDate(d.getDate() + 1);
  return d;
}

/** プリセット名 → { from: Date, to: Date } */
function presetToRange(preset) {
  switch (preset) {
    case "today":     return { from: today(), to: tomorrow() };
    case "yesterday": return { from: daysAgo(1), to: today() };
    case "3days":     return { from: daysAgo(2), to: tomorrow() };
    case "7days":     return { from: daysAgo(6), to: tomorrow() };
    default:          return null;
  }
}

/** 現在のUI状態から日付範囲を取得 */
function getDateRange() {
  const preset = document.querySelector('input[name="dateRange"]:checked').value;

  if (preset === "custom") {
    const fv = document.getElementById("dateFrom").value;
    const tv = document.getElementById("dateTo").value;
    if (!fv || !tv) {
      const r = presetToRange("7days");
      return { from: r.from.toISOString(), to: r.to.toISOString(), urlParam: toYMD(r.from) + "-" + toYMD(daysAgo(-1)) };
    }
    const fd = new Date(fv + "T00:00:00");
    const td = new Date(tv + "T00:00:00");
    const tdNext = new Date(td); tdNext.setDate(tdNext.getDate() + 1);
    return {
      from: fd.toISOString(),
      to:   tdNext.toISOString(),
      urlParam: toYMD(fd) + "-" + toYMD(td)
    };
  }

  const r = presetToRange(preset);
  if (!r) {
    const r7 = presetToRange("7days");
    return { from: r7.from.toISOString(), to: r7.to.toISOString(), urlParam: toYMD(r7.from) + "-" + toYMD(today()) };
  }
  const fromYmd = toYMD(r.from);
  const toYmd   = toYMD(new Date(r.to.getTime() - 86400000));
  const urlP = (fromYmd === toYmd) ? fromYmd : fromYmd + "-" + toYmd;
  return { from: r.from.toISOString(), to: r.to.toISOString(), urlParam: urlP };
}

/** URLのdパラメータからUIを復元 */
function applyDateParam(dParam) {
  if (!dParam) {
    const el = document.querySelector('input[name="dateRange"][value="today"]');
    if (el) el.checked = true;
    document.getElementById("dateCustomGroup").style.display = "none";
    return;
  }
  const parts = dParam.split("-");
  const fromD = fromYMD(parts[0]);
  const toD   = parts.length >= 2 ? fromYMD(parts[1]) : fromD;
  if (!fromD || !toD) {
    document.querySelector('input[name="dateRange"][value="today"]').checked = true;
    document.getElementById("dateCustomGroup").style.display = "none";
    return;
  }
  const matched = matchPreset(fromD, toD);
  if (matched) {
    const el = document.querySelector(`input[name="dateRange"][value="${matched}"]`);
    if (el) el.checked = true;
    document.getElementById("dateCustomGroup").style.display = "none";
  } else {
    const el = document.querySelector('input[name="dateRange"][value="custom"]');
    if (el) el.checked = true;
    document.getElementById("dateCustomGroup").style.display = "";
    document.getElementById("dateFrom").value = dateToInput(fromD);
    document.getElementById("dateTo").value   = dateToInput(toD);
  }
}

/** Date → "YYYY-MM-DD" */
function dateToInput(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** from/to がプリセットに一致するか判定 */
function matchPreset(fromD, toD) {
  for (const name of ["today", "yesterday", "3days", "7days"]) {
    const r = presetToRange(name);
    const pFrom = r.from;
    const pTo   = new Date(r.to.getTime() - 86400000);
    if (fromD.getTime() === pFrom.getTime() && toD.getTime() === pTo.getTime()) return name;
  }
  return null;
}
