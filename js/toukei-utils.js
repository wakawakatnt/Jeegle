/* 汎用ユーティリティ */
(function(){
  TK.pad2 = n => String(n).padStart(2,'0');
  TK.ymd  = d => `${d.getFullYear()}-${TK.pad2(d.getMonth()+1)}-${TK.pad2(d.getDate())}`;
  TK.ym   = d => `${d.getFullYear()}-${TK.pad2(d.getMonth()+1)}`;
  TK.parseYmd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
  TK.fmtNum = n => (n==null||isNaN(n)) ? '-' : Math.round(n).toLocaleString('ja-JP');
  TK.fmtDec = (n,d=2) => (n==null||isNaN(n)||!isFinite(n)) ? '-' : n.toFixed(d);
  TK.today0 = function() { const d = new Date(); d.setHours(0,0,0,0); return d; };
  TK.isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  TK.showStatus = function(msg, type='info') {
    const el = document.getElementById('statusBar');
    el.textContent = msg;
    el.className = 'tk-status show ' + type;
  };
  TK.hideStatus = function() {
    document.getElementById('statusBar').classList.remove('show');
  };
})();
