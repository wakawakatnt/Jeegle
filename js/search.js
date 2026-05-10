/* ================================================================
   内部実装: 1日分のみを処理（デュアルDB対応）
   ================================================================ */

async function searchTitleOneDay(q, mode, dr) {
  const ws = words(q);
  const { needSupabase, needTurso, boundary } = classifyDateRange(dr.from, dr.to);

  let allThreads = [];

  // --- Supabase 側 ---
  if (needSupabase) {
    const sbFrom = dr.from < boundary ? boundary : dr.from;
    const sbTo = dr.to;
    let threads;
    if (mode === "or" && ws.length > 1) {
      const sets = await Promise.all(ws.map(w =>
        sbFetch(`threads?select=thread_id,title,updated_at&limit=200&title=ilike.${enc(w)}&updated_at=gte.${sbFrom}&updated_at=lt.${sbTo}`)
      ));
      const map = new Map();
      sets.flat().forEach(t => map.set(t.thread_id, t));
      threads = Array.from(map.values());
    } else {
      let qstr = `threads?select=thread_id,title,updated_at&limit=200&order=updated_at.desc`;
      ws.forEach(w => { qstr += `&title=ilike.${enc(w)}`; });
      qstr += `&updated_at=gte.${sbFrom}&updated_at=lt.${sbTo}`;
      threads = await sbFetch(qstr);
      if (mode === "and" && ws.length > 1)
        threads = threads.filter(t => ws.every(w => (t.title || "").toLowerCase().includes(w.toLowerCase())));
    }
    allThreads.push(...threads);
  }

  // --- Turso 側 ---
  if (needTurso) {
    try {
      const tursoTo = dr.to > boundary ? boundary : dr.to;
      let tursoThreads;
      if (mode === "or" && ws.length > 1) {
        const conditions = ws.map(() => "title LIKE ?").join(" OR ");
        const args = ws.map(w => "%" + w + "%");
        const sql = `SELECT thread_id, title FROM threads WHERE (${conditions}) LIMIT 200`;
        tursoThreads = await tursoQuery(sql, args);
      } else {
        // AND / default: 最初の語でLIKE検索し、クライアントでANDフィルタ
        const sql = `SELECT thread_id, title FROM threads WHERE title LIKE ? LIMIT 200`;
        tursoThreads = await tursoQuery(sql, ["%" + ws[0] + "%"]);
        if (mode === "and" && ws.length > 1) {
          tursoThreads = tursoThreads.filter(t =>
            ws.every(w => (t.title || "").toLowerCase().includes(w.toLowerCase()))
          );
        }
      }
      // updated_at がTursoのthreadsにない場合のフォールバック
      tursoThreads.forEach(t => {
        t.thread_id = Number(t.thread_id);
        if (!t.updated_at) t.updated_at = null;
      });
      allThreads.push(...tursoThreads);
    } catch (e) {
      console.warn("[Jeegle] Turso title search failed:", e);
    }
  }

  // 重複排除
  const map = new Map();
  allThreads.forEach(t => {
    if (!map.has(t.thread_id)) map.set(t.thread_id, t);
    else {
      const ex = map.get(t.thread_id);
      if (t.updated_at && (!ex.updated_at || t.updated_at > ex.updated_at)) ex.updated_at = t.updated_at;
    }
  });

  return Array.from(map.values()).map(t => ({
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
  const { needSupabase, needTurso, boundary } = classifyDateRange(dr.from, dr.to);

  let allPosts = [];

  // --- ID検索 ---
  if (idm) {
    const idVal = idm[1].trim();
    if (needSupabase) {
      const sbFrom = dr.from < boundary ? boundary : dr.from;
      const ps = await sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=500&user_id=ilike.${enc(idVal)}&order=posted_at.desc&posted_at=gte.${sbFrom}&posted_at=lt.${dr.to}`);
      allPosts.push(...ps);
    }
    if (needTurso) {
      try {
        const tursoTo = dr.to > boundary ? boundary : dr.to;
        const sql = `SELECT ${tursoPostsSelect()} FROM posts WHERE user_id LIKE ? AND posted_at >= ? AND posted_at < ? ORDER BY posted_at DESC LIMIT 500`;
        const tp = await tursoQuery(sql, ["%" + idVal + "%", dr.from, tursoTo]);
        allPosts.push(...tp.map(normalizePost));
      } catch (e) { console.warn("[Jeegle] Turso ID search failed:", e); }
    }
    // 重複排除
    const seen = new Map();
    allPosts.forEach(p => { const k = p.thread_id + "_" + p.post_num; if (!seen.has(k)) seen.set(k, p); });
    return groupPosts(Array.from(seen.values()));
  }

  // --- 通常の本文検索 ---
  if (needSupabase) {
    const sbFrom = dr.from < boundary ? boundary : dr.from;
    const df = `&posted_at=gte.${sbFrom}&posted_at=lt.${dr.to}`;

    if (mode === "or" && ws.length > 1) {
      const fetches = ws.flatMap(w => [
        sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&body=ilike.${enc(w)}&order=posted_at.desc${df}`),
        sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&name=ilike.${enc(w)}&order=posted_at.desc${df}`),
        sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&user_id=ilike.${enc(w)}&order=posted_at.desc${df}`),
      ]);
      (await Promise.all(fetches)).flat().forEach(p => allPosts.push(p));
    } else {
      const w0 = ws[0];
      const [bp, np, ip] = await Promise.all([
        sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&body=ilike.${enc(w0)}&order=posted_at.desc${df}`),
        sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&name=ilike.${enc(w0)}&order=posted_at.desc${df}`),
        sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&user_id=ilike.${enc(w0)}&order=posted_at.desc${df}`),
      ]);
      allPosts.push(...bp, ...np, ...ip);
    }
  }

  // --- Turso 側 ---
  if (needTurso) {
    try {
      const tursoTo = dr.to > boundary ? boundary : dr.to;
      if (mode === "or" && ws.length > 1) {
        const tursoFetches = ws.flatMap(w => [
          tursoSearchPosts("body",    w, dr.from, tursoTo, 300),
          tursoSearchPosts("name",    w, dr.from, tursoTo, 300),
          tursoSearchPosts("user_id", w, dr.from, tursoTo, 300),
        ]);
        (await Promise.all(tursoFetches)).flat().forEach(p => allPosts.push(normalizePost(p)));
      } else {
        const w0 = ws[0];
        const [tbp, tnp, tip] = await Promise.all([
          tursoSearchPosts("body",    w0, dr.from, tursoTo, 300),
          tursoSearchPosts("name",    w0, dr.from, tursoTo, 300),
          tursoSearchPosts("user_id", w0, dr.from, tursoTo, 300),
        ]);
        [...tbp, ...tnp, ...tip].forEach(p => allPosts.push(normalizePost(p)));
      }
    } catch (e) {
      console.warn("[Jeegle] Turso body search failed:", e);
    }
  }

  // 重複排除
  const map = new Map();
  allPosts.forEach(p => map.set(`${p.thread_id}_${p.post_num}`, p));
  let all = Array.from(map.values());

  // ANDフィルタ
  if (mode === "and" && ws.length > 1) {
    all = all.filter(p => {
      const t = ((p.body || "") + " " + (p.name || "") + " " + (p.user_id || "")).toLowerCase();
      return ws.every(w => t.includes(w.toLowerCase()));
    });
  }

  return groupPosts(all);
}
