/* Firestore取得・キャッシュ・データ整形 */
(function(){

  function fsValue(v) {
    if (v == null) return null;
    if ('stringValue'    in v) return v.stringValue;
    if ('integerValue'   in v) return Number(v.integerValue);
    if ('doubleValue'    in v) return Number(v.doubleValue);
    if ('booleanValue'   in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue'      in v) return null;
    if ('mapValue' in v) {
      const out = {}; const f = v.mapValue.fields || {};
      for (const k in f) out[k] = fsValue(f[k]);
      return out;
    }
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsValue);
    return null;
  }
  function parseFirestoreDoc(doc) {
    if (!doc || !doc.fields) return null;
    const out = {};
    for (const k in doc.fields) out[k] = fsValue(doc.fields[k]);
    return out;
  }

  function isCurrentMonth(yyyymm) { return yyyymm === TK.ym(TK.today0()); }

  function readLSCache(yyyymm) {
    try {
      const raw = localStorage.getItem(TK.CACHE_KEY_PREFIX + yyyymm);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      const ttl = isCurrentMonth(yyyymm) ? TK.CURRENT_MONTH_TTL : TK.PAST_MONTH_TTL;
      if (Date.now() - obj.savedAt > ttl) return null;
      return obj.data;
    } catch { return null; }
  }
  function writeLSCache(yyyymm, data) {
    try { localStorage.setItem(TK.CACHE_KEY_PREFIX + yyyymm, JSON.stringify({ savedAt: Date.now(), data })); } catch {}
  }
  TK.clearAllCache = function() {
    TK.state.monthCache.clear();
    try {
      for (let i = localStorage.length-1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(TK.CACHE_KEY_PREFIX) || k.startsWith('jeegle_stats_'))) localStorage.removeItem(k);
      }
    } catch {}
  };

  async function fetchMonthDoc(yyyymm, force=false) {
    const mc = TK.state.monthCache;
    if (!force && mc.has(yyyymm)) return mc.get(yyyymm);
    if (!force) {
      const ls = readLSCache(yyyymm);
      if (ls !== null) { mc.set(yyyymm, ls); return ls; }
    }
    const url = `${TK.WORKER_BASE}/fs/stats/${yyyymm}`;
    try {
      const res = await fetch(url);
      if (res.status === 404) { mc.set(yyyymm, null); writeLSCache(yyyymm, null); return null; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const parsed = await res.json();   // ← Worker が既に素のJSONを返す
      mc.set(yyyymm, parsed);
      writeLSCache(yyyymm, parsed);
      return parsed;
    } catch (e) {
      console.error('fetchMonthDoc', yyyymm, e);
      mc.set(yyyymm, null);
      return null;
    }
  }

  TK.loadRange = async function(fromDate, toDate, force=false) {
    const start = TK.parseYmd(TK.DATA_START_DATE);
    if (fromDate < start) fromDate = start;
    if (toDate < start) return { days: [], fetched: 0, cached: 0 };

    const months = new Set();
    const cur = new Date(fromDate);
    while (cur <= toDate) { months.add(TK.ym(cur)); cur.setDate(cur.getDate()+1); }
    const monthList = [...months];

    let fetched=0, cached=0;
    const monthData = {};
    await Promise.all(monthList.map(async m => {
      const before = TK.state.monthCache.has(m) || readLSCache(m) !== null;
      const doc = await fetchMonthDoc(m, force);
      monthData[m] = doc;
      if (!before || force) fetched++; else cached++;
    }));

    const days = [];
    const d = new Date(fromDate);
    while (d <= toDate) {
      const mKey = TK.ym(d), dd = TK.pad2(d.getDate());
      const doc = monthData[mKey];
      const day = doc && doc.d ? doc.d[dd] : null;
      const p24 = (day && Array.isArray(day.p)) ? day.p.map(x=>Number(x)||0) : new Array(24).fill(0);
      const t24 = (day && Array.isArray(day.t)) ? day.t.map(x=>Number(x)||0) : new Array(24).fill(0);
      const n24 = (day && Array.isArray(day.n)) ? day.n.map(x=>Number(x)||0) : new Array(24).fill(0);
      const a24 = (day && Array.isArray(day.a)) ? day.a.map(x=>Number(x)||0) : new Array(24).fill(0);
      const h   = (day && day.h != null) ? Number(day.h) : -1;
      days.push({
        date: TK.ymd(d), label: `${d.getMonth()+1}/${d.getDate()}`,
        p:p24, t:t24, n:n24, a:a24, h:h,
        sumP: p24.reduce((x,y)=>x+y,0),
        sumT: t24.reduce((x,y)=>x+y,0),
        sumN: n24.reduce((x,y)=>x+y,0),
        sumA: a24.reduce((x,y)=>x+y,0),
        exists: !!day,
      });
      d.setDate(d.getDate()+1);
    }
    return { days, fetched, cached };
  };

  TK.resolveRange = function() {
    const today = TK.today0();
    const s = TK.state;
    if (s.mode === 'hourly') {
      let target;
      if (s.hourlyDayKey === 'today') target = new Date(today);
      else if (s.hourlyDayKey === 'yesterday') { target = new Date(today); target.setDate(target.getDate()-1); }
      else {
        const v = document.getElementById('hourlyDate').value;
        if (!v) return null;
        target = TK.parseYmd(v);
      }
      return { from: target, to: target };
    } else {
      let from, to;
      switch (s.dailyPeriodKey) {
        case '7days':  to=new Date(today); from=new Date(today); from.setDate(from.getDate()-6); break;
        case '14days': to=new Date(today); from=new Date(today); from.setDate(from.getDate()-13); break;
        case '30days': to=new Date(today); from=new Date(today); from.setDate(from.getDate()-29); break;
        case 'month':  from=new Date(today.getFullYear(),today.getMonth(),1); to=new Date(today); break;
        case 'lastmonth': {
          const first=new Date(today.getFullYear(),today.getMonth(),1);
          to=new Date(first); to.setDate(to.getDate()-1);
          from=new Date(to.getFullYear(),to.getMonth(),1);
          break;
        }
        case 'custom': {
          const a = document.getElementById('dateFrom').value;
          const b = document.getElementById('dateTo').value;
          if (!a || !b) return null;
          from = TK.parseYmd(a); to = TK.parseYmd(b);
          if (from > to) [from,to] = [to,from];
          break;
        }
        default: return null;
      }
      return { from, to };
    }
  };

  /* シリーズ構築
     - hourly: 24時間値そのまま + 派生指標
     - daily : 各指標は1日合計。'a' は平均滞在時間 + 派生指標 */
  TK.buildSeries = function(days) {
    const mode = TK.state.mode;
    let labels, p, t, n, a;
    if (mode === 'hourly') {
      const d = days[0];
      labels = Array.from({length:24}, (_,i)=>`${i}時`);
      if (d) { p=[...d.p]; t=[...d.t]; n=[...d.n]; a=[...d.a]; }
      else   { p=new Array(24).fill(0); t=new Array(24).fill(0); n=new Array(24).fill(0); a=new Array(24).fill(0); }
    } else {
      labels = days.map(d=>d.label);
      p = days.map(d=>d.sumP);
      t = days.map(d=>d.sumT);
      n = days.map(d=>d.sumN);
      a = days.map(d => (d.sumN > 0) ? (d.sumA / d.sumN) : 0);
    }

    // ★ 派生指標を計算
    const denomKey = (mode === 'hourly') ? a : n; // 時別: アクティブID, 日別: 総ID数
    const pi = p.map((v,i) => (denomKey[i] > 0) ? (v / denomKey[i]) : 0);
    const ti = t.map((v,i) => (denomKey[i] > 0) ? (v / denomKey[i]) : 0);
    const pt = p.map((v,i) => (t[i] > 0) ? (v / t[i]) : 0);

    return { labels, p, t, n, a, pi, ti, pt };
  };

  TK.aggregateAll = function(days) {
    let sumP=0, sumT=0, sumN=0, sumA=0;
    for (const d of days) { sumP+=d.sumP; sumT+=d.sumT; sumN+=d.sumN; sumA+=d.sumA; }
    return { sumP, sumT, sumN, sumA };
  };
})();
