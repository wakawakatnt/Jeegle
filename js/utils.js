"use strict";

/* ===== XSS対策 ===== */
function setText(el, s) { el.textContent = (s == null) ? "" : String(s); }

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
