/* ==========================================================
   ユーザー（忍法帖レベル） — 1日あたり平均ユーザー数 + 偏差値
   モード制御は toukei-main.js 側。ここは描画のみ担当。
   ========================================================== */
(function () {
  'use strict';
  window.TK = window.TK || {};

  /* ===== [レベル, 1日あたり平均ユーザー数] ===== */
  var RAW = [
    [128,0.041],[118,0.01],[113,0.031],[112,0.103],[111,0.124],[110,0.062],[109,0.072],
    [108,0.041],[106,0.041],[105,0.093],[104,0.546],[103,0.577],[102,0.32],[101,0.01],
    [99,0.093],[98,0.433],[97,0.237],[96,0.66],[95,0.206],
    [91,0.124],[90,1.196],[89,0.113],[88,0.093],[87,1.247],[86,0.34],[85,0.237],[84,0.928],
    [83,0.701],[82,0.794],[81,0.34],[80,0.082],
    [79,0.062],[78,0.021],[77,0.093],[76,0.155],[75,0.351],[74,0.237],[73,0.67],[72,0.856],
    [71,0.227],[70,0.351],
    [69,0.938],[68,0.268],[67,0.619],[66,0.536],[65,0.351],[64,0.608],[63,1.186],[62,1.247],
    [61,1.876],[60,1.907],
    [59,1.577],[58,1.206],[57,1.32],[56,1.454],[55,1.577],[54,1.814],[53,1.835],[52,2.619],
    [51,2.856],[50,3.629],
    [49,3.381],[48,3.412],[47,3.0],[46,3.567],[45,3.247],[44,2.948],[43,4.361],[42,4.309],
    [41,4.608],[40,4.247],
    [39,3.918],[38,4.753],[37,5.598],[36,7.216],[35,7.495],[34,7.536],[33,7.629],[32,6.763],
    [31,5.804],[30,6.814],
    [29,6.546],[28,7.897],[27,8.423],[26,9.918],[25,8.381],[24,8.649],[23,10.33],[22,10.258],
    [21,10.206],[20,11.247],
    [19,12.753],[18,13.299],[17,12.649],[16,13.278],[15,13.206],[14,13.392],[13,13.907],
    [12,14.856],[11,15.67],[10,16.062],
    [9,14.423],[8,15.742],[7,16.113],[6,17.124],[5,16.753],[4,16.722],[3,15.866],[2,18.227],
    [1,65.196]
  ];
  var PERIOD_FROM = '2026-05-14', PERIOD_TO = '2026-08-18', PERIOD_DAYS = 97;

  /* ===== 前処理 ===== */
  var MAX_LV = RAW.reduce(function (m, r) { return Math.max(m, r[0]); }, 0);
  var cnt = [];
  for (var i = 0; i <= MAX_LV; i++) cnt[i] = 0;
  RAW.forEach(function (r) { cnt[r[0]] += r[1]; });

  var levels = [], counts = [];
  for (var lv = 1; lv <= MAX_LV; lv++) { levels.push(lv); counts.push(cnt[lv]); }

  var TOTAL = counts.reduce(function (a, b) { return a + b; }, 0); /* 人/日 の総和 */

  /* ===== 偏差値の基礎統計（ユーザー数で重み付け） ===== */
  var MEAN = 0, E2 = 0;
  levels.forEach(function (l, i) { MEAN += l * counts[i]; E2 += l * l * counts[i]; });
  MEAN /= TOTAL; E2 /= TOTAL;
  var VAR = Math.max(E2 - MEAN * MEAN, 1e-9);
  var SD  = Math.sqrt(VAR);

  function hensachi(lv) { return 50 + 10 * (lv - MEAN) / SD; }  /* レベル → 偏差値 */
  function lvOfH(h)     { return MEAN + (h - 50) / 10 * SD; }   /* 偏差値 → 相当レベル */

  /* 累積（そのレベル以上） */
  var cumAtLeast = [];
  cumAtLeast[MAX_LV + 1] = 0;
  for (var l = MAX_LV; l >= 1; l--) cumAtLeast[l] = cumAtLeast[l + 1] + cnt[l];

  function quantile(q) {
    var need = TOTAL * q, acc = 0;
    for (var i = 0; i < counts.length; i++) { acc += counts[i]; if (acc >= need) return i + 1; }
    return MAX_LV;
  }
  var MEDIAN = quantile(0.5), P90 = quantile(0.9), P99 = quantile(0.99);

  var BANDS = [
    ['LV1',1,1],['2-4',2,4],['5-9',5,9],['10-19',10,19],['20-29',20,29],['30-39',30,39],
    ['40-49',40,49],['50-59',50,59],['60-69',60,69],['70-79',70,79],['80-89',80,89],
    ['90-99',90,99],['100+',100,MAX_LV]
  ].map(function (b) {
    var s = 0; for (var i = b[1]; i <= b[2]; i++) s += cnt[i];
    return { label: b[0], from: b[1], to: b[2], sum: s };
  });

  /* ===== 表示ユーティリティ ===== */
  function f(n, d) {
    return Number(n).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function nf(n)  { return Math.round(n).toLocaleString('ja-JP'); }
  function av(n)  { return f(n, n >= 10 ? 1 : (n >= 1 ? 2 : 3)); }
  function pct(n) { var p = n / TOTAL * 100; return f(p, p < 1 ? 2 : 1) + '%'; }
  function pctNum(n) { var p = n / TOTAL * 100; return f(p, p < 1 ? 2 : 1); }
  function hstr(lv) { return f(hensachi(lv), 1); }
  function lvColor(lv) {
    var t = Math.min(1, (lv - 1) / (MAX_LV - 1));
    return 'hsl(' + Math.round(210 - 210 * Math.pow(t, 0.7)) + ',72%,52%)';
  }

  var st = { gran: 'lv', view: 'raw', scale: 'linear' };
  var chart = null, rendered = false;

  /* ==========================================================
     ▼▼▼ ここから追加：スマホ用 横スクロール ▼▼▼
     ========================================================== */
  var MOBILE_MAX = 768;   /* この幅以下をスマホ扱い */
  var SLOT_PX    = 46;    /* 1カテゴリ（棒1本）あたりの確保幅 */
  var SC_KEY     = 'tk-uchart-scroll';

  var scMode = 'scroll';  /* 'scroll' | 'all' */
  try { scMode = localStorage.getItem(SC_KEY) || 'scroll'; } catch (_) {}

  var sc = { host: null, inner: null, tog: null, hint: null };

  function isMobile() {
    return window.matchMedia('(max-width:' + MOBILE_MAX + 'px)').matches;
  }

  /* canvas を <div>（inner）で包み、その親（host）をスクロール領域にする */
  function ensureScrollDOM() {
    if (sc.inner) return;
    var cv = document.getElementById('uChart');
    if (!cv || !cv.parentNode) return;

    var host = cv.parentNode;               /* .tk-chart-wrap.tall */
    var inner = document.createElement('div');
    inner.style.position = 'relative';
    inner.style.height   = '100%';
    host.insertBefore(inner, cv);
    inner.appendChild(cv);

    host.style.overflowY = 'hidden';
    host.style.overscrollBehaviorX = 'contain';
    host.style.WebkitOverflowScrolling = 'touch';

    var hint = document.createElement('div');
    hint.textContent = '← 横にスクロールできます';
    hint.style.cssText = 'display:none;font-size:11px;color:#5f6368;margin-top:4px;';
    host.parentNode.insertBefore(hint, host.nextSibling);

    sc.host = host; sc.inner = inner; sc.hint = hint;
    buildScrollToggle(host);
  }

  /* 「全部表示 / スクロール」ボタンをカード内ツールバーへ追加 */
  function buildScrollToggle(host) {
    var card  = host.closest('.tk-card');
    var tools = card && card.querySelector('.tk-card-tools');
    if (!tools) return;

    var box = document.createElement('div');
    box.className = 'tk-tog';
    box.innerHTML =
      '<button type="button" data-sc="all">全部表示</button>' +
      '<button type="button" data-sc="scroll">スクロール</button>';
    tools.appendChild(box);

    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.sc === scMode) return;      /* 同じボタンの連打は無視 */
      scMode = b.dataset.sc;
      try { localStorage.setItem(SC_KEY, scMode); } catch (_) {}
      renderChart();                            /* 幅ごと作り直す */
    });

    sc.tog = box;
  }

  /* チャート生成の「前」に呼ぶ。戻り値 true = スクロール状態 */
  function applyScrollLayout(n) {
    ensureScrollDOM();
    if (!sc.inner) return false;

    var mob = isMobile();
    if (sc.tog) {
      sc.tog.style.display = mob ? '' : 'none';
      Array.prototype.forEach.call(sc.tog.children, function (b) {
        b.classList.toggle('active', b.dataset.sc === scMode);
      });
    }

    sc.host.scrollLeft = 0;

    /* 非表示中は clientWidth が 0 になるのでフォールバック */
    var base = sc.host.clientWidth
            || (sc.host.parentNode && sc.host.parentNode.clientWidth)
            || window.innerWidth;

    var on = mob && scMode === 'scroll' && n > 0 && n * SLOT_PX > base;

    sc.host.style.overflowX = on ? 'auto' : 'hidden';
    sc.inner.style.width    = on ? (n * SLOT_PX) + 'px' : '100%';
    sc.hint.style.display   = on ? 'block' : 'none';

    return on;
  }
  /* ▲▲▲ 追加ここまで ▲▲▲ */

  /* ===== 指標カード ===== */
  function renderMetrics() {
    var set = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    set('uPeriodTxt', PERIOD_FROM + ' 〜 ' + PERIOD_TO + '／' + PERIOD_DAYS + '日間');

    set('uTotal', f(TOTAL, 1));
    set('uTotalSub', '忍法帖レベルを取得できた投稿者のみ（板全体の人数ではありません）');

    set('uMean', 'LV' + f(MEAN, 1));
    set('uMeanSub', '偏差値50の位置 ／ 標準偏差 ' + f(SD, 1));

    set('uMedian', 'LV' + MEDIAN);
    set('uMedianSub', '半数がLV' + MEDIAN + '以下');

    set('uTop10', 'LV' + P90);
    set('uTop10Sub', '上位1%は LV' + P99 + '以上');

    set('uMax', 'LV' + MAX_LV);
    set('uMaxSub', av(cnt[MAX_LV]) + '人/日（偏差値' + hstr(MAX_LV) + '）');
  }

  /* ===== グラフ（ツールチップに偏差値） ===== */
  function renderChart() {
    var isLv = (st.gran === 'lv'), isCum = (st.view === 'cum'), isLog = (st.scale === 'log');
    var labels, data, colors;

    if (isLv) {
      labels = levels.map(function (l) { return 'LV' + l; });
      data   = levels.map(function (l) { return isCum ? cumAtLeast[l] : cnt[l]; });
      colors = levels.map(lvColor);
    } else {
      labels = BANDS.map(function (b) { return b.label; });
      data   = BANDS.map(function (b) { return isCum ? cumAtLeast[b.from] : b.sum; });
      colors = BANDS.map(function (b) { return lvColor(b.from); });
    }
    if (isLog) data = data.map(function (v) { return v > 0 ? v : null; });

    var type = (isLv && isCum) ? 'line' : 'bar';

    /* ★ 旧チャートを先に破棄 → 幅を確定 → そのあと生成 */
    if (chart) { chart.destroy(); chart = null; }
    var scrolling = applyScrollLayout(labels.length);

    var se = document.getElementById('uChartSub');
    if (se) se.textContent = (isLv ? 'レベル別' : '帯域別') + ' / '
      + (isCum ? '累積（そのレベル以上）' : '実数') + ' / ' + (isLog ? '対数軸' : '通常軸')
      + ' — 単位: 1日あたり平均ユーザー数 ／ ホバーで偏差値表示';

    var ds = {
      label: isCum ? 'そのレベル以上' : '1日あたり平均ユーザー数',
      data: data,
      backgroundColor: type === 'line' ? 'rgba(26,115,232,.12)' : colors,
      borderColor: type === 'line' ? '#1a73e8' : colors,
      borderWidth: type === 'line' ? 2 : 0,
      borderRadius: 3,
      fill: type === 'line',
      tension: .25,
      pointRadius: 0,
      pointHoverRadius: 4,
      maxBarThickness: 46
    };

    chart = new Chart(document.getElementById('uChart'), {
      type: type,
      data: { labels: labels, datasets: [ds] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            padding: 10,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            footerFont: { size: 11, weight: 'normal' },
            callbacks: {
              /* タイトル: 「LV50　偏差値 66.0」 */
              title: function (items) {
                var it = items[0];
                if (isLv) {
                  var lv = it.dataIndex + 1;
                  return 'LV' + lv + '　偏差値 ' + hstr(lv);
                }
                var b = BANDS[it.dataIndex];
                if (b.from === b.to) return 'LV' + b.from + '　偏差値 ' + hstr(b.from);
                return 'LV' + b.from + '〜' + b.to
                     + '　偏差値 ' + hstr(b.from) + '〜' + hstr(b.to);
              },
              label: function (c) {
                var v = c.parsed.y || 0;
                var out = [];
                out.push((isCum ? 'そのレベル以上: ' : '平均ユーザー数: ') + av(v) + ' 人/日');
                out.push('全体構成比: ' + pct(v));
                if (isLv) {
                  var lv = c.dataIndex + 1;
                  out.push('LV' + lv + '以上: ' + av(cumAtLeast[lv]) + ' 人/日（上位 '
                           + pctNum(cumAtLeast[lv]) + '%）');
                  out.push('97日間の延べ: 約' + nf(cnt[lv] * PERIOD_DAYS) + ' 件');
                } else {
                  var b = BANDS[c.dataIndex];
                  out.push('LV' + b.from + '以上: ' + av(cumAtLeast[b.from]) + ' 人/日（上位 '
                           + pctNum(cumAtLeast[b.from]) + '%）');
                  out.push('97日間の延べ: 約' + nf(b.sum * PERIOD_DAYS) + ' 件');
                }
                return out;
              },
              footer: function (items) {
                var lv = isLv ? items[0].dataIndex + 1 : BANDS[items[0].dataIndex].from;
                var d = hensachi(lv) - 50;
                return '平均LV' + f(MEAN, 1) + ' から ' + (d >= 0 ? '+' : '') + f(d / 10, 2) + 'σ';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            /* ★ スクロール時はラベルを間引かない */
            ticks: {
              autoSkip: !scrolling,
              maxTicksLimit: scrolling ? labels.length : (isLv ? 26 : 13),
              maxRotation: 0
            }
          },
          y: {
            type: isLog ? 'logarithmic' : 'linear',
            beginAtZero: !isLog,
            grid: { color: '#f1f3f4' },
            ticks: { callback: function (v) { return av(v); } }
          }
        }
      }
    });
  }

  /* ===== テーブル ===== */
  function renderTable() {
    var tb = document.getElementById('uTableBody');
    if (!tb) return;
    var html = '';
    for (var lv = MAX_LV; lv >= 1; lv--) {
      if (!cnt[lv]) continue;
      html += '<tr title="LV' + lv + ' の偏差値は ' + hstr(lv) + '">'
        + '<td><span class="u-lvdot" style="background:' + lvColor(lv) + '"></span>LV' + lv + '</td>'
        + '<td class="u-h">' + hstr(lv) + '</td>'
        + '<td>' + av(cnt[lv]) + '</td>'
        + '<td>' + pct(cnt[lv]) + '</td>'
        + '<td>' + av(cumAtLeast[lv]) + '</td>'
        + '<td>' + pct(cumAtLeast[lv]) + '</td>'
        + '</tr>';
    }
    tb.innerHTML = html;
    var ft = document.getElementById('uFtTotal');
    if (ft) ft.textContent = f(TOTAL, 1);
  }

  /* ===== 外部（toukei-main.js）から呼ばれる描画エントリ ===== */
  TK.renderUserMode = function () {
    if (!rendered) { renderMetrics(); renderTable(); rendered = true; }
    renderChart();
  };
  /* ★ resize ではなく作り直す（寸法の残留を防ぐ） */
  TK.resizeUserChart = function () { if (rendered) renderChart(); };

  /* ===== 画面幅変化 ===== */
  var rzTimer = null;
  function onResize() {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(function () { if (rendered) renderChart(); }, 200);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  /* ===== 表示切替トグル（このセクション内で完結） ===== */
  function bindTog(id, key, attr) {
    var box = document.getElementById(id);
    if (!box) return;
    box.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        box.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        st[key] = b.dataset[attr];
        renderChart();
      });
    });
  }
  bindTog('uGranTog', 'gran',  'gran');
  bindTog('uViewTog', 'view',  'view');
  bindTog('uScaleTog', 'scale', 'scale');

  /* ===== 外部から参照できるように公開 ===== */
  TK.userStats = {
    data: RAW, periodDays: PERIOD_DAYS,
    total: TOTAL, mean: MEAN, sd: SD, median: MEDIAN, maxLv: MAX_LV,
    hensachi: hensachi, lvOfHensachi: lvOfH
  };
})();
