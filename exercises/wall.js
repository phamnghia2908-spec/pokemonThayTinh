// ===== wall.js — Ném bóng vào tường chọn đáp án A/B/C/D (webcam, không dùng âm thanh) =====
// Dữ liệu & cách ra câu hỏi giống multipletuongtac.js. Dùng chung global-config.js, imagecache2.js
const APP_VERSION = "wall-v1";
console.log("wall", APP_VERSION);

const COL = { lessonName: 1, vocab: 2, topic: 6, meaning: 24 };
const LOWER_BOUND_UNIT = 3011;
const SHEET_CACHE_KEY = "multiple_sheet_rows", SHEET_CACHE_TIME_KEY = "multiple_sheet_rows_time";
const SHEET_CACHE_TTL_MS = 30 * 60 * 1000;
const QUIZ_TYPES = ["en2vi", "vi2en", "img2en"];
const LETTERS = ["A", "B", "C", "D"];

// ===== Tham số nhận diện =====
const DW = 160, DH = 90;     // ảnh thu nhỏ để phân tích
const MOTION = 45;           // ngưỡng khác biệt giữa 2 frame (tổng |R|+|G|+|B|)
const HUE_TOL = 22;          // sai lệch màu (độ)
const MINPX = 3;             // tối thiểu số điểm ảnh để coi là thấy bóng
const LOST_MS = 140;         // mất dấu bóng sau khi đang bay nhanh => coi là chạm tường
const COOLDOWN_MS = 2500;    // khoá sau mỗi lần chọn
const SETTLE_MS = 1500;      // sau khi hiện câu mới, bỏ qua vài giây đầu (bóng còn lăn)
let VMIN = 0.35;             // tốc độ tối thiểu (đơn vị: bề rộng tường / giây)

// ===== State =====
let allRows = [], currentQuestions = [], currentIndex = 0, score = 0;
let locked = true, armedAt = 0, quizToken = 0, voiceOn = true, showImg = true;
let stream = null, rafId = null, lastVideoTime = -1;
let calib = {}, H = null, calOpen = false, calPts = [], calColorStep = false;
let flip = localStorage.getItem("wall_flip") === "1"; // đảo gương trái-phải
let trail = [], lastSeen = 0, fastAt = 0, prevData = null;

const $ = id => document.getElementById(id);
const camVideo = $("camVideo"), bgCam = $("bgCam"), dbgCam = $("dbgCam"), calCanvas = $("calCanvas");
const quizVisible = () => $("wall").style.display === "block";

// ===== Banner lỗi =====
window.addEventListener("error", e => {
  let b = $("errB"); if (!b) { b = document.createElement("div"); b.id = "errB"; b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:999;background:#7f1d1d;color:#fff;font:13px monospace;padding:8px"; document.body.appendChild(b); }
  b.textContent = "⚠️ " + e.message + " @" + (e.filename || "").split("/").pop() + ":" + e.lineno;
});

// ===== Init =====
document.addEventListener("DOMContentLoaded", async () => {
  try { calib = JSON.parse(localStorage.getItem("wall_calib") || "{}"); } catch (e) { calib = {}; }
  setH();
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  bindControls();
  refreshCameras();
  status("Đang tải dữ liệu...");
  try { await loadAllData(); status(`Sẵn sàng. ${allRows.length} dòng dữ liệu. (${APP_VERSION})`); }
  catch (e) { console.error(e); status("❌ Không thể tải dữ liệu."); }
});

function status(m) { $("statusLine").textContent = m || ""; }

async function loadAllData() {
  const rows = await fetchRows();
  allRows = rows.filter(r => normalizeUnitId(safeStr(getCell(r, COL.lessonName)).trim()) >= LOWER_BOUND_UNIT);
  buildLessonOptions($("lessonSelect"), allRows);
  buildLessonOptions($("rangeStartSelect"), allRows);
  buildLessonOptions($("rangeEndSelect"), allRows);
  const re = $("rangeEndSelect"); if (re.options.length) re.selectedIndex = re.options.length - 1;
  const topics = [...new Set(allRows.map(r => safeStr(getCell(r, COL.topic)).trim()).filter(Boolean))].sort();
  $("topicSelect").innerHTML = topics.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
}

function buildLessonOptions(sel, rows) {
  const seen = new Map();
  rows.forEach(r => {
    const n = safeStr(getCell(r, COL.lessonName)).trim(), u = normalizeUnitId(n);
    if (u && !seen.has(u)) seen.set(u, n);
  });
  sel.innerHTML = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([u, n]) => `<option value="${u}">${escapeHTML(n)}</option>`).join("");
}

function bindControls() {
  const upd = () => {
    const m = scopeMode();
    $("lessonSelect").style.display = m === "lesson" ? "block" : "none";
    $("topicSelect").style.display = m === "topic" ? "block" : "none";
    $("rangeRow").style.display = m === "range" ? "flex" : "none";
  };
  document.querySelectorAll('input[name="scopeMode"]').forEach(r => r.onchange = upd); upd();
  $("startBtn").onclick = startQuiz;
  $("restartBtn").onclick = startQuiz;
  $("backBtn").onclick = showSetup;
  $("quitBtn").onclick = showSetup;
  $("refreshBtn").onclick = async () => {
    [SHEET_CACHE_KEY, SHEET_CACHE_TIME_KEY].forEach(k => localStorage.removeItem(k));
    status("Đang tải lại..."); try { await loadAllData(); status(`Đã làm mới. ${allRows.length} dòng.`); } catch (e) { status("❌ Lỗi làm mới."); }
  };
  $("calBtn").onclick = $("calBtn2").onclick = openCalib;
  $("calClose").onclick = closeCalib;
  $("flipToggle").checked = flip;
  $("flipToggle").onchange = () => setFlip($("flipToggle").checked);
  $("flipBtn").onclick = () => { setFlip(!flip); openCalib(); };
  $("calRedo").onclick = () => { calPts = []; calColorStep = false; calText(); };
  $("calColorOnly").onclick = () => { if (calib.pts && H) { calPts = calib.pts.slice(); calColorStep = true; calText(); } };
  calCanvas.onclick = onCalClick;
  $("camSelect").onchange = () => { localStorage.setItem("wall_camId", $("camSelect").value); stopCamera(); };
  $("camPermBtn").onclick = async () => {
    try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop()); await refreshCameras(); status("📷 Đã tìm thấy webcam."); }
    catch (e) { status("⚠️ Không mở được webcam: " + (e.name || "") + " (cần mở bằng https hoặc localhost)"); }
  };
  $("speakBtn").onclick = () => { const q = currentQuestions[currentIndex]; if (!q) return; stopSpeech(); speak(q.type === "text" ? q.promptText : q.promptImageVocab, q.qLang || "en-US"); };
  [...document.querySelectorAll(".zone")].forEach((z, i) => z.onclick = () => { const q = currentQuestions[currentIndex]; if (q) handleAnswer(i, q); }); // dự phòng: bấm chuột
  document.addEventListener("keydown", e => {
    const i = "abcd".indexOf(e.key.toLowerCase()), j = "1234".indexOf(e.key);
    const k = i >= 0 ? i : j; const q = currentQuestions[currentIndex];
    if (k >= 0 && q && quizVisible()) handleAnswer(k, q);
  });
}
const scopeMode = () => document.querySelector('input[name="scopeMode"]:checked').value;
const quizMode = () => document.querySelector('input[name="quizMode"]:checked').value;

// ===== Bắt đầu =====
async function startQuiz() {
  voiceOn = $("voiceToggle").checked; showImg = $("imgToggle").checked;
  VMIN = parseFloat($("sensSelect").value) || 0.35;
  bgCam.style.opacity = $("camOpacity").value;
  quizToken++; stopSpeech(); audioCtx();
  try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch (e) { }

  let rows;
  const m = scopeMode();
  if (!allRows.length) { status("📭 Chưa có dữ liệu."); return; }
  if (m === "lesson") { const u = parseInt($("lessonSelect").value, 10); rows = allRows.filter(r => normalizeUnitId(safeStr(getCell(r, COL.lessonName))) === u); }
  else if (m === "topic") { const t = $("topicSelect").value; rows = allRows.filter(r => safeStr(getCell(r, COL.topic)).trim() === t); }
  else {
    let a = parseInt($("rangeStartSelect").value, 10), b = parseInt($("rangeEndSelect").value, 10); if (a > b) [a, b] = [b, a];
    rows = allRows.filter(r => { const u = normalizeUnitId(safeStr(getCell(r, COL.lessonName))); return u >= a && u <= b; });
  }
  const scopeItems = buildUniqueItems(rows);
  if (scopeItems.length === 0) { status("📭 Không có từ vựng trong phạm vi này."); return; }
  let qs = buildQuizQuestions(scopeItems, buildUniqueItems(allRows), quizMode());
  const c = $("countSelect").value; if (c !== "all") qs = shuffleInPlace(qs).slice(0, parseInt(c, 10));
  currentQuestions = qs; currentIndex = 0; score = 0;

  $("setupArea").style.display = "none"; $("resultArea").style.display = "none"; $("wall").style.display = "block";
  locked = true;
  renderQuestion();
  await startCamera().catch(e => hint("⚠️ " + (e.message || e) + " — vẫn bấm chuột/phím A-D được"));
  if (!H || !calib.color) openCalib();
}

function showSetup() {
  quizToken++; stopSpeech(); stopCamera(); closeCalib();
  $("setupArea").style.display = "block"; $("wall").style.display = "none"; $("resultArea").style.display = "none";
  updateCalStatus();
}

// ===== Câu hỏi =====
function buildUniqueItems(rows) {
  const map = new Map();
  rows.forEach(r => {
    const vocab = safeStr(getCell(r, COL.vocab)).trim(), meaning = safeStr(getCell(r, COL.meaning)).trim();
    if (!vocab || !meaning) return;
    const v = splitTargets(vocab)[0] || vocab;
    if (!map.has(v)) map.set(v, { vocab: v, meaning });
  });
  return [...map.values()];
}

function buildQuizQuestions(scopeItems, globalItems, mode) {
  const m2v = new Map(globalItems.map(i => [i.meaning, i.vocab]));
  scopeItems.forEach(i => m2v.set(i.meaning, i.vocab));
  return shuffleInPlace(scopeItems.map(item => {
    const t = mode === "mixed" ? QUIZ_TYPES[Math.floor(Math.random() * 3)] : mode;
    const field = t === "en2vi" ? "meaning" : "vocab";
    const correct = t === "en2vi" ? item.meaning : item.vocab;
    const options = buildOptions(correct, field, scopeItems, globalItems);
    return {
      type: t === "img2en" ? "image" : "text",
      promptText: t === "en2vi" ? item.vocab : t === "vi2en" ? item.meaning : "",
      promptImageVocab: t === "img2en" ? item.vocab : null,
      correct, options,
      optVocabs: options.map(o => field === "vocab" ? o : m2v.get(o)),
      qLang: t === "en2vi" ? "en-US" : t === "vi2en" ? "vi-VN" : null,
      aLang: t === "en2vi" ? "vi-VN" : "en-US"
    };
  }));
}

function buildOptions(correct, field, scopeItems, globalItems) {
  const vals = (items) => [...new Set(items.map(i => i[field]).filter(v => v && v !== correct))];
  let d = shuffleInPlace(vals(scopeItems)).slice(0, 3);
  if (d.length < 3) d = d.concat(shuffleInPlace(vals(globalItems).filter(v => !d.includes(v))).slice(0, 3 - d.length));
  return shuffleInPlace([correct, ...d]);
}

async function renderQuestion() {
  if (currentIndex >= currentQuestions.length) return showResult();
  const q = currentQuestions[currentIndex];
  $("progressText").textContent = `Câu ${currentIndex + 1}/${currentQuestions.length}`;
  $("scoreText").textContent = `Điểm: ${score}`;
  locked = false; armedAt = performance.now() + SETTLE_MS; trail = []; fastAt = 0;
  hint("🎯 Ném bóng vào đáp án bạn chọn");

  const zones = [...document.querySelectorAll(".zone")];
  zones.forEach((z, i) => {
    z.className = "zone"; z.disabled = false;
    z.querySelector(".zt").textContent = q.options[i] || "";
    const im = z.querySelector("img"); im.style.display = "none"; im.removeAttribute("src");
    if (showImg && q.type !== "image" && q.optVocabs[i]) {
      imageCache.getImage(q.optVocabs[i]).then(d => {
        if (d && d.url && currentQuestions[currentIndex] === q) { im.src = d.url; im.style.display = "block"; }
      }).catch(() => { });
    }
  });

  if (q.type === "image") {
    $("qText").style.display = "none"; $("qImg").style.display = "block"; $("qImg").removeAttribute("src");
    try { const d = await imageCache.getImage(q.promptImageVocab); if (d && currentQuestions[currentIndex] === q) $("qImg").src = d.url; } catch (e) { }
  } else {
    $("qImg").style.display = "none"; $("qText").style.display = "block"; $("qText").textContent = q.promptText;
    speak(q.promptText, q.qLang);
  }
}

async function handleAnswer(i, q) {
  if (locked) return;
  locked = true; const token = quizToken; stopSpeech();
  const zones = [...document.querySelectorAll(".zone")];
  const ok = q.options[i] === q.correct;
  const cheer = pick(ok ? ["Great!", "Excellent!", "Awesome!", "Perfect!", "Well done!", "Super!"] : ["Good try!", "Don't give up!", "Almost!", "Keep going!"]);
  zones.forEach(z => z.disabled = true);
  if (ok) { score++; zones[i].classList.add("correct"); sfx("ok"); hint("✅ Chính xác!"); }
  else { zones.forEach((z, k) => z.classList.add(k === q.options.indexOf(q.correct) ? "correct" : k === i ? "wrong" : "wrong")); sfx("bad"); hint("❌ Chưa đúng"); }
  $("scoreText").textContent = `Điểm: ${score}`;
  const ch = $("cheer"); ch.textContent = cheer; ch.className = ""; void ch.offsetWidth; ch.className = "show";

  await speak(q.options[i], q.aLang); if (token !== quizToken) return;
  await speak(cheer, "en-US"); if (token !== quizToken) return;
  if (!ok) { await speak(q.correct, q.aLang); if (token !== quizToken) return; }
  await sleep(Math.max(600, voiceOn ? 400 : COOLDOWN_MS - 1000)); if (token !== quizToken) return;
  currentIndex++; renderQuestion();
}

function showResult() {
  stopCamera();
  $("wall").style.display = "none"; $("resultArea").style.display = "flex";
  $("resultScore").textContent = `${score}/${currentQuestions.length}`;
  sfx("win"); speak(`You got ${score} out of ${currentQuestions.length}.`, "en-US");
}
function hint(t) { $("hint").textContent = t; }

// ===== Hình học: chuyển toạ độ camera -> toạ độ vùng chiếu (0..1) =====
function solveH(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]); A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let m = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
    [A[c], A[m]] = [A[m], A[c]];
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((row, i) => row[8] / row[i]);
}
function applyH(h, x, y) { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; }
function setH() {
  try { H = calib.pts && calib.pts.length === 4 && !!calib.flip === flip ? solveH(calib.pts, [[0, 0], [1, 0], [1, 1], [0, 1]]) : null; } catch (e) { H = null; }
  updateCalStatus();
}
function updateCalStatus() {
  $("calStatus").textContent = (H ? "✅ Đã có 4 góc. " : (calib.pts && !!calib.flip !== flip) ? "⚠️ Vừa đổi đảo gương: cần chọn lại 4 góc. " : "⚠️ Chưa chọn 4 góc. ") + (calib.color ? "✅ Đã lấy màu bóng." : "⚠️ Chưa lấy màu bóng.");
}

// ===== Hiệu chỉnh: bấm 4 góc vùng chiếu + bấm vào bóng =====
async function openCalib() {
  try { await startCamera(); } catch (e) { alert("Không mở được webcam: " + (e.message || e)); return; }
  calPts = []; calColorStep = false; calOpen = true; $("calib").style.display = "flex"; calText();
}
function closeCalib() { calOpen = false; $("calib").style.display = "none"; }
function calText() {
  const t = ["Bấm góc TRÊN-TRÁI của vùng chiếu", "Bấm góc TRÊN-PHẢI", "Bấm góc DƯỚI-PHẢI", "Bấm góc DƯỚI-TRÁI", "Đặt bóng trước tường, bấm vào quả bóng để lấy màu"];
  $("calText").textContent = `Bước ${Math.min(calPts.length + 1, 5)}/5: ${t[Math.min(calPts.length, 4)]}`;
}
function onCalClick(e) {
  const r = calCanvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  if (calPts.length < 4) { calPts.push([x, y]); calText(); return; }
  calib = { pts: calPts.slice(0, 4), color: sampleColor(x, y), flip };
  localStorage.setItem("wall_calib", JSON.stringify(calib));
  setH(); closeCalib();
}
function sampleColor(x, y) {
  const c = document.createElement("canvas"); c.width = c.height = 7;
  const g = c.getContext("2d", { willReadFrequently: true });
  const xs = flip ? 1 - x : x;
  g.drawImage(camVideo, xs * camVideo.videoWidth - 3, y * camVideo.videoHeight - 3, 7, 7, 0, 0, 7, 7);
  const d = g.getImageData(0, 0, 7, 7).data; let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
  const [h, s, v] = rgb2hsv(R / n, G / n, B / n); return { h, s, v };
}
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx];
}

// ===== Webcam =====
function camRank(l) {
  if (/obs|virtual|droidcam|snap camera|manycam|epoccam|iriun|nvidia broadcast/i.test(l)) return 2;
  if (/integrated|built-?in|internal|facetime|laptop|truevision|ir camera|infrared|windows hello/i.test(l) || !l) return 1;
  return 0;
}
async function refreshCameras() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
  const sel = $("camSelect"), saved = localStorage.getItem("wall_camId") || "auto";
  sel.innerHTML = `<option value="auto">Tự động (ưu tiên webcam rời)</option>` + devs.map((d, i) => `<option value="${escapeHTML(d.deviceId)}">${escapeHTML(d.label || "Webcam " + (i + 1))}</option>`).join("");
  sel.value = [...sel.options].some(o => o.value === saved) ? saved : "auto";
  window._devs = devs;
}
async function startCamera() {
  if (stream && stream.getVideoTracks().some(t => t.readyState === "live")) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Webcam bị chặn: hãy mở bằng https:// hoặc http://localhost');
  const gum = id => navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  const want = $("camSelect").value; let ids;
  if (want === "auto") {
    await refreshCameras();
    if ((window._devs || []).length && window._devs.every(d => !d.label)) { (await gum("")).getTracks().forEach(t => t.stop()); await refreshCameras(); }
    ids = (window._devs || []).map((d, i) => ({ d, i })).sort((a, b) => camRank(a.d.label) - camRank(b.d.label) || a.i - b.i).map(x => x.d.deviceId);
    if (!ids.length) ids = [""];
  } else ids = [want];
  let s = null, err = null;
  for (const id of ids) { try { s = await gum(id); break; } catch (e) { err = e; if (e.name === "NotAllowedError") break; } }
  if (!s) throw err || new Error("Không mở được webcam");
  stream = s; camVideo.srcObject = s; await camVideo.play();
  await refreshCameras(); hint("Webcam: " + (s.getVideoTracks()[0].label || "OK"));
  prevData = null; cancelAnimationFrame(rafId); rafId = requestAnimationFrame(loop);
}
function stopCamera() {
  cancelAnimationFrame(rafId); rafId = null;
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  camVideo.srcObject = null;
}

// ===== Vòng lặp: vẽ + phát hiện bóng =====
// Mọi nơi dùng hình camera (nền, hiệu chỉnh, nhận diện) đều đi qua drawV nên lật nhất quán
function drawV(g, w, h) {
  if (flip) { g.save(); g.translate(w, 0); g.scale(-1, 1); g.drawImage(camVideo, 0, 0, w, h); g.restore(); }
  else g.drawImage(camVideo, 0, 0, w, h);
}
function setFlip(v) {
  flip = !!v; localStorage.setItem("wall_flip", flip ? "1" : "0");
  prevData = null; trail = []; setH(); $("flipToggle").checked = flip;
}
const dc = document.createElement("canvas"); dc.width = DW; dc.height = DH;
const dctx = dc.getContext("2d", { willReadFrequently: true });

function loop() {
  rafId = requestAnimationFrame(loop);
  if (camVideo.readyState < 2) return;
  const vw = camVideo.videoWidth, vh = camVideo.videoHeight;

  if (calOpen) {
    if (calCanvas.width !== vw) { calCanvas.width = vw; calCanvas.height = vh; }
    const g = calCanvas.getContext("2d");
    drawV(g, vw, vh);
    g.strokeStyle = "#facc15"; g.fillStyle = "#facc15"; g.lineWidth = 3;
    g.beginPath(); calPts.forEach(([x, y], i) => i ? g.lineTo(x * vw, y * vh) : g.moveTo(x * vw, y * vh)); if (calPts.length === 4) g.closePath(); g.stroke();
    calPts.forEach(([x, y]) => { g.beginPath(); g.arc(x * vw, y * vh, 7, 0, 7); g.fill(); });
    return;
  }
  if (!quizVisible() || camVideo.currentTime === lastVideoTime) return;
  lastVideoTime = camVideo.currentTime;
  const t = performance.now();

  drawV(bgCam.getContext("2d"), bgCam.width, bgCam.height);
  const ctx = dbgCam.getContext("2d"); ctx.clearRect(0, 0, dbgCam.width, dbgCam.height);
  const ball = (H && calib.color) ? detectBall() : (prevData = null);
  if (ball) {
    ctx.strokeStyle = "#a3e635"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ball.x * dbgCam.width, ball.y * dbgCam.height, 10, 0, 7); ctx.stroke();
    ctx.beginPath(); trail.forEach((p, i) => i ? ctx.lineTo(p.x * dbgCam.width, p.y * dbgCam.height) : ctx.moveTo(p.x * dbgCam.width, p.y * dbgCam.height)); ctx.stroke();
  }
  if (!locked && t > armedAt) track(ball, t);
}

// Tìm bóng: điểm ảnh vừa ĐÚNG MÀU vừa ĐANG CHUYỂN ĐỘNG, nằm trong vùng chiếu, bỏ qua thẻ câu hỏi ở giữa
// (nếu không bỏ, camera sẽ thấy chính hình quả bóng trong khung webcam được chiếu lên tường)
function detectBall() {
  drawV(dctx, DW, DH);
  const cur = dctx.getImageData(0, 0, DW, DH).data, prev = prevData; prevData = cur;
  if (!prev) return null;
  const c = calib.color, cb = $("qCard").getBoundingClientRect();
  const bx0 = cb.left / innerWidth, bx1 = cb.right / innerWidth, by0 = cb.top / innerHeight, by1 = cb.bottom / innerHeight;
  const sMin = Math.max(0.25, c.s * 0.5), vMin = Math.max(0.2, c.v * 0.5), pts = [];
  for (let i = 0, p = 0; i < cur.length; i += 4, p++) {
    if (Math.abs(cur[i] - prev[i]) + Math.abs(cur[i + 1] - prev[i + 1]) + Math.abs(cur[i + 2] - prev[i + 2]) < MOTION) continue;
    const [h, s, v] = rgb2hsv(cur[i], cur[i + 1], cur[i + 2]);
    let dh = Math.abs(h - c.h); if (dh > 180) dh = 360 - dh;
    if (dh > HUE_TOL || s < sMin || v < vMin) continue;
    const x = (p % DW) / DW, y = ((p / DW) | 0) / DH, [u, w] = applyH(H, x, y);
    if (u < -0.02 || u > 1.02 || w < -0.02 || w > 1.02) continue;
    if (u > bx0 && u < bx1 && w > by0 && w < by1) continue;
    pts.push([x, y, u, w]);
  }
  if (pts.length < MINPX) return null;
  let mx = 0, my = 0; pts.forEach(q => { mx += q[0]; my += q[1]; }); mx /= pts.length; my /= pts.length;
  const near = pts.filter(q => Math.hypot((q[0] - mx) * 16, (q[1] - my) * 9) < 2.5); // lọc nhiễu xa quả bóng
  if (near.length < MINPX) return null;
  let x = 0, y = 0, u = 0, w = 0; near.forEach(q => { x += q[0]; y += q[1]; u += q[2]; w += q[3]; });
  const n = near.length; return { x: x / n, y: y / n, u: u / n, v: w / n, n };
}

// Phát hiện "chạm tường": (1) bóng đang bay nhanh rồi đổi hướng / giảm tốc đột ngột, hoặc
// (2) bóng đang bay nhanh rồi biến mất (nảy ra khỏi tầm nhìn / bị tường chặn)
function track(b, t) {
  if (b) {
    const last = trail[trail.length - 1];
    if (last && t - last.t < 250) {
      const dt = (t - last.t) / 1000, vx = (b.u - last.u) / dt, vy = (b.v - last.v) / dt, sp = Math.hypot(vx, vy);
      b.vx = vx; b.vy = vy; b.sp = sp;
      if (sp > VMIN) fastAt = t;
      if (last.sp > VMIN && (sp < last.sp * 0.3 || (sp > VMIN * 0.4 && vx * last.vx + vy * last.vy < 0))) { b.t = t; return onHit(b); }
    }
    b.t = t; trail.push(b); if (trail.length > 12) trail.shift(); lastSeen = t;
    hint(`🟢 Thấy bóng${b.sp ? " · tốc độ " + b.sp.toFixed(2) : ""}`);
  } else if (trail.length && t - lastSeen > LOST_MS) {
    const last = trail[trail.length - 1], recent = fastAt > 0 && lastSeen - fastAt < 150;
    trail = []; if (recent) onHit(last);
  }
}

function onHit(b) {
  trail = []; fastAt = 0;
  const q = currentQuestions[currentIndex]; if (!q || locked) return;
  const X = b.u * innerWidth, Y = b.v * innerHeight, zs = [...document.querySelectorAll(".zone")];
  let idx = -1;
  zs.forEach((z, i) => { const r = z.getBoundingClientRect(); if (X >= r.left && X <= r.right && Y >= r.top && Y <= r.bottom) idx = i; });
  if (idx < 0) return; // chạm ngoài 4 vùng (thanh trên, sàn...) => bỏ qua
  const d = $("hitDot"); d.style.left = X + "px"; d.style.top = Y + "px"; d.classList.remove("go"); void d.offsetWidth; d.classList.add("go");
  handleAnswer(idx, q);
}

// ===== Giọng đọc & hiệu ứng âm thanh (giống file gốc) =====
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = a => a[Math.floor(Math.random() * a.length)];
let enVoice = null, curVI = null, actx = null; const viCache = new Map();
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  enVoice = vs.find(v => /en[-_]US/i.test(v.lang) && /Google|Samantha|Zira|Aria|Jenny|Female/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang)) || null;
}
function stopSpeech() { try { if (curVI) { curVI.stop(); curVI = null; } } catch (e) { } try { speechSynthesis.cancel(); } catch (e) { } }
function audioCtx() { if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); } if (actx && actx.state === "suspended") actx.resume(); return actx; }
function speakEN(text) {
  return new Promise(res => {
    if (!("speechSynthesis" in window) || !text) return res();
    try {
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = 0.85; if (enVoice) u.voice = enVoice;
      let done = false; const fin = () => { if (!done) { done = true; clearTimeout(t); res(); } };
      const t = setTimeout(fin, Math.max(text.length * 165, 3500)); u.onend = u.onerror = fin; speechSynthesis.speak(u);
    } catch (e) { res(); }
  });
}
async function speakVI(text) {
  try {
    let buf = viCache.get(text);
    if (!buf) {
      const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 6000); let r;
      try { r = await fetch(`https://googlevoice-tinh.onrender.com/tts?q=${encodeURIComponent(text)}&speed=0.9&lang=vi-VN&voice=`, { signal: ctrl.signal }); } finally { clearTimeout(to); }
      if (!r.ok) throw 0; buf = await audioCtx().decodeAudioData(await r.arrayBuffer()); viCache.set(text, buf);
    }
    await new Promise(res => { const s = audioCtx().createBufferSource(); s.buffer = buf; s.connect(audioCtx().destination); s.onended = res; curVI = s; s.start(); });
  } catch (e) {
    await new Promise(res => { try { const u = new SpeechSynthesisUtterance(text); u.lang = "vi-VN"; const t = setTimeout(res, 4000); u.onend = u.onerror = () => { clearTimeout(t); res(); }; speechSynthesis.speak(u); } catch (e2) { res(); } });
  }
}
function speak(text, lang) { if (!voiceOn || !text || !lang) return Promise.resolve(); return lang.toLowerCase().startsWith("vi") ? speakVI(text) : speakEN(text); }
function tone(f, t0, d, type = "sine", vol = 0.16) {
  const c = audioCtx(); if (!c) return; const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + t0;
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
}
function sfx(n) {
  if (!voiceOn) return;
  if (n === "ok") { tone(659, 0, .12); tone(880, .1, .2); }
  else if (n === "bad") { tone(260, 0, .16, "triangle", .12); tone(200, .12, .2, "triangle", .1); }
  else [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .12, .3));
}

// ===== Fetch + cache + tiện ích =====
async function fetchRows() {
  try {
    const raw = localStorage.getItem(SHEET_CACHE_KEY), t = parseInt(localStorage.getItem(SHEET_CACHE_TIME_KEY) || "0", 10);
    if (raw !== null && Date.now() - t <= SHEET_CACHE_TTL_MS) return JSON.parse(raw).v;
  } catch (e) { }
  const res = await fetch(SHEET_URL, { cache: "no-store" }), data = await res.json(), rows = data.rows || data;
  try { localStorage.setItem(SHEET_CACHE_KEY, JSON.stringify({ v: rows })); localStorage.setItem(SHEET_CACHE_TIME_KEY, Date.now().toString()); } catch (e) { }
  return rows;
}
function getCell(r, i) { return r && r.c ? (r.c[i] ? r.c[i].v : null) : (r ? r[i] : null); }
function normalizeUnitId(s) {
  if (!s) return 0; const p = s.toString().trim().split("-"); if (p.length < 3) return 0;
  const c = parseInt(p[0], 10), l = parseInt(p[1], 10), q = parseInt(p[2], 10);
  return (isNaN(c) || isNaN(l) || isNaN(q)) ? 0 : c * 1000 + l * 10 + q;
}
function splitTargets(s) { return (s || "").split(/[,/;|]/).map(t => t.trim()).filter(Boolean); }
function shuffleInPlace(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function safeStr(v) { return v == null ? "" : String(v); }
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
