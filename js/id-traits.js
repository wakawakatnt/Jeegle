"use strict";

/* ================================================================
   ID属性判定システム — js/id-traits.js
   ================================================================
   
   使い方:
     var traits = idaCalcTraits(posts, threadList, threadsMade, hourCounts, totalPosts);
     // → [{ id, icon, name, score, desc }, ...]  スコア降順
   
   posts       : レス配列 [{body, posted_at, is_nusi, post_num, thread_id, ...}, ...]
   threadList  : [{title, count, isNusi, thread_id}, ...]
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
            "衆院","法案","閣議","外交","防衛費","支持率","マニフェスト","公約",
            "国政","地方選","知事","市長","都知事","参政党","れいわ","NHK党",
            "改憲","護憲","靖国","慰安婦","徴用工","日韓","日中","拉致"],
    threadBonus: 3,
    nusiBonus: 5
  },

  baseball: {
    words: ["野球","打率","防御率","ホームラン","甲子園","ピッチャー","バッター",
            "セリーグ","パリーグ","巨人","阪神","中日","横浜","広島","ヤクルト",
            "ソフトバンク","楽天","西武","ロッテ","オリックス","日ハム","npb",
            "大谷","ダルビッシュ","佐々木","打線","投手","捕手","遊撃","内野","外野",
            "ドラフト","交流戦","日本シリーズ","WBC","野球民","盗塁","犠打",
            "リリーフ","先発","抑え","二軍","ファーム","DeNA","ベイスターズ",
            "タイガース","ジャイアンツ","カープ","ドラゴンズ","スワローズ",
            "ホークス","イーグルス","ライオンズ","マリーンズ","バファローズ",
            "ファイターズ","クライマックス","CS","オープン戦","キャンプ"],
    threadBonus: 3,
    nusiBonus: 5
  },

  soccer: {
    words: ["サッカー","Jリーグ","ワールドカップ","W杯","プレミアリーグ","リーガ",
            "ブンデス","セリエ","チャンピオンズリーグ","CL","代表","フォワード",
            "ミッドフィルダー","ゴールキーパー","オフサイド","PK","レアル","バルサ",
            "マンチェスター","リバプール","三笘","久保","遠藤","冨安","FIFA",
            "アーセナル","チェルシー","バイエルン","PSG","インテル","ユベントス",
            "ラリーガ","ヨーロッパリーグ","EL","ACL","J1","J2","J3",
            "ヴィッセル","マリノス","フロンターレ","レッズ","アントラーズ",
            "グランパス","アシスト","ハットトリック","トラップ","ドリブル"],
    threadBonus: 3,
    nusiBonus: 5
  },

  anime: {
    words: ["アニメ","声優","作画","クール","ラノベ","漫画","コミック",
            "ジャンプ","マガジン","サンデー","同人","コミケ","推し","萌え","覇権",
            "神回","作監","原作","連載","打ち切り","単行本","アニオタ","深夜アニメ",
            "ワンピース","呪術","ヒロアカ","鬼滅","チェンソーマン","ブルーロック",
            "フリーレン","推しの子","進撃","スパイファミリー","薬屋","ダンダダン",
            "制作会社","MAPPA","ufotable","京アニ","A-1","WIT","ボンズ",
            "聖地巡礼","円盤","BD","特典","PV","ティザー"],
    threadBonus: 3,
    nusiBonus: 5
  },

  game: {
    words: ["ゲーム","ソシャゲ","ガチャ","リセマラ","攻略","steam","PS5","switch",
            "任天堂","スクエニ","カプコン","フロム","エルデンリング","ポケモン",
            "マリオ","ゼルダ","FF","ドラクエ","モンハン","スプラ","APEX","valorant",
            "LOL","FPS","RPG","MMO","eスポーツ","プロゲーマー","実況プレイ",
            "原神","スタレ","ブルアカ","ウマ娘","プロセカ","マイクラ","Minecraft",
            "フォートナイト","PUBG","荒野行動","パルワールド","ティアキン",
            "DLC","アプデ","ナーフ","バフ","メタ","周回","育成","凸"],
    threadBonus: 3,
    nusiBonus: 5
  },

  vtuber: {
    words: ["vtuber","ホロライブ","にじさんじ","スパチャ","切り抜き",
            "ぺこら","マリン","すいせい","みこ","ころね","スバル","あくあ",
            "葛葉","叶","委員長","サロメ","ライバー","箱推し","同接","案件",
            "初配信","卒業配信","3D","新衣装","歌枠","雑談枠","ゲーム実況",
            "メンシ","メンバーシップ","アーカイブ","コラボ配信","耐久配信",
            "ストリーマー","配信者","ぶいちゅーばー"],
    threadBonus: 3,
    nusiBonus: 5
  },

  idol: {
    words: ["アイドル","坂道","乃木坂","櫻坂","日向坂","AKB","SKE","NMB","HKT",
            "ジャニーズ","STARTO","推し活","握手会","ライブ","コンサート","センター",
            "選抜","卒業","加入","ミーグリ","お渡し会","個別","全握","写真集",
            "冠番組","MV","リリイベ","ファンクラブ","FC","オタク","在宅","現場",
            "DD","単推し","担当","自担","降り"],
    threadBonus: 3,
    nusiBonus: 5
  },

  horse: {
    words: ["競馬","馬","ダービー","G1","G2","G3","重賞","騎手","調教","JRA",
            "有馬記念","天皇賞","オークス","皐月賞","菊花賞","馬券",
            "単勝","複勝","三連","武豊","ルメール","パドック","出走",
            "WIN5","馬連","馬単","ワイド","枠連","BOX","フォーメーション",
            "安田記念","宝塚記念","ジャパンカップ","スプリンターズ","マイルCS",
            "エリザベス","桜花賞","秋華賞","地方競馬","南関","大井","船橋",
            "川崎","浦和","ばんえい","種牡馬","産駒","血統","ディープ","キタサン"],
    threadBonus: 3,
    nusiBonus: 5
  },

  gambling: {
    words: ["パチンコ","パチスロ","スロット","台","出玉","確変","大当り","回転",
            "ボーダー","期待値","万発","養分","ジャグラー","北斗","海物語",
            "競艇","競輪","ボートレース","賭け","カジノ",
            "設定","高設定","低設定","ハマり","天井","ゾーン","AT","ART",
            "リーチ","時短","甘デジ","ミドル","ライトミドル","右打ち","ヘソ",
            "止め打ち","捻り打ち","オスイチ","万枚","収支","回収"],
    threadBonus: 3,
    nusiBonus: 5
  },

  tech: {
    words: ["プログラミング","エンジニア","python","javascript","AI","ChatGPT",
            "機械学習","linux","サーバー","データベース","github","コード","開発",
            "IT","SE","SES","web","フロントエンド","バックエンド","API","スクリプト",
            "アプリ","iPhone","Android","ガジェット","スペック","GPU","CPU","自作PC",
            "LLM","GPT","Claude","Gemini","生成AI","ディープラーニング","ニューラル",
            "React","TypeScript","Docker","AWS","Azure","GCP","クラウド",
            "OS","Windows","Mac","Ubuntu","アップデート","セキュリティ","脆弱性",
            "半導体","NVIDIA","AMD","Intel","メモリ","SSD","モニター"],
    threadBonus: 3,
    nusiBonus: 5
  },

  food: {
    words: ["飯","ラーメン","カレー","寿司","焼肉","うどん","そば","牛丼",
            "マック","吉野家","すき家","松屋","ファミレス","コンビニ","弁当",
            "自炊","料理","美味","旨い","カロリー","ダイエット",
            "つけ麺","天ぷら","丼","定食","居酒屋","食べログ","グルメ",
            "スイーツ","ケーキ","チョコ","アイス","お菓子","スタバ",
            "ビール","酒","日本酒","焼酎","ワイン","ウイスキー","サワー",
            "チェーン店","ファストフード","デリバリー","UberEats","出前館"],
    threadBonus: 2,
    nusiBonus: 4
  },

  love: {
    words: ["彼女","彼氏","告白","デート","マッチングアプリ","結婚","離婚","嫁",
            "夫","恋愛","モテ","非モテ","童貞","出会い",
            "浮気","不倫","ナンパ","合コン","街コン","婚活","恋活",
            "Pairs","Tinder","タップル","with","Omiai",
            "プロポーズ","指輪","式場","新婚","同棲","遠距離","片思い","両思い"],
    threadBonus: 3,
    nusiBonus: 5
  },

  work: {
    words: ["仕事","会社","上司","部下","転職","退職","年収","給料","残業",
            "ブラック","ホワイト","面接","就活","内定","派遣","正社員","バイト",
            "フリーター","昇進","ボーナス","有給",
            "社畜","過労","パワハラ","セクハラ","モラハラ","労基","労働基準",
            "リストラ","倒産","起業","独立","フリーランス","テレワーク","在宅勤務",
            "出社","通勤","異動","左遷","出世","同僚","新卒","中途","研修"],
    threadBonus: 2,
    nusiBonus: 4
  },

  study: {
    words: ["受験","偏差値","大学","東大","京大","早慶","MARCH","旧帝","Fラン",
            "センター","共通テスト","模試","塾","予備校","勉強","数学","英語",
            "理系","文系","院試","資格",
            "医学部","薬学部","法学部","工学部","推薦","AO","指定校",
            "浪人","現役","仮面","編入","単位","留年","GPA","卒論","修論",
            "TOEIC","英検","簿記","宅建","公務員試験","司法試験","医師国家試験"],
    threadBonus: 3,
    nusiBonus: 5
  },

  train: {
    words: ["鉄道","電車","新幹線","JR","私鉄","地下鉄","路線","ダイヤ","撮り鉄",
            "乗り鉄","車両","駅","時刻表","運行","遅延","鉄オタ",
            "特急","急行","快速","普通","各停","グリーン車","指定席","自由席",
            "東海道","山手線","中央線","京浜東北","総武線","東急","小田急","京王",
            "阪急","南海","近鉄","名鉄","西鉄","リニア","廃線","未成線"],
    threadBonus: 3,
    nusiBonus: 5
  },

  car: {
    words: ["車","自動車","トヨタ","ホンダ","日産","マツダ","スバル","BMW","ベンツ",
            "運転","免許","MT","AT","ドライブ","高速","エンジン","EV","SUV","セダン",
            "レクサス","アウディ","ポルシェ","フェラーリ","ランボルギーニ",
            "プリウス","アルファード","ハリアー","ヤリス","N-BOX","フィット",
            "車検","ディーラー","中古車","新車","納車","洗車","カスタム","チューニング",
            "事故","煽り運転","ドラレコ","ETC","サーキット","峠","走り屋"],
    threadBonus: 3,
    nusiBonus: 5
  },

  military: {
    words: ["軍事","ミリタリー","戦車","戦闘機","空母","自衛隊","米軍","NATO",
            "ウクライナ","ロシア","核","ミサイル","戦争","兵器","銃",
            "陸自","海自","空自","F-35","イージス","潜水艦","護衛艦",
            "歩兵","砲兵","装甲","ドローン","HIMARS","パトリオット",
            "特殊部隊","レンジャー","空挺","海兵隊","CIA","FSB","MI6",
            "戦略","戦術","補給","兵站","制空権","制海権"],
    threadBonus: 3,
    nusiBonus: 5
  },

  economy: {
    words: ["株","投資","日経","TOPIX","為替","円安","円高","ドル","FX",
            "仮想通貨","ビットコイン","NISA","iDeCo","積立","配当","利回り",
            "決算","IR","上場","IPO","暴落","暴騰","バブル","インフレ","デフレ",
            "GDP","金利","日銀","FRB","S&P","ダウ","ナスダック","テスラ",
            "信用取引","空売り","デイトレ","含み損","含み益","損切り","利確"],
    threadBonus: 3,
    nusiBonus: 5
  },

  overseas: {
    words: ["海外","アメリカ","中国","韓国","北朝鮮","台湾","ヨーロッパ","EU",
            "イギリス","フランス","ドイツ","イタリア","インド","ブラジル",
            "移民","難民","ビザ","パスポート","外国人","グローバル",
            "留学","ワーホリ","海外旅行","海外移住","駐在","帰国子女"],
    threadBonus: 3,
    nusiBonus: 5
  },

  health: {
    words: ["病気","病院","医者","薬","手術","入院","通院","症状","診断",
            "風邪","インフル","コロナ","ワクチン","後遺症","花粉症","アレルギー",
            "うつ","メンタル","不眠","睡眠","ストレス","筋トレ","ジム",
            "プロテイン","ランニング","ウォーキング","体重","BMI","健康診断",
            "血圧","血糖","コレステロール","痛風","腰痛","肩こり","頭痛",
            "歯医者","矯正","視力","眼科","皮膚科","整形外科"],
    threadBonus: 2,
    nusiBonus: 4
  },

  fashion: {
    words: ["ファッション","服","靴","スニーカー","ブランド","ユニクロ","GU",
            "ZARA","H&M","Supreme","NIKE","adidas","コーデ","ワードローブ",
            "古着","ヴィンテージ","アクセサリー","時計","ロレックス","セイコー",
            "バッグ","財布","美容","化粧","コスメ","スキンケア","髪型","美容院"],
    threadBonus: 3,
    nusiBonus: 5
  },

  occult: {
    words: ["心霊","幽霊","怖い話","オカルト","UFO","UMA","都市伝説","陰謀論",
            "超常現象","スピリチュアル","占い","霊感","呪い","祟り",
            "不思議","ミステリー","事件","未解決","失踪","廃墟","肝試し",
            "夢占い","前世","輪廻","パラレルワールド","予知","テレパシー"],
    threadBonus: 3,
    nusiBonus: 5
  },

  history: {
    words: ["歴史","戦国","幕末","明治","大正","昭和","江戸","鎌倉","平安",
            "織田信長","豊臣秀吉","徳川家康","武将","大名","藩","城",
            "太平洋戦争","第二次世界大戦","第一次世界大戦","ローマ","三国志",
            "世界史","日本史","考古学","遺跡","古墳","大河ドラマ"],
    threadBonus: 3,
    nusiBonus: 5
  },

  music: {
    words: ["音楽","バンド","ライブ","フェス","アルバム","シングル",
            "ロック","ポップ","ヒップホップ","ラップ","EDM","クラシック","ジャズ",
            "ギター","ベース","ドラム","ピアノ","ボーカル","歌手","アーティスト",
            "Spotify","Apple Music","サブスク","Billboard","オリコン",
            "米津","YOASOBI","Ado","King Gnu","髭男","あいみょん","Mrs."],
    threadBonus: 3,
    nusiBonus: 5
  },

  movie: {
    words: ["映画","ドラマ","Netflix","Amazon","Disney","配信","劇場","興行収入",
            "監督","俳優","女優","脚本","撮影","ロケ","エキストラ",
            "ハリウッド","邦画","洋画","韓ドラ","朝ドラ","大河","月9",
            "アカデミー賞","カンヌ","ベネチア","ゴールデングローブ",
            "MCU","マーベル","DC","スターウォーズ","ジブリ","新海誠","庵野"],
    threadBonus: 3,
    nusiBonus: 5
  },

  travel: {
    words: ["旅行","観光","温泉","ホテル","旅館","航空","飛行機","ANA","JAL","LCC",
            "新幹線","夜行バス","レンタカー","一人旅","バックパッカー",
            "沖縄","北海道","京都","大阪","東京","福岡","名古屋",
            "ハワイ","グアム","タイ","韓国旅行","台湾旅行","ヨーロッパ旅行",
            "じゃらん","楽天トラベル","Booking","Airbnb","マイル","ラウンジ"],
    threadBonus: 3,
    nusiBonus: 5
  },

  disaster: {
    words: ["地震","津波","台風","豪雨","洪水","噴火","震度","マグニチュード",
            "避難","災害","防災","緊急地震速報","震源","南海トラフ","首都直下",
            "停電","断水","被害","復興","ボランティア","義援金","自衛隊派遣"],
    threadBonus: 3,
    nusiBonus: 5
  },

  religion: {
    words: ["宗教","神社","寺","教会","仏教","神道","キリスト教","イスラム",
            "創価","統一教会","カルト","新興宗教","お参り","初詣","御朱印",
            "お守り","パワースポット","坊主","牧師","聖書","経典","法事","葬式"],
    threadBonus: 3,
    nusiBonus: 5
  },

  pet: {
    words: ["犬","猫","ペット","イッヌ","ネッコ","わんこ","にゃんこ","柴犬","トイプー",
            "マンチカン","スコティッシュ","ハムスター","うさぎ","爬虫類","熱帯魚",
            "水槽","アクアリウム","動物園","水族館","保護猫","保護犬","譲渡","里親",
            "ドッグフード","キャットフード","動物病院","去勢","避妊"],
    threadBonus: 3,
    nusiBonus: 5
  }
};

/* ===== 属性マスター ===== */
var TRAIT_DEFS = {
  neet:        { icon:"🌙", name:"ニート",         desc:"深夜帯のレスが多い", minScore:1 },
  earlybird:   { icon:"🌅", name:"早起き民",       desc:"早朝のレスが多い", minScore:1 },
  politics:    { icon:"🏛️", name:"政治豚",         desc:"政治の話が大好き", minScore:12 },
  baseball:    { icon:"⚾", name:"野球民",         desc:"野球の話が止まらない", minScore:12 },
  soccer:      { icon:"⚽", name:"サッカー民",     desc:"サッカー談義が熱い", minScore:12 },
  anime:       { icon:"🎌", name:"アニ豚",         desc:"アニメ・漫画オタク", minScore:12 },
  game:        { icon:"🎮", name:"ゲーマー",       desc:"ゲームの話題が中心", minScore:12 },
  vtuber:      { icon:"📺", name:"V豚",            desc:"VTuberの話が多い", minScore:12 },
  idol:        { icon:"🎤", name:"ドルオタ",       desc:"アイドル推し活中", minScore:12 },
  horse:       { icon:"🐴", name:"馬民",           desc:"競馬に詳しい", minScore:12 },
  gambling:    { icon:"🎰", name:"養分",           desc:"ギャンブル好き", minScore:12 },
  tech:        { icon:"💻", name:"IT民",           desc:"テック系の話題に強い", minScore:12 },
  food:        { icon:"🍜", name:"グルメ民",       desc:"食の話題が多い", minScore:15 },
  love:        { icon:"💕", name:"恋愛脳",         desc:"恋愛・異性の話題が多い", minScore:12 },
  work:        { icon:"💼", name:"社畜",           desc:"仕事の愚痴が多い", minScore:15 },
  study:       { icon:"📚", name:"受験戦士",       desc:"学歴・受験の話題", minScore:12 },
  train:       { icon:"🚃", name:"鉄オタ",         desc:"鉄道の知識が豊富", minScore:12 },
  car:         { icon:"🚗", name:"車カス",         desc:"車の話題が多い", minScore:12 },
  military:    { icon:"🔫", name:"ミリオタ",       desc:"軍事に詳しい", minScore:12 },
  economy:     { icon:"📈", name:"投資民",         desc:"投資・経済に詳しい", minScore:12 },
  overseas:    { icon:"🌏", name:"海外通",         desc:"海外の話題に強い", minScore:12 },
  health:      { icon:"💊", name:"健康オタク",     desc:"健康・医療の話題が多い", minScore:12 },
  fashion:     { icon:"👔", name:"オシャレ民",     desc:"ファッション好き", minScore:12 },
  occult:      { icon:"👻", name:"オカルト民",     desc:"怖い話・都市伝説好き", minScore:12 },
  history:     { icon:"📜", name:"歴史民",         desc:"歴史の知識が豊富", minScore:12 },
  music:       { icon:"🎵", name:"音楽民",         desc:"音楽の話題が多い", minScore:12 },
  movie:       { icon:"🎬", name:"映画民",         desc:"映画・ドラマの話題が多い", minScore:12 },
  travel:      { icon:"✈️", name:"旅行民",         desc:"旅行好き", minScore:12 },
  disaster:    { icon:"🌊", name:"防災民",         desc:"災害・防災の話題に反応", minScore:12 },
  religion:    { icon:"⛩️", name:"宗教民",         desc:"宗教の話題に詳しい", minScore:12 },
  pet:         { icon:"🐾", name:"ペット民",       desc:"動物の話題が多い", minScore:12 },
  peta:        { icon:"📎", name:"ペタッw",        desc:"画像や動画をよく貼る", minScore:1 },
  threadking:  { icon:"👑", name:"スレ立て魔",     desc:"スレ立てが異常に多い", minScore:1 },
  chatty:      { icon:"🗣️", name:"長文民",         desc:"一つ一つのレスが長い", minScore:1 },
  sniper:      { icon:"🎯", name:"短文スナイパー", desc:"短く鋭いレスが多い", minScore:1 },
  machinegun:  { icon:"⚡", name:"連投マン",       desc:"連投ペースが異常に速い", minScore:1 },
  anchor:      { icon:"⛓️", name:"安価職人",       desc:"安価を大量に使って会話", minScore:1 },
  tanpatsu:    { icon:"👤", name:"単発",           desc:"1スレにしか書き込んでいない", minScore:1 },
  nomad:       { icon:"🦋", name:"渡り鳥",         desc:"大量のスレを渡り歩く", minScore:1 },
  allday:      { icon:"📡", name:"24時間戦士",     desc:"朝から晩までいる", minScore:1 },
  copipe:      { icon:"📋", name:"コピペ職人",     desc:"同じ内容を繰り返し投稿", minScore:1 },
  grass:       { icon:"🌿", name:"草生やし民",     desc:"草を大量に生やす", minScore:1 },
  replymagnet: { icon:"🧲", name:"レスバトラー",   desc:"レスバに参戦しがち", minScore:1 }
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
  /https?:\/\/pbs\.twimg\.com\//i,
  /https?:\/\/(?:www\.)?tiktok\.com\//i,
  /https?:\/\/streamable\.com\//i
];

/* ================================================================
   メイン判定関数
   ================================================================ */
function idaCalcTraits(posts, threadList, threadsMade, hourCounts, totalPosts) {
  if (!totalPosts || totalPosts === 0) return [];

  var scores = {};
  var allBodies = "";

  /* ------ 全レスのbody結合 + 各種カウント ------ */
  var mediaCount = 0;
  var totalAnchors = 0;
  var totalChars = 0;
  var shortCount = 0;   // 15文字以下
  var longCount = 0;    // 150文字以上
  var grassCount = 0;
  var replyBattlePatterns = /アホ|バカ|ガイジ|エアプ|にわか|知ったか|論破|反論|ソースは|だから言った|お前が|必死|しね|タヒ|きも|キモ|害児|低脳|池沼|雑魚|ざこ|カス$/;

  var replyBattleHits = 0;

  posts.forEach(function(p) {
    var b = p.body || "";
    allBodies += " " + b + " ";
    var cleanB = b.replace(/\n/g, "");
    totalChars += cleanB.length;

    /* メディア検出 */
    MEDIA_PATTERNS.forEach(function(re) {
      if (re.test(b)) mediaCount++;
    });

    /* 安価 */
    var anc = b.match(/>>\d+/g);
    if (anc) totalAnchors += anc.length;

    /* 文字数判定 */
    var len = cleanB.length;
    if (len <= 15) shortCount++;
    if (len >= 150) longCount++;

    /* 草検出 — 単発「草」「w」も含む */
    /* マッチ対象: 単独の「草」、行末/文末の「w」1個以上、「www」連続、「ｗ」系 */
    var grassHits = b.match(/草|[wWｗＷ]+(?=\s|$|>|」|）|\))|[wWｗＷ]{2,}/g);
    if (grassHits) grassCount += grassHits.length;

    /* レスバ */
    if (replyBattlePatterns.test(b)) replyBattleHits++;
  });

  var avgChars = Math.round(totalChars / totalPosts);

  /* ------ コピペ検出 ------ */
  var bodyFreq = {};
  posts.forEach(function(p) {
    var key = (p.body || "").trim().slice(0, 100);
    if (key.length >= 10) {
      bodyFreq[key] = (bodyFreq[key] || 0) + 1;
    }
  });
  var duplicateCount = 0;
  Object.keys(bodyFreq).forEach(function(k) {
    if (bodyFreq[k] >= 3) duplicateCount += bodyFreq[k];
  });

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

  /* ニート: 0-5時のレスが 8個以上（絶対数） */
  var nightCount = 0;
  for (var h = 0; h <= 5; h++) nightCount += hourCounts[h];
  if (nightCount >= 8) scores.neet = nightCount;

/* 早起き: 初レスが5時台or6時台（ただしニート判定時は除外） */
if (posts.length > 0 && !scores.neet) {
  var firstPostHour = new Date(posts[0].posted_at).getHours();
  if (firstPostHour >= 5 && firstPostHour <= 6) {
    scores.earlybird = firstPostHour === 5 ? 60 : 50;
  }
}

  /* 24時間戦士: 20時間帯以上に書き込みかつ20レス以上 */
  var activeHours = hourCounts.filter(function(c) { return c > 0; }).length;
  if (activeHours >= 20 && totalPosts >= 20) scores.allday = activeHours;

  /* ペタッw: メディアURL 8個以上、もしくはレスの20%以上にメディア含む（最低5個） */
  if (mediaCount >= 8 || (mediaCount >= 5 && (mediaCount / totalPosts) >= 0.20)) {
    scores.peta = mediaCount;
  }

  /* スレ立て魔: スレ立て10件以上 */
  if (threadsMade.length >= 10) scores.threadking = threadsMade.length * 10;

  /* 長文民: 平均文字数45以上 or 長文率25%以上（最低5レス） */
  if (totalPosts >= 5 && (avgChars >= 45 || (longCount / totalPosts) >= 0.25)) {
    scores.chatty = avgChars;
  }

  /* 短文スナイパー: 平均文字数15以下 or 短文率70%以上（最低10レス） */
  if (totalPosts >= 10 && (avgChars <= 15 || (shortCount / totalPosts) >= 0.70)) {
    scores.sniper = Math.round((shortCount / totalPosts) * 100);
  }

  /* 連投マン: 平均間隔2分以内かつ20レス以上 */
  if (posts.length >= 20) {
    var firstT = new Date(posts[0].posted_at).getTime();
    var lastT = new Date(posts[posts.length - 1].posted_at).getTime();
    var avgMin = (lastT - firstT) / 60000 / (posts.length - 1);
    if (avgMin <= 2) scores.machinegun = Math.round(100 - avgMin * 20);
  }

  /* 安価職人: 安価率75%以上（安価数/レス数）かつ安価10個以上 */
  var anchorRate = totalAnchors / totalPosts;
  if (anchorRate >= 0.75 && totalAnchors >= 10) scores.anchor = Math.round(anchorRate * 100);

  /* 単発: 参加スレが1つだけ */
  if (threadList.length === 1) {
    scores.tanpatsu = 1;
  }

  /* 渡り鳥: 参加スレ25以上 */
  if (threadList.length >= 25) scores.nomad = threadList.length;

  /* コピペ職人: 同一内容3回以上のレスが合計3個以上 */
  if (duplicateCount >= 3) scores.copipe = duplicateCount;

  /* 草生やし民: 草パターン検出が 10回以上 */
  if (grassCount >= 10) scores.grass = grassCount;

  /* レスバトラー: レスバ系ワード検出 5回以上（割合条件なし） */
  if (replyBattleHits >= 5) scores.replymagnet = replyBattleHits;

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
