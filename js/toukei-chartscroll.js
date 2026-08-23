/* スマホ時：チャートを「全部表示 / スクロール」で切り替える */
(function () {
  'use strict';

  var MOBILE_Q  = '(max-width: 768px)';
  var SLOT_PX   = 46;                 // 1カテゴリ(棒1本)あたりの横幅
  var STORE_KEY = 'tk-chart-scroll-mode';
  var TARGETS   = ['uChart', 'mainChart'];   // 必要なら 'splitP','splitT'… も追加可

  var mode = localStorage.getItem(STORE_KEY) || 'scroll';  // 既定はスクロール
  var reg  = [];

  function isMobile() { return window.matchMedia(MOBILE_Q).matches; }
  function find(id)   { for (var i = 0; i < reg.length; i++) if (reg[i].id === id) return reg[i]; return null; }

  /* --- canvas をスクロール用の入れ子に包む（チャート生成前に実行） --- */
  function wrap(id) {
    var cv = document.getElementById(id);
    if (!cv || !cv.parentNode) return;
    var host = cv.parentNode;                       // .tk-chart-wrap
    if (host.classList.contains('tk-scroll-host')) return;

    var inner = document.createElement('div');
    inner.className = 'tk-scroll-inner';
    host.insertBefore(inner, cv);
    inner.appendChild(cv);
    host.classList.add('tk-scroll-host');

    var hint = document.createElement('div');
    hint.className = 'tk-scroll-hint';
    hint.textContent = '← 横にスクロールできます';
    host.parentNode.insertBefore(hint, host.nextSibling);

    reg.push({ id: id, host: host, inner: inner, canvas: cv, hint: hint, lastN: -1 });
    addToggle(reg[reg.length - 1]);
  }

  /* --- カードのツールバーに切替ボタンを差し込む --- */
  function addToggle(e) {
    var card  = e.host.closest('.tk-card');
    var tools = card && card.querySelector('.tk-card-tools');
    if (!tools) return;

    var box = document.createElement('div');
    box.className = 'tk-tog tk-scroll-tog';
    box.innerHTML =
      '<button type="button" data-sc="all">全部表示</button>' +
      '<button type="button" data-sc="scroll">スクロール</button>';
    tools.appendChild(box);
    e.tog = box;

    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      mode = b.dataset.sc;
      try { localStorage.setItem(STORE_KEY, mode); } catch (_) {}
      applyAll();
    });
  }

  /* --- 実際の幅計算 --- */
  function apply(e) {
    var chart = (window.Chart && Chart.getChart) ? Chart.getChart(e.canvas) : null;
    var n = (chart && chart.data && chart.data.labels) ? chart.data.labels.length : 0;

    e.host.scrollLeft = 0;                       // ① 先に必ず戻す

    var base = e.host.clientWidth;               // ② 常に可視幅（inner を変えても不変）
    if (!base) return;                           //    幅0（非表示中）なら何もしない
    var on = isMobile() && mode === 'scroll' && n > 0 && n * SLOT_PX > base;
    var w  = on ? n * SLOT_PX : base;

    e.inner.style.width = w + 'px';              // ③ 全部表示でも px を明示
    e.hint.classList.toggle('on', on);
    e.host.classList.toggle('is-scroll', on);    //    （旧クラス。参照が無ければ実害なし）

    if (e.tog) {
      Array.prototype.forEach.call(e.tog.children, function (b) {
        b.classList.toggle('active', b.dataset.sc === mode);
      });
    }

    if (chart) {                                 // ④ canvas の実寸を強制的に作り直す
      var h = e.host.clientHeight;
      e.canvas.style.width  = w + 'px';
      e.canvas.style.height = h + 'px';
      chart.resize(w, h);
    }

    e.host.scrollLeft = 0;                       // ⑤ レイヤ確定後にもう一度（iOS対策）
  }

  function applyAll() { reg.forEach(apply); }

  /* --- チャートの生成・再生成・データ変更を検知 --- */
  if (window.Chart) {
    Chart.register({
      id: 'tkMobileScroll',
      afterInit: function (c) {
        var e = find(c.canvas.id);
        if (e) { e.lastN = -1; setTimeout(function () { apply(e); }, 0); }
      },
      afterDraw: function (c) {                    // ラベル数が変わったときだけ再計算
        var e = find(c.canvas.id);
        if (!e) return;
        var n = (c.data.labels || []).length;
        if (n !== e.lastN) { e.lastN = n; setTimeout(function () { apply(e); }, 0); }
      }
    });
  }

  var t;
  function debounced() { clearTimeout(t); t = setTimeout(applyAll, 200); }
  window.addEventListener('resize', debounced);
  window.addEventListener('orientationchange', debounced);

  TARGETS.forEach(wrap);
  document.addEventListener('DOMContentLoaded', applyAll);
})();
