"use strict";

let currentResults = [];
let currentKeyword = "";
let lastSegmentTimings = []; // 日付ごとの応答時間・エラー情報

/* ===== メイン検索 ===== */
async function doSearch(q) {
  if (q === undefined) q = document.getElementById("topInput").value.trim();
  q = String(q).trim();
  if (!q) return;
  currentKeyword = q;
  pushUrl(q);

  document.getElementById("topPage").classList.add("hidden");
  document.getElementById("resultPage").classList.add("active");
  document.getElementById("threadDetailPage").classList.remove("active");
  document.getElementById("resultInput").value = q;
  document.getElementById("detailInput").value = q;

  const res = document.getElementById("results");
  mkLoading(res, "検索中…");
  document.getElementById("resultStats").textContent = "";
  document.getElementById("searchSummary").style.display = "none";
  document.getElementById("sortBar").classList.remove("visible");

  const stype = document.querySelector('input[name="searchType"]:checked').value;
  const smode = document.querySelector('input[name="searchMode"]:checked').value;
  const dr    = getDateRange();
  const t0    = performance.now();

  // 計測バッファをリセット
  lastSegmentTimings = [];

  try {
    let results;
    if (stype === "title") {
      results = await searchTitle(q, smode, dr);
    } else if (stype === "body") {
      results = await searchBody(q, smode, dr);
    } else {
      const [tr, br] = await Promise.all([searchTitle(q, smode, dr), searchBody(q, smode, dr)]);
      const map = new Map();
      tr.forEach(r => map.set(r.thread_id, r));
      br.forEach(r => {
        if (map.has(r.thread_id)) {
          const ex = map.get(r.thread_id);
          const nums = new Set(ex.matchedPosts.map(p => p.post_num));
          r.matchedPosts.forEach(p => { if (!nums.has(p.post_num)) ex.matchedPosts.push(p); });
          ex.matchedPosts.sort((a, b) => a.post_num - b.post_num);
        } else { map.set(r.thread_id, r); }
      });
      results = Array.from(map.values());
    }
    currentResults = results;
    renderAll(q, ((performance.now() - t0) / 1000).toFixed(2));
  } catch (e) {
    res.innerHTML = "";
    const d = document.createElement("div");
    d.className = "no-results";
    let msg = "エラー: " + e.message;
    const failed = lastSegmentTimings.filter(t => !t.ok);
    if (failed.length) {
      msg += "\n失敗した日付: " + failed.map(f => `${f.label}(${f.kind}) ${f.ms}ms ${f.error}`).join(" / ");
    }
    setText(d, msg);
    d.style.whiteSpace = "pre-wrap";
    res.appendChild(d);
  }
}

/** 日付フィルター文字列生成 */
function dateFilter(dr, col) {
  return `&${col}=gte.${dr.from}&${col}=lt.${dr.to}`;
}

/* ================================================================
   セグメント計測ヘルパー
   ================================================================ */

/** セグメントを「YYYY-MM-DD」形式のラベルにする */
function segLabel(seg) {
  const f = new Date(seg.from);
  const t = new Date(new Date(seg.to).getTime() - 1);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const fl = fmt(f), tl = fmt(t);
  return (fl === tl) ? fl : `${fl}〜${tl}`;
}

/** 1セグメントを計測しつつ実行。失敗時は日付付きエラーをthrow */
async function runSegment(label, kind, fn) {
  const t0 = performance.now();
  try {
    const r = await fn();
    const ms = +(performance.now() - t0).toFixed(1);
    lastSegmentTimings.push({ label, kind, ms, ok: true, count: Array.isArray(r) ? r.length : null });
    return r;
  } catch (e) {
    const ms = +(performance.now() - t0).toFixed(1);
    lastSegmentTimings.push({ label, kind, ms, ok: false, error: e.message });
    const wrapped = new Error(`[${kind} ${label}] ${e.message}`);
    wrapped.segLabel = label;
    wrapped.kind = kind;
    wrapped.original = e;
    throw wrapped;
  }
}

/** 全セグメントを並列実行。部分失敗は許容、全滅時はthrow */
async function runAllSegments(segs, kind, runner) {
  const settled = await Promise.allSettled(
    segs.map(seg => runSegment(segLabel(seg), kind, () => runner(seg)))
  );
  const oks   = settled.filter(s => s.status === "fulfilled").map(s => s.value);
  const fails = settled.filter(s => s.status === "rejected").map(s => s.reason);

  if (fails.length === segs.length) {
    throw new Error("全セグメント失敗: " + fails.map(f => f.message).join(" / "));
  }
  if (fails.length > 0) {
    console.warn(`[Jeegle] ${fails.length}/${segs.length} セグメント失敗:`, fails);
  }
  return oks;
}

/* ================================================================
   公開API: 日ごとに分割して並列実行 → マージ
   ================================================================ */

async function searchTitle(q, mode, dr) {
  const segs = splitDateRangeByDay(dr);
  const parts = await runAllSegments(segs, "title", seg => searchTitleOneDay(q, mode, seg));
  const map = new Map();
  parts.flat().forEach(r => {
    if (!map.has(r.thread_id)) {
      map.set(r.thread_id, r);
    } else {
      const ex = map.get(r.thread_id);
      if (r.updated_at && (!ex.updated_at || r.updated_at > ex.updated_at)) {
        ex.updated_at = r.updated_at;
      }
    }
  });
  return Array.from(map.values());
}

async function searchBody(q, mode, dr) {
  const segs = splitDateRangeByDay(dr);
  const parts = await runAllSegments(segs, "body", seg => searchBodyOneDay(q, mode, seg));

  const tmap = new Map();
  parts.flat().forEach(r => {
    if (!tmap.has(r.thread_id)) {
      tmap.set(r.thread_id, {
        thread_id: r.thread_id,
        title: r.title,
        updated_at: r.updated_at,
        matchedPosts: [...r.matchedPosts],
        titleMatch: r.titleMatch
      });
    } else {
      const ex = tmap.get(r.thread_id);
      const seen = new Set(ex.matchedPosts.map(p => p.post_num));
      r.matchedPosts.forEach(p => { if (!seen.has(p.post_num)) ex.matchedPosts.push(p); });
      if (r.updated_at && (!ex.updated_at || r.updated_at > ex.updated_at)) {
        ex.updated_at = r.updated_at;
      }
    }
  });
  tmap.forEach(r => r.matchedPosts.sort((a, b) => a.post_num - b.post_num));
  return Array.from(tmap.values());
}

/* ================================================================
   内部実装: 1日分のみを処理
   ================================================================ */

async function searchTitleOneDay(q, mode, dr) {
  const ws = words(q);
  let threads;
  if (mode === "or" && ws.length > 1) {
    const sets = await Promise.all(ws.map(w =>
      sbFetch(`threads?select=thread_id,title,updated_at&limit=200&title=ilike.${enc(w)}${dateFilter(dr, "updated_at")}`)
    ));
    const map = new Map();
    sets.flat().forEach(t => map.set(t.thread_id, t));
    threads = Array.from(map.values());
  } else {
    let qstr = `threads?select=thread_id,title,updated_at&limit=200&order=updated_at.desc`;
    ws.forEach(w => { qstr += `&title=ilike.${enc(w)}`; });
    qstr += dateFilter(dr, "updated_at");
    threads = await sbFetch(qstr);
    if (mode === "and" && ws.length > 1)
      threads = threads.filter(t => ws.every(w => (t.title || "").toLowerCase().includes(w.toLowerCase())));
  }
  return threads.map(t => ({
    thread_id: t.thread_id,
    title: t.title,
    updated_at: t.updated_at,
    matchedPosts: [],
    titleMatch: true
  }));
}

async function searchBodyOneDay(q, mode, dr) {
  const ws = words(q);
  const idm = q.match(/^id:\s*(.+)/i);
  if (idm) {
    const ps = await sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=500&user_id=ilike.${enc(idm[1].trim())}&order=posted_at.desc${dateFilter(dr, "posted_at")}`);
    return groupPosts(ps);
  }
  let all = [];
  if (mode === "or" && ws.length > 1) {
    const fetches = ws.flatMap(w => [
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&body=ilike.${enc(w)}&order=posted_at.desc${dateFilter(dr, "posted_at")}`),
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&name=ilike.${enc(w)}&order=posted_at.desc${dateFilter(dr, "posted_at")}`),
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&user_id=ilike.${enc(w)}&order=posted_at.desc${dateFilter(dr, "posted_at")}`),
    ]);
    const map = new Map();
    (await Promise.all(fetches)).flat().forEach(p => map.set(`${p.thread_id}_${p.post_num}`, p));
    all = Array.from(map.values());
  } else {
    const w0 = ws[0];
    const df = dateFilter(dr, "posted_at");
    const [bp, np, ip] = await Promise.all([
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&body=ilike.${enc(w0)}&order=posted_at.desc${df}`),
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&name=ilike.${enc(w0)}&order=posted_at.desc${df}`),
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&user_id=ilike.${enc(w0)}&order=posted_at.desc${df}`),
    ]);
    const map = new Map();
    [...bp, ...np, ...ip].forEach(p => map.set(`${p.thread_id}_${p.post_num}`, p));
    all = Array.from(map.values());
    if (mode === "and" && ws.length > 1)
      all = all.filter(p => {
        const t = ((p.body || "") + " " + (p.name || "") + " " + (p.user_id || "")).toLowerCase();
        return ws.every(w => t.includes(w.toLowerCase()));
      });
  }
  return groupPosts(all);
}

async function groupPosts(posts) {
  if (!posts.length) return [];
  const tids = [...new Set(posts.map(p => p.thread_id))];
  for (let i = 0; i < tids.length; i += 20) {
    const batch = tids.slice(i, i + 20);
    const ts = await sbFetch(`threads?select=thread_id,title,updated_at&thread_id=in.(${batch.join(",")})`);
    ts.forEach(t => threadCache.set(t.thread_id, t));
  }
  const map = new Map();
  posts.forEach(p => {
    if (!map.has(p.thread_id)) {
      const t = threadCache.get(p.thread_id) || {};
      map.set(p.thread_id, { thread_id: p.thread_id, title: t.title || "スレッド " + p.thread_id, updated_at: t.updated_at || p.posted_at, matchedPosts: [], titleMatch: false });
    }
    map.get(p.thread_id).matchedPosts.push(p);
  });
  map.forEach(r => r.matchedPosts.sort((a, b) => a.post_num - b.post_num));
  return Array.from(map.values());
}
