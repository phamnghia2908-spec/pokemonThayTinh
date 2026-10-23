// ===== Config =====



const COL = {
  lessonName: 1,   // B
  vocab: 2,        // C
  topic: 6,        // G
  meaning: 24      // Y
};

const LOWER_BOUND_UNIT = 3011; // giống Speaking 3
const COUNTDOWN_SECONDS = 6;
//const IMAGE_API_KEY = "51268254-554135d72f1d226beca834413"; // API key Pixabay anh đưa

// ===== State =====
let isRunning = false;
let isPaused = false;
let currentIndex = 0;
let wordsList = [];      // [{ word, meaning, lessonName }]
// Sửa dòng 16-17 thành:

let tickOscillator = null;
let tickGain = null;
let audioCtx = null;
let countdownTimer = null;

// ===== UI refs =====

const wordCountSelect = document.getElementById("wordCountSelect");
const speedSelect = document.getElementById("speedSelect");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const statusLine = document.getElementById("statusLine");

const flashImage = document.getElementById("flashImage");
const hintText = document.getElementById("hintText");
const answerEn = document.getElementById("answerEn");
const answerVi = document.getElementById("answerVi");

const countdownOverlay = document.getElementById("countdown");
const countdownDigit = document.getElementById("countdownDigit");

const toastEl = document.getElementById("flashToast");
function bindControls() {
  startBtn.onclick = startFlashcard;
  pauseBtn.onclick = togglePauseFlashcard;
  stopBtn.onclick = stopFlashcard;
  // Nếu muốn lưu lựa chọn topic:
  topicSelect.onchange = () => {
    localStorage.setItem("flash_topic", topicSelect.value);
  };
}
// ===== Init =====
document.addEventListener("DOMContentLoaded", initFlashcard);

async function initFlashcard() {
  bindControls();
  status("Đang tải chủ đề...");
  try {
    const rows = await fetchExecRows(SHEET_URL);
    buildTopicDropdown(rows);
    status("Sẵn sàng.");
  } catch (e) {
    console.error("❌ Init error:", e);
    status("Không thể tải dữ liệu.");
  }
}

function buildTopicDropdown(rows) {
  // 1. Lấy danh sách topic từ cột COL.topic (cột G - chỉ số 6)
  // r[COL.topic] thay vì r.c[COL.topic].v vì dữ liệu Exec là mảng đơn giản
  const topics = [...new Set(rows.map(r => safeStr(r[COL.topic])).filter(Boolean))];

  // 2. Sắp xếp bảng chữ cái
  topics.sort();

  // 3. Render HTML vào thẻ select
  // Thêm option mặc định "Tất cả"
  topicSelect.innerHTML = `<option value="ALL">-- Tất cả --</option>` +
    topics.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");

  console.log("✅ Đã tải danh sách chủ đề:", topics.length);
}


// ===== Core flow =====
async function startFlashcard() {
  if (isRunning) return;
  isRunning = true;
  isPaused = false;
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  pauseBtn.textContent = "Tạm dừng";
  stopBtn.disabled = false;

  try {
    status("Đang chuẩn bị dữ liệu...");
    const count = parseInt(wordCountSelect.value, 10);
    const speed = parseFloat(speedSelect.value);

    const maxLessonCode = await getMaxLessonCode();
    const rows = await fetchExecRows(SHEET_URL);
    wordsList = buildWords(rows, count, maxLessonCode);

    if (wordsList.length === 0) {
      toast("📭 Không tìm thấy từ vựng.");
      stopFlashcard();
      return;
    }

    prepareTickAudio();
    prefetchImages(wordsList);
    clearAnswer();
    currentIndex = 0;

    // ✅ Lấy giọng đọc ngay sau khi bấm nút
    const voice = await pickEnglishVoice();

    status(`Bắt đầu — ${wordsList.length} từ`);
    await playFlashcardLoop(speed, voice);

    status("Hoàn tất.");
    stopFlashcard();
  } catch (e) {
    console.error("❌ Start error:", e);
    toast("❌ Lỗi khởi chạy Flashcard.");
    stopFlashcard();
  }
}



function stopFlashcard() {
  isRunning = false;
  isPaused = false;
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  pauseBtn.textContent = "Tạm dừng";
  stopBtn.disabled = true;

  // Hủy countdown
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  hideCountdown();

  // Hủy tick audio
  cleanupTickAudio();

  // Hủy TTS đang nói
  try { speechSynthesis.cancel(); } catch {}

  status("Đã dừng.");
}

// ===== Pause / Resume =====
function togglePauseFlashcard() {
  if (!isRunning) return;
  if (isPaused) {
    resumeFlashcard();
  } else {
    pauseFlashcard();
  }
}

function pauseFlashcard() {
  if (!isRunning || isPaused) return;
  isPaused = true;
  pauseBtn.textContent = "Tiếp tục";
  status("Đã tạm dừng.");

  // Tạm dừng audio đang phát (buffer TTS + tick)
  try { if (audioCtx && audioCtx.state === "running") audioCtx.suspend(); } catch {}
  // Tạm dừng TTS trình duyệt (fallback)
  try { speechSynthesis.pause(); } catch {}
}

function resumeFlashcard() {
  if (!isRunning || !isPaused) return;
  isPaused = false;
  pauseBtn.textContent = "Tạm dừng";
  status("Đang tiếp tục...");

  // Tiếp tục audio
  try { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); } catch {}
  // Tiếp tục TTS trình duyệt (fallback)
  try { speechSynthesis.resume(); } catch {}
}

// ===== Play loop =====
async function playFlashcardLoop(speed = 1.0, voice) {
  for (let i = 0; i < wordsList.length && isRunning; i++) {
    const item = wordsList[i];
    const word = item.word;
    const meaning = item.meaning;

    await renderWordCard(word);

    speak("What is this?", voice, speed);
    await runCountdown(COUNTDOWN_SECONDS);
    showAnswer(word, meaning);
    speak(word, voice, speed);
    await delay(1600);
  }
}



// ===== Data build =====


function buildWords(rows, count, maxLessonCode) {
  const selectedTopic = topicSelect.value || "ALL";

  // Lọc theo topic nếu không chọn ALL
  if (selectedTopic !== "ALL") {
    rows = rows.filter(r => safeStr(r[COL.topic]) === selectedTopic);
  }
  // Map lessonName -> list items
  const unitMap = new Map();

  for (const r of rows) {
    const lessonName = safeStr(r[COL.lessonName]);
    const unitNum = normalizeUnitId(lessonName); // Tính unitNum trước
    const vocabRaw = safeStr(r[COL.vocab]);
    const meaning = safeStr(r[COL.meaning]);
    const topic = safeStr(r[COL.topic]);

    const tokens = splitTargets(vocabRaw);
    if (!lessonName || tokens.length === 0 || !meaning) continue;

    // Bây giờ mới check maxLessonCode
    if (maxLessonCode && unitNum > maxLessonCode) continue;

    // Push vào unitMap
    if (!unitMap.has(lessonName)) unitMap.set(lessonName, []);
    // Lưu cả word gốc (giữ nguyên hoa thường) để hiển thị đẹp, nhưng dùng token lower để chống trùng
    // Ở đây chọn token đầu tiên làm word chính, nếu nhiều muốn mở rộng thì lặp qua tokens
    unitMap.get(lessonName).push({ word: tokens[0], meaning, unitNum, lessonName });
  }

  const lessons = [...unitMap.keys()];
  // Random trật tự bài
  lessons.sort(() => Math.random() - 0.5);

  const picked = [];
  const usedWords = new Set(); // tránh trùng từ

  // Pass 1: mỗi bài 1 từ (random trong bài)
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

  // Pass 2: quay vòng nếu chưa đủ — đi qua từng bài, lấy thêm từ khác không trùng
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

  // Sắp xếp theo unitNum để mượt
  picked.sort((a, b) => a.unitNum - b.unitNum);

  // Chuẩn hóa word hiển thị: giữ dạng thường cho TTS tự nhiên
  return picked.map(it => ({
    word: it.word,
    meaning: it.meaning,
    lessonName: it.lessonName,
    unitNum: it.unitNum
  }));
}

// ===== GViz fetch =====
async function fetchExecRows(url) {
  const res = await fetch(url, { cache: "no-store" });
  return await res.json(); // Nhận trực tiếp mảng dữ liệu từ Exec
}

async function getMaxLessonCode() {
  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
  try {
    const res = await fetch(SHEET_BAI_HOC, { cache: "no-store" });
    // BỎ ĐOẠN NÀY: const text = await res.text(); const json = JSON.parse...
    const rows = await res.json(); // THAY THÀNH DÒNG NÀY

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

// ===== Topic dropdown =====

// ===== Image fetch (Pixabay) =====
// ===== Image fetch (sử dụng imagecache2.js) =====
async function prefetchImages(list) {
  const words = list.map(item => item.word);

  status(`Đang tải ảnh (0/${words.length})...`);

  await imageCache.prefetchImages(words, {
    concurrency: 3,
    onProgress: (completed, total) => {
      status(`Đang tải ảnh (${completed}/${total})...`);
    }
  });

  status("Đã tải xong ảnh.");
}

// ===== Render card / hint / answer =====
async function renderWordCard(word) {
  // Hiển thị loading
  flashImage.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23f0f0f0"/%3E%3Ccircle cx="50" cy="40" r="15" fill="%23cccccc"/%3E%3Crect x="40" y="60" width="20" height="30" fill="%23cccccc"/%3E%3C/svg%3E';

  // Lấy ảnh từ cache manager
  try {
    const imageData = await imageCache.getImage(word);

    if (imageData) {
      flashImage.src = imageData.url;
      flashImage.alt = `${word} - Ảnh từ ${imageData.source}`;
      flashImage.title = `Nguồn: ${imageData.source}`;
    }
  } catch (e) {
    console.error("❌ Lỗi load ảnh:", e);
    flashImage.src = '';
  }

  // Gợi ý
  hintText.textContent = buildHint(word);

  // Xoá đáp án cũ
  clearAnswer();
}

function buildHint(word) {
  // Hỗ trợ từ ghép: mỗi token hiển thị dạng "c _ _"
  const tokens = word.split(/\s+/).filter(Boolean);
  const hinted = tokens.map(tok => {
    const first = tok.charAt(0);
    const rest = tok.slice(1);
    const underscores = rest.replace(/./g, "_");
    return `${first} ${underscores.split("").join(" ")}`.trim();
  });
  return hinted.join("   "); // khoảng cách giữa các token
}

function showAnswer(word, meaning) {
  answerEn.textContent = word;
  answerVi.textContent = meaning;
}

function clearAnswer() {
  answerEn.textContent = "";
  answerVi.textContent = "";
}

// ===== Countdown with tick sound =====
async function runCountdown(seconds) {
  return new Promise((resolve) => {
    let n = seconds;
    countdownDigit.textContent = n;
    countdownOverlay.style.display = "flex";
    countdownOverlay.classList.add("show");

    // Tick ngay lập tức cho nhịp đầu
    playTickSound();

    countdownTimer = setInterval(() => {
      if (isPaused) return; // đứng yên khi đang tạm dừng
      n--;
      if (n <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        hideCountdown();
        resolve();
        return;
      }
      countdownDigit.textContent = n;
      playTickSound();
    }, 1000);
  });
}

function hideCountdown() {
  countdownOverlay.classList.remove("show");
  countdownOverlay.style.display = "none";
}

// ===== Tick sound using Web Audio =====
function prepareTickAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  tickGain = audioCtx.createGain();
  tickGain.gain.value = 0.15; // âm lượng vừa phải
  tickGain.connect(audioCtx.destination);
}

function playTickSound() {
  if (!audioCtx) return;
  try { if (audioCtx.state === "suspended") audioCtx.resume(); } catch {}
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // Tạo beep ngắn: 800 Hz → 1200 Hz, 120ms
  osc.type = "sine";
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(1200, audioCtx.currentTime + 0.12);

  gain.gain.value = 0.0;
  gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.35, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.13);
}

function cleanupTickAudio() {
  try { if (audioCtx && audioCtx.state !== "closed") audioCtx.close(); } catch {}
  audioCtx = null;
  tickGain = null;
  tickOscillator = null;
}

// ===== TTS =====
// ===== TTS =====

// Lấy giọng đọc tiếng Anh, fallback sang giọng đầu tiên nếu không có
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


// Phát âm văn bản bằng TTS
// Service TTS
const TTS_BASE = "https://googlevoice-tinh.onrender.com";

async function speak(text, voice, rate = 1.0) {
  if (!text) return;

  try {
    // 1. Thử gọi Google Voice API
    const url = `${TTS_BASE}/tts?q=${encodeURIComponent(text)}&speed=${encodeURIComponent(rate)}&lang=en-US&voice=${encodeURIComponent(voice?.name || "")}`;
    console.log("🎧 TTS URL:", url);

    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`TTS request failed: ${resp.status}`);

    const arrayBuffer = await resp.arrayBuffer();

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      try { await audioCtx.resume(); } catch (e) {
        console.warn("⚠️ AudioContext resume failed:", e);
      }
    }

    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
    return; // ✅ thành công → không cần fallback
  } catch (err) {
    console.warn("⚠️ Google Voice TTS failed, fallback to browser TTS:", err);
  }

  // 2. Fallback: dùng speechSynthesis của trình duyệt
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = Math.max(0.5, Math.min(rate, 2.0));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch (err2) {
    console.error("❌ Browser TTS also failed:", err2);
  }
}



// ===== Utilities =====
function delay(ms) {
  return new Promise((resolve) => {
    let remaining = ms;
    const step = 100;
    const iv = setInterval(() => {
      if (isPaused) return; // giữ nguyên thời gian còn lại khi đang tạm dừng
      remaining -= step;
      if (remaining <= 0) {
        clearInterval(iv);
        resolve();
      }
    }, step);
  });
}
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