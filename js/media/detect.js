/* ===== media/detect.js — メディア種別判定・URL解析 ===== */
"use strict";

var MediaDetect = (function(){

  function detectKindRaw(url, hint) {
    if (hint) {
      var h = String(hint).toLowerCase();
      var alias = { imgu:"image", imgur:"image", img:"image",
                    youtube:"video", niconico:"video", nico:"video", yt:"video",
                    x:"twitter" };
      if (alias[h]) return alias[h];
      var valid = { image:1, video:1, twitter:1, other:1 };
      return valid[h] ? h : h;
    }
    if (!url) return "other";
    var u = url;
    if (/^https?:\/\/(?:i\.)?imgur\.com\//i.test(u)) return "image";
    if (/^https?:\/\/imgu\.jp\//i.test(u)) return "image";
    if (/^https?:\/\/(?:www\.)?youtube\.com\/(?:watch|shorts)/i.test(u) ||
        /^https?:\/\/youtu\.be\//i.test(u)) return "video";
    if (/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\/]+\/status\/\d+/i.test(u)) return "twitter";
    if (/^https?:\/\/(?:www\.)?nicovideo\.jp\/watch\//i.test(u) ||
        /^https?:\/\/nico\.ms\//i.test(u)) return "video";
    if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u)) return "video";
    if (/\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(u)) return "image";
    return "other";
  }

  function detectVideoProvider(url) {
    if (!url) return "";
    if (/^https?:\/\/(?:www\.)?youtube\.com\/(?:watch|shorts)/i.test(url) ||
        /^https?:\/\/youtu\.be\//i.test(url)) return "youtube";
    if (/^https?:\/\/(?:www\.)?nicovideo\.jp\/watch\//i.test(url) ||
        /^https?:\/\/nico\.ms\//i.test(url)) return "niconico";
    if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) return "file";
    return "";
  }

  function youtubeId(url) {
    var m = url.match(/(?:youtube\.com\/(?:watch\?(?:[^&]*&)*v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    return m ? m[1] : null;
  }

  function nicoId(url) {
    var m = url.match(/(?:nicovideo\.jp\/watch\/|nico\.ms\/)([A-Za-z0-9]+)/i);
    return m ? m[1] : null;
  }

  function imgurId(url) {
    var m = url.match(/imgur\.com\/(?:gallery\/|a\/)?([A-Za-z0-9]+)(?:\.[a-z0-9]+)?/i);
    return m ? m[1] : null;
  }

  function tweetId(url) {
    var m = url.match(/status\/(\d+)/);
    return m ? m[1] : null;
  }

  function tweetUser(url) {
    var m = url.match(/(?:twitter|x)\.com\/([^\/\?#]+)\/status\/\d+/i);
    if (!m) return null;
    var u = m[1];
    if (/^(i|intent|share|home|explore|notifications|messages|search)$/i.test(u)) return null;
    return u;
  }

  function isImageExt(url) { return /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(url); }
  function isVideoExt(url) { return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url); }

  function thumbnailUrl(item, kind) {
    var url = item.url || "";
    if (kind === "video") {
      if (detectVideoProvider(url) === "youtube") {
        var yid = youtubeId(url);
        return yid ? "https://i.ytimg.com/vi/" + yid + "/hqdefault.jpg" : null;
      }
      return null;
    }
    if (kind === "twitter") return null;
    if (kind === "image") {
      if (/imgur\.com/i.test(url)) {
        if (isImageExt(url)) return url;
        var iid = imgurId(url);
        return iid ? "https://i.imgur.com/" + iid + "m.jpg" : null;
      }
      return isImageExt(url) ? url : null;
    }
    return null;
  }

  function labelOf(k) {
    if (k === "image")   return "画像";
    if (k === "twitter") return "X";
    if (k === "video")   return "動画";
    if (k === "other")   return "その他";
    return k;
  }

  return {
    detectKindRaw: detectKindRaw,
    detectVideoProvider: detectVideoProvider,
    youtubeId: youtubeId,
    nicoId: nicoId,
    imgurId: imgurId,
    tweetId: tweetId,
    tweetUser: tweetUser,
    isImageExt: isImageExt,
    isVideoExt: isVideoExt,
    thumbnailUrl: thumbnailUrl,
    labelOf: labelOf
  };
})();
