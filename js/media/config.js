/* ===== media/config.js — 定数 ===== */
"use strict";

var MediaCfg = {
  BOARD: "livejupiter",
  THREAD_BASE: "https://hayabusa.open2ch.net/test/read.cgi/livejupiter/",
  PAGE_SIZE: 30,
  META_CACHE_KEY: "jeegle_media_meta_v3",
  META_CACHE_TTL_MS: 60 * 1000,
  WORKER_BASE: "https://gentle-mouse-d138.1145148101919.workers.dev"
};

/* Firebase */
firebase.initializeApp({
  apiKey: "AIzaSyCasS3f9WJ26Dkk1B8_NrMFI2S-rahwMiM",
  authDomain: "itiran-be2af.firebaseapp.com",
  projectId: "itiran-be2af",
  storageBucket: "itiran-be2af.firebasestorage.app",
  messagingSenderId: "1078510843043",
  appId: "1:1078510843043:web:4fcea9f4abacdf0b34fb16",
  measurementId: "G-L0Y6MTQ1N2"
});

var mediaDb = firebase.firestore();
