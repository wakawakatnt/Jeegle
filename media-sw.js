/* Jeegle! メディアキャッシュ用 Service Worker */
"use strict";

var CACHE_NAME    = "jeegle-media-v1";
var MAX_ENTRIES   = 500;                    /* 最大500件 */
var MAX_AGE_MS    = 7 * 24 * 60 * 60 * 1000; /* 7日 */

/* キャッシュ対象のホスト */
var CACHE_HOSTS = [
  "i.imgur.com",
  "imgur.com",
  "imgu.jp",
  "i.ytimg.com"   /* YouTube サムネ */
];

self.addEventListener("install", function(e){ self.skipWaiting(); });
self.addEventListener("activate", function(e){
  e.waitUntil((async function(){
    await self.clients.claim();
    /* 旧キャッシュ削除 */
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

  /* 対象ホストのみ */
  if (CACHE_HOSTS.indexOf(url.hostname) === -1) return;

  /* 画像/動画のみ */
  var isMedia = /\.(jpe?g|png|gif|webp|mp4)(\?|$)/i.test(url.pathname) ||
                url.hostname === "i.ytimg.com";
  if (!isMedia) return;

  event.respondWith(handleMedia(req));
});

async function handleMedia(req) {
  var cache = await caches.open(CACHE_NAME);
  var cached = await cache.match(req);

  if (cached) {
    var dateHdr = cached.headers.get("x-jeegle-cached-at");
    var age = dateHdr ? (Date.now() - Number(dateHdr)) : 0;
    if (age < MAX_AGE_MS) {
      /* 期限内：そのまま返す */
      return cached;
    } else {
      /* 期限切れ：削除して取り直す */
      await cache.delete(req);
    }
  }

  try {
    var res = await fetch(req);
    if (res && (res.status === 200 || res.type === "opaque")) {
      /* x-jeegle-cached-at ヘッダ付きで保存 */
      var cloned = res.clone();
      var headers = new Headers(cloned.headers);
      headers.set("x-jeegle-cached-at", String(Date.now()));
      var body = await cloned.blob();
      var stored = new Response(body, {
        status: cloned.status,
        statusText: cloned.statusText,
        headers: headers
      });
      await cache.put(req, stored);
      /* 容量チェック：超えたら古い順に削除 */
      trimCache(cache);
    }
    return res;
  } catch(err) {
    /* オフライン時：キャッシュ（期限切れでも）を返す */
    if (cached) return cached;
    throw err;
  }
}

async function trimCache(cache) {
  var keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  /* keys() は挿入順なので、古い順に超過分削除 */
  var deleteCount = keys.length - MAX_ENTRIES;
  for (var i = 0; i < deleteCount; i++) {
    await cache.delete(keys[i]);
  }
}
