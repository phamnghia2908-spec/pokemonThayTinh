/**
 * ============================================================================
 * module-1-intro.js — MODULE 1: GIỚI THIỆU TỪ VỰNG (bản v4 — sửa 3 lỗi)
 * ============================================================================
 * SỬA SO VỚI BẢN TRƯỚC:
 *  1. mascotSpeak/mascotSpeakVI: log lỗi rõ ràng + dự phòng giọng trình duyệt
 *     khi googlevoice-tinh lỗi (trước đây tiếng Việt im lặng hoàn toàn không
 *     dấu vết khi server TTS ngoài bị lỗi).
 *  2. Nền giờ PHỦ TOÀN MÀN HÌNH (position:fixed, z-index:-1) thay vì chỉ nằm
 *     trong khung .intro-scene. Header/thanh progress (có z-index cao sẵn từ
 *     all.html) vẫn nổi lên trên để bấm chuyển module bình thường.
 *  3. Dễ/Trung bình/Khó giờ ĐỒNG NHẤT: đều đọc AH (phần Anh qua trình duyệt,
 *     phần Việt qua googlevoice-tinh) và AI (toàn bộ tiếng Việt) — không còn
 *     phân tầng "Dễ chỉ đọc nghĩa, TB thêm AH, Khó thêm AI" như trước.
 *
 * (speakEN trong all-shared.js cũng cần sửa riêng — xem hướng dẫn kèm theo,
 * vì đó là nguyên nhân chính khiến nút "Nói" đôi khi không tự bật.)
 * ============================================================================
 */

import {
  LEVELS, speakEN, speakVI, askMCQ, buildDistractors, shuffle, randomPick,
  createScoreTracker, recordQuestionPassed, saveIntroResult, showTransition,
  updateMiniScore, getImageFromMap, injectSharedStyles,
  startRecording, transcribeAudio, POSITIVE_FEEDBACK, ENCOURAGE_RETRY,
  getEnglishRateForLevel,
} from "./all-shared.js";

// ============================================================================
// A. DANH SÁCH NHÂN VẬT + HẠ TẦNG LIVE2D
// ============================================================================

const INTRO_BASE = "https://raw.githubusercontent.com/ninjavanxuantruong/Open-LLM-VTuber-main/main/";
const INTRO_CHAR_LIST = [
  ["Chitose",         "live2d-models/Chitose/runtime/chitose.model3.json"],
  ["Haruto",          "live2d-models/haruto/runtime/haruto.model3.json"],
  ["Hibiki",          "live2d-models/Hibiki/runtime/hibiki.model3.json"],
  ["Hiyori",          "live2d-models/hiyori_free/runtime/hiyori_free_t08.model3.json"],
  ["Izumi",           "live2d-models/Izumi/runtime/izumi_illust.model3.json"],
  ["Kei",             "live2d-models/kei_basic_free/runtime/kei_basic_free.model3.json"],
  ["Koharu",          "live2d-models/koharu/runtime/koharu.model3.json"],
  ["Mao",             "live2d-models/mao_pro/runtime/mao_pro.model3.json"],
  ["Mark-kun",        "live2d-models/Mark-kun/runtime/mark_free_t04.model3.json"],
  ["Shizuku",         "live2d-models/shizuku/runtime/shizuku.model3.json"],
  ["Tororo",          "live2d-models/tororo/runtime/tororo.model3.json"],
  ["Unity-chan",      "live2d-models/Unity-chan/runtime/unitychan.model3.json"],
  ["Nito",            "live2d-models/Nito/runtime/nito.model3.json"],
  ["Hijiki",          "live2d-models/hijiki/runtime/hijiki.model3.json"],
];

const TTS_BASE = "https://googlevoice-tinh.onrender.com";
let audioCtx = null;
const audioCache = new Map();
/** Chạy 1 Promise, nếu quá `ms` mili-giây chưa xong thì coi như thất bại (trả về fallbackValue) thay vì treo mãi. */
function withTimeout(promise, ms, fallbackValue = null) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
document.addEventListener("touchstart", () => getAudioCtx(), { once: true });
document.addEventListener("mousedown", () => getAudioCtx(), { once: true });

async function fetchMascotAudio(text, lang = "en-US", speed = 0.9) {
  const key = `${lang}|${speed}|${text}`;
  if (audioCache.has(key)) return audioCache.get(key);
  const url = `${TTS_BASE}/tts?q=${encodeURIComponent(text)}&speed=${speed}&lang=${encodeURIComponent(lang)}&voice=`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("TTS fail: HTTP " + res.status);
  const ab = await res.arrayBuffer();
  const buf = await getAudioCtx().decodeAudioData(ab);
  audioCache.set(key, buf);
  return buf;
}

/** Đọc bằng giọng trình duyệt, có timeout an toàn (không treo nếu onend không bắn). */
function browserSpeakFallback(text, lang, rate) {
  return new Promise(resolve => {
    const voices = window.speechSynthesis.getVoices();
    let voice = null;
    if (lang.startsWith("vi")) {
      voice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith("vi"));
      if (!voice) { resolve(); return; } // máy không có giọng VN nào -> bỏ qua, không kẹt
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; if (voice) u.voice = voice; u.rate = rate;
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(safety); resolve(); };
    const safety = setTimeout(finish, Math.max((text.length * 130) / rate, 3000));
    u.onend = finish; u.onerror = finish;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

let pixiApp = null;
let liveModel = null;
let lipRAF = null;

async function ensurePixiApp(canvas) {
  if (pixiApp) return;
  try { PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker); } catch (e) { /* đã đăng ký rồi */ }
  pixiApp = new PIXI.Application({ view: canvas, autoStart: true, backgroundAlpha: 0 });
}

function fitModel(slotEl) {
  if (!liveModel || !pixiApp || !slotEl) return;
  const W = slotEl.clientWidth, H = slotEl.clientHeight;
  if (!W || !H) return;
  pixiApp.renderer.resize(W, H);
  const sc = Math.min(W / liveModel.internalModel.originalWidth, H / liveModel.internalModel.originalHeight) * 0.9;
  liveModel.scale.set(sc);
  liveModel.x = W / 2 - liveModel.width / 2;
  liveModel.y = H / 2 - liveModel.height / 2 + 8;
}

async function loadMascotModel(charInfo, canvas, slotEl) {
  if (!window.PIXI?.live2d) return;
  await ensurePixiApp(canvas);
  try {
    const url = INTRO_BASE + charInfo[1].split("/").map(encodeURIComponent).join("/").replace(/%2F/g, "/");
    const model = await PIXI.live2d.Live2DModel.from(url);
    liveModel = model;
    pixiApp.stage.addChild(model);
    fitModel(slotEl);
    try { model.motion("idle"); } catch (e) { /* không có idle motion thì thôi */ }
  } catch (e) {
    console.error("Lỗi tải mascot:", e);
  }
}

function destroyMascotModel() {
  if (liveModel) { try { pixiApp?.stage.removeChild(liveModel); liveModel.destroy(); } catch (e) { /**/ } liveModel = null; }
  if (pixiApp) { try { pixiApp.destroy(true); } catch (e) { /**/ } pixiApp = null; }
}

function startLipSync(barsEl) {
  if (barsEl) barsEl.classList.add("active");
  const barEls = barsEl ? barsEl.querySelectorAll(".ibar") : [];
  let t = 0;
  const loop = () => {
    t += 1 / 60;
    const vol = Math.max(0, Math.min(1, 0.5 + 0.5 * Math.sin(t * 3.8 * Math.PI * 2) + (Math.random() - 0.5) * 0.3));
    if (liveModel) {
      try {
        const core = liveModel.internalModel.coreModel;
        if (core.setParameterValueById) core.setParameterValueById("ParamMouthOpenY", vol);
        else if (core.setParamFloat) core.setParamFloat("PARAM_MOUTH_OPEN_Y", vol);
      } catch (e) { /* model không có param này */ }
    }
    barEls.forEach((b, i) => {
      const off = Math.abs(3 - i) / 3;
      b.style.height = Math.max(2, vol * (1 - off * 0.5) * 20 + Math.random() * 3) + "px";
    });
    lipRAF = requestAnimationFrame(loop);
  };
  lipRAF = requestAnimationFrame(loop);
}
function stopLipSync(barsEl) {
  if (lipRAF) { cancelAnimationFrame(lipRAF); lipRAF = null; }
  if (barsEl) { barsEl.classList.remove("active"); barsEl.querySelectorAll(".ibar").forEach(b => b.style.height = "2px"); }
  if (liveModel) {
    try {
      const core = liveModel.internalModel.coreModel;
      if (core.setParameterValueById) core.setParameterValueById("ParamMouthOpenY", 0);
      else if (core.setParamFloat) core.setParamFloat("PARAM_MOUTH_OPEN_Y", 0);
    } catch (e) { /* bỏ qua */ }
  }
}

/** Mascot nói tiếng Anh + lipsync. Lỗi googlevoice-tinh -> log rõ + dự phòng giọng trình duyệt (có timeout an toàn). */
async function mascotSpeak(text, speed = 0.85) {
  if (!text) return;
  const barsEl = document.getElementById("introBars");
  try {
    const buf = await fetchMascotAudio(text, "en-US", speed);
    const ac = getAudioCtx();
    const src = ac.createBufferSource();
    src.buffer = buf; src.connect(ac.destination);
    startLipSync(barsEl);
    src.start();
    await new Promise(r => { src.onended = r; });
  } catch (e) {
    console.error("mascotSpeak: googlevoice-tinh lỗi, dùng giọng trình duyệt:", e);
    startLipSync(barsEl);
    await browserSpeakFallback(text, "en-US", speed);
  }
  stopLipSync(barsEl);
}

/** Mascot nói tiếng Việt qua googlevoice-tinh + lipsync. Lỗi -> log rõ + dự phòng giọng VN trình duyệt nếu máy có. */
async function mascotSpeakVI(text, speed = 0.9) {
  if (!text) return;
  const barsEl = document.getElementById("introBars");
  try {
    const buf = await fetchMascotAudio(text, "vi-VN", speed);
    const ac = getAudioCtx();
    const src = ac.createBufferSource();
    src.buffer = buf; src.connect(ac.destination);
    startLipSync(barsEl);
    src.start();
    await new Promise(r => { src.onended = r; });
  } catch (e) {
    console.error("mascotSpeakVI: googlevoice-tinh lỗi (tiếng Việt), thử giọng VN trình duyệt:", e);
    startLipSync(barsEl);
    await browserSpeakFallback(text, "vi-VN", speed);
  }
  stopLipSync(barsEl);
}

// ============================================================================
// A2. ÂM VỊ (IPA) — đọc TỪNG ÂM khi tách âm
// ============================================================================

async function preloadIpa(ipa) {
  const key = "ipa|" + ipa;
  if (audioCache.has(key)) return audioCache.get(key);
  try {
    const url = `https://cdn.jsdelivr.net/gh/ninjavanxuantruong/mp3vietnam2@main/${ipa}.mp3`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // tối đa 5s chờ mạng
    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = await getAudioCtx().decodeAudioData(ab.slice(0));
    audioCache.set(key, buf);
    return buf;
  } catch (e) { return null; }
}

async function playIpa(ipa) {
  const buf = await preloadIpa(ipa);
  if (!buf) return;
  return new Promise(resolve => {
    const ac = getAudioCtx();
    const src = ac.createBufferSource();
    src.buffer = buf; src.connect(ac.destination);
    src.onended = resolve;
    setTimeout(resolve, buf.duration * 1000 + 400);
    src.start();
  });
}

async function autoReadPhonics(container) {
  const units = Array.from(container.querySelectorAll("[data-index]"));
  if (!units.length) return;
  const getIpa = u => u.querySelector("small")?.innerText.replace(/\//g, "").trim() || "";

  const allIpa = [];
  units.forEach(u => u.querySelectorAll(".sound-unit:not(.silent)").forEach(su => {
    const ipa = getIpa(su); if (ipa) allIpa.push(ipa);
  }));
  await Promise.all(allIpa.map(preloadIpa));

  for (const unit of units) {
    unit.classList.add("ph-unit-active");
    const sus = Array.from(unit.querySelectorAll(".sound-unit:not(.silent)"));
    for (const su of sus) {
      const ipa = getIpa(su);
      su.style.cssText += `border:2px solid #e74c3c!important;background:rgba(231,76,60,.3)!important;box-shadow:0 0 12px rgba(231,76,60,.8)!important;transform:scale(1.2);transition:all .15s;`;
      if (ipa) await playIpa(ipa); else await new Promise(r => setTimeout(r, 300));
      su.style.cssText = su.style.cssText
        .replace(/border:[^;]+;/, "").replace(/background:[^;]+;/, "")
        .replace(/box-shadow:[^;]+;/, "").replace(/transform:[^;]+;/, "");
      await new Promise(r => setTimeout(r, 80));
    }
    unit.classList.remove("ph-unit-active");
    await new Promise(r => setTimeout(r, 300));
  }
}

// ============================================================================
// B. NỀN ẢNH NGẪU NHIÊN — GIỜ PHỦ TOÀN MÀN HÌNH (fixed, z-index thấp nhất)
// ============================================================================

const INTRO_BG_COUNT = 10;
const INTRO_BG_BASE = "https://cdn.jsdelivr.net/gh/ninjavanxuantruong/mp3vietnam2@main/";
const DEFAULT_BG_CSS = "linear-gradient(180deg,#d6e4f0 0%,#c8dbe8 55%,#b5a98a 55%,#a8976e 100%)";

let fullscreenBgEl = null;

/** Tạo (nếu chưa có) lớp nền cố định phủ TOÀN VIEWPORT, nằm sau mọi thứ khác trên trang. */
function ensureFullscreenBg() {
  if (fullscreenBgEl) return fullscreenBgEl;
  fullscreenBgEl = document.createElement("div");
  fullscreenBgEl.id = "pklFullscreenBg";
  fullscreenBgEl.style.cssText = `
    position:fixed; inset:0; z-index:-1;
    background-image:${DEFAULT_BG_CSS}; background-size:cover; background-position:center;
    transition:background-image .5s ease;
  `;
  document.body.appendChild(fullscreenBgEl);
  return fullscreenBgEl;
}

function removeFullscreenBg() {
  if (fullscreenBgEl) { fullscreenBgEl.remove(); fullscreenBgEl = null; }
}

function applyRandomBackground(bgEl) {
  const n = Math.floor(Math.random() * INTRO_BG_COUNT) + 1;
  const url = `${INTRO_BG_BASE}pm%20(${n}).jpg`;
  const img = new Image();
  img.onload = () => {
    bgEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,.15),rgba(0,0,0,.15)), url('${url}')`;
  };
  img.onerror = () => { /* chưa có ảnh nền -> giữ nguyên gradient mặc định đã đặt sẵn */ };
  img.src = url;
}

// ============================================================================
// C. STYLE RIÊNG CỦA MODULE 1
// ============================================================================

function injectModule1Styles() {
  if (document.getElementById("pkl-m1-style")) return;
  const style = document.createElement("style");
  style.id = "pkl-m1-style";
  style.textContent = `
    /* Khi đang ở bước 1-3 (giới thiệu/tách âm/nói theo) -> bỏ khung card mặc định
       để nền toàn màn hình lộ ra, mascot+bảng nổi trực tiếp trên nền. */
    #mainCard.pkl-fullscreen-mode {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
    }
    .intro-scene {
      display:flex; flex-direction:row; align-items:flex-end; border-radius:16px;
      overflow:hidden; min-height:300px; position:relative;
      background: transparent; /* nền thật sự đến từ lớp #pklFullscreenBg phía sau toàn trang */
    }
    @media (max-width:600px){ .intro-scene{ flex-direction:column; align-items:center; min-height:unset; } }
    .intro-char-slot { position:relative; width:190px; height:280px; flex-shrink:0; }
    @media (max-width:600px){ .intro-char-slot{ width:100%; height:180px; } }
    .intro-char-slot canvas { position:absolute; inset:0; width:100%; height:100%; }
    .intro-lipsync-bars {
      position:absolute; bottom:20px; left:50%; transform:translateX(-50%);
      display:flex; gap:3px; align-items:flex-end; height:18px; opacity:0; transition:opacity .3s; z-index:5;
    }
    .intro-lipsync-bars.active { opacity:1; }
    .intro-lipsync-bars .ibar { width:4px; min-height:2px; border-radius:2px; transition:height .08s; }
    .intro-whiteboard {
      flex:1; background:rgba(255,255,255,.96); border:3px solid #bbb; border-radius:8px;
      box-shadow:2px 4px 16px rgba(0,0,0,.25); padding:16px; display:flex; flex-direction:column;
      align-items:center; gap:8px; min-height:260px; justify-content:center; margin:10px; color:#333;
    }
    @media (max-width:600px){ .intro-whiteboard{ width:calc(100% - 16px); min-height:220px; margin:8px; } }
    .word-tap { cursor:pointer; padding:2px 6px; border-radius:6px; transition:background .15s; display:inline-block; }
    .word-tap:active { background:rgba(0,0,0,.1); }
    .pkl-char-grid {
      display:grid; grid-template-columns:repeat(auto-fill,minmax(90px,1fr)); gap:8px;
      max-height:50vh; overflow-y:auto; padding:4px;
    }
    .pkl-char-item {
      padding:10px 6px; border-radius:10px; cursor:pointer; text-align:center;
      border:2px solid rgba(255,255,255,.15); background:rgba(255,255,255,.05); color:#ccc;
      font-size:13px; transition:all .15s;
    }
    .pkl-char-item.selected { border-color:#2ecc71; background:rgba(46,204,113,.15); color:#2ecc71; font-weight:700; }
    .pkl-ah-block { font-size:13px; color:#e67e22; background:#fff3e0; padding:4px 10px; border-radius:6px; width:100%; text-align:center; }
    .pkl-ai-block { font-size:13px; color:#2980b9; background:#e8f4fd; padding:4px 10px; border-radius:6px; width:100%; text-align:center; }
    .ph-unit-active { background: rgba(231,76,60,.1) !important; border-radius:8px; }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// D. CHỌN NHÂN VẬT (chỉ hỏi 1 lần / buổi học)
// ============================================================================

async function pickMascotIfNeeded(rootEl) {
  injectModule1Styles();
  const saved = localStorage.getItem("selected_instructor_idx");
  if (saved !== null) return INTRO_CHAR_LIST[parseInt(saved, 10)] || INTRO_CHAR_LIST[0];

  return new Promise(resolve => {
    let sel = 0;
    const render = () => {
      rootEl.innerHTML = `
        <div style="text-align:center;color:#FFCB05;font-weight:700;margin-bottom:10px;">
          🌸 Choose your teacher for today!
        </div>
        <div class="pkl-char-grid">
          ${INTRO_CHAR_LIST.map((c, i) => `
            <div class="pkl-char-item ${i === sel ? "selected" : ""}" data-i="${i}">${i === sel ? "✔ " : ""}${c[0]}</div>
          `).join("")}
        </div>
        <div style="text-align:center;margin-top:14px;">
          <button class="poke-btn yellow" id="pklStartWithChar">▶ Start with ${INTRO_CHAR_LIST[sel][0]}</button>
        </div>`;
      rootEl.querySelectorAll(".pkl-char-item").forEach(el => {
        el.onclick = () => { sel = parseInt(el.dataset.i, 10); render(); };
      });
      rootEl.querySelector("#pklStartWithChar").onclick = () => {
        localStorage.setItem("selected_instructor_idx", String(sel));
        resolve(INTRO_CHAR_LIST[sel]);
      };
    };
    render();
  });
}

// ============================================================================
// E. BỂ CÂU NÓI ĐA DẠNG
// ============================================================================

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
  (ord, w) => `Here comes the ${ord} word: ${w}!`,
];
const INTRO_CLOSING = [
  `Great job! Now let's check what you remember!`,
  `Wonderful! Time for a quick check!`,
  `Well done! Let's see how much you remember!`,
];
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

function checkPercentMatchLocal(heard, target, threshold = 70) {
  const clean = s => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const h = clean(heard), t = clean(target);
  if (!t.length) return false;
  const correct = t.filter(w => h.includes(w)).length;
  return Math.round((correct / t.length) * 100) >= threshold;
}

/** Tách "English : Vietnamese" (cột AH) thành 2 phần. Không có ":" -> coi là toàn tiếng Việt. */
function parseAH(noteAH) {
  if (!noteAH) return null;
  const idx = noteAH.indexOf(":");
  if (idx === -1) return { en: "", vi: noteAH.trim() };
  return { en: noteAH.slice(0, idx).trim(), vi: noteAH.slice(idx + 1).trim() };
}

// ============================================================================
// F. DỰNG KHUNG CẢNH 1 LẦN DUY NHẤT (nền toàn màn hình + mascot)
// ============================================================================

async function setupPersistentScene(rootEl, charInfo) {
  const bgEl = ensureFullscreenBg();
  applyRandomBackground(bgEl);
  rootEl.classList.add("pkl-fullscreen-mode");

  rootEl.innerHTML = `
    <div class="intro-scene" id="pklScene">
      <div class="intro-char-slot" id="introSlot">
        <canvas id="introCanvas"></canvas>
        <div id="introBars" class="intro-lipsync-bars">
          ${[0, 1, 2, 3, 4, 5, 6].map(() => `<div class="ibar" style="background:#27ae60;"></div>`).join("")}
        </div>
      </div>
      <div class="intro-whiteboard"><div id="pklStepContent" style="width:100%;"></div></div>
    </div>`;

  const canvas = document.getElementById("introCanvas");
  const slotEl = document.getElementById("introSlot");
  await loadMascotModel(charInfo, canvas, slotEl);

  return document.getElementById("pklStepContent");
}

/** Gọi khi rời khỏi Bước 1-3 (sang Bước 4 hoặc kết thúc module) — dọn mascot + nền toàn màn hình. */
function teardownScene(rootEl) {
  destroyMascotModel();
  removeFullscreenBg();
  rootEl.classList.remove("pkl-fullscreen-mode");
}

// ============================================================================
// G. ĐIỀU KHIỂN NEXT / REDO DÙNG CHUNG CHO 3 BƯỚC
// ============================================================================

function renderStepControls(wrapEl) {
  return new Promise(resolve => {
    wrapEl.innerHTML = `
      <div style="text-align:center;margin-top:14px;display:flex;gap:10px;justify-content:center;">
        <button class="poke-btn gray" id="pklStepRedo">🔄 Redo</button>
        <button class="poke-btn yellow" id="pklStepNext">▶ Next</button>
      </div>`;
    wrapEl.querySelector("#pklStepRedo").onclick = () => resolve("redo");
    wrapEl.querySelector("#pklStepNext").onclick = () => resolve("next");
  });
}

// ============================================================================
// H. BƯỚC 1 — GIỚI THIỆU TỪ
// ============================================================================
// Dễ/Trung bình/Khó giờ ĐỒNG NHẤT: đều đọc AH (Anh qua trình duyệt, Việt qua
// googlevoice-tinh) và AI (toàn bộ tiếng Việt) — không còn phân theo cấp độ.

async function stepIntroForWord(contentEl, w, level, rate, wordIndex) {
  const isMamNon = level === LEVELS.MAM_NON;
  const ah = !isMamNon ? parseAH(w.noteAH) : null;
  const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
  const ord = ORDINALS[wordIndex] || `${wordIndex + 1}th`;

  while (true) {
    contentEl.innerHTML = `
      <div style="width:100%;display:flex;flex-direction:column;align-items:center;gap:8px;">
        ${imgSrc ? `<img src="${imgSrc}" style="height:${isMamNon ? "140px" : "100px"};max-width:90%;object-fit:contain;border-radius:10px;border:1px solid #eee;"/>` : ""}
        <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;">
          ${w.word.split(" ").map(p => `<span class="word-tap" data-w="${p}" style="font-size:26px;font-weight:800;color:#1a1a2e;">${p.toUpperCase()}</span>`).join(" ")}
        </div>
        <div style="font-size:16px;color:#555;background:#f5f5f5;padding:5px 12px;border-radius:6px;">${w.meaning || ""}</div>
        ${ah ? `<div class="pkl-ah-block">💡 ${w.noteAH}</div>` : ""}
        ${(!isMamNon && w.noteAI) ? `<div class="pkl-ai-block">✨ ${w.noteAI}</div>` : ""}
      </div>
      <div id="pklStepControlsWrap"></div>`;

    contentEl.querySelectorAll(".word-tap").forEach(span => {
      span.onclick = () => speakEN(span.dataset.w, 0.5);
    });

    await mascotSpeak(randomPick(INTRO_WORD_LINES)(ord, w.word), rate);
    await mascotSpeak(w.word, rate);
    await mascotSpeakVI(w.meaning, 0.9);

    // Dễ/TB/Khó: đọc đồng nhất AH (Anh + Việt) và AI (Việt) — không phân tầng nữa
    if (ah) {
      if (ah.en) await mascotSpeak(ah.en, rate);
      if (ah.vi) await mascotSpeakVI(ah.vi, 0.9);
    }
    if (!isMamNon && w.noteAI) {
      await mascotSpeakVI(w.noteAI, 0.9);
    }

    const controlsWrap = document.getElementById("pklStepControlsWrap");
    const choice = await renderStepControls(controlsWrap);
    if (choice === "next") break;
  }
}

// ============================================================================
// I. BƯỚC 2 — TÁCH ÂM (trừ Mầm non)
// ============================================================================

async function stepPhonicsForWord(contentEl, w, rate) {
  while (true) {
    contentEl.innerHTML = `
      <div style="text-align:center;width:100%;">
        <div style="font-size:26px;font-weight:800;color:#FFCB05;margin-bottom:10px;">${w.word.toUpperCase()}</div>
        <div id="pklPhonicsBox" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;min-height:50px;"></div>
      </div>
      <div id="pklStepControlsWrap"></div>`;

    const box = document.getElementById("pklPhonicsBox");
    const controlsWrap = document.getElementById("pklStepControlsWrap");

    // Chạy tiến trình đọc KHÔNG await ở đây — để không bị khoá cả luồng nếu
    // 1 bước nào đó bên trong bị treo trên 1 số máy/trình duyệt.
    (async () => {
        if (window.handleSplit) {
          try {
            await withTimeout(
              Promise.resolve(window.handleSplit(w.word.trim().toLowerCase(), box, null)),
              5000
            );
            await withTimeout(autoReadPhonics(box), 8000);
            await withTimeout(speakEN(w.word, rate), 5000);
          } catch (e) {
            console.error("Lỗi tách âm:", e);
            box.innerHTML = `<p style="color:#999;font-size:13px;">(không tách âm được cho "${w.word}")</p>`;
          }
        } else {
        box.innerHTML = `<p style="color:#999;font-size:13px;">(chưa nạp được công cụ tách âm — kiểm tra tacham.js)</p>`;
      }
    })();

    // Sau 3s, HIỆN LUÔN nút Redo/Next có sẵn — không đợi đọc xong. Nếu máy bị
    // treo ở bước đọc, người dùng vẫn bấm Next/Redo để thoát ra bình thường.
    await new Promise(r => setTimeout(r, 3000));

    const choice = await renderStepControls(controlsWrap);
    if (choice === "next") break;
  }
}

// ============================================================================
// J. BƯỚC 3 — NÓI THEO
// ============================================================================

function buildRepeatModel(w, level) {
  if (level === LEVELS.MAM_NON) return { modelText: w.word, matchText: w.word, veryLenient: true };
  if (level === LEVELS.DE) { const s = w.presentSent || w.word; return { modelText: s, matchText: s, veryLenient: false }; }
  if (level === LEVELS.TRUNG_BINH) { const s = `${w.word}. ${w.presentSent || ""}`.trim(); return { modelText: s, matchText: s, veryLenient: false }; }
  const s = `${w.word}. ${w.question || ""} ${w.answerRaw || ""}`.trim();
  return { modelText: s, matchText: s, veryLenient: false };
}

function runRepeatOnce(contentEl, cfg) {
  const { modelText, matchText, veryLenient, rate, imageUrl } = cfg;

  return new Promise(async resolve => {
    let attemptNum = 0;
    let finished = false;

    contentEl.innerHTML = `
      <div style="text-align:center;width:100%;">
        ${imageUrl ? `<img id="pklRepeatImg" src="${imageUrl}" style="height:110px;border-radius:10px;cursor:pointer;" title="Tap to listen again"/>` : ""}
        <div style="color:#aaa;font-size:13px;margin:10px 0;" id="pklRepeatStatus">🔊 Listen...</div>
        <div style="text-align:center;">
          <div class="mic-ring" id="pklRepeatMic" style="opacity:.4;pointer-events:none;">🎤</div>
        </div>
        <div style="text-align:center;margin-top:10px;">
          <button class="poke-btn green" id="pklRepeatFinish" style="display:none;">✅ Finish</button>
        </div>
        <div class="pkl-speak-result" id="pklRepeatResult"></div>
      </div>`;

    const imgEl = document.getElementById("pklRepeatImg");
    const statusEl = document.getElementById("pklRepeatStatus");
    const micEl = document.getElementById("pklRepeatMic");
    const finishBtn = document.getElementById("pklRepeatFinish");
    const resultEl = document.getElementById("pklRepeatResult");

    const lockMic = (locked) => {
      micEl.style.pointerEvents = locked ? "none" : "auto";
      micEl.style.opacity = locked ? ".4" : "1";
    };

    const playModel = async () => {
      lockMic(true);
      statusEl.textContent = "🔊 Listen...";
      if (veryLenient) {
        await speakEN(`${matchText}. ${matchText}. ${matchText}.`, rate);
      } else {
        await speakEN(modelText, rate);
      }
      if (!finished && attemptNum < 2) {
        statusEl.textContent = "🎤 Now it's your turn!";
        lockMic(false);
      }
    };

    if (imgEl) {
      imgEl.onclick = async () => {
        if (micEl.classList.contains("listening") || finished) return;
        await playModel();
      };
    }

    const doRecord = async () => {
      lockMic(true);
      attemptNum++;
      micEl.classList.add("listening");
      statusEl.textContent = "🎙️ Recording...";
      finishBtn.style.display = "inline-block";

      try {
        const session = await startRecording(10000);
        finishBtn.onclick = () => session.stop();
        const blob = await session.blob;

        finishBtn.style.display = "none";
        micEl.classList.remove("listening");
        statusEl.textContent = "⏳ Checking...";

        const transcript = await transcribeAudio(blob);
        const isCorrect = transcript === null ? false
          : veryLenient ? !!transcript.trim()
          : checkPercentMatchLocal(transcript, matchText, 70);

        resultEl.innerHTML = transcript ? `🗣️ "<b>${transcript}</b>"` : "🗣️ (didn't hear anything clearly)";

        if (isCorrect) {
          finished = true;
          statusEl.textContent = "🎉 " + randomPick(POSITIVE_FEEDBACK);
          await speakEN(randomPick(POSITIVE_FEEDBACK), rate);
          resolve(true);
        } else if (attemptNum < 2) {
          statusEl.textContent = "💡 " + randomPick(ENCOURAGE_RETRY);
          lockMic(false);
        } else {
          finished = true;
          statusEl.textContent = "👍 Good try!";
          await new Promise(r => setTimeout(r, 1000));
          resolve(false);
        }
      } catch (e) {
        console.error("Lỗi ghi âm:", e);
        finished = true;
        micEl.classList.remove("listening");
        finishBtn.style.display = "none";
        statusEl.textContent = "⚠️ Microphone not available.";
        await new Promise(r => setTimeout(r, 1000));
        resolve(false);
      }
    };

    micEl.onclick = () => {
      if (attemptNum >= 2 || finished || micEl.classList.contains("listening")) return;
      doRecord();
    };

    await playModel(); // TTS đọc mẫu trước tiên, xong tự mở nút Nói
  });
}

async function stepRepeatForWord(contentEl, w, level, rate, tracker) {
  const { modelText, matchText, veryLenient } = buildRepeatModel(w, level);
  const imageUrl = getImageFromMap(w.imageKeyword || w.word) || "";
  let lastScored = false;

  while (true) {
    lastScored = await runRepeatOnce(contentEl, { modelText, matchText, veryLenient, rate, imageUrl });

    const controlsWrap = document.createElement("div");
    contentEl.appendChild(controlsWrap);
    const choice = await renderStepControls(controlsWrap);
    if (choice === "next") break;
  }

  recordQuestionPassed(tracker, lastScored ? 1 : 2);
  updateMiniScore(tracker.displayScore, tracker.total);
}

// ============================================================================
// K. VÒNG LẶP 3 BƯỚC CHO 1 TỪ
// ============================================================================

async function runWordCycle(contentEl, w, level, rate, tracker, wordIndex) {
  await stepIntroForWord(contentEl, w, level, rate, wordIndex);
  if (level !== LEVELS.MAM_NON) {
    await stepPhonicsForWord(contentEl, w, rate);
  }
  await stepRepeatForWord(contentEl, w, level, rate, tracker);
}

// ============================================================================
// L. BƯỚC 4 — QUIZ NHẬN BIẾT NGHĨA (không mascot, không nền)
// ============================================================================

async function stage4_MamNon(rootEl, w, sessionVocab, poolData, tracker, rate) {
  const others = sessionVocab.filter(x => x.word !== w.word);
  const distractorWords = buildDistractors(w, others, { field: "word", count: 2, extra: poolData });
  const options = shuffle([w.word, ...distractorWords]).map(val => {
    const found = [w, ...sessionVocab, ...poolData].find(p => p.word === val) || w;
    return { label: "", speakText: val, value: val, imageUrl: getImageFromMap(found.imageKeyword || val) || "" };
  });
  const attempts = await askMCQ({
    container: rootEl,
    instructionKey: "intro-mamnon-quiz",
    instructionText: "Listen and tap the correct picture!",
    questionHTML: `<div style="font-size:40px;">🔊</div>`,
    options, correctValue: w.word,
    speakPromptText: w.word, rate,
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function stage4_De(rootEl, w, poolData, sessionVocab, tracker, rate) {
  const distractors = buildDistractors(w, poolData, { field: "meaning", count: 3, extra: sessionVocab });
  const attempts = await askMCQ({
    container: rootEl,
    instructionKey: "intro-de-quiz",
    instructionText: "What does this word mean?",
    questionHTML: `<div style="font-size:26px;font-weight:800;color:#FFCB05;">${w.word.toUpperCase()}</div>`,
    options: shuffle([w.meaning, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.meaning,
    speakPromptText: w.word, rate,
    optionLang: "vi", promptLang: "en",
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function stage4_TB(rootEl, w, poolData, sessionVocab, tracker, rate) {
  const distractors = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab });
  const attempts = await askMCQ({
    container: rootEl,
    instructionKey: "intro-tb-quiz",
    instructionText: "Which word matches this meaning?",
    questionHTML: `<div style="font-size:22px;color:#ffd54f;">${w.meaning}</div>`,
    options: shuffle([w.word, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.word,
    speakPromptText: w.meaning, rate,
    optionLang: "en", promptLang: "vi",
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function stage4_Kho(rootEl, w, poolData, sessionVocab, tracker, rate) {
  if (!w.noteAI) { await stage4_De(rootEl, w, poolData, sessionVocab, tracker, rate); return; }
  const usablePool = poolData.filter(p => p.noteAI);
  const usableSession = sessionVocab.filter(p => p.noteAI && p.word !== w.word);
  const distractors = buildDistractors(w, usablePool, { field: "noteAI", count: 3, extra: usableSession });
  const attempts = await askMCQ({
    container: rootEl,
    instructionKey: "intro-kho-quiz",
    instructionText: "Which pun sentence uses this word?",
    questionHTML: `<div style="font-size:26px;font-weight:800;color:#FFCB05;">${w.word.toUpperCase()}</div>`,
    options: shuffle([w.noteAI, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.noteAI,
    speakPromptText: w.word, rate,
    optionLang: "vi", promptLang: "en",
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function runStage4(rootEl, sessionVocab, poolData, level, tracker) {
  const rate = getEnglishRateForLevel(level);
  for (const w of sessionVocab) {
    if (level === LEVELS.MAM_NON) await stage4_MamNon(rootEl, w, sessionVocab, poolData, tracker, rate);
    else if (level === LEVELS.DE) await stage4_De(rootEl, w, poolData, sessionVocab, tracker, rate);
    else if (level === LEVELS.TRUNG_BINH) await stage4_TB(rootEl, w, poolData, sessionVocab, tracker, rate);
    else await stage4_Kho(rootEl, w, poolData, sessionVocab, tracker, rate);
  }
}

// ============================================================================
// M. HÀM CHÍNH — export để orchestrator gọi
// ============================================================================

export async function runIntroModule(ctx) {
  const { sessionVocab, poolData, level, rootEl } = ctx;
  injectSharedStyles();
  injectModule1Styles();

  const charInfo = await pickMascotIfNeeded(rootEl);

  const contentEl = await setupPersistentScene(rootEl, charInfo);

  const rate = getEnglishRateForLevel(level);
  const tracker = createScoreTracker();

  const scriptLines = randomPick(INTRO_SCRIPTS)(charInfo[0], sessionVocab.length);
  for (const line of scriptLines) await mascotSpeak(line, rate);

  for (let i = 0; i < sessionVocab.length; i++) {
    await runWordCycle(contentEl, sessionVocab[i], level, rate, tracker, i);
  }

  await mascotSpeak(randomPick(INTRO_CLOSING), rate);
  teardownScene(rootEl); // Sang Bước 4 -> bỏ hẳn mascot + nền toàn màn hình

  await showTransition("🧠", "Quick check!", "Let's see if you remember the meanings!");
  await runStage4(rootEl, sessionVocab, poolData, level, tracker);

// mới
  saveIntroResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Awesome!", "You've learned all the new words today!");
  return { assessScore: tracker.assessScore, assessTotal: tracker.total };
}