  /**
   * ============================================================================
   * pkm_minigame_fish.js — MINIGAME CÁ BƠI (4 làn DỌC, bơi từ dưới lên)
   * ============================================================================
   * File riêng biệt, KHÔNG đụng gì all-shared.js hay 3 game kia. Dùng chung cơ
   * chế PkmGameLauncher + CÙNG HỢP ĐỒNG DỮ LIỆU `rounds` (xem đầu file
   * pkm_minigame_race.js để biết đầy đủ field).
   *
   * ĐÂY LÀ pkm_minigame_race_alone.js "XOAY TRỤC": logic CHẤM ĐIỂM giữ NGUYÊN Y
   * HỆT race_alone —
   *   - Chạm vào làn nào -> cá bơi (nhảy) SANG làn đó, Ở LẠI làn vừa chọn sau
   *     mỗi câu (không tự quay về).
   *   - Xu (ở đây là ngọc trai 🦪) / chướng ngại vật (sứa 🎐) trôi TRONG 1 làn cụ
   *     thể; chỉ ảnh hưởng nếu cá ĐANG ở đúng làn đó lúc vật trôi tới vị trí cá.
   *   - Bỏ lỡ sứa -> cá "đơ" chút xíu, THUẦN HIỆU ỨNG, không trừ điểm.
   *   - mcq/image-mcq: mỗi làn có 1 biển đáp án trôi tới vị trí cá trong
   *     round.answerMs; hết giờ mới so làn cá đang đứng với đáp án đúng.
   * CHỈ KHÁC 2 CHỖ:
   *   1. Trục đảo ngược — 4 làn XẾP CẠNH NHAU (cột dọc) thay vì XẾP CHỒNG (hàng
   *      ngang); mọi thứ trôi từ TRÊN xuống DƯỚI (từ xa tới gần cá) thay vì từ
   *      PHẢI sang TRÁI; cá đổi làn theo trục NGANG (trái/phải) thay vì trục
   *      DỌC (trên/dưới).
   *   2. MỖI LẦN ĐỔI LÀN, cá bắn 1 tia nước thẳng lên phía trước (làn mới) —
   *      THUẦN HIỆU ỨNG HÌNH ẢNH, không tính là "bắn trúng/bắn trượt" gì cả,
   *      không đụng vào logic chấm điểm xu/chướng ngại vật/đáp án ở trên.
   *
   * Dạng "typed" / "arrange" / "speaking": TẠM DỪNG, hiện modal che kín scene —
   * y hệt 2 game kia, không đổi gì.
   * ============================================================================
   */

import {
  PkmGameLauncher, speakEN, speakInstructionOnce, initTTSVoice,
  randomPick, POSITIVE_FEEDBACK, ENCOURAGE_RETRY, shuffle,
  startRecording, transcribeAudio, createMicFailTracker, noteMicResult, askIfMicWorking,
  getCompanionSprite, SFX, pokeAnimatedBackUrl
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
  const PLAYER_HOME_Y = 80;      // % — vị trí DỌC cố định của cá (gần đáy)
  const ITEM_TRAVEL_MS = 2400;   // ngọc trai/sứa trôi từ trên xuống mất bao lâu

  const DEFAULT_MAX_RECORD_MS = 10000;
  const MIC_FAIL_THRESHOLD = 2;

  function rand(min, max) { return Math.round(min + Math.random() * (max - min)); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ============================================================================
  // TRẠNG THÁI
  // ============================================================================

  let laneEls = [];
  let fishEl, pearlCounterEl;
  let currentLane = 1; // làn bắt đầu — cá Ở LẠI làn cuối cùng chọn sau mỗi câu
  let pearlCount = 0;

  // ============================================================================
  // DÀN CẢNH — bong bóng trôi lên, chạy vĩnh viễn bằng CSS
  // ============================================================================

  function setupBubbles() {
    const layer = document.getElementById("pkfBubbleLayer");
    const defs = [
      { left: "8%", dur: 7, delay: -1, size: 12 },
      { left: "28%", dur: 9, delay: -4, size: 16 },
      { left: "52%", dur: 6, delay: -2, size: 10 },
      { left: "74%", dur: 8, delay: -5, size: 14 },
      { left: "90%", dur: 10, delay: -3, size: 12 },
    ];
    layer.innerHTML = defs.map(b => `
      <span class="pkf-bubble" style="left:${b.left};font-size:${b.size}px;
        animation-duration:${b.dur}s;animation-delay:${b.delay}s;">🫧</span>
    `).join("");
  }

  // ============================================================================
  // ĐỔI LÀN — chạm để cá bơi sang làn đó, kèm hiệu ứng tia nước bắn về phía trước
  // ============================================================================

function switchLane(newIndex) {
  currentLane = newIndex;
  SFX.move();
  fishEl.style.left = `${newIndex * (100 / LANE_COUNT) + (100 / LANE_COUNT / 2)}%`;
  laneEls.forEach((el, i) => el.classList.toggle("pkf-lane-active", i === newIndex));
  fireWaterJet(newIndex);
}

  function fireWaterJet(laneIdx) {
    const lane = laneEls[laneIdx];
    const jet = document.createElement("div");
    jet.className = "pkf-water-jet";
    lane.appendChild(jet);
    requestAnimationFrame(() => { jet.style.height = "60%"; });
    setTimeout(() => { jet.style.opacity = "0"; }, 220);
    setTimeout(() => jet.remove(), 550);
  }

  function initLaneTapZones() {
    laneEls.forEach((el, i) => {
      el.addEventListener("click", () => switchLane(i));
    });
  }

  // ============================================================================
  // PHẢN ỨNG CÁ
  // ============================================================================

function reactFish(kind) {
  // kind: "dash" (đúng) | "stumble" (sai) | "dazed" (bỏ lỡ sứa)
  if (kind === "dash") SFX.correct();
  else if (kind === "stumble") SFX.wrong();
  else if (kind === "dazed") SFX.dazed();
  fishEl.classList.remove("pkf-dash", "pkf-stumble", "pkf-dazed");
  void fishEl.offsetWidth;
  fishEl.classList.add("pkf-" + kind);
  setTimeout(() => fishEl.classList.remove("pkf-" + kind), 850);
}

  // ============================================================================
  // PHA "BƠI THUẦN" — ngọc trai/sứa trôi TRONG 1 LÀN, từ trên xuống dưới, chỉ
  // ảnh hưởng nếu cá ĐANG ở đúng làn đó lúc vật trôi tới vị trí cá
  // ============================================================================

  function spawnTrackItem() {
    const isPearl = Math.random() < 0.6;
    const laneIdx = Math.floor(Math.random() * LANE_COUNT);
    const lane = laneEls[laneIdx];
    const el = document.createElement("div");
    el.className = "pkf-item";
    el.textContent = isPearl ? "🦪" : "🎐";
    el.style.top = "-10%";
    lane.appendChild(el);

    requestAnimationFrame(() => {
      el.style.transitionDuration = ITEM_TRAVEL_MS + "ms";
      el.style.top = "104%";
    });

    const arriveFraction = (PLAYER_HOME_Y - -10) / (104 - -10);
    setTimeout(() => {
      if (!el.isConnected || el.classList.contains("pkf-collected")) return;
      if (laneIdx !== currentLane) return; // khác làn -> vô hại, trôi tiếp
      if (isPearl) {
        pearlCount++;
        pearlCounterEl.textContent = `🦪 ${pearlCount}`;
        SFX.collect();
        el.classList.add("pkf-collected");
      } else {
        reactFish("dazed"); // đụng sứa — thuần hiệu ứng, KHÔNG trừ điểm
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
    clearInterval(spawnTimer); // dọn dòng nước trước khi câu hỏi mới xuất hiện

    await sleep(totalMs - spawnMs);
    laneEls.forEach(lane => lane.querySelectorAll(".pkf-item").forEach(el => el.remove()));
  }

  // ============================================================================
  // ĐỀ BÀI: hiện đè lên scene trong PROMPT_MS rồi tự ẩn
  // ============================================================================

  async function showPrompt(round) {
    const overlay = document.getElementById("pkfPromptOverlay");
    overlay.innerHTML = `
      <div class="pkf-prompt-card">
        ${round.promptHTML || ""}
        <div class="pkf-prompt-timerbar"><div style="animation-duration:${PROMPT_MS}ms;"></div></div>
      </div>`;
    overlay.classList.add("show");

    if (round.speakPromptText) speakEN(round.speakPromptText, round.rate || 1);
    await sleep(PROMPT_MS);
    overlay.classList.remove("show");
  }

  // ============================================================================
  // CHUẨN HOÁ ROUND — cùng hợp đồng với 3 game kia
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
  // DẠNG mcq / image-mcq — ĐÁP ÁN GẮN VÀO TỪNG LÀN, trôi từ trên xuống vị trí cá
  // ============================================================================

  function openLaneAnswer(round) {
    const isImg = round.type === "image-mcq";
    const signs = []; // { laneIdx, option, el }

    return new Promise(resolve => {
      round.options.slice(0, LANE_COUNT).forEach((opt, i) => {
        const el = document.createElement("div");
        el.className = "pkf-answer-sign";
        el.innerHTML = isImg
          ? `<div class="letter">${String.fromCharCode(65 + i)}</div>
             <img src="${opt.imageUrl}" alt="" onerror="this.remove()"/>
             <span class="lbl">${opt.label || ""}</span>`
          : `<div class="letter">${String.fromCharCode(65 + i)}</div><span class="lbl">${opt.label}</span>`;
        laneEls[i].appendChild(el);
        signs.push({ laneIdx: i, option: opt, el });

        requestAnimationFrame(() => {
          el.style.transitionDuration = round.answerMs + "ms";
          el.style.top = PLAYER_HOME_Y + "%";
        });
      });

      setTimeout(() => {
        const chosen = signs.find(s => s.laneIdx === currentLane);
        const isCorrect = !!chosen && chosen.option.value === round.correctValue;

        signs.forEach(s => {
          s.el.classList.add(s.laneIdx === currentLane
            ? (isCorrect ? "pkf-resolved-correct" : "pkf-resolved-wrong")
            : "pkf-resolved-wrong");
        });
        if (chosen) speakEN(chosen.option.speakText || chosen.option.label || chosen.option.value, round.rate);
        reactFish(isCorrect ? "dash" : "stumble");

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
    const host = document.getElementById("pkfAnswerHost");
    host.classList.add("show");

    return new Promise(resolve => {
      let settled = false;
      const finish = (isCorrect) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        reactFish(isCorrect ? "dash" : "stumble");
        setTimeout(() => host.classList.remove("show"), 200);
        resolve(isCorrect);
      };

      const timeoutTimer = setTimeout(() => finish(false), round.answerMs);

      const replayBtnHTML = round.replayText ? `
        <div class="pkf-replay-btn"><button class="poke-btn blue" id="pkfReplayBtn">🔊 Nghe lại</button></div>` : "";
      const promptBlockHTML = round.keepPromptVisible
        ? `<div class="pkf-answer-question">${round.promptHTML}</div>` : "";

      let bodyHTML = "";
      if (round.type === "typed") {
        bodyHTML = `
          <div class="pkf-typed-row">
            <input type="text" id="pkfTypedInput" class="pkf-typed-input" placeholder="${round.placeholder}" autocomplete="off"/>
            <button class="poke-btn yellow" id="pkfTypedSubmit">✅ Check</button>
          </div>`;
      } else { // arrange
        bodyHTML = `
          <div class="pkf-arrange-hint">Tap the words in the correct order</div>
          <div class="pkf-arrange-bank" id="pkfArrBank"></div>
          <div class="pkf-arrange-build" id="pkfArrBuild"></div>
          <div style="text-align:center;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button class="poke-btn blue" id="pkfArrUndo">↩️ Undo</button>
            <button class="poke-btn yellow" id="pkfArrCheck">✅ Check</button>
          </div>`;
      }

      host.innerHTML = `
        <div class="pkf-answer-card">
          <div class="pkf-answer-timerbar"><div style="animation-duration:${round.answerMs}ms;"></div></div>
          ${replayBtnHTML}
          ${promptBlockHTML}
          ${bodyHTML}
          <div class="pkf-feedback" id="pkfFeedback"></div>
        </div>`;

      const feedback = host.querySelector("#pkfFeedback");
      const replayBtn = host.querySelector("#pkfReplayBtn");
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
        const input = host.querySelector("#pkfTypedInput");
        const submitBtn = host.querySelector("#pkfTypedSubmit");
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
        const bank = host.querySelector("#pkfArrBank");
        const buildEl = host.querySelector("#pkfArrBuild");
        const undoBtn = host.querySelector("#pkfArrUndo");
        const checkBtn = host.querySelector("#pkfArrCheck");
        const normArr = s => (s || "").toString().toLowerCase().replace(/[.,;'!?]/g, "").replace(/\s+/g, " ").trim();
        const picked = [];

        shuffle(round.tokens).forEach(tok => {
          const chip = document.createElement("button");
          chip.className = "pkf-arrange-chip";
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
          const chips = bank.querySelectorAll(".pkf-arrange-chip.used");
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
    const host = document.getElementById("pkfAnswerHost");
    host.classList.add("show");

    return new Promise(resolve => {
      const promptBlockHTML = round.keepPromptVisible !== false
        ? `<div class="pkf-speak-prompt">${round.promptHTML || ""}</div>` : "";

      host.innerHTML = `
        <div class="pkf-answer-card">
          ${promptBlockHTML}
          <div class="pkf-speak-status" id="pkfSpeakStatus">🔊 Listen...</div>
          <div style="text-align:center;"><div class="pkf-mic-ring" id="pkfMicRing">🎤</div></div>
          <div class="pkf-speak-result" id="pkfSpeakResult"></div>
          <div style="text-align:center;margin-top:10px;">
            <button class="poke-btn yellow" id="pkfFinishBtn" style="display:none;">✅ Finish</button>
          </div>
          <div class="pkf-speak-actions" id="pkfSpeakActions">
            <button class="poke-btn blue" id="pkfRetrySpeak">🔄 Try again</button>
            <button class="poke-btn yellow" id="pkfContinueSpeak">▶ Continue</button>
          </div>
        </div>`;

      const statusEl = host.querySelector("#pkfSpeakStatus");
      const micEl = host.querySelector("#pkfMicRing");
      const resultEl = host.querySelector("#pkfSpeakResult");
      const finishBtn = host.querySelector("#pkfFinishBtn");
      const actionsEl = host.querySelector("#pkfSpeakActions");

      let firstDone = false, finalCorrect = false, finalTechFail = false, autoTimer = null;

      const finish = () => {
        clearTimeout(autoTimer);
        reactFish(finalTechFail ? "dazed" : (finalCorrect ? "dash" : "stumble"));
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
        if (e.target.id === "pkfRetrySpeak") { clearTimeout(autoTimer); doRecord(); }
        if (e.target.id === "pkfContinueSpeak") finish();
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

    laneEls = Array.from(document.querySelectorAll(".pkf-lane"));
    fishEl = document.getElementById("pkfFish");
    pearlCounterEl = document.getElementById("pkfPearlCounter");

    // Đổi avatar cá thành Pokémon đồng hành đã chọn ở all-shared.html
    const companion = getCompanionSprite();
    const fishBodyEl = fishEl.querySelector(".pkf-fish-body");
    if (companion && fishBodyEl) {
      fishBodyEl.innerHTML = `<img src="${pokeAnimatedBackUrl(companion.pkmId)}" style="width:40px;height:40px;object-fit:contain;display:block;transform:rotate(-90deg);" alt="" onerror="this.src='${companion.spriteUrl}';this.style.transform='';"/>`;
    }

    const startOverlay = document.getElementById("pkfStartOverlay");
    const startBtn = document.getElementById("pkfStartBtn");

    setupBubbles();
    initLaneTapZones();
    switchLane(currentLane); // đặt cá vào đúng làn bắt đầu (không cần bắn nước lúc này, nhưng vô hại)

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