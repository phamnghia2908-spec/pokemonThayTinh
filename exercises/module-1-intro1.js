/**
 * ============================================================================
 * module-1-intro.js — MODULE 1: GIỚI THIỆU TỪ VỰNG (bản v5 — bỏ hẳn Live2D)
 * ============================================================================
 * THAY ĐỔI LỚN SO VỚI BẢN TRƯỚC: module này giờ KHÔNG tự vẽ UI nữa (đúng vai
 * trò mới — module chỉ CUNG CẤP DỮ LIỆU BÀI TẬP, game lo phần thể hiện).
 *
 * Stage A (giới thiệu từ + tách âm + nói theo) — TRƯỚC ĐÂY tự vẽ mascot
 * Live2D + bảng trắng ngay trong trang. GIỜ: module chỉ soạn dữ liệu thuần
 * qua buildIntroRounds() rồi gọi PkmGameLauncher.launch() — CHUYỂN HẲN TRANG
 * sang 1 game full-screen (hiện có: pkm_minigame_flipbook.html — sách lật,
 * sau này có thể thêm game khác cùng nhóm "introPresent"). Khi học sinh chơi
 * xong, trang quay lại, module đọc kết quả qua PkmGameLauncher.consumeResult()
 * để chấm điểm phần "nói theo" (phần "giới thiệu" không chấm điểm — giữ
 * nguyên hành vi cũ).
 *
 * Stage B (quiz "Quick check") — GIỮ NGUYÊN logic cũ, chưa đổi sang game nào
 * (theo đúng phạm vi đã thống nhất — làm sau).
 * ============================================================================
 */

import {
  LEVELS, askMCQ, buildDistractors, shuffle,
  createScoreTracker, recordQuestionPassed, saveIntroResult, showTransition,
  updateMiniScore, getImageFromMap, prefetchImagesBatch, injectSharedStyles,
  getEnglishRateForLevel, PkmGameLauncher,
} from "./all-shared.js";

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** Tách "English : Vietnamese" (cột AH) thành 2 phần. Không có ":" -> coi là toàn tiếng Việt. */
function parseAH(noteAH) {
  if (!noteAH) return null;
  const idx = noteAH.indexOf(":");
  if (idx === -1) return { en: "", vi: noteAH.trim() };
  return { en: noteAH.slice(0, idx).trim(), vi: noteAH.slice(idx + 1).trim() };
}

function buildRepeatModel(w, level) {
  if (level === LEVELS.MAM_NON) return { modelText: w.word, matchText: w.word, veryLenient: true };
  if (level === LEVELS.DE) { const s = w.presentSent || w.word; return { modelText: s, matchText: s, veryLenient: false }; }
  if (level === LEVELS.TRUNG_BINH) { const s = `${w.word}. ${w.presentSent || ""}`.trim(); return { modelText: s, matchText: s, veryLenient: false }; }
  const s = `${w.word}. ${w.question || ""} ${w.answerRaw || ""}`.trim();
  return { modelText: s, matchText: s, veryLenient: false };
}

// ============================================================================
// A. SOẠN DỮ LIỆU THUẦN CHO STAGE A (không vẽ gì cả) — game (flipbook hoặc
// sau này game khác) tự lấy mảng này để thể hiện theo cách của nó.
//
// Mỗi từ tách thành 2 "lượt" liên tiếp (trừ Mầm non — không có tách âm):
//   1. "present"      — ảnh + từ + nghĩa + câu AH/AI (y hệt Bước 1 cũ)
//   2. "phonicsSpeak" — tách âm (Bước 2 cũ) RỒI nói theo (Bước 3 cũ), gộp
//                       chung 1 lượt vì phải tách âm xong mới tới nói theo.
// ============================================================================
export function buildIntroRounds(sessionVocab, level) {
  const isMamNon = level === LEVELS.MAM_NON;
  const rate = getEnglishRateForLevel(level);
  const rounds = [];

  sessionVocab.forEach((w, idx) => {
    const ah = !isMamNon ? parseAH(w.noteAH) : null;
    const ai = (!isMamNon && w.noteAI) ? w.noteAI : null;

    rounds.push({
      type: "present",
      ord: ORDINALS[idx] || `${idx + 1}th`,
      word: w.word,
      imageKeyword: w.imageKeyword || w.word,
      meaning: w.meaning || "",
      ah, ai, rate,
    });

    if (!isMamNon) {
      rounds.push({
        type: "phonicsSpeak",
        word: w.word,
        imageKeyword: w.imageKeyword || w.word,
        repeat: buildRepeatModel(w, level),
        rate,
      });
    }
  });

  return rounds;
}

// ============================================================================
// B. STAGE B — QUIZ "QUICK CHECK" (GIỮ NGUYÊN Y HỆT LOGIC CŨ)
// ============================================================================

async function stage4_MamNon(rootEl, w, sessionVocab, poolData, tracker, rate) {
  const others = sessionVocab.filter(x => x.word !== w.word);
  const distractorWords = buildDistractors(w, others, { field: "word", count: 2, extra: poolData });

  // Ảnh của từ nhiễu (lấy từ poolData) CHƯA được prefetch trước đó (chỉ
  // sessionVocab mới được prefetch ở loadSessionData) -> phải tải trước ở
  // đây, nếu không getImageFromMap() sẽ trả về rỗng và ảnh bị trống.
  const distractorKeywords = distractorWords.map(val => {
    const found = [w, ...sessionVocab, ...poolData].find(p => p.word === val) || w;
    return (found.imageKeyword || val || "").toLowerCase().trim();
  }).filter(Boolean);
  await prefetchImagesBatch(distractorKeywords);

  const options = shuffle([w.word, ...distractorWords]).map(val => {
    const found = [w, ...sessionVocab, ...poolData].find(p => p.word === val) || w;
    return { label: "", speakText: val, value: val, imageUrl: getImageFromMap(found.imageKeyword || val) || "" };
  });
  const attempts = await askMCQ({

    container: rootEl,
    instructionKey: "intro-mamnon-quiz",
    instructionText: "Listen and tap the correct picture!",
    questionHTML: `<div style="font-size:40px;">🔊</div>`,
    options, correctValue: w.word,
    speakPromptText: w.word, rate,
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function stage4_De(rootEl, w, poolData, sessionVocab, tracker, rate) {
  const distractors = buildDistractors(w, poolData, { field: "meaning", count: 3, extra: sessionVocab });
  const attempts = await askMCQ({
    container: rootEl,
    instructionKey: "intro-de-quiz",
    instructionText: "What does this word mean?",
    questionHTML: `<div style="font-size:26px;font-weight:800;color:#FFCB05;">${w.word.toUpperCase()}</div>`,
    options: shuffle([w.meaning, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.meaning,
    speakPromptText: w.word, rate,
    optionLang: "vi", promptLang: "en",
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function stage4_TB(rootEl, w, poolData, sessionVocab, tracker, rate) {
  const distractors = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab });
  const attempts = await askMCQ({
    container: rootEl,
    instructionKey: "intro-tb-quiz",
    instructionText: "Which word matches this meaning?",
    questionHTML: `<div style="font-size:22px;color:#ffd54f;">${w.meaning}</div>`,
    options: shuffle([w.word, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.word,
    speakPromptText: w.meaning, rate,
    optionLang: "en", promptLang: "vi",
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function stage4_Kho(rootEl, w, poolData, sessionVocab, tracker, rate) {
  if (!w.noteAI) { await stage4_De(rootEl, w, poolData, sessionVocab, tracker, rate); return; }
  const usablePool = poolData.filter(p => p.noteAI);
  const usableSession = sessionVocab.filter(p => p.noteAI && p.word !== w.word);
  const distractors = buildDistractors(w, usablePool, { field: "noteAI", count: 3, extra: usableSession });
  const attempts = await askMCQ({
    container: rootEl,
    instructionKey: "intro-kho-quiz",
    instructionText: "Which pun sentence uses this word?",
    questionHTML: `<div style="font-size:26px;font-weight:800;color:#FFCB05;">${w.word.toUpperCase()}</div>`,
    options: shuffle([w.noteAI, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.noteAI,
    speakPromptText: w.word, rate,
    optionLang: "vi", promptLang: "en",
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function runStage4(rootEl, sessionVocab, poolData, level, tracker) {
  const rate = getEnglishRateForLevel(level);
  for (const w of sessionVocab) {
    if (level === LEVELS.MAM_NON) await stage4_MamNon(rootEl, w, sessionVocab, poolData, tracker, rate);
    else if (level === LEVELS.DE) await stage4_De(rootEl, w, poolData, sessionVocab, tracker, rate);
    else if (level === LEVELS.TRUNG_BINH) await stage4_TB(rootEl, w, poolData, sessionVocab, tracker, rate);
    else await stage4_Kho(rootEl, w, poolData, sessionVocab, tracker, rate);
  }
}

// ============================================================================
// C. HÀM CHÍNH — export để orchestrator gọi
// ============================================================================

export async function runIntroModule(ctx) {
  const { sessionVocab, poolData, level, rootEl } = ctx;
  injectSharedStyles();

  const tracker = createScoreTracker();

  // ─── Stage A: vừa quay về từ game (flipbook) chưa? ───
  const resumedResults = PkmGameLauncher.consumeResult("introPresent");
  if (resumedResults) {
    // Chỉ chấm điểm phần "nói theo" (phonicsSpeak) — phần "present" (giới
    // thiệu từ) không chấm điểm, giữ nguyên đúng hành vi cũ.
    resumedResults.forEach(r => {
      if (r && typeof r.attemptsUsed === "number") recordQuestionPassed(tracker, r.attemptsUsed);
    });
    updateMiniScore(tracker.displayScore, tracker.total);
  } else {
    const rounds = buildIntroRounds(sessionVocab, level);
    // launch() CHUYỂN HẲN TRANG sang flipbook rồi throw PkmGameNavigating để
    // dừng thực thi ngay (all-orchestrator.js đã bắt sẵn tín hiệu này).
    PkmGameLauncher.launch({ moduleId: "introPresent", category: "introPresent", rounds });
    // Không có dòng nào chạy tới đây nếu GAMES.introPresent có ít nhất 1 game
    // (hiện luôn có pkm_minigame_flipbook.html) — Module 1 hiện PHỤ THUỘC
    // vào việc có game cho nhóm này vì đã bỏ hẳn UI Live2D cũ, không còn
    // đường lui nào khác để hiển thị Stage A.
  }

  // ─── Stage B: quiz "Quick check" — GIỮ NGUYÊN như hiện tại ───
  await showTransition("🧠", "Quick check!", "Let's see if you remember the meanings!");
  window.PkmGameSession?.startModule("intro");
  await runStage4(rootEl, sessionVocab, poolData, level, tracker);
  window.PkmGameSession?.end();

  saveIntroResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Awesome!", "You've learned all the new words today!");
  return { assessScore: tracker.assessScore, assessTotal: tracker.total };
}
