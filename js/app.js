"use strict";

/* ===== キャッシュ ===== */
const postsCache  = new Map();
const threadCache = new Map();

let currentResults = [];
let currentKeyword = "";

/* ===== XSS対策 ===== */
function setText(el, s) { el.textContent = (s == null) ? "" : String(s); }

/* ===== 日時フォーマット (曜日付き) ===== */
function fmtDate(posted_at) {
  if (!posted_at) return "";
  const d = new Date(posted_at);
  if (isNaN(d.getTime())) return String(posted_at);
  const yy  = String(d.getFullYear()).slice(2).padStart(2,"0");
  const mo  = String(d.getMonth()+1).padStart(2,"0");
  const dy  = String(d.getDate()).padStart(2,"0");
  const dow = DAYS[d.getDay()];
  const hh  = String(d.getHours()).padStart(2,"0");
  const mi  = String(d.getMinutes()).padStart(2,"0");
  const ss  = String(d.getSeconds()).padStart(2,"0");
  return `${yy}/${mo}/${dy}(${dow}) ${hh}:${mi}:${ss}`;
}

/* ================================================================
   日付ユーティリティ
   ================================================================ */

/** YYMMDD形式の文字列を返す (例: "260422") */
function toYMD(date) {
  const yy = String(date.getFullYear()).slice(2).padStart(2,"0");
  const mm = String(date.getMonth()+1).padStart(2,"0");
  const dd = String(date.getDate()).padStart(2,"0");
  return yy + mm + dd;
}

/** YYMMDD文字列 → Dateオブジェクト (JST想定, 00:00:00) */
function fromYMD(s) {
  if (!s || s.length !== 6) return null;
  const yy = parseInt(s.slice(0,2),10);
  const mm = parseInt(s.slice(2,4),10) - 1;
  const dd = parseInt(s.slice(4,6),10);
  // 2000年代として扱う
  return new Date(2000+yy, mm, dd);
}

/** 今日 (ローカル時間 00:00:00) */
function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** n日前 */
function daysAgo(n) {
  const d = today();
  d.setDate(d.getDate() - n);
  return d;
}

/** 明日0時 (today + 1日) を返す — 「今日」の範囲の終端 */
function tomorrow() {
  const d = today();
  d.setDate(d.getDate() + 1);
  return d;
}

/** プリセット名 → { from: Date, to: Date } (to は翌日0時=exclusive) */
function presetToRange(preset) {
  switch(preset) {
    case "today":     return { from: today(),    to: tomorrow() };
    case "yesterday": {
      const y = daysAgo(1);
      return { from: y, to: today() };
    }
    case "3days":     return { from: daysAgo(2), to: tomorrow() };
    case "7days":     return { from: daysAgo(6), to: tomorrow() };
    default:          return null;
  }
}

/**
 * 現在のUI状態から日付範囲を取得
 * @returns {{ from: string, to: string, urlParam: string }}
 *   from/to は ISO文字列 (Supabase用), urlParam はURL用短縮文字列
 */
function getDateRange() {
  const preset = document.querySelector('input[name="dateRange"]:checked').value;

  if (preset === "custom") {
    const fv = document.getElementById("dateFrom").value; // "YYYY-MM-DD"
    const tv = document.getElementById("dateTo").value;
    if (!fv || !tv) {
      // 未入力の場合は7日にフォールバック
      const r = presetToRange("7days");
      return { from: r.from.toISOString(), to: r.to.toISOString(), urlParam: toYMD(r.from)+"-"+toYMD(daysAgo(-1)) };
    }
    const fd = new Date(fv + "T00:00:00");
    const td = new Date(tv + "T00:00:00");
    // to は指定日の翌日0時 (その日を含む)
    const tdNext = new Date(td); tdNext.setDate(tdNext.getDate()+1);
    return {
      from: fd.toISOString(),
      to:   tdNext.toISOString(),
      urlParam: toYMD(fd) + "-" + toYMD(td)
    };
  }

  const r = presetToRange(preset);
  if (!r) {
    const r7 = presetToRange("7days");
    return { from: r7.from.toISOString(), to: r7.to.toISOString(), urlParam: toYMD(r7.from)+"-"+toYMD(today()) };
  }
  // 単日プリセット (today/yesterday) は1日分のYYMMDD, 複数日は範囲
  const fromYmd = toYMD(r.from);
  const toYmd   = toYMD(new Date(r.to.getTime() - 86400000)); // exclusive→inclusive
  const urlP = (fromYmd === toYmd) ? fromYmd : fromYmd + "-" + toYmd;
  return { from: r.from.toISOString(), to: r.to.toISOString(), urlParam: urlP };
}

/**
 * URLのdパラメータからUIを復元
 * @param {string} dParam "260416-260422" or "260422"
 */
function applyDateParam(dParam) {
  if (!dParam) {
    // dパラメータなし → デフォルト7日
    const el = document.querySelector('input[name="dateRange"][value="7days"]');
    if (el) el.checked = true;
    document.getElementById("dateCustomGroup").style.display = "none";
    return;
  }

  const parts = dParam.split("-");
  const fromD = fromYMD(parts[0]);
  const toD   = parts.length >= 2 ? fromYMD(parts[1]) : fromD;
  if (!fromD || !toD) {
    document.querySelector('input[name="dateRange"][value="7days"]').checked = true;
    document.getElementById("dateCustomGroup").style.display = "none";
    return;
  }

  // プリセットに一致するか確認
  const matched = matchPreset(fromD, toD);
  if (matched) {
    const el = document.querySelector(`input[name="dateRange"][value="${matched}"]`);
    if (el) el.checked = true;
    document.getElementById("dateCustomGroup").style.display = "none";
  } else {
    const el = document.querySelector('input[name="dateRange"][value="custom"]');
    if (el) el.checked = true;
    document.getElementById("dateCustomGroup").style.display = "";
    document.getElementById("dateFrom").value = dateToInput(fromD);
    document.getElementById("dateTo").value   = dateToInput(toD);
  }
}

/** Date → "YYYY-MM-DD" (input[type=date]用) */
function dateToInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

/** from/to (Date, inclusive) がプリセットに一致するか判定 */
function matchPreset(fromD, toD) {
  for (const name of ["today","yesterday","3days","7days"]) {
    const r = presetToRange(name);
    const pFrom = r.from;
    const pTo   = new Date(r.to.getTime() - 86400000); // exclusive → inclusive
    if (fromD.getTime() === pFrom.getTime() && toD.getTime() === pTo.getTime()) return name;
  }
  return null;
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
    try { const j = await r.json(); detail = j.message || j.hint || JSON.stringify(j); } catch(e) {}
    throw new Error("HTTP " + r.status + (detail ? ": " + detail : ""));
  }
  return r.json();
}

async function fetchAllPosts(threadId) {
  const id = Number(threadId);
  if (postsCache.has(id)) return postsCache.get(id);
  const ps = await sbFetch(
    `posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&thread_id=eq.${id}&order=post_num.asc&limit=2000`
  );
  postsCache.set(id, ps);
  return ps;
}

async function fetchThreadInfo(threadId) {
  const id = Number(threadId);
  if (threadCache.has(id)) return threadCache.get(id);
  const arr = await sbFetch(`threads?select=thread_id,title,updated_at&thread_id=eq.${id}&limit=1`);
  const info = arr[0] || { thread_id: id, title: "スレッド "+id, updated_at: null };
  threadCache.set(id, info);
  return info;
}

/* ================================================================
   検索
   ================================================================ */
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

  try {
    let results;
    if (stype === "title") {
      results = await searchTitle(q, smode, dr);
    } else if (stype === "body") {
      results = await searchBody(q, smode, dr);
    } else {
      const [tr, br] = await Promise.all([searchTitle(q,smode,dr), searchBody(q,smode,dr)]);
      const map = new Map();
      tr.forEach(r => map.set(r.thread_id, r));
      br.forEach(r => {
        if (map.has(r.thread_id)) {
          const ex = map.get(r.thread_id);
          const nums = new Set(ex.matchedPosts.map(p=>p.post_num));
          r.matchedPosts.forEach(p => { if (!nums.has(p.post_num)) ex.matchedPosts.push(p); });
          ex.matchedPosts.sort((a,b)=>a.post_num-b.post_num);
        } else { map.set(r.thread_id, r); }
      });
      results = Array.from(map.values());
    }
    currentResults = results;
    renderAll(q, ((performance.now()-t0)/1000).toFixed(2));
  } catch(e) {
    res.innerHTML = "";
    const d = document.createElement("div");
    d.className = "no-results";
    setText(d, "エラー: " + e.message);
    res.appendChild(d);
  }
}

/** 日付フィルターのクエリ文字列部分を生成 */
function dateFilter(dr, col) {
  // col = "updated_at" or "posted_at"
  return `&${col}=gte.${dr.from}&${col}=lt.${dr.to}`;
}

async function searchTitle(q, mode, dr) {
  const ws = words(q);
  let threads;
  if (mode === "or" && ws.length > 1) {
    const sets = await Promise.all(ws.map(w =>
      sbFetch(`threads?select=thread_id,title,updated_at&limit=200&title=ilike.${enc(w)}${dateFilter(dr,"updated_at")}`)
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
      threads = threads.filter(t => ws.every(w => (t.title||"").toLowerCase().includes(w.toLowerCase())));
  }
  return threads.map(t => ({ thread_id:t.thread_id, title:t.title, updated_at:t.updated_at, matchedPosts:[], titleMatch:true }));
}

async function searchBody(q, mode, dr) {
  const ws = words(q);
  const idm = q.match(/^id:\s*(.+)/i);
  if (idm) {
    const ps = await sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=500&user_id=ilike.${enc(idm[1].trim())}&order=posted_at.desc${dateFilter(dr,"posted_at")}`);
    return groupPosts(ps);
  }
  let all = [];
  if (mode === "or" && ws.length > 1) {
    const fetches = ws.flatMap(w => [
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&body=ilike.${enc(w)}&order=posted_at.desc${dateFilter(dr,"posted_at")}`),
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&name=ilike.${enc(w)}&order=posted_at.desc${dateFilter(dr,"posted_at")}`),
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&user_id=ilike.${enc(w)}&order=posted_at.desc${dateFilter(dr,"posted_at")}`),
    ]);
    const map = new Map();
    (await Promise.all(fetches)).flat().forEach(p => map.set(`${p.thread_id}_${p.post_num}`, p));
    all = Array.from(map.values());
  } else {
    const w0 = ws[0];
    const df = dateFilter(dr, "posted_at");
    const [bp,np,ip] = await Promise.all([
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&body=ilike.${enc(w0)}&order=posted_at.desc${df}`),
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&name=ilike.${enc(w0)}&order=posted_at.desc${df}`),
      sbFetch(`posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi&limit=300&user_id=ilike.${enc(w0)}&order=posted_at.desc${df}`),
    ]);
    const map = new Map();
    [...bp,...np,...ip].forEach(p => map.set(`${p.thread_id}_${p.post_num}`, p));
    all = Array.from(map.values());
    if (mode === "and" && ws.length > 1)
      all = all.filter(p => {
        const t = ((p.body||"")+" "+(p.name||"")+" "+(p.user_id||"")).toLowerCase();
        return ws.every(w => t.includes(w.toLowerCase()));
      });
  }
  return groupPosts(all);
}

async function groupPosts(posts) {
  if (!posts.length) return [];
  const tids = [...new Set(posts.map(p=>p.thread_id))];
  for (let i=0; i<tids.length; i+=20) {
    const batch = tids.slice(i,i+20);
    const ts = await sbFetch(`threads?select=thread_id,title,updated_at&thread_id=in.(${batch.join(",")})`);
    ts.forEach(t => threadCache.set(t.thread_id, t));
  }
  const map = new Map();
  posts.forEach(p => {
    if (!map.has(p.thread_id)) {
      const t = threadCache.get(p.thread_id) || {};
      map.set(p.thread_id, { thread_id:p.thread_id, title:t.title||"スレッド "+p.thread_id, updated_at:t.updated_at||p.posted_at, matchedPosts:[], titleMatch:false });
    }
    map.get(p.thread_id).matchedPosts.push(p);
  });
  map.forEach(r => r.matchedPosts.sort((a,b)=>a.post_num-b.post_num));
  return Array.from(map.values());
}

/* ================================================================
   描画
   ================================================================ */
function renderAll(q, elapsed) {
  const order  = document.querySelector('input[name="sortOrder"]:checked').value;
  const sorted = sortRes([...currentResults], order);
  const total  = sorted.reduce((s,r)=>s+r.matchedPosts.length, 0);
  document.getElementById("resultStats").textContent = `約 ${sorted.length} スレッド / ${total} レス (${elapsed||"0.00"} 秒)`;
  const res = document.getElementById("results");
  res.innerHTML = "";
  if (!sorted.length) {
    const d = document.createElement("div"); d.className="no-results";
    setText(d,"「"+q+"」に一致する結果はありませんでした。");
    res.appendChild(d);
    document.getElementById("searchSummary").style.display="none";
    document.getElementById("sortBar").classList.remove("visible");
    return;
  }
  document.getElementById("sortBar").classList.add("visible");
  const sum = document.getElementById("searchSummary");
  setText(sum, `検索: 「${q}」 | ヒット: ${sorted.length}スレッド, ${total}レス`);
  sum.style.display = "block";
  sorted.forEach(r => res.appendChild(mkCard(r, q)));
}

function sortRes(rs, order) {
  if (order==="newest")    return rs.sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0));
  if (order==="oldest")    return rs.sort((a,b)=>new Date(a.updated_at||0)-new Date(b.updated_at||0));
  if (order==="relevance") return rs.sort((a,b)=>b.matchedPosts.length-a.matchedPosts.length);
  return rs;
}

/* ===== スレッドカード ===== */
function mkCard(thread, q) {
  const card = document.createElement("div");
  card.className = "thread-result";
  card.dataset.threadId = thread.thread_id;

  const hdr = document.createElement("div");
  hdr.className = "thread-header";

  const ta = document.createElement("div"); ta.className="thread-title-area";
  const ts = document.createElement("span"); ts.className="thread-title";
  hlSet(ts, thread.title||"スレッド "+thread.thread_id, q); ta.appendChild(ts);
  const ud = document.createElement("div"); ud.className="thread-url";
  setText(ud,"hayabusa.open2ch.net › livejupiter › "+thread.thread_id); ta.appendChild(ud);
  const ml = document.createElement("div"); ml.className="thread-meta-line";
  setText(ml,"更新: "+(thread.updated_at ? new Date(thread.updated_at).toLocaleDateString("ja-JP") : "")); ta.appendChild(ml);

  const ba = document.createElement("div"); ba.className="thread-badge-area";
  const bk = document.createElement("span");
  if (thread.matchedPosts.length > 0) { bk.className="badge-match"; setText(bk,thread.matchedPosts.length+"件ヒット"); }
  else { bk.className="badge-title"; setText(bk,"タイトル一致"); }
  ba.appendChild(bk); hdr.appendChild(ta); hdr.appendChild(ba);

  const det = document.createElement("div"); det.className="thread-details";

  const ab = document.createElement("div"); ab.className="thread-action-bar";
  const lnk = document.createElement("a"); lnk.className="thread-ext-link";
  lnk.href="https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+thread.thread_id+"/";
  lnk.target="_blank"; lnk.rel="noopener noreferrer"; lnk.textContent="↗ 元スレを開く"; ab.appendChild(lnk);
  const allBtn = document.createElement("button"); allBtn.className="btn btn-success btn-sm"; allBtn.textContent="全レス表示";
  ab.appendChild(allBtn); det.appendChild(ab);

  const pw = document.createElement("div"); pw.className="posts-container"; det.appendChild(pw);

  allBtn.addEventListener("click", e=>{
    e.stopPropagation();
    loadAllInline(thread.thread_id, q, pw, allBtn);
  });

  if (thread.titleMatch && !thread.matchedPosts.length) {
    const n=document.createElement("p"); n.style.cssText="color:#5f6368;font-size:13px;padding:8px 0;";
    setText(n,"スレッドタイトルが一致しました。「全レス表示」でレスを確認できます。"); pw.appendChild(n);
  } else {
    thread.matchedPosts.forEach(p => pw.appendChild(mkPost(p, thread.thread_id, q, true)));
    bindAnchors(pw);
  }

  hdr.addEventListener("click", ()=>{ det.style.display = det.style.display==="block"?"none":"block"; });
  card.appendChild(hdr); card.appendChild(det);
  return card;
}

/* ===== 全レスインライン ===== */
async function loadAllInline(tid, q, pw, btn) {
  btn.disabled=true; btn.textContent="読込中…";
  pw.innerHTML=""; mkLoading(pw,"全レス読み込み中…");
  try {
    const ps = await fetchAllPosts(tid);
    pw.innerHTML="";
    const inf=document.createElement("div"); inf.style.cssText="font-size:13px;color:#5f6368;padding:4px 0;";
    setText(inf,ps.length+"レス"); pw.appendChild(inf);
    ps.forEach(p => pw.appendChild(mkPost(p,tid,q,false)));
    bindAnchors(pw);
    btn.style.display="none";
  } catch(e) {
    pw.innerHTML=""; const er=document.createElement("div"); er.style.color="#c0392b";
    setText(er,"読み込みエラー: "+e.message); pw.appendChild(er);
    btn.disabled=false; btn.textContent="全レス表示";
  }
}

/* ===== 詳細ページ ===== */
async function showDetail(tid, q) {
  document.getElementById("resultPage").classList.remove("active");
  document.getElementById("threadDetailPage").classList.add("active");
  const pd = document.getElementById("threadDetailPosts");
  pd.innerHTML=""; mkLoading(pd,"読み込み中…");
  try {
    const [info,ps] = await Promise.all([fetchThreadInfo(tid), fetchAllPosts(tid)]);
    pd.innerHTML="";
    const bb=document.createElement("div"); bb.className="back-btn";
    bb.textContent="← 検索結果に戻る";
    bb.addEventListener("click",()=>{
      document.getElementById("threadDetailPage").classList.remove("active");
      document.getElementById("resultPage").classList.add("active");
    }); pd.appendChild(bb);
    const h2=document.createElement("h2"); h2.style.cssText="font-size:17px;font-weight:700;color:#202124;padding:8px 0 4px;";
    setText(h2,info.title); pd.appendChild(h2);
    const mi=document.createElement("div"); mi.style.cssText="font-size:13px;color:#5f6368;margin-bottom:12px;";
    setText(mi,ps.length+"レス"); pd.appendChild(mi);
    const el=document.createElement("a");
    el.href="https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+tid+"/";
    el.target="_blank"; el.rel="noopener noreferrer";
    el.style.cssText="font-size:13px;color:#1a73e8;text-decoration:none;display:inline-block;margin-bottom:12px;";
    el.textContent="↗ 元スレを開く"; pd.appendChild(el);
    const con=document.createElement("div"); con.className="posts-container";
    ps.forEach(p => con.appendChild(mkPost(p,tid,q||"",false)));
    pd.appendChild(con); bindAnchors(con);
  } catch(e) {
    pd.innerHTML=""; const er=document.createElement("div"); er.style.color="#c0392b";
    setText(er,"読み込みエラー: "+e.message); pd.appendChild(er);
  }
}

/* ================================================================
   レス要素
   ================================================================ */
function mkPost(post, tid, q, showRange) {
  const div=document.createElement("div"); div.className="post"; div.dataset.postNum=post.post_num;

  const meta=document.createElement("div"); meta.className="post-meta";

  const num=document.createElement("span"); num.className="post-num";
  setText(num, post.post_num+":");
  num.addEventListener("click",()=>window.open(
    "https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+tid+"/"+post.post_num+"-","_blank"
  ));
  meta.appendChild(num);
  meta.appendChild(document.createTextNode(" "));

  const nm=document.createElement("span"); nm.className="post-author";
  hlSet(nm, post.name||"名無し", q); meta.appendChild(nm);

  const s1=document.createElement("span"); s1.className="post-sep"; setText(s1," | 時刻: "); meta.appendChild(s1);
  const ti=document.createElement("span"); ti.style.cssText="color:#5f6368;"; ti.textContent=fmtDate(post.posted_at); meta.appendChild(ti);

  const s2=document.createElement("span"); s2.className="post-sep"; setText(s2," | ID:"); meta.appendChild(s2);
  const uid=document.createElement("span");
  hlSet(uid, post.user_id||"?", q); meta.appendChild(uid);

  if (post.is_nusi) {
    const nusi=document.createElement("span"); nusi.className="post-nusi"; nusi.textContent="主"; meta.appendChild(nusi);
  }

  const btns=document.createElement("div"); btns.className="post-buttons";
  if (showRange) {
    const up=document.createElement("button"); up.className="btn btn-secondary btn-sm"; up.textContent="上100";
    up.addEventListener("click",e=>{e.stopPropagation(); rangeLoad(up,"up",tid,q,div);});
    const dn=document.createElement("button"); dn.className="btn btn-secondary btn-sm"; dn.textContent="下100";
    dn.addEventListener("click",e=>{e.stopPropagation(); rangeLoad(dn,"down",tid,q,div);});
    btns.appendChild(up); btns.appendChild(dn);
  }
  const cp=document.createElement("button"); cp.className="btn btn-copy btn-sm"; cp.textContent="コピペ";
  const cpText=`${post.post_num}: ${post.name||"名無し"} | 時刻: ${fmtDate(post.posted_at)} | ID:${post.user_id||"?"}${post.is_nusi?" 主":""}\n${(post.body||"").trim()}`;
  cp.addEventListener("click",e=>{
    e.stopPropagation();
    navigator.clipboard.writeText(cpText).then(()=>{cp.textContent="コピー完了!"; setTimeout(()=>cp.textContent="コピペ",1200);})
    .catch(()=>prompt("コピーしてください:",cpText));
  });
  btns.appendChild(cp); meta.appendChild(btns); div.appendChild(meta);

  const body=document.createElement("div"); body.className="post-content";
  renderBody(body, post.body||"", tid, q);
  div.appendChild(body);

  /* 安価数フッター */
  {
    const footer2  = document.createElement("div"); footer2.className="post-footer";
    const aresBtn2 = document.createElement("button"); aresBtn2.className="ares-btn";
    aresBtn2.title = "このレスへの安価一覧";
    aresBtn2.appendChild(document.createTextNode("💬 "));
    const countSpan2 = document.createElement("span"); countSpan2.className="ares-count";
    setText(countSpan2, "…");
    aresBtn2.appendChild(countSpan2);
    footer2.style.display = "none";
    footer2.appendChild(aresBtn2);
    div.appendChild(footer2);
    const aresList2 = document.createElement("div"); aresList2.className="ares-list";
    div.appendChild(aresList2);

    (async () => {
      try {
        const r2 = await fetch(SB_URL + "/rest/v1/rpc/count_ares", {
          method: "POST",
          headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ tid: Number(tid), pnum: post.post_num })
        });
        const cnt = await r2.json();
        if (cnt <= 0) return;
        setText(countSpan2, String(cnt));
        footer2.style.display = "";
      } catch(e) {}
    })();

    aresBtn2.addEventListener("click", async e => {
      e.stopPropagation();
      if (aresList2.classList.contains("open")) {
        aresList2.classList.remove("open"); aresBtn2.classList.remove("open"); return;
      }
      aresList2.classList.add("open"); aresBtn2.classList.add("open");
      if (aresList2.dataset.loaded) return;
      const ld2 = document.createElement("div"); ld2.className = "ares-list-loading";
      setText(ld2, "読み込み中…"); aresList2.appendChild(ld2);
      try {
        const rps2 = await fetch(SB_URL + "/rest/v1/rpc/get_ares_posts", {
          method: "POST",
          headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ tid: Number(tid), pnum: post.post_num })
        }).then(r => r.json());

        aresList2.innerHTML = "";
        if (!rps2.length) {
          const none2 = document.createElement("div"); none2.className = "ares-list-loading";
          setText(none2, "安価レスが見つかりませんでした"); aresList2.appendChild(none2);
        } else {
          rps2.forEach(rp2 => aresList2.appendChild(mkPost(rp2, tid, q, false)));
          bindAnchors(aresList2);
        }
        aresList2.dataset.loaded = "1";
      } catch(err2) {
        aresList2.innerHTML = "";
        const er2 = document.createElement("div"); er2.className = "ares-list-loading";
        er2.style.color = "#c0392b";
        setText(er2, "読み込みエラー: " + err2.message); aresList2.appendChild(er2);
      }
    });
  }
  return div;
}

/* ================================================================
   本文レンダリング
   ================================================================ */
function renderBody(container, bodyText, tid, q) {
  const lines = bodyText.split("\n");
  lines.forEach((line, li) => {
    if (li > 0) container.appendChild(document.createElement("br"));
    tokenize(line).forEach(tok => {
      if (tok.type === "anchor") {
        const a=document.createElement("span"); a.className="anchor-link";
        a.dataset.postNum=tok.num; a.dataset.threadId=tid; a.textContent=tok.raw;
        container.appendChild(a);
      } else if (tok.type === "imgur") {
        const w=document.createElement("div"); w.className="media-embed";
        const img=document.createElement("img");
        img.src="https://i.imgur.com/"+tok.id+".jpg"; img.loading="lazy";
        img.onerror=()=>{w.style.display="none";}; w.appendChild(img); container.appendChild(w);
        hlAppend(container, tok.raw, q);
      } else if (tok.type === "youtube") {
        const w=document.createElement("div"); w.className="media-embed";
        const fr=document.createElement("iframe");
        fr.src="https://www.youtube.com/embed/"+tok.vid; fr.allowFullscreen=true; fr.loading="lazy";
        w.appendChild(fr); container.appendChild(w);
        hlAppend(container, tok.raw, q);
      } else {
        hlAppend(container, tok.raw, q);
      }
    });
  });
}

function tokenize(line) {
  const toks = [];
  const ancRe = />>([\d]+)/g;
  const igRe  = /https?:\/\/(?:i\.)?imgur\.com\/([a-zA-Z0-9]+)(?:\.[a-zA-Z]+)?/g;
  const ytRe  = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/g;
  let m;
  const hits = [];
  ancRe.lastIndex=0; while((m=ancRe.exec(line))!==null) hits.push({s:m.index,e:m.index+m[0].length,type:"anchor",raw:m[0],num:m[1]});
  igRe.lastIndex=0;  while((m=igRe.exec(line))!==null)  hits.push({s:m.index,e:m.index+m[0].length,type:"imgur",raw:m[0],id:m[1]});
  ytRe.lastIndex=0;  while((m=ytRe.exec(line))!==null)  hits.push({s:m.index,e:m.index+m[0].length,type:"youtube",raw:m[0],vid:m[1]});
  hits.sort((a,b)=>a.s-b.s);
  const kept=[]; let last=0;
  hits.forEach(h=>{ if(h.s>=last){kept.push(h);last=h.e;} });
  let pos=0;
  kept.forEach(h=>{
    if(h.s>pos) toks.push({type:"text",raw:line.slice(pos,h.s)});
    toks.push(h); pos=h.e;
  });
  if(pos<line.length) toks.push({type:"text",raw:line.slice(pos)});
  return toks;
}

/* ===== ハイライト ===== */
function hlAppend(container, text, q) {
  if (!text) return;
  if (!q) { container.appendChild(document.createTextNode(text)); return; }
  const ws = words(q.replace(/^id:\s*/i,"")).filter(Boolean);
  if (!ws.length) { container.appendChild(document.createTextNode(text)); return; }
  const esc2 = ws.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"));
  const re = new RegExp("("+esc2.join("|")+")", "gi");
  const parts = text.split(re);
  parts.forEach(p=>{
    if (!p) return;
    re.lastIndex=0;
    if (re.test(p)) {
      const mk=document.createElement("mark"); mk.className="hl"; mk.textContent=p; container.appendChild(mk);
    } else {
      container.appendChild(document.createTextNode(p));
    }
    re.lastIndex=0;
  });
}

function hlSet(el, text, q) { el.textContent=""; hlAppend(el, text, q); }

/* ================================================================
   安価イベント
   ================================================================ */
const isTouchOnly = () => window.matchMedia("(pointer: coarse)").matches;

function bindAnchors(container) {
  const pv  = document.getElementById("anchorPreview");
  const pvM = document.getElementById("pvMeta");
  const pvB = document.getElementById("pvBody");

  container.querySelectorAll(".anchor-link").forEach(lnk => {
    if (!isTouchOnly()) {
      lnk.addEventListener("mouseenter", async e => {
        const pnum = parseInt(e.currentTarget.dataset.postNum, 10);
        const thid = parseInt(e.currentTarget.dataset.threadId, 10);
        const ps = await fetchAllPosts(thid).catch(()=>[]);
        const p  = ps.find(x=>x.post_num===pnum);
        if (!p) return;
        setText(pvM, p.post_num+": "+(p.name||"名無し")+" | ID:"+(p.user_id||"?"));
        const b=(p.body||"").trim();
        setText(pvB, b.length>250 ? b.slice(0,250)+"…" : b);
        pv.style.display="block"; posPv(e.clientX, e.clientY);
      });
      lnk.addEventListener("mousemove", e => {
        if (pv.style.display==="block") posPv(e.clientX, e.clientY);
      });
      lnk.addEventListener("mouseleave", () => { pv.style.display="none"; });
    }

    lnk.addEventListener("click", async e => {
      e.preventDefault(); e.stopPropagation();
      pv.style.display="none";
      const pnum = parseInt(e.currentTarget.dataset.postNum, 10);
      const thid = parseInt(e.currentTarget.dataset.threadId, 10);
      const fromPost = e.currentTarget.closest(".post");
      const scope = fromPost ? fromPost.parentNode : (e.currentTarget.closest(".posts-container,.thread-detail-posts") || container);
      await anchorClick(pnum, thid, scope, fromPost);
    });
  });
}

function posPv(cx, cy) {
  const pv=document.getElementById("anchorPreview");
  const vw=window.innerWidth, vh=window.innerHeight;
  const pw=Math.min(380,vw-8), ph=pv.offsetHeight||100;
  let x=cx+14, y=cy-10;
  if (x+pw>vw-4) x=cx-pw-14;
  if (x<4) x=4;
  if (y+ph>vh-4) y=cy-ph-14;
  if (y<4) y=4;
  pv.style.left=x+"px"; pv.style.top=y+"px"; pv.style.width=pw+"px";
}

async function anchorClick(pnum, tid, scope, fromPost) {
  const existing = scope.querySelector(`.post[data-post-num="${pnum}"]`);
  if (existing) {
    existing.scrollIntoView({behavior:"smooth", block:"center"});
    flash(existing);
    return;
  }

  const ps = await fetchAllPosts(tid).catch(()=>[]);
  const p  = ps.find(x=>x.post_num===pnum);
  if (!p) return;

  const el = mkPost(p, tid, currentKeyword, false);

  if (fromPost && fromPost.parentNode === scope) {
    const fromNum = parseInt(fromPost.dataset.postNum, 10);
    if (pnum < fromNum) {
      scope.insertBefore(el, fromPost);
    } else {
      scope.insertBefore(el, fromPost.nextSibling);
    }
  } else {
    scope.appendChild(el);
  }

  bindAnchors(el);
  setTimeout(()=>{ el.scrollIntoView({behavior:"smooth", block:"center"}); flash(el); }, 50);
}

function flash(el) {
  el.style.transition="background 0s"; el.style.background="#fffde7";
  setTimeout(()=>{ el.style.transition="background 1.2s"; el.style.background=""; }, 120);
}

/* ================================================================
   上100/下100
   ================================================================ */
async function rangeLoad(btn, dir, tid, q, postEl) {
  btn.disabled = true;
  const pnum  = parseInt(postEl.dataset.postNum, 10);
  const start = dir==="up" ? Math.max(1, pnum-100) : pnum+1;
  const end   = dir==="up" ? pnum-1                : pnum+100;
  if (start > end) return;

  try {
    const ps = await sbFetch(
      `posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi` +
      `&thread_id=eq.${tid}&post_num=gte.${start}&post_num=lte.${end}&order=post_num.asc`
    );

    const parent = postEl.parentNode;

    const frag = document.createDocumentFragment();
    let added = 0;
    ps.forEach(p => {
      if (!parent.querySelector(`.post[data-post-num="${p.post_num}"]`)) {
        frag.appendChild(mkPost(p, tid, q, false));
        added++;
      }
    });

    if (added === 0) return;

    const scrollY    = window.scrollY;
    const rectBefore = postEl.getBoundingClientRect().top;

    if (dir === "up") {
      parent.insertBefore(frag, postEl);
    } else {
      parent.insertBefore(frag, postEl.nextSibling);
    }

    reorderPosts(parent);

    if (dir === "up") {
      const rectAfter = postEl.getBoundingClientRect().top;
      window.scrollTo({top: scrollY + (rectAfter - rectBefore), behavior:"instant"});
    }

    parent.querySelectorAll(".anchor-link:not([data-bound])").forEach(lnk => {
      lnk.dataset.bound = "1";
    });
    bindAnchors(parent);

  } catch(e) {
    btn.disabled = false;
  }
}

function reorderPosts(parent) {
  const posts = Array.from(parent.querySelectorAll(":scope > .post"));
  if (posts.length < 2) return;
  posts.sort((a,b) => parseInt(a.dataset.postNum,10) - parseInt(b.dataset.postNum,10));
  const seen = new Set();
  const deduped = [];
  for (let i=posts.length-1; i>=0; i--) {
    const n = posts[i].dataset.postNum;
    if (!seen.has(n)) { seen.add(n); deduped.unshift(posts[i]); }
    else { posts[i].remove(); }
  }
  const nonPosts = Array.from(parent.children).filter(c=>!c.classList.contains("post") && !c.classList.contains("range-posts"));
  const insertAfter = nonPosts.length ? nonPosts[nonPosts.length-1] : null;
  deduped.forEach(el => {
    parent.appendChild(el);
  });
  if (insertAfter && insertAfter.nextSibling) {
    deduped.forEach(el => parent.insertBefore(el, insertAfter.nextSibling));
  }
}

/* ================================================================
   URL管理
   ================================================================ */

/**
 * 新しいURL形式:
 *   ?s=検索語&t=b|r|h&m=t|a|o&d=260416-260422
 *
 * 旧URL形式 (自動変換):
 *   ?search=検索語&type=subete|suretai|honbun&mode=tuuzyou|and|or
 */
function pushUrl(q) {
  const url  = new URL(window.location.href);

  // 旧パラメータを削除
  ["search","type","mode"].forEach(k => url.searchParams.delete(k));

  const mode = document.querySelector('input[name="searchMode"]:checked').value;
  const type = document.querySelector('input[name="searchType"]:checked').value;
  const dr   = getDateRange();

  if (q) {
    url.searchParams.set("s", q);
    url.searchParams.set("t", TYPE_TO_URL[type] || "b");
    url.searchParams.set("m", MODE_TO_URL[mode] || "t");
    url.searchParams.set("d", dr.urlParam);
  } else {
    ["s","t","m","d"].forEach(k => url.searchParams.delete(k));
  }
  history.pushState({}, "", url.toString());
}

function shareUrl() {
  navigator.clipboard.writeText(window.location.href).then(()=>{
    const b=document.getElementById("shareBtn"); const o=b.textContent;
    b.textContent="✅ コピーしました"; setTimeout(()=>b.textContent=o,2000);
  }).catch(()=>prompt("URLをコピーしてください:",window.location.href));
}

/**
 * URL読み込み — 新旧両方に対応
 */
function loadUrl() {
  const p = new URLSearchParams(window.location.search);

  let q, typeVal, modeVal, dateVal;
  let needsRedirect = false;

  // 旧URLの検出
  if (p.has("search")) {
    // 旧形式 → 新形式に変換
    q        = p.get("search") || "";
    typeVal  = LEGACY_TYPE[p.get("type")] || "all";
    modeVal  = LEGACY_MODE[p.get("mode")] || "default";
    dateVal  = null; // 旧URLには日付なし → 7日デフォルト
    needsRedirect = true;
  } else {
    // 新形式
    q        = p.get("s") || "";
    typeVal  = URL_TO_TYPE[p.get("t")] || "all";
    modeVal  = URL_TO_MODE[p.get("m")] || "default";
    dateVal  = p.get("d") || null;
  }

  // UIに反映
  const te = document.querySelector(`input[name="searchType"][value="${typeVal}"]`);
  const me = document.querySelector(`input[name="searchMode"][value="${modeVal}"]`);
  if (te) te.checked = true;
  if (me) me.checked = true;

  applyDateParam(dateVal);

  if (q) {
    document.getElementById("topInput").value = q;

    if (needsRedirect) {
      // URLを新形式に書き換えてから検索
      // (doSearch内でpushUrlが呼ばれるので自動的に新URL形式になる)
    }

    doSearch(q);
  }
}

/* ================================================================
   ナビゲーション
   ================================================================ */
function goHome() {
  document.getElementById("topPage").classList.remove("hidden");
  document.getElementById("resultPage").classList.remove("active");
  document.getElementById("threadDetailPage").classList.remove("active");
  document.getElementById("topInput").value="";
  document.getElementById("topInput").focus();
  currentResults=[]; currentKeyword="";
  history.pushState({},"",(location.pathname));
}

/* ================================================================
   ユーティリティ
   ================================================================ */
function words(q){ return q.split(/\s+/).filter(Boolean); }
function enc(w) { return encodeURIComponent("%"+w+"%"); }
function mkLoading(el,msg){
  el.innerHTML=""; const d=document.createElement("div"); d.className="loading"; d.textContent=msg;
  const s=document.createElement("span"); s.className="spinner"; d.appendChild(s); el.appendChild(d);
}

/* ================================================================
   イベントバインド
   ================================================================ */
document.getElementById("topInput").addEventListener("keydown",e=>{ if(e.key==="Enter") doSearch(); });
document.getElementById("resultInput").addEventListener("keydown",e=>{ if(e.key==="Enter") doSearch(e.target.value.trim()); });
document.getElementById("detailInput").addEventListener("keydown",e=>{ if(e.key==="Enter") doSearch(e.target.value.trim()); });

// ソート変更
document.querySelectorAll('input[name="sortOrder"]').forEach(r=>r.addEventListener("change",()=>{
  if(currentResults.length) renderAll(currentKeyword,"0.00");
}));

// 検索モード・範囲変更
document.querySelectorAll('input[name="searchMode"],input[name="searchType"]').forEach(r=>r.addEventListener("change",()=>{
  const q=document.getElementById("resultInput").value.trim();
  if(q) doSearch(q);
}));

// 日付プリセット変更
document.querySelectorAll('input[name="dateRange"]').forEach(r => r.addEventListener("change", () => {
  const v = r.value;
  document.getElementById("dateCustomGroup").style.display = (v === "custom") ? "" : "none";
  // カスタム以外が選ばれたら即検索
  if (v !== "custom") {
    const q = document.getElementById("resultInput").value.trim();
    if (q) doSearch(q);
  }
}));

// カスタム日付入力変更
document.getElementById("dateFrom").addEventListener("change", () => {
  const q = document.getElementById("resultInput").value.trim();
  if (q && document.getElementById("dateTo").value) doSearch(q);
});
document.getElementById("dateTo").addEventListener("change", () => {
  const q = document.getElementById("resultInput").value.trim();
  if (q && document.getElementById("dateFrom").value) doSearch(q);
});

window.addEventListener("popstate", loadUrl);

// 初期化
loadUrl();
