// ===== qanda.js =====
// Kết hợp: câu hỏi/đáp án + giới hạn bài học (kiểu physical.js)
//          ảnh minh họa theo TỪ VỰNG tương ứng câu hỏi (kiểu flashcard.js)

// ===== Cột dữ liệu trong Sheet chính (SHEET_URL) =====
const COL = {
  lessonName: 1,   // B
  vocab: 2,        // C
  topic: 6,        // G
  question: 9,      // J
  answer: 11        // L
};

const LOWER_BOUND_UNIT = 3011;

// ===== Cache config (giống cơ chế cache ảnh trong imagecache2.js) =====
const SHEET_CACHE_KEY = "qanda_sheet_rows";
const SHEET_CACHE_TIME_KEY = "qanda_sheet_rows_time";
const MAXCODE_CACHE_KEY = "qanda_max_lesson_code";
const MAXCODE_CACHE_TIME_KEY = "qanda_max_lesson_code_time";
const SHEET_CACHE_TTL_MS = 30 * 60 * 1000; // 30 phút

// ===== State =====
let qaPool = [];
let currentIndex = 0;
let voiceEng = null;

window.speechSynthesis.onvoiceschanged = () => {
  voiceEng = window.speechSynthesis.getVoices().find(
    v => v.lang === "en-US" && (v.name.includes("David") || v.name.includes("Google"))
  ) || window.speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
};

function speak(text) {
  if (!text) return;
  window.speechSynthesis.cancel();
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = "en-US";
  if (voiceEng) msg.voice = voiceEng;
  window.speechSynthesis.speak(msg);
}

// ===== UI refs =====
const topicSelect = document.getElementById("topicSelect");
const startBtn = document.getElementById("startBtn");
const refreshBtn = document.getElementById("refreshBtn");
const hintBtn = document.getElementById("hintBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const replayBtn = document.getElementById("replayBtn");
const statusLine = document.getElementById("statusLine");

const qaImage = document.getElementById("qaImage");
const questionText = document.getElementById("questionText");
const answerBox = document.getElementById("answerBox");
const answerText = document.getElementById("answerText");
const currentStepEl = document.getElementById("current-step");
const totalStepEl = document.getElementById("total-step");

// ===== Init =====
document.addEventListener("DOMContentLoaded", initQanda);

async function initQanda() {
  bindControls();
  status("Đang tải chủ đề...");
  try {
    const rows = await fetchRows();
    buildTopicDropdown(rows);
    status("Sẵn sàng. Chọn chủ đề rồi bấm Bắt đầu.");
  } catch (e) {
    console.error("❌ Init error:", e);
    status("Không thể tải dữ liệu.");
  }
}

function bindControls() {
  startBtn.onclick = startQanda;
  hintBtn.onclick = showAnswer;
  prevBtn.onclick = prevQuestion;
  nextBtn.onclick = nextQuestion;
  replayBtn.onclick = () => {
    if (currentIndex < qaPool.length) speak(qaPool[currentIndex].question);
  };
  refreshBtn.onclick = async () => {
    clearSheetCache();
    status("Đang tải lại dữ liệu mới nhất từ Sheet...");
    const rows = await fetchRows();
    buildTopicDropdown(rows);
    status("Đã làm mới dữ liệu. Sẵn sàng.");
  };
}

// ===== Core flow =====
async function startQanda() {
  startBtn.disabled = true;
  hintBtn.disabled = true;
  prevBtn.disabled = true;
  nextBtn.disabled = true;
  answerBox.style.display = "none";

  try {
    status("Đang chuẩn bị câu hỏi...");

    const maxLessonCode = await getMaxLessonCode();
    const rows = await fetchRows();
    qaPool = buildQAPool(rows, maxLessonCode);

    if (qaPool.length === 0) {
      status("📭 Không tìm thấy câu hỏi phù hợp.");
      startBtn.disabled = false;
      return;
    }

    currentIndex = 0;
    hintBtn.disabled = false;
    nextBtn.disabled = false;
    status(`Sẵn sàng — ${qaPool.length} câu hỏi (1 vòng).`);
    renderQuestion();
  } catch (e) {
    console.error("❌ Start error:", e);
    status("❌ Lỗi khởi chạy.");
  } finally {
    startBtn.disabled = false;
  }
}

async function renderQuestion() {
  if (currentIndex >= qaPool.length) {
    questionText.textContent = "🎉 Đã hết vòng câu hỏi! Bấm Bắt đầu để làm vòng mới.";
    qaImage.src = "";
    answerBox.style.display = "none";
    currentStepEl.textContent = qaPool.length;
    totalStepEl.textContent = qaPool.length;
    hintBtn.disabled = true;
    nextBtn.disabled = true;
    prevBtn.disabled = false;
    return;
  }

  const current = qaPool[currentIndex];
  answerBox.style.display = "none";
  answerText.textContent = "";

  questionText.textContent = current.question;
  currentStepEl.textContent = currentIndex + 1;
  totalStepEl.textContent = qaPool.length;
  speak(current.question);

  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = false;

  // Ảnh loading tạm
  qaImage.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23f0f0f0"/%3E%3Ccircle cx="50" cy="40" r="15" fill="%23cccccc"/%3E%3Crect x="40" y="60" width="20" height="30" fill="%23cccccc"/%3E%3C/svg%3E';

  try {
    const imageData = await imageCache.getImage(current.vocab);
    if (imageData) {
      qaImage.src = imageData.url;
      qaImage.alt = `${current.vocab} - Ảnh từ ${imageData.source}`;
      qaImage.title = `Nguồn: ${imageData.source}`;
    }
  } catch (e) {
    console.error("❌ Lỗi load ảnh:", e);
  }

  // Chỉ preload trước ẢNH CỦA CÂU KẾ TIẾP (âm thầm, không chặn UI, không gọi hàng loạt)
  preloadNextImage();
}

// Âm thầm tải trước ảnh của câu hỏi kế tiếp trong lúc người dùng đang xem câu hiện tại
function preloadNextImage() {
  const next = qaPool[currentIndex + 1];
  if (!next) return;
  imageCache.getImage(next.vocab).catch(() => {});
}

function showAnswer() {
  if (currentIndex >= qaPool.length) return;
  const answer = qaPool[currentIndex].answer;
  answerText.textContent = answer;
  answerBox.style.display = "block";
  speak(answer);
}

function prevQuestion() {
  if (currentIndex <= 0) return;
  currentIndex--;
  renderQuestion();
}

function nextQuestion() {
  currentIndex++;
  renderQuestion();
}

// ===== Data build =====
function buildTopicDropdown(rows) {
  const topics = [...new Set(rows.map(r => safeStr(getCell(r, COL.topic))).filter(Boolean))];
  topics.sort();
  topicSelect.innerHTML = `<option value="ALL">-- Tất cả chủ đề --</option>` +
    topics.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
}

function buildQAPool(rows, maxLessonCode) {
  const selectedTopic = topicSelect.value || "ALL";

  // NHÓM THEO BÀI (Unit) - mỗi bài lấy đúng 1 câu cho 1 vòng, giống physical.js
  const groupedByUnit = {};

  rows.forEach(r => {
    const lessonName = safeStr(getCell(r, COL.lessonName));
    const vocab = safeStr(getCell(r, COL.vocab));
    const topic = safeStr(getCell(r, COL.topic));
    const question = safeStr(getCell(r, COL.question)).trim();
    const answer = safeStr(getCell(r, COL.answer)).trim();

    if (!lessonName || !vocab || !question || !answer) return;

    const unitNum = normalizeUnitId(lessonName);
    if (!unitNum) return;

    const isInRange = unitNum >= LOWER_BOUND_UNIT && (maxLessonCode ? unitNum <= maxLessonCode : true);
    if (!isInRange) return;

    const matchesTopic = (selectedTopic === "ALL" || topic === selectedTopic);
    if (!matchesTopic) return;

    if (!groupedByUnit[unitNum]) groupedByUnit[unitNum] = [];
    groupedByUnit[unitNum].push({
      question,
      answer,
      vocab: splitTargets(vocab)[0] || vocab,
      unitNum,
      lessonName,
      topic
    });
  });

  const unitIds = Object.keys(groupedByUnit);
  if (unitIds.length === 0) return [];

  // Mỗi bài chọn ngẫu nhiên đúng 1 câu, rồi xáo thứ tự các bài cho 1 vòng chơi
  const picked = unitIds.map(unitId => {
    const arr = groupedByUnit[unitId];
    return arr[Math.floor(Math.random() * arr.length)];
  });

  shuffleInPlace(picked);
  return picked;
}

// ===== GViz / Exec fetch (tương thích cả 2 định dạng) + cache localStorage =====
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