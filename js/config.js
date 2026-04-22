"use strict";

/* ===== Supabase設定 ===== */
const SB_URL = "https://jvhcgllunsfncjintjba.supabase.co";
const SB_KEY = "sb_publishable_nWh8Ixmel4JrlaK4D2hK0w_iZ4k_nxl";

/* ===== 定数 ===== */
const DAYS = ["日","月","火","水","木","金","土"];

/* ===== URLパラメータ短縮マッピング ===== */

// 検索範囲: URL値 ↔ フォーム値
const TYPE_TO_URL = { all:"b", title:"r", body:"h" };
const URL_TO_TYPE = { b:"all", r:"title", h:"body" };

// 検索モード: URL値 ↔ フォーム値
const MODE_TO_URL = { "default":"t", and:"a", or:"o" };
const URL_TO_MODE = { t:"default", a:"and", o:"or" };

// 旧URLパラメータからの変換 (後方互換)
const LEGACY_TYPE = { subete:"all", suretai:"title", honbun:"body" };
const LEGACY_MODE = { tuuzyou:"default", and:"and", or:"or" };

// 日付プリセット名
const DATE_PRESETS = ["today","yesterday","3days","7days","custom"];
