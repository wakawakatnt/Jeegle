"use strict";

/* ================================================================
   ID属性判定システム — js/id-traits.js
   ================================================================
   
   使い方:
     var traits = idaCalcTraits(posts, threadList, threadsMade, hourCounts, totalPosts);
     // → [{ id, icon, name, score, desc }, ...]  スコア降順
   
   posts       : レス配列 [{body, posted_at, is_nusi, post_num, ...}, ...]
   threadList  : [{title, count, isNusi}, ...]
   threadsMade : スレ立てレス配列
   hourCounts  : [24] 時間帯配列
   totalPosts  : 総レス数
   ================================================================ */

/* ===== キーワード辞書 ===== */
var TRAIT_DICT = {

  politics: {
    words: ["政治","選挙","自民","立憲","維新","共産","公明","与党","野党","国会",
            "首相","総理","岸田","石破","野田","議員","政権","内閣","保守","リベラル",
            "右翼","左翼","ネトウヨ","パヨク","増税","減税","憲法","安倍","民主","参院",
            "衆院","法案","閣議"],
    threadBonus: 3,
    nusiBonus: 5
  },

  baseball: {
    words: ["野球","打率","防御率","ホームラン","甲子園","ピッチャー","バッター",
            "セリーグ","パリーグ","巨人","阪神","中日","横浜","広島","ヤクルト",
            "ソフトバンク","楽天","西武","ロッテ","オリックス","日ハム","npb",
            "大谷","ダルビッシュ","佐々木","打線","投手","捕手","遊撃","内野","外野",
            "ドラフト","交流戦","日本シリーズ","WBC","野球民"],
    threadBonus: 3,
    nusiBonus: 5
  },

  soccer: {
    words: ["サッカー","Jリーグ","ワールドカップ","W杯","プレミアリーグ","リーガ",
            "ブンデス","セリエ","チャンピオンズリーグ","CL","代表","フォワード",
            "ミッドフィルダー","ゴールキーパー","オフサイド","PKl","レアル","バルサ",
            "マンチェスター","リバプール","三笘","久保","遠藤","冨安","FIFA"],
    threadBonus: 3,
    nusiBonus: 5
  },

  anime: {
    words: ["アニメ","声優","作画","op","ed","クール","ラノベ","漫画","コミック",
            "ジャンプ","マガジン","サンデー","同人","コミケ","推し","萌え","覇権",
            "神回","作監","原作","連載","打ち切り","単行本","アニオタ","深夜アニメ"],
    threadBonus: 3,
    nusiBonus: 5
  },

  game: {
    words: ["ゲーム","ソシャゲ","ガチャ","リセマラ","攻略","steam","PS5","switch",
            "任天堂","スクエニ","カプコン","フロム","エルデンリング","ポケモン",
            "マリオ","ゼルダ","FF","ドラクエ","モンハン","スプラ","APEXl","valorant",
            "LOL","FPS","RPG","MMO","eスポーツ","プロゲーマー","配信","実況プレイ"],
    threadBonus: 3,
    nusiBonus: 5
  },

  vtuber: {
    words: ["vtuber","ホロライブ","にじさんじ","配信","スパチャ","切り抜き",
            "ぺこら","マリン","すいせい","みこ","ころね","スバル","あくあ",
            "葛葉","叶","委員長","サロメ","ライバー","箱推し","同接","案件"],
    threadBonus: 3,
    nusiBonus: 5
  },

  idol: {
    words: ["アイドル","坂道","乃木坂","櫻坂","日向坂","AKB","SKE","NMB","HKT",
            "ジャニーズ","STARTO","推し活","握手会","ライブ","コンサート","センター",
            "選抜","卒業","加入"],
    threadBonus: 3,
    nusiBonus: 5
  },

  horse: {
    words: ["競馬","馬","ダービー","G1","G2","G3","重賞","騎手","調教","JRA",
            "ウマ娘","有馬記念","天皇賞","オークス","皐月賞","菊花賞","馬券",
            "単勝","複勝","三連","武豊","ルメール","パドック","出走"],
    threadBonus: 3,
    nusiBonus: 5
  },

  gambling: {
    words: ["パチンコ","パチスロ","スロット","台","出玉","確変","大当り","回転",
            "ボーダー","期待値","万発","養分","ジャグラー","北斗","海物語",
            "競艇","競輪","ボートレース","賭け","カジノ"],
    threadBonus: 3,
    nusiBonus: 5
  },

  tech: {
    words: ["プログラミング","エンジニア","python","javascript","AI","ChatGPT",
            "機械学習","linux","サーバー","データベース","github","コード","開発",
            "IT","SE","SES","web","フロントエンド","バックエンド","API","スクリプト",
            "アプリ","iPhone","Android","ガジェット","スペック","GPU","CPU","自作PC"],
    threadBonus: 3,
    nusiBonus: 5
  },

  food: {
    words: ["飯","ラーメン","カレー","寿司","焼肉","うどん","そば","牛丼",
            "マック","吉野家","すき家","松屋","ファミレス","コンビニ","弁当",
            "自炊","料理","美味","旨い","食べ","カロリー","デブ","ダイエット"],
    threadBonus: 2,
    nusiBonus: 4
  },

  love: {
    words: ["彼女","彼氏","告白","デート","マッチングアプリ","結婚","離婚","嫁",
            "夫","恋愛","モテ","非モテ","童貞","処女","セックス","風俗","出会い",
            "浮気","不倫","ナンパ"],
    threadBonus: 3,
    nusiBonus: 5
  },

  work: {
    words: ["仕事","会社","上司","部下","転職","退職","年収","給料","残業",
            "ブラック","ホワイト","面接","就活","内定","派遣","正社員","バイト",
            "フリーター","昇進","ボーナス","有給"],
    threadBonus: 2,
    nusiBonus: 4
  },

  study: {
    words: ["受験","偏差値","大学","東大","京大","早慶","MARCH","旧帝","Fラン",
            "センター","共通テスト","模試","塾","予備校","勉強","数学","英語",
            "理系","文系","院試","資格"],
    threadBonus: 3,
    nusiBonus: 5
  },

  train: {
    words: ["鉄道","電車","新幹線","JR","私鉄","地下鉄","路線","ダイヤ","撮り鉄",
            "乗り鉄","車両","駅","時刻表","運行","遅延","鉄オタ"],
    threadBonus: 3,
    nusiBonus: 5
  },

  car: {
    words: ["車","自動車","トヨタ","ホンダ","日産","マツダ","スバル","BMW","ベンツ",
            "運転","免許","MT","AT","ドライブ","高速","エンジン","EV","SUV","セダン"],
    threadBonus: 3,
    nusiBonus: 5
  },

  military: {
    words: ["軍事","ミリタリー","戦車","戦闘機","空母","自衛隊","米軍","NATO",
            "ウクライナ","ロシア","中国","核","ミサイル","戦争","兵器","銃"],
    threadBonus: 3,
    nusiBonus: 5
  }
};

/* ===== 属性マスター ===== */
var TRAIT_DEFS = {
  neet:       { icon:"🌙", name:"ニート",       desc:"深夜〜早朝の住人", minScore:1 },
  earlybird:  { icon:"🌅", name:"早起き民",     desc:"早朝から活動開始", minScore:1 },
  politics:   { icon:"🏛️", name:"政治豚",       desc:"政治の話が大好き", minScore:8 },
  baseball:   { icon:"⚾", name:"野球民",       desc:"野球の話が止まらない", minScore:8 },
  soccer:     { icon:"⚽", name:"サッカー民",   desc:"サッカー談義が熱い", minScore:8 },
  anime:      { icon:"🎌", name:"アニ豚",       desc:"アニメ・漫画オタク", minScore:8 },
  game:       { icon:"🎮", name:"ゲーマー",     desc:"ゲームの話題が中心", minScore:8 },
  vtuber:     { icon:"📺", name:"V豚",          desc:"VTuberの話が多い", minScore:8 },
  idol:       { icon:"🎤", name:"ドルオタ",     desc:"アイドル推し活中", minScore:8 },
  horse:      { icon:"🐴", name:"馬民",         desc:"競馬に詳しい", minScore:8 },
  gambling:   { icon:"🎰", name:"養分",         desc:"ギャンブル好き", minScore:8 },
  tech:       { icon:"💻", name:"IT民",         desc:"テック系の話題に強い", minScore:8 },
  food:       { icon:"🍜", name:"グルメ民",     desc:"食の話題が多い", minScore:8 },
  love:       { icon:"💕", name:"恋愛脳",       desc:"恋愛・異性の話題が多い", minScore:8 },
  work:       { icon:"💼", name:"社畜",         desc:"仕事の愚痴が多い", minScore:8 },
  study:      { icon:"📚", name:"受験戦士",     desc:"学歴・受験の話題", minScore:8 },
  train:      { icon:"🚃", name:"鉄オタ",       desc:"鉄道の知識が豊富", minScore:8 },
  car:        { icon:"🚗", name:"車カス",       desc:"車の話題が多い", minScore:8 },
  military:   { icon:"🔫", name:"ミリオタ",     desc:"軍事に詳しい", minScore:8 },
  peta:       { icon:"📎", name:"ペタッw",      desc:"画像や動画をよく貼る", minScore:1 },
  threadking: { icon:"👑", name:"スレ立て魔",   desc:"スレ立てが多い", minScore:1 },
  chatty:     { icon:"🗣️", name:"長文民",       desc:"一つ一つのレスが長い", minScore:1 },
  sniper:     { icon:"🎯", name:"短文スナイパー",desc:"短く鋭いレスが多い", minScore:1 },
  machinegun: { icon:"⚡", name:"連投マン",     desc:"連投ペースが速い", minScore:1 },
  anchor:     { icon:"⛓️", name:"安価職人",     desc:"安価を多用して会話", minScore:1 },
  loner:      { icon:"🐺", name:"一匹狼",       desc:"1スレに集中して書き込む", minScore:1 },
  nomad:      { icon:"🦋", name:"渡り鳥",       desc:"多くのスレを渡り歩く", minScore:1 },
  allday:     { icon:"📡", name:"24時間戦士",   desc:"朝から晩までいる", minScore:1 }
};

/* ===== メディアURL検出パターン ===== */
var MEDIA_PATTERNS = [
  /https?:\/\/(?:i\.)?imgur\.com\//i,
  /https?:\/\/imgu?\.jp\//i,
  /https?:\/\/(?:www\.)?youtube\.com\/watch/i,
  /https?:\/\/youtu\.be\//i,
  /https?:\/\/(?:www\.)?nicovideo\.jp\//i,
  /https?:\/\/nico\.ms\//i,
  /https?:\/\/(?:twitter|x)\.com\//i,
  /https?:\/\/pbs\.twimg\.com\//i
];

/* ================================================================
   メイン判定関数
   ================================================================ */
function idaCalcTraits(posts, threadList, threadsMade, hourCounts, totalPosts) {
  if (!totalPosts || totalPosts === 0) return [];

  var scores = {};
  var allBodies = "";

  /* ------ 全レスのbody結合 + メディアカウント ------ */
  var mediaCount = 0;
  var totalAnchors = 0;
  var totalChars = 0;
  var shortCount = 0;
  var longCount = 0;

  posts.forEach(function(p) {
    var b = p.body || "";
    allBodies += " " + b + " ";
    totalChars += b.replace(/\n/g,"").length;

    /* メディア検出 */
    MEDIA_PATTERNS.forEach(function(re) {
      var m = b.match(re);
      if (m) mediaCount++;
    });

    /* 安価 */
    var anc = b.match(/>>\d+/g);
    if (anc) totalAnchors += anc.length;

    /* 文字数判定 */
    var len = b.replace(/\n/g,"").length;
    if (len <= 15) shortCount++;
    if (len >= 150) longCount++;
  });

  var avgChars = Math.round(totalChars / totalPosts);

  /* ------ カテゴリ別キーワードスコア ------ */
  Object.keys(TRAIT_DICT).forEach(function(catId) {
    var cat = TRAIT_DICT[catId];
    var score = 0;

    /* レス本文からキーワード検索 */
    cat.words.forEach(function(w) {
      var re = new RegExp(w, "gi");
      var bodyMatches = allBodies.match(re);
      if (bodyMatches) score += bodyMatches.length;
    });

    /* スレタイからキーワード検索（ボーナス） */
    threadList.forEach(function(t) {
      var title = (t.title || "").toLowerCase();
      cat.words.forEach(function(w) {
        if (title.indexOf(w.toLowerCase()) !== -1) {
          score += cat.threadBonus;
        }
      });
    });

    /* スレ立て主ボーナス */
    threadsMade.forEach(function(tm) {
      var body = (tm.body || "").toLowerCase();
      var titleInfo = threadList.find(function(t) { return t.thread_id === tm.thread_id; });
      var title = titleInfo ? (titleInfo.title || "").toLowerCase() : "";
      cat.words.forEach(function(w) {
        var wl = w.toLowerCase();
        if (title.indexOf(wl) !== -1) score += cat.nusiBonus;
        if (body.indexOf(wl) !== -1) score += Math.floor(cat.nusiBonus / 2);
      });
    });

    if (score > 0) scores[catId] = score;
  });

  /* ------ 行動系の属性判定 ------ */

  /* ニート: 0-5時のレス率が30%以上 */
  var nightCount = 0;
  for (var h = 0; h <= 5; h++) nightCount += hourCounts[h];
  var nightPct = nightCount / totalPosts;
  if (nightPct >= 0.30) scores.neet = Math.round(nightPct * 100);

  /* 早起き: 5-8時のレスが20%以上 */
  var morningCount = 0;
  for (var h2 = 5; h2 <= 8; h2++) morningCount += hourCounts[h2];
  var morningPct = morningCount / totalPosts;
  if (morningPct >= 0.20) scores.earlybird = Math.round(morningPct * 100);

  /* 24時間戦士: 18時間帯以上に書き込み */
  var activeHours = hourCounts.filter(function(c) { return c > 0; }).length;
  if (activeHours >= 18) scores.allday = activeHours;

  /* ペタッw: メディアURL 5個以上 */
  if (mediaCount >= 5) scores.peta = mediaCount;

  /* スレ立て魔: スレ立て3件以上 */
  if (threadsMade.length >= 3) scores.threadking = threadsMade.length * 10;

  /* 長文民: 平均文字数100以上 or 長文率30%以上 */
  if (avgChars >= 100 || (longCount / totalPosts) >= 0.30) {
    scores.chatty = avgChars;
  }

  /* 短文スナイパー: 平均文字数20以下 or 短文率50%以上 */
  if (avgChars <= 20 || (shortCount / totalPosts) >= 0.50) {
    scores.sniper = Math.round((shortCount / totalPosts) * 100);
  }

  /* 連投マン: 平均間隔5分以内かつ10レス以上 */
  if (posts.length >= 10) {
    var firstT = new Date(posts[0].posted_at).getTime();
    var lastT = new Date(posts[posts.length - 1].posted_at).getTime();
    var avgMin = (lastT - firstT) / 60000 / (posts.length - 1);
    if (avgMin <= 5) scores.machinegun = Math.round(100 - avgMin * 10);
  }

  /* 安価職人: 安価率30%以上（安価数/レス数） */
  var anchorRate = totalAnchors / totalPosts;
  if (anchorRate >= 0.30) scores.anchor = Math.round(anchorRate * 100);

  /* 一匹狼: 参加スレ2以下でレス10以上 */
  if (threadList.length <= 2 && totalPosts >= 10) {
    scores.loner = Math.round(totalPosts / threadList.length);
  }

  /* 渡り鳥: 参加スレ8以上 */
  if (threadList.length >= 8) scores.nomad = threadList.length;

  /* ------ 結果配列を作成 ------ */
  var result = [];
  Object.keys(scores).forEach(function(id) {
    var def = TRAIT_DEFS[id];
    if (!def) return;
    if (scores[id] < def.minScore) return;
    result.push({
      id: id,
      icon: def.icon,
      name: def.name,
      score: scores[id],
      desc: def.desc
    });
  });

  /* スコア降順 */
  result.sort(function(a, b) { return b.score - a.score; });

  /* 最大8個 */
  return result.slice(0, 8);
}
