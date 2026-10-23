/**
 * ==========================================
 * pkm_minigame_ballcatching.js — BẮT BÓNG POKÉMON (độc lập hoàn toàn)
 * ==========================================
 * Dành riêng cho Module 3 (Nói) — đăng ký ở nhóm "answer" (giống
 * pkm_minigame_race.js) nhưng round type chủ yếu là "speaking" (có kèm sẵn
 * `fallbackRound` dạng mcq/image-mcq — xem module-3-speaking.js).
 *
 * LẤY PHONG CÁCH TỪ vocabulary2.js: nền GIF, nhiều quả Pokéball kích cỡ khác
 * nhau bay/nhảy vị trí ngẫu nhiên, bắt (chạm) 1 quả -> hiện flashcard. Khác
 * vocabulary2.js ở chỗ: dùng "ispeak" (startRecording + transcribeAudio từ
 * all-shared.js — ghi âm rồi gửi server nhận diện) thay vì Web Speech API
 * (SpeechRecognition) của trình duyệt.
 *
 * MIC HỎNG GIỮA CHỪNG: đếm lỗi KỸ THUẬT liên tiếp (transcribeAudio trả về
 * null — KHÔNG tính nói sai là lỗi kỹ thuật). Sau 2 lần liên tiếp -> hỏi học
 * sinh "mic có hoạt động không?" -> chọn "Thử lại" thì reset đếm, chọn
 * "Chuyển bài khác" thì TỪ ĐÓ TRỞ ĐI mọi round speaking còn lại đều tự động
 * dùng fallbackRound (mcq/image-mcq qua askMCQ), không hỏi lại nữa.
 *
 * KHÔNG cần tự prefetchImagesBatch — `promptHTML` của mỗi round đã có sẵn
 * URL ảnh dựng từ trước (lúc soạn round ở all-shared.html, cache ảnh đã ấm).
 */

import { PkmGameLauncher, askMCQ, startRecording, transcribeAudio, speakEN, SFX } from "./all-shared.js";
import { checkPercentMatchLocal } from "./pkm_intro_round_helpers.js";

const TECH_FAIL_THRESHOLD = 2; // 2 lần lỗi kỹ thuật liên tiếp thì hỏi "mic có hoạt động không"

const el = id => document.getElementById(id);

let rounds = [];
let results = [];
let caughtCount = 0;
let isFlashcardActive = false;
let consecutiveTechFails = 0;
let micDisabledForRest = false;

// ============================================================================
// SO KHỚP GIỌNG NÓI — theo `matchType` dữ liệu thuần (không truyền hàm được
// vì rounds đã bị JSON.stringify lúc lưu localStorage trước khi chuyển trang)
// ============================================================================
function checkSpeakingMatch(transcript, round) {
  const t = (transcript || "").trim();
  if (!t) return false;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();

  switch (round.matchType) {
    case "lenient":
      return true; // đã lọc rỗng ở trên -> chỉ cần có nói là được
    case "keywords": {
      const heard = norm(t);
      const kws = round.matchKeywords || [];
      if (!kws.length) return true;
      return kws.some(k => heard.includes(norm(k)));
    }
    case "includes":
      return norm(t).includes(norm(round.targetText || ""));
    case "percent":
    default:
      return checkPercentMatchLocal(t, round.targetText || "", round.matchThreshold || 70);
  }
}

// ============================================================================
// BÓNG BAY — y hệt cơ chế vocabulary2.js: kích cỡ ngẫu nhiên, tự đổi vị trí
// ngẫu nhiên mỗi vài giây, chạm vào để bắt.
// ============================================================================
function movePokeball(ball) {
  const size = parseInt(ball.style.width, 10);
  const top = Math.floor(Math.random() * (window.innerHeight - size - 60)) + 50; // né header
  const left = Math.floor(Math.random() * (window.innerWidth - size));
  ball.style.top = `${top}px`;
  ball.style.left = `${left}px`;
}
function resizePokeball(ball) {
  const size = Math.floor(Math.random() * 40) + 24; // 24–64px, dải rộng hơn để thấy rõ đổi cỡ
  ball.style.width = `${size}px`;
  ball.style.height = `${size}px`;
}

function renderPokeballs() {
  const container = el("pkbContainer");
  container.innerHTML = "";

  rounds.forEach((round, idx) => {
    const ball = document.createElement("div");
    ball.className = "pkb-ball";
    ball.dataset.idx = String(idx);

    const size = Math.floor(Math.random() * 20) + 30; // 30–50px, giống vocabulary2.js
    ball.style.width = `${size}px`;
    ball.style.height = `${size}px`;

    movePokeball(ball);
    container.appendChild(ball);

    ball.addEventListener("click", () => catchBall(round, ball));

    const moveInterval = setInterval(() => {
      if (document.body.contains(ball)) movePokeball(ball);
      else clearInterval(moveInterval);
    }, 5000);

    const resizeInterval = setInterval(() => {
      if (document.body.contains(ball)) resizePokeball(ball);
      else clearInterval(resizeInterval);
    }, 1200); // đổi cỡ thường xuyên hơn đổi vị trí, tạo cảm giác "liên tục"
  });
}

// ============================================================================
// BẮT BÓNG -> HIỆN FLASHCARD + LUYỆN NÓI (hoặc fallback nếu mic đã tắt)
// ============================================================================
async function catchBall(round, ballEl) {
  if (isFlashcardActive) return;
  isFlashcardActive = true;
  SFX.catchBall();
  ballEl.remove();

  if (micDisabledForRest) {
    await playFallback(round);
    finishRound();
    return;
  }

  const card = el("pkbFlashcard");
  card.classList.add("show");
  el("pkbPromptArea").innerHTML = round.promptHTML || "";
  const statusEl = el("pkbSpeakStatus");
  const micEl = el("pkbMic");
  const finishBtn = el("pkbMicFinishBtn");
  const resultEl = el("pkbSpeakResult");
  statusEl.textContent = ""; resultEl.textContent = "";
  finishBtn.style.display = "none";
  micEl.classList.add("locked");
  micEl.classList.remove("listening");

  el("pkbSkipBtn").onclick = () => {
    results.push({ correct: false });
    closeCardAndContinue();
  };

  if (round.speakBeforeText) {
    statusEl.textContent = "🔊 Nghe mẫu...";
    await speakEN(round.speakBeforeText, 1);
  }
  statusEl.textContent = "🎤 Đến lượt bạn nói!";
  micEl.classList.remove("locked");

  const doRecord = async () => {
    micEl.classList.add("locked", "listening");
    statusEl.textContent = "🎙️ Đang ghi âm...";
    finishBtn.style.display = "inline-block";

    try {
      const session = await startRecording(round.maxRecordMs || 10000);
      finishBtn.onclick = () => session.stop();
      const blob = await session.blob;

      finishBtn.style.display = "none";
      micEl.classList.remove("listening");
      statusEl.textContent = "⏳ Đang kiểm tra...";

      const transcript = await transcribeAudio(blob);

      if (transcript === null) {
        // ─── Lỗi KỸ THUẬT (không phải nói sai) ───
        consecutiveTechFails++;
        if (consecutiveTechFails >= TECH_FAIL_THRESHOLD) {
          await askIfMicWorking(round);
        } else {
          statusEl.textContent = "⚠️ Không nghe rõ, thử lại nhé!";
          micEl.classList.remove("locked");
        }
        return;
      }

      consecutiveTechFails = 0;
      const isCorrect = checkSpeakingMatch(transcript, round);
      SFX[isCorrect ? "correct" : "wrong"]();
      resultEl.innerHTML = transcript ? `🗣️ "<b>${transcript}</b>"` : "🗣️ (chưa nghe rõ)";
      statusEl.textContent = isCorrect ? "🎉 Chính xác!" : "👍 Cố gắng tốt lắm!";
      results.push({ correct: isCorrect });
      await new Promise(r => setTimeout(r, 1000));
      closeCardAndContinue();
    } catch (e) {
      console.error("Lỗi ghi âm:", e);
      consecutiveTechFails++;
      micEl.classList.remove("listening");
      finishBtn.style.display = "none";
      if (consecutiveTechFails >= TECH_FAIL_THRESHOLD) await askIfMicWorking(round);
      else { statusEl.textContent = "⚠️ Không dùng được microphone, thử lại nhé!"; micEl.classList.remove("locked"); }
    }
  };

  micEl.onclick = () => { if (!micEl.classList.contains("locked")) doRecord(); };
}

/** Hỏi "mic có hoạt động không" — Thử lại (reset đếm) hoặc Chuyển bài khác
 *  (tắt mic vĩnh viễn cho các round speaking còn lại trong buổi). */
function askIfMicWorking(round) {
  return new Promise(resolve => {
    el("pkbMicCheckOverlay").classList.add("show");
    el("pkbMicRetryBtn").onclick = () => {
      el("pkbMicCheckOverlay").classList.remove("show");
      consecutiveTechFails = 0;
      el("pkbSpeakStatus").textContent = "🎤 Thử lại nhé!";
      el("pkbMic").classList.remove("locked");
      resolve();
    };
    el("pkbMicGiveUpBtn").onclick = async () => {
      el("pkbMicCheckOverlay").classList.remove("show");
      micDisabledForRest = true;
      await playFallback(round);
      closeCardAndContinue();
      resolve();
    };
  });
}

/** Chạy round MCQ/image-mcq thay thế (dùng lại nguyên askMCQ đã có). */
async function playFallback(round) {
  const fb = round.fallbackRound;
  if (!fb) { results.push({ correct: false }); return; }
  el("pkbFlashcard").classList.add("show");
  el("pkbPromptArea").innerHTML = "";
  el("pkbSpeakStatus").textContent = "";
  el("pkbMic").classList.add("locked");
  el("pkbSkipBtn").style.display = "none";

  const fallbackHost = document.createElement("div");
  el("pkbPromptArea").appendChild(fallbackHost);

  const attemptsUsed = await askMCQ({
    container: fallbackHost,
    instructionKey: fb.instructionKey,
    instructionText: fb.instructionText,
    questionHTML: fb.promptHTML || "",
    options: fb.options,
    correctValue: fb.correctValue,
    speakPromptText: fb.speakPromptText,
    rate: 1,
  });
  el("pkbSkipBtn").style.display = "block";
  results.push({ correct: attemptsUsed === 1 });
}

function closeCardAndContinue() {
  el("pkbFlashcard").classList.remove("show");
  isFlashcardActive = false;
  finishRound();
}

function finishRound() {
  caughtCount++;
  const remaining = rounds.length - caughtCount;
  el("pkbCounter").textContent = String(remaining);
  if (caughtCount >= rounds.length) finish();
}

function finish() {
  PkmGameLauncher.finishAndReturn("speaking", results);
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
  rounds = payload.rounds;
  results = [];

  await new Promise(resolve => { el("pkbStartBtn").onclick = resolve; });
  el("pkbStartOverlay").remove();

  el("pkbCounter").textContent = String(rounds.length);
  renderPokeballs();
}

main();