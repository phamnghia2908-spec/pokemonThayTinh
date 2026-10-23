/**
 * ============================================================================
 * POKEMON QUIZ MANAGER — V2.0 (REBUILD 4 KỸ NĂNG: NGHE - NÓI - ĐỌC - VIẾT)
 * ============================================================================
 * BỐ CỤC FILE (để sau này sửa/bổ sung cho dễ tìm):
 *   1. CẤU HÌNH THEO CẤP ĐỘ      — mọi con số Dễ/TB/Khó để hết ở đây
 *   2. HÀM DÙNG CHUNG (LOGIC)    — không đụng DOM, thuần xử lý dữ liệu
 *   3. GIAO DIỆN DÙNG CHUNG      — các hàm render tái sử dụng nhiều nơi
 *   4. KỸ NĂNG NGHE   (listening1-4)
 *   5. KỸ NĂNG NÓI    (speaking1-4)   — ghi âm kiểu iSpeak (MediaRecorder + Whisper)
 *   6. KỸ NĂNG ĐỌC    (reading1-5)
 *   7. KỸ NĂNG VIẾT   (writing1-5)
 *   8. LẮP RÁP window.QuizManager
 *
 * Muốn thêm 1 dạng bài mới cho kỹ năng nào: viết thêm 1 hàm trong khu vực kỹ
 * năng đó (vd "listening5"), rồi thêm tên hàm vào SKILL_SUBTYPES.listening.
 * Không cần đụng gì thêm — bể random tự nhận dạng mới.
 * ============================================================================
 */

import imageCache from "./pkm-image.js?update=now";
import { startRecording, transcribeAudio } from "./all-shared.js";

/* ============================================================================
 * 0. TTS TIẾNG VIỆT — dùng riêng cho mọi nội dung tiếng Việt (nghĩa từ...),
 *    KHÔNG dùng this.speak() (Web Speech API en-US) cho phần tiếng Việt.
 * ============================================================================ */

const VI_TTS_BASE = "https://googlevoice-tinh.onrender.com";
const _viAudioCache = new Map();
let _viAudioCtx = null;
function _getViAudioCtx() {
    if (!_viAudioCtx) _viAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_viAudioCtx.state === "suspended") _viAudioCtx.resume();
    return _viAudioCtx;
}
// mới
function speakVI(text, speed = 0.9) {
    return new Promise(async (resolve) => {
        if (!text) return resolve();
        try {
            const key = `vi|${speed}|${text}`;
            let buf = _viAudioCache.get(key);
            if (!buf) {
                const url = `${VI_TTS_BASE}/tts?q=${encodeURIComponent(text)}&speed=${speed}&lang=vi-VN&voice=`;
                // Cầu chì mạng: server TTS chạy trên Render free-tier có thể "ngủ
                // đông" và phản hồi rất chậm/không phản hồi — không giới hạn thời
                // gian thì fetch() có thể treo rất lâu.
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

/* ============================================================================
 * 1. CẤU HÌNH THEO CẤP ĐỘ — sau này chỉnh số thì chỉnh ở đây, khỏi lục code
 * ============================================================================ */

const LEVEL_CONFIG = {
    de: {
        label: "Dễ",
        paragraphSentences: 4,   // listening3, reading3: số câu trong đoạn văn/hội thoại
        dialogueTurns: 2,        // listening4: số lượt hỏi-đáp trong hội thoại
        speakingThreshold: { speaking1: 40, speaking2: 50 }, // % khớp tối thiểu để đạt
        speaking4MinKeywords: 1,
        clozeBlanks: 2,           // reading4: số chỗ trống
        matchPairs: 3,            // reading5: số cặp nối
        ttsRate: 0.8,
        writingHintLevel: "full", // writing1: "full" = gạch dưới + chữ cái đầu
        blurPx: 3,                // writing2: độ mờ ảnh
        hiddenLetterRatio: 0.3,   // writing3: % chữ cái bị ẩn
    },
    tb: {
        label: "Trung bình",
        paragraphSentences: 6,
        dialogueTurns: 3,
        speakingThreshold: { speaking1: 50, speaking2: 65 },
        speaking4MinKeywords: 1,
        clozeBlanks: 3,
        matchPairs: 4,
        ttsRate: 0.9,
        writingHintLevel: "underline",
        blurPx: 8,
        hiddenLetterRatio: 0.5,
    },
    kho: {
        label: "Khó",
        paragraphSentences: 9,
        dialogueTurns: 4,
        speakingThreshold: { speaking1: 65, speaking2: 80 },
        speaking4MinKeywords: 2,
        clozeBlanks: 4,
        matchPairs: 5,
        ttsRate: 1.0,
        writingHintLevel: "none",
        blurPx: 14,
        hiddenLetterRatio: 0.7,
    },
};

// map giá trị lưu trong localStorage("selected_level") của all-shared.js LEVELS
// sang key cấu hình ở trên. mam_non không có cấu hình riêng -> dùng "de".
function mapStoredLevelToConfig(stored) {
    if (stored === "trung_binh") return "tb";
    if (stored === "kho") return "kho";
    return "de";
}

const SKILL_ORDER = ["listening", "speaking", "reading", "writing"];
const SKILL_SUBTYPES = {
    listening: ["listening1", "listening2", "listening3", "listening4"],
    speaking: ["speaking1", "speaking2", "speaking3", "speaking4"],
    reading: ["reading1", "reading2", "reading3", "reading4", "reading5"],
    writing: ["writing1", "writing2", "writing3", "writing4", "writing5"],
};

// Cấp độ tối thiểu để 1 dạng bài được xuất hiện trong bể random. Dạng nào
// không có trong bảng này thì coi như xuất hiện ở MỌI cấp độ.
const SUBTYPE_MIN_LEVEL = {
    speaking4: "kho", // trả lời tự do, không gợi ý — chỉ Khó
    writing4: "kho",  // dịch cụm từ — chỉ Khó
};
const LEVEL_RANK = { de: 0, tb: 1, kho: 2 };
function isSubtypeAllowedAtLevel(typeName, levelKey) {
    const minLevel = SUBTYPE_MIN_LEVEL[typeName] || "de";
    return (LEVEL_RANK[levelKey] ?? 0) >= (LEVEL_RANK[minLevel] ?? 0);
}

/* ============================================================================
 * 2. HÀM DÙNG CHUNG (LOGIC THUẦN — KHÔNG ĐỘNG DOM)
 * ============================================================================ */

function shuffleArr(arr) {
    const a = [...(arr || [])];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function normalizeText(text) {
    if (!text) return "";
    return text.toString().toLowerCase().trim()
        .replace(/[.,!?;:]/g, "")
        .replace(/\s+/g, " ");
}

function ensureDotText(text) {
    if (!text) return "";
    text = text.trim();
    return /[.!?]$/.test(text) ? text : text + ".";
}

function normalizeUnitIdStr(unitStr) {
    if (!unitStr) return 0;
    if (unitStr.includes("-")) {
        const parts = unitStr.split("-");
        if (parts.length < 3) return 0;
        const [cls, lesson, part] = parts;
        return parseInt(cls) * 1000 + parseInt(lesson) * 10 + parseInt(part);
    }
    return parseInt(unitStr.replace(/\D/g, "")) || 0;
}

function checkAccuracyPercent(userText, targetText) {
    const clean = (str) => (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
    const userWords = clean(userText);
    const targetWords = clean(targetText);
    if (!targetWords.length) return 0;
    let correct = 0;
    targetWords.forEach((w) => { if (userWords.includes(w)) correct++; });
    return Math.round((correct / targetWords.length) * 100);
}

function extractKeywords(rawK) {
    const matches = (rawK || "").match(/"([^"]+)"/g);
    if (!matches) return [];
    return matches.map((s) => s.replace(/"/g, "").toLowerCase().trim()).filter(Boolean);
}

function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const POSITIVE_PHRASES = ["Bravo!", "Excellent!", "Great job!", "Awesome!", "Well done!", "Fantastic!", "You got it!", "Perfect!"];
const RETRY_PHRASES = ["Try again!", "Try harder!", "Almost there!", "Good try, once more!", "Keep going!", "So close!"];

/**
 * Tạo danh sách đáp án MCQ dùng chung cho mọi dạng trắc nghiệm.
 * - Ưu tiên tối thiểu `minSameLesson` nhiễu CÙNG bài với đáp án đúng.
 * - Nếu pool không đủ để đạt `maxOptions` thì trả về ÍT HƠN (tối thiểu chỉ còn
 *   đáp án đúng + 1 nhiễu) thay vì cố nhồi cho đủ 4 — đúng theo yêu cầu.
 */
function buildQuizOptions(correctValue, pool, opts = {}) {
    const {
        field = "word",
        sameLessonId = null,
        minSameLesson = 1,
        maxOptions = 4,
        extraPool = [],
    } = opts;

    const correctNorm = (correctValue || "").toString().trim().toLowerCase();
    const validItem = (it) => {
        const v = (it[field] || "").toString().trim();
        return v && v.toLowerCase() !== correctNorm;
    };

    const sameLessonItems = shuffleArr((pool || []).filter((it) => it.lessonId === sameLessonId && validItem(it)));
    const otherItems = shuffleArr((pool || []).filter((it) => it.lessonId !== sameLessonId && validItem(it)));
    const extraItems = shuffleArr((extraPool || []).filter(validItem));

    const wanted = maxOptions - 1;
    const picked = [];
    const used = new Set([correctNorm]);

    const tryAdd = (list, limit) => {
        for (const it of list) {
            if (picked.length >= limit) break;
            const v = it[field].toString().trim();
            const key = v.toLowerCase();
            if (used.has(key)) continue;
            used.add(key);
            picked.push(v);
        }
    };

    tryAdd(sameLessonItems, Math.min(minSameLesson, wanted)); // 1. ưu tiên cùng bài
    tryAdd(otherItems, wanted);                               // 2. lấp bằng khác bài
    tryAdd(sameLessonItems, wanted);                           // 3. vét thêm cùng bài
    tryAdd(extraItems, wanted);                                 // 4. vét thêm nguồn phụ

    return shuffleArr([correctValue, ...picked]); // length >= 1, có thể < maxOptions
}

/* ============================================================================
 * 3. GIAO DIỆN DÙNG CHUNG (RENDER HELPERS TÁI SỬ DỤNG)
 * ============================================================================ */

const sharedUIMethods = {
    injectQuizStyles() {
        if (this._qzStylesInjected) return;
        this._qzStylesInjected = true;
        const style = document.createElement("style");
        style.textContent = `
            .qz-wordbox { background: rgba(0,0,0,0.6); padding:18px; border-radius:15px; color:#fff; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,.3); }
            .qz-instruction { font-size:14px; color:#ffcb05; margin-bottom:8px; font-weight:bold; }
            .qz-question { font-size:1.2rem; font-weight:bold; }
            .qz-options { display:flex; flex-direction:column; gap:8px; margin-top:4px; }
            .qz-option-btn { padding:12px 18px; border-radius:10px; border:2px solid #555; background:#222; color:#fff; font-size:16px; cursor:pointer; transition:0.2s; margin:0; }
            .qz-option-btn:hover { border-color:#ffcb05; }
            .qz-skip-btn { margin-top:16px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.3); color:#ddd; cursor:pointer; padding:8px 15px; border-radius:8px; font-size:13px; }
            .qz-input { padding:12px; font-size:18px; border-radius:10px; width:80%; max-width:320px; background:#222; border:2px solid #3498db; color:#fff; text-align:center; }
            .qz-mic-ring { width:80px; height:80px; border-radius:50%; background:#27ae60; display:inline-flex; align-items:center; justify-content:center; font-size:34px; transition:0.2s; box-shadow:0 0 0 0 rgba(39,174,96,.5); }
            .qz-mic-ring.qz-listening { animation:qzMicPulse 1s infinite; }
            .qz-mic-ring.qz-locked { opacity:0.35; filter:grayscale(1); }
            @keyframes qzMicPulse { 0%{box-shadow:0 0 0 0 rgba(39,174,96,.6);} 70%{box-shadow:0 0 0 16px rgba(39,174,96,0);} 100%{box-shadow:0 0 0 0 rgba(39,174,96,0);} }
            .qz-btn-row { display:flex; gap:10px; justify-content:center; margin-top:14px; flex-wrap:wrap; }
            .qz-btn { padding:10px 20px; border-radius:20px; border:none; font-weight:bold; cursor:pointer; }
            .qz-btn.gray { background:#555; color:#ccc; }
            .qz-btn.blue { background:#3498db; color:#fff; }
            .qz-btn.green { background:#2ecc71; color:#fff; }
            .qz-btn:disabled { opacity:0.35; cursor:not-allowed; }
            .qz-result-line { margin-top:10px; font-size:14px; color:#ccc; min-height:20px; text-align:center; }
        `;
        document.head.appendChild(style);
    },

    setOverlayTransparent() {
        const overlay = document.getElementById("quiz-overlay");
        if (overlay) {
            overlay.style.display = "flex";
            overlay.style.backgroundColor = "transparent";
            overlay.style.backdropFilter = "none";
            overlay.style.backgroundImage = "none";
        }
    },

    // Khoá toàn bộ nút/ô nhập trong khu vực câu hỏi lúc máy đang đọc đề bài.
    lockAnswerArea() {
        ["quiz-word", "quiz-options"].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.pointerEvents = "none";
            el.style.opacity = "0.5";
            el.querySelectorAll("input, button").forEach((c) => (c.disabled = true));
        });
    },
    unlockAnswerArea() {
        ["quiz-word", "quiz-options"].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.pointerEvents = "auto";
            el.style.opacity = "1";
            el.querySelectorAll("input, button").forEach((c) => (c.disabled = false));
        });
    },

    // Dùng để "đóng băng" các lựa chọn ngẫu nhiên của 1 câu hỏi ngay từ lần
    // render ĐẦU TIÊN — khi vào lượt làm lại bắt buộc (this._isRetryAttempt),
    // trả về đúng giá trị đã lưu thay vì random mới, đảm bảo làm lại là Y HỆT câu cũ.
    useRetryState(key, computeFn) {
        if (!this._retryState) this._retryState = {};
        if (this._isRetryAttempt && key in this._retryState) {
            return this._retryState[key];
        }
        const val = computeFn();
        this._retryState[key] = val;
        return val;
    },

    renderLoading() {
        const wordBox = this.resetWordBox();
        if (wordBox) wordBox.innerHTML = `<div style="color:#ffd54f;font-size:14px;">🔍 Đang tìm ảnh thực tế...</div>`;
    },

    // Xoá sạch inline style còn sót lại từ lần render trước (vd nền trắng của
    // dạng Đọc/Cloze/Nối câu/Dịch cụm) trước khi render dạng mới — tránh tình
    // trạng chữ trắng trên nền trắng (vô hình) khi 2 dạng liên tiếp khác kiểu nền.
    resetWordBox() {
        const wordBox = document.getElementById("quiz-word");
        if (wordBox) wordBox.removeAttribute("style");
        return wordBox;
    },

    // Danh sách nút đáp án + nút skip — dùng chung cho mọi dạng MCQ
    renderOptionsList(optionsBox, options) {
        if (!optionsBox) return;
        optionsBox.innerHTML = `<div class="qz-options" id="qzOptWrap"></div>`;
        const wrap = optionsBox.querySelector("#qzOptWrap");
        options.forEach((opt) => {
            const btn = document.createElement("button");
            btn.className = "qz-option-btn option-btn";
            btn.innerText = opt;
            btn.onclick = () => { this.stopTimer(); this.handleAnswer(opt, btn); };
            wrap.appendChild(btn);
        });
        // Lượt làm lại bắt buộc (sau khi trả lời sai lần đầu) thì KHÔNG cho Skip nữa —
        // trừ các dạng Nói (renderSpeakingRecorder tự có nút Skip riêng, không đi qua đây).
        if (!this._isRetryAttempt) {
            const skipBtn = document.createElement("button");
            skipBtn.className = "qz-skip-btn";
            skipBtn.innerText = "⏭ Skip";
            skipBtn.onclick = () => {
                if (skipBtn.disabled) return;
                skipBtn.disabled = true;
                skipBtn.style.opacity = "0.5";
                this.handleSkip();
            };
            optionsBox.appendChild(skipBtn);
        }
    },

    // MCQ đơn giản: câu hỏi + N đáp án (dùng cho listening2, reading1, reading3...)
    renderMCQ({ instruction, questionHTML, options, correctValue, extraHeaderHTML = "" }) {
        this.stopTimer();
        this.correctAnswer = correctValue;
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            wordBox.className = "qz-wordbox";
            wordBox.innerHTML = `
                ${instruction ? `<div class="qz-instruction">${instruction}</div>` : ""}
                ${extraHeaderHTML}
                <div class="qz-question">${questionHTML}</div>`;
        }
        this.renderOptionsList(optionsBox, options);
        this.startAutoSkipTimer();
    },

    // MCQ có nút phát 1 đoạn audio (đoạn văn) trước khi trả lời — listening3
    renderParagraphAudio({ instruction, playText, questionText, options, correctValue }) {
        this.correctAnswer = correctValue;
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            wordBox.className = "qz-wordbox";
            wordBox.innerHTML = `
                <div class="qz-instruction">${instruction}</div>
                <button id="qzPlayParagraph" class="qz-btn blue" style="width:70px;height:70px;border-radius:50%;font-size:26px;">🔊</button>
                <div style="margin-top:12px;font-size:1.05rem;color:#ffeb3b;font-weight:bold;">Q: ${questionText}</div>`;
        }
        this.renderOptionsList(optionsBox, options);
        this.lockAnswerArea();

        const playBtn = document.getElementById("qzPlayParagraph");
        let isPlaying = false;
        const playParagraph = async () => {
            if (isPlaying) return;
            isPlaying = true;
            playBtn.style.opacity = "0.5";
            await this.speak(playText, 0.9);
            isPlaying = false;
            playBtn.style.opacity = "1";
        };
        playBtn.onclick = playParagraph;

        (async () => {
            await this.speak(instruction);
            await playParagraph(); // đợi đọc XONG HẲN đoạn văn rồi mới mở khoá
            this.unlockAnswerArea();
        })();
    },

    // MCQ có nút phát hội thoại 2 giọng — listening4
    renderDialogueAudio({ instruction, turns, questionText, options, correctValue }) {
        this.correctAnswer = correctValue;
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            wordBox.className = "qz-wordbox";
            wordBox.innerHTML = `
                <div class="qz-instruction">${instruction}</div>
                <button id="qzPlayDialogue" class="qz-btn blue" style="width:70px;height:70px;border-radius:50%;font-size:26px;">🔊</button>
                <div style="margin-top:12px;font-size:1.05rem;color:#ffeb3b;font-weight:bold;">Q: ${questionText}</div>`;
        }
        this.renderOptionsList(optionsBox, options);
        this.lockAnswerArea();

        const playBtn = document.getElementById("qzPlayDialogue");
        let isPlaying = false;
        const playDialogue = async () => {
            if (isPlaying) return;
            isPlaying = true;
            playBtn.style.opacity = "0.5";
            for (const t of turns) {
                await this.speakAs(t.question, "A");
                await this.speakAs(t.finalAns, "B");
            }
            isPlaying = false;
            playBtn.style.opacity = "1";
        };
        playBtn.onclick = playDialogue;

        (async () => {
            await this.speak(instruction);
            await playDialogue(); // đợi đọc XONG HẲN hội thoại rồi mới mở khoá
            this.unlockAnswerArea();
        })();
    },

    // Ô nhập chữ đơn giản (dùng cho writing1)
    renderTypedAnswer({ instruction, headerHTML, correctValue, placeholder = "Type here..." }) {
        this.stopTimer();
        this.correctAnswer = correctValue;
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            wordBox.className = "qz-wordbox";
            wordBox.innerHTML = `${instruction ? `<div class="qz-instruction">${instruction}</div>` : ""}${headerHTML}`;
        }
        if (optionsBox) {
            optionsBox.innerHTML = `
                <input type="text" id="qzTypedInput" class="qz-input" placeholder="${placeholder}" autocomplete="off"/>
                <div class="qz-btn-row">
                    <button id="qzSubmitBtn" class="qz-btn blue">✅ Check</button>
                    ${this._isRetryAttempt ? "" : `<button id="qzSkipBtn" class="qz-btn gray">⏭ Skip</button>`}
                </div>`;
            const input = document.getElementById("qzTypedInput");
            const submitBtn = document.getElementById("qzSubmitBtn");
            setTimeout(() => input.focus(), 300);
            const check = async () => {
                const userVal = input.value.trim();
                if (!userVal) return;
                this.stopTimer();
                input.disabled = true;
                await this.speak(userVal); // đọc to đáp án vừa gõ (tiếng Anh)
                this.showFeedback(normalizeText(userVal) === normalizeText(correctValue), correctValue);
            };
            submitBtn.onclick = check;
            input.onkeydown = (e) => { if (e.key === "Enter") check(); };
            const skipBtn = document.getElementById("qzSkipBtn");
            if (skipBtn) skipBtn.onclick = () => this.handleSkip();
        }
        this.startTimer(60000);
    },

    // Câu hỏi phụ trước mỗi câu chính — CHỈ dùng nhiễu trong currentLessonData (từ đang học buổi này)
    renderPreMeaningUI(questionText, options, correctAns, onCorrect, onWrongRetry, optionLang) {
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            wordBox.className = "qz-wordbox";
            wordBox.innerHTML = `
                <div style="font-size:12px;color:#ffcb05;margin-bottom:6px;text-transform:uppercase;">🔎 Kiểm tra nhanh (không tính điểm)</div>
                <div class="qz-question">${questionText}</div>`;
        }
        if (optionsBox) {
            optionsBox.innerHTML = `<div class="qz-options" id="qzOptWrap"></div>`;
            const wrap = optionsBox.querySelector("#qzOptWrap");
            options.forEach((opt) => {
                const btn = document.createElement("button");
                btn.className = "qz-option-btn";
                btn.innerText = opt;
                btn.onclick = async () => {
                    wrap.querySelectorAll("button").forEach((b) => (b.style.pointerEvents = "none"));
                    if (optionLang === "vi") await speakVI(opt);       // đáp án nghĩa tiếng Việt -> speakVI
                    else await this.speak(opt);                        // đáp án từ tiếng Anh -> this.speak
                    const isCorrect = opt === correctAns;
                    btn.style.background = isCorrect ? "#2ecc71" : "#e74c3c";
                    btn.style.color = "#fff";
                    if (!isCorrect) {
                        wrap.querySelectorAll("button").forEach((b) => {
                            if (b.innerText === correctAns) { b.style.background = "#2ecc71"; b.style.color = "#fff"; }
                        });
                    }
                    setTimeout(() => (isCorrect ? onCorrect() : onWrongRetry()), 900);
                };
                wrap.appendChild(btn);
            });
        }
    },

    showReadyScreen(onConfirm) {
        const overlay = document.createElement("div");
        overlay.id = "ready-overlay";
        overlay.style = `position:fixed;top:0;left:0;width:100%;height:100%;background:none;display:flex;align-items:center;justify-content:center;z-index:10000;text-align:center;`;
        overlay.innerHTML = `
            <div style="width:80%;max-width:300px;">
                <img src="https://cdn-icons-png.flaticon.com/512/188/188940.png" style="width:80px;margin-bottom:10px;filter:drop-shadow(0 0 10px rgba(0,0,0,.5));">
                <h2 style="color:#fff;margin-bottom:20px;font-size:28px;text-transform:uppercase;text-shadow:2px 2px 4px #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;">Are you ready?</h2>
                <button id="btn-ready-ok" style="background:#2ecc71;color:#fff;border:2px solid #fff;padding:12px 40px;border-radius:25px;font-size:18px;font-weight:bold;cursor:pointer;width:100%;box-shadow:0 4px 15px rgba(0,0,0,.3);">OK!</button>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById("btn-ready-ok").onclick = async () => {
            await this.speak("");
            overlay.remove();
            if (onConfirm) onConfirm();
        };
    },

    /**
     * Ghi âm kiểu iSpeak dùng chung cho toàn bộ nhóm Nói (speaking1-4).
     * - Đọc hướng dẫn -> đọc mẫu -> TỰ ĐỘNG ghi âm luôn (không cần chạm mic).
     * - Có nút Finish để dừng sớm (mặc định cắt cứng ở maxRecordMs, mốc mặc định 10s).
     * - Khi đang ghi âm: khoá nút "Nghe lại". Khi đang phát "Nghe lại": khoá mic.
     */
    renderSpeakingRecorder({ instruction, promptHTML, targetText, matchFn, maxRecordMs = 10000, onListenAgainText }) {
        this.stopTimer();
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");

        if (wordBox) {
            wordBox.className = "qz-wordbox";
            wordBox.innerHTML = `<div class="qz-instruction">${instruction}</div>${promptHTML}`;
        }
        if (optionsBox) {
            optionsBox.innerHTML = `
                <div id="qzSpStatus" class="qz-result-line">🔊 Listen...</div>
                <div style="text-align:center;"><div class="qz-mic-ring" id="qzMicRing">🎤</div></div>
                <div id="qzSpResult" class="qz-result-line"></div>
                <div class="qz-btn-row">
                    <button id="qzListenAgainBtn" class="qz-btn gray">🔊 Nghe lại</button>
                    <button id="qzFinishBtn" class="qz-btn green" style="display:none;">✅ Finish</button>
                    <button id="qzSkipSpBtn" class="qz-btn gray">⏭ Bỏ qua</button>
                </div>`;
        }
        this.lockAnswerArea();

        const statusEl = document.getElementById("qzSpStatus");
        const micRing = document.getElementById("qzMicRing");
        const resultEl = document.getElementById("qzSpResult");
        const listenBtn = document.getElementById("qzListenAgainBtn");
        const finishBtn = document.getElementById("qzFinishBtn");
        const skipBtn = document.getElementById("qzSkipSpBtn");

        const lockMic = (locked) => { micRing.classList.toggle("qz-locked", locked); };
        const lockListen = (locked) => { listenBtn.disabled = locked; };

        let cancelled = false;    // cờ huỷ riêng cho LƯỢT NÀY — chặn mọi tiến trình chạy ngầm khi đã Skip
        let activeSession = null; // session ghi âm hiện tại, để dừng ngay khi Skip

        skipBtn.onclick = () => {
            if (cancelled) return;
            cancelled = true;
            this.stopTimer();
            window.speechSynthesis.cancel();
            if (activeSession) activeSession.stop(); // dừng ghi âm ngay, không đợi hết maxRecordMs
            this.showFeedback(false, targetText);
        };

        listenBtn.onclick = async () => {
            if (cancelled) return;
            // Đang nghe lại -> khoá mic
            lockMic(true); lockListen(true);
            statusEl.textContent = "🔊 Listening to sample...";
            await this.speak(onListenAgainText || targetText, 0.9);
            if (cancelled) return;
            statusEl.textContent = "🎤 Ready when you are...";
            lockMic(false); lockListen(false);
        };

        const doRecord = async () => {
            if (cancelled) return;
            // Đang ghi âm -> khoá nút nghe lại
            lockListen(true);
            statusEl.textContent = "🎤 Recording... tap Finish when done!";
            micRing.classList.add("qz-listening");
            finishBtn.style.display = "inline-block";

            let session;
            try {
                session = await startRecording(maxRecordMs);
            } catch (e) {
                if (cancelled) return;
                statusEl.textContent = "⚠️ Không truy cập được microphone.";
                micRing.classList.remove("qz-listening");
                finishBtn.style.display = "none";
                lockListen(false);
                this.showFeedback(false, targetText);
                return;
            }
            if (cancelled) { session.stop(); return; }
            activeSession = session;
            finishBtn.onclick = () => session.stop();
            const blob = await session.blob;
            if (cancelled) return;

            finishBtn.style.display = "none";
            micRing.classList.remove("qz-listening");
            statusEl.textContent = "⏳ Đang kiểm tra...";

            const transcript = await transcribeAudio(blob);
            if (cancelled) return;
            if (transcript === null) {
                statusEl.textContent = "⚠️ Không kết nối được máy chủ, thử lại nhé.";
                lockListen(false);
                this.showFeedback(false, targetText);
                return;
            }

            const isCorrect = matchFn(transcript);
            resultEl.innerHTML = transcript ? `🗣️ Bạn nói: "<b>${transcript}</b>"` : `🗣️ (không nghe rõ)`;
            statusEl.textContent = isCorrect ? "🎉 Great job!" : "👍 Nice try!";
            lockListen(false);
            this.showFeedback(isCorrect, targetText);
        };

        (async () => {
            await this.speak(instruction);
            if (cancelled) return;
            if (onListenAgainText || targetText) {
                lockMic(true);
                statusEl.textContent = "🔊 Listen...";
                await this.speak(onListenAgainText || targetText, 0.9);
                if (cancelled) return;
                lockMic(false);
            }
            this.unlockAnswerArea();
            doRecord();
        })();
    },
};

/* ============================================================================
 * 4. CORE: NẠP DỮ LIỆU + ĐIỀU PHỐI LƯỢT HỎI (không thuộc riêng kỹ năng nào)
 * ============================================================================ */

const coreMethods = {
    COLS: {
        LESSON_NAME: 1, WORD: 2, PHRASE_EN: 3, PHRASE_VI: 4,
        PRESENT_SENT: 8, QUESTION: 9, KEYWORD_FIX: 10, FINAL_ANS: 11,
        MEANING: 24, SOUND_PUN: 25, PUN_SENTENCE: 26,
    },

    loadLevel() {
        const stored = localStorage.getItem("selected_level") || "de";
        this.levelKey = mapStoredLevelToConfig(stored);
        this.cfg = LEVEL_CONFIG[this.levelKey];
    },

    async getMaxLessonCodeFromServer() {
        const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
        const sheetUrl = window.SHEET_BAI_HOC;
        try {
            const res = await fetch(sheetUrl);
            const rows = await res.json();
            const baiList = rows
                .map((r) => {
                    const lop = (r[0] || "").toString().trim();
                    const bai = (r[2] || "").toString().trim();
                    return lop === trainerClass && bai ? normalizeUnitIdStr(bai) : null;
                })
                .filter((v) => typeof v === "number" && !isNaN(v) && v > 0);
            if (baiList.length === 0) return null;
            return Math.max(...baiList);
        } catch (err) {
            console.error("❌ Lỗi lấy maxLessonCode:", err);
            return null;
        }
    },

    async prepareData() {
        this.injectQuizStyles();
        this.loadLevel();

        const storedData = sessionStorage.getItem("allVocabData");
        const missionData = localStorage.getItem("current_mission");
        if (!storedData || !missionData) return false;

        const allRows = JSON.parse(storedData);
        const missionObj = JSON.parse(missionData);
        const currentLessonId = missionObj.id;

        const isBoss = !!missionObj.isBoss && Array.isArray(missionObj.bossItems) && missionObj.bossItems.length > 0;
        const bossKeySet = isBoss
            ? new Set(missionObj.bossItems.map((it) => `${(it.lessonId || "").toString().trim()}|||${(it.word || "").toString().trim()}`))
            : null;

        const currentUnitNum = isBoss
            ? Math.max(...missionObj.bossItems.map((it) => normalizeUnitIdStr(it.lessonId)))
            : normalizeUnitIdStr(currentLessonId);

        const serverMax = await this.getMaxLessonCodeFromServer();
        const finalMax = Math.max(serverMax || 0, currentUnitNum || 0);
        const minLessonCode = 2011;

        this.currentLessonData = [];
        this.poolData = [];

        allRows.forEach((row) => {
            const r = Array.isArray(row) ? row : Object.values(row);
            const lessonId = (r[this.COLS.LESSON_NAME] || "").toString().trim();
            const wordRaw = (r[this.COLS.WORD] || "").toString().trim();
            const unitNum = normalizeUnitIdStr(lessonId);

            const item = {
                word: r[this.COLS.WORD] || "",
                meaning: r[this.COLS.MEANING] || "",
                colD: r[this.COLS.PHRASE_EN] || "",
                colE: r[this.COLS.PHRASE_VI] || "",
                question: r[this.COLS.QUESTION] || "",
                keywordFix: r[this.COLS.KEYWORD_FIX] || "",
                finalAns: r[this.COLS.FINAL_ANS] || "",
                presentSent: r[this.COLS.PRESENT_SENT] || "",
                soundPun: r[this.COLS.SOUND_PUN] || "",
                punSentence: r[this.COLS.PUN_SENTENCE] || "",
                lessonId,
            };

            if (item.word) {
                const isCurrentItem = isBoss
                    ? bossKeySet.has(`${lessonId}|||${wordRaw}`)
                    : (lessonId === currentLessonId);
                if (isCurrentItem) this.currentLessonData.push(item);
                if (unitNum >= minLessonCode && unitNum <= finalMax) this.poolData.push(item);
            }
        });

        console.log(`[DataReady] Cấp độ: ${this.levelKey} | Bài hiện tại: ${this.currentLessonData.length} từ | Pool: ${this.poolData.length}`);

        this.refreshWordQueue();
        this.initSkillPools();
        return this.currentLessonData.length > 0;
    },

    refreshWordQueue() {
        this.wordQueue = shuffleArr(this.currentLessonData);
    },

    // Mỗi kỹ năng giữ 1 hàng đợi riêng, không lặp dạng con cho tới khi hết hàng
    // đợi mới nạp lại (giống rút bài không hoàn — hết bộ mới trộn lại). Chỉ
    // đưa vào bể những dạng phù hợp cấp độ hiện tại (this.levelKey).
    initSkillPools() {
        this.skillPools = {};
        Object.keys(SKILL_SUBTYPES).forEach((skill) => {
            const allowed = SKILL_SUBTYPES[skill].filter((t) => isSubtypeAllowedAtLevel(t, this.levelKey));
            this.skillPools[skill] = shuffleArr(allowed.length ? allowed : SKILL_SUBTYPES[skill]);
        });
        this.skillCycleIndex = 0;
    },

    pickNextTypeName() {
        const skill = SKILL_ORDER[this.skillCycleIndex % SKILL_ORDER.length];
        this.skillCycleIndex++;
        if (!this.skillPools[skill] || this.skillPools[skill].length === 0) {
            const allowed = SKILL_SUBTYPES[skill].filter((t) => isSubtypeAllowedAtLevel(t, this.levelKey));
            this.skillPools[skill] = shuffleArr(allowed.length ? allowed : SKILL_SUBTYPES[skill]);
        }
        return this.skillPools[skill].shift();
    },

    async ask(onFinish) {
        this.callback = onFinish;
        if (!this.currentLessonData || this.currentLessonData.length === 0) {
            const ok = await this.prepareData();
            if (!ok) return;
        }
        if (!this.userInteracted) {
            this.showReadyScreen(() => { this.userInteracted = true; this.executeAsk(); });
        } else {
            this.executeAsk();
        }
    },

    async executeAsk() {
        this._answerLocked = false;
        this._feedbackShown = false;
        this._isRetryAttempt = false;
        this._retryState = null;
        if (!this.wordQueue || this.wordQueue.length === 0) this.refreshWordQueue();
        if (!this.skillPools) this.initSkillPools();

        this.setOverlayTransparent();

        const target = this.wordQueue.shift();
        let actualTarget = target;
        if (Math.random() < 0.3 && this.poolData.length >= 3) {
            const candidates = shuffleArr(
                this.poolData.filter((item) => item.lessonId !== target.lessonId && item.word)
            ).slice(0, 3);
            if (candidates.length > 0) actualTarget = candidates[Math.floor(Math.random() * candidates.length)];
        }

        await this.runPreMeaningCheck(actualTarget);

        const typeName = this.pickNextTypeName();
        this._currentTypeName = typeName;
        this._currentTarget = actualTarget;

        console.log(`%c[PKM QUIZ] Dạng: ${typeName} | Từ: ${actualTarget.word} | Cấp độ: ${this.levelKey}`, "color:#ffcb05;background:#3b4cca;padding:2px 5px;border-radius:3px;");

        if (typeof this[typeName] === "function") {
            await this[typeName](actualTarget);
        } else if (this.callback) {
            this.callback(true);
        }
    },

    // Câu hỏi phụ trước mỗi câu — Dễ: dùng chung từ với câu chính (như cũ, có
    // fallback ra poolData nếu buổi học quá ít từ). TB/Khó: chọn 1 từ NGẪU NHIÊN
    // ĐỘC LẬP trong currentLessonData (không liên quan câu chính), không fallback
    // ra ngoài buổi học — thiếu dữ liệu thì bỏ qua câu hỏi phụ lượt đó luôn.
    async runPreMeaningCheck(actualTarget) {
        const isDe = this.levelKey === "de";
        const target = isDe ? actualTarget : shuffleArr(this.currentLessonData)[0];
        if (!target) return;

        return new Promise((resolve) => {
            const attempt = () => {
                const isEnToVi = Math.random() < 0.5;
                const correctAns = isEnToVi ? target.meaning : target.word;

                // Ưu tiên nhiễu trong từ đang học buổi này (currentLessonData)
                const sessionWrongPool = this.currentLessonData
                    .filter((item) => item.word !== target.word)
                    .map((item) => (isEnToVi ? item.meaning : item.word))
                    .filter((v) => v && v !== correctAns);

                let finalWrongs = shuffleArr([...new Set(sessionWrongPool)]).slice(0, 3);

                // CHỈ Dễ mới được bù thêm nhiễu từ poolData khi buổi học quá ít từ.
                // TB/Khó: giữ đúng yêu cầu "không liên quan câu chính, chỉ giới hạn
                // trong từ cần học" — thiếu thì bỏ qua câu hỏi phụ lượt này luôn.
                if (isDe && finalWrongs.length < 3) {
                    const extraWrongPool = this.poolData
                        .filter((item) => item.word !== target.word)
                        .map((item) => (isEnToVi ? item.meaning : item.word))
                        .filter((v) => v && v !== correctAns && !finalWrongs.includes(v));
                    const extra = shuffleArr([...new Set(extraWrongPool)]).slice(0, 3 - finalWrongs.length);
                    finalWrongs = [...finalWrongs, ...extra];
                }

                if (finalWrongs.length === 0) { resolve(); return; }

                const options = shuffleArr([correctAns, ...finalWrongs]);
                const questionText = isEnToVi
                    ? `What is the meaning of "${target.word}"?`
                    : `Which word means "${target.meaning}"?`;

                // isEnToVi=true  -> câu hỏi THUẦN tiếng Anh, đáp án là NGHĨA tiếng Việt.
                // isEnToVi=false -> câu hỏi GHÉP (khung Anh + nghĩa Việt), đáp án là TỪ tiếng Anh.
                this.renderPreMeaningUI(questionText, options, correctAns, () => resolve(), attempt, isEnToVi ? "vi" : "en");

                if (isEnToVi) {
                    this.speak(questionText); // câu hỏi thuần tiếng Anh -> đọc thẳng
                } else {
                    (async () => {
                        await this.speak(`Which word means`); // khung câu tiếng Anh
                        await speakVI(target.meaning);         // nghĩa tiếng Việt đọc riêng bằng speakVI
                    })();
                }
            };
            attempt();
        });
    },

    // mới
    async speak(text, rate) {
        return new Promise((resolve) => {
            window.speechSynthesis.cancel();
            if (!text) { resolve(); return; }
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = "en-US";
            utter.rate = rate != null ? rate : (this.cfg ? this.cfg.ttsRate : 0.9);
            let done = false;
            const finish = () => { if (done) return; done = true; resolve(); };
            // Cầu chì an toàn: speechSynthesis đôi lúc KHÔNG BAO GIỜ bắn onend/onerror
            // (lỗi có thật, đặc biệt sau cancel() gọi liên tiếp nhiều lần) — không có
            // cầu chì này thì mọi await this.speak(...) phía sau treo vĩnh viễn, kéo
            // theo cả trận đấu/game đứng hình.
            const safety = setTimeout(finish, Math.max((text.length * 130) / (utter.rate || 1), 4000));
            utter.onend = () => { clearTimeout(safety); finish(); };
            utter.onerror = () => { clearTimeout(safety); finish(); };
            window.speechSynthesis.speak(utter);
        });
    },

    // Giọng thứ 2 dùng cho hội thoại (listening4): ưu tiên 2 giọng khác nhau nếu
    // máy có sẵn, nếu không thì phân biệt bằng pitch để học sinh vẫn nghe ra 2 vai.
    // mới
    async speakAs(text, voiceRole = "A") {
        return new Promise((resolve) => {
            window.speechSynthesis.cancel();
            if (!text) { resolve(); return; }
            const voices = window.speechSynthesis.getVoices();
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = "en-US";
            if (voiceRole === "A") {
                utter.voice = voices.find((v) => v.lang === "en-US" && /david|male|alex/i.test(v.name)) || voices.find((v) => v.lang === "en-US") || null;
                utter.pitch = 1;
            } else {
                utter.voice = voices.find((v) => v.lang === "en-US" && /zira|female|samantha/i.test(v.name)) || voices.find((v) => v.lang === "en-US") || null;
                utter.pitch = 1.3;
            }
            utter.rate = this.cfg ? this.cfg.ttsRate : 0.9;
            let done = false;
            const finish = () => { if (done) return; done = true; resolve(); };
            const safety = setTimeout(finish, Math.max((text.length * 130) / (utter.rate || 1), 4000));
            utter.onend = () => { clearTimeout(safety); finish(); };
            utter.onerror = () => { clearTimeout(safety); finish(); };
            window.speechSynthesis.speak(utter);
        });
    },

    ensureDot(text) { return ensureDotText(text); },
    normalize(text) { return normalizeText(text); },

    stopTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } },
    startAutoSkipTimer() { this.stopTimer(); this.timer = setTimeout(() => this.handleSkip(), 60000); },
    startTimer(duration = 60000) { this.stopTimer(); this.timer = setTimeout(() => this.handleSkip(), duration); },

    handleSkip() {
        if (this._feedbackShown) return;
        this._feedbackShown = true;
        this.stopTimer();
        window.speechSynthesis.cancel();
        document.querySelectorAll(".option-btn, .cloze-btn, .match-node, button").forEach((el) => {
            const clone = el.cloneNode(true);
            el.parentNode?.replaceChild(clone, el);
        });
        const overlay = document.getElementById("quiz-overlay");
        if (overlay) overlay.style.display = "none";
        if (this.callback) this.callback(false);
    },

    async handleAnswer(selected, btn) {
        if (this._answerLocked) return;
        this._answerLocked = true;
        await this.speak(selected); // đọc to đáp án vừa chọn (tiếng Anh)
        const isCorrect = selected === this.correctAnswer;
        btn.style.background = isCorrect ? "#2ecc71" : "#e74c3c";
        btn.style.color = "#fff";
        this.showFeedback(isCorrect, this.correctAnswer);
    },

    showFeedback(isCorrect, correctValue) {
        if (this._feedbackShown) return;
        this._feedbackShown = true;

        document.querySelectorAll(".option-btn, .cloze-btn, .match-node, .qz-skip-btn").forEach((el) => {
            const clone = el.cloneNode(true);
            el.parentNode?.replaceChild(clone, el);
        });

        [
            "qzSubmitBtn", "qzSkipBtn", "qzListenAgainBtn", "qzFinishBtn", "qzSkipSpBtn",
            "qzUnscrambleCheck", "qzClozeCheck", "qzMatchSubmit", "qzPwSubmit",
            "qzPhraseSubmit", "qzPhraseSkip", "qzShowHintBtn", "qzHintAudioBtn", "qzMeaningHintBtn",
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const clone = el.cloneNode(true);
            el.parentNode?.replaceChild(clone, el);
            clone.disabled = true;
            clone.style.opacity = "0.5";
        });

        const allBtns = document.querySelectorAll(".option-btn, .qz-skip-btn");
        const inputEl = document.getElementById("qzTypedInput");
        // KHÔNG dùng resetWordBox() ở đây — giữ nguyên giao diện câu hỏi vừa hiện,
        // chỉ thêm dòng khen/động viên vào bên dưới.
        const wordBox = document.getElementById("quiz-word");
        const overlay = document.getElementById("quiz-overlay");

        const praiseText = isCorrect ? randomPick(POSITIVE_PHRASES) : randomPick(RETRY_PHRASES);
        if (wordBox) {
            const feedbackDiv = document.createElement("div");
            if (isCorrect) {
                feedbackDiv.style = "color:#2ecc71;margin-top:15px;font-weight:bold;font-size:18px;text-align:center;";
                feedbackDiv.innerText = "🎉 " + praiseText;
            } else {
                feedbackDiv.style = "color:#e74c3c;margin-top:15px;font-weight:bold;background:rgba(255,255,255,0.9);padding:10px;border-radius:10px;border:2px solid #e74c3c;text-align:center;";
                feedbackDiv.innerHTML = `💡 ${praiseText}<br/>❌ Correct: <span style="color:#2ecc71">${correctValue}</span>`;
            }
            wordBox.appendChild(feedbackDiv);
        }
        this.speak(praiseText); // đọc TTS lời khen/động viên, không cần chờ

        allBtns.forEach((b) => (b.style.pointerEvents = "none"));
        if (inputEl) inputEl.disabled = true;

        const isRetryRound = this._isRetryAttempt === true;

        setTimeout(() => {
            if (isCorrect || isRetryRound) {
                // Đúng ngay lần đầu -> xong luôn, báo đúng kết quả lần này.
                // Hoặc đây đã là lượt LÀM LẠI bắt buộc (dù đúng hay sai) -> xong luôn,
                // luôn báo SAI về trận đấu vì chỉ vào lượt làm lại khi đã sai lần đầu.
                const finalResult = isRetryRound ? false : isCorrect;
                this._isRetryAttempt = false;
                if (overlay) { overlay.style.display = "none"; overlay.style.backgroundColor = "transparent"; }
                if (this.callback) this.callback(finalResult);
            } else {
                // Sai lần đầu -> bắt làm lại ĐÚNG câu này 1 lần (không phải câu mới),
                // chưa báo kết quả về trận đấu vội. Overlay giữ nguyên hiển thị.
                this._isRetryAttempt = true;
                this._feedbackShown = false;
                this._answerLocked = false;
                const typeName = this._currentTypeName;
                const target = this._currentTarget;
                if (typeName && target && typeof this[typeName] === "function") {
                    this[typeName](target);
                } else if (this.callback) {
                    this._isRetryAttempt = false;
                    if (overlay) { overlay.style.display = "none"; overlay.style.backgroundColor = "transparent"; }
                    this.callback(false);
                }
            }
        }, 2000);
    },
};

/* ============================================================================
 * 5. KỸ NĂNG NGHE (listening1 - listening4)
 * ============================================================================ */

const listeningMethods = {
    // listening1: đọc Q+Ans (từ khóa ẩn) -> chọn từ điền chỗ trống
    async listening1(target) {
        if (!target.question || !target.finalAns) return this.ask(this.callback);
        this.stopTimer();
        const instruction = "Listen and fill in the missing word.";
        const correctAns = target.word.trim();
        const regex = new RegExp(`\\b${correctAns}\\b`, "gi");
        const displayQ = target.question.replace(regex, "_______");
        const displayAns = target.finalAns.replace(regex, "_______");
        const textToSpeak = `${target.question}. ${target.finalAns}`;

        const options = this.useRetryState("listening1", () => buildQuizOptions(correctAns, this.poolData, {
            field: "word", sameLessonId: target.lessonId, minSameLesson: 1,
            maxOptions: 4, extraPool: this.currentLessonData,
        }));

        this.renderMCQ({
            instruction,
            questionHTML: `Q: ${displayQ}<br/>Ans: ${displayAns}`,
            extraHeaderHTML: `<button id="qzReplayAudio" class="qz-btn blue" style="margin-bottom:10px;">🔊 Nghe lại</button>`,
            options, correctValue: correctAns,
        });
        document.getElementById("qzReplayAudio").onclick = () => this.speak(textToSpeak);
        this.lockAnswerArea();

        await this.speak(instruction);
        await this.speak(textToSpeak);
        this.unlockAnswerArea();
    },

    // listening2: đọc 1 câu mô tả -> chọn đúng câu trong 4 lựa chọn văn bản
    async listening2(target) {
        if (!target.presentSent) return this.ask(this.callback);
        const instruction = "Listen and choose the correct sentence.";
        const correctAns = target.presentSent;
        const options = this.useRetryState("listening2", () => buildQuizOptions(correctAns, this.poolData, {
            field: "presentSent", sameLessonId: target.lessonId, minSameLesson: 1,
            maxOptions: 4, extraPool: this.currentLessonData,
        }));
        this.renderMCQ({
            instruction,
            questionHTML: `<div id="qzReplaySent" style="cursor:pointer;">🔊<div style="font-size:13px;color:#2ecc71;">(Tap to listen again)</div></div>`,
            options, correctValue: correctAns,
        });
        document.getElementById("qzReplaySent").onclick = () => this.speak(target.presentSent);
        this.lockAnswerArea();
        await this.speak(instruction);
        await this.speak(target.presentSent);
        this.unlockAnswerArea();
    },

    // listening3: đọc đoạn văn N câu (trộn nhiễu từ bài khác) -> chọn đáp án cho câu hỏi
    async listening3(target) {
        if (!target.presentSent || !target.question || !target.finalAns) return this.ask(this.callback);
        this.stopTimer();
        const n = this.cfg.paragraphSentences;

        const data = this.useRetryState("listening3", () => {
            const noiseSentences = shuffleArr(
                this.poolData.filter((it) => it.word !== target.word && it.presentSent && it.presentSent.trim())
            ).slice(0, n - 1).map((it) => this.ensureDot(it.presentSent));
            const actualCount = 1 + noiseSentences.length; // có thể < n nếu poolData không đủ câu nhiễu
            const fullParagraph = shuffleArr([this.ensureDot(target.presentSent), ...noiseSentences]).join(" ");
            const correctAns = target.finalAns;
            const options = buildQuizOptions(correctAns, this.poolData, {
                field: "finalAns", sameLessonId: target.lessonId, minSameLesson: 1,
                maxOptions: 4, extraPool: this.currentLessonData,
            });
            return { actualCount, fullParagraph, correctAns, options };
        });

        const instruction = `Listen to the ${data.actualCount}-sentence paragraph and answer.`;
        this.renderParagraphAudio({ instruction, playText: data.fullParagraph, questionText: target.question, options: data.options, correctValue: data.correctAns });
        this.startTimer(60000);
    },

    // listening4 (MỚI): đọc hội thoại N lượt hỏi-đáp (2 giọng) -> chọn đáp án cho câu hỏi của từ mục tiêu
    async listening4(target) {
        if (!target.question || !target.finalAns) return this.ask(this.callback);
        this.stopTimer();
        const n = this.cfg.dialogueTurns;
        const instruction = "Listen to the conversation and answer.";

        const data = this.useRetryState("listening4", () => {
            const otherTurns = shuffleArr(
                this.poolData.filter((it) => it.word !== target.word && it.question && it.finalAns)
            ).slice(0, n - 1);
            const turns = shuffleArr([target, ...otherTurns]);
            const correctAns = target.finalAns;
            const options = buildQuizOptions(correctAns, this.poolData, {
                field: "finalAns", sameLessonId: target.lessonId, minSameLesson: 1,
                maxOptions: 4, extraPool: this.currentLessonData,
            });
            return { turns, correctAns, options };
        });

        this.renderDialogueAudio({ instruction, turns: data.turns, questionText: target.question, options: data.options, correctValue: data.correctAns });
        this.startTimer(60000);
    },
};

/* ============================================================================
 * 6. KỸ NĂNG NÓI (speaking1 - speaking4) — ghi âm kiểu iSpeak dùng chung
 * ============================================================================ */

const speakingMethods = {
    // speaking1: đọc to 1 câu ngẫu nhiên, chấm theo % từ khớp
    async speaking1(target) {
        const candidates = [target.presentSent, target.question, target.finalAns].filter((t) => t && t.length > 0);
        const textToSay = this.useRetryState("speaking1", () =>
            candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : target.word
        );
        const threshold = this.cfg.speakingThreshold.speaking1;
        this.renderSpeakingRecorder({
            instruction: "Read this out loud!",
            promptHTML: `<div style="font-size:1.3rem;font-weight:bold;margin-top:8px;">"${textToSay}"</div>`,
            targetText: textToSay,
            matchFn: (heard) => checkAccuracyPercent(heard, textToSay) >= threshold,
            onListenAgainText: textToSay,
        });
    },

    // speaking2: đọc to cả kịch bản Q&A, chấm chặt hơn
    async speaking2(target) {
        if (!target.question || !target.finalAns) return this.ask(this.callback);
        const script = `${target.question} ${target.finalAns}`.trim();
        const threshold = this.cfg.speakingThreshold.speaking2;
        this.renderSpeakingRecorder({
            instruction: "Read the script out loud!",
            promptHTML: `
                <div style="background:#333;padding:14px;border-radius:10px;text-align:left;line-height:1.6;margin-top:8px;">
                    <div>Q: ${target.question}</div><div>A: ${target.finalAns}</div>
                </div>`,
            targetText: script,
            matchFn: (heard) => checkAccuracyPercent(heard, script) >= threshold,
            onListenAgainText: script,
        });
    },

    // speaking3: nhìn hình + nghĩa -> nói từ tiếng Anh
    async speaking3(target) {
        this.renderLoading();
        let imgSrc = "";
        try {
            const imageResult = await imageCache.getImage(target.word);
            imgSrc = imageResult ? imageResult.url : "";
        } catch (e) { /* bỏ qua, dùng fallback rỗng */ }
        await speakVI(target.meaning); // đọc nghĩa tiếng Việt trước khi vào phần ghi âm
        this.renderSpeakingRecorder({
            instruction: "Look at the picture and say the word.",
            promptHTML: `
                <div style="min-height:140px;display:flex;align-items:center;justify-content:center;margin-top:8px;">
                    ${imgSrc ? `<img src="${imgSrc}" style="max-width:170px;border-radius:12px;border:3px solid #ffd54f;"/>` : `<div style="color:#666;">(no image)</div>`}
                </div>
                <div style="font-size:1.3rem;font-weight:bold;color:#ffd54f;margin-top:8px;">${target.meaning}</div>`,
            targetText: target.word,
            matchFn: (heard) => heard.toLowerCase().includes(target.word.toLowerCase()),
            onListenAgainText: target.question || target.word,
        });
    },

    // speaking4: trả lời tự do theo câu hỏi mở, chấm theo số keyword khớp (tăng theo cấp độ)
    async speaking4(target) {
        const questionText = target.question || `What do you know about "${target.word}"?`;
        const keywords = extractKeywords(target.keywordFix);
        const minKw = this.cfg.speaking4MinKeywords;
        const suggestion = target.finalAns || "No suggestion available.";
        this.renderSpeakingRecorder({
            instruction: "Answer the question.",
            promptHTML: `<div style="font-size:1.15rem;font-weight:bold;margin-top:8px;">${questionText}</div>`,
            targetText: suggestion,
            matchFn: (heard) => {
                if (!keywords.length) return true;
                const h = heard.toLowerCase();
                const hitCount = keywords.filter((k) => h.includes(k)).length;
                return hitCount >= Math.min(minKw, keywords.length);
            },
            onListenAgainText: questionText,
        });
    },
};

/* ============================================================================
 * 7. KỸ NĂNG ĐỌC (reading1 - reading5)
 * ============================================================================ */

const readingMethods = {
    // reading1 (gộp task2+3 cũ): random hiện câu hỏi (chọn Ans) HOẶC hiện câu trả lời (chọn Q)
    async reading1(target) {
        if (!target.question || !target.finalAns) return this.ask(this.callback);
        const data = this.useRetryState("reading1", () => {
            const askQuestion = Math.random() < 0.5;
            const correctAns = askQuestion ? target.finalAns : target.question;
            const field = askQuestion ? "finalAns" : "question";
            const options = buildQuizOptions(correctAns, this.poolData, {
                field, sameLessonId: target.lessonId, minSameLesson: 1, maxOptions: 4, extraPool: this.currentLessonData,
            });
            return { askQuestion, correctAns, options };
        });
        const instruction = data.askQuestion ? "Answer the question." : "Choose the correct question for this answer.";
        const headerText = data.askQuestion ? `Q: ${target.question}` : `Ans: ${target.finalAns}`;
        this.renderMCQ({ instruction, questionHTML: headerText, options: data.options, correctValue: data.correctAns });
        this.lockAnswerArea();
        await this.speak(instruction);
        await this.speak(data.askQuestion ? target.question : target.finalAns);
        this.unlockAnswerArea();
    },

    // reading2: sắp xếp câu bị xáo từ
    async reading2(target) {
        const sources = [
            { text: target.question, label: "Question" },
            { text: target.finalAns, label: "Answer" },
            { text: target.presentSent, label: "Presentation" },
        ].filter((s) => s.text && s.text.trim());
        if (!sources.length) return this.ask(this.callback);

        const data = this.useRetryState("reading2", () => {
            const selected = sources[Math.floor(Math.random() * sources.length)];
            const wordsArray = selected.text.trim().match(/[\w']+|[^\w\s]/g);
            return { selected, wordsArray, shuffled: wordsArray ? shuffleArr(wordsArray) : null };
        });
        if (!data.wordsArray) return this.ask(this.callback);

        const instruction = `Unscramble the ${data.selected.label}!`;
        this.renderUnscramble(instruction, data.shuffled, data.wordsArray);
        this.lockAnswerArea();
        await this.speak(instruction);
        this.unlockAnswerArea();
    },

    // reading3: đọc đoạn văn N câu (hiện chữ, không đọc audio) -> chọn đáp án
    async reading3(target) {
        if (!target.presentSent || !target.question || !target.finalAns) return this.ask(this.callback);
        this.stopTimer();
        const n = this.cfg.paragraphSentences;

        const data = this.useRetryState("reading3", () => {
            const usedTexts = new Set();
            const targetSentence = this.ensureDot(target.presentSent);
            usedTexts.add(targetSentence.toLowerCase());
            const noiseSentences = [];
            for (const item of shuffleArr(this.poolData.filter((it) => it.word !== target.word && it.presentSent))) {
                const t = this.ensureDot(item.presentSent);
                if (!usedTexts.has(t.toLowerCase())) { noiseSentences.push(t); usedTexts.add(t.toLowerCase()); }
                if (noiseSentences.length >= n - 1) break;
            }
            const actualCount = 1 + noiseSentences.length; // có thể < n nếu poolData không đủ câu nhiễu
            const fullParagraph = shuffleArr([targetSentence, ...noiseSentences]).join(" ");
            const correctAns = target.finalAns;
            const options = buildQuizOptions(correctAns, this.poolData, {
                field: "finalAns", sameLessonId: target.lessonId, minSameLesson: 1, maxOptions: 4, extraPool: this.currentLessonData,
            });
            return { actualCount, fullParagraph, correctAns, options };
        });

        const instruction = `Read the ${data.actualCount}-sentence paragraph and answer the question.`;
        this.renderReadingParagraph(instruction, data.fullParagraph, target.question, data.options, data.correctAns);
        this.lockAnswerArea();
        await this.speak(instruction);
        this.unlockAnswerArea();
        this.startTimer(60000);
    },

    // reading4 (cloze test): điền N chỗ trống theo đúng thứ tự xuất hiện trong đoạn văn
    async reading4(target) {
        this.stopTimer();
        this.userAnswers = {};
        const instruction = "Fill in the blanks";
        const numBlanks = this.cfg.clozeBlanks;

        const data = this.useRetryState("reading4", () => {
            const otherItems = shuffleArr(
                this.poolData.filter((it) => it.lessonId !== target.lessonId && it.word !== target.word && it.presentSent)
            ).slice(0, numBlanks - 1);
            const mainItems = [target, ...otherItems];
            const targetWords = mainItems.map((it) => it.word);

            const fillerSentences = shuffleArr(
                this.poolData.filter((it) => !targetWords.includes(it.word) && it.presentSent)
            ).slice(0, 4).map((it) => this.ensureDot(it.presentSent));

            const fullSentences = shuffleArr([
                ...mainItems.map((it) => ({ word: it.word, text: this.ensureDot(it.presentSent) })),
                ...fillerSentences.map((text) => ({ word: null, text })),
            ]);

            let blankCount = 0;
            const finalMainItems = [];
            const paragraphText = fullSentences.map((obj) => {
                if (obj.word) {
                    blankCount++;
                    finalMainItems.push(obj);
                    const regex = new RegExp(`\\b${obj.word}\\b`, "gi");
                    return obj.text.replace(regex, `___(${blankCount})___`);
                }
                return obj.text;
            }).join(" ");

            return { targetWords, finalMainItems, paragraphText, displayOptions: shuffleArr(targetWords) };
        });

        this.renderCloze(data.paragraphText, data.displayOptions, data.finalMainItems);
        this.lockAnswerArea();
        this.speak(instruction).then(() => this.unlockAnswerArea());
        this.startTimer(45000);
    },

    // reading5: nối câu hỏi - câu trả lời (số cặp giảm tự động nếu poolData không đủ)
    async reading5(target) {
        if (!target.question || !target.finalAns) return this.ask(this.callback);
        this.stopTimer();
        this.selectedQuestion = null;
        this.userMatches = {};
        const numPairs = this.cfg.matchPairs;

        const data = this.useRetryState("reading5", () => {
            const getQA = (item) => ({ q: item.question || "No Question", a: item.finalAns || "No Answer", id: Math.random().toString(36).slice(2, 11) });
            const mainPair = getQA(target);
            const others = shuffleArr(
                this.poolData.filter((it) => it.lessonId !== target.lessonId && it.question && it.finalAns)
            ).slice(0, numPairs - 1).map(getQA);
            const matchingPairs = [mainPair, ...others];
            return { matchingPairs, shuffledQ: shuffleArr(matchingPairs), shuffledA: shuffleArr(matchingPairs) };
        });
        if (data.matchingPairs.length < 2) return this.ask(this.callback);

        this.renderMatching(data.shuffledQ, data.shuffledA, data.matchingPairs);
        this.lockAnswerArea();
        this.speak("Match the pairs.").then(() => this.unlockAnswerArea());
        this.startTimer(45000);
    },

    /* ---- render helpers riêng của khu vực Đọc ---- */

    renderReadingParagraph(instruction, paragraph, question, options, correctValue) {
        this.correctAnswer = correctValue;
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            wordBox.className = "";
            wordBox.style.background = "#fff";
            wordBox.style.padding = "20px";
            wordBox.style.borderRadius = "15px";
            wordBox.innerHTML = `
                <div style="width:100%;max-width:600px;margin:0 auto;text-align:left;">
                    <div style="color:#636e72;font-size:13px;margin-bottom:10px;font-weight:bold;border-bottom:1px solid #eee;padding-bottom:5px;">📖 ${instruction}</div>
                    <div style="font-size:16px;color:#2d3436;line-height:1.6;margin-bottom:20px;font-style:italic;background:#f9f9f9;padding:15px;border-left:5px solid #0984e3;">"${paragraph}"</div>
                    <div style="font-size:18px;color:#d39e00;font-weight:bold;">❓ Q: ${question}</div>
                </div>`;
        }
        this.renderOptionsList(optionsBox, options);
    },

    renderUnscramble(instruction, shuffledWords, correctSequence) {
        this.stopTimer();
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            wordBox.className = "qz-wordbox";
            wordBox.innerHTML = `
                <div class="qz-instruction">${instruction}</div>
                <div id="qzUnscrambleResult" style="min-height:60px;background:rgba(255,255,255,.1);border:2px dashed #555;border-radius:10px;padding:10px;display:flex;flex-wrap:wrap;gap:5px;justify-content:center;align-items:center;"></div>`;
        }
        if (optionsBox) {
            optionsBox.innerHTML = `
                <div id="qzUnscramblePool" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:16px;"></div>
                <div class="qz-btn-row">
                    <button id="qzUnscrambleReset" class="qz-btn gray">Reset</button>
                    <button id="qzUnscrambleCheck" class="qz-btn blue">CHECK</button>
                </div>`;
            const resultArea = document.getElementById("qzUnscrambleResult");
            const poolArea = document.getElementById("qzUnscramblePool");
            let userSequence = [];
            shuffledWords.forEach((word) => {
                const btn = document.createElement("button");
                btn.innerText = word;
                btn.style = "background:#444;color:#fff;border:1px solid #666;padding:8px 15px;border-radius:8px;cursor:pointer;font-size:16px;";
                btn.onclick = () => {
                    if (/[a-zA-Z]/.test(word)) this.speak(word); // chỉ đọc khi là chữ, bỏ qua dấu câu
                    userSequence.push(word);
                    btn.style.visibility = "hidden";
                    const resSpan = document.createElement("span");
                    resSpan.innerText = word;
                    resSpan.style = "background:#2ecc71;color:#fff;padding:5px 10px;border-radius:5px;font-weight:bold;";
                    resultArea.appendChild(resSpan);
                };
                poolArea.appendChild(btn);
            });
            document.getElementById("qzUnscrambleReset").onclick = () => {
                userSequence = [];
                resultArea.innerHTML = "";
                Array.from(poolArea.children).forEach((b) => (b.style.visibility = "visible"));
            };
            document.getElementById("qzUnscrambleCheck").onclick = () => {
                const isCorrect = JSON.stringify(userSequence) === JSON.stringify(correctSequence);
                const fullSentence = correctSequence.join(" ").replace(/\s([?.!,])/g, "$1");
                this.showFeedback(isCorrect, fullSentence);
            };
        }
        this.startAutoSkipTimer();
    },

    renderCloze(paragraph, options, finalMainItems) {
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        const _self = this;
        if (wordBox) {
            wordBox.className = "";
            wordBox.style.background = "#fff";
            wordBox.style.textAlign = "left";
            wordBox.style.padding = "20px";
            wordBox.style.borderRadius = "15px";
            wordBox.innerHTML = `
                <b style="color:#6c5ce7;display:block;margin-bottom:10px;">📝 ĐIỀN TỪ VÀO ĐOẠN VĂN:</b>
                <div style="line-height:2.2;color:#333;">
                    ${paragraph.replace(/___\((\d+)\)___/g, (m, p1) => `<span id="qzAns-${p1}" style="color:#d63031;font-weight:bold;border-bottom:2px solid #6c5ce7;min-width:60px;display:inline-block;text-align:center;margin:0 5px;">(${p1})</span>`)}
                </div>`;
        }
        if (optionsBox) {
            optionsBox.innerHTML = `
                <div id="qzClozeBtns" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-bottom:15px;">
                    ${options.map((opt) => `<button class="cloze-btn" style="padding:10px 15px;border-radius:8px;background:#6c5ce7;color:#fff;border:none;font-weight:bold;cursor:pointer;">${opt}</button>`).join("")}
                </div>
                <button id="qzClozeCheck" class="qz-btn blue" style="width:100%;height:45px;">KIỂM TRA</button>`;
            optionsBox.querySelectorAll(".cloze-btn").forEach((btn) => {
                btn.onclick = function () {
                    const word = this.innerText;
                    _self.speak(word);
                    for (let i = 1; i <= finalMainItems.length; i++) {
                        if (!_self.userAnswers[i]) {
                            _self.userAnswers[i] = word;
                            const blank = document.getElementById(`qzAns-${i}`);
                            if (blank) blank.innerText = word;
                            this.style.opacity = "0.3";
                            this.style.pointerEvents = "none";
                            break;
                        }
                    }
                };
            });
            document.getElementById("qzClozeCheck").onclick = () => {
                this.stopTimer();
                let correctCount = 0;
                finalMainItems.forEach((item, idx) => { if (this.userAnswers[idx + 1] === item.word) correctCount++; });
                const passThreshold = Math.max(1, Math.ceil(finalMainItems.length * 0.66));
                this.showFeedback(correctCount >= passThreshold, finalMainItems.map((i) => i.word).join(", "));
            };
        }
    },

    renderMatching(questions, answers, originalPairs) {
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        const _self = this;
        const pairColors = ["#FFD1DC", "#B3E5FC", "#C8E6C9", "#FFF9C4", "#FFE0B2"];
        let colorIdx = 0;

        if (wordBox) {
            wordBox.className = "";
            wordBox.style.background = "transparent";
            wordBox.innerHTML = `<b style="color:#ffcb05;text-shadow:2px 2px #000;font-size:18px;">🧩 MATCHING THE Q AND A</b>`;
        }
        if (optionsBox) {
            optionsBox.innerHTML = `
                <div style="display:flex;gap:10px;margin-bottom:10px;">
                    <div id="qzColQ" style="flex:1;display:flex;flex-direction:column;gap:8px;"></div>
                    <div id="qzColA" style="flex:1;display:flex;flex-direction:column;gap:8px;"></div>
                </div>
                <button id="qzMatchSubmit" class="qz-btn blue" style="width:100%;height:45px;">SUBMIT MATCHES</button>`;
            const colQ = document.getElementById("qzColQ");
            const colA = document.getElementById("qzColA");
            const nodeStyle = "background:#fff;color:#000;padding:10px;border-radius:8px;cursor:pointer;border:2px solid #ccc;font-size:13px;text-align:center;min-height:50px;display:flex;align-items:center;justify-content:center;";

            questions.forEach((item) => {
                const div = document.createElement("div");
                div.className = "match-node q-node";
                div.innerText = item.q;
                div.dataset.id = item.id;
                div.style = nodeStyle;
                div.onclick = function () {
                    if (this.dataset.matched === "true") return;
                    _self.speak(item.q);
                    colQ.querySelectorAll(".q-node").forEach((n) => { if (n.dataset.matched !== "true") { n.style.borderColor = "#ccc"; n.style.background = "#fff"; } });
                    this.style.borderColor = "#6c5ce7"; this.style.background = "#f0edff";
                    _self.selectedQuestion = this;
                };
                colQ.appendChild(div);
            });
            answers.forEach((item) => {
                const div = document.createElement("div");
                div.className = "match-node a-node";
                div.innerText = item.a;
                div.dataset.id = item.id;
                div.style = nodeStyle;
                div.onclick = function () {
                    if (!_self.selectedQuestion || this.dataset.matched === "true") return;
                    _self.speak(item.a);
                    const color = pairColors[colorIdx % pairColors.length];
                    _self.userMatches[_self.selectedQuestion.dataset.id] = this.dataset.id;
                    this.dataset.matched = "true"; _self.selectedQuestion.dataset.matched = "true";
                    this.style.background = color; this.style.borderColor = "#333";
                    _self.selectedQuestion.style.background = color; _self.selectedQuestion.style.borderColor = "#333";
                    colorIdx++;
                    _self.selectedQuestion = null;
                };
                colA.appendChild(div);
            });

            document.getElementById("qzMatchSubmit").onclick = () => {
                _self.stopTimer();
                let correctCount = 0;
                originalPairs.forEach((p) => { if (_self.userMatches[p.id] === p.id) correctCount++; });
                const passThreshold = Math.max(1, Math.ceil(originalPairs.length * 0.6));
                _self.showFeedback(correctCount >= passThreshold, `Đúng ${correctCount}/${originalPairs.length} cặp`);
            };
        }
    },
};

/* ============================================================================
 * 8. KỸ NĂNG VIẾT (writing1 - writing5)
 * ============================================================================ */

const writingMethods = {
    // writing1: hiện nghĩa -> gõ từ tiếng Anh, mức gợi ý theo cấp độ
    async writing1(target) {
        if (!target.meaning || !target.word) return this.ask(this.callback);
        const instruction = "Type the English word for this meaning:";
        const correctAns = target.word.trim();
        const hintLevel = this.cfg.writingHintLevel;
        let hintHTML = "";
        if (hintLevel !== "none") {
            const hintText = correctAns.split("").map((ch, i) => {
                if (i === 0 && hintLevel === "full") return ch.toUpperCase();
                if (ch === " ") return "&nbsp;&nbsp;";
                return "_";
            }).join(" ");
            hintHTML = `<div style="font-size:20px;color:#ffeb3b;letter-spacing:2px;font-family:monospace;margin-top:10px;">${hintText}</div>`;
        }
        this.renderTypedAnswer({
            instruction,
            headerHTML: `<div style="font-size:22px;color:#2ecc71;font-weight:bold;">${target.meaning}</div>${hintHTML}`,
            correctValue: correctAns,
        });
        this.lockAnswerArea();
        await this.speak(instruction);
        await speakVI(target.meaning);
        this.unlockAnswerArea();
    },

    // writing2: ảnh mờ + gõ từ, độ mờ theo cấp độ
    async writing2(target) {
        this.renderLoading();
        let imgSrc = "";
        try {
            const imageResult = await imageCache.getImage(target.word);
            imgSrc = imageResult ? imageResult.url : "";
        } catch (e) { /* bỏ qua */ }
        const blur = this.cfg.blurPx;
        const firstChar = target.word.charAt(0);
        const placeholder = firstChar + " " + "_ ".repeat(target.word.length - 1).trim();
        this.renderImageWriting(imgSrc, placeholder, target, blur);
    },

    // writing3 (pokeword): điền chữ cái còn thiếu, % ẩn theo cấp độ
    async writing3(target) {
        const cleanWord = target.word.replace(/[^a-zA-Z]/g, "").toUpperCase();
        const letters = cleanWord.split("");
        const ratio = this.cfg.hiddenLetterRatio;
        const missingIndices = this.useRetryState("writing3", () => {
            const numMissing = Math.max(1, Math.min(letters.length, Math.round(letters.length * ratio)));
            const indices = [];
            while (indices.length < numMissing) {
                const r = Math.floor(Math.random() * letters.length);
                if (!indices.includes(r)) indices.push(r);
            }
            return indices;
        });
        this.renderPokeword(cleanWord, letters, missingIndices, target);
    },

    // writing4: dịch cụm từ (cột D/E) — không áp dụng cấp độ (phụ thuộc dữ liệu có sẵn)
    async writing4(target) {
        const splitPattern = /[\/\n]/;
        const enArray = (target.colD || "").split(splitPattern).map((s) => s.trim()).filter(Boolean);
        const viArray = (target.colE || "").split(splitPattern).map((s) => s.trim()).filter(Boolean);
        let chunks = viArray.map((vi, i) => ({ vi, en: enArray[i] || "" })).filter((c) => c.en);
        if (!chunks.length) chunks = [{ en: target.word, vi: target.meaning }];
        this.renderPhraseTranslation(chunks, target);
    },

    // writing5: từ bị xáo chữ cái -> gõ lại
    async writing5(target) {
        const instruction = "Unscramble the letters to form the correct word.";
        const scrambled = this.useRetryState("writing5", () =>
            shuffleArr(target.word.split("")).join("-").toLowerCase()
        );
        const hintText = `First letter: "${target.word[0].toUpperCase()}" | Meaning: ${target.meaning}`;
        this.renderScrambledWord(instruction, scrambled, hintText, target);
        this.lockAnswerArea();
        await this.speak(instruction);
        this.unlockAnswerArea();
        this.startTimer(60000);
    },

    /* ---- render helpers riêng của khu vực Viết ---- */

    renderImageWriting(imgSrc, placeholder, target, blurPx) {
        this.stopTimer();
        this.correctAnswer = target.word;
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            wordBox.className = "qz-wordbox";
            wordBox.innerHTML = `
                <p style="font-size:14px;color:#aaa;margin-bottom:10px;">Type the word you see</p>
                <div style="min-height:180px;display:flex;align-items:center;justify-content:center;">
                    <img id="qzBlurImg" src="${imgSrc || "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png"}"
                         style="max-width:220px;border-radius:15px;border:4px solid #ffd54f;filter:blur(${blurPx}px);transition:filter .5s;"/>
                </div>
                <div id="qzHintText" style="font-size:20px;letter-spacing:4px;color:#ffd54f;margin:15px 0;font-family:monospace;">${placeholder}</div>`;
        }
        if (optionsBox) {
            optionsBox.innerHTML = `
                <input type="text" id="qzTypedInput" class="qz-input" placeholder="Type here..." autocomplete="off"/>
                <div class="qz-btn-row">
                    <button id="qzSubmitBtn" class="qz-btn blue">Check</button>
                    <button id="qzHintAudioBtn" class="qz-btn gray">🔊</button>
                    <button id="qzMeaningHintBtn" class="qz-btn gray">Hint</button>
                </div>`;
            const input = document.getElementById("qzTypedInput");
            const submitBtn = document.getElementById("qzSubmitBtn");
            const imgEl = document.getElementById("qzBlurImg");
            setTimeout(() => input.focus(), 400);
            const check = async () => {
                const userVal = input.value.trim().toLowerCase();
                if (!userVal) return;
                this.stopTimer();
                if (imgEl) imgEl.style.filter = "none";
                await this.speak(userVal);
                this.showFeedback(userVal === target.word.toLowerCase(), target.word);
            };
            submitBtn.onclick = check;
            input.onkeydown = (e) => { if (e.key === "Enter") check(); };
            document.getElementById("qzHintAudioBtn").onclick = () => this.speak(target.word);
            document.getElementById("qzMeaningHintBtn").onclick = function () {
                const hintEl = document.getElementById("qzHintText");
                if (hintEl) hintEl.innerHTML = `<span style="font-family:sans-serif;letter-spacing:0;color:#4ade80;">${target.meaning || "No meaning"}</span>`;
                this.disabled = true; this.style.opacity = "0.5";
                if (target.meaning) speakVI(target.meaning);
                input.focus();
            };
        }
        this.startTimer(60000);
    },

    renderPokeword(cleanWord, letters, missingIndices, target) {
        this.stopTimer();
        this.correctAnswer = cleanWord;
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            const cellsHTML = letters.map((ch, i) => {
                if (missingIndices.includes(i)) {
                    return `<div class="pw-cell" style="width:35px;height:45px;border:2px solid #3498db;display:inline-flex;align-items:center;justify-content:center;margin:2px;border-radius:5px;background:#222;">
                        <input type="text" maxlength="1" class="pw-input" style="width:100%;height:100%;background:transparent;border:none;color:#ffd54f;text-align:center;font-size:20px;font-weight:bold;outline:none;text-transform:uppercase;"/></div>`;
                }
                return `<div class="pw-cell" style="width:35px;height:45px;border:2px solid #555;display:inline-flex;align-items:center;justify-content:center;margin:2px;border-radius:5px;background:#333;color:#fff;font-size:20px;font-weight:bold;">${ch}</div>`;
            }).join("");
            wordBox.className = "qz-wordbox";
            wordBox.innerHTML = `
                <p style="font-size:14px;color:#aaa;margin-bottom:10px;">Fill in the missing letters</p>
                <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-bottom:15px;">${cellsHTML}</div>
                <div style="font-size:16px;color:#ffd54f;font-style:italic;">📘 Gợi ý: ${target.meaning}</div>`;
        }
        if (optionsBox) {
            optionsBox.innerHTML = `
                <div class="qz-btn-row">
                    <button id="qzPwSubmit" class="qz-btn green" style="width:150px;">Confirm</button>
                    <button id="qzPwAudio" class="qz-btn blue">🔊</button>
                </div>`;
            const inputs = document.querySelectorAll(".pw-input");
            const checkAction = async () => {
                let guess = "";
                document.querySelectorAll(".pw-cell").forEach((cell) => {
                    const inp = cell.querySelector("input");
                    guess += inp ? (inp.value || "_") : cell.innerText;
                });
                this.stopTimer();
                await this.speak(guess);
                this.showFeedback(guess.toUpperCase() === cleanWord, target.word);
            };
            inputs.forEach((inp, i) => {
                inp.oninput = () => { if (inp.value.length === 1 && inputs[i + 1]) inputs[i + 1].focus(); };
                inp.onkeydown = (e) => {
                    if (e.key === "Backspace" && !inp.value && inputs[i - 1]) inputs[i - 1].focus();
                    if (e.key === "Enter") checkAction();
                };
            });
            if (inputs[0]) setTimeout(() => inputs[0].focus(), 400);
            document.getElementById("qzPwSubmit").onclick = checkAction;
            document.getElementById("qzPwAudio").onclick = () => this.speak(target.word);
        }
        this.startAutoSkipTimer();
        if (target.meaning) speakVI(target.meaning); // đọc gợi ý nghĩa (tiếng Việt) 1 lần khi vào bài
    },

    renderPhraseTranslation(chunks, target) {
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            const rowsHTML = chunks.map((c) => `
                <div style="display:flex;gap:10px;margin-bottom:12px;align-items:stretch;">
                    <div style="flex:1;background:#ffe9e9;border:1px solid #ff7675;border-radius:10px;padding:12px;color:#d63031;font-weight:bold;display:flex;align-items:center;justify-content:center;text-align:center;">${c.vi}</div>
                    <input type="text" class="qz-phrase-input" data-ans="${c.en}" placeholder="Nhập cụm tiếng Anh..." autocomplete="off"
                        style="flex:1.2;background:#ebf5ff;border:1px solid #3498db;border-radius:10px;padding:12px;color:#2d3436;font-weight:bold;outline:none;"/>
                </div>`).join("");
            wordBox.className = "";
            wordBox.style.background = "#fff";
            wordBox.style.padding = "10px";
            wordBox.style.borderRadius = "10px";
            wordBox.innerHTML = `
                <div style="width:100%;max-width:550px;margin:0 auto;">
                    <div style="color:#d39e00;font-size:13px;text-align:left;margin-bottom:15px;font-weight:bold;">🧱 Dịch cụm</div>
                    <div style="max-height:400px;overflow-y:auto;padding-right:8px;">${rowsHTML}</div>
                </div>`;
            // Đọc lần lượt các cụm tiếng Việt bằng speakVI ngay khi hiện bài
            (async () => {
                for (const c of chunks) {
                    if (c.vi) await speakVI(c.vi);
                }
            })();
        }
        if (optionsBox) {
            optionsBox.innerHTML = `
                <div class="qz-btn-row" style="justify-content:flex-start;">
                    <button id="qzPhraseSubmit" class="qz-btn blue">✅ Kiểm tra</button>
                    ${this._isRetryAttempt ? "" : `<button id="qzPhraseSkip" class="qz-btn gray">⏭ Bỏ qua</button>`}
                </div>`;
            const inputs = document.querySelectorAll(".qz-phrase-input");
            if (inputs[0]) setTimeout(() => inputs[0].focus(), 300);
            inputs.forEach((inp, idx) => {
                inp.onkeydown = (e) => { if (e.key === "Enter") { if (inputs[idx + 1]) inputs[idx + 1].focus(); else document.getElementById("qzPhraseSubmit").click(); } };
            });
            document.getElementById("qzPhraseSubmit").onclick = async () => {
                let correctCount = 0;
                for (const inp of inputs) {
                    const user = inp.value.trim().toLowerCase();
                    const ans = inp.dataset.ans.trim().toLowerCase();
                    if (user) await this.speak(inp.value.trim()); // đọc lần lượt cụm vừa gõ
                    if (user === ans && user) { correctCount++; inp.style.borderColor = "#2ecc71"; inp.style.color = "#12893d"; }
                    else { inp.style.borderColor = "#e74c3c"; inp.value = `${inp.value} ➔ ${inp.dataset.ans}`; inp.style.color = "#d63031"; }
                    inp.readOnly = true;
                }
                const ratio = correctCount / inputs.length;
                this.showFeedback(ratio >= 0.7, `Đúng ${correctCount}/${inputs.length}`);
            };
            const phraseSkipBtn = document.getElementById("qzPhraseSkip");
            if (phraseSkipBtn) phraseSkipBtn.onclick = () => this.handleSkip();
        }
        this.timer = setTimeout(() => this.handleSkip(), 60000);
    },

    renderScrambledWord(instruction, scrambled, hintText, target) {
        this.correctAnswer = target.word;
        this.setOverlayTransparent();
        const wordBox = this.resetWordBox();
        const optionsBox = document.getElementById("quiz-options");
        if (wordBox) {
            wordBox.className = "qz-wordbox";
            wordBox.innerHTML = `
                <div style="color:#636e72;font-size:13px;margin-bottom:15px;font-weight:bold;text-transform:uppercase;">🧩 Word Scramble</div>
                <div style="font-size:28px;color:#0984e3;font-weight:bold;letter-spacing:2px;background:#e1f5fe;padding:15px;border-radius:10px;border:2px dashed #0984e3;">${scrambled}</div>
                <div id="qzHiddenHint" style="display:none;margin-top:15px;padding:10px;background:#fff9db;border:1px solid #fab005;border-radius:8px;color:#e67e22;font-size:14px;font-style:italic;">${hintText}</div>`;
        }
        if (optionsBox) {
            optionsBox.innerHTML = `
                <input type="text" id="qzTypedInput" class="qz-input" placeholder="Type your answer here..." autocomplete="off"/>
                <div class="qz-btn-row">
                    <button id="qzSubmitBtn" class="qz-btn blue">CHECK</button>
                    <button id="qzShowHintBtn" class="qz-btn gray">💡 HINT</button>
                </div>`;
            const input = document.getElementById("qzTypedInput");
            setTimeout(() => input.focus(), 400);
            const check = async () => {
                const userVal = input.value.trim().toLowerCase();
                if (!userVal) return;
                this.stopTimer();
                await this.speak(userVal);
                this.showFeedback(userVal === target.word.toLowerCase(), target.word);
            };
            document.getElementById("qzSubmitBtn").onclick = check;
            input.onkeydown = (e) => { if (e.key === "Enter") check(); };
            document.getElementById("qzShowHintBtn").onclick = async () => {
                document.getElementById("qzHiddenHint").style.display = "block";
                await this.speak(`First letter: ${target.word[0]}`);
                await speakVI(target.meaning);
            };
        }
    },
};

/* ============================================================================
 * 9. LẮP RÁP window.QuizManager
 * ============================================================================ */

window.QuizManager = Object.assign(
    {
        callback: null,
        correctAnswer: "",
        currentLessonData: [],
        poolData: [],
        wordQueue: [],
        skillPools: null,
        skillCycleIndex: 0,
        timer: null,
        userInteracted: false,
        levelKey: "de",
        cfg: LEVEL_CONFIG.de,
        _qzStylesInjected: false,
        _feedbackShown: false,
        _answerLocked: false,
        _isRetryAttempt: false,
        _currentTypeName: null,
        _currentTarget: null,
        _retryState: null,
    },
    sharedUIMethods,
    coreMethods,
    listeningMethods,
    speakingMethods,
    readingMethods,
    writingMethods,
);