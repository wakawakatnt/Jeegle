"use strict";

/* ===== キャッシュ ===== */
const postsCache  = new Map();
const threadCache = new Map();

/* ================================================================
   ares_count 一括取得（IntersectionObserver + バッチ化）
   ================================================================ */
const aresPending = new Map();   // key: "tid:pnum" → { el, tid, pnum }
let aresTimer = null;
const ARES_BATCH_DELAY = 300;    // 300ms分をまとめて1リクエストにする

const aresObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const pnum = parseInt(el.dataset.postNum, 10);
    const tid  = parseInt(el.dataset.threadId, 10);

    // キャッシュに既にあればネットワーク不要
    if (postsCache.has(tid)) {
      const p = postsCache.get(tid).find(x => x.post_num === pnum);
      if (p && p.ares_count !== undefined) {
        updateAresDisplay(el, Number(p.ares_count) || 0);
        aresObserver.unobserve(el);
        return;
      }
    }

    const key = tid + ":" + pnum;
    if (!aresPending.has(key)) {
      aresPending.set(key, { el, tid, pnum });
    }
    aresObserver.unobserve(el);

    // タイマーリセット → まとめて取得
    if (aresTimer) clearTimeout(aresTimer);
    aresTimer = setTimeout(flushAresBatch, ARES_BATCH_DELAY);
  });
});

async function flushAresBatch() {
  if (aresPending.size === 0) return;

  // スレッドIDごとにグループ化
  const groups = new Map();
  aresPending.forEach(({ el, tid, pnum }) => {
    if (!groups.has(tid)) groups.set(tid, []);
    groups.get(tid).push({ el, pnum });
  });
  aresPending.clear();

  for (const [tid, items] of groups) {
    const pnums = items.map(i => i.pnum).sort((a, b) => a - b);
    const min = pnums[0];
    const max = pnums[pnums.length - 1];

    // 連続性を判定：範囲の幅と実際の要素数が近ければ範囲指定
    const rangeSize = max - min + 1;
    const useRange = rangeSize <= pnums.length * 2;

    try {
      let rows;
      if (useRange) {
        // 範囲指定（URLも短く、インデックスも効く）
        rows = await sbFetch(
          `posts?select=post_num,ares_count`
          + `&thread_id=eq.${tid}`
          + `&post_num=gte.${min}&post_num=lte.${max}`
        );
      } else {
        // 歯抜けが多い場合は in で列挙
        rows = await sbFetch(
          `posts?select=post_num,ares_count`
          + `&thread_id=eq.${tid}`
          + `&post_num=in.(${pnums.join(",")})`
        );
      }

      const map = new Map();
      rows.forEach(r => map.set(Number(r.post_num), Number(r.ares_count) || 0));

      items.forEach(({ el, pnum }) => {
        updateAresDisplay(el, map.get(pnum) || 0);
      });
    } catch (e) {
      // 失敗しても何もしない（表示されないだけ）
    }
  }
}

function updateAresDisplay(postEl, count) {
  if (count <= 0) return;
  const footer = postEl.querySelector(".post-footer-ares");
  if (!footer) return;
  const span = footer.querySelector(".ares-count");
  if (span) setText(span, String(count));
  footer.style.display = "";
}

/* ================================================================
   境界日時
   ================================================================ */
function getBoundaryISO() {
  const d = new Date();
  d.setDate(d.getDate() - BOUNDARY_DAYS);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** thread_id(Unixtime秒)が14日より前か → Tursoも叩く必要あり */
function threadNeedsTurso(threadId) {
  const boundaryUnix = (Date.now() - BOUNDARY_DAYS * 86400000) / 1000;
  return Number(threadId) < boundaryUnix;
}

/* ================================================================
   Supabase通信
   ================================================================ */
async function sbFetch(path) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, {
    headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY }
  });
  if (!r.ok) {
    let detail = "";
    try { const j = await r.json(); detail = j.message || j.hint || JSON.stringify(j); } catch (e) {}
    throw new Error("HTTP " + r.status + (detail ? ": " + detail : ""));
  }
  return r.json();
}

/* ================================================================
   Turso通信（HTTP v2 pipeline）
   ================================================================ */
async function tursoQuery(sql, args) {
  const stmt = { sql };
  if (args && args.length > 0) {
    stmt.args = args.map(a => {
      if (a === null || a === undefined) return { type: "null", value: null };
      if (typeof a === "number") {
        return Number.isInteger(a)
          ? { type: "integer", value: String(a) }
          : { type: "float", value: String(a) };
      }
      return { type: "text", value: String(a) };
    });
  }
  const body = {
    requests: [
      { type: "execute", stmt },
      { type: "close" }
    ]
  };
  const r = await fetch(TURSO_URL + "/v2/pipeline", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + TURSO_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    let detail = "";
    try { detail = await r.text(); } catch (e) {}
    throw new Error("Turso HTTP " + r.status + (detail ? ": " + detail : ""));
  }
  const json = await r.json();
  const result = json.results && json.results[0];
  if (!result) return [];
  if (result.type === "error") {
    throw new Error("Turso: " + (result.error && result.error.message || JSON.stringify(result.error)));
  }
  const resp = result.response;
  if (!resp || !resp.result) return [];
  const cols = resp.result.cols.map(c => c.name);
  const rows = resp.result.rows || [];
  return rows.map(row => {
    const obj = {};
    row.forEach((cell, i) => { obj[cols[i]] = cell.value; });
    return obj;
  });
}

/* ================================================================
   正規化
   ================================================================ */
function normalizePost(p) {
  return {
    thread_id:  Number(p.thread_id),
    post_num:   Number(p.post_num),
    user_id:    p.user_id || null,
    name:       p.name || null,
    posted_at:  p.posted_at || null,
    body:       p.body || null,
    is_nusi:    Number(p.is_nusi) || 0,
    ares_count: Number(p.ares_count) || 0
  };
}

function normalizeThread(t) {
  return {
    thread_id:  Number(t.thread_id),
    title:      t.title || null,
    updated_at: t.updated_at || null
  };
}

/* ================================================================
   日付範囲 → どちらのDBを使うか
   ================================================================ */
function classifyDateRange(fromISO, toISO) {
  const boundary = getBoundaryISO();
  return {
    needSupabase: !toISO  || toISO  > boundary,
    needTurso:    !fromISO || fromISO < boundary,
    boundary
  };
}

/* ================================================================
   Turso用ヘルパー
   ================================================================ */
const TURSO_POSTS_COLS = "thread_id,post_num,user_id,name,posted_at,body,is_nusi,ares_count";

async function tursoSearchPosts(col, word, fromISO, toISO, limit) {
  const sql = `SELECT ${TURSO_POSTS_COLS} FROM posts`
    + ` WHERE ${col} LIKE ? AND posted_at >= ? AND posted_at < ?`
    + ` ORDER BY posted_at DESC LIMIT ?`;
  return tursoQuery(sql, ["%" + word + "%", fromISO, toISO, limit || 300]);
}

async function tursoSearchPostsExact(col, word, fromISO, toISO, limit) {
  const sql = `SELECT ${TURSO_POSTS_COLS} FROM posts`
    + ` WHERE ${col} = ? AND posted_at >= ? AND posted_at < ?`
    + ` ORDER BY posted_at DESC LIMIT ?`;
  return tursoQuery(sql, [word, fromISO, toISO, limit || 300]);
}

async function tursoSearchPostsPrefix(col, prefix, fromISO, toISO, limit) {
  const safe = String(prefix).replace(/[%_\\]/g, m => "\\" + m);
  const sql = `SELECT ${TURSO_POSTS_COLS} FROM posts`
    + ` WHERE ${col} LIKE ? ESCAPE '\\' AND posted_at >= ? AND posted_at < ?`
    + ` ORDER BY posted_at DESC LIMIT ?`;
  return tursoQuery(sql, [safe + "%", fromISO, toISO, limit || 5000]);
}

async function tursoFetchThreadsByIds(ids) {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  return tursoQuery(
    `SELECT thread_id, title FROM threads WHERE thread_id IN (${ph})`, ids
  );
}

/* ================================================================
   安価カウント（キャッシュからのみ取得。ネットワークは aresObserver が担当）
   ================================================================ */
function countAresFromCache(tid, pnum) {
  const id = Number(tid);
  if (postsCache.has(id)) {
    const p = postsCache.get(id).find(x => x.post_num === pnum);
    if (p) return Number(p.ares_count) || 0;
  }
  return -1; // キャッシュに無い
}

/* ================================================================
   安価レス取得（全レスからbodyで >>N をパース。RPCは使わない）
   ================================================================ */
async function getAresPosts(tid, pnum) {
  const allPosts = await fetchAllPosts(tid);
  const re = /&gt;&gt;(\d+)|>>(\d+)/g;
  return allPosts.filter(p => {
    const body = p.body || "";
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body)) !== null) {
      const n = parseInt(m[1] || m[2], 10);
      if (n === pnum) return true;
    }
    return false;
  });
}

/* ================================================================
   スレッド全レス取得（デュアルDB）
   ================================================================ */
async function fetchAllPosts(threadId) {
  const id = Number(threadId);
  if (postsCache.has(id)) return postsCache.get(id);

  const promises = [
    sbFetch(
      `posts?select=${encodeURIComponent(TURSO_POSTS_COLS)}&thread_id=eq.${id}&order=post_num.asc&limit=2000`
    ).catch(() => [])
  ];

  if (threadNeedsTurso(id)) {
    promises.push(
      tursoQuery(
        `SELECT ${TURSO_POSTS_COLS} FROM posts WHERE thread_id = ? ORDER BY post_num ASC LIMIT 2000`,
        [id]
      ).then(rows => rows.map(normalizePost))
       .catch(() => [])
    );
  }

  const arrays = await Promise.all(promises);
  const sbPs    = arrays[0] || [];
  const tursoPs = arrays[1] || [];

  const map = new Map();
  tursoPs.forEach(p => map.set(p.post_num, p));
  sbPs.forEach(p => map.set(p.post_num, p));
  const merged = Array.from(map.values()).sort((a, b) => a.post_num - b.post_num);

  postsCache.set(id, merged);
  return merged;
}

/* ================================================================
   スレッド情報取得（デュアルDB）
   ================================================================ */
async function fetchThreadInfo(threadId) {
  const id = Number(threadId);
  if (threadCache.has(id)) return threadCache.get(id);

  const promises = [
    sbFetch(`threads?select=thread_id,title,updated_at&thread_id=eq.${id}&limit=1`).catch(() => [])
  ];

  if (threadNeedsTurso(id)) {
    promises.push(
      tursoQuery(`SELECT thread_id, title FROM threads WHERE thread_id = ? LIMIT 1`, [id])
        .then(rows => rows.map(normalizeThread))
        .catch(() => [])
    );
  }

  const arrays = await Promise.all(promises);
  const info = (arrays[0] && arrays[0][0])
    || (arrays[1] && arrays[1][0])
    || { thread_id: id, title: "スレッド " + id, updated_at: null };

  threadCache.set(id, info);
  return info;
}

/* ================================================================
   レス範囲取得（上100/下100用・デュアルDB）
   ================================================================ */
async function fetchPostsRange(tid, start, end) {
  const id = Number(tid);
  const promises = [
    sbFetch(
      `posts?select=${encodeURIComponent(TURSO_POSTS_COLS)}`
      + `&thread_id=eq.${id}&post_num=gte.${start}&post_num=lte.${end}&order=post_num.asc`
    ).catch(() => [])
  ];

  if (threadNeedsTurso(id)) {
    promises.push(
      tursoQuery(
        `SELECT ${TURSO_POSTS_COLS} FROM posts WHERE thread_id = ? AND post_num >= ? AND post_num <= ? ORDER BY post_num ASC`,
        [id, start, end]
      ).then(rows => rows.map(normalizePost))
       .catch(() => [])
    );
  }

  const arrays = await Promise.all(promises);
  const map = new Map();
  (arrays[1] || []).forEach(p => map.set(p.post_num, p));
  (arrays[0] || []).forEach(p => map.set(p.post_num, p));
  return Array.from(map.values()).sort((a, b) => a.post_num - b.post_num);
}
