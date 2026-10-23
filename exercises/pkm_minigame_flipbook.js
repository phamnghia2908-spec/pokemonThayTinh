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
 *   - type "present"      : ảnh + từ + nghĩa + câu AH/AI.
 *   - type "phonicsSpeak" : tách âm rồi bắt buộc nói theo (mic) mới lật
 *                            trang tiếp được — CÓ chấm điểm (attemptsUsed).
 *
 * BẢN SỬA LỖI ĐƠ (v2) — ĐỒNG BỘ VỚI pkm_minigame_maze.js:
 * Nguyên nhân thật của hiện tượng "đơ"/"không đọc được tiếng Việt, phải bấm
 * nút Đọc mới ra" không nằm ở trang này mà ở hàm đọc "present" cũ
 * (readPresentSequence, đã bị XOÁ khỏi pkm_intro_round_helpers.js): nó gọi
 * speakVI() (server TTS tiếng Việt free-tier, hay ngủ đông) tới 3-4 lần
 * liên tiếp trong lúc trang đang khoá điều hướng — mỗi lần có thể treo tới
 * 6 giây trước khi ÂM THẦM bỏ qua.
 *
 * CÁCH SỬA (đã thống nhất với người dùng, cùng mô hình với maze.js): với
 * trang "present" — TỰ ĐỘNG đọc CHỈ tiếng Anh ngắn (readPresentAuto, không
 * gọi mạng ngoài -> không thể treo) khi vừa lật tới -> mở khoá nút "🔊 Đọc"
 * (giờ đổi nghĩa: bấm vào mới gọi readPresentFull — đầy đủ Anh+Việt+AH/AI)
 * -> đọc đầy đủ xong lần đầu mới mở khoá Next/Prev. Trang "phonicsSpeak"
 * giữ nguyên luồng cũ (không gọi speakVI nên không dính lỗi này) — nút "Đọc"
 * ở trang này vẫn giữ nghĩa cũ: đọc lại phần tách âm.
 *
 * SỬA LỖI THIẾU WARM-UP (mới phát hiện — ĐÂY LÀ LÝ DO FLIPBOOK HAY BỊ ĐƠ
 * HƠN MAZE TRÊN MOBILE Ở CÁC BẢN TRƯỚC): maze.js đã có sẵn bước "đánh thức"
 * AudioContext ngay trong gesture bấm nút Start, còn flipbook.js thì KHÔNG
 * — khiến AudioContext/speechSynthesis có thể không được mở khoá chắc chắn
 * trên nhiều trình duyệt di động. Bản này thêm bước warmUpAudio() y hệt
 * maze.js (đánh thức AudioContext + server TTS tiếng Việt) ngay lúc chạm nút
 * Bắt đầu.
 *
 * Khoá điều hướng (Next/Prev/nút Đọc) trong lúc đang tự đọc/tự tách âm/chờ
 * nói theo LẦN ĐẦU tới trang đó — mở khoá lại khi xong. Quay lại trang đã
 * hoàn thành trước đó (Previous) thì không bị khoá lại/không bắt nói lại.
 * Dự phòng bị đơ: SAU 20 GIÂY tự mở khoá Next dù đang đọc/nói dở (không tự
 * ý coi như "đã đọc đầy đủ" cho trang present — chỉ mở khoá điều hướng).
 */

import { PkmGameLauncher, getImageFromMap, prefetchImagesBatch, speakEN } from "./all-shared.js";
import {
  readPresentAuto, readPresentFull, readPhonicsSequence, runMicRepeat,
  playSwishSound, getSharedAudioCtx, warmUpViServer,
} from "./pkm_intro_round_helpers.js";

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
    <div class="pkf-speak-status" id="pkfPresentStatus"></div>
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

    // ─── Dự phòng bị đơ: SAU 20 GIÂY, mở khoá Next dù đang đọc/nói dở gì đi
    // nữa (tiến trình phía dưới vẫn chạy nền, không bị huỷ — chỉ là học sinh
    // không còn bị CHẶN nếu có gì đó bị treo, ví dụ TTS/mic không phản hồi). ───
    let watchdogFired = false;
    const watchdog = setTimeout(() => {
      watchdogFired = true;

      if (results[idx] === undefined) {
        results[idx] = round.type === "present" ? null : { attemptsUsed: 2 };
      }

      pageCompleted[idx] = true;
      setLocked(false);

      const status = round.type === "present" ? el("pkfPresentStatus") : el("pkfSpeakStatus");
      const result = el("pkfSpeakResult");

      if (status) status.textContent = "⚠️ Thời gian xử lý đã hết. Bạn vẫn có thể bấm Tiếp theo.";
      if (result && round.type === "phonicsSpeak") {
        result.innerHTML = "🗣️ Không nhận được kết quả ghi âm, nhưng bạn vẫn có thể tiếp tục.";
      }
    }, 20000);

    if (round.type === "present") {
      await runPresentPage(round, watchdog, () => watchdogFired);
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

/**
 * Trang "present" — mô hình mới (đồng bộ với maze.js):
 *   1. Vào trang -> TỰ ĐỘNG đọc ngắn tiếng Anh (readPresentAuto, không gọi
 *      mạng ngoài -> không thể treo).
 *   2. Xong -> mở khoá nút "🔊 Đọc" (giờ nghĩa là "Đọc đầy đủ" cho trang này).
 *   3. Học sinh bấm -> mới gọi readPresentFull (Anh+Việt+AH/AI).
 *   4. Xong lần đọc đầy đủ ĐẦU TIÊN -> mở khoá Next/Prev.
 * Không tự resolve khi watchdog bắn (watchdog xử lý riêng ở enterPage) —
 * hàm này chỉ dừng chờ khi người dùng đã đọc đầy đủ ít nhất 1 lần HOẶC
 * watchdog đã bắn (kiểm tra qua isWatchdogFired()).
 */
function runPresentPage(round, watchdogTimer, isWatchdogFired) {
  return new Promise(resolve => {
    const readBtn = el("pkfReadBtn");
    const statusEl = el("pkfPresentStatus");
    let settled = false;

    const finishIfNeeded = () => {
      if (settled || isWatchdogFired()) return;
      settled = true;
      readBtn.onclick = null;
      resolve();
    };

    // Nút "Đọc" ở trang present giờ nghĩa là "Đọc đầy đủ" — mỗi lần bấm đều
    // gọi lại readPresentFull (được phép bấm lại nhiều lần sau khi đã mở khoá).
    readBtn.onclick = async () => {
      if (locked && !settled) return; // đang trong lúc tự đọc auto, chưa mở khoá nút thì bỏ qua
      readBtn.disabled = true;
      if (statusEl) statusEl.textContent = "🔊 Đang đọc...";
      await readPresentFull(round);
      if (isWatchdogFired()) return;
      readBtn.disabled = false;
      if (statusEl) statusEl.textContent = "✅ Bạn có thể bấm Tiếp theo, hoặc bấm Đọc lại lần nữa.";
      finishIfNeeded();
    };

    (async () => {
      if (statusEl) statusEl.textContent = "🔊 Đang đọc...";
      await readPresentAuto(round);
      if (isWatchdogFired()) return;
      readBtn.disabled = false;
      if (statusEl) statusEl.textContent = "🔊 Bấm nút để nghe đầy đủ (kèm nghĩa tiếng Việt).";
      // Chỉ mở khoá NÚT ĐỌC ở đây — Next/Prev vẫn khoá cho tới khi đọc đầy đủ
      // xong ít nhất 1 lần (finishIfNeeded gọi từ trong readBtn.onclick).
    })();
  });
}

async function replayRead() {
  if (locked) return;
  const round = payload.rounds[pageIndex];
  if (round.type === "present") {
    // Trang present đã hoàn thành (đang xem lại qua Previous) -> bấm "Đọc"
    // chỉ đơn giản đọc lại đầy đủ, không cần khoá điều hướng nữa.
    await readPresentFull(round);
  } else {
    setLocked(true);
    await readPhonicsSequence(round, el("pkfPhonicsBox")); // chỉ đọc lại tách âm, KHÔNG bắt nói lại
    setLocked(false);
  }
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
// ĐÁNH THỨC ÂM THANH + SERVER TTS TIẾNG VIỆT NGAY TRONG CỬ CHỈ CHẠM — ĐỒNG
// BỘ VỚI pkm_minigame_maze.js. Bản trước của flipbook KHÔNG có bước này, đây
// là 1 phần nguyên nhân khiến flipbook dễ bị đơ trên mobile hơn maze.
// ============================================================================
function warmUpAudio() {
  try { getSharedAudioCtx(); } catch (e) { /* bỏ qua */ }
  try { warmUpViServer(); } catch (e) { /* bỏ qua */ }
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

  await new Promise(resolve => { el("pkfStartBtn").onclick = () => { warmUpAudio(); resolve(); }; });
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