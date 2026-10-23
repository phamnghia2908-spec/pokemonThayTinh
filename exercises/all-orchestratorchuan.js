/**
 * ============================================================================
 * all-orchestrator.js — ĐIỀU PHỐI CHÍNH (có hỗ trợ NHẢY GIỮA MODULE)
 * ============================================================================
 * File này CHỈ điều phối (chọn cấp độ -> tải dữ liệu -> chạy 5 module -> hỏi
 * học lại/đã thuộc). Không chứa logic riêng của module nào.
 *
 * TÍNH NĂNG NHẢY MODULE: click vào 1 ô ở thanh progress -> xác nhận -> lưu
 * localStorage -> reload trang -> orchestrator đọc lại và bắt đầu CHẠY TỪ
 * module đó. Bắt buộc reload (giống all.js cũ) vì không thể an toàn "hủy
 * giữa dòng" 1 module đang chạy (audio/mic/Live2D đang mở).
 *
 * Chỉ khi CẢ 5 module đều đã hoàn thành (theo dõi cộng dồn qua localStorage,
 * sống sót qua các lần reload do nhảy module) mới hiện màn hỏi "Học lại/Đã
 * thuộc". Điểm từng module vẫn tự lưu ngay khi module đó xong, không đổi.
 * ============================================================================
 */

import {
  initTTSVoice, injectSharedStyles, getWordBank, loadSessionData,
  renderLevelSelect, renderEndOfSessionPrompt, resetInstructionMemory,
  showTransition, PkmGameNavigating,
} from "./all-shared.js";

import { runIntroModule } from "./module-1-intro.js";
import { runListeningModule } from "./module-2-listening.js";
import { runSpeakingModule } from "./module-3-speaking.js";
import { runReadingModule } from "./module-4-reading.js";
import { runWritingModule } from "./module-5-writing.js";

const MODULES = [
  { id: "intro",     label: "🌸 Giới thiệu", emoji: "🌸", run: runIntroModule },
  { id: "listening", label: "🎧 Nghe",        emoji: "🎧", run: runListeningModule },
  { id: "speaking",  label: "🎙️ Nói",         emoji: "🎙️", run: runSpeakingModule },
  { id: "reading",   label: "📖 Đọc",         emoji: "📖", run: runReadingModule },
  { id: "writing",   label: "✍️ Viết",        emoji: "✍️", run: runWritingModule },
];

const JUMP_KEY = "pkl_jump_to_module_idx";
const COMPLETED_KEY = "pkl_completed_modules";
const CURRENT_IDX_SESSION_KEY = "pkl_current_module_idx"; // sessionStorage, chỉ để chống click trùng module đang chạy

// ============================================================================
// TRẠNG THÁI "ĐÃ HOÀN THÀNH" — cộng dồn qua localStorage, sống sót qua reload
// ============================================================================

function getCompletedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(COMPLETED_KEY) || "[]")); }
  catch (e) { return new Set(); }
}
function saveCompletedSet(set) {
  localStorage.setItem(COMPLETED_KEY, JSON.stringify([...set]));
}
function resetCompletedSet() {
  localStorage.setItem(COMPLETED_KEY, JSON.stringify([]));
}

// ============================================================================
// UI: THANH PROGRESS + NHẢY MODULE
// ============================================================================

function setCard(html) {
  document.getElementById("mainCard").innerHTML = html;
}

function updateProgress(idx) {
  sessionStorage.setItem(CURRENT_IDX_SESSION_KEY, String(idx));
  const completed = getCompletedSet();

  const pct = Math.round((completed.size / MODULES.length) * 100);
  const bar = document.getElementById("progressBar");
  if (bar) bar.style.width = pct + "%";

  const wrap = document.getElementById("progressSteps");
  if (wrap) {
    wrap.innerHTML = MODULES.map((m, i) => {
      const isDone = completed.has(m.id);
      const isActive = i === idx;
      const cls = isDone ? "done" : isActive ? "active" : "";
      const shortLabel = m.label.replace(/^\S+\s/, "");
      return `<span class="step-dot ${cls}" style="cursor:pointer;"
                    onclick="window.pklJumpToModule(${i})"
                    title="Nhấn để chuyển tới: ${m.label}">${m.emoji} ${shortLabel}</span>`;
    }).join("");
  }

  const label = document.getElementById("stageLabel");
  if (label) label.textContent = MODULES[idx]?.label || "✅ Hoàn thành!";
}

window.pklJumpToModule = function (idx) {
  const current = parseInt(sessionStorage.getItem(CURRENT_IDX_SESSION_KEY) || "0", 10);
  if (idx === current) return; // đang ở module này rồi, không cần làm gì
  const target = MODULES[idx];
  if (confirm(`Bạn muốn chuyển sang phần: ${target.label}?`)) {
    localStorage.setItem(JUMP_KEY, String(idx));
    location.reload();
  }
};

// ============================================================================
// CHẠY 5 MODULE, BẮT ĐẦU TỪ startIdx, TỰ ĐỘNG LẤP CÁC MODULE CÒN THIẾU
// ============================================================================

async function runFromIndex(sessionVocab, poolData, level, startIdx) {
  resetInstructionMemory();

  // Thứ tự chạy: bắt đầu từ startIdx, hết vòng thì quay lại đầu (đảm bảo luôn
  // chạm đủ cả 5 module đúng 1 lượt duy nhất mỗi module, trừ module đích).
  const order = [];
  for (let k = 0; k < MODULES.length; k++) order.push((startIdx + k) % MODULES.length);

  for (let pos = 0; pos < order.length; pos++) {
    const i = order[pos];
    const isExplicitTarget = pos === 0; // module đầu tiên = module người dùng vừa chọn (hoặc mặc định)
    const completed = getCompletedSet();

    // Module đã hoàn thành rồi thì bỏ qua — TRỪ module đích (người dùng chủ động chọn thì luôn cho làm lại)
    if (!isExplicitTarget && completed.has(MODULES[i].id)) continue;

    updateProgress(i);
    const rootEl = document.getElementById("mainCard");
    await MODULES[i].run({ sessionVocab, poolData, level, rootEl });

    completed.add(MODULES[i].id);
    saveCompletedSet(completed);

    if (completed.size >= MODULES.length) {
      updateProgress(MODULES.length);
      return;
    }
  }
  updateProgress(MODULES.length);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  injectSharedStyles();
  await initTTSVoice();

  const wordBank = getWordBank();
  if (!wordBank.length) {
    setCard(`
      <div style="text-align:center;padding:40px;color:#ff6b6b;">
        ⚠️ Chưa có danh sách từ vựng (wordBank).<br/>
        <span style="color:#aaa;font-size:14px;">Hãy chọn từ ở trang danh sách từ trước.</span>
      </div>`);
    return;
  }

  // Kiểm tra xem trang này được load do NHẢY MODULE (click progress dot) hay không
  const jumpIdxRaw = localStorage.getItem(JUMP_KEY);
  const isJumping = jumpIdxRaw !== null;
  let startIdx = 0;
  if (isJumping) {
    startIdx = parseInt(jumpIdxRaw, 10);
    localStorage.removeItem(JUMP_KEY);
  }

  // 1. Cấp độ: CHỈ hỏi đúng 1 lần cho cả buổi học. Hễ đã có selected_level
  //    trong localStorage -> dùng lại, không hỏi lại, dù đang jump module
  //    hay vừa quay về (reload thường) từ 1 minigame.
  let level;
  const savedLevel = localStorage.getItem("selected_level");
  if (savedLevel) {
    level = savedLevel;
    if (!isJumping) {
      // Không phải do bấm nhảy module -> đây là lượt reload do minigame vừa
      // finishAndReturn() xong -> tiếp tục ĐÚNG module đang dở dang (lưu ở
      // sessionStorage lúc trước khi phóng sang minigame), không phải module 0.
      startIdx = parseInt(sessionStorage.getItem(CURRENT_IDX_SESSION_KEY) || "0", 10);
    }
  } else {
    setCard(`<div style="text-align:center;padding:20px;color:#aaa;">Đang tải...</div>`);
    level = await renderLevelSelect(document.getElementById("mainCard"));
    resetCompletedSet(); // bắt đầu 1 buổi học hoàn toàn mới -> xoá tiến trình hoàn thành cũ
  }

  // 2. Tải dữ liệu buổi học (cache F5-safe qua all-shared.js — nếu đang nhảy
  //    module thì dữ liệu này đã có sẵn trong cache, không tải lại từ mạng)
  setCard(`
    <div style="text-align:center;padding:40px;">
      <div style="font-size:48px;animation:bounce 0.8s ease infinite alternate;">📚</div>
      <p style="color:#aaa;margin-top:16px;">Đang chuẩn bị bài học...</p>
    </div>`);

  let sessionVocab, poolData;
  try {
    ({ sessionVocab, poolData } = await loadSessionData(level));
  } catch (e) {
    console.error("Lỗi tải dữ liệu buổi học:", e);
    setCard(`<div style="text-align:center;padding:40px;color:#ff6b6b;">⚠️ Không tải được dữ liệu. Kiểm tra kết nối mạng.</div>`);
    return;
  }

  if (!sessionVocab.length) {
    setCard(`
      <div style="text-align:center;padding:40px;color:#ff6b6b;">
        ⚠️ Không tìm thấy từ vựng phù hợp cho cấp độ này.<br/>
        <span style="color:#aaa;font-size:14px;">Kiểm tra lại wordBank hoặc phạm vi bài học (SHEET_BAI_HOC).</span>
      </div>`);
    return;
  }

  if (!isJumping) {
    await showTransition("🎮", "Let's start learning!",
      `Today you'll learn ${sessionVocab.length} new words through 5 fun activities!`);
  }

  // 3. Vòng lặp buổi học — mỗi lượt chạy đủ 5 module (có thể qua nhiều lần
  //    nhảy/reload) mới hỏi "Học lại/Đã thuộc". "Học lại" thì lặp lại trong
  //    cùng trang (không cần reload) và reset tiến trình hoàn thành.
  let keepGoing = true;
  while (keepGoing) {
    await runFromIndex(sessionVocab, poolData, level, startIdx);
    startIdx = 0; // các lượt lặp lại sau (do "Học lại", không phải do nhảy) luôn bắt đầu từ module 1

    const choice = await renderEndOfSessionPrompt(document.getElementById("mainCard"));
    keepGoing = choice === "replay";
    if (keepGoing) resetCompletedSet();
  }

  // 4. Kết thúc hẳn buổi học — dọn lựa chọn mascot + cấp độ để buổi sau hỏi lại từ đầu
  localStorage.removeItem("selected_instructor_idx");
  localStorage.removeItem("selected_level");

  setCard(`
    <div style="text-align:center;padding:30px;">
      <div style="font-size:64px;">🏆</div>
      <h2 style="color:var(--poke-yellow);">Xuất sắc! Hoàn thành bài học hôm nay!</h2>
      <p style="color:#aaa;font-size:16px;">Điểm đã được lưu tự động.</p>
      <a href="pkm_mode_select.html" style="display:inline-block;margin-top:20px;padding:14px 28px;
        background:var(--poke-yellow);color:#333;font-weight:bold;border-radius:14px;
        text-decoration:none;font-size:18px;">🎮 Chơi trò chơi khác</a>
    </div>`);
  const mini = document.getElementById("miniScore");
  if (mini) mini.textContent = "🏆 Xong!";
}

main().catch(e => {
  if (e?.pkmNavigating) return; // đang điều hướng sang 1 game full-screen — không phải lỗi
  console.error("Lỗi không mong muốn trong buổi học:", e);
});