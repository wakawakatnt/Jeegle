/* ===== media/data.js — Firebase からデータ取得・キャッシュ ===== */
"use strict";

var MediaData = (function(){
  var U = MediaUtil;
  var C = MediaCfg;

  function loadMetaCache() {
    try {
      var raw = sessionStorage.getItem(C.META_CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.ts || !obj.data) return null;
      if (Date.now() - obj.ts > C.META_CACHE_TTL_MS) return null;
      return obj.data;
    } catch(e) { return null; }
  }

  function saveMetaCache(data) {
    try {
      sessionStorage.setItem(C.META_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
    } catch(e) {}
  }

  /**
   * fetchMedia(callback)
   * callback(data) — data = { u: ISO文字列, items: [...] }
   */
  function fetchMedia(callback) {
    U.setStatus("貼られた画像一覧を読み込み中…", "info");

    var cached = loadMetaCache();
    if (cached) {
      callback(cached);
      U.setStatus("キャッシュから表示中（60秒）", "ok");
      setTimeout(function(){ U.setStatus(""); }, 1500);
      return;
    }

    mediaDb.collection("stats").doc("media").get()
      .then(function(snap){
        if (!snap.exists) { U.setStatus("stats/media が存在しません", "err"); return; }
        var raw = snap.data() || {};
        var data = {
          u: U.toDateSafe(raw.u),
          items: Array.isArray(raw.items) ? raw.items.map(function(it){
            return {
              url: it.url || "",
              k: it.k || "",
              t: it.t,
              n: it.n,
              u: it.u || "",
              p: U.toDateSafe(it.p)
            };
          }) : []
        };
        saveMetaCache(data);
        callback(data);
        U.setStatus("");
      })
      .catch(function(err){
        console.error(err);
        U.setStatus("現在メンテ中...: " + (err && err.message ? err.message : err), "err");
      });
  }

  return { fetchMedia: fetchMedia };
})();
