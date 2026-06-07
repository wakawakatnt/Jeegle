"use strict";

/* ===== XSS対策 ===== */
function setText(el, s) { el.textContent = (s == null) ? "" : String(s); }

/* ===== HTMLエンティティのデコード（表示用。textContentに渡すので安全） ===== */
function decodeEntities(s) {
  if (s == null) return "";
  s = String(s);
  if (s.indexOf("&") === -1) return s;
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return _; }
  });
  s = s.replace(/&#(\d+);/g, (_, d) => {
    try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return _; }
  });
  const named = {
    "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">",
    "&nbsp;": "\u00a0", "&#39;": "'"
  };
  s = s.replace(/&(quot|apos|lt|gt|nbsp);/g, m => named[m] || m);
  s = s.replace(/&amp;/g, "&");
  return s;
}

/* ===== キーワード分割 ===== */
function words(q) { return q.split(/\s+/).filter(Boolean); }

/* ===== Supabase ilike用エンコード ===== */
function enc(w) { return encodeURIComponent("%" + w + "%"); }

/* ===== ローディング表示 ===== */
function mkLoading(el, msg) {
  el.innerHTML = "";
  const d = document.createElement("div"); d.className = "loading"; d.textContent = msg;
  const s = document.createElement("span"); s.className = "spinner"; d.appendChild(s);
  el.appendChild(d);
}

/* ===== フラッシュ演出 ===== */
function flash(el) {
  el.style.transition = "background 0s"; el.style.background = "#fffde7";
  setTimeout(() => { el.style.transition = "background 1.2s"; el.style.background = ""; }, 120);
}
