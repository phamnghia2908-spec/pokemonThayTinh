// ===== beat.js =====
// Say the word on beat: mỗi âm tiết = 1 nhịp.
// Mức độ = số từ KHÁC NHAU trong 1 lượt (1/2/3/4). Một lượt chỉ ghép từ cùng nhóm âm tiết.
// Dữ liệu Sheet / cache / lọc bài dùng chung với multiple.js. Đếm âm tiết dùng handleSplit của tacham.js.

const COL = { lessonName: 1, vocab: 2, topic: 6, meaning: 24 }; // giống multiple.js (B, C, G, Y)
const LOWER_BOUND_UNIT = 0; // 0 = không giới hạn dưới, lấy tất cả các bài

// Dùng chung key cache với multiple.js để khỏi tải lại Sheet
const SHEET_CACHE_KEY = "multiple_sheet_rows";
const SHEET_CACHE_TIME_KEY = "multiple_sheet_rows_time";
const MAXCODE_CACHE_KEY = "multiple_max_lesson_code";
const MAXCODE_CACHE_TIME_KEY = "multiple_max_lesson_code_time";
const SHEET_CACHE_TTL_MS = 30 * 60 * 1000;

const MAX_SYL_BUCKET = 4;      // nhóm "4+" gồm mọi từ >= 4 âm tiết
const COUNT_IN_BEATS = 4;      // 4 nhịp đếm vào
const GAP_BEATS = 2;           // 2 nhịp nghỉ giữa các lượt

// ===== State =====
let boundedRows = [];
let unboundedRows = [];
const SYL_CACHE_KEY = "beat_syl_cache_v1";
const sylCache = new Map();    // word -> { count, parts } (lưu cả vào localStorage)
try {
  const saved = JSON.parse(localStorage.getItem(SYL_CACHE_KEY) || "{}");
  Object.entries(saved).forEach(([w, v]) => sylCache.set(w, v));
} catch (e) {}
function saveSylCache() {
  try { localStorage.setItem(SYL_CACHE_KEY, JSON.stringify(Object.fromEntries(sylCache))); }
  catch (e) { console.warn("⚠️ Không lưu được cache âm tiết:", e); }
}
let rounds = [];               // [{ rows: [[card, ...], [card, ...]] }]
let steps = [];                // timeline phẳng, mỗi step = 1 nhịp
let stepIdx = 0;
let nextTime = 0;
let timer = null;
let paused = false;
let shownRound = -1;
let audioCtx = null;
let cardEls = [];              // cardEls[row][card] = element

// ===== UI refs =====
const $ = (id) => document.getElementById(id);
const setupArea = $("setupArea"), playArea = $("playArea"), endArea = $("endArea");
const lessonSelect = $("lessonSelect"), topicSelect = $("topicSelect"), rangeRow = $("rangeRow");
const rangeStartSelect = $("rangeStartSelect"), rangeEndSelect = $("rangeEndSelect");
const bpmSelect = $("bpmSelect"), roundSelect = $("roundSelect");
const tickChk = $("tickChk"), dotsChk = $("dotsChk");
const startBtn = $("startBtn"), refreshBtn = $("refreshBtn"), statusLine = $("statusLine");
const pauseBtn = $("pauseBtn"), quitBtn = $("quitBtn");
const restartBtn = $("restartBtn"), backToSetupBtn = $("backToSetupBtn");
const roundText = $("roundText"), cue = $("cue"), board = $("board"), endText = $("endText");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindControls();
  status("Đang tải dữ liệu...");
  try {
    await loadAllData();
    status(`Sẵn sàng. Đã tải ${boundedRows.length} dòng dữ liệu (trong giới hạn).`);
  } catch (e) {
    console.error("❌ Init error:", e);
    status("❌ Không thể tải dữ liệu.");
  }
}

async function loadAllData() {
  // Mở tất cả các bài: không giới hạn dưới, không giới hạn bài max theo lớp
  const rows = await fetchRows();
  unboundedRows = filterByUnitRange(rows, null);
  boundedRows = unboundedRows;

  buildLessonOptions(lessonSelect, boundedRows);
  buildTopicOptions(topicSelect, boundedRows);
  buildLessonOptions(rangeStartSelect, unboundedRows);
  buildLessonOptions(rangeEndSelect, unboundedRows);
  if (rangeEndSelect.options.length > 0) rangeEndSelect.selectedIndex = rangeEndSelect.options.length - 1;
}

function bindControls() {
  document.querySelectorAll('input[name="scopeMode"]').forEach(r => (r.onchange = updateScopeVisibility));
  updateScopeVisibility();

  startBtn.onclick = startGame;
  refreshBtn.onclick = async () => {
    clearSheetCache();
    status("Đang tải lại dữ liệu mới nhất...");
    startBtn.disabled = true;
    try {
      await loadAllData();
      status(`Đã làm mới. ${boundedRows.length} dòng dữ liệu (trong giới hạn).`);
    } catch (e) {
      console.error(e);
      status("❌ Lỗi khi làm mới dữ liệu.");
    } finally {
      startBtn.disabled = false;
    }
  };

  pauseBtn.onclick = togglePause;
  quitBtn.onclick = () => { stopTimer(); showSetup(); };
  restartBtn.onclick = startGame;
  backToSetupBtn.onclick = showSetup;
  dotsChk.onchange = () => document.body.classList.toggle("nodots", !dotsChk.checked);
  document.body.classList.toggle("nodots", !dotsChk.checked);
}

function updateScopeVisibility() {
  const mode = getScopeMode();
  lessonSelect.style.display = mode === "lesson" ? "block" : "none";
  topicSelect.style.display = mode === "topic" ? "block" : "none";
  rangeRow.style.display = mode === "range" ? "flex" : "none";
}
const getScopeMode = () => document.querySelector('input[name="scopeMode"]:checked').value;
const checkedValues = (name) =>
  [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(i => parseInt(i.value, 10));

// ===== Dropdown =====
function buildLessonOptions(selectEl, rows) {
  const seen = new Map();
  rows.forEach(r => {
    const lessonName = safeStr(getCell(r, COL.lessonName)).trim();
    const unitNum = normalizeUnitId(lessonName);
    if (unitNum && !seen.has(unitNum)) seen.set(unitNum, lessonName);
  });
  selectEl.innerHTML = [...seen.entries()].sort((a, b) => a[0] - b[0])
    .map(([u, name]) => `<option value="${u}">${escapeHTML(name)}</option>`).join("");
}

function buildTopicOptions(selectEl, rows) {
  const topics = [...new Set(rows.map(r => safeStr(getCell(r, COL.topic)).trim()).filter(Boolean))].sort();
  selectEl.innerHTML = topics.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
}

// ===== Bắt đầu =====
async function startGame() {
  stopTimer();
  const levels = checkedValues("level");
  const sylBuckets = checkedValues("syl");
  if (!levels.length) { status("⚠️ Hãy tick ít nhất 1 mức độ."); return; }
  if (!sylBuckets.length) { status("⚠️ Hãy tick ít nhất 1 nhóm âm tiết."); return; }

  // 1. Lọc từ theo phạm vi (giống multiple.js)
  const scopeMode = getScopeMode();
  let scopeRows;
  if (scopeMode === "lesson") {
    const u = parseInt(lessonSelect.value, 10);
    if (!u) { status("⚠️ Vui lòng chọn 1 bài."); return; }
    scopeRows = boundedRows.filter(r => normalizeUnitId(safeStr(getCell(r, COL.lessonName))) === u);
  } else if (scopeMode === "topic") {
    const t = topicSelect.value;
    if (!t) { status("⚠️ Vui lòng chọn 1 chủ đề."); return; }
    scopeRows = boundedRows.filter(r => safeStr(getCell(r, COL.topic)).trim() === t);
  } else {
    let a = parseInt(rangeStartSelect.value, 10), b = parseInt(rangeEndSelect.value, 10);
    if (!a || !b) { status("⚠️ Vui lòng chọn dãy bài."); return; }
    if (a > b) [a, b] = [b, a];
    scopeRows = unboundedRows.filter(r => {
      const u = normalizeUnitId(safeStr(getCell(r, COL.lessonName)));
      return u >= a && u <= b;
    });
  }
  const words = uniqueWords(scopeRows);
  if (!words.length) { status("📭 Không tìm thấy từ vựng trong phạm vi này."); return; }

  // 2. Chỉ tách âm tiết cho số từ cần thiết (xáo trộn, đủ thì dừng); kết quả được lưu cache
  const total = parseInt(roundSelect.value, 10);
  const need = Math.min(words.length, total * Math.max(...levels) + 12);
  const buckets = new Map(); // nhóm âm tiết -> danh sách từ
  let usable = 0;
  startBtn.disabled = true;
  const origLog = console.log;
  console.log = () => {};    // handleSplit in rất nhiều log, tắt tạm cho nhanh
  try {
    if (!window.dictReady && words.some(w => !sylCache.has(w))) {
      status("Đang tải từ điển âm vị (lần đầu hơi lâu)...");
      await waitForDict();
    }
    const pool = shuffle([...words]);
    for (let i = 0; i < pool.length && usable < need; i++) {
      const info = await analyzeWord(pool[i]);
      const bk = Math.min(info.count, MAX_SYL_BUCKET);
      if (!sylBuckets.includes(bk)) continue;
      if (!buckets.has(bk)) buckets.set(bk, []);
      buckets.get(bk).push(pool[i]);
      usable++;
      if (i % 8 === 0) {
        status(`Đang chuẩn bị từ ${usable}/${need}...`);
        await new Promise(r => setTimeout(r, 0));
      }
    }
  } finally {
    console.log = origLog;
    startBtn.disabled = false;
    saveSylCache();
  }
  if (!buckets.size) { status("📭 Không có từ nào thuộc nhóm âm tiết đã chọn."); return; }

  // 4. Sinh lượt + timeline
  rounds = buildRounds(buckets, levels, parseInt(roundSelect.value, 10));
  steps = buildSteps(rounds);
  status("");
  showPlay();
  runGame();
}

function uniqueWords(rows) {
  const set = new Set();
  rows.forEach(r => {
    const raw = safeStr(getCell(r, COL.vocab)).trim();
    const first = (splitTargets(raw)[0] || raw).toLowerCase();
    if (first) set.add(first);
  });
  return [...set];
}

// ===== Đếm âm tiết =====
function waitForDict() {
  return new Promise(resolve => {
    let waited = 0;
    const check = () => {
      if (window.dictReady || waited >= 10000) return resolve();
      waited += 200;
      setTimeout(check, 200);
    };
    check();
  });
}

async function analyzeWord(word) {
  if (sylCache.has(word)) return sylCache.get(word);
  let result = null;
  const known = word.split(/\s+/).every(w => window.dictMap && window.dictMap.has(w));

  if (known && typeof window.handleSplit === "function") {
    try {
      const holder = document.createElement("div"); // không gắn vào DOM
      await window.handleSplit(word, holder);
      // Chỉ lấy div âm tiết (con trực tiếp của .word-block); chữ câm cũng có data-index nên không đếm
      const groups = [...holder.querySelectorAll(".word-block > div[data-index]")];
      const parts = groups
        .map(g => [...g.querySelectorAll(".sound-unit span")].map(s => s.textContent).join(""))
        .filter(Boolean);
      if (parts.length) {
        const same = parts.join("") === word.replace(/\s+/g, "");
        result = { count: parts.length, parts: same ? parts : chunkWord(word, parts.length) };
      }
    } catch (e) {
      console.warn("handleSplit lỗi với từ:", word, e);
    }
  }
  if (!result) {
    const n = fallbackCount(word);
    result = { count: n, parts: chunkWord(word, n) };
  }
  sylCache.set(word, result);
  return result;
}

function fallbackCount(word) {
  const w = word.toLowerCase().replace(/[^a-z\s]/g, "");
  let total = 0;
  w.split(/\s+/).filter(Boolean).forEach(t => {
    let n = (t.match(/[aeiouy]+/g) || []).length;
    if (n > 1 && /[^aeiouy]e$/.test(t) && !/le$/.test(t)) n--; // e câm cuối từ
    total += Math.max(1, n);
  });
  return Math.max(1, total);
}

function chunkWord(word, n) {
  const w = word.replace(/\s+/g, "");
  if (n <= 1) return [w];
  const out = [];
  for (let i = 0; i < n; i++) out.push(w.slice(Math.round(i * w.length / n), Math.round((i + 1) * w.length / n)));
  return out.filter(Boolean);
}

// ===== Sinh lượt =====
function buildRounds(buckets, levels, total) {
  const decks = new Map(); // bucket -> bộ bài xáo trộn, rút dần để ít lặp từ
  const draw = (b, k) => {
    const picked = [];
    while (picked.length < k) {
      let deck = decks.get(b);
      if (!deck || !deck.length) { deck = shuffle([...buckets.get(b)]); decks.set(b, deck); }
      const w = deck.pop();
      if (!picked.includes(w)) picked.push(w);
      else if (buckets.get(b).length <= picked.length) break;
    }
    return picked;
  };

  const out = [];
  for (let r = 0; r < total; r++) {
    // Chọn mức độ ngẫu nhiên trong các mức đã tick, miễn có nhóm đủ từ
    let lv = null, bucketKeys = [];
    for (const cand of shuffle([...levels])) {
      bucketKeys = [...buckets.keys()].filter(b => buckets.get(b).length >= cand);
      if (bucketKeys.length) { lv = cand; break; }
    }
    if (!lv) { lv = 1; bucketKeys = [...buckets.keys()]; }
    const b = bucketKeys[Math.floor(Math.random() * bucketKeys.length)];
    const ws = draw(b, lv);

    // Số lần xuất hiện của từ trong 1 hàng (1 hàng = 1 ô nhịp)
    const base = b === 1 ? 4 : b === 2 ? randOf([2, 3]) : randOf([1, 2]);
    const n = Math.max(base, ws.length);

    const counts = ws.map(() => Math.floor(n / ws.length));
    shuffle(ws.map((_, i) => i)).slice(0, n % ws.length).forEach(i => counts[i]++);

    const blocks = ws.map((w, i) => ({ w, ci: i, cnt: counts[i] }));
    const mk = (list) => list.flatMap(bk =>
      Array.from({ length: bk.cnt }, () => ({ word: bk.w, parts: sylCache.get(bk.w).parts, ci: bk.ci })));
    // Hàng 2 đảo thứ tự khối: in-in-on-on / on-on-in-in
    out.push({ rows: [mk(blocks), mk([...blocks].reverse())] });
  }
  return out;
}

function buildSteps(rs) {
  const s = [];
  for (let i = 1; i <= COUNT_IN_BEATS; i++) s.push({ type: "count", round: 0, n: i });
  rs.forEach((rd, r) => {
    rd.rows.forEach((row, ri) => {
      let first = true;
      row.forEach((card, ci) => {
        for (let k = 0; k < card.parts.length; k++) {
          s.push({ type: "beat", round: r, row: ri, card: ci, syl: k, accent: first });
          first = false;
        }
      });
    });
    if (r < rs.length - 1) for (let g = 0; g < GAP_BEATS; g++) s.push({ type: "gap", round: r + 1 });
  });
  return s;
}

// ===== Chạy =====
function runGame() {
  stepIdx = 0;
  shownRound = -1;
  paused = false;
  pauseBtn.textContent = "Tạm dừng";
  ensureAudio();
  nextTime = performance.now() + 500;
  timer = setTimeout(tickStep, 500);
}

function tickStep() {
  if (paused) return;
  if (stepIdx >= steps.length) { finishGame(); return; }
  applyStep(steps[stepIdx++]);
  const beatMs = 60000 / parseInt(bpmSelect.value, 10);
  nextTime += beatMs;
  timer = setTimeout(tickStep, Math.max(0, nextTime - performance.now()));
}

function applyStep(s) {
  if (s.round !== shownRound) renderRound(s.round);
  clearHighlight();
  if (s.type === "count") { cue.textContent = String(s.n); playTick(s.n === 1); return; }
  if (s.type === "gap") { cue.textContent = "Chuẩn bị..."; playTick(false, true); return; }
  cue.textContent = "";
  const card = cardEls[s.row][s.card];
  card.classList.add("cur");
  card.querySelectorAll(".syl")[s.syl].classList.add("on");
  playTick(s.accent);
}

function renderRound(r) {
  shownRound = r;
  roundText.textContent = `${r + 1}/${rounds.length}`;
  board.innerHTML = "";
  cardEls = rounds[r].rows.map(row => {
    const rowEl = document.createElement("div");
    rowEl.className = "brow";
    const els = row.map(card => {
      const el = document.createElement("div");
      el.className = `wcard c${card.ci}`;
      el.innerHTML = card.parts
        .map(p => `<span class="syl">${escapeHTML(p)}</span>`)
        .join('<span class="dot">·</span>');
      rowEl.appendChild(el);
      return el;
    });
    board.appendChild(rowEl);
    return els;
  });
}

function clearHighlight() {
  board.querySelectorAll(".cur").forEach(e => e.classList.remove("cur"));
  board.querySelectorAll(".syl.on").forEach(e => e.classList.remove("on"));
}

function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? "Tiếp tục" : "Tạm dừng";
  if (paused) { clearTimeout(timer); return; }
  nextTime = performance.now() + 400;
  timer = setTimeout(tickStep, 400);
}

function stopTimer() { clearTimeout(timer); timer = null; paused = false; }

function finishGame() {
  stopTimer();
  endText.textContent = `Đã đọc xong ${rounds.length} lượt.`;
  playArea.style.display = "none";
  endArea.style.display = "block";
}

// ===== Tiếng tick (Web Audio, không cần file) =====
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playTick(accent, soft) {
  if (!tickChk.checked || !audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = accent ? 1400 : 900;
  const peak = soft ? 0.08 : accent ? 0.35 : 0.22;
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.08);
}

// ===== Điều hướng màn hình =====
function showSetup() {
  setupArea.style.display = "block"; playArea.style.display = "none"; endArea.style.display = "none";
}
function showPlay() {
  setupArea.style.display = "none"; playArea.style.display = "block"; endArea.style.display = "none";
}

// ===== Sheet fetch + cache (giống multiple.js) =====
async function fetchRows() {
  const cached = readCache(SHEET_CACHE_KEY, SHEET_CACHE_TIME_KEY);
  if (cached.hit) return cached.value;
  const res = await fetch(SHEET_URL, { cache: "no-store" });
  const data = await res.json();
  const rows = data.rows || data;
  writeCache(SHEET_CACHE_KEY, SHEET_CACHE_TIME_KEY, rows);
  return rows;
}

function readCache(key, timeKey) {
  try {
    const raw = localStorage.getItem(key);
    const t = parseInt(localStorage.getItem(timeKey) || "0", 10);
    if (raw === null || Date.now() - t > SHEET_CACHE_TTL_MS) return { hit: false };
    return { hit: true, value: JSON.parse(raw).v };
  } catch (e) { return { hit: false }; }
}

function writeCache(key, timeKey, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ v: value }));
    localStorage.setItem(timeKey, Date.now().toString());
  } catch (e) { console.warn("⚠️ Không thể lưu cache:", e); }
}

function clearSheetCache() {
  [SHEET_CACHE_KEY, SHEET_CACHE_TIME_KEY, MAXCODE_CACHE_KEY, MAXCODE_CACHE_TIME_KEY]
    .forEach(k => localStorage.removeItem(k));
}

function getCell(r, idx) {
  return r && r.c ? (r.c[idx] ? r.c[idx].v : null) : (r ? r[idx] : null);
}

async function getMaxLessonCode() {
  const cached = readCache(MAXCODE_CACHE_KEY, MAXCODE_CACHE_TIME_KEY);
  if (cached.hit) return cached.value;
  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
  try {
    const res = await fetch(SHEET_BAI_HOC, { cache: "no-store" });
    const data = await res.json();
    const rows = data.rows || data;
    const baiList = rows.map(r => {
      const lop = safeStr(getCell(r, 0)).trim();
      const bai = safeStr(getCell(r, 2)).trim();
      return lop === trainerClass && bai ? parseInt(bai, 10) : null;
    }).filter(v => typeof v === "number" && !Number.isNaN(v));
    const maxCode = baiList.length === 0 ? null : Math.max(...baiList);
    writeCache(MAXCODE_CACHE_KEY, MAXCODE_CACHE_TIME_KEY, maxCode);
    return maxCode;
  } catch (e) {
    console.warn("⚠️ getMaxLessonCode failed, bỏ giới hạn.", e);
    return null;
  }
}

function filterByUnitRange(rows, maxLessonCode) {
  return rows.filter(r => {
    const unitNum = normalizeUnitId(safeStr(getCell(r, COL.lessonName)).trim());
    if (!unitNum) return false;
    return unitNum >= LOWER_BOUND_UNIT && (maxLessonCode ? unitNum <= maxLessonCode : true);
  });
}

// ===== Utilities =====
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.toString().trim().split("-");
  if (parts.length < 3) return 0;
  const [c, l, p] = parts.slice(0, 3).map(x => parseInt(x, 10));
  if ([c, l, p].some(Number.isNaN)) return 0;
  return c * 1000 + l * 10 + p;
}

function splitTargets(raw) {
  return (raw || "").split(/[,/;|]/).map(t => t.trim()).filter(Boolean);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const randOf = (a) => a[Math.floor(Math.random() * a.length)];
const safeStr = (v) => (v == null ? "" : String(v));
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const status = (msg) => { statusLine.textContent = msg || ""; };