/**
 * ============================================================================
 * module-2-listening.js — MODULE 2: NGHE (bản viết lại — TẤT CẢ dạng bài đều
 * chơi qua minigame đua thú thay vì tự vẽ UI trong trang)
 * ============================================================================
 * THAY ĐỔI LỚN so với bản cũ: module này KHÔNG còn tự render câu hỏi vào
 * rootEl nữa. Toàn bộ 8 dạng bài (Mầm non A/B, Dễ A/B, TB A/B, Khó A/B) giờ
 * chỉ có nhiệm vụ SOẠN DỮ LIỆU THUẦN (mảng `rounds`, đúng hợp đồng mà
 * pkm_minigame_race.js quy định — xem comment đầu file đó), rồi gọi
 * PkmGameLauncher.launch({ moduleId: "listening", category: "answer", rounds })
 * để CHUYỂN HẲN TRANG sang minigame. Học sinh chơi xong, minigame tự chuyển
 * trang quay lại all-shared.html -> orchestrator chạy lại module này -> module
 * phát hiện có kết quả đang chờ (PkmGameLauncher.consumeResult) -> DÙNG LUÔN
 * kết quả đó để chấm điểm, KHÔNG soạn lại câu hỏi / không chuyển trang lần nữa.
 *
 * CHẤM ĐIỂM: minigame chỉ cho 1 lần trả lời trong thời gian giới hạn (không
 * retry-đến-khi-đúng), nên kết quả trả về là { correct: boolean } cho mỗi câu
 * (khác với "attempts" mà askMCQ/askTypedAnswer thường dùng). Ta tái dùng
 * recordQuestionPassed(tracker, attemptNumberWhenCorrect) bằng một mẹo nhỏ:
 * truyền 1 khi đúng (được tính vào assessScore), truyền 2 (bất kỳ số >1) khi
 * sai (KHÔNG được tính vào assessScore, nhưng vẫn cộng displayScore/total) —
 * đúng ý nghĩa gốc của hàm mà không cần sửa gì ở all-shared.js.
 * ============================================================================
 */

import {
  LEVELS, buildDistractors, shuffle, randomPick, createScoreTracker,
  recordQuestionPassed, saveListeningResult, showTransition, updateMiniScore,
  getImageFromMap, injectSharedStyles, escapeRegExp, PkmGameLauncher,
} from "./all-shared.js";

// ============================================================================
// HELPER RIÊNG CỦA MODULE 2 (giữ nguyên từ bản cũ — vẫn cần để soạn nội dung
// hiển thị/đọc cho từng round, chỉ khác là kết quả giờ nhét vào round object
// thay vì vẽ thẳng ra DOM)
// ============================================================================

// Thay từ mục tiêu bằng "___" trong 1 câu (word-boundary, không phân biệt hoa/thường)
function blankOut(sentence, target) {
  if (!sentence || !target) return sentence || "";
  const re = new RegExp(`\\b${escapeRegExp(target)}\\b`, "gi");
  return sentence.replace(re, "___");
}

/** Thêm dấu . cuối câu nếu câu chưa tự có dấu kết (., !, ?); không nhân đôi dấu. */
function ensureDot(text) {
  if (!text) return "";
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : t + ".";
}

/**
 * Chọn `count` câu nhiễu cho đoạn văn, đúng quy tắc:
 * - Không lấy trùng câu của chính đáp án đúng.
 * - Tối đa 1 câu được lấy CÙNG BÀI (lessonId) với đáp án đúng.
 * - Các câu còn lại: MỖI CÂU PHẢI THUỘC 1 BÀI KHÁC NHAU (không trùng bài đáp
 *   án đúng, không trùng bài lẫn nhau) — nếu không đủ bài khác nhau thì mới
 *   vét thêm (chấp nhận trùng bài) để đủ số lượng.
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
// MẦM NON — A: nghe TỪ ĐƠN, chạm đúng hình (image-mcq)
// ============================================================================

function buildRounds_MamNon_Word(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const distractorWords = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab, preferSameLesson: true });
    const options = shuffle([w.word, ...distractorWords]).map(val => {
      const found = [w, ...poolData, ...sessionVocab].find(p => p.word === val) || w;
      return { label: "", value: val, imageUrl: getImageFromMap(found.imageKeyword || val) || "" };
    });
    return {
      type: "image-mcq",
      instructionKey: "listen-mamnon",
      instructionText: "Listen carefully and tap the correct picture!",
      promptHTML: `<div style="font-size:52px;">🎧</div>`,
      speakPromptText: w.word,
      replayText: w.word,
      maxReplay: Infinity, // Mầm non: nghe lại không giới hạn
      rate: 0.85,
      options,
      correctValue: w.word,
    };
  });
}

// ============================================================================
// MẦM NON — B: nghe CẢ CÂU THUYẾT TRÌNH (presentSent), vẫn chạm đúng hình
// ============================================================================

function buildRounds_MamNon_Sentence(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const sentence = w.presentSent || w.word;
    const distractorWords = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab, preferSameLesson: true });
    const options = shuffle([w.word, ...distractorWords]).map(val => {
      const found = [w, ...poolData, ...sessionVocab].find(p => p.word === val) || w;
      return { label: "", value: val, imageUrl: getImageFromMap(found.imageKeyword || val) || "" };
    });
    return {
      type: "image-mcq",
      instructionKey: "listen-mamnon-sentence",
      instructionText: "Listen to the sentence, then tap the correct picture!",
      promptHTML: `<div style="font-size:52px;">🎧</div>`,
      speakPromptText: sentence,
      replayText: sentence,
      maxReplay: Infinity,
      rate: 0.8,
      options,
      correctValue: w.word,
    };
  });
}

// ============================================================================
// DỄ — A: Nghe Q&A điền 1 từ (có ảnh gợi ý) — nghe lại KHÔNG giới hạn
// ============================================================================

function buildRounds_De_FillBlank(sessionVocab) {
  const withQA = sessionVocab.filter(w => w.question && w.answerRaw);
  const list = withQA.length ? withQA : sessionVocab;
  return list.map(w => {
    const q = w.question || `I have a ${w.word}.`;
    const a = w.answerRaw || w.meaning;
    const displayQ = blankOut(q, w.word);
    const displayA = blankOut(a, w.word);
    const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
    const spoken = `${q}. ${a}`;

    const promptHTML = `
      <div style="background:rgba(93,171,70,.15);border:2px solid #ffd54f;border-radius:14px;padding:16px;text-align:center;">
        ${imgSrc ? `<img src="${imgSrc}" style="height:70px;border-radius:8px;margin-bottom:8px;"/><br/>` : ""}
        <div style="font-size:18px;color:#fff;">🗣 ${displayQ}</div>
        <div style="font-size:18px;color:#ffd700;margin-top:6px;">🗣 ${displayA}</div>
      </div>`;

    return {
      type: "typed",
      instructionKey: "de-fill-blank",
      instructionText: "Listen and type the missing word!",
      promptHTML,
      speakPromptText: spoken,
      replayText: spoken,
      maxReplay: Infinity, // Dễ: không giới hạn nghe lại
      correctValue: w.word,
      placeholder: "Missing word...",
    };
  });
}

// ============================================================================
// DỄ — B: Nghe -> chọn câu đúng (4 lựa chọn)
// ============================================================================

function buildRounds_De_ChooseSentence(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const targetSentence = w.presentSent || w.question || `This is a ${w.word}.`;
    const distractors = buildDistractors({ ...w, presentSent: targetSentence }, poolData, { field: "presentSent", count: 3 });
    const finalOptions = distractors.length >= 3 ? distractors
      : buildDistractors(w, poolData, { field: "question", count: 3, extra: sessionVocab });
    return {
      type: "mcq",
      instructionKey: "de-choose-sentence",
      instructionText: "Listen carefully, then choose the sentence you heard!",
      promptHTML: `<div style="font-size:52px;">🔊</div>`,
      speakPromptText: targetSentence,
      replayText: targetSentence,
      maxReplay: Infinity,
      rate: 0.9,
      options: shuffle([targetSentence, ...finalOptions]).map(v => ({ label: v, value: v })),
      correctValue: targetSentence,
    };
  });
}

// ============================================================================
// TRUNG BÌNH — A: Nghe đoạn nhiều câu, điền chỗ trống — giới hạn nghe lại 3 lần
// ============================================================================

function buildRounds_TB_FillParagraph(sessionVocab, poolData) {
  const usable = sessionVocab.filter(w => w.presentSent);
  const list = usable.length ? usable : sessionVocab;

  return list.map(w => {
    const sentence = w.presentSent || `I like the ${w.word}.`;
    // Loại các câu thuộc chính buổi học này ra khỏi pool nhiễu, tránh vô tình
    // lộ đáp án của 1 câu KHÁC trong cùng buổi vào đây làm câu nhiễu.
    const poolExcludingSession = poolData.filter(p => !list.includes(p));
    const fillerSentences = pickDiverseFillerSentences(w, poolExcludingSession, 3);
    const contextSentences = shuffle([sentence, ...fillerSentences]);
    const fullParagraph = contextSentences
      .map(s => ensureDot(s === sentence ? blankOut(s, w.word) : s))
      .join(" ");
    const spokenParagraph = contextSentences.map(ensureDot).join(" ");

    const promptHTML = `
      <div style="background:rgba(255,253,231,.1);border:2px solid #fdd835;border-radius:12px;padding:16px;font-size:17px;text-align:center;">
        ${fullParagraph}
      </div>`;

    return {
      type: "typed",
      instructionKey: "tb-fill-paragraph",
      instructionText: "Listen to the paragraph and fill in the missing word!",
      promptHTML,
      speakPromptText: spokenParagraph,
      replayText: spokenParagraph,
      maxReplay: 3,
      correctValue: w.word,
      placeholder: "Missing word...",
    };
  });
}

// ============================================================================
// TRUNG BÌNH — B: Nghe đoạn dài, chọn đáp án — giới hạn nghe lại 3 lần
// ============================================================================

function buildRounds_TB_LongChoose(sessionVocab, poolData) {
  const usable = sessionVocab.filter(w => w.question && w.answerRaw);
  const list = usable.length ? usable : sessionVocab;

  return list.map(w => {
    const fillerSentences = pickDiverseFillerSentences(w, poolData, 3);
    const paragraph = shuffle([w.presentSent || w.question, ...fillerSentences]).map(ensureDot).filter(Boolean).join(" ");
    const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });

    const promptHTML = `
      <div style="background:rgba(255,253,231,.1);border:2px solid #fdd835;border-radius:12px;padding:16px;font-size:16px;text-align:center;">
        ${paragraph}
      </div>
      <div style="text-align:center;margin-top:10px;font-size:16px;color:#ffd54f;">❓ ${w.question}</div>`;

    return {
      type: "mcq",
      instructionKey: "tb-long-choose",
      instructionText: "Listen to the paragraph, then answer the question!",
      promptHTML,
      speakPromptText: paragraph,
      replayText: paragraph,
      maxReplay: 3,
      rate: 0.9,
      options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
      correctValue: w.answerRaw,
    };
  });
}

// ============================================================================
// KHÓ — A: Hội thoại dài, trả lời suy luận — giới hạn nghe lại chỉ 1 lần
// ============================================================================

function buildRounds_Kho_Inference(sessionVocab, poolData) {
  const usable = sessionVocab.filter(w => w.question && w.answerRaw);
  const list = usable.length ? usable : sessionVocab;

  return list.map(w => {
    const dialogue = `${w.question} ${w.answerRaw}`;
    const distractors = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab });

    const promptHTML = `
      <div style="background:rgba(255,253,231,.08);border:2px solid #fdd835;border-radius:12px;padding:16px;font-size:16px;text-align:center;">
        <div>🗣 ${w.question}</div>
        <div style="color:#ffd700;margin-top:6px;">🗣 ${w.answerRaw}</div>
      </div>
      <div style="text-align:center;margin-top:10px;font-size:15px;color:#ccc;">What word are they talking about?</div>`;

    return {
      type: "mcq",
      instructionKey: "kho-inference",
      instructionText: "Listen to the conversation, then guess which word they are talking about!",
      promptHTML,
      speakPromptText: dialogue,
      replayText: dialogue,
      maxReplay: 1, // Khó: giới hạn nghe lại chặt hơn
      rate: 0.95,
      options: shuffle([w.word, ...distractors]).map(v => ({ label: v, value: v })),
      correctValue: w.word,
    };
  });
}

// ============================================================================
// KHÓ — B: Nghe đoạn nhiều nhiễu, giới hạn nghe lại chỉ 1 lần
// ============================================================================

function buildRounds_Kho_LimitedReplay(sessionVocab, poolData) {
  const usable = sessionVocab.filter(w => w.question && w.answerRaw);
  const list = usable.length ? usable : sessionVocab;

  return list.map(w => {
    const fillerSentences = pickDiverseFillerSentences(w, poolData, 5);
    const paragraph = shuffle([w.presentSent || w.question, ...fillerSentences]).map(ensureDot).filter(Boolean).join(" ");
    const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });

    const promptHTML = `
      <div style="background:rgba(255,253,231,.08);border:2px solid #fdd835;border-radius:12px;padding:16px;font-size:15px;text-align:center;">
        🔊 (${fillerSentences.length + 1}-sentence paragraph — listen carefully, replay is limited!)
      </div>
      <div style="text-align:center;margin-top:10px;font-size:16px;color:#ffd54f;">❓ ${w.question}</div>`;

    return {
      type: "mcq",
      instructionKey: "kho-limited-replay",
      instructionText: "This is a long paragraph. You only get 1 replay, so listen carefully!",
      promptHTML,
      speakPromptText: paragraph,
      replayText: paragraph,
      maxReplay: 1,
      rate: 0.95,
      options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
      correctValue: w.answerRaw,
    };
  });
}

// ============================================================================
// DISPATCH THEO CẤP ĐỘ — chọn ngẫu nhiên 1 trong 2 dạng (A/B), y hệt logic cũ,
// chỉ khác là giờ trả về mảng `rounds` thay vì tự chạy UI
// ============================================================================

function buildRoundsForLevel(level, sessionVocab, poolData) {
  if (level === LEVELS.MAM_NON) {
    const candidates = [
      () => buildRounds_MamNon_Word(sessionVocab, poolData),
      () => buildRounds_MamNon_Sentence(sessionVocab, poolData),
    ];
    return randomPick(candidates)();
  }
  if (level === LEVELS.DE) {
    const candidates = [
      () => buildRounds_De_FillBlank(sessionVocab),
      () => buildRounds_De_ChooseSentence(sessionVocab, poolData),
    ];
    return randomPick(candidates)();
  }
  if (level === LEVELS.TRUNG_BINH) {
    const candidates = [
      () => buildRounds_TB_FillParagraph(sessionVocab, poolData),
      () => buildRounds_TB_LongChoose(sessionVocab, poolData),
    ];
    return randomPick(candidates)();
  }
  // KHÓ
  const candidates = [
    () => buildRounds_Kho_Inference(sessionVocab, poolData),
    () => buildRounds_Kho_LimitedReplay(sessionVocab, poolData),
  ];
  return randomPick(candidates)();
}

// ============================================================================
// HÀM CHÍNH — export để orchestrator gọi
// ============================================================================

export async function runListeningModule(ctx) {
  const { sessionVocab, poolData, level } = ctx;
  injectSharedStyles();

  const tracker = createScoreTracker();

  // Vừa quay về từ minigame (đã chơi xong hết rounds) -> dùng luôn kết quả,
  // KHÔNG soạn lại câu hỏi / không chuyển trang lần nữa.
  const resumedResults = PkmGameLauncher.consumeResult("listening");
  if (resumedResults) {
    resumedResults.forEach(r => {
      // Mẹo tái dùng recordQuestionPassed (vốn thiết kế cho retry-đến-khi-đúng):
      // truyền 1 khi đúng (tính vào assessScore), truyền 2 khi sai (không tính).
      recordQuestionPassed(tracker, r.correct ? 1 : 2);
    });
    updateMiniScore(tracker.displayScore, tracker.total);
  } else {
    await showTransition("🎧", "Listening Time!", "Let's listen carefully!");
    const rounds = buildRoundsForLevel(level, sessionVocab, poolData);
    // launch() CHUYỂN HẲN TRANG sang minigame — không return bình thường,
    // ném PkmGameNavigating để dừng thực thi ngay (all-orchestrator.js đã bắt sẵn).
    PkmGameLauncher.launch({ moduleId: "listening", category: "answer", rounds });
  }

  saveListeningResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Great listening!", "You did an amazing job!");
  return { assessScore: tracker.assessScore, assessTotal: tracker.total };
}