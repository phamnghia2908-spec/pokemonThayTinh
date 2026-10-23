// ===== multiple.js =====
// Trắc nghiệm từ vựng: Anh->Việt / Việt->Anh / Hình ảnh->Anh / Hỗn hợp
// Phạm vi: theo bài / theo chủ đề / theo dãy bài (không giới hạn maxLessonCode)
// Dùng chung dữ liệu Sheet với global-config.js, imagecache2.js

// ===== Cột dữ liệu trong Sheet chính (SHEET_URL) =====
const COL = {
  lessonName: 1,   // B
  vocab: 2,        // C
  topic: 6,        // G
  meaning: 24      // Y
};

const LOWER_BOUND_UNIT = 3011;

// ===== Cache config =====
const SHEET_CACHE_KEY = "multiple_sheet_rows";
const SHEET_CACHE_TIME_KEY = "multiple_sheet_rows_time";
const MAXCODE_CACHE_KEY = "multiple_max_lesson_code";
const MAXCODE_CACHE_TIME_KEY = "multiple_max_lesson_code_time";
const SHEET_CACHE_TTL_MS = 30 * 60 * 1000; // 30 phút

const QUESTION_PLACEHOLDER_IMG =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23f0f0f0"/%3E%3Ccircle cx="50" cy="40" r="15" fill="%23cccccc"/%3E%3Crect x="40" y="60" width="20" height="30" fill="%23cccccc"/%3E%3C/svg%3E';

const QUIZ_TYPES = ["en2vi", "vi2en", "img2en"];

// ===== State =====
let boundedRows = [];    // lọc theo LOWER_BOUND_UNIT..maxLessonCode (dùng cho "theo bài" / "theo chủ đề")
let unboundedRows = [];  // chỉ lọc theo LOWER_BOUND_UNIT, KHÔNG giới hạn maxLessonCode (dùng cho "theo dãy bài")
let currentQuestions = [];
let currentIndex = 0;
let score = 0;

// ===== UI refs =====
const setupArea = document.getElementById("setupArea");
const quizArea = document.getElementById("quizArea");
const resultArea = document.getElementById("resultArea");

const lessonSelect = document.getElementById("lessonSelect");
const topicSelect = document.getElementById("topicSelect");
const rangeRow = document.getElementById("rangeRow");
const rangeStartSelect = document.getElementById("rangeStartSelect");
const rangeEndSelect = document.getElementById("rangeEndSelect");
const countSelect = document.getElementById("countSelect");

const startBtn = document.getElementById("startBtn");
const refreshBtn = document.getElementById("refreshBtn");
const statusLine = document.getElementById("statusLine");
const quitBtn = document.getElementById("quitBtn");
const restartBtn = document.getElementById("restartBtn");
const backToSetupBtn = document.getElementById("backToSetupBtn");

const progressText = document.getElementById("progressText");
const scoreText = document.getElementById("scoreText");
const progressFill = document.getElementById("progressFill");
const questionText = document.getElementById("questionText");
const questionImage = document.getElementById("questionImage");
const optionsGrid = document.getElementById("optionsGrid");
const resultScore = document.getElementById("resultScore");

// ===== Init =====
document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindControls();
  status("Đang tải dữ liệu...");
  try {
    await loadAllData();
    status(`Sẵn sàng. Đã tải ${boundedRows.length} dòng dữ liệu (trong giới hạn).`);
  } catch (e) {
    console.error("❌ Init error:", e);
    status("❌ Không thể tải dữ liệu.");
  }
}

async function loadAllData() {
  const maxLessonCode = await getMaxLessonCode();
  const rows = await fetchRows();
  boundedRows = filterByUnitRange(rows, maxLessonCode);
  unboundedRows = filterByUnitRange(rows, null);

  buildLessonOptions(lessonSelect, boundedRows);
  buildTopicOptions(topicSelect, boundedRows);
  buildLessonOptions(rangeStartSelect, unboundedRows);
  buildLessonOptions(rangeEndSelect, unboundedRows);
  if (rangeEndSelect.options.length > 0) {
    rangeEndSelect.selectedIndex = rangeEndSelect.options.length - 1;
  }
}

function bindControls() {
  document.querySelectorAll('input[name="scopeMode"]').forEach(r => {
    r.onchange = updateScopeVisibility;
  });
  updateScopeVisibility();

  startBtn.onclick = startQuiz;
  refreshBtn.onclick = async () => {
    clearSheetCache();
    status("Đang tải lại dữ liệu mới nhất...");
    startBtn.disabled = true;
    try {
      await loadAllData();
      status(`Đã làm mới. ${boundedRows.length} dòng dữ liệu (trong giới hạn).`);
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

function getScopeMode() {
  return document.querySelector('input[name="scopeMode"]:checked').value;
}
function getQuizMode() {
  return document.querySelector('input[name="quizMode"]:checked').value;
}

// ===== Xây danh sách dropdown =====
function buildLessonOptions(selectEl, rows) {
  const seen = new Map(); // unitNum -> lessonName
  rows.forEach(r => {
    const lessonName = safeStr(getCell(r, COL.lessonName)).trim();
    if (!lessonName) return;
    const unitNum = normalizeUnitId(lessonName);
    if (!unitNum) return;
    if (!seen.has(unitNum)) seen.set(unitNum, lessonName);
  });
  const entries = [...seen.entries()].sort((a, b) => a[0] - b[0]);
  selectEl.innerHTML = entries
    .map(([unitNum, name]) => `<option value="${unitNum}">${escapeHTML(name)}</option>`)
    .join("");
}

function buildTopicOptions(selectEl, rows) {
  const topics = [...new Set(rows.map(r => safeStr(getCell(r, COL.topic)).trim()).filter(Boolean))];
  topics.sort();
  selectEl.innerHTML = topics
    .map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`)
    .join("");
}

// ===== Bắt đầu bài trắc nghiệm =====
async function startQuiz() {
  const scopeMode = getScopeMode();
  const quizMode = getQuizMode();

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
  } else { // range - không giới hạn maxLessonCode
    if (unboundedRows.length === 0) { status("📭 Chưa có dữ liệu để làm bài."); return; }
    let start = parseInt(rangeStartSelect.value, 10);
    let end = parseInt(rangeEndSelect.value, 10);
    if (!start || !end) { status("⚠️ Vui lòng chọn dãy bài."); return; }
    if (start > end) { [start, end] = [end, start]; }
    scopeRows = unboundedRows.filter(r => {
      const u = normalizeUnitId(safeStr(getCell(r, COL.lessonName)));
      return u >= start && u <= end;
    });
  }

  const scopeItems = buildUniqueItems(scopeRows);
  if (scopeItems.length === 0) {
    status("📭 Không tìm thấy từ vựng phù hợp trong phạm vi này.");
    return;
  }

  // Nguồn từ để lấy đáp án nhiễu khi phạm vi không đủ: luôn dùng toàn bộ dữ liệu không giới hạn
  const globalItems = buildUniqueItems(unboundedRows);

  let questions = buildQuizQuestions(scopeItems, globalItems, quizMode);

  const countValue = countSelect.value;
  if (countValue !== "all") {
    const n = parseInt(countValue, 10);
    questions = shuffleInPlace(questions).slice(0, n);
  }

  currentQuestions = questions;
  currentIndex = 0;
  score = 0;

  showQuiz();
  renderQuestion();
}

// Gom theo vocab duy nhất -> {vocab, meaning, lessonName, topic}
function buildUniqueItems(rows) {
  const map = new Map();
  rows.forEach(r => {
    const vocab = safeStr(getCell(r, COL.vocab)).trim();
    const meaning = safeStr(getCell(r, COL.meaning)).trim();
    const lessonName = safeStr(getCell(r, COL.lessonName)).trim();
    const topic = safeStr(getCell(r, COL.topic)).trim();
    if (!vocab || !meaning) return;
    const firstVocab = splitTargets(vocab)[0] || vocab;
    if (!map.has(firstVocab)) {
      map.set(firstVocab, { vocab: firstVocab, meaning, lessonName, topic });
    }
  });
  return [...map.values()];
}

// ===== Sinh câu hỏi trắc nghiệm =====
function buildQuizQuestions(scopeItems, globalItems, mode) {
  const questions = scopeItems.map(item => {
    const qType = mode === "mixed" ? pickRandomType() : mode;
    const field = qType === "en2vi" ? "meaning" : "vocab";

    let type, promptText = "", promptImageVocab = null, correct;

    if (qType === "en2vi") {
      type = "text";
      promptText = item.vocab;
      correct = item.meaning;
    } else if (qType === "vi2en") {
      type = "text";
      promptText = item.meaning;
      correct = item.vocab;
    } else { // img2en
      type = "image";
      promptImageVocab = item.vocab;
      correct = item.vocab;
    }

    const options = buildOptions(correct, field, scopeItems, globalItems);

    return { item, type, promptText, promptImageVocab, correct, options };
  });
  return shuffleInPlace(questions);
}

function pickRandomType() {
  return QUIZ_TYPES[Math.floor(Math.random() * QUIZ_TYPES.length)];
}

function buildOptions(correct, field, scopeItems, globalItems) {
  const scopeValues = uniqueValues(scopeItems, field, correct);
  let distractors = shuffleInPlace(scopeValues).slice(0, 3);

  if (distractors.length < 3) {
    const globalValues = uniqueValues(globalItems, field, correct).filter(v => !distractors.includes(v));
    distractors = distractors.concat(shuffleInPlace(globalValues).slice(0, 3 - distractors.length));
  }

  return shuffleInPlace([correct, ...distractors]);
}

function uniqueValues(items, field, exclude) {
  return [...new Set(items.map(i => i[field]).filter(v => v && v !== exclude))];
}

// ===== Hiển thị / điều hướng UI =====
function showSetup() {
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
  quizArea.style.display = "none";
  resultArea.style.display = "block";
  resultScore.textContent = `${score}/${currentQuestions.length}`;
}

async function renderQuestion() {
  if (currentIndex >= currentQuestions.length) {
    showResult();
    return;
  }

  const q = currentQuestions[currentIndex];
  progressText.textContent = `Câu ${currentIndex + 1}/${currentQuestions.length}`;
  scoreText.textContent = `Điểm: ${score}`;
  progressFill.style.width = `${(currentIndex / currentQuestions.length) * 100}%`;

  if (q.type === "image") {
    questionText.style.display = "none";
    questionImage.style.display = "block";
    questionImage.src = QUESTION_PLACEHOLDER_IMG;
    try {
      const imageData = await imageCache.getImage(q.promptImageVocab);
      if (imageData) {
        questionImage.src = imageData.url;
        questionImage.alt = imageData.source ? `Ảnh từ ${imageData.source}` : "";
      }
    } catch (e) {
      console.error("❌ Lỗi load ảnh:", e);
    }
  } else {
    questionImage.style.display = "none";
    questionText.style.display = "block";
    questionText.textContent = q.promptText;
  }

  renderOptions(q);
}

function renderOptions(q) {
  optionsGrid.innerHTML = "";
  q.options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt;
    btn.onclick = () => handleAnswer(btn, opt, q);
    optionsGrid.appendChild(btn);
  });
}

function handleAnswer(clickedBtn, chosen, q) {
  const allBtns = optionsGrid.querySelectorAll(".option-btn");
  allBtns.forEach(b => (b.disabled = true));

  const isCorrect = chosen === q.correct;
  if (isCorrect) {
    score++;
    clickedBtn.classList.add("correct");
  } else {
    clickedBtn.classList.add("wrong");
    allBtns.forEach(b => {
      if (b.textContent === q.correct) b.classList.add("correct");
    });
  }

  scoreText.textContent = `Điểm: ${score}`;

  setTimeout(() => {
    currentIndex++;
    renderQuestion();
  }, 1100);
}

// ===== GViz / Exec fetch + cache localStorage =====
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
  } catch (e) {
    return { hit: false };
  }
}

function writeCache(key, timeKey, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ v: value }));
    localStorage.setItem(timeKey, Date.now().toString());
  } catch (e) {
    console.warn("⚠️ Không thể lưu cache:", e);
  }
}

function clearSheetCache() {
  [SHEET_CACHE_KEY, SHEET_CACHE_TIME_KEY, MAXCODE_CACHE_KEY, MAXCODE_CACHE_TIME_KEY]
    .forEach(k => localStorage.removeItem(k));
}

function getCell(r, idx) {
  return r && r.c ? (r.c[idx] ? r.c[idx].v : null) : (r ? r[idx] : null);
}

async function getMaxLessonCode() {
  const cached = readCache(MAXCODE_CACHE_KEY, MAXCODE_CACHE_TIME_KEY);
  if (cached.hit) return cached.value;

  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
  try {
    const res = await fetch(SHEET_BAI_HOC, { cache: "no-store" });
    const data = await res.json();
    const rows = data.rows || data;

    const baiList = rows.map(r => {
      const lop = safeStr(getCell(r, 0)).trim();
      const bai = safeStr(getCell(r, 2)).trim();
      return lop === trainerClass && bai ? parseInt(bai, 10) : null;
    }).filter(v => typeof v === "number" && !Number.isNaN(v));

    const maxCode = baiList.length === 0 ? null : Math.max(...baiList);
    writeCache(MAXCODE_CACHE_KEY, MAXCODE_CACHE_TIME_KEY, maxCode);
    return maxCode;
  } catch (e) {
    console.warn("⚠️ getMaxLessonCode failed, bỏ giới hạn.", e);
    return null;
  }
}

// maxLessonCode == null hoặc falsy => không giới hạn trên, chỉ áp LOWER_BOUND_UNIT
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
  const c = parseInt(parts[0], 10);
  const l = parseInt(parts[1], 10);
  const p = parseInt(parts[2], 10);
  if (Number.isNaN(c) || Number.isNaN(l) || Number.isNaN(p)) return 0;
  return c * 1000 + l * 10 + p;
}

function splitTargets(rawTarget) {
  return (rawTarget || "")
    .split(/[,/;|]/)
    .map(t => t.trim())
    .filter(Boolean);
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
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function status(msg) { statusLine.textContent = msg || ""; }