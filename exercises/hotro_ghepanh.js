// ===== Config =====
const COL = {
  lessonName: 1,   // B
  vocab: 2,        // C
  topic: 6,        // G
  meaning: 24      // Y
};

const PIECE_LAYOUT = {
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
  8: { cols: 4, rows: 2 }
};

// ===== State =====
let isActive = false;
let currentIndex = 0;
let wordsList = [];     // ảnh đang luyện: [{ word, meaning, lessonName }]
let quizPool = [];       // toàn bộ từ trong chủ đề đã chọn, dùng để ra câu hỏi
let pieceCount = 6;
let tileStates = [];     // 'covered' | 'open' | 'locked'
let currentQuestion = null;
let currentTileIndex = null;
let modalBusy = false;

let audioCtx = null;     // dùng cho TTS tiếng Anh (Google Voice) + fallback trình duyệt

// ===== Vietnamese TTS =====
const VI_TTS_BASE = "https://googlevoice-tinh.onrender.com";
const _viAudioCache = new Map();
let _viAudioCtx = null;
function _getViAudioCtx() {
  if (!_viAudioCtx) _viAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_viAudioCtx.state === "suspended") _viAudioCtx.resume();
  return _viAudioCtx;
}
function speakVI(text, speed = 0.9) {
  return new Promise(async (resolve) => {
    if (!text) return resolve();
    try {
      const key = `vi|${speed}|${text}`;
      let buf = _viAudioCache.get(key);
      if (!buf) {
        const url = `${VI_TTS_BASE}/tts?q=${encodeURIComponent(text)}&speed=${speed}&lang=vi-VN&voice=`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("VI TTS fail");
        const ab = await res.arrayBuffer();
        buf = await _getViAudioCtx().decodeAudioData(ab);
        _viAudioCache.set(key, buf);
      }
      const ctx = _getViAudioCtx();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = resolve;
      src.start();
    } catch (e) {
      console.error("speakVI lỗi:", e);
      resolve();
    }
  });
}

// ===== English TTS (Google Voice + fallback browser) =====
const TTS_BASE = "https://googlevoice-tinh.onrender.com";
let _englishVoice = null;

function pickEnglishVoice() {
  return new Promise(resolve => {
    const pick = () => {
      const list = speechSynthesis.getVoices();
      let en = list.find(v => /en(-|_)?US/i.test(v.lang))
             || list.find(v => /^en/i.test(v.lang))
             || list[0];
      resolve(en || null);
    };
    if (speechSynthesis.getVoices().length) {
      pick();
    } else {
      speechSynthesis.onvoiceschanged = pick;
    }
  });
}

async function speak(text, rate = 1.0) {
  if (!text) return;
  if (!_englishVoice) {
    try { _englishVoice = await pickEnglishVoice(); } catch {}
  }
  try {
    const url = `${TTS_BASE}/tts?q=${encodeURIComponent(text)}&speed=${encodeURIComponent(rate)}&lang=en-US&voice=${encodeURIComponent(_englishVoice?.name || "")}`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`TTS request failed: ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();

    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") { try { await audioCtx.resume(); } catch {} }

    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
    return;
  } catch (err) {
    console.warn("⚠️ Google Voice TTS lỗi, fallback trình duyệt:", err);
  }
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = Math.max(0.5, Math.min(rate, 2.0));
    if (_englishVoice) u.voice = _englishVoice;
    speechSynthesis.speak(u);
  } catch (err2) {
    console.error("❌ Browser TTS cũng lỗi:", err2);
  }
}

// ===== UI refs =====
const topicSelect = document.getElementById("topicSelect");
const wordCountSelect = document.getElementById("wordCountSelect");
const pieceCountSelect = document.getElementById("pieceCountSelect");
const startBtn = document.getElementById("startBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const revealBtn = document.getElementById("revealBtn");
const statusLine = document.getElementById("statusLine");

const puzzleImage = document.getElementById("puzzleImage");
const tilesOverlay = document.getElementById("tilesOverlay");
const hintText = document.getElementById("hintText");
const answerBox = document.getElementById("answerBox");
const answerEn = document.getElementById("answerEn");
const answerVi = document.getElementById("answerVi");

const toastEl = document.getElementById("flashToast");

const modalOverlay = document.getElementById("modalOverlay");
const modalClose = document.getElementById("modalClose");
const promptSpeaker = document.getElementById("promptSpeaker");
const promptText = document.getElementById("promptText");
const quizOptions = document.getElementById("quizOptions");

function bindControls() {
  startBtn.onclick = startGame;
  prevBtn.onclick = goPrev;
  nextBtn.onclick = goNext;
  revealBtn.onclick = () => revealAnswer(false);
  modalClose.onclick = closeModal;
  promptSpeaker.onclick = () => {
    if (!currentQuestion) return;
    if (currentQuestion.typeA) speak(currentQuestion.correct.word);
    else speakVI(currentQuestion.correct.meaning);
  };
  topicSelect.onchange = () => {
    localStorage.setItem("flash_topic", topicSelect.value);
  };
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", initGame);

async function initGame() {
  bindControls();
  status("Đang tải chủ đề...");
  try {
    const rows = await fetchExecRows(SHEET_URL);
    buildTopicDropdown(rows);
    status("Sẵn sàng. Chọn chủ đề rồi bấm Bắt đầu.");
  } catch (e) {
    console.error("❌ Init error:", e);
    status("Không thể tải dữ liệu.");
  }
}

function buildTopicDropdown(rows) {
  const topics = [...new Set(rows.map(r => safeStr(r[COL.topic])).filter(Boolean))];
  topics.sort();
  topicSelect.innerHTML = `<option value="ALL">-- Tất cả --</option>` +
    topics.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
}

// ===== Core flow =====
async function startGame() {
  startBtn.disabled = true;
  try {
    status("Đang chuẩn bị dữ liệu...");
    const count = parseInt(wordCountSelect.value, 10);
    pieceCount = parseInt(pieceCountSelect.value, 10);

    const maxLessonCode = await getMaxLessonCode();
    const rows = await fetchExecRows(SHEET_URL);

    wordsList = buildWords(rows, count, maxLessonCode);
    quizPool = buildQuizPool(rows, topicSelect.value);

    if (wordsList.length === 0) {
      toast("📭 Không tìm thấy từ vựng.");
      return;
    }
    if (quizPool.length < 4) {
      toast("⚠️ Chủ đề có ít từ, câu hỏi có thể ít lựa chọn hơn.");
    }

    prefetchImages(wordsList);
    currentIndex = 0;
    isActive = true;

    prevBtn.disabled = false;
    nextBtn.disabled = false;
    revealBtn.disabled = false;

    await renderPuzzleCard();
  } catch (e) {
    console.error("❌ Start error:", e);
    toast("❌ Lỗi khởi chạy trò chơi.");
  } finally {
    startBtn.disabled = false;
  }
}

function goNext() {
  if (!isActive) return;
  if (currentIndex < wordsList.length - 1) {
    currentIndex++;
    renderPuzzleCard();
  } else {
    toast("Đây là ảnh cuối cùng.");
  }
}

function goPrev() {
  if (!isActive) return;
  if (currentIndex > 0) {
    currentIndex--;
    renderPuzzleCard();
  } else {
    toast("Đây là ảnh đầu tiên.");
  }
}

// ===== Data build (giống flashcard) =====
function buildWords(rows, count, maxLessonCode) {
  const selectedTopic = topicSelect.value || "ALL";
  if (selectedTopic !== "ALL") {
    rows = rows.filter(r => safeStr(r[COL.topic]) === selectedTopic);
  }
  const unitMap = new Map();

  for (const r of rows) {
    const lessonName = safeStr(r[COL.lessonName]);
    const unitNum = normalizeUnitId(lessonName);
    const vocabRaw = safeStr(r[COL.vocab]);
    const meaning = safeStr(r[COL.meaning]);

    const tokens = splitTargets(vocabRaw);
    if (!lessonName || tokens.length === 0 || !meaning) continue;
    if (maxLessonCode && unitNum > maxLessonCode) continue;

    if (!unitMap.has(lessonName)) unitMap.set(lessonName, []);
    unitMap.get(lessonName).push({ word: tokens[0], meaning, unitNum, lessonName });
  }

  const lessons = [...unitMap.keys()];
  lessons.sort(() => Math.random() - 0.5);

  const picked = [];
  const usedWords = new Set();

  for (const lesson of lessons) {
    const arr = unitMap.get(lesson);
    const candidates = arr.filter(it => !usedWords.has(it.word));
    if (candidates.length > 0) {
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      picked.push(chosen);
      usedWords.add(chosen.word);
      if (picked.length >= count) break;
    }
  }

  let loops = 0;
  while (picked.length < count && loops < 20) {
    let added = false;
    for (const lesson of lessons) {
      const arr = unitMap.get(lesson);
      const candidates = arr.filter(it => !usedWords.has(it.word));
      if (candidates.length > 0) {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        picked.push(chosen);
        usedWords.add(chosen.word);
        added = true;
        if (picked.length >= count) break;
      }
    }
    if (!added) break;
    loops++;
  }

  picked.sort((a, b) => a.unitNum - b.unitNum);

  return picked.map(it => ({
    word: it.word,
    meaning: it.meaning,
    lessonName: it.lessonName,
    unitNum: it.unitNum
  }));
}

// Toàn bộ từ trong chủ đề đã chọn (dùng để ra câu hỏi trắc nghiệm, không giới hạn theo "Số ảnh")
function buildQuizPool(rows, selectedTopic) {
  let filtered = rows;
  if (selectedTopic && selectedTopic !== "ALL") {
    filtered = rows.filter(r => safeStr(r[COL.topic]) === selectedTopic);
  }
  const map = new Map();
  for (const r of filtered) {
    const vocabRaw = safeStr(r[COL.vocab]);
    const meaning = safeStr(r[COL.meaning]);
    const tokens = splitTargets(vocabRaw);
    if (tokens.length === 0 || !meaning) continue;
    const word = tokens[0];
    if (!map.has(word)) map.set(word, meaning);
  }
  return [...map.entries()].map(([word, meaning]) => ({ word, meaning }));
}

// ===== GViz fetch =====
async function fetchExecRows(url) {
  const res = await fetch(url, { cache: "no-store" });
  return await res.json();
}

async function getMaxLessonCode() {
  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
  try {
    const res = await fetch(SHEET_BAI_HOC, { cache: "no-store" });
    const rows = await res.json();
    const baiList = rows
      .map(r => {
        const lop = r[0]?.toString().trim();
        const bai = r[2]?.toString().trim();
        return lop === trainerClass && bai ? parseInt(bai, 10) : null;
      })
      .filter(v => typeof v === "number");
    if (baiList.length === 0) return Number.MAX_SAFE_INTEGER;
    return Math.max(...baiList);
  } catch (e) {
    console.warn("⚠️ getMaxLessonCode failed, bypass limit.", e);
    return Number.MAX_SAFE_INTEGER;
  }
}

// ===== Image fetch (imagecache2.js) =====
async function prefetchImages(list) {
  const words = list.map(item => item.word);
  status(`Đang tải ảnh (0/${words.length})...`);
  await imageCache.prefetchImages(words, {
    concurrency: 3,
    onProgress: (completed, total) => {
      status(`Đang tải ảnh (${completed}/${total})...`);
    }
  });
  status(`Sẵn sàng — ${wordsList.length} ảnh. Ảnh ${currentIndex + 1}/${wordsList.length}`);
}

// ===== Render puzzle card =====
async function renderPuzzleCard() {
  const item = wordsList[currentIndex];

  answerBox.style.display = "none";
  answerEn.textContent = "";
  answerVi.textContent = "";

  puzzleImage.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23f0f0f0"/%3E%3Ccircle cx="50" cy="40" r="15" fill="%23cccccc"/%3E%3Crect x="40" y="60" width="20" height="30" fill="%23cccccc"/%3E%3C/svg%3E';
  try {
    const imageData = await imageCache.getImage(item.word);
    if (imageData) {
      puzzleImage.src = imageData.url;
      puzzleImage.alt = `${item.word} - Ảnh từ ${imageData.source}`;
    }
  } catch (e) {
    console.error("❌ Lỗi load ảnh:", e);
  }

  hintText.textContent = buildHint(item.word);

  buildTiles(pieceCount);

  status(`Ảnh ${currentIndex + 1}/${wordsList.length} — còn ${countRemaining()} ô, ${countLocked()} ô đã khóa`);
}

function buildHint(word) {
  const tokens = word.split(/\s+/).filter(Boolean);
  const hinted = tokens.map(tok => {
    const first = tok.charAt(0);
    const rest = tok.slice(1);
    const underscores = rest.replace(/./g, "_");
    return `${first} ${underscores.split("").join(" ")}`.trim();
  });
  return hinted.join("   ");
}

// ===== Puzzle tiles =====
function buildTiles(count) {
  const layout = PIECE_LAYOUT[count] || PIECE_LAYOUT[6];
  tilesOverlay.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;
  tilesOverlay.style.gridTemplateRows = `repeat(${layout.rows}, 1fr)`;
  tilesOverlay.innerHTML = "";

  tileStates = new Array(count).fill("covered");

  for (let i = 0; i < count; i++) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.index = i;
    tile.innerHTML = `<span class="mark">?</span>`;
    tile.onclick = () => onTileClick(i);
    tilesOverlay.appendChild(tile);
  }
}

function getTileEl(i) {
  return tilesOverlay.querySelector(`.tile[data-index="${i}"]`);
}

function onTileClick(i) {
  if (!isActive) return;
  if (tileStates[i] !== "covered") return;
  if (modalBusy) return;
  openQuestionModal(i);
}

function openTile(i) {
  tileStates[i] = "open";
  const el = getTileEl(i);
  if (el) el.classList.add("open");
  status(`Ảnh ${currentIndex + 1}/${wordsList.length} — còn ${countRemaining()} ô, ${countLocked()} ô đã khóa`);
  if (countRemaining() === 0) {
    // Đã mở hết những ô có thể mở -> tự hiện đáp án
    revealAnswer(true);
  }
}

function lockRandomTile(preferIndex) {
  const candidates = [];
  for (let i = 0; i < tileStates.length; i++) {
    if (tileStates[i] === "covered") candidates.push(i);
  }
  if (candidates.length === 0) return;
  let target;
  if (preferIndex !== undefined && candidates.includes(preferIndex) && Math.random() < 0.5) {
    target = preferIndex;
  } else {
    target = candidates[Math.floor(Math.random() * candidates.length)];
  }
  tileStates[target] = "locked";
  const el = getTileEl(target);
  if (el) el.innerHTML = `<span class="mark">🔒</span>`, el.classList.add("locked");
  status(`Sai rồi! Đã khóa 1 ô. Còn ${countRemaining()} ô, ${countLocked()} ô đã khóa`);
}

function countRemaining() {
  return tileStates.filter(s => s === "covered").length;
}
function countLocked() {
  return tileStates.filter(s => s === "locked").length;
}

// ===== Quiz modal =====
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateQuestion() {
  if (quizPool.length === 0) return null;
  const typeA = Math.random() < 0.5; // true: hiện từ tiếng Anh, hỏi nghĩa | false: hiện nghĩa, hỏi từ tiếng Anh
  const correctIdx = Math.floor(Math.random() * quizPool.length);
  const correct = quizPool[correctIdx];

  const usedIdx = new Set([correctIdx]);
  const distractors = [];
  const maxOptions = Math.min(4, quizPool.length);
  while (distractors.length < maxOptions - 1 && usedIdx.size < quizPool.length) {
    const idx = Math.floor(Math.random() * quizPool.length);
    if (usedIdx.has(idx)) continue;
    usedIdx.add(idx);
    distractors.push(quizPool[idx]);
  }

  const options = shuffle([correct, ...distractors]);
  return { typeA, correct, options };
}

function openQuestionModal(tileIndex) {
  const q = generateQuestion();
  if (!q) {
    toast("⚠️ Không đủ dữ liệu để ra câu hỏi.");
    return;
  }
  currentQuestion = q;
  currentTileIndex = tileIndex;
  modalBusy = false;

  if (q.typeA) {
    promptText.textContent = q.correct.word;
    promptText.lang = "en";
  } else {
    promptText.textContent = q.correct.meaning;
    promptText.lang = "vi";
  }

  quizOptions.innerHTML = "";
  q.options.forEach((opt) => {
    const isEnglishOption = !q.typeA; // typeA: options là tiếng Việt | !typeA: options là tiếng Anh
    const label = q.typeA ? opt.meaning : opt.word;

    const btn = document.createElement("button");
    btn.className = "quizOption";
    btn.innerHTML = `<span class="miniSpeaker">🔊</span><span class="optText">${escapeHTML(label)}</span>`;
    btn.onclick = () => selectOption(opt, btn, isEnglishOption, label);
    btn.querySelector(".miniSpeaker").onclick = (ev) => {
      ev.stopPropagation();
      if (isEnglishOption) speak(label); else speakVI(label);
    };
    quizOptions.appendChild(btn);
  });

  modalOverlay.classList.add("show");

  // Tự động đọc câu hỏi
  if (q.typeA) speak(q.correct.word);
  else speakVI(q.correct.meaning);
}

function closeModal() {
  modalOverlay.classList.remove("show");
  currentQuestion = null;
  currentTileIndex = null;
  modalBusy = false;
}

async function selectOption(opt, btnEl, isEnglishOption, label) {
  if (modalBusy || !currentQuestion) return;
  modalBusy = true;

  const allBtns = quizOptions.querySelectorAll(".quizOption");
  allBtns.forEach(b => b.disabled = true);

  const isCorrect = opt.word === currentQuestion.correct.word;

  // TTS đáp án được chọn
  if (isEnglishOption) speak(label); else speakVI(label);

  btnEl.classList.add(isCorrect ? "correct" : "wrong");
  if (!isCorrect) {
    const correctLabel = currentQuestion.typeA ? currentQuestion.correct.meaning : currentQuestion.correct.word;
    allBtns.forEach(b => {
      if (b.querySelector(".optText").textContent === correctLabel) {
        b.classList.add("correct");
      }
    });
  }

  const tileIndex = currentTileIndex;
  await delay(900);
  closeModal();

  if (isCorrect) {
    openTile(tileIndex);
  } else {
    lockRandomTile(tileIndex);
  }
}

// ===== Reveal answer =====
function revealAnswer(autoWin) {
  const item = wordsList[currentIndex];
  for (let i = 0; i < tileStates.length; i++) {
    tileStates[i] = "open";
    const el = getTileEl(i);
    if (el) {
      el.classList.remove("locked");
      el.classList.add("open");
    }
  }
  answerEn.textContent = item.word;
  answerVi.textContent = item.meaning;
  answerBox.style.display = "block";
  status(autoWin ? "🎉 Đã mở hết ô! Đây là đáp án." : "Đã hiện đáp án.");
}

// ===== Utilities =====
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeStr(v) { return v == null ? "" : String(v); }
function status(msg) { statusLine.textContent = msg || ""; }
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.display = "block";
  setTimeout(() => { toastEl.style.display = "none"; }, 2500);
}
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.toString().trim().split("-");
  if (parts.length < 3) return 0;
  const [cls, lesson, part] = parts;
  const c = parseInt(cls, 10);
  const l = parseInt(lesson, 10);
  const p = parseInt(part, 10);
  if (Number.isNaN(c) || Number.isNaN(l) || Number.isNaN(p)) return 0;
  return c * 1000 + l * 10 + p;
}
function splitTargets(rawTarget) {
  return (rawTarget || "")
    .split(/[,/;|]/)
    .map(t => t.trim())
    .filter(Boolean);
}
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}