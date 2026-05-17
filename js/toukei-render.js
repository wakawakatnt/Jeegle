/* チャート・メトリクス・テーブル・3D描画 */
(function(){

  function destroyChart(id) {
    const charts = TK.state.charts;
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function baseOpts() {
    const mob = TK.isMobile();
    const C = TK.COLORS;
    return {
      responsive:true, maintainAspectRatio:false,
      layout: { padding: { top: 4, right: mob ? 4 : 8, bottom: 4, left: 0 } },
      plugins: {
        legend: { position:'top', align:'end',
          labels:{ boxWidth:10, padding: mob ? 6 : 10, font:{size: mob ? 10 : 11} } },
        tooltip: { mode:'index', intersect:false, padding:8, cornerRadius:6 }
      },
      interaction: { mode:'index', intersect:false },
      scales: {
        yLeft: {
          type: 'linear', position: 'left', beginAtZero: true,
          ticks: { precision:0, font:{ size: mob ? 9 : 11 }, maxTicksLimit: mob ? 6 : 11, color: C.p },
          grid: { color: 'rgba(0,0,0,0.06)' },
          title: { display: false },
          afterFit: function(scale){ if (mob) scale.width = 38; }
        },
        yRight: {
          type: 'linear', position: 'right', beginAtZero: true,
          ticks: { precision:0, font:{ size: mob ? 9 : 11 }, maxTicksLimit: mob ? 6 : 11, color: C.t },
          grid: { drawOnChartArea: false },
          title: { display: false },
          afterFit: function(scale){ if (mob) scale.width = 30; }
        },
        yRight2: {
          type: 'linear', position: 'right', beginAtZero: true,
          ticks: { precision:0, font:{ size: mob ? 9 : 11 }, maxTicksLimit: mob ? 6 : 11, color: C.a },
          grid: { drawOnChartArea: false },
          title: { display: false },
          afterFit: function(scale){ if (mob) scale.width = 30; }
        },
        yExtra: {
          type: 'linear', position: 'right', beginAtZero: true,
          ticks: {
            font:{ size: mob ? 9 : 11 }, maxTicksLimit: mob ? 5 : 8,
            color: '#9c27b0',
            callback: function(v){ return v.toFixed(1); }
          },
          grid: { drawOnChartArea: false },
          title: { display: false },
          afterFit: function(scale){ if (mob) scale.width = 30; }
        },
        x: {
          ticks: { font:{ size: mob ? 9 : 11 }, autoSkip:true, maxRotation: mob ? 0 : 50, minRotation: 0 }
        }
      }
    };
  }

  function makeDataset(key, data, type) {
    const mob = TK.isMobile();
    const mode = TK.state.mode;
    const labels = TK.labelsFor(mode);
    const extraLabels = TK.extraLabelsFor(mode);
    const color = TK.COLORS[key];
    const isExtra = ['pi','ti','pt'].includes(key);
    const label = isExtra ? extraLabels[key] : labels[key];
    const base = { label, data, borderColor: color };

    let yAxisID = 'yRight';
    if (key === 'p') yAxisID = 'yLeft';
    else if (key === 'a') yAxisID = 'yRight2';
    else if (isExtra) yAxisID = 'yExtra';

    if (type === 'line') {
      return Object.assign(base, {
        type:'line', backgroundColor: color+'33', fill:false,
        tension:0.3,
        pointRadius: mob ? 2 : 3,
        pointHoverRadius: mob ? 4 : 5,
        borderWidth: isExtra ? 1.5 : 2,
        borderDash: isExtra ? [5,3] : [],
        yAxisID
      });
    } else {
      return Object.assign(base, {
        type:'bar', backgroundColor: color+'cc', borderWidth:1, borderRadius:3,
        yAxisID
      });
    }
  }

  function tooltipLabelCallback(ctx) {
    const ds = ctx.dataset;
    const v = ctx.parsed.y;
    if (ds.label === '平均滞在時間') {
      return `${ds.label}: ${TK.fmtDec(v, 2)} h`;
    }
    // 派生指標は小数表示
    const extraKeys = Object.values(TK.EXTRA_LABELS_HOURLY).concat(Object.values(TK.EXTRA_LABELS_DAILY));
    if (extraKeys.includes(ds.label)) {
      return `${ds.label}: ${TK.fmtDec(v, 2)}`;
    }
    return `${ds.label}: ${TK.fmtNum(v)}`;
  }

  TK.renderMainChart = function(series) {
    const s = TK.state;
    const mainKeys = ['p','t','n','a'].filter(k => s.seriesOn[k]);
    const extraKeys = ['pi','ti','pt'].filter(k => s.extraOn[k]);
    const keys = mainKeys.concat(extraKeys);
    const datasets = keys.map(k => makeDataset(k, series[k], s.chartType));

    document.getElementById('mainChartBox').style.display = (s.chartLayout==='combined') ? 'block' : 'none';
    document.getElementById('splitBox').style.display     = (s.chartLayout==='split')    ? 'grid'  : 'none';

    if (s.chartLayout === 'combined') {
      destroyChart('mainChart');
      const ctx = document.getElementById('mainChart');
      if (!ctx) return;

      const hasLeft   = keys.includes('p');
      const hasRight  = keys.includes('t') || keys.includes('n');
      const hasRight2 = keys.includes('a');
      const hasExtra  = extraKeys.length > 0;

      const opts = baseOpts();
      opts.scales.yLeft.display   = hasLeft;
      opts.scales.yRight.display  = hasRight;
      opts.scales.yRight2.display = hasRight2;
      opts.scales.yExtra.display  = hasExtra;

      if (s.mode === 'daily') {
        opts.scales.yRight2.ticks.precision = 1;
        opts.scales.yRight2.ticks.callback = function(v){ return v.toFixed(1); };
      }

      if (!hasLeft) {
        if (hasRight)        opts.scales.yRight.grid  = { color: 'rgba(0,0,0,0.06)' };
        else if (hasRight2)  opts.scales.yRight2.grid = { color: 'rgba(0,0,0,0.06)' };
        else if (hasExtra)   opts.scales.yExtra.grid  = { color: 'rgba(0,0,0,0.06)' };
      }

      const mob = TK.isMobile();
      let rightPad = mob ? 4 : 8;
      const rightAxes = [hasRight, hasRight2, hasExtra].filter(Boolean).length;
      if (rightAxes >= 2) rightPad = mob ? 8 : 16;
      if (rightAxes >= 3) rightPad = mob ? 12 : 24;
      opts.layout.padding.right = rightPad;

      opts.plugins.tooltip.callbacks = { label: tooltipLabelCallback };

      s.charts['mainChart'] = new Chart(ctx.getContext('2d'), {
        data: { labels: series.labels, datasets },
        options: opts
      });
    } else {
      const mob = TK.isMobile();
      ['p','t','n','a'].forEach(k => {
        const id = 'split' + k.toUpperCase();
        destroyChart(id);
        const el = document.getElementById(id);
        if (!el) return;
        if (!s.seriesOn[k]) {
          const c = el.getContext('2d');
          c.clearRect(0,0,el.width,el.height);
          return;
        }
        const ds = makeDataset(k, series[k], s.chartType);
        ds.yAxisID = 'y';
        const yTicks = { precision:0, font:{size: mob ? 9 : 11}, maxTicksLimit: mob ? 6 : 11 };
        if (s.mode === 'daily' && k === 'a') {
          yTicks.precision = 1;
          yTicks.callback = function(v){ return v.toFixed(1); };
        }
        s.charts[id] = new Chart(el.getContext('2d'), {
          data: { labels: series.labels, datasets: [ds] },
          options: {
            responsive:true, maintainAspectRatio:false,
            layout: { padding: { top:4, right: mob ? 4 : 10, bottom:4, left:0 } },
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
                afterFit: function(scale){ if (mob) scale.width = 32; }
              },
              x: { ticks:{ font:{size: mob ? 9 : 11}, autoSkip:true, maxRotation: mob ? 0 : 50 } }
            }
          }
        });
      });
    }
  };

  /* ★ 3D散布図: 日別モードのX軸を「総ID数」に変更 */
  TK.render3DScatter = function(series) {
    const target = document.getElementById('scatter3d');
    if (!target || typeof Plotly === 'undefined') return;

    const mode = TK.state.mode;
    const labels = series.labels;

    // ★ 日別でもX軸は総ID数（series.n）に統一
    const xs = series.n;
    const ys = series.t;
    const zs = series.p;
    const as = series.a; // ホバー情報用

    const xTitle = (mode === 'daily') ? '総ID数' : '新規ID数';
    const aLabel = (mode === 'daily') ? '平均滞在時間' : 'アクティブID';
    const nLabel = (mode === 'daily') ? '総ID数' : '新規ID';
    const aFmt   = (mode === 'daily') ? (v => TK.fmtDec(v,2) + ' h') : (v => TK.fmtNum(v));

    const texts = labels.map((lab,i) =>
      `${lab}<br>${nLabel}: ${TK.fmtNum(xs[i])}<br>スレ立て: ${TK.fmtNum(ys[i])}<br>レス: ${TK.fmtNum(zs[i])}<br>${aLabel}: ${aFmt(as[i])}<br>レス/ID: ${TK.fmtDec(xs[i]>0?zs[i]/xs[i]:0,2)}`
    );

    const trace = {
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

    const layout = {
      autosize: true,
      margin: { l:0, r:0, t:8, b:0 },
      paper_bgcolor: '#fafbfc',
      scene: {
        xaxis: { title: { text: xTitle }, gridcolor:'#e0e0e0', zerolinecolor:'#bdbdbd' },
        yaxis: { title: { text:'スレ立て数' }, gridcolor:'#e0e0e0', zerolinecolor:'#bdbdbd' },
        zaxis: { title: { text:'レス数' },   gridcolor:'#e0e0e0', zerolinecolor:'#bdbdbd' },
        camera: { eye: { x:1.6, y:1.6, z:1.0 } },
        aspectmode: 'cube'
      },
      font: {
        family: "'Hiragino Kaku Gothic ProN','ヒラギノ角ゴ ProN',Meiryo,Arial,sans-serif",
        size: 11, color: '#3c4043'
      }
    };

    const sub = document.getElementById('scatter3dSub');
    if (sub) sub.textContent = `X=${xTitle} / Y=スレ立て数 / Z=レス数 — 1点=各区分（${mode==='hourly'?'時':'日'}）`;

    Plotly.react(target, [trace], layout, {
      responsive: true, displaylogo: false,
      modeBarButtonsToRemove: ['toImage'],
    });
  };

  /* ★ メトリクス: 平均をデータ存在区間のみで計算 */
  TK.renderMetrics = function(days, series) {
    const s = TK.state;
    const mode = s.mode;
    const agg = TK.aggregateAll(days);
    const { sumP, sumT, sumN, sumA } = agg;

    document.getElementById('mPosts').textContent   = TK.fmtNum(sumP);
    document.getElementById('mThreads').textContent = TK.fmtNum(sumT);
    document.getElementById('mIds').textContent     = TK.fmtNum(sumN);

    document.getElementById('mIdsLabel').textContent = (mode === 'daily') ? '総ID数' : 'ID数';

    document.getElementById('mAvgPI').textContent   = sumN>0 ? TK.fmtDec(sumP/sumN, 2) : '-';
    document.getElementById('mAvgTI').textContent   = sumN>0 ? TK.fmtDec(sumT/sumN, 2) : '-';
    document.getElementById('mAvgPT').textContent   = sumT>0 ? TK.fmtDec(sumP/sumT, 2) : '-';

    if (mode === 'hourly') {
      // ★ データが存在する時間帯数で割る（0でない時間帯のみカウント）
      const activeHours = series.p.filter((v,i) => v > 0 || series.a[i] > 0).length;
      const n = activeHours > 0 ? activeHours : 1;
      document.getElementById('mAvgA').textContent      = TK.fmtDec(sumA/n, 1);
      document.getElementById('mAvgALabel').textContent = '平均アクティブID/h';
      document.getElementById('mAvgASub').textContent   = `最大 ${TK.fmtNum(Math.max(...series.a))}（${n}h集計済）`;
    } else {
      const stay = sumN > 0 ? sumA / sumN : 0;
      document.getElementById('mAvgA').textContent      = (sumN > 0) ? (TK.fmtDec(stay, 2) + ' h') : '-';
      document.getElementById('mAvgALabel').textContent = '平均滞在時間';
      const maxStay = series.a.length ? Math.max(...series.a) : 0;
      document.getElementById('mAvgASub').textContent   = (maxStay > 0) ? `最大 ${TK.fmtDec(maxStay,2)} h/日` : '';
    }

    // ピーク
    let peak=0, peakV=-1;
    series.p.forEach((v,i)=>{ if (v>peakV){peakV=v;peak=i;} });
    if (mode === 'hourly') {
      document.getElementById('mPeakLabel').textContent = 'ピーク時間帯';
      document.getElementById('mPeak').textContent = peakV>0 ? `${peak}時` : '-';
    } else {
      document.getElementById('mPeakLabel').textContent = 'ピーク日';
      document.getElementById('mPeak').textContent = peakV>0 ? series.labels[peak] : '-';
    }
    document.getElementById('mPeakSub').textContent = peakV>0 ? `${TK.fmtNum(peakV)}レス` : '';

    if (mode === 'hourly') {
      document.getElementById('mRangeLabel').textContent = '対象日';
      document.getElementById('mRange').textContent = days[0]?.date || '-';
      const h = days[0]?.h ?? -1;
      document.getElementById('mRangeSub').textContent =
        h >= 0 ? `集計済 ${h}時${h>=23?'✓':''}` : (days[0]?.exists ? '-' : '未集計');
    } else {
      document.getElementById('mRangeLabel').textContent = '対象日数';
      document.getElementById('mRange').textContent = days.length + '日';
      document.getElementById('mRangeSub').textContent =
        days.length>0 ? `${days[0].date}〜${days[days.length-1].date}` : '';
    }

    // ★ 平均値: データが存在する区間のみで計算
    if (mode === 'hourly') {
      const activeHours = series.p.filter((v,i) => v > 0 || series.a[i] > 0).length;
      const n = activeHours > 0 ? activeHours : 1;
      const unit = `${n}h平均`;
      document.getElementById('mPostsSub').textContent   = `${unit} ${TK.fmtDec(sumP/n,1)}`;
      document.getElementById('mThreadsSub').textContent = `${unit} ${TK.fmtDec(sumT/n,1)}`;
      document.getElementById('mIdsSub').textContent     = `${unit} ${TK.fmtDec(sumN/n,1)}`;
    } else {
      const activeDays = days.filter(d => d.exists && d.sumP > 0).length;
      const n = activeDays > 0 ? activeDays : 1;
      const unit = `${n}日平均`;
      document.getElementById('mPostsSub').textContent   = `${unit} ${TK.fmtDec(sumP/n,1)}`;
      document.getElementById('mThreadsSub').textContent = `${unit} ${TK.fmtDec(sumT/n,1)}`;
      document.getElementById('mIdsSub').textContent     = `${unit} ${TK.fmtDec(sumN/n,1)}`;
    }
  };

  TK.renderTable = function(series) {
    const mode = TK.state.mode;
    document.getElementById('thLabel').textContent = (mode === 'hourly') ? '時間帯' : '日付';
    document.getElementById('thN').textContent     = (mode === 'daily')  ? '総ID数' : '新規ID';
    document.getElementById('thA').textContent     = (mode === 'daily')  ? '平均滞在時間' : 'アクティブID';

    const body = document.getElementById('statsTableBody');
    body.innerHTML = '';
    const aIsHours = (mode === 'daily');
    for (let i = 0; i < series.labels.length; i++) {
      const tr = document.createElement('tr');
      const aCell = aIsHours
        ? (series.a[i] > 0 ? TK.fmtDec(series.a[i], 2) + ' h' : '-')
        : TK.fmtNum(series.a[i]);
      tr.innerHTML = `
        <td>${series.labels[i]}</td>
        <td>${TK.fmtNum(series.p[i])}</td>
        <td>${TK.fmtNum(series.t[i])}</td>
        <td>${TK.fmtNum(series.n[i])}</td>
        <td>${aCell}</td>`;
      body.appendChild(tr);
    }
    const sumP = series.p.reduce((a,b)=>a+b,0);
    const sumT = series.t.reduce((a,b)=>a+b,0);
    const sumN = series.n.reduce((a,b)=>a+b,0);
    document.getElementById('ftPosts').textContent   = TK.fmtNum(sumP);
    document.getElementById('ftThreads').textContent = TK.fmtNum(sumT);
    document.getElementById('ftIds').textContent     = TK.fmtNum(sumN);
    if (aIsHours) {
      const days = TK.state.lastDays || [];
      let totSumA = 0, totSumN = 0;
      for (const d of days) { totSumA += d.sumA; totSumN += d.sumN; }
      const stay = totSumN > 0 ? (totSumA / totSumN) : 0;
      document.getElementById('ftActive').textContent = totSumN > 0 ? `平均 ${TK.fmtDec(stay,2)} h` : '-';
    } else {
      const activeHours = series.a.filter(v => v > 0).length || 1;
      const avgA = series.a.reduce((a,b)=>a+b,0) / activeHours;
      document.getElementById('ftActive').textContent = `平均 ${TK.fmtDec(avgA,1)}`;
    }
  };

  TK.updateChartTitle = function(range) {
    const tEl = document.getElementById('mainChartTitle');
    const sEl = document.getElementById('mainChartSub');
    const mode = TK.state.mode;
    if (mode === 'hourly') {
      tEl.textContent = '⏰ 時別推移';
      sEl.textContent = range ? TK.ymd(range.from) : '';
    } else {
      tEl.textContent = '📅 日別推移';
      sEl.textContent = range ? `${TK.ymd(range.from)} 〜 ${TK.ymd(range.to)}` : '';
    }
  };

  TK.updateSeriesLabels = function() {
    const mode = TK.state.mode;
    const L = TK.labelsFor(mode);
    const EL = TK.extraLabelsFor(mode);
    const nBtn = document.querySelector('#seriesTog .lbl-n');
    const aBtn = document.querySelector('#seriesTog .lbl-a');
    if (nBtn) nBtn.textContent = (mode === 'daily') ? '総ID' : '新規ID';
    if (aBtn) aBtn.textContent = (mode === 'daily') ? '滞在時間' : 'アクティブID';

    const splN = document.querySelector('.split-lbl-n');
    const splA = document.querySelector('.split-lbl-a');
    if (splN) splN.textContent = L.n;
    if (splA) splA.textContent = L.a;

    // その他ドロップダウンのラベル更新
    const lblPI = document.getElementById('extraLblPI');
    const lblTI = document.getElementById('extraLblTI');
    const lblPT = document.getElementById('extraLblPT');
    if (lblPI) lblPI.textContent = EL.pi;
    if (lblTI) lblTI.textContent = EL.ti;
    if (lblPT) lblPT.textContent = EL.pt;
  };
})();
