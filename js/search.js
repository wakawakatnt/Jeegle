"use strict";

let currentResults = [];
let currentKeyword = "";
let lastSegmentTimings = [];

/* ID検索: 検索した元ID（生の値）と、追加表示中ID集合（正規化キーで保持）*/
let searchedId = null;
let activeIdSet = new Set();

/* IDの正規化: ドット(.)を除去。'7x.z2.L90' と '7xz2L90' を同一とみなす */
function normId(id) {
  return String(id || "").replace(/\./g, "");
}

/* 正規化後の文字数で「4文字かどうか」を判定 */
function isLen4(id) {
  return normId(id).length === 4;
}

/* 正規化後の前方2文字（DB前方一致検索用）*/
function idPrefix2(id) {
  const s = normId(id);
  return s.length >= 2 ? s.slice(0, 2) : s;
}

/* ===== id:プレフィックス解析 ===== */
function parseIdPrefix(q) {
  const m = String(q).match(/^id:\s*(.+)/i);
  if (m) return { isId: true, value: m[1].trim() };
  return { isId: false, value: String(q).trim() };
}

/* ===== メイン検索 ===== */
async function doSearch(q, opts) {
  opts = opts || {};
  if (q === undefined) q = document.getElementById("topInput").value.trim();
  q = String(q).trim();
  if (!q) return;
  currentKeyword = q;

  const idp = parseIdPrefix(q);

  /* ID検索の表示状態をリセット。URL復元時は復元分を集合に入れる */
  searchedId = idp.isId ? idp.value : null;
  activeIdSet = new Set();
  if (opts.restoreActiveIds && opts.restoreActiveIds.length) {
    opts.restoreActiveIds.forEach(id => activeIdSet.add(normId(id)));
  }

  /* id:プレフィックスならデフォルトで検索範囲ラジオを id に切り替える。
     ただし手動でラジオ変更(userTypeChange)や履歴復元(fromHistory)では尊重する */
  if (idp.isId && !opts.userTypeChange && !opts.fromHistory) {
    const idRadio = document.querySelector('input[name="searchType"][value="id"]');
    if (idRadio && !idRadio.checked) idRadio.checked = true;
  }

  if (!opts.fromHistory) pushUrl(q);

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

  lastSegmentTimings = [];

  try {
    let results;
    if (stype === "title") {
      results = await searchTitle(q, smode, dr);
    } else if (stype === "all") {
      const [tr, br] = await Promise.all([
        searchTitle(q, smode, dr),
        searchPosts(q, smode, dr, "all")
      ]);
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
    } else {
      results = await searchPosts(q, smode, dr, stype);
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

/** 日付フィルター文字列生成（Supabase用） */
function dateFilter(dr, col) {
  return `&${col}=gte.${dr.from}&${col}=lt.${dr.to}`;
}

/* ================================================================
   検索範囲(searchType) → 投げるカラム配列
   ================================================================ */
function colsForType(stype) {
  switch (stype) {
    case "body": return ["body"];
    case "name": return ["name"];
    case "id":   return ["user_id"];
    case "all":
    default:     return ["body", "name", "user_id"];
  }
}

/* ================================================================
   セグメント計測ヘルパー
   ================================================================ */
function segLabel(seg) {
  const f = new Date(seg.from);
  const t = new Date(new Date(seg.to).getTime() - 1);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const fl = fmt(f), tl = fmt(t);
  return (fl === tl) ? fl : `${fl}〜${tl}`;
}

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
   公開API: タイトル検索
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

/* ================================================================
   公開API: レス検索
   ================================================================ */
async function searchPosts(q, mode, dr, stype) {
  const segs = splitDateRangeByDay(dr);
  const parts = await runAllSegments(segs, "posts", seg => searchPostsOneDay(q, mode, seg, stype));

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
   内部実装: タイトル1セグメント
   ================================================================ */
async function searchTitleOneDay(q, mode, dr) {
  const ws = words(parseIdPrefix(q).value);
  const { needSupabase, needTurso, boundary } = classifyDateRange(dr.from, dr.to);

  const promises = [];

  if (needSupabase) {
    const sbFrom = (dr.from < boundary) ? boundary : dr.from;
    const sbTo   = dr.to;
    const sbDr   = { from: sbFrom, to: sbTo };

    promises.push((async () => {
      let threads;
      if (mode === "or" && ws.length > 1) {
        const sets = await Promise.all(ws.map(w =>
          sbFetch(`threads?select=thread_id,title,updated_at&limit=200&title=ilike.${enc(w)}${dateFilter(sbDr, "updated_at")}`)
        ));
        const m = new Map();
        sets.flat().forEach(t => m.set(t.thread_id, t));
        threads = Array.from(m.values());
      } else {
        let qstr = `threads?select=thread_id,title,updated_at&limit=200&order=updated_at.desc`;
        ws.forEach(w => { qstr += `&title=ilike.${enc(w)}`; });
        qstr += dateFilter(sbDr, "updated_at");
        threads = await sbFetch(qstr);
        if (mode === "and" && ws.length > 1)
          threads = threads.filter(t => ws.every(w => (t.title || "").toLowerCase().includes(w.toLowerCase())));
      }
      return threads;
    })());
  }

  if (needTurso) {
    promises.push((async () => {
      try {
        let tursoThreads;
        if (mode === "or" && ws.length > 1) {
          const conds = ws.map(() => "title LIKE ?").join(" OR ");
          const args  = ws.map(w => "%" + w + "%");
          tursoThreads = await tursoQuery(
            `SELECT thread_id, title FROM threads WHERE (${conds}) LIMIT 200`, args
          );
        } else {
          tursoThreads = await tursoQuery(
            `SELECT thread_id, title FROM threads WHERE title LIKE ? LIMIT 200`,
            ["%" + ws[0] + "%"]
          );
          if (mode === "and" && ws.length > 1)
            tursoThreads = tursoThreads.filter(t =>
              ws.every(w => (t.title || "").toLowerCase().includes(w.toLowerCase()))
            );
        }
        return tursoThreads.map(normalizeThread);
      } catch (e) {
        console.warn("[Jeegle] Turso title search error:", e);
        return [];
      }
    })());
  }

  const arrays = await Promise.all(promises);
  const all = arrays.flat();

  const map = new Map();
  all.forEach(t => {
    const id = Number(t.thread_id);
    if (!map.has(id)) { map.set(id, t); }
    else {
      const ex = map.get(id);
      if (t.updated_at && (!ex.updated_at || t.updated_at > ex.updated_at)) ex.updated_at = t.updated_at;
    }
  });

  return Array.from(map.values()).map(t => ({
    thread_id:    Number(t.thread_id),
    title:        t.title,
    updated_at:   t.updated_at || null,
    matchedPosts: [],
    titleMatch:   true
  }));
}

/* ================================================================
   内部実装: レス1セグメント
   stype: "all" | "body" | "name" | "id"
   ================================================================ */
async function searchPostsOneDay(q, mode, dr, stype) {
  const idp = parseIdPrefix(q);
  const searchValue = idp.value;
  const cols = colsForType(stype);

  const isIdSearch = (stype === "id");

  /* ID検索のときは「正規化後の前方2文字」で前方一致検索 */
  let ws;
  if (isIdSearch) {
    ws = [idPrefix2(searchValue)];
  } else {
    ws = words(searchValue);
  }

  const { needSupabase, needTurso, boundary } = classifyDateRange(dr.from, dr.to);
  const SB_SELECT = "thread_id,post_num,user_id,name,posted_at,body,is_nusi,ares_count";

  /* ID検索の取得上限（前方一致で多数ヒットするため大きめ）*/
  const ID_LIMIT = 5000;

  const promises = [];

  /* ---------- Supabase ---------- */
  if (needSupabase) {
    const sbFrom = (dr.from < boundary) ? boundary : dr.from;
    const df = `&posted_at=gte.${sbFrom}&posted_at=lt.${dr.to}`;

    const sbCond = (col, w) => isIdSearch
      ? `${col}=like.${encodeURIComponent(w + "*")}`
      : `${col}=ilike.${enc(w)}`;

    const sbLimit = isIdSearch ? ID_LIMIT : 300;

    if (mode === "or" && ws.length > 1) {
      promises.push((async () => {
        const fetches = ws.flatMap(w =>
          cols.map(col =>
            sbFetch(`posts?select=${encodeURIComponent(SB_SELECT)}&limit=${sbLimit}&${sbCond(col, w)}&order=posted_at.desc${df}`)
          )
        );
        return (await Promise.all(fetches)).flat();
      })());
    } else {
      promises.push((async () => {
        const w0 = ws[0];
        const fetches = cols.map(col =>
          sbFetch(`posts?select=${encodeURIComponent(SB_SELECT)}&limit=${sbLimit}&${sbCond(col, w0)}&order=posted_at.desc${df}`)
        );
        return (await Promise.all(fetches)).flat();
      })());
    }
  }

  /* ---------- Turso ---------- */
  if (needTurso) {
    const tursoTo = (dr.to > boundary) ? boundary : dr.to;
    const tFrom   = dr.from;
    const tLimit  = isIdSearch ? ID_LIMIT : 300;

    if (mode === "or" && ws.length > 1) {
      promises.push((async () => {
        try {
          const fetches = ws.flatMap(w =>
            cols.map(col => isIdSearch
              ? tursoSearchPostsPrefix(col, w, tFrom, tursoTo, tLimit)
              : tursoSearchPosts(col, w, tFrom, tursoTo, 300))
          );
          return (await Promise.all(fetches)).flat().map(normalizePost);
        } catch (e) {
          console.warn("[Jeegle] Turso posts OR error:", e);
          return [];
        }
      })());
    } else {
      promises.push((async () => {
        try {
          const w0 = ws[0];
          const fetches = cols.map(col => isIdSearch
            ? tursoSearchPostsPrefix(col, w0, tFrom, tursoTo, tLimit)
            : tursoSearchPosts(col, w0, tFrom, tursoTo, 300));
          return (await Promise.all(fetches)).flat().map(normalizePost);
        } catch (e) {
          console.warn("[Jeegle] Turso posts error:", e);
          return [];
        }
      })());
    }
  }

  const arrays = await Promise.all(promises);
  const map = new Map();
  arrays.flat().forEach(p => map.set(`${p.thread_id}_${p.post_num}`, p));
  let all = Array.from(map.values());

  if (!isIdSearch && mode === "and" && ws.length > 1) {
    all = all.filter(p => {
      const parts = cols.map(col => {
        if (col === "body")    return p.body || "";
        if (col === "name")    return p.name || "";
        if (col === "user_id") return p.user_id || "";
        return "";
      });
      const t = parts.join(" ").toLowerCase();
      return ws.every(w => t.includes(w.toLowerCase()));
    });
  }

  return groupPosts(all);
}

/* ================================================================
   groupPosts
   ================================================================ */
async function groupPosts(posts) {
  if (!posts.length) return [];
  const tids = [...new Set(posts.map(p => Number(p.thread_id)))];

  const uncached = tids.filter(id => !threadCache.has(id));
  if (uncached.length > 0) {
    const sbPromises = [];
    for (let i = 0; i < uncached.length; i += 20) {
      const batch = uncached.slice(i, i + 20);
      sbPromises.push(
        sbFetch(`threads?select=thread_id,title,updated_at&thread_id=in.(${batch.join(",")})`)
          .catch(() => [])
      );
    }

    const tursoIds = uncached.filter(id => threadNeedsTurso(id));

    const [sbAll, tursoAll] = await Promise.all([
      Promise.all(sbPromises).then(a => a.flat()),
      tursoIds.length ? tursoFetchThreadsByIds(tursoIds).catch(() => []) : Promise.resolve([])
    ]);

    tursoAll.forEach(t => {
      const id = Number(t.thread_id);
      if (!threadCache.has(id)) threadCache.set(id, normalizeThread(t));
    });
    sbAll.forEach(t => threadCache.set(t.thread_id, t));
  }

  const map = new Map();
  posts.forEach(p => {
    const tid = Number(p.thread_id);
    if (!map.has(tid)) {
      const t = threadCache.get(tid) || {};
      map.set(tid, {
        thread_id:    tid,
        title:        t.title || "スレッド " + tid,
        updated_at:   t.updated_at || p.posted_at,
        matchedPosts: [],
        titleMatch:   false
      });
    }
    map.get(tid).matchedPosts.push(p);
  });
  map.forEach(r => r.matchedPosts.sort((a, b) => a.post_num - b.post_num));
  return Array.from(map.values());
}
