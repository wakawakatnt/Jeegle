/* Jeegle! メディアキャッシュ用 Service Worker (v4 – referrer修正版)
 *
 * ★ 変更点 (v3 → v4):
 *   キャッシュ対象ホストへのリクエストを new Request() で作り直し、
 *   referrer: "" を明示することで、ページ側の <meta referrer> なしでも
 *   imgur / imgu.jp 等のホットリンク保護による 403 を回避する。
 *   これにより GA の referrer 情報が正しく送信される。
 */
"use strict";

var CACHE_NAME    = "jeegle-media-v4";
var META_CACHE    = "jeegle-media-meta-v4";
var MAX_ENTRIES   = 500;
var MAX_AGE_MS    = 7 * 24 * 60 * 60 * 1000;
var FETCH_TIMEOUT_MS = 8000;

var CACHE_HOSTS = [
  "imgur.com",
  "imgu.jp",
  "ytimg.com",
  "twimg.com",
  "tadaup.jp",
  "dec.2chan.net",
  "open2ch.net"
];

function isCacheableHost(hostname) {
  for (var i = 0; i < CACHE_HOSTS.length; i++) {
    var h = CACHE_HOSTS[i];
    if (hostname === h || hostname.endsWith("." + h)) return true;
  }
  return false;
}

/* ===== ライフサイクル ===== */
self.addEventListener("install", function(e){
  self.skipWaiting();
});

self.addEventListener("activate", function(e){
  e.waitUntil((async function(){
    var keys = await caches.keys();
    await Promise.all(keys.map(function(k){
      if (k.indexOf("jeegle-media-") === 0 &&
          k !== CACHE_NAME && k !== META_CACHE) {
        return caches.delete(k);
      }
    }));
  })());
});

/* ===== fetch ハンドラ ===== */
self.addEventListener("fetch", function(event){
  var req = event.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch(e){ return; }

  if (!isCacheableHost(url.hostname)) return;

  var isMedia =
    /\.(jpe?g|png|gif|webp|avif|mp4|webm)(\?|$)/i.test(url.pathname) ||
    url.hostname.endsWith("ytimg.com") ||
    url.hostname.endsWith("twimg.com");

  if (!isMedia) return;

  event.respondWith(handleMedia(req));
});

/* ===== メイン処理 ===== */
async function handleMedia(originalReq) {
  var cache     = await caches.open(CACHE_NAME);
  var metaCache = await caches.open(META_CACHE);

  /*
   * ★ 核心の修正箇所:
   * リクエストを作り直して referrer を空文字列にする。
   * これで Referer ヘッダが送信されなくなり、
   * imgur / imgu.jp 等のホットリンク保護をすり抜ける。
   *
   * 要素レベルの referrerPolicy="no-referrer" だけでは、
   * SW が fetch(e.request) する際にブラウザによっては
   * 元ページの URL が Referer として付与されてしまう問題があった。
   */
  var req = new Request(originalReq.url, {
    method:      originalReq.method,
    headers:     originalReq.headers,
    mode:        "cors",
    credentials: "omit",
    referrer:    "",
    referrerPolicy: "no-referrer"
  });

  /* 1. キャッシュ確認 */
  var cached = await cache.match(req);
  if (cached && await isFresh(metaCache, req)) {
    return cached;
  }

  /* 2. ネットワーク取得（タイムアウト付き） */
  var fresh;
  try {
    fresh = await fetchWithTimeout(req, FETCH_TIMEOUT_MS);
  } catch (err) {
    if (cached) return cached;
    /*
     * mode:"cors" + credentials:"omit" で 403/opaque になる場合は
     * no-cors にフォールバックして再試行
     */
    try {
      var noCorsReq = new Request(originalReq.url, {
        method:         originalReq.method,
        mode:           "no-cors",
        credentials:    "omit",
        referrer:       "",
        referrerPolicy: "no-referrer"
      });
      fresh = await fetchWithTimeout(noCorsReq, FETCH_TIMEOUT_MS);
    } catch (err2) {
      throw err;
    }
  }

  /*
   * cors で 403 が返ってきた場合も no-cors でリトライ
   */
  if (fresh && !fresh.ok && fresh.status === 403) {
    try {
      var noCorsReq2 = new Request(originalReq.url, {
        method:         originalReq.method,
        mode:           "no-cors",
        credentials:    "omit",
        referrer:       "",
        referrerPolicy: "no-referrer"
      });
      var retried = await fetchWithTimeout(noCorsReq2, FETCH_TIMEOUT_MS);
      if (retried) fresh = retried;
    } catch(e) { /* cors の結果をそのまま使う */ }
  }

  /* 3. キャッシュ可否判定 */
  if (fresh && fresh.ok && fresh.type !== "opaque") {
    try {
      await cache.put(req, fresh.clone());
      await metaCache.put(req, new Response(String(Date.now())));
      await trimCache(cache, metaCache);
    } catch (e) {}
  } else if (cached) {
    return cached;
  }

  return fresh;
}

/* ===== ヘルパー ===== */
async function isFresh(metaCache, req) {
  var metaRes = await metaCache.match(req);
  if (!metaRes) return false;
  var ts;
  try { ts = Number(await metaRes.text()); } catch (e) { return false; }
  if (!ts) return false;
  return (Date.now() - ts) < MAX_AGE_MS;
}

function fetchWithTimeout(req, ms) {
  return new Promise(function(resolve, reject){
    var ctl = new AbortController();
    var t = setTimeout(function(){
      ctl.abort();
      reject(new Error("timeout"));
    }, ms);
    var r = new Request(req, { signal: ctl.signal });
    fetch(r).then(function(res){
      clearTimeout(t);
      resolve(res);
    }).catch(function(err){
      clearTimeout(t);
      reject(err);
    });
  });
}

async function trimCache(cache, metaCache) {
  var keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  var withTs = await Promise.all(keys.map(async function(req){
    var ts = 0;
    var m = await metaCache.match(req);
    if (m) { try { ts = Number(await m.text()) || 0; } catch(e){} }
    return { req: req, ts: ts };
  }));
  withTs.sort(function(a, b){ return a.ts - b.ts; });
  var deleteCount = withTs.length - MAX_ENTRIES;
  for (var i = 0; i < deleteCount; i++) {
    await cache.delete(withTs[i].req);
    await metaCache.delete(withTs[i].req);
  }
}
