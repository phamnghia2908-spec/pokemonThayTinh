/**
 * ============================================================================
 * pkm_minigame_race.js — MINIGAME ĐUA THÚ (bản viết lại, dùng chung mọi dạng)
 * ============================================================================
 * Trang riêng biệt, được PkmGameLauncher.launch() CHUYỂN HẲN TRANG sang (xem
 * all-shared.js). Chỉ import hạ tầng thuần (TTS, PkmGameLauncher...) — không
 * đụng DOM/CSS của trang chính.
 *
 * ĐIỂM KHÁC BIỆT LỚN NHẤT so với bản cũ: scene (nền + 3 con thú) CHẠY LIÊN TỤC
 * bằng CSS thuần (parallax mây/đồi/cây lặp vô hạn, hiệu ứng chạy của từng con
 * thú), HOÀN TOÀN không phụ thuộc vào việc đang hỏi câu gì / học sinh có trả
 * lời hay không. JS chỉ điều khiển: (1) khi nào đề bài hiện lên rồi biến mất,
 * (2) khi nào khu trả lời hiện ra và đóng lại, (3) vị trí TƯƠNG ĐỐI (offset)
 * giữa 3 con thú xê dịch bao nhiêu sau mỗi câu.
 *
 * NHỊP 1 CÂU HỎI (đúng như đã chốt với người dùng):
 *   [ĐỀ BÀI hiện ~5s đè lên scene] -> [KHU TRẢ LỜI hiện ~10s, hết giờ = sai]
 *   -> [phản ứng đúng/sai — thú vượt lên/bị vượt] -> [CHẠY THUẦN ~15s, có
 *      xu/chướng ngại vật ngẫu nhiên, chạm màn hình để nhảy] -> lặp lại câu kế
 *
 * ============================================================================
 * HỢP ĐỒNG DỮ LIỆU (payload.rounds) — THIẾT KẾ MỞ RỘNG để sau này MỌI dạng bài
 * của Module 2 (và về sau là 3/4/5) đều gọi được minigame này, không cần sửa
 * lại engine mỗi khi thêm 1 dạng mới. Mỗi round là 1 object:
 *
 *   {
 *     type: "mcq" | "image-mcq" | "typed" | "speaking",  // thiếu -> tự suy ra
 *     instructionKey, instructionText,        // đọc hướng dẫn 1 lần/buổi (như askMCQ)
 *     promptHTML,                             // nội dung đề bài hiện đè lên scene ~5s
 *     speakPromptText,                        // đọc lên (EN) khi đề bài xuất hiện
 *     replayText,                             // nội dung đọc lại khi bấm "Nghe lại" (khu trả lời)
 *     maxReplay,                              // số lần nghe lại tối đa (mặc định Infinity)
 *     rate,                                   // tốc độ đọc (mặc định 1)
 *     // mcq / image-mcq:
 *     options: [{ label, value, imageUrl? }],
 *     correctValue,
 *     // typed:
 *     placeholder,
 *     // speaking (KHÔNG có khung giờ cứng — ghi âm xong mới tính, giống bản gốc):
 *     targetText,                             // câu/từ cần nói đúng
 *     speakBeforeText,                        // đọc mẫu trước khi học sinh nói (mặc định = targetText)
 *     matchType: "includes" | "percent" | "lenient" | "keywords", // cách chấm giọng nói
 *     matchThreshold,                         // % khớp tối thiểu (chỉ dùng khi matchType="percent")
 *     matchKeywords: [string],                // từ khoá chấp nhận (chỉ dùng khi matchType="keywords")
 *     maxRecordMs,                            // giới hạn AN TOÀN của 1 lượt ghi âm (mặc định 10000)
 *     fallbackRound,                          // round thay thế (thường là mcq/image-mcq) — engine tự
 *                                              // chuyển sang dùng round này cho các câu SAU KHI xác nhận
 *                                              // mic hỏng (xem mục MIC HỎNG GIỮA CHỪNG bên dưới)
 *     // arrange (chạm từ theo đúng thứ tự — Module 4 Đọc dùng cho dạng "sắp xếp câu"):
 *     tokens: [string],                       // các từ ĐÚNG THỨ TỰ (engine tự xáo khi hiển thị)
 *     correctValue,                           // câu hoàn chỉnh đúng (dùng để so khớp, có thể khác join(tokens))
 *     answerMs,                               // ghi đè khung giờ trả lời (mặc định ANSWER_MS=10000; "arrange"
 *                                              // thường cần lâu hơn, vd 20000)
 *   }
 *
 * MIC HỎNG GIỮA CHỪNG: engine tự đếm số lần "speaking" bị lỗi kỹ thuật liên
 * tiếp (technicalFail — mic không mở được / server nhận dạng không phản hồi,
 * KHÁC với nói sai/nói không khớp). Đủ ngưỡng (2 lần) -> DỪNG game, hiện hộp
 * thoại "Mic có hoạt động không?" (dùng lại askIfMicWorking() có sẵn) -> nếu
 * người dùng xác nhận KHÔNG hoạt động, mọi round "speaking" CÒN LẠI trong
 * payload sẽ tự động dùng `round.fallbackRound` thay thế (nếu round nào không
 * có fallbackRound thì bị bỏ qua, không tính điểm). Vì vậy MỌI round soạn dạng
 * "speaking" NÊN kèm sẵn `fallbackRound` — nơi soạn dữ liệu (module 3) chịu
 * trách nhiệm soạn cặp này.
 *
 * TƯƠNG THÍCH NGƯỢC: round hiện tại của listenDe_ChooseSentence (module-2-
 * listening.js) có dạng { questionHTML, options, correctValue, speakPromptText,
 * instructionKey, instructionText, rate } — không có `type`/`promptHTML`. Hàm
 * normalizeRound() bên dưới tự nhận diện và ánh xạ sang hợp đồng mới, nên
 * KHÔNG cần sửa gì ở module-2-listening.js để chạy được ngay bây giờ.
 *
 * KẾT QUẢ TRẢ VỀ: finishAndReturn(moduleId, results) — results là mảng
 * { correct: boolean } theo đúng thứ tự rounds (đổi shape so với bản cũ vốn
 * trả về số lần thử/attempts, vì minigame này CHỈ CHO 1 LẦN TRẢ LỜI trong thời
 * gian giới hạn, không có retry-cho-đến-khi-đúng như askMCQ thường).
 * ⚠️ module-2-listening.js hiện đang đọc kết quả này dưới dạng "attempts" cho
 * recordQuestionPassed() — cái này CẦN CẬP NHẬT ở lượt sửa module-2-listening.js
 * tiếp theo (người dùng đã chốt: làm sau). Ghi chú lại ở đây để không quên.
 *
 * ⚠️ RÀNG BUỘC QUAN TRỌNG: `rounds` bị JSON.stringify() vào localStorage trước
 * khi chuyển trang (xem PkmGameLauncher.launch trong all-shared.js) -> KHÔNG
 * ĐƯỢC nhét hàm (function) vào round, kể cả matchFn kiểu cũ của module 3. Mọi
 * logic so khớp phải khai báo bằng dữ liệu thuần (matchType/matchThreshold/
 * matchKeywords ở trên), engine tự diễn giải thành hàm so khớp bên trong.
 * ============================================================================
 */

import {
  PkmGameLauncher, speakEN, speakInstructionOnce, initTTSVoice,
  randomPick, POSITIVE_FEEDBACK, ENCOURAGE_RETRY, shuffle,
  startRecording, transcribeAudio, createMicFailTracker, noteMicResult, askIfMicWorking,
  getCompanionSprite, getRandomOpponentSprite, pokeAnimatedFrontUrl, SFX,
} from "./all-shared.js";

// ============================================================================
// HẰNG SỐ NHỊP ĐỘ
// ============================================================================

const PROMPT_MS      = 5000;   // đề bài hiện đè lên scene
const ANSWER_MS       = 10000; // khu trả lời mở (hết giờ = sai)
const RUN_MS           = 15000; // chạy thuần giữa 2 câu (game hoá, có xu/chướng ngại)
const LEAD_RUN_MS      = 2500;  // chạy thuần trước câu đầu tiên (làm quen)
const FEEDBACK_PAUSE_MS = 1100; // dừng ngắn để xem hiệu ứng vượt/bị vượt

const BOOST_CORRECT_MIN = 70, BOOST_CORRECT_MAX = 100;   // player tiến khi đúng
const BOOST_WRONG_MIN   = 55, BOOST_WRONG_MAX   = 95;    // đối thủ tiến khi mình sai
const POS_CLAMP = 150;            // giới hạn lệch trái/phải trên màn hình (px)
const CATCHUP_GAP    = BOOST_CORRECT_MAX * 2.1; // đối thủ bị bỏ xa hơn mức này -> tự bắt kịp
const CATCHUP_TARGET = BOOST_CORRECT_MAX * 0.55; // khoảng cách còn lại sau khi bắt kịp

const DEFAULT_MAX_RECORD_MS = 10000; // an toàn: tự dừng ghi âm nếu quên bấm Finish
const MIC_FAIL_THRESHOLD = 2;        // số lần lỗi kỹ thuật liên tiếp thì hỏi "mic có ổn không"

// Companion người chơi (chọn 1 lần/buổi ở all-shared.html) + 2 đối thủ random
// khác con với companion (không cần gọi mạng, build thẳng URL ảnh tĩnh).
const _companion = getCompanionSprite();
const _usedIds = _companion ? [_companion.pkmId] : [];
const _rival1Sprite = getRandomOpponentSprite(_usedIds);
_usedIds.push(_rival1Sprite.pkmId);
const _rival2Sprite = getRandomOpponentSprite(_usedIds);

// flip: false = giữ hướng gốc của GIF (giống companion, quay phải).
// Nếu con nào bị lệch hướng khi test thực tế, đổi flip: true cho con đó
// (sẽ lật ngang bằng CSS scaleX(-1)) — không cần đổi ảnh, chỉ cần đổi true/false.
const RACERS = [
  { id: "player", emoji: "🦔", pkmId: _companion?.pkmId || null, label: _companion?.name || "Bạn", isPlayer: true, flip: false },
  { id: "rival1", emoji: "🦊", pkmId: _rival1Sprite.pkmId, label: "Đối thủ 1", flip: true },
  { id: "rival2", emoji: "🐻", pkmId: _rival2Sprite.pkmId, label: "Đối thủ 2", flip: true },
];

function rand(min, max) { return Math.round(min + Math.random() * (max - min)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================================
// TRẠNG THÁI ĐUA
// ============================================================================

let pos = { player: 0, rival1: -25, rival2: -45 };
let sceneEl, trackEl, coinCounterEl;
let coinCount = 0;
let runPhaseActive = false; // chỉ cho phép chạm-để-nhảy trong lúc đang "chạy thuần"

// ============================================================================
// KHỞI TẠO CẢNH NỀN (mây/đồi/cây) — CHẠY VĨNH VIỄN BẰNG CSS, JS chỉ dựng 1 lần
// ============================================================================

function setupParallaxScenery() {
  // Mây trôi — vài đám, tốc độ/độ trễ khác nhau để không đều tăm tắp
  const cloudsEl = document.getElementById("pkrClouds");
  const cloudDefs = [
    { top: "6%",  dur: 34, delay: -4,  size: 30 },
    { top: "18%", dur: 46, delay: -20, size: 40 },
    { top: "2%",  dur: 40, delay: -30, size: 26 },
  ];
  cloudsEl.innerHTML = cloudDefs.map(c => `
    <span class="pkr-cloud" style="top:${c.top};font-size:${c.size}px;
      animation-duration:${c.dur}s;animation-delay:${c.delay}s;">☁️</span>
  `).join("");

  // Đồi núi xa + cây cối gần — lặp vô hạn nhờ kỹ thuật "2 bản sao trượt -50%"
  document.querySelectorAll("#pkrHills .pkr-half").forEach(half => {
    half.innerHTML = ["🏔️", "⛰️", "🏔️", "🏞️", "⛰️"].map(e => `<span class="pkr-hill">${e}</span>`).join("");
  });
  document.querySelectorAll("#pkrTrees .pkr-half").forEach(half => {
    half.innerHTML = ["🌳", "🌲", "🌳", "🪴", "🌲", "🌳", "🌵", "🌲"].map(e => `<span class="pkr-tree">${e}</span>`).join("");
  });
}

// ============================================================================
// VẼ 3 CON THÚ ĐUA + CẬP NHẬT VỊ TRÍ TƯƠNG ĐỐI
// ============================================================================

function renderRacers() {
  // Xáo thứ tự gán vào 3 làn mỗi ván -> con của mình KHÔNG còn cố định 1 làn,
  // nằm ngẫu nhiên (id/pos vẫn giữ nguyên theo "player"/"rival1"/"rival2" nên
  // mọi logic tính điểm/vị trí phía dưới không cần đổi gì).
  const laneOrder = shuffle(RACERS);

  trackEl.querySelectorAll(".pkr-lane").forEach((lane, i) => {
    const r = laneOrder[i];
    lane.querySelector(".pkr-car")?.remove();
    const car = document.createElement("div");
    car.className = "pkr-car" + (r.isPlayer ? " player" : "");
    car.id = "pkrCar_" + r.id;
    const flipStyle = r.flip ? "transform:scaleX(-1);" : "";
    const bodyContent = r.pkmId
      ? `<img src="${pokeAnimatedFrontUrl(r.pkmId)}" style="width:44px;height:44px;object-fit:contain;display:block;${flipStyle}filter:drop-shadow(0 4px 4px rgba(0,0,0,.35));" alt="" onerror="this.replaceWith(document.createTextNode('${r.emoji}'));"/>`
      : r.emoji;
    car.innerHTML = `
      <span class="pkr-boost-fx">💨</span>
      <div class="pkr-car-body">${bodyContent}</div>
      <div class="pkr-car-shadow"></div>
      <span class="pkr-car-name">${r.label}</span>
    `;
    lane.appendChild(car);
  });
  updateRacerPositions();
}

function updateRacerPositions() {
  RACERS.forEach(r => {
    const el = document.getElementById("pkrCar_" + r.id);
    if (!el) return;
    const px = clamp(pos[r.id], -POS_CLAMP, POS_CLAMP);
    el.style.left = `calc(30% + ${px}px)`;
  });
}

function applyCatchup() {
  ["rival1", "rival2"].forEach(id => {
    if (pos.player - pos[id] > CATCHUP_GAP) {
      pos[id] = pos.player - CATCHUP_TARGET;
    }
  });
}

async function reactToAnswer(isCorrect) {
  SFX[isCorrect ? "correct" : "wrong"]();
  const playerEl = document.getElementById("pkrCar_player");
  if (isCorrect) {
    pos.player = clamp(pos.player + rand(BOOST_CORRECT_MIN, BOOST_CORRECT_MAX), -POS_CLAMP, POS_CLAMP);
    playerEl?.classList.add("pkr-boost");
    setTimeout(() => playerEl?.classList.remove("pkr-boost"), 700);
  } else {
    playerEl?.classList.add("pkr-slip");
    setTimeout(() => playerEl?.classList.remove("pkr-slip"), 550);
    // 1 hoặc cả 2 đối thủ vượt lên — ngẫu nhiên, không con nào "biết trả lời"
    const movers = Math.random() < 0.5 ? ["rival1"] : Math.random() < 0.5 ? ["rival2"] : ["rival1", "rival2"];
    movers.forEach(id => {
      pos[id] = clamp(pos[id] + rand(BOOST_WRONG_MIN, BOOST_WRONG_MAX), -POS_CLAMP, POS_CLAMP);
      const el = document.getElementById("pkrCar_" + id);
      el?.classList.add("pkr-boost");
      setTimeout(() => el?.classList.remove("pkr-boost"), 700);
    });
  }
  applyCatchup();
  updateRacerPositions();
  await sleep(FEEDBACK_PAUSE_MS);
}

// ============================================================================
// PHA "CHẠY THUẦN" GIỮA 2 CÂU — xu/chướng ngại vật ngẫu nhiên, chạm để nhảy
// ============================================================================

function spawnTrackItem() {
  const isCoin = Math.random() < 0.65;
  const laneIdx = 1; // luôn xuất hiện ở làn giữa (làn của người chơi) cho dễ tương tác
  const lane = trackEl.querySelectorAll(".pkr-lane")[laneIdx];
  const el = document.createElement("div");
  el.className = "pkr-item";
  el.textContent = isCoin ? "🪙" : "🪨";
  el.style.left = "96%";
  el.style.top = "50%";
  el.style.transform = "translateY(-50%)";
  el.dataset.kind = isCoin ? "coin" : "rock";
  lane.appendChild(el);

  const travelMs = 2600;
  requestAnimationFrame(() => {
    el.style.transitionDuration = travelMs + "ms";
    el.style.left = "-8%";
  });
  setTimeout(() => el.remove(), travelMs + 60);
  return el;
}

function handleSceneTap() {
  if (!runPhaseActive) return;
  SFX.jump();
  const playerEl = document.getElementById("pkrCar_player");
  playerEl?.classList.remove("pkr-player-jump");
  void playerEl?.offsetWidth; // ép reflow để chạy lại animation nếu bấm liên tiếp
  playerEl?.classList.add("pkr-player-jump");

  // Bất kỳ vật phẩm nào đang hiện trên đường đều được coi là "vừa nhảy qua/gom được"
  const items = trackEl.querySelectorAll(".pkr-item:not(.pkr-collected)");
  items.forEach(el => {
    if (el.dataset.kind === "coin") {
      coinCount++;
      coinCounterEl.textContent = `🪙 ${coinCount}`;
      SFX.collect();
    }
    el.classList.add("pkr-collected");
  });
}

async function runFreePhase(ms) {
  runPhaseActive = true;
  const spawnTimer = setInterval(spawnTrackItem, 3200);
  spawnTrackItem(); // 1 vật ngay đầu pha để không bị "trống"
  await sleep(ms);
  clearInterval(spawnTimer);
  runPhaseActive = false;
  trackEl.querySelectorAll(".pkr-item").forEach(el => el.remove());
}

// ============================================================================
// ĐỀ BÀI: hiện đè lên scene trong PROMPT_MS rồi tự ẩn
// ============================================================================

async function showPrompt(round) {
  const overlay = document.getElementById("pkrPromptOverlay");
  overlay.innerHTML = `
    <div class="pkr-prompt-card">
      ${round.promptHTML || ""}
      <div class="pkr-prompt-timerbar"><div style="animation-duration:${PROMPT_MS}ms;"></div></div>
    </div>`;
  overlay.classList.add("show");

  if (round.speakPromptText) speakEN(round.speakPromptText, round.rate || 1); // không await — để bar vẫn chạy đúng nhịp
  await sleep(PROMPT_MS);
  overlay.classList.remove("show");
}

// ============================================================================
// CHUẨN HOÁ 1 ROUND — hỗ trợ cả hợp đồng mới lẫn shape cũ (askMCQ-style)
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
    // dạng speaking:
    targetText: round.targetText,
    speakBeforeText: round.speakBeforeText ?? round.targetText,
    matchType: round.matchType || "includes",
    matchThreshold: round.matchThreshold ?? 60,
    matchKeywords: round.matchKeywords || [],
    maxRecordMs: round.maxRecordMs || DEFAULT_MAX_RECORD_MS,
    fallbackRound: round.fallbackRound || null,
// dạng arrange:
    tokens: round.tokens,
    answerMs: round.answerMs || ANSWER_MS,
    // giữ đề bài hiển thị liên tục trong khu trả lời (không chỉ 5s lúc đầu):
    keepPromptVisible: !!round.keepPromptVisible,
  };
}

// ============================================================================
// KHU TRẢ LỜI — mở ANSWER_MS, tự tính "sai" nếu hết giờ. Trả Promise<boolean>
// ============================================================================

function openAnswerPanel(round) {
  const host = document.getElementById("pkrAnswerHost");
  host.classList.add("show");

  return new Promise(resolve => {
    let settled = false;
    let replayUsed = 0;
    const finish = (isCorrect) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      setTimeout(() => host.classList.remove("show"), 260);
      resolve(isCorrect);
    };

    const timeoutTimer = setTimeout(() => finish(false), round.answerMs);

    const replayBtnHTML = round.replayText ? `
      <div class="pkr-replay-btn">
        <button class="poke-btn blue" id="pkrReplayBtn">🔊 Nghe lại</button>
      </div>` : "";

    let bodyHTML = "";
    if (round.type === "typed") {
      bodyHTML = `
        <div class="pkr-typed-row">
          <input type="text" id="pkrTypedInput" class="pkr-typed-input" placeholder="${round.placeholder}" autocomplete="off"/>
          <button class="poke-btn yellow" id="pkrTypedSubmit">✅ Check</button>
        </div>`;
    } else if (round.type === "arrange") {
      bodyHTML = `
        <div class="pkr-arrange-hint">Tap the words in the correct order</div>
        <div class="pkr-arrange-bank" id="pkrArrBank"></div>
        <div class="pkr-arrange-build" id="pkrArrBuild"></div>
        <div style="text-align:center;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="poke-btn blue" id="pkrArrUndo">↩️ Undo</button>
          <button class="poke-btn yellow" id="pkrArrCheck">✅ Check</button>
        </div>`;
    } else {
      const isImg = round.type === "image-mcq";
      bodyHTML = `<div class="pkr-opts ${isImg ? "pkr-grid-img" : ""}" id="pkrOpts">
        ${round.options.map((opt, i) => isImg ? `
          <div class="pkr-btn pkr-img-opt" data-idx="${i}">
            <div class="img-wrap"><img src="${opt.imageUrl}" alt=""
              onerror="this.parentElement.innerHTML='🖼️'"/></div>
            <div class="lbl">${opt.label || ""}</div>
          </div>` : `
          <button class="pkr-btn" data-idx="${i}">${opt.label}</button>`
        ).join("")}
      </div>`;
    }

    host.innerHTML = `
    <div class="pkr-answer-inner">
      <div class="pkr-answer-timerbar"><div style="animation-duration:${round.answerMs}ms;"></div></div>
      ${replayBtnHTML}
      ${round.keepPromptVisible ? `<div class="pkr-answer-question">${round.promptHTML}</div>` : ""}
      ${bodyHTML}
      <div class="pkr-feedback" id="pkrFeedback"></div>
    </div>`;

    const feedback = host.querySelector("#pkrFeedback");
    const replayBtn = host.querySelector("#pkrReplayBtn");
    if (replayBtn) {
      replayBtn.onclick = () => {
        if (replayUsed >= round.maxReplay) return;
        replayUsed++;
        speakEN(round.replayText, round.rate);
        if (replayUsed >= round.maxReplay) { replayBtn.disabled = true; replayBtn.textContent = "🔊 Hết lượt"; }
      };
    }

    if (round.type === "typed") {
      const input = host.querySelector("#pkrTypedInput");
      const submitBtn = host.querySelector("#pkrTypedSubmit");
      input.focus();
      const norm = s => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
      const checkTypedMatch = (val) => {
        if (round.matchType === "percent") {
          const h = norm(val).split(" ").filter(Boolean);
          const t = norm(round.correctValue).split(" ").filter(Boolean);
          if (!t.length) return false;
          const hit = t.filter(w => h.includes(w)).length;
          return Math.round((hit / t.length) * 100) >= (round.matchThreshold ?? 60);
        }
        return norm(val) === norm(round.correctValue); // mặc định: khớp tuyệt đối, GIỮ NGUYÊN hành vi cũ
      };
      const submit = () => {
        if (settled) return;
        submitBtn.disabled = true; input.disabled = true;
        const isCorrect = checkTypedMatch(input.value);
        input.classList.add(isCorrect ? "correct" : "wrong");
        feedback.textContent = isCorrect ? "🎉 " + randomPick(POSITIVE_FEEDBACK) : "💡 " + randomPick(ENCOURAGE_RETRY);
        feedback.style.color = isCorrect ? "#69f0ae" : "#ffd54f";
        speakEN(input.value || round.correctValue, round.rate);
        setTimeout(() => finish(isCorrect), 500);
      };
      submitBtn.onclick = submit;
      input.onkeydown = e => { if (e.key === "Enter") submit(); };
    } else if (round.type === "arrange") {
      const bank = host.querySelector("#pkrArrBank");
      const buildEl = host.querySelector("#pkrArrBuild");
      const undoBtn = host.querySelector("#pkrArrUndo");
      const checkBtn = host.querySelector("#pkrArrCheck");
      const norm = s => (s || "").toString().toLowerCase().replace(/[.,;'!?]/g, "").replace(/\s+/g, " ").trim();
      const picked = [];

      shuffle(round.tokens).forEach(tok => {
        const chip = document.createElement("button");
        chip.className = "pkr-arrange-chip";
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
        const chips = bank.querySelectorAll(".pkr-arrange-chip.used");
        for (const c of chips) { if (c.textContent === last) { c.classList.remove("used"); break; } }
        buildEl.textContent = picked.join(" ");
      };

      checkBtn.onclick = () => {
        if (settled || !picked.length) return;
        checkBtn.disabled = true; undoBtn.disabled = true;
        const isCorrect = norm(picked.join(" ")) === norm(round.correctValue);
        feedback.textContent = isCorrect ? "🎉 " + randomPick(POSITIVE_FEEDBACK) : "💡 " + randomPick(ENCOURAGE_RETRY);
        feedback.style.color = isCorrect ? "#69f0ae" : "#ffd54f";
        setTimeout(() => finish(isCorrect), 700);
      };
    } else {
      host.querySelectorAll("#pkrOpts .pkr-btn").forEach(btn => {
        btn.onclick = () => {
          if (settled) return;
          const opt = round.options[+btn.dataset.idx];
          const isCorrect = opt.value === round.correctValue;
          host.querySelectorAll("#pkrOpts .pkr-btn").forEach(b => b.classList.add("locked"));
          btn.classList.add(isCorrect ? "correct" : "wrong");
          feedback.textContent = isCorrect ? "🎉 " + randomPick(POSITIVE_FEEDBACK) : "💡 " + randomPick(ENCOURAGE_RETRY);
          feedback.style.color = isCorrect ? "#69f0ae" : "#ffd54f";
          speakEN(opt.speakText || opt.label || opt.value, round.rate);
          setTimeout(() => finish(isCorrect), 500);
        };
      });
    }
  });
}

// ============================================================================
// CHẤM GIỌNG NÓI — dữ liệu thuần (matchType) vì round phải JSON-serializable,
// không thể truyền hàm matchFn như askSpeakingAttempt() ở all-shared.js
// ============================================================================

function checkSpeechMatch(round, heardRaw) {
  const heard = (heardRaw || "").toLowerCase().trim();
  const target = (round.targetText || "").toLowerCase().trim();
  if (round.matchType === "lenient") return true; // Mầm non: chỉ cần có nói là được
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
    const pct = (hitCount / t.length) * 100;
    return pct >= (round.matchThreshold ?? 60);
  }
  // "includes" (mặc định)
  return heard.includes(target) || target.includes(heard);
}

// ============================================================================
// PANEL GHI ÂM (dạng "speaking") — KHÔNG có khung giờ đếm ngược cứng như MCQ,
// ghi âm xong (học sinh tự bấm Finish) mới tính. Trả về Promise<{isCorrect,
// technicalFail}> — technicalFail = lỗi mic/server (KHÁC với nói sai).
// ============================================================================

function openSpeakingPanel(round) {
  const host = document.getElementById("pkrAnswerHost");
  host.classList.add("show");

  return new Promise(resolve => {
    host.innerHTML = `
      <div class="pkr-answer-inner">
        <div class="pkr-speak-prompt">${round.promptHTML || ""}</div>
        <div class="pkr-speak-status" id="pkrSpeakStatus">🔊 Listen...</div>
        <div style="text-align:center;"><div class="pkr-mic-ring" id="pkrMicRing">🎤</div></div>
        <div class="pkr-speak-result" id="pkrSpeakResult"></div>
        <div style="text-align:center;margin-top:10px;">
          <button class="poke-btn yellow" id="pkrFinishBtn" style="display:none;">✅ Finish</button>
        </div>
        <div class="pkr-speak-actions" id="pkrSpeakActions">
          <button class="poke-btn blue" id="pkrRetrySpeak">🔄 Try again</button>
          <button class="poke-btn yellow" id="pkrContinueSpeak">▶ Continue</button>
        </div>
      </div>`;

    const statusEl = host.querySelector("#pkrSpeakStatus");
    const micEl = host.querySelector("#pkrMicRing");
    const resultEl = host.querySelector("#pkrSpeakResult");
    const finishBtn = host.querySelector("#pkrFinishBtn");
    const actionsEl = host.querySelector("#pkrSpeakActions");

    let firstDone = false, finalCorrect = false, finalTechFail = false, autoTimer = null;

    const finish = () => {
      clearTimeout(autoTimer);
      setTimeout(() => host.classList.remove("show"), 260);
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
      if (e.target.id === "pkrRetrySpeak") { clearTimeout(autoTimer); doRecord(); }
      if (e.target.id === "pkrContinueSpeak") finish();
    });

    (async () => {
      if (round.speakBeforeText) { statusEl.textContent = "🔊 Listen..."; await speakEN(round.speakBeforeText, 0.9); }
      doRecord(); // tự bắt đầu ghi âm ngay sau khi đọc mẫu — không cần chạm mic
    })();
  });
}



async function playRound(round) {
  const r = normalizeRound(round);
  if (r.instructionKey) await speakInstructionOnce(r.instructionKey, r.instructionText);

  if (r.type === "speaking") {
    // Không có màn "đề bài hiện 5s rồi ẩn" — nội dung cần ở lại TRONG lúc nói
    // (đề bài + nút mic hiện cùng lúc, xem openSpeakingPanel), khác với MCQ/typed.
    const { isCorrect, technicalFail } = await openSpeakingPanel(r);
    // Lỗi kỹ thuật (mic/server) thì KHÔNG cho đối thủ vượt lên (không phải lỗi
    // của học sinh) — nhưng vẫn tính là "chưa qua được câu" ở phần điểm số.
    if (!technicalFail) await reactToAnswer(isCorrect);
    await runFreePhase(RUN_MS);
    return { correct: isCorrect, technicalFail };
  }

  await showPrompt(r);
  const isCorrect = await openAnswerPanel(r);
  await reactToAnswer(isCorrect);
  await runFreePhase(RUN_MS);
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

  sceneEl = document.getElementById("pkrScene");
  trackEl = document.getElementById("pkrTrack");
  coinCounterEl = document.getElementById("pkrCoinCounter");
  const startOverlay = document.getElementById("pkrStartOverlay");
  const startBtn = document.getElementById("pkrStartBtn");

  setupParallaxScenery();
  renderRacers();
  sceneEl.addEventListener("click", handleSceneTap);

  // Chờ 1 cú chạm để mở khoá âm thanh trên mobile trước khi đọc/chạy gì cả.
  await new Promise(resolve => { startBtn.onclick = resolve; });
  startOverlay.remove();

  await initTTSVoice();

  await runFreePhase(LEAD_RUN_MS); // chạy làm quen trước câu đầu tiên

  const micFailTracker = createMicFailTracker(MIC_FAIL_THRESHOLD);
  let micBroken = false; // true sau khi người dùng xác nhận "mic không hoạt động"

  const results = [];
  for (const round of payload.rounds) {
    // Mic đã xác nhận hỏng từ 1 câu speaking trước đó -> câu speaking nào có
    // sẵn fallbackRound thì chơi fallback thay vì cố ghi âm tiếp.
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
