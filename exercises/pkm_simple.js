/**
 * ============================================================================
 * PKM SIMPLE — pkm_simple.js
 * ============================================================================
 * Chế độ học từ vựng NHANH – ĐƠN GIẢN – VUI (kiểu Wordwall) cho học sinh.
 *
 * CÁCH CHẠY (giống Battle/Quiz):
 *   1. Dữ liệu:  sessionStorage["allVocabData"] (sheet từ vựng) + localStorage["current_mission"]
 *                → lấy các từ của bài đang học (cột B = mã bài, C = từ, Y = nghĩa).
 *                Nếu chưa có thì tự tải từ window.SHEET_URL (global-config.js).
 *                Không có bài nào được chọn → chạy chế độ THỬ với 5 từ mẫu.
 *   2. Ảnh:      pkm-image.js (imageCache.getImage) — y hệt Quiz. Ảnh lỗi/không có thì
 *                tự đổi sang dạng bài không cần ảnh.
 *   3. Điểm:     PkmScore (pkm_score.js) — y hệt Battle: ghi pkm_skill_scores theo
 *                nghe/nói/đọc/viết, cộng EXP/DV, mở khoá bài mới nếu đạt.
 *   4. Ghi âm:   startRecording/transcribeAudio của all-shared.js (Whisper),
 *                dự phòng Web Speech API của trình duyệt.
 *
 * CẤU TRÚC 1 LƯỢT CHƠI = 6 CHẶNG × (số từ, thường là 5) = tối đa 30 câu
 *   Mỗi từ gặp đúng 6 lần, từ dễ → khó, đủ 4 kỹ năng (xem STAGES bên dưới).
 *   Muốn đổi dạng bài / thứ tự chặng: chỉ cần sửa mảng STAGES.
 *   Muốn thêm 1 dạng bài mới: viết thêm 1 hàm T.tenDang = async (round) => ({firstTry}),
 *   thêm điều kiện vào isUsable() và đưa tên vào STAGES.
 * ============================================================================
 */
(function () {
  "use strict";

  /* ==========================================================================
   * 0. CẤU HÌNH
   * ========================================================================== */
  const CFG = {
    WORDS_PER_SET: 5,          // số từ mỗi lượt chơi
    MIN_Q_FOR_SCORE: 10,       // chơi ít hơn số câu này thì không tính điểm
    MAX_TYPE_TRIES: 3,         // số lần được gõ sai trước khi hiện đáp án
    SPEAK_REPS: 3,             // câu Nói: nói từ liền mấy lần ("one one one")
    MAX_SPEAK_TRIES: 3,        // số lượt được nói lại trước khi hiện đáp án
    BACK_URL: "pkm_mode_select.html",
    MAP_URL: "pkm_map.html",
    LEVELS: {
      de:  { label: "Dễ",         options: 3, hint: "full",   hidden: 0.3, decoys: 2, speakTol: 0.45, speakForm: "word", repNeed: 2, sentThreshold: 40 },
      tb:  { label: "Trung bình", options: 4, hint: "blanks", hidden: 0.5, decoys: 3, speakTol: 0.34, speakForm: "sentence", repNeed: 2, sentThreshold: 50 },
      kho: { label: "Khó",        options: 4, hint: "none",   hidden: 0.7, decoys: 4, speakTol: 0.25, speakForm: "sentence", repNeed: 3, sentThreshold: 65 },
    },
  };

  // 6 chặng: dễ → khó. skill = kỹ năng được ghi điểm. types = các dạng bài có thể rút.
  // Chặng "mixed" xen kẽ 2 kỹ năng (offset quyết định kỹ năng nào nhiều hơn khi có 5 từ).
  // Với 5 từ → Nghe 8 · Nói 8 · Đọc 7 · Viết 7 câu (cân bằng).
  const STAGES = [
    { emoji: "🎧", title: "Nghe và chọn hình", desc: "Nghe từ tiếng Anh rồi chạm vào hình đúng.", cue: "Let's listen!",
      skill: "listening", types: ["listenPic"] },
    { emoji: "👀", title: "Nhìn hình, đọc từ", desc: "Xem hình hoặc nghĩa, chọn từ tiếng Anh đúng.", cue: "Let's read!",
      skill: "reading", types: ["picWord", "meaningWord"] },
    { emoji: "🧩", title: "Ghép chữ cái", desc: "Sắp xếp hoặc điền chữ cái để thành từ.", cue: "Let's spell!",
      skill: "writing", types: ["unscramble", "missing"] },
    { emoji: "🎤", title: "Nói to nào!", desc: "Nói từ 3 lần liền (mức Trung bình, Khó: đọc thêm câu có từ đó).", cue: "Let's speak!",
      skill: "speaking", types: ["sayWord"] },
    { emoji: "🚀", title: "Nghe và đọc nâng cao", desc: "Ít gợi ý hơn — dựa vào tai và mắt của bạn!", cue: "Level up!", offset: 0,
      mixed: [
        { skill: "listening", types: ["listenWord"] },
        { skill: "reading", types: ["spelling", "wordMeaning"] },
      ] },
    { emoji: "🏆", title: "Thử thách cuối", desc: "Gõ từ, rồi nghe và nhắc lại thật chuẩn nhé!", cue: "Final challenge!", offset: 1,
      mixed: [
        { skill: "writing", types: ["typePic", "dictation"] },
        { skill: "speaking", types: ["repeat"] },
      ] },
  ];

  const SKILL_VI = { listening: "Nghe", speaking: "Nói", reading: "Đọc", writing: "Viết" };
  const SKILL_ICON = { listening: "🎧", speaking: "🎤", reading: "📖", writing: "✏️" };

  // Nếu 1 dạng bài không dùng được (thiếu ảnh/nghĩa/từ nhiễu) thì thử lần lượt các dạng này
  const FALLBACKS = {
    listenPic: ["listenWord", "dictation"],
    picWord: ["meaningWord", "listenWord", "dictation"],
    meaningWord: ["picWord", "listenWord", "dictation"],
    wordMeaning: ["spelling", "listenWord", "dictation"],
    spelling: ["listenWord", "dictation"],
    listenWord: ["dictation"],
    typePic: ["dictation"],
    unscramble: ["missing", "dictation"],
    missing: ["dictation"],
    dictation: [],
    sayWord: [],
    repeat: ["sayWord"],
  };

  // Lời khen / động viên (EN đọc thành tiếng khi cần, VI hiện trên màn hình)
  const PRAISE = [
    { en: "Great job!", vi: "Giỏi quá!" }, { en: "Awesome!", vi: "Tuyệt vời!" },
    { en: "Perfect!", vi: "Chuẩn luôn!" }, { en: "Well done!", vi: "Làm tốt lắm!" },
    { en: "Fantastic!", vi: "Xuất sắc!" }, { en: "You got it!", vi: "Đúng rồi nè!" },
    { en: "Bravo!", vi: "Hoan hô!" }, { en: "Super!", vi: "Siêu quá!" },
  ];
  const COMBO = {
    3: { en: "Hat trick!", vi: "3 câu liên tiếp! 🔥" },
    5: { en: "You're on fire!", vi: "5 câu liền! Cháy quá! 🔥🔥" },
    8: { en: "Unstoppable!", vi: "8 câu liền! Không ai cản nổi! 🚀" },
    12: { en: "Superstar!", vi: "12 câu liền! Siêu sao! ⭐" },
    16: { en: "Legendary!", vi: "16 câu liền! Huyền thoại! 👑" },
    20: { en: "Incredible!", vi: "20 câu liền! Không thể tin nổi! 🏆" },
  };
  const OOPS = [
    "Gần đúng rồi, thử lại nhé! 💪", "Chưa đúng, bạn làm được mà! 🌟",
    "Cố lên nào, thử lần nữa! 🍀", "Sắp đúng rồi đó! ✨",
  ];
  const MISS = [
    "Không sao đâu! Mình cùng nhớ từ này nhé 💛", "Sai là để nhớ lâu hơn! 💪",
    "Lần sau mình sẽ nhớ nè! 🌟", "Đừng lo, từ này sẽ quay lại để mình ôn! 🔁",
  ];
  const MILESTONES = {
    10: "⭐ Xong 1/3 rồi! Bạn đang làm rất tốt!",
    20: "🔥 Xong 2/3 rồi! Cố lên, sắp về đích!",
  };

  const DEMO_WORDS = [
    { word: "apple", meaning: "quả táo", emoji: "🍎", sentence: "I like to eat a red apple." },
    { word: "banana", meaning: "quả chuối", emoji: "🍌", sentence: "The monkey eats a yellow banana." },
    { word: "boat", meaning: "con thuyền", emoji: "⛵", sentence: "The boat is on the blue sea." },
    { word: "cat", meaning: "con mèo", emoji: "🐱", sentence: "My cat is sleeping on the sofa." },
    { word: "dog", meaning: "con chó", emoji: "🐶", sentence: "The dog can run very fast." },
  ];

  /* ==========================================================================
   * 1. TIỆN ÍCH
   * ========================================================================== */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shuffle = (arr) => {
    const a = [...(arr || [])];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const norm = (s) => (s || "").toString().toLowerCase().replace(/[.,!?;:"“”'’]/g, "").replace(/\s+/g, " ").trim();
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function lev(a, b) {
    a = a || ""; b = b || "";
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }

  const isLetter = (ch) => /[A-Za-zÀ-ỹ]/.test(ch);
  const lettersOf = (word) => [...word].filter(isLetter);

  /* ==========================================================================
   * 2. TRẠNG THÁI
   * ========================================================================== */
  const S = {
    level: "de", cfg: CFG.LEVELS.de,
    demo: false, lessonId: "", lessonLabel: "",
    allWords: [], pool: [], set: [], plan: [], idx: 0, results: [],
    combo: 0, best: 0, muted: false,
    startedAt: 0, timerId: null,
    replay: null, audioTok: 0, cleanups: [],
    imagesReady: null, running: false,
  };
  const CFGL = () => S.cfg;

  /* ==========================================================================
   * 3. DỮ LIỆU BÀI HỌC (giống QuizManager.prepareData)
   * ========================================================================== */
  const COL = Object.assign({ LESSON_NAME: 1, WORD: 2, MEANING: 24, PRESENT_SENT: 8 }, window.COLS_VOCAB || {});

  function normalizeUnit(unitStr) {
    if (!unitStr) return 0;
    unitStr = String(unitStr);
    if (unitStr.includes("-")) {
      const parts = unitStr.split("-");
      if (parts.length < 3) return 0;
      return (parseInt(parts[0]) || 0) * 1000 + (parseInt(parts[1]) || 0) * 10 + (parseInt(parts[2]) || 0);
    }
    return parseInt(unitStr.replace(/\D/g, "")) || 0;
  }

  async function getVocabRows() {
    try {
      const cached = sessionStorage.getItem("allVocabData");
      if (cached) return JSON.parse(cached);
    } catch (e) { /* tải mới */ }
    if (!window.SHEET_URL) return [];
    try {
      const res = await withTimeout(fetch(window.SHEET_URL), 15000);
      const json = await res.json();
      const rows = json.data || json;
      try { sessionStorage.setItem("allVocabData", JSON.stringify(rows)); } catch (e) { /* quá dung lượng */ }
      return rows;
    } catch (e) {
      console.warn("[PKM Simple] Không tải được sheet từ vựng:", e);
      return [];
    }
  }

  function loadLevel() {
    const stored = localStorage.getItem("selected_level") || "de";
    S.level = stored === "trung_binh" ? "tb" : stored === "kho" ? "kho" : "de";
    S.cfg = CFG.LEVELS[S.level];
  }

  async function loadLessonData() {
    loadLevel();
    let mission = null;
    try { mission = JSON.parse(localStorage.getItem("current_mission") || "null"); } catch (e) { /* bỏ qua */ }
    const rows = await getVocabRows();

    if (mission && mission.id && rows.length) {
      const isBoss = !!mission.isBoss && Array.isArray(mission.bossItems) && mission.bossItems.length > 0;
      const bossKeys = isBoss
        ? new Set(mission.bossItems.map((it) => `${String(it.lessonId || "").trim()}|||${String(it.word || "").trim()}`))
        : null;
      const curUnit = isBoss
        ? Math.max(...mission.bossItems.map((it) => normalizeUnit(it.lessonId)))
        : normalizeUnit(mission.id);

      const lesson = [], pool = [];
      const seenL = new Set(), seenP = new Set();
      rows.forEach((row) => {
        const r = Array.isArray(row) ? row : Object.values(row);
        const lessonId = String(r[COL.LESSON_NAME] || "").trim();
        const word = String(r[COL.WORD] || "").trim();
        if (!word) return;
        const item = { word, meaning: String(r[COL.MEANING] || "").trim(), lessonId, sentence: String(r[COL.PRESENT_SENT] || "").trim() };
        const isCur = isBoss ? bossKeys.has(`${lessonId}|||${word}`) : lessonId === mission.id;
        const k = norm(word);
        if (isCur) { if (!seenL.has(k)) { seenL.add(k); lesson.push(item); } }
        const u = normalizeUnit(lessonId);
        if (u >= 2011 && u <= curUnit && !seenP.has(k)) { seenP.add(k); pool.push(item); }
      });

      if (lesson.length) {
        S.demo = false;
        S.lessonId = mission.id;
        S.lessonLabel = localStorage.getItem("selected_lesson_name") || String(mission.id).replace(/^[\d-]+\s*/, "");
        S.allWords = lesson;
        S.pool = pool.filter((p) => !seenL.has(norm(p.word)));
        // pool quá nhỏ → bổ sung từ mọi bài có trong sheet để đủ từ nhiễu
        if (S.pool.length < 8) {
          rows.forEach((row) => {
            const r = Array.isArray(row) ? row : Object.values(row);
            const word = String(r[COL.WORD] || "").trim(); const k = norm(word);
            if (!word || seenL.has(k) || seenP.has(k)) return;
            seenP.add(k);
            S.pool.push({ word, meaning: String(r[COL.MEANING] || "").trim(), lessonId: String(r[COL.LESSON_NAME] || "").trim() });
          });
        }
        return;
      }
    }

    // Không có bài → chế độ thử
    S.demo = true;
    S.lessonId = "demo";
    S.lessonLabel = "Chơi thử (chưa chọn bài)";
    S.allWords = DEMO_WORDS.map((w) => ({ ...w, lessonId: "demo" }));
    S.pool = [
      { word: "bird", meaning: "con chim", emoji: "🐦", lessonId: "demo" },
      { word: "car", meaning: "xe hơi", emoji: "🚗", lessonId: "demo" },
      { word: "fish", meaning: "con cá", emoji: "🐟", lessonId: "demo" },
      { word: "house", meaning: "ngôi nhà", emoji: "🏠", lessonId: "demo" },
      { word: "sun", meaning: "mặt trời", emoji: "☀️", lessonId: "demo" },
    ];
  }

  /* --- Mức độ thuộc từ (để chọn từ yếu trước khi bài có > 5 từ) --- */
  const MASTERY_KEY = "pkm_simple_mastery";
  const masteryKey = (w) => `${w.lessonId || S.lessonId}|${norm(w.word)}`;
  function loadMastery() { try { return JSON.parse(localStorage.getItem(MASTERY_KEY) || "{}"); } catch (e) { return {}; } }
  function updateMastery(w, ok) {
    if (S.demo) return;
    const m = loadMastery(); const k = masteryKey(w);
    m[k] = m[k] || { c: 0, s: 0 };
    m[k].s++; if (ok) m[k].c++;
    try { localStorage.setItem(MASTERY_KEY, JSON.stringify(m)); } catch (e) { /* bỏ qua */ }
  }
  function pickWordSet(words, exclude = []) {
    if (words.length <= CFG.WORDS_PER_SET) return [...words];
    const m = loadMastery();
    const ex = new Set(exclude.map((w) => norm(w.word)));
    const prio = (w) => { const x = m[masteryKey(w)]; return x && x.s ? x.c / x.s : -1; };
    const sorted = shuffle(words).sort((a, b) => {
      const ea = ex.has(norm(a.word)) ? 1 : 0, eb = ex.has(norm(b.word)) ? 1 : 0;
      return ea - eb || prio(a) - prio(b);
    });
    return sorted.slice(0, CFG.WORDS_PER_SET);
  }

  /* ==========================================================================
   * 4. ẢNH (imageCache của pkm-image.js)
   * ========================================================================== */
  let imageCache = null;
  async function loadImageCache() {
    if (imageCache !== null) return imageCache;
    try { imageCache = (await import("./pkm-image.js")).default || false; }
    catch (e) { console.warn("[PKM Simple] Không nạp được pkm-image.js — chạy không ảnh.", e); imageCache = false; }
    return imageCache;
  }
  const hasPic = (w) => !!(w && (w.img || w.emoji));
  function verifyImage(url) {
    return new Promise((resolve) => {
      const im = new Image();
      const t = setTimeout(() => resolve(true), 7000); // chậm thì cứ coi là ổn, ảnh sẽ hiện khi tải xong
      im.onload = () => { clearTimeout(t); resolve(true); };
      im.onerror = () => { clearTimeout(t); resolve(false); };
      im.src = url;
    });
  }
  async function loadImagesFor(words) {
    if (S.demo) return;
    const ic = await loadImageCache();
    if (!ic) return;
    await Promise.all(words.map(async (w) => {
      if (w.img || w.emoji || w._tried) return;
      w._tried = true;
      try {
        const r = await withTimeout(ic.getImage(w.word), 10000);
        // Picsum/Placeholder là ảnh ngẫu nhiên → dễ dạy sai từ, bỏ qua
        if (r && r.url && r.source !== "Picsum" && r.source !== "Placeholder") {
          if (await verifyImage(r.url)) w.img = r.url;
        }
      } catch (e) { /* không có ảnh cho từ này */ }
    }));
  }

  /* ==========================================================================
   * 5. ÂM THANH: đọc từ (TTS), hiệu ứng, ghi âm
   * ========================================================================== */
  let enVoice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    const vs = speechSynthesis.getVoices();
    enVoice = vs.find((v) => /en[-_]US/i.test(v.lang) && /Google|Samantha|Zira|Aria|Jenny|Female/i.test(v.name))
      || vs.find((v) => /en[-_]US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

  let curVI = null; // nguồn âm thanh tiếng Việt đang phát (để dừng khi sang câu mới)
  function stopSpeech() {
    try { if (curVI) { curVI.stop(); curVI = null; } } catch (e) { /* bỏ qua */ }
    try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) { /* bỏ qua */ }
  }
  function speakEN(text, rate = 0.85) {
    return new Promise((resolve) => {
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
      await new Promise((resolve) => {
        const src = audioCtx().createBufferSource();
        src.buffer = buf; src.connect(audioCtx().destination); src.onended = resolve; curVI = src; src.start();
      });
    } catch (e) {
      // dự phòng: giọng tiếng Việt của trình duyệt
      if (!("speechSynthesis" in window)) return;
      await new Promise((resolve) => {
        try {
          const u = new SpeechSynthesisUtterance(text); u.lang = "vi-VN"; u.rate = 0.9;
          const t = setTimeout(resolve, 4000); u.onend = u.onerror = () => { clearTimeout(t); resolve(); };
          speechSynthesis.speak(u);
        } catch (e2) { resolve(); }
      });
    }
  }

  // Token để các chuỗi âm thanh cũ tự dừng khi sang câu mới / khi đã trả lời
  function newAudio() { const tok = ++S.audioTok; return () => tok === S.audioTok; }

  // Hiệu ứng âm thanh bằng WebAudio (không cần file mp3)
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
    if (S.muted) return;
    try {
      if (name === "ok") { tone(659, 0, 0.12); tone(880, 0.1, 0.2); }
      else if (name === "combo") { tone(659, 0, 0.1); tone(880, 0.09, 0.1); tone(1175, 0.18, 0.28); }
      else if (name === "bad") { tone(260, 0, 0.16, "triangle", 0.12); tone(200, 0.12, 0.2, "triangle", 0.1); }
      else if (name === "tap") { tone(520, 0, 0.05, "sine", 0.08); }
      else if (name === "win") { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.3)); }
      else if (name === "stage") { tone(440, 0, 0.1); tone(587, 0.1, 0.1); tone(784, 0.2, 0.22); }
    } catch (e) { /* bỏ qua */ }
  }

  /* --- Ghi âm: Whisper (all-shared.js), dự phòng Web Speech API --- */
  let sharedMod = null;
  async function loadShared() {
    if (sharedMod !== null) return sharedMod;
    try { sharedMod = await import("./all-shared.js"); } catch (e) { console.warn("[PKM Simple] Không nạp được all-shared.js — dùng nhận dạng của trình duyệt.", e); sharedMod = false; }
    return sharedMod;
  }
  let activeStop = null;
  async function listenOnce(maxMs) {
    const sh = await loadShared();
    if (sh && sh.startRecording && sh.transcribeAudio && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const rec = await sh.startRecording(maxMs); // ném NotAllowedError nếu chưa cho dùng micro
      activeStop = () => rec.stop();
      const blob = await rec.blob; activeStop = null;
      const text = await sh.transcribeAudio(blob);
      if (text === null) throw new Error("stt-failed");
      return text;
    }
    return browserListen(maxMs);
  }
  function browserListen(maxMs) {
    return new Promise((resolve, reject) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return reject(Object.assign(new Error("no-stt"), { name: "NotSupported" }));
      const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 3;
      let got = null;
      rec.onresult = (e) => { got = [...e.results[0]].map((a) => a.transcript).join(" | "); };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") reject(Object.assign(new Error(e.error), { name: "NotAllowedError" }));
        else if (e.error === "no-speech") resolve("");
        else reject(new Error(e.error));
      };
      rec.onend = () => { activeStop = null; resolve(got ?? ""); };
      activeStop = () => { try { rec.stop(); } catch (e) { /* bỏ qua */ } };
      setTimeout(() => { try { rec.stop(); } catch (e) { /* bỏ qua */ } }, maxMs);
      try { rec.start(); } catch (e) { reject(e); }
    });
  }
  /* --- Chấm câu Nói: 1 lần ghi âm = từ ×3 (+ câu thuyết trình cột I) ---
   * Whisper hay viết số bằng chữ số ("1 1 1") nên đổi 0–20 về chữ trước khi so. */
  const NUMW = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  function speechTokens(s) {
    return String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/).filter(Boolean).map((t) => (/^\d+$/.test(t) && +t <= 20 ? NUMW[+t] : t));
  }
  // từ ngắn (<3 chữ) phải khớp tuyệt đối để "on" không bị nhận nhầm là "one"
  const tokEq = (a, b, tol) => a === b || (Math.min(a.length, b.length) >= 3 && lev(a, b) <= Math.floor(Math.max(a.length, b.length) * tol));
  function countPhrase(tokens, phrase, tol) { // đếm số lần cụm từ xuất hiện (không chồng nhau)
    let n = 0, i = 0;
    while (i + phrase.length <= tokens.length) {
      if (phrase.every((p, j) => tokEq(tokens[i + j], p, tol))) { n++; i += phrase.length; } else i++;
    }
    return n;
  }
  // → { reps: số lần nghe được từ (0–3), acc: % khớp cả đoạn, ok }
  function scoreSpeech(heard, word, sentence) {
    const tol = S.cfg.speakTol, wt = speechTokens(word), st = speechTokens(sentence);
    const occInSentence = st.length ? countPhrase(st, wt, tol) : 0;
    const target = [...Array(CFG.SPEAK_REPS).fill(wt).flat(), ...st];
    const isWordTok = new Set(wt);
    let best = { reps: 0, acc: 0, ok: false };
    String(heard || "").split("|").forEach((alt) => {
      const ht = speechTokens(alt); if (!ht.length) return;
      const count = countPhrase(ht, wt, tol);
      const pool = [...ht]; let hit = 0;
      target.forEach((t) => {
        const k = pool.findIndex((h) => (isWordTok.has(t) ? tokEq(h, t, tol) : h === t));
        if (k >= 0) { pool.splice(k, 1); hit++; }
      });
      const acc = Math.round((hit / target.length) * 100);
      // chỉ trừ số lần "từ" nằm trong câu khi bé thật sự đã đọc câu (acc đủ cao)
      const sentSpoken = st.length && acc >= S.cfg.sentThreshold;
      const reps = Math.max(0, Math.min(CFG.SPEAK_REPS, count - (sentSpoken ? occInSentence : 0)));
      const ok = count >= S.cfg.repNeed + occInSentence && (!st.length || acc >= S.cfg.sentThreshold);
      if ((ok && !best.ok) || (ok === best.ok && (reps > best.reps || (reps === best.reps && acc > best.acc)))) best = { reps, acc, ok };
    });
    return best;
  }

  /* ==========================================================================
   * 6. HIỆU ỨNG PHÁO GIẤY
   * ========================================================================== */
  const confetti = { parts: [], raf: null };
  function fxCanvas() {
    const c = $("#fx"); if (!c) return null;
    if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; }
    return c;
  }
  function burst(x, y, n = 36) {
    const c = fxCanvas(); if (!c || !c.getContext) return;
    if (reduceMotion()) n = Math.ceil(n / 4);
    const colors = ["#ff8a1f", "#2ea561", "#2f8ff0", "#ee4d7d", "#ffd23f", "#8b5cf6"];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
      confetti.parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, g: 0.28 + Math.random() * 0.12,
        w: 6 + Math.random() * 7, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        life: 70 + Math.random() * 40, col: pick(colors),
      });
    }
    if (!confetti.raf) confetti.raf = requestAnimationFrame(stepConfetti);
  }
  function stepConfetti() {
    const c = fxCanvas(); const ctx = c && c.getContext && c.getContext("2d");
    if (!ctx) { confetti.parts = []; confetti.raf = null; return; }
    ctx.clearRect(0, 0, c.width, c.height);
    confetti.parts = confetti.parts.filter((p) => p.life > 0 && p.y < c.height + 30);
    confetti.parts.forEach((p) => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--; p.vx *= 0.99;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.min(1, p.life / 25);
      ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    });
    confetti.raf = confetti.parts.length ? requestAnimationFrame(stepConfetti) : null;
    if (!confetti.parts.length) ctx.clearRect(0, 0, c.width, c.height);
  }
  function burstAt(el, n) {
    if (el && el.getBoundingClientRect) { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, n); }
    else burst(innerWidth / 2, innerHeight / 3, n);
  }

  /* ==========================================================================
   * 7. KHUNG GIAO DIỆN: linh vật, thanh trên/dưới, render từng câu
   * ========================================================================== */
  function say(text, mood = "idle") {
    const b = $("#bubble"), m = $("#mascot");
    if (b) b.textContent = text;
    if (m) {
      m.classList.remove("hop", "wobble"); void m.offsetWidth;
      if (mood === "happy") m.classList.add("hop");
      if (mood === "oops") m.classList.add("wobble");
    }
  }

  function render(html) {
    stopSpeech(); newAudio();
    S.cleanups.forEach((f) => { try { f(); } catch (e) { /* bỏ qua */ } });
    S.cleanups = []; S.replay = null; activeStop = null;
    const chip = $("#chip"); if (chip) chip.innerHTML = "";
    const c = $("#content");
    c.innerHTML = html;
    c.classList.remove("in"); void c.offsetWidth; c.classList.add("in");
    $("#stage").scrollTop = 0;
    const s = $("#spk"); if (s) s.onclick = () => { s.classList.remove("pulse"); void s.offsetWidth; s.classList.add("pulse"); replayNow(); };
  }
  function replayNow() { if (S.replay) { newAudio(); S.replay(); } }

  function buildProgress() {
    const prog = $("#prog"); prog.innerHTML = "";
    STAGES.forEach(() => { const seg = document.createElement("div"); seg.className = "seg"; seg.innerHTML = "<i></i>"; prog.appendChild(seg); });
  }
  function updateHud() {
    const total = S.plan.length;
    $("#cur").textContent = Math.min(S.idx + 1, total);
    $("#tot").textContent = total;
    $("#okN").textContent = S.results.filter((x) => x.firstTry === true).length;
    $$("#prog .seg").forEach((seg, si) => {
      const inStage = S.plan.filter((r) => r.stage === si).length;
      const done = S.results.filter((_, i) => S.plan[i] && S.plan[i].stage === si).length;
      seg.firstElementChild.style.width = inStage ? `${(done / inStage) * 100}%` : "0%";
      seg.classList.toggle("now", S.plan[S.idx] && S.plan[S.idx].stage === si);
    });
    const cb = $("#combo");
    if (S.combo >= 2) { cb.hidden = false; $("#comboN").textContent = S.combo; } else cb.hidden = true;
  }
  function tickClock() { $("#time").textContent = fmtTime(Math.floor((Date.now() - S.startedAt) / 1000)); }

  function toast(text, ms = 1700) {
    const t = $("#toast"); t.textContent = text; t.hidden = false;
    t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
    return sleep(ms).then(() => { t.hidden = true; });
  }

  /* --- phản hồi đúng / sai --- */
  function showChip(w) {
    const c = $("#chip"); if (!c) return;
    const meaning = w.meaning && norm(w.meaning) !== norm(w.word) ? ` <span>= ${esc(w.meaning)}</span>` : "";
    c.innerHTML = `<div class="chip-card"><b>${esc(w.word)}</b>${meaning}</div>`;
  }
  async function celebrate(first, w, el) {
    const alive = newAudio();
    let praise;
    if (first) {
      S.combo++; S.best = Math.max(S.best, S.combo);
      praise = COMBO[S.combo] || pick(PRAISE);
      say(praise.vi, "happy"); sfx(COMBO[S.combo] ? "combo" : "ok");
      burstAt(el, COMBO[S.combo] ? 90 : 36);
    } else {
      S.combo = 0;
      praise = { en: "Good!", vi: "Đúng rồi! Lần sau sẽ nhanh hơn nè 👍" };
      say(praise.vi, "happy"); sfx("ok"); burstAt(el, 14);
    }
    updateHud(); showChip(w);
    await speakEN(w.word, 0.8);
    if (alive() && !S.muted && first) speakEN(praise.en, 0.95);
    await sleep(first ? 900 : 1100);
    return first;
  }
  async function missed(w) {
    newAudio();
    S.combo = 0; updateHud();
    say(pick(MISS), "oops"); showChip(w);
    await speakEN(w.word, 0.75);
    await sleep(1500);
    return false;
  }
  function oops() { say(pick(OOPS), "oops"); }

  /* ==========================================================================
   * 8. CHỌN DẠNG BÀI + TẠO LỰA CHỌN
   * ========================================================================== */
  function distractors(w, n, { pic = false, meaning = false } = {}) {
    const seen = new Set([norm(w.word)]);
    const out = [];
    const add = (list) => {
      for (const x of shuffle(list)) {
        if (out.length >= n) break;
        const k = norm(x.word);
        if (seen.has(k)) continue;
        if (pic && !hasPic(x)) continue;
        if (meaning && (!x.meaning || norm(x.meaning) === norm(w.meaning))) continue;
        seen.add(k); out.push(x);
      }
    };
    add(S.set.filter((x) => x !== w)); // ưu tiên từ CÙNG bài
    add(S.pool);
    return out;
  }

  function misspellings(word, n) {
    const out = new Set();
    const chars = [...word]; const vowels = "aeiou";
    const letterIdx = chars.map((c, i) => (isLetter(c) ? i : -1)).filter((i) => i >= 0);
    const ops = [
      () => { if (chars.length < 4) return null; const i = rand(1, chars.length - 2); const c = [...chars]; [c[i], c[i + 1]] = [c[i + 1], c[i]]; return c.join(""); },
      () => { if (chars.length < 4) return null; const c = [...chars]; c.splice(rand(1, chars.length - 1), 1); return c.join(""); },
      () => { const idx = letterIdx.filter((i) => i > 0); if (!idx.length) return null; const i = pick(idx); const c = [...chars]; c.splice(i, 0, c[i]); return c.join(""); },
      () => { const idx = chars.map((c, i) => (vowels.includes(c.toLowerCase()) ? i : -1)).filter((i) => i >= 0); if (!idx.length) return null; const i = pick(idx); const c = [...chars]; c[i] = pick([...vowels].filter((v) => v !== c[i].toLowerCase())); return c.join(""); },
      () => { const map = { b: "d", d: "b", p: "q", q: "p", m: "n", n: "m", c: "k", k: "c", s: "z", z: "s" }; const idx = chars.map((c, i) => (map[c.toLowerCase()] ? i : -1)).filter((i) => i >= 0); if (!idx.length) return null; const i = pick(idx); const c = [...chars]; c[i] = map[c[i].toLowerCase()]; return c.join(""); },
    ];
    let guard = 0;
    while (out.size < n && guard++ < 50) { const r = pick(ops)(); if (r && r !== word && norm(r) !== norm(word)) out.add(r); }
    return [...out];
  }

  const hasMeaning = (w) => !!(w.meaning && norm(w.meaning) !== norm(w.word));
  function isUsable(type, w) {
    const nLetters = lettersOf(w.word).length;
    switch (type) {
      case "listenPic": return hasPic(w) && distractors(w, 2, { pic: true }).length >= 2;
      case "picWord": return hasPic(w) && distractors(w, 2).length >= 2;
      case "meaningWord": return hasMeaning(w) && distractors(w, 2).length >= 2;
      case "wordMeaning": return hasMeaning(w) && distractors(w, 2, { meaning: true }).length >= 2;
      case "spelling": return nLetters >= 4 && !w.word.includes(" ") && misspellings(w.word, 2).length >= 2;
      case "listenWord": return distractors(w, 2).length >= 2;
      case "typePic": return hasPic(w);
      case "unscramble": return nLetters >= 3 && nLetters <= 9;
      case "missing": return nLetters >= 3;
      default: return true; // dictation, sayWord, repeat
    }
  }
  function resolveType(r) {
    for (const t of [r.type, ...(FALLBACKS[r.type] || [])]) if (isUsable(t, r.word)) return t;
    return "dictation";
  }

  function buildPlan(set) {
    const plan = []; let prevLast = null;
    STAGES.forEach((st, si) => {
      const order = shuffle(set);
      if (order.length > 1 && order[0] === prevLast) order.push(order.shift()); // không để cùng 1 từ ra 2 câu liền nhau
      const bag = {};
      order.forEach((w, i) => {
        let skill, types;
        if (st.mixed) { const m = st.mixed[(i + (st.offset || 0)) % st.mixed.length]; skill = m.skill; types = m.types; }
        else { skill = st.skill; types = st.types; }
        const key = skill + types.join();
        if (!bag[key]) bag[key] = shuffle(types);
        plan.push({ stage: si, word: w, skill, type: bag[key][i % bag[key].length] });
      });
      prevLast = order[order.length - 1];
    });
    return plan;
  }

  /* ==========================================================================
   * 9. CÁC KHUNG HTML DÙNG CHUNG
   * ========================================================================== */
  const picHTML = (w) => (w.img ? `<img src="${esc(w.img)}" alt="" draggable="false">` : `<span class="emoji" aria-hidden="true">${w.emoji}</span>`);
  const picBox = (w) => `<div class="pic">${picHTML(w)}</div>`;
  const heroPic = (w) => `<div class="hero">${picBox(w)}</div>`;
  const heroText = (t) => `<div class="hero-text">${esc(t)}</div>`;
  const qHead = (en, vi) => `<div class="qhead"><h2>${esc(en)}</h2><p>${esc(vi)}</p></div>`;
  const spkBtn = () => `<button class="spk" id="spk" type="button" aria-label="Nghe">🔊</button>`;
  function optsHTML(items, layout, colorOffset = 0) {
    return `<div class="opts ${layout} n${items.length}" id="opts">${items
      .map((h, i) => `<button class="tile c${(i + colorOffset) % 4}" type="button">${h}</button>`).join("")}</div>`;
  }
  const lbl = (t) => `<span class="lbl">${esc(t)}</span>`;
  function maskWord(word, reveal) {
    let li = 0;
    return [...word].map((ch) => {
      if (!isLetter(ch)) return ch === " " ? "\u00A0\u00A0" : ch;
      return li++ < reveal ? ch : "_";
    }).join(" ");
  }

  /* ==========================================================================
   * 10. 4 "BỘ MÁY" TRẢ LỜI: chọn đáp án · gõ chữ · xếp chữ cái · nói
   * ========================================================================== */
  function runMCQ(w, correctIdx) {
    const btns = $$("#opts .tile");
    return new Promise((resolve) => {
      let tries = 0, done = false;
      btns.forEach((b, i) => {
        b.onclick = async () => {
          if (done || b.disabled) return;
          tries++; sfx("tap");
          if (i === correctIdx) {
            done = true; btns.forEach((x) => (x.disabled = true)); b.classList.add("right");
            resolve(await celebrate(tries === 1, w, b));
          } else {
            b.classList.add("wrong"); b.disabled = true; sfx("bad");
            const left = btns.filter((x) => !x.disabled).length;
            if (tries >= 2 || left <= 1) { // sai 2 lần → hiện đáp án đúng
              done = true; btns.forEach((x) => (x.disabled = true)); btns[correctIdx].classList.add("reveal");
              await missed(w); resolve(false);
            } else oops();
          }
        };
      });
    });
  }

  function typingHTML() {
    return `<div class="typing">
      <div class="hint" id="hint" aria-live="polite"></div>
      <input id="ans" class="ans" type="text" inputmode="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Gõ từ tiếng Anh">
      <div class="row"><button class="btn ghost" id="hintBtn" type="button">💡 Gợi ý</button><button class="btn go" id="go" type="button">Kiểm tra ✓</button></div>
    </div>`;
  }
  function runTyping(w) {
    const input = $("#ans"), go = $("#go"), hintEl = $("#hint"), hintBtn = $("#hintBtn");
    const target = w.word;
    return new Promise((resolve) => {
      let tries = 0, done = false, hinted = false, reveal = 0;
      const showHint = () => { hintEl.textContent = maskWord(target, reveal); };
      if (S.cfg.hint === "full") { reveal = 1; showHint(); } else if (S.cfg.hint === "blanks") showHint();
      hintBtn.onclick = () => { if (done) return; hinted = true; reveal = Math.min(reveal + 1, lettersOf(target).length); showHint(); sfx("tap"); input.focus(); };
      const check = async () => {
        if (done) return;
        const val = norm(input.value); if (!val) { input.focus(); return; }
        tries++;
        if (val === norm(target)) {
          done = true; input.disabled = true; input.classList.add("good"); go.disabled = true; hintBtn.disabled = true;
          resolve(await celebrate(tries === 1 && !hinted, w, input));
        } else if (tries >= CFG.MAX_TYPE_TRIES) {
          done = true; input.disabled = true; go.disabled = true; hintBtn.disabled = true;
          input.value = target; input.classList.add("good"); sfx("bad");
          await missed(w); resolve(false);
        } else {
          sfx("bad"); input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
          if (reveal < 1) { reveal = 1; showHint(); }
          say(lev(val, norm(target)) <= 1 ? "Gần đúng rồi! Kiểm tra lại chính tả nhé 🔍" : pick(OOPS), "oops");
          input.select();
        }
      };
      go.onclick = check;
      input.onkeydown = (e) => { if (e.key === "Enter") check(); };
      setTimeout(() => { try { input.focus(); } catch (e) { /* bỏ qua */ } }, 200);
    });
  }

  // template: [{ch, blank}]  ·  bank: các chữ cái để chọn
  function runTiles(w, template, bank) {
    const slotsEl = $("#slots"), bankEl = $("#bank");
    const filled = {}; const used = new Set();
    const blanks = template.map((t, i) => (t.blank ? i : -1)).filter((i) => i >= 0);
    let tries = 0, done = false, locked = false;

    slotsEl.innerHTML = template.map((t, i) =>
      t.blank ? `<button class="slot" type="button" data-s="${i}" aria-label="Ô trống"></button>`
        : t.ch === " " ? `<span class="gap"></span>` : `<span class="fixed">${esc(t.ch)}</span>`).join("");
    bankEl.innerHTML = bank.map((ch, j) => `<button class="btile c${j % 4}" type="button" data-b="${j}">${esc(ch)}</button>`).join("");
    const slotEls = {}; $$(".slot", slotsEl).forEach((el) => (slotEls[el.dataset.s] = el));
    const bankEls = $$(".btile", bankEl);

    const paint = () => {
      blanks.forEach((i) => {
        const el = slotEls[i]; const j = filled[i];
        el.textContent = j === undefined ? "" : bank[j];
        el.classList.toggle("on", j !== undefined);
      });
      bankEls.forEach((el, j) => { el.classList.toggle("used", used.has(j)); el.disabled = used.has(j) || done; });
    };
    const word = () => template.map((t, i) => (t.blank ? bank[filled[i]] : t.ch)).join("");
    const tapBank = (j) => {
      if (done || locked || used.has(j)) return;
      const k = blanks.find((i) => filled[i] === undefined); if (k === undefined) return;
      filled[k] = j; used.add(j); sfx("tap"); paint();
      if (blanks.every((i) => filled[i] !== undefined)) check();
    };
    const tapSlot = (k) => {
      if (done || locked || filled[k] === undefined) return;
      used.delete(filled[k]); delete filled[k]; sfx("tap"); paint();
    };

    let resolveFn = null;
    const result = new Promise((resolve) => { resolveFn = resolve; });

    async function check() {
      tries++; locked = true;
      if (norm(word()) === norm(w.word)) {
        done = true; slotsEl.classList.add("good"); paint();
        resolveFn(await celebrate(tries === 1, w, slotsEl)); return;
      }
      sfx("bad"); slotsEl.classList.remove("shake"); void slotsEl.offsetWidth; slotsEl.classList.add("shake");
      if (tries >= 2) {
        done = true; // hiện đáp án đúng
        paint();
        blanks.forEach((i) => { slotEls[i].textContent = template[i].ch; slotEls[i].classList.add("on", "reveal"); });
        resolveFn(await missed(w)); return;
      }
      say(pick(OOPS), "oops");
      await sleep(700);
      blanks.forEach((i) => delete filled[i]); used.clear(); locked = false; paint();
    }

    slotsEl.onclick = (e) => { const b = e.target.closest(".slot"); if (b) tapSlot(+b.dataset.s); };
    bankEl.onclick = (e) => { const b = e.target.closest(".btile"); if (b) tapBank(+b.dataset.b); };
    // bàn phím (máy tính): gõ chữ cái / Backspace
    const onKey = (e) => {
      if (done || locked || e.ctrlKey || e.metaKey) return;
      if (e.key === "Backspace") { const last = [...blanks].reverse().find((i) => filled[i] !== undefined); if (last !== undefined) tapSlot(last); return; }
      if (e.key.length === 1) { const j = bank.findIndex((ch, jj) => !used.has(jj) && ch.toLowerCase() === e.key.toLowerCase()); if (j >= 0) tapBank(j); }
    };
    document.addEventListener("keydown", onKey);
    S.cleanups.push(() => document.removeEventListener("keydown", onKey));
    paint();
    return result;
  }

  function micHTML() {
    return `<div class="mic-wrap">
      <button class="mic" id="mic" type="button" aria-label="Bấm để nói">🎤</button>
      <div class="micstatus" id="micStatus" aria-live="polite"></div>
      <div class="heard" id="heard"></div>
      <button class="btn ghost" id="skipMic" type="button" hidden>Bỏ qua</button>
    </div>`;
  }
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function sentenceHTML(sentence, word) {
    const re = new RegExp(`\\b(${escRe(word)}\\w*)`, "ig");
    return esc(sentence).replace(re, "<mark>$1</mark>");
  }
  // Hình thức nói theo cấp độ: Dễ = từ ×3 ; Trung bình/Khó = từ ×3 + câu thuyết trình (nếu sheet có)
  const speakSentence = (w) => (S.cfg.speakForm === "sentence" && w.sentence ? w.sentence : "");
  const speakModel = (w, sentence) => `${Array(CFG.SPEAK_REPS).fill(w.word).join(", ")}${sentence ? ". " + sentence : ""}`;

  // Khung hướng dẫn: ba chấm = 3 lần nói từ, chấm thứ tư (nếu có) = câu
  function speakPanelHTML(w, sentence) {
    const dots = Array.from({ length: CFG.SPEAK_REPS }, () => "<i></i>").join("") + (sentence ? '<i class="sent"></i>' : "");
    return `<div class="series">
      <div class="steplabel">${sentence ? "Nói từ này 3 lần, rồi đọc cả câu" : "Nói từ này 3 lần liền"}</div>
      <div class="reps" id="reps">${dots}</div>
      ${sentence
        ? `<div class="sentbox">${sentenceHTML(sentence, w.word)}</div>`
        : `<div class="secret" id="secret">${esc(maskWord(w.word, 0))}</div><button class="btn ghost" id="peek" type="button">👁 Xem chữ</button>`}
    </div>`;
  }

  /* 1 lần ghi âm cho cả "one one one" hoặc "one one one I'm one year old".
   * Trả về true/false (đúng ngay lần đầu hay không), hoặc null nếu micro không dùng được. */
  function runSpeak(w, sentence, { modelAuto = false } = {}) {
    const mic = $("#mic"), st = $("#micStatus"), heardEl = $("#heard"), skip = $("#skipMic");
    const dots = $$("#reps i"), peek = $("#peek");
    if (peek) peek.onclick = () => { $("#secret").textContent = w.word; peek.hidden = true; };
    const model = speakModel(w, sentence);
    const readyMsg = sentence ? "Chạm micro, nói từ 3 lần rồi đọc cả câu nhé!" : "Chạm micro rồi nói từ này 3 lần liền nhé!";

    return new Promise((resolve) => {
      let tries = 0, techFails = 0, busy = false, done = false, errored = false;
      // Máy đọc mẫu "one, one, one. I'm one year old." — khóa micro tới khi đọc xong
      // để micro không thu nhầm giọng máy.
      const playModel = async () => {
        newAudio(); mic.disabled = true; st.textContent = "🔊 Nghe mẫu trước nhé...";
        await speakEN(model, 0.8);
        if (done || !mic.isConnected) return;
        mic.disabled = false; st.textContent = readyMsg;
      };
      S.replay = () => { if (!busy && !done) playModel(); };
      const markErrored = (msg) => {
        errored = true; st.textContent = msg;
        skip.textContent = "Bỏ qua câu này (không tính điểm)"; skip.hidden = false;
      };
      const paintDots = (r) => dots.forEach((d, i) => {
        const isSent = d.classList.contains("sent");
        d.classList.toggle("ok", isSent ? r.acc >= S.cfg.sentThreshold : i < r.reps);
      });
      mic.onclick = async () => {
        if (done) return;
        if (busy) { if (activeStop) activeStop(); return; }
        newAudio(); stopSpeech();
        busy = true; mic.classList.add("live"); sfx("tap");
        st.textContent = "🎙️ Đang nghe... nói thật to nhé! (chạm lần nữa để dừng)";
        let text = null, err = null;
        try { text = await listenOnce(sentence ? 14000 : 6500); } catch (e) { err = e; }
        mic.classList.remove("live"); busy = false;
        if (err) {
          const denied = ["NotAllowedError", "PermissionDeniedError", "NotSupported", "NotFoundError"].includes(err.name);
          techFails++;
          if (denied || techFails >= 2) markErrored(denied ? "Chưa dùng được micro. Hãy cho phép micro trong trình duyệt nhé." : "Máy chưa nghe rõ được. Bạn thử lại hoặc bỏ qua nhé.");
          else st.textContent = "Chưa nhận được giọng nói, bạn thử lại nhé!";
          return;
        }
        if (!norm(text)) { st.textContent = "Mình chưa nghe thấy gì — nói to hơn nhé! 🔊"; return; }
        tries++;
        const r = scoreSpeech(text, w.word, sentence);
        paintDots(r);
        heardEl.textContent = `Mình nghe là: “${String(text).split("|")[0].trim()}”`;
        if (r.ok) {
          done = true; mic.disabled = true; skip.hidden = true; mic.classList.add("ok");
          resolve(await celebrate(tries === 1, w, mic));
        } else if (tries >= CFG.MAX_SPEAK_TRIES) {
          done = true; mic.disabled = true; skip.hidden = true; sfx("bad");
          await missed(w); resolve(false);
        } else {
          sfx("bad");
          st.textContent = `Mình nghe được ${r.reps}/${CFG.SPEAK_REPS} lần${sentence ? `, câu khớp ${r.acc}%` : ""}. Nghe mẫu rồi thử lại nhé!`;
          oops(); skip.textContent = "Bỏ qua"; skip.hidden = false;
          const msg = st.textContent; await playModel(); if (!done) st.textContent = msg;
        }
      };
      skip.onclick = async () => {
        if (done || busy) return; done = true; mic.disabled = true; skip.hidden = true;
        if (tries === 0 && errored) { showChip(w); resolve(null); return; }
        await missed(w); resolve(false);
      };
      if (modelAuto) playModel(); else st.textContent = readyMsg;
    });
  }

  /* ==========================================================================
   * 11. CÁC DẠNG BÀI (T.<tên> = async (round) => ({ firstTry: true|false|null }))
   * ========================================================================== */
  const T = {};
  const nOpt = () => S.cfg.options;

  // ---- NGHE ----
  T.listenPic = async (r) => {
    const w = r.word;
    const opts = shuffle([w, ...distractors(w, nOpt() - 1, { pic: true })]);
    render(`${spkBtn()}${qHead("Listen and tap the picture.", "Nghe và chạm vào hình đúng")}${optsHTML(opts.map(picBox), "grid")}`);
    S.replay = () => speakEN(w.word, 0.8);
    say("Nghe thật kỹ rồi chọn hình đúng nhé! 👂");
    const alive = newAudio();
    (async () => { await speakEN(w.word, 0.8); if (!alive()) return; await sleep(500); if (!alive()) return; await speakEN(w.word, 0.65); })();
    return { firstTry: await runMCQ(w, opts.indexOf(w)) };
  };

  T.listenWord = async (r) => {
    const w = r.word;
    const opts = shuffle([w, ...distractors(w, nOpt() - 1)]);
    render(`${spkBtn()}${qHead("Listen and choose the word.", "Nghe và chọn từ đúng")}${optsHTML(opts.map((o) => lbl(o.word)), "list")}`);
    S.replay = () => speakEN(w.word, 0.8);
    say("Không có hình đâu, chỉ nghe thôi nha! 🎧");
    const alive = newAudio();
    (async () => { await speakEN(w.word, 0.8); if (!alive()) return; await sleep(500); if (!alive()) return; await speakEN(w.word, 0.65); })();
    return { firstTry: await runMCQ(w, opts.indexOf(w)) };
  };

  // ---- ĐỌC ----
  T.picWord = async (r) => {
    const w = r.word;
    const opts = shuffle([w, ...distractors(w, nOpt() - 1)]);
    render(`${qHead("What is this?", "Đây là gì?")}${heroPic(w)}${optsHTML(opts.map((o) => lbl(o.word)), "list", 1)}`);
    S.replay = () => speakEN(w.word, 0.8);
    say("Nhìn hình và chọn từ tiếng Anh đúng nhé! 👀");
    return { firstTry: await runMCQ(w, opts.indexOf(w)) };
  };

  T.meaningWord = async (r) => {
    const w = r.word;
    const opts = shuffle([w, ...distractors(w, nOpt() - 1)]);
    render(`${qHead("Which word means…", "Từ tiếng Anh nào có nghĩa là…")}${spkBtn()}${heroText(w.meaning)}${optsHTML(opts.map((o) => lbl(o.word)), "list")}`);
    S.replay = () => speakVI(w.meaning);
    say("Đọc nghĩa tiếng Việt rồi chọn từ tiếng Anh nhé! 📖");
    speakVI(w.meaning);
    return { firstTry: await runMCQ(w, opts.indexOf(w)) };
  };

  T.wordMeaning = async (r) => {
    const w = r.word;
    const opts = shuffle([w, ...distractors(w, nOpt() - 1, { meaning: true })]);
    render(`${qHead("What does this word mean?", "Từ này có nghĩa là gì?")}${spkBtn()}${heroText(w.word)}${optsHTML(opts.map((o) => lbl(o.meaning)), "list")}`);
    S.replay = () => speakEN(w.word, 0.8);
    say("Đọc từ tiếng Anh rồi chọn nghĩa đúng nhé! 🧠");
    speakEN(w.word, 0.8);
    return { firstTry: await runMCQ(w, opts.indexOf(w)) };
  };

  T.spelling = async (r) => {
    const w = r.word;
    const opts = shuffle([w.word, ...misspellings(w.word, nOpt() - 1)]);
    render(`${qHead("Which spelling is correct?", "Cách viết nào đúng?")}${hasPic(w) ? heroPic(w) : heroText(w.meaning)}${optsHTML(opts.map(lbl), "list", 1)}`);
    S.replay = () => speakEN(w.word, 0.8);
    say("Chú ý từng chữ cái nhé, có 1 cách viết đúng thôi! 🔍");
    return { firstTry: await runMCQ(w, opts.indexOf(w.word)) };
  };

  // ---- VIẾT ----
  function tilesTemplate(w, mode) {
    const chars = [...w.word];
    if (mode === "all") return chars.map((ch) => ({ ch, blank: isLetter(ch) }));
    const idx = chars.map((c, i) => (isLetter(c) ? i : -1)).filter((i) => i >= 0);
    const n = Math.max(1, Math.min(idx.length - 1, Math.round(idx.length * S.cfg.hidden)));
    const blank = new Set(shuffle(idx).slice(0, n));
    return chars.map((ch, i) => ({ ch, blank: blank.has(i) }));
  }
  const tilesHead = (w) => (hasPic(w) ? heroPic(w) : "") + (hasMeaning(w) ? `<div class="meaning-tag">${esc(w.meaning)}</div>` : "");
  const tilesBoard = `<div class="slots" id="slots"></div><div class="bank" id="bank"></div>`;

  T.unscramble = async (r) => {
    const w = r.word;
    const template = tilesTemplate(w, "all");
    const letters = template.filter((t) => t.blank).map((t) => t.ch);
    let bank = shuffle(letters), g = 0;
    while (g++ < 12 && bank.join("") === letters.join("") && new Set(letters).size > 1) bank = shuffle(letters);
    render(`${qHead("Put the letters in order.", "Sắp xếp các chữ cái thành từ đúng")}${spkBtn()}${tilesHead(w)}${tilesBoard}`);
    S.replay = () => speakEN(w.word, 0.8);
    say("Chạm các chữ cái theo đúng thứ tự nhé! 🧩");
    speakEN(w.word, 0.8);
    return { firstTry: await runTiles(w, template, bank) };
  };

  T.missing = async (r) => {
    const w = r.word;
    const template = tilesTemplate(w, "some");
    const need = template.filter((t) => t.blank).map((t) => t.ch);
    const abc = "abcdefghijklmnopqrstuvwxyz".split("").filter((c) => !need.map((x) => x.toLowerCase()).includes(c));
    const bank = shuffle([...need, ...shuffle(abc).slice(0, S.cfg.decoys)]);
    render(`${qHead("Fill in the missing letters.", "Điền các chữ cái còn thiếu")}${spkBtn()}${tilesHead(w)}${tilesBoard}`);
    S.replay = () => speakEN(w.word, 0.8);
    say("Điền chữ cái còn thiếu vào chỗ trống nhé! ✏️");
    speakEN(w.word, 0.8);
    return { firstTry: await runTiles(w, template, bank) };
  };

  T.typePic = async (r) => {
    const w = r.word;
    render(`${qHead("Type the word.", "Nhìn hình và gõ từ tiếng Anh")}${heroPic(w)}${hasMeaning(w) ? `<div class="meaning-tag">${esc(w.meaning)}</div>` : ""}${typingHTML()}`);
    S.replay = () => speakEN(w.word, 0.8);
    say("Gõ từ tiếng Anh cho hình này nhé! ⌨️");
    return { firstTry: await runTyping(w) };
  };

  T.dictation = async (r) => {
    const w = r.word;
    render(`${spkBtn()}${qHead("Listen and type the word.", "Nghe và gõ lại từ")}${typingHTML()}`);
    S.replay = () => speakEN(w.word, 0.75);
    say("Nghe thật kỹ rồi gõ lại từ nhé! 🎧");
    const alive = newAudio();
    (async () => { await speakEN(w.word, 0.8); if (!alive()) return; await sleep(500); if (!alive()) return; await speakEN(w.word, 0.65); })();
    return { firstTry: await runTyping(w) };
  };

  // ---- NÓI ----
  T.sayWord = async (r) => {
    const w = r.word, sentence = speakSentence(w);
    render(`${qHead(sentence ? "Say the word 3 times, then the sentence." : "Say the word 3 times.", sentence ? "Nhìn hình, nói từ 3 lần rồi đọc câu" : "Nhìn hình và nói từ 3 lần liền")}${hasPic(w) ? heroPic(w) : ""}${hasMeaning(w) ? `<div class="meaning-tag">${esc(w.meaning)}</div>` : ""}${speakPanelHTML(w, sentence)}${micHTML()}`);
    say("Nghe mẫu trước, rồi bấm micro và nói to nhé! 🎤");
    return { firstTry: await runSpeak(w, sentence, { modelAuto: true }) };
  };

  T.repeat = async (r) => {
    const w = r.word, sentence = speakSentence(w);
    render(`${spkBtn()}${qHead("Listen and repeat.", sentence ? "Nghe rồi nhắc lại: từ 3 lần + câu" : "Nghe rồi nhắc lại 3 lần")}${speakPanelHTML(w, sentence)}${micHTML()}`);
    say("Nghe xong thì nhắc lại giống hệt nhé! 🗣️");
    return { firstTry: await runSpeak(w, sentence, { modelAuto: true }) };
  };

  /* ==========================================================================
   * 12. LƯU ĐIỂM — dùng PkmScore giống hệt pkm_battle.js
   * ========================================================================== */
  function commitScore(counted) {
    const total = counted.length, correct = counted.filter((x) => x.firstTry).length;
    const skills = { listening: { c: 0, t: 0 }, speaking: { c: 0, t: 0 }, reading: { c: 0, t: 0 }, writing: { c: 0, t: 0 } };
    counted.forEach((x) => { skills[x.skill].t++; if (x.firstTry) skills[x.skill].c++; });
    if (S.demo) return { skipped: true, demo: true, bonusEXP: 0, bonusDV: 0 }; // chơi thử không ghi điểm

    const P = window.PkmScore;
    if (P && typeof P.finishMatch === "function") {
      try {
        P.reset();
        P.session.introRecorded = true; // không cộng điểm "Giới thiệu" cho chế độ này
        P.session.totalCount = total; P.session.correctCount = correct; P.session.wrongCount = total - correct;
        Object.keys(skills).forEach((k) => { P.session.skillStats[k] = { correct: skills[k].c, total: skills[k].t }; });
        if (P.resetMatchTotals) P.resetMatchTotals();
        return P.finishMatch({ won: true, minQuestions: CFG.MIN_Q_FOR_SCORE });
      } catch (e) { console.error("[PKM Simple] Lỗi PkmScore:", e); }
    }
    // Dự phòng khi không có pkm_score.js: vẫn cộng điểm kỹ năng vào cùng key mà Battle dùng
    try {
      const prev = JSON.parse(localStorage.getItem("pkm_skill_scores")) || {};
      Object.keys(skills).forEach((k) => {
        prev[k] = prev[k] || { correct: 0, total: 0 };
        prev[k].correct += skills[k].c; prev[k].total += skills[k].t;
      });
      localStorage.setItem("pkm_skill_scores", JSON.stringify(prev));
    } catch (e) { /* bỏ qua */ }
    return { skipped: true, bonusEXP: 0, bonusDV: 0 };
  }

  /* ==========================================================================
   * 13. MÀN HÌNH: bắt đầu · giữa chặng · thoát · kết quả
   * ========================================================================== */
  function overlay(html, cls = "") {
    const ov = $("#overlay"); ov.className = cls; ov.innerHTML = html; ov.hidden = false; ov.scrollTop = 0;
    return ov;
  }
  function hideOverlay() { const ov = $("#overlay"); ov.hidden = true; ov.innerHTML = ""; }

  function showStart() {
    const n = S.set.length * STAGES.length;
    overlay(`<div class="card start">
      <div class="logo" aria-hidden="true">⚡</div>
      <h1>PKM Simple</h1>
      <p class="lesson">${esc(S.lessonLabel)}</p>
      ${S.demo ? `<p class="demo">Bạn chưa chọn bài học nên đang chơi thử với từ mẫu. Điểm sẽ không được lưu.</p>` : ""}
      <div class="wordchips">${S.set.map((w) => `<span>${w.emoji ? w.emoji + " " : ""}${esc(w.word)}</span>`).join("")}</div>
      <ul class="facts">
        <li><b>${n} câu</b> · ${STAGES.length} chặng, từ dễ đến khó</li>
        <li>🎧 Nghe · 🎤 Nói · 📖 Đọc · ✏️ Viết</li>
        <li>Cấp độ: ${esc(S.cfg.label)}</li>
      </ul>
      <button class="btn go big" id="btnStart" type="button">Bắt đầu chơi</button>
      <a class="back" href="${CFG.BACK_URL}">Quay lại chọn chế độ</a>
    </div>`);
    $("#btnStart").onclick = async () => {
      const b = $("#btnStart"); b.disabled = true; b.textContent = "Đang chuẩn bị hình ảnh…";
      audioCtx(); pickVoice();
      try { if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (e) { /* mở khoá TTS trên iOS */ }
      await Promise.race([S.imagesReady, sleep(12000)]);
      hideOverlay(); startRun();
    };
  }

  function showStageBanner(si, extra) {
    const st = STAGES[si];
    const skills = st.mixed ? st.mixed.map((m) => m.skill) : [st.skill];
    return new Promise((resolve) => {
      overlay(`<div class="banner">
        ${extra ? `<div class="mile">${esc(extra)}</div>` : ""}
        <div class="b-emoji" aria-hidden="true">${st.emoji}</div>
        <div class="b-step">Chặng ${si + 1}/${STAGES.length}</div>
        <h2>${esc(st.title)}</h2>
        <p>${esc(st.desc)}</p>
        <div class="b-skills">${skills.map((k) => `<span>${SKILL_ICON[k]} ${SKILL_VI[k]}</span>`).join("")}</div>
        <button class="btn go" id="bgo" type="button">Sẵn sàng! 🚀</button>
      </div>`, "dim");
      sfx("stage"); speakEN(st.cue, 0.95);
      let t = null;
      const close = () => { clearTimeout(t); hideOverlay(); resolve(); };
      $("#bgo").onclick = close;
      t = setTimeout(close, extra ? 3400 : 2600);
    });
  }

  function openExit() {
    const m = $("#modal"); m.hidden = false;
    m.innerHTML = `<div class="card small" role="dialog" aria-modal="true" aria-label="Thoát">
      <h3>Thoát khỏi lượt chơi?</h3>
      <p>Điểm của lượt này sẽ không được lưu.</p>
      <div class="row"><button class="btn ghost" id="exStay" type="button">Chơi tiếp</button><button class="btn danger" id="exLeave" type="button">Thoát</button></div></div>`;
    $("#exStay").onclick = () => { m.hidden = true; m.innerHTML = ""; };
    $("#exLeave").onclick = () => { S.running = false; location.href = CFG.BACK_URL; };
    $("#exStay").focus();
  }

  function showResults(info) {
    const { total, correct, acc, secs, reward } = info;
    const stars = acc >= 90 ? 3 : acc >= 70 ? 2 : 1;
    const title = acc >= 90 ? "Siêu sao từ vựng! 🏆" : acc >= 75 ? "Giỏi lắm! 🎉" : acc >= 50 ? "Khá lắm, cố thêm chút nữa nhé! 💪" : "Bạn đã rất cố gắng! Chơi lại để nhớ lâu hơn nhé 🌱";

    const skillRows = Object.keys(SKILL_VI).map((k) => {
      const rs = S.results.filter((x) => x.skill === k && x.firstTry !== null);
      const c = rs.filter((x) => x.firstTry).length, pct = rs.length ? Math.round((c / rs.length) * 100) : null;
      return `<div class="sk"><span>${SKILL_ICON[k]} ${SKILL_VI[k]}</span><div class="bar"><i style="width:${pct ?? 0}%"></i></div><b>${pct === null ? "—" : c + "/" + rs.length}</b></div>`;
    }).join("");

    const wordRows = S.set.map((w, i) => {
      const rs = S.results.filter((x) => x.word === w && x.firstTry !== null);
      const pct = rs.length ? (rs.filter((x) => x.firstTry).length / rs.length) * 100 : 0;
      const st = pct >= 80 ? "⭐⭐⭐" : pct >= 50 ? "⭐⭐" : "⭐";
      return `<button class="wrow" type="button" data-w="${i}">
        <span class="wp">${hasPic(w) ? picHTML(w) : "🔤"}</span>
        <span class="wt"><b>${esc(w.word)}</b><small>${esc(hasMeaning(w) ? w.meaning : "")}</small></span>
        <span class="ws">${st}${pct < 50 ? "<small>Ôn thêm nhé</small>" : ""}</span></button>`;
    }).join("");

    let rewardHTML = "";
    if (reward && !reward.skipped) {
      rewardHTML = `<div class="reward">🎁 +${reward.bonusEXP} EXP · +${reward.bonusDV} DV${reward.newLessonUnlocked ? " · 🔓 Mở khoá bài mới!" : ""}</div>`;
    } else if (reward && reward.demo) {
      rewardHTML = `<div class="reward muted">Chơi thử nên chưa lưu điểm. Hãy chọn bài trên bản đồ để tích điểm nhé!</div>`;
    } else if (total < CFG.MIN_Q_FOR_SCORE) {
      rewardHTML = `<div class="reward muted">Chơi ít nhất ${CFG.MIN_Q_FOR_SCORE} câu để được tính điểm nhé!</div>`;
    }

    overlay(`<div class="card results">
      <div class="stars" aria-label="${stars} sao">${[1, 2, 3].map((i) => `<span class="${i <= stars ? "on" : ""}" style="animation-delay:${0.25 * i}s">★</span>`).join("")}</div>
      <h2>${title}</h2>
      <div class="stats">
        <div><b>${correct}/${total}</b><small>đúng ngay lần đầu</small></div>
        <div><b>${fmtTime(secs)}</b><small>thời gian</small></div>
        <div><b>${S.best}</b><small>chuỗi đúng dài nhất</small></div>
      </div>
      ${rewardHTML}
      <div class="skills">${skillRows}</div>
      <h3>Từ trong bài</h3>
      <div class="words">${wordRows}</div>
      <div class="actions">
        <button class="btn go big" id="again" type="button">Chơi lại</button>
        ${S.allWords.length > CFG.WORDS_PER_SET ? `<button class="btn alt" id="moreSet" type="button">Chơi bộ từ khác</button>` : ""}
        <a class="btn ghost" href="${CFG.MAP_URL}">Về bản đồ</a>
        <a class="back" href="${CFG.BACK_URL}">Chọn chế độ khác</a>
      </div>
    </div>`, "results-ov");

    $$(".wrow").forEach((b) => (b.onclick = () => speakEN(S.set[+b.dataset.w].word, 0.8)));
    $("#again").onclick = () => { hideOverlay(); startRun(); };
    const more = $("#moreSet");
    if (more) more.onclick = async () => {
      more.disabled = true; more.textContent = "Đang chuẩn bị…";
      S.set = pickWordSet(S.allWords, S.set);
      S.imagesReady = loadImagesFor(S.set);
      await Promise.race([S.imagesReady, sleep(12000)]);
      hideOverlay(); startRun();
    };

    sfx("win");
    [0, 350, 700].forEach((d) => setTimeout(() => burst(innerWidth * (0.25 + Math.random() * 0.5), innerHeight * 0.3, 70), d));
    setTimeout(() => speakEN(acc >= 75 ? "Great job! You are a star!" : "Good try! Let's play again!", 0.95), 600);
  }

  /* ==========================================================================
   * 14. VÒNG CHƠI CHÍNH
   * ========================================================================== */
  async function startRun() {
    if (S.running) return;
    S.plan = buildPlan(S.set); S.idx = 0; S.results = []; S.combo = 0; S.best = 0;
    S.startedAt = Date.now(); clearInterval(S.timerId); S.timerId = setInterval(tickClock, 1000); tickClock();
    buildProgress(); updateHud(); S.running = true;

    const len = S.plan.length, m1 = Math.round(len / 3), m2 = Math.round((len * 2) / 3);
    let lastStage = -1;
    for (let i = 0; i < len; i++) {
      if (!S.running) return;
      const r = S.plan[i];
      if (r.stage !== lastStage) {
        lastStage = r.stage;
        await showStageBanner(r.stage, i === m1 ? MILESTONES[10] : i === m2 ? MILESTONES[20] : "");
      }
      S.idx = i; r.type = resolveType(r); updateHud();
      let res;
      try { res = await T[r.type](r); }
      catch (err) { console.error("[PKM Simple] Lỗi ở dạng", r.type, err); res = { firstTry: null }; }
      if (!S.running) return;
      S.results.push({ word: r.word, skill: r.skill, type: r.type, stage: r.stage, firstTry: res.firstTry });
      if (res.firstTry !== null) updateMastery(r.word, res.firstTry);
      updateHud();
      await sleep(120);
    }
    finishRun();
  }

  function finishRun() {
    S.running = false; clearInterval(S.timerId);
    const counted = S.results.filter((x) => x.firstTry !== null);
    const total = counted.length, correct = counted.filter((x) => x.firstTry).length;
    const acc = total ? Math.round((correct / total) * 100) : 0;
    const reward = commitScore(counted);
    say("Xong rồi! Bạn giỏi lắm! 🎉", "happy");
    showResults({ total, correct, acc, secs: Math.floor((Date.now() - S.startedAt) / 1000), reward });
  }

  /* ==========================================================================
   * 15. KHỞI ĐỘNG
   * ========================================================================== */
  async function boot() {
    try { S.muted = localStorage.getItem("pkm_simple_muted") === "1"; } catch (e) { /* bỏ qua */ }
    const sfxBtn = $("#btnSfx");
    const paintSfx = () => { sfxBtn.textContent = S.muted ? "🔕" : "🔔"; sfxBtn.setAttribute("aria-label", S.muted ? "Bật hiệu ứng âm thanh" : "Tắt hiệu ứng âm thanh"); };
    sfxBtn.onclick = () => { S.muted = !S.muted; try { localStorage.setItem("pkm_simple_muted", S.muted ? "1" : "0"); } catch (e) { /* bỏ qua */ } paintSfx(); sfx("tap"); };
    paintSfx();
    $("#btnReplay").onclick = replayNow;
    $("#btnExit").onclick = openExit;

    try {
      await loadLessonData();
    } catch (e) {
      console.error(e);
      overlay(`<div class="card small"><h3>Không tải được bài học</h3><p>Hãy kiểm tra mạng rồi thử lại nhé.</p><div class="row"><button class="btn go" onclick="location.reload()">Thử lại</button><a class="btn ghost" href="${CFG.BACK_URL}">Quay lại</a></div></div>`);
      return;
    }
    S.set = pickWordSet(S.allWords);
    S.imagesReady = loadImagesFor(S.set);
    S.imagesReady.then(() => loadImagesFor(shuffle(S.pool).slice(0, 6))); // ảnh cho từ nhiễu, tải nền
    buildProgress(); updateHud(); say("Chào bạn! Mình cùng học từ mới nhé! 👋");
    showStart();
  }

  window.PkmSimple = { S, T, STAGES, CFG, buildPlan, resolveType, distractors, misspellings, scoreSpeech, lev, norm };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();