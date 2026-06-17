"use strict";

/* ================================================================
   ID分析ページ — js/id-analysis.js
   ================================================================ */

var SB_URL2 = "https://fdwceaeqrscbwcwsqrff.supabase.co";
var SB_KEY2 = "sb_publishable_oEIPHntQ7TjrZTybZEjXtQ_Ojd8PrTO";
var DAYS_IDA = ["日","月","火","水","木","金","土"];

/* ================================================================
   ユーティリティ
   ================================================================ */
function idaSetText(el, s) { el.textContent = (s == null) ? "" : String(s); }
function idaCE(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

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
  return {userId:userId, from:fromD, to:toD, dParam:dParam};
}

/* ================================================================
   メイン
   ================================================================ */
async function runAnalysis() {
  var params = idaParseParams();
  var body = document.getElementById("idaBody");

  if (!params.userId) {
    body.innerHTML='<div class="ida-error">IDが指定されていません。</div>';
    return;
  }

  var backLink = document.getElementById("idaBack");
  backLink.href="index.html?s="+encodeURIComponent("id:"+params.userId)+"&t=h&m=t"+(params.dParam?"&d="+params.dParam:"");
  document.title="ID:"+params.userId+" の分析 - Jeegle!";

  try {
    var fromISO=params.from.toISOString();
    var toISO=params.to.toISOString();

    var postsPromise = idaSbFetch(SB_URL,SB_KEY,
      "posts?select=thread_id,post_num,user_id,name,posted_at,body,is_nusi"
      +"&user_id=eq."+encodeURIComponent(params.userId)
      +"&posted_at=gte."+fromISO+"&posted_at=lt."+toISO
      +"&order=posted_at.asc&limit=2000");

    var rankDates=[];
    var tmpD=new Date(params.from);
    while(tmpD<params.to){rankDates.push(new Date(tmpD));tmpD.setDate(tmpD.getDate()+1);}

    var postRankP=rankDates.map(function(rd){
      var iso=rd.getFullYear()+"-"+String(rd.getMonth()+1).padStart(2,"0")+"-"+String(rd.getDate()).padStart(2,"0");
      return idaSbFetch(SB_URL2,SB_KEY2,"id_rankings?select=rank,user_id,post_count&date=eq."+iso+"&user_id=eq."+encodeURIComponent(params.userId)+"&limit=1")
        .then(function(r){return{date:rd,row:r[0]||null};}).catch(function(){return{date:rd,row:null};});
    });
    var threadRankP=rankDates.map(function(rd){
      var iso=rd.getFullYear()+"-"+String(rd.getMonth()+1).padStart(2,"0")+"-"+String(rd.getDate()).padStart(2,"0");
      return idaSbFetch(SB_URL2,SB_KEY2,"thread_rankings?select=rank,user_id,thread_count&date=eq."+iso+"&user_id=eq."+encodeURIComponent(params.userId)+"&limit=1")
        .then(function(r){return{date:rd,row:r[0]||null};}).catch(function(){return{date:rd,row:null};});
    });

    var results=await Promise.all([postsPromise,Promise.all(postRankP),Promise.all(threadRankP)]);
    var posts=results[0], postRanks=results[1], threadRanks=results[2];

    if (!posts.length) {
      body.innerHTML='<div class="ida-error">ID:'+idaEscHtml(params.userId)+' の書き込みが見つかりませんでした。</div>';
      return;
    }

    /* スレッド情報 */
    var threadIds=[]; var seenTid={};
    posts.forEach(function(p){if(!seenTid[p.thread_id]){seenTid[p.thread_id]=true;threadIds.push(p.thread_id);}});
    var threadInfoMap=new Map();
    for(var i=0;i<threadIds.length;i+=20){
      var batch=threadIds.slice(i,i+20);
      var ts=await idaSbFetch(SB_URL,SB_KEY,"threads?select=thread_id,title,updated_at&thread_id=in.("+batch.join(",")+")");
      ts.forEach(function(t){threadInfoMap.set(t.thread_id,t);});
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

    var bestPostRank=null, bestThreadRank=null;
    postRanks.forEach(function(pr){if(pr.row&&(!bestPostRank||pr.row.rank<bestPostRank.rank))bestPostRank={rank:pr.row.rank,count:pr.row.post_count,date:pr.date};});
    threadRanks.forEach(function(tr){if(tr.row&&(!bestThreadRank||tr.row.rank<bestThreadRank.rank))bestThreadRank={rank:tr.row.rank,count:tr.row.thread_count,date:tr.date};});

    /* ===== 属性判定 (id-traits.js) ===== */
    var traits = idaCalcTraits(posts, threadList, threadsMade, hourCounts, totalPosts);

    /* ===== 描画 ===== */
    body.innerHTML="";

    var fromDisp=idaToJaDate(params.from);
    var toDisp=idaToJaDate(new Date(params.to.getTime()-86400000));
    var dateDisp=(fromDisp===toDisp)?fromDisp:fromDisp+" 〜 "+toDisp;

    /* トップバー */
    var topBar=idaCE("div","ida-topbar");
    var idBadge=idaCE("div","ida-id-badge"); idaSetText(idBadge,"ID:"+params.userId); topBar.appendChild(idBadge);
    var dateBadge=idaCE("div","ida-date-badge"); idaSetText(dateBadge,dateDisp); topBar.appendChild(dateBadge);
    var cpId=idaCE("button","ida-copy-id-btn"); idaSetText(cpId,"📋 IDコピー");
    cpId.addEventListener("click",function(){
      navigator.clipboard.writeText("ID:" + params.userId).then(function(){
        idaSetText(cpId,"✅ コピー完了"); setTimeout(function(){idaSetText(cpId,"📋 IDコピー");},1500);
      }).catch(function(){prompt("IDをコピー:","ID:" + params.userId);});
    });
    topBar.appendChild(cpId);
    body.appendChild(topBar);

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
    flSection.appendChild(idaMkHighlightPost("📍 最初のレス ("+idaFmtTime(firstPost.posted_at)+")", firstPost, threadInfoMap, params.userId));
    flSection.appendChild(idaMkHighlightPost("🏁 最後のレス ("+idaFmtTime(lastPost.posted_at)+")", lastPost, threadInfoMap, params.userId));
    var longestPost=posts[0];
    posts.forEach(function(p){if(idaCharCount(p.body)>idaCharCount(longestPost.body))longestPost=p;});
    if(longestPost!==firstPost&&longestPost!==lastPost){
      flSection.appendChild(idaMkHighlightPost("📏 最長レス ("+idaCharCount(longestPost.body)+"字)", longestPost, threadInfoMap, params.userId));
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

    /* 属性バッジ (チャートの下) */
    if(traits.length>0){
      var traitSection=idaCE("div","ida-trait-section");
      var traitTitle=idaCE("div","ida-card-title"); traitTitle.style.marginTop="10px";
      idaSetText(traitTitle,"🏷️ ユーザー属性"); traitSection.appendChild(traitTitle);
      var traitWrap=idaCE("div","ida-trait-wrap");
traits.forEach(function(tr){
        var badge=idaCE("div","ida-trait-badge");
        var bIcon=idaCE("span","ida-trait-icon"); bIcon.textContent=tr.icon; badge.appendChild(bIcon);
        var bName=idaCE("span","ida-trait-name"); idaSetText(bName,tr.name); badge.appendChild(bName);
        if (idaHasHover) {
          badge.addEventListener("mouseenter",function(){ idaShowTraitTip(badge,tr.desc); });
          badge.addEventListener("mouseleave",idaHideTraitTip);
        } else {
          badge.addEventListener("click",function(e){
            e.stopPropagation();
            var wasOpen = badge.classList.contains("tip-open");
            idaHideTraitTip();
            if (!wasOpen) { idaShowTraitTip(badge,tr.desc); badge.classList.add("tip-open"); }
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
      threadInner.appendChild(idaMkThreadRow(threadList[ti],ti+1,params.userId));
    }
    if(threadList.length>showCount){
      var moreBtn=idaCE("button","ida-thread-more-btn");
      idaSetText(moreBtn,"▼ 残り "+(threadList.length-showCount)+"スレを表示");
      (function(sb,sl,sc,uid){
        moreBtn.addEventListener("click",function(){
          moreBtn.style.display="none";
          for(var mi=sc;mi<sl.length;mi++) threadInner.appendChild(idaMkThreadRow(sl[mi],mi+1,uid));
        });
      })(moreBtn,threadList,showCount,params.userId);
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
        a.href="https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+tm.thread_id+"/?id="+encodeURIComponent(params.userId);
        a.target="_blank"; a.rel="noopener noreferrer";
        idaSetText(a,info.title||"スレッド "+tm.thread_id); r.appendChild(a);
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

    /* タイムライン */
    var tlSection=idaCE("div","ida-tl-section");
    var tlTitle=idaCE("div","ida-tl-title"); idaSetText(tlTitle,"📋 レスタイムライン ("+totalPosts+"件)");
    tlSection.appendChild(tlTitle);
    var tlToggle=idaCE("button","ida-tl-toggle"); idaSetText(tlToggle,"▶ 全レスを展開");
    tlSection.appendChild(tlToggle);
    var tlBody=idaCE("div","ida-tl-body"); tlSection.appendChild(tlBody);
    tlToggle.addEventListener("click",function(){
      if(tlBody.classList.contains("open")){
        tlBody.classList.remove("open"); idaSetText(tlToggle,"▶ 全レスを展開");
      } else {
        tlBody.classList.add("open"); idaSetText(tlToggle,"▼ 折りたたむ");
        if(!tlBody.dataset.built){
          tlBody.dataset.built="1";
          posts.forEach(function(p){
            var info=threadInfoMap.get(p.thread_id)||{};
            tlBody.appendChild(idaMkPost(p,info.title||"スレッド "+p.thread_id,params.userId));
          });
        }
      }
    });
    body.appendChild(tlSection);

  } catch(e) {
    body.innerHTML='<div class="ida-error">読み込みに失敗しました: '+idaEscHtml(e.message)+'</div>';
  }
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
  titleLink.href="https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+t.thread_id+"/?id="+encodeURIComponent(userId);
  titleLink.target="_blank"; titleLink.rel="noopener noreferrer";
  idaSetText(titleLink,t.title); row.appendChild(titleLink);
  if(t.isNusi){var nTag=idaCE("span","ida-nusi-tag");idaSetText(nTag,"主");row.appendChild(nTag);}
  var cntBadge=idaCE("span","ida-thread-cnt"); idaSetText(cntBadge,t.count+"レス"); row.appendChild(cntBadge);
  return row;
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
  threadLink.href="https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+post.thread_id+"/?id="+encodeURIComponent(userId);
  threadLink.target="_blank"; threadLink.rel="noopener noreferrer";
  idaSetText(threadLink,"📌 "+(info.title||"スレッド "+post.thread_id));
  threadLine.appendChild(threadLink); card.appendChild(threadLine);
  var meta=idaCE("div","ida-hl-meta");
  var num=idaCE("span","ida-post-num"); idaSetText(num,post.post_num+":");
  num.addEventListener("click",function(){window.open("https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+post.thread_id+"/"+post.post_num+"-","_blank");});
  meta.appendChild(num); meta.appendChild(document.createTextNode(" "));
  var nmEl=idaCE("span",""); nmEl.style.color="#008000"; idaSetText(nmEl,post.name||"名無し"); meta.appendChild(nmEl);
  meta.appendChild(document.createTextNode(" | "+idaFmtDate(post.posted_at)));
  if(post.is_nusi){var nusi=idaCE("span","ida-nusi-tag");nusi.style.marginLeft="4px";idaSetText(nusi,"主");meta.appendChild(nusi);}
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
  threadLink.href="https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+post.thread_id+"/?id="+encodeURIComponent(userId);
  threadLink.target="_blank"; threadLink.rel="noopener noreferrer";
  idaSetText(threadLink,"📌 "+threadTitle); threadLine.appendChild(threadLink); div.appendChild(threadLine);
  var meta=idaCE("div","ida-post-meta");
  var num=idaCE("span","ida-post-num"); idaSetText(num,post.post_num+":");
  num.addEventListener("click",function(){window.open("https://hayabusa.open2ch.net/test/read.cgi/livejupiter/"+post.thread_id+"/"+post.post_num+"-","_blank");});
  meta.appendChild(num); meta.appendChild(document.createTextNode(" "));
  var nmEl=idaCE("span",""); nmEl.style.color="#008000"; idaSetText(nmEl,post.name||"名無し"); meta.appendChild(nmEl);
  meta.appendChild(document.createTextNode(" | "+idaFmtDate(post.posted_at)));
  if(post.is_nusi){var nusi=idaCE("span","ida-nusi-tag");nusi.style.marginLeft="4px";idaSetText(nusi,"主");meta.appendChild(nusi);}
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
