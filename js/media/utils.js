/* ===== media/utils.js — 汎用ユーティリティ ===== */
"use strict";

var MediaUtil = (function(){

  function $(id) { return document.getElementById(id); }
  function txt(el, s) { el.textContent = (s == null) ? "" : String(s); }
  function pad2(n) { return String(n).padStart(2, "0"); }

  function setStatus(msg, type) {
    var el = $("mdStatus");
    if (!msg) { el.classList.remove("show"); return; }
    el.className = "md-status show " + (type || "info");
    el.textContent = msg;
  }

  function toDate(v) {
    if (v == null) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
    if (typeof v === "string") { var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
    if (typeof v === "object") {
      if (typeof v.toDate === "function") { try { return v.toDate(); } catch(e){} }
      if (typeof v.seconds === "number") return new Date(v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6));
      if (typeof v._seconds === "number") return new Date(v._seconds * 1000 + Math.floor((v._nanoseconds || 0) / 1e6));
    }
    return null;
  }

  function toDateSafe(v) {
    var d = toDate(v);
    return d ? d.toISOString() : (typeof v === "string" || typeof v === "number" ? v : null);
  }

  function fmtDate(v) {
    var d = toDate(v);
    if (!d) return "";
    return d.getFullYear() + "/" + pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) +
           " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  function fmtUpdated(v) {
    var d = toDate(v);
    return d ? fmtDate(d) : "—";
  }

  function dateYYMMDD(v) {
    var d = toDate(v);
    if (!d) return "";
    return String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function threadUrl(t, n) {
    if (!t) return "#";
    var base = MediaCfg.THREAD_BASE + t + "/";
    return n ? base + n : base;
  }

  function idAnalysisUrl(id, postedAt) {
    var u = "id-analysis.html?id=" + encodeURIComponent(id);
    var d = dateYYMMDD(postedAt);
    if (d) u += "&d=" + d;
    return u;
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  return {
    $: $,
    txt: txt,
    pad2: pad2,
    setStatus: setStatus,
    toDate: toDate,
    toDateSafe: toDateSafe,
    fmtDate: fmtDate,
    fmtUpdated: fmtUpdated,
    dateYYMMDD: dateYYMMDD,
    threadUrl: threadUrl,
    idAnalysisUrl: idAnalysisUrl,
    escHtml: escHtml
  };
})();
