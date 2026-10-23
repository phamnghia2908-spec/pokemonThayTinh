/**
 * ============================================================================
 * module-4-reading.js — MODULE 4: ĐỌC
 * ============================================================================
 * Không có mascot. Đây là module HOÀN TOÀN MỚI (chưa tồn tại trong hệ thống
 * cũ) nên điểm được lưu vào key mới result_reading (xem saveReadingResult
 * trong all-shared.js). Nếu bạn có summary.html, cần thêm đoạn đọc key này
 * để hiển thị điểm Đọc.
 *
 * Nguyên tắc riêng của Đọc: học sinh phải ĐỌC CHỮ trước, không được nghe đọc
 * sẵn nội dung câu hỏi/đoạn văn (khác với module Nghe). Chỉ khi CHẠM vào một
 * đáp án thì mới phát âm đáp án đó (tăng tiếp xúc tiếng Anh mà không biến
 * bài Đọc thành bài Nghe trá hình).
 *
 * Luồng theo cấp độ:
 *  - Mầm non: 🎴 Túi mù — lật thẻ tìm 2 ảnh giống nhau của cùng 1 từ
 *  - Dễ:      A) Đọc chữ -> ghép đúng hình / B) Câu 1 dòng đúng/sai kèm hình
 *  - TB:      A) Đọc đoạn 3-4 câu -> chọn đáp án / B) Sắp xếp câu (chạm theo thứ tự)
 *  - Khó:     A) Đọc đoạn dài hơn -> 2 câu hỏi nối tiếp / B) Suy luận nghĩa qua ngữ cảnh
 * ============================================================================
 */

import {
  LEVELS, speakEN, speakInstructionOnce, askMCQ,
  buildDistractors, shuffle, randomPick, createScoreTracker,
  recordQuestionPassed, saveReadingResult, showTransition, updateMiniScore,
  getImageFromMap, injectSharedStyles, makeAttemptTracker, shouldRevealAnswer,
  goToNextAttempt, POSITIVE_FEEDBACK, ENCOURAGE_RETRY,
} from "./all-shared.js";

// ============================================================================
// HELPER RIÊNG: ghép đoạn văn — đảm bảo mỗi câu kết thúc bằng dấu chấm, và câu
// nhiễu được ĐA DẠNG HOÁ THEO BÀI thay vì random thuần trên poolData.
// ============================================================================

/** Thêm dấu . cuối câu nếu câu chưa tự có dấu kết (., !, ?). */
function ensureDot(text) {
  if (!text) return "";
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : t + ".";
}

/**
 * Chọn `count` câu nhiễu cho đoạn văn, đúng quy tắc:
 * - Không lấy trùng câu của chính đáp án đúng (so theo nội dung, đề phòng
 *   trường hợp cùng 1 câu xuất hiện ở nhiều dòng dữ liệu).
 * - Tối đa 1 câu được lấy CÙNG BÀI (lessonId) với đáp án đúng.
 * - Các câu còn lại: MỖI CÂU PHẢI THUỘC 1 BÀI KHÁC NHAU (không trùng bài đáp
 *   án đúng, không trùng bài lẫn nhau) — nếu không đủ bài khác nhau thì mới
 *   vét thêm (chấp nhận trùng bài) để đủ số lượng.
 * @param {object} target - item chứa đáp án đúng (cần lessonId + presentSent)
 * @param {array}  pool   - poolData để rút câu nhiễu
 * @param {number} count  - tổng số câu nhiễu cần (không tính câu đáp án đúng)
 * @returns {string[]} danh sách câu nhiễu (chưa gắn dấu chấm)
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

  // 1. Tối đa 1 câu cùng bài với đáp án đúng
  if (sameLesson.length) tryAdd(sameLesson[0]);

  // 2. Mỗi câu còn lại thuộc 1 bài KHÁC NHAU (chưa từng dùng)
  for (const item of otherLesson) {
    if (picked.length >= count) break;
    if (usedLessonIds.has(item.lessonId)) continue;
    if (tryAdd(item)) usedLessonIds.add(item.lessonId);
  }

  // 3. Không đủ bài khác nhau (dữ liệu ít) -> vét thêm, chấp nhận trùng bài
  if (picked.length < count) {
    for (const item of [...otherLesson, ...sameLesson.slice(1)]) {
      if (picked.length >= count) break;
      tryAdd(item);
    }
  }

  return picked.slice(0, count);
}

// ============================================================================
// STYLE RIÊNG CỦA MODULE 4
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
    .pkl-arrange-bank { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
    .pkl-arrange-chip {
      padding:8px 14px; border-radius:16px; border:2px solid #ff9800; background:rgba(255,152,0,.15);
      color:#ffd54f; cursor:pointer; font-weight:600; transition:opacity .2s;
    }
    .pkl-arrange-chip.used { opacity:.3; pointer-events:none; }
    .pkl-tf-options { display:flex; gap:14px; justify-content:center; }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// MẦM NON — 🎴 Túi mù (memory match)
// ============================================================================

async function readMamNon_MemoryMatch(rootEl, sessionVocab, tracker) {
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
  await speakInstructionOnce("mamnon-memory", "Tap the cards to find two matching pictures!");

  return new Promise(resolve => {
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
// DỄ — A: Đọc chữ -> ghép đúng hình
// ============================================================================

async function readDe_WordToImage(rootEl, sessionVocab, poolData, tracker) {
  for (const w of sessionVocab) {
    const distractorWords = buildDistractors(w, poolData, { field: "word", count: 3, extra: sessionVocab, preferSameLesson: true });
    const options = shuffle([w.word, ...distractorWords]).map(val => {
      const found = [w, ...poolData, ...sessionVocab].find(p => p.word === val) || w;
      return { label: "", value: val, imageUrl: getImageFromMap(found.imageKeyword || val) || "" };
    });
    const attempts = await askMCQ({
      container: rootEl,
      instructionKey: "de-word-to-image",
      instructionText: "Read the word, then tap the matching picture!",
      questionHTML: `<div style="font-size:30px;font-weight:800;color:#FFCB05;">${w.word.toUpperCase()}</div>`,
      options, correctValue: w.word,
      // Không đọc trước từ mục tiêu — bắt học sinh ĐỌC, chỉ đọc lại đáp án khi họ chạm vào
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// DỄ — B: Câu 1 dòng đúng/sai kèm hình
// ============================================================================

async function readDe_TrueFalse(rootEl, sessionVocab, poolData, tracker) {
  for (const w of sessionVocab) {
    const imgSrc = getImageFromMap(w.imageKeyword || w.word) || "";
    const isTrueStatement = Math.random() < 0.5;
    let statementWord = w.word;
    if (!isTrueStatement) {
      const wrongOnes = buildDistractors(w, poolData, { field: "word", count: 1, extra: sessionVocab });
      statementWord = wrongOnes[0] || w.word;
    }
    const correctValue = isTrueStatement ? "true" : "false";

    const attempts = await askMCQ({
      container: rootEl,
      instructionKey: "de-true-false",
      instructionText: "Read the sentence. Is it True or False?",
      questionHTML: `
        ${imgSrc ? `<img src="${imgSrc}" style="height:90px;border-radius:10px;"/><br/>` : ""}
        <div style="font-size:18px;margin-top:8px;">This is a <b>${statementWord}</b>.</div>`,
      options: [
        { label: "✅ True", value: "true" },
        { label: "❌ False", value: "false" },
      ],
      correctValue,
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// TRUNG BÌNH — A: Đọc đoạn 3-4 câu -> chọn đáp án
// ============================================================================

async function readTB_ParagraphChoose(rootEl, sessionVocab, poolData, tracker) {
  const usable = sessionVocab.filter(w => w.question && w.answerRaw);
  const list = usable.length ? usable : sessionVocab;

  for (const w of list) {
    const fillerSentences = pickDiverseFillerSentences(w, poolData, 2);
    const paragraph = shuffle([ensureDot(w.presentSent || w.question), ...fillerSentences.map(ensureDot)]).join(" ");
    const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });

    await speakInstructionOnce("tb-paragraph-choose", "Read the paragraph carefully, then answer the question!");
    const attempts = await askMCQ({
      container: rootEl,
      instructionKey: "tb-paragraph-choose", // đã đọc ở trên rồi, Set sẽ tự bỏ qua
      instructionText: "Read the paragraph carefully, then answer the question!",
      questionHTML: `
        <div style="background:#fff;color:#333;border-radius:12px;padding:14px;text-align:left;font-size:15px;line-height:1.6;margin-bottom:10px;">
          ${paragraph}
        </div>
        <div style="font-size:16px;color:#ffd54f;">❓ ${w.question}</div>`,
      options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
      correctValue: w.answerRaw,
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// TRUNG BÌNH — B: Sắp xếp câu (chạm chip theo đúng thứ tự)
// ============================================================================

function normSentenceLocal(s) {
  return (s || "").toLowerCase().replace(/[.,;'!?]/g, "").replace(/\s+/g, " ").trim();
}

function arrangeSentenceQuestion(rootEl, sentenceText, instructionKey) {
  const tokens = sentenceText.replace(/[.,;!?]/g, "").trim().split(/\s+/).filter(Boolean);
  const tracker = makeAttemptTracker();

  return new Promise(resolve => {
    const render = async () => {
      const reveal = shouldRevealAnswer(tracker);
      const displayTokens = reveal ? tokens : shuffle(tokens);
      rootEl.innerHTML = `
        <div style="text-align:center;color:#aaa;font-size:13px;margin-bottom:10px;">Tap the words in the correct order</div>
        <div class="pkl-arrange-bank" id="pklArrBank"></div>
        <div style="margin:14px 0;font-size:18px;text-align:center;color:#ffd54f;min-height:26px;" id="pklArrBuild"></div>
        <div style="text-align:center;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="poke-btn gray" id="pklArrUndo">↩️ Undo</button>
          <button class="poke-btn yellow" id="pklArrCheck">✅ Check</button>
        </div>
        <div class="pkl-mcq-feedback" id="pklArrFeedback"></div>
      `;
      const bank = document.getElementById("pklArrBank");
      const buildEl = document.getElementById("pklArrBuild");
      const picked = [];

      displayTokens.forEach(tok => {
        const chip = document.createElement("button");
        chip.className = "pkl-arrange-chip";
        chip.textContent = tok;
        chip.onclick = () => {
          if (chip.classList.contains("used")) return;
          picked.push(tok);
          chip.classList.add("used");
          buildEl.textContent = picked.join(" ");
          speakEN(tok, 0.7);
        };
        bank.appendChild(chip);
      });

      document.getElementById("pklArrUndo").onclick = () => {
        if (!picked.length) return;
        const last = picked.pop();
        const chips = bank.querySelectorAll(".pkl-arrange-chip.used");
        for (const c of chips) { if (c.textContent === last) { c.classList.remove("used"); break; } }
        buildEl.textContent = picked.join(" ");
      };

      document.getElementById("pklArrCheck").onclick = async () => {
        const user = normSentenceLocal(picked.join(" "));
        const ans = normSentenceLocal(sentenceText);
        const feedback = document.getElementById("pklArrFeedback");
        if (!user) { feedback.textContent = "⚠️ Tap some words first!"; feedback.style.color = "#ffd54f"; return; }
        if (user === ans) {
          feedback.textContent = "🎉 " + randomPick(POSITIVE_FEEDBACK);
          feedback.style.color = "#69f0ae";
          const attemptsUsed = tracker.attempt;
          await new Promise(r => setTimeout(r, 1200));
          resolve(attemptsUsed);
        } else {
          feedback.innerHTML = "💡 " + randomPick(ENCOURAGE_RETRY) + ` (Answer: <b>${sentenceText}</b>)`;
          feedback.style.color = "#ffd54f";
          const retryBtn = document.createElement("button");
          retryBtn.className = "poke-btn yellow";
          retryBtn.style.marginTop = "10px";
          retryBtn.textContent = "🔄 Try again";
          retryBtn.onclick = () => { goToNextAttempt(tracker); render(); };
          feedback.after(retryBtn);
        }
      };

      await speakInstructionOnce(instructionKey, "Tap the words to put the sentence in the correct order!");
    };
    render();
  });
}

async function readTB_ArrangeSentence(rootEl, sessionVocab, tracker) {
  const usable = sessionVocab.filter(w => w.answerRaw || w.presentSent);
  const list = usable.length ? usable : sessionVocab;
  for (const w of list) {
    const sentence = w.answerRaw || w.presentSent || `I like the ${w.word}.`;
    const attempts = await arrangeSentenceQuestion(rootEl, sentence, "tb-arrange-sentence");
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// KHÓ — A: Đọc đoạn dài hơn (5-6 câu) -> 2 câu hỏi nối tiếp
// ============================================================================

async function readKho_LongParagraphTwoQuestions(rootEl, sessionVocab, poolData, tracker) {
  const usable = sessionVocab.filter(w => w.question && w.answerRaw);
  if (usable.length < 2) {
    // Không đủ dữ liệu 2 câu hỏi -> rơi về dạng TB A cho an toàn
    await readTB_ParagraphChoose(rootEl, sessionVocab, poolData, tracker);
    return;
  }

  // Ghép mỗi 2 từ liền nhau thành 1 đoạn văn dài + 2 câu hỏi liên tiếp
  for (let i = 0; i < usable.length - 1; i += 2) {
    const w1 = usable[i], w2 = usable[i + 1];
    // Chia đôi số câu nhiễu cho w1/w2 để tránh trùng lặp bài giữa 2 lượt gọi,
    // rồi loại các bài đã dùng của phía kia khỏi phía còn lại.
    const fillersFor1 = pickDiverseFillerSentences(w1, poolData.filter(p => p.lessonId !== w2.lessonId), 1);
    const fillersFor2 = pickDiverseFillerSentences(w2, poolData.filter(p => p.lessonId !== w1.lessonId), 1);
    const paragraph = shuffle([
      ensureDot(w1.presentSent || w1.question),
      ensureDot(w2.presentSent || w2.question),
      ...fillersFor1.map(ensureDot),
      ...fillersFor2.map(ensureDot),
    ]).join(" ");

    await speakInstructionOnce("kho-long-paragraph", "Read this longer paragraph, then answer both questions!");

    for (const w of [w1, w2]) {
      const distractors = buildDistractors(w, poolData, { field: "answerRaw", count: 3, extra: sessionVocab });
      const attempts = await askMCQ({
        container: rootEl,
        instructionKey: "kho-long-paragraph",
        instructionText: "Read this longer paragraph, then answer both questions!",
        questionHTML: `
          <div style="background:#fff;color:#333;border-radius:12px;padding:14px;text-align:left;font-size:15px;line-height:1.6;margin-bottom:10px;">
            ${paragraph}
          </div>
          <div style="font-size:16px;color:#ffd54f;">❓ ${w.question}</div>`,
        options: shuffle([w.answerRaw, ...distractors]).map(v => ({ label: v, value: v })),
        correctValue: w.answerRaw,
      });
      recordQuestionPassed(tracker, attempts);
      updateMiniScore(tracker.displayScore, tracker.total);
    }
  }
}

// ============================================================================
// KHÓ — B: Suy luận nghĩa từ qua ngữ cảnh (không hình gợi ý)
// ============================================================================

async function readKho_InferMeaning(rootEl, sessionVocab, poolData, tracker) {
  for (const w of sessionVocab) {
    const sentence = w.presentSent || w.noteAH || w.noteAI || `The ${w.word} is important here.`;
    const distractors = buildDistractors(w, poolData, { field: "meaning", count: 3, extra: sessionVocab });
    const attempts = await askMCQ({
      container: rootEl,
      instructionKey: "kho-infer-meaning",
      instructionText: "Read the sentence and figure out what the word means — no picture this time!",
      questionHTML: `<div style="font-size:17px;">📖 ${sentence}</div>`,
      options: shuffle([w.meaning, ...distractors]).map(v => ({ label: v, value: v })),
      correctValue: w.meaning,
    });
    recordQuestionPassed(tracker, attempts);
    updateMiniScore(tracker.displayScore, tracker.total);
  }
}

// ============================================================================
// HÀM CHÍNH — export để orchestrator gọi
// ============================================================================

export async function runReadingModule(ctx) {
  const { sessionVocab, poolData, level, rootEl } = ctx;
  injectSharedStyles();
  injectModule4Styles();
  await showTransition("📖", "Reading Time!", "Let's read some English!");

  const tracker = createScoreTracker();

  if (level === LEVELS.MAM_NON) {
    await readMamNon_MemoryMatch(rootEl, sessionVocab, tracker);
  } else if (level === LEVELS.DE) {
    const candidates = [
      () => readDe_WordToImage(rootEl, sessionVocab, poolData, tracker),
      () => readDe_TrueFalse(rootEl, sessionVocab, poolData, tracker),
    ];
    await randomPick(candidates)();
  } else if (level === LEVELS.TRUNG_BINH) {
    const candidates = [
      () => readTB_ParagraphChoose(rootEl, sessionVocab, poolData, tracker),
      () => readTB_ArrangeSentence(rootEl, sessionVocab, tracker),
    ];
    await randomPick(candidates)();
  } else if (level === LEVELS.KHO) {
    const candidates = [
      () => readKho_LongParagraphTwoQuestions(rootEl, sessionVocab, poolData, tracker),
      () => readKho_InferMeaning(rootEl, sessionVocab, poolData, tracker),
    ];
    await randomPick(candidates)();
  }

  saveReadingResult(tracker.assessScore, tracker.total);
  await showTransition("🎉", "Great reading!", "You're becoming a great reader!");
}