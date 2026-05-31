/* Jeegle! メディアキャッシュ用 Service Worker (v5 – キャッシュ汚染修正版)
 *
 * ★ 変更点 (v4 → v5):
 *   - キャッシュバージョンを v5 に更新し、古いキャッシュを確実に破棄。
 *   - ok でないレスポンス(403 等)は返さず・キャッシュしないよう徹底し、
 *     壊れた画像がキャッシュに居座る問題を解消。
 *   - ニコニコのサムネホスト(nimg.jp / smilevideo.jp)をキャッシュ対象に追加。
 */
"use strict";

var CACHE_NAME    = "jeegle-media-v5";
var META_CACHE    = "jeegle-media-meta-v5";
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
  "open2ch.net",
  "nimg.jp",
  "smilevideo.jp"
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
    await self.clients.claim();
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
    url.hostname.endsWith("twimg.com") ||
    url.hostname.endsWith("nimg.jp") ||
    url.hostname.endsWith("smilevideo.jp");

  if (!isMedia) return;

  event.respondWith(handleMedia(req));
});

/* ===== メイン処理 ===== */
async function handleMedia(originalReq) {
  var cache     = await caches.open(CACHE_NAME);
  var metaCache = await caches.open(META_CACHE);

  var req = new Request(originalReq.url, {
    method:      originalReq.method,
    headers:     originalReq.headers,
    mode:        "cors",
    credentials: "omit",
    referrer:    "",
    referrerPolicy: "no-referrer"
  });

  /* 1. キャッシュ確認（鮮度OKならそれを返す） */
  var cached = await cache.match(req);
  if (cached && await isFresh(metaCache, req)) {
    return cached;
  }

  /* 2. ネットワーク取得（タイムアウト付き） */
  var fresh = null;
  try {
    fresh = await fetchWithTimeout(req, FETCH_TIMEOUT_MS);
  } catch (err) {
    /* 取得失敗時は古くてもキャッシュがあれば返す */
    if (cached) return cached;
    /* cors で失敗したら no-cors で再試行 */
    try {
      fresh = await fetchWithTimeout(makeNoCors(originalReq), FETCH_TIMEOUT_MS);
    } catch (err2) {
      throw err;
    }
  }

  /* cors で 403 が返った場合は no-cors で再試行 */
  if (fresh && !fresh.ok && fresh.status === 403) {
    try {
      var retried = await fetchWithTimeout(makeNoCors(originalReq), FETCH_TIMEOUT_MS);
      if (retried) fresh = retried;
    } catch (e) { /* cors の結果のままにする */ }
  }

  /* 3. キャッシュ可否判定:
        ok かつ opaque でないレスポンスだけキャッシュする。
        ok でない(403/404/500 等)レスポンスはキャッシュも汚染しない。 */
  var cacheable = fresh && fresh.ok && fresh.type !== "opaque";

  if (cacheable) {
    try {
      await cache.put(req, fresh.clone());
      await metaCache.put(req, new Response(String(Date.now())));
      await trimCache(cache, metaCache);
    } catch (e) {}
    return fresh;
  }

  /* 取得結果がキャッシュ不可(エラー等)なら、
     古くても有効なキャッシュがあればそれを優先して返す。 */
  if (cached) return cached;

  /* no-cors の opaque はそのまま返す（画像表示のみ可・キャッシュはしない） */
  return fresh;
}

function makeNoCors(originalReq) {
  return new Request(originalReq.url, {
    method:         originalReq.method,
    mode:           "no-cors",
    credentials:    "omit",
    referrer:       "",
    referrerPolicy: "no-referrer"
  });
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
