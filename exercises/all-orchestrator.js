/**
 * ============================================================================
 * all-orchestrator.js — ĐIỀU PHỐI CHÍNH (nhảy module + khoá/mở theo tiến trình
 * + chọn Pokémon đồng hành 1 lần/buổi học)
 * ============================================================================
 * File này CHỈ điều phối. Không chứa logic riêng của module nào.
 *
 * KHOÁ/MỞ MODULE (MỚI):
 *   - Chưa chọn cấp độ  -> khoá cả 5 module (chỉ hiện, không bấm được).
 *   - Đã chọn cấp độ, CHƯA học xong Giới thiệu lần nào trong buổi -> chỉ mở
 *     module Giới thiệu, 4 module còn lại khoá.
 *   - Đã học xong Giới thiệu (ít nhất 1 lần, cờ pkl_intro_ever_done) -> mở
 *     hết cả 5 module, module nào đã học xong hiện ✅, vẫn bấm học lại được.
 *   - Cờ pkl_intro_ever_done KHÔNG bị xoá khi bấm "Học lại" cuối buổi (chỉ
 *     xoá khi kết thúc HẲN buổi học) — để không bị khoá lại vô lý.
 *
 * CHỌN POKÉMON ĐỒNG HÀNH (MỚI): ngay sau khi chọn cấp độ (chỉ 1 lần/buổi,
 * lưu ở localStorage pkl_companion), trước khi vào module Giới thiệu. Xoá
 * cùng lúc với selected_level/selected_instructor_idx khi kết thúc hẳn buổi.
 * ============================================================================
 */

import {
  initTTSVoice, injectSharedStyles, getWordBank, loadSessionData,
  renderLevelSelect, renderEndOfSessionPrompt, resetInstructionMemory,
  showTransition, PkmGameNavigating,
  renderCompanionSelect, getCompanionSprite, clearCompanion,
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
const CURRENT_IDX_SESSION_KEY = "pkl_current_module_idx"; // sessionStorage
const INTRO_DONE_KEY = "pkl_intro_ever_done"; // localStorage — sống sót qua "Học lại"

// ============================================================================
// TRẠNG THÁI "ĐÃ HOÀN THÀNH"
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
// KHOÁ/MỞ MODULE
// ============================================================================

function isModuleLocked(moduleId) {
  if (!localStorage.getItem("selected_level")) return true; // chưa chọn cấp độ -> khoá hết
  if (localStorage.getItem(INTRO_DONE_KEY) === "1") return false; // đã học Giới thiệu -> mở hết
  return moduleId !== "intro"; // chưa học Giới thiệu -> chỉ mở Giới thiệu
}

// ============================================================================
// UI: THANH PROGRESS + NHẢY MODULE
// ============================================================================

function setCard(html) {
  document.getElementById("mainCard").innerHTML = html;
}

/** Vẽ 5 chip module ở trạng thái khoá hoàn toàn — dùng khi CHƯA chọn cấp độ. */
function renderLockedChipsOnly() {
  const bar = document.getElementById("progressBar");
  if (bar) bar.style.width = "0%";
  const label = document.getElementById("stageLabel");
  if (label) label.textContent = "🎮 Hãy chọn cấp độ để bắt đầu!";
  const wrap = document.getElementById("progressSteps");
  if (wrap) {
    wrap.innerHTML = MODULES.map(m => {
      const shortLabel = m.label.replace(/^\S+\s/, "");
      return `<span class="step-dot locked" title="Hãy chọn cấp độ trước!">🔒 ${shortLabel}</span>`;
    }).join("");
  }
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
      const locked = !isDone && isModuleLocked(m.id);
      const cls = locked ? "locked" : isDone ? "done" : isActive ? "active" : "";
      const shortLabel = m.label.replace(/^\S+\s/, "");
      const icon = locked ? "🔒" : m.emoji;
      const title = locked ? "Hoàn thành phần Giới thiệu trước nhé!" : `Nhấn để chuyển tới: ${m.label}`;
      const clickAttr = locked ? "" : `onclick="window.pklJumpToModule(${i})"`;
      return `<span class="step-dot ${cls}" ${clickAttr} title="${title}">${icon} ${shortLabel}</span>`;
    }).join("");
  }

  const label = document.getElementById("stageLabel");
  if (label) label.textContent = MODULES[idx]?.label || "✅ Hoàn thành!";
}

window.pklJumpToModule = function (idx) {
  if (isModuleLocked(MODULES[idx].id) && !getCompletedSet().has(MODULES[idx].id)) return; // vẫn khoá -> không làm gì
  const current = parseInt(sessionStorage.getItem(CURRENT_IDX_SESSION_KEY) || "0", 10);
  if (idx === current) return;
  const target = MODULES[idx];
  if (confirm(`Bạn muốn chuyển sang phần: ${target.label}?`)) {
    localStorage.setItem(JUMP_KEY, String(idx));
    location.reload();
  }
};

// ============================================================================
// BADGE POKÉMON ĐỒNG HÀNH (topBar)
// ============================================================================

function refreshCompanionBadge() {
  const c = getCompanionSprite();
  const badge = document.getElementById("companionBadge");
  const img = document.getElementById("companionBadgeImg");
  const labelEl = document.getElementById("companionBadgeLabel");
  if (!badge || !img) return;
  if (c) {
    img.src = c.spriteUrl;
    img.alt = c.name || "";
    if (labelEl) labelEl.textContent = c.name || "Bạn đồng hành";
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

// ============================================================================
// CHẠY 5 MODULE, BẮT ĐẦU TỪ startIdx
// ============================================================================

async function runFromIndex(sessionVocab, poolData, level, startIdx) {
  resetInstructionMemory();

  const order = [];
  for (let k = 0; k < MODULES.length; k++) order.push((startIdx + k) % MODULES.length);

  for (let pos = 0; pos < order.length; pos++) {
    const i = order[pos];
    const isExplicitTarget = pos === 0;
    const completed = getCompletedSet();

    if (!isExplicitTarget && completed.has(MODULES[i].id)) continue;

    updateProgress(i);
    const rootEl = document.getElementById("mainCard");
    await MODULES[i].run({ sessionVocab, poolData, level, rootEl });

    completed.add(MODULES[i].id);
    saveCompletedSet(completed);

    // Học xong Giới thiệu lần đầu trong buổi -> mở khoá 4 module còn lại
    if (MODULES[i].id === "intro") localStorage.setItem(INTRO_DONE_KEY, "1");

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
  renderLockedChipsOnly();

  const wordBank = getWordBank();
  if (!wordBank.length) {
    setCard(`
      <div style="text-align:center;padding:40px;color:#ff6b6b;">
        ⚠️ Chưa có danh sách từ vựng (wordBank).<br/>
        <span style="color:#aaa;font-size:14px;">Hãy chọn từ ở trang danh sách từ trước.</span>
      </div>`);
    return;
  }
  // ─── MỚI: phát hiện đổi sang bài khác -> reset tiến trình module cũ ───
  const wbFingerprint = wordBank.slice().sort().join("|");
  const savedFingerprint = localStorage.getItem("pkl_wordbank_fp");
  if (savedFingerprint !== wbFingerprint) {
    resetCompletedSet();
    localStorage.removeItem(INTRO_DONE_KEY);
    localStorage.setItem("pkl_wordbank_fp", wbFingerprint);
  }

  const jumpIdxRaw = localStorage.getItem(JUMP_KEY);
  const isJumping = jumpIdxRaw !== null;
  let startIdx = 0;
  if (isJumping) {
    startIdx = parseInt(jumpIdxRaw, 10);
    localStorage.removeItem(JUMP_KEY);
  }

  // 1. Cấp độ
  let level;
  const savedLevel = localStorage.getItem("selected_level");
  if (savedLevel) {
    level = savedLevel;
    if (!isJumping) {
      startIdx = parseInt(sessionStorage.getItem(CURRENT_IDX_SESSION_KEY) || "0", 10);
    }
  } else {
    setCard(`<div style="text-align:center;padding:20px;color:#aaa;">Đang tải...</div>`);
    level = await renderLevelSelect(document.getElementById("mainCard"));
    resetCompletedSet();
    localStorage.removeItem(INTRO_DONE_KEY); // buổi học mới -> khoá lại 4 module còn lại
  }

  updateProgress(0); // cập nhật ngay: mở "Giới thiệu", khoá phần còn lại (hoặc mở hết nếu đã từng học)

  // 1.5. Pokémon đồng hành — CHỈ hỏi 1 lần/buổi, ngay sau khi có cấp độ
  if (!getCompanionSprite()) {
    const label = document.getElementById("stageLabel");
    if (label) label.textContent = "🤝 Hãy chọn bạn đồng hành!";
    setCard(`<div style="text-align:center;padding:20px;color:#aaa;">Đang tải danh sách Pokémon của bạn...</div>`);
    await renderCompanionSelect(document.getElementById("mainCard"));
  }
  refreshCompanionBadge();

  // 2. Tải dữ liệu buổi học
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

  // 3. Vòng lặp buổi học
  let keepGoing = true;
  while (keepGoing) {
    await runFromIndex(sessionVocab, poolData, level, startIdx);
    startIdx = 0;

    // ✅ Vừa học xong đủ 5 module -> thưởng cố định +5 EXP +5 DV (học lại
    // vẫn được thưởng, không cần điều kiện mở khoá bài mới)
    // ✅ Vừa học xong đủ 5 module -> thưởng cố định +10 EXP +10 DV (học lại
    // vẫn được thưởng, không cần điều kiện mở khoá bài mới)
    if (window.PkmScore) window.PkmScore.rewardCompletedSession(10, 10);

    const choice = await renderEndOfSessionPrompt(document.getElementById("mainCard"));
    keepGoing = choice === "replay";
    if (keepGoing) resetCompletedSet(); // KHÔNG đụng INTRO_DONE_KEY -> 5 module vẫn mở
  }

  // 4. Kết thúc hẳn buổi học — dọn mọi lựa chọn của buổi để lần sau hỏi lại từ đầu
  localStorage.removeItem("selected_instructor_idx");
  localStorage.removeItem("selected_level");
  localStorage.removeItem(INTRO_DONE_KEY);
  clearCompanion();
  refreshCompanionBadge();

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
  if (e?.pkmNavigating) return;
  console.error("Lỗi không mong muốn trong buổi học:", e);
});