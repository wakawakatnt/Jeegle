"use strict";

/* ================================================================
   球団別 最新スレ（Firestore /stats/baseball を Worker 経由で取得）
   - localStorage にキャッシュし、前回取得から5分以上経っていたら
     ホーム表示時に自動で取り直す
   - 表示は textContent のみ（innerHTML 不使用）
   - URL は open2ch なんJのスレURLの形だけ許可
   - キャッシュから読み出した値も毎回チェックし直す
   ================================================================ */
const NpbLatest = (() => {
  const ENDPOINT   = SB_URL + "/fs/stats/baseball";
  const CACHE_KEY  = "jeegle_baseball_v1";
  const TTL_MS     = 5 * 60 * 1000;   // 5分
  const RETRY_MS   = 60 * 1000;       // 失敗後、再試行まで最低60秒あける
  const ORDER      = ["npb", "draft", "hanshin", "baystars", "giants", "dragons", "carp", "orix", "eagles"];
  const MOUNT_IDS  = ["npbLatestPc", "npbLatestSp"];
  const MAX_TEAMS  = 30;              // 球団が増えても常識的な上限で打ち切る

  let memCache   = null;   // localStorage が使えない環境用
  let inflight   = null;
  let lastFailAt = 0;

  /* ---------- 値のチェック ---------- */
  // open2ch なんJのスレURLだけ許可（ホスト名・パス・スレIDの形まで確認）
  const URL_RE = /^https:\/\/hayabusa\.open2ch\.net\/test\/read\.cgi\/livejupiter\/\d{9,11}\/?$/;

  function safeUrl(u) {
    if (typeof u !== "string" || !URL_RE.test(u)) return null;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:" || parsed.hostname !== "hayabusa.open2ch.net") return null;
      return parsed.href;
    } catch (_) {
      return null;
    }
  }

  function safeInt(v) {
    return Number.isInteger(v) && v >= 0 && v < 1e7 ? v : null;
  }

  function safeStr(v, max) {
    if (v == null) return "";
    return String(v).slice(0, max);
  }

  // u は ISO文字列 / UNIX秒・ミリ秒 / {seconds} / {_seconds} のどれで来ても受ける
  function toMs(u) {
    if (u == null) return null;
    let ms = null;
    if (typeof u === "number") ms = u > 1e12 ? u : u * 1000;
    else if (typeof u === "string") { const t = Date.parse(u); ms = isNaN(t) ? null : t; }
    else if (typeof u === "object") {
      const s = u.seconds ?? u._seconds;
      ms = typeof s === "number" ? s * 1000 : null;
    }
    return Number.isFinite(ms) ? ms : null;
  }

  function normalize(raw) {
    raw = raw && typeof raw === "object" ? raw : {};
    const teams = (Array.isArray(raw.teams) ? raw.teams : [])
      .slice(0, MAX_TEAMS)
      .map(t => {
        if (!t || typeof t !== "object" || typeof t.k !== "string" || !t.k) return null;
        const url = safeUrl(t.url);
        if (!url) return null;
        const k = t.k.slice(0, 32);
        return {
          k,
          name:  safeStr(t.name || k, 40),
          title: safeStr(t.title, 200),
          no:    safeInt(t.no),
          r:     safeInt(t.r),
          url
        };
      })
      .filter(Boolean);
    return { u: toMs(raw.u), teams };
  }

  /* ---------- キャッシュ ---------- */
  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && typeof o.ts === "number" && o.data) {
          return { ts: o.ts, data: normalize(o.data) };   // 読み出し時も再チェック
        }
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

  /* ---------- 並び順 ---------- */
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
    } catch (_) {
      return "";
    }
  }

  function build(data) {
    const frag = document.createDocumentFragment();

    const head = el("div", "npb-head");
    head.append(el("span", "npb-head-title", "⚾ 球団別 最新スレ"));
    frag.append(head);

    const list = el("div", "npb-list");
    sortTeams(data.teams).forEach(t => {
      const a = el("a", "npb-item");
      a.href   = t.url;                 // safeUrl を通過した値のみ
      a.target = "_blank";
      a.rel    = "noopener noreferrer";
      a.title  = t.title + (t.r != null ? `（${t.r}レス）` : "");
      if (t.r != null && t.r >= 1000) a.classList.add("npb-full");

      a.append(el("span", "npb-name", t.name));
      const meta = [];
      if (t.no != null) meta.push("#" + t.no);
      if (t.r  != null) meta.push(t.r + "レス");
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

    inflight = fetch(ENDPOINT, { credentials: "omit" })
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

  return { onHomeShown, refresh };
})();
