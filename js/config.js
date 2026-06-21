"use strict";

/* ===== Supabase（14日以内の検索データ） ===== */
const SB_URL = "https://gentle-mouse-d138.sub714685.workers.dev";
const SB_KEY = "sb_publishable_530ash4ew_ewbw3olsva4bnk33";

/* ===== Turso（14日より古い検索データ）(更新中...) ===== */
const TURSO_URL = "";
const TURSO_TOKEN = "";

/* ===== 新旧境界（この日数以内=Supabase、それより古い=Turso） ===== */
const BOUNDARY_DAYS = 14;

/* ===== 定数 ===== */
const DAYS = ["日","月","火","水","木","金","土"];

/* ===== URLパラメータ短縮マッピング ===== */
const TYPE_TO_URL = { all:"b", title:"r", body:"h", name:"n", id:"i" };
const URL_TO_TYPE = { b:"all", r:"title", h:"body", n:"name", i:"id" };
const MODE_TO_URL = { "default":"t", and:"a", or:"o" };
const URL_TO_MODE = { t:"default", a:"and", o:"or" };
const LEGACY_TYPE = { subete:"all", suretai:"title", honbun:"body", namae:"name", id:"id" };
const LEGACY_MODE = { tuuzyou:"default", and:"and", or:"or" };
const DATE_PRESETS = ["today","yesterday","3days","7days","custom"];
