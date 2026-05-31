/* ===== media/grid.js — グリッド描画・フィルター ===== */
"use strict";

var MediaGrid = (function(){
  var U = MediaUtil;
  var D = MediaDetect;

  /* ── 状態 ── */
  var allItems = [];
  var filtered = [];
  var renderIdx = 0;
  var currentKind = "";

  /* URL パラメータから初期 kind を取得 */
  (function initFilterFromUrl(){
    try {
      var p = new URLSearchParams(location.search);
      var k = (p.get("kind") || "").toLowerCase();
      if (!k) {
        var keys = ["fav","favorite","video","img","image","x","twitter","youtube","nico","niconico","other"];
        for (var i = 0; i < keys.length; i++) {
          if (p.has(keys[i])) { k = keys[i]; break; }
        }
      }
      var alias = { x:"twitter", img:"image", youtube:"video", nico:"video", niconico:"video", favorite:"fav" };
      if (alias[k]) k = alias[k];
      var valid = { "":1, video:1, image:1, twitter:1, other:1, fav:1 };
      currentKind = valid[k] ? k : "";
    } catch(e) { currentKind = ""; }
  })();

  /* ── Twitter サムネ IntersectionObserver ── */
  var twThumbIO = new IntersectionObserver(function(entries){
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.isIntersecting && e.target._loadIframe) {
        e.target._loadIframe();
        twThumbIO.unobserve(e.target);
      }
    }
  }, { rootMargin: "200px 0px" });

  /* ── プレースホルダー生成 ── */
  function makePlaceholder(kind, item) {
    var ph = document.createElement("div");
    ph.className = "md-thumb-ph";
    ph.setAttribute("data-k", kind);
    var icon = "🖼";
    if (kind === "video") icon = "▶";
    else if (kind === "twitter") icon = "𝕏";
    var inner = '<div>' + icon + '</div><div class="lbl">' + D.labelOf(kind).toUpperCase() + '</div>';
    if (kind === "twitter" && item && item.url) {
      var user = D.tweetUser(item.url);
      if (user) inner += '<div class="md-ph-sub">@' + U.escHtml(user) + '</div>';
    }
    ph.innerHTML = inner;
    return ph;
  }

  /* ── ★お気に入りボタン生成 ── */
  function makeFavBtn(item) {
    var btn = document.createElement("button");
    btn.className = "md-fav-btn";
    var sync = function(){
      var on = MediaFav.has(item);
      btn.classList.toggle("on", on);
      btn.textContent = on ? "★" : "☆";
      btn.title = on ? "お気に入りから外す" : "お気に入りに追加";
    };
    sync();
    btn.addEventListener("click", function(e){
      e.stopPropagation();
      MediaFav.toggle(item);
      sync();
      // お気に入り表示中に外したらカードを消す
      if (currentKind === "fav" && !MediaFav.has(item)) {
        applyFilter();
      }
      updateFavFilterLabel();
    });
    return btn;
  }

  /* ── カード生成 ── */
  function buildCard(item, idx) {
    var card = document.createElement("div");
    card.className = "md-card";
    card.addEventListener("click", function(){ MediaModal.open(idx); });

    var kind = item._k;
    var thumb = D.thumbnailUrl(item, kind);
    var isVid = (kind === "video");

    /* Twitter サムネ */
    if (kind === "twitter") {
      var tid = D.tweetId(item.url || "");
      if (tid) {
        var tw = document.createElement("div");
        tw.className = "md-tw-thumb";

        var spinner = document.createElement("div");
        spinner.className = "md-tw-thumb-loading";
        spinner.innerHTML = '<div>𝕏</div>';
        var user = D.tweetUser(item.url || "");
        if (user) {
          var sub = document.createElement("div");
          sub.className = "md-tw-sub";
          sub.textContent = "@" + user;
          spinner.appendChild(sub);
        }
        tw.appendChild(spinner);

        tw._loadIframe = function(){
          if (tw._loaded) return;
          tw._loaded = true;
          var ifr = document.createElement("iframe");
          ifr.setAttribute("scrolling", "no");
          ifr.setAttribute("allowtransparency", "true");
          ifr.title = "X Post";
          ifr.src = "https://platform.twitter.com/embed/Tweet.html?id=" + tid +
                    "&theme=light&lang=ja&dnt=true&hideCard=false&hideThread=true";
          tw.appendChild(ifr);
          var fit = function(){
            var w = tw.clientWidth || 160;
            var scale = w / 550;
            ifr.style.transform = "scale(" + scale + ")";
            ifr.style.height = (tw.clientHeight / scale) + "px";
          };
          fit();
          if (window.ResizeObserver) {
            var ro = new ResizeObserver(fit);
            ro.observe(tw);
            tw._cleanup = function(){ try { ro.disconnect(); } catch(e){} };
          }
          ifr.addEventListener("load", function(){
            if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
          });
          setTimeout(function(){
            if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
          }, 5000);
        };

        card.appendChild(tw);

        var clickLayer = document.createElement("div");
        clickLayer.style.cssText = "position:absolute;inset:0;z-index:5;cursor:pointer;";
        card.appendChild(clickLayer);

        var badge = document.createElement("span");
        badge.className = "md-kind-badge";
        badge.setAttribute("data-k", kind);
        badge.textContent = D.labelOf(kind);
        badge.style.zIndex = "6";
        card.appendChild(badge);

        card.appendChild(makeFavBtn(item));

        twThumbIO.observe(tw);
        card._twThumb = tw;
        return card;
      }
    }

    /* 通常サムネイル / プレースホルダー */
    if (thumb) {
      var img = document.createElement("img");
      img.className = "md-thumb";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.src = thumb;
      img.onerror = function(){
        img.remove();
        card.insertBefore(makePlaceholder(kind, item), card.firstChild);
      };
      card.appendChild(img);
      if (isVid) {
        var play = document.createElement("div");
        play.className = "md-thumb-play";
        play.textContent = "▶";
        card.appendChild(play);
      }
    } else {
      card.appendChild(makePlaceholder(kind, item));
    }

    var kindBadge = document.createElement("span");
    kindBadge.className = "md-kind-badge";
    kindBadge.setAttribute("data-k", kind);
    kindBadge.textContent = D.labelOf(kind);
    card.appendChild(kindBadge);

    card.appendChild(makeFavBtn(item));

    return card;
  }

  /* ── フィルターボタン生成 ── */
  function buildKindFilters(items) {
    var counts = {};
    for (var i = 0; i < items.length; i++) {
      var k = items[i]._k || "other";
      counts[k] = (counts[k] || 0) + 1;
    }
    var order = ["video","image","twitter","other"];
    var keys = Object.keys(counts).sort(function(a, b){
      var ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia === -1) ia = 99;
      if (ib === -1) ib = 99;
      if (ia !== ib) return ia - ib;
      return counts[b] - counts[a];
    });

    var box = U.$("mdFilters");
    var nodes = box.querySelectorAll('.md-fbtn:not([data-kind=""])');
    for (var j = 0; j < nodes.length; j++) box.removeChild(nodes[j]);
    var allBtn = box.querySelector('[data-kind=""]');
    if (allBtn) allBtn.textContent = "すべて (" + items.length + ")";

    for (var i2 = 0; i2 < keys.length; i2++) {
      var k2 = keys[i2];
      var btn = document.createElement("button");
      btn.className = "md-fbtn";
      btn.setAttribute("data-kind", k2);
      btn.textContent = D.labelOf(k2) + " (" + counts[k2] + ")";
      btn.addEventListener("click", onFilterClick);
      box.appendChild(btn);
    }

    /* ★お気に入りフィルタ */
    var favBtn = document.createElement("button");
    favBtn.className = "md-fbtn md-fbtn-fav";
    favBtn.setAttribute("data-kind", "fav");
    favBtn.id = "mdFavFilterBtn";
    favBtn.textContent = "★お気に入り (" + MediaFav.count() + ")";
    favBtn.addEventListener("click", onFilterClick);
    box.appendChild(favBtn);

    if (allBtn && !allBtn._bound) {
      allBtn.addEventListener("click", onFilterClick);
      allBtn._bound = true;
    }
    syncActiveBtn();
  }

  function updateFavFilterLabel() {
    var b = U.$("mdFavFilterBtn");
    if (b) b.textContent = "★お気に入り (" + MediaFav.count() + ")";
  }

  function syncActiveBtn() {
    var btns = document.querySelectorAll(".md-fbtn");
    for (var b = 0; b < btns.length; b++) {
      btns[b].classList.toggle("active", (btns[b].getAttribute("data-kind") || "") === currentKind);
    }
  }

  function onFilterClick(e) {
    var k = e.currentTarget.getAttribute("data-kind") || "";
    if (k === currentKind) return;
    currentKind = k;
    syncActiveBtn();
    try {
      var url = new URL(location.href);
      if (currentKind) url.searchParams.set("kind", currentKind);
      else url.searchParams.delete("kind");
      ["x","twitter","img","image","video","youtube","nico","niconico","other","fav","favorite"].forEach(function(p){
        url.searchParams.delete(p);
      });
      history.replaceState(null, "", url.toString());
    } catch(e2) {}
    applyFilter();
  }

  /* ── フィルター適用 ── */
  function applyFilter() {
    var olds = U.$("mdGrid").querySelectorAll(".md-tw-thumb");
    for (var i = 0; i < olds.length; i++) if (olds[i]._cleanup) olds[i]._cleanup();

    if (currentKind === "fav") {
      // お気に入りは保存データから構築（種別を再判定）
      var favs = MediaFav.list().map(function(it){
        var copy = {
          url: it.url, k: it.k, t: it.t, n: it.n, u: it.u, p: it.p
        };
        copy._k = D.detectKindRaw(copy.url, copy.k);
        return copy;
      });
      filtered = favs;
    } else if (!currentKind) {
      filtered = allItems.slice();
    } else {
      filtered = allItems.filter(function(it){ return it._k === currentKind; });
    }

    U.$("mdGrid").innerHTML = "";
    U.$("mdEnd").style.display = "none";
    renderIdx = 0;
    U.txt(U.$("mdTotal"), String(filtered.length));
    U.txt(U.$("mdCount"), "0");
    renderMore();
  }

  /* ── 追加描画 ── */
  function renderMore() {
    if (renderIdx >= filtered.length) {
      U.$("mdEnd").style.display = filtered.length > 0 ? "block" : "none";
      U.$("mdLoading").style.display = "none";
      if (filtered.length === 0) {
        var msg = (currentKind === "fav")
          ? '★のお気に入りはまだありません'
          : '該当するメディアがありません';
        U.$("mdGrid").innerHTML = '<div class="md-empty" style="grid-column:1/-1;">' + msg + '</div>';
      }
      return;
    }
    U.$("mdLoading").style.display = "block";
    var frag = document.createDocumentFragment();
    var end = Math.min(renderIdx + MediaCfg.PAGE_SIZE, filtered.length);
    for (var i = renderIdx; i < end; i++) frag.appendChild(buildCard(filtered[i], i));
    U.$("mdGrid").appendChild(frag);
    renderIdx = end;
    U.txt(U.$("mdCount"), String(renderIdx));
    U.$("mdLoading").style.display = "none";
    if (renderIdx >= filtered.length) {
      U.$("mdEnd").style.display = "block";
      return;
    }
    requestAnimationFrame(function(){
      var sen = U.$("mdSentinel");
      if (!sen) return;
      var rect = sen.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < vh + 400) renderMore();
    });
  }

  /* ── データ受け取り → 描画開始 ── */
  function applyData(data) {
    U.txt(U.$("mdUpdated"), U.fmtUpdated(data.u));
    var items = Array.isArray(data.items) ? data.items.slice() : [];
    for (var i = 0; i < items.length; i++) items[i]._k = D.detectKindRaw(items[i].url, items[i].k);
    allItems = items;
    buildKindFilters(items);
    applyFilter();
  }

  /* ── 公開 API ── */
  return {
    applyData: applyData,
    renderMore: renderMore,
    getFiltered: function(){ return filtered; },
    getRenderIdx: function(){ return renderIdx; },
    getFilteredLength: function(){ return filtered.length; },
    makePlaceholder: makePlaceholder,
    updateFavFilterLabel: updateFavFilterLabel
  };
})();
