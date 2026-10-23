  /**
   * ============================================================================
   * pkm_minigame_shooting.js — MINIGAME BẮN (4 làn DỌC, nhìn từ sau lưng nhân
   * vật, địa hình đổi ngẫu nhiên)
   * ============================================================================
   * File riêng biệt, KHÔNG đụng gì pkm_minigame_race.js/html,
   * pkm_minigame_race_alone.js/html hay all-shared.js. Dùng chung cơ chế
   * PkmGameLauncher.launch()/getLaunchPayload()/finishAndReturn() (xem
   * all-shared.js) và CÙNG HỢP ĐỒNG DỮ LIỆU `rounds` với 2 game kia (xem
   * comment đầu pkm_minigame_race.js để biết đầy đủ field).
   *
   * KHÁC BIỆT SO VỚI pkm_minigame_race_alone.js:
   *  - 4 LÀN DỌC (không phải ngang) — đối thủ xuất hiện ở XA (trên cùng mỗi
   *    làn) rồi tiến GẦN LẠI (to dần, ảo giác chiều sâu), nhân vật đứng cố định
   *    dưới cùng, nhìn thẳng lên các làn (tư thế "quay lưng về màn hình").
   *  - CƠ CHẾ BẮN thay vì chạy/né/ăn vàng: chạm vào 1 làn = BẮN NGAY vào làn đó
   *    (hành động dứt khoát, có kết quả tức thì) — khác với race_alone (chạm để
   *    "chuyển sang đứng ở làn đó" rồi chờ hết giờ mới chấm).
   *  - Với round mcq/image-mcq: mỗi làn có 1 đối thủ mang theo nhãn đáp án,
   *    tiến dần trong suốt round.answerMs. Chạm làn nào = bắn làn đó, CHẤM
   *    NGAY LẬP TỨC (không cần chờ hết giờ) — nếu hết giờ không bắn phát nào
   *    thì coi như sai (không bắn = trượt).
   *  - Giữa 2 câu (pha "luyện bắn"): đối thủ ngẫu nhiên xuất hiện ở các làn để
   *    bắn cho vui (chỉ cộng bộ đếm 🎯, KHÔNG ảnh hưởng điểm bài học) — tương tự
   *    tinh thần "ăn vàng" của race_alone, nhưng đổi theme thành "luyện bắn".
   *    Đối thủ tới sát nhân vật mà chưa bị bắn thì biến mất, nhân vật hơi giật
   *    mình (hiệu ứng "pks-hit") — THUẦN HÌNH ẢNH, không phạt gì.
   *  - ĐỊA HÌNH đổi ngẫu nhiên (rừng / nước / sa mạc / hang động) — đổi lại mỗi
   *    khi bắt đầu 1 pha "luyện bắn" mới, để cảnh luôn có gì đó khác.
   *
   * Dạng "typed" / "arrange" / "speaking": TẠM DỪNG, hiện modal che kín scene —
   * y hệt cơ chế của pkm_minigame_race_alone.js, không đổi gì.
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
  const ANSWER_MS = 10000;       // khung giờ mặc định: bắn đáp án / typed / arrange
  const RUN_MIN_MS = 15000;
  const RUN_MAX_MS = 20000;
  const CLEAR_BEFORE_QUESTION_MS = 1500;
  const LEAD_RUN_MS = 2500;

  const LANE_COUNT = 4;
  const PRACTICE_ENEMY_TRAVEL_MS = 2600; // đối thủ luyện bắn đi từ xa tới gần mất bao lâu
  const PRACTICE_SPAWN_INTERVAL_MS = 1700;

  const DEFAULT_MAX_RECORD_MS = 10000;
  const MIC_FAIL_THRESHOLD = 2;

  const TERRAINS = {
    forest: { cls: "terrain-forest", decor: ["🌳", "🌲", "🍃", "🌿"], enemies: ["🐛", "🐝", "🦋"] },
    water:  { cls: "terrain-water",  decor: ["🫧", "🌊", "🐚", "🪸"], enemies: ["🐟", "🐠", "🦑"] },
    desert: { cls: "terrain-desert", decor: ["🌵", "⛰️", "🦴", "🪨"], enemies: ["🦂", "🐍", "🦎"] },
    cave:   { cls: "terrain-cave",   decor: ["💎", "🕸️", "🪨", "🦴"], enemies: ["🦇", "🕷️", "👻"] },
  };
  const TERRAIN_KEYS = Object.keys(TERRAINS);

  function rand(min, max) { return Math.round(min + Math.random() * (max - min)); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ============================================================================
  // TRẠNG THÁI
  // ============================================================================

  let sceneEl, lanesEls, playerEl, killCounterEl, decorLayerEl;
  let killCount = 0;
  let currentTerrain = TERRAINS.forest;
  let activeQuestionResolver = null; // khác null = đang trong pha hỏi, tap sẽ gọi hàm này thay vì bắn luyện tập

  // ============================================================================
  // ĐỊA HÌNH — đổi ngẫu nhiên, áp class nền + rải vài icon trang trí tĩnh
  // ============================================================================

  function setupTerrain() {
    const key = randomPick(TERRAIN_KEYS);
    currentTerrain = TERRAINS[key];

    TERRAIN_KEYS.forEach(k => sceneEl.classList.remove(TERRAINS[k].cls));
    sceneEl.classList.add(currentTerrain.cls);

    const spots = [
      { top: "4%", left: "4%" }, { top: "6%", left: "88%" },
      { top: "30%", left: "2%" }, { top: "34%", left: "92%" },
    ];
    decorLayerEl.innerHTML = spots.map((s, i) => `
      <span class="pks-decor" style="top:${s.top};left:${s.left};">${randomPick(currentTerrain.decor)}</span>
    `).join("");
  }

  // ============================================================================
  // PHẢN ỨNG NHÂN VẬT
  // ============================================================================

function reactPlayer(kind) {
  // kind: "cheer" (bắn trúng / trả lời đúng) | "hit" (bắn trượt / đối thủ áp sát)
  SFX[kind === "cheer" ? "correct" : "hit"]();
  playerEl.classList.remove("pks-cheer", "pks-hit");
  void playerEl.offsetWidth;
  playerEl.classList.add("pks-" + kind);
  setTimeout(() => playerEl.classList.remove("pks-" + kind), 600);
}

function fireShotVisual(laneIdx) {
  SFX.shoot();
  const lane = lanesEls[laneIdx];
  const shot = document.createElement("div");
    shot.className = "pks-shot";
    shot.textContent = "✨";
    shot.style.bottom = "8%";
    lane.appendChild(shot);
    requestAnimationFrame(() => {
      shot.style.transitionDuration = "250ms";
      shot.style.bottom = "88%";
      shot.style.opacity = "0";
    });
    setTimeout(() => shot.remove(), 300);
  }

  // ============================================================================
  // PHA "LUYỆN BẮN" GIỮA 2 CÂU — đối thủ ngẫu nhiên, bắn cho vui, không phạt gì
  // ============================================================================

  function spawnPracticeEnemy() {
    const laneIdx = Math.floor(Math.random() * LANE_COUNT);
    const lane = lanesEls[laneIdx];
    const el = document.createElement("div");
    el.className = "pks-enemy";
    el.textContent = randomPick(currentTerrain.enemies);
    el.dataset.lane = laneIdx;
    lane.appendChild(el);

    requestAnimationFrame(() => {
      el.style.transitionDuration = PRACTICE_ENEMY_TRAVEL_MS + "ms";
      el.style.top = "88%";
      el.style.transform = "translate(-50%,0) scale(1.3)";
    });

    setTimeout(() => {
      if (!el.isConnected || el.classList.contains("pks-hit")) return;
      reactPlayer("hit"); // tới sát mà chưa bị bắn — thuần hiệu ứng, không phạt
      el.remove();
    }, PRACTICE_ENEMY_TRAVEL_MS);
  }

  function practiceShootLane(laneIdx) {
    fireShotVisual(laneIdx);
    const enemy = lanesEls[laneIdx].querySelector(".pks-enemy:not(.pks-hit)");
    if (!enemy) return;
    enemy.classList.add("pks-hit");
    killCount++;
    killCounterEl.textContent = `🎯 ${killCount}`;
    reactPlayer("cheer");
    setTimeout(() => enemy.remove(), 400);
  }

  async function runFreePhase() {
    setupTerrain(); // đổi địa hình mỗi lượt chạy thuần

    const totalMs = rand(RUN_MIN_MS, RUN_MAX_MS);
    const spawnMs = Math.max(0, totalMs - CLEAR_BEFORE_QUESTION_MS);

    const spawnTimer = setInterval(spawnPracticeEnemy, PRACTICE_SPAWN_INTERVAL_MS);
    spawnPracticeEnemy();

    await sleep(spawnMs);
    clearInterval(spawnTimer);

    await sleep(totalMs - spawnMs);
    lanesEls.forEach(lane => lane.querySelectorAll(".pks-enemy").forEach(el => el.remove()));
  }

  // ============================================================================
  // TAP LÀN — điều hướng theo trạng thái: đang hỏi thì gọi resolver, không thì
  // bắn luyện tập
  // ============================================================================

  function initLaneTapZones() {
    lanesEls.forEach((el, i) => {
      el.addEventListener("click", () => {
        if (activeQuestionResolver) { activeQuestionResolver(i); return; }
        practiceShootLane(i);
      });
    });
  }

  // ============================================================================
  // ĐỀ BÀI: hiện đè lên scene trong PROMPT_MS rồi tự ẩn
  // ============================================================================

  async function showPrompt(round) {
    const overlay = document.getElementById("pksPromptOverlay");
    overlay.innerHTML = `
      <div class="pks-prompt-card">
        ${round.promptHTML || ""}
        <div class="pks-prompt-timerbar"><div style="animation-duration:${PROMPT_MS}ms;"></div></div>
      </div>`;
    overlay.classList.add("show");

    if (round.speakPromptText) speakEN(round.speakPromptText, round.rate || 1);
    await sleep(PROMPT_MS);
    overlay.classList.remove("show");
  }

  // ============================================================================
  // CHUẨN HOÁ ROUND — cùng hợp đồng với pkm_minigame_race.js / race_alone
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
  // DẠNG mcq / image-mcq — MỖI LÀN 1 ĐỐI THỦ MANG NHÃN ĐÁP ÁN, BẮN = CHẤM NGAY
  // ============================================================================

  function openShootAnswer(round) {
    const isImg = round.type === "image-mcq";
    const laneEnemies = []; // { laneIdx, option, el }

    return new Promise(resolve => {
      let settled = false;

      const resolveRound = (laneIdx) => {
        if (settled) return;
        settled = true;
        activeQuestionResolver = null;
        clearTimeout(timeoutTimer);

        fireShotVisual(laneIdx);
        const chosen = laneEnemies.find(e => e.laneIdx === laneIdx);
        const isCorrect = !!chosen && chosen.option.value === round.correctValue;

        laneEnemies.forEach(e => {
          if (e.laneIdx === laneIdx) {
            e.el.classList.add("pks-hit");
            if (chosen) speakEN(chosen.option.speakText || chosen.option.label || chosen.option.value, round.rate);
          }
        });
        reactPlayer(isCorrect ? "cheer" : "hit");

        setTimeout(() => {
          laneEnemies.forEach(e => e.el.remove());
          resolve(isCorrect);
        }, 650);
      };

      const timeoutTimer = setTimeout(() => {
        // Hết giờ không bắn phát nào -> coi như trượt, không cộng đáp án nào
        if (settled) return;
        settled = true;
        activeQuestionResolver = null;
        reactPlayer("hit");
        laneEnemies.forEach(e => e.el.remove());
        resolve(false);
      }, round.answerMs);

      round.options.slice(0, LANE_COUNT).forEach((opt, i) => {
        const el = document.createElement("div");
        el.className = "pks-enemy";
        el.textContent = randomPick(currentTerrain.enemies);
        el.dataset.lane = i;
        el.innerHTML += isImg
          ? `<div class="pks-enemy-tag"><span class="letter">${String.fromCharCode(65 + i)}</span>
               <img src="${opt.imageUrl}" alt="" onerror="this.remove()"/></div>`
          : `<div class="pks-enemy-tag"><span class="letter">${String.fromCharCode(65 + i)}</span>${opt.label}</div>`;
        lanesEls[i].appendChild(el);
        laneEnemies.push({ laneIdx: i, option: opt, el });

        requestAnimationFrame(() => {
          el.style.transitionDuration = round.answerMs + "ms";
          el.style.top = "88%";
          el.style.transform = "translate(-50%,0) scale(1.3)";
        });
      });

      activeQuestionResolver = resolveRound;
    });
  }

  // ============================================================================
  // DẠNG typed / arrange — TẠM DỪNG, hiện modal che kín scene
  // ============================================================================

  function openAnswerPanel(round) {
    const host = document.getElementById("pksAnswerHost");
    host.classList.add("show");

    return new Promise(resolve => {
      let settled = false;
      const finish = (isCorrect) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        reactPlayer(isCorrect ? "cheer" : "hit");
        setTimeout(() => host.classList.remove("show"), 200);
        resolve(isCorrect);
      };

      const timeoutTimer = setTimeout(() => finish(false), round.answerMs);

      const replayBtnHTML = round.replayText ? `
        <div class="pks-replay-btn"><button class="poke-btn blue" id="pksReplayBtn">🔊 Nghe lại</button></div>` : "";
      const promptBlockHTML = round.keepPromptVisible
        ? `<div class="pks-answer-question">${round.promptHTML}</div>` : "";

      let bodyHTML = "";
      if (round.type === "typed") {
        bodyHTML = `
          <div class="pks-typed-row">
            <input type="text" id="pksTypedInput" class="pks-typed-input" placeholder="${round.placeholder}" autocomplete="off"/>
            <button class="poke-btn yellow" id="pksTypedSubmit">✅ Check</button>
          </div>`;
      } else { // arrange
        bodyHTML = `
          <div class="pks-arrange-hint">Tap the words in the correct order</div>
          <div class="pks-arrange-bank" id="pksArrBank"></div>
          <div class="pks-arrange-build" id="pksArrBuild"></div>
          <div style="text-align:center;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button class="poke-btn blue" id="pksArrUndo">↩️ Undo</button>
            <button class="poke-btn yellow" id="pksArrCheck">✅ Check</button>
          </div>`;
      }

      host.innerHTML = `
        <div class="pks-answer-card">
          <div class="pks-answer-timerbar"><div style="animation-duration:${round.answerMs}ms;"></div></div>
          ${replayBtnHTML}
          ${promptBlockHTML}
          ${bodyHTML}
          <div class="pks-feedback" id="pksFeedback"></div>
        </div>`;

      const feedback = host.querySelector("#pksFeedback");
      const replayBtn = host.querySelector("#pksReplayBtn");
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
        const input = host.querySelector("#pksTypedInput");
        const submitBtn = host.querySelector("#pksTypedSubmit");
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
        const bank = host.querySelector("#pksArrBank");
        const buildEl = host.querySelector("#pksArrBuild");
        const undoBtn = host.querySelector("#pksArrUndo");
        const checkBtn = host.querySelector("#pksArrCheck");
        const normArr = s => (s || "").toString().toLowerCase().replace(/[.,;'!?]/g, "").replace(/\s+/g, " ").trim();
        const picked = [];

        shuffle(round.tokens).forEach(tok => {
          const chip = document.createElement("button");
          chip.className = "pks-arrange-chip";
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
          const chips = bank.querySelectorAll(".pks-arrange-chip.used");
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
    const host = document.getElementById("pksAnswerHost");
    host.classList.add("show");

    return new Promise(resolve => {
      const promptBlockHTML = round.keepPromptVisible !== false
        ? `<div class="pks-speak-prompt">${round.promptHTML || ""}</div>` : "";

      host.innerHTML = `
        <div class="pks-answer-card">
          ${promptBlockHTML}
          <div class="pks-speak-status" id="pksSpeakStatus">🔊 Listen...</div>
          <div style="text-align:center;"><div class="pks-mic-ring" id="pksMicRing">🎤</div></div>
          <div class="pks-speak-result" id="pksSpeakResult"></div>
          <div style="text-align:center;margin-top:10px;">
            <button class="poke-btn yellow" id="pksFinishBtn" style="display:none;">✅ Finish</button>
          </div>
          <div class="pks-speak-actions" id="pksSpeakActions">
            <button class="poke-btn blue" id="pksRetrySpeak">🔄 Try again</button>
            <button class="poke-btn yellow" id="pksContinueSpeak">▶ Continue</button>
          </div>
        </div>`;

      const statusEl = host.querySelector("#pksSpeakStatus");
      const micEl = host.querySelector("#pksMicRing");
      const resultEl = host.querySelector("#pksSpeakResult");
      const finishBtn = host.querySelector("#pksFinishBtn");
      const actionsEl = host.querySelector("#pksSpeakActions");

      let firstDone = false, finalCorrect = false, finalTechFail = false, autoTimer = null;

      const finish = () => {
        clearTimeout(autoTimer);
        reactPlayer(finalTechFail ? "hit" : (finalCorrect ? "cheer" : "hit"));
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
        if (e.target.id === "pksRetrySpeak") { clearTimeout(autoTimer); doRecord(); }
        if (e.target.id === "pksContinueSpeak") finish();
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
      isCorrect = await openShootAnswer(r);
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

    sceneEl = document.getElementById("pksScene");
    lanesEls = Array.from(document.querySelectorAll(".pks-lane"));
    playerEl = document.getElementById("pksPlayer");
    killCounterEl = document.getElementById("pksKillCounter");
    decorLayerEl = document.getElementById("pksDecorLayer");

    // Đổi avatar nhân vật thành Pokémon đồng hành — đối thủ (bug/bat/spider...
    // theo địa hình) GIỮ NGUYÊN, không đổi theo yêu cầu.
    const companion = getCompanionSprite();
    const playerBodyEl = playerEl.querySelector(".pks-player-body");
    if (companion && playerBodyEl) {
      playerBodyEl.innerHTML = `<img src="${pokeAnimatedBackUrl(companion.pkmId)}" style="width:46px;height:46px;object-fit:contain;display:block;transform:rotate(-90deg);" alt="" onerror="this.src='${companion.spriteUrl}';this.style.transform='';"/>`;
    }
    
    const startOverlay = document.getElementById("pksStartOverlay");
    const startBtn = document.getElementById("pksStartBtn");

    setupTerrain();
    initLaneTapZones();

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