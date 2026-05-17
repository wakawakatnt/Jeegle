/* UI制御・初期化・エントリポイント */
(function(){

  var MAIN_SERIES_SEL = '#seriesTog > button[data-key]';

  /* ========== 日付の短縮表現 ========== */
  /* YYYY-MM-DD → YYMMDD */
  function dateToShort(ymd) {
    return ymd.replace(/-/g, '').slice(2); // "2026-05-15" → "260515"
  }
  /* YYMMDD → YYYY-MM-DD */
  function shortToDate(s) {
    if (!s || s.length !== 6) return s;
    var yy = s.slice(0,2), mm = s.slice(2,4), dd = s.slice(4,6);
    return '20' + yy + '-' + mm + '-' + dd;
  }

  /* ========== URL生成（短縮版） ========== */
  function buildShareURL() {
    var s = TK.state;
    var params = new URLSearchParams();
    var range = TK.resolveRange();

    /* m=h or m=d */
    params.set('m', s.mode === 'hourly' ? 'h' : 'd');

    /* 日付 */
    if (s.mode === 'hourly') {
      if (range) params.set('d', dateToShort(TK.ymd(range.from)));
    } else {
      if (range) {
        params.set('f', dateToShort(TK.ymd(range.from)));
        params.set('t', dateToShort(TK.ymd(range.to)));
      }
    }

    /* 系列OFF (デフォルト全ON → OFF のみ記録) */
    var offKeys = ['p','t','n','a'].filter(function(k){ return !s.seriesOn[k]; });
    if (offKeys.length > 0) params.set('o', offKeys.join(''));

    /* その他系列ON (デフォルト全OFF → ON のみ記録) */
    var extraOnKeys = ['pi','ti','pt'].filter(function(k){ return s.extraOn[k]; });
    if (extraOnKeys.length > 0) params.set('e', extraOnKeys.join(''));

    /* チャートタイプ (デフォルト line=l) */
    if (s.chartType !== 'line') params.set('c', 'b');

    /* レイアウト (デフォルト combined=c) */
    if (s.chartLayout !== 'combined') params.set('l', 's');

    /* 詳細・テーブル展開 */
    if (s.advancedOpen) params.set('a', '1');
    if (s.tableOpen) params.set('tb', '1');

    return location.origin + location.pathname + '?' + params.toString();
  }

  /* ========== URLパラメータ読み取り（新旧両対応） ========== */
  function applyURLParams() {
    var p = new URLSearchParams(location.search);
    if (!p.toString()) return;
    var s = TK.state;

    var today = TK.today0();
    var yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    var strToday = TK.ymd(today);
    var strYesterday = TK.ymd(yesterday);

    var isLegacy = p.has('mode');  /* 旧フォーマット判定 */

    /* --- モード --- */
    if (isLegacy) {
      var mOld = p.get('mode');
      if (mOld === 'hourly' || mOld === 'daily') s.mode = mOld;
    } else {
      var mNew = p.get('m');
      if (mNew === 'h') s.mode = 'hourly';
      else if (mNew === 'd') s.mode = 'daily';
    }

    /* --- 日付 --- */
    if (s.mode === 'hourly') {
      var date;
      if (isLegacy) {
        date = p.get('date');
      } else {
        var dShort = p.get('d');
        date = dShort ? shortToDate(dShort) : null;
      }
      if (date) {
        if (date === strToday) s.hourlyDayKey = 'today';
        else if (date === strYesterday) s.hourlyDayKey = 'yesterday';
        else s.hourlyDayKey = 'custom';
        document.getElementById('hourlyDate').value = date;
      }
    } else {
      var from, to;
      if (isLegacy) {
        from = p.get('from');
        to   = p.get('to');
      } else {
        var fShort = p.get('f');
        var tShort = p.get('t');
        from = fShort ? shortToDate(fShort) : null;
        to   = tShort ? shortToDate(tShort) : null;
      }
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

    /* --- 系列ON/OFF --- */
    var offParam = isLegacy ? p.get('off') : p.get('o');
    if (offParam) {
      ['p','t','n','a'].forEach(function(k) {
        s.seriesOn[k] = (offParam.indexOf(k) === -1);
      });
    }

    /* --- その他系列 --- */
    var extraParam = isLegacy ? p.get('extra') : p.get('e');
    if (extraParam) {
      /* 新: "pipt" (カンマなし連結) / 旧: "pi,pt" (カンマ区切り) */
      var extraList;
      if (extraParam.indexOf(',') !== -1) {
        extraList = extraParam.split(',');
      } else {
        /* "pipt" → ["pi","pt"] / "ti" → ["ti"] */
        extraList = [];
        var tmp = extraParam;
        ['pi','ti','pt'].forEach(function(k) {
          if (tmp.indexOf(k) !== -1) { extraList.push(k); tmp = tmp.replace(k, ''); }
        });
      }
      ['pi','ti','pt'].forEach(function(k) {
        s.extraOn[k] = (extraList.indexOf(k) !== -1);
      });
    }

    /* --- チャートタイプ --- */
    if (isLegacy) {
      var chartOld = p.get('chart');
      if (chartOld === 'bar') s.chartType = 'bar';
      else if (chartOld === 'line') s.chartType = 'line';
    } else {
      var cNew = p.get('c');
      if (cNew === 'b') s.chartType = 'bar';
      /* 省略 = line (デフォルト) */
    }

    /* --- レイアウト --- */
    if (isLegacy) {
      var layoutOld = p.get('layout');
      if (layoutOld === 'split') s.chartLayout = 'split';
      else if (layoutOld === 'combined') s.chartLayout = 'combined';
    } else {
      var lNew = p.get('l');
      if (lNew === 's') s.chartLayout = 'split';
      /* 省略 = combined (デフォルト) */
    }

    /* --- 詳細・テーブル --- */
    if (isLegacy) {
      if (p.get('adv') === '1') s.advancedOpen = true;
      if (p.get('tbl') === '1') s.tableOpen = true;
    } else {
      if (p.get('a') === '1') s.advancedOpen = true;
      if (p.get('tb') === '1') s.tableOpen = true;
    }

    /* ★ 旧フォーマットなら新フォーマットに自動リダイレクト */
    if (isLegacy) {
      /* state は復元済みなので、新URLに置換（データ読込後に行うと上書きされるのでここでフラグだけ立てる） */
      TK._needURLRewrite = true;
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

    document.querySelectorAll(MAIN_SERIES_SEL).forEach(function(b) {
      b.classList.toggle('active', !!s.seriesOn[b.dataset.key]);
    });

    document.querySelectorAll('#typeTog button').forEach(function(b) { b.classList.toggle('active', b.dataset.type === s.chartType); });
    document.querySelectorAll('#layoutTog button').forEach(function(b) { b.classList.toggle('active', b.dataset.layout === s.chartLayout); });
    document.getElementById('advancedSection').open = s.advancedOpen;
    document.getElementById('tableSection').open = s.tableOpen;

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

  /* ★ 旧URL→新URLへ即座に書き換え */
  if (TK._needURLRewrite) {
    history.replaceState(null, '', buildShareURL());
    delete TK._needURLRewrite;
  }

  loadData(false);
})();
