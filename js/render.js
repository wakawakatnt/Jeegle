"use strict";

let lastElapsed = "0.00";

/* 同一人物かものID表示表記(正規化キー→元表記)を覚えるマップ（バナー用）*/
let idDisplayMap = new Map();

/* 同一人物候補の表示順を固定するための順序記憶（正規化キー → 並び順インデックス）。
   検索キーワードが変わったらリセットされる。 */
let altOrderMap = new Map();
let altOrderKeyword = null;


/* ================================================================
   描画
   ================================================================ */
function renderAll(q, elapsed) {
  if (elapsed !== undefined) lastElapsed = elapsed;

  const order  = document.querySelector('input[name="sortOrder"]:checked').value;

  /* ID検索かどうか。searchedId は doSearch がセット済み */
  const isIdSearch = !!searchedId;

  let resultsToShow = currentResults;
  let altIds = [];
  if (isIdSearch) {
    const split = splitIdResults(currentResults, searchedId, activeIdSet);
    resultsToShow = split.main;
    altIds = split.altIds;
  }

  const sorted = sortRes([...resultsToShow], order);
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
  summaryText.textContent = `約 ${sorted.length} スレッド / ${total} レス (${lastElapsed} 秒)`;
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

  const pane = document.getElementById("detailPane");
  if (pane) pane.innerHTML = "";

  /* === 同一人物かもブロック（分析バナーより「上」に表示） ===
     候補(altIds)に加えて、追加表示中(activeIdSet)のIDも
     「選択済み」として渡し、再タップで解除できるようにする。 */
  if (isIdSearch) {
    const searchedKey = normId(searchedId);

    /* 候補(altIds)と選択済み(activeIdSet)を「同じ並び」で1列にまとめる。
       並び順は altIds の固定順序に従い、その中で active フラグだけ切り替える。
       こうすると選択しても項目が上下に飛ばず、順序が変わらない。 */
    const entryMap = new Map();

    // まず候補（未選択）を固定順で登録
    altIds.forEach(a => {
      entryMap.set(a.key, { key: a.key, id: a.id, count: a.count, active: false, order: altOrderMap.get(a.key) ?? entryMap.size });
    });

    // 選択済みを active=true にする。候補に出ていないキーも件数を数えて追加
    activeIdSet.forEach(key => {
      if (key === searchedKey) return;
      let count = 0;
      currentResults.forEach(r => {
        r.matchedPosts.forEach(p => { if (normId(p.user_id) === key) count++; });
      });
      if (entryMap.has(key)) {
        const e = entryMap.get(key);
        e.active = true;
        e.count = count;
      } else {
        if (!altOrderMap.has(key)) altOrderMap.set(key, altOrderMap.size);
        entryMap.set(key, { key, id: idDisplayMap.get(key) || key, count, active: true, order: altOrderMap.get(key) });
      }
    });

    const allEntries = Array.from(entryMap.values())
      .sort((a, b) => a.order - b.order);

    if (allEntries.length > 0) {
      res.appendChild(mkSameUserBlock(allEntries));
    }
  }


  /* ID分析バナー: 検索ID + 追加表示中の各ID をそれぞれ並べる */
  if (sorted.length > 0 && isIdSearch) {
    res.appendChild(mkIdAnalysisBanner(searchedId));
    const searchedKey = normId(searchedId);
    activeIdSet.forEach(key => {
      if (key === searchedKey) return;
      const disp = idDisplayMap.get(key) || key;
      res.appendChild(mkIdAnalysisBanner(disp));
    });
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

  /* 「同一人物かも」で追加表示したIDによって新たに出てきたスレッドを判定。
     = 検索本人ID(searchedKey)のレスを1件も含まず、
       追加表示中ID(activeIdSet)のレスのみで表示されているスレッド。 */
  const searchedKey = isIdSearch ? normId(searchedId) : null;
  const hasActiveIds = isIdSearch && activeIdSet.size > 0;

  sorted.forEach(r => {
    let viaActiveOnly = false;
    if (hasActiveIds) {
      const hasSearched = r.matchedPosts.some(p => normId(p.user_id) === searchedKey);
      const hasActive   = r.matchedPosts.some(p => activeIdSet.has(normId(p.user_id)));
      // 本人のレスが無く、追加IDのレスで出ている → 追加で新たに現れたスレッド
      viaActiveOnly = !hasSearched && hasActive;
    }
    res.appendChild(mkCard(r, q, { highlightNew: viaActiveOnly }));
  });

  adjustStickyOffsets();
}


function sortRes(rs, order) {
  if (order === "newest")    return rs.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  if (order === "oldest")    return rs.sort((a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0));
  if (order === "relevance") return rs.sort((a, b) => b.matchedPosts.length - a.matchedPosts.length);
  return rs;
}

/* ===== ID検索結果を「本体(表示中ID群)」と「同一人物候補ID」に分割 =====
   - searchedIdRaw : 検索した元ID（生の値）
   - activeSet     : 追加表示中IDの正規化キー集合
   比較は normId（ドット除去）で行う。
   候補は「searchedIdが4文字なら非4文字」「searchedIdが非4文字なら4文字」のIDのみ。 */
function splitIdResults(results, searchedIdRaw, activeSet) {
  const searchedKey = normId(searchedIdRaw);
  const searchedIs4 = (searchedKey.length === 4);

  // 本体に表示する正規化キー集合（検索ID + 追加選択ID）
  const showKeys = new Set([searchedKey, ...activeSet]);

  const mainMap = new Map();
  const altMap = new Map();   // 正規化キー → {displayId, count}

  results.forEach(r => {
    const matched = r.matchedPosts.filter(p => showKeys.has(normId(p.user_id)));
    if (matched.length > 0) {
      mainMap.set(r.thread_id, Object.assign({}, r, { matchedPosts: matched }));
    }

    r.matchedPosts.forEach(p => {
      const key = normId(p.user_id);
      if (!key) return;
      // 元表記を覚えておく（バナー・ボタン用）
      if (p.user_id && !idDisplayMap.has(key)) idDisplayMap.set(key, p.user_id);
      if (showKeys.has(key)) return;                  // 既に表示中は候補に出さない
      const is4 = (key.length === 4);
      if (searchedIs4 ? !is4 : is4) {                 // 4文字検索→非4文字 / 非4文字検索→4文字
        if (!altMap.has(key)) {
          altMap.set(key, { displayId: p.user_id || key, count: 0 });
        }
        altMap.get(key).count++;
      }
    });
  });

  let altIds = Array.from(altMap.entries())
    .map(([key, v]) => ({ key, id: v.displayId, count: v.count }));

  /* 並び順を固定する。
     - 検索キーワードが変わったら順序記憶をリセットし、件数降順で初期順を確定
     - 同じ検索中は、最初に確定した順序（altOrderMap）を維持する
       → タップで件数が変わっても並びが動かない */
  if (altOrderKeyword !== currentKeyword) {
    altOrderKeyword = currentKeyword;
    altOrderMap = new Map();
    altIds.sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
    altIds.forEach((e, i) => altOrderMap.set(e.key, i));
  } else {
    // 既知のキーは記憶順、新規キーは末尾に追加して順序を確定
    altIds.forEach(e => {
      if (!altOrderMap.has(e.key)) altOrderMap.set(e.key, altOrderMap.size);
    });
    altIds.sort((a, b) => altOrderMap.get(a.key) - altOrderMap.get(b.key));
  }

  return { main: Array.from(mainMap.values()), altIds };
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

function mkSameUserBlock(entries) {
  const box = document.createElement("div");
  box.className = "same-user-block";

  const head = document.createElement("div");
  head.className = "same-user-head";
  head.textContent = "👤 同一人物かも（タップで表示中に追加・もう一度で解除）";
  box.appendChild(head);

  const list = document.createElement("div");
  list.className = "same-user-list";

  entries.forEach(({ key, id, count, active }) => {
    const btn = document.createElement("button");
    btn.className = "same-user-btn" + (active ? " active" : "");
    btn.type = "button";
    btn.setAttribute("aria-pressed", active ? "true" : "false");

    // 選択中はチェック、未選択はプラスのアイコンで見た目を明確に区別
    const mark = document.createElement("span");
    mark.className = "same-user-mark";
    mark.textContent = active ? "✓" : "＋";
    btn.appendChild(mark);

    const idSpan = document.createElement("span");
    idSpan.className = "same-user-id";
    setText(idSpan, "id:" + id);
    btn.appendChild(idSpan);

    const cnt = document.createElement("span");
    cnt.className = "same-user-count";
    setText(cnt, count + "件");
    btn.appendChild(cnt);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (activeIdSet.has(key)) {
        activeIdSet.delete(key);   // 解除
      } else {
        activeIdSet.add(key);      // 追加表示
      }
      pushUrl(currentKeyword, Array.from(activeIdSet));
      renderAll(currentKeyword);
      // スクロール位置は動かさない（タップした場所から飛ばないように）
    });

    list.appendChild(btn);
  });

  box.appendChild(list);
  return box;
}



/* ===== スレッドカード（PC=右ペイン展開 / モバイル=カード内展開） ===== */
function mkCard(thread, q, opts) {
  opts = opts || {};
  const card = document.createElement("div");
  card.className = "thread-result" + (opts.highlightNew ? " new-by-altid" : "");
  card.dataset.threadId = thread.thread_id;

  const hdr = document.createElement("div");
  hdr.className = "thread-header";

  /* 追加IDによって新たに現れたスレッドには目印バッジを付ける */
  if (opts.highlightNew) {
    const flag = document.createElement("span");
    flag.className = "new-by-altid-flag";
    flag.textContent = "👤 追加IDで表示";
    hdr.appendChild(flag);
  }


  const ta = document.createElement("div"); ta.className = "thread-title-area";
  const ts = document.createElement("span"); ts.className = "thread-title";
  hlSet(ts, thread.title || "スレッド " + thread.thread_id, q); ta.appendChild(ts);
  /* thread-url の行は削除（hayabusa.open2ch.net › ... を非表示） */
  const ml = document.createElement("div"); ml.className = "thread-meta-line";
  setText(ml, "更新: " + (thread.updated_at ? new Date(thread.updated_at).toLocaleDateString("ja-JP") : "")); ta.appendChild(ml);

  const ba = document.createElement("div"); ba.className = "thread-badge-area";
  const bk = document.createElement("span");
  if (thread.matchedPosts.length > 0) { bk.className = "badge-match"; setText(bk, thread.matchedPosts.length + "件ヒット"); }
  else { bk.className = "badge-title"; setText(bk, "タイトル一致"); }
  ba.appendChild(bk); hdr.appendChild(ta); hdr.appendChild(ba);

  const inlineDet = document.createElement("div");
  inlineDet.className = "thread-details-inline";
  inlineDet.style.display = "none";

  hdr.addEventListener("click", () => {
    const isMobile = window.matchMedia("(max-width: 900px)").matches;

    if (isMobile) {
      if (inlineDet.style.display === "block") {
        inlineDet.style.display = "none";
        inlineDet.innerHTML = "";
        card.classList.remove("selected");
      } else {
        inlineDet.innerHTML = "";
        inlineDet.appendChild(buildDetail(thread, q));
        inlineDet.style.display = "block";
        card.classList.add("selected");
      }
      return;
    }

    const pane = document.getElementById("detailPane");
    if (!pane) return;

    if (card.classList.contains("selected")) {
      card.classList.remove("selected");
      pane.innerHTML = "";
      return;
    }

    document.querySelectorAll(".thread-result.selected")
      .forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");

    pane.innerHTML = "";
    const title = document.createElement("div");
    title.className = "detail-pane-title";
    setText(title, thread.title || ("スレッド " + thread.thread_id));
    pane.appendChild(title);
    pane.appendChild(buildDetail(thread, q));
    pane.scrollTop = 0;
  });

  card.appendChild(hdr);
  card.appendChild(inlineDet);
  return card;
}

/* ===== 詳細DOMを生成 ===== */
function buildDetail(thread, q) {
  const det = document.createElement("div"); det.className = "thread-details";
  det.style.display = "block";

  const ab = document.createElement("div"); ab.className = "thread-action-bar";
  const lnk = document.createElement("a"); lnk.className = "thread-ext-link";
  lnk.href = "https://hayabusa.open2ch.net/test/read.cgi/livejupiter/" + thread.thread_id + "/";
  lnk.target = "_blank"; lnk.rel = "noopener noreferrer"; lnk.textContent = "↗ 元スレを開く";
  ab.appendChild(lnk);
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

  return det;
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
   レス要素
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
  const cpText = `${post.post_num}: ${decodeEntities(post.name || "名無し")} | 時刻: ${fmtDate(post.posted_at)} | ID:${post.user_id || "?"}${post.is_nusi ? " 主" : ""}\n${decodeEntities((post.body || "").trim())}`;
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

    (async () => {
      try {
        const cnt = await countAres(tid, post.post_num);
        if (cnt <= 0) return;
        setText(countSpan2, String(cnt));
        footer2.style.display = "";
      } catch (e) {}
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
  const lines = decodeEntities(bodyText).split("\n");
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
        appendUrlLink(container, tok.raw);
      } else if (tok.type === "imgujp") {
        const w = document.createElement("div"); w.className = "media-embed";
        const img = document.createElement("img");
        img.src = tok.raw; img.loading = "lazy";
        img.onerror = () => { w.style.display = "none"; }; w.appendChild(img); container.appendChild(w);
        appendUrlLink(container, tok.raw);
      } else if (tok.type === "youtube") {
        const w = document.createElement("div"); w.className = "media-embed";
        const fr = document.createElement("iframe");
        fr.src = "https://www.youtube.com/embed/" + tok.vid; fr.allowFullscreen = true; fr.loading = "lazy";
        w.appendChild(fr); container.appendChild(w);
        appendUrlLink(container, tok.raw);
      } else if (tok.type === "x") {
        appendXEmbed(container, tok.tid, tok.raw);
      } else if (tok.type === "url") {
        appendUrlLink(container, tok.raw);
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
  const xRe   = /https?:\/\/(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/(?:[A-Za-z0-9_]+|i\/web)\/status(?:es)?\/(\d+)/g;
  const urlRe = /https?:\/\/[^\s<>"'）」】]+/g;
  let m;
  const hits = [];
  ancRe.lastIndex = 0;  while ((m = ancRe.exec(line))  !== null) hits.push({ s: m.index, e: m.index + m[0].length, type: "anchor",  raw: m[0], num: m[1], pri: 0 });
  igRe.lastIndex = 0;   while ((m = igRe.exec(line))   !== null) hits.push({ s: m.index, e: m.index + m[0].length, type: "imgur",   raw: m[0], id: m[1],  pri: 1 });
  igjpRe.lastIndex = 0; while ((m = igjpRe.exec(line)) !== null) hits.push({ s: m.index, e: m.index + m[0].length, type: "imgujp",  raw: m[0], id: m[1],  pri: 1 });
  ytRe.lastIndex = 0;   while ((m = ytRe.exec(line))   !== null) hits.push({ s: m.index, e: m.index + m[0].length, type: "youtube", raw: m[0], vid: m[1], pri: 1 });
  xRe.lastIndex = 0;    while ((m = xRe.exec(line))    !== null) hits.push({ s: m.index, e: m.index + m[0].length, type: "x",       raw: m[0], tid: m[1], pri: 1 });
  urlRe.lastIndex = 0;  while ((m = urlRe.exec(line))  !== null) {
    const trimmed = m[0].replace(/[.,!?:;、。）)」』】>]+$/, "");
    hits.push({ s: m.index, e: m.index + trimmed.length, type: "url", raw: trimmed, pri: 2 });
  }
  hits.sort((a, b) => (a.s - b.s) || (a.pri - b.pri) || (b.e - a.e));
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
  text = decodeEntities(text);
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

/* ===== URLを安全にリンク化 ===== */
function appendUrlLink(container, url) {
  if (!url) return;
  let safe = false;
  try {
    const u = new URL(url);
    safe = (u.protocol === "http:" || u.protocol === "https:");
  } catch (e) { safe = false; }
  if (!safe) { container.appendChild(document.createTextNode(url)); return; }
  const a = document.createElement("a");
  a.href = url;
  a.textContent = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer nofollow";
  a.className = "body-link";
  container.appendChild(a);
}

/* ===== X / Twitter 埋め込み ===== */
function appendXEmbed(container, tweetId, rawUrl) {
  if (!tweetId) { appendUrlLink(container, rawUrl); return; }

  appendUrlLink(container, rawUrl);
  container.appendChild(document.createElement("br"));

  const w = document.createElement("div");
  w.className = "media-embed x-embed";

  const fr = document.createElement("iframe");
  fr.className = "x-embed-frame";
  fr.src = "https://platform.twitter.com/embed/Tweet.html?id=" + encodeURIComponent(tweetId) +
           "&theme=light&dnt=true&lang=ja";
  fr.loading = "lazy";
  fr.setAttribute("scrolling", "no");
  fr.setAttribute("frameborder", "0");
  fr.setAttribute("allowtransparency", "true");
  fr.title = "X post " + tweetId;
  fr.style.height = "320px";
  w.appendChild(fr);
  container.appendChild(w);

  let resized = false;
  const fallbackTimer = setTimeout(() => { if (!resized) {} }, 8000);

  if (!window.__xEmbedListenerAdded) {
    window.__xEmbedListenerAdded = true;
    window.addEventListener("message", function (e) {
      let host = "";
      try { host = new URL(e.origin).hostname; } catch (_) { return; }
      if (!/(^|\.)twitter\.com$|(^|\.)x\.com$/.test(host)) return;
      let data = e.data;
      try { if (typeof data === "string") data = JSON.parse(data); } catch (_) { return; }
      const payload = data && data["twttr.embed"];
      if (!payload || payload.method !== "twttr.private.resize") return;
      const p = (payload.params && payload.params[0]) || {};
      const h = p.height;
      const widgetId = p.data && p.data.tweet_id;
      if (!h) return;
      document.querySelectorAll("iframe.x-embed-frame").forEach(f => {
        if (widgetId && f.src.indexOf("id=" + widgetId) === -1) return;
        f.style.height = h + "px";
      });
    });
  }
  fr.addEventListener("load", () => { resized = true; clearTimeout(fallbackTimer); });
}

/* ===== PC時、固定バーのtopをヘッダー実高に合わせて自動設定 ===== */
function adjustStickyOffsets() {
  if (!window.matchMedia("(min-width: 901px)").matches) return;
  const header  = document.querySelector(".result-header");
  const options = document.querySelector(".search-options-bar");
  const stats   = document.querySelector(".result-stats-bar");
  const summary = document.querySelector(".search-summary");
  if (!header) return;

  const hH = header.offsetHeight;
  const oH = options ? options.offsetHeight : 0;
  const sH = stats ? stats.offsetHeight : 0;

  if (options) options.style.top = hH + "px";
  if (stats)   stats.style.top   = (hH + oH) + "px";

  const summaryVisible = summary && summary.style.display === "block";
  const summaryH = summaryVisible ? summary.offsetHeight : 0;
  if (summary) summary.style.top = (hH + oH + sH) + "px";

  const totalTop = hH + oH + sH + summaryH;
  const pane = document.querySelector(".detail-pane");
  if (pane) {
    pane.style.top = totalTop + "px";
    pane.style.maxHeight = `calc(100vh - ${totalTop + 8}px)`;
  }
}
window.addEventListener("resize", adjustStickyOffsets);
window.addEventListener("load", adjustStickyOffsets);
