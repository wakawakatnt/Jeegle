/* ===== media/modal.js — モーダル表示 ===== */
"use strict";

var MediaModal = (function(){
  var U = MediaUtil;
  var D = MediaDetect;
  var modalIdx = -1;

  /* ── Twitter widgets.js 管理 ── */
  var _twttrLoading = null;
  var _twttrFailed = false;

  function loadTwitterWidgets() {
    if (_twttrFailed) return Promise.reject(new Error("twttr blocked"));
    if (window.twttr && window.twttr.widgets) return Promise.resolve(window.twttr);
    if (_twttrLoading) return _twttrLoading;
    _twttrLoading = new Promise(function(resolve, reject){
      var done = false;
      var timer = setTimeout(function(){
        if (done) return; done = true;
        _twttrFailed = true;
        reject(new Error("twttr load timeout"));
      }, 6000);
      var s = document.createElement("script");
      s.src = "https://platform.twitter.com/widgets.js";
      s.async = true; s.charset = "utf-8";
      s.onload = function(){
        if (done) return; done = true; clearTimeout(timer);
        if (window.twttr && window.twttr.widgets) resolve(window.twttr);
        else { _twttrFailed = true; reject(new Error("twttr not ready")); }
      };
      s.onerror = function(){
        if (done) return; done = true; clearTimeout(timer);
        _twttrFailed = true; reject(new Error("twttr load failed"));
      };
      document.head.appendChild(s);
    });
    return _twttrLoading;
  }

  function appendTweetFallback(wrap, url, msg) {
    var fb = document.createElement("div");
    fb.className = "md-tweet-fallback";
    if (msg) { var m = document.createElement("div"); m.textContent = msg; fb.appendChild(m); }
    var open = document.createElement("a");
    open.href = url; open.target = "_blank"; open.rel = "noopener";
    open.textContent = "🔗 X で開く";
    open.style.cssText = "display:inline-block;margin-top:6px;padding:8px 16px;background:#1da1f2;color:#fff;border-radius:20px;text-decoration:none;font-weight:700;font-size:13px;";
    fb.appendChild(open);
    wrap.appendChild(fb);
  }

  function renderTweet(wrap, url) {
    var tid = D.tweetId(url);
    if (!tid) { appendTweetFallback(wrap, url, "X のツイートIDを取得できませんでした"); return; }

    var box = document.createElement("div");
    box.className = "md-tweet-box";
    var bq = document.createElement("blockquote");
    bq.className = "twitter-tweet";
    bq.setAttribute("data-lang", "ja");
    bq.setAttribute("data-dnt", "true");
    bq.setAttribute("data-conversation", "none");
    bq.style.cssText = "margin:0 auto;";
    var a = document.createElement("a");
    a.href = "https://twitter.com/i/status/" + tid;
    a.textContent = "X のツイートを表示";
    bq.appendChild(a);
    box.appendChild(bq);

    var loading = document.createElement("div");
    loading.style.cssText = "padding:24px;text-align:center;color:#5f6368;font-size:13px;";
    loading.innerHTML = 'X のツイートを読み込み中… <span class="md-spinner"></span>';
    box.appendChild(loading);
    wrap.appendChild(box);

    var settled = false;
    var safetyTimer = setTimeout(function(){
      if (settled) return;
      if (!box.querySelector("iframe")) {
        settled = true;
        if (loading.parentNode) loading.parentNode.removeChild(loading);
        var note = document.createElement("div");
        note.style.cssText = "padding:12px 16px;text-align:center;color:#c5221f;font-size:12px;border-top:1px solid #eee;";
        note.textContent = "X 埋め込みを読み込めませんでした（広告ブロッカー等でブロックされている可能性があります）";
        box.appendChild(note);
        appendTweetFallback(wrap, url, "");
      }
    }, 8000);

    loadTwitterWidgets().then(function(twttr){
      twttr.widgets.load(box).then(function(){
        if (settled) return; settled = true; clearTimeout(safetyTimer);
        if (loading.parentNode) loading.parentNode.removeChild(loading);
        if (!box.querySelector("iframe")) {
          var note2 = document.createElement("div");
          note2.style.cssText = "padding:12px 16px;text-align:center;color:#5f6368;font-size:12px;border-top:1px solid #eee;";
          note2.textContent = "このツイートは削除されたか、非公開の可能性があります";
          box.appendChild(note2);
        }
      }).catch(function(){
        if (settled) return; settled = true; clearTimeout(safetyTimer);
        if (loading.parentNode) loading.parentNode.removeChild(loading);
        appendTweetFallback(wrap, url, "X のツイート読み込みに失敗しました");
      });
    }).catch(function(){
      if (settled) return; settled = true; clearTimeout(safetyTimer);
      if (loading.parentNode) loading.parentNode.removeChild(loading);
      var note3 = document.createElement("div");
      note3.style.cssText = "padding:12px 16px;text-align:center;color:#c5221f;font-size:12px;border-top:1px solid #eee;";
      note3.textContent = "X 埋め込みスクリプトが読み込めません（広告ブロッカーが platform.twitter.com をブロックしています）";
      box.appendChild(note3);
    });
  }

  /* ── モーダルメディア破棄 ── */
  function cleanupModalMedia() {
    var wrap = U.$("mdModalMedia");
    if (!wrap) return;
    var ifrs = wrap.querySelectorAll("iframe");
    for (var i = 0; i < ifrs.length; i++) if (ifrs[i]._cleanup) ifrs[i]._cleanup();
    var vids = wrap.querySelectorAll("video");
    for (var j = 0; j < vids.length; j++) {
      try { vids[j].pause(); vids[j].src = ""; vids[j].load(); } catch(e){}
    }
  }

  /* ── 開く ── */
  function open(idx) {
    var filtered = MediaGrid.getFiltered();
    if (idx < 0 || idx >= filtered.length) return;
    cleanupModalMedia();
    modalIdx = idx;
    var item = filtered[idx];
    var kind = item._k;
    var url = item.url || "";
    var wrap = U.$("mdModalMedia");
    wrap.innerHTML = "";

    if (kind === "video") {
      var prov = D.detectVideoProvider(url);
      if (prov === "youtube") {
        var yid = D.youtubeId(url);
        if (yid) {
          var ifr = document.createElement("iframe");
          ifr.className = "md-iframe-video";
          ifr.src = "https://www.youtube.com/embed/" + yid + "?autoplay=1";
          ifr.allow = "autoplay; encrypted-media; picture-in-picture";
          ifr.allowFullscreen = true;
          wrap.appendChild(ifr);
        } else wrap.appendChild(MediaGrid.makePlaceholder(kind));
      } else if (prov === "niconico") {
        var nid = D.nicoId(url);
        if (nid) {
          var ifr2 = document.createElement("iframe");
          ifr2.className = "md-iframe-video";
          ifr2.src = "https://embed.nicovideo.jp/watch/" + nid;
          ifr2.allowFullscreen = true;
          wrap.appendChild(ifr2);
        } else wrap.appendChild(MediaGrid.makePlaceholder(kind));
      } else if (prov === "file" || D.isVideoExt(url)) {
        var v = document.createElement("video");
        v.referrerPolicy = "no-referrer";
        v.src = url; v.controls = true; v.autoplay = true; v.playsInline = true;
        wrap.appendChild(v);
      } else {
        wrap.appendChild(MediaGrid.makePlaceholder(kind));
      }
    } else if (kind === "twitter") {
      renderTweet(wrap, url);
    } else if (kind === "image") {
      if (D.isVideoExt(url)) {
        var vv = document.createElement("video");
        vv.referrerPolicy = "no-referrer";
        vv.src = url; vv.controls = true; vv.autoplay = true; vv.playsInline = true;
        wrap.appendChild(vv);
      } else if (D.isImageExt(url) || /imgu\.jp/i.test(url)) {
        var im = document.createElement("img");
        im.referrerPolicy = "no-referrer";
        im.src = url; wrap.appendChild(im);
      } else if (/imgur\.com/i.test(url)) {
        var iid = D.imgurId(url);
        if (iid) {
          var im2 = document.createElement("img");
          im2.referrerPolicy = "no-referrer";
          im2.src = "https://i.imgur.com/" + iid + ".jpg";
          wrap.appendChild(im2);
        } else { wrap.appendChild(MediaGrid.makePlaceholder(kind)); }
      } else { wrap.appendChild(MediaGrid.makePlaceholder(kind)); }
    } else {
      if (D.isImageExt(url)) {
        var im4 = document.createElement("img");
        im4.referrerPolicy = "no-referrer";
        im4.src = url; wrap.appendChild(im4);
      } else if (D.isVideoExt(url)) {
        var v4 = document.createElement("video");
        v4.referrerPolicy = "no-referrer";
        v4.src = url; v4.controls = true; v4.autoplay = true; v4.playsInline = true;
        wrap.appendChild(v4);
      } else {
        wrap.appendChild(MediaGrid.makePlaceholder(kind));
      }
    }

    /* 情報バー */
    var info = U.$("mdModalInfo");
    info.innerHTML = "";
    if (item.n != null && item.t) {
      var a1 = document.createElement("a");
      a1.className = "md-modal-anchor";
      a1.href = U.threadUrl(item.t, item.n);
      a1.target = "_blank"; a1.rel = "noopener";
      a1.textContent = ">>" + item.n;
      info.appendChild(a1);
    }
    if (item.u) {
      var a2 = document.createElement("a");
      a2.className = "md-modal-id";
      a2.href = U.idAnalysisUrl(item.u, item.p);
      a2.textContent = "ID:" + item.u;
      info.appendChild(a2);
    }
    if (item.p) {
      var ts = document.createElement("span");
      ts.className = "md-modal-time";
      ts.textContent = U.fmtDate(item.p);
      info.appendChild(ts);
    }
    var openA = document.createElement("a");
    openA.className = "md-modal-open";
    openA.href = url; openA.target = "_blank"; openA.rel = "noopener";
    openA.textContent = "🔗 元URL";
    info.appendChild(openA);

    U.$("mdModal").classList.add("open");
    document.body.style.overflow = "hidden";
  }

  /* ── 閉じる / ナビ ── */
  function close() {
    cleanupModalMedia();
    U.$("mdModal").classList.remove("open");
    U.$("mdModalMedia").innerHTML = "";
    document.body.style.overflow = "";
    modalIdx = -1;
  }

  function next() {
    var f = MediaGrid.getFiltered();
    if (modalIdx >= 0 && modalIdx + 1 < f.length) open(modalIdx + 1);
  }

  function prev() {
    if (modalIdx > 0) open(modalIdx - 1);
  }

  return {
    open: open,
    close: close,
    next: next,
    prev: prev
  };
})();
