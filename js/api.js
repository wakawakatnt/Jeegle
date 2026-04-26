"use strict";

/* ===== キャッシュ ===== */
const postsCache  = new Map();
const threadCache = new Map();

/* ===== 汎用Supabase通信 ===== */
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

/* ===== スレッド全レス取得 ===== */
async function fetchAllPosts(threadId) {
  const id = Number(threadId);
  if (postsCache.has(id)) return postsCache.get(id);
  const ps = await sbFetch(
    `posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&thread_id=eq.${id}&order=post_num.asc&limit=2000`
  );
  postsCache.set(id, ps);
  return ps;
}

/* ===== スレッド情報取得 ===== */
async function fetchThreadInfo(threadId) {
  const id = Number(threadId);
  if (threadCache.has(id)) return threadCache.get(id);
  const arr = await sbFetch(`threads?select=thread_id,title,updated_at&thread_id=eq.${id}&limit=1`);
  const info = arr[0] || { thread_id: id, title: "スレッド " + id, updated_at: null };
  threadCache.set(id, info);
  return info;
}
