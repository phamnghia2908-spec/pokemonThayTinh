  /**
   * ============================================================================
   * pkm_minigame_bigfish.js — MINIGAME "CA BOI AN NGOC" (category "quickCheck"
   * — Stage B "Quick check" cua Module 1, CUNG NHOM voi pkm_minigame_balldrop.html)
   * ============================================================================
   * NHIP CHOI y het cac game khac (race/race_alone/shooting/fish/balldrop):
   *   [CHAY THUAN ~15-20s: dan ca boi TU DO (khong theo lan co dinh), cham cho
   *    vui + dem con so, KHONG tinh diem bai hoc] -> [DE BAI hien ~5s] -> [CA
   *    BIEN MAT HET, 4 VIEN NGOC TRAI mo ra hien dap an ngay tren ngoc — an
   *    (cham) dung ngoc trai co dap an dung trong ~10s] -> [phan ung dung/sai]
   *    -> [dan ca boi tro lai binh thuong] -> lap cho cau ke tiep.
   *
   * CO CHE CAU HOI: chi can CHAM DUNG vien ngoc mang dap an dung la duoc. Cham
   * sai ngoc = SAI NGAY (khong cho cham lai cau do). Het gio chua cham vien
   * nao = SAI, to sang vien ngoc chua dap an dung.
   *
   * HOP DONG DU LIEU (payload.rounds) — CUNG SHAPE voi pkm_minigame_balldrop.js:
   *   {
   *     type: "mcq" | "image-mcq",
   *     instructionKey, instructionText,
   *     promptHTML, speakPromptText, rate,
   *     optionLang, promptLang,            // "en" | "vi"
   *     options: [{ label, value, imageUrl?, speakText? }],  // toi da 4
   *     correctValue,
   *     answerMs,                          // khung gio tra loi (mac dinh 10000)
   *   }
   * KET QUA TRA VE: finishAndReturn(moduleId, results) — results la mang
   * { correct: boolean } theo dung thu tu rounds.
   * ============================================================================
   */

  import {
    PkmGameLauncher, speakEN, speakVI, speakInstructionOnce, initTTSVoice,
    randomPick, POSITIVE_FEEDBACK, ENCOURAGE_RETRY, SFX,
  } from "./all-shared.js";

  // ============================================================================
  // HANG SO NHIP DO
  // ============================================================================
  const PROMPT_MS = 5000;
  const ANSWER_MS = 10000;
  const RUN_MIN_MS = 15000;
  const RUN_MAX_MS = 20000;
  const LEAD_RUN_MS = 2500;

  const AMBIENT_SPAWN_INTERVAL_MS = 900;
  const AMBIENT_EMOJIS = ["🐟", "🐠", "🐡"];
  const PEARL_LANE_TOPS = [14, 38, 62, 84]; // % top cho toi da 4 vien ngoc, cach deu doc man hinh

  function rand(min, max) { return Math.round(min + Math.random() * (max - min)); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function speakByLang(text, lang, rate) { return lang === "vi" ? speakVI(text, rate) : speakEN(text, rate); }

  // ============================================================================
  // TRANG THAI
  // ============================================================================
  const el = id => document.getElementById(id);
  let sceneEl;
  let funCount = 0;
  let ambientSpawnTimer = null;
  const ambientFishEls = new Set();

  // ============================================================================
  // TRANG TRI NEN — bong bong nuoc + san ho, dung 1 lan, chay vinh vien bang CSS
  // ============================================================================
  function setupDecor() {
    const bubbleLayer = el("pkfeBubbleLayer");
    const bubbleDefs = [
      { left: "6%", dur: 8, delay: -1, size: 12 },
      { left: "24%", dur: 10, delay: -4, size: 16 },
      { left: "48%", dur: 7, delay: -2, size: 10 },
      { left: "70%", dur: 9, delay: -5, size: 14 },
      { left: "88%", dur: 11, delay: -3, size: 12 },
    ];
    bubbleLayer.innerHTML = bubbleDefs.map(b => `
      <span class="pkfe-bubble" style="left:${b.left};font-size:${b.size}px;
        animation-duration:${b.dur}s;animation-delay:${b.delay}s;">🫧</span>
    `).join("");

    const reefLayer = el("pkfeReefLayer");
    const reefDefs = [
      { left: "4%", size: 44 }, { left: "22%", size: 30 }, { left: "40%", size: 50 },
      { left: "62%", size: 34 }, { left: "80%", size: 46 }, { left: "95%", size: 28 },
    ];
    reefLayer.innerHTML = reefDefs.map(r => `
      <span class="pkfe-reef" style="left:${r.left};font-size:${r.size}px;">🪸</span>
    `).join("");
  }

  // ============================================================================
  // DAN CA BOI TU DO — CHAY THUAN, cham cho vui + dem 🐟, KHONG lien quan diem
  // bai hoc. Boi tu mep nay sang mep kia o do cao NGAU NHIEN (khong theo lan
  // co dinh), co nhap nho len xuong nhe (xem CSS pkfeFishFloat) cho giong boi
  // tu nhien hon la "ca boi 4 lan".
  // ============================================================================
  function spawnAmbientFish() {
    const emoji = randomPick(AMBIENT_EMOJIS);
    const fromLeft = Math.random() < 0.5;
    const topPct = rand(10, 82);
    const travelMs = rand(3200, 6200);

    const fishEl = document.createElement("div");
    fishEl.className = "pkfe-ambient-fish";
    fishEl.textContent = emoji;
    fishEl.style.top = topPct + "%";
    fishEl.style.left = fromLeft ? "-8%" : "104%";
    fishEl.style.transform = fromLeft ? "scaleX(1)" : "scaleX(-1)";
    sceneEl.appendChild(fishEl);
    ambientFishEls.add(fishEl);

    const cleanup = () => { fishEl.remove(); ambientFishEls.delete(fishEl); };

    requestAnimationFrame(() => {
      fishEl.style.transitionDuration = travelMs + "ms";
      fishEl.style.left = fromLeft ? "104%" : "-8%";
    });
    fishEl.addEventListener("transitionend", cleanup);

    fishEl.onclick = (e) => {
      e.stopPropagation();
      funCount++;
      el("pkfeFunCounter").textContent = "🐟 " + funCount;
      SFX.collect();
      fishEl.classList.add("pkfe-ambient-caught");
      fishEl.onclick = null;
      setTimeout(cleanup, 260);
    };
  }

  function startAmbientSpawning() {
    stopAmbientSpawning();
    spawnAmbientFish();
    ambientSpawnTimer = setInterval(spawnAmbientFish, AMBIENT_SPAWN_INTERVAL_MS);
  }

  function stopAmbientSpawning() {
    if (ambientSpawnTimer) clearInterval(ambientSpawnTimer);
    ambientSpawnTimer = null;
    ambientFishEls.forEach(f => f.remove());
    ambientFishEls.clear();
  }

  async function runFreePhase(ms) {
    startAmbientSpawning();
    await sleep(ms);
    stopAmbientSpawning(); // dan ca bien mat het truoc khi vao cau hoi tiep theo
  }

  // ============================================================================
  // DE BAI: hien de len scene trong PROMPT_MS roi tu an
  // ============================================================================
  async function showPrompt(round) {
    const overlay = el("pkfePromptOverlay");
    overlay.innerHTML = `
      <div class="pkfe-prompt-card">
        ${round.promptHTML || ""}
        <div class="pkfe-prompt-timerbar"><div style="animation-duration:${PROMPT_MS}ms;"></div></div>
      </div>`;
    overlay.classList.add("show");

    if (round.speakPromptText) speakByLang(round.speakPromptText, round.promptLang, round.rate);
    await sleep(PROMPT_MS);
    overlay.classList.remove("show");
  }

  // ============================================================================
  // CHUAN HOA ROUND
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
  // PHA CAU HOI — 4 vien ngoc trai mo ra hien dap an, an dung vien la duoc
  // ============================================================================
  function openPearlAnswer(round) {
    const wrap = el("pkfePearlWrap");
    wrap.innerHTML = "";
    const pearlEntries = []; // { el, opt }

    round.options.forEach((opt, i) => {
      const pearl = document.createElement("div");
      pearl.className = "pkfe-pearl";
      pearl.style.top = PEARL_LANE_TOPS[i] + "%";
      pearl.style.animationDelay = (i * 0.12) + "s, " + (0.5 + i * 0.12) + "s";
      pearl.innerHTML = `
        <div class="pkfe-pearl-shell">
          ${opt.imageUrl
            ? `<img src="${opt.imageUrl}" alt="" onerror="this.style.display='none';"/>`
            : `<span>${opt.label}</span>`}
        </div>`;
      wrap.appendChild(pearl);
      pearlEntries.push({ el: pearl, opt });
    });
    wrap.classList.add("show");

    el("pkfeAnswerTimerWrap").classList.add("show");
    const timerBar = el("pkfeAnswerTimerBar");
    timerBar.style.transition = "none";
    timerBar.style.transform = "scaleX(1)";
    void timerBar.offsetWidth;
    requestAnimationFrame(() => {
      timerBar.style.transition = "transform " + round.answerMs + "ms linear";
      timerBar.style.transform = "scaleX(0)";
    });

    return new Promise(resolve => {
      let settled = false;
      const feedback = el("pkfeFeedback");

      const finish = async (isCorrect, chosenOpt) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        pearlEntries.forEach(p => p.el.classList.add("pkfe-locked-visual"));

        pearlEntries.forEach(p => {
          if (p.opt.value === round.correctValue) p.el.classList.add("pkfe-resolved-correct");
          else if (chosenOpt && p.opt.value === chosenOpt.value) p.el.classList.add("pkfe-resolved-wrong");
        });

        feedback.textContent = isCorrect ? "🎉 " + randomPick(POSITIVE_FEEDBACK) : "💡 " + randomPick(ENCOURAGE_RETRY);
        feedback.style.color = isCorrect ? "#69f0ae" : "#ffd54f";
        SFX[isCorrect ? "correct" : "wrong"]();

        if (chosenOpt) await speakByLang(chosenOpt.speakText || chosenOpt.label || chosenOpt.value, round.optionLang, round.rate);

        await sleep(900);
        feedback.textContent = "";
        el("pkfeAnswerTimerWrap").classList.remove("show");
        wrap.classList.remove("show");
        wrap.innerHTML = "";
        resolve(isCorrect);
      };

      pearlEntries.forEach(p => {
        p.el.onclick = () => {
          if (settled) return;
          SFX.collect(); // tieng "an ngoc" ngay luc cham, truoc khi biet dung/sai
          const isCorrect = p.opt.value === round.correctValue;
          finish(isCorrect, p.opt);
        };
      });

      var timeoutTimer = setTimeout(() => finish(false, null), round.answerMs);
    });
  }

  // ============================================================================
  // 1 VONG CAU HOI DAY DU
  // ============================================================================
  async function playRound(round, idx, total) {
    const r = normalizeRound(round);
    el("pkfeProgressBadge").textContent = (idx + 1) + "/" + total;
    if (r.instructionKey) await speakInstructionOnce(r.instructionKey, r.instructionText);
    await showPrompt(r);
    const isCorrect = await openPearlAnswer(r);
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

    sceneEl = el("pkfeScene");
    setupDecor();
    el("pkfeProgressBadge").textContent = "0/" + payload.rounds.length;

    await new Promise(resolve => {
      el("pkfeStartBtn").onclick = () => {
        try {
          const unlock = new SpeechSynthesisUtterance(" ");
          unlock.volume = 0;
          window.speechSynthesis.speak(unlock);
        } catch (e) {}
        resolve();
      };
    });
    el("pkfeStartOverlay").remove();

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