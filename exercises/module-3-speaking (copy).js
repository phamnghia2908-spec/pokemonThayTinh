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
  isMicrophoneAvailable, createMicFailTracker, noteMicResult, askIfMicWorking,
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
 *        matchFn, veryLenient=false }
 * veryLenient: true = chỉ cần nhận dạng ra CÓ tiếng nói là tính đúng (Mầm non)
 * Trả Promise<{ isCorrect, technicalFail }>
 */
function recordSpeech(cfg) {
  const {
    container, instructionKey, instructionText, targetText,
    promptHTML, matchFn, veryLenient = false,
  } = cfg;
  const checkMatch = matchFn || defaultMatch;

  return new Promise(async resolve => {
    await speakInstructionOnce(instructionKey, instructionText);

    let firstDone = false, finalCorrect = false, finalTechFail = false;
    let autoTimer = null;

    const render = () => {
      container.innerHTML = `
        <div class="pkl-speak-prompt">${promptHTML}</div>
        <div class="pkl-speak-status" id="pklSpStatus">👆 Tap the mic and speak!</div>
        <div style="text-align:center;"><div class="mic-ring" id="pklSpMic">🎤</div></div>
        <div class="pkl-speak-result" id="pklSpResult"></div>
        <div id="pklSpActions" style="display:none;text-align:center;margin-top:10px;gap:8px;">
          <button class="poke-btn gray" id="pklSpRetry">🔄 Try speaking again</button>
          <button class="poke-btn green" id="pklSpContinue">▶ Continue</button>
        </div>`;
      container.querySelector("#pklSpMic").onclick = doRecord;
    };

    const doRecord = () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const statusEl = container.querySelector("#pklSpStatus");
      const micEl = container.querySelector("#pklSpMic");
      const resultEl = container.querySelector("#pklSpResult");
      const actionsEl = container.querySelector("#pklSpActions");
      if (!SR) {
        if (!firstDone) { firstDone = true; finalCorrect = false; finalTechFail = true; }
        statusEl.textContent = "⚠️ Microphone not supported.";
        return;
      }
      const rec = new SR();
      rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
      statusEl.textContent = "🎙️ Listening...";
      micEl.classList.add("listening");
      rec.start();

      rec.onresult = async (e) => {
        const transcript = e.results[0][0].transcript;
        micEl.classList.remove("listening");
        const isCorrect = veryLenient ? true : checkMatch(transcript, targetText);
        if (!firstDone) { firstDone = true; finalCorrect = isCorrect; finalTechFail = false; }

        resultEl.innerHTML = `🗣️ You said: "<b>${transcript}</b>"`;
        statusEl.textContent = isCorrect ? "🎉 Great job!" : "👍 Nice try!";
        await speakEN(isCorrect ? pick(POSITIVE_FEEDBACK) : "Good try!");

        actionsEl.style.display = "flex"; actionsEl.style.justifyContent = "center";
        clearTimeout(autoTimer);
        autoTimer = setTimeout(finish, 2200);
      };
      rec.onerror = () => {
        micEl.classList.remove("listening");
        statusEl.textContent = "⚠️ Didn't catch that.";
        if (!firstDone) { firstDone = true; finalCorrect = false; finalTechFail = true; }
        actionsEl.style.display = "flex"; actionsEl.style.justifyContent = "center";
        clearTimeout(autoTimer);
        autoTimer = setTimeout(finish, 1800);
      };
    };

    const finish = () => {
      clearTimeout(autoTimer);
      resolve({ isCorrect: finalCorrect, technicalFail: finalTechFail });
    };

    render();
    container.addEventListener("click", (e) => {
      if (e.target.id === "pklSpRetry") { clearTimeout(autoTimer); doRecord(); }
      if (e.target.id === "pklSpContinue") finish();
    });
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
      promptHTML: `${imgSrc ? `<img src="${imgSrc}" style="height:90px;border-radius:10px;"/><br/>` : ""}
        <div style="font-size:24px;font-weight:800;color:#FFCB05;margin-top:8px;">${w.word.toUpperCase()}</div>`,
    });
    recordSpeakingAttempt(tracker, isCorrect);
    updateMiniScore(tracker.displayScore, tracker.total);
    await speakEN(w.word, 0.8);

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
  const { isCorrect } = await recordSpeech({
    container: rootEl,
    instructionKey: "de-repeat-sentence",
    instructionText: "Listen and repeat the sentence!",
    targetText: sentence,
    promptHTML: `<div style="font-size:20px;">${sentence}</div>`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
  await speakEN(sentence, 0.85);
}

async function speakDe_WordFromImage(rootEl, w, tracker) {
  const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
  const { isCorrect } = await recordSpeech({
    container: rootEl,
    instructionKey: "de-word-image",
    instructionText: "Look at the picture and say the word!",
    targetText: w.word,
    promptHTML: `${imgSrc ? `<img src="${imgSrc}" style="height:100px;border-radius:10px;"/>` : ""}`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function speakDe_FallbackPickImage(rootEl, w, poolData, sessionVocab, tracker) {
  const distractorWords = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab });
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
  const { isCorrect } = await recordSpeech({
    container: rootEl,
    instructionKey: "tb-hinted-question",
    instructionText: "Answer the question out loud!",
    targetText: w.answerRaw || w.word,
    matchFn: (heard) => keywords.length ? keywords.some(k => heard.toLowerCase().includes(k)) : defaultMatch(heard, w.word),
    promptHTML: `
      <div style="font-size:19px;">${w.question || `Tell me about "${w.word}".`}</div>
      <div style="font-size:13px;color:#aaa;margin-top:6px;">💡 Hint: <u>${hintWord}</u></div>`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function speakTB_ScriptQA(rootEl, w, tracker) {
  const script = `${w.question || ""} ${w.answerRaw || ""}`.trim();
  const { isCorrect } = await recordSpeech({
    container: rootEl,
    instructionKey: "tb-script-qa",
    instructionText: "Read this short script out loud!",
    targetText: script,
    matchFn: (heard) => checkPercentMatch(heard, script, 50),
    promptHTML: `
      <div style="background:#333;color:#fff;padding:14px;border-radius:10px;text-align:left;line-height:1.6;">
        <div>Q: ${w.question || ""}</div><div>A: ${w.answerRaw || ""}</div>
      </div>`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
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
  const { isCorrect } = await recordSpeech({
    container: rootEl,
    instructionKey: "kho-free-comm",
    instructionText: "Answer freely — there's no hint this time!",
    targetText: w.answerRaw || w.word,
    matchFn: (heard) => keywords.length ? keywords.some(k => heard.toLowerCase().includes(k)) : defaultMatch(heard, w.word),
    promptHTML: `<div style="font-size:19px;">${w.question || `What do you know about "${w.word}"?`}</div>`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
}

async function speakKho_LongStrict(rootEl, w, tracker) {
  const longText = w.presentSent && w.presentSent.length > (w.question || "").length + (w.answerRaw || "").length
    ? w.presentSent
    : `${w.question || ""} ${w.answerRaw || ""}`.trim() || w.word;
  const { isCorrect } = await recordSpeech({
    container: rootEl,
    instructionKey: "kho-long-strict",
    instructionText: "Say this out loud as accurately as you can!",
    targetText: longText,
    matchFn: (heard) => checkPercentMatch(heard, longText, 70),
    promptHTML: `<div style="font-size:18px;background:#333;color:#fff;padding:14px;border-radius:10px;">${longText}</div>`,
  });
  recordSpeakingAttempt(tracker, isCorrect);
  updateMiniScore(tracker.displayScore, tracker.total);
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
  let micMode = await isMicrophoneAvailable();
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
        if (variant === "A") { await speakDe_RepeatSentence(rootEl, w, tracker); }
        else { await speakDe_WordFromImage(rootEl, w, tracker); }
      } else if (level === LEVELS.TRUNG_BINH) {
        if (variant === "A") { await speakTB_HintedQuestion(rootEl, w, tracker); }
        else { await speakTB_ScriptQA(rootEl, w, tracker); }
      } else {
        if (variant === "A") { await speakKho_FreeCommunication(rootEl, w, tracker); }
        else { await speakKho_LongStrict(rootEl, w, tracker); }
      }

      // Các hàm speak*() ở trên không trả technicalFail ra ngoài (để giữ chữ ký gọn),
      // nên ta dùng lại recordSpeech trực tiếp ở đây CHỈ để bắt lỗi kỹ thuật cho lần
      // ghi âm vừa rồi là không khả thi retroactively — thay vào đó, module dùng
      // isMicrophoneAvailable() lại định kỳ mỗi 3 từ để phát hiện mic rớt kết nối.
      if (sessionVocab.indexOf(w) % 3 === 2) {
        const stillOk = await isMicrophoneAvailable();
        if (!stillOk) {
          const stillWorks = await askIfMicWorking();
          if (!stillWorks) setMicMode(false);
        }
      }
    }
  }

  saveSpeakingResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Great speaking!", "Your English is getting better and better!");
}
