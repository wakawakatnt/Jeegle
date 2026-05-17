/* チャート・メトリクス・テーブル・3D描画 */
(function(){

  function destroyChart(id) {
    var charts = TK.state.charts;
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  /*  ★ 軸の設計方針
      ─────────────────────────────────────
      各系列に独立した Y 軸を与えてスケール干渉を排除する。
      ただし右側に軸ラベル(数値)を並べるとグラフが潰れるので:
        - 左軸 (yLeft) : 数値表示あり（一番主要な系列用）
        - 右軸すべて   : 数値非表示 (ticks.display=false, grid非表示)
      値はツールチップ + 凡例色で判別する。
      凡例の横にスケール目安を置く代わりに、
      ホバー時のツールチップで正確な値を確認できる。
      ─────────────────────────────────────  */

  /* 全系列の軸ID定義 */
  var AXIS_MAP = {
    p:  'yP',
    t:  'yT',
    n:  'yN',
    a:  'yA',
    pi: 'yPI',
    ti: 'yTI',
    pt: 'yPT'
  };

  function buildScales(activeKeys, mode) {
    var mob = TK.isMobile();
    var C = TK.COLORS;
    var scales = {};

    /* X 軸 */
    scales.x = {
      ticks: { font:{ size: mob ? 9 : 11 }, autoSkip:true, maxRotation: mob ? 0 : 50, minRotation: 0 }
    };

    /* 左軸候補の優先順: p > n > t > a > pi > pt > ti */
    var leftPriority = ['p','n','t','a','pi','pt','ti'];
    var leftKey = null;
    for (var i = 0; i < leftPriority.length; i++) {
      if (activeKeys.indexOf(leftPriority[i]) !== -1) { leftKey = leftPriority[i]; break; }
    }

    activeKeys.forEach(function(key) {
      var axisId = AXIS_MAP[key];
      var isLeft = (key === leftKey);
      var color = C[key] || '#5f6368';
      var isRatio = (key === 'pi' || key === 'ti' || key === 'pt');
      var isStayTime = (mode === 'daily' && key === 'a');

      scales[axisId] = {
        type: 'linear',
        position: isLeft ? 'left' : 'right',
        beginAtZero: true,
        display: true,
        ticks: {
          display: isLeft,            /* ★ 左軸のみ数値表示 */
          precision: (isRatio || isStayTime) ? 1 : 0,
          font: { size: mob ? 9 : 11 },
          maxTicksLimit: mob ? 6 : 11,
          color: color
        },
        grid: {
          display: isLeft,            /* ★ 左軸のみグリッド線 */
          color: isLeft ? 'rgba(0,0,0,0.06)' : 'transparent',
          drawOnChartArea: isLeft
        },
        title: { display: false },
        afterFit: function(scale) {
          /* 右軸は幅を 0 に潰す → グラフ領域を最大化 */
          if (scale.position === 'right') scale.width = 0;
          else if (mob) scale.width = 38;
        }
      };

      if (isStayTime) {
        scales[axisId].ticks.callback = function(v){ return v.toFixed(1); };
      }
      if (isRatio && isLeft) {
        scales[axisId].ticks.callback = function(v){ return v.toFixed(1); };
      }
    });

    return scales;
  }

  function makeDataset(key, data, type) {
    var mob = TK.isMobile();
    var mode = TK.state.mode;
    var labels = TK.labelsFor(mode);
    var extraLabels = TK.extraLabelsFor(mode);
    var color = TK.COLORS[key];
    var isExtra = (key === 'pi' || key === 'ti' || key === 'pt');
    var label = isExtra ? extraLabels[key] : labels[key];
    var base = { label: label, data: data, borderColor: color };
    var yAxisID = AXIS_MAP[key];

    if (type === 'line') {
      return Object.assign(base, {
        type:'line', backgroundColor: color+'33', fill:false,
        tension:0.3,
        pointRadius: mob ? 2 : 3,
        pointHoverRadius: mob ? 4 : 5,
        borderWidth: isExtra ? 1.5 : 2,
        borderDash: isExtra ? [5,3] : [],
        yAxisID: yAxisID
      });
    } else {
      return Object.assign(base, {
        type:'bar', backgroundColor: color+'cc', borderWidth:1, borderRadius:3,
        yAxisID: yAxisID
      });
    }
  }

  function tooltipLabelCallback(ctx) {
    var ds = ctx.dataset;
    var v = ctx.parsed.y;
    if (ds.label === '平均滞在時間') {
      return ds.label + ': ' + TK.fmtDec(v, 2) + ' h';
    }
    var extraKeys = Object.values(TK.EXTRA_LABELS_HOURLY).concat(Object.values(TK.EXTRA_LABELS_DAILY));
    if (extraKeys.indexOf(ds.label) !== -1) {
      return ds.label + ': ' + TK.fmtDec(v, 2);
    }
    return ds.label + ': ' + TK.fmtNum(v);
  }

  function getActiveHourCount(days) {
    if (!days || !days[0]) return 1;
    var day = days[0];
    var h = (day.h != null && day.h >= 0) ? day.h : -1;
    if (h >= 0) return Math.max(h, 1);
    var count = 0;
    var p = day.p || [];
    var a = day.a || [];
    for (var i = 0; i < 24; i++) {
      if ((p[i] || 0) > 0 || (a[i] || 0) > 0) count++;
    }
    return Math.max(count, 1);
  }

  TK.renderMainChart = function(series) {
    var s = TK.state;
    var mainKeys = ['p','t','n','a'].filter(function(k){ return s.seriesOn[k]; });
    var extraKeys = ['pi','ti','pt'].filter(function(k){ return s.extraOn[k]; });
    var keys = mainKeys.concat(extraKeys);
    var datasets = keys.map(function(k){ return makeDataset(k, series[k], s.chartType); });

    document.getElementById('mainChartBox').style.display = (s.chartLayout==='combined') ? 'block' : 'none';
    document.getElementById('splitBox').style.display     = (s.chartLayout==='split')    ? 'grid'  : 'none';

    if (s.chartLayout === 'combined') {
      destroyChart('mainChart');
      var ctx = document.getElementById('mainChart');
      if (!ctx) return;

      var scales = buildScales(keys, s.mode);
      var mob = TK.isMobile();

      var opts = {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 4, right: mob ? 8 : 12, bottom: 4, left: 0 } },
        plugins: {
          legend: {
            position: 'top', align: 'end',
            labels: { boxWidth: 10, padding: mob ? 6 : 10, font: { size: mob ? 10 : 11 } }
          },
          tooltip: {
            mode: 'index', intersect: false, padding: 8, cornerRadius: 6,
            callbacks: { label: tooltipLabelCallback }
          }
        },
        interaction: { mode: 'index', intersect: false },
        scales: scales
      };

      s.charts['mainChart'] = new Chart(ctx.getContext('2d'), {
        data: { labels: series.labels, datasets: datasets },
        options: opts
      });
    } else {
      /* 分割表示 */
      var mob2 = TK.isMobile();
      ['p','t','n','a'].forEach(function(k) {
        var id = 'split' + k.toUpperCase();
        destroyChart(id);
        var el = document.getElementById(id);
        if (!el) return;
        if (!s.seriesOn[k]) {
          var c = el.getContext('2d');
          c.clearRect(0,0,el.width,el.height);
          return;
        }
        var ds = makeDataset(k, series[k], s.chartType);
        ds.yAxisID = 'y';
        var isStayTime = (s.mode === 'daily' && k === 'a');
        var yTicks = { precision:0, font:{size: mob2 ? 9 : 11}, maxTicksLimit: mob2 ? 6 : 11 };
        if (isStayTime) {
          yTicks.precision = 1;
          yTicks.callback = function(v){ return v.toFixed(1); };
        }
        s.charts[id] = new Chart(el.getContext('2d'), {
          data: { labels: series.labels, datasets: [ds] },
          options: {
            responsive:true, maintainAspectRatio:false,
            layout: { padding: { top:4, right: mob2 ? 4 : 10, bottom:4, left:0 } },
            plugins: {
              legend: { display:false },
              tooltip: {
                mode:'index', intersect:false, padding:8, cornerRadius:6,
                callbacks: { label: tooltipLabelCallback }
              }
            },
            scales: {
              y: {
                beginAtZero:true, ticks: yTicks,
                afterFit: function(scale){ if (TK.isMobile()) scale.width = 32; }
              },
              x: { ticks:{ font:{size: mob2 ? 9 : 11}, autoSkip:true, maxRotation: mob2 ? 0 : 50 } }
            }
          }
        });
      });
    }
  };

  TK.render3DScatter = function(series) {
    var target = document.getElementById('scatter3d');
    if (!target || typeof Plotly === 'undefined') return;

    var mode = TK.state.mode;
    var labels = series.labels;
    var xs = (mode === 'hourly') ? series.a : series.n;
    var ys = series.t;
    var zs = series.p;
    var extraData  = (mode === 'hourly') ? series.n : series.a;
    var extraLabel = (mode === 'hourly') ? '新規ID' : '平均滞在時間';
    var extraFmt   = (mode === 'hourly')
      ? function(v){ return TK.fmtNum(v); }
      : function(v){ return TK.fmtDec(v,2) + ' h'; };

    var xTitle = (mode === 'hourly') ? 'アクティブID数' : '総ID数';
    var texts = labels.map(function(lab,i) {
      return lab
        + '<br>' + xTitle + ': ' + TK.fmtNum(xs[i])
        + '<br>スレ立て: ' + TK.fmtNum(ys[i])
        + '<br>レス: ' + TK.fmtNum(zs[i])
        + '<br>' + extraLabel + ': ' + extraFmt(extraData[i])
        + '<br>レス/ID: ' + TK.fmtDec(xs[i]>0 ? zs[i]/xs[i] : 0, 2);
    });

    var trace = {
      type: 'scatter3d', mode: 'markers+text',
      x: xs, y: ys, z: zs,
      text: labels, hovertext: texts, hoverinfo: 'text',
      textposition: 'top center',
      textfont: { size: 9, color: '#5f6368' },
      marker: {
        size: 7, color: zs,
        colorscale: [
          [0,    '#4285F4'],
          [0.33, '#34A853'],
          [0.66, '#FBBC05'],
          [1,    '#EA4335']
        ],
        colorbar: { title: { text:'レス数', font:{ size:10 } }, thickness:12, len:0.6 },
        opacity: 0.9,
        line: { color:'#fff', width:0.5 }
      }
    };

    var axisBase = {
      gridcolor: '#e0e0e0',
      zeroline: false,
      zerolinewidth: 0,
      zerolinecolor: 'rgba(0,0,0,0)',
      showspikes: false,
      rangemode: 'tozero'
    };

    var layout = {
      autosize: true,
      margin: { l:0, r:0, t:8, b:0 },
      paper_bgcolor: '#fafbfc',
      scene: {
        xaxis: Object.assign({ title: { text: xTitle } }, axisBase),
        yaxis: Object.assign({ title: { text:'スレ立て数' } }, axisBase),
        zaxis: Object.assign({ title: { text:'レス数' } },   axisBase),
        camera: { eye: { x: -1.5, y: 1.9, z: 1.5 } },
        aspectmode: 'cube'
      },
      font: {
        family: "'Hiragino Kaku Gothic ProN','ヒラギノ角ゴ ProN',Meiryo,Arial,sans-serif",
        size: 11, color: '#3c4043'
      }
    };

    var sub = document.getElementById('scatter3dSub');
    if (sub) sub.textContent = 'X='+xTitle+' / Y=スレ立て数 / Z=レス数 — 1点=各区分（'+(mode==='hourly'?'時':'日')+'）';

    Plotly.react(target, [trace], layout, {
      responsive: true, displaylogo: false,
      modeBarButtonsToRemove: ['toImage'],
    });
  };

  TK.renderMetrics = function(days, series) {
    var s = TK.state;
    var mode = s.mode;
    var agg = TK.aggregateAll(days);
    var sumP = agg.sumP, sumT = agg.sumT, sumN = agg.sumN, sumA = agg.sumA;

    document.getElementById('mPosts').textContent   = TK.fmtNum(sumP);
    document.getElementById('mThreads').textContent = TK.fmtNum(sumT);
    document.getElementById('mIds').textContent     = TK.fmtNum(sumN);

    document.getElementById('mIdsLabel').textContent = (mode === 'daily') ? '総ID数' : 'ID数';

    document.getElementById('mAvgPI').textContent   = sumN>0 ? TK.fmtDec(sumP/sumN, 2) : '-';
    document.getElementById('mAvgTI').textContent   = sumN>0 ? TK.fmtDec(sumT/sumN, 2) : '-';
    document.getElementById('mAvgPT').textContent   = sumT>0 ? TK.fmtDec(sumP/sumT, 2) : '-';

    if (mode === 'hourly') {
      var activeHours = getActiveHourCount(days);
      document.getElementById('mAvgA').textContent      = TK.fmtDec(sumA / activeHours, 1);
      document.getElementById('mAvgALabel').textContent = '平均アクティブID/h';
      document.getElementById('mAvgASub').textContent   = '最大 ' + TK.fmtNum(Math.max.apply(null, series.a)) + '（' + activeHours + 'h集計済）';
    } else {
      var stay = sumN > 0 ? sumA / sumN : 0;
      document.getElementById('mAvgA').textContent      = (sumN > 0) ? (TK.fmtDec(stay, 2) + ' h') : '-';
      document.getElementById('mAvgALabel').textContent = '平均滞在時間';
      var maxStay = series.a.length ? Math.max.apply(null, series.a) : 0;
      document.getElementById('mAvgASub').textContent   = (maxStay > 0) ? '最大 ' + TK.fmtDec(maxStay,2) + ' h/日' : '';
    }

    var peak=0, peakV=-1;
    series.p.forEach(function(v,i){ if (v>peakV){peakV=v;peak=i;} });
    if (mode === 'hourly') {
      document.getElementById('mPeakLabel').textContent = 'ピーク時間帯';
      document.getElementById('mPeak').textContent = peakV>0 ? peak+'時' : '-';
    } else {
      document.getElementById('mPeakLabel').textContent = 'ピーク日';
      document.getElementById('mPeak').textContent = peakV>0 ? series.labels[peak] : '-';
    }
    document.getElementById('mPeakSub').textContent = peakV>0 ? TK.fmtNum(peakV)+'レス' : '';

    if (mode === 'hourly') {
      document.getElementById('mRangeLabel').textContent = '対象日';
      document.getElementById('mRange').textContent = (days[0] && days[0].date) ? days[0].date : '-';
      var h = (days[0] && days[0].h != null) ? days[0].h : -1;
      document.getElementById('mRangeSub').textContent =
        h >= 0 ? '集計済 ' + h + '時' + (h>=23?'✓':'') : ((days[0] && days[0].exists) ? '-' : '未集計');
    } else {
      document.getElementById('mRangeLabel').textContent = '対象日数';
      document.getElementById('mRange').textContent = days.length + '日';
      document.getElementById('mRangeSub').textContent =
        days.length>0 ? days[0].date + '〜' + days[days.length-1].date : '';
    }

    if (mode === 'hourly') {
      var n = getActiveHourCount(days);
      var unit = n + 'h平均';
      document.getElementById('mPostsSub').textContent   = unit + ' ' + TK.fmtDec(sumP/n,1);
      document.getElementById('mThreadsSub').textContent = unit + ' ' + TK.fmtDec(sumT/n,1);
      document.getElementById('mIdsSub').textContent     = unit + ' ' + TK.fmtDec(sumN/n,1);
    } else {
      var activeDays = days.filter(function(d){ return d.exists && d.sumP > 0; }).length;
      var nd = activeDays > 0 ? activeDays : 1;
      var unitD = nd + '日平均';
      document.getElementById('mPostsSub').textContent   = unitD + ' ' + TK.fmtDec(sumP/nd,1);
      document.getElementById('mThreadsSub').textContent = unitD + ' ' + TK.fmtDec(sumT/nd,1);
      document.getElementById('mIdsSub').textContent     = unitD + ' ' + TK.fmtDec(sumN/nd,1);
    }
  };

  TK.renderTable = function(series) {
    var mode = TK.state.mode;
    document.getElementById('thLabel').textContent = (mode === 'hourly') ? '時間帯' : '日付';
    document.getElementById('thN').textContent     = (mode === 'daily')  ? '総ID数' : '新規ID';
    document.getElementById('thA').textContent     = (mode === 'daily')  ? '平均滞在時間' : 'アクティブID';

    var body = document.getElementById('statsTableBody');
    body.innerHTML = '';
    var aIsHours = (mode === 'daily');
    for (var i = 0; i < series.labels.length; i++) {
      var tr = document.createElement('tr');
      var aCell = aIsHours
        ? (series.a[i] > 0 ? TK.fmtDec(series.a[i], 2) + ' h' : '-')
        : TK.fmtNum(series.a[i]);
      tr.innerHTML =
        '<td>'+series.labels[i]+'</td>'+
        '<td>'+TK.fmtNum(series.p[i])+'</td>'+
        '<td>'+TK.fmtNum(series.t[i])+'</td>'+
        '<td>'+TK.fmtNum(series.n[i])+'</td>'+
        '<td>'+aCell+'</td>';
      body.appendChild(tr);
    }
    var sumP = series.p.reduce(function(a,b){return a+b;},0);
    var sumT = series.t.reduce(function(a,b){return a+b;},0);
    var sumN = series.n.reduce(function(a,b){return a+b;},0);
    document.getElementById('ftPosts').textContent   = TK.fmtNum(sumP);
    document.getElementById('ftThreads').textContent = TK.fmtNum(sumT);
    document.getElementById('ftIds').textContent     = TK.fmtNum(sumN);
    if (aIsHours) {
      var daysArr = TK.state.lastDays || [];
      var totSumA = 0, totSumN = 0;
      for (var j = 0; j < daysArr.length; j++) { totSumA += daysArr[j].sumA; totSumN += daysArr[j].sumN; }
      var stayVal = totSumN > 0 ? (totSumA / totSumN) : 0;
      document.getElementById('ftActive').textContent = totSumN > 0 ? '平均 ' + TK.fmtDec(stayVal,2) + ' h' : '-';
    } else {
      var activeCount = series.a.filter(function(v){ return v > 0; }).length || 1;
      var avgA = series.a.reduce(function(a,b){return a+b;},0) / activeCount;
      document.getElementById('ftActive').textContent = '平均 ' + TK.fmtDec(avgA,1);
    }
  };

  TK.updateChartTitle = function(range) {
    var tEl = document.getElementById('mainChartTitle');
    var sEl = document.getElementById('mainChartSub');
    var mode = TK.state.mode;
    if (mode === 'hourly') {
      tEl.textContent = '⏰ 時別推移';
      sEl.textContent = range ? TK.ymd(range.from) : '';
    } else {
      tEl.textContent = '📅 日別推移';
      sEl.textContent = range ? TK.ymd(range.from) + ' 〜 ' + TK.ymd(range.to) : '';
    }
  };

  TK.updateSeriesLabels = function() {
    var mode = TK.state.mode;
    var L = TK.labelsFor(mode);
    var EL = TK.extraLabelsFor(mode);
    var nBtn = document.querySelector('#seriesTog .lbl-n');
    var aBtn = document.querySelector('#seriesTog .lbl-a');
    if (nBtn) nBtn.textContent = (mode === 'daily') ? '総ID' : '新規ID';
    if (aBtn) aBtn.textContent = (mode === 'daily') ? '滞在時間' : 'アクティブID';

    var splN = document.querySelector('.split-lbl-n');
    var splA = document.querySelector('.split-lbl-a');
    if (splN) splN.textContent = L.n;
    if (splA) splA.textContent = L.a;

    var lblPI = document.getElementById('extraLblPI');
    var lblTI = document.getElementById('extraLblTI');
    var lblPT = document.getElementById('extraLblPT');
    if (lblPI) lblPI.textContent = EL.pi;
    if (lblTI) lblTI.textContent = EL.ti;
    if (lblPT) lblPT.textContent = EL.pt;
  };
})();
