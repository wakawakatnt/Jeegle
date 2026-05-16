/* UI制御・初期化・エントリポイント */
(function(){

  function buildShareURL() {
    const s = TK.state;
    const params = new URLSearchParams();
    params.set('mode', s.mode);
    const range = TK.resolveRange();
    if (s.mode === 'hourly') {
      if (range) params.set('date', TK.ymd(range.from));
    } else {
      if (range) {
        params.set('from', TK.ymd(range.from));
        params.set('to', TK.ymd(range.to));
      }
    }
    return location.origin + location.pathname + '?' + params.toString();
  }

  function applyURLParams() {
    const p = new URLSearchParams(location.search);
    if (!p.toString()) return;
    const s = TK.state;

    const m = p.get('mode');
    if (m === 'hourly' || m === 'daily') s.mode = m;

    const today = TK.today0();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const strToday = TK.ymd(today);
    const strYesterday = TK.ymd(yesterday);

    if (s.mode === 'hourly') {
      const date = p.get('date');
      if (date) {
        if (date === strToday) s.hourlyDayKey = 'today';
        else if (date === strYesterday) s.hourlyDayKey = 'yesterday';
        else s.hourlyDayKey = 'custom';
        document.getElementById('hourlyDate').value = date;
      }
    } else {
      const from = p.get('from');
      const to   = p.get('to');
      if (from && to) {
        let matchedPreset = 'custom';
        const presets = ['7days', '14days', '30days', 'month', 'lastmonth'];
        for (const preset of presets) {
          let pFrom, pTo;
          switch (preset) {
            case '7days':  pTo=new Date(today); pFrom=new Date(today); pFrom.setDate(pFrom.getDate()-6); break;
            case '14days': pTo=new Date(today); pFrom=new Date(today); pFrom.setDate(pFrom.getDate()-13); break;
            case '30days': pTo=new Date(today); pFrom=new Date(today); pFrom.setDate(pFrom.getDate()-29); break;
            case 'month':  pFrom=new Date(today.getFullYear(),today.getMonth(),1); pTo=new Date(today); break;
            case 'lastmonth': {
              const first=new Date(today.getFullYear(),today.getMonth(),1);
              pTo=new Date(first); pTo.setDate(pTo.getDate()-1);
              pFrom=new Date(pTo.getFullYear(),pTo.getMonth(),1);
              break;
            }
          }
          if (TK.ymd(pFrom) === from && TK.ymd(pTo) === to) { matchedPreset = preset; break; }
        }
        s.dailyPeriodKey = matchedPreset;
        document.getElementById('dateFrom').value = from;
        document.getElementById('dateTo').value   = to;
      }
    }
  }

  function syncUIFromState() {
    const s = TK.state;
    document.querySelectorAll('#modeSel .tk-modebtn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === s.mode);
    });
    document.getElementById('hourlyCtrls').style.display = (s.mode==='hourly') ? 'flex' : 'none';
    document.getElementById('dailyCtrls').style.display  = (s.mode==='daily')  ? 'flex' : 'none';
    document.querySelectorAll('#hourlyPbtns .tk-pbtn').forEach(b => {
      b.classList.toggle('active', b.dataset.day === s.hourlyDayKey);
    });
    document.getElementById('hourlyDate').style.display = (s.hourlyDayKey==='custom') ? 'inline-block' : 'none';
    document.querySelectorAll('#dailyPbtns .tk-pbtn').forEach(b => {
      b.classList.toggle('active', b.dataset.period === s.dailyPeriodKey);
    });
    document.getElementById('dailyCustomRange').style.display = (s.dailyPeriodKey==='custom') ? 'inline-flex' : 'none';
    document.querySelectorAll('#seriesTog button').forEach(b => {
      b.classList.toggle('active', !!s.seriesOn[b.dataset.key]);
    });
    document.querySelectorAll('#typeTog button').forEach(b => b.classList.toggle('active', b.dataset.type === s.chartType));
    document.querySelectorAll('#layoutTog button').forEach(b => b.classList.toggle('active', b.dataset.layout === s.chartLayout));
    document.getElementById('advancedSection').open = s.advancedOpen;
    document.getElementById('tableSection').open = s.tableOpen;

    TK.updateSeriesLabels();
  }

  function copyShareURL() {
    const url = buildShareURL();
    history.replaceState(null, '', url);
    const btn = document.getElementById('shareBtn');
    const origText = btn.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function() {
        btn.textContent = '✅ コピー完了';
        setTimeout(function() { btn.textContent = origText; }, 2000);
      }).catch(function() {
        prompt('URLをコピーしてください:', url);
      });
    } else {
      prompt('URLをコピーしてください:', url);
    }
  }

  async function loadData(force=false) {
    const s = TK.state;
    const range = TK.resolveRange();
    if (!range) { TK.showStatus('日付を選択してください', 'warn'); return; }

    const start = TK.parseYmd(TK.DATA_START_DATE);
    if (range.to < start) {
      TK.showStatus(`データは ${TK.DATA_START_DATE} 以降のみ存在します`, 'warn');
      return;
    }

    const btn = document.getElementById('reloadBtn');
    btn.disabled = true;
    TK.showStatus(force ? '🔄 強制再取得中…' : '読み込み中…', 'info');

    try {
      const { days, fetched, cached } = await TK.loadRange(range.from, range.to, force);
      s.lastDays = days;
      if (days.length === 0) TK.showStatus('対象期間にデータがありません', 'warn');
      else TK.hideStatus();

      const series = TK.buildSeries(days);
      s.lastSeries = series;

      TK.updateChartTitle(range);
      TK.updateSeriesLabels();
      TK.renderMetrics(days, series);
      TK.renderMainChart(series);
      if (document.getElementById('advancedSection').open) TK.render3DScatter(series);
      TK.renderTable(series);

      history.replaceState(null, '', buildShareURL());

      document.getElementById('cacheInfo').textContent = `📦 取得 ${fetched}月 / キャッシュ ${cached}月`;
      document.getElementById('lastUpdated').textContent = `最終更新: ${new Date().toLocaleString('ja-JP')}`;
    } catch (e) {
      console.error(e);
      TK.showStatus('読み込みエラー: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  function rerenderOnly() {
    const s = TK.state;
    if (s.lastSeries) TK.renderMainChart(s.lastSeries);
    history.replaceState(null, '', buildShareURL());
  }

  function initUI() {
    const s = TK.state;

    document.querySelectorAll('#modeSel .tk-modebtn').forEach(b => {
      b.addEventListener('click', () => {
        s.mode = b.dataset.mode;
        syncUIFromState();
        loadData(false);
      });
    });

    document.querySelectorAll('#hourlyPbtns .tk-pbtn').forEach(b => {
      b.addEventListener('click', () => {
        s.hourlyDayKey = b.dataset.day;
        syncUIFromState();
        if (s.hourlyDayKey !== 'custom') loadData(false);
      });
    });
    document.getElementById('hourlyDate').addEventListener('change', () => {
      if (s.hourlyDayKey === 'custom') loadData(false);
    });

    document.querySelectorAll('#dailyPbtns .tk-pbtn').forEach(b => {
      b.addEventListener('click', () => {
        s.dailyPeriodKey = b.dataset.period;
        syncUIFromState();
        if (s.dailyPeriodKey !== 'custom') loadData(false);
      });
    });
    ['dateFrom','dateTo'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        if (s.dailyPeriodKey === 'custom') {
          const a = document.getElementById('dateFrom').value;
          const b = document.getElementById('dateTo').value;
          if (a && b) loadData(false);
        }
      });
    });

    const today = TK.today0();
    if (!document.getElementById('hourlyDate').value) {
      document.getElementById('hourlyDate').value = TK.ymd(today);
    }
    document.getElementById('hourlyDate').min = TK.DATA_START_DATE;
    document.getElementById('hourlyDate').max = TK.ymd(today);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate()-6);
    if (!document.getElementById('dateFrom').value) document.getElementById('dateFrom').value = TK.ymd(weekAgo);
    if (!document.getElementById('dateTo').value)   document.getElementById('dateTo').value   = TK.ymd(today);
    document.getElementById('dateFrom').min   = TK.DATA_START_DATE;
    document.getElementById('dateTo').min     = TK.DATA_START_DATE;

    document.getElementById('reloadBtn').addEventListener('click', () => {
      TK.clearAllCache();
      loadData(true);
    });

    document.querySelectorAll('#seriesTog button').forEach(b => {
      const k = b.dataset.key;
      b.querySelector('.dot').style.background = TK.COLORS[k];
      b.addEventListener('click', () => {
        s.seriesOn[k] = !s.seriesOn[k];
        b.classList.toggle('active', s.seriesOn[k]);
        rerenderOnly();
      });
    });

    document.querySelectorAll('#typeTog button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#typeTog button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        s.chartType = b.dataset.type;
        rerenderOnly();
      });
    });

    document.querySelectorAll('#layoutTog button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#layoutTog button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        s.chartLayout = b.dataset.layout;
        rerenderOnly();
        setTimeout(() => { Object.values(s.charts).forEach(c => c.resize()); }, 30);
      });
    });

    const adv = document.getElementById('advancedSection');
    adv.addEventListener('toggle', () => {
      s.advancedOpen = adv.open;
      if (adv.open && s.lastSeries) TK.render3DScatter(s.lastSeries);
      history.replaceState(null, '', buildShareURL());
    });

    const tbl = document.getElementById('tableSection');
    tbl.addEventListener('toggle', () => {
      s.tableOpen = tbl.open;
      history.replaceState(null, '', buildShareURL());
    });

    document.getElementById('shareBtn').addEventListener('click', copyShareURL);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (s.advancedOpen && typeof Plotly !== 'undefined') {
          Plotly.Plots.resize(document.getElementById('scatter3d'));
        }
        if (s.lastSeries) rerenderOnly();
      }, 150);
    });
  }

  applyURLParams();
  initUI();
  syncUIFromState();
  loadData(false);
})();
