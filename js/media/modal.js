    var openA = document.createElement("a");
    openA.className = "md-modal-open";
    openA.href = url; openA.target = "_blank"; openA.rel = "noopener";
    openA.textContent = "🔗 元URL";
    info.appendChild(openA);

    /* ★お気に入りトグル */
    var favA = document.createElement("button");
    favA.className = "md-modal-fav";
    var syncFav = function(){
      var on = MediaFav.has(item);
      favA.classList.toggle("on", on);
      favA.textContent = on ? "★ お気に入り済" : "☆ お気に入り";
    };
    syncFav();
    favA.addEventListener("click", function(e){
      e.stopPropagation();
      MediaFav.toggle(item);
      syncFav();
      if (MediaGrid.updateFavFilterLabel) MediaGrid.updateFavFilterLabel();
    });
    info.appendChild(favA);

    /* URLコピー */
    var copyA = document.createElement("button");
    copyA.className = "md-modal-copy";
    copyA.textContent = "📋 URLコピー";
    copyA.addEventListener("click", function(e){
      e.stopPropagation();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function(){
          var o = copyA.textContent;
          copyA.textContent = "✅ コピーしました";
          setTimeout(function(){ copyA.textContent = o; }, 1500);
        });
      }
    });
    info.appendChild(copyA);

    /* 画像保存（画像系のみ表示） */
    if (kind === "image" || (kind === "other" && D.isImageExt(url))) {
      var saveA = document.createElement("a");
      saveA.className = "md-modal-save";
      var dlUrl = url;
      if (/imgur\.com/i.test(url) && !D.isImageExt(url)) {
        var iidS = D.imgurId(url);
        if (iidS) dlUrl = "https://i.imgur.com/" + iidS + ".jpg";
      }
      saveA.href = dlUrl;
      saveA.target = "_blank"; saveA.rel = "noopener";
      saveA.download = "";
      saveA.referrerPolicy = "no-referrer";
      saveA.textContent = "💾 画像保存";
      info.appendChild(saveA);
    }
