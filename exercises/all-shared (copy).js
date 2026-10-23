/**
 * ============================================================================
 * all-shared.js — HẠ TẦNG DÙNG CHUNG cho PokéLearn (bản rebuild 5-module)
 * ============================================================================
 * File này KHÔNG chứa logic riêng của module nào (Giới thiệu/Nghe/Nói/Đọc/Viết).
 * Mọi thứ dùng chung >1 module thì để ở đây. Sửa module nào thì chỉ sửa file
 * module đó — không cần đụng vào file này (trừ khi thêm hạ tầng dùng chung mới).
 *
 * Gồm:
 *  1. Cache dữ liệu Sheet + Ảnh (sống sót qua F5 giống all.js cũ)
 *  2. TTS tiếng Anh có khoá tuần tự (không cho nhảy câu khi đang đọc dở)
 *  3. Bộ tạo đáp án nhiễu (1 đúng + 1 cùng bài + 2 khác bài)
 *  4. Cơ chế Attempt/Retry/Reveal (lần 1–2 giao diện thường, từ lần 3 lộ đáp án)
 *  5. Chấm điểm kép: điểm hiển thị (luôn cộng) vs điểm đánh giá (chỉ tính lần đầu đúng)
 *  6. Lưu kết quả vào đúng các localStorage key mà summary.html đang đọc
 *  7. Micro helper (check khả dụng + hỏi lại khi nghi ngờ mic hỏng)
 *  8. UI dùng chung: chọn cấp độ, transition screen, hỏi học lại cuối buổi
 * ============================================================================
 */
// ============================================================================
// 1.5. ẢNH — dùng window.imageCache từ imagecache2.js (Unsplash/Pexels/Pixabay/...)
// ============================================================================
// getImageFromMap giữ NGUYÊN chữ ký đồng bộ (trả về string ngay lập tức) vì mọi
// module đang gọi kiểu `getImageFromMap(keyword) || ""` không await. imagecache2.js
// có internal cache đồng bộ (imageMap) + hàm getImage() bất đồng bộ để fetch thật.
// Nên: có sẵn trong cache -> trả về ngay; chưa có -> trả "" và fetch ngầm (không
// chặn UI), lần gọi sau (thường sau khi prefetchImagesBatch chạy xong) sẽ có ảnh.
export function getImageFromMap(keyword) {
  if (!keyword) return "";
  const k = keyword.toLowerCase().trim();
  const ic = window.imageCache;
  if (!ic) return "";
  if (ic.imageMap[k]) return ic.imageMap[k];
  ic.getImage(k); // fetch ngầm, không await
  return "";
}

export async function prefetchImagesBatch(keywords) {
  const ic = window.imageCache;
  if (!ic || !keywords?.length) return;
  await ic.prefetchImagesBatch(keywords);
}

// ============================================================================
// 1. HẰNG SỐ CHUNG
// ============================================================================

export const LEVELS = {
  MAM_NON: "mam_non",
  DE: "de",
  TRUNG_BINH: "trung_binh",
  KHO: "kho",
};

export const LEVEL_META = {
  [LEVELS.MAM_NON]:    { emoji: "🌱", label: "Mầm non",       sub: "Chưa biết chữ — chơi bằng hình & âm thanh" },
  [LEVELS.DE]:         { emoji: "🟢", label: "Dễ",             sub: "Mới học từ vựng cơ bản" },
  [LEVELS.TRUNG_BINH]: { emoji: "🟡", label: "Trung bình",     sub: "Đã quen từ vựng, câu ngắn" },
  [LEVELS.KHO]:        { emoji: "🔴", label: "Khó",            sub: "Tự tin đọc/nghe/nói đoạn dài" },
};

export const MAX_WORDS_PER_SESSION = 7;
export const MIN_LESSON_CODE_DEFAULT = 3011;

// ============================================================================
// 2. TRAINER / WORDBANK HELPERS
// ============================================================================

export function getWordBank() {
  return JSON.parse(localStorage.getItem("wordBank")) || [];
}

export function getTrainerClass() {
  return (localStorage.getItem("trainerClass") || "").trim();
}

export function isMamNonAllowed() {
  return getTrainerClass() === "1";
}

// ============================================================================
// 3. CHUẨN HOÁ MÃ BÀI HỌC
// ============================================================================

// row[1] dạng "3-1-1" (lớp-bài-phần) -> số so sánh được
export function normalizeUnitDash(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.toString().split("-");
  if (parts.length < 3) return 0;
  const [cls, lesson, part] = parts.map(v => parseInt(v, 10));
  if ([cls, lesson, part].some(v => isNaN(v))) return 0;
  return cls * 1000 + lesson * 10 + part;
}

export function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// 4. LẤY MÃ BÀI TỐI ĐA (SHEET_BAI_HOC) — cache nhẹ trong sessionStorage
// ============================================================================

export async function getMaxLessonCode() {
  const trainerClass = getTrainerClass();
  const cacheKey = "pkl_max_lesson_" + trainerClass;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached !== null) return parseInt(cached, 10);

  try {
    const res = await fetch(window.SHEET_BAI_HOC);
    const rows = await res.json();
    const list = rows
      .map(r => {
        const lop = (r[0] || "").toString().trim();
        const bai = (r[2] || "").toString().trim();
        return lop === trainerClass && bai ? parseInt(bai, 10) : null;
      })
      .filter(v => typeof v === "number" && !isNaN(v));
    const max = list.length ? Math.max(...list) : 0;
    sessionStorage.setItem(cacheKey, String(max));
    return max;
  } catch (e) {
    console.error("getMaxLessonCode lỗi:", e);
    return 0;
  }
}

// Mã bài tối thiểu: 3011 như cũ, RIÊNG lớp 1 (cache) thì không giới hạn tối thiểu (=0)
export function getMinLessonCode() {
  return isMamNonAllowed() ? 0 : MIN_LESSON_CODE_DEFAULT;
}
// BỔ SUNG
export const EN_RATE_BY_LEVEL = {
  [LEVELS.MAM_NON]: 0.4,
  [LEVELS.DE]: 0.6,
  [LEVELS.TRUNG_BINH]: 0.8,
  [LEVELS.KHO]: 1.0,
};
export function getEnglishRateForLevel(level) {
  return EN_RATE_BY_LEVEL[level] || 0.8;
}
const VI_TTS_BASE = "https://googlevoice-tinh.onrender.com";
const _viAudioCache = new Map();
let _viAudioCtx = null;
function _getViAudioCtx() {
  if (!_viAudioCtx) _viAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_viAudioCtx.state === "suspended") _viAudioCtx.resume();
  return _viAudioCtx;
}
// mới
export function speakVI(text, speed = 0.9) {
  return new Promise(async resolve => {
    if (!text) return resolve();
    try {
      const key = `vi|${speed}|${text}`;
      let buf = _viAudioCache.get(key);
      if (!buf) {
        const url = `${VI_TTS_BASE}/tts?q=${encodeURIComponent(text)}&speed=${speed}&lang=vi-VN&voice=`;
        // Cầu chì mạng: server TTS chạy trên Render free-tier có thể "ngủ đông"
        // và phản hồi rất chậm/không phản hồi — không giới hạn thời gian thì
        // fetch() có thể treo rất lâu, kéo theo mọi nơi await speakVI(...) đơ theo.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        let res;
        try {
          res = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }
        if (!res.ok) throw new Error("VI TTS fail");
        const ab = await res.arrayBuffer();
        buf = await _getViAudioCtx().decodeAudioData(ab);
        _viAudioCache.set(key, buf);
      }
      const ctx = _getViAudioCtx();
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination);
      src.onended = resolve;
      src.start();
    } catch (e) {
      console.error("speakVI lỗi:", e);
      resolve();
    }
  });
}
// ============================================================================
// 5. LẤY DỮ LIỆU THÔ TỪ SHEET — cache trong sessionStorage (như all.js cũ)
// ============================================================================

let _sheetRowsCache = null;

export async function getSheetRows() {
  if (_sheetRowsCache) return _sheetRowsCache;
  const wordBank = getWordBank();
  const cacheKey = "sheet_rows_" + wordBank.length;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    _sheetRowsCache = JSON.parse(cached);
    return _sheetRowsCache;
  }
  const res = await fetch(window.SHEET_URL);
  const data = await res.json();
  _sheetRowsCache = data.data || data;
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(_sheetRowsCache));
  } catch (e) { /* quota — bỏ qua, vẫn dùng biến trong RAM */ }
  return _sheetRowsCache;
}

// Chuyển 1 dòng sheet thành object item chuẩn dùng chung toàn bộ hệ thống
function buildRowItem(row) {
  const col = Array.isArray(row) ? row : Object.values(row);
  const get = idx => (col[idx] != null ? col[idx].toString().trim() : "");
  return {
    lessonId: get(1),              // "3-1-1"
    unitNum: normalizeUnitDash(get(1)),
    word: get(2),
    enChunk: get(3),
    viChunk: get(4),
    presentSent: get(8),
    question: get(9),
    keywordFix: get(10),
    answerRaw: get(11),            // = finalAns
    meaning: get(24),
    noteAH: get(33),
    noteAI: get(34),
    imageKeyword: get(47) || get(2),
    soundPun: get(25),
    punSentence: get(26),
  };
}

// ============================================================================
// 6. XÂY DỮ LIỆU CHO 1 BUỔI HỌC — cache localStorage (SỐNG SÓT QUA F5)
// ============================================================================

const SESSION_CACHE_KEY = "pkl_session_data_v1";
const IMG_PREFETCH_FLAG_PREFIX = "img_prefetch_"; // giữ đúng tiền tố như all.js cũ

function wordBankFingerprint(wb) {
  return wb.slice().sort().join("|");
}

/**
 * Trả về { sessionVocab, poolData, level } cho buổi học hiện tại.
 * - sessionVocab: tối đa MAX_WORDS_PER_SESSION từ trong wordBank (từ học hôm nay)
 * - poolData: toàn bộ từ trong phạm vi [minLesson..maxLesson] dùng làm NHIỄU
 *   (đáp án sai cho trắc nghiệm, câu nhiễu cho bài đọc/nghe đoạn văn...)
 * Cache theo localStorage để F5 lại vẫn dùng ngay không cần tải lại Sheet/ảnh.
 */
export async function loadSessionData(level) {
  const wordBank = getWordBank();
  const fp = wordBankFingerprint(wordBank);

  const cachedRaw = localStorage.getItem(SESSION_CACHE_KEY);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      if (cached._fp === fp && cached._level === level) {
        console.log("🚀 [PokéLearn] Dùng dữ liệu buổi học từ cache (localStorage)");
        return { sessionVocab: cached.sessionVocab, poolData: cached.poolData };
      }
    } catch (e) { /* cache hỏng thì bỏ qua, tải lại */ }
  }

  console.log("🌐 [PokéLearn] Đang tải dữ liệu buổi học từ Google Sheets...");
  const [maxLesson, rows] = await Promise.all([getMaxLessonCode(), getSheetRows()]);
  const minLesson = getMinLessonCode();

  const allItems = rows.map(buildRowItem).filter(it => it.word);

  // Từ vựng buổi học hôm nay: nằm trong wordBank đã chốt, loại trùng
  const seen = new Set();
  const sessionVocab = [];
  for (const it of allItems) {
    const key = it.word.toLowerCase();
    if (wordBank.includes(it.word) && !seen.has(key)) {
      seen.add(key);
      sessionVocab.push(it);
    }
    if (sessionVocab.length >= MAX_WORDS_PER_SESSION) break;
  }

  // Pool nhiễu: mọi từ trong phạm vi bài đã học (không nhất thiết thuộc wordBank)
  const poolData = allItems.filter(
    it => it.unitNum >= minLesson && (maxLesson === 0 || it.unitNum <= maxLesson)
  );

  const toCache = { _fp: fp, _level: level, sessionVocab, poolData };
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(toCache));
  } catch (e) {
    console.warn("Không lưu được cache buổi học (có thể do quota):", e);
  }

  // Prefetch ảnh — chỉ 1 lần / theo số lượng wordBank, giữ đúng cơ chế all.js cũ
  const imgFlagKey = IMG_PREFETCH_FLAG_PREFIX + wordBank.length;
  const keywords = [...new Set(
    sessionVocab.flatMap(it => [it.imageKeyword, it.word].filter(Boolean).map(k => k.toLowerCase().trim()))
  )];
  // Kiểm tra THỰC TẾ xem local đã có ảnh chưa (không chỉ dựa vào cờ sessionStorage) —
  // tránh trường hợp người dùng xoá dữ liệu trình duyệt làm mất ảnh cache nhưng cờ cũ
  // vẫn còn, khiến hệ thống nghĩ "đã có ảnh" và bỏ qua tải lại -> ảnh hiện lỗi.
  const missingImages = keywords.filter(k => !getImageFromMap(k));
  if (!sessionStorage.getItem(imgFlagKey) || missingImages.length > 0) {
    try {
      await prefetchImagesBatch(missingImages.length > 0 ? missingImages : keywords);
    } catch (e) { console.warn("Prefetch ảnh lỗi:", e); }
    sessionStorage.setItem(imgFlagKey, "1");
  }

  return { sessionVocab, poolData };
}

export function clearSessionCache() {
  localStorage.removeItem(SESSION_CACHE_KEY);
}

// ============================================================================
// 7. TTS TIẾNG ANH — CÓ KHOÁ TUẦN TỰ (không cho làm gì khi đang đọc dở)
// ============================================================================

let ttsVoice = null;
let ttsBusy = false;
const spokenInstructions = new Set(); // mỗi dạng bài chỉ đọc hướng dẫn 1 lần / buổi

export function initTTSVoice() {
  return new Promise(resolve => {
    const apply = () => {
      const voices = speechSynthesis.getVoices();
      ttsVoice =
        voices.find(v => v.lang === "en-US" && v.name?.toLowerCase().includes("zira")) ||
        voices.find(v => v.lang === "en-US") || null;
      resolve();
    };
    const voices = speechSynthesis.getVoices();
    if (voices.length) apply();
    else speechSynthesis.onvoiceschanged = apply;
  });
}

/** Đọc 1 câu tiếng Anh, trả Promise khi đọc XONG. Luôn await trước khi cho tương tác tiếp. */
// mới
export function speakEN(text, rate = 1) {
  return new Promise(resolve => {
    if (!text) return resolve();
    if (ttsBusy) window.speechSynthesis.cancel();
    ttsBusy = true;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.voice = ttsVoice;
    u.rate = rate;
    let done_ = false;
    const done = () => { if (done_) return; done_ = true; ttsBusy = false; resolve(); };
    // Cầu chì an toàn: speechSynthesis đôi lúc KHÔNG BAO GIỜ bắn onend/onerror
    // (lỗi có thật của trình duyệt) — không có cầu chì này thì mọi await
    // speakEN(...) phía sau treo vĩnh viễn, làm cả module đứng hình.
    const safety = setTimeout(done, Math.max((text.length * 130) / (rate || 1), 4000));
    u.onend = () => { clearTimeout(safety); done(); };
    u.onerror = () => { clearTimeout(safety); done(); };
    window.speechSynthesis.speak(u);
  });
}

export function isSpeaking() {
  return ttsBusy;
}

/** Đọc hướng dẫn dạng bài — CHỈ đọc lần đầu tiên gặp taskKey trong buổi học. */
export async function speakInstructionOnce(taskKey, instructionText) {
  if (spokenInstructions.has(taskKey)) return;
  spokenInstructions.add(taskKey);
  await speakEN(instructionText);
}

/** Gọi khi bắt đầu 1 lượt học hoàn chỉnh mới (kể cả khi chọn "Học lại" cuối buổi) */
export function resetInstructionMemory() {
  spokenInstructions.clear();
}

// ============================================================================
// 8. BỘ TẠO ĐÁP ÁN NHIỄU — 1 đúng + 1 cùng bài + 2 khác bài
// ============================================================================

/**
 * @param {object} target - item đúng (phải có field so sánh + lessonId)
 * @param {array}  pool   - danh sách item nhiễu tiềm năng (thường là poolData)
 * @param {object} opts   - { field='word', count=3, extra=[] }
 *        extra: danh sách item bổ sung (vd sessionVocab) để đủ nhiễu nếu pool ít
 * @returns {array} danh sách N giá trị nhiễu (không trùng đáp án đúng, không trùng nhau)
 */
export function buildDistractors(target, pool, opts = {}) {
  const field = opts.field || "word";
  const count = opts.count || 3;
  // preferSameLesson: true -> ưu tiên lấy TOÀN BỘ nhiễu cùng bài trước (dùng cho
  // câu hỏi có ảnh — ảnh cùng bài đã được prefetch/cache sẵn ở local, tránh phải
  // gọi API tải ảnh mới cho từ ở bài khác).
  const preferSameLesson = opts.preferSameLesson || false;
  const correctVal = (target[field] || "").toString().trim().toLowerCase();

  const validVal = it => it[field] && it[field].toString().trim().toLowerCase() !== correctVal;

  const sameLesson = shuffle(pool.filter(it => it.lessonId === target.lessonId && validVal(it)));
  const otherLesson = shuffle(pool.filter(it => it.lessonId !== target.lessonId && validVal(it)));

  const picked = [];
  const usedVals = new Set([correctVal]);

  const tryAdd = (list) => {
    for (const it of list) {
      const v = it[field].toString().trim();
      const key = v.toLowerCase();
      if (usedVals.has(key)) continue;
      usedVals.add(key);
      picked.push(v);
      if (picked.length >= count) return true;
    }
    return false;
  };

  if (preferSameLesson) {
    tryAdd(sameLesson);
    if (picked.length < count) tryAdd(otherLesson);
  } else {
    if (sameLesson.length) tryAdd(sameLesson.slice(0, 1));
    if (picked.length < count) tryAdd(otherLesson);
    if (picked.length < count) tryAdd(sameLesson.slice(1));
  }
  if (picked.length < count && Array.isArray(opts.extra)) tryAdd(shuffle(opts.extra));

  return picked.slice(0, count);
}

// ============================================================================
// 9. CƠ CHẾ ATTEMPT / RETRY / REVEAL
// ============================================================================
// Quy tắc đã chốt:
//   Lần thử 1: giao diện bình thường, không gợi ý gì.
//   Sai -> hiện đáp án đúng (highlight) + lời cổ vũ + nút "Thử lại".
//   Lần thử 2 (bấm Thử lại lần 1): giao diện lại bình thường y hệt lần 1.
//   Từ lần thử 3 trở đi (Thử lại lần 2+): đáp án đúng được TÔ SÁNG SẴN
//   trong các lựa chọn hiện có để học sinh chắc chắn chọn đúng.
// ============================================================================

export function makeAttemptTracker() {
  return { attempt: 1 };
}

export function shouldRevealAnswer(tracker) {
  return tracker.attempt >= 3;
}

export function goToNextAttempt(tracker) {
  tracker.attempt += 1;
}

export const POSITIVE_FEEDBACK = [
  "Great job!", "Well done!", "Awesome!", "You got it!",
  "Excellent!", "Perfect!", "Fantastic!", "Nice work!",
];

export const ENCOURAGE_RETRY = [
  "Almost there! Let's try again.",
  "Good try! Here's the answer — let's do it once more.",
  "Nice attempt! Let's give it another go.",
  "So close! One more try.",
];

export function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
// ============================================================================
// 9.5. askMCQ — KHUNG CÂU HỎI TRẮC NGHIỆM DÙNG CHUNG (Module 1/2/4 đều cần)
// ============================================================================
export function askMCQ(cfg) {
  const {
    container, instructionKey, instructionText,
    questionHTML, options, correctValue, speakPromptText, rate = 1,
    optionLang = "en", promptLang = "en",
  } = cfg;

  const tracker = makeAttemptTracker();
  const hasImages = options.some(o => o.imageUrl);
  const speakByLang = (text, lang, r) => (lang === "vi" ? speakVI(text, r) : speakEN(text, r));

  return new Promise(resolve => {
    const render = async () => {
      const reveal = shouldRevealAnswer(tracker);
      container.innerHTML = `
        <div class="pkl-mcq-question">${questionHTML}</div>
        <div class="pkl-mcq-options ${hasImages ? "pkl-img-mode" : ""}" id="pklMcqOptions"></div>
        <div class="pkl-mcq-feedback" id="pklMcqFeedback"></div>
      `;
      const optWrap = container.querySelector("#pklMcqOptions");
      const feedback = container.querySelector("#pklMcqFeedback");
      let locked = false;

      const handlePick = async (value, pickedEl) => {
        if (locked) return;
        locked = true;
        optWrap.querySelectorAll(".pkl-mcq-btn").forEach(b => b.classList.add("pkl-locked"));

        const opt = options.find(o => o.value === value) || {};
        await speakByLang(opt.speakText || opt.label || value, optionLang, rate);

        const isCorrect = value === correctValue;
        if (isCorrect) {
          pickedEl?.classList.add("pkl-correct-flash", "pkl-reveal");
          feedback.textContent = "🎉 " + randomPick(POSITIVE_FEEDBACK);
          feedback.style.color = "#69f0ae";
          const attemptsUsed = tracker.attempt;
          await new Promise(r => setTimeout(r, 1200));
          resolve(attemptsUsed);
        } else {
          pickedEl?.classList.add("pkl-wrong-flash");
          feedback.textContent = "💡 " + randomPick(ENCOURAGE_RETRY);
          feedback.style.color = "#ffd54f";
          const retryBtn = document.createElement("button");
          retryBtn.className = "poke-btn yellow";
          retryBtn.style.marginTop = "10px";
          retryBtn.textContent = "🔄 Try again";
          retryBtn.onclick = () => { goToNextAttempt(tracker); render(); };
          feedback.after(retryBtn);
        }
      };

      options.forEach(opt => {
        const btn = document.createElement(opt.imageUrl ? "div" : "button");
        btn.className = "pkl-mcq-btn" + (opt.imageUrl ? " pkl-mcq-img" : "");
        btn.dataset.value = opt.value;
        btn.innerHTML = opt.imageUrl
          ? `<div class="img-wrap">
               <img src="${opt.imageUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/>
               <div class="img-fallback" style="display:none;">🖼️</div>
             </div>
             <div class="lbl">${opt.label}</div>`
          : `<span>${opt.label}</span>`;
        if (reveal && opt.value === correctValue) btn.classList.add("pkl-reveal");

        btn.onclick = () => handlePick(opt.value, btn);
        optWrap.appendChild(btn);
      });

      await speakInstructionOnce(instructionKey, instructionText);
      if (speakPromptText) await speakByLang(speakPromptText, promptLang, rate);
    };
    render();
  });
}

// ============================================================================
// 9.6a. GHI ÂM QUA MediaRecorder + GỬI LÊN SERVER WHISPER TỰ HOST
// ============================================================================
// ⚠️ ĐIỀN URL SERVER WHISPER CỦA BẠN SAU KHI DEPLOY LÊN RENDER:
export const WHISPER_SERVER_URL = "https://ispeak-z9wx.onrender.com";

/** Ghi âm tối đa maxMs mili-giây, tự dừng khi hết giờ. Trả về { stop, blob(Promise<Blob>) } */
export async function startRecording(maxMs = 4000) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  const blob = new Promise(resolve => {
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    };
  });
  rec.start();
  const safety = setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, maxMs);
  return {
    stop: () => { clearTimeout(safety); if (rec.state !== "inactive") rec.stop(); },
    blob,
  };
}

/** Gửi audio lên server Whisper, trả về chữ nhận dạng được. null = lỗi kỹ thuật (server chưa dậy/mất mạng...) */
// mới
export async function transcribeAudio(blob) {
  try {
    const form = new FormData();
    form.append("audio", blob, "speech.webm");
    // Cầu chì mạng: server Whisper cũng chạy trên Render free-tier, cùng nguy
    // cơ "ngủ đông" như server TTS tiếng Việt — không giới hạn thì có thể treo
    // rất lâu ở màn "Đang kiểm tra..." khiến phần Nói đứng hình.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let res;
    try {
      res = await fetch(`${WHISPER_SERVER_URL}/transcribe`, { method: "POST", body: form, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error("transcribe failed: " + res.status);
    const data = await res.json();
    return data.text || "";
  } catch (e) {
    console.error("Whisper transcribe error:", e);
    return null;
  }
}
// ============================================================================
// 9.6. askSpeakingAttempt — GHI ÂM 1 LẦN BẮT BUỘC (module Nói + phần "lặp lại"
// của module Giới thiệu). Không ép retry — chỉ chấm lần thử đầu tiên, nhưng
// cho phép học sinh TỰ NGUYỆN ghi âm lại (không ảnh hưởng điểm đã chấm).
// ============================================================================
// cfg: { container, instructionKey, instructionText, targetText, promptHTML, matchFn }
// Trả Promise<{ isCorrect, transcript }>
// ============================================================================

export function askSpeakingAttempt(cfg) {
  const {
    container, instructionKey, instructionText, targetText, promptHTML,
    matchFn, maxRecordMs = 10000, speakBeforeText,
  } = cfg;

  const defaultMatch = (heard, target) => {
    const h = heard.toLowerCase().trim();
    const t = target.toLowerCase().trim();
    return h.includes(t) || t.includes(h);
  };
  const checkMatch = matchFn || defaultMatch;

  return new Promise(async resolve => {
    container.innerHTML = `
      <div class="pkl-speak-prompt">${promptHTML}</div>
      <div class="pkl-speak-status" id="pklSpeakStatus">🔊 Listen...</div>
      <div style="text-align:center;"><div class="mic-ring" id="pklMicBtn">🎤</div></div>
      <div class="pkl-speak-result" id="pklSpeakResult"></div>
      <div style="text-align:center;margin-top:10px;">
        <button class="poke-btn green" id="pklFinishBtn" style="display:none;">✅ Finish</button>
      </div>
      <div id="pklSpeakActions" style="display:none;text-align:center;margin-top:10px;gap:8px;">
        <button class="poke-btn gray" id="pklRetrySpeak">🔄 Try speaking again</button>
        <button class="poke-btn green" id="pklContinueSpeak">▶ Continue</button>
      </div>`;

    const statusEl = container.querySelector("#pklSpeakStatus");
    const micEl = container.querySelector("#pklMicBtn");
    const resultEl = container.querySelector("#pklSpeakResult");
    const finishBtn = container.querySelector("#pklFinishBtn");
    const actionsEl = container.querySelector("#pklSpeakActions");

    let firstResultDone = false, finalIsCorrect = false, autoAdvanceTimer = null;

    const doRecord = async () => {
      try {
        statusEl.textContent = "🎤 Recording... tap Finish when done!";
        micEl.classList.add("listening");
        finishBtn.style.display = "inline-block";

        const session = await startRecording(maxRecordMs);
        finishBtn.onclick = () => session.stop();
        const blob = await session.blob;

        finishBtn.style.display = "none";
        micEl.classList.remove("listening");
        statusEl.textContent = "⏳ Checking...";

        const transcript = await transcribeAudio(blob);
        actionsEl.style.display = "flex"; actionsEl.style.justifyContent = "center";

        if (transcript === null) {
          statusEl.textContent = "⚠️ Can't reach the speech server — try again in a moment.";
          if (!firstResultDone) { firstResultDone = true; finalIsCorrect = false; }
          return;
        }

        const isCorrect = checkMatch(transcript, targetText);
        if (!firstResultDone) { firstResultDone = true; finalIsCorrect = isCorrect; }

        resultEl.innerHTML = transcript ? `🗣️ You said: "<b>${transcript}</b>"` : `🗣️ (didn't hear anything clearly)`;
        statusEl.textContent = isCorrect ? "🎉 Great pronunciation!" : "👍 Nice try!";
        await speakEN(isCorrect ? randomPick(POSITIVE_FEEDBACK) : "Good try!");

        clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = setTimeout(() => finish(), 2200);
      } catch (e) {
        micEl.classList.remove("listening");
        finishBtn.style.display = "none";
        statusEl.textContent = "⚠️ Microphone not available.";
        if (!firstResultDone) { firstResultDone = true; finalIsCorrect = false; }
        actionsEl.style.display = "flex"; actionsEl.style.justifyContent = "center";
      }
    };

    const finish = () => { clearTimeout(autoAdvanceTimer); resolve({ isCorrect: finalIsCorrect, transcript: "" }); };

    container.addEventListener("click", (e) => {
      if (e.target.id === "pklRetrySpeak") { clearTimeout(autoAdvanceTimer); doRecord(); }
      if (e.target.id === "pklContinueSpeak") finish();
    });

    // BƯỚC 1: đọc hướng dẫn (chỉ lần đầu/buổi), rồi đọc nội dung cần lặp lại
    await speakInstructionOnce(instructionKey, instructionText);
    if (speakBeforeText) { statusEl.textContent = "🔊 Listen..."; await speakEN(speakBeforeText, 0.9); }

    // BƯỚC 2: TỰ ĐỘNG bắt đầu ghi âm — không cần chạm mic nữa
    doRecord();
  });
}
// ============================================================================
// 9.7. askTypedAnswer — CÂU HỎI NHẬP CHỮ DÙNG CHUNG (Nghe/Đọc/Viết)
// ============================================================================
// Giống askMCQ nhưng cho dạng gõ đáp án. Từ lần thử thứ 3, đáp án đúng được
// ĐIỀN SẴN vào ô nhập (tương đương "tô sáng đáp án đúng" của askMCQ).
// ============================================================================
export function askTypedAnswer(cfg) {
  const {
    container, instructionKey, instructionText, questionHTML,
    correctValue, placeholder = "Type here...", speakPromptText, normalizeFn, rate = 1,
  } = cfg;

  const norm = normalizeFn || (s => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " "));
  const tracker = makeAttemptTracker();

  return new Promise(resolve => {
    const render = async () => {
      const reveal = shouldRevealAnswer(tracker);
      container.innerHTML = `
        <div class="pkl-mcq-question">${questionHTML}</div>
        <div style="text-align:center;margin:14px 0;">
          <input type="text" id="pklTypedInput" class="pkl-typed-input" placeholder="${placeholder}"
            value="${reveal ? correctValue : ""}" autocomplete="off"/>
        </div>
        <div style="text-align:center;">
          <button class="poke-btn yellow" id="pklTypedSubmit">✅ Check</button>
        </div>
        <div class="pkl-mcq-feedback" id="pklTypedFeedback"></div>
      `;
      const input = container.querySelector("#pklTypedInput");
      const submitBtn = container.querySelector("#pklTypedSubmit");
      const feedback = container.querySelector("#pklTypedFeedback");
      input.focus();
      if (reveal) input.select();
      input.onkeydown = e => { if (e.key === "Enter") submitBtn.click(); };

      submitBtn.onclick = async () => {
        if (container.dataset.locked === "1") return;
        container.dataset.locked = "1";
        submitBtn.disabled = true; input.disabled = true;

        const userVal = input.value;
        if (userVal.trim()) await speakEN(userVal, rate);

        const isCorrect = norm(userVal) === norm(correctValue);
        if (isCorrect) {
          input.classList.add("pkl-reveal");
          feedback.textContent = "🎉 " + randomPick(POSITIVE_FEEDBACK);
          feedback.style.color = "#69f0ae";
          const attemptsUsed = tracker.attempt;
          await new Promise(r => setTimeout(r, 1200));
          resolve(attemptsUsed);
        } else {
          feedback.innerHTML = "💡 " + randomPick(ENCOURAGE_RETRY) + ` (Answer: <b>${correctValue}</b>)`;
          feedback.style.color = "#ffd54f";
          const retryBtn = document.createElement("button");
          retryBtn.className = "poke-btn yellow";
          retryBtn.style.marginTop = "10px";
          retryBtn.textContent = "🔄 Try again";
          retryBtn.onclick = () => { goToNextAttempt(tracker); render(); };
          feedback.after(retryBtn);
        }
      };

      container.dataset.locked = "0";
      await speakInstructionOnce(instructionKey, instructionText);
      if (speakPromptText) await speakEN(speakPromptText, rate);
    };
    render();
  });
}

// ============================================================================
// 10. CHẤM ĐIỂM KÉP: hiển thị (luôn cộng) vs đánh giá (chỉ tính đúng lần đầu)
// ============================================================================

export function createScoreTracker() {
  return { displayScore: 0, assessScore: 0, total: 0 };
}

/**
 * Gọi đúng 1 lần khi HỌC SINH ĐÃ QUA ĐƯỢC 1 CÂU (đúng, dù ở attempt nào).
 * @param {object} tracker
 * @param {number} attemptNumberWhenCorrect - giá trị tracker.attempt tại thời điểm đúng
 */
export function recordQuestionPassed(tracker, attemptNumberWhenCorrect) {
  tracker.total += 1;
  tracker.displayScore += 1; // luôn cộng — học sinh luôn thấy mình tiến bộ
  if (attemptNumberWhenCorrect === 1) tracker.assessScore += 1; // chỉ tính đúng ngay lần đầu
}

// Dành riêng cho module Nói (không retry-until-correct, tối đa 1 lần bắt buộc):
// mọi câu đều "pass" ngay sau khi ghi âm (dù đúng/sai) -> assess dựa vào kết quả nhận dạng thực tế
export function recordSpeakingAttempt(tracker, isRecognizedCorrect) {
  tracker.total += 1;
  tracker.displayScore += 1;
  if (isRecognizedCorrect) tracker.assessScore += 1;
}

// ============================================================================
// 11. LƯU KẾT QUẢ — GIỮ NGUYÊN Ý NGHĨA CÁC KEY localStorage CŨ
// ============================================================================
// Ghi chú mapping (đã thống nhất với người dùng):
//  - Module 1 Giới thiệu   -> result_vocabulary (scoreV1/totalV1)
//  - Module 2 Nghe          -> result_listening  (score1/total1)
//  - Module 3 Nói           -> result_speaking    (score2/total2, giữ đúng slot all.js cũ dùng)
//  - Module 4 Đọc           -> result_reading     (MỚI — chưa tồn tại trong hệ cũ,
//                              vì "Đọc" là module hoàn toàn mới được bổ sung.
//                              summary.html cần thêm phần đọc key này nếu muốn hiển thị)
//  - Module 5 Viết          -> result_overview    (score1/total1, giữ đúng slot all.js cũ dùng)
// ============================================================================

// mới — thay bằng khối này
// Ghi cộng dồn vào pkm_skill_scores — CÙNG 1 nguồn Battle đang dùng (qua
// pkm_score.js), để summary.js/pkm_sync_score.js tự cộng đúng, không cần
// sửa gì thêm ở summary.js.
function mergeSkillScore(skillKey, correctDelta, totalDelta) {
  const raw = localStorage.getItem("pkm_skill_scores");
  const skills = raw ? JSON.parse(raw) : {};
  if (!skills[skillKey]) skills[skillKey] = { correct: 0, total: 0 };
  skills[skillKey].correct += correctDelta;
  skills[skillKey].total += totalDelta;
  localStorage.setItem("pkm_skill_scores", JSON.stringify(skills));
  return skills[skillKey];
}

export function saveIntroResult(assessScore, assessTotal) {
  return mergeSkillScore("intro", assessScore, assessTotal);
}

export function saveListeningResult(assessScore, assessTotal) {
  return mergeSkillScore("listening", assessScore, assessTotal);
}

export function saveSpeakingResult(assessScore, assessTotal) {
  return mergeSkillScore("speaking", assessScore, assessTotal);
}

export function saveWritingResult(assessScore, assessTotal) {
  return mergeSkillScore("writing", assessScore, assessTotal);
}

export function saveReadingResult(assessScore, assessTotal) {
  return mergeSkillScore("reading", assessScore, assessTotal);
}

// ============================================================================
// 12. MICRO HELPERS
// ============================================================================

export async function isMicrophoneAvailable() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch (e) {
    return false;
  }
}

export function createMicFailTracker(threshold = 2) {
  return { consecutiveFails: 0, threshold };
}

export function noteMicResult(tracker, succeeded) {
  if (succeeded) tracker.consecutiveFails = 0;
  else tracker.consecutiveFails += 1;
  return tracker.consecutiveFails >= tracker.threshold;
}

/**
 * Hiện hộp thoại nhỏ hỏi "mic có hoạt động không?" khi nghi ngờ lỗi liên tục.
 * @returns {Promise<boolean>} true = tiếp tục dùng mic, false = chuyển dạng không cần mic
 */
export function askIfMicWorking() {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.75);
      z-index:500;display:flex;align-items:center;justify-content:center;`;
    overlay.innerHTML = `
      <div style="background:#16213e;border:2px solid #FFCB05;border-radius:18px;
        padding:26px;max-width:320px;text-align:center;color:#f0f0f0;">
        <div style="font-size:40px;margin-bottom:10px;">🎤</div>
        <div style="font-size:16px;margin-bottom:18px;">Is your microphone working?</div>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button id="mic-yes" class="poke-btn green">✅ Yes</button>
          <button id="mic-no" class="poke-btn red">🚫 No</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#mic-yes").onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector("#mic-no").onclick = () => { overlay.remove(); resolve(false); };
  });
}

// ============================================================================
// 13. UI DÙNG CHUNG: style tiêm 1 lần, transition, chọn cấp độ, hỏi học lại
// ============================================================================

let _stylesInjected = false;
export function injectSharedStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .pkl-locked { pointer-events: none !important; opacity: .55; }
    .pkl-reveal { box-shadow: 0 0 0 3px #4caf50 inset !important; background: rgba(76,175,80,.18) !important; }
    .pkl-correct-flash { animation: pklPop .4s ease; }
    @keyframes pklPop { 0%{transform:scale(1);} 40%{transform:scale(1.08);} 100%{transform:scale(1);} }
    .pkl-level-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; max-width:480px; margin:0 auto; }
    @media (max-width:520px){ .pkl-level-grid{ grid-template-columns:1fr; } }
    .pkl-level-card {
      background:rgba(255,255,255,.06); border:2px solid rgba(255,203,5,.3);
      border-radius:16px; padding:18px 12px; text-align:center; cursor:pointer;
      transition:all .2s;
    }
    .pkl-level-card:hover { transform:translateY(-3px); border-color:#FFCB05; }
    .pkl-level-card.disabled { opacity:.35; cursor:not-allowed; }
    .pkl-level-card .emoji { font-size:38px; }
    .pkl-level-card .label { font-weight:800; color:#FFCB05; margin-top:6px; font-size:16px; }
    .pkl-level-card .sub { font-size:12px; color:#bbb; margin-top:4px; }
    .pkl-end-prompt { text-align:center; padding:20px; }
    .pkl-end-prompt .emoji { font-size:64px; }
    .pkl-end-prompt .q { font-size:18px; color:#FFCB05; font-weight:700; margin:14px 0 20px; }
    .pkl-end-actions { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; }
    .pkl-mcq-question { font-size:18px; margin-bottom:14px; text-align:center; }
    .pkl-mcq-options { display:flex; flex-direction:column; gap:10px; }
    .pkl-mcq-options.pkl-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .pkl-mcq-btn {
      padding:14px 16px; background:rgba(255,255,255,.08); border:2px solid rgba(255,255,255,.15);
      border-radius:12px; color:#f0f0f0; font-size:16px; cursor:pointer; text-align:center; transition:all .2s;
    }
    .pkl-mcq-btn:hover { background:rgba(255,203,5,.15); border-color:#FFCB05; }
    .pkl-mcq-options.pkl-img-mode {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    @media (min-width: 560px) {
      .pkl-mcq-options.pkl-img-mode { grid-template-columns: repeat(3, 1fr); }
    }
    @media (min-width: 820px) {
      .pkl-mcq-options.pkl-img-mode { grid-template-columns: repeat(4, 1fr); }
    }
    .pkl-mcq-btn.pkl-mcq-img {
      display: flex;
      flex-direction: column;
      padding: 0;
      overflow: hidden;
    }
    .pkl-mcq-btn.pkl-mcq-img .img-wrap {
      width: 100%;
      aspect-ratio: 1 / 1;
      overflow: hidden;
      background: rgba(255,255,255,.06);
    }
    .pkl-mcq-btn.pkl-mcq-img .img-wrap img {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    .pkl-mcq-btn.pkl-mcq-img .img-fallback {
      width: 100%; height: 100%; display: flex; align-items: center;
      justify-content: center; font-size: 40px; background: rgba(255,255,255,.08);
    }
    .pkl-mcq-btn.pkl-mcq-img .lbl {
      padding: 8px 6px; font-size: 13px; text-align: center; color: #ccc;
    }
    .pkl-mcq-btn.pkl-mcq-img .lbl:empty { display: none; }
    .pkl-mcq-btn.pkl-correct-flash { border-color:#4caf50; background:rgba(76,175,80,.25); }
    .pkl-mcq-btn.pkl-wrong-flash { border-color:#e74c3c; background:rgba(231,76,60,.2); }
    .pkl-mcq-feedback { margin-top:12px; font-size:16px; font-weight:700; min-height:24px; text-align:center; }
    .mic-ring {
      width:70px; height:70px; border-radius:50%; background:#27ae60;
      display:inline-flex; align-items:center; justify-content:center; font-size:30px;
      cursor:pointer; box-shadow:0 0 0 0 rgba(39,174,96,.5); transition:transform .15s;
    }
    .mic-ring.listening { animation: pklMicPulse 1s infinite; }
    @keyframes pklMicPulse {
      0% { box-shadow:0 0 0 0 rgba(39,174,96,.6); }
      70% { box-shadow:0 0 0 16px rgba(39,174,96,0); }
      100% { box-shadow:0 0 0 0 rgba(39,174,96,0); }
    }
    .pkl-speak-prompt { text-align:center; font-size:20px; margin-bottom:14px; }
    .pkl-speak-status { text-align:center; font-size:14px; color:#ffd54f; margin-bottom:10px; min-height:20px; }
    .pkl-speak-result { text-align:center; font-size:14px; color:#ccc; margin-top:10px; min-height:20px; }

    .pkl-mcq-btn.pkl-mcq-img .lbl:empty { display:none; }
    .pkl-typed-input {
      padding:12px; font-size:18px; border-radius:10px; width:80%; max-width:320px;
      background:rgba(255,255,255,.1); border:2px solid rgba(255,203,5,.4); color:#fff; text-align:center;
    }
    .pkl-typed-input.pkl-reveal { border-color:#4caf50; background:rgba(76,175,80,.15); }
  `;
  document.head.appendChild(style);
}

export function showTransition(emoji, title, desc) {
  return new Promise(resolve => {
    const ts = document.getElementById("transitionScreen");
    document.getElementById("transEmoji").textContent = emoji;
    document.getElementById("transTitle").textContent = title;
    document.getElementById("transDesc").textContent = desc;
    ts.classList.add("show");
    document.getElementById("nextStageBtn").onclick = () => {
      ts.classList.remove("show");
      resolve();
    };
  });
}

/** Render màn chọn cấp độ vào container, trả Promise<level string> khi học sinh chọn xong */
export function renderLevelSelect(container) {
  injectSharedStyles();
  const mamNonOk = isMamNonAllowed();
  return new Promise(resolve => {
    container.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:15px;color:#FFCB05;font-weight:700;">🎮 Choose your level!</div>
      </div>
      <div class="pkl-level-grid">
        ${Object.entries(LEVEL_META).map(([key, meta]) => {
          const disabled = key === LEVELS.MAM_NON && !mamNonOk;
          return `
            <div class="pkl-level-card ${disabled ? "disabled" : ""}" data-level="${key}">
              <div class="emoji">${meta.emoji}</div>
              <div class="label">${meta.label}</div>
              <div class="sub">${meta.sub}</div>
            </div>`;
        }).join("")}
      </div>
    `;
    container.querySelectorAll(".pkl-level-card:not(.disabled)").forEach(card => {
      card.onclick = () => {
        const level = card.dataset.level;
        localStorage.setItem("selected_level", level);
        resolve(level);
      };
    });
  });
}

/** Hỏi cuối buổi: "Đã thuộc chưa hay muốn học lại?" -> Promise<'replay'|'done'> */
export function renderEndOfSessionPrompt(container) {
  injectSharedStyles();
  return new Promise(resolve => {
    container.innerHTML = `
      <div class="pkl-end-prompt">
        <div class="emoji">🏆</div>
        <div class="q">Do you feel ready, or do you want to practice again?</div>
        <div class="pkl-end-actions">
          <button class="poke-btn gray" id="pkl-replay">🔁 Practice again</button>
          <button class="poke-btn green" id="pkl-done">✅ I've got it!</button>
        </div>
      </div>
    `;
    container.querySelector("#pkl-replay").onclick = async () => {
      await speakEN("Let's practice one more time!");
      resolve("replay");
    };
    container.querySelector("#pkl-done").onclick = async () => {
      await speakEN("Awesome! See you next time!");
      resolve("done");
    };
  });
}

export function updateMiniScore(displayScore, total) {
  const el = document.getElementById("miniScore");
  if (el) el.textContent = `🎯 ${displayScore}/${total}`;
}
// ============================================================================
// 12. PKM GAME LAUNCHER — điều phối CHUYỂN HẲN TRANG sang 1 game full-màn-hình
// ============================================================================
/**
 * Vì mỗi game giờ là 1 trang HTML riêng biệt (không dùng chung DOM với
 * all-shared.html nữa), không thể `await` xuyên trang như code thường —
 * nên dùng lại đúng cơ chế "lưu localStorage rồi reload" đã có sẵn cho
 * tính năng nhảy module. Luồng:
 *
 *   1. Module chuẩn bị `rounds` (data thuần: câu hỏi/đáp án đúng...) rồi
 *      gọi PkmGameLauncher.launch({ moduleId, category, rounds }).
 *   2. launch() lưu rounds vào localStorage, chọn 1 game hợp với `category`
 *      (không lặp game vừa dùng lần trước), CHUYỂN HẲN TRANG sang game đó.
 *   3. Trang game (HTML/JS độc lập) tự đọc rounds qua getLaunchPayload(),
 *      tự vẽ + tự chấm (dùng lại các hàm chấm điểm thuần export ở trên,
 *      import thẳng từ all-shared.js), chơi xong gọi finishAndReturn(results)
 *      — lưu kết quả rồi CHUYỂN HẲN TRANG quay lại all-shared.html.
 *   4. all-shared.html load lại từ đầu, module đó chạy lại, nhưng lần này
 *      consumeResult(moduleId) thấy có kết quả chờ sẵn -> dùng luôn, KHÔNG
 *      hỏi lại từ đầu.
 *
 * Module nào gọi launch() mà nó thực sự điều hướng đi thì hàm gọi PHẢI
 * dừng thực thi ngay (không chạy tiếp code sau đó, kẻo lỡ tay ghi điểm/hiện
 * transition trong khoảnh khắc trước khi trang unload) — launch() tự ném
 * ra 1 "tín hiệu điều hướng" (PkmGameNavigating) để dừng ngay lập tức; nơi
 * gọi KHÔNG cần tự try/catch — main() ở all-orchestrator.js đã bắt sẵn.
 */

const PKM_LAUNCH_KEY = "pkl_game_launch";
const PKM_RESULT_KEY = "pkl_game_result";
const PKM_LAST_GAME_PREFIX = "pkl_last_game_"; // + category, sessionStorage

export class PkmGameNavigating extends Error {
  constructor() { super("PkmGameNavigating"); this.pkmNavigating = true; }
}

export const PkmGameLauncher = {
  // Bảng game theo nhóm — SỬA Ở ĐÂY khi thêm game mới (chỉ cần thêm tên
  // file .html vào đúng mảng, không cần sửa gì khác trong hệ thống).
  GAMES: {
    answer: ["pkm_minigame_race.html", "pkm_minigame_race_alone.html", "pkm_minigame_shooting.html", "pkm_minigame_fish.html"], // sau này thêm: balloon, treasure
    introPresent: ["pkm_minigame_flipbook.html", "pkm_minigame_maze.html"], // sau này thêm game khác cho Stage A
    speaking: ["pkm_minigame_ballcatching.html"], // chỉ Module 3 dùng — round shape khác hẳn "answer" (promptHTML/speakBeforeText/matchType, không phải questionHTML/options)
  },

  // Gọi bởi MODULE lúc chuẩn bị xong dữ liệu câu hỏi. Trả về false nếu
  // nhóm này chưa có game nào (nơi gọi tự fallback chạy UI cũ trong trang).
  // Nếu CÓ game, hàm này KHÔNG return bình thường — nó điều hướng đi rồi
  // ném PkmGameNavigating để dừng thực thi ngay tại chỗ gọi.
  launch({ moduleId, category, rounds }) {
    const games = this.GAMES[category] || [];
    if (!games.length) return false;

    const lastKey = PKM_LAST_GAME_PREFIX + category;
    const lastGame = sessionStorage.getItem(lastKey);
    const pool = games.length > 1 ? games.filter(g => g !== lastGame) : games;
    const chosen = (pool.length > 0 ? pool : games)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : games.length))];
    sessionStorage.setItem(lastKey, chosen);

    localStorage.setItem(PKM_LAUNCH_KEY, JSON.stringify({ moduleId, category, rounds }));
    localStorage.removeItem(PKM_RESULT_KEY); // dọn kết quả cũ (nếu có) trước khi sang game mới
    location.href = chosen;
    throw new PkmGameNavigating();
  },

  // Gọi bởi TRANG GAME lúc khởi động, để lấy dữ liệu câu hỏi cần chơi.
  getLaunchPayload() {
    try { return JSON.parse(localStorage.getItem(PKM_LAUNCH_KEY)); }
    catch (e) { return null; }
  },

  // Gọi bởi TRANG GAME khi đã chơi xong hết `rounds`, TRƯỚC khi quay lại.
  // `results`: mảng cùng thứ tự `rounds`, mỗi phần tử là attemptsUsed
  // (số nguyên >=1, 1 = đúng ngay lần đầu) — đúng shape recordQuestionPassed() cần.
  finishAndReturn(moduleId, results) {
    localStorage.setItem(PKM_RESULT_KEY, JSON.stringify({ moduleId, results }));
    localStorage.removeItem(PKM_LAUNCH_KEY);
    location.href = "all-shared.html";
  },

  // Gọi bởi MODULE lúc bắt đầu chạy lại, để biết có đang "vừa quay về từ
  // game" hay không. Trả về mảng results nếu có (và tự xoá luôn, dùng 1
  // lần), null nếu không phải đang quay về.
  consumeResult(moduleId) {
    try {
      const raw = localStorage.getItem(PKM_RESULT_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.moduleId !== moduleId) return null; // kết quả của module khác, bỏ qua
      localStorage.removeItem(PKM_RESULT_KEY);
      return data.results;
    } catch (e) { return null; }
  },
};
