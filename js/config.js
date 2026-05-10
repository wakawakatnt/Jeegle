"use strict";

/* ===== Supabase（14日以内の検索データ） ===== */
const SB_URL = "https://icafholrrjxrrbeibyru.supabase.co";
const SB_KEY = "sb_publishable_u5yJH2bZ7HBlQyvSLknL_w_hMsGyBQl";

/* ===== Turso（14日より古い検索データ） ===== */
const TURSO_URL = "https://subsub-subsub.aws-ap-northeast-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicm8iLCJpYXQiOjE3Nzg0NDI5NzksImlkIjoiMDE5ZTEzNWItOWQwMS03MjNiLWJlMGQtNWJmNmM1NWI4OGQ2IiwicmlkIjoiZWZkMmQ4MGYtMjZhYi00NWZiLThhYWMtMDE1NGZkMWQxMmVlIn0.BoJtWJw3hJ-6dIchdXyJ4R2uGScURu9hCjo0PnsL1igFyELyT88zVYkagclSkixAlISqN48ACCKBTX9IvMNSDQ";

/* ===== 新旧境界（この日数以内=Supabase、それより古い=Turso） ===== */
const BOUNDARY_DAYS = 14;

/* ===== 定数 ===== */
const DAYS = ["日","月","火","水","木","金","土"];

/* ===== URLパラメータ短縮マッピング ===== */
const TYPE_TO_URL = { all:"b", title:"r", body:"h" };
const URL_TO_TYPE = { b:"all", r:"title", h:"body" };
const MODE_TO_URL = { "default":"t", and:"a", or:"o" };
const URL_TO_MODE = { t:"default", a:"and", o:"or" };
const LEGACY_TYPE = { subete:"all", suretai:"title", honbun:"body" };
const LEGACY_MODE = { tuuzyou:"default", and:"and", or:"or" };
const DATE_PRESETS = ["today","yesterday","3days","7days","custom"];
