"use strict";

/* ================================================================
   ID分析ページ — js/id-analysis.js
   - 開いたときに候補を含む全IDのデータを1回だけ取得
   - IDの含める／外すは手元のデータで絞り込んで再描画（通信なし）
   ================================================================ */

var SB_URL2 = "https://gentle-mouse-d138.1145148101919.workers.dev/db2";
var SB_KEY2 = "sb_publishable_3sdYGusaNdsOIkTybZQ_EjXs_w";
var DAYS_IDA = ["日","月","火","水","木","金","土"];

/* 同一人物かもで追加できるIDの上限・許可する文字 */
var IDA_MAX_EXTRA = 10;
var IDA_ID_RE = /^[A-Za-z0-9.+\/_-]{1,24}$/;

/* 状態 */
var idaState = null;      // 取得済みデータと選択状態
var idaCombined = false;  // 2つ以上のIDをまとめて表示中か
var idaTlOpen = false;    // タイムラインを開いているか（再描画しても維持）

/* ================================================================
   ユーティリティ
   ================================================================ */
function idaSetText(el, s) { el.textContent = (s == null) ? "" : String(s); }
function idaCE(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
function idaNormId(id) { return String(id || "").replace(/\./g, ""); }

function idaToYMD(date) {
  var yy = String(date.getFullYear()).slice(2).padStart(2,"0");
  var mm = String(date.getMonth()+1).padStart(2,"0");
  var dd = String(date.getDate()).padStart(2,"0");
  return yy + mm + dd;
}
function idaFromYMD(s) {
  if (!s || s.length !== 6) return null;
  return new Date(2000+parseInt(s.slice(0,2),10), parseInt(s.slice(2,4),10)-1, parseInt(s.slice(4,6),10));
}
function idaIsoDate(d) {
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function idaToday() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function idaTomorrow() { var d = idaToday(); d.setDate(d.getDate()+1); return d; }
function idaToJaDate(d) {
  return d.getFullYear()+"/"+(d.getMonth()+1)+"/"+d.getDate()+"("+DAYS_IDA[d.getDay()]+")";
}
function idaFmtDate(posted_at) {
  if (!posted_at) return "";
  var d = new Date(posted_at);
  if (isNaN(d.getTime())) return String(posted_at);
  var yy=String(d.getFullYear()).slice(2).padStart(2,"0");
  var mo=String(d.getMonth()+1).padStart(2,"0");
  var dy=String(d.getDate()).padStart(2,"0");
  var dow=DAYS_IDA[d.getDay()];
  var hh=String(d.getHours()).padStart(2,"0");
  var mi=String(d.getMinutes()).padStart(2,"0");
  var ss=String(d.getSeconds()).padStart(2,"0");
  return yy+"/"+mo+"/"+dy+"("+dow+") "+hh+":"+mi+":"+ss;
}
function idaFmtTime(posted_at) {
  if (!posted_at) return "";
  var d = new Date(posted_at);
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")+":"+String(d.getSeconds()).padStart(2,"0");
}
function idaEscHtml(s) { var d=document.createElement("div"); d.appendChild(document.createTextNode(s)); return d.innerHTML; }
function idaCharCount(body) { return (body||"").replace(/\n/g,"").length; }

var idaHasHover = !!(window.matchMedia && window.matchMedia("(hover:hover) and (pointer:fine)").matches);
var idaTraitTip = null;
function idaShowTraitTip(badge, text) {
  if (!idaTraitTip) { idaTraitTip = document.createElement("div"); idaTraitTip.className="ida-trait-tip"; document.body.appendChild(idaTraitTip); }
  idaSetText(idaTraitTip, text);
  idaTraitTip.style.display = "block";
  var r = badge.getBoundingClientRect();
  var tipR = idaTraitTip.getBoundingClientRect();
  var left = Math.max(8, Math.min(r.left + r.width/2 - tipR.width/2, window.innerWidth - tipR.width - 8));
  var top = r.top - tipR.height - 8;
  if (top < 8) top = r.bottom + 8;
  idaTraitTip.style.left = left + "px";
  idaTraitTip.style.top = top + "px";
}
function idaHideTraitTip() {
  if (idaTraitTip) idaTraitTip.style.display = "none";
  document.querySelectorAll(".ida-trait-badge.tip-open").forEach(function(b){ b.classList.remove("tip-open"); });
}
document.addEventListener("click", function(e){
  if (!e.target.closest || !e.target.closest(".ida-trait-badge")) idaHideTraitTip();
});
window.addEventListener("scroll", idaHideTraitTip, true);

/* ================================================================
   Supabase通信
   ================================================================ */
async function idaSbFetch(url, key, path) {
  var r = await fetch(url+"/rest/v1/"+path, {
    headers: {"apikey":key,"Authorization":"Bearer "+key}
  });
  if (!r.ok) throw new Error("HTTP "+r.status);
  return r.json();
}

/* ================================================================
   パラメータ
   - a  : 同一人物かもの候補ID（カンマ区切り）
   - x  : 分析から外すID（カンマ区切り。検索したIDも指定可）
   - ax : "0" のとき候補を全部外す（旧URL互換）
   ================================================================ */
function idaParseParams() {
  var p = new URLSearchParams(location.search);
  var userId = p.get("id")||"";
  var dParam = p.get("d")||"";
  var fromD, toD;
  if (!dParam) { fromD=idaToday(); toD=idaTomorrow(); }
  else {
    var parts=dParam.split("-");
    fromD=idaFromYMD(parts[0])||idaToday();
    toD=parts.length>=2 ? idaFromYMD(parts[1]) : new Date(fromD);
    toD.setDate(toD.getDate()+1);
  }

  var extraIds = [];
  var seen = {};
  seen[idaNormId(userId)] = true;
  (p.get("a")||"").split(",").forEach(function(s){
    s = s.trim();
    if (!IDA_ID_RE.test(s)) return;            // 想定外の文字を含むIDは捨てる
    var k = idaNormId(s);
    if (!k || seen[k]) return;                 // 重複・検索ID本人は除外
    seen[k] = true;
    if (extraIds.length < IDA_MAX_EXTRA) extraIds.push(s);
  });

  var allIds = [userId].concat(extraIds);

  var excluded = {};
  (p.get("x")||"").split(",").forEach(function(s){
    var k = idaNormId(s.trim());
    if (k) excluded[k] = true;
  });
  if (p.get("ax") === "0") extraIds.forEach(function(id){ excluded[idaNormId(id)] = true; });

  var selected = new Set();
  allIds.forEach(function(id){
    var k = idaNormId(id);
    if (!excluded[k]) selected.add(k);
  });
  if (!selected.size) selected.add(idaNormId(userId));   // 全部外れていたら検索IDを選ぶ

  return {userId:userId, from:fromD, to:toD, dParam:dParam, extraIds:extraIds, allIds:allIds, selected:selected};
}

/* ================================================================
   ID選択（通信なし・手元のデータで再描画）
   ================================================================ */
function idaToggleId(id) {
  var st = idaState;
  var k = idaNormId(id);
  if (st.selected.has(k)) {
    if (st.selected.size === 1) return;   // 最後の1つは外せない
    st.selected.delete(k);
  } else {
    st.selected.add(k);
  }

  var excludedIds = st.allIds.filter(function(e){ return !st.selected.has(idaNormId(e)); });
  var u = new URL(location.href);
  u.searchParams.delete("ax");
  if (excludedIds.length) u.searchParams.set("x", excludedIds.join(","));
  else u.searchParams.delete("x");
  history.replaceState(null, "", u.toString());

  idaRender();
}

function idaMkIncludeBar() {
  var st = idaState;
  var bar = idaCE("div", "ida-include-bar" + (idaCombined ? " on" : ""));

  var label = idaCE("span", "ida-include-label");
  idaSetText(label, "👤 同一人物かも");
  bar.appendChild(label);

  var ids = idaCE("div", "ida-include-ids");
  st.allIds.forEach(function(id, i){
    var k = idaNormId(id);
    var active = st.selected.has(k);
    var isMain = i === 0;
    var onlyOne = active && st.selected.size === 1;

    var btn = idaCE("button", "ida-include-id ida-include-pick" + (isMain ? " main" : "") + (active ? " on" : " off"));
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(active));
    if (onlyOne) {
      btn.disabled = true;
      btn.title = "最低1つは選択が必要です";
    } else {
      btn.title = active ? "クリックで分析から外す" : "クリックで分析に含める";
    }
    var c = st.idCounts.get(k) || 0;
    idaSetText(btn, (active ? "✓ " : "＋ ") + (isMain ? "🔍" : "") + "ID:" + id + " (" + c + ")");
    btn.addEventListener("click", function(){ idaToggleId(id); });
    ids.appendChild(btn);
  });
  bar.appendChild(ids);

  var note = idaCE("div", "ida-include-note");
  idaSetText(note, idaCombined
    ? "※✓のIDをまとめて集計中。別人が混ざっている可能性があります。順位はIDを1つだけ選んだときに表示します"
    : "※IDをタップすると、含める・外すを切り替えられます（🔍は検索したID）");
  bar.appendChild(note);
  return bar;
}

/* ================================================================
   取得（ページを開いたときに1回だけ）
   ================================================================ */
function idaGroupRanks(rows, countKey) {
  var m = new Map();
  (rows || []).forEach(function(r){
    var k = idaNormId(r.user_id);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push({ rank: r.rank, count: r[countKey] });
  });
  return m;
}

function idaBestRank(list) {
  var best = null;
  (list || []).forEach(function(r){ if (r.rank != null && (!best || r.rank < best.rank)) best = r; });
  return best;
}

async function runAnalysis() {
  var params = idaParseParams();
  var body = document.getElementById("idaBody");

  if (!params.userId) {
    body.innerHTML='<div class="ida-error">IDが指定されていません。</div>';
    return;
  }

  var backLink = document.getElementById("idaBack");
  backLink.href="index.html?s="+encodeURIComponent("id:"+params.userId)+"&t=i&m=t"
    +(params.dParam?"&d="+params.dParam:"")
    +(params.extraIds.length?"&a="+encodeURIComponent(params.extraIds.join(",")):"");

  body.replaceChildren();
  var loading=idaCE("div","ida-loading"); idaSetText(loading,"読み込み中…"); body.appendChild(loading);

  try {
    var ids = params.allIds;
    var userFilter = ids.length === 1
      ? "user_id=eq."+encodeURIComponent(ids[0])
      : "user_id=in.("+ids.map(function(id){ return encodeURIComponent('"'+id+'"'); }).join(",")+")";

    /* 書き込み（全IDまとめて1回） */
    var postsP = idaSbFetch(SB_URL,SB_KEY,
      "posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi"
      +"&"+userFilter
      +"&posted_at=gte."+params.from.toISOString()+"&posted_at=lt."+params.to.toISOString()
      +"&order=posted_at.asc&limit=2000");

    /* 順位（全ID・全日付を範囲指定でまとめて各1回） */
    var lastDay = new Date(params.to.getTime() - 86400000);
    var days = Math.max(1, Math.round((params.to - params.from) / 86400000));
    var rankQuery = "&date=gte."+idaIsoDate(params.from)+"&date=lte."+idaIsoDate(lastDay)
      +"&"+userFilter+"&limit="+Math.min(10000, days * ids.length + 10);
    var postRankP = idaSbFetch(SB_URL2,SB_KEY2,"id_rankings?select=rank,user_id,post_count"+rankQuery)
      .catch(function(){ return []; });
    var threadRankP = idaSbFetch(SB_URL2,SB_KEY2,"thread_rankings?select=rank,user_id,thread_count"+rankQuery)
      .catch(function(){ return []; });

    var results = await Promise.all([postsP, postRankP, threadRankP]);
    var posts = results[0];

    /* スレッド情報 */
    var threadIds=[]; var seenTid={};
    posts.forEach(function(p){if(!seenTid[p.thread_id]){seenTid[p.thread_id]=true;threadIds.push(p.thread_id);}});
    var threadInfoMap=new Map();
    for(var i=0;i<threadIds.length;i+=200){
      var batch=threadIds.slice(i,i+200);
      var ts=await idaSbFetch(SB_URL,SB_KEY,"threads?select=thread_id,title,updated_at&thread_id=in.("+batch.join(",")+")");
      ts.forEach(function(t){threadInfoMap.set(t.thread_id,t);});
    }

    var idCounts=new Map();
    posts.forEach(function(p){var k=idaNormId(p.user_id);idCounts.set(k,(idCounts.get(k)||0)+1);});

    idaState = {
      params: params,
      allIds: params.allIds,
      selected: params.selected,
      posts: posts,
      threadInfoMap: threadInfoMap,
      idCounts: idCounts,
      postRanks: idaGroupRanks(results[1], "post_count"),
      threadRanks: idaGroupRanks(results[2], "thread_count")
    };
    idaTlOpen = false;
    idaRender();

  } catch(e) {
    body.innerHTML='<div class="ida-error">読み込みに失敗しました: '+idaEscHtml(e.message)+'</div>';
  }
}

/* ================================================================
   描画（選択中のIDで絞り込んで表示）
   ================================================================ */
function idaRender() {
  var st = idaState;
  var params = st.params;
  var body = document.getElementById("idaBody");
  var scrollY = window.scrollY;

  var selIds = st.allIds.filter(function(id){ return st.selected.has(idaNormId(id)); });
  var primaryId = st.selected.has(idaNormId(params.userId)) ? params.userId : selIds[0];
  idaCombined = selIds.length > 1;

  var posts = st.posts.filter(function(p){ return st.selected.has(idaNormId(p.user_id)); });
  var threadInfoMap = st.threadInfoMap;

  document.title = "ID:"+primaryId+(idaCombined?" ほか"+(selIds.length-1)+"件":"")+" の分析 - Jeegle!";

  body.replaceChildren();

  /* トップバー */
  var fromDisp=idaToJaDate(params.from);
  var toDisp=idaToJaDate(new Date(params.to.getTime()-86400000));
  var dateDisp=(fromDisp===toDisp)?fromDisp:fromDisp+" 〜 "+toDisp;

  var topBar=idaCE("div","ida-topbar");
  var idBadge=idaCE("div","ida-id-badge");
  idaSetText(idBadge,"ID:"+primaryId+(idaCombined?" ＋"+(selIds.length-1):""));
  topBar.appendChild(idBadge);
  var dateBadge=idaCE("div","ida-date-badge"); idaSetText(dateBadge,dateDisp); topBar.appendChild(dateBadge);
  var cpId=idaCE("button","ida-copy-id-btn"); idaSetText(cpId,"📋 IDコピー");
  cpId.addEventListener("click",function(){
    navigator.clipboard.writeText("ID:" + primaryId).then(function(){
      idaSetText(cpId,"✅ コピー完了"); setTimeout(function(){idaSetText(cpId,"📋 IDコピー");},1500);
    }).catch(function(){prompt("IDをコピー:","ID:" + primaryId);});
  });
  topBar.appendChild(cpId);
  body.appendChild(topBar);

  /* ID選択バー */
  if (st.allIds.length > 1) body.appendChild(idaMkIncludeBar());

  if (!posts.length) {
    var empty=idaCE("div","ida-error");
    idaSetText(empty,"選択中のIDの書き込みが見つかりませんでした。");
    body.appendChild(empty);
    window.scrollTo(0, scrollY);
    return;
  }

  /* ===== 集計 ===== */
  var totalPosts=posts.length;
  var threadsMade=posts.filter(function(p){return p.post_num===1&&p.is_nusi;});
  var firstPost=posts[0];
  var lastPost=posts[posts.length-1];

  var hourCounts=new Array(24).fill(0);
  posts.forEach(function(p){hourCounts[new Date(p.posted_at).getHours()]++;});
  var peakHour=0,peakVal=0;
  hourCounts.forEach(function(c,h){if(c>peakVal){peakVal=c;peakHour=h;}});

  var hourRanked=hourCounts.map(function(c,h){return{h:h,c:c};}).sort(function(a,b){return b.c-a.c;});
  var activeHoursText=hourRanked.slice(0,3).filter(function(x){return x.c>0;}).map(function(x){return x.h+"時("+x.c+")";}).join(", ");

  /* 平均間隔 */
  var avgInterval="—";
  if(posts.length>=2){
    var first=new Date(posts[0].posted_at).getTime();
    var last=new Date(posts[posts.length-1].posted_at).getTime();
    var avgMin=Math.round((last-first)/60000/(posts.length-1));
    if(avgMin<60) avgInterval=avgMin+"分";
    else avgInterval=Math.floor(avgMin/60)+"時間"+(avgMin%60)+"分";
  }

  /* 活動時間 = 書き込みがあった時間帯の数 × 1時間（累計） */
  var activeHourCount = hourCounts.filter(function(c){ return c > 0; }).length;
  var activeDuration = activeHourCount + "時間";

  /* 安価 */
  var totalAnchors=0;
  posts.forEach(function(p){var m=(p.body||"").match(/>>\d+/g);if(m)totalAnchors+=m.length;});

  /* スレッド別レス数 */
  var threadPostCounts=new Map();
  posts.forEach(function(p){threadPostCounts.set(p.thread_id,(threadPostCounts.get(p.thread_id)||0)+1);});
  var threadList=Array.from(threadPostCounts.entries()).map(function(e){
    var info=threadInfoMap.get(e[0])||{title:"スレッド "+e[0]};
    var isNusi=threadsMade.some(function(tm){return tm.thread_id===e[0];});
    return{thread_id:e[0],title:info.title,count:e[1],isNusi:isNusi};
  }).sort(function(a,b){return b.count-a.count;});

  var commonWords=idaExtractWords(threadList);

  /* 順位はID単体の値なので、1つだけ選んでいるときだけ出す */
  var bestPostRank=null, bestThreadRank=null;
  if (!idaCombined) {
    var pk = idaNormId(primaryId);
    bestPostRank = idaBestRank(st.postRanks.get(pk));
    bestThreadRank = idaBestRank(st.threadRanks.get(pk));
  }

  /* ===== 属性判定 (id-traits.js) ===== */
  var traits = idaCalcTraits(posts, threadList, threadsMade, hourCounts, totalPosts);

  /* メトリクス */
  var metrics=idaCE("div","ida-metrics");
  metrics.appendChild(idaMkMetric("💬",String(totalPosts),"レス数","blue"));
  metrics.appendChild(idaMkMetric("📝",String(threadsMade.length),"スレ立て","green"));
  metrics.appendChild(idaMkMetric("📂",String(threadList.length),"参加スレ","purple"));
  metrics.appendChild(idaMkMetric("⏱",avgInterval,"平均間隔","orange"));
  metrics.appendChild(idaMkMetric("⏳",activeDuration,"活動時間(累計)","teal"));
  metrics.appendChild(idaMkMetric("🔗",String(totalAnchors),"安価数","cyan"));
  if(bestPostRank){
    var rkL=bestPostRank.rank<=3?["","🥇","🥈","🥉"][bestPostRank.rank]:"#"+bestPostRank.rank;
    metrics.appendChild(idaMkMetric("🏆",rkL,"レス数順位","gold"));
  }
  if(bestThreadRank){
    var tkL=bestThreadRank.rank<=3?["","🥇","🥈","🥉"][bestThreadRank.rank]:"#"+bestThreadRank.rank;
    metrics.appendChild(idaMkMetric("🏅",tkL,"スレ立て順位","gold"));
  }
  body.appendChild(metrics);

  /* 最初/最後/最長レス */
  var flSection=idaCE("div","ida-fl-section");
  flSection.appendChild(idaMkHighlightPost("📍 最初のレス ("+idaFmtTime(firstPost.posted_at)+")", firstPost, threadInfoMap, primaryId));
  flSection.appendChild(idaMkHighlightPost("🏁 最後のレス ("+idaFmtTime(lastPost.posted_at)+")", lastPost, threadInfoMap, primaryId));
  var longestPost=posts[0];
  posts.forEach(function(p){if(idaCharCount(p.body)>idaCharCount(longestPost.body))longestPost=p;});
  if(longestPost!==firstPost&&longestPost!==lastPost){
    flSection.appendChild(idaMkHighlightPost("📏 最長レス ("+idaCharCount(longestPost.body)+"字)", longestPost, threadInfoMap, primaryId));
  }
  body.appendChild(flSection);

  /* ===== グリッド ===== */
  var grid=idaCE("div","ida-grid");

  /* 左: 時間帯チャート + 属性 */
  var chartCard=idaCE("div","ida-card ida-card-chart");
  var chartTitle=idaCE("div","ida-card-title"); idaSetText(chartTitle,"🕐 書き込み時間帯"); chartCard.appendChild(chartTitle);

  var chartWrap=idaCE("div","ida-barchart-wrap");
  var chartBody=idaCE("div","ida-barchart");
  var maxH=Math.max.apply(null,hourCounts)||1;
  for(var h=0;h<24;h++){
    var col=idaCE("div","ida-bar-col");
    var val=idaCE("div","ida-bar-val"); idaSetText(val,hourCounts[h]>0?String(hourCounts[h]):""); col.appendChild(val);
    var barOuter=idaCE("div","ida-bar-outer");
    var barInner=idaCE("div","ida-bar-inner");
    barInner.style.height=Math.max(Math.round((hourCounts[h]/maxH)*100),0)+"%";
    if(hourCounts[h]===0){ barInner.style.height="2%"; barInner.style.background="#e8eaed"; }
    else if(h===peakHour) barInner.style.background="#ea4335";
    else if(h>=0&&h<=5) barInner.style.background="#5c6bc0";
    barOuter.appendChild(barInner); col.appendChild(barOuter);
    var lbl=idaCE("div","ida-bar-lbl"); idaSetText(lbl,String(h)); col.appendChild(lbl);
    chartBody.appendChild(col);
  }
  chartWrap.appendChild(chartBody);
  chartCard.appendChild(chartWrap);

  var peakNote=idaCE("div","ida-chart-note");
  idaSetText(peakNote,"🔥 ピーク: "+peakHour+"時台 ("+peakVal+"レス) | Top: "+activeHoursText);
  chartCard.appendChild(peakNote);

  /* 属性バッジ (チャートの下・最大10件表示) */
  if(traits.length>0){
    var traitSection=idaCE("div","ida-trait-section");
    var traitTitle=idaCE("div","ida-card-title"); traitTitle.style.marginTop="10px";
    idaSetText(traitTitle,"🏷️ ユーザー属性"); traitSection.appendChild(traitTitle);
    var traitWrap=idaCE("div","ida-trait-wrap");
    traits.forEach(function(tr){
      var badge=idaCE("div","ida-trait-badge");
      badge.dataset.rarity = tr.rarity; // レア度(1〜5)を属性として保持
      var bIcon=idaCE("span","ida-trait-icon"); bIcon.textContent=tr.icon; badge.appendChild(bIcon);
      var bName=idaCE("span","ida-trait-name"); idaSetText(bName,tr.name); badge.appendChild(bName);
      var tipText = (tr.rarity >= 3 ? "★" + tr.rarity + " | " : "") + tr.desc;
      if (idaHasHover) {
        badge.addEventListener("mouseenter",function(){ idaShowTraitTip(badge,tipText); });
        badge.addEventListener("mouseleave",idaHideTraitTip);
      } else {
        badge.addEventListener("click",function(e){
          e.stopPropagation();
          var wasOpen = badge.classList.contains("tip-open");
          idaHideTraitTip();
          if (!wasOpen) { idaShowTraitTip(badge,tipText); badge.classList.add("tip-open"); }
        });
      }
      traitWrap.appendChild(badge);
    });
    traitSection.appendChild(traitWrap);
    chartCard.appendChild(traitSection);
  }
  grid.appendChild(chartCard);

  /* 右上: スレッド一覧 */
  var threadCard=idaCE("div","ida-card ida-card-threads");
  var threadCardTitle=idaCE("div","ida-card-title"); idaSetText(threadCardTitle,"💬 書き込みスレッド ("+threadList.length+"スレ)"); threadCard.appendChild(threadCardTitle);
  var threadInner=idaCE("div","ida-thread-list");
  var showCount=Math.min(threadList.length,10);
  for(var ti=0;ti<showCount;ti++){
    threadInner.appendChild(idaMkThreadRow(threadList[ti],ti+1,primaryId));
  }
  if(threadList.length>showCount){
    var moreBtn=idaCE("button","ida-thread-more-btn");
    idaSetText(moreBtn,"▼ 残り "+(threadList.length-showCount)+"スレを表示");
    moreBtn.addEventListener("click",function(){
      moreBtn.style.display="none";
      for(var mi=showCount;mi<threadList.length;mi++) threadInner.appendChild(idaMkThreadRow(threadList[mi],mi+1,primaryId));
    });
    threadInner.appendChild(moreBtn);
  }
  threadCard.appendChild(threadInner);
  grid.appendChild(threadCard);

  /* 右下: ワード + スレ立て */
  var subCard=idaCE("div","ida-card ida-card-sub");

  if(commonWords.length>0){
    var wordBlock=idaCE("div","ida-sub-block");
    var wordT=idaCE("div","ida-card-title ida-card-title-sm"); idaSetText(wordT,"🔤 スレタイ共通ワード"); wordBlock.appendChild(wordT);
    var chips=idaCE("div","ida-chips");
    commonWords.forEach(function(w){
      var chip=idaCE("span","ida-chip"); chip.textContent=w[0];
      var cx=idaCE("span","ida-chip-x"); idaSetText(cx,"×"+w[1]); chip.appendChild(cx);
      chips.appendChild(chip);
    });
    wordBlock.appendChild(chips);
    subCard.appendChild(wordBlock);
  }

  if(threadsMade.length>0){
    var nusiBlock=idaCE("div","ida-sub-block");
    var nusiT=idaCE("div","ida-card-title ida-card-title-sm"); idaSetText(nusiT,"📝 スレ立て ("+threadsMade.length+"件)"); nusiBlock.appendChild(nusiT);
    var nusiList=idaCE("div","ida-nusi-list");
    threadsMade.slice(0,6).forEach(function(tm){
      var info=threadInfoMap.get(tm.thread_id)||{};
      var r=idaCE("div","ida-nusi-row");
      var a=idaCE("a","ida-thread-link");
      a.href="https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+tm.thread_id+"/?id="+encodeURIComponent(tm.user_id||primaryId);
      a.target="_blank"; a.rel="noopener noreferrer";
      idaSetText(a,info.title||"スレッド "+tm.thread_id);
      r.appendChild(a);
      /* まとめて表示中は、どのIDで立てたかを出す */
      if(idaCombined){
        var by=idaCE("span","ida-post-id ida-made-by");
        idaSetText(by,"ID:"+(tm.user_id||"?"));
        r.appendChild(by);
      }
      nusiList.appendChild(r);
    });
    if(threadsMade.length>6){
      var nm=idaCE("div","ida-thread-more"); idaSetText(nm,"… 他 "+(threadsMade.length-6)+"件"); nusiList.appendChild(nm);
    }
    nusiBlock.appendChild(nusiList);
    subCard.appendChild(nusiBlock);
  }

  if(subCard.children.length>0) grid.appendChild(subCard);
  body.appendChild(grid);

  /* タイムライン（開いていた状態は再描画後も維持） */
  var tlSection=idaCE("div","ida-tl-section");
  var tlTitle=idaCE("div","ida-tl-title"); idaSetText(tlTitle,"📋 レスタイムライン ("+totalPosts+"件)");
  tlSection.appendChild(tlTitle);
  var tlToggle=idaCE("button","ida-tl-toggle");
  tlSection.appendChild(tlToggle);
  var tlBody=idaCE("div","ida-tl-body"); tlSection.appendChild(tlBody);

  var buildTl = function(){
    if(tlBody.dataset.built) return;
    tlBody.dataset.built="1";
    posts.forEach(function(p){
      var info=threadInfoMap.get(p.thread_id)||{};
      tlBody.appendChild(idaMkPost(p,info.title||"スレッド "+p.thread_id,primaryId));
    });
  };
  var paintTl = function(){
    tlBody.classList.toggle("open", idaTlOpen);
    idaSetText(tlToggle, idaTlOpen ? "▼ 折りたたむ" : "▶ 全レスを展開");
    if(idaTlOpen) buildTl();
  };
  tlToggle.addEventListener("click",function(){ idaTlOpen = !idaTlOpen; paintTl(); });
  paintTl();
  body.appendChild(tlSection);

  window.scrollTo(0, scrollY);
}

/* ================================================================
   共通ワード抽出
   ================================================================ */
function idaExtractWords(threadList) {
  var wordFreq=new Map();
  threadList.forEach(function(t){
    var ws=(t.title||"").match(/[\u30A0-\u30FF]{2,}|[\u4E00-\u9FFF]{2,}|[a-zA-Z]{3,}/g)||[];
    var wordSeen=new Set();
    ws.forEach(function(w){var low=w.toLowerCase();if(!wordSeen.has(low)){wordSeen.add(low);wordFreq.set(low,(wordFreq.get(low)||0)+1);}});
  });
  return Array.from(wordFreq.entries()).filter(function(e){return e[1]>=2;}).sort(function(a,b){return b[1]-a[1];}).slice(0,12);
}

/* ================================================================
   メトリクスカード
   ================================================================ */
function idaMkMetric(icon, value, label, color) {
  var card=idaCE("div","ida-metric"); card.dataset.color=color;
  var ic=idaCE("div","ida-metric-icon"); ic.textContent=icon; card.appendChild(ic);
  var v=idaCE("div","ida-metric-val"); idaSetText(v,value); card.appendChild(v);
  var l=idaCE("div","ida-metric-label"); idaSetText(l,label); card.appendChild(l);
  return card;
}

/* ================================================================
   スレッド行
   ================================================================ */
function idaMkThreadRow(t, rank, userId) {
  var row=idaCE("div","ida-thread-row");
  var rankNum=idaCE("span","ida-thread-rank"); idaSetText(rankNum,String(rank)); row.appendChild(rankNum);
  var titleLink=idaCE("a","ida-thread-link");
  /* まとめて表示中は複数IDなので、IDで絞らずスレを開く */
  titleLink.href="https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+t.thread_id+"/"
    +(idaCombined?"":"?id="+encodeURIComponent(userId));
  titleLink.target="_blank"; titleLink.rel="noopener noreferrer";
  idaSetText(titleLink,t.title); row.appendChild(titleLink);
  if(t.isNusi){var nTag=idaCE("span","ida-nusi-tag");idaSetText(nTag,"主");row.appendChild(nTag);}
  var cntBadge=idaCE("span","ida-thread-cnt"); idaSetText(cntBadge,t.count+"レス"); row.appendChild(cntBadge);
  return row;
}

/* ================================================================
   レスのメタ行（ハイライト・タイムライン共通）
   ================================================================ */
function idaAppendPostMeta(meta, post) {
  var num=idaCE("span","ida-post-num"); idaSetText(num,post.post_num+":");
  num.addEventListener("click",function(){window.open("https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+post.thread_id+"/"+post.post_num+"-","_blank");});
  meta.appendChild(num); meta.appendChild(document.createTextNode(" "));
  var nmEl=idaCE("span",""); nmEl.style.color="#008000"; idaSetText(nmEl,post.name||"名無し"); meta.appendChild(nmEl);
  meta.appendChild(document.createTextNode(" | "+idaFmtDate(post.posted_at)));
  /* まとめて表示中は、どのIDの書き込みか分かるようにIDも出す */
  if(idaCombined){
    var idEl=idaCE("span","ida-post-id"); idaSetText(idEl," | ID:"+(post.user_id||"?")); meta.appendChild(idEl);
  }
  if(post.is_nusi){var nusi=idaCE("span","ida-nusi-tag");nusi.style.marginLeft="4px";idaSetText(nusi,"主");meta.appendChild(nusi);}
}

/* ================================================================
   ハイライトレス
   ================================================================ */
function idaMkHighlightPost(titleText, post, threadInfoMap, userId) {
  var card=idaCE("div","ida-hl-card");
  var header=idaCE("div","ida-hl-header"); idaSetText(header,titleText); card.appendChild(header);
  var info=threadInfoMap.get(post.thread_id)||{};
  var threadLine=idaCE("div","ida-hl-thread");
  var threadLink=idaCE("a","ida-thread-link");
  threadLink.href="https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+post.thread_id+"/?id="+encodeURIComponent(post.user_id||userId);
  threadLink.target="_blank"; threadLink.rel="noopener noreferrer";
  idaSetText(threadLink,"📌 "+(info.title||"スレッド "+post.thread_id));
  threadLine.appendChild(threadLink); card.appendChild(threadLine);
  var meta=idaCE("div","ida-hl-meta");
  idaAppendPostMeta(meta, post);
  card.appendChild(meta);
  var bodyEl=idaCE("div","ida-hl-body");
  var bodyText=(post.body||"").trim();
  if(bodyText.length>300) bodyText=bodyText.slice(0,300)+"…";
  idaSetText(bodyEl,bodyText); card.appendChild(bodyEl);
  return card;
}

/* ================================================================
   タイムラインレス
   ================================================================ */
function idaMkPost(post, threadTitle, userId) {
  var div=idaCE("div","ida-post");
  var threadLine=idaCE("div","ida-post-thread");
  var threadLink=idaCE("a","");
  threadLink.href="https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+post.thread_id+"/?id="+encodeURIComponent(post.user_id||userId);
  threadLink.target="_blank"; threadLink.rel="noopener noreferrer";
  idaSetText(threadLink,"📌 "+threadTitle); threadLine.appendChild(threadLink); div.appendChild(threadLine);
  var meta=idaCE("div","ida-post-meta");
  idaAppendPostMeta(meta, post);
  div.appendChild(meta);
  var bodyEl=idaCE("div","ida-post-body"); idaSetText(bodyEl,(post.body||"").trim()); div.appendChild(bodyEl);
  return div;
}

/* ================================================================
   URL共有
   ================================================================ */
document.getElementById("idaShareBtn").addEventListener("click",function(){
  var btn=this;
  navigator.clipboard.writeText(location.href).then(function(){
    var orig=btn.textContent; idaSetText(btn,"✅ コピー完了"); setTimeout(function(){idaSetText(btn,orig);},2000);
  }).catch(function(){prompt("URLをコピーしてください:",location.href);});
});

/* ================================================================
   初期化
   ================================================================ */
runAnalysis();
