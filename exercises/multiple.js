// ===== multipletuongtac.js =====
// Trắc nghiệm từ vựng tương tác webcam (MediaPipe Pose Landmarker)
// Mỗi đáp án = 1 động tác. Học sinh giữ động tác đủ thời gian => chốt đáp án.
// Dùng chung dữ liệu Sheet với global-config.js, imagecache2.js

// ===== Cột dữ liệu trong Sheet chính (SHEET_URL) =====
const APP_VERSION = "v8-giongdoc-kieuPKM";
console.log("multipletuongtac", APP_VERSION);
(function installErrorBanner() {
  const show = (msg) => {
    let b = document.getElementById("errBanner");
    if (!b) {
      b = document.createElement("div"); b.id = "errBanner";
      b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:999;background:#7f1d1d;color:#fff;font:13px/1.4 monospace;padding:8px 12px;max-height:30vh;overflow:auto;white-space:pre-wrap;";
      (document.body || document.documentElement).appendChild(b);
    }
    b.textContent = "⚠️ LỖI JS (chụp màn hình gửi mình): " + msg;
  };
  window.addEventListener("error", e => show(`${e.message} @ ${(e.filename || "").split("/").pop()}:${e.lineno}`));
  window.addEventListener("unhandledrejection", e => show("Promise: " + (e.reason && (e.reason.message || e.reason))));
})();
const COL = { lessonName: 1, vocab: 2, topic: 6, meaning: 24 };
const LOWER_BOUND_UNIT = 3011;

// ===== Cache config =====
const SHEET_CACHE_KEY = "multiple_sheet_rows";
const SHEET_CACHE_TIME_KEY = "multiple_sheet_rows_time";
const MAXCODE_CACHE_KEY = "multiple_max_lesson_code";
const MAXCODE_CACHE_TIME_KEY = "multiple_max_lesson_code_time";
const SHEET_CACHE_TTL_MS = 30 * 60 * 1000;

const QUESTION_PLACEHOLDER_IMG =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23f0f0f0"/%3E%3Ccircle cx="50" cy="40" r="15" fill="%23cccccc"/%3E%3Crect x="40" y="60" width="20" height="30" fill="%23cccccc"/%3E%3C/svg%3E';

const QUIZ_TYPES = ["en2vi", "vi2en", "img2en"];

// ===== Cấu hình MediaPipe =====
const MP_VERSION = "0.10.14";
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// ===== Động tác =====
// Tên gọi theo góc nhìn của học sinh. Webcam hiển thị lật gương nên "trái" nằm bên trái màn hình.
// l / r = đường vẽ cánh tay trái / phải của icon người que, hl / hr = tô đỏ nổi bật.
const AL = { up: "M30 28 L12 8", side: "M30 28 L6 28", down: "M30 28 L16 52" };
const AR = { up: "M30 28 L48 8", side: "M30 28 L54 28", down: "M30 28 L44 52" };
const GESTURES = [
  // 4 động tác cơ bản (bộ "cố định")
  { id: "leftUp",    name: "Giơ tay trái",              l: AL.up,   r: AR.down, hl: 1, hr: 0 },
  { id: "rightUp",   name: "Giơ tay phải",              l: AL.down, r: AR.up,   hl: 0, hr: 1 },
  { id: "both",      name: "Giơ hai tay",               l: AL.up,   r: AR.up,   hl: 1, hr: 1 },
  { id: "tpose",     name: "Dang ngang hai tay",        l: AL.side, r: AR.side, hl: 1, hr: 1 },
  // Động tác mở rộng
  { id: "headBoth",  name: "Hai tay đặt lên đầu",       l: "M30 28 L9 22 L22 8",  r: "M30 28 L51 22 L38 8",  hl: 1, hr: 1 },
  { id: "shoulders", name: "Hai tay đặt lên vai",       l: "M30 28 L10 36 L22 27", r: "M30 28 L50 36 L38 27", hl: 1, hr: 1 },
  { id: "cross",     name: "Khoanh tay trước ngực",     l: "M30 28 L24 42 L40 32", r: "M30 28 L36 42 L20 32", hl: 1, hr: 1 },
  { id: "hips",      name: "Hai tay chống hông",        l: "M30 28 L10 38 L23 49", r: "M30 28 L50 38 L37 49", hl: 1, hr: 1 },
  { id: "leftSide",  name: "Dang ngang tay trái",       l: AL.side, r: AR.down, hl: 1, hr: 0 },
  { id: "rightSide", name: "Dang ngang tay phải",       l: AL.down, r: AR.side, hl: 0, hr: 1 },
  { id: "leftUpRightSide", name: "Tay trái lên, tay phải ngang", l: AL.up,   r: AR.side, hl: 1, hr: 1 },
  { id: "rightUpLeftSide", name: "Tay phải lên, tay trái ngang", l: AL.side, r: AR.up,   hl: 1, hr: 1 }
];
const BASIC_COUNT = 4;
let gestureSet = "basic"; // "basic" = 4 động tác cố định A-D | "mixed" = ngẫu nhiên mỗi câu từ cả 12

function gesturePoolSize() { return gestureSet === "mixed" ? GESTURES.length : BASIC_COUNT; }
function pickGestures(n) {
  return gestureSet === "mixed" ? shuffleInPlace([...GESTURES]).slice(0, n) : GESTURES.slice(0, n);
}

const FEEDBACK_MS = 1400;     // thời gian hiện đúng/sai
const NEUTRAL_MS = 600;       // phải hạ tay trong từng này ms mới nhận câu tiếp
const FLICKER_GRACE_MS = 250; // cho phép nhận diện chớp tắt ngắn

// ===== State =====
let boundedRows = [];
let unboundedRows = [];
let currentQuestions = [];
let currentIndex = 0;
let score = 0;
let optionCount = 3;
let holdMs = 1500;

let poseLandmarker = null;
let poseLoading = null;
let drawingUtils = null;
let PoseLandmarkerClass = null;
let stream = null;
let rafId = null;
let lastVideoTime = -1;

// trạng thái vòng chơi: "ready" | "locked" | "waitNeutral"
let phase = "waitNeutral";
let neutralSince = null;
let holdGesture = null;   // index đáp án đang giữ
let holdStart = 0;
let holdLastSeen = 0;

// ===== UI refs =====
const $ = id => document.getElementById(id);
const setupArea = $("setupArea"), quizArea = $("quizArea"), resultArea = $("resultArea");
const lessonSelect = $("lessonSelect"), topicSelect = $("topicSelect");
const rangeRow = $("rangeRow"), rangeStartSelect = $("rangeStartSelect"), rangeEndSelect = $("rangeEndSelect");
const countSelect = $("countSelect"), optionCountSelect = $("optionCountSelect"), holdSelect = $("holdSelect");
const startBtn = $("startBtn"), refreshBtn = $("refreshBtn"), statusLine = $("statusLine");
const quitBtn = $("quitBtn"), restartBtn = $("restartBtn"), backToSetupBtn = $("backToSetupBtn");
const progressText = $("progressText"), scoreText = $("scoreText"), progressFill = $("progressFill");
const questionText = $("questionText"), questionImage = $("questionImage");
const optionsGrid = $("optionsGrid"), resultScore = $("resultScore");
const camVideo = $("camVideo"), camCanvas = $("camCanvas"), camMsg = $("camMsg"), gestureLabel = $("gestureLabel");

// ===== Init =====
document.addEventListener("DOMContentLoaded", init);

async function init() {
  document.title += " [" + APP_VERSION + "]";
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  $("testFxBtn").onclick = testFxAndVoice;
  bindControls();
  bindCameraControls();
  refreshCameras();
  status("Đang tải dữ liệu...");
  try {
    await loadAllData();
    status(`Sẵn sàng. Đã tải ${boundedRows.length} dòng dữ liệu. (bản ${APP_VERSION})`);
  } catch (e) {
    console.error("❌ Init error:", e);
    status("❌ Không thể tải dữ liệu.");
  }
  loadPose().catch(e => console.warn("⚠️ Chưa tải được model Pose:", e)); // tải nền
}

async function loadAllData() {
  // Không giới hạn bài theo lớp/grade: dùng tất cả các bài
  const rows = await fetchRows();
  unboundedRows = filterByUnitRange(rows, null);
  boundedRows = unboundedRows;

  buildLessonOptions(lessonSelect, boundedRows);
  buildTopicOptions(topicSelect, boundedRows);
  buildLessonOptions(rangeStartSelect, unboundedRows);
  buildLessonOptions(rangeEndSelect, unboundedRows);
  if (rangeEndSelect.options.length > 0) rangeEndSelect.selectedIndex = rangeEndSelect.options.length - 1;
}

function bindControls() {
  document.querySelectorAll('input[name="scopeMode"]').forEach(r => { r.onchange = updateScopeVisibility; });
  updateScopeVisibility();

  startBtn.onclick = startQuiz;
  refreshBtn.onclick = async () => {
    clearSheetCache();
    status("Đang tải lại dữ liệu mới nhất...");
    startBtn.disabled = true;
    try {
      await loadAllData();
      status(`Đã làm mới. ${boundedRows.length} dòng dữ liệu.`);
    } catch (e) {
      console.error(e);
      status("❌ Lỗi khi làm mới dữ liệu.");
    } finally {
      startBtn.disabled = false;
    }
  };

  quitBtn.onclick = () => showSetup();
  restartBtn.onclick = () => startQuiz();
  backToSetupBtn.onclick = () => showSetup();
}

function updateScopeVisibility() {
  const mode = getScopeMode();
  lessonSelect.style.display = mode === "lesson" ? "block" : "none";
  topicSelect.style.display = mode === "topic" ? "block" : "none";
  rangeRow.style.display = mode === "range" ? "flex" : "none";
}
function getScopeMode() { return document.querySelector('input[name="scopeMode"]:checked').value; }
function getQuizMode() { return document.querySelector('input[name="quizMode"]:checked').value; }

// ===== Dropdown =====
function buildLessonOptions(selectEl, rows) {
  const seen = new Map();
  rows.forEach(r => {
    const lessonName = safeStr(getCell(r, COL.lessonName)).trim();
    if (!lessonName) return;
    const unitNum = normalizeUnitId(lessonName);
    if (!unitNum) return;
    if (!seen.has(unitNum)) seen.set(unitNum, lessonName);
  });
  const entries = [...seen.entries()].sort((a, b) => a[0] - b[0]);
  selectEl.innerHTML = entries.map(([u, n]) => `<option value="${u}">${escapeHTML(n)}</option>`).join("");
}

function buildTopicOptions(selectEl, rows) {
  const topics = [...new Set(rows.map(r => safeStr(getCell(r, COL.topic)).trim()).filter(Boolean))];
  topics.sort();
  selectEl.innerHTML = topics.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
}

// ===== Bắt đầu =====
async function startQuiz() {
  const scopeMode = getScopeMode();
  const quizMode = getQuizMode();
  gestureSet = $("gestureSetSelect").value;
  optionCount = Math.min(parseInt(optionCountSelect.value, 10) || 3, gesturePoolSize());
  holdMs = parseInt(holdSelect.value, 10) || 1500;
  voiceOn = $("voiceToggle").checked;
  quizToken++;
  stopSpeech();
  audioCtx(); pickVoice();
  try { if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (e) { /* mở khoá TTS */ }

  let scopeRows;
  if (scopeMode === "lesson") {
    if (boundedRows.length === 0) { status("📭 Chưa có dữ liệu để làm bài."); return; }
    const unitNum = parseInt(lessonSelect.value, 10);
    if (!unitNum) { status("⚠️ Vui lòng chọn 1 bài."); return; }
    scopeRows = boundedRows.filter(r => normalizeUnitId(safeStr(getCell(r, COL.lessonName))) === unitNum);
  } else if (scopeMode === "topic") {
    if (boundedRows.length === 0) { status("📭 Chưa có dữ liệu để làm bài."); return; }
    const topic = topicSelect.value;
    if (!topic) { status("⚠️ Vui lòng chọn 1 chủ đề."); return; }
    scopeRows = boundedRows.filter(r => safeStr(getCell(r, COL.topic)).trim() === topic);
  } else {
    if (unboundedRows.length === 0) { status("📭 Chưa có dữ liệu để làm bài."); return; }
    let start = parseInt(rangeStartSelect.value, 10);
    let end = parseInt(rangeEndSelect.value, 10);
    if (!start || !end) { status("⚠️ Vui lòng chọn dãy bài."); return; }
    if (start > end) [start, end] = [end, start];
    scopeRows = unboundedRows.filter(r => {
      const u = normalizeUnitId(safeStr(getCell(r, COL.lessonName)));
      return u >= start && u <= end;
    });
  }

  const scopeItems = buildUniqueItems(scopeRows);
  if (scopeItems.length === 0) { status("📭 Không tìm thấy từ vựng phù hợp trong phạm vi này."); return; }

  const globalItems = buildUniqueItems(unboundedRows);
  let questions = buildQuizQuestions(scopeItems, globalItems, quizMode);

  const countValue = countSelect.value;
  if (countValue !== "all") questions = shuffleInPlace(questions).slice(0, parseInt(countValue, 10));

  currentQuestions = questions;
  currentIndex = 0;
  score = 0;

  showQuiz();
  startCamera(); // không await: câu hỏi hiện ngay, vẫn bấm chuột được nếu webcam lỗi
  renderQuestion();
}

function buildUniqueItems(rows) {
  const map = new Map();
  rows.forEach(r => {
    const vocab = safeStr(getCell(r, COL.vocab)).trim();
    const meaning = safeStr(getCell(r, COL.meaning)).trim();
    const lessonName = safeStr(getCell(r, COL.lessonName)).trim();
    const topic = safeStr(getCell(r, COL.topic)).trim();
    if (!vocab || !meaning) return;
    const firstVocab = splitTargets(vocab)[0] || vocab;
    if (!map.has(firstVocab)) map.set(firstVocab, { vocab: firstVocab, meaning, lessonName, topic });
  });
  return [...map.values()];
}

// ===== Sinh câu hỏi =====
function buildQuizQuestions(scopeItems, globalItems, mode) {
  const questions = scopeItems.map(item => {
    const qType = mode === "mixed" ? pickRandomType() : mode;
    const field = qType === "en2vi" ? "meaning" : "vocab";
    let type, promptText = "", promptImageVocab = null, correct;

    if (qType === "en2vi") { type = "text"; promptText = item.vocab; correct = item.meaning; }
    else if (qType === "vi2en") { type = "text"; promptText = item.meaning; correct = item.vocab; }
    else { type = "image"; promptImageVocab = item.vocab; correct = item.vocab; }

    const options = buildOptions(correct, field, scopeItems, globalItems);
    // Ngôn ngữ đọc: câu hỏi (qLang) và đáp án (aLang)
    const qLang = qType === "en2vi" ? "en-US" : qType === "vi2en" ? "vi-VN" : null;
    const aLang = qType === "en2vi" ? "vi-VN" : "en-US";
    const gestures = pickGestures(options.length);
    return { item, type, promptText, promptImageVocab, correct, options, qLang, aLang, gestures };
  });
  return shuffleInPlace(questions);
}

function pickRandomType() { return QUIZ_TYPES[Math.floor(Math.random() * QUIZ_TYPES.length)]; }

function buildOptions(correct, field, scopeItems, globalItems) {
  const need = optionCount - 1;
  const scopeValues = uniqueValues(scopeItems, field, correct);
  let distractors = shuffleInPlace(scopeValues).slice(0, need);
  if (distractors.length < need) {
    const globalValues = uniqueValues(globalItems, field, correct).filter(v => !distractors.includes(v));
    distractors = distractors.concat(shuffleInPlace(globalValues).slice(0, need - distractors.length));
  }
  return shuffleInPlace([correct, ...distractors]);
}

function uniqueValues(items, field, exclude) {
  return [...new Set(items.map(i => i[field]).filter(v => v && v !== exclude))];
}

// ===== Hiển thị =====
function showSetup() {
  quizToken++;
  stopSpeech();
  stopCamera();
  setupArea.style.display = "block";
  quizArea.style.display = "none";
  resultArea.style.display = "none";
}
function showQuiz() {
  setupArea.style.display = "none";
  quizArea.style.display = "block";
  resultArea.style.display = "none";
}
function showResult() {
  stopCamera();
  quizArea.style.display = "none";
  resultArea.style.display = "block";
  resultScore.textContent = `${score}/${currentQuestions.length}`;

  const total = currentQuestions.length || 1;
  const pct = score / total;
  const msg = pct >= 0.8 ? "Excellent!" : pct >= 0.5 ? "Great job!" : "Good try!";
  showCheer(msg, pct >= 0.5);
  sfx("win");
  if (pct >= 0.5) fireworks(pct >= 0.8 ? 12 : 6);
  speak(`${msg} You got ${score} out of ${total}.`, "en-US");
}

async function renderQuestion() {
  if (currentIndex >= currentQuestions.length) { showResult(); return; }

  const q = currentQuestions[currentIndex];
  progressText.textContent = `Câu ${currentIndex + 1}/${currentQuestions.length}`;
  scoreText.textContent = `Điểm: ${score}`;
  progressFill.style.width = `${(currentIndex / currentQuestions.length) * 100}%`;

  // Câu mới: phải hạ tay xuống rồi mới nhận động tác
  phase = "waitNeutral";
  neutralSince = null;
  resetHold();
  gestureLabel.textContent = "🙌 Hạ tay xuống để bắt đầu câu này";

  renderOptions(q);
  speakQuestion(q);

  if (q.type === "image") {
    questionText.style.display = "none";
    questionImage.style.display = "block";
    questionImage.src = QUESTION_PLACEHOLDER_IMG;
    try {
      const imageData = await imageCache.getImage(q.promptImageVocab);
      if (imageData && currentQuestions[currentIndex] === q) {
        questionImage.src = imageData.url;
        questionImage.alt = imageData.source ? `Ảnh từ ${imageData.source}` : "";
      }
    } catch (e) { console.error("❌ Lỗi load ảnh:", e); }
  } else {
    questionImage.style.display = "none";
    questionText.style.display = "block";
    questionText.textContent = q.promptText;
  }
}

function renderOptions(q) {
  optionsGrid.innerHTML = "";
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerHTML =
      `<div class="hold-fill"></div>` +
      `<div class="icon">${stickSVG(q.gestures[i])}</div>` +
      `<div class="label"><span class="gname">${q.gestures[i].name}</span>${escapeHTML(opt)}</div>`;
    btn.onclick = () => handleAnswer(i, q); // fallback chuột
    optionsGrid.appendChild(btn);
  });
}

async function handleAnswer(index, q) {
  if (phase === "locked") return;
  phase = "locked";
  resetHold();
  const token = quizToken;
  stopSpeech();

  const btns = [...optionsGrid.querySelectorAll(".option-btn")];
  btns.forEach(b => { b.disabled = true; b.querySelector(".hold-fill").style.width = "0%"; });

  const chosen = q.options[index];
  const isCorrect = chosen === q.correct;
  const cheerText = pickRandom(isCorrect ? CHEERS_RIGHT : CHEERS_WRONG);

  if (isCorrect) {
    score++;
    btns[index].classList.add("correct");
    gestureLabel.textContent = "✅ Chính xác!";
    fireworks(5);
    sfx("ok");
  } else {
    btns[index].classList.add("wrong");
    const ci = q.options.indexOf(q.correct);
    if (btns[ci]) btns[ci].classList.add("correct");
    gestureLabel.textContent = "❌ Chưa đúng";
    sfx("bad");
  }
  scoreText.textContent = `Điểm: ${score}`;
  showCheer(cheerText, isCorrect);

  // Đọc đáp án đã chọn -> lời khen -> (nếu sai) đọc đáp án đúng
  await speak(chosen, q.aLang);
  if (token !== quizToken) return;
  await speak(cheerText, "en-US");
  if (token !== quizToken) return;
  if (!isCorrect) {
    await speak(q.correct, q.aLang);
    if (token !== quizToken) return;
  }

  await sleep(voiceOn ? 600 : FEEDBACK_MS);
  if (token !== quizToken) return;
  currentIndex++;
  renderQuestion();
}

// ===== Giọng đọc (Web Speech API) =====
const CHEERS_RIGHT = ["Great!", "Excellent!", "Awesome!", "Perfect!", "Well done!", "Fantastic!", "Amazing!", "Super!"];
const CHEERS_WRONG = ["Good try!", "Don't give up!", "Almost!", "Keep going!"];

let voiceOn = true;
let quizToken = 0; // tăng khi thoát/bắt đầu lại để huỷ các bước chờ cũ

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function findVoice(lang) {
  const voices = speechSynthesis.getVoices();
  const want = lang.toLowerCase();
  const short = want.slice(0, 2);
  return voices.find(v => v.lang.replace("_", "-").toLowerCase() === want)
      || voices.find(v => v.lang.toLowerCase().startsWith(short)) || null;
}

let enVoice = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  enVoice = vs.find(v => /en[-_]US/i.test(v.lang) && /Google|Samantha|Zira|Aria|Jenny|Female/i.test(v.name))
    || vs.find(v => /en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
}

let curVI = null; // nguồn âm thanh tiếng Việt đang phát
function stopSpeech() {
  try { if (curVI) { curVI.stop(); curVI = null; } } catch (e) { /* bỏ qua */ }
  try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) { /* bỏ qua */ }
}

function speakEN(text, rate = 0.85) {
  return new Promise(resolve => {
    if (!("speechSynthesis" in window) || !text) return resolve();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = rate; if (enVoice) u.voice = enVoice;
      let done = false;
      const fin = () => { if (done) return; done = true; clearTimeout(t); resolve(); };
      const t = setTimeout(fin, Math.max((text.length * 140) / rate, 3500)); // cầu chì: onend đôi khi không bắn
      u.onend = fin; u.onerror = fin;
      speechSynthesis.speak(u);
    } catch (e) { resolve(); }
  });
}

// Tiếng Việt: dùng server TTS như PKM, dự phòng giọng của trình duyệt
const VI_TTS_BASE = "https://googlevoice-tinh.onrender.com";
const viCache = new Map();
let actx = null;
function audioCtx() {
  if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); }
  if (actx && actx.state === "suspended") actx.resume();
  return actx;
}
async function speakVI(text, speed = 0.9) {
  if (!text) return;
  try {
    const key = `${speed}|${text}`;
    let buf = viCache.get(key);
    if (!buf) {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      let res;
      try { res = await fetch(`${VI_TTS_BASE}/tts?q=${encodeURIComponent(text)}&speed=${speed}&lang=vi-VN&voice=`, { signal: ctrl.signal }); }
      finally { clearTimeout(to); }
      if (!res.ok) throw new Error("tts");
      buf = await audioCtx().decodeAudioData(await res.arrayBuffer());
      viCache.set(key, buf);
    }
    await new Promise(resolve => {
      const src = audioCtx().createBufferSource();
      src.buffer = buf; src.connect(audioCtx().destination); src.onended = resolve; curVI = src; src.start();
    });
  } catch (e) {
    if (!("speechSynthesis" in window)) return;
    await new Promise(resolve => {
      try {
        const u = new SpeechSynthesisUtterance(text); u.lang = "vi-VN"; u.rate = 0.9;
        const t = setTimeout(resolve, 4000); u.onend = u.onerror = () => { clearTimeout(t); resolve(); };
        speechSynthesis.speak(u);
      } catch (e2) { resolve(); }
    });
  }
}

function speak(text, lang) {
  if (!voiceOn || !text || !lang) return Promise.resolve();
  return String(lang).toLowerCase().startsWith("vi") ? speakVI(text) : speakEN(text);
}

// Hiệu ứng âm thanh bằng WebAudio (nghe được cả khi giọng đọc lỗi)
function tone(freq, t0, dur, type = "sine", vol = 0.16) {
  const c = audioCtx(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t = c.currentTime + t0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function sfx(name) {
  if (!voiceOn) return;
  try {
    if (name === "ok") { tone(659, 0, 0.12); tone(880, 0.1, 0.2); }
    else if (name === "bad") { tone(260, 0, 0.16, "triangle", 0.12); tone(200, 0.12, 0.2, "triangle", 0.1); }
    else if (name === "win") { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.3)); }
  } catch (e) { /* bỏ qua */ }
}

function speakQuestion(q) {
  if (q && q.type === "text") speak(q.promptText, q.qLang);
}

function testFxAndVoice() {
  voiceOn = $("voiceToggle").checked;
  stopSpeech();
  audioCtx(); pickVoice();
  showCheer("Excellent!", true);
  fireworks(6);
  sfx("ok");
  if (!("speechSynthesis" in window)) { status("⚠️ Trình duyệt này không hỗ trợ giọng đọc."); return; }
  const voices = speechSynthesis.getVoices();
  const hasVi = voices.some(v => v.lang.toLowerCase().startsWith("vi"));
  const hasEn = voices.some(v => v.lang.toLowerCase().startsWith("en"));
  status(`🔊 Có ${voices.length} giọng đọc | tiếng Anh: ${hasEn ? "có" : "KHÔNG"} | tiếng Việt: ${hasVi ? "có" : "KHÔNG"} | ${voiceOn ? "đang bật" : "đang TẮT (tick ô Âm thanh)"}`);
  speak("Excellent! Great job!", "en-US").then(() => speak("Xin chào các bạn", "vi-VN"));
}

$("speakBtn").onclick = () => {
  const q = currentQuestions[currentIndex];
  if (!q) return;
  stopSpeech();
  if (q.type === "text") speak(q.promptText, q.qLang);
  else speak(q.promptImageVocab, "en-US"); // dạng hình: bấm nghe mới đọc từ (hint)
};

// ===== Lời khen trên màn hình =====
let cheerTimer = null;
function showCheer(text, good) {
  const el = $("cheer");
  el.textContent = text;
  el.className = good ? "correct" : "wrong";
  void el.offsetWidth; // khởi động lại animation
  el.classList.add("show");
  clearTimeout(cheerTimer);
  cheerTimer = setTimeout(() => { el.className = ""; }, 1600);
}

// ===== Pháo hoa =====
const fx = { canvas: null, ctx: null, parts: [], running: false };

function burst(x, y) {
  const hue = Math.random() * 360;
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 6;
    fx.parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1, decay: 0.008 + Math.random() * 0.012,
      hue: hue + Math.random() * 50 - 25, size: 2 + Math.random() * 2
    });
  }
  startFx();
}

function fireworks(n) {
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      burst(window.innerWidth * (0.1 + Math.random() * 0.8), window.innerHeight * (0.1 + Math.random() * 0.5));
    }, i * 260);
  }
}

function startFx() {
  if (fx.running) return;
  fx.canvas = fx.canvas || $("fxCanvas");
  fx.canvas.width = window.innerWidth;
  fx.canvas.height = window.innerHeight;
  fx.ctx = fx.canvas.getContext("2d");
  fx.running = true;
  requestAnimationFrame(fxLoop);
}

function fxLoop() {
  const { ctx, canvas } = fx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  fx.parts = fx.parts.filter(p => p.life > 0);
  fx.parts.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.08; // trọng lực nhẹ
    p.life -= p.decay;
    ctx.beginPath();
    ctx.fillStyle = `hsla(${p.hue},100%,60%,${Math.max(p.life, 0)})`;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  if (fx.parts.length > 0) requestAnimationFrame(fxLoop);
  else { fx.running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
}

// ===== Icon người que =====
function stickSVG(g) {
  const c = "#1f2937", hi = "#dc2626";
  return `<svg viewBox="0 0 60 80" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="30" cy="14" r="8" stroke="${c}"/>
    <path d="M30 22 L30 50 M30 50 L20 74 M30 50 L40 74" stroke="${c}"/>
    <path d="${g.l}" stroke="${g.hl ? hi : c}"/><path d="${g.r}" stroke="${g.hr ? hi : c}"/></svg>`;
}

// ===== Webcam + MediaPipe =====
function loadPose() {
  if (poseLandmarker) return Promise.resolve(poseLandmarker);
  if (poseLoading) return poseLoading;
  poseLoading = (async () => {
    const mp = await import(MP_BUNDLE);
    const fileset = await mp.FilesetResolver.forVisionTasks(MP_WASM);
    PoseLandmarkerClass = mp.PoseLandmarker;
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MP_MODEL, delegate },
      runningMode: "VIDEO",
      numPoses: 1
    });
    try {
      poseLandmarker = await mp.PoseLandmarker.createFromOptions(fileset, opts("GPU"));
    } catch (e) {
      console.warn("GPU lỗi, chuyển sang CPU", e);
      poseLandmarker = await mp.PoseLandmarker.createFromOptions(fileset, opts("CPU"));
    }
    drawingUtils = new mp.DrawingUtils(camCanvas.getContext("2d"));
    return poseLandmarker;
  })();
  poseLoading.catch(() => { poseLoading = null; });
  return poseLoading;
}

// ----- Chọn / chuyển webcam -----
const CAM_KEY = "tuongtac_camId";
const camSelect = $("camSelect"), camSelectSetup = $("camSelectSetup");
const camRefreshBtn = $("camRefreshBtn"), camPermBtn = $("camPermBtn");
let camId = localStorage.getItem(CAM_KEY) || "auto"; // "auto" = ưu tiên webcam rời
let camDevices = [];
let autoLabel = "";
let camStartSeq = 0;

function quizVisible() { return quizArea.style.display === "block"; }

function noMediaDevices() { return !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia; }
function insecureText() {
  const f = window.top !== window.self ? " Bạn đang ở trong iframe (ví dụ khung Webview của Replit): bấm \"Open in a new tab\"." : "";
  return f + ` ⚠️ Trình duyệt đang chặn webcam vì trang mở bằng "${location.protocol}//${location.host || "(file)"}". ` +
         `Hãy mở bằng http://localhost:... hoặc https://... (không dùng file:// hay http://IP).`;
}

// Xếp hạng: 0 = webcam rời, 1 = webcam máy / chưa biết tên, 2 = camera ảo
function camRank(label) {
  if (/obs|virtual|droidcam|snap camera|manycam|epoccam|iriun|nvidia broadcast/i.test(label)) return 2;
  if (/integrated|built-?in|internal|facetime|laptop|truevision|ir camera|infrared|windows hello/i.test(label)) return 1;
  if (!label) return 1;
  return 0;
}
function rankedCamIds() {
  return camDevices
    .map((d, i) => ({ d, i, r: camRank(d.label) }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map(x => x.d.deviceId);
}

async function refreshCameras() {
  if (noMediaDevices()) {
    [camSelect, camSelectSetup].forEach(sel => { sel.innerHTML = `<option value="">Webcam bị chặn (cần https/localhost)</option>`; });
    console.warn("navigator.mediaDevices không tồn tại. isSecureContext =", window.isSecureContext);
    return;
  }
  try {
    camDevices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
    const autoText = "Tự động (ưu tiên webcam rời)" + (autoLabel ? " → " + autoLabel : "");
    const html = `<option value="auto">${escapeHTML(autoText)}</option>` + camDevices
      .map((d, i) => `<option value="${escapeHTML(d.deviceId)}">${escapeHTML(d.label || ("Webcam " + (i + 1)))}</option>`).join("");
    const saved = camId || localStorage.getItem(CAM_KEY) || "auto";
    const pick = (saved === "auto" || camDevices.some(d => d.deviceId === saved)) ? saved : "auto";
    [camSelect, camSelectSetup].forEach(sel => { sel.innerHTML = html; sel.value = pick; });
    camId = pick;
    console.log("📷 Webcam tìm thấy:", camDevices.map(d => d.label || "(chưa có tên)"));
  } catch (e) { console.warn("⚠️ Không liệt kê được webcam:", e); }
}

function setCamId(id) {
  camId = id || "";
  if (camId) localStorage.setItem(CAM_KEY, camId);
  camSelect.value = camId;
  camSelectSetup.value = camId;
}

function bindCameraControls() {
  camSelectSetup.onchange = () => setCamId(camSelectSetup.value);
  camSelect.onchange = () => { setCamId(camSelect.value); if (quizVisible()) startCamera(); };
  camRefreshBtn.onclick = async () => { await refreshCameras(); if (quizVisible()) startCamera(); };

  // Bấm để xin quyền một lần -> trình duyệt mới hiện tên đầy đủ của các webcam
  camPermBtn.onclick = async () => {
    if (noMediaDevices()) { status(insecureText()); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach(t => t.stop());
      await refreshCameras();
      status(`📷 Tìm thấy ${camSelectSetup.options.length} webcam.`);
    } catch (e) {
      status(`⚠️ Chưa mở được webcam: ${e.name || ""} ${e.message || ""}`);
    }
  };

  // Cắm / rút webcam rời
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", async () => {
      await refreshCameras();
      const live = stream && stream.getVideoTracks().some(t => t.readyState === "live");
      if (quizVisible() && !live) startCamera();
    });
  }
}

function camErrorText(e) {
  const inFrame = window.top !== window.self;
  const frameHint = inFrame ? " 👉 Bạn đang xem trong khung xem trước (iframe) nên bị chặn camera: hãy bấm \"Open in a new tab\" rồi chạy lại." : "";
  const code = (e ? `(${e.name || "Error"}: ${e.message || ""})` : "") + frameHint;
  switch (e && e.name) {
    case "NotAllowedError": return `⚠️ Trình duyệt chưa cho phép dùng webcam. Bấm biểu tượng ổ khoá cạnh thanh địa chỉ → cho phép Camera, rồi bấm 🔄. ${code}`;
    case "NotReadableError": return `⚠️ Webcam này đang bị ứng dụng khác dùng (Zoom, Teams, Camera của Windows, tab khác...) hoặc driver lỗi. Hãy tắt chúng rồi bấm 🔄. ${code}`;
    case "NotFoundError": return `⚠️ Không tìm thấy webcam nào. Kiểm tra cáp USB, thử cắm cổng khác. ${code}`;
    case "SecurityError": return `⚠️ Trang bị chặn quyền camera (Permissions-Policy / iframe). ${code}`;
    default: return `⚠️ Không bật được webcam. Bạn vẫn có thể bấm chuột chọn đáp án. ${code}`;
  }
}

async function startCamera() {
  const seq = ++camStartSeq;
  stopCamera();
  camMsg.style.display = "flex";
  if (noMediaDevices()) { camMsg.textContent = insecureText(); return; }
  camMsg.textContent = "Đang bật webcam...";
  const gum = async (id) => {
    const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
    return navigator.mediaDevices.getUserMedia({
      video: id ? { ...base, deviceId: { exact: id } } : { ...base, facingMode: "user" },
      audio: false
    });
  };
  try {
    let order;
    if (camId === "auto") {
      // Chưa biết tên webcam (chưa cấp quyền) -> mở thử 1 lần để trình duyệt cho đọc tên
      await refreshCameras();
      if (camDevices.length && camDevices.every(d => !d.label)) {
        const probe = await gum("");
        probe.getTracks().forEach(t => t.stop());
        await refreshCameras();
      }
      order = rankedCamIds().filter(Boolean);
      if (!order.length) order = [""];
    } else {
      order = [camId];
    }

    // Thử lần lượt: webcam rời -> webcam máy -> camera ảo
    let s = null, lastErr = null;
    for (const id of order) {
      try { s = await gum(id); break; }
      catch (e) {
        lastErr = e;
        console.warn("Mở webcam thất bại:", id, e.name, e.message);
        if (e.name === "NotAllowedError" || e.name === "SecurityError") break;
      }
    }
    if (!s && camId !== "auto" && lastErr && lastErr.name !== "NotAllowedError" && lastErr.name !== "NotReadableError") {
      s = await gum(""); // webcam đã chọn không còn -> webcam mặc định
    }
    if (!s) throw lastErr || new Error("Không mở được webcam");

    if (seq !== camStartSeq) { s.getTracks().forEach(t => t.stop()); return; }
    stream = s;
    camVideo.srcObject = s;
    await camVideo.play();

    const track = s.getVideoTracks()[0];
    const actualId = track && track.getSettings().deviceId;
    autoLabel = track ? track.label : "";
    await refreshCameras();           // lúc này đã có tên webcam
    if (camId !== "auto" && actualId) setCamId(actualId);
    console.log("🎥 Đang dùng webcam:", autoLabel);

    camMsg.textContent = "Đang tải mô hình nhận diện...";
    await loadPose();
    if (seq !== camStartSeq) return;
    camMsg.style.display = "none";
    lastVideoTime = -1;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(detectLoop);
  } catch (e) {
    if (seq !== camStartSeq) return;
    console.error("❌ Webcam/Pose lỗi:", e);
    camMsg.style.display = "flex";
    camMsg.textContent = camErrorText(e);
  }
}

function stopCamera() {
  cancelAnimationFrame(rafId);
  rafId = null;
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  camVideo.srcObject = null;
}

function detectLoop() {
  rafId = requestAnimationFrame(detectLoop);
  if (!poseLandmarker || camVideo.readyState < 2) return;
  if (camVideo.currentTime === lastVideoTime) return;
  lastVideoTime = camVideo.currentTime;

  const now = performance.now();
  const result = poseLandmarker.detectForVideo(camVideo, now);

  // vẽ khung xương
  if (camCanvas.width !== camVideo.videoWidth) {
    camCanvas.width = camVideo.videoWidth;
    camCanvas.height = camVideo.videoHeight;
  }
  const ctx = camCanvas.getContext("2d");
  ctx.clearRect(0, 0, camCanvas.width, camCanvas.height);
  const lm = result.landmarks && result.landmarks[0];
  if (lm && drawingUtils) {
    drawingUtils.drawConnectors(lm, PoseLandmarkerClass.POSE_CONNECTIONS, { color: "#22d3ee", lineWidth: 5 });
    drawingUtils.drawLandmarks(lm, { color: "#fde047", radius: 4 });
  }

  processPose(lm, now);
}

// Trả về id động tác, "none" (đang đứng yên / hạ tay) hoặc null (không thấy người)
function classifyPose(lm) {
  if (!lm) return null;
  const nose = lm[0], ls = lm[11], rs = lm[12], le = lm[13], re = lm[14];
  const lw = lm[15], rw = lm[16], lh = lm[23], rh = lm[24];
  const vis = p => !!p && (p.visibility == null ? 1 : p.visibility) > 0.5;
  if (!vis(ls) || !vis(rs)) return null;

  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y) || 0.1;       // bề ngang vai để chuẩn hoá
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / sw;
  const sign = ls.x >= rs.x ? 1 : -1;                            // hướng "ra ngoài" của bên trái
  const sy = (ls.y + rs.y) / 2;

  const raised = (w, s) => vis(w) && w.y < s.y - 0.5 * sw;
  const level  = (w, s) => vis(w) && Math.abs(w.y - s.y) < 0.35 * sw && Math.abs(w.x - s.x) > 1.0 * sw;
  const down   = (w, s) => !vis(w) || w.y > s.y + 0.6 * sw;

  const L = raised(lw, ls), R = raised(rw, rs);
  const Ls = level(lw, ls), Rs = level(rw, rs);

  // 1) Hai tay đặt lên đầu (kiểm tra trước "giơ hai tay")
  if (vis(nose) && vis(lw) && vis(rw) &&
      d(lw, nose) < 0.8 && d(rw, nose) < 0.8 &&
      lw.y > nose.y - 0.6 * sw && rw.y > nose.y - 0.6 * sw) return "headBoth";

  // 2) Giơ tay
  if (L && R) return "both";
  if (L && Rs) return "leftUpRightSide";
  if (R && Ls) return "rightUpLeftSide";
  if (L && !R) return "leftUp";
  if (R && !L) return "rightUp";

  // 3) Dang ngang
  if (Ls && Rs) return "tpose";

  // 4) Tay đặt lên vai
  if (vis(lw) && vis(rw) && d(lw, ls) < 0.55 && d(rw, rs) < 0.55) return "shoulders";

  // 5) Khoanh tay: hai cổ tay bắt chéo ở ngang ngực
  if (vis(lw) && vis(rw) &&
      (lw.x - rw.x) * sign < -0.15 * sw &&
      lw.y > sy - 0.2 * sw && lw.y < sy + 1.5 * sw &&
      rw.y > sy - 0.2 * sw && rw.y < sy + 1.5 * sw) return "cross";

  // 6) Chống hông: cổ tay gần hông và khuỷu tay chìa ra ngoài (để khác với đứng thả tay)
  if (vis(lh) && vis(rh) && vis(lw) && vis(rw) && vis(le) && vis(re) &&
      d(lw, lh) < 0.8 && d(rw, rh) < 0.8 &&
      (le.x - ls.x) * sign > 0.7 * sw &&
      (re.x - rs.x) * -sign > 0.7 * sw) return "hips";

  // 7) Dang ngang một tay, tay kia thả xuống
  if (Ls && down(rw, rs)) return "leftSide";
  if (Rs && down(lw, ls)) return "rightSide";

  return "none";
}

function processPose(lm, now) {
  if (quizArea.style.display === "none") return;
  const q = currentQuestions[currentIndex];
  if (!q) return;

  const g = classifyPose(lm);

  if (phase === "locked") return;

  if (g === null) {
    gestureLabel.textContent = "👀 Chưa thấy người trong khung hình";
    resetHold();
    neutralSince = null;
    return;
  }

  // Chờ học sinh hạ tay
  if (phase === "waitNeutral") {
    if (g === "none") {
      if (neutralSince == null) neutralSince = now;
      if (now - neutralSince >= NEUTRAL_MS) {
        phase = "ready";
        gestureLabel.textContent = "🙋 Làm động tác để chọn đáp án";
      }
    } else {
      neutralSince = null;
    }
    return;
  }

  // phase === "ready"
  const idx = q.gestures.findIndex(x => x.id === g);
  if (idx < 0) {
    if (holdGesture !== null && now - holdLastSeen > FLICKER_GRACE_MS) resetHold();
    if (holdGesture === null) gestureLabel.textContent = "🙋 Làm động tác để chọn đáp án";
    return;
  }

  if (idx === holdGesture) {
    holdLastSeen = now;
  } else if (holdGesture === null || now - holdLastSeen > FLICKER_GRACE_MS) {
    resetHold();
    holdGesture = idx;
    holdStart = now;
    holdLastSeen = now;
  } else {
    return;
  }

  const pct = Math.min(100, ((now - holdStart) / holdMs) * 100);
  const btns = optionsGrid.querySelectorAll(".option-btn");
  btns.forEach((b, i) => {
    b.querySelector(".hold-fill").style.width = i === idx ? pct + "%" : "0%";
    b.classList.toggle("dim", i !== idx);
  });
  gestureLabel.textContent = `${q.gestures[idx].name} → giữ nguyên...`;

  if (pct >= 100) handleAnswer(idx, q);
}

function resetHold() {
  holdGesture = null;
  optionsGrid.querySelectorAll(".option-btn").forEach(b => {
    const f = b.querySelector(".hold-fill");
    if (f) f.style.width = "0%";
    b.classList.remove("dim");
  });
}

// ===== Fetch + cache =====
async function fetchRows() {
  const cached = readCache(SHEET_CACHE_KEY, SHEET_CACHE_TIME_KEY);
  if (cached.hit) return cached.value;
  const res = await fetch(SHEET_URL, { cache: "no-store" });
  const data = await res.json();
  const rows = data.rows || data;
  writeCache(SHEET_CACHE_KEY, SHEET_CACHE_TIME_KEY, rows);
  return rows;
}

function readCache(key, timeKey) {
  try {
    const raw = localStorage.getItem(key);
    const t = parseInt(localStorage.getItem(timeKey) || "0", 10);
    if (raw === null || Date.now() - t > SHEET_CACHE_TTL_MS) return { hit: false };
    return { hit: true, value: JSON.parse(raw).v };
  } catch (e) { return { hit: false }; }
}

function writeCache(key, timeKey, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ v: value }));
    localStorage.setItem(timeKey, Date.now().toString());
  } catch (e) { console.warn("⚠️ Không thể lưu cache:", e); }
}

function clearSheetCache() {
  [SHEET_CACHE_KEY, SHEET_CACHE_TIME_KEY, MAXCODE_CACHE_KEY, MAXCODE_CACHE_TIME_KEY]
    .forEach(k => localStorage.removeItem(k));
}

function getCell(r, idx) {
  return r && r.c ? (r.c[idx] ? r.c[idx].v : null) : (r ? r[idx] : null);
}

function filterByUnitRange(rows, maxLessonCode) {
  return rows.filter(r => {
    const lessonName = safeStr(getCell(r, COL.lessonName)).trim();
    const unitNum = normalizeUnitId(lessonName);
    if (!unitNum) return false;
    return unitNum >= LOWER_BOUND_UNIT && (maxLessonCode ? unitNum <= maxLessonCode : true);
  });
}

// ===== Utilities =====
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.toString().trim().split("-");
  if (parts.length < 3) return 0;
  const c = parseInt(parts[0], 10), l = parseInt(parts[1], 10), p = parseInt(parts[2], 10);
  if (Number.isNaN(c) || Number.isNaN(l) || Number.isNaN(p)) return 0;
  return c * 1000 + l * 10 + p;
}

function splitTargets(rawTarget) {
  return (rawTarget || "").split(/[,/;|]/).map(t => t.trim()).filter(Boolean);
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function safeStr(v) { return v == null ? "" : String(v); }

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function status(msg) { statusLine.textContent = msg || ""; }
