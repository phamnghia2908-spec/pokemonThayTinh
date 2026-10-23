/**
 * ==========================================
 * pkm_minigame_flipbook.js — TRANG SÁCH LẬT GIỚI THIỆU TỪ (độc lập hoàn toàn)
 * ==========================================
 * Không dùng chung DOM/HTML với all-shared.html — trang riêng, được
 * module-1-intro.js (qua PkmGameLauncher.launch) CHUYỂN HẲN TRANG sang.
 * Chỉ import LOGIC THUẦN từ all-shared.js + pkm_intro_round_helpers.js (dùng
 * chung với mọi game nhóm "introPresent", vd pkm_minigame_maze.js) — không
 * đụng gì DOM/CSS trang chính.
 *
 * Mỗi round (xem module-1-intro.js -> buildIntroRounds()):
 *   - type "present"      : ảnh + từ + nghĩa + câu AH/AI, tự đọc khi vào
 *                            trang, không chấm điểm.
 *   - type "phonicsSpeak" : tách âm rồi bắt buộc nói theo (mic) mới lật
 *                            trang tiếp được — CÓ chấm điểm (attemptsUsed).
 *
 * Khoá điều hướng (Next/Prev/nút Đọc) trong lúc đang tự đọc/tự tách âm/chờ
 * nói theo LẦN ĐẦU tới trang đó — mở khoá lại khi xong. Quay lại trang đã
 * hoàn thành trước đó (Previous) thì không bị khoá lại/không bắt nói lại.
 * Dự phòng bị đơ: SAU 5 GIÂY tự mở khoá Next dù đang đọc/nói dở.
 */

import { PkmGameLauncher, getImageFromMap, prefetchImagesBatch, speakEN } from "./all-shared.js";
import { readPresentSequence, readPhonicsSequence, runMicRepeat, playSwishSound } from "./pkm_intro_round_helpers.js";

// ============================================================================
// TRẠNG THÁI TRANG
// ============================================================================
let payload = null;
let results = [];
let pageCompleted = [];
let pageIndex = 0;
let locked = true;

const el = id => document.getElementById(id);

function setLocked(v) {
  locked = v;
  el("pkfReadBtn").disabled = v;
  el("pkfPrevBtn").disabled = v || pageIndex === 0;
  el("pkfNextBtn").disabled = v;
}

function updateChrome() {
  el("pkfPageIndicator").textContent = `${pageIndex + 1}/${payload.rounds.length}`;
}

// ============================================================================
// TRANG "present" — giới thiệu từ
// ============================================================================
function renderPresentContent(round) {
  el("pkfContent").innerHTML = `
    <div class="pkf-word-row">
      ${round.word.split(" ").map(p => `<span class="pkf-word-tap" data-w="${p}">${p.toUpperCase()}</span>`).join("")}
    </div>
    <div class="pkf-meaning">${round.meaning}</div>
    ${round.ah ? `<div class="pkf-ah">💡 ${round.ah.en ? round.ah.en + " : " : ""}${round.ah.vi || ""}</div>` : ""}
    ${round.ai ? `<div class="pkf-ai">✨ ${round.ai}</div>` : ""}
  `;
  el("pkfContent").querySelectorAll(".pkf-word-tap").forEach(span => {
    span.onclick = () => { if (!locked) speakEN(span.dataset.w, 0.5); };
  });
}

// ============================================================================
// TRANG "phonicsSpeak" — tách âm rồi nói theo
// ============================================================================
function renderPhonicsContent(round) {
  el("pkfContent").innerHTML = `
    <div class="pkf-phonics-word">${round.word.toUpperCase()}</div>
    <div id="pkfPhonicsBox"></div>
    <div class="pkf-speak-status" id="pkfSpeakStatus"></div>
    <div class="pkf-mic-wrap"><div class="pkf-mic-ring locked" id="pkfMic">🎤</div></div>
    <button class="pkf-btn poke-btn" id="pkfMicFinishBtn" style="display:none;margin:8px auto 0;background:#4caf50;color:#fff;">✅ Xong</button>
    <div class="pkf-speak-result" id="pkfSpeakResult"></div>
  `;
}

// ============================================================================
// ĐIỀU HƯỚNG TRANG
// ============================================================================
async function enterPage(idx) {
  pageIndex = idx;
  const round = payload.rounds[idx];
  updateChrome();
  el("pkfImg").src = getImageFromMap(round.imageKeyword) || "";

  if (round.type === "present") renderPresentContent(round);
  else renderPhonicsContent(round);

  if (!pageCompleted[idx]) {
    setLocked(true);

    // ─── Dự phòng bị đơ: SAU 5 GIÂY, mở khoá Next dù đang đọc/nói dở gì đi
    // nữa (tiến trình phía dưới vẫn chạy nền, không bị huỷ — chỉ là học sinh
    // không còn bị CHẶN nếu có gì đó bị treo, ví dụ TTS/mic không phản hồi). ───
    let watchdogFired = false;
    const watchdog = setTimeout(() => {
      watchdogFired = true;

      if (results[idx] === undefined) {
        results[idx] = round.type === "present"
          ? null
          : { attemptsUsed: 2 };
      }

      pageCompleted[idx] = true;
      setLocked(false);

      const status = el("pkfSpeakStatus");
      const result = el("pkfSpeakResult");

      if (status) {
        status.textContent =
          "⚠️ Thời gian xử lý đã hết. Bạn vẫn có thể bấm Tiếp theo.";
      }

      if (result && round.type === "phonicsSpeak") {
        result.innerHTML =
          "🗣️ Không nhận được kết quả ghi âm, nhưng bạn vẫn có thể tiếp tục.";
      }
    }, 20000);


    if (round.type === "present") {
      await readPresentSequence(round);
      if (!watchdogFired) results[idx] = null;
    } else {
      await readPhonicsSequence(round, el("pkfPhonicsBox"));
      const attemptsUsed = await runMicRepeat(round, {
        statusEl: el("pkfSpeakStatus"), micEl: el("pkfMic"),
        finishBtnEl: el("pkfMicFinishBtn"), resultEl: el("pkfSpeakResult"),
      });
      if (!watchdogFired) results[idx] = { attemptsUsed };
    }

    clearTimeout(watchdog);
    if (!watchdogFired) { pageCompleted[idx] = true; setLocked(false); }
  } else {
    setLocked(false); // đã học trang này rồi (quay lại bằng Previous) -> mở khoá luôn
  }
}

async function replayRead() {
  if (locked) return;
  setLocked(true);
  const round = payload.rounds[pageIndex];
  if (round.type === "present") await readPresentSequence(round);
  else await readPhonicsSequence(round, el("pkfPhonicsBox")); // chỉ đọc lại tách âm, KHÔNG bắt nói lại
  setLocked(false);
}

async function goNext() {
  if (locked) return;
  playSwishSound();
  if (pageIndex + 1 >= payload.rounds.length) { finish(); return; }
  await enterPage(pageIndex + 1);
}
async function goPrev() {
  if (locked || pageIndex === 0) return;
  playSwishSound();
  await enterPage(pageIndex - 1);
}

function finish() {
  PkmGameLauncher.finishAndReturn("introPresent", results);
}

function attachSwipe() {
  let startX = null;
  const book = el("pkfBook");
  book.addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, { passive: true });
  book.addEventListener("touchend", e => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) goNext(); else goPrev();
  }, { passive: true });
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  payload = PkmGameLauncher.getLaunchPayload();
  if (!payload || !Array.isArray(payload.rounds) || !payload.rounds.length) {
    location.href = "all-shared.html";
    return;
  }
  results = payload.rounds.map(() => null);
  pageCompleted = payload.rounds.map(() => false);

  await new Promise(resolve => { el("pkfStartBtn").onclick = resolve; });
  el("pkfStartOverlay").remove();

  // Nạp trước TOÀN BỘ ảnh cần dùng (getImageFromMap cần window.imageCache đã
  // có sẵn dữ liệu — nếu không gọi bước này, ảnh sẽ luôn trống vì trang này
  // là 1 JS runtime hoàn toàn mới, không dùng chung cache với all-shared.html).
  const keywords = [...new Set(payload.rounds.map(r => r.imageKeyword).filter(Boolean))];
  await prefetchImagesBatch(keywords);

  el("pkfReadBtn").onclick = replayRead;
  el("pkfPrevBtn").onclick = goPrev;
  el("pkfNextBtn").onclick = goNext;
  el("pkfPauseBtn").onclick = () => { /* chỉ mang tính hiển thị — chưa có menu tạm dừng */ };
  attachSwipe();

  await enterPage(0);
}

main();
