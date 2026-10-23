/**
 * ============================================================================
 * module-1-intro.js — MODULE 1: GIỚI THIỆU TỪ VỰNG (bản v6 — Stage B chuyển
 * sang minigame "Thả kẹo vào lọ" thay vì tự vẽ UI quiz trong trang)
 * ============================================================================
 * Stage A (giới thiệu từ + tách âm + nói theo) — module chỉ soạn dữ liệu
 * thuần qua buildIntroRounds() rồi gọi PkmGameLauncher.launch() CHUYỂN HẲN
 * TRANG sang 1 game full-screen nhóm "introPresent" (hiện có:
 * pkm_minigame_flipbook.html, pkm_minigame_maze.html).
 *
 * Stage B (quiz "Quick check") — GIỜ CŨNG soạn dữ liệu thuần qua
 * buildQuickCheckRounds() rồi gọi PkmGameLauncher.launch() CHUYỂN HẲN TRANG
 * sang 1 game full-screen nhóm "quickCheck" (hiện có:
 * pkm_minigame_balldrop.html — thả kẹo vào lọ; sau này có thể thêm game khác
 * cùng nhóm, chỉ cần thêm tên file vào GAMES.quickCheck trong all-shared.js).
 *
 * ⚠️ ĐIỂM KỸ THUẬT QUAN TRỌNG — VÌ SAO CÓ STAGE_A_PARTIAL_KEY:
 * Module này giờ có 2 LƯỢT CHUYỂN TRANG kế tiếp nhau (Stage A rồi Stage B).
 * PkmGameLauncher.consumeResult() chỉ đọc được kết quả CỦA 1 LƯỢT DUY NHẤT
 * rồi xoá luôn — nếu không xử lý gì thêm, kịch bản sau sẽ xảy ra:
 *   Lượt 1: chưa có gì -> soạn rounds Stage A -> chuyển sang flipbook.
 *   Lượt 2 (quay về từ flipbook): consumeResult("introPresent") có dữ liệu
 *     -> chấm điểm Stage A vào `tracker` (biến cục bộ, sẽ MẤT khi hàm kết
 *     thúc) -> soạn tiếp rounds Stage B -> chuyển sang balldrop.
 *   Lượt 3 (quay về từ balldrop): consumeResult("introPresent") giờ trả về
 *     null (đã bị tiêu thụ ở lượt 2!) -> nếu không xử lý gì, code sẽ tưởng
 *     Stage A CHƯA XONG -> mở lại flipbook -> LẶP VÔ HẠN.
 * Giải pháp: ngay sau khi chấm điểm Stage A ở lượt 2, LƯU TẠM điểm đó vào
 * sessionStorage (STAGE_A_PARTIAL_KEY) trước khi chuyển trang sang Stage B.
 * Lượt 3 sẽ đọc lại điểm tạm này thay vì gọi consumeResult("introPresent")
 * lần nữa. Khi Stage B chấm điểm xong (lượt 3), dọn sessionStorage này đi.
 * ============================================================================
 */

import {
  LEVELS, buildDistractors, shuffle,
  createScoreTracker, recordQuestionPassed, saveIntroResult, showTransition,
  updateMiniScore, getImageFromMap, prefetchImagesBatch, injectSharedStyles,
  getEnglishRateForLevel, PkmGameLauncher,
} from "./all-shared.js";

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const STAGE_A_PARTIAL_KEY = "pkl_introA_partial"; // sessionStorage — điểm tạm của Stage A, chờ Stage B xong mới gộp

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
// B. SOẠN DỮ LIỆU THUẦN CHO STAGE B — QUIZ "QUICK CHECK" (đổi từ vẽ UI trực
// tiếp sang soạn mảng `rounds` thuần, y hệt tinh thần Stage A). Mỗi hàm giữ
// NGUYÊN 100% logic chọn nhiễu/nội dung câu hỏi của bản cũ — chỉ khác là trả
// về 1 object round thay vì tự gọi askMCQ() vẽ UI.
// ============================================================================

async function buildQuickCheck_MamNon(w, sessionVocab, poolData) {
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

  return {
    type: "image-mcq",
    instructionKey: "intro-mamnon-quiz",
    instructionText: "Listen, then drop the candy in the jar with the correct picture!",
    promptHTML: `<div style="font-size:40px;">🔊</div>`,
    options, correctValue: w.word,
    speakPromptText: w.word,
  };
}

function buildQuickCheck_De(w, poolData, sessionVocab) {
  const distractors = buildDistractors(w, poolData, { field: "meaning", count: 3, extra: sessionVocab });
  return {
    type: "mcq",
    instructionKey: "intro-de-quiz",
    instructionText: "What does this word mean? Drop the candy in the right jar!",
    promptHTML: `<div style="font-size:26px;font-weight:800;color:#FFCB05;">${w.word.toUpperCase()}</div>`,
    options: shuffle([w.meaning, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.meaning,
    speakPromptText: w.word,
    optionLang: "vi", promptLang: "en",
  };
}

function buildQuickCheck_TB(w, poolData, sessionVocab) {
  const distractors = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab });
  return {
    type: "mcq",
    instructionKey: "intro-tb-quiz",
    instructionText: "Which word matches this meaning? Drop the candy in the right jar!",
    promptHTML: `<div style="font-size:22px;color:#ffd54f;">${w.meaning}</div>`,
    options: shuffle([w.word, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.word,
    speakPromptText: w.meaning,
    optionLang: "en", promptLang: "vi",
  };
}

function buildQuickCheck_Kho(w, poolData, sessionVocab) {
  if (!w.noteAI) return buildQuickCheck_De(w, poolData, sessionVocab);
  const usablePool = poolData.filter(p => p.noteAI);
  const usableSession = sessionVocab.filter(p => p.noteAI && p.word !== w.word);
  const distractors = buildDistractors(w, usablePool, { field: "noteAI", count: 3, extra: usableSession });
  return {
    type: "mcq",
    instructionKey: "intro-kho-quiz",
    instructionText: "Which pun sentence uses this word? Drop the candy in the right jar!",
    promptHTML: `<div style="font-size:26px;font-weight:800;color:#FFCB05;">${w.word.toUpperCase()}</div>`,
    options: shuffle([w.noteAI, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.noteAI,
    speakPromptText: w.word,
    optionLang: "vi", promptLang: "en",
  };
}

async function buildQuickCheckRounds(sessionVocab, poolData, level) {
  const rounds = [];
  for (const w of sessionVocab) {
    if (level === LEVELS.MAM_NON) rounds.push(await buildQuickCheck_MamNon(w, sessionVocab, poolData));
    else if (level === LEVELS.DE) rounds.push(buildQuickCheck_De(w, poolData, sessionVocab));
    else if (level === LEVELS.TRUNG_BINH) rounds.push(buildQuickCheck_TB(w, poolData, sessionVocab));
    else rounds.push(buildQuickCheck_Kho(w, poolData, sessionVocab));
  }
  return rounds;
}

// ============================================================================
// C. HÀM CHÍNH — export để orchestrator gọi
// ============================================================================

export async function runIntroModule(ctx) {
  const { sessionVocab, poolData, level } = ctx;
  injectSharedStyles();

  const tracker = createScoreTracker();

  // ─── Khôi phục điểm Stage A đã lưu tạm (nếu đã xử lý ở 1 lượt trước đó,
  // trước khi chuyển sang Stage B) — xem giải thích STAGE_A_PARTIAL_KEY ở đầu file.
  const partialRaw = sessionStorage.getItem(STAGE_A_PARTIAL_KEY);
  if (partialRaw) {
    try {
      const partial = JSON.parse(partialRaw);
      tracker.assessScore += partial.assessScore || 0;
      tracker.displayScore += partial.displayScore || 0;
      tracker.total += partial.total || 0;
    } catch (e) { /* dữ liệu tạm hỏng -> bỏ qua, coi như chưa có */ }
  }

  // ─── Stage A: vừa quay về từ game (flipbook/maze) chưa? ───
  if (!partialRaw) {
    const resumedResults = PkmGameLauncher.consumeResult("introPresent");
    if (resumedResults) {
      // Chỉ chấm điểm phần "nói theo" (phonicsSpeak) — phần "present" (giới
      // thiệu từ) không chấm điểm, giữ nguyên đúng hành vi cũ.
      resumedResults.forEach(r => {
        if (r && typeof r.attemptsUsed === "number") recordQuestionPassed(tracker, r.attemptsUsed);
      });
      updateMiniScore(tracker.displayScore, tracker.total);

      // Lưu tạm điểm Stage A TRƯỚC khi có thể chuyển trang sang Stage B ở
      // dưới — nếu không lưu, lượt quay về từ Stage B sẽ mất sạch điểm này.
      sessionStorage.setItem(STAGE_A_PARTIAL_KEY, JSON.stringify({
        assessScore: tracker.assessScore, displayScore: tracker.displayScore, total: tracker.total,
      }));
    } else {
      const rounds = buildIntroRounds(sessionVocab, level);
      // launch() CHUYỂN HẲN TRANG sang flipbook rồi throw PkmGameNavigating để
      // dừng thực thi ngay (all-orchestrator.js đã bắt sẵn tín hiệu này).
      PkmGameLauncher.launch({ moduleId: "introPresent", category: "introPresent", rounds });
      // Không có dòng nào chạy tới đây nếu GAMES.introPresent có ít nhất 1 game.
    }
  }

  // ─── Stage B: quiz "Quick check" — giờ chơi qua minigame thả kẹo vào lọ ───
  const resumedQuiz = PkmGameLauncher.consumeResult("introQuiz");
  if (resumedQuiz) {
    resumedQuiz.forEach(r => recordQuestionPassed(tracker, r.correct ? 1 : 2));
    updateMiniScore(tracker.displayScore, tracker.total);
    sessionStorage.removeItem(STAGE_A_PARTIAL_KEY); // Module 1 đã xong hẳn -> dọn điểm tạm
  } else {
    await showTransition("🧠", "Quick check!", "Let's see if you remember the meanings!");
    const quizRounds = await buildQuickCheckRounds(sessionVocab, poolData, level);
    // launch() CHUYỂN HẲN TRANG sang minigame thả kẹo rồi throw
    // PkmGameNavigating để dừng thực thi ngay (all-orchestrator.js đã bắt sẵn).
    PkmGameLauncher.launch({ moduleId: "introQuiz", category: "quickCheck", rounds: quizRounds });
    // Không có dòng nào chạy tới đây nếu GAMES.quickCheck có ít nhất 1 game
    // (hiện luôn có pkm_minigame_balldrop.html).
  }

  saveIntroResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Awesome!", "You've learned all the new words today!");
  return { assessScore: tracker.assessScore, assessTotal: tracker.total };
}