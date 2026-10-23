/**
 * ============================================================================
 * module-4-reading.js — MODULE 4: ĐỌC (bản viết lại)
 * ============================================================================
 * Dễ A/B, TB A/B, Khó A/B: soạn `rounds` rồi gọi PkmGameLauncher.launch() sang
 * minigame đua thú, giống hệt Module 2/3.
 *
 * MẦM NON (🎴 Túi mù / lật thẻ tìm cặp) là NGOẠI LỆ — GIỮ NGUYÊN chạy tại chỗ
 * trong rootEl, KHÔNG đẩy qua minigame race. Lý do: đây là 1 trò chơi nhiều
 * bước liên tục (lật thẻ nhiều lần đến khi tìm đủ cặp), không có khái niệm
 * "1 đề bài -> 1 đáp án -> thú chạy" mà race game được thiết kế cho. Ép vào
 * khuôn round-based sẽ mất hẳn cơ chế lật-thẻ-nhớ-vị-trí là bản chất của trò
 * chơi này. Đây đúng là kiểu "dạng riêng chỉ module này cần" — để dành làm
 * minigame riêng sau, như đã thống nhất.
 *
 * NGUYÊN TẮC RIÊNG CỦA ĐỌC: học sinh phải ĐỌC CHỮ trước — KHÔNG được đọc sẵn
 * (TTS) nội dung câu hỏi/đoạn văn lúc đề bài xuất hiện. Vì vậy các round ở
 * đây CỐ TÌNH bỏ trống `speakPromptText` (engine chỉ đọc lên nếu field này có
 * giá trị — xem showPrompt() trong pkm_minigame_race.js). Học sinh CHẠM vào 1
 * đáp án thì đáp án đó mới được phát âm (engine đã làm sẵn việc này trong
 * openAnswerPanel: `speakEN(opt.label...)` khi bấm chọn) — tăng tiếp xúc
 * tiếng Anh mà không biến bài Đọc thành bài Nghe trá hình.
 * ============================================================================
 */

import {
  LEVELS, speakEN, speakInstructionOnce, buildDistractors, shuffle, randomPick,
  createScoreTracker, recordQuestionPassed, saveReadingResult, showTransition,
  updateMiniScore, getImageFromMap, injectSharedStyles, PkmGameLauncher,
} from "./all-shared.js";

// ============================================================================
// HELPER RIÊNG — chỉ dùng lúc SOẠN dữ liệu (build-time)
// ============================================================================

/** Thêm dấu . cuối câu nếu câu chưa tự có dấu kết (., !, ?). */
function ensureDot(text) {
  if (!text) return "";
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : t + ".";
}

/**
 * Chọn `count` câu nhiễu cho đoạn văn — không trùng đáp án đúng, tối đa 1 câu
 * cùng bài, các câu còn lại mỗi câu 1 bài khác nhau (vét thêm nếu thiếu).
 */
function pickDiverseFillerSentences(target, pool, count) {
  const targetSentence = (target.presentSent || target.question || "").trim().toLowerCase();
  const usable = pool.filter(p => p.presentSent && p.presentSent.trim()
    && p.presentSent.trim().toLowerCase() !== targetSentence);

  const sameLesson = shuffle(usable.filter(p => p.lessonId === target.lessonId));
  const otherLesson = shuffle(usable.filter(p => p.lessonId !== target.lessonId));

  const picked = [];
  const usedLessonIds = new Set([target.lessonId]);
  const usedSentences = new Set([targetSentence]);

  const tryAdd = (item) => {
    const s = item.presentSent.trim();
    const key = s.toLowerCase();
    if (usedSentences.has(key)) return false;
    usedSentences.add(key);
    picked.push(s);
    return true;
  };

  if (sameLesson.length) tryAdd(sameLesson[0]);
  for (const item of otherLesson) {
    if (picked.length >= count) break;
    if (usedLessonIds.has(item.lessonId)) continue;
    if (tryAdd(item)) usedLessonIds.add(item.lessonId);
  }
  if (picked.length < count) {
    for (const item of [...otherLesson, ...sameLesson.slice(1)]) {
      if (picked.length >= count) break;
      tryAdd(item);
    }
  }
  return picked.slice(0, count);
}

// ============================================================================
// STYLE RIÊNG (chỉ còn cần cho Mầm non — túi mù chạy tại chỗ)
// ============================================================================

function injectModule4Styles() {
  if (document.getElementById("pkl-m4-style")) return;
  const style = document.createElement("style");
  style.id = "pkl-m4-style";
  style.textContent = `
    .pkl-mm-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; max-width:420px; margin:0 auto; }
    @media (max-width:420px){ .pkl-mm-grid{ grid-template-columns:repeat(3,1fr); } }
    .pkl-mm-card {
      aspect-ratio:1/1; border-radius:12px; cursor:pointer; overflow:hidden;
      background:linear-gradient(145deg,#e53935,#b71c1c); display:flex; align-items:center;
      justify-content:center; font-size:26px; box-shadow:0 4px 10px rgba(0,0,0,.3); transition:transform .15s;
    }
    .pkl-mm-card:active { transform:scale(.95); }
    .pkl-mm-card.flipped { background:#fff; }
    .pkl-mm-card.flipped img { width:100%; height:100%; object-fit:cover; }
    .pkl-mm-card.matched { opacity:.55; cursor:default; }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// MẦM NON — 🎴 Túi mù (memory match) — CHẠY TẠI CHỖ, không qua minigame race
// ============================================================================

function readMamNon_MemoryMatch(rootEl, sessionVocab, tracker) {
  injectModule4Styles();

  const cards = shuffle(
    sessionVocab.flatMap((w, idx) => [
      { pairId: idx, word: w.word, imgUrl: getImageFromMap(w.imageKeyword || w.word) || "" },
      { pairId: idx, word: w.word, imgUrl: getImageFromMap(w.imageKeyword || w.word) || "" },
    ])
  );

  rootEl.innerHTML = `
    <div style="text-align:center;color:#FFCB05;font-weight:700;margin-bottom:10px;">🎴 Find the matching pictures!</div>
    <div class="pkl-mm-grid" id="pklMMGrid"></div>
  `;
  const grid = document.getElementById("pklMMGrid");

  return new Promise(resolve => {
    speakInstructionOnce("mamnon-memory", "Tap the cards to find two matching pictures!");
    let flipped = [];
    let matchedCount = 0;
    let checking = false;

    cards.forEach((card, i) => {
      const el = document.createElement("div");
      el.className = "pkl-mm-card";
      el.dataset.i = i;
      el.innerHTML = "❓";
      el.onclick = async () => {
        if (checking || el.classList.contains("matched") || el.classList.contains("flipped")) return;
        el.classList.add("flipped");
        el.innerHTML = card.imgUrl ? `<img src="${card.imgUrl}" alt=""/>` : "🖼️";
        flipped.push({ el, card });

        if (flipped.length === 2) {
          checking = true;
          const [a, b] = flipped;
          if (a.card.pairId === b.card.pairId) {
            a.el.classList.add("matched"); b.el.classList.add("matched");
            matchedCount++;
            await speakEN(card.word, 0.8);
            flipped = []; checking = false;
            tracker.displayScore++;
            updateMiniScore(tracker.displayScore, sessionVocab.length);
            if (matchedCount >= sessionVocab.length) {
              tracker.total = sessionVocab.length;
              tracker.assessScore = sessionVocab.length; // túi mù luôn tính hoàn thành đầy đủ
              await new Promise(r => setTimeout(r, 600));
              resolve();
            }
          } else {
            await new Promise(r => setTimeout(r, 700));
            a.el.classList.remove("flipped"); a.el.innerHTML = "❓";
            b.el.classList.remove("flipped"); b.el.innerHTML = "❓";
            flipped = []; checking = false;
          }
        }
      };
      grid.appendChild(el);
    });
  });
}

// ============================================================================
// DỄ — A: Đọc chữ -> ghép đúng hình (image-mcq, KHÔNG đọc từ trước)
// ============================================================================

function buildRounds_De_WordToImage(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const distractorWords = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab, preferSameLesson: true });
    const options = shuffle([w.word, ...distractorWords]).map(val => {
      const found = [w, ...poolData, ...sessionVocab].find(p => p.word === val) || w;
      return { label: "", value: val, imageUrl: getImageFromMap(found.imageKeyword || val) || "" };
    });
    return {
      type: "image-mcq",
      instructionKey: "de-word-to-image",
      instructionText: "Read the word, then tap the matching picture!",
      promptHTML: `<div style="font-size:30px;font-weight:800;color:#FFCB05;">${w.word.toUpperCase()}</div>`,
      // Không có speakPromptText -> engine không đọc trước, đúng nguyên tắc Đọc.
      options,
      correctValue: w.word,
    };
  });
}

// ============================================================================
// DỄ — B: Câu 1 dòng đúng/sai kèm hình
// ============================================================================

function buildRounds_De_TrueFalse(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
    const isTrueStatement = Math.random() < 0.5;
    let statementWord = w.word;
    if (!isTrueStatement) {
      const wrongOnes = buildDistractors(w, poolData, { field: "word", count: 1, extra: sessionVocab });
      statementWord = wrongOnes[0] || w.word;
    }
    const correctValue = isTrueStatement ? "true" : "false";
    return {
      type: "mcq",
      instructionKey: "de-true-false",
      instructionText: "Read the sentence. Is it True or False?",
      promptHTML: `
        ${imgSrc ? `<img src="${imgSrc}" style="height:90px;border-radius:10px;"/><br/>` : ""}
        <div style="font-size:18px;margin-top:8px;">This is a <b>${statementWord}</b>.</div>`,
      options: [
        { label: "✅ True", value: "true" },
        { label: "❌ False", value: "false" },
      ],
      correctValue,
    };
  });
}

// ============================================================================
// TRUNG BÌNH — A: Đọc đoạn 3-4 câu -> chọn đáp án
// ============================================================================

function buildRounds_TB_ParagraphChoose(sessionVocab, poolData) {
  const usable = sessionVocab.filter(w => w.question && w.answerRaw);
  const list = usable.length ? usable : sessionVocab;

  return list.map(w => {
    const fillerSentences = pickDiverseFillerSentences(w, poolData, 2);
    const paragraph = shuffle([ensureDot(w.presentSent || w.question), ...fillerSentences.map(ensureDot)]).join(" ");
    const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });
    return {
      type: "mcq",
      instructionKey: "tb-paragraph-choose",
      instructionText: "Read the paragraph carefully, then answer the question!",
      promptHTML: `
        <div style="background:#fff;color:#333;border-radius:12px;padding:14px;text-align:left;font-size:15px;line-height:1.6;margin-bottom:10px;">
          ${paragraph}
        </div>
        <div style="font-size:16px;color:#ffd54f;">❓ ${w.question}</div>`,
      options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
      correctValue: w.answerRaw,
    };
  });
}

// ============================================================================
// TRUNG BÌNH — B: Sắp xếp câu (round dạng "arrange" — mới thêm vào engine)
// ============================================================================

function buildRounds_TB_ArrangeSentence(sessionVocab) {
  const usable = sessionVocab.filter(w => w.answerRaw || w.presentSent);
  const list = usable.length ? usable : sessionVocab;

  return list.map(w => {
    const sentenceText = w.answerRaw || w.presentSent || `I like the ${w.word}.`;
    const tokens = sentenceText.replace(/[.,;!?]/g, "").trim().split(/\s+/).filter(Boolean);
    return {
      type: "arrange",
      instructionKey: "tb-arrange-sentence",
      instructionText: "Tap the words to put the sentence in the correct order!",
      promptHTML: "", // không hiện gì lúc "đề bài" — nội dung nằm trong khu trả lời (các chip từ)
      tokens,
      correctValue: sentenceText,
      answerMs: 20000, // sắp xếp câu cần nhiều thời gian hơn MCQ thường
    };
  });
}

// ============================================================================
// KHÓ — A: Đọc đoạn dài hơn (5-6 câu) -> 2 câu hỏi nối tiếp
// ============================================================================

function buildRounds_Kho_LongParagraphTwoQuestions(sessionVocab, poolData) {
  const usable = sessionVocab.filter(w => w.question && w.answerRaw);
  if (usable.length < 2) return buildRounds_TB_ParagraphChoose(sessionVocab, poolData); // không đủ dữ liệu -> rơi về TB-A

  const rounds = [];
  for (let i = 0; i < usable.length - 1; i += 2) {
    const w1 = usable[i], w2 = usable[i + 1];
    const fillersFor1 = pickDiverseFillerSentences(w1, poolData.filter(p => p.lessonId !== w2.lessonId), 1);
    const fillersFor2 = pickDiverseFillerSentences(w2, poolData.filter(p => p.lessonId !== w1.lessonId), 1);
    const paragraph = shuffle([
      ensureDot(w1.presentSent || w1.question),
      ensureDot(w2.presentSent || w2.question),
      ...fillersFor1.map(ensureDot),
      ...fillersFor2.map(ensureDot),
    ]).join(" ");

    for (const w of [w1, w2]) {
      const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });
      rounds.push({
        type: "mcq",
        instructionKey: "kho-long-paragraph",
        instructionText: "Read this longer paragraph, then answer both questions!",
        promptHTML: `
          <div style="background:#fff;color:#333;border-radius:12px;padding:14px;text-align:left;font-size:15px;line-height:1.6;margin-bottom:10px;">
            ${paragraph}
          </div>
          <div style="font-size:16px;color:#ffd54f;">❓ ${w.question}</div>`,
        options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
        correctValue: w.answerRaw,
      });
    }
  }
  return rounds;
}

// ============================================================================
// KHÓ — B: Suy luận nghĩa từ qua ngữ cảnh (không hình gợi ý)
// ============================================================================

function buildRounds_Kho_InferMeaning(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const sentence = w.presentSent || w.noteAH || w.noteAI || `The ${w.word} is important here.`;
    const distractors = buildDistractors(w, poolData, { field: "meaning", count: 3, extra: sessionVocab });
    return {
      type: "mcq",
      instructionKey: "kho-infer-meaning",
      instructionText: "Read the sentence and figure out what the word means — no picture this time!",
      promptHTML: `<div style="font-size:17px;">📖 ${sentence}</div>`,
      options: shuffle([w.meaning, ...distractors]).map(v => ({ label: v, value: v })),
      correctValue: w.meaning,
    };
  });
}

// ============================================================================
// DISPATCH THEO CẤP ĐỘ (Mầm non KHÔNG qua đây — xử lý riêng trong hàm chính)
// ============================================================================

function buildRoundsForLevel(level, sessionVocab, poolData) {
  if (level === LEVELS.DE) {
    const candidates = [
      () => buildRounds_De_WordToImage(sessionVocab, poolData),
      () => buildRounds_De_TrueFalse(sessionVocab, poolData),
    ];
    return randomPick(candidates)();
  }
  if (level === LEVELS.TRUNG_BINH) {
    const candidates = [
      () => buildRounds_TB_ParagraphChoose(sessionVocab, poolData),
      () => buildRounds_TB_ArrangeSentence(sessionVocab),
    ];
    return randomPick(candidates)();
  }
  // KHÓ
  const candidates = [
    () => buildRounds_Kho_LongParagraphTwoQuestions(sessionVocab, poolData),
    () => buildRounds_Kho_InferMeaning(sessionVocab, poolData),
  ];
  return randomPick(candidates)();
}

// ============================================================================
// HÀM CHÍNH — export để orchestrator gọi
// ============================================================================

export async function runReadingModule(ctx) {
  const { sessionVocab, poolData, level, rootEl } = ctx;
  injectSharedStyles();

  const tracker = createScoreTracker();

  if (level === LEVELS.MAM_NON) {
    // Túi mù chạy tại chỗ, không qua minigame — xem giải thích đầu file.
    await showTransition("📖", "Reading Time!", "Let's read some English!");
    await readMamNon_MemoryMatch(rootEl, sessionVocab, tracker);
  } else {
    const resumedResults = PkmGameLauncher.consumeResult("reading");
    if (resumedResults) {
      resumedResults.forEach(r => recordQuestionPassed(tracker, r.correct ? 1 : 2));
      updateMiniScore(tracker.displayScore, tracker.total);
    } else {
      await showTransition("📖", "Reading Time!", "Let's read some English!");
      const rounds = buildRoundsForLevel(level, sessionVocab, poolData);
      // launch() CHUYỂN HẲN TRANG sang minigame — ném PkmGameNavigating để dừng
      // thực thi ngay, all-orchestrator.js đã bắt sẵn.
      PkmGameLauncher.launch({ moduleId: "reading", category: "answer", rounds });
    }
  }

  saveReadingResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Great reading!", "You're becoming a great reader!");
  return { assessScore: tracker.assessScore, assessTotal: tracker.total };
}
