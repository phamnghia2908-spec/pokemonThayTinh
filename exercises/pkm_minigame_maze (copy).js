/**
 * ==========================================
 * pkm_minigame_maze.js — MÊ CUNG TỪ VỰNG (độc lập hoàn toàn)
 * ==========================================
 * Cùng nhóm "introPresent" với pkm_minigame_flipbook.js — dùng CHUNG dữ liệu
 * rounds từ module-1-intro.js (buildIntroRounds) và CHUNG logic dạy-từ với
 * flipbook qua pkm_intro_round_helpers.js. Chỉ khác cách THỂ HIỆN.
 *
 * ĐIỂM MỚI (bản viết lại): thay vì hiện TỪNG ẢNH 1 (ăn xong mới hiện ảnh kế
 * tiếp), giờ TOÀN BỘ ảnh của 1 PHA hiện CÙNG LÚC trong mê cung ngay từ đầu
 * pha đó — học sinh ăn ảnh nào thì chỉ ảnh đó biến mất và mở thẻ học từ cho
 * đúng từ vừa ăn, các ảnh còn lại vẫn đứng yên chờ. Ăn hết mọi ảnh của PHA 1
 * ("present") thì mê cung tự nạp lại TOÀN BỘ ảnh của PHA 2 ("phonicsSpeak").
 *
 * SỬA LỖI ĐƠ TRÊN MOBILE (đặc biệt lần ăn ảnh đầu tiên): nguyên nhân là
 * speechSynthesis + AudioContext (dùng cho TTS, tách âm IPA, tiếng "bốp" khi
 * ăn ảnh) trên nhiều trình duyệt di động CHỈ được mở khoá chắc chắn nếu có
 * lệnh gọi NGAY TRONG lúc xử lý cử chỉ chạm (gesture) — gọi trễ vài giây sau
 * (qua các "await" nạp ảnh/sinh mê cung) dễ bị trình duyệt bỏ qua/treo. Ở
 * đây ta "đánh thức" cả 2 thứ đó NGAY LÚC chạm nút Bắt đầu, trước khi làm
 * bất cứ việc gì khác.
 *
 * Bản đồ mê cung sinh ngẫu nhiên MỖI BUỔI HỌC (randomized DFS/recursive
 * backtracker) — đảm bảo mọi ô đều có đường đi tới (không có ô bị cô lập).
 */

import { PkmGameLauncher, getImageFromMap, prefetchImagesBatch, shuffle, SFX } from "./all-shared.js";
import { readPresentSequence, readPhonicsSequence, runMicRepeat, playPopSound, getSharedAudioCtx } from "./pkm_intro_round_helpers.js";

const COLS = 8, ROWS = 6;
const DIR_DELTA = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const OPPOSITE = { N: "S", S: "N", E: "W", W: "E" };

const el = id => document.getElementById(id);

// ============================================================================
// SINH MÊ CUNG (randomized DFS — đảm bảo mọi ô đều có đường tới)
// ============================================================================
function generateMaze(cols, rows) {
  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ N: false, E: false, S: false, W: false, visited: false })));

  function carve(x, y) {
    grid[y][x].visited = true;
    const dirs = shuffle(["N", "E", "S", "W"]);
    for (const d of dirs) {
      const [dx, dy] = DIR_DELTA[d];
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (grid[ny][nx].visited) continue;
      grid[y][x][d] = true;
      grid[ny][nx][OPPOSITE[d]] = true;
      carve(nx, ny);
    }
  }
  carve(0, 0);
  return grid;
}

// ============================================================================
// TRẠNG THÁI CHUNG
// ============================================================================
let maze = null;
let cellSize = 56;
let player = { x: 0, y: 0 };
let presentRounds = [];
let phonicsRounds = [];
let currentPhase = 1; // 1 = present, 2 = phonicsSpeak
let activeTargets = []; // [{ round, cell, el }] — TOÀN BỘ ảnh đang hiện trong pha hiện tại
let results = [];
let totalRounds = 0;
let doneCount = 0;
let moveLocked = false;

// ============================================================================
// VẼ MÊ CUNG
// ============================================================================
function renderMaze() {
  const wrap = el("pkzMazeWrap");
  wrap.style.width = (COLS * cellSize) + "px";
  wrap.style.height = (ROWS * cellSize) + "px";
  wrap.innerHTML = "";
  const wallT = Math.max(4, Math.round(cellSize * 0.1));

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = maze[y][x];
      const cell = document.createElement("div");
      cell.className = "pkz-cell";
      cell.style.left = (x * cellSize) + "px";
      cell.style.top = (y * cellSize) + "px";
      cell.style.width = cellSize + "px";
      cell.style.height = cellSize + "px";
      wrap.appendChild(cell);

      if (!c.N) addWallRect(wrap, x * cellSize, y * cellSize, cellSize, wallT);
      if (!c.W) addWallRect(wrap, x * cellSize, y * cellSize, wallT, cellSize);
      if (x === COLS - 1 && !c.E) addWallRect(wrap, (x + 1) * cellSize - wallT, y * cellSize, wallT, cellSize);
      if (y === ROWS - 1 && !c.S) addWallRect(wrap, x * cellSize, (y + 1) * cellSize - wallT, cellSize, wallT);
    }
  }

  const playerEl = document.createElement("div");
  playerEl.className = "pkz-player";
  playerEl.id = "pkzPlayerEl";
  playerEl.textContent = "🧒";
  playerEl.style.width = cellSize + "px";
  playerEl.style.height = cellSize + "px";
  wrap.appendChild(playerEl);

  renderPlayerPosition();
}

function addWallRect(wrap, left, top, w, h) {
  const wall = document.createElement("div");
  wall.className = "pkz-wall";
  wall.style.left = left + "px"; wall.style.top = top + "px";
  wall.style.width = w + "px"; wall.style.height = h + "px";
  wrap.appendChild(wall);
}

function renderPlayerPosition() {
  const p = el("pkzPlayerEl");
  if (!p) return;
  p.style.left = (player.x * cellSize) + "px";
  p.style.top = (player.y * cellSize) + "px";
}

function computeCellSize() {
  const vp = el("pkzViewport");
  const availW = vp.clientWidth - 16, availH = vp.clientHeight - 16;
  cellSize = Math.max(34, Math.min(64, Math.floor(Math.min(availW / COLS, availH / ROWS))));
}

// ============================================================================
// CHỌN N Ô KHÁC NHAU (không trùng nhau, không trùng vị trí người chơi hiện tại)
// ============================================================================
function pickDistinctCells(count, excludeCell) {
  const used = new Set([`${excludeCell.x},${excludeCell.y}`]);
  const cells = [];
  let guard = 0;
  while (cells.length < count && guard < 4000) {
    guard++;
    const c = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    const key = `${c.x},${c.y}`;
    if (used.has(key)) continue;
    used.add(key);
    cells.push(c);
  }
  return cells;
}

// ============================================================================
// NẠP TOÀN BỘ ẢNH CỦA 1 PHA CÙNG LÚC VÀO MÊ CUNG
// ============================================================================
function spawnAllTargets(rounds) {
  const wrap = el("pkzMazeWrap");
  wrap.querySelectorAll(".pkz-target").forEach(t => t.remove());
  activeTargets = [];

  const cells = pickDistinctCells(rounds.length, player);
  rounds.forEach((round, i) => {
    const cell = cells[i];
    if (!cell) return; // mê cung quá nhỏ so với số từ — bỏ qua phần dư (hiếm khi xảy ra)

    const t = document.createElement("div");
    t.className = "pkz-target";
    t.style.left = (cell.x * cellSize + cellSize * 0.12) + "px";
    t.style.top = (cell.y * cellSize + cellSize * 0.12) + "px";
    t.style.width = (cellSize * 0.76) + "px";
    t.style.height = (cellSize * 0.76) + "px";
    t.innerHTML = `<img src="${getImageFromMap(round.imageKeyword) || ""}" alt=""/>`;
    wrap.appendChild(t);

    activeTargets.push({ round, cell, el: t });
  });
}

// ============================================================================
// DI CHUYỂN
// ============================================================================
function tryMove(dir) {
  if (moveLocked) return;
  const c = maze[player.y][player.x];
  if (!c[dir]) return; // có tường, không đi được
  SFX?.move?.();
  const [dx, dy] = DIR_DELTA[dir];
  player.x += dx; player.y += dy;
  renderPlayerPosition();

  const hit = activeTargets.find(t => t.cell.x === player.x && t.cell.y === player.y);
  if (hit) catchTarget(hit);
}

function attachControls() {
  el("pkzUp").onclick = () => tryMove("N");
  el("pkzDown").onclick = () => tryMove("S");
  el("pkzLeft").onclick = () => tryMove("W");
  el("pkzRight").onclick = () => tryMove("E");

  let startX = null, startY = null;
  const vp = el("pkzViewport");
  vp.addEventListener("touchstart", e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, { passive: true });
  vp.addEventListener("touchend", e => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    startX = null; startY = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 32) return;
    if (Math.abs(dx) > Math.abs(dy)) tryMove(dx < 0 ? "W" : "E");
    else tryMove(dy < 0 ? "N" : "S");
  }, { passive: true });
}

// ============================================================================
// ĂN ẢNH -> HIỆN THẺ HỌC TỪ (các ảnh khác vẫn đứng yên trong mê cung)
// ============================================================================
async function catchTarget(target) {
  moveLocked = true;
  playPopSound();

  const round = target.round;
  activeTargets = activeTargets.filter(t => t !== target);
  target.el.remove();

  el("pkzCardImg").src = getImageFromMap(round.imageKeyword) || "";
  el("pkzCardOverlay").classList.add("show");
  const continueBtn = el("pkzCardContinueBtn");
  continueBtn.disabled = true;

  if (round.type === "present") renderPresentCard(round);
  else renderPhonicsCard(round);

  let settled = false;
  let localResult = round.type === "present"
    ? null
    : { attemptsUsed: 2 };

  let watchdog;
  let autoTimer;

  const finishCard = () => {
    if (settled) return;

    settled = true;
    clearTimeout(watchdog);
    clearTimeout(autoTimer);

    continueBtn.disabled = true;
    continueBtn.onclick = null;
    el("pkzCardOverlay").classList.remove("show");

    resolveCard();
  };

  let resolveCard;
  const cardFinished = new Promise(resolve => {
    resolveCard = resolve;
  });

  // Gắn handler NGAY LẬP TỨC, trước mọi await
  continueBtn.onclick = finishCard;
  continueBtn.disabled = true;

  // Nếu luồng âm thanh/microphone bị treo quá 20 giây,
  // vẫn cho phép người dùng bấm Tiếp tục.
  watchdog = setTimeout(() => {
    continueBtn.disabled = false;
  }, 20000);

  try {
    if (round.type === "present") {
      await readPresentSequence(round);
      localResult = null;
    } else {
      await readPhonicsSequence(round, el("pkzPhonicsBox"));

      const attemptsUsed = await runMicRepeat(round, {
        statusEl: el("pkzSpeakStatus"),
        micEl: el("pkzMic"),
        finishBtnEl: el("pkzMicFinishBtn"),
        resultEl: el("pkzSpeakResult"),
      });

      localResult = { attemptsUsed };
    }
  } catch (err) {
    console.warn("Lỗi khi đọc/nghe từ:", err);
    localResult = round.type === "present"
      ? null
      : { attemptsUsed: 2 };
  }

  // Đọc xong thì mở nút
  if (!settled) {
    continueBtn.disabled = false;
  }

  // TEST: tự động đóng sau 5 giây
  autoTimer = setTimeout(finishCard, 5000);

  await cardFinished;

  results.push(localResult);
  doneCount++;
  updateProgress();
  moveLocked = false;

  if (activeTargets.length === 0) {
    advancePhaseOrFinish();
  }


  
}

function renderPresentCard(round) {
  el("pkzCardContent").innerHTML = `
    <div class="pkz-word-row">
      ${round.word.split(" ").map(p => `<span class="pkz-word-tap" data-w="${p}">${p.toUpperCase()}</span>`).join("")}
    </div>
    <div class="pkz-meaning">${round.meaning}</div>
    ${round.ah ? `<div class="pkz-ah">💡 ${round.ah.en ? round.ah.en + " : " : ""}${round.ah.vi || ""}</div>` : ""}
    ${round.ai ? `<div class="pkz-ai">✨ ${round.ai}</div>` : ""}
  `;
}

function renderPhonicsCard(round) {
  el("pkzCardContent").innerHTML = `
    <div class="pkz-phonics-word">${round.word.toUpperCase()}</div>
    <div id="pkzPhonicsBox"></div>
    <div class="pkz-speak-status" id="pkzSpeakStatus"></div>
    <div class="pkz-mic-wrap"><div class="pkz-mic-ring locked" id="pkzMic">🎤</div></div>
    <button class="pkz-btn" id="pkzMicFinishBtn" style="display:none;margin:8px auto 0;">✅ Xong</button>
    <div class="pkz-speak-result" id="pkzSpeakResult"></div>
  `;
}

// ============================================================================
// ĐIỀU KHIỂN PHA / KẾT THÚC
// ============================================================================
function updateProgress() {
  el("pkzProgress").textContent = `${doneCount}/${totalRounds}`;
}

function advancePhaseOrFinish() {
  if (currentPhase === 1) {
    currentPhase = 2;
    if (!phonicsRounds.length) { finish(); return; }
    spawnAllTargets(phonicsRounds);
  } else {
    finish();
  }
}

function finish() {
  PkmGameLauncher.finishAndReturn("introPresent", results);
}

// ============================================================================
// ĐÁNH THỨC ÂM THANH NGAY TRONG CỬ CHỈ CHẠM (chống đơ lần ăn ảnh đầu tiên
// trên mobile) — PHẢI gọi đồng bộ, ngay trong handler của sự kiện click.
// ============================================================================
function warmUpAudio() {
  // ĐÃ BỎ: utterance "câm" gọi thẳng window.speechSynthesis.speak() — utterance
  // này KHÔNG đi qua speakEN() nên biến ttsBusy (all-shared.js) không biết nó
  // tồn tại; nếu nó kẹt không bắn onend (khá phổ biến trên Safari/WebView di
  // động với utterance rỗng), speakEN() lần gọi thật đầu tiên sẽ không cancel()
  // được nó, khiến hàng đợi bị nghẹn -> đơ đúng lượt đầu. flipbook không có
  // bước này và không bị đơ, nên bỏ hẳn, chỉ giữ lại phần đánh thức AudioContext
  // (dùng cho IPA + tiếng "bốp" khi ăn ảnh, không liên quan speechSynthesis).
  try {
    getSharedAudioCtx();
  } catch (e) { /* bỏ qua */ }
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

  presentRounds = payload.rounds.filter(r => r.type === "present");
  phonicsRounds = payload.rounds.filter(r => r.type === "phonicsSpeak");
  totalRounds = presentRounds.length + phonicsRounds.length;
  doneCount = 0;
  currentPhase = 1;
  results = [];

  await new Promise(resolve => {
    el("pkzStartBtn").onclick = () => { warmUpAudio(); resolve(); };
  });

  // Giữ overlay, đổi chữ thành "đang tải" thay vì xoá luôn rồi để màn hình
  // trống trong lúc chờ tải ảnh — tránh cảm giác đơ trên mobile mạng chậm.
  el("pkzStartBtn").style.display = "none";
  const startP = el("pkzStartOverlay").querySelector("p");
  if (startP) startP.textContent = "Đang tải ảnh, chờ chút nhé...";

  const keywords = [...new Set(payload.rounds.map(r => r.imageKeyword).filter(Boolean))];
  await prefetchImagesBatch(keywords);

  el("pkzStartOverlay").remove();

  computeCellSize();
  maze = generateMaze(COLS, ROWS);
  player = { x: 0, y: 0 };
  renderMaze();
  attachControls();
  updateProgress();

  if (presentRounds.length) spawnAllTargets(presentRounds);
  else advancePhaseOrFinish();
}

main();