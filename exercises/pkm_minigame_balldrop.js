/**
 * ============================================================================
 * pkm_minigame_balldrop.js — MINIGAME THẢ BÓNG ĐÚNG LY (category "quickCheck"
 * — Stage B "Quick check" của Module 1)
 * ============================================================================
 * NHỊP CHƠI (giống race/race_alone/shooting/fish):
 *   [CHẠY THUẦN ~15-20s, thả bóng màu nào cũng được, trúng ly = vui/đếm 🍬,
 *    KHÔNG tính điểm bài học] -> [ĐỀ BÀI hiện ~5s] -> [BẢNG MÀU-ĐÁP ÁN hiện,
 *    có ~10s để canh đúng lúc ly qua VÀ đúng màu đáp án] -> [phản ứng đúng/
 *    sai] -> [CHẠY THUẦN tiếp] -> lặp lại cho câu kế tiếp.
 *
 * MÀU SẮC KHÔNG CỐ ĐỊNH: có 1 kho 8 màu (COLOR_POOL). Mỗi lần cần dùng màu
 * (đầu mỗi pha chạy thuần, đầu mỗi câu hỏi) -> RANDOM chọn ra 1 bộ màu mới
 * (4 màu cho pha chạy thuần; đúng số lượng đáp án — tối đa 4 — cho câu hỏi)
 * để gán vào các nút bấm / bảng chú thích.
 *
 * ÂM THANH + TTS: chạm vào bóng màu nào -> phát tiếng "tách" NGAY + đọc TTS
 * tên màu đó bằng tiếng Anh (Red/Blue/Green...). Bóng rơi trúng ly -> 1 tiếng
 * riêng (vui tai). Bóng rơi trượt (ly không ở đó) -> 1 tiếng riêng (khác).
 *
 * CƠ CHẾ 1 LẦN THẢ (dùng chung cho cả pha chạy thuần lẫn pha câu hỏi):
 *   - Trúng ly lúc chạy thuần -> chỉ cộng 🍬, không liên quan điểm bài học.
 *   - Trúng ly + đúng màu đáp án (lúc câu hỏi) = ĐÚNG, kết thúc câu ngay.
 *   - Trúng ly nhưng SAI màu (lúc câu hỏi) = SAI NGAY, không cho thả lại.
 *   - Trượt (bất kỳ lúc nào) = không tính gì, được thả lại.
 *   - Hết giờ mà chưa trúng ly lần nào (lúc câu hỏi) = SAI, tô sáng đáp án đúng.
 *
 * TỐC ĐỘ LY: mỗi lượt (chạy thuần lẫn câu hỏi) chọn ngẫu nhiên 1 trong 3 tốc
 * độ (nhanh/vừa/chậm) — đã giảm một nửa so với bản trước (ms tăng gấp đôi).
 *
 * HỢP ĐỒNG DỮ LIỆU (payload.rounds) — mỗi round:
 *   {
 *     type: "mcq" | "image-mcq",
 *     instructionKey, instructionText,
 *     promptHTML, speakPromptText, rate,
 *     optionLang, promptLang,            // "en" | "vi"
 *     options: [{ label, value, imageUrl?, speakText? }],  // tối đa 4
 *     correctValue,
 *     answerMs,                          // khung giờ trả lời (mặc định 10000)
 *   }
 * KẾT QUẢ TRẢ VỀ: finishAndReturn(moduleId, results) — results là mảng
 * { correct: boolean } theo đúng thứ tự rounds.
 * ============================================================================
 */

import {
  PkmGameLauncher, speakEN, speakVI, speakInstructionOnce, initTTSVoice,
  randomPick, shuffle, POSITIVE_FEEDBACK, ENCOURAGE_RETRY, SFX,
} from "./all-shared.js";

// ============================================================================
// HẰNG SỐ NHỊP ĐỘ
// ============================================================================
const PROMPT_MS = 5000;
const ANSWER_MS = 10000;
const RUN_MIN_MS = 15000;
const RUN_MAX_MS = 20000;
const LEAD_RUN_MS = 2500;

const FALL_MS = 850; // thời gian bóng rơi từ máng xuống mặt ray

// 3 tốc độ ly: nhanh / vừa / chậm (thời gian đi 1 chiều, ms) — đã giảm một
// nửa tốc độ so với bản trước (ms TĂNG gấp đôi = đi chậm lại một nửa).
const CUP_SPEEDS = [2400, 4000, 6000];

// Kho màu — mỗi lần dùng sẽ random chọn ra 1 bộ con (KHÔNG cố định 4 màu
// xuyên suốt game nữa). speakName dùng để đọc TTS khi chạm vào bóng màu đó.
const COLOR_POOL = [
  { key: "red",    hex: "#e53935", speakName: "Red" },
  { key: "blue",   hex: "#2f6fed", speakName: "Blue" },
  { key: "green",  hex: "#43a047", speakName: "Green" },
  { key: "yellow", hex: "#ffd600", speakName: "Yellow" },
  { key: "orange", hex: "#ff7043", speakName: "Orange" },
  { key: "purple", hex: "#8e44ad", speakName: "Purple" },
  { key: "pink",   hex: "#ec407a", speakName: "Pink" },
  { key: "teal",   hex: "#00897b", speakName: "Teal" },
];

function rand(min, max) { return Math.round(min + Math.random() * (max - min)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function speakByLang(text, lang, rate) { return lang === "vi" ? speakVI(text, rate) : speakEN(text, rate); }

/** Random chọn `count` màu KHÁC NHAU từ kho màu. */
function pickRandomColors(count) {
  return shuffle(COLOR_POOL).slice(0, count);
}

// ============================================================================
// TRẠNG THÁI
// ============================================================================
const el = id => document.getElementById(id);
let cupEl, trackEl, sceneEl;
let colorButtons = []; // các <button> đang hiển thị, cùng thứ tự với currentColors
let currentColors = []; // bộ màu ĐANG GÁN cho các nút hiện tại (đổi mới mỗi pha)
let funCount = 0;
let gameMode = "idle"; // "free" | "quiz" | "idle"
let quizResolver = null;

// ============================================================================
// TỐC ĐỘ LY — đổi ngẫu nhiên mỗi lượt
// ============================================================================
function setRandomCupSpeed() {
  cupEl.style.animationDuration = randomPick(CUP_SPEEDS) + "ms";
}

// ============================================================================
// BỂ BÓNG TRANG TRÍ — vẽ 1 lần lúc khởi động, thuần hình ảnh
// ============================================================================
function renderBallPitDecor() {
  const pit = el("pkdBallPit");
  const html = [];
  for (let i = 0; i < 46; i++) {
    const c = randomPick(COLOR_POOL);
    const size = rand(16, 26);
    const top = rand(2, 88);
    const left = rand(2, 88);
    html.push(`<div class="pkd-pit-dot" style="background:${c.hex};width:${size}px;height:${size}px;top:${top}%;left:${left}%;"></div>`);
  }
  pit.innerHTML = html.join("");
}

// ============================================================================
// TẠO CÁC NÚT MÀU — dùng chung cho cả pha chạy thuần lẫn pha câu hỏi
// ============================================================================
function renderColorButtons(colors) {
  currentColors = colors;
  const wrap = el("pkdColorButtons");
  wrap.innerHTML = "";
  colorButtons = colors.map(c => {
    const btn = document.createElement("button");
    btn.className = "pkd-color-btn";
    btn.style.background = c.hex;
    btn.onclick = () => handleColorTap(c);
    wrap.appendChild(btn);
    return btn;
  });
}

function setColorButtonsEnabled(enabled) {
  colorButtons.forEach(b => { b.disabled = !enabled; });
}

// ============================================================================
// THẢ 1 VIÊN BÓNG — rơi từ máng xuống, kiểm tra có trúng ly không
// ============================================================================
function dropBall(color) {
  return new Promise(resolve => {
    const ball = document.createElement("div");
    ball.className = "pkd-ball";
    ball.style.background = color.hex;
    sceneEl.appendChild(ball);

    const trackRect = trackEl.getBoundingClientRect();
    const sceneRect = sceneEl.getBoundingClientRect();
    const landingTop = (trackRect.top - sceneRect.top) + trackRect.height / 2 - 15;

    requestAnimationFrame(() => {
      ball.style.transitionDuration = FALL_MS + "ms";
      ball.style.top = landingTop + "px";
    });

    setTimeout(() => {
      const ballRect = ball.getBoundingClientRect();
      const cupRect = cupEl.getBoundingClientRect();
      const hit = ballRect.left < cupRect.right && ballRect.right > cupRect.left;

      SFX[hit ? "catchBall" : "hit"]();

      const splash = document.createElement("div");
      splash.className = "pkd-splash";
      splash.textContent = hit ? "✨" : "💦";
      splash.style.left = (ballRect.left - sceneRect.left + ballRect.width / 2) + "px";
      splash.style.top = (ballRect.top - sceneRect.top + ballRect.height / 2) + "px";
      sceneEl.appendChild(splash);
      setTimeout(() => splash.remove(), 500);

      ball.remove();
      resolve(hit);
    }, FALL_MS);
  });
}

// ============================================================================
// CHẠM NÚT MÀU — luôn phát tiếng "tách" + đọc tên màu; hành vi tiếp theo tuỳ
// gameMode hiện tại
// ============================================================================
async function handleColorTap(color) {
  if (gameMode === "idle") return;

  SFX.move(); // tiếng "tách" ngắn ngay lúc chạm
  speakEN(color.speakName, 1); // đọc tên màu — không await, để bóng rơi ngay không bị khựng

  const hit = await dropBall(color);

  if (gameMode === "free") {
    if (hit) {
      funCount++;
      el("pkdFunCounter").textContent = `🍬 ${funCount}`;
    }
    return;
  }

  if (gameMode === "quiz" && hit && quizResolver) {
    quizResolver(color);
  }
  // gameMode === "quiz" && !hit -> trượt, không làm gì, chờ thả tiếp
}

// ============================================================================
// PHA "CHẠY THUẦN" — thả bóng màu nào cũng được, chỉ để vui + đếm 🍬
// ============================================================================
async function runFreePhase(ms) {
  setRandomCupSpeed();
  renderColorButtons(pickRandomColors(4));
  gameMode = "free";
  setColorButtonsEnabled(true);
  await sleep(ms);
  gameMode = "idle";
  setColorButtonsEnabled(false);
}

// ============================================================================
// ĐỀ BÀI: hiện đè lên scene trong PROMPT_MS rồi tự ẩn
// ============================================================================
async function showPrompt(round) {
  const overlay = el("pkdPromptOverlay");
  overlay.innerHTML = `
    <div class="pkd-prompt-card">
      ${round.promptHTML || ""}
      <div class="pkd-prompt-timerbar"><div style="animation-duration:${PROMPT_MS}ms;"></div></div>
    </div>`;
  overlay.classList.add("show");

  if (round.speakPromptText) speakByLang(round.speakPromptText, round.promptLang, round.rate);
  await sleep(PROMPT_MS);
  overlay.classList.remove("show");
}

// ============================================================================
// CHUẨN HOÁ ROUND
// ============================================================================
function normalizeRound(round) {
  const hasOptions = Array.isArray(round.options);
  const type = round.type || (hasOptions
    ? (round.options.some(o => o.imageUrl) ? "image-mcq" : "mcq")
    : "mcq");
  return {
    type,
    instructionKey: round.instructionKey,
    instructionText: round.instructionText,
    promptHTML: round.promptHTML || round.questionHTML || "",
    speakPromptText: round.speakPromptText,
    rate: round.rate || 1,
    optionLang: round.optionLang || "en",
    promptLang: round.promptLang || "en",
    options: (round.options || []).slice(0, 4),
    correctValue: round.correctValue,
    answerMs: round.answerMs || ANSWER_MS,
  };
}

// ============================================================================
// BẢNG CHÚ THÍCH MÀU <-> ĐÁP ÁN — chỉ hiện lúc là câu hỏi
// ============================================================================
function renderLegend(options, colors) {
  const wrap = el("pkdLegendWrap");
  wrap.innerHTML = options.map((opt, i) => {
    const c = colors[i];
    return `
      <div class="pkd-legend-item" data-value="${opt.value}">
        <div class="pkd-legend-swatch" style="background:${c.hex};"></div>
        <div class="pkd-legend-card">
          ${opt.imageUrl
            ? `<img src="${opt.imageUrl}" alt="" onerror="this.style.display='none';"/>`
            : `<span>${opt.label}</span>`}
        </div>
      </div>`;
  }).join("");
  wrap.classList.add("show");
}

function highlightCorrectLegend(correctValue) {
  const item = el("pkdLegendWrap").querySelector(`.pkd-legend-item[data-value="${CSS.escape(String(correctValue))}"]`);
  item?.classList.add("pkd-legend-correct");
}

function hideLegend() {
  el("pkdLegendWrap").classList.remove("show");
  el("pkdLegendWrap").innerHTML = "";
}

// ============================================================================
// PHA CÂU HỎI — bảng màu-đáp án hiện ra, chờ thả trúng ly + đúng màu
// ============================================================================
function openColorAnswer(round) {
  setRandomCupSpeed();
  const colors = pickRandomColors(round.options.length);
  renderColorButtons(colors);
  renderLegend(round.options, colors);

  el("pkdAnswerTimerWrap").classList.add("show");
  const timerBar = el("pkdAnswerTimerBar");
  timerBar.style.transition = "none";
  timerBar.style.transform = "scaleX(1)";
  void timerBar.offsetWidth;
  requestAnimationFrame(() => {
    timerBar.style.transition = `transform ${round.answerMs}ms linear`;
    timerBar.style.transform = "scaleX(0)";
  });

  gameMode = "quiz";
  setColorButtonsEnabled(true);

  return new Promise(resolve => {
    let settled = false;
    const feedback = el("pkdFeedback");

    const finish = async (isCorrect, chosenOpt) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      gameMode = "idle";
      setColorButtonsEnabled(false);

      if (!isCorrect) highlightCorrectLegend(round.correctValue);

      feedback.textContent = isCorrect ? "🎉 " + randomPick(POSITIVE_FEEDBACK) : "💡 " + randomPick(ENCOURAGE_RETRY);
      feedback.style.color = isCorrect ? "#69f0ae" : "#ffd54f";
      SFX[isCorrect ? "correct" : "wrong"]();

      if (chosenOpt) await speakByLang(chosenOpt.speakText || chosenOpt.label || chosenOpt.value, round.optionLang, round.rate);

      await sleep(900);
      feedback.textContent = "";
      el("pkdAnswerTimerWrap").classList.remove("show");
      hideLegend();
      resolve(isCorrect);
    };

    quizResolver = (color) => {
      // Tìm đáp án được gán cho MÀU vừa trúng (theo đúng thứ tự colors[i] <-> options[i])
      const idx = colors.findIndex(c => c.key === color.key);
      const opt = round.options[idx];
      if (!opt) return;
      const isCorrect = opt.value === round.correctValue;
      finish(isCorrect, opt);
    };

    var timeoutTimer = setTimeout(() => finish(false, null), round.answerMs);
  });
}

// ============================================================================
// 1 VÒNG CÂU HỎI ĐẦY ĐỦ
// ============================================================================
async function playRound(round, idx, total) {
  const r = normalizeRound(round);
  el("pkdProgressBadge").textContent = `${idx + 1}/${total}`;
  if (r.instructionKey) await speakInstructionOnce(r.instructionKey, r.instructionText);
  await showPrompt(r);
  const isCorrect = await openColorAnswer(r);
  return isCorrect;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  const payload = PkmGameLauncher.getLaunchPayload();
  if (!payload || !Array.isArray(payload.rounds) || !payload.rounds.length) {
    location.href = "all-shared.html";
    return;
  }

  sceneEl = el("pkdScene");
  trackEl = el("pkdTrack");
  cupEl = el("pkdCup");
  renderBallPitDecor();
  setColorButtonsEnabled(false);
  el("pkdProgressBadge").textContent = `0/${payload.rounds.length}`;

  await new Promise(resolve => {
    el("pkdStartBtn").onclick = () => {
      try {
        const unlock = new SpeechSynthesisUtterance(" ");
        unlock.volume = 0;
        window.speechSynthesis.speak(unlock);
      } catch (e) {}
      resolve();
    };
  });
  el("pkdStartOverlay").remove();

  await initTTSVoice();
  await runFreePhase(LEAD_RUN_MS);

  const results = [];
  for (let i = 0; i < payload.rounds.length; i++) {
    const isCorrect = await playRound(payload.rounds[i], i, payload.rounds.length);
    results.push({ correct: isCorrect });
    await runFreePhase(rand(RUN_MIN_MS, RUN_MAX_MS));
  }

  PkmGameLauncher.finishAndReturn(payload.moduleId, results);
}

main();