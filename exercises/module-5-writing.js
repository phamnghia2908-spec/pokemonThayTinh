/**
 * ============================================================================
 * module-5-writing.js — MODULE 5: VIẾT (bản viết lại lần 2 — dùng đúng 2 tính
 * năng mới vừa vá ở pkm_minigame_race.js: keepPromptVisible + matchType)
 * ============================================================================
 * Khác bản trước: TẤT CẢ cấp độ, kể cả Mầm non, giờ đều đi qua minigame đua
 * thú. Không còn nhánh "chạy tại chỗ" nào nữa.
 *
 * `keepPromptVisible: true` được bật ở MỌI round trong module này — khác với
 * Module 2 (Nghe), nơi đề bài CỐ TÌNH ẩn đi để bài trở thành bài kiểm tra trí
 * nhớ khi nghe. Bài VIẾT thì ngược lại: nghĩa/ảnh/gợi ý PHẢI ở lại trên màn
 * hình trong lúc học sinh gõ/ghép chữ — đúng như hành vi của bản gốc (mọi
 * hàm viết gốc đều vẽ đề bài và ô nhập TRONG CÙNG 1 màn hình, không tách).
 *
 * MẦM NON: ghép chữ cái dùng round "arrange" (tokens = từng chữ cái), kèm
 * `keepPromptVisible: true` để chữ mẫu không biến mất — đúng bản chất "nhìn
 * và chép". Không cần chạy tại chỗ nữa vì engine đã hỗ trợ việc này.
 *
 * KHÓ — B: dùng `matchType: "percent"` (vừa thêm ở engine) để chấm theo % từ
 * khớp, khôi phục đúng độ khoan dung của bản gốc (không cần khớp tuyệt đối).
 * ============================================================================
 */

import {
  LEVELS, shuffle, randomPick, createScoreTracker, recordQuestionPassed,
  saveWritingResult, showTransition, updateMiniScore, getImageFromMap,
  injectSharedStyles, PkmGameLauncher,
} from "./all-shared.js";

// ============================================================================
// MẦM NON — chạm chữ cái ghép từ đang hiển thị sẵn (round "arrange")
// ============================================================================

function buildRounds_MamNon(sessionVocab) {
  return sessionVocab.map(w => {
    const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
    const letters = w.word.toUpperCase().split("");
    return {
      type: "arrange",
      instructionKey: "mamnon-drag-letters",
      instructionText: "Tap the letters in order to copy the word you see!",
      promptHTML: `
        ${imgSrc ? `<img src="${imgSrc}" style="height:90px;border-radius:10px;"/><br/>` : ""}
        <div style="font-size:26px;font-weight:800;color:#FFCB05;margin-top:8px;letter-spacing:4px;">${w.word.toUpperCase()}</div>`,
      keepPromptVisible: true, // chữ mẫu phải ở lại trong lúc chạm ghép — đúng bản chất "nhìn-chép"
      tokens: letters,
      correctValue: letters.join(" "),
      answerMs: 20000, // Mầm non thao tác chậm hơn, cần nhiều thời gian hơn mức mặc định
    };
  });
}

// ============================================================================
// DỄ — A: PokéWord xấp xỉ bằng "typed" (gõ lại cả từ, nhìn nghĩa gợi ý)
// ============================================================================

function buildRounds_De_Pokeword(sessionVocab) {
  return sessionVocab.map(w => ({
    type: "typed",
    instructionKey: "de-pokeword",
    instructionText: "Look at the meaning, then write the word!",
    promptHTML: `<div style="font-size:20px;color:#ffd54f;">💡 ${w.meaning}</div>`,
    keepPromptVisible: true,
    correctValue: w.word,
    placeholder: "Type the word...",
  }));
}

// ============================================================================
// DỄ — B: Viết từ nhìn ảnh mờ
// ============================================================================

function buildRounds_De_BlurredImage(sessionVocab) {
  return sessionVocab.map(w => {
    const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
    return {
      type: "typed",
      instructionKey: "de-blurred-image",
      instructionText: "Look at the blurry picture and write the word!",
      promptHTML: imgSrc
        ? `<img src="${imgSrc}" style="height:120px;border-radius:10px;filter:blur(6px);"/>`
        : `<div style="font-size:15px;color:#aaa;">${w.meaning}</div>`,
      keepPromptVisible: true,
      correctValue: w.word,
      placeholder: "Type the word...",
    };
  });
}

// ============================================================================
// TRUNG BÌNH — A: Viết từ từ nghĩa tiếng Việt
// ============================================================================

function buildRounds_TB_FromMeaning(sessionVocab) {
  return sessionVocab.map(w => ({
    type: "typed",
    instructionKey: "tb-from-meaning",
    instructionText: "Write the English word for this meaning!",
    promptHTML: `<div style="font-size:20px;color:#ffd54f;">${w.meaning}</div>`,
    keepPromptVisible: true,
    correctValue: w.word,
    placeholder: "Type the English word...",
  }));
}

// ============================================================================
// TRUNG BÌNH — B: Dịch cụm từ — tách thành nhiều round typed riêng (mỗi cụm
// 1 round), mỗi round vẫn giữ cụm tiếng Việt hiển thị suốt lúc gõ
// ============================================================================

function buildRounds_TB_TranslateChunk(sessionVocab) {
  const usable = sessionVocab.filter(w => w.enChunk && w.viChunk);
  const list = usable.length ? usable : sessionVocab;

  return list.flatMap(w => {
    const enChunks = (w.enChunk || w.word).split("/").map(s => s.trim()).filter(Boolean);
    const viChunks = (w.viChunk || w.meaning).split("/").map(s => s.trim()).filter(Boolean);

    const finalEn = (enChunks.length === viChunks.length && enChunks.length > 0)
      ? enChunks : [w.enChunk || w.word];
    const finalVi = (enChunks.length === viChunks.length && enChunks.length > 0)
      ? viChunks : [w.viChunk || w.meaning];

    return finalVi.map((vi, i) => ({
      type: "typed",
      instructionKey: "tb-translate-chunk",
      instructionText: "Translate each phrase into English!",
      promptHTML: `<div style="font-size:19px;color:#ffab91;">"${vi}"</div>`,
      keepPromptVisible: true,
      correctValue: finalEn[i],
      placeholder: "Type English...",
    }));
  });
}

// ============================================================================
// KHÓ — A: Sắp xếp câu thành chữ hoàn chỉnh (gõ lại cả câu) — ngân hàng từ
// gợi ý giờ ở lại trên màn hình SUỐT lúc gõ (khác bản trước — nhờ vá engine)
// ============================================================================

function buildRounds_Kho_FullSentence(sessionVocab) {
  const usable = sessionVocab.filter(w => w.answerRaw || w.presentSent);
  const list = usable.length ? usable : sessionVocab;

  return list.map(w => {
    const sentence = w.answerRaw || w.presentSent || `I like the ${w.word}.`;
    const wordBank = shuffle(sentence.replace(/[.,!?]/g, "").split(/\s+/).filter(Boolean));
    return {
      type: "typed",
      instructionKey: "kho-full-sentence",
      instructionText: "Use the word bank to write the complete sentence!",
      promptHTML: `
        <div style="color:#aaa;font-size:13px;margin-bottom:8px;">Word bank: ${wordBank.join(", ")}</div>
        <div style="font-size:15px;color:#ccc;">Write the full sentence:</div>`,
      keepPromptVisible: true,
      correctValue: sentence,
      placeholder: "Type the full sentence...",
      answerMs: 20000,
    };
  });
}

// ============================================================================
// KHÓ — B: Dịch câu tự do — chấm theo % từ khớp (matchType mới vá ở engine)
// ============================================================================

function buildRounds_Kho_FreeTranslate(sessionVocab) {
  const usable = sessionVocab.filter(w => w.enChunk && w.viChunk);
  const list = usable.length ? usable : sessionVocab;

  return list.map(w => {
    const enFull = (w.enChunk || w.answerRaw || w.word).split("/").join(" ").trim();
    const viFull = (w.viChunk || w.meaning).split("/").join(" ").trim();
    return {
      type: "typed",
      instructionKey: "kho-free-translate",
      instructionText: "Translate this sentence into English — it's okay if it's not word-for-word perfect!",
      promptHTML: `<div style="font-size:18px;color:#ffd54f;">"${viFull}"</div>`,
      keepPromptVisible: true,
      correctValue: enFull,
      placeholder: "Type your translation...",
      matchType: "percent",
      matchThreshold: 60,
      answerMs: 20000,
    };
  });
}

// ============================================================================
// DISPATCH THEO CẤP ĐỘ
// ============================================================================

function buildRoundsForLevel(level, sessionVocab) {
  if (level === LEVELS.MAM_NON) {
    return buildRounds_MamNon(sessionVocab);
  }
  if (level === LEVELS.DE) {
    const candidates = [
      () => buildRounds_De_Pokeword(sessionVocab),
      () => buildRounds_De_BlurredImage(sessionVocab),
    ];
    return randomPick(candidates)();
  }
  if (level === LEVELS.TRUNG_BINH) {
    const candidates = [
      () => buildRounds_TB_FromMeaning(sessionVocab),
      () => buildRounds_TB_TranslateChunk(sessionVocab),
    ];
    return randomPick(candidates)();
  }
  // KHÓ
  const candidates = [
    () => buildRounds_Kho_FullSentence(sessionVocab),
    () => buildRounds_Kho_FreeTranslate(sessionVocab),
  ];
  return randomPick(candidates)();
}

// ============================================================================
// HÀM CHÍNH — export để orchestrator gọi
// ============================================================================

export async function runWritingModule(ctx) {
  const { sessionVocab, level } = ctx;
  injectSharedStyles();

  const tracker = createScoreTracker();

  // Vừa quay về từ minigame -> dùng luôn kết quả, không soạn lại/không chuyển trang nữa.
  const resumedResults = PkmGameLauncher.consumeResult("writing");
  if (resumedResults) {
    resumedResults.forEach(r => recordQuestionPassed(tracker, r.correct ? 1 : 2));
    updateMiniScore(tracker.displayScore, tracker.total);
  } else {
    await showTransition("✍️", "Writing Time!", "Let's write some English!");
    const rounds = buildRoundsForLevel(level, sessionVocab);
    // launch() CHUYỂN HẲN TRANG sang minigame — ném PkmGameNavigating để dừng
    // thực thi ngay, all-orchestrator.js đã bắt sẵn.
    PkmGameLauncher.launch({ moduleId: "writing", category: "answer", rounds });
  }

  saveWritingResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Great writing!", "Look how much English you can write now!");
  return { assessScore: tracker.assessScore, assessTotal: tracker.total };
}