/* Jeegle! メディアキャッシュ用 Service Worker (v3 – 安定版) */
"use strict";

/* ===== バージョン管理 =====
 * CACHE_NAME を上げると古いキャッシュは activate で全削除される。
 * 既存環境の「壊れたopaqueレスポンスがキャッシュに残っている」問題を、
 * 今回のデプロイで一括クリアするために v3 に上げる。
 */
var CACHE_NAME    = "jeegle-media-v3";
var META_CACHE    = "jeegle-media-meta-v3";
var MAX_ENTRIES   = 500;
var MAX_AGE_MS    = 7 * 24 * 60 * 60 * 1000; /* 7日 */
var FETCH_TIMEOUT_MS = 8000;                 /* 8秒で諦める */

/* ===== キャッシュ対象ホスト =====
 * 旧版に加え、X系・なんJ系で頻出のホストを追加。
 * 「ホスト一致」ではなく「末尾一致」で判定するので、
 *  pbs.twimg.com も video.twimg.com もこれ1個でカバーされる。
 */
var CACHE_HOSTS = [
  "imgur.com",      /* i.imgur.com も含む */
  "imgu.jp",
  "ytimg.com",      /* i.ytimg.com */
  "twimg.com",      /* pbs.twimg.com, video.twimg.com */
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
  /* skipWaiting は維持。新版を即座に有効化する。 */
  self.skipWaiting();
});

self.addEventListener("activate", function(e){
  e.waitUntil((async function(){
    /* 旧版キャッシュをすべて削除する。
     * jeegle-media-v1, v2 や旧 meta も含めて綺麗にする。
     * これで「過去にopaqueな壊れレスポンスが残っている」状態が一掃される。
     */
    var keys = await caches.keys();
    await Promise.all(keys.map(function(k){
      if (k.indexOf("jeegle-media-") === 0 &&
          k !== CACHE_NAME && k !== META_CACHE) {
        return caches.delete(k);
      }
    }));
    /* clients.claim() は外す。
     * 既存タブを奪うと進行中の fetch が中断され、
     *「SW更新直後に画像が出ない」原因になっていた。
     * 次回ロード時に自然に新SWが効くので待つ方が安全。
     */
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
    url.hostname.endsWith("ytimg.com") ||           /* YT サムネはパスに拡張子がない場合あり */
    url.hostname.endsWith("twimg.com");             /* X画像も同様 */

  if (!isMedia) return;

  event.respondWith(handleMedia(req));
});

/* ===== メイン処理 ===== */
async function handleMedia(req) {
  var cache     = await caches.open(CACHE_NAME);
  var metaCache = await caches.open(META_CACHE);

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
    /* タイムアウト or ネット断。古くてもキャッシュがあれば返す（stale-while-error） */
    if (cached) return cached;
    /* 何もなければ素直に投げる */
    throw err;
  }

  /* 3. キャッシュ可否判定
   * ここが旧版の最大の問題点だった部分。
   *
   * - res.ok (status 200-299) のみキャッシュ。
   * - opaque (status===0, type==="opaque") はキャッシュしない。
   *   opaque は中身が 200 か 4xx/5xx か区別できないため、
   *   一度キャッシュしてしまうと壊れたレスポンスが7日間残り続ける。
   *   毎回フェッチし直す方が、ユーザー体験としては圧倒的にマシ。
   *
   * - もし将来 opaque もキャッシュしたい場合は、
   *   credentials/mode を no-cors で明示的に作り直して保存する。
   *   ただし「壊れたまま固定」リスクは消えないので推奨しない。
   */
  if (fresh && fresh.ok && fresh.type !== "opaque") {
    try {
      /* clone してから put（body は1回しか読めないため） */
      await cache.put(req, fresh.clone());
      await metaCache.put(req, new Response(String(Date.now())));
      /* trim は await しないと瞬間的にクォータ超過することがある */
      await trimCache(cache, metaCache);
    } catch (e) {
      /* QuotaExceededError などは握りつぶす。ブラウザに表示自体は出せる。 */
    }
  } else if (cached) {
    /* 取れたけどキャッシュしない場合でも、
     * 古いキャッシュがあるなら 4xx/5xx よりはキャッシュを優先表示。
     */
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
    /* req にすでに signal がついていても上書きしたいので、Request を組み直す */
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

/* ===== LRU 風トリム =====
 * 旧版は cache.keys() の返却順に依存していて、
 * 必ずしも最古を消していなかった。
 * metaCache のタイムスタンプを実際に読み、古い順にソートして消す。
 */
async function trimCache(cache, metaCache) {
  var keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;

  /* 各リクエストの最終保存時刻を取得 */
  var withTs = await Promise.all(keys.map(async function(req){
    var ts = 0;
    var m = await metaCache.match(req);
    if (m) { try { ts = Number(await m.text()) || 0; } catch(e){} }
    return { req: req, ts: ts };
  }));

  /* 古い順にソート */
  withTs.sort(function(a, b){ return a.ts - b.ts; });

  var deleteCount = withTs.length - MAX_ENTRIES;
  for (var i = 0; i < deleteCount; i++) {
    await cache.delete(withTs[i].req);
    await metaCache.delete(withTs[i].req);
  }
}
