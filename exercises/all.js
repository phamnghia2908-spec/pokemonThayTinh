/**
 * all.js — PokéLearn All-in-One
 * Quy trình: vocabulary → vocabulary2 → image(d1,d2,d3) → pokeword → listening1 → speaking-sentence → overview(d1,d2,d3)
 * Điểm lưu đúng key như các file gốc để summary.js đọc được.
 */

import { showVictoryEffect } from "./effect-win.js";
import { showDefeatEffect }  from "./effect-loose.js";
import { prefetchImagesBatch, getImageFromMap } from "./imageCache.js";

// ─── DANH SÁCH CÁC STAGE (theo thứ tự quy trình) ───────────────────────────
const STAGES = [
  { id: "intro", label: "🌸 Giới thiệu", emoji: "🌸" },
  
  { id: "image_d2",    label: "🖼️ Hình ảnh – Dạng 2", emoji: "🖼️" },
  { id: "image_d3",    label: "🎨 Hình ảnh – Dạng 3", emoji: "🎨" },
  { id: "pokeword",    label: "🔤 PokéWord",           emoji: "🔤" },
  { id: "listening1",  label: "🎧 Nghe",              emoji: "🎧" },
  { id: "speaking",    label: "🎙️ Nói câu",           emoji: "🎙️" },
  { id: "overview_d1", label: "✍️ Tổng quan – Sắp xếp","emoji": "✍️" },
  { id: "overview_d2", label: "🔤 Tổng quan – Dịch từ","emoji": "🔤" },
  { id: "overview_d3", label: "🧱 Tổng quan – Dịch cụm","emoji": "🧱" },
  { id: "communication", label: "💬 Giao tiếp", emoji: "💬" },
];

// ─── STATE TOÀN CỤC ──────────────────────────────────────────────────────────
const wordBank   = JSON.parse(localStorage.getItem("wordBank")) || [];
let vocabData    = [];   // dùng chung cho vocab1, vocab2, image
let stageIndex   = 0;
let vocabVoice   = null;

// Score trackers cho từng stage
const scoreState = {
  vocab1:      { score: 0, total: 0 },
  vocab2:      { score: 0, total: 0 },
  image_d1:    { score: 0, total: 0 },
  image_d2:    { score: 0, total: 0 },
  image_d3:    { score: 0, total: 0 },
  pokeword:    { score: 0, total: 0 },
  listening1:  { score: 0, total: 0 },
  speaking:    { score: 0, total: 0 },
  overview_d1: { score: 0, total: 0 },
  overview_d2: { score: 0, total: 0 },
  overview_d3: { score: 0, total: 0 },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function normSentence(s) {
  return (s || "").toLowerCase().replace(/[.,;'\)\(]/g,"").replace(/\s+/g," ").trim();
}
function speak(text, rate = 1) {
  if (!text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang  = "en-US";
  u.voice = vocabVoice;
  u.rate  = rate;
  window.speechSynthesis.speak(u);
}

// ─── VOICE INIT ───────────────────────────────────────────────────────────────
function initVoice() {
  return new Promise(resolve => {
    const v = speechSynthesis.getVoices();
    if (v.length) { applyVoice(v); return resolve(); }
    speechSynthesis.onvoiceschanged = () => { applyVoice(speechSynthesis.getVoices()); resolve(); };
  });
}
function applyVoice(voices) {
  vocabVoice =
    voices.find(v => v.lang === "en-US" && v.name?.toLowerCase().includes("zira")) ||
    voices.find(v => v.lang === "en-US") || null;
}

// ─── PROGRESS UI ─────────────────────────────────────────────────────────────
function updateProgress() {
  const pct = Math.round((stageIndex / STAGES.length) * 100);
  const progressBar = document.getElementById("progressBar");
  if (progressBar) progressBar.style.width = pct + "%";

  const wrap = document.getElementById("progressSteps");
  wrap.innerHTML = STAGES.map((s, i) => {
    const cls = i < stageIndex ? "done" : i === stageIndex ? "active" : "";

    // Lấy tên rút gọn (bỏ phần sau dấu gạch ngang nếu có)
    const shortLabel = s.label.split("–")[0].trim();

    return `<span class="step-dot ${cls}" 
                  onclick="jumpToStage(${i})" 
                  style="cursor:pointer;" 
                  title="Nhấn để nhảy đến: ${s.label}">
              ${s.emoji} ${shortLabel}
            </span>`;
  }).join("");

  const label = document.getElementById("stageLabel");
  if (label) label.textContent = STAGES[stageIndex]?.label || "✅ Hoàn thành!";
}
window.jumpToStage = async function(idx) {
  // Nếu bấm vào chính Stage đang học thì không làm gì
  if (idx === stageIndex) return; 

  const targetStage = STAGES[idx];
  if (confirm(`Bạn muốn nhảy thẳng tới phần: ${targetStage.label}?`)) {
    // Lưu chỉ số Stage muốn tới vào localStorage
    localStorage.setItem("jump_to_stage_idx", idx);

    // Hiển thị màn hình chuyển cảnh trước khi reload
    await showTransition(targetStage.emoji, "🚀 Dịch chuyển", `Đang đưa bạn đến ${targetStage.label}...`);

    // Tải lại trang để reset toàn bộ hệ thống voice/mic/state
    location.reload();
  }
};

function updateMiniScore(score, total) {
  document.getElementById("miniScore").textContent = `🎯 ${score}/${total}`;
}

// ─── TRANSITION SCREEN ───────────────────────────────────────────────────────
function showTransition(emoji, title, desc) {
  return new Promise(resolve => {
    const ts = document.getElementById("transitionScreen");
    document.getElementById("transEmoji").textContent  = emoji;
    document.getElementById("transTitle").textContent   = title;
    document.getElementById("transDesc").textContent    = desc;
    ts.classList.add("show");
    document.getElementById("nextStageBtn").onclick = () => {
      ts.classList.remove("show");
      resolve();
    };
  });
}

// ─── RENDER HELPER ───────────────────────────────────────────────────────────
function setCard(html) {
  document.getElementById("mainCard").innerHTML = html;
}

// ─── FETCH DATA ───────────────────────────────────────────────────────────────
async function fetchAllVocabData() {
  // 1. Kiểm tra xem trong máy đã có dữ liệu chưa
  const cachedData = localStorage.getItem("vocab_data_cache");
  if (cachedData) {
    console.log("🚀 Dùng dữ liệu từ Cache (Local)");
    return JSON.parse(cachedData);
  }

  try {
    console.log("🌐 Đang tải dữ liệu từ Google Sheets...");
    const res = await fetch(window.SHEET_URL);
    const data = await res.json();
    const rows = data.data || data;

    const allWords = rows.map(r => {
      const col = Object.values(r);
      const getVal = idx => (col[idx] != null ? col[idx].toString().trim() : "");
      return {
        word: getVal(2),
        meaning: getVal(24),
        extraNote: getVal(30),
        noteAH: getVal(33),
        noteAI: getVal(34),
        imageKeyword: getVal(47),
        question: getVal(9),
        answerRaw: getVal(11),
        enChunk: getVal(3),
        viChunk: getVal(4),
      };
    });

    const filtered = allWords.filter(it => it.word && wordBank.includes(it.word));
    const seen = new Set();
    const finalData = filtered.filter(it => {
      const k = it.word.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    // 2. LƯU VÀO CACHE để lần sau không phải tải nữa
    localStorage.setItem("vocab_data_cache", JSON.stringify(finalData));

    return finalData;
  } catch(e) {
    console.error("fetchAllVocabData Error:", e);
    return [];
  }
}
// ─── CACHED RAW SHEET ROWS ────────────────────────────────────────────────────
let _sheetRowsCache = null;
async function getSheetRows() {
  if (_sheetRowsCache) return _sheetRowsCache;
  const cacheKey = "sheet_rows_" + wordBank.length;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    _sheetRowsCache = JSON.parse(cached);
    console.log("🚀 Sheet rows từ cache");
    return _sheetRowsCache;
  }
  console.log("🌐 Fetching sheet rows...");
  const res  = await fetch(window.SHEET_URL);
  const data = await res.json();
  _sheetRowsCache = data.data || data;
  sessionStorage.setItem(cacheKey, JSON.stringify(_sheetRowsCache));
  return _sheetRowsCache;
}
async function getMaxLessonCode() {
  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
  try {
    const res  = await fetch(window.SHEET_BAI_HOC);
    const rows = await res.json();
    const list = rows.map(r => {
      const lop = (r[0] || "").toString().trim();
      const bai = (r[2] || "").toString().trim();
      return lop === trainerClass && bai ? parseInt(bai, 10) : null;
    }).filter(v => typeof v === "number" && !isNaN(v));
    return list.length ? Math.max(...list) : 0;
  } catch { return 0; }
}

// ─── PHONETIC ────────────────────────────────────────────────────────────────
async function getPhonetic(phrase) {
  if (!phrase) return "";
  const words = phrase.trim().split(/\s+/);
  const fetch1 = async w => {
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${w.toLowerCase()}`);
      if (!r.ok) return "";
      const d = await r.json();
      return d?.[0]?.phonetic || d?.[0]?.phonetics?.find(p => p.text)?.text || "";
    } catch { return ""; }
  };
  const results = await Promise.all(words.map(fetch1));
  return results.filter(Boolean).join(" ");
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// MOBILE AUDIO ENGINE
// ═══════════════════════════════════════════════════════════════════════════
window.IntroAudio = window.IntroAudio || (() => {
  const TTS_BASE = "https://googlevoice-tinh.onrender.com";
  let ctx = null;
  const cache = new Map();

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function unlock() {
    getCtx();
  }
  document.addEventListener('touchstart', unlock, { once: true });
  document.addEventListener('mousedown',  unlock, { once: true });

  async function fetchAudio(text, lang = 'en-US', speed = 0.9) {
    const key = `${lang}|${speed}|${text}`;
    if (cache.has(key)) return cache.get(key);
    const url = `${TTS_BASE}/tts?q=${encodeURIComponent(text)}&speed=${speed}&lang=${encodeURIComponent(lang)}&voice=`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const ab = await res.arrayBuffer();
    const ac = getCtx();
    const buf = await ac.decodeAudioData(ab);
    cache.set(key, buf);
    return buf;
  }

  // Phát audio, trả về { duration, stop }
  function playBuffer(buf) {
    const ac = getCtx();
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    src.start();
    return {
      duration: buf.duration,
      promise: new Promise(r => { src.onended = r; }),
      stop: () => { try { src.stop(); } catch(e){} }
    };
  }

  async function speak(text, lang = 'en-US', speed = 0.9) {
    const buf = await fetchAudio(text, lang, speed);
    return playBuffer(buf);
  }

  async function preloadIpa(ipa) {
    const url = `https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/${ipa}.mp3`;
    if (cache.has('ipa|'+ipa)) return cache.get('ipa|'+ipa);
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      const ac = getCtx();
      const buf = await ac.decodeAudioData(ab.slice(0));
      cache.set('ipa|'+ipa, buf);
      return buf;
    } catch { return null; }
  }

  async function playIpa(ipa) {
    const buf = await preloadIpa(ipa);
    if (!buf) return;
    return new Promise(r => {
      const ac = getCtx();
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(ac.destination);
      src.onended = r;
      setTimeout(r, buf.duration * 1000 + 400);
      src.start();
    });
  }

  return { speak, playIpa, preloadIpa, unlock, getCtx };
})();

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 0 — INTRO
// ═══════════════════════════════════════════════════════════════════════════
const INTRO_BASE = "https://raw.githubusercontent.com/ninjavanxuantruong/Open-LLM-VTuber-main/main/";
const INTRO_CHAR_LIST = [
  ["Chitose",         "live2d-models/Chitose/runtime/chitose.model3.json"],
  ["Haruto",          "live2d-models/haruto/runtime/haruto.model3.json"],
  ["Hibiki",          "live2d-models/Hibiki/runtime/hibiki.model3.json"],
  ["Hiyori",          "live2d-models/hiyori_free/runtime/hiyori_free_t08.model3.json"],
  ["Izumi",           "live2d-models/Izumi/runtime/izumi_illust.model3.json"],
  ["Jin Natori",      "live2d-models/Jin Natori/runtime/natori_pro_t06.model3.json"],
  ["Kei",             "live2d-models/kei_basic_free/runtime/kei_basic_free.model3.json"],
  ["Koharu",          "live2d-models/koharu/runtime/koharu.model3.json"],
  ["Mao",             "live2d-models/mao_pro/runtime/mao_pro.model3.json"],
  ["Mark-kun",        "live2d-models/Mark-kun/runtime/mark_free_t04.model3.json"],
  ["Ren Foster",      "live2d-models/ren foster/runtime/ren.model3.json"],
  ["Rice Glassfield", "live2d-models/Rice Glassfield/runtime/rice_pro_t03.model3.json"],
  ["Shizuku",         "live2d-models/shizuku/runtime/shizuku.model3.json"],
  ["Tororo",          "live2d-models/tororo/runtime/tororo.model3.json"],
  ["Tsumuki",         "live2d-models/Tsumiki Harugasa/runtime/tsumiki.model3.json"],
  ["Unity-chan",       "live2d-models/Unity-chan/runtime/unitychan.model3.json"],
  ["Wankoromochi",    "live2d-models/Wankoromochi/runtime/wanko_touch.model3.json"],
  ["Nito",            "live2d-models/Nito/runtime/nito.model3.json"],
  ["Hijiki",          "live2d-models/hijiki/runtime/hijiki.model3.json"],
];

let introSelectedMain = INTRO_CHAR_LIST[12];
let introSelectedSub  = INTRO_CHAR_LIST[0];
let introPixiApps = {};
let introModels   = {};
let introLipRAFs  = {};

// ── KỊCH BẢN ĐA DẠNG ─────────────────────────────────────────────────────────
const INTRO_SCRIPTS = [
  (name, n) => [`Hey there! I'm ${name}, and I'll be your guide today!`, `We have ${n} exciting new words to explore together.`],
  (name, n) => [`Welcome back! ${name} here, ready to teach you something new!`, `Today's lesson has ${n} words. Let's dive right in!`],
  (name, n) => [`Hello my friend! Great to see you again, I'm ${name}!`, `Get ready — we're going to learn ${n} brand new words today!`],
  (name, n) => [`Hi! ${name} speaking. Hope you're ready to learn!`, `I've prepared ${n} wonderful words just for you today.`],
  (name, n) => [`Good to have you here! This is ${name}.`, `Today we'll go through ${n} new vocabulary words together. Let's start!`],
];
const INTRO_WORD_LINES = [
  (ord, w) => `The ${ord} word is... ${w}.`,
  (ord, w) => `Next up, number ${ord}: ${w}.`,
  (ord, w) => `Word number ${ord} is ${w}. Remember this one!`,
  (ord, w) => `Let's look at the ${ord} word — ${w}.`,
  (ord, w) => `Our ${ord} word today is ${w}.`,
];
const INTRO_CLOSING = [
  `Great job! Now let's practice how to pronounce these words!`,
  `Wonderful! Time to work on your pronunciation. Let's go!`,
  `Well done! Next up — pronunciation practice!`,
  `Excellent! Now let's move on to phonics!`,
];
const ORDINALS = ['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth'];

// ── LIVE2D ────────────────────────────────────────────────────────────────────
async function initIntroLive2D(names) {
  if (!window.PIXI?.live2d) return;
  try { PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker); } catch(e){}
  for (const name of names) {
    const canvas = document.getElementById('intro-canvas-' + name);
    if (!canvas) continue;
    const slot = document.getElementById('intro-slot-' + name);
    if (!slot) continue;
    try {
      // Reuse PIXI app nếu đã có, tránh tạo WebGL context mới
      if (!introPixiApps[name]) {
        const app = new PIXI.Application({
          view: canvas, autoStart: true, backgroundAlpha: 0, resizeTo: slot
        });
        introPixiApps[name] = app;
      } else {
        // Resize cho khớp slot mới
        introPixiApps[name].renderer.resize(slot.clientWidth, slot.clientHeight);
        introPixiApps[name].stage.removeChildren();
      }

      const charInfo = name === 'main' ? introSelectedMain : introSelectedSub;
      const url = INTRO_BASE + charInfo[1].split('/').map(encodeURIComponent).join('/').replace(/%2F/g,'/');
      const model = await PIXI.live2d.Live2DModel.from(url);
      introModels[name] = model;
      introPixiApps[name].stage.addChild(model);
      introFitModel(name);
      try { model.motion('idle'); } catch(e){}
    } catch(e) { console.error('intro load', name, e); }
  }
}
function introFitModel(name) {
  const m = introModels[name], app = introPixiApps[name];
  if (!m || !app) return;
  const W = app.renderer.width, H = app.renderer.height;
  const sc = Math.min(W/m.internalModel.originalWidth, H/m.internalModel.originalHeight) * 0.92;
  m.scale.set(sc);
  m.x = W/2 - m.width/2;
  m.y = H/2 - m.height/2 + 10;
}
// Lấy tất cả motion groups từ model đã load
function introGetMotions(name) {
  const m = introModels[name];
  if (!m) return [];
  try {
    const defs = m.internalModel.motionManager.definitions;
    return Object.keys(defs || {});
  } catch(e) { return []; }
}

// Play random motion (trừ idle)
function introRandomMotion(name) {
  const groups = introGetMotions(name).filter(g =>
    !g.toLowerCase().includes('idle')
  );
  if (!groups.length) return;
  const g = groups[Math.floor(Math.random() * groups.length)];
  try { introModels[name]?.motion(g); } catch(e) {}
}

// Vòng lặp tự động đổi motion mỗi 5-8s khi đang nói
let introMotionTimers = {};
function introStartMotionLoop(name) {
  introStopMotionLoop(name);
  const loop = () => {
    introRandomMotion(name);
    const next = 5000 + Math.random() * 3000;
    introMotionTimers[name] = setTimeout(loop, next);
  };
  loop();
}
function introStopMotionLoop(name) {
  if (introMotionTimers[name]) {
    clearTimeout(introMotionTimers[name]);
    introMotionTimers[name] = null;
  }
}
function introDestroyAll() {
  for (const name of ['main','sub']) {
    introStopMotionLoop(name);
    if (introLipRAFs[name]) { cancelAnimationFrame(introLipRAFs[name]); introLipRAFs[name] = null; }
    // Chỉ xóa model, GIỮ NGUYÊN PIXI app và WebGL context
    if (introModels[name]) {
      try {
        if (introPixiApps[name]?.stage) introPixiApps[name].stage.removeChildren();
        introModels[name].destroy();
      } catch(e){}
      introModels[name] = null;
    }
  }
}

// ── LIPSYNC ───────────────────────────────────────────────────────────────────
function introStartLipSync(name, color) {
  const barsEl = document.getElementById('intro-bars-' + name);
  if (barsEl) barsEl.classList.add('active');
  const barEls = barsEl ? barsEl.querySelectorAll('.ibar') : [];
  let t = 0;
  const loop = () => {
    t += 1/60;
    const vol = Math.max(0, Math.min(1, 0.5 + 0.5*Math.sin(t*3.8*Math.PI*2) + (Math.random()-.5)*.3));
    const m = introModels[name];
    if (m) {
      try {
        const core = m.internalModel.coreModel;
        if (core.setParameterValueById) core.setParameterValueById('ParamMouthOpenY', vol);
        else if (core.setParamFloat)    core.setParamFloat('PARAM_MOUTH_OPEN_Y', vol);
      } catch(e){}
    }
    barEls.forEach((b,i) => {
      const off = Math.abs(3-i)/3;
      b.style.height = Math.max(2, vol*(1-off*.5)*22 + Math.random()*3) + 'px';
    });
    introLipRAFs[name] = requestAnimationFrame(loop);
  };
  introLipRAFs[name] = requestAnimationFrame(loop);
  // motion
  introStartMotionLoop(name);
}

function introStopLipSync(name) {
  if (introLipRAFs[name]) { cancelAnimationFrame(introLipRAFs[name]); introLipRAFs[name] = null; }
  introStopMotionLoop(name);
  const barsEl = document.getElementById('intro-bars-' + name);
  if (barsEl) { barsEl.classList.remove('active'); barsEl.querySelectorAll('.ibar').forEach(b => b.style.height='2px'); }
  const m = introModels[name];
  if (m) {
    try {
      const core = m.internalModel.coreModel;
      if (core.setParameterValueById) core.setParameterValueById('ParamMouthOpenY', 0);
      else if (core.setParamFloat)    core.setParamFloat('PARAM_MOUTH_OPEN_Y', 0);
    } catch(e){}
  }
}

// ── SPEAK với lipsync ─────────────────────────────────────────────────────────
async function introSpeakEN(name, text, speed = 0.9) {
  introStopLipSync('main'); introStopLipSync('sub');
  const glow = (n, on) => {
    const s = document.getElementById('intro-slot-'+n);
    if (s) s.style.filter = on ? 'drop-shadow(0 0 14px #a78bfa66)' : 'none';
  };
  try {
    const handle = await IntroAudio.speak(text, 'en-US', speed);
    introStartLipSync(name);
    glow(name, true);
    glow(name==='main'?'sub':'main', false);
    await handle.promise;
  } catch(e) {
    // fallback Web Speech
    await new Promise(r => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = speed;
      introStartLipSync(name);
      glow(name, true);
      const safety = setTimeout(() => { introStopLipSync(name); glow(name,false); r(); }, Math.max(text.length*130,3000));
      u.onend = u.onerror = () => { clearTimeout(safety); introStopLipSync(name); glow(name,false); r(); };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
    return;
  }
  introStopLipSync(name);
  glow(name, false);
}

async function introSpeakVI(name, text, speed = 0.9) {
  introStopLipSync('main'); introStopLipSync('sub');
  const glow = (n, on) => {
    const s = document.getElementById('intro-slot-'+n);
    if (s) s.style.filter = on ? 'drop-shadow(0 0 14px #a78bfa66)' : 'none';
  };
  try {
    const handle = await IntroAudio.speak(text, 'vi-VN', speed);
    introStartLipSync(name);
    glow(name, true);
    await handle.promise;
  } catch(e) { /* bỏ qua nếu TTS tiếng Việt lỗi */ }
  introStopLipSync(name);
  glow(name, false);
}

const introDelay = ms => new Promise(r => setTimeout(r, ms));

// ── HTML HELPERS ──────────────────────────────────────────────────────────────
function introCharHTML(name, label, color, flipped = false) {
  const bars = [0,1,2,3,4,5,6].map(() =>
    `<div class="ibar" style="background:${color};"></div>`
  ).join('');
  return `
    <div id="intro-slot-${name}" class="intro-char-slot${flipped?' flipped':''}">
      <canvas id="intro-canvas-${name}"></canvas>
      <div id="intro-bars-${name}" class="intro-lipsync-bars">${bars}</div>
      <div class="intro-name-tag" style="border:1px solid ${color};color:${color};background:${color}22;">
        ${label}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// BƯỚC 1 — Giới thiệu từ
// ═══════════════════════════════════════════════════════════════════════════
async function runIntroWordPart() {
  const words = vocabData.slice(0, 10);
  const scriptLines = INTRO_SCRIPTS[Math.floor(Math.random()*INTRO_SCRIPTS.length)](introSelectedMain[0], words.length);
  const wordLine    = INTRO_WORD_LINES[Math.floor(Math.random()*INTRO_WORD_LINES.length)];
  const closingLine = INTRO_CLOSING[Math.floor(Math.random()*INTRO_CLOSING.length)];

  const render = () => {
    document.getElementById('mainCard').innerHTML = `
      <div class="intro-scene intro-classroom-bg">
        ${introCharHTML('main', introSelectedMain[0], '#27ae60')}
        <div class="intro-whiteboard">
          <div id="wb-content" style="width:100%;display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:10px;min-height:180px;">
            <div style="color:#aaa;font-size:13px;">Đang tải nhân vật...</div>
          </div>
        </div>
      </div>
      <div class="intro-action-row" id="intro-word-btns" style="display:none;">
        <button class="poke-btn gray" id="btn-replay-word">↺ Replay</button>
        <button class="poke-btn yellow" id="btn-next-phonics">🔤 Phát âm ▶</button>
      </div>
    `;
  };

  render();
  await initIntroLive2D(['main']);

  const play = async () => {
    const btns = document.getElementById('intro-word-btns');
    if (btns) btns.style.display = 'none';
    const wb = document.getElementById('wb-content');

    // Câu mở đầu
    for (const line of scriptLines) {
      await introSpeakEN('main', line, 0.85);
      await introDelay(150);
    }

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const imgSrc = getImageFromMap((w.imageKeyword||w.word).toLowerCase().trim()) || '';

      // Nói tên từ
      await introSpeakEN('main', wordLine(ORDINALS[i], w.word), 0.85);

      // Hiện bảng ngay khi đang nói (pop-in)
      const wordParts = w.word.trim().split(' ').map(p =>
        `<span class="word-tap" data-word="${p}"
          style="font-size:clamp(20px,5vw,32px);font-weight:800;color:#1a1a2e;letter-spacing:.03em;">
          ${p.toUpperCase()}
        </span>`
      ).join(' ');

      wb.innerHTML = `
        <div class="intro-pop" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:8px;">
          ${imgSrc ? `<img src="${imgSrc}" style="height:clamp(70px,15vw,110px);max-width:90%;
            object-fit:contain;border-radius:8px;border:1px solid #eee;"/>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;">${wordParts}</div>
          <div style="font-size:clamp(13px,3vw,16px);color:#555;background:#f5f5f5;
            padding:5px 12px;border-radius:6px;text-align:center;" id="wb-meaning">
            ${w.meaning || ''}
          </div>
          ${w.noteAH ? `<div style="font-size:clamp(11px,2.5vw,13px);color:#e67e22;background:#fff3e0;
            padding:4px 10px;border-radius:6px;width:100%;text-align:center;">💡 ${w.noteAH}</div>` : ''}
          ${w.noteAI ? `<div style="font-size:clamp(11px,2.5vw,13px);color:#2980b9;background:#e8f4fd;
            padding:4px 10px;border-radius:6px;width:100%;text-align:center;">✨ ${w.noteAI}</div>` : ''}
        </div>
      `;

      // Gắn sự kiện ấn từng từ → đọc chậm
      wb.querySelectorAll('.word-tap').forEach(span => {
        span.onclick = () => introSpeakEN('main', span.dataset.word, 0.4);
      });

      // Nói nghĩa bằng TTS tiếng Việt
      await introDelay(300);
      if (w.meaning) {
        await introSpeakVI('main', `nghĩa là ${w.meaning}`, 0.9);
      }

      // Dừng 3s để học sinh nhìn
      await introDelay(3000);
    }

    await introSpeakEN('main', closingLine, 0.85);
    if (btns) btns.style.display = 'flex';
  };

  await play();
  document.getElementById('btn-replay-word').onclick = play;

  // Ghi điểm vocab1 (full vì đã học hết)
  const sc = words.length, tot = words.length;
  scoreState.vocab1 = { score: sc, total: tot };
  const raw = localStorage.getItem('result_vocabulary');
  const prev = raw ? JSON.parse(raw) : {};
  localStorage.setItem('result_vocabulary', JSON.stringify({
    ...prev, scoreV1: sc, totalV1: tot,
    score: sc + (prev.scoreV2||0), total: tot + (prev.totalV2||0)
  }));

  return new Promise(resolve => {
    document.getElementById('btn-next-phonics').onclick = resolve;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BƯỚC 2 — Phonics
// ═══════════════════════════════════════════════════════════════════════════
async function runIntroPhonics() {
  const words = vocabData.slice(0, 10);
  let idx = 0;

  const renderWord = (w) => {
    const imgSrc = getImageFromMap((w.imageKeyword||w.word).toLowerCase().trim()) || '';
    document.getElementById('mainCard').innerHTML = `
      <div class="intro-scene intro-classroom-bg">
        ${introCharHTML('main', introSelectedMain[0], '#27ae60')}
        <div class="intro-whiteboard">
          <div style="font-size:11px;color:#999;letter-spacing:.06em;text-transform:uppercase;align-self:flex-start;">
            Phát âm ${idx+1}/${words.length}
          </div>
          ${imgSrc ? `<img src="${imgSrc}" style="height:clamp(60px,12vw,90px);object-fit:contain;
            border-radius:8px;border:1px solid #eee;"/>` : ''}
          <div style="font-size:clamp(20px,5vw,28px);font-weight:800;color:#1a1a2e;">${w.word.toUpperCase()}</div>
          <div style="font-size:clamp(12px,2.5vw,14px);color:#555;background:#f5f5f5;
            padding:4px 10px;border-radius:6px;">${w.meaning||''}</div>

          <div id="ph-loading" style="color:#f39c12;font-size:12px;">⏳ Đang tải âm vị...</div>
          <div id="v1PhonicsContainer" style="display:flex;flex-wrap:wrap;gap:6px;
            justify-content:center;min-height:50px;"></div>

          <div style="width:100%;background:#eee;border-radius:4px;overflow:hidden;height:4px;margin:4px 0;">
            <div id="ph-bar" style="width:0%;height:100%;
              background:linear-gradient(90deg,#e74c3c,#f39c12);transition:width .3s;"></div>
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">
            <button id="ph-auto" disabled style="padding:8px 12px;background:#e74c3c;color:#fff;
              border:none;border-radius:10px;font-weight:700;font-size:clamp(11px,2.5vw,13px);
              cursor:pointer;opacity:.5;">▶ Đọc từng âm</button>
            <button id="ph-full" style="padding:8px 12px;background:#f1c40f;color:#1a1a2e;
              border:none;border-radius:10px;font-weight:700;font-size:clamp(11px,2.5vw,13px);
              cursor:pointer;">🔊 Cả từ</button>
          </div>
        </div>
      </div>

      <div class="intro-action-row">
        <button class="poke-btn gray" id="ph-prev" ${idx===0?'disabled':''}>◀ Trước</button>
        <button class="poke-btn gray" id="ph-replay">↺ Replay</button>
        <button class="poke-btn yellow" id="ph-next">
          ${idx>=words.length-1?'🗣️ Luyện nói ▶':'Từ tiếp ▶'}
        </button>
      </div>
    `;
  };

  const runOne = async (w) => {
    renderWord(w);
    await introDelay(100); // đợi DOM render

    // Nhân vật nói tên từ
    await introSpeakEN('main', `Let's look at the pronunciation of "${w.word}"`, 0.85);

    // Đợi dictMap
    await new Promise(r => {
      let ms = 0;
      const t = setInterval(() => {
        if ((window.dictMap?.size > 0) || ms >= 8000) { clearInterval(t); r(); }
        ms += 200;
      }, 200);
    });

    const pCont   = document.getElementById('v1PhonicsContainer');
    const loadEl  = document.getElementById('ph-loading');
    const autoBtn = document.getElementById('ph-auto');
    const barEl   = document.getElementById('ph-bar');

    if (loadEl) loadEl.style.display = 'none';

    if (pCont && window.handleSplit) {
      try { await window.handleSplit(w.word.trim().toLowerCase(), pCont, null); }
      catch(e) {
        if (pCont) pCont.innerHTML =
          `<p style="color:#e74c3c;font-size:13px;">⚠️ Không tìm thấy âm vị cho "${w.word}"</p>`;
      }
    }

    const hasContent = pCont?.querySelector('[data-index]');
    if (hasContent && autoBtn) { autoBtn.disabled = false; autoBtn.style.opacity = '1'; }

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const getAllUnits = () => Array.from(pCont?.querySelectorAll('[data-index]') || []);
    const getIpa = u => u.querySelector('small')?.innerText.replace(/\//g,'').trim() || '';

    const hlUnit = (u, on) => {
      if (on) {
        u.classList.add('active');
      } else {
        u.classList.remove('active');
        u.classList.add('done');
      }
    };

    let isReading = false;

    const lockNav = (lock) => {
      ['ph-prev','ph-next','ph-replay'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = lock;
        el.style.opacity = lock ? '.3' : '1';
      });
    };

    const doAutoRead = async () => {
      const units = getAllUnits();
      if (!units.length) return;
      lockNav(true);
      isReading = true;
      autoBtn.innerHTML = '⏹ Dừng';
      units.forEach(u => { u.classList.remove('active','done'); });
      if (barEl) barEl.style.width = '0%';

      // Preload IPA
      const allIpa = [];
      units.forEach(u => u.querySelectorAll('.sound-unit:not(.silent)').forEach(su => {
        const ipa = getIpa(su); if (ipa) allIpa.push(ipa);
      }));
      if (allIpa.length) {
        autoBtn.innerHTML = '⏳ Tải âm...';
        await Promise.all(allIpa.map(ipa => IntroAudio.playIpa ? IntroAudio.preloadIpa?.(ipa) : null));
        if (!isReading) { autoBtn.innerHTML = '▶ Đọc từng âm'; lockNav(false); return; }
        autoBtn.innerHTML = '⏹ Dừng';
      }

      for (let i = 0; i < units.length; i++) {
        if (!isReading) break;
        units[i].scrollIntoView({ behavior:'smooth', block:'nearest' });
        units[i].classList.add('ph-unit-active');
        const sus = Array.from(units[i].querySelectorAll('.sound-unit:not(.silent)'));
        for (const su of sus) {
          if (!isReading) break;
          const ipa = getIpa(su);
          // Highlight unit con
          su.style.cssText += `
            border: 2px solid #e74c3c !important;
            background: rgba(231,76,60,0.3) !important;
            box-shadow: 0 0 12px rgba(231,76,60,0.8) !important;
            transform: scale(1.2);
            transition: all 0.15s;
          `;
          if (ipa) await IntroAudio.playIpa(ipa);
          else await sleep(300);
          su.style.cssText = su.style.cssText
            .replace(/border:[^;]+;/,'')
            .replace(/background:[^;]+;/,'')
            .replace(/box-shadow:[^;]+;/,'')
            .replace(/transform:[^;]+;/,'');
          await sleep(80);
        }
        units[i].classList.remove('ph-unit-active');
        if (!isReading) break;
        hlUnit(units[i], false);
        if (barEl) barEl.style.width = `${((i+1)/units.length)*100}%`;
        await sleep(400);
      }

      if (isReading) {
        if (barEl) barEl.style.width = '100%';
        // Nhân vật đọc cả từ
        await introSpeakEN('main', w.word, 0.7);
      }

      isReading = false;
      autoBtn.innerHTML = '▶ Đọc từng âm';
      lockNav(false);
    };

    const stopRead = () => {
      isReading = false;
      getAllUnits().forEach(u => u.classList.remove('active','done'));
      if (barEl) barEl.style.width = '0%';
      autoBtn.innerHTML = '▶ Đọc từng âm';
      lockNav(false);
    };

    autoBtn.onclick = () => isReading ? stopRead() : doAutoRead();

    document.getElementById('ph-full').onclick = () => introSpeakEN('main', w.word, 0.7);

    // Click thủ công từng ô
    getAllUnits().forEach((wrapper, i, arr) => {
      wrapper.addEventListener('click', async e => {
        e.stopPropagation();
        IntroAudio.unlock?.();
        arr.forEach(u => u.classList.remove('active'));
        const sus = Array.from(wrapper.querySelectorAll('.sound-unit:not(.silent)'));
        for (const su of sus) {
          su.classList.add('active');
          await IntroAudio.playIpa(getIpa(su));
          su.classList.remove('active');
        }
        if (barEl) barEl.style.width = `${((i+1)/arr.length)*100}%`;
      });
    });

    // Auto trigger
    if (hasContent) setTimeout(doAutoRead, 500);

    return new Promise(resolve => {
      document.getElementById('ph-replay').onclick = () => { stopRead(); resolve('replay'); };
      document.getElementById('ph-prev').onclick   = () => { stopRead(); resolve('prev');   };
      document.getElementById('ph-next').onclick   = () => { stopRead(); resolve('next');   };
    });
  };

  // Init model 1 lần duy nhất
  await initIntroLive2D(['main']);

  return new Promise(async resolveAll => {
    while (true) {
      const action = await runOne(words[idx]);
      if (action === 'prev' && idx > 0) idx--;
      else if (action === 'next') {
        if (idx >= words.length - 1) { resolveAll(); return; }
        idx++;
      }
      // 'replay' → giữ nguyên idx
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BƯỚC 3 — Image D1 (4 ảnh chọn đáp án)
// ═══════════════════════════════════════════════════════════════════════════
async function runIntroImageD1() {
  const data = [...vocabData.slice(0,10)].sort(() => Math.random()-.5);
  let idx = 0, score = 0;

  return new Promise(resolve => {
    const show = async () => {
      if (idx >= data.length) {
        // Ghi điểm image D1
        scoreState.image_d1 = { score, total: data.length };
        const raw  = localStorage.getItem('result_image');
        const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem('result_image', JSON.stringify({
          ...prev,
          score1: score, total1: data.length,
          score2: prev.score2||0, total2: prev.total2||0,
          score3: prev.score3||0, total3: prev.total3||0,
          score: score+(prev.score2||0)+(prev.score3||0),
          total: data.length+(prev.total2||0)+(prev.total3||0),
        }));
        updateMiniScore(score, data.length);
        showTransition('🧠','Xong phần Nhận diện!','Tiếp tục luyện nói...').then(resolve);
        return;
      }

      const cur   = data[idx];
      const wrong = data.filter(d => d.word !== cur.word);
      const opts  = [cur, ...wrong.slice(0,3)].sort(() => Math.random()-.5);

      document.getElementById('mainCard').innerHTML = `
        <div class="intro-scene intro-classroom-bg">
          ${introCharHTML('main', introSelectedMain[0], '#27ae60')}
          <div class="intro-whiteboard">
            <div style="font-size:11px;color:#999;letter-spacing:.06em;text-transform:uppercase;align-self:flex-start;">
              Nhận diện ${idx+1}/${data.length} — Điểm: ${score}
            </div>
            <div style="font-size:clamp(13px,3vw,15px);color:#555;font-weight:600;text-align:center;">
              🔊 Chọn hình ảnh đúng với từ vừa nghe
            </div>
            <button id="d1-play" style="padding:7px 16px;background:#3498db;color:#fff;
              border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">
              🔊 Nghe lại
            </button>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;" id="d1-grid"></div>
            <div id="d1-result" style="font-size:14px;font-weight:700;min-height:20px;text-align:center;"></div>
          </div>
        </div>
      `;

      // Nhân vật đọc từ
      // Nhân vật giới thiệu
      await introSpeakEN('main', `Now, let's choose the picture that matches the word... ${cur.word}`, 0.85);

      document.getElementById('d1-play').onclick = () => introSpeakEN('main', cur.word, 0.8);

      const grid = document.getElementById('d1-grid');
      opts.forEach(item => {
        const imgUrl = getImageFromMap(item.word) || '';
        const card = document.createElement('div');
        card.style.cssText = `background:rgba(255,255,255,.08);border:2px solid transparent;
          border-radius:10px;padding:6px;cursor:pointer;text-align:center;transition:all .2s;`;
        card.dataset.d1 = item.word;
        card.innerHTML = imgUrl
          ? `<img src="${imgUrl}" style="width:100%;height:clamp(60px,15vw,90px);object-fit:cover;border-radius:6px;"/>`
          : `<div style="width:100%;height:clamp(60px,15vw,90px);background:rgba(255,255,255,.1);border-radius:6px;"></div>`;
        card.innerHTML += `<div style="font-size:clamp(10px,2vw,12px);color:#ccc;margin-top:4px;">${item.meaning}</div>`;
        card.onclick = async () => {
          const res = document.getElementById('d1-result');
          if (!res) return;
          grid.querySelectorAll('[data-d1]').forEach(c => c.style.pointerEvents = 'none');

          const isCorrect = item.word === cur.word;

          // Highlight card được chọn
          card.style.border = `3px solid ${isCorrect ? '#2ecc71' : '#e74c3c'}`;

          // Highlight đáp án đúng nếu chọn sai
          if (!isCorrect) {
            grid.querySelectorAll('[data-d1]').forEach(c => {
              if (c.dataset.d1 === cur.word) {
                c.style.border = '3px solid #2ecc71';
                c.style.background = 'rgba(46,204,113,0.2)';
              }
            });
          }

          if (isCorrect) {
            score++;
            res.textContent = '✅ Chính xác!'; res.style.color = '#2ecc71';
            await introSpeakEN('main', 'Great job!', 0.9);
          } else {
            res.textContent = `❌ Sai. Đáp án: ${cur.word}`; res.style.color = '#e74c3c';
            await introSpeakEN('main', `The correct answer is ${cur.word}`, 0.9);
          }

          updateMiniScore(score, idx+1);
          idx++;
          // Đợi 800ms để nhìn highlight rồi mới chuyển
          await introDelay(800);
          show();
        };
        grid.appendChild(card);
      });

      updateMiniScore(score, idx+1);
    };

    // Load nhân vật rồi mới show
    const showWithModel = async () => {
      introDestroyAll();
      await initIntroLive2D(['main']);
      show();
    };
    showWithModel();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BƯỚC 4 — Luyện nói theo
// ═══════════════════════════════════════════════════════════════════════════
async function runIntroRepeat() {
  const words = vocabData.slice(0, 10);
  let idx = 0, score = 0;

  const renderWord = (w) => {
    const imgSrc = getImageFromMap((w.imageKeyword||w.word).toLowerCase().trim()) || '';
    document.getElementById('mainCard').innerHTML = `
      <div class="intro-scene intro-classroom-bg">
        ${introCharHTML('main', introSelectedMain[0], '#27ae60')}
        <div class="intro-whiteboard">
          <div style="font-size:11px;color:#999;letter-spacing:.06em;text-transform:uppercase;align-self:flex-start;">
            Luyện nói ${idx+1}/${words.length}
          </div>
          ${imgSrc ? `<img src="${imgSrc}" style="height:clamp(60px,12vw,90px);object-fit:contain;
            border-radius:8px;border:1px solid #eee;"/>` : ''}
          <div style="font-size:clamp(22px,5vw,30px);font-weight:800;color:#1a1a2e;">${w.word.toUpperCase()}</div>
          <div style="font-size:clamp(12px,2.5vw,14px);color:#555;background:#f5f5f5;
            padding:4px 12px;border-radius:6px;">${w.meaning||''}</div>

          <div id="repeat-status" style="font-size:clamp(12px,2.5vw,14px);color:#27ae60;
            font-weight:600;text-align:center;min-height:20px;">
            🎧 Đang phát âm...
          </div>
          <div id="repeat-result" style="display:none;font-size:clamp(12px,2.5vw,13px);
            color:#555;background:#f9f9f9;padding:8px 12px;border-radius:8px;
            width:100%;text-align:center;"></div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center;">
            <button id="rp-listen" class="poke-btn blue" style="font-size:clamp(12px,2.5vw,14px);
              padding:8px 14px;">🔊 Nghe lại</button>
            <div id="rp-mic" class="mic-ring">🎤</div>
          </div>
          <div id="rp-retry-wrap" style="display:none;text-align:center;">
            <button id="rp-retry" class="poke-btn gray" style="font-size:13px;padding:7px 14px;">
              🔄 Thử lại
            </button>
          </div>
        </div>
      </div>
      <div class="intro-action-row">
        <button class="poke-btn yellow" id="rp-next">
          ${idx>=words.length-1?'💬 Sang hội thoại ▶':'Từ tiếp ▶'}
        </button>
      </div>
    `;
  };

  const speakWord = async (w) => {
    await introSpeakEN('main', `Repeat after me... ${w.word}`, 0.8);
  };

  const runOne = async (w) => {
    renderWord(w);
    await speakWord(w);

    const statusEl  = document.getElementById('repeat-status');
    const resultEl  = document.getElementById('repeat-result');
    const micEl     = document.getElementById('rp-mic');
    const retryWrap = document.getElementById('rp-retry-wrap');

    if (statusEl) statusEl.textContent = '👆 Bấm 🎤 để nói theo!';

    document.getElementById('rp-listen').onclick = async () => {
      if (statusEl) statusEl.textContent = '🎧 Đang phát âm...';
      await speakWord(w);
      if (statusEl) statusEl.textContent = '👆 Bấm 🎤 để nói theo!';
    };

    const doRecord = () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { if (statusEl) statusEl.textContent = '⚠️ Thiết bị không hỗ trợ mic'; return; }
      const rec = new SR();
      rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
      if (statusEl) statusEl.textContent = '🎙️ Đang nghe...';
      micEl?.classList.add('listening');
      rec.start();
      rec.onresult = e => {
        const heard = e.results[0][0].transcript.toLowerCase().trim();
        const tgt   = w.word.toLowerCase().trim();
        const ok    = heard.includes(tgt) || tgt.includes(heard);
        if (ok) score++;
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = ok
            ? `✅ Bạn nói: "<b>${heard}</b>" — Tốt lắm!`
            : `🗣️ Bạn nói: "<b>${heard}</b>"`;
          resultEl.style.color = ok ? '#27ae60' : '#e74c3c';
        }
        if (statusEl) statusEl.textContent = ok ? '🎉 Tốt lắm!' : '💪 Thử lại nào!';
        micEl?.classList.remove('listening');
        if (retryWrap) retryWrap.style.display = 'block';
        introSpeakEN('main', ok ? 'Well done!' : 'Try again!', 0.9);
      };
      rec.onerror = () => {
        if (statusEl) statusEl.textContent = '⚠️ Không nghe được!';
        micEl?.classList.remove('listening');
      };
    };

    if (micEl) micEl.onclick = doRecord;
    document.getElementById('rp-retry')?.addEventListener('click', doRecord);

    return new Promise(resolve => {
      document.getElementById('rp-next').onclick = () => {
        window.speechSynthesis.cancel();
        introStopLipSync('main');
        resolve();
      };
    });
  };

  await initIntroLive2D(['main']);
  for (idx = 0; idx < words.length; idx++) {
    await runOne(words[idx]);
  }

  // Ghi điểm vocab2
  const tot = words.length * 2;
  scoreState.vocab2 = { score, total: tot };
  const raw  = localStorage.getItem('result_vocabulary');
  const prev = raw ? JSON.parse(raw) : {};
  localStorage.setItem('result_vocabulary', JSON.stringify({
    ...prev, scoreV2: score, totalV2: tot,
    score: (prev.scoreV1||0) + score,
    total: (prev.totalV1||0) + tot,
  }));
  updateMiniScore(score, tot);
}

// ═══════════════════════════════════════════════════════════════════════════
// BƯỚC 5 — Hội thoại
// ═══════════════════════════════════════════════════════════════════════════
async function runIntroDialoguePart() {
  const words = vocabData.slice(0,10).filter(w => w.question && w.answerRaw);

  const render = () => {
    document.getElementById('mainCard').innerHTML = `
      <div class="intro-scene intro-classroom-bg">
        ${introCharHTML('sub', introSelectedSub[0], '#8e44ad')}
        <div class="intro-whiteboard">
          <div id="dlg-wb" style="width:100%;display:flex;flex-direction:column;
            align-items:center;gap:10px;min-height:160px;justify-content:center;color:#333;">
            <div style="color:#aaa;font-size:13px;">Đang tải...</div>
          </div>
        </div>
        ${introCharHTML('main', introSelectedMain[0], '#27ae60', true)}
      </div>
      <div class="intro-action-row" id="dlg-btns" style="display:none;">
        <button class="poke-btn gray"   id="dlg-replay">↺ Replay</button>
        <button class="poke-btn yellow" id="dlg-next">⏩ Bắt đầu học!</button>
      </div>
    `;
  };

  render();
  await initIntroLive2D(['sub','main']);

  const play = async () => {
    const btns = document.getElementById('dlg-btns');
    if (btns) btns.style.display = 'none';
    const wb = document.getElementById('dlg-wb');

    await introSpeakEN('main', "Let's practice these words together!", 0.85);

    for (const w of words) {
      const imgSrc = getImageFromMap((w.imageKeyword||w.word).toLowerCase().trim()) || '';
      wb.innerHTML = `
        <div class="intro-pop" style="width:100%;display:flex;flex-direction:column;
          align-items:center;gap:8px;">
          ${imgSrc ? `<img src="${imgSrc}" style="height:clamp(55px,12vw,80px);
            object-fit:contain;border-radius:6px;border:1px solid #eee;"/>` : ''}
          <div style="font-size:clamp(15px,4vw,20px);font-weight:800;color:#1a1a2e;">
            ${w.word.toUpperCase()}
          </div>
          <div id="dlg-line" style="font-size:clamp(12px,2.5vw,14px);color:#444;
            text-align:center;background:#f9f9f9;padding:6px 10px;
            border-radius:6px;min-height:34px;width:100%;">...</div>
        </div>
      `;

      // Main hỏi
      const lineEl = document.getElementById('dlg-line');
      if (lineEl) lineEl.innerHTML =
        `<span style="color:#27ae60;font-weight:600;">${introSelectedMain[0]}:</span> ${w.question}`;
      await introSpeakEN('main', w.question, 0.85);
      await introDelay(2000);

      // Sub trả lời
      if (lineEl) lineEl.innerHTML =
        `<span style="color:#8e44ad;font-weight:600;">${introSelectedSub[0]}:</span> ${w.answerRaw}`;
      await introSpeakEN('sub', w.answerRaw, 0.85);
      await introDelay(2000);
    }

    await introSpeakEN('main', "Wonderful! Now it's your turn. Good luck!", 0.85);
    if (btns) btns.style.display = 'flex';
  };

  await play();
  document.getElementById('dlg-replay').onclick = play;
  return new Promise(resolve => {
    document.getElementById('dlg-next').onclick = resolve;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN runIntro
// ═══════════════════════════════════════════════════════════════════════════
async function runIntro() {
  localStorage.setItem("jump_to_stage_idx", "1");
  window.location.href = "intro.html";
  await new Promise(() => {});
}
// STAGE 1 — VOCABULARY 1 (Bản chuẩn cho giao diện All-in-One)
// ═══════════════════════════════════════════════════════════════════════════
async function runVocab1() {
  const data = vocabData;
  let idx = 0;
  let roundCount = 0;
  let listenCount = 0;
  const REQUIRED = 1;

  const saveResult = (sc, tot) => {
    const raw = localStorage.getItem("result_vocabulary");
    const prev = raw ? JSON.parse(raw) : {};
    localStorage.setItem("result_vocabulary", JSON.stringify({
      ...prev, scoreV1: sc, totalV1: tot,
      score: sc + (prev.scoreV2 || 0),
      total: tot + (prev.totalV2 || 0)
    }));
  };

  const render = async () => {
    const w = data[idx];
    const cleanWord = w.word.trim();
    const phonetic = await getPhonetic(cleanWord);
    const imgKey = (w.imageKeyword || cleanWord).toLowerCase().trim();
    const imgSrc = getImageFromMap(imgKey) || "";

    // Lấy ghi chú bổ trợ
    const note1 = w.noteAH || "";
    const note2 = w.noteAI || "";

    const wordsHTML = cleanWord.split(" ").map(part =>
      `<span data-word="${part}" class="vocab-tap">${part.toUpperCase()}</span>`
    ).join("");

    // Render giao diện vào #mainCard
    setCard(`
      <div style="margin-bottom:12px;color:var(--poke-yellow);font-size:13px;font-weight:bold;">
        📘 PHẦN 1: TỪ VỰNG &nbsp;|&nbsp; ${idx+1}/${data.length} &nbsp;|&nbsp; Vòng ${roundCount+1}
      </div>
      <div class="vocab-row">
        <div class="vocab-image-frame">
          <img class="main-img" src="${imgSrc}" alt="" ${imgSrc ? "" : "style='display:none'"} />
          <img class="corner-ball tl" src="https://cdn-icons-png.flaticon.com/512/361/361998.png"/>
          <img class="corner-ball tr" src="https://cdn-icons-png.flaticon.com/512/361/361998.png"/>
          <img class="corner-ball bl" src="https://cdn-icons-png.flaticon.com/512/361/361998.png"/>
          <img class="corner-ball br" src="https://cdn-icons-png.flaticon.com/512/361/361998.png"/>
        </div>

        <div class="vocab-info">
          <div class="vocab-word-area" id="vw1WordArea">${wordsHTML}</div>

          <style>
            #v1PhonicsContainer .syllable-wrapper {
              flex: 0 0 auto !important; /* Tuyệt đối không cho co lại */
              min-width: 100px !important; /* Chiều ngang tối thiểu để chữ rõ ràng */
              margin: 5px !important;
              transform: scale(1) !important; /* Giữ kích thước chuẩn */
            }
            #v1PhonicsContainer .sound-unit {
              width: 100% !important;
              padding: 8px !important;
            }
          </style>

          <div id="v1PhonicsContainer" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px; justify-content: flex-start;"></div>

          <div class="vocab-phonetic">${phonetic || "/.../"}</div>
          <div class="vocab-meaning">${w.meaning || "Chưa có nghĩa"}</div>

          ${(note1 || note2) ? `
            <div style="margin-top:15px; padding:12px; border-radius:12px; background:rgba(255,255,255,0.05); border:1px dashed var(--poke-yellow); text-align: left;">
              ${note1 ? `<p style="margin:4px 0; color:#ff7675; font-size:14px; font-weight:bold;">💡 ${note1}</p>` : ""}
              ${note2 ? `<p style="margin:4px 0; color:#74b9ff; font-size:14px; font-style:italic;">✨ ${note2}</p>` : ""}
            </div>
          ` : ""}

          <div style="margin-top:18px; display:flex; gap:12px; align-items:center; justify-content: flex-start;">
            <button class="poke-btn yellow" id="v1PlayBtn">🔊 Nghe</button>
            <button class="poke-btn red" id="v1NextBtn" disabled>⏭️ Next</button>
          </div>
        </div>
      </div>
    `);

    // Kích hoạt máy tách âm ngay khi card vừa dựng xong
    const pContainer = document.getElementById("v1PhonicsContainer");
    if (pContainer && window.handleSplit) {
      window.handleSplit(cleanWord.toLowerCase(), pContainer, null);
    }

    listenCount = 0;

    // Click từng từ đọc chậm (0.3 rate)
    document.querySelectorAll(".vocab-tap").forEach(span => {
      span.onclick = () => {
        if (typeof speak === "function") speak(span.dataset.word, 0.3);
        else {
           const u = new SpeechSynthesisUtterance(span.dataset.word);
           u.rate = 0.3;
           speechSynthesis.cancel();
           speechSynthesis.speak(u);
        }
      };
    });

    // Nút nghe chính
    // ĐOẠN CODE MỚI ĐÃ ĐƯỢC ÉP NGÔN NGỮ CHUẨN TIẾNG ANH
    document.getElementById("v1PlayBtn").onclick = () => {
      const u = new SpeechSynthesisUtterance(cleanWord);
      u.lang = "en-US"; // Đảm bảo luôn kích hoạt bộ đọc tiếng Anh kể cả khi vocabVoice chưa tải xong
      u.voice = (typeof vocabVoice !== 'undefined') ? vocabVoice : null;
      u.onend = () => {
        listenCount++;
        if (listenCount >= REQUIRED) document.getElementById("v1NextBtn").disabled = false;
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    };

    // Nút chuyển từ
    document.getElementById("v1NextBtn").onclick = async () => {
      idx++;
      if (idx >= data.length) { idx = 0; roundCount++; }

      if (roundCount >= 2) {
        const sc = data.length > 0 ? 10 : 0;
        if (typeof scoreState !== "undefined") scoreState.vocab1 = { score: sc, total: 10 };
        saveResult(sc, 10);
        updateMiniScore(sc, 10);
        await showTransition("🎉", "Hoàn thành Từ vựng 1!", "Chuẩn bị sang phần tiếp theo nhé!");
        if (window._resolveVocab1) { window._resolveVocab1(); window._resolveVocab1 = null; }
        return;
      }
      render();
    };

    updateMiniScore(roundCount * data.length + idx, data.length * 2);
  };

  return new Promise(resolve => {
    window._resolveVocab1 = resolve;
    render();
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// STAGE 2 — VOCABULARY 2 (Pokéball bắt từ — text mode thay vì animation)
// ═══════════════════════════════════════════════════════════════════════════
async function runVocab2() {
  const data = shuffle(vocabData);
  let caught = 0;
  let speakScore = parseInt(localStorage.getItem("speaking_score_v2") || "0");

  const saveResult = (sc, tot) => {
    const raw  = localStorage.getItem("result_vocabulary");
    const prev = raw ? JSON.parse(raw) : {};
    localStorage.setItem("result_vocabulary", JSON.stringify({
      ...prev, scoreV2: sc, totalV2: tot,
      score: (prev.scoreV1 || 0) + sc,
      total: (prev.totalV1 || 0) + tot
    }));
  };

  return new Promise(resolve => {
    const showItem = () => {
      if (caught >= data.length) {
        const tot = data.length * 2;
        scoreState.vocab2 = { score: speakScore, total: tot };
        saveResult(speakScore, tot);
        localStorage.removeItem("speaking_score_v2");
        updateMiniScore(speakScore, tot);
        showTransition("✅","Hoàn thành Từ vựng 2!","Tiếp tục sang phần Hình ảnh!").then(resolve);
        return;
      }

      const item   = data[caught];
      const imgSrc = getImageFromMap(item.word) || "";

      setCard(`
        <div style="margin-bottom:12px;color:var(--poke-yellow);font-size:13px;">
          🎯 Từ vựng 2 &nbsp;|&nbsp; ${caught+1}/${data.length}
        </div>
        <div style="text-align:center;margin-bottom:16px;">
          ${imgSrc ? `<img src="${imgSrc}" style="max-width:200px;border-radius:12px;"/>` : ""}
          <div style="font-size:20px;margin:10px 0;">${item.meaning || "?"}</div>
          <button class="poke-btn yellow" id="v2ListenBtn">🔊 Nghe câu hỏi</button>
        </div>
        <div style="text-align:center;margin-top:10px;">
          <button class="poke-btn blue" id="v2SpeakBtn">
            <img src="https://cdn-icons-png.flaticon.com/512/361/361998.png" style="width:36px;vertical-align:middle"/> 🎤 Nói từ
          </button>
          <button class="poke-btn gray" id="v2SkipBtn" style="margin-left:10px;">⏭ Bỏ qua</button>
        </div>
        <div id="v2SpeechResult" style="margin-top:12px;text-align:center;font-size:16px;color:#ffd54f;"></div>
      `);

      document.getElementById("v2ListenBtn").onclick = () => speak(item.question || item.word);

      document.getElementById("v2SkipBtn").onclick = () => { caught++; showItem(); };

      document.getElementById("v2SpeakBtn").onclick = () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { alert("Thiết bị không hỗ trợ ghi âm."); caught++; showItem(); return; }
        const rec = new SR();
        rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
        document.getElementById("v2SpeechResult").textContent = "🎙️ Đang nghe...";
        rec.start();
        rec.onresult = e => {
          const tr  = e.results[0][0].transcript.toLowerCase().trim();
          const tgt = item.word.toLowerCase().replace(/[^a-z0-9'\s]/g,"");
          const sc  = tr.includes(tgt) ? 2 : 0;
          speakScore += sc;
          localStorage.setItem("speaking_score_v2", speakScore);
          document.getElementById("v2SpeechResult").innerHTML =
            `🗣️ Bạn nói: "<i>${tr}</i>" — ${sc === 2 ? "✅ +2" : "❌ 0"} điểm`;
          setTimeout(() => { caught++; showItem(); }, 1400);
        };
        rec.onerror = () => { caught++; showItem(); };
      };

      updateMiniScore(caught, data.length);
    };

    showItem();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 3-5 — IMAGE D1, D2, D3
// ═══════════════════════════════════════════════════════════════════════════
function saveImageResult(part, sc, tot) {
  const raw  = localStorage.getItem("result_image");
  const prev = raw ? JSON.parse(raw) : {};
  const u = {
    score1: part===1?sc:prev.score1||0, total1: part===1?tot:prev.total1||0,
    score2: part===2?sc:prev.score2||0, total2: part===2?tot:prev.total2||0,
    score3: part===3?sc:prev.score3||0, total3: part===3?tot:prev.total3||0,
  };
  localStorage.setItem("result_image", JSON.stringify({ ...u,
    score: u.score1+u.score2+u.score3, total: u.total1+u.total2+u.total3 }));
}

async function runImageD1() {
  const data = shuffle([...vocabData]);
  let idx = 0, score = 0;

  return new Promise(resolve => {
    const show = () => {
      if (idx >= data.length) {
        scoreState.image_d1 = { score, total: data.length };
        saveImageResult(1, score, data.length);
        updateMiniScore(score, data.length);
        showTransition("🧠","Xong Dạng 1 Hình ảnh!","Tiếp tục Dạng 2...").then(resolve);
        return;
      }
      const cur     = data[idx];
      const wrong   = data.filter(d => d.word !== cur.word);
      const options = shuffle([cur, ...wrong.slice(0,3)]);
      speak(cur.word);

      setCard(`
        <div style="margin-bottom:10px;color:var(--poke-yellow);font-size:13px;">
          🧠 Hình ảnh – Dạng 1 &nbsp;|&nbsp; ${idx+1}/${data.length} &nbsp;|&nbsp; Điểm: ${score}
        </div>
        <button class="poke-btn blue" id="id1Play" style="margin-bottom:14px;">🔊 Nghe lại</button>
        <div class="img-grid" id="id1Grid"></div>
        <div class="result-msg" id="id1Result"></div>
      `);

      document.getElementById("id1Play").onclick = () => speak(cur.word);

      const grid = document.getElementById("id1Grid");
      options.forEach(item => {
        const imgUrl = getImageFromMap(item.word) || "";
        const card = document.createElement("div");
        card.className = "img-card";
        card.innerHTML = `${imgUrl?`<img src="${imgUrl}" alt=""/>`:`<div style="height:100px;background:rgba(255,255,255,0.1);border-radius:8px;"></div>`}<p>${item.meaning}</p>`;
        card.onclick = () => {
          const r = document.getElementById("id1Result");
          if (item.word === cur.word) {
            score++; r.textContent = "✅ Chính xác!"; r.className = "result-msg ok";
          } else {
            r.textContent = `❌ Sai. Đáp án: ${cur.word}`; r.className = "result-msg err";
          }
          grid.querySelectorAll(".img-card").forEach(c => c.onclick = null);
          idx++; setTimeout(show, 1200);
        };
        grid.appendChild(card);
      });
      updateMiniScore(score, idx+1);
    };
    show();
  });
}

async function runImageD2() {
  const data = shuffle([...vocabData]);
  let idx = 0, score = 0;

  return new Promise(resolve => {
    const show = () => {
      if (idx >= data.length) {
        scoreState.image_d2 = { score, total: data.length };
        saveImageResult(2, score, data.length);
        updateMiniScore(score, data.length);
        showTransition("🖼️","Xong Dạng 2 Hình ảnh!","Tiếp tục Dạng 3 (khó nhất)...").then(resolve);
        return;
      }
      const cur     = data[idx];
      const imgUrl  = getImageFromMap(cur.word) || "";
      const wrong   = data.filter(d => d.word !== cur.word);
      const options = shuffle([cur.word, ...wrong.map(d=>d.word).slice(0,3)]);

      setCard(`
        <div style="margin-bottom:10px;color:var(--poke-yellow);font-size:13px;">
          🖼️ Hình ảnh – Dạng 2 &nbsp;|&nbsp; ${idx+1}/${data.length} &nbsp;|&nbsp; Điểm: ${score}
        </div>
        <div style="text-align:center;margin-bottom:14px;">
          ${imgUrl?`<img src="${imgUrl}" style="max-width:260px;border-radius:12px;"/>`:
          `<div style="width:260px;height:160px;background:rgba(255,255,255,0.1);border-radius:12px;margin:auto;"></div>`}
        </div>
        <button class="poke-btn blue" id="id2Play" style="margin-bottom:10px;">🔊 Nghe từ</button>
        <div class="choice-list" id="id2Choices"></div>
        <div class="result-msg" id="id2Result"></div>
      `);

      document.getElementById("id2Play").onclick = () => speak(cur.word);

      const box = document.getElementById("id2Choices");
      options.forEach((w,i) => {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.textContent = `${String.fromCharCode(65+i)}. ${w}`;
        btn.onclick = () => {
          const r = document.getElementById("id2Result");
          if (w === cur.word) { score++; r.textContent="✅ Chính xác!"; r.className="result-msg ok"; }
          else { r.textContent=`❌ Sai. Đáp án: ${cur.word}`; r.className="result-msg err"; }
          box.querySelectorAll(".choice-btn").forEach(b => b.onclick=null);
          idx++; setTimeout(show, 1400);
        };
        box.appendChild(btn);
      });
      updateMiniScore(score, idx+1);
    };
    show();
  });
}

async function runImageD3() {
  const data = shuffle([...vocabData]);
  let idx = 0, score = 0;
  let answered = false;

  return new Promise(resolve => {
    const show = () => {
      answered = false;
      if (idx >= data.length) {
        scoreState.image_d3 = { score, total: data.length };
        saveImageResult(3, score, data.length);
        updateMiniScore(score, data.length);
        showTransition("🎨","Xong cả 3 dạng Hình ảnh!","Tiếp tục PokéWord!").then(resolve);
        return;
      }
      const cur    = data[idx];
      const imgUrl = getImageFromMap(cur.word) || "";

      setCard(`
        <div style="margin-bottom:10px;color:var(--poke-yellow);font-size:13px;">
          🎨 Hình ảnh – Dạng 3 &nbsp;|&nbsp; ${idx+1}/${data.length} &nbsp;|&nbsp; Điểm: ${score}
        </div>
        <div style="text-align:center;margin-bottom:14px;">
          <img src="${imgUrl}" id="id3Img" style="max-width:260px;border-radius:12px;filter:blur(4px);transition:0.4s;"/>
        </div>
        <div style="text-align:center;margin-bottom:10px;">
          <input type="text" id="id3Input" placeholder="Gõ từ tiếng Anh..." 
            style="padding:10px;font-size:16px;border-radius:10px;width:70%;max-width:280px;background:rgba(255,255,255,0.1);border:2px solid rgba(255,203,5,0.4);color:#fff;"/>
        </div>
        <div style="text-align:center;">
          <button class="poke-btn yellow" id="id3Submit">✅ Trả lời</button>
          <button class="poke-btn blue"   id="id3Play"   style="margin-left:8px;">🔊</button>
        </div>
        <div class="result-msg" id="id3Result"></div>
      `);

      document.getElementById("id3Play").onclick = () => speak(cur.word);
      document.getElementById("id3Submit").onclick = () => {
        if (answered) return;
        answered = true;
        document.getElementById("id3Submit").disabled = true;
        const val = (document.getElementById("id3Input").value||"").trim().toLowerCase();
        const img = document.getElementById("id3Img");
        if (img) img.style.filter = "none";
        const r = document.getElementById("id3Result");
        if (val === cur.word.toLowerCase()) {
          score++; r.textContent=`✅ Chính xác! ${cur.word}: ${cur.meaning}`; r.className="result-msg ok";
        } else {
          r.innerHTML=`❌ Sai. Đáp án: <b>${cur.word}</b> — ${cur.meaning}`; r.className="result-msg err";
        }
        idx++; setTimeout(show, 2000);
      };
      document.getElementById("id3Input").onkeydown = e => {
        if (e.key === "Enter") document.getElementById("id3Submit").click();
      };
      updateMiniScore(score, idx+1);
    };
    show();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 6 — POKEWORD
// ═══════════════════════════════════════════════════════════════════════════
function saveGameResult(sc, tot) {
  const raw  = localStorage.getItem("result_game");
  const prev = raw ? JSON.parse(raw) : {};
  localStorage.setItem("result_game", JSON.stringify({
    ...prev, scoreGame3: sc, totalGame3: tot,
    score: (prev.scoreGame1||0)+(prev.scoreGame2||0)+sc,
    total: (prev.totalGame1||0)+(prev.totalGame2||0)+tot
  }));
}

async function runPokeword() {
  const raw       = JSON.parse(localStorage.getItem("wordBank")) || [];
  const timeLimit = 20;
  let words       = [];
  let idx         = 0;
  let score       = 0;
  let timerExp    = false;
  let timer;

  // Fetch pokeword words
  try {
    const rows = await getSheetRows();
    const clean = w => w.replace(/[^a-zA-Z]/g,"").toUpperCase();
    const mapped = rows.map(r => ({
      word:    clean((r[2]||"").toString()),
      meaning: (r[24]||"").toString().trim()
    })).filter(it => raw.some(c => clean(c) === it.word));
    const seen = new Set();
    const unique = mapped.filter(it => { if(seen.has(it.word)) return false; seen.add(it.word); return true; });
    words = shuffle([...unique, ...unique]); // double
  } catch(e) { console.error(e); }

  if (!words.length) {
    await showTransition("⚠️","PokéWord","Không có từ. Bỏ qua.");
    return;
  }

  const getMissing = len => shuffle(Array.from({length:len},(_,i)=>i)).slice(0, Math.floor(len/2));

  return new Promise(resolve => {
    const renderWord = () => {
      clearInterval(timer);
      timerExp = false;
      if (idx >= words.length) {
        scoreState.pokeword = { score, total: words.length };
        saveGameResult(score, words.length);
        updateMiniScore(score, words.length);
        showTransition("🔤","Xong PokéWord!","Tiếp tục phần Nghe!").then(resolve);
        return;
      }
      const wObj    = words[idx];
      const letters = wObj.word.split("");
      const missing = getMissing(letters.length);

      const cellsHTML = letters.map((ch,i) => {
        if (missing.includes(i)) {
          return `<div class="pw-cell"><input type="text" maxlength="1" class="pw-input" /></div>`;
        }
        return `<div class="pw-cell">${ch}</div>`;
      }).join("");

      setCard(`
        <div style="margin-bottom:10px;color:var(--poke-yellow);font-size:13px;">
          🔤 PokéWord &nbsp;|&nbsp; ${idx+1}/${words.length} &nbsp;|&nbsp; Điểm: ${score}
        </div>
        <div style="font-size:17px;margin-bottom:6px;">💡 <span id="pwHintBox"></span></div>
        <div style="color:#fdd835;font-size:18px;margin-bottom:10px;">
          ⏱ <span id="pwTimer">${timeLimit}</span>s
        </div>
        <div class="pw-grid">${cellsHTML}</div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
          <button class="poke-btn green"  id="pwSubmit">✅ Xác nhận</button>
          <button class="poke-btn yellow" id="pwHint">🔍 Gợi ý</button>
        </div>
        <div class="result-msg" id="pwResult"></div>
      `);

      // Tự động focus ô nhập đầu tiên
      const firstInput = document.querySelector(".pw-input");
      if (firstInput) firstInput.focus();

      // Timer
      let sec = timeLimit;
      timer = setInterval(() => {
        sec--;
        const el = document.getElementById("pwTimer");
        if (el) el.textContent = sec;
        if (sec <= 0) { clearInterval(timer); timerExp = true; }
      }, 1000);

      document.getElementById("pwHint").onclick = () => {
        const h = document.getElementById("pwHintBox");
        if (h) h.textContent = `📘 ${wObj.meaning}`;
      };

      const checkAnswer = () => {
        const cells = document.querySelectorAll(".pw-cell");
        let guess = "";
        cells.forEach(cell => {
          const inp = cell.querySelector("input");
          guess += inp ? (inp.value||"_").toUpperCase() : cell.textContent.toUpperCase();
        });
        const r = document.getElementById("pwResult");
        if (guess === wObj.word) {
          if (!timerExp) { score++; r.textContent="✅ Đúng! +1 điểm"; r.className="result-msg ok"; }
          else { r.textContent="✅ Đúng nhưng hết giờ, không cộng điểm."; r.className="result-msg err"; }
        } else {
          r.textContent=`❌ Sai. Đáp án: ${wObj.word}`; r.className="result-msg err";
        }
        clearInterval(timer);
        idx++; setTimeout(renderWord, 1000);
      };

      document.getElementById("pwSubmit").onclick = checkAnswer;

      // Enter để submit
      document.querySelectorAll(".pw-input").forEach((inp, i, all) => {
        inp.oninput = () => { if(inp.value.length===1 && all[i+1]) all[i+1].focus(); };
        inp.onkeydown = e => { if(e.key==="Enter") checkAnswer(); };
      });

      updateMiniScore(score, idx+1);
    };
    renderWord();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 7 — LISTENING 1
// ═══════════════════════════════════════════════════════════════════════════
function saveListeningResult(sc, tot) {
  const raw  = localStorage.getItem("result_listening");
  const prev = raw ? JSON.parse(raw) : {};
  localStorage.setItem("result_listening", JSON.stringify({
    ...prev, score1: sc, total1: tot,
    score: sc+(prev.score2||0)+(prev.score3||0),
    total: tot+(prev.total2||0)+(prev.total3||0)
  }));
}

async function runListening1() {
  let listeningData = [];
  let score = 0;

  try {
    const maxCode = await getMaxLessonCode();
    const rows    = await getSheetRows();
    const wbSet   = new Set(wordBank.map(w=>w.toLowerCase().trim()));

    const normalize = s => (s||"").replace(/\([^)]*\)/g,"").trim();
    const normUnit  = u => { if(!u) return 0; const p=u.split("-"); if(p.length<3) return 0; return parseInt(p[0])*1000+parseInt(p[1])*10+parseInt(p[2]); };

    listeningData = rows.map(r => ({
      q:      normalize((r[9]||"").toString().trim()),
      a:      normalize((r[11]||"").toString().trim()),
      target: (r[2]||"").toString().trim(),
      uNum:   normUnit((r[1]||"").toString().trim())
    })).filter(it =>
      it.q && it.a && it.uNum <= maxCode &&
      wbSet.has(it.target.toLowerCase().trim())
    ).slice(0, 15);
  } catch(e) { console.error("listening fetch:", e); }

  if (!listeningData.length) {
    await showTransition("📭","Listening","Không có dữ liệu. Bỏ qua.");
    return;
  }

  let idx = 0;
  let voiceMale   = vocabVoice;
  let voiceFemale = vocabVoice;

  const voices = speechSynthesis.getVoices();
  voiceMale   = voices.find(v=>v.name.includes("David"))   || vocabVoice;
  voiceFemale = voices.find(v=>v.name.includes("Zira"))    || vocabVoice;

  const speakLine = (text, voice) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.voice = voice;
    window.speechSynthesis.speak(u);
  };
  const playCon = (q, a) => {
    speakLine(q, voiceMale);
    setTimeout(() => speakLine(a, voiceFemale), 1500);
  };

  return new Promise(resolve => {
    const show = () => {
      if (idx >= listeningData.length) {
        scoreState.listening1 = { score, total: listeningData.length };
        saveListeningResult(score, listeningData.length);
        updateMiniScore(score, listeningData.length);
        showTransition("🎧","Xong phần Nghe!","Tiếp tục phần Luyện nói!").then(resolve);
        return;
      }
      const it = listeningData[idx];
      const regex = new RegExp(`\\b${it.target}\\b`,"gi");
      const dispQ = it.q.replace(regex,"___");
      const dispA = it.a.replace(regex,"___");

      setCard(`
        <div style="margin-bottom:10px;color:var(--poke-yellow);font-size:13px;">
          🎧 Nghe &nbsp;|&nbsp; ${idx+1}/${listeningData.length} &nbsp;|&nbsp; Điểm: ${score}
        </div>
        <div class="dialogue-box">
          <div class="line-q">🗣 ${dispQ}</div>
          <div class="line-a">🗣 ${dispA}</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
          <button class="poke-btn blue" id="l1Play">🔊 Nghe lại</button>
          <input type="text" id="l1Input" placeholder="Từ bị che là..." 
            style="padding:10px;font-size:16px;border-radius:10px;flex:1;min-width:140px;background:rgba(255,255,255,0.1);border:2px solid rgba(255,203,5,0.4);color:#fff;"/>
          <button class="poke-btn yellow" id="l1Submit">✅ Trả lời</button>
        </div>
        <div class="result-msg" id="l1Result"></div>
      `);

      playCon(it.q, it.a);
      document.getElementById("l1Play").onclick = () => playCon(it.q, it.a);

      const submit = () => {
        const val = (document.getElementById("l1Input").value||"").toLowerCase().replace(/[^a-z0-9]/gi,"").trim();
        const tgt = it.target.toLowerCase().replace(/[^a-z0-9]/gi,"").trim();
        const r   = document.getElementById("l1Result");
        if (val === tgt) { score++; r.textContent="✅ Chính xác!"; r.className="result-msg ok"; }
        else { r.textContent=`❌ Sai. Đáp án: ${it.target}`; r.className="result-msg err"; }
        speakLine(it.target, voiceFemale);
        idx++; setTimeout(show, 2000);
      };

      document.getElementById("l1Submit").onclick = submit;
      document.getElementById("l1Input").onkeydown = e => { if(e.key==="Enter") submit(); };
      updateMiniScore(score, idx+1);
    };
    show();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 8 — SPEAKING SENTENCE
// ═══════════════════════════════════════════════════════════════════════════
function saveSpeakingResult(sc, tot) {
  const raw  = localStorage.getItem("result_speaking");
  const prev = raw ? JSON.parse(raw) : {};
  localStorage.setItem("result_speaking", JSON.stringify({
    ...prev, score2: sc, total2: tot,
    score: (prev.score1||0)+sc+(prev.score3||0),
    total: (prev.total1||0)+tot+(prev.total3||0)
  }));
}

async function runSpeaking() {
  let sentences = [];
  let totalScore = 0;

  const normalizeUnitId = u => { if(!u) return 0; const p=u.split("-"); if(p.length<3) return 0; return parseInt(p[0])*1000+parseInt(p[1])*10+parseInt(p[2]); };

  try {
    const maxCode = await getMaxLessonCode();
    const resBai  = await fetch(window.SHEET_BAI_HOC);
    const rowsBai = await resBai.json();
    const baiList = rowsBai.map(r => { const c=(r[2]||"").toString().trim(); return c?parseInt(c,10):null; }).filter(v=>v!==null&&!isNaN(v));
    const maxLesson = baiList.length ? Math.max(...baiList) : 0;

    const rows = await getSheetRows();
    const wbSet = new Set(wordBank.map(w=>w.toLowerCase().trim()));

    for (const r of rows) {
      const lessonName = (r[1]||"").toString().trim();
      const rawTarget  = (r[2]||"").toString().trim().toLowerCase();
      const rawMeaning = (r[24]||"").toString().trim();
      const q = (r[9]||"").toString().trim();
      const a = (r[11]||"").toString().trim();
      const unitNum = normalizeUnitId(lessonName);
      const targets = rawTarget.split(/[/;,]/).map(t=>t.trim());
      const isLearned  = targets.some(t=>wbSet.has(t));
      const isInLesson = unitNum >= 3011 && unitNum <= maxLesson;
      if (isLearned && isInLesson) {
        const tw = targets.find(t=>wbSet.has(t)) || rawTarget;
        if (q) sentences.push({ text: q, target: tw, meaning: rawMeaning });
        if (a) sentences.push({ text: a, target: tw, meaning: rawMeaning });
      }
    }
  } catch(e) { console.error("speaking fetch:", e); }

  if (!sentences.length) {
    await showTransition("📭","Speaking","Không có câu. Bỏ qua.");
    return;
  }

  let idx = 0;
  return new Promise(resolve => {
    const show = () => {
      if (idx >= sentences.length) {
        scoreState.speaking = { score: totalScore, total: sentences.length };
        saveSpeakingResult(totalScore, sentences.length);
        updateMiniScore(totalScore, sentences.length);
        showTransition("🎙️","Xong phần Nói!","Tiếp tục phần Tổng quan!").then(resolve);
        return;
      }
      const { text, target, meaning } = sentences[idx];
      speak(text);

      setCard(`
        <div style="margin-bottom:10px;color:var(--poke-yellow);font-size:13px;">
          🎙️ Nói câu &nbsp;|&nbsp; ${idx+1}/${sentences.length} &nbsp;|&nbsp; Điểm: ${totalScore}
        </div>
        <div style="font-size:18px;color:#ffd54f;margin-bottom:8px;">
          🔤 <b>${target}</b> <span style="font-size:14px;color:#aaa;">(${meaning})</span>
        </div>
        <div id="allSentenceArea">${text}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
          <button class="poke-btn blue" id="spPlay">🔊 Nghe lại</button>
          <button class="poke-btn yellow" id="spRecord">
            <img src="https://cdn-icons-png.flaticon.com/512/361/361998.png" style="width:32px;vertical-align:middle"/> Nói
          </button>
          <button class="poke-btn gray" id="spNext">⏩ Tiếp theo</button>
        </div>
        <div class="result-msg" id="spResult" style="margin-top:10px;text-align:center;"></div>
      `);

      document.getElementById("spPlay").onclick = () => speak(text);
      document.getElementById("spNext").onclick = () => { idx++; show(); };

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { document.getElementById("spRecord").disabled = true; return; }
      const rec = new SR();
      rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
      document.getElementById("spRecord").onclick = () => {
        document.getElementById("spResult").textContent = "🎙️ Đang nghe...";
        rec.start();
      };
      rec.onresult = e => {
        const tr   = e.results[0][0].transcript.toLowerCase().replace(/[^a-z0-9'\s]/g,"");
        const sent = text.toLowerCase().replace(/[^a-z0-9'\s]/g,"");
        const tw   = sent.split(/\s+/);
        const uw   = tr.split(/\s+/);
        const corr = tw.filter(w=>uw.includes(w)).length;
        const pct  = Math.round((corr/tw.length)*100);
        if (pct >= 50) totalScore++;
        document.getElementById("spResult").innerHTML =
          `🗣️ Bạn: "<i>${tr}</i>" &nbsp; → &nbsp; ${corr}/${tw.length} từ (${pct}%) ${pct>=50?"✅":"❌"}`;
        idx++; setTimeout(show, 2000);
      };
      rec.onerror = () => { idx++; show(); };
      updateMiniScore(totalScore, idx+1);
    };
    show();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE 9-11 — OVERVIEW D1, D2, D3
// ═══════════════════════════════════════════════════════════════════════════
let ovData = { word: [], arrange: [], chunks: [] };

async function loadOverviewData() {
  try {
    const rows = await getSheetRows();
    const wbSet = new Set(wordBank.map(w=>(w||"").trim()));
    const seenA = new Set();
    ovData.word = []; ovData.arrange = []; ovData.chunks = [];
    rows.forEach(r => {
      const col    = Object.values(r);
      const word   = (col[2]||"").toString().trim();
      if (!word || !wbSet.has(word)) return;
      const vi     = (col[24]||"").toString().trim();
      if (word && vi) ovData.word.push({ en: word, vi });
      const qRaw   = (col[9]||"").toString().trim();
      const aRaw   = (col[11]||"").toString().trim();
      if (qRaw && aRaw) {
        const norm = normSentence(aRaw);
        if (!seenA.has(norm)) { seenA.add(norm); ovData.arrange.push({ q: qRaw, a: norm }); }
      }
      const enRaw  = (col[3]||"").toString().trim();
      const viRaw  = (col[4]||"").toString().trim();
      if (enRaw && viRaw) {
        const ec = enRaw.split("/").map(s=>normSentence(s)).filter(Boolean);
        const vc = viRaw.split("/").map(s=>normSentence(s)).filter(Boolean);
        if (ec.length === vc.length) ovData.chunks.push({ enChunks: ec, viChunks: vc });
      }
    });
  } catch(e) { console.error("loadOverviewData:", e); }
}

function saveOverviewResult(part, sc, tot) {
  const raw  = localStorage.getItem("result_overview");
  const prev = raw ? JSON.parse(raw) : {};
  const u = {
    score1: part===1?sc:prev.score1||0, total1: part===1?tot:prev.total1||0,
    score2: part===2?sc:prev.score2||0, total2: part===2?tot:prev.total2||0,
    score3: part===3?sc:prev.score3||0, total3: part===3?tot:prev.total3||0,
  };
  localStorage.setItem("result_overview", JSON.stringify({ ...u,
    score: u.score1+u.score2+u.score3, total: u.total1+u.total2+u.total3 }));
}

async function runOverviewD1() {
  const data = shuffle(ovData.arrange);
  let idx = 0, score = 0;

  return new Promise(resolve => {
    const show = () => {
      if (idx >= data.length) {
        scoreState.overview_d1 = { score, total: data.length };
        saveOverviewResult(1, score, data.length);
        updateMiniScore(score, data.length);
        showTransition("✍️","Xong Dạng 1 Tổng quan!","Tiếp tục Dạng 2 (Dịch từ)...").then(resolve);
        return;
      }
      const it     = data[idx];
      const tokens = normSentence(it.a).split(" ").filter(Boolean);
      const shuffled = shuffle([...tokens]);

      setCard(`
        <div style="margin-bottom:10px;color:var(--poke-yellow);font-size:13px;">
          ✍️ Sắp xếp câu &nbsp;|&nbsp; ${idx+1}/${data.length} &nbsp;|&nbsp; Điểm: ${score}
        </div>
        <div style="background:rgba(255,255,255,0.07);padding:12px;border-radius:10px;margin-bottom:12px;font-size:17px;">
          💬 ${it.q || "(Sắp xếp thành câu đúng)"}
        </div>
        <div style="margin-bottom:8px;color:#aaa;">Chọn từ để ghép câu:</div>
        <div id="ov1Bank"></div>
        <div style="margin:10px 0;font-size:16px;">📝 Câu của bạn: <span id="ov1Build" style="color:#ffd54f;"></span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="poke-btn yellow"  id="ov1Submit">✅ Kiểm tra</button>
          <button class="poke-btn gray"    id="ov1Undo">↩️ Hoàn tác</button>
          <button class="poke-btn gray"    id="ov1Reset">♻️ Làm lại</button>
          <button class="poke-btn gray"    id="ov1Skip">⏭ Bỏ qua</button>
        </div>
        <div class="result-msg" id="ov1Result"></div>
      `);

      const bankEl  = document.getElementById("ov1Bank");
      const buildEl = document.getElementById("ov1Build");
      const picked  = [];
      let checking  = false;

      shuffled.forEach(tok => {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.textContent = tok;
        chip.onclick = () => { if(chip.classList.contains("disabled")) return; picked.push(tok); chip.classList.add("disabled"); buildEl.textContent = picked.join(" "); };
        bankEl.appendChild(chip);
      });

      document.getElementById("ov1Undo").onclick = () => {
        if (!picked.length) return;
        const last = picked.pop();
        const chips = bankEl.querySelectorAll(".chip.disabled");
        for (const c of chips) { if (c.textContent===last) { c.classList.remove("disabled"); break; } }
        buildEl.textContent = picked.join(" ");
      };
      document.getElementById("ov1Reset").onclick = () => {
        picked.length = 0;
        bankEl.querySelectorAll(".chip").forEach(c=>c.classList.remove("disabled"));
        buildEl.textContent = "";
      };
      document.getElementById("ov1Skip").onclick = () => { idx++; show(); };
      document.getElementById("ov1Submit").onclick = () => {
        if (checking) return; checking = true;
        document.getElementById("ov1Submit").disabled = true;
        const user = normSentence(picked.join(" "));
        const ans  = normSentence(it.a);
        const r    = document.getElementById("ov1Result");
        if (!user) { r.textContent = "⚠️ Hãy ghép câu trước!"; r.className="result-msg err"; checking=false; document.getElementById("ov1Submit").disabled=false; return; }
        if (user === ans) { score++; r.textContent="✅ Chính xác!"; r.className="result-msg ok"; speak(it.a); }
        else { r.innerHTML=`❌ Sai. Đáp án: <b>${it.a}</b>`; r.className="result-msg err"; }
        idx++; setTimeout(show, 1000);
      };
      updateMiniScore(score, idx+1);
    };
    show();
  });
}

async function runOverviewD2() {
  const data = shuffle(ovData.word);
  let idx = 0, score = 0;

  return new Promise(resolve => {
    const show = () => {
      if (idx >= data.length) {
        scoreState.overview_d2 = { score, total: data.length };
        saveOverviewResult(2, score, data.length);
        updateMiniScore(score, data.length);
        showTransition("🔤","Xong Dạng 2 Tổng quan!","Tiếp tục Dạng 3 (Dịch cụm)...").then(resolve);
        return;
      }
      const it = data[idx];
      let answered = false;

      setCard(`
        <div style="margin-bottom:10px;color:var(--poke-yellow);font-size:13px;">
          🔤 Dịch từ &nbsp;|&nbsp; ${idx+1}/${data.length} &nbsp;|&nbsp; Điểm: ${score}
        </div>
        <div style="background:rgba(255,255,255,0.07);padding:14px;border-radius:10px;font-size:20px;margin-bottom:14px;text-align:center;">
          ${it.vi}
        </div>
        <div style="text-align:center;margin-bottom:10px;">
          <input type="text" id="ov2Input" placeholder="Nhập từ tiếng Anh..." 
            style="padding:10px;font-size:16px;border-radius:10px;width:80%;max-width:300px;background:rgba(255,255,255,0.1);border:2px solid rgba(255,203,5,0.4);color:#fff;"/>
        </div>
        <div style="text-align:center;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button class="poke-btn yellow" id="ov2Submit">✅ Trả lời</button>
          <button class="poke-btn gray"   id="ov2Hint">💡 Gợi ý</button>
          <button class="poke-btn gray"   id="ov2Skip">⏭ Bỏ qua</button>
        </div>
        <div class="result-msg" id="ov2Result"></div>
      `);

      const inp = document.getElementById("ov2Input");
      inp.focus();

      const submit = () => {
        if (answered) return; answered = true;
        document.getElementById("ov2Submit").disabled = true;
        const user = normSentence(inp.value);
        const ans  = normSentence(it.en);
        const r    = document.getElementById("ov2Result");
        if (user === ans) { score++; r.textContent="✅ Chính xác!"; r.className="result-msg ok"; speak(it.en); }
        else { r.innerHTML=`❌ Sai. Đáp án: <b>${it.en}</b>`; r.className="result-msg err"; }
        idx++; setTimeout(show, 1000);
      };

      document.getElementById("ov2Submit").onclick = submit;
      inp.onkeydown = e => { if(e.key==="Enter") submit(); };
      document.getElementById("ov2Skip").onclick  = () => { idx++; show(); };
      document.getElementById("ov2Hint").onclick  = () => {
        const r = document.getElementById("ov2Result");
        r.textContent = `💡 Gợi ý: bắt đầu bằng chữ "${(it.en||"").charAt(0).toUpperCase()}"`;
        r.className = "result-msg";
      };
      updateMiniScore(score, idx+1);
    };
    show();
  });
}

async function runOverviewD3() {
  const data = shuffle(ovData.chunks);
  let idx = 0, score = 0;

  return new Promise(resolve => {
    const show = () => {
      if (idx >= data.length) {
        scoreState.overview_d3 = { score, total: data.length };
        saveOverviewResult(3, score, data.length);
        updateMiniScore(score, data.length);
        showTransition("🏆","Hoàn thành tất cả!","Bạn đã xong toàn bộ bài học hôm nay!").then(resolve);
        return;
      }
      const { enChunks, viChunks } = data[idx];
      let answered = false;

      const rowsHTML = viChunks.map((vi, i) =>
        `<div class="pair-row">
          <span class="vi-block">${vi}</span>
          <input class="en-input-ov" type="text" data-ans="${enChunks[i]}" placeholder="Nhập cụm tiếng Anh..." />
        </div>`
      ).join("");

      setCard(`
        <div style="margin-bottom:10px;color:var(--poke-yellow);font-size:13px;">
          🧱 Dịch cụm &nbsp;|&nbsp; ${idx+1}/${data.length} &nbsp;|&nbsp; Điểm: ${score}
        </div>
        <div>${rowsHTML}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          <button class="poke-btn yellow" id="ov3Submit">✅ Kiểm tra</button>
          <button class="poke-btn gray"   id="ov3Skip">⏭ Bỏ qua</button>
        </div>
        <div class="result-msg" id="ov3Result"></div>
      `);

      document.getElementById("ov3Skip").onclick = () => { idx++; show(); };
      document.getElementById("ov3Submit").onclick = () => {
        if (answered) return; answered = true;
        document.getElementById("ov3Submit").disabled = true;
        const inputs = document.querySelectorAll(".en-input-ov");
        let correct = 0;
        inputs.forEach(inp => {
          const user = normSentence(inp.value);
          const ans  = normSentence(inp.dataset.ans);
          if (user && user === ans) { correct++; inp.classList.add("ok"); }
          else { inp.classList.add("bad"); }
        });
        const ratio = correct / inputs.length;
        const r = document.getElementById("ov3Result");
        if (ratio >= 0.7) { score++; r.textContent=`✅ Đúng ${correct}/${inputs.length} (≥70%) → +1 điểm`; r.className="result-msg ok"; }
        else { r.textContent=`❌ Đúng ${correct}/${inputs.length} (<70%)`; r.className="result-msg err"; }
        idx++; setTimeout(show, 1200);
      };
      updateMiniScore(score, idx+1);
    };
    show();
  });
}
// ═══════════════════════════════════════════════════════════════════════════
// STAGE 12
// ═══════════════════════════════════════════════════════════════════════════
async function runCommunication() {
  const selectedLesson = localStorage.getItem("selectedLesson") || "";
  const toCode = str => (str || "").replace(/[^0-9]/g, "");
  let questionPool = [], score = 0;

  try {
    const rows = await getSheetRows();
    const rawQs = [];
    rows.forEach(row => {
      if (!row || !row[1] || !row[9] || !row[10]) return;
      const fullUnit = row[1].toString().trim();
      if (toCode(fullUnit) !== selectedLesson) return;
      rawQs.push({
        unit:       fullUnit,
        question:   row[9].toString().trim(),
        answer:     row[10].toString().trim(),
        suggestion: row[11] ? row[11].toString().trim() : "",
      });
    });
    const unitMap = new Map();
    rawQs.forEach(item => {
      if (!unitMap.has(item.unit)) unitMap.set(item.unit, []);
      unitMap.get(item.unit).push(item);
    });
    for (const [, qs] of unitMap.entries()) {
      questionPool.push(qs[Math.floor(Math.random() * qs.length)]);
    }
  } catch(e) { console.error("communication fetch:", e); }

  if (!questionPool.length) {
    await showTransition("📭", "Giao tiếp", "Không có câu hỏi cho bài này. Bỏ qua.");
    return;
  }

  setCard(`
    <div style="margin-bottom:10px;color:var(--poke-yellow);font-size:13px;">
      💬 Giao tiếp &nbsp;|&nbsp; 0/${questionPool.length} câu
    </div>
    <div id="commChat" style="background:rgba(255,255,255,0.05);border:2px solid rgba(255,203,5,0.2);
      border-radius:14px;height:300px;overflow-y:auto;padding:14px;margin-bottom:14px;
      font-size:16px;line-height:1.6;display:flex;flex-direction:column;gap:6px;"></div>

    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <button class="poke-btn yellow" id="commRecord" style="font-size:18px;">
        <img src="https://cdn-icons-png.flaticon.com/512/361/361998.png" style="width:28px;vertical-align:middle;"/> Trả lời
      </button>
      <button class="poke-btn blue" id="commRepeat">🔊 Đọc lại</button>

      <button class="poke-btn gray" id="commSkip" style="background:#444; color:#ccc; font-size:14px;">⏩ Bỏ qua bài</button>
    </div>
    <div id="commStatus" style="margin-top:8px;font-size:14px;color:#aaa;min-height:20px;"></div>
  `);

  const chatEl      = document.getElementById("commChat");
  const studentName = localStorage.getItem("trainerName") || "Bạn";
  let askedIdx = 0, currentQ = null, waitCorrect = false, lastBotMsg = "";

  const positiveFeedback = ["Great job!", "Well done!", "That's correct!",
    "Excellent!", "Perfect!", "You got it!", "Awesome!", "Spot on!"];
  const normTxt = s => (s || "").trim().replace(/\?$/, "").toLowerCase();

  const addMsg = (sender, text) => {
    const div = document.createElement("div");
    div.style.cssText = `padding:8px 12px;border-radius:10px;max-width:85%;word-wrap:break-word;
      ${sender === "Bot"
        ? "background:rgba(42,117,187,0.25);color:#87ceeb;align-self:flex-start;"
        : "background:rgba(255,203,5,0.15);color:#ffd54f;align-self:flex-end;text-align:right;"}`;
    div.innerHTML = `<b>${sender}:</b> ${text}`;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
    if (sender === "Bot") { speak(text, 0.9); lastBotMsg = text; }
  };

  return new Promise(resolve => {
    const askNext = () => {
      if (askedIdx >= questionPool.length) {
        addMsg("Bot", "Congratulations! 🎉 Bạn đã hoàn thành phần Giao tiếp!");
        localStorage.setItem("result_communication", JSON.stringify({ score, total: questionPool.length }));
        updateMiniScore(score, questionPool.length);
        document.getElementById("commRecord").disabled = true;
        setTimeout(async () => {
          await showTransition("🏆", "Xong phần Giao tiếp!", "Bạn đã hoàn thành tất cả!");
          resolve();
        }, 2500);
        return;
      }
      currentQ    = questionPool[askedIdx];
      askedIdx++;
      waitCorrect = false;
      addMsg("Bot", currentQ.question);
      const lbl = document.querySelector("#mainCard div:first-child");
      if (lbl) lbl.textContent = `💬 Giao tiếp | ${askedIdx}/${questionPool.length} câu`;
      updateMiniScore(score, askedIdx);
    };

    const handleInput = input => {
      addMsg(studentName, input);
      const normIn = normTxt(input);

      if (waitCorrect) {
        waitCorrect = false;
        setTimeout(askNext, 500);
        return;
      }

      if (currentQ?.answer) {
        const correctKW = currentQ.answer.split('"')
          .filter((_, i) => i % 2 === 1).map(t => normTxt(t));
        const isOk = correctKW.length > 0
          ? correctKW.some(kw => normIn.includes(kw))
          : normIn.includes(normTxt(currentQ.answer));
        if (isOk) {
          score++;
          addMsg("Bot", positiveFeedback[Math.floor(Math.random() * positiveFeedback.length)]);
          setTimeout(askNext, 800);
          return;
        }
      }

      if (currentQ?.suggestion) {
        addMsg("Bot", `You can say: ${currentQ.suggestion}`);
        waitCorrect = true;
      } else {
        setTimeout(askNext, 500);
      }
    };

    document.getElementById("commRepeat").onclick = () => { if (lastBotMsg) speak(lastBotMsg, 0.9); };

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
      document.getElementById("commRecord").onclick = () => {
        document.getElementById("commStatus").textContent = "🎙️ Đang nghe...";
        try { rec.start(); } catch(e) {}
      };
      rec.onresult = e => {
        document.getElementById("commStatus").textContent = "";
        handleInput(e.results[0][0].transcript);
      };
      rec.onerror = e => {
        document.getElementById("commStatus").textContent = `❌ Lỗi mic: ${e.error}`;
      };
    } else {
      document.getElementById("commRecord").disabled = true;
      document.getElementById("commStatus").textContent = "⚠️ Thiết bị không hỗ trợ mic.";
    }

    // Logic cho nút Bỏ qua bài
    document.getElementById("commSkip").onclick = async () => {
      if (confirm("Bạn có chắc chắn muốn bỏ qua phần Giao tiếp này không?")) {
        // Lưu kết quả hiện tại (nếu có)
        localStorage.setItem("result_communication", JSON.stringify({ score, total: questionPool.length }));

        await showTransition("⏩", "Đã bỏ qua!", "Đang chuyển sang phần tiếp theo...");

        // Giải phóng Promise để kết thúc hàm runCommunication
        resolve(); 
      }
    };
    addMsg("Bot", "Hello! Let's practice together! 🎮");
    setTimeout(askNext, 700);
  });
}
// ═══════════════════════════════════════════════════════════════════════════
// ĐIỀU PHỐI CHÍNH
// ═══════════════════════════════════════════════════════════════════════════
const STAGE_RUNNERS = {
  intro: runIntro,
  
  image_d2:     runImageD2,
  image_d3:     runImageD3,
  pokeword:     runPokeword,
  listening1:   runListening1,
  speaking:     runSpeaking,
  overview_d1:  runOverviewD1,
  overview_d2:  runOverviewD2,
  overview_d3:  runOverviewD3,
  communication: runCommunication,
};

async function runAllStages() {
  // KIỂM TRA LỆNH NHẢY BÀI
  const savedIdx = localStorage.getItem("jump_to_stage_idx");
  let startAt = 0;

  if (savedIdx !== null) {
    startAt = parseInt(savedIdx);
    localStorage.removeItem("jump_to_stage_idx"); // Xóa sau khi đã sử dụng
  }

  // Chạy vòng lặp từ vị trí startAt
  for (stageIndex = startAt; stageIndex < STAGES.length; stageIndex++) {
    const stage = STAGES[stageIndex];
    updateProgress();

    const runner = STAGE_RUNNERS[stage.id];
    if (runner) {
        await runner();
    }
  }

  // --- PHẦN KẾT THÚC GIỮ NGUYÊN ---
  stageIndex = STAGES.length;
  updateProgress();
  setCard(`
    <div style="text-align:center;padding:30px;">
      <div style="font-size:64px;">🏆</div>
      <h2 style="color:var(--poke-yellow);">Xuất sắc! Hoàn thành tất cả!</h2>
      <p style="color:#aaa;font-size:16px;">Điểm đã được lưu tự động. Bạn có thể vào Summary để xem tổng kết.</p>
      <a href="summary.html" style="display:inline-block;margin-top:20px;padding:14px 28px;background:var(--poke-yellow);color:#333;font-weight:bold;border-radius:14px;text-decoration:none;font-size:18px;">
        📊 Xem tổng kết
      </a>
    </div>
  `);
  document.getElementById("miniScore").textContent = "🏆 Xong!";
}

// ═══════════════════════════════════════════════════════════════════════════
// KHỞI ĐỘNG
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// KHỞI ĐỘNG
// ═══════════════════════════════════════════════════════════════════════════
(async function init() {
  await initVoice();

  setCard(`<div style="text-align:center;padding:40px;">
    <div style="font-size:48px;animation:bounce 0.8s ease infinite alternate;">📚</div>
    <p style="color:#aaa;margin-top:16px;">Đang tải dữ liệu...</p>
  </div>`);

  if (!wordBank.length) {
    setCard(`<div style="text-align:center;padding:40px;color:#ff6b6b;">
      ⚠️ Chưa có danh sách từ vựng (wordBank).<br/>
      <span style="color:#aaa;font-size:14px;">Hãy chọn từ ở trang danh sách từ trước.</span>
    </div>`);
    return;
  }

  try {
    vocabData = await fetchAllVocabData();
    if (vocabData.length) {
      const imgCacheKey = "img_prefetch_" + wordBank.length;
      if (!sessionStorage.getItem(imgCacheKey)) {
        const keywords = [...new Set(vocabData.flatMap(it => [it.imageKeyword, it.word].filter(Boolean).map(k=>k.toLowerCase().trim())))];
        await prefetchImagesBatch(keywords);
        sessionStorage.setItem(imgCacheKey, "1");
      }
    }
    await loadOverviewData();
  } catch(e) {
    console.error("init error:", e);
  }

  if (!vocabData.length) {
    setCard(`<div style="text-align:center;padding:40px;color:#ff6b6b;">
      ⚠️ Không tải được dữ liệu từ vựng. Kiểm tra kết nối mạng.
    </div>`);
    return;
  }

  // --- SỬA ĐOẠN NÀY ĐỂ KHÔNG HIỆN CHÀO KHI NHẢY BÀI ---
  const isJumping = localStorage.getItem("jump_to_stage_idx"); 

  if (!isJumping) {
    // Chỉ hiện màn chào nếu KHÔNG PHẢI đang thực hiện lệnh nhảy bài
    await showTransition("🎮","Bắt đầu PokéLearn All-in-One!",
      `Hôm nay bạn sẽ học ${vocabData.length} từ qua ${STAGES.length} hoạt động. Sẵn sàng chưa?`);
  }
  // ------------------------------------------------

  await runAllStages();
})();