/* ===== media/main.js — エントリポイント・イベントバインド ===== */
"use strict";

(function(){
  var U = MediaUtil;

  /* ── Service Worker 登録 ── */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("media-sw.js").catch(function(e){
      console.warn("SW register failed", e);
    });
  }

  /* ── 無限スクロール用 IntersectionObserver ── */
  var io = new IntersectionObserver(function(entries){
    var hit = false;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) { hit = true; break; }
    }
    if (hit) MediaGrid.renderMore();
  }, { rootMargin: "600px 0px", threshold: 0 });
  io.observe(U.$("mdSentinel"));

  /* ── スクロールフォールバック ── */
  var _scrollTimer = null;
  window.addEventListener("scroll", function(){
    if (_scrollTimer) return;
    _scrollTimer = setTimeout(function(){
      _scrollTimer = null;
      if (MediaGrid.getRenderIdx() < MediaGrid.getFilteredLength()) {
        var sen = U.$("mdSentinel");
        if (!sen) return;
        var rect = sen.getBoundingClientRect();
        var vh = window.innerHeight || document.documentElement.clientHeight;
        if (rect.top < vh + 600) MediaGrid.renderMore();
      }
    }, 150);
  }, { passive: true });

  /* ── モーダルイベント ── */
  U.$("mdModalClose").addEventListener("click", function(e){ e.stopPropagation(); MediaModal.close(); });
  U.$("mdModalNext").addEventListener("click", function(e){ e.stopPropagation(); MediaModal.next(); });
  U.$("mdModalPrev").addEventListener("click", function(e){ e.stopPropagation(); MediaModal.prev(); });

  U.$("mdModal").addEventListener("click", function(e){
    var t = e.target;
    if (t.id === "mdModal" || t.id === "mdModalMedia" || t.id === "mdModalInner") MediaModal.close();
  });
  U.$("mdModalMedia").addEventListener("click", function(e){
    if (e.target === this) MediaModal.close();
  });

  document.addEventListener("keydown", function(e){
    if (!U.$("mdModal").classList.contains("open")) return;
    if (e.key === "Escape") MediaModal.close();
    else if (e.key === "ArrowRight") MediaModal.next();
    else if (e.key === "ArrowLeft") MediaModal.prev();
  });

  /* ── 共有ボタン ── */
  U.$("mdShareBtn").addEventListener("click", function(){
    var url = location.href;
    if (navigator.share) {
      navigator.share({ title: "Jeegle! 貼られた画像一覧", url: url }).catch(function(){});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function(){
        U.setStatus("URLをコピーしました", "ok");
        setTimeout(function(){ U.setStatus(""); }, 1500);
      });
    }
  });

  /* ── データ取得 → 描画 ── */
  MediaData.fetchMedia(function(data){
    MediaGrid.applyData(data);
  });
})();
