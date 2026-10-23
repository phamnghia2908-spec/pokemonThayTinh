/**
 * ============================================================================
 * module-3-speaking.js — MODULE 3: NÓI
 * ============================================================================
 * Không có mascot. Mỗi câu Nói chỉ ghi âm 1 LẦN BẮT BUỘC (không ép retry-until-
 * correct như Nghe/Đọc/Viết) — học sinh có thể TỰ NGUYỆN bấm "Nói lại" nhưng
 * điểm đánh giá chỉ tính theo lần ghi âm đầu tiên.
 *
 * Nếu thiết bị không có mic -> tự động chuyển sang dạng bài thay thế (MCQ)
 * ngay từ đầu. Nếu có mic nhưng NHẬN DẠNG THẤT BẠI (onerror) 2 lần liên tiếp
 * -> hỏi "mic có hoạt động không?" -> Yes: tiếp tục / No: chuyển dạng thay thế
 * cho phần còn lại của buổi.
 * ============================================================================
 */

import {
  LEVELS, speakEN, speakInstructionOnce, askMCQ,
  buildDistractors, shuffle, randomPick, createScoreTracker,
  recordSpeakingAttempt, recordQuestionPassed, saveSpeakingResult,
  showTransition, updateMiniScore, getImageFromMap, injectSharedStyles,
  createMicFailTracker, noteMicResult, askIfMicWorking,
  startRecording, transcribeAudio,
  POSITIVE_FEEDBACK, randomPick as pick,
} from "./all-shared.js";

// ============================================================================
// HELPER RIÊNG: ghi âm 1 lần, có phân biệt "lỗi kỹ thuật" vs "chưa khớp"
// (viết riêng ở đây thay vì sửa lại askSpeakingAttempt dùng chung, để tránh
// phải chỉnh all-shared.js thêm lần nữa cho một nhu cầu chỉ module này cần)
// ============================================================================

function extractKeywords(keywordFixRaw) {
  const matches = (keywordFixRaw || "").match(/"([^"]+)"/g);
  if (!matches) return [];
  return matches.map(s => s.replace(/"/g, "").toLowerCase().trim()).filter(Boolean);
}

function defaultMatch(heard, target) {
  const h = heard.toLowerCase().trim();
  const t = (target || "").toLowerCase().trim();
  return !!t && (h.includes(t) || t.includes(h));
}

function checkPercentMatch(heard, target, threshold = 70) {
  const clean = s => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const h = clean(heard), t = clean(target);
  if (!t.length) return false;
  const correct = t.filter(w => h.includes(w)).length;
  return Math.round((correct / t.length) * 100) >= threshold;
}

/**
 * cfg: { container, instructionKey, instructionText, targetText, promptHTML,
 *        matchFn, veryLenient=false, maxRecordMs=10000, speakBeforeText }
 * veryLenient: true = chỉ cần nhận dạng ra CÓ tiếng nói là tính đúng (Mầm non)
 * speakBeforeText: nội dung sẽ được ĐỌC LÊN trước, sau đó TỰ ĐỘNG ghi âm luôn
 *                   (không cần chạm mic) — giống cơ chế i-Speak của Babilala.
 * Trả Promise<{ isCorrect, technicalFail }>
 */
function recordSpeech(cfg) {
  const {
    container, instructionKey, instructionText, targetText,
    promptHTML, matchFn, veryLenient = false, maxRecordMs = 10000, speakBeforeText,
  } = cfg;
  const checkMatch = matchFn || defaultMatch;

  return new Promise(async resolve => {
    container.innerHTML = `
      <div class="pkl-speak-prompt">${promptHTML}</div>
      <div class="pkl-speak-status" id="pklSpStatus">🔊 Listen...</div>
      <div style="text-align:center;"><div class="mic-ring" id="pklSpMic" style="opacity:.4;pointer-events:none;">🎤</div></div>
      <div class="pkl-speak-result" id="pklSpResult"></div>
      <div style="text-align:center;margin-top:10px;">
        <button class="poke-btn green" id="pklSpFinishBtn" style="display:none;">✅ Finish</button>
      </div>
      <div id="pklSpActions" style="display:none;text-align:center;margin-top:10px;gap:8px;">
        <button class="poke-btn gray" id="pklSpRetry">🔄 Try speaking again</button>
        <button class="poke-btn green" id="pklSpContinue">▶ Continue</button>
      </div>`;

    const statusEl = container.querySelector("#pklSpStatus");
    const micEl = container.querySelector("#pklSpMic");
    const resultEl = container.querySelector("#pklSpResult");
    const finishBtn = container.querySelector("#pklSpFinishBtn");
    const actionsEl = container.querySelector("#pklSpActions");

    let firstDone = false, finalCorrect = false, finalTechFail = false;
    let autoTimer = null;
    let recording = false; // chặn bấm mic nhiều lần khi đang ghi

    const lockMic = (locked) => {
      micEl.style.pointerEvents = locked ? "none" : "auto";
      micEl.style.opacity = locked ? ".4" : "1";
    };

    const doRecord = async () => {
      if (recording) return;
      recording = true;
      lockMic(true);
      try {
        statusEl.textContent = "🎤 Recording... tap Finish when done!";
        micEl.classList.add("listening");
        finishBtn.style.display = "inline-block";

        // getUserMedia() được gọi NGAY TRONG handler của cú tap -> có user gesture -> chạy được trên mobile
        const session = await startRecording(maxRecordMs);
        finishBtn.onclick = () => session.stop();
        const blob = await session.blob;

        finishBtn.style.display = "none";
        micEl.classList.remove("listening");
        statusEl.textContent = "⏳ Checking...";

        const transcript = await transcribeAudio(blob);
        actionsEl.style.display = "flex"; actionsEl.style.justifyContent = "center";

        if (transcript === null) {
          if (!firstDone) { firstDone = true; finalCorrect = false; finalTechFail = true; }
          statusEl.textContent = "⚠️ Can't reach the speech server — try again in a moment.";
          clearTimeout(autoTimer);
          autoTimer = setTimeout(finish, 1800);
          return;
        }

        const isCorrect = veryLenient ? true : checkMatch(transcript, targetText);
        if (!firstDone) { firstDone = true; finalCorrect = isCorrect; finalTechFail = false; }

        resultEl.innerHTML = transcript ? `🗣️ You said: "<b>${transcript}</b>"` : `🗣️ (didn't hear anything clearly)`;
        statusEl.textContent = isCorrect ? "🎉 Great job!" : "👍 Nice try!";
        await speakEN(isCorrect ? pick(POSITIVE_FEEDBACK) : "Good try!");

        clearTimeout(autoTimer);
        autoTimer = setTimeout(finish, 2200);
      } catch (e) {
        console.error("recordSpeech: lỗi mic/ghi âm:", e);
        micEl.classList.remove("listening");
        finishBtn.style.display = "none";
        statusEl.textContent = "⚠️ Microphone not available. Tap 🎤 to try again.";
        if (!firstDone) { firstDone = true; finalCorrect = false; finalTechFail = true; }
        actionsEl.style.display = "flex"; actionsEl.style.justifyContent = "center";
        recording = false;
        lockMic(false); // cho phép bấm lại thử mic lần nữa thay vì tự resolve luôn
        return; // KHÔNG auto-finish nữa khi lỗi mic — để học sinh chủ động bấm lại hoặc bấm Continue
      }
    };

    const finish = () => {
      clearTimeout(autoTimer);
      resolve({ isCorrect: finalCorrect, technicalFail: finalTechFail });
    };

    micEl.onclick = () => doRecord();

    container.addEventListener("click", (e) => {
      if (e.target.id === "pklSpRetry") { clearTimeout(autoTimer); recording = false; doRecord(); }
      if (e.target.id === "pklSpContinue") finish();
    });

    // BƯỚC 1: đọc hướng dẫn (chỉ lần đầu/buổi), rồi đọc nội dung cần nói theo
    await speakInstructionOnce(instructionKey, instructionText);
    if (speakBeforeText) { statusEl.textContent = "🔊 Listen..."; await speakEN(speakBeforeText, 0.9); }

    // BƯỚC 2: mic sẵn sàng — HỌC SINH TỰ BẤM vào mic để bắt đầu ghi âm
    // (không auto gọi getUserMedia nữa vì mobile Safari sẽ chặn khi không có gesture tươi)
    statusEl.textContent = "🎤 Tap the mic to speak!";
    lockMic(false);
  });
}

// ============================================================================
// MẦM NON — mic: lặp 1 từ, chấm cực lỏng | không mic: chạm hình nghe lại
// ============================================================================

async function speakMamNon_Mic(rootEl, sessionVocab, tracker, micFailTracker, getMicMode, setMicMode) {
  for (const w of sessionVocab) {
    if (!getMicMode()) { await speakMamNon_NoMic(rootEl, [w], tracker); continue; }
    const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
    const { isCorrect, technicalFail } = await recordSpeech({
      container: rootEl,
      instructionKey: "mamnon-speak",
      instructionText: "Listen, then try saying the word!",
      targetText: w.word,
      veryLenient: true,
      speakBeforeText: w.word,
      maxRecordMs: 10000,
      promptHTML: `${imgSrc ? `<img src="${imgSrc}" style="height:90px;border-radius:10px;"/><br/>` : ""}
        <div style="font-size:24px;font-weight:800;color:#FFCB05;margin-top:8px;">${w.word.toUpperCase()}</div>`,
    });
    recordSpeakingAttempt(tracker, isCorrect);
    updateMiniScore(tracker.displayScore, tracker.total);

    const shouldAsk = noteMicResult(micFailTracker, !technicalFail);
    if (shouldAsk) {
      const stillWorks = await askIfMicWorking();
      if (!stillWorks) setMicMode(false); else micFailTracker.consecutiveFails = 0;
    }
  }
}

async function speakMamNon_NoMic(rootEl, sessionVocab, tracker) {
  for (const w of sessionVocab) {
    const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
    rootEl.innerHTML = `
      <div style="text-align:center;">
        <img src="${imgSrc}" style="height:140px;border-radius:12px;cursor:pointer;" id="pklTapImg"/>
        <div style="font-size:24px;font-weight:800;color:#FFCB05;margin-top:10px;">${w.word.toUpperCase()}</div>
        <div style="color:#aaa;font-size:13px;margin-top:6px;">👆 Tap the picture and say it with me!</div>
      </div>`;
    document.getElementById("pklTapImg").onclick = () => speakEN(w.word, 0.7);
    await speakInstructionOnce("mamnon-nomic", "Look, listen, and try to say the word with me!");
    await speakEN(w.word, 0.75);
    recordSpeakingAttempt(tracker, true); // không có mic để chấm -> luôn tính hoàn thành
    updateMiniScore(tracker.displayScore, tracker.total);
    await new Promise(r => setTimeout(r, 1200));
  }
}

// ============================================================================
// DỄ — A: Lặp câu ngắn theo mẫu | B: Nói từ nhìn hình | fallback: chọn hình khớp âm
// ============================================================================

async function speakDe_RepeatSentence(rootEl, w, tracker) {
  const sentence = w.presentSent || w.question || w.word;
  const { isCorrect, technicalFail } = await recordSpeech({
    container: rootEl,
    instructionKey: "de-repeat-sentence",
    instructionText: "Listen and repeat the sentence!",
    targetText: sentence,
    speakBeforeText: sentence,
    maxRecordMs: 10000,
    promptHTML: `<div style="font-size:20px;">${sentence}</div>`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
  return technicalFail;
}

async function speakDe_WordFromImage(rootEl, w, tracker) {
  const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
  const { isCorrect, technicalFail } = await recordSpeech({
    container: rootEl,
    instructionKey: "de-word-image",
    instructionText: "Look at the picture and say the word!",
    targetText: w.word,
    speakBeforeText: w.word,
    maxRecordMs: 10000,
    promptHTML: `${imgSrc ? `<img src="${imgSrc}" style="height:100px;border-radius:10px;"/>` : ""}`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
  return technicalFail;
}

async function speakDe_FallbackPickImage(rootEl, w, poolData, sessionVocab, tracker) {
  const distractorWords = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab, preferSameLesson: true });
  const options = shuffle([w.word, ...distractorWords]).map(val => {
    const found = [w, ...poolData, ...sessionVocab].find(p => p.word === val) || w;
    return { label: val, value: val, imageUrl: getImageFromMap(found.imageKeyword || val) || "" };
  });
  const attempts = await askMCQ({
    container: rootEl,
    instructionKey: "de-fallback-pick",
    instructionText: "Listen, then tap the picture that matches!",
    questionHTML: `<div style="font-size:36px;">🔊</div>`,
    options, correctValue: w.word, speakPromptText: w.word,
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

// ============================================================================
// TRUNG BÌNH — A: câu hỏi có gợi ý gạch chân | B: đọc kịch bản Q&A | fallback: ghép Q-A
// ============================================================================

async function speakTB_HintedQuestion(rootEl, w, tracker) {
  const keywords = extractKeywords(w.keywordFix);
  const hintWord = keywords[0] || w.word;
  const questionText = w.question || `Tell me about "${w.word}".`;
  const { isCorrect, technicalFail } = await recordSpeech({
    container: rootEl,
    instructionKey: "tb-hinted-question",
    instructionText: "Answer the question out loud!",
    targetText: w.answerRaw || w.word,
    speakBeforeText: questionText,
    maxRecordMs: 10000,
    matchFn: (heard) => keywords.length ? keywords.some(k => heard.toLowerCase().includes(k)) : defaultMatch(heard, w.word),
    promptHTML: `
      <div style="font-size:19px;">${questionText}</div>
      <div style="font-size:13px;color:#aaa;margin-top:6px;">💡 Hint: <u>${hintWord}</u></div>`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
  return technicalFail;
}

async function speakTB_ScriptQA(rootEl, w, tracker) {
  const script = `${w.question || ""} ${w.answerRaw || ""}`.trim();
  const { isCorrect, technicalFail } = await recordSpeech({
    container: rootEl,
    instructionKey: "tb-script-qa",
    instructionText: "Listen to this short script, then read it out loud!",
    targetText: script,
    speakBeforeText: script,
    maxRecordMs: 10000,
    matchFn: (heard) => checkPercentMatch(heard, script, 50),
    promptHTML: `
      <div style="background:#333;color:#fff;padding:14px;border-radius:10px;text-align:left;line-height:1.6;">
        <div>Q: ${w.question || ""}</div><div>A: ${w.answerRaw || ""}</div>
      </div>`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
  return technicalFail;
}

async function speakTB_FallbackMatchQA(rootEl, w, poolData, sessionVocab, tracker) {
  if (!w.question || !w.answerRaw) { await speakDe_FallbackPickImage(rootEl, w, poolData, sessionVocab, tracker); return; }
  const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });
  const attempts = await askMCQ({
    container: rootEl,
    instructionKey: "tb-fallback-matchqa",
    instructionText: "Choose the correct answer to this question!",
    questionHTML: `<div style="font-size:17px;color:#ffd54f;">❓ ${w.question}</div>`,
    options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.answerRaw,
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

// ============================================================================
// KHÓ — A: giao tiếp tự do không gợi ý | B: nói đoạn dài chấm chặt | fallback: nghe chọn ý
// ============================================================================

async function speakKho_FreeCommunication(rootEl, w, tracker) {
  const keywords = extractKeywords(w.keywordFix);
  const questionText = w.question || `What do you know about "${w.word}"?`;
  const { isCorrect, technicalFail } = await recordSpeech({
    container: rootEl,
    instructionKey: "kho-free-comm",
    instructionText: "Answer freely — there's no hint this time!",
    targetText: w.answerRaw || w.word,
    speakBeforeText: questionText,
    maxRecordMs: 10000,
    matchFn: (heard) => keywords.length ? keywords.some(k => heard.toLowerCase().includes(k)) : defaultMatch(heard, w.word),
    promptHTML: `<div style="font-size:19px;">${questionText}</div>`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
  return technicalFail;
}

async function speakKho_LongStrict(rootEl, w, tracker) {
  const longText = w.presentSent && w.presentSent.length > (w.question || "").length + (w.answerRaw || "").length
    ? w.presentSent
    : `${w.question || ""} ${w.answerRaw || ""}`.trim() || w.word;
  const { isCorrect, technicalFail } = await recordSpeech({
    container: rootEl,
    instructionKey: "kho-long-strict",
    instructionText: "Listen carefully, then say it as accurately as you can!",
    targetText: longText,
    speakBeforeText: longText,
    maxRecordMs: 10000,
    matchFn: (heard) => checkPercentMatch(heard, longText, 70),
    promptHTML: `<div style="font-size:18px;background:#333;color:#fff;padding:14px;border-radius:10px;">${longText}</div>`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
  return technicalFail;
}

async function speakKho_FallbackChooseIdea(rootEl, w, poolData, sessionVocab, tracker) {
  if (!w.question || !w.answerRaw) { await speakDe_FallbackPickImage(rootEl, w, poolData, sessionVocab, tracker); return; }
  const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });
  rootEl.innerHTML = `<div style="text-align:center;font-size:16px;color:#ccc;">🎧 Listen carefully...</div>`;
  await speakInstructionOnce("kho-fallback-choose", "Listen, then choose the correct idea!");
  await speakEN(`${w.question} ${w.answerRaw}`, 0.9);
  const attempts = await askMCQ({
    container: rootEl,
    instructionKey: "kho-fallback-choose-q",
    instructionText: "Which sentence is correct?",
    questionHTML: `<div style="font-size:16px;color:#ffd54f;">❓ ${w.question}</div>`,
    options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
    correctValue: w.answerRaw,
  });
  recordQuestionPassed(tracker, attempts);
  updateMiniScore(tracker.displayScore, tracker.total);
}

// ============================================================================
// HÀM CHÍNH — export để orchestrator gọi
// ============================================================================

export async function runSpeakingModule(ctx) {
  const { sessionVocab, poolData, level, rootEl } = ctx;
  injectSharedStyles();
  await showTransition("🎙️", "Speaking Time!", "Let's practice speaking English!");

  const tracker = createScoreTracker();
  const micFailTracker = createMicFailTracker(2);
  // KHÔNG await isMicrophoneAvailable() ở đây nữa — gọi getUserMedia() tự động
  // ngay sau nút "Tiếp tục" (không phải do học sinh chạm mic) sẽ "ăn mất" phần
  // user-gesture còn lại, khiến TTS đọc ngay sau đó (speakInstructionOnce/
  // speakEN trong recordSpeech) bị chặn/treo trên mobile -> mic không bao giờ
  // mở khoá được. Giờ LẠC QUAN giả định có mic; mic có thật sự dùng được hay
  // không sẽ do chính lần ghi âm đầu tiên (trong doRecord, đã có try/catch)
  // quyết định, qua "technicalFail" trả về từ mỗi recordSpeech.
  let micMode = true;
  const getMicMode = () => micMode;
  const setMicMode = (v) => { micMode = v; };

  if (level === LEVELS.MAM_NON) {
    if (micMode) await speakMamNon_Mic(rootEl, sessionVocab, tracker, micFailTracker, getMicMode, setMicMode);
    else await speakMamNon_NoMic(rootEl, sessionVocab, tracker);
  } else {
    // Với Dễ/TB/Khó: chọn ngẫu nhiên 1 trong 2 dạng NGAY TỪ ĐẦU buổi (giữ nhất quán
    // trong toàn bộ 6-7 từ), nhưng nếu giữa chừng mất mic thì chuyển toàn bộ phần
    // còn lại sang dạng thay thế không cần mic.
    const variant = Math.random() < 0.5 ? "A" : "B";

    for (const w of sessionVocab) {
      if (!micMode) {
        // Đã mất mic giữa chừng hoặc không có mic ngay từ đầu -> dùng fallback
        if (level === LEVELS.DE) await speakDe_FallbackPickImage(rootEl, w, poolData, sessionVocab, tracker);
        else if (level === LEVELS.TRUNG_BINH) await speakTB_FallbackMatchQA(rootEl, w, poolData, sessionVocab, tracker);
        else await speakKho_FallbackChooseIdea(rootEl, w, poolData, sessionVocab, tracker);
        continue;
      }

      let technicalFail = false;
      if (level === LEVELS.DE) {
        technicalFail = variant === "A"
          ? await speakDe_RepeatSentence(rootEl, w, tracker)
          : await speakDe_WordFromImage(rootEl, w, tracker);
      } else if (level === LEVELS.TRUNG_BINH) {
        technicalFail = variant === "A"
          ? await speakTB_HintedQuestion(rootEl, w, tracker)
          : await speakTB_ScriptQA(rootEl, w, tracker);
      } else {
        technicalFail = variant === "A"
          ? await speakKho_FreeCommunication(rootEl, w, tracker)
          : await speakKho_LongStrict(rootEl, w, tracker);
      }

      // Dùng đúng kết quả của LẦN GHI ÂM VỪA RỒI để phát hiện mic hỏng — không
      // còn cần gọi lại isMicrophoneAvailable() giữa chừng (cũng tự ý xin mic,
      // cũng có nguy cơ "ăn" gesture y hệt lỗi ở trên).
      const shouldAsk = noteMicResult(micFailTracker, !technicalFail);
      if (shouldAsk) {
        const stillWorks = await askIfMicWorking();
        if (!stillWorks) setMicMode(false); else micFailTracker.consecutiveFails = 0;
      }
    }
  }

  saveSpeakingResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Great speaking!", "Your English is getting better and better!");
}