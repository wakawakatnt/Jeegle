"use strict";

/* ================================================================
   安価イベント
   ================================================================ */
const isTouchOnly = () => window.matchMedia("(pointer: coarse)").matches;

function bindAnchors(container) {
  const pv  = document.getElementById("anchorPreview");
  const pvM = document.getElementById("pvMeta");
  const pvB = document.getElementById("pvBody");

  container.querySelectorAll(".anchor-link").forEach(lnk => {
    if (!isTouchOnly()) {
      lnk.addEventListener("mouseenter", async e => {
        const pnum = parseInt(e.currentTarget.dataset.postNum, 10);
        const thid = parseInt(e.currentTarget.dataset.threadId, 10);
        const ps = await fetchAllPosts(thid).catch(() => []);
        const p  = ps.find(x => x.post_num === pnum);
        if (!p) return;
        setText(pvM, p.post_num + ": " + (p.name || "名無し") + " | ID:" + (p.user_id || "?"));
        const b = (p.body || "").trim();
        setText(pvB, b.length > 250 ? b.slice(0, 250) + "…" : b);
        pv.style.display = "block"; posPv(e.clientX, e.clientY);
      });
      lnk.addEventListener("mousemove", e => {
        if (pv.style.display === "block") posPv(e.clientX, e.clientY);
      });
      lnk.addEventListener("mouseleave", () => { pv.style.display = "none"; });
    }

    lnk.addEventListener("click", async e => {
      e.preventDefault(); e.stopPropagation();
      pv.style.display = "none";
      const pnum = parseInt(e.currentTarget.dataset.postNum, 10);
      const thid = parseInt(e.currentTarget.dataset.threadId, 10);
      const fromPost = e.currentTarget.closest(".post");
      const scope = fromPost ? fromPost.parentNode : (e.currentTarget.closest(".posts-container,.thread-detail-posts") || container);
      await anchorClick(pnum, thid, scope, fromPost);
    });
  });
}

function posPv(cx, cy) {
  const pv = document.getElementById("anchorPreview");
  const vw = window.innerWidth, vh = window.innerHeight;
  const pw = Math.min(380, vw - 8), ph = pv.offsetHeight || 100;
  let x = cx + 14, y = cy - 10;
  if (x + pw > vw - 4) x = cx - pw - 14;
  if (x < 4) x = 4;
  if (y + ph > vh - 4) y = cy - ph - 14;
  if (y < 4) y = 4;
  pv.style.left = x + "px"; pv.style.top = y + "px"; pv.style.width = pw + "px";
}

async function anchorClick(pnum, tid, scope, fromPost) {
  const existing = scope.querySelector(`.post[data-post-num="${pnum}"]`);
  if (existing) {
    existing.scrollIntoView({ behavior: "smooth", block: "center" });
    flash(existing);
    return;
  }

  const ps = await fetchAllPosts(tid).catch(() => []);
  const p  = ps.find(x => x.post_num === pnum);
  if (!p) return;

const el = mkPost(p, tid, currentKeyword, false);
el.classList.add("post-anchor-expanded");
el.dataset.expanded = "1";

if (fromPost && fromPost.parentNode === scope) {
    const fromNum = parseInt(fromPost.dataset.postNum, 10);
    if (pnum < fromNum) {
      scope.insertBefore(el, fromPost);
    } else {
      scope.insertBefore(el, fromPost.nextSibling);
    }
  } else {
    scope.appendChild(el);
  }

  bindAnchors(el);
  setTimeout(() => { el.scrollIntoView({ behavior: "smooth", block: "center" }); flash(el); }, 50);
}

/* ================================================================
   上100/下100（デュアルDB対応）
   ================================================================ */
async function rangeLoad(btn, dir, tid, q, postEl) {
  btn.disabled = true;
  const pnum  = parseInt(postEl.dataset.postNum, 10);
  const start = dir === "up" ? Math.max(1, pnum - 100) : pnum + 1;
  const end   = dir === "up" ? pnum - 1                : pnum + 100;
  if (start > end) return;

  try {
    const ps = await fetchPostsRange(tid, start, end);

    const parent = postEl.parentNode;
    const frag = document.createDocumentFragment();
    let added = 0;
    ps.forEach(p => {
      if (!parent.querySelector(`.post[data-post-num="${p.post_num}"]`)) {
        frag.appendChild(mkPost(p, tid, q, false));
        added++;
      }
    });

    if (added === 0) return;

    const scrollY    = window.scrollY;
    const rectBefore = postEl.getBoundingClientRect().top;

    if (dir === "up") {
      parent.insertBefore(frag, postEl);
    } else {
      parent.insertBefore(frag, postEl.nextSibling);
    }

    reorderPosts(parent);

    if (dir === "up") {
      const rectAfter = postEl.getBoundingClientRect().top;
      window.scrollTo({ top: scrollY + (rectAfter - rectBefore), behavior: "instant" });
    }

    parent.querySelectorAll(".anchor-link:not([data-bound])").forEach(lnk => {
      lnk.dataset.bound = "1";
    });
    bindAnchors(parent);

  } catch (e) {
    btn.disabled = false;
  }
}

function reorderPosts(parent) {
  const posts = Array.from(parent.querySelectorAll(":scope > .post"));
  if (posts.length < 2) return;
  posts.sort((a, b) => parseInt(a.dataset.postNum, 10) - parseInt(b.dataset.postNum, 10));
  const seen = new Set();
  const deduped = [];
  for (let i = posts.length - 1; i >= 0; i--) {
    const n = posts[i].dataset.postNum;
    if (!seen.has(n)) { seen.add(n); deduped.unshift(posts[i]); }
    else { posts[i].remove(); }
  }
  const nonPosts = Array.from(parent.children).filter(c => !c.classList.contains("post") && !c.classList.contains("range-posts"));
  const insertAfter = nonPosts.length ? nonPosts[nonPosts.length - 1] : null;
  deduped.forEach(el => { parent.appendChild(el); });
  if (insertAfter && insertAfter.nextSibling) {
    deduped.forEach(el => parent.insertBefore(el, insertAfter.nextSibling));
  }
}
