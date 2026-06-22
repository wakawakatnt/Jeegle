/* グローバル定数・状態 */
window.TK = window.TK || {};

TK.WORKER_BASE        = 'https://gentle-mouse-d138.1145148101919.workers.dev';
TK.DATA_START_DATE     = '2026-05-14';
TK.CACHE_VER           = 'v2';
TK.CACHE_KEY_PREFIX    = `jeegle_stats_${TK.CACHE_VER}_`;
TK.CURRENT_MONTH_TTL   = 5 * 60 * 1000;
TK.PAST_MONTH_TTL      = 7 * 24 * 60 * 60 * 1000;

TK.COLORS = {
  p: '#4285F4', t: '#EA4335', n: '#FBBC05', a: '#34A853',
  pi: '#9c27b0', ti: '#00897b', pt: '#e91e63'
};

/* 系列ラベル（モードで切り替え） */
TK.LABELS_HOURLY = { p:'レス数', t:'スレ立て数', n:'新規ID数', a:'アクティブID数' };
TK.LABELS_DAILY  = { p:'レス数', t:'スレ立て数', n:'総ID数',   a:'平均滞在時間' };

/* その他系列ラベル */
TK.EXTRA_LABELS_HOURLY = { pi:'レス/アクティブID', ti:'スレ立て/アクティブID', pt:'平均レス/スレ' };
TK.EXTRA_LABELS_DAILY  = { pi:'レス/総ID',         ti:'スレ立て/総ID',         pt:'平均レス/スレ' };

/* Chart.js デフォルト */
if (typeof Chart !== 'undefined') {
  Chart.defaults.font.family = "'Hiragino Kaku Gothic ProN','ヒラギノ角ゴ ProN',Meiryo,'MS Gothic',Arial,sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#3c4043';
}

/* ランタイム状態 */
TK.state = {
  mode: 'hourly',
  hourlyDayKey: 'today',
  hourlyCustomDate: '',
  dailyPeriodKey: '7days',
  dailyFrom: '',
  dailyTo: '',
  chartType: 'line',
  chartLayout: 'combined',
  seriesOn: { p:true, t:true, n:true, a:true },
  extraOn:  { pi:false, ti:false, pt:false },
  advancedOpen: false,
  tableOpen: false,
  charts: {},
  monthCache: new Map(),
  lastSeries: null,
  lastDays: []
};

/* 現在モードのラベル一式を返す */
TK.labelsFor = function(mode) {
  return (mode === 'daily') ? TK.LABELS_DAILY : TK.LABELS_HOURLY;
};
TK.extraLabelsFor = function(mode) {
  return (mode === 'daily') ? TK.EXTRA_LABELS_DAILY : TK.EXTRA_LABELS_HOURLY;
};
