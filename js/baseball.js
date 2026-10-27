"use strict";

/* ================================================================
   球団別 最新スレ（Firestore /stats/baseball を Worker 経由で取得）
   - localStorage にキャッシュし、前回取得から5分以上経っていたら
     ホーム表示時に自動で取り直す
   ================================================================ */
const NpbLatest = (() => {
  const ENDPOINT   = SB_URL + "/fs/stats/baseball";
  const CACHE_KEY  = "jeegle_baseball_v1";
  const TTL_MS     = 5 * 60 * 1000;   // 5分
  const RETRY_MS   = 60 * 1000;       // 失敗後、再試行まで最低60秒あける
  const ORDER      = ["npb", "draft", "hanshin", "baystars", "giants", "dragons", "carp", "orix", "eagles"];
  const MOUNT_IDS  = ["npbLatestPc", "npbLatestSp"];

  let memCache  = null;   // localStorage が使えない環境用
  let inflight  = null;
  let lastFailAt = 0;

  /* ---------- キャッシュ ---------- */
  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && typeof o.ts === "number" && o.data && Array.isArray(o.data.teams)) return o;
      }
    } catch (_) {}
    return memCache;
  }

  function writeCache(data) {
    const o = { ts: Date.now(), data };
    memCache = o;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(o)); } catch (_) {}
  }

  function isStale(c) {
    if (!c) return true;
    const age = Date.now() - c.ts;
    return age < 0 || age >= TTL_MS;   // 端末の時計が戻った場合も取り直す
  }

  /* ---------- 正規化 ---------- */
  // u は ISO文字列 / UNIX秒・ミリ秒 / {seconds} / {_seconds} のどれで来ても受ける
  function toMs(u) {
    if (u == null) return null;
    if (typeof u === "number") return u > 1e12 ? u : u * 1000;
    if (typeof u === "string") { const t = Date.parse(u); return isNaN(t) ? null : t; }
    if (typeof u === "object") {
      const s = u.seconds ?? u._seconds;
      return typeof s === "number" ? s * 1000 : null;
    }
    return null;
  }

  function normalize(raw) {
    raw = raw || {};
    const teams = (Array.isArray(raw.teams) ? raw.teams : [])
      .filter(t => t && typeof t.k === "string" && typeof t.url === "string" && /^https:\/\//.test(t.url))
      .map(t => ({
        k: t.k,
        name: String(t.name || t.k),
        title: String(t.title || ""),
        no: Number.isFinite(t.no) ? t.no : null,
        r: Number.isFinite(t.r) ? t.r : null,
        url: t.url
      }));
    return { u: toMs(raw.u), teams };
  }

  // 既知のキーは決まった順に並べ、知らないキーは受け取った順のまま末尾へ
  function sortTeams(teams) {
    const rank = k => { const i = ORDER.indexOf(k); return i === -1 ? ORDER.length : i; };
    return teams
      .map((t, i) => ({ t, i }))
      .sort((a, b) => rank(a.t.k) - rank(b.t.k) || a.i - b.i)
      .map(x => x.t);
  }

  /* ---------- 描画（innerHTML は使わず textContent のみ） ---------- */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function fmtUpdated(ms) {
    if (!ms) return "";
    try {
      return new Date(ms).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
      }) + " 更新";
    } catch (_) { return ""; }
  }

  function build(data) {
    const frag = document.createDocumentFragment();

    const head = el("div", "npb-head");
    head.append(el("span", "npb-head-title", "⚾ 球団別 最新スレ"));
    const upd = fmtUpdated(data.u);
    if (upd) head.append(el("span", "npb-updated", upd));
    frag.append(head);

    const list = el("div", "npb-list");
    sortTeams(data.teams).forEach(t => {
      const a = el("a", "npb-item");
      a.href = t.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = t.title + (t.r != null ? `（${t.r}レス）` : "");
      if (t.r != null && t.r >= 1000) a.classList.add("npb-full");

      a.append(el("span", "npb-name", t.name));
      const meta = [];
      if (t.no != null) meta.push("#" + t.no);
      if (t.r != null) meta.push(t.r + "レス");
      if (meta.length) a.append(el("span", "npb-meta", meta.join(" · ")));
      list.append(a);
    });
    frag.append(list);

    const notes = el("div", "npb-notes");
    notes.append(
      el("p", null, "※判定の為に一個前のスレが最新と表示されることがあります"),
      el("p", null, "ここに載ってない球団は...🥺すまんね🥺")
    );
    frag.append(notes);
    return frag;
  }

  function render(data) {
    MOUNT_IDS.forEach(id => {
      const mount = document.getElementById(id);
      if (!mount) return;
      mount.replaceChildren();
      if (!data || !data.teams.length) { mount.hidden = true; return; }
      mount.append(build(data));
      mount.hidden = false;
    });
  }

  /* ---------- 取得 ---------- */
  function refresh() {
    if (inflight) return inflight;
    if (Date.now() - lastFailAt < RETRY_MS) return Promise.resolve();

    inflight = fetch(ENDPOINT)
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(raw => {
        const data = normalize(raw);
        writeCache(data);
        render(data);
      })
      .catch(err => {
        lastFailAt = Date.now();
        console.warn("[NpbLatest]", err);   // 失敗しても古いキャッシュの表示はそのまま
      })
      .finally(() => { inflight = null; });
    return inflight;
  }

  /* ---------- 公開: ホームが表示されたときに呼ぶ ---------- */
  function onHomeShown() {
    const c = readCache();
    if (c) render(c.data);       // まずキャッシュをすぐ表示
    if (isStale(c)) refresh();   // 5分以上経っていたら裏で取り直す
  }

  // タブを開いたまま時間が経ってから戻ってきた場合も対象にする
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const top = document.getElementById("topPage");
    if (top && !top.classList.contains("hidden")) onHomeShown();
  });

  return { onHomeShown, refresh };
})();
