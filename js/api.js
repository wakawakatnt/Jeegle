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
   Tursoレスポンス正規化
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
   日付範囲 → どちらのDBを使うか判定
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
   スレッド全レス取得（デュアルDB）
   ================================================================ */
async function fetchAllPosts(threadId) {
  const id = Number(threadId);
  if (postsCache.has(id)) return postsCache.get(id);

  const [sbPs, tursoPs] = await Promise.all([
    sbFetch(
      `posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&thread_id=eq.${id}&order=post_num.asc&limit=2000`
    ).catch(() => []),
    tursoQuery(
      `SELECT ${TURSO_POSTS_COLS} FROM posts WHERE thread_id = ? ORDER BY post_num ASC LIMIT 2000`,
      [id]
    ).catch(() => [])
  ]);

  const map = new Map();
  tursoPs.forEach(p => { const np = normalizePost(p); map.set(np.post_num, np); });
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

  const [sbArr, tursoArr] = await Promise.all([
    sbFetch(`threads?select=thread_id,title,updated_at&thread_id=eq.${id}&limit=1`).catch(() => []),
    tursoQuery(`SELECT thread_id, title FROM threads WHERE thread_id = ? LIMIT 1`, [id]).catch(() => [])
  ]);

  const info = sbArr[0]
    || (tursoArr[0] ? normalizeThread(tursoArr[0]) : null)
    || { thread_id: id, title: "スレッド " + id, updated_at: null };

  threadCache.set(id, info);
  return info;
}
