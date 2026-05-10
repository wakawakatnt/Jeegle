"use strict";

/* ===== キャッシュ ===== */
const postsCache  = new Map();
const threadCache = new Map();

/* ================================================================
   境界日時
   ================================================================ */
function getBoundaryISO() {
  const d = new Date();
  d.setDate(d.getDate() - BOUNDARY_DAYS);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** thread_id（Unixtime秒）から、そのスレが境界より古いかを判定 */
function threadNeedsTurso(threadId) {
  const boundaryUnix = (Date.now() - BOUNDARY_DAYS * 86400000) / 1000;
  return Number(threadId) < boundaryUnix;
}

/** thread_id（Unixtime秒）から、そのスレが境界内かを判定 */
function threadNeedsSupabase(threadId) {
  const boundaryUnix = (Date.now() - BOUNDARY_DAYS * 86400000) / 1000;
  // スレ立ては古くても最新レスがSupabase側にある可能性があるので
  // 境界から2日分のマージンを持たせる
  return Number(threadId) >= boundaryUnix - 2 * 86400;
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

/** Supabase RPC呼び出し（安全版: エラー時null返却） */
async function sbRpc(funcName, params) {
  const r = await fetch(SB_URL + "/rest/v1/rpc/" + funcName, {
    method: "POST",
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + SB_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(params)
  });
  if (!r.ok) return null;
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
    thread_id: Number(p.thread_id),
    post_num:  Number(p.post_num),
    user_id:   p.user_id || null,
    name:      p.name || null,
    posted_at: p.posted_at || null,
    body:      p.body || null,
    is_nusi:   Number(p.is_nusi) || 0
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
const TURSO_POSTS_COLS = "thread_id,post_num,user_id,name,posted_at,body,is_nusi";

async function tursoSearchPosts(col, word, fromISO, toISO, limit) {
  const sql = `SELECT ${TURSO_POSTS_COLS} FROM posts`
    + ` WHERE ${col} LIKE ? AND posted_at >= ? AND posted_at < ?`
    + ` ORDER BY posted_at DESC LIMIT ?`;
  return tursoQuery(sql, ["%" + word + "%", fromISO, toISO, limit || 300]);
}

async function tursoFetchThreadsByIds(ids) {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  return tursoQuery(
    `SELECT thread_id, title FROM threads WHERE thread_id IN (${ph})`, ids
  );
}

/* ================================================================
   安価カウント（デュアルDB対応）
   ================================================================ */
async function countAres(tid, pnum) {
  const id = Number(tid);
  const promises = [];

  /* Supabase RPC */
  promises.push(
    sbRpc("count_ares", { tid: id, pnum: pnum })
      .then(v => (typeof v === "number") ? v : 0)
      .catch(() => 0)
  );

  /* Turso: スレが古い場合 */
  if (threadNeedsTurso(id)) {
    promises.push(
      tursoQuery(
        `SELECT COUNT(*) as cnt FROM posts WHERE thread_id = ? AND body LIKE ?`,
        [id, "%>>" + pnum + "%"]
      ).then(rows => (rows[0] && Number(rows[0].cnt)) || 0)
       .catch(() => 0)
    );
  }

  const counts = await Promise.all(promises);
  return counts.reduce((a, b) => a + b, 0);
}

/* ================================================================
   安価レス取得（デュアルDB対応）
   ================================================================ */
async function getAresPosts(tid, pnum) {
  const id = Number(tid);
  const promises = [];

  /* Supabase RPC */
  promises.push(
    sbRpc("get_ares_posts", { tid: id, pnum: pnum })
      .then(v => Array.isArray(v) ? v : [])
      .catch(() => [])
  );

  /* Turso: スレが古い場合 */
  if (threadNeedsTurso(id)) {
    promises.push(
      tursoQuery(
        `SELECT ${TURSO_POSTS_COLS} FROM posts WHERE thread_id = ? AND body LIKE ? ORDER BY post_num ASC`,
        [id, "%>>" + pnum + "%"]
      ).then(rows => rows.map(normalizePost))
       .catch(() => [])
    );
  }

  const arrays = await Promise.all(promises);
  const all = arrays.flat();

  /* 重複排除（Supabase優先） */
  const map = new Map();
  all.forEach(p => {
    const k = p.thread_id + "_" + p.post_num;
    if (!map.has(k)) map.set(k, p);
  });
  return Array.from(map.values()).sort((a, b) => a.post_num - b.post_num);
}

/* ================================================================
   スレッド全レス取得（デュアルDB）
   ================================================================ */
async function fetchAllPosts(threadId) {
  const id = Number(threadId);
  if (postsCache.has(id)) return postsCache.get(id);

  const promises = [];

  /* Supabase: 常に試行（最新レスがある可能性） */
  promises.push(
    sbFetch(
      `posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&thread_id=eq.${id}&order=post_num.asc&limit=2000`
    ).catch(() => [])
  );

  /* Turso: スレのthread_id(unixtime)が14日より前なら取得 */
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

  /* マージ（Supabase優先） */
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
  const sbArr    = arrays[0] || [];
  const tursoArr = arrays[1] || [];

  const info = sbArr[0]
    || tursoArr[0]
    || { thread_id: id, title: "スレッド " + id, updated_at: null };

  threadCache.set(id, info);
  return info;
}

/* ================================================================
   レス範囲取得（上100/下100用・デュアルDB）
   ================================================================ */
async function fetchPostsRange(tid, start, end) {
  const id = Number(tid);
  const promises = [];

  promises.push(
    sbFetch(
      `posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi`
      + `&thread_id=eq.${id}&post_num=gte.${start}&post_num=lte.${end}&order=post_num.asc`
    ).catch(() => [])
  );

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
