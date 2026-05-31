"use strict";

/* ================================================================
   描画
   ================================================================ */
function renderAll(q, elapsed) {
  const order  = document.querySelector('input[name="sortOrder"]:checked').value;
  const sorted = sortRes([...currentResults], order);
  const total  = sorted.reduce((s, r) => s + r.matchedPosts.length, 0);

  const stats = document.getElementById("resultStats");
  stats.innerHTML = "";

  const hasTimings = (typeof lastSegmentTimings !== "undefined" && lastSegmentTimings.length > 0);
  const failed = hasTimings ? lastSegmentTimings.filter(t => !t.ok) : [];

  const summaryRow = document.createElement("div");
  summaryRow.style.cssText = hasTimings ? "cursor:pointer;user-select:none;" : "";

  const triangle = document.createElement("span");
  if (hasTimings) {
    triangle.textContent = "▶ ";
    triangle.style.cssText = "display:inline-block;transition:transform 0.15s;font-size:11px;color:#5f6368;";
    summaryRow.appendChild(triangle);
  }

  const summaryText = document.createElement("span");
  summaryText.textContent = `約 ${sorted.length} スレッド / ${total} レス (${elapsed || "0.00"} 秒)`;
  summaryRow.appendChild(summaryText);

  if (failed.length) {
    const errBadge = document.createElement("span");
    errBadge.textContent = ` ⚠️ ${failed.length}件エラー`;
    errBadge.style.cssText = "color:#c0392b;font-weight:600;font-size:12px;margin-left:6px;";
    summaryRow.appendChild(errBadge);
  }

  stats.appendChild(summaryRow);

  if (hasTimings) {
    const detailWrap = document.createElement("div");
    detailWrap.style.cssText = "display:none;margin-top:6px;";

    const detail = document.createElement("div");
    detail.style.cssText = "font-size:12px;color:#5f6368;display:flex;flex-wrap:wrap;gap:4px 10px;";

    const byLabel = new Map();
    lastSegmentTimings.forEach(t => {
      if (!byLabel.has(t.label)) byLabel.set(t.label, []);
      byLabel.get(t.label).push(t);
    });

    const labels = Array.from(byLabel.keys()).sort().reverse();
    labels.forEach(label => {
      byLabel.get(label).forEach(r => {
        const item = document.createElement("span");
        if (r.ok) {
          item.textContent = `${label}[${r.kind}]: ${r.ms}ms (${r.count}件)`;
          item.style.color = "#5f6368";
        } else {
          item.textContent = `❌ ${label}[${r.kind}]: ${r.ms}ms ${r.error}`;
          item.style.color = "#c0392b";
          item.style.fontWeight = "600";
        }
        detail.appendChild(item);
      });
    });
    detailWrap.appendChild(detail);

    if (failed.length) {
      const warn = document.createElement("div");
      warn.style.cssText = "margin-top:6px;padding:6px 10px;background:#fff3cd;border:1px solid #ffe69c;border-radius:4px;color:#664d03;font-size:12px;";
      warn.textContent = `⚠️ ${failed.length}件の日付でエラー: ${failed.map(f => `${f.label}(${f.kind}) ${f.error}`).join(" / ")}`;
      detailWrap.appendChild(warn);
    }

    stats.appendChild(detailWrap);

    summaryRow.addEventListener("click", () => {
      const isOpen = detailWrap.style.display !== "none";
      detailWrap.style.display = isOpen ? "none" : "block";
      triangle.textContent = isOpen ? "▶ " : "▼ ";
    });
  }

  const res = document.getElementById("results");
  res.innerHTML = "";

  // ID分析バナー: "id:xxx" プレフィックス、または検索範囲ラジオで id が
  // 選択されているときに表示する
  const idm = q.match(/^id:\s*(.+)/i);
  const typeEl = document.querySelector('input[name="searchType"]:checked');
  const isIdType = typeEl && typeEl.value === "id";
  const idVal = idm ? idm[1].trim() : (isIdType ? q.trim() : null);
  if (idVal && sorted.length > 0) {
    res.appendChild(mkIdAnalysisBanner(idVal));
  }

  if (!sorted.length) {
    const d = document.createElement("div"); d.className = "no-results";
    setText(d, "「" + q + "」に一致する結果はありませんでした。");
    res.appendChild(d);
    document.getElementById("searchSummary").style.display = "none";
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
  if (order === "newest")    return rs.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  if (order === "oldest")    return rs.sort((a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0));
  if (order === "relevance") return rs.sort((a, b) => b.matchedPosts.length - a.matchedPosts.length);
  return rs;
}

/* ===== ID分析バナー ===== */
function mkIdAnalysisBanner(userId) {
  const banner = document.createElement("div");
  banner.className = "id-analysis-banner";

  const icon = document.createElement("span");
  icon.className = "id-analysis-banner-icon";
  icon.textContent = "🔍";
  banner.appendChild(icon);

  const textWrap = document.createElement("div");
  textWrap.className = "id-analysis-banner-text";

  const main = document.createElement("span");
  main.className = "id-analysis-banner-main";
  setText(main, `ID:${userId} を分析してみませんか？`);
  textWrap.appendChild(main);

  const sub = document.createElement("span");
  sub.className = "id-analysis-banner-sub";
  setText(sub, "書き込み時間帯・スレ立て一覧・ランキング順位などを確認");
  textWrap.appendChild(sub);

  banner.appendChild(textWrap);

  const btn = document.createElement("a");
  btn.className = "id-analysis-banner-btn";
  btn.textContent = "分析ページへ →";
  const dr = getDateRange();
  btn.href = `id-analysis.html?id=${encodeURIComponent(userId)}&d=${dr.urlParam}`;
  banner.appendChild(btn);

  banner.addEventListener("click", (e) => {
    if (e.target === btn) return;
    btn.click();
  });

  return banner;
}

/* ===== スレッドカード ===== */
function mkCard(thread, q) {
  const card = document.createElement("div");
  card.className = "thread-result";
  card.dataset.threadId = thread.thread_id;

  const hdr = document.createElement("div");
  hdr.className = "thread-header";

  const ta = document.createElement("div"); ta.className = "thread-title-area";
  const ts = document.createElement("span"); ts.className = "thread-title";
  hlSet(ts, thread.title || "スレッド " + thread.thread_id, q); ta.appendChild(ts);
  const ud = document.createElement("div"); ud.className = "thread-url";
  setText(ud, "hayabusa.open2ch.net › livejupiter › " + thread.thread_id); ta.appendChild(ud);
  const ml = document.createElement("div"); ml.className = "thread-meta-line";
  setText(ml, "更新: " + (thread.updated_at ? new Date(thread.updated_at).toLocaleDateString("ja-JP") : "")); ta.appendChild(ml);

  const ba = document.createElement("div"); ba.className = "thread-badge-area";
  const bk = document.createElement("span");
  if (thread.matchedPosts.length > 0) { bk.className = "badge-match"; setText(bk, thread.matchedPosts.length + "件ヒット"); }
  else { bk.className = "badge-title"; setText(bk, "タイトル一致"); }
  ba.appendChild(bk); hdr.appendChild(ta); hdr.appendChild(ba);

  const det = document.createElement("div"); det.className = "thread-details";

  const ab = document.createElement("div"); ab.className = "thread-action-bar";
  const lnk = document.createElement("a"); lnk.className = "thread-ext-link";
  lnk.href = "https://hayabusa.open2ch.net/test/read.cgi/livejupiter/" + thread.thread_id + "/";
  lnk.target = "_blank"; lnk.rel = "noopener noreferrer"; lnk.textContent = "↗ 元スレを開く"; ab.appendChild(lnk);
  const allBtn = document.createElement("button"); allBtn.className = "btn btn-success btn-sm"; allBtn.textContent = "全レス表示";
  ab.appendChild(allBtn); det.appendChild(ab);

  const pw = document.createElement("div"); pw.className = "posts-container"; det.appendChild(pw);

  allBtn.addEventListener("click", e => {
    e.stopPropagation();
    loadAllInline(thread.thread_id, q, pw, allBtn);
  });

  if (thread.titleMatch && !thread.matchedPosts.length) {
    const n = document.createElement("p"); n.style.cssText = "color:#5f6368;font-size:13px;padding:8px 0;";
    setText(n, "スレッドタイトルが一致しました。「全レス表示」でレスを確認できます。"); pw.appendChild(n);
  } else {
    thread.matchedPosts.forEach(p => pw.appendChild(mkPost(p, thread.thread_id, q, true)));
    bindAnchors(pw);
  }

  hdr.addEventListener("click", () => { det.style.display = det.style.display === "block" ? "none" : "block"; });
  card.appendChild(hdr); card.appendChild(det);
  return card;
}

/* ===== 全レスインライン ===== */
async function loadAllInline(tid, q, pw, btn) {
  btn.disabled = true; btn.textContent = "読込中…";
  pw.innerHTML = ""; mkLoading(pw, "全レス読み込み中…");
  try {
    const ps = await fetchAllPosts(tid);
    pw.innerHTML = "";
    const inf = document.createElement("div"); inf.style.cssText = "font-size:13px;color:#5f6368;padding:4px 0;";
    setText(inf, ps.length + "レス"); pw.appendChild(inf);
    ps.forEach(p => pw.appendChild(mkPost(p, tid, q, false)));
    bindAnchors(pw);
    btn.style.display = "none";
  } catch (e) {
    pw.innerHTML = "";
    const er = document.createElement("div"); er.style.color = "#c0392b";
    setText(er, "読み込みエラー: " + e.message); pw.appendChild(er);
    btn.disabled = false; btn.textContent = "全レス表示";
  }
}

/* ===== 詳細ページ ===== */
async function showDetail(tid, q) {
  document.getElementById("resultPage").classList.remove("active");
  document.getElementById("threadDetailPage").classList.add("active");
  const pd = document.getElementById("threadDetailPosts");
  pd.innerHTML = ""; mkLoading(pd, "読み込み中…");
  try {
    const [info, ps] = await Promise.all([fetchThreadInfo(tid), fetchAllPosts(tid)]);
    pd.innerHTML = "";
    const bb = document.createElement("div"); bb.className = "back-btn";
    bb.textContent = "← 検索結果に戻る";
    bb.addEventListener("click", () => {
      document.getElementById("threadDetailPage").classList.remove("active");
      document.getElementById("resultPage").classList.add("active");
    }); pd.appendChild(bb);
    const h2 = document.createElement("h2"); h2.style.cssText = "font-size:17px;font-weight:700;color:#202124;padding:8px 0 4px;";
    setText(h2, info.title); pd.appendChild(h2);
    const mi = document.createElement("div"); mi.style.cssText = "font-size:13px;color:#5f6368;margin-bottom:12px;";
    setText(mi, ps.length + "レス"); pd.appendChild(mi);
    const el = document.createElement("a");
    el.href = "https://hayabusa.open2ch.net/test/read.cgi/livejupiter/" + tid + "/";
    el.target = "_blank"; el.rel = "noopener noreferrer";
    el.style.cssText = "font-size:13px;color:#1a73e8;text-decoration:none;display:inline-block;margin-bottom:12px;";
    el.textContent = "↗ 元スレを開く"; pd.appendChild(el);
    const con = document.createElement("div"); con.className = "posts-container";
    ps.forEach(p => con.appendChild(mkPost(p, tid, q || "", false)));
    pd.appendChild(con); bindAnchors(con);
  } catch (e) {
    pd.innerHTML = "";
    const er = document.createElement("div"); er.style.color = "#c0392b";
    setText(er, "読み込みエラー: " + e.message); pd.appendChild(er);
  }
}

/* ================================================================
   レス要素（安価はares_countカラム + bodyパース。RPC不使用）
   ================================================================ */
function mkPost(post, tid, q, showRange) {
  const div = document.createElement("div"); div.className = "post"; div.dataset.postNum = post.post_num;

  const meta = document.createElement("div"); meta.className = "post-meta";

  const num = document.createElement("span"); num.className = "post-num";
  setText(num, post.post_num + ":");
  num.addEventListener("click", () => window.open(
    "https://hayabusa.open2ch.net/test/read.cgi/livejupiter/" + tid + "/" + post.post_num + "-", "_blank"
  ));
  meta.appendChild(num);
  meta.appendChild(document.createTextNode(" "));

  const nm = document.createElement("span"); nm.className = "post-author";
  hlSet(nm, post.name || "名無し", q); meta.appendChild(nm);

  const s1 = document.createElement("span"); s1.className = "post-sep"; setText(s1, " | 時刻: "); meta.appendChild(s1);
  const ti = document.createElement("span"); ti.style.cssText = "color:#5f6368;"; ti.textContent = fmtDate(post.posted_at); meta.appendChild(ti);

  const s2 = document.createElement("span"); s2.className = "post-sep"; setText(s2, " | ID:"); meta.appendChild(s2);
  const uid = document.createElement("span");
  hlSet(uid, post.user_id || "?", q); meta.appendChild(uid);

  if (post.user_id) {
    const idSearch = document.createElement("span");
    idSearch.className = "id-search-icon";
    idSearch.textContent = "🔍";
    idSearch.title = "ID:" + post.user_id + " を検索";
    idSearch.addEventListener("click", function(e) {
      e.stopPropagation();
      doSearch("id:" + post.user_id);
      window.scrollTo(0, 0);
    });
    meta.appendChild(idSearch);
  }

  if (post.is_nusi) {
    const nusi = document.createElement("span"); nusi.className = "post-nusi"; nusi.textContent = "主"; meta.appendChild(nusi);
  }

  const btns = document.createElement("div"); btns.className = "post-buttons";
  if (showRange) {
    const up = document.createElement("button"); up.className = "btn btn-secondary btn-sm"; up.textContent = "上100";
    up.addEventListener("click", e => { e.stopPropagation(); rangeLoad(up, "up", tid, q, div); });
    const dn = document.createElement("button"); dn.className = "btn btn-secondary btn-sm"; dn.textContent = "下100";
    dn.addEventListener("click", e => { e.stopPropagation(); rangeLoad(dn, "down", tid, q, div); });
    btns.appendChild(up); btns.appendChild(dn);
  }
  const cp = document.createElement("button"); cp.className = "btn btn-copy btn-sm"; cp.textContent = "コピペ";
  const cpText = `${post.post_num}: ${post.name || "名無し"} | 時刻: ${fmtDate(post.posted_at)} | ID:${post.user_id || "?"}${post.is_nusi ? " 主" : ""}\n${(post.body || "").trim()}`;
  cp.addEventListener("click", e => {
    e.stopPropagation();
    navigator.clipboard.writeText(cpText).then(() => { cp.textContent = "コピー完了!"; setTimeout(() => cp.textContent = "コピペ", 1200); })
      .catch(() => prompt("コピーしてください:", cpText));
  });
  btns.appendChild(cp); meta.appendChild(btns); div.appendChild(meta);

  const body = document.createElement("div"); body.className = "post-content";
  renderBody(body, post.body || "", tid, q);
  div.appendChild(body);

  /* ===== 安価数フッター ===== */
  {
    const footer2  = document.createElement("div"); footer2.className = "post-footer";
    const aresBtn2 = document.createElement("button"); aresBtn2.className = "ares-btn";
    aresBtn2.title = "このレスへの安価一覧";
    aresBtn2.appendChild(document.createTextNode("💬 "));
    const countSpan2 = document.createElement("span"); countSpan2.className = "ares-count";
    setText(countSpan2, "…");
    aresBtn2.appendChild(countSpan2);
    footer2.style.display = "none";
    footer2.appendChild(aresBtn2);
    div.appendChild(footer2);
    const aresList2 = document.createElement("div"); aresList2.className = "ares-list";
    div.appendChild(aresList2);

    /* 安価カウント: ares_countカラムを読む */
    (async () => {
      try {
        const cnt = await countAres(tid, post.post_num);
        if (cnt <= 0) return;
        setText(countSpan2, String(cnt));
        footer2.style.display = "";
      } catch (e) {}
    })();

    /* 安価レス展開: 全レスからbodyパースで取得 */
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
        const rps2 = await getAresPosts(tid, post.post_num);

        aresList2.innerHTML = "";
        if (!rps2.length) {
          const none2 = document.createElement("div"); none2.className = "ares-list-loading";
          setText(none2, "安価レスが見つかりませんでした"); aresList2.appendChild(none2);
        } else {
          rps2.forEach(rp2 => aresList2.appendChild(mkPost(rp2, tid, q, false)));
          bindAnchors(aresList2);
        }
        aresList2.dataset.loaded = "1";
      } catch (err2) {
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
        const a = document.createElement("span"); a.className = "anchor-link";
        a.dataset.postNum = tok.num; a.dataset.threadId = tid; a.textContent = tok.raw;
        container.appendChild(a);
      } else if (tok.type === "imgur") {
        const w = document.createElement("div"); w.className = "media-embed";
        const img = document.createElement("img");
        img.src = "https://i.imgur.com/" + tok.id + ".jpg"; img.loading = "lazy";
        img.onerror = () => { w.style.display = "none"; }; w.appendChild(img); container.appendChild(w);
        hlAppend(container, tok.raw, q);
      } else if (tok.type === "imgujp") {
        const w = document.createElement("div"); w.className = "media-embed";
        const img = document.createElement("img");
        img.src = tok.raw; img.loading = "lazy";
        img.onerror = () => { w.style.display = "none"; }; w.appendChild(img); container.appendChild(w);
        hlAppend(container, tok.raw, q);
      } else if (tok.type === "youtube") {
        const w = document.createElement("div"); w.className = "media-embed";
        const fr = document.createElement("iframe");
        fr.src = "https://www.youtube.com/embed/" + tok.vid; fr.allowFullscreen = true; fr.loading = "lazy";
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
  const igjpRe = /https?:\/\/imgu?\.jp\/(?:i\/)?([a-zA-Z0-9_-]+(?:\.[a-zA-Z]{3,4}))/g;
  const ytRe  = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/g;
  let m;
  const hits = [];
  ancRe.lastIndex = 0; while ((m = ancRe.exec(line)) !== null) hits.push({ s: m.index, e: m.index + m[0].length, type: "anchor", raw: m[0], num: m[1] });
  igRe.lastIndex = 0;  while ((m = igRe.exec(line)) !== null)  hits.push({ s: m.index, e: m.index + m[0].length, type: "imgur", raw: m[0], id: m[1] });
  igjpRe.lastIndex = 0; while ((m = igjpRe.exec(line)) !== null) hits.push({ s: m.index, e: m.index + m[0].length, type: "imgujp", raw: m[0], id: m[1] });
  ytRe.lastIndex = 0;  while ((m = ytRe.exec(line)) !== null)  hits.push({ s: m.index, e: m.index + m[0].length, type: "youtube", raw: m[0], vid: m[1] });
  hits.sort((a, b) => a.s - b.s);
  const kept = []; let last = 0;
  hits.forEach(h => { if (h.s >= last) { kept.push(h); last = h.e; } });
  let pos = 0;
  kept.forEach(h => {
    if (h.s > pos) toks.push({ type: "text", raw: line.slice(pos, h.s) });
    toks.push(h); pos = h.e;
  });
  if (pos < line.length) toks.push({ type: "text", raw: line.slice(pos) });
  return toks;
}

/* ===== ハイライト ===== */
function hlAppend(container, text, q) {
  if (!text) return;
  if (!q) { container.appendChild(document.createTextNode(text)); return; }
  const ws = words(q.replace(/^id:\s*/i, "")).filter(Boolean);
  if (!ws.length) { container.appendChild(document.createTextNode(text)); return; }
  const esc2 = ws.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp("(" + esc2.join("|") + ")", "gi");
  const parts = text.split(re);
  parts.forEach(p => {
    if (!p) return;
    re.lastIndex = 0;
    if (re.test(p)) {
      const mk = document.createElement("mark"); mk.className = "hl"; mk.textContent = p; container.appendChild(mk);
    } else {
      container.appendChild(document.createTextNode(p));
    }
    re.lastIndex = 0;
  });
}

function hlSet(el, text, q) { el.textContent = ""; hlAppend(el, text, q); }
