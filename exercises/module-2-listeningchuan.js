/**
 * ============================================================================
 * module-2-listening.js — MODULE 2: NGHE
 * ============================================================================
 * Không có mascot (mascot chỉ ở Module 1). Sửa gì trong module này thì chỉ
 * sửa file này, không ảnh hưởng module khác.
 *
 * Luồng theo cấp độ:
 *  - Mầm non: A) Nghe từ đơn -> chạm đúng hình (4 hình, cố định, không random)
 *             B) Nghe cả câu thuyết trình (cột I / presentSent) -> vẫn chạm
 *                đúng hình như dạng A (MỚI)
 *             Cả 2 dạng đều có nút "Nghe lại" không giới hạn số lần.
 *  - Dễ:      A) Nghe Q&A điền 1 từ (có ảnh gợi ý) / B) Nghe -> chọn câu đúng
 *  - TB:      A) Nghe đoạn nhiều câu điền từng chỗ trống / B) Nghe đoạn dài chọn đáp án
 *  - Khó:     A) Hội thoại dài trả lời suy luận / B) Nghe đoạn nhiễu, giới hạn nghe lại
 *
 * LƯU Ý QUAN TRỌNG VỀ GIAO DIỆN: các dạng Dễ-A, TB-A, TB-B, Khó-A, Khó-B đều
 * dùng chung 1 MÀN HÌNH DUY NHẤT (nội dung minh hoạ + nút "Nghe lại" + phần trả
 * lời hiện CÙNG LÚC), thay vì tách 2 màn hình như bản cũ (màn 1 hiện ảnh/đoạn
 * văn + nút nghe lại, sau đó bị ghi đè mất bởi màn 2 là ô nhập/trắc nghiệm).
 * Việc này giải quyết đúng lỗi "không kịp bấm nút nghe lại".
 * ============================================================================
 */

import {
  LEVELS, speakEN, speakInstructionOnce, askMCQ,
  buildDistractors, shuffle, randomPick, createScoreTracker,
  recordQuestionPassed, saveListeningResult, showTransition, updateMiniScore,
  getImageFromMap, injectSharedStyles, escapeRegExp,
  makeAttemptTracker, shouldRevealAnswer, goToNextAttempt,
  POSITIVE_FEEDBACK, ENCOURAGE_RETRY,
} from "./all-shared.js";

// ============================================================================
// HELPER RIÊNG CỦA MODULE 2
// ============================================================================

// Thay từ mục tiêu bằng "___" trong 1 câu (word-boundary, không phân biệt hoa/thường)
function blankOut(sentence, target) {
  if (!sentence || !target) return sentence || "";
  const re = new RegExp(`\\b${escapeRegExp(target)}\\b`, "gi");
  return sentence.replace(re, "___");
}

// ============================================================================
// HELPER RIÊNG: ghép đoạn văn — đảm bảo mỗi câu kết thúc bằng đúng 1 dấu chấm
// (không bị dính liền, không bị lặp dấu ".."), và câu nhiễu được ĐA DẠNG HOÁ
// THEO BÀI thay vì random thuần trên poolData (giống fix đã áp dụng ở module 4).
// ============================================================================

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
// HELPER MỚI: nút "Nghe lại" nhúng NGAY TRONG questionHTML của askMCQ (Mầm non)
// askMCQ ghi đè toàn bộ innerHTML mỗi lần render/retry, nên không thể gắn thêm
// nút SAU khi gọi — phải nhúng nút ngay trong questionHTML, dùng window.fnName
// để gắn onclick (mỗi lần gọi tạo 1 tên hàm riêng, tránh đụng nhau giữa các câu).
// ============================================================================
let _pklMamNonReplayCounter = 0;
function buildMamNonQuestionHTML(promptText, rate = 0.85) {
  _pklMamNonReplayCounter++;
  const fnName = `__pklMamNonReplay_${_pklMamNonReplayCounter}`;
  window[fnName] = () => speakEN(promptText, rate);
  return `
    <div style="font-size:44px;">🎧</div>
    <button class="poke-btn blue" style="margin-top:10px;" onclick="window.${fnName}()">🔊 Nghe lại</button>
  `;
}

// ============================================================================
// HELPER MỚI: GỘP 1 MÀN HÌNH — nội dung minh hoạ (câu/đoạn văn/hội thoại) +
// nút "Nghe lại" (có thể giới hạn số lần) + Ô NHẬP đáp án, hiện CÙNG LÚC ngay
// từ đầu. Thay thế cho việc gọi renderLimitedReplay() rồi askTypedAnswer() nối
// tiếp (2 màn hình, màn 1 bị askTypedAnswer ghi đè mất).
// ============================================================================
function askTypedAnswerWithReplay(cfg) {
  const {
    container, instructionKey, instructionText, contentHTML,
    replayText, maxReplay = Infinity, correctValue, placeholder = "Type here...",
  } = cfg;
  const norm = s => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
  const tracker = makeAttemptTracker();
  let replayUsed = 0;
  let autoPlayed = false;

  return new Promise(resolve => {
    const render = async () => {
      const reveal = shouldRevealAnswer(tracker);
      const hasLimit = maxReplay !== Infinity;
      const replayLeft = maxReplay - replayUsed;
      const replayLabel = !hasLimit
        ? "🔊 Nghe lại"
        : (replayLeft > 0 ? `🔊 Nghe lại (${replayLeft} lần)` : "🔊 Hết lượt nghe lại");

      container.innerHTML = `
        <div class="pkl-mcq-question">${contentHTML}</div>
        <div style="text-align:center;margin:10px 0;">
          <button class="poke-btn blue" id="pklListenReplayBtn" ${hasLimit && replayLeft <= 0 ? "disabled" : ""}>${replayLabel}</button>
        </div>
        <div style="text-align:center;margin:14px 0;">
          <input type="text" id="pklTypedInput" class="pkl-typed-input" placeholder="${placeholder}"
            value="${reveal ? correctValue : ""}" autocomplete="off"/>
        </div>
        <div style="text-align:center;">
          <button class="poke-btn yellow" id="pklTypedSubmit">✅ Check</button>
        </div>
        <div class="pkl-mcq-feedback" id="pklTypedFeedback"></div>
      `;

      const input = container.querySelector("#pklTypedInput");
      const submitBtn = container.querySelector("#pklTypedSubmit");
      const feedback = container.querySelector("#pklTypedFeedback");
      const replayBtn = container.querySelector("#pklListenReplayBtn");
      input.focus();
      if (reveal) input.select();
      input.onkeydown = e => { if (e.key === "Enter") submitBtn.click(); };

      replayBtn.onclick = async () => {
        if (hasLimit && replayUsed >= maxReplay) return;
        replayUsed++;
        replayBtn.disabled = true;
        replayBtn.textContent = "🔊 ...";
        await speakEN(replayText, 0.9);
        const left = maxReplay - replayUsed;
        if (!hasLimit) { replayBtn.disabled = false; replayBtn.textContent = "🔊 Nghe lại"; }
        else if (left > 0) { replayBtn.disabled = false; replayBtn.textContent = `🔊 Nghe lại (${left} lần)`; }
        else { replayBtn.disabled = true; replayBtn.textContent = "🔊 Hết lượt nghe lại"; }
      };

      submitBtn.onclick = async () => {
        if (container.dataset.locked === "1") return;
        container.dataset.locked = "1";
        submitBtn.disabled = true; input.disabled = true; replayBtn.disabled = true;

        const userVal = input.value;
        if (userVal.trim()) await speakEN(userVal, 1);

        const isCorrect = norm(userVal) === norm(correctValue);
        if (isCorrect) {
          input.classList.add("pkl-reveal");
          feedback.textContent = "🎉 " + randomPick(POSITIVE_FEEDBACK);
          feedback.style.color = "#69f0ae";
          const attemptsUsed = tracker.attempt;
          await new Promise(r => setTimeout(r, 1200));
          resolve(attemptsUsed);
        } else {
          feedback.innerHTML = "💡 " + randomPick(ENCOURAGE_RETRY) + ` (Answer: <b>${correctValue}</b>)`;
          feedback.style.color = "#ffd54f";
          const retryBtn = document.createElement("button");
          retryBtn.className = "poke-btn yellow";
          retryBtn.style.marginTop = "10px";
          retryBtn.textContent = "🔄 Try again";
          retryBtn.onclick = () => { goToNextAttempt(tracker); render(); };
          feedback.after(retryBtn);
        }
      };

      container.dataset.locked = "0";
      await speakInstructionOnce(instructionKey, instructionText);
      if (replayText && !autoPlayed) {
        autoPlayed = true;
        await speakEN(replayText, 0.9);
      }
    };
    render();
  });
}

// ============================================================================
// HELPER MỚI: GỘP 1 MÀN HÌNH — giống hệt ý tưởng trên nhưng cho dạng TRẮC
// NGHIỆM (dùng ở TB-B, Khó-A, Khó-B). Nội dung minh hoạ + nút "Nghe lại" +
// các lựa chọn hiện CÙNG LÚC ngay từ đầu.
// ============================================================================
function askMCQWithReplay(cfg) {
  const {
    container, instructionKey, instructionText, contentHTML,
    replayText, maxReplay = Infinity, options, correctValue, rate = 1,
  } = cfg;

  const tracker = makeAttemptTracker();
  const hasImages = options.some(o => o.imageUrl);
  let replayUsed = 0;
  let autoPlayed = false;

  return new Promise(resolve => {
    const render = async () => {
      const reveal = shouldRevealAnswer(tracker);
      const hasLimit = maxReplay !== Infinity;
      const replayLeft = maxReplay - replayUsed;
      const replayLabel = !hasLimit
        ? "🔊 Nghe lại"
        : (replayLeft > 0 ? `🔊 Nghe lại (${replayLeft} lần)` : "🔊 Hết lượt nghe lại");

      container.innerHTML = `
        <div class="pkl-mcq-question">${contentHTML}</div>
        <div style="text-align:center;margin:10px 0 14px;">
          <button class="poke-btn blue" id="pklMcqReplayBtn" ${hasLimit && replayLeft <= 0 ? "disabled" : ""}>${replayLabel}</button>
        </div>
        <div id="pklMcqStage"></div>
        <div class="pkl-mcq-feedback" id="pklMcqFeedback"></div>
      `;
      const stage = container.querySelector("#pklMcqStage");
      const feedback = container.querySelector("#pklMcqFeedback");
      const replayBtn = container.querySelector("#pklMcqReplayBtn");
      let locked = false;

      replayBtn.onclick = async () => {
        if (hasLimit && replayUsed >= maxReplay) return;
        replayUsed++;
        replayBtn.disabled = true;
        replayBtn.textContent = "🔊 ...";
        await speakEN(replayText, rate);
        const left = maxReplay - replayUsed;
        if (!hasLimit) { replayBtn.disabled = false; replayBtn.textContent = "🔊 Nghe lại"; }
        else if (left > 0) { replayBtn.disabled = false; replayBtn.textContent = `🔊 Nghe lại (${left} lần)`; }
        else { replayBtn.disabled = true; replayBtn.textContent = "🔊 Hết lượt nghe lại"; }
      };

      // ─── Xử lý 1 lượt chọn đáp án — dùng chung cho cả nút bấm thường lẫn
      // minigame, y hệt cách askMCQ() trong all-shared.js làm.
      const handlePick = async (value, pickedEl) => {
        if (locked) return;
        locked = true;
        replayBtn.disabled = true;

        const isCorrect = value === correctValue;
        if (isCorrect) {
          pickedEl?.classList.add("pkl-correct-flash", "pkl-reveal");
          feedback.textContent = "🎉 " + randomPick(POSITIVE_FEEDBACK);
          feedback.style.color = "#69f0ae";
          const attemptsUsed = tracker.attempt;
          await new Promise(r => setTimeout(r, 1200));
          resolve(attemptsUsed);
        } else {
          pickedEl?.classList.add("pkl-wrong-flash");
          feedback.textContent = "💡 " + randomPick(ENCOURAGE_RETRY);
          feedback.style.color = "#ffd54f";
          const retryBtn = document.createElement("button");
          retryBtn.className = "poke-btn yellow";
          retryBtn.style.marginTop = "10px";
          retryBtn.textContent = "🔄 Try again";
          retryBtn.onclick = () => { goToNextAttempt(tracker); render(); };
          feedback.after(retryBtn);
        }
      };

      const useMinigame = !!(
        window.PkmMinigameRouter && window.PkmMinigameRouter.hasSupportedGame(options)
      );

      if (useMinigame) {
        window.PkmMinigameRouter.play({
          stage, options, correctValue, reveal, hasImages,
          onAnswer: (value, el) => handlePick(value, el),
        });
      } else {
        const optWrap = document.createElement("div");
        optWrap.className = "pkl-mcq-options " + (hasImages ? "pkl-img-mode" : "");
        optWrap.id = "pklMcqOptions";
        stage.appendChild(optWrap);

        options.forEach(opt => {
          const btn = document.createElement(opt.imageUrl ? "div" : "button");
          btn.className = "pkl-mcq-btn" + (opt.imageUrl ? " pkl-mcq-img" : "");
          btn.dataset.value = opt.value;
          btn.innerHTML = opt.imageUrl
            ? `<div class="img-wrap">
                 <img src="${opt.imageUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/>
                 <div class="img-fallback" style="display:none;">🖼️</div>
               </div>
               <div class="lbl">${opt.label}</div>`
            : `<span>${opt.label}</span>`;
          if (reveal && opt.value === correctValue) btn.classList.add("pkl-reveal");

          btn.onclick = () => {
            optWrap.querySelectorAll(".pkl-mcq-btn").forEach(b => b.classList.add("pkl-locked"));
            handlePick(opt.value, btn);
          };
          optWrap.appendChild(btn);
        });
      }
      await speakInstructionOnce(instructionKey, instructionText);
      if (replayText && !autoPlayed) {
        autoPlayed = true;
        await speakEN(replayText, rate);
      }
    };
    render();
  });
}

// ============================================================================
// MẦM NON — A: nghe TỪ ĐƠN, chạm đúng hình (cố định, không random)
// ============================================================================

async function listenMamNon_Word(rootEl, sessionVocab, poolData, tracker) {
  for (const w of sessionVocab) {
    const distractorWords = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab, preferSameLesson: true });
    const options = shuffle([w.word, ...distractorWords]).map(val => {
      const found = [w, ...poolData, ...sessionVocab].find(p => p.word === val) || w;
      return { label: "", value: val, imageUrl: getImageFromMap(found.imageKeyword || val) || "" };
    });
    const attempts = await askMCQ({
      container: rootEl,
      instructionKey: "listen-mamnon",
      instructionText: "Listen carefully and tap the correct picture!",
      questionHTML: buildMamNonQuestionHTML(w.word, 0.85),
      options, correctValue: w.word,
      speakPromptText: w.word,
      rate: 0.85,
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// MẦM NON — B (MỚI): nghe CẢ CÂU THUYẾT TRÌNH (cột I / presentSent), vẫn chạm
// đúng hình giống hệt cơ chế của dạng A, chỉ khác nội dung đọc lên là cả câu
// thay vì chỉ 1 từ.
// ============================================================================

async function listenMamNon_Sentence(rootEl, sessionVocab, poolData, tracker) {
  for (const w of sessionVocab) {
    const sentence = w.presentSent || w.word;
    const distractorWords = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab, preferSameLesson: true });
    const options = shuffle([w.word, ...distractorWords]).map(val => {
      const found = [w, ...poolData, ...sessionVocab].find(p => p.word === val) || w;
      return { label: "", value: val, imageUrl: getImageFromMap(found.imageKeyword || val) || "" };
    });
    const attempts = await askMCQ({
      container: rootEl,
      instructionKey: "listen-mamnon-sentence",
      instructionText: "Listen to the sentence, then tap the correct picture!",
      questionHTML: buildMamNonQuestionHTML(sentence, 0.8),
      options, correctValue: w.word,
      speakPromptText: sentence,
      rate: 0.8,
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// DỄ — A: Nghe Q&A điền 1 từ (có ảnh gợi ý) — GỘP 1 MÀN HÌNH, nghe lại KHÔNG
// giới hạn số lần (giữ đúng ý cũ "Dễ: không giới hạn nghe lại")
// ============================================================================

async function listenDe_FillBlank(rootEl, sessionVocab, tracker) {
  const withQA = sessionVocab.filter(w => w.question && w.answerRaw);
  const list = withQA.length ? withQA : sessionVocab;
  for (const w of list) {
    const q = w.question || `I have a ${w.word}.`;
    const a = w.answerRaw || w.meaning;
    const displayQ = blankOut(q, w.word);
    const displayA = blankOut(a, w.word);
    const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";

    const contentHTML = `
      <div class="dialogue-box" style="background:rgba(93,171,70,.15);border:2px solid #ffd54f;border-radius:14px;padding:16px;text-align:center;">
        ${imgSrc ? `<img src="${imgSrc}" style="height:70px;border-radius:8px;margin-bottom:8px;"/><br/>` : ""}
        <div style="font-size:18px;color:#fff;">🗣 ${displayQ}</div>
        <div style="font-size:18px;color:#ffd700;margin-top:6px;">🗣 ${displayA}</div>
      </div>`;

    const attempts = await askTypedAnswerWithReplay({
      container: rootEl,
      instructionKey: "de-fill-blank",
      instructionText: "Listen and type the missing word!",
      contentHTML,
      replayText: `${q}. ${a}`,
      maxReplay: Infinity, // Dễ: không giới hạn nghe lại
      correctValue: w.word,
      placeholder: "Missing word...",
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// DỄ — B: Nghe -> chọn câu đúng (4 lựa chọn) — giữ nguyên, vốn đã là 1 màn hình
// ============================================================================

async function listenDe_ChooseSentence(rootEl, sessionVocab, poolData, tracker) {
  for (const w of sessionVocab) {
    const targetSentence = w.presentSent || w.question || `This is a ${w.word}.`;
    const distractors = buildDistractors({ ...w, presentSent: targetSentence }, poolData, { field: "presentSent", count: 3 });
    const finalOptions = distractors.length >= 3 ? distractors
      : buildDistractors(w, poolData, { field: "question", count: 3, extra: sessionVocab });

    const attempts = await askMCQ({
      container: rootEl,
      instructionKey: "de-choose-sentence",
      instructionText: "Listen carefully, then choose the sentence you heard!",
      questionHTML: `<div style="font-size:36px;">🔊</div>`,
      options: shuffle([targetSentence, ...finalOptions]).map(v => ({ label: v, value: v })),
      correctValue: targetSentence,
      speakPromptText: targetSentence,
      rate: 0.9,
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// TRUNG BÌNH — A: Nghe đoạn nhiều câu, điền từng chỗ trống — GỘP 1 MÀN HÌNH,
// giới hạn nghe lại 3 lần
// ============================================================================

async function listenTB_FillParagraph(rootEl, sessionVocab, poolData, tracker) {
  const usable = sessionVocab.filter(w => w.presentSent);
  const list = usable.length ? usable : sessionVocab;

  for (const w of list) {
    const sentence = w.presentSent || `I like the ${w.word}.`;
    // Loại các câu thuộc chính buổi học này (list) ra khỏi pool nhiễu, để không
    // vô tình lộ đáp án của 1 câu hỏi KHÁC trong cùng buổi vào đây làm câu nhiễu.
    const poolExcludingSession = poolData.filter(p => !list.includes(p));
    const fillerSentences = pickDiverseFillerSentences(w, poolExcludingSession, 3);
    const contextSentences = shuffle([sentence, ...fillerSentences]);
    const fullParagraph = contextSentences
      .map(s => ensureDot(s === sentence ? blankOut(s, w.word) : s))
      .join(" ");

    const contentHTML = `
      <div style="background:rgba(255,253,231,.1);border:2px solid #fdd835;border-radius:12px;padding:16px;font-size:17px;text-align:center;">
        ${fullParagraph}
      </div>`;

    const attempts = await askTypedAnswerWithReplay({
      container: rootEl,
      instructionKey: "tb-fill-paragraph",
      instructionText: "Listen to the paragraph and fill in the missing word!",
      contentHTML,
      replayText: contextSentences.map(ensureDot).join(" "),
      maxReplay: 3,
      correctValue: w.word,
      placeholder: "Missing word...",
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// TRUNG BÌNH — B: Nghe đoạn dài, chọn đáp án — GỘP 1 MÀN HÌNH, giới hạn nghe
// lại 3 lần
// ============================================================================

async function listenTB_LongChoose(rootEl, sessionVocab, poolData, tracker) {
  const usable = sessionVocab.filter(w => w.question && w.answerRaw);
  const list = usable.length ? usable : sessionVocab;

  for (const w of list) {
    const fillerSentences = pickDiverseFillerSentences(w, poolData, 3);
    const paragraph = shuffle([w.presentSent || w.question, ...fillerSentences]).map(ensureDot).filter(Boolean).join(" ");
    const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });

    const contentHTML = `
      <div style="background:rgba(255,253,231,.1);border:2px solid #fdd835;border-radius:12px;padding:16px;font-size:16px;text-align:center;">
        ${paragraph}
      </div>
      <div style="text-align:center;margin-top:10px;font-size:16px;color:#ffd54f;">❓ ${w.question}</div>`;

    const attempts = await askMCQWithReplay({
      container: rootEl,
      instructionKey: "tb-long-choose",
      instructionText: "Listen to the paragraph, then answer the question!",
      contentHTML,
      replayText: paragraph,
      maxReplay: 3,
      options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
      correctValue: w.answerRaw,
      rate: 0.9,
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// KHÓ — A: Hội thoại dài, trả lời suy luận — GỘP 1 MÀN HÌNH, giới hạn nghe
// lại chỉ 1 lần
// ============================================================================

async function listenKho_Inference(rootEl, sessionVocab, poolData, tracker) {
  const usable = sessionVocab.filter(w => w.question && w.answerRaw);
  const list = usable.length ? usable : sessionVocab;

  for (const w of list) {
    const dialogue = `${w.question} ${w.answerRaw}`;
    const distractors = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab });

    const contentHTML = `
      <div style="background:rgba(255,253,231,.08);border:2px solid #fdd835;border-radius:12px;padding:16px;font-size:16px;text-align:center;">
        <div>🗣 ${w.question}</div>
        <div style="color:#ffd700;margin-top:6px;">🗣 ${w.answerRaw}</div>
      </div>
      <div style="text-align:center;margin-top:10px;font-size:15px;color:#ccc;">What word are they talking about?</div>`;

    const attempts = await askMCQWithReplay({
      container: rootEl,
      instructionKey: "kho-inference",
      instructionText: "Listen to the conversation, then guess which word they are talking about!",
      contentHTML,
      replayText: dialogue,
      maxReplay: 1, // Khó: giới hạn nghe lại chặt hơn
      options: shuffle([w.word, ...distractors]).map(v => ({ label: v, value: v })),
      correctValue: w.word,
      rate: 0.95,
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// KHÓ — B: Nghe đoạn nhiều nhiễu, giới hạn số lần nghe lại — GỘP 1 MÀN HÌNH,
// giới hạn nghe lại chỉ 1 lần
// ============================================================================

async function listenKho_LimitedReplay(rootEl, sessionVocab, poolData, tracker) {
  const usable = sessionVocab.filter(w => w.question && w.answerRaw);
  const list = usable.length ? usable : sessionVocab;

  for (const w of list) {
    const fillerSentences = pickDiverseFillerSentences(w, poolData, 5);
    const paragraph = shuffle([w.presentSent || w.question, ...fillerSentences]).map(ensureDot).filter(Boolean).join(" ");
    const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });

    const contentHTML = `
      <div style="background:rgba(255,253,231,.08);border:2px solid #fdd835;border-radius:12px;padding:16px;font-size:15px;text-align:center;">
        🔊 (${fillerSentences.length + 1}-sentence paragraph — listen carefully, replay is limited!)
      </div>
      <div style="text-align:center;margin-top:10px;font-size:16px;color:#ffd54f;">❓ ${w.question}</div>`;

    const attempts = await askMCQWithReplay({
      container: rootEl,
      instructionKey: "kho-limited-replay",
      instructionText: "This is a long paragraph. You only get 1 replay, so listen carefully!",
      contentHTML,
      replayText: paragraph,
      maxReplay: 1,
      options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
      correctValue: w.answerRaw,
      rate: 0.95,
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// HÀM CHÍNH — export để orchestrator gọi
// ============================================================================

export async function runListeningModule(ctx) {
  const { sessionVocab, poolData, level, rootEl } = ctx;
  injectSharedStyles();

  await showTransition("🎧", "Listening Time!", "Let's listen carefully!");

  const tracker = createScoreTracker();

  if (level === LEVELS.MAM_NON) {
    const candidates = [
      () => listenMamNon_Word(rootEl, sessionVocab, poolData, tracker),
      () => listenMamNon_Sentence(rootEl, sessionVocab, poolData, tracker),
    ];
    await randomPick(candidates)();
  } else if (level === LEVELS.DE) {
    const candidates = [
      () => listenDe_FillBlank(rootEl, sessionVocab, tracker),
      () => listenDe_ChooseSentence(rootEl, sessionVocab, poolData, tracker),
    ];
    await randomPick(candidates)();
  } else if (level === LEVELS.TRUNG_BINH) {
    const candidates = [
      () => listenTB_FillParagraph(rootEl, sessionVocab, poolData, tracker),
      () => listenTB_LongChoose(rootEl, sessionVocab, poolData, tracker),
    ];
    await randomPick(candidates)();
  } else if (level === LEVELS.KHO) {
    const candidates = [
      () => listenKho_Inference(rootEl, sessionVocab, poolData, tracker),
      () => listenKho_LimitedReplay(rootEl, sessionVocab, poolData, tracker),
    ];
    await randomPick(candidates)();
  }

// mới
  saveListeningResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Great listening!", "You did an amazing job!");
  return { assessScore: tracker.assessScore, assessTotal: tracker.total };
}