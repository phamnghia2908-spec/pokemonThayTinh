/**
 * ============================================================================
 * module-3-speaking.js — MODULE 3: NÓI (bản viết lại — chơi qua minigame
 * pkm_minigame_ballcatching.html, KHÔNG dùng chung engine đua với Module 2)
 * ============================================================================
 * Module này KHÔNG tự vẽ UI ghi âm vào rootEl nữa. Mỗi dạng bài (Mầm non, Dễ
 * A/B, TB A/B, Khó A/B) chỉ soạn mảng `rounds` — mỗi round dạng "speaking"
 * LUÔN kèm sẵn `fallbackRound` (dạng mcq/image-mcq) — rồi gọi
 * PkmGameLauncher.launch({ moduleId: "speaking", category: "speaking", rounds })
 * để chuyển hẳn trang sang pkm_minigame_ballcatching.html (bắt bóng Poké bay
 * ngẫu nhiên trên màn hình, bắt 1 quả -> hiện flashcard ghi âm/luyện nói).
 *
 * category "speaking" TÁCH RIÊNG khỏi "answer" (nhóm race/race_alone/
 * shooting/fish của Module 2/4/5) vì ballcatching có luồng chơi hoàn toàn
 * khác: không có nhịp "đề bài hiện 5s rồi ẩn" hay khung giờ trả lời cố định —
 * mọi round hiện SONG SONG dưới dạng bóng bay, học sinh bắt theo thứ tự tuỳ
 * ý, mỗi lần bắt hiện flashcard với promptHTML hiển thị LIÊN TỤC suốt lúc ghi
 * âm (không ẩn đi như dạng nghe).
 *
 * MIC HỎNG GIỮA CHỪNG: pkm_minigame_ballcatching.js tự đếm lỗi kỹ thuật liên
 * tiếp (2 lần) rồi hỏi "mic có hoạt động không?" — chọn "Chuyển bài khác" thì
 * từ đó mọi round speaking còn lại tự dùng `fallbackRound`. Module này chỉ
 * cần LUÔN soạn sẵn fallback cho mọi round speaking, không cần xử lý gì thêm.
 *
 * SO KHỚP GIỌNG NÓI: vì `rounds` bị JSON.stringify() để lưu localStorage
 * trước khi chuyển trang, KHÔNG thể truyền hàm matchFn như bản gốc — thay
 * bằng `matchType` + `matchThreshold`/`matchKeywords` (dữ liệu thuần), engine
 * tự diễn giải thành logic so khớp (bản ballcatching mặc định ngưỡng percent
 * là 70 nếu không truyền `matchThreshold` — module này LUÔN truyền tường minh
 * cho các round matchType:"percent" nên không phụ thuộc giá trị mặc định đó).
 * ============================================================================
 */

import {
  LEVELS, randomPick, createScoreTracker, recordSpeakingAttempt,
  saveSpeakingResult, showTransition, updateMiniScore, getImageFromMap,
  injectSharedStyles, buildDistractors, shuffle, PkmGameLauncher,
} from "./all-shared.js";

// ============================================================================
// HELPER RIÊNG — chỉ dùng lúc SOẠN dữ liệu (build-time), không chạy trong
// lúc chơi nữa (engine đã đảm nhiệm phần đó)
// ============================================================================

function extractKeywords(keywordFixRaw) {
  const matches = (keywordFixRaw || "").match(/"([^"]+)"/g);
  if (!matches) return [];
  return matches.map(s => s.replace(/"/g, "").toLowerCase().trim()).filter(Boolean);
}

// ============================================================================
// FALLBACK DÙNG CHUNG — round thay thế khi mic hỏng giữa chừng
// ============================================================================

// Fallback cấp thấp nhất: nghe từ -> chạm đúng hình (dùng cho Mầm non + Dễ +
// khi TB/Khó thiếu dữ liệu Q&A để ghép fallback riêng)
function buildFallback_PickImage(w, poolData, sessionVocab) {
  const distractorWords = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab, preferSameLesson: true });
  const options = shuffle([w.word, ...distractorWords]).map(val => {
    const found = [w, ...poolData, ...sessionVocab].find(p => p.word === val) || w;
    return { label: val, value: val, imageUrl: getImageFromMap(found.imageKeyword || val) || "" };
  });
  return {
    type: "image-mcq",
    instructionKey: "speak-fallback-pick",
    instructionText: "Listen, then tap the picture that matches!",
    promptHTML: `<div style="font-size:52px;">🔊</div>`,
    speakPromptText: w.word,
    replayText: w.word,
    maxReplay: Infinity,
    options,
    correctValue: w.word,
  };
}

// Fallback cho TB: nghe xong chọn đúng câu trả lời (ghép Q-A)
function buildFallback_MatchQA(w, poolData, sessionVocab) {
  if (!w.question || !w.answerRaw) return buildFallback_PickImage(w, poolData, sessionVocab);
  const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });
  return {
    type: "mcq",
    instructionKey: "speak-fallback-matchqa",
    instructionText: "Listen, then choose the correct answer to this question!",
    promptHTML: `<div style="font-size:17px;color:#ffd54f;">❓ ${w.question}</div>`,
    speakPromptText: `${w.question} ${w.answerRaw}`,
    replayText: `${w.question} ${w.answerRaw}`,
    maxReplay: 2,
    options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.answerRaw,
  };
}

// Fallback cho Khó: nghe xong chọn đúng ý
function buildFallback_ChooseIdea(w, poolData, sessionVocab) {
  if (!w.question || !w.answerRaw) return buildFallback_PickImage(w, poolData, sessionVocab);
  const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });
  return {
    type: "mcq",
    instructionKey: "speak-fallback-choose",
    instructionText: "Listen, then choose the correct idea!",
    promptHTML: `<div style="font-size:16px;color:#ffd54f;">❓ ${w.question}</div>`,
    speakPromptText: `${w.question} ${w.answerRaw}`,
    replayText: `${w.question} ${w.answerRaw}`,
    maxReplay: 1,
    options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.answerRaw,
  };
}

// ============================================================================
// MẦM NON — lặp lại 1 từ, chấm cực lỏng (matchType "lenient")
// ============================================================================

function buildRounds_MamNon(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
    return {
      type: "speaking",
      instructionKey: "mamnon-speak",
      instructionText: "Listen, then try saying the word!",
      targetText: w.word,
      matchType: "lenient", // chỉ cần có nói là được, không chấm đúng/sai gắt
      speakBeforeText: w.word,
      promptHTML: `
        ${imgSrc ? `<img src="${imgSrc}" style="height:90px;border-radius:10px;"/><br/>` : ""}
        <div style="font-size:24px;font-weight:800;color:#FFCB05;margin-top:8px;">${w.word.toUpperCase()}</div>`,
      maxRecordMs: 10000,
      fallbackRound: buildFallback_PickImage(w, poolData, sessionVocab),
    };
  });
}

// ============================================================================
// DỄ — A: Lặp câu ngắn theo mẫu | B: Nói từ nhìn hình
// ============================================================================

function buildRounds_De_RepeatSentence(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const sentence = w.presentSent || w.question || w.word;
    return {
      type: "speaking",
      instructionKey: "de-repeat-sentence",
      instructionText: "Listen and repeat the sentence!",
      targetText: sentence,
      matchType: "includes",
      speakBeforeText: sentence,
      promptHTML: `<div style="font-size:20px;">${sentence}</div>`,
      maxRecordMs: 10000,
      fallbackRound: buildFallback_PickImage(w, poolData, sessionVocab),
    };
  });
}

function buildRounds_De_WordFromImage(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
    return {
      type: "speaking",
      instructionKey: "de-word-image",
      instructionText: "Look at the picture and say the word!",
      targetText: w.word,
      matchType: "includes",
      speakBeforeText: w.word,
      promptHTML: `${imgSrc ? `<img src="${imgSrc}" style="height:100px;border-radius:10px;"/>` : ""}`,
      maxRecordMs: 10000,
      fallbackRound: buildFallback_PickImage(w, poolData, sessionVocab),
    };
  });
}

// ============================================================================
// TRUNG BÌNH — A: câu hỏi có gợi ý gạch chân | B: đọc kịch bản Q&A
// ============================================================================

function buildRounds_TB_HintedQuestion(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const keywords = extractKeywords(w.keywordFix);
    const hintWord = keywords[0] || w.word;
    const questionText = w.question || `Tell me about "${w.word}".`;
    return {
      type: "speaking",
      instructionKey: "tb-hinted-question",
      instructionText: "Answer the question out loud!",
      targetText: w.answerRaw || w.word,
      matchType: keywords.length ? "keywords" : "includes",
      matchKeywords: keywords,
      speakBeforeText: questionText,
      promptHTML: `
        <div style="font-size:19px;">${questionText}</div>
        <div style="font-size:13px;color:#aaa;margin-top:6px;">💡 Hint: <u>${hintWord}</u></div>`,
      maxRecordMs: 10000,
      fallbackRound: buildFallback_MatchQA(w, poolData, sessionVocab),
    };
  });
}

function buildRounds_TB_ScriptQA(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const script = `${w.question || ""} ${w.answerRaw || ""}`.trim();
    return {
      type: "speaking",
      instructionKey: "tb-script-qa",
      instructionText: "Listen to this short script, then read it out loud!",
      targetText: script,
      matchType: "percent",
      matchThreshold: 50,
      speakBeforeText: script,
      promptHTML: `
        <div style="background:#333;color:#fff;padding:14px;border-radius:10px;text-align:left;line-height:1.6;">
          <div>Q: ${w.question || ""}</div><div>A: ${w.answerRaw || ""}</div>
        </div>`,
      maxRecordMs: 10000,
      fallbackRound: buildFallback_MatchQA(w, poolData, sessionVocab),
    };
  });
}

// ============================================================================
// KHÓ — A: giao tiếp tự do không gợi ý | B: nói đoạn dài chấm chặt
// ============================================================================

function buildRounds_Kho_FreeCommunication(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const keywords = extractKeywords(w.keywordFix);
    const questionText = w.question || `What do you know about "${w.word}"?`;
    return {
      type: "speaking",
      instructionKey: "kho-free-comm",
      instructionText: "Answer freely — there's no hint this time!",
      targetText: w.answerRaw || w.word,
      matchType: keywords.length ? "keywords" : "includes",
      matchKeywords: keywords,
      speakBeforeText: questionText,
      promptHTML: `<div style="font-size:19px;">${questionText}</div>`,
      maxRecordMs: 10000,
      fallbackRound: buildFallback_ChooseIdea(w, poolData, sessionVocab),
    };
  });
}

function buildRounds_Kho_LongStrict(sessionVocab, poolData) {
  return sessionVocab.map(w => {
    const longText = w.presentSent && w.presentSent.length > (w.question || "").length + (w.answerRaw || "").length
      ? w.presentSent
      : `${w.question || ""} ${w.answerRaw || ""}`.trim() || w.word;
    return {
      type: "speaking",
      instructionKey: "kho-long-strict",
      instructionText: "Listen carefully, then say it as accurately as you can!",
      targetText: longText,
      matchType: "percent",
      matchThreshold: 70,
      speakBeforeText: longText,
      promptHTML: `<div style="font-size:18px;background:#333;color:#fff;padding:14px;border-radius:10px;">${longText}</div>`,
      maxRecordMs: 10000,
      fallbackRound: buildFallback_ChooseIdea(w, poolData, sessionVocab),
    };
  });
}

// ============================================================================
// DISPATCH THEO CẤP ĐỘ — chọn ngẫu nhiên 1 trong 2 dạng (A/B) MỘT LẦN cho cả
// buổi (giữ nhất quán trong toàn bộ sessionVocab), y hệt logic cũ
// ============================================================================

function buildRoundsForLevel(level, sessionVocab, poolData) {
  if (level === LEVELS.MAM_NON) {
    return buildRounds_MamNon(sessionVocab, poolData);
  }
  if (level === LEVELS.DE) {
    const candidates = [
      () => buildRounds_De_RepeatSentence(sessionVocab, poolData),
      () => buildRounds_De_WordFromImage(sessionVocab, poolData),
    ];
    return randomPick(candidates)();
  }
  if (level === LEVELS.TRUNG_BINH) {
    const candidates = [
      () => buildRounds_TB_HintedQuestion(sessionVocab, poolData),
      () => buildRounds_TB_ScriptQA(sessionVocab, poolData),
    ];
    return randomPick(candidates)();
  }
  // KHÓ
  const candidates = [
    () => buildRounds_Kho_FreeCommunication(sessionVocab, poolData),
    () => buildRounds_Kho_LongStrict(sessionVocab, poolData),
  ];
  return randomPick(candidates)();
}

// ============================================================================
// HÀM CHÍNH — export để orchestrator gọi
// ============================================================================

export async function runSpeakingModule(ctx) {
  const { sessionVocab, poolData, level } = ctx;
  injectSharedStyles();

  const tracker = createScoreTracker();

  // Vừa quay về từ minigame -> dùng luôn kết quả, không soạn lại/không chuyển trang nữa.
  const resumedResults = PkmGameLauncher.consumeResult("speaking");
  if (resumedResults) {
    resumedResults.forEach(r => recordSpeakingAttempt(tracker, r.correct));
    updateMiniScore(tracker.displayScore, tracker.total);
  } else {
    await showTransition("🎙️", "Speaking Time!", "Let's practice speaking English!");
    const rounds = buildRoundsForLevel(level, sessionVocab, poolData);
    // launch() CHUYỂN HẲN TRANG sang minigame — ném PkmGameNavigating để dừng
    // thực thi ngay, all-orchestrator.js đã bắt sẵn. category "speaking" ->
    // GAMES.speaking (pkm_minigame_ballcatching.html), KHÔNG dùng chung nhóm
    // "answer" với race/race_alone/shooting/fish nữa, vì ballcatching có luồng
    // chơi riêng (bắt bóng ngẫu nhiên, không theo nhịp prompt-flash 5s).
    PkmGameLauncher.launch({ moduleId: "speaking", category: "speaking", rounds });
  }

  saveSpeakingResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Great speaking!", "Your English is getting better and better!");
  return { assessScore: tracker.assessScore, assessTotal: tracker.total };
}