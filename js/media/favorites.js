/* ===== media/favorites.js — お気に入り（★）管理 ===== */
"use strict";

var MediaFav = (function(){
  var KEY = "jeegle_media_favorites_v1";
  var map = {};   // url -> 保存アイテム

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) map = JSON.parse(raw) || {};
    } catch (e) { map = {}; }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {}
  }

  function keyOf(item) {
    return (item && item.url) ? item.url : "";
  }

  function has(item) {
    var k = keyOf(item);
    return !!(k && map[k]);
  }

  /** 追加・削除をトグル。結果（true=追加された / false=外れた）を返す */
  function toggle(item) {
    var k = keyOf(item);
    if (!k) return false;
    if (map[k]) {
      delete map[k];
      save();
      return false;
    }
    map[k] = {
      url: item.url || "",
      k:   item.k || item._k || "",
      t:   item.t != null ? item.t : null,
      n:   item.n != null ? item.n : null,
      u:   item.u || "",
      p:   item.p || null,
      savedAt: Date.now()
    };
    save();
    return true;
  }

  /** お気に入り一覧（新しく保存した順） */
  function list() {
    var arr = [];
    for (var k in map) if (map.hasOwnProperty(k)) arr.push(map[k]);
    arr.sort(function(a, b){ return (b.savedAt || 0) - (a.savedAt || 0); });
    return arr;
  }

  function count() {
    return Object.keys(map).length;
  }

  load();

  return {
    has: has,
    toggle: toggle,
    list: list,
    count: count
  };
})();
