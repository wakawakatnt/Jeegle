/* UI制御・初期化・エントリポイント */
(function(){

  /* ---- 主要4系列のボタンだけを安全に取得するセレクタ ---- */
  var MAIN_SERIES_SEL = '#seriesTog > button[data-key]';

  function buildShareURL() {
    var s = TK.state;
    var params = new URLSearchParams();
    params.set('mode', s.mode);
    var range = TK.resolveRange();
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
    var p = new URLSearchParams(location.search);
    if (!p.toString()) return;
    var s = TK.state;

    var m = p.get('mode');
    if (m === 'hourly' || m === 'daily') s.mode = m;

    var today = TK.today0();
    var yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    var strToday = TK.ymd(today);
    var strYesterday = TK.ymd(yesterday);

    if (s.mode === 'hourly') {
      var date = p.get('date');
      if (date) {
        if (date === strToday) s.hourlyDayKey = 'today';
        else if (date === strYesterday) s.hourlyDayKey = 'yesterday';
        else s.hourlyDayKey = 'custom';
        document.getElementById('hourlyDate').value = date;
      }
    } else {
      var from = p.get('from');
      var to   = p.get('to');
      if (from && to) {
        var matchedPreset = 'custom';
        var presets = ['7days', '14days', '30days', 'month', 'lastmonth'];
        for (var idx = 0; idx < presets.length; idx++) {
          var preset = presets[idx];
          var pFrom, pTo;
          switch (preset) {
            case '7days':  pTo=new Date(today); pFrom=new Date(today); pFrom.setDate(pFrom.getDate()-6); break;
            case '14days': pTo=new Date(today); pFrom=new Date(today); pFrom.setDate(pFrom.getDate()-13); break;
            case '30days': pTo=new Date(today); pFrom=new Date(today); pFrom.setDate(pFrom.getDate()-29); break;
            case 'month':  pFrom=new Date(today.getFullYear(),today.getMonth(),1); pTo=new Date(today); break;
            case 'lastmonth': {
              var first=new Date(today.getFullYear(),today.getMonth(),1);
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

  function updateExtraToggleStyle() {
    var btn = document.getElementById('extraToggleBtn');
    if (!btn) return;
    var anyOn = Object.values(TK.state.extraOn).some(function(v){ return v; });
    btn.classList.toggle('has-active', anyOn);
  }

  function syncUIFromState() {
    var s = TK.state;
    document.querySelectorAll('#modeSel .tk-modebtn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.mode === s.mode);
    });
    document.getElementById('hourlyCtrls').style.display = (s.mode==='hourly') ? 'flex' : 'none';
    document.getElementById('dailyCtrls').style.display  = (s.mode==='daily')  ? 'flex' : 'none';
    document.querySelectorAll('#hourlyPbtns .tk-pbtn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.day === s.hourlyDayKey);
    });
    document.getElementById('hourlyDate').style.display = (s.hourlyDayKey==='custom') ? 'inline-block' : 'none';
    document.querySelectorAll('#dailyPbtns .tk-pbtn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.period === s.dailyPeriodKey);
    });
    document.getElementById('dailyCustomRange').style.display = (s.dailyPeriodKey==='custom') ? 'inline-flex' : 'none';

    /* ★ 主要4系列ボタンのみ対象（extraToggleBtn を除外） */
    document.querySelectorAll(MAIN_SERIES_SEL).forEach(function(b) {
      b.classList.toggle('active', !!s.seriesOn[b.dataset.key]);
    });

    document.querySelectorAll('#typeTog button').forEach(function(b) { b.classList.toggle('active', b.dataset.type === s.chartType); });
    document.querySelectorAll('#layoutTog button').forEach(function(b) { b.classList.toggle('active', b.dataset.layout === s.chartLayout); });
    document.getElementById('advancedSection').open = s.advancedOpen;
    document.getElementById('tableSection').open = s.tableOpen;

    /* その他チェックボックスの状態同期 */
    document.querySelectorAll('#extraMenu input[type="checkbox"]').forEach(function(cb) {
      cb.checked = !!s.extraOn[cb.dataset.key];
    });
    updateExtraToggleStyle();

    TK.updateSeriesLabels();
  }

  function copyShareURL() {
    var url = buildShareURL();
    history.replaceState(null, '', url);
    var btn = document.getElementById('shareBtn');
    var origText = btn.textContent;
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

  async function loadData(force) {
    if (force === undefined) force = false;
    var s = TK.state;
    var range = TK.resolveRange();
    if (!range) { TK.showStatus('日付を選択してください', 'warn'); return; }

    var start = TK.parseYmd(TK.DATA_START_DATE);
    if (range.to < start) {
      TK.showStatus('データは ' + TK.DATA_START_DATE + ' 以降のみ存在します', 'warn');
      return;
    }

    var btn = document.getElementById('reloadBtn');
    btn.disabled = true;
    TK.showStatus(force ? '🔄 強制再取得中…' : '読み込み中…', 'info');

    try {
      var result = await TK.loadRange(range.from, range.to, force);
      var days = result.days, fetched = result.fetched, cached = result.cached;
      s.lastDays = days;
      if (days.length === 0) TK.showStatus('対象期間にデータがありません', 'warn');
      else TK.hideStatus();

      var series = TK.buildSeries(days);
      s.lastSeries = series;

      TK.updateChartTitle(range);
      TK.updateSeriesLabels();
      TK.renderMetrics(days, series);
      TK.renderMainChart(series);
      if (document.getElementById('advancedSection').open) TK.render3DScatter(series);
      TK.renderTable(series);

      history.replaceState(null, '', buildShareURL());

      document.getElementById('cacheInfo').textContent = '📦 取得 ' + fetched + '月 / キャッシュ ' + cached + '月';
      document.getElementById('lastUpdated').textContent = '最終更新: ' + new Date().toLocaleString('ja-JP');
    } catch (e) {
      console.error(e);
      TK.showStatus('読み込みエラー: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  function rerenderOnly() {
    var s = TK.state;
    if (s.lastSeries) TK.renderMainChart(s.lastSeries);
    history.replaceState(null, '', buildShareURL());
  }

  function initUI() {
    var s = TK.state;

    document.querySelectorAll('#modeSel .tk-modebtn').forEach(function(b) {
      b.addEventListener('click', function() {
        s.mode = b.dataset.mode;
        syncUIFromState();
        loadData(false);
      });
    });

    document.querySelectorAll('#hourlyPbtns .tk-pbtn').forEach(function(b) {
      b.addEventListener('click', function() {
        s.hourlyDayKey = b.dataset.day;
        syncUIFromState();
        if (s.hourlyDayKey !== 'custom') loadData(false);
      });
    });
    document.getElementById('hourlyDate').addEventListener('change', function() {
      if (s.hourlyDayKey === 'custom') loadData(false);
    });

    document.querySelectorAll('#dailyPbtns .tk-pbtn').forEach(function(b) {
      b.addEventListener('click', function() {
        s.dailyPeriodKey = b.dataset.period;
        syncUIFromState();
        if (s.dailyPeriodKey !== 'custom') loadData(false);
      });
    });
    ['dateFrom','dateTo'].forEach(function(id) {
      document.getElementById(id).addEventListener('change', function() {
        if (s.dailyPeriodKey === 'custom') {
          var a = document.getElementById('dateFrom').value;
          var b = document.getElementById('dateTo').value;
          if (a && b) loadData(false);
        }
      });
    });

    var today = TK.today0();
    if (!document.getElementById('hourlyDate').value) {
      document.getElementById('hourlyDate').value = TK.ymd(today);
    }
    document.getElementById('hourlyDate').min = TK.DATA_START_DATE;
    document.getElementById('hourlyDate').max = TK.ymd(today);
    var weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate()-6);
    if (!document.getElementById('dateFrom').value) document.getElementById('dateFrom').value = TK.ymd(weekAgo);
    if (!document.getElementById('dateTo').value)   document.getElementById('dateTo').value   = TK.ymd(today);
    document.getElementById('dateFrom').min = TK.DATA_START_DATE;
    document.getElementById('dateTo').min   = TK.DATA_START_DATE;

    document.getElementById('reloadBtn').addEventListener('click', function() {
      TK.clearAllCache();
      loadData(true);
    });

    /* ★ 主要4系列ボタンのみ（直接の子 button[data-key]） */
    document.querySelectorAll(MAIN_SERIES_SEL).forEach(function(b) {
      var k = b.dataset.key;
      var dot = b.querySelector('.dot');
      if (dot) dot.style.background = TK.COLORS[k];
      b.addEventListener('click', function() {
        s.seriesOn[k] = !s.seriesOn[k];
        b.classList.toggle('active', s.seriesOn[k]);
        rerenderOnly();
      });
    });

    /* ★ その他ドロップダウン */
    var extraToggle = document.getElementById('extraToggleBtn');
    var extraMenu   = document.getElementById('extraMenu');
    if (extraToggle && extraMenu) {
      extraToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        extraMenu.classList.toggle('open');
      });
      extraMenu.addEventListener('click', function(e) {
        e.stopPropagation();
      });
      extraMenu.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
        cb.addEventListener('change', function() {
          s.extraOn[cb.dataset.key] = cb.checked;
          updateExtraToggleStyle();
          rerenderOnly();
        });
      });
      document.addEventListener('click', function() {
        extraMenu.classList.remove('open');
      });
    }

    document.querySelectorAll('#typeTog button').forEach(function(b) {
      b.addEventListener('click', function() {
        document.querySelectorAll('#typeTog button').forEach(function(x) { x.classList.remove('active'); });
        b.classList.add('active');
        s.chartType = b.dataset.type;
        rerenderOnly();
      });
    });

    document.querySelectorAll('#layoutTog button').forEach(function(b) {
      b.addEventListener('click', function() {
        document.querySelectorAll('#layoutTog button').forEach(function(x) { x.classList.remove('active'); });
        b.classList.add('active');
        s.chartLayout = b.dataset.layout;
        rerenderOnly();
        setTimeout(function() { Object.values(s.charts).forEach(function(c) { c.resize(); }); }, 30);
      });
    });

    var adv = document.getElementById('advancedSection');
    adv.addEventListener('toggle', function() {
      s.advancedOpen = adv.open;
      if (adv.open && s.lastSeries) TK.render3DScatter(s.lastSeries);
      history.replaceState(null, '', buildShareURL());
    });

    var tbl = document.getElementById('tableSection');
    tbl.addEventListener('toggle', function() {
      s.tableOpen = tbl.open;
      history.replaceState(null, '', buildShareURL());
    });

    document.getElementById('shareBtn').addEventListener('click', copyShareURL);

    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
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
