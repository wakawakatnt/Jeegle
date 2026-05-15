/* Jeegle! メディアキャッシュ用 Service Worker */
"use strict";
var CACHE_NAME    = "jeegle-media-v2";  /* バージョン上げる */
var MAX_ENTRIES   = 500;
var MAX_AGE_MS    = 7 * 24 * 60 * 60 * 1000;
var CACHE_HOSTS = [
  "i.imgur.com",
  "imgur.com",
  "imgu.jp",
  "i.ytimg.com"
];
self.addEventListener("install", function(e){ self.skipWaiting(); });
self.addEventListener("activate", function(e){
  e.waitUntil((async function(){
    await self.clients.claim();
    var keys = await caches.keys();
    await Promise.all(keys.map(function(k){
      if (k !== CACHE_NAME && k.indexOf("jeegle-media-") === 0) return caches.delete(k);
    }));
  })());
});
self.addEventListener("fetch", function(event){
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch(e){ return; }
  if (CACHE_HOSTS.indexOf(url.hostname) === -1) return;
  var isMedia = /\.(jpe?g|png|gif|webp|mp4)(\?|$)/i.test(url.pathname) ||
                url.hostname === "i.ytimg.com";
  if (!isMedia) return;
  event.respondWith(handleMedia(req));
});

/* メタ情報(キャッシュ時刻)は別キャッシュに保存 → 本体は opaque のまま無加工で保存 */
var META_CACHE = "jeegle-media-meta-v2";

async function handleMedia(req) {
  var cache = await caches.open(CACHE_NAME);
  var metaCache = await caches.open(META_CACHE);
  var cached = await cache.match(req);
  if (cached) {
    var metaRes = await metaCache.match(req);
    var ts = 0;
    if (metaRes) {
      try { ts = Number(await metaRes.text()) || 0; } catch(e){}
    }
    var age = ts ? (Date.now() - ts) : MAX_AGE_MS + 1;
    if (age < MAX_AGE_MS) {
      return cached;
    } else {
      await cache.delete(req);
      await metaCache.delete(req);
    }
  }
  try {
    var res = await fetch(req);
    /* opaque も含めてそのまま put（body 加工しない） */
    if (res && (res.status === 200 || res.type === "opaque")) {
      try {
        await cache.put(req, res.clone());
        /* タイムスタンプは別キャッシュに文字列で保存 */
        await metaCache.put(req, new Response(String(Date.now())));
        trimCache(cache, metaCache);
      } catch(e) { /* put 失敗時は無視 */ }
    }
    return res;
  } catch(err) {
    if (cached) return cached;
    throw err;
  }
}
async function trimCache(cache, metaCache) {
  var keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  var deleteCount = keys.length - MAX_ENTRIES;
  for (var i = 0; i < deleteCount; i++) {
    await cache.delete(keys[i]);
    await metaCache.delete(keys[i]);
  }
}
