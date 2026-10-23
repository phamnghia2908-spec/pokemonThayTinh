/**
 * ============================================================================
 * pkm_minigame_race_alone.js — MINIGAME ĐUA 1 MÌNH (4 hàng ngang, đổi hàng
 * bằng cách chạm — bản viết lại đúng theo game mẫu)
 * ============================================================================
 * File riêng biệt, KHÔNG đụng gì pkm_minigame_race.js/html hay all-shared.js.
 * PkmGameLauncher.launch()/getLaunchPayload()/finishAndReturn() dùng chung cơ
 * chế chuyển-trang-qua-localStorage với game kia (xem all-shared.js).
 *
 * BỐ CỤC: 4 hàng ngang xếp chồng (không phải 4 cột dọc như bản nháp trước).
 * Nhân vật đứng CỐ ĐỊNH 1 vị trí ngang (trục X), CHỈ đổi HÀNG (trục Y) khi
 * học sinh chạm vào hàng muốn nhảy tới. Không có đối thủ.
 *
 * LÚC CHẠY THUẦN (giữa 2 câu): xu/đá xuất hiện ngẫu nhiên ở 1 trong 4 hàng,
 * trôi phải -> trái. Khi vật đó trôi tới đúng vị trí X của nhân vật, engine
 * kiểm tra nhân vật CÓ ĐANG ở đúng hàng đó không:
 *   - Đúng hàng + xu -> ăn xu (cộng bộ đếm, không liên quan điểm bài học).
 *   - Đúng hàng + đá -> "đơ" 1 chút (thuần hiệu ứng, KHÔNG trừ điểm).
 *   - Khác hàng -> vật trôi qua vô hại, không có gì xảy ra.
 * Ngay trước khi câu hỏi mới xuất hiện, ngừng rải vật phẩm để "dọn đường".
 *
 * LÚC CÓ CÂU HỎI (mcq / image-mcq): mỗi hàng được gắn 1 đáp án (tối đa 4),
 * đáp án trôi phải -> trái tới đúng vị trí X của nhân vật trong khoảng
 * round.answerMs (mặc định 10s). Hết giờ -> so hàng nhân vật ĐANG ĐỨNG với
 * đáp án đúng. Sau câu hỏi, nhân vật Ở LẠI hàng vừa chọn (không tự quay về).
 *
 * Dạng "typed" / "arrange" / "speaking": TẠM DỪNG — hiện modal che kín scene,
 * làm xong mới đóng modal và chạy tiếp (y hệt bản trước, không đổi).
 *
 * HỢP ĐỒNG DỮ LIỆU (payload.rounds): DÙNG CHUNG với pkm_minigame_race.js —
 * xem comment đầu file đó (type, promptHTML, options, correctValue,
 * targetText, matchType, tokens, keepPromptVisible, fallbackRound...).
 * ============================================================================
 */

import {
  PkmGameLauncher, speakEN, speakInstructionOnce, initTTSVoice,
  randomPick, POSITIVE_FEEDBACK, ENCOURAGE_RETRY, shuffle,
  startRecording, transcribeAudio, createMicFailTracker, noteMicResult, askIfMicWorking,
  getCompanionSprite, SFX,
} from "./all-shared.js";

// ============================================================================
// HẰNG SỐ NHỊP ĐỘ
// ============================================================================

const PROMPT_MS = 5000;
const ANSWER_MS = 10000;
const RUN_MIN_MS = 15000;
const RUN_MAX_MS = 20000;
const CLEAR_BEFORE_QUESTION_MS = 1500;
const LEAD_RUN_MS = 2500;

const LANE_COUNT = 4;
const PLAYER_HOME_X = 18;      // % — vị trí ngang CỐ ĐỊNH của nhân vật trong mỗi hàng
const ITEM_TRAVEL_MS = 2400;   // xu/đá trôi từ phải sang trái mất bao lâu

const DEFAULT_MAX_RECORD_MS = 10000;
const MIC_FAIL_THRESHOLD = 2;

function rand(min, max) { return Math.round(min + Math.random() * (max - min)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================================
// TRẠNG THÁI
// ============================================================================

let laneEls = [];
let playerEl, coinCounterEl;
let currentLane = 1; // hàng bắt đầu — nhân vật sẽ Ở LẠI hàng cuối cùng chọn sau mỗi câu
let coinCount = 0;

// ============================================================================
// DÀN CẢNH — mây trôi trên dải trời mỏng, chạy vĩnh viễn bằng CSS
// ============================================================================

function setupSky() {
  const sky = document.getElementById("pkaSkyStrip");
  const defs = [
    { top: "10%", dur: 26, delay: -4, size: 20 },
    { top: "50%", dur: 34, delay: -16, size: 24 },
  ];
  sky.innerHTML = defs.map(c => `
    <span class="pka-cloud" style="top:${c.top};font-size:${c.size}px;
      animation-duration:${c.dur}s;animation-delay:${c.delay}s;">☁️</span>
  `).join("");
}

// ============================================================================
// ĐỔI HÀNG — hàm dùng chung cho cả lúc chạy thuần lẫn lúc chọn đáp án
// ============================================================================

function switchLane(newIndex) {
  if (newIndex < 0 || newIndex >= LANE_COUNT || newIndex === currentLane) {
    currentLane = newIndex; // vẫn cho phép "chạm lại đúng hàng đang đứng" không lỗi gì
  }
  currentLane = newIndex;
  SFX.move();
  playerEl.style.top = `${newIndex * (100 / LANE_COUNT) + (100 / LANE_COUNT / 2)}%`;
  laneEls.forEach((el, i) => el.classList.toggle("pka-lane-active", i === newIndex));
}

function initLaneTapZones() {
  laneEls.forEach((el, i) => {
    el.addEventListener("click", () => switchLane(i));
  });
}

// ============================================================================
// PHẢN ỨNG NHÂN VẬT
// ============================================================================

function reactPlayer(kind) {
  // kind: "dash" (đúng) | "stumble" (sai) | "dazed" (bỏ lỡ chướng ngại vật)
  if (kind === "dash") SFX.correct();
  else if (kind === "stumble") SFX.wrong();
  else if (kind === "dazed") SFX.dazed();
  playerEl.classList.remove("pka-dash", "pka-stumble", "pka-dazed");
  void playerEl.offsetWidth;
  playerEl.classList.add("pka-" + kind);
  setTimeout(() => playerEl.classList.remove("pka-" + kind), 850);
}

// ============================================================================
// PHA "CHẠY THUẦN" — xu/đá trôi TRONG 1 HÀNG, chỉ ảnh hưởng nếu nhân vật đang
// đứng ĐÚNG hàng đó lúc vật trôi ngang qua vị trí nhân vật
// ============================================================================

function spawnTrackItem() {
  const isCoin = Math.random() < 0.6;
  const laneIdx = Math.floor(Math.random() * LANE_COUNT);
  const lane = laneEls[laneIdx];
  const el = document.createElement("div");
  el.className = "pka-item";
  el.textContent = isCoin ? "🪙" : "🪨";
  el.style.left = "104%";
  lane.appendChild(el);

  requestAnimationFrame(() => {
    el.style.transitionDuration = ITEM_TRAVEL_MS + "ms";
    el.style.left = "-10%";
  });

  // Thời điểm vật phẩm trôi tới ĐÚNG vị trí X của nhân vật -> kiểm tra hàng
  const arriveFraction = (104 - PLAYER_HOME_X) / (104 - -10);
  setTimeout(() => {
    if (!el.isConnected || el.classList.contains("pka-collected")) return;
    if (laneIdx !== currentLane) return; // khác hàng -> vô hại, trôi tiếp
    if (isCoin) {
      coinCount++;
      coinCounterEl.textContent = `🪙 ${coinCount}`;
      SFX.collect();
      el.classList.add("pka-collected");
    } else {
      reactPlayer("dazed"); // bị đá va phải — thuần hiệu ứng, KHÔNG trừ điểm
    }
  }, ITEM_TRAVEL_MS * arriveFraction);

  setTimeout(() => el.remove(), ITEM_TRAVEL_MS + 100);
}

async function runFreePhase() {
  const totalMs = rand(RUN_MIN_MS, RUN_MAX_MS);
  const spawnMs = Math.max(0, totalMs - CLEAR_BEFORE_QUESTION_MS);

  const spawnTimer = setInterval(spawnTrackItem, 1500);
  spawnTrackItem();

  await sleep(spawnMs);
  clearInterval(spawnTimer); // dọn đường trước khi câu hỏi mới xuất hiện

  await sleep(totalMs - spawnMs);
  laneEls.forEach(lane => lane.querySelectorAll(".pka-item").forEach(el => el.remove()));
}

// ============================================================================
// ĐỀ BÀI: hiện đè lên scene trong PROMPT_MS rồi tự ẩn
// ============================================================================

async function showPrompt(round) {
  const overlay = document.getElementById("pkaPromptOverlay");
  overlay.innerHTML = `
    <div class="pka-prompt-card">
      ${round.promptHTML || ""}
      <div class="pka-prompt-timerbar"><div style="animation-duration:${PROMPT_MS}ms;"></div></div>
    </div>`;
  overlay.classList.add("show");

  if (round.speakPromptText) speakEN(round.speakPromptText, round.rate || 1);
  await sleep(PROMPT_MS);
  overlay.classList.remove("show");
}

// ============================================================================
// CHUẨN HOÁ ROUND — cùng hợp đồng với pkm_minigame_race.js
// ============================================================================

function normalizeRound(round) {
  const hasOptions = Array.isArray(round.options);
  const type = round.type || (hasOptions
    ? (round.options.some(o => o.imageUrl) ? "image-mcq" : "mcq")
    : "typed");
  return {
    type,
    instructionKey: round.instructionKey,
    instructionText: round.instructionText,
    promptHTML: round.promptHTML || round.questionHTML || round.contentHTML || "",
    speakPromptText: round.speakPromptText,
    replayText: round.replayText || round.speakPromptText,
    maxReplay: round.maxReplay ?? Infinity,
    rate: round.rate || 1,
    options: round.options,
    correctValue: round.correctValue,
    placeholder: round.placeholder || "Type here...",
    matchType: round.matchType || "includes",
    matchThreshold: round.matchThreshold ?? 60,
    matchKeywords: round.matchKeywords || [],
    targetText: round.targetText,
    speakBeforeText: round.speakBeforeText ?? round.targetText,
    maxRecordMs: round.maxRecordMs || DEFAULT_MAX_RECORD_MS,
    fallbackRound: round.fallbackRound || null,
    tokens: round.tokens,
    answerMs: round.answerMs || ANSWER_MS,
    keepPromptVisible: !!round.keepPromptVisible,
  };
}

// ============================================================================
// DẠNG mcq / image-mcq — ĐÁP ÁN GẮN VÀO TỪNG HÀNG, trôi tới vị trí nhân vật
// ============================================================================

function openLaneAnswer(round) {
  const isImg = round.type === "image-mcq";
  const signs = []; // { laneIdx, option, el }

  return new Promise(resolve => {
    round.options.slice(0, LANE_COUNT).forEach((opt, i) => {
      const el = document.createElement("div");
      el.className = "pka-answer-sign";
      el.innerHTML = isImg
        ? `<div class="letter">${String.fromCharCode(65 + i)}</div>
           <img src="${opt.imageUrl}" alt="" onerror="this.remove()"/>
           <span class="lbl">${opt.label || ""}</span>`
        : `<div class="letter">${String.fromCharCode(65 + i)}</div><span class="lbl">${opt.label}</span>`;
      laneEls[i].appendChild(el);
      signs.push({ laneIdx: i, option: opt, el });

      requestAnimationFrame(() => {
        el.style.transitionDuration = round.answerMs + "ms";
        el.style.left = PLAYER_HOME_X + "%";
      });
    });

    setTimeout(() => {
      const chosen = signs.find(s => s.laneIdx === currentLane);
      const isCorrect = !!chosen && chosen.option.value === round.correctValue;

      signs.forEach(s => {
        s.el.classList.add(s.laneIdx === currentLane
          ? (isCorrect ? "pka-resolved-correct" : "pka-resolved-wrong")
          : "pka-resolved-wrong");
      });
      if (chosen) speakEN(chosen.option.speakText || chosen.option.label || chosen.option.value, round.rate);
      reactPlayer(isCorrect ? "dash" : "stumble");

      setTimeout(() => {
        signs.forEach(s => s.el.remove());
        resolve(isCorrect);
      }, 700);
    }, round.answerMs);
  });
}

// ============================================================================
// DẠNG typed / arrange — TẠM DỪNG, hiện modal che kín scene
// ============================================================================

function openAnswerPanel(round) {
  const host = document.getElementById("pkaAnswerHost");
  host.classList.add("show");

  return new Promise(resolve => {
    let settled = false;
    const finish = (isCorrect) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      reactPlayer(isCorrect ? "dash" : "stumble");
      setTimeout(() => host.classList.remove("show"), 200);
      resolve(isCorrect);
    };

    const timeoutTimer = setTimeout(() => finish(false), round.answerMs);

    const replayBtnHTML = round.replayText ? `
      <div class="pka-replay-btn"><button class="poke-btn blue" id="pkaReplayBtn">🔊 Nghe lại</button></div>` : "";
    const promptBlockHTML = round.keepPromptVisible
      ? `<div class="pka-answer-question">${round.promptHTML}</div>` : "";

    let bodyHTML = "";
    if (round.type === "typed") {
      bodyHTML = `
        <div class="pka-typed-row">
          <input type="text" id="pkaTypedInput" class="pka-typed-input" placeholder="${round.placeholder}" autocomplete="off"/>
          <button class="poke-btn yellow" id="pkaTypedSubmit">✅ Check</button>
        </div>`;
    } else { // arrange
      bodyHTML = `
        <div class="pka-arrange-hint">Tap the words in the correct order</div>
        <div class="pka-arrange-bank" id="pkaArrBank"></div>
        <div class="pka-arrange-build" id="pkaArrBuild"></div>
        <div style="text-align:center;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="poke-btn blue" id="pkaArrUndo">↩️ Undo</button>
          <button class="poke-btn yellow" id="pkaArrCheck">✅ Check</button>
        </div>`;
    }

    host.innerHTML = `
      <div class="pka-answer-card">
        <div class="pka-answer-timerbar"><div style="animation-duration:${round.answerMs}ms;"></div></div>
        ${replayBtnHTML}
        ${promptBlockHTML}
        ${bodyHTML}
        <div class="pka-feedback" id="pkaFeedback"></div>
      </div>`;

    const feedback = host.querySelector("#pkaFeedback");
    const replayBtn = host.querySelector("#pkaReplayBtn");
    let replayUsed = 0;
    if (replayBtn) {
      replayBtn.onclick = () => {
        if (replayUsed >= round.maxReplay) return;
        replayUsed++;
        speakEN(round.replayText, round.rate);
        if (replayUsed >= round.maxReplay) { replayBtn.disabled = true; replayBtn.textContent = "🔊 Hết lượt"; }
      };
    }

    const norm = s => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");

    if (round.type === "typed") {
      const input = host.querySelector("#pkaTypedInput");
      const submitBtn = host.querySelector("#pkaTypedSubmit");
      input.focus();
      const checkTypedMatch = (val) => {
        if (round.matchType === "percent") {
          const h = norm(val).split(" ").filter(Boolean);
          const t = norm(round.correctValue).split(" ").filter(Boolean);
          if (!t.length) return false;
          const hit = t.filter(w => h.includes(w)).length;
          return Math.round((hit / t.length) * 100) >= (round.matchThreshold ?? 60);
        }
        return norm(val) === norm(round.correctValue);
      };
      const submit = () => {
        if (settled) return;
        submitBtn.disabled = true; input.disabled = true;
        const isCorrect = checkTypedMatch(input.value);
        feedback.textContent = isCorrect ? "🎉 " + randomPick(POSITIVE_FEEDBACK) : "💡 " + randomPick(ENCOURAGE_RETRY);
        feedback.style.color = isCorrect ? "#69f0ae" : "#ffd54f";
        speakEN(input.value || round.correctValue, round.rate);
        setTimeout(() => finish(isCorrect), 500);
      };
      submitBtn.onclick = submit;
      input.onkeydown = e => { if (e.key === "Enter") submit(); };
    } else { // arrange
      const bank = host.querySelector("#pkaArrBank");
      const buildEl = host.querySelector("#pkaArrBuild");
      const undoBtn = host.querySelector("#pkaArrUndo");
      const checkBtn = host.querySelector("#pkaArrCheck");
      const normArr = s => (s || "").toString().toLowerCase().replace(/[.,;'!?]/g, "").replace(/\s+/g, " ").trim();
      const picked = [];

      shuffle(round.tokens).forEach(tok => {
        const chip = document.createElement("button");
        chip.className = "pka-arrange-chip";
        chip.textContent = tok;
        chip.onclick = () => {
          if (settled || chip.classList.contains("used")) return;
          picked.push(tok);
          chip.classList.add("used");
          buildEl.textContent = picked.join(" ");
          speakEN(tok, round.rate);
        };
        bank.appendChild(chip);
      });

      undoBtn.onclick = () => {
        if (settled || !picked.length) return;
        const last = picked.pop();
        const chips = bank.querySelectorAll(".pka-arrange-chip.used");
        for (const c of chips) { if (c.textContent === last) { c.classList.remove("used"); break; } }
        buildEl.textContent = picked.join(" ");
      };

      checkBtn.onclick = () => {
        if (settled || !picked.length) return;
        checkBtn.disabled = true; undoBtn.disabled = true;
        const isCorrect = normArr(picked.join(" ")) === normArr(round.correctValue);
        feedback.textContent = isCorrect ? "🎉 " + randomPick(POSITIVE_FEEDBACK) : "💡 " + randomPick(ENCOURAGE_RETRY);
        feedback.style.color = isCorrect ? "#69f0ae" : "#ffd54f";
        setTimeout(() => finish(isCorrect), 500);
      };
    }
  });
}

// ============================================================================
// DẠNG speaking — TẠM DỪNG, hiện modal ghi âm (không khung giờ cứng)
// ============================================================================

function checkSpeechMatch(round, heardRaw) {
  const heard = (heardRaw || "").toLowerCase().trim();
  const target = (round.targetText || "").toLowerCase().trim();
  if (round.matchType === "lenient") return true;
  if (round.matchType === "keywords") {
    const kws = (round.matchKeywords || []).map(k => k.toLowerCase().trim()).filter(Boolean);
    if (!kws.length) return heard.includes(target) || target.includes(heard);
    return kws.some(k => heard.includes(k));
  }
  if (round.matchType === "percent") {
    const h = heard.split(/\s+/).filter(Boolean);
    const t = target.split(/\s+/).filter(Boolean);
    if (!t.length) return false;
    const hitCount = t.filter(w => h.includes(w)).length;
    return (hitCount / t.length) * 100 >= (round.matchThreshold ?? 60);
  }
  return heard.includes(target) || target.includes(heard);
}

function openSpeakingPanel(round) {
  const host = document.getElementById("pkaAnswerHost");
  host.classList.add("show");

  return new Promise(resolve => {
    const promptBlockHTML = round.keepPromptVisible !== false
      ? `<div class="pka-speak-prompt">${round.promptHTML || ""}</div>` : "";

    host.innerHTML = `
      <div class="pka-answer-card">
        ${promptBlockHTML}
        <div class="pka-speak-status" id="pkaSpeakStatus">🔊 Listen...</div>
        <div style="text-align:center;"><div class="pka-mic-ring" id="pkaMicRing">🎤</div></div>
        <div class="pka-speak-result" id="pkaSpeakResult"></div>
        <div style="text-align:center;margin-top:10px;">
          <button class="poke-btn yellow" id="pkaFinishBtn" style="display:none;">✅ Finish</button>
        </div>
        <div class="pka-speak-actions" id="pkaSpeakActions">
          <button class="poke-btn blue" id="pkaRetrySpeak">🔄 Try again</button>
          <button class="poke-btn yellow" id="pkaContinueSpeak">▶ Continue</button>
        </div>
      </div>`;

    const statusEl = host.querySelector("#pkaSpeakStatus");
    const micEl = host.querySelector("#pkaMicRing");
    const resultEl = host.querySelector("#pkaSpeakResult");
    const finishBtn = host.querySelector("#pkaFinishBtn");
    const actionsEl = host.querySelector("#pkaSpeakActions");

    let firstDone = false, finalCorrect = false, finalTechFail = false, autoTimer = null;

    const finish = () => {
      clearTimeout(autoTimer);
      reactPlayer(finalTechFail ? "dazed" : (finalCorrect ? "dash" : "stumble"));
      setTimeout(() => host.classList.remove("show"), 200);
      resolve({ isCorrect: finalCorrect, technicalFail: finalTechFail });
    };

    const doRecord = async () => {
      try {
        statusEl.textContent = "🎤 Recording... tap Finish when done!";
        micEl.classList.add("listening");
        finishBtn.style.display = "inline-block";

        const session = await startRecording(round.maxRecordMs);
        finishBtn.onclick = () => session.stop();
        const blob = await session.blob;

        finishBtn.style.display = "none";
        micEl.classList.remove("listening");
        statusEl.textContent = "⏳ Checking...";

        const transcript = await transcribeAudio(blob);
        actionsEl.style.display = "flex";

        if (transcript === null) {
          statusEl.textContent = "⚠️ Can't reach the speech server — try again in a moment.";
          if (!firstDone) { firstDone = true; finalCorrect = false; finalTechFail = true; }
          return;
        }

        const isCorrect = checkSpeechMatch(round, transcript);
        if (!firstDone) { firstDone = true; finalCorrect = isCorrect; finalTechFail = false; }

        resultEl.innerHTML = transcript ? `🗣️ You said: "<b>${transcript}</b>"` : `🗣️ (didn't hear anything clearly)`;
        statusEl.textContent = isCorrect ? "🎉 Great pronunciation!" : "👍 Nice try!";
        await speakEN(isCorrect ? randomPick(POSITIVE_FEEDBACK) : "Good try!");

        clearTimeout(autoTimer);
        autoTimer = setTimeout(finish, 2200);
      } catch (e) {
        micEl.classList.remove("listening");
        finishBtn.style.display = "none";
        statusEl.textContent = "⚠️ Microphone not available.";
        if (!firstDone) { firstDone = true; finalCorrect = false; finalTechFail = true; }
        actionsEl.style.display = "flex";
      }
    };

    host.addEventListener("click", (e) => {
      if (e.target.id === "pkaRetrySpeak") { clearTimeout(autoTimer); doRecord(); }
      if (e.target.id === "pkaContinueSpeak") finish();
    });

    (async () => {
      if (round.speakBeforeText) { statusEl.textContent = "🔊 Listen..."; await speakEN(round.speakBeforeText, 0.9); }
      doRecord();
    })();
  });
}

// ============================================================================
// 1 VÒNG CÂU HỎI ĐẦY ĐỦ
// ============================================================================

async function playRound(round) {
  const r = normalizeRound(round);
  if (r.instructionKey) await speakInstructionOnce(r.instructionKey, r.instructionText);

  if (r.type === "speaking") {
    const { isCorrect, technicalFail } = await openSpeakingPanel(r);
    await runFreePhase();
    return { correct: isCorrect, technicalFail };
  }

  await showPrompt(r);

  let isCorrect;
  if (r.type === "mcq" || r.type === "image-mcq") {
    isCorrect = await openLaneAnswer(r);
  } else {
    isCorrect = await openAnswerPanel(r); // typed / arrange
  }

  await runFreePhase();
  return { correct: isCorrect, technicalFail: false };
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

  laneEls = Array.from(document.querySelectorAll(".pka-lane"));
  playerEl = document.getElementById("pkaPlayer");
  coinCounterEl = document.getElementById("pkaCoinCounter");

  // Đổi avatar nhân vật thành Pokémon đồng hành đã chọn ở all-shared.html
  const companion = getCompanionSprite();
  const playerBodyEl = playerEl.querySelector(".pka-player-body");
  if (companion && playerBodyEl) {
    playerBodyEl.innerHTML = `<img src="${companion.spriteUrl}" style="width:42px;height:42px;object-fit:contain;display:block;" alt=""/>`;
  }
  const startOverlay = document.getElementById("pkaStartOverlay");
  const startBtn = document.getElementById("pkaStartBtn");

  setupSky();
  initLaneTapZones();
  switchLane(currentLane); // đặt nhân vật vào đúng hàng bắt đầu

  await new Promise(resolve => {
    startBtn.onclick = () => {
      // Làm nóng speechSynthesis ngay trong cử chỉ chạm — nhiều trình duyệt
      // mobile chỉ cho phép phát âm chắc chắn nếu gọi ngay lúc có gesture,
      // gọi trễ vài giây sau (qua await) dễ bị bỏ qua lần đầu.
      try {
        const unlock = new SpeechSynthesisUtterance(" ");
        unlock.volume = 0;
        window.speechSynthesis.speak(unlock);
      } catch (e) {}
      resolve();
    };
  });
  startOverlay.remove();

  await initTTSVoice();
  await sleep(LEAD_RUN_MS);

  const micFailTracker = createMicFailTracker(MIC_FAIL_THRESHOLD);
  let micBroken = false;

  const results = [];
  for (const round of payload.rounds) {
    const actualRound = (micBroken && round.type === "speaking" && round.fallbackRound)
      ? round.fallbackRound
      : round;

    const { correct, technicalFail } = await playRound(actualRound);
    results.push({ correct });

    if (actualRound.type === "speaking") {
      const shouldAsk = noteMicResult(micFailTracker, !technicalFail);
      if (shouldAsk) {
        const stillWorking = await askIfMicWorking();
        if (stillWorking) micFailTracker.consecutiveFails = 0;
        else micBroken = true;
      }
    }
  }

  PkmGameLauncher.finishAndReturn(payload.moduleId, results);
}

main();