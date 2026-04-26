"use strict";

/* ================================================================
   ID分析ページ — js/id-analysis.js
   ================================================================
   URLパラメータ:
     ?id=USERID&d=260425  or  ?id=USERID&d=260420-260426
   ================================================================ */

/* ===== Supabase設定 (config.jsから SB_URL, SB_KEY を利用) ===== */
var SB_URL2 = "https://magmwtxzsbguzpoosjof.supabase.co";
var SB_KEY2 = "sb_publishable_OyXecLIdNaCUJo2Mry2WOQ_wXt20zTm";

var DAYS_IDA = ["日","月","火","水","木","金","土"];

/* ================================================================
   ユーティリティ
   ================================================================ */
function idaSetText(el, s) { el.textContent = (s == null) ? "" : String(s); }

function idaToYMD(date) {
  var yy = String(date.getFullYear()).slice(2).padStart(2,"0");
  var mm = String(date.getMonth()+1).padStart(2,"0");
  var dd = String(date.getDate()).padStart(2,"0");
  return yy + mm + dd;
}

function idaFromYMD(s) {
  if (!s || s.length !== 6) return null;
  return new Date(
    2000 + parseInt(s.slice(0,2),10),
    parseInt(s.slice(2,4),10) - 1,
    parseInt(s.slice(4,6),10)
  );
}

function idaToday() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function idaTomorrow() {
  var d = idaToday();
  d.setDate(d.getDate() + 1);
  return d;
}

function idaToJaDate(d) {
  var dow = DAYS_IDA[d.getDay()];
  return d.getFullYear() + "/" + (d.getMonth()+1) + "/" + d.getDate() + "(" + dow + ")";
}

function idaFmtDate(posted_at) {
  if (!posted_at) return "";
  var d = new Date(posted_at);
  if (isNaN(d.getTime())) return String(posted_at);
  var yy  = String(d.getFullYear()).slice(2).padStart(2,"0");
  var mo  = String(d.getMonth()+1).padStart(2,"0");
  var dy  = String(d.getDate()).padStart(2,"0");
  var dow = DAYS_IDA[d.getDay()];
  var hh  = String(d.getHours()).padStart(2,"0");
  var mi  = String(d.getMinutes()).padStart(2,"0");
  var ss  = String(d.getSeconds()).padStart(2,"0");
  return yy + "/" + mo + "/" + dy + "(" + dow + ") " + hh + ":" + mi + ":" + ss;
}

function idaEscHtml(s) {
  var d = document.createElement("div");
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}

/* ================================================================
   Supabase通信
   ================================================================ */
async function idaSbFetch(url, key, path) {
  var r = await fetch(url + "/rest/v1/" + path, {
    headers: { "apikey": key, "Authorization": "Bearer " + key }
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

/* ================================================================
   パラメータ解析
   ================================================================ */
function idaParseParams() {
  var p = new URLSearchParams(location.search);
  var userId = p.get("id") || "";
  var dParam = p.get("d") || "";

  var fromD, toD;
  if (!dParam) {
    fromD = idaToday();
    toD = idaTomorrow();
  } else {
    var parts = dParam.split("-");
    fromD = idaFromYMD(parts[0]) || idaToday();
    toD = parts.length >= 2 ? idaFromYMD(parts[1]) : new Date(fromD);
    toD.setDate(toD.getDate() + 1);
  }
  return { userId: userId, from: fromD, to: toD, dParam: dParam };
}

/* ================================================================
   メイン分析処理
   ================================================================ */
async function runAnalysis() {
  var params = idaParseParams();
  var body = document.getElementById("idaBody");

  if (!params.userId) {
    body.innerHTML = '<div class="ida-error">IDが指定されていません。</div>';
    return;
  }

  /* 戻るリンク設定 */
  var backLink = document.getElementById("idaBack");
  backLink.href = "index.html?s=" + encodeURIComponent("id:" + params.userId)
    + "&t=h&m=t"
    + (params.dParam ? "&d=" + params.dParam : "");

  document.title = "ID:" + params.userId + " の分析 - Jeegle!";

  try {
    var fromISO = params.from.toISOString();
    var toISO   = params.to.toISOString();

    /* -------------------------------------------------------
       1) このIDの全レス取得
       ------------------------------------------------------- */
    var postsPromise = idaSbFetch(SB_URL, SB_KEY,
      "posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi"
      + "&user_id=eq." + encodeURIComponent(params.userId)
      + "&posted_at=gte." + fromISO
      + "&posted_at=lt." + toISO
      + "&order=posted_at.asc&limit=2000"
    );

    /* -------------------------------------------------------
       2) ランキング取得 (期間内の各日)
       ------------------------------------------------------- */
    var rankDates = [];
    var tmpD = new Date(params.from);
    while (tmpD < params.to) {
      rankDates.push(new Date(tmpD));
      tmpD.setDate(tmpD.getDate() + 1);
    }

    var postRankPromises = rankDates.map(function(rd) {
      var iso = rd.getFullYear() + "-"
        + String(rd.getMonth()+1).padStart(2,"0") + "-"
        + String(rd.getDate()).padStart(2,"0");
      return idaSbFetch(SB_URL2, SB_KEY2,
        "id_rankings?select=rank,user_id,post_count&date=eq." + iso
        + "&user_id=eq." + encodeURIComponent(params.userId) + "&limit=1"
      ).then(function(rows) { return { date: rd, row: rows[0] || null }; })
       .catch(function()    { return { date: rd, row: null }; });
    });

    var threadRankPromises = rankDates.map(function(rd) {
      var iso = rd.getFullYear() + "-"
        + String(rd.getMonth()+1).padStart(2,"0") + "-"
        + String(rd.getDate()).padStart(2,"0");
      return idaSbFetch(SB_URL2, SB_KEY2,
        "thread_rankings?select=rank,user_id,thread_count&date=eq." + iso
        + "&user_id=eq." + encodeURIComponent(params.userId) + "&limit=1"
      ).then(function(rows) { return { date: rd, row: rows[0] || null }; })
       .catch(function()    { return { date: rd, row: null }; });
    });

    /* -------------------------------------------------------
       3) 全データ並列取得
       ------------------------------------------------------- */
    var results = await Promise.all([
      postsPromise,
      Promise.all(postRankPromises),
      Promise.all(threadRankPromises)
    ]);
    var posts       = results[0];
    var postRanks   = results[1];
    var threadRanks = results[2];

    if (!posts.length) {
      body.innerHTML = '<div class="ida-error">ID:'
        + idaEscHtml(params.userId)
        + ' の書き込みが見つかりませんでした。</div>';
      return;
    }

    /* -------------------------------------------------------
       4) スレッド情報取得
       ------------------------------------------------------- */
    var threadIds = [];
    var seen = {};
    posts.forEach(function(p) {
      if (!seen[p.thread_id]) { seen[p.thread_id] = true; threadIds.push(p.thread_id); }
    });

    var threadInfoMap = new Map();
    for (var i = 0; i < threadIds.length; i += 20) {
      var batch = threadIds.slice(i, i + 20);
      var ts = await idaSbFetch(SB_URL, SB_KEY,
        "threads?select=thread_id,title,updated_at&thread_id=in.(" + batch.join(",") + ")"
      );
      ts.forEach(function(t) { threadInfoMap.set(t.thread_id, t); });
    }

    /* -------------------------------------------------------
       5) データ集計
       ------------------------------------------------------- */
    var totalPosts = posts.length;

    /* スレ立て判定 */
    var threadsMade = posts.filter(function(p) {
      return p.post_num === 1 && p.is_nusi;
    });

    /* 時間帯集計 */
    var hourCounts = new Array(24).fill(0);
    posts.forEach(function(p) {
      var h = new Date(p.posted_at).getHours();
      hourCounts[h]++;
    });

    /* スレッド別レス数 */
    var threadPostCounts = new Map();
    posts.forEach(function(p) {
      threadPostCounts.set(p.thread_id, (threadPostCounts.get(p.thread_id) || 0) + 1);
    });
    var threadList = Array.from(threadPostCounts.entries()).map(function(e) {
      var info = threadInfoMap.get(e[0]) || { title: "スレッド " + e[0], updated_at: null };
      var isNusi = threadsMade.some(function(tm) { return tm.thread_id === e[0]; });
      return { thread_id: e[0], title: info.title, count: e[1], isNusi: isNusi };
    }).sort(function(a, b) { return b.count - a.count; });

    /* 共通ワード抽出 (スレタイから頻出語) */
    var wordFreq = new Map();
    threadList.forEach(function(t) {
      var ws = (t.title || "").match(/[\u30A0-\u30FF]{2,}|[\u4E00-\u9FFF]{2,}|[a-zA-Z]{3,}/g) || [];
      var wordSeen = new Set();
      ws.forEach(function(w) {
        var low = w.toLowerCase();
        if (!wordSeen.has(low)) {
          wordSeen.add(low);
          wordFreq.set(low, (wordFreq.get(low) || 0) + 1);
        }
      });
    });
    var commonWords = Array.from(wordFreq.entries())
      .filter(function(e) { return e[1] >= 2; })
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 15);

    /* ランキングデータ整理 */
    var bestPostRank = null;
    var bestThreadRank = null;
    postRanks.forEach(function(pr) {
      if (pr.row && (!bestPostRank || pr.row.rank < bestPostRank.rank)) {
        bestPostRank = { rank: pr.row.rank, count: pr.row.post_count, date: pr.date };
      }
    });
    threadRanks.forEach(function(tr) {
      if (tr.row && (!bestThreadRank || tr.row.rank < bestThreadRank.rank)) {
        bestThreadRank = { rank: tr.row.rank, count: tr.row.thread_count, date: tr.date };
      }
    });

    /* -------------------------------------------------------
       6) 描画開始
       ------------------------------------------------------- */
    body.innerHTML = "";

    var fromDisp = idaToJaDate(params.from);
    var toDisp   = idaToJaDate(new Date(params.to.getTime() - 86400000));
    var dateDisp = (fromDisp === toDisp) ? fromDisp : fromDisp + " 〜 " + toDisp;

    /* ===== ヒーローカード ===== */
    var hero = document.createElement("div"); hero.className = "ida-hero";

    var heroIcon = document.createElement("div"); heroIcon.className = "ida-hero-icon";
    heroIcon.textContent = "🆔";
    hero.appendChild(heroIcon);

    var heroInfo = document.createElement("div"); heroInfo.className = "ida-hero-info";
    var heroId = document.createElement("div"); heroId.className = "ida-hero-id";
    idaSetText(heroId, "ID:" + params.userId);
    heroInfo.appendChild(heroId);
    var heroDate = document.createElement("div"); heroDate.className = "ida-hero-date";
    idaSetText(heroDate, "期間: " + dateDisp);
    heroInfo.appendChild(heroDate);
    hero.appendChild(heroInfo);

    var heroStats = document.createElement("div"); heroStats.className = "ida-hero-stats";

    var statPost = document.createElement("div"); statPost.className = "ida-stat-card";
    var statPostNum = document.createElement("div"); statPostNum.className = "ida-stat-num";
    idaSetText(statPostNum, String(totalPosts));
    statPost.appendChild(statPostNum);
    var statPostLabel = document.createElement("div"); statPostLabel.className = "ida-stat-label";
    idaSetText(statPostLabel, "レス数");
    statPost.appendChild(statPostLabel);
    heroStats.appendChild(statPost);

    var statThread = document.createElement("div"); statThread.className = "ida-stat-card";
    var statThreadNum = document.createElement("div"); statThreadNum.className = "ida-stat-num";
    idaSetText(statThreadNum, String(threadsMade.length));
    statThread.appendChild(statThreadNum);
    var statThreadLabel = document.createElement("div"); statThreadLabel.className = "ida-stat-label";
    idaSetText(statThreadLabel, "スレ立て数");
    statThread.appendChild(statThreadLabel);
    heroStats.appendChild(statThread);

    var statIn = document.createElement("div"); statIn.className = "ida-stat-card";
    var statInNum = document.createElement("div"); statInNum.className = "ida-stat-num";
    idaSetText(statInNum, String(threadList.length));
    statIn.appendChild(statInNum);
    var statInLabel = document.createElement("div"); statInLabel.className = "ida-stat-label";
    idaSetText(statInLabel, "参加スレ数");
    statIn.appendChild(statInLabel);
    heroStats.appendChild(statIn);

    hero.appendChild(heroStats);
    body.appendChild(hero);

    /* ===== ランキング順位 ===== */
    if (bestPostRank || bestThreadRank) {
      var rankSec = document.createElement("div"); rankSec.className = "ida-section";
      var rankTitle = document.createElement("div"); rankTitle.className = "ida-section-title";
      var rankIcon = document.createElement("span"); rankIcon.className = "ida-section-icon";
      rankIcon.textContent = "🏆";
      rankTitle.appendChild(rankIcon);
      rankTitle.appendChild(document.createTextNode(" ランキング順位"));
      rankSec.appendChild(rankTitle);

      if (bestPostRank) {
        rankSec.appendChild(idaMkRankRow(
          bestPostRank.rank,
          "レス数ランキング (" + idaToJaDate(bestPostRank.date) + ")",
          bestPostRank.count + " レス"
        ));
      }
      if (bestThreadRank) {
        rankSec.appendChild(idaMkRankRow(
          bestThreadRank.rank,
          "スレ立てランキング (" + idaToJaDate(bestThreadRank.date) + ")",
          bestThreadRank.count + " スレ"
        ));
      }
      body.appendChild(rankSec);
    }

    /* ===== 時間帯チャート ===== */
    var hourSec = document.createElement("div"); hourSec.className = "ida-section";
    var hourTitle = document.createElement("div"); hourTitle.className = "ida-section-title";
    var hourIcon = document.createElement("span"); hourIcon.className = "ida-section-icon";
    hourIcon.textContent = "🕐";
    hourTitle.appendChild(hourIcon);
    hourTitle.appendChild(document.createTextNode(" 書き込み時間帯"));
    hourSec.appendChild(hourTitle);

    var chart = document.createElement("div"); chart.className = "ida-hour-chart";
    var maxH = Math.max.apply(null, hourCounts) || 1;
    for (var h = 0; h < 24; h++) {
      var wrap = document.createElement("div"); wrap.className = "ida-hour-bar-wrap";

      var cntLabel = document.createElement("div"); cntLabel.className = "ida-hour-count";
      idaSetText(cntLabel, hourCounts[h] > 0 ? String(hourCounts[h]) : "");
      wrap.appendChild(cntLabel);

      var bar = document.createElement("div"); bar.className = "ida-hour-bar";
      bar.style.height = Math.round((hourCounts[h] / maxH) * 100) + "%";
      if (hourCounts[h] === 0) bar.style.background = "#e0e0e0";
      wrap.appendChild(bar);

      var lbl = document.createElement("div"); lbl.className = "ida-hour-label";
      idaSetText(lbl, String(h));
      wrap.appendChild(lbl);

      chart.appendChild(wrap);
    }
    hourSec.appendChild(chart);
    body.appendChild(hourSec);

    /* ===== スレ立て一覧 ===== */
    if (threadsMade.length > 0) {
      var nusiSec = document.createElement("div"); nusiSec.className = "ida-section";
      var nusiTitle = document.createElement("div"); nusiTitle.className = "ida-section-title";
      var nusiIcon = document.createElement("span"); nusiIcon.className = "ida-section-icon";
      nusiIcon.textContent = "📝";
      nusiTitle.appendChild(nusiIcon);
      nusiTitle.appendChild(document.createTextNode(" スレ立て一覧 (" + threadsMade.length + "件)"));
      nusiSec.appendChild(nusiTitle);

      var nusiTable = document.createElement("table"); nusiTable.className = "ida-thread-table";
      var nusiThead = document.createElement("thead");
      var nusiHtr = document.createElement("tr");
      var nusiTh1 = document.createElement("th"); idaSetText(nusiTh1, "スレッドタイトル");
      var nusiTh2 = document.createElement("th"); idaSetText(nusiTh2, "レス数");
      nusiTh2.style.cssText = "width:60px;text-align:right;";
      nusiHtr.appendChild(nusiTh1); nusiHtr.appendChild(nusiTh2);
      nusiThead.appendChild(nusiHtr); nusiTable.appendChild(nusiThead);

      var nusiTbody = document.createElement("tbody");
      threadsMade.forEach(function(tm) {
        var info = threadInfoMap.get(tm.thread_id) || {};
        var cnt  = threadPostCounts.get(tm.thread_id) || 0;
        var tr = document.createElement("tr");

        var tdTitle = document.createElement("td");
        var a = document.createElement("a"); a.className = "ida-thread-title-link";
        a.href = "https://hayabusa.open2ch.net/test/read.cgi/livejupiter/" + tm.thread_id + "/";
        a.target = "_blank"; a.rel = "noopener noreferrer";
        idaSetText(a, info.title || "スレッド " + tm.thread_id);
        tdTitle.appendChild(a);
        tr.appendChild(tdTitle);

        var tdCnt = document.createElement("td");
        tdCnt.style.cssText = "text-align:right;font-weight:600;";
        idaSetText(tdCnt, String(cnt));
        tr.appendChild(tdCnt);

        nusiTbody.appendChild(tr);
      });
      nusiTable.appendChild(nusiTbody);
      nusiSec.appendChild(nusiTable);
      body.appendChild(nusiSec);
    }

    /* ===== 参加スレッド一覧 ===== */
    var threadSec = document.createElement("div"); threadSec.className = "ida-section";
    var threadSecTitle = document.createElement("div"); threadSecTitle.className = "ida-section-title";
    var threadSecIcon = document.createElement("span"); threadSecIcon.className = "ida-section-icon";
    threadSecIcon.textContent = "💬";
    threadSecTitle.appendChild(threadSecIcon);
    threadSecTitle.appendChild(document.createTextNode(" 書き込みスレッド一覧 (" + threadList.length + "件)"));
    threadSec.appendChild(threadSecTitle);

    var threadTable = document.createElement("table"); threadTable.className = "ida-thread-table";
    var tThead = document.createElement("thead");
    var tHtr = document.createElement("tr");
    var tTh1 = document.createElement("th"); idaSetText(tTh1, "スレッドタイトル");
    var tTh2 = document.createElement("th"); idaSetText(tTh2, "レス数");
    tTh2.style.cssText = "width:60px;text-align:right;";
    tHtr.appendChild(tTh1); tHtr.appendChild(tTh2);
    tThead.appendChild(tHtr); threadTable.appendChild(tThead);

    var tTbody = document.createElement("tbody");
    threadList.forEach(function(t) {
      var tr = document.createElement("tr");

      var tdTitle = document.createElement("td");
      var a = document.createElement("a"); a.className = "ida-thread-title-link";
      a.href = "https://hayabusa.open2ch.net/test/read.cgi/livejupiter/" + t.thread_id + "/";
      a.target = "_blank"; a.rel = "noopener noreferrer";
      idaSetText(a, t.title);
      tdTitle.appendChild(a);
      if (t.isNusi) {
        var nusiTag = document.createElement("span"); nusiTag.className = "ida-thread-nusi";
        idaSetText(nusiTag, "主");
        tdTitle.appendChild(nusiTag);
      }
      tr.appendChild(tdTitle);

      var tdCnt = document.createElement("td");
      tdCnt.style.cssText = "text-align:right;font-weight:600;";
      idaSetText(tdCnt, String(t.count));
      tr.appendChild(tdCnt);

      tTbody.appendChild(tr);
    });
    threadTable.appendChild(tTbody);
    threadSec.appendChild(threadTable);
    body.appendChild(threadSec);

    /* ===== スレタイ共通ワード ===== */
    if (commonWords.length > 0) {
      var wordSec = document.createElement("div"); wordSec.className = "ida-section";
      var wordTitle = document.createElement("div"); wordTitle.className = "ida-section-title";
      var wordIcon = document.createElement("span"); wordIcon.className = "ida-section-icon";
      wordIcon.textContent = "🔤";
      wordTitle.appendChild(wordIcon);
      wordTitle.appendChild(document.createTextNode(" スレタイ共通ワード"));
      wordSec.appendChild(wordTitle);

      var wordWrap = document.createElement("div"); wordWrap.className = "ida-words";
      commonWords.forEach(function(w) {
        var chip = document.createElement("span"); chip.className = "ida-word-chip";
        chip.textContent = w[0];
        var countSpan = document.createElement("span"); countSpan.className = "ida-word-chip-count";
        idaSetText(countSpan, "×" + w[1]);
        chip.appendChild(countSpan);
        wordWrap.appendChild(chip);
      });
      wordSec.appendChild(wordWrap);
      body.appendChild(wordSec);
    }

    /* ===== 全レス一覧（折りたたみ） ===== */
    var postsSec = document.createElement("div"); postsSec.className = "ida-section";
    var postsSecTitle = document.createElement("div"); postsSecTitle.className = "ida-section-title";
    var postsSecIcon = document.createElement("span"); postsSecIcon.className = "ida-section-icon";
    postsSecIcon.textContent = "📋";
    postsSecTitle.appendChild(postsSecIcon);
    postsSecTitle.appendChild(document.createTextNode(" 全レス一覧"));
    postsSec.appendChild(postsSecTitle);

    var toggleBtn = document.createElement("button"); toggleBtn.className = "ida-posts-toggle";
    idaSetText(toggleBtn, "▶ " + totalPosts + "件のレスを表示する");
    postsSec.appendChild(toggleBtn);

    var postsList = document.createElement("div"); postsList.className = "ida-posts-list";
    postsSec.appendChild(postsList);

    toggleBtn.addEventListener("click", function() {
      var isOpen = postsList.classList.contains("open");
      if (isOpen) {
        postsList.classList.remove("open");
        idaSetText(toggleBtn, "▶ " + totalPosts + "件のレスを表示する");
      } else {
        postsList.classList.add("open");
        idaSetText(toggleBtn, "▼ レスを折りたたむ");
        if (!postsList.dataset.built) {
          postsList.dataset.built = "1";
          posts.forEach(function(p) {
            var info = threadInfoMap.get(p.thread_id) || {};
            postsList.appendChild(idaMkPost(p, info.title || "スレッド " + p.thread_id));
          });
        }
      }
    });

    body.appendChild(postsSec);

  } catch (e) {
    body.innerHTML = '<div class="ida-error">データの読み込みに失敗しました: '
      + idaEscHtml(e.message) + '</div>';
  }
}

/* ================================================================
   ランキング行ヘルパー
   ================================================================ */
function idaMkRankRow(rank, labelText, valText) {
  var row = document.createElement("div"); row.className = "ida-rank-row";

  var pos = document.createElement("div"); pos.className = "ida-rank-pos";
  if (rank <= 3) {
    idaSetText(pos, ["","🥇","🥈","🥉"][rank]);
  } else {
    idaSetText(pos, "#" + rank);
  }
  row.appendChild(pos);

  var lab = document.createElement("div"); lab.className = "ida-rank-label";
  idaSetText(lab, labelText);
  row.appendChild(lab);

  var val = document.createElement("div"); val.className = "ida-rank-val";
  idaSetText(val, valText);
  row.appendChild(val);

  return row;
}

/* ================================================================
   レス要素（分析ページ用・簡易版）
   ================================================================ */
function idaMkPost(post, threadTitle) {
  var div = document.createElement("div");
  div.style.cssText = "border-top:1px dashed #e0e0e0;padding:10px 0;";

  /* スレッドタイトル行 */
  var threadLine = document.createElement("div");
  threadLine.style.cssText = "font-size:12px;color:#1a73e8;margin-bottom:4px;font-weight:600;";
  var threadLink = document.createElement("a");
  threadLink.href = "https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"
    + post.thread_id + "/";
  threadLink.target = "_blank";
  threadLink.rel = "noopener noreferrer";
  threadLink.style.cssText = "color:#1a73e8;text-decoration:none;";
  idaSetText(threadLink, "📌 " + threadTitle);
  threadLine.appendChild(threadLink);
  div.appendChild(threadLine);

  /* メタ行 */
  var meta = document.createElement("div");
  meta.style.cssText = "font-size:12px;color:#5f6368;margin-bottom:6px;";

  var num = document.createElement("span");
  num.style.cssText = "font-weight:700;color:#1a73e8;cursor:pointer;";
  idaSetText(num, post.post_num + ":");
  num.addEventListener("click", function() {
    window.open(
      "https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"
      + post.thread_id + "/" + post.post_num + "-",
      "_blank"
    );
  });
  meta.appendChild(num);
  meta.appendChild(document.createTextNode(" "));

  var nm = document.createElement("span");
  nm.style.color = "#008000";
  idaSetText(nm, post.name || "名無し");
  meta.appendChild(nm);

  meta.appendChild(document.createTextNode(" | " + idaFmtDate(post.posted_at)));

  if (post.is_nusi) {
    var nusi = document.createElement("span");
    nusi.style.cssText = "background:#ea4335;color:#fff;font-size:10px;"
      + "padding:1px 5px;border-radius:3px;margin-left:4px;";
    idaSetText(nusi, "主");
    meta.appendChild(nusi);
  }
  div.appendChild(meta);

  /* 本文 */
  var bodyEl = document.createElement("div");
  bodyEl.style.cssText = "font-size:14px;line-height:1.7;background:#fafafa;"
    + "padding:8px 10px;border-radius:4px;white-space:pre-wrap;"
    + "word-wrap:break-word;color:#202124;";
  idaSetText(bodyEl, (post.body || "").trim());
  div.appendChild(bodyEl);

  return div;
}

/* ================================================================
   URL共有ボタン
   ================================================================ */
document.getElementById("idaShareBtn").addEventListener("click", function() {
  var btn = this;
  navigator.clipboard.writeText(location.href).then(function() {
    var orig = btn.textContent;
    idaSetText(btn, "✅ コピー完了");
    setTimeout(function() { idaSetText(btn, orig); }, 2000);
  }).catch(function() {
    prompt("URLをコピーしてください:", location.href);
  });
});

/* ================================================================
   初期化
   ================================================================ */
runAnalysis();
