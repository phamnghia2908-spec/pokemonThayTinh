/* ===== Shadowing Studio (logic) =====
   - Lọc theo chủ đề (cột G)
   - Giới hạn theo max lesson (dựa vào trainerClass trong localStorage)
   - Mỗi lessonName lấy 1 câu trước; nếu thiếu thì vòng lại lấy thêm câu khác trong cùng bài, không trùng câu
   - Hiển thị kiểu teleprompter theo CẢ ĐOẠN VĂN (không phải từng cửa sổ 5-7 từ):
     toàn bộ câu trong 1 batch được render thành 1 đoạn, từ đang đọc sáng màu và
     tự cuộn theo, các từ đã đọc mờ dần, các từ chưa tới còn mờ hơn.
   - Log chi tiết toàn bộ các bước để debug
========================================================= */

// ===== Config =====
const TTS_BASE = "https://googlevoice-tinh.onrender.com";

// Mapping cột (0-based) - giữ lại để tham chiếu, các hàm extract dùng tên thuộc tính trước
const COL = {
  lessonName: 1,    // B: mã bài (vd "3-07-2")
  targets: 2,       // C: vocab/từ khóa
  topic: 6,         // G: chủ đề
  presentation: 8,  // I: câu thuyết trình
  meaning: 24       // Y: nghĩa (nếu có)
};

const LOWER_BOUND_UNIT = 3011;

// Kích thước batch dùng NỘI BỘ để gộp buffer audio cho mượt (không ảnh hưởng hiển thị)
const BATCH_SIZE_CONTINUOUS = 7;
const PAUSE_SEC = 0.6;
const PAUSE_FACTOR = 2;
const USE_DOUBLE_PAUSE = true;

// Số giây tự động đếm ngược trước khi đọc tiếp ở chế độ "Dừng để nhại lại"
const PAUSE_WAIT_SECONDS = 6;

// ===== UI refs =====
const topicSelect = document.getElementById("topicSelect");
const countSelect = document.getElementById("countSelect");
const speedControl = document.getElementById("speedControl");
const modeSelect = document.getElementById("modeSelect");
const pauseChunkField = document.getElementById("pauseChunkField");
const pauseChunkSelect = document.getElementById("pauseChunkSelect");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const lineInner = document.getElementById("lineInner");
const statusLine = document.getElementById("statusLine");
const toastEl = document.getElementById("shadowToast");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const onAirLabel = document.getElementById("onAirLabel");
const pausePanel = document.getElementById("pausePanel");
const pauseCountdownEl = document.getElementById("pauseCountdown");
const replayBtn = document.getElementById("replayBtn");
const continueBtn = document.getElementById("continueBtn");

// ===== Audio / state =====
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isPlaying = false;
let stopRequested = false;
let currentSource = null;
let currentTimer = null;
let activePauseResolve = null; // cho phép Stop huỷ ngay lượt đang đếm ngược/nghe lại

document.addEventListener("click", async () => {
  if (audioCtx.state !== "running") {
    try { await audioCtx.resume(); } catch {}
  }
}, { once: true });

// ===== Init =====
document.addEventListener("DOMContentLoaded", initShadow);

async function initShadow() {
  bindControls();
  status("Đang tải chủ đề từ Google Sheet...");
  try {
    const rows = await fetchGVizRows(SHEET_URL);
    console.log("📥 SHEET rows (total):", rows.length);
    buildTopicDropdown(rows);
    countSelect.value = localStorage.getItem("shadow_count") || "10";
    const rememberedTopic = localStorage.getItem("shadow_topic");
    if (rememberedTopic) topicSelect.value = rememberedTopic;
    modeSelect.value = localStorage.getItem("shadow_mode") || "continuous";
    pauseChunkSelect.value = localStorage.getItem("shadow_pause_chunk") || "1";
    updateModeFieldVisibility();
    status("Sẵn sàng.");
  } catch (err) {
    console.error("❌ Init error:", err);
    status("❌ Không thể tải dữ liệu từ Google Sheet.");
    toast("Kiểm tra URL/gid và quyền public.");
  }
}

function bindControls() {
  startBtn.onclick = startShadow;
  stopBtn.onclick = stopShadow;
  topicSelect.onchange = () => localStorage.setItem("shadow_topic", topicSelect.value);
  countSelect.onchange = () => localStorage.setItem("shadow_count", countSelect.value);
  modeSelect.onchange = () => {
    localStorage.setItem("shadow_mode", modeSelect.value);
    updateModeFieldVisibility();
  };
  pauseChunkSelect.onchange = () => localStorage.setItem("shadow_pause_chunk", pauseChunkSelect.value);
}

function updateModeFieldVisibility() {
  const isPause = modeSelect.value === "pause";
  pauseChunkField.classList.toggle("hidden", !isPause);
}

// ===== Helpers: audio buffers =====
function concatAudioBuffers(ctx, buffers) {
  const sampleRate = buffers[0].sampleRate;
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const result = ctx.createBuffer(1, totalLength, sampleRate);
  let offset = 0;
  for (const b of buffers) {
    result.getChannelData(0).set(b.getChannelData(0), offset);
    offset += b.length;
  }
  return result;
}

function makeSilenceBuffer(ctx, durationSec) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  return ctx.createBuffer(1, len, ctx.sampleRate);
}

async function fetchBuffersSequential(sentences, speed) {
  const buffers = [];
  for (let i = 0; i < sentences.length; i++) {
    try {
      const buf = await fetchBuffer(sentences[i].text, speed, "en-US", "");
      console.log(`🎧 Câu ${i + 1} len(samples): ${buf.length}, dur(s): ${buf.duration}`);
      buffers.push(buf);
    } catch (e) {
      console.warn(`⚠️ Câu ${i + 1} lỗi, bỏ qua:`, e);
    }
  }
  return buffers;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ===== Core flow =====
async function startShadow() {
  if (isPlaying) return;
  isPlaying = true;
  stopRequested = false;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  lineInner.innerHTML = "";
  updateProgress(0, 0);

  if (audioCtx.state === "suspended") { try { await audioCtx.resume(); } catch {} }

  try {
    status("Đang chuẩn bị dữ liệu...");
    const topic = topicSelect.value;
    const count = parseInt(countSelect.value, 10);
    const speed = parseFloat(speedControl.value);
    const mode = modeSelect.value; // "continuous" | "pause"
    const pauseChunkSize = parseInt(pauseChunkSelect.value, 10) || 1;

    console.log("🎛️ User selection:", { topic, count, speed, mode, pauseChunkSize });

    const maxLessonCode = await getMaxLessonCode();
    const rows = await fetchGVizRows(SHEET_URL);
    const topicRows = filterByTopic(rows, topic);
    const items = extractPresentationData(topicRows, maxLessonCode);
    const sentences = buildSentences(items, count);

    if (sentences.length === 0) {
      toast("📭 Không có câu thuyết trình cho chủ đề này.");
      stopShadow();
      return;
    }

    status("Đang tải audio từng câu...");
    const speechBuffers = await fetchBuffersSequential(sentences, speed);
    if (speechBuffers.length === 0) {
      toast("❌ Không tải được audio nào.");
      stopShadow();
      return;
    }

    const pauseSec = PAUSE_SEC * (USE_DOUBLE_PAUSE ? PAUSE_FACTOR : 1);
    const pauseBuf = makeSilenceBuffer(audioCtx, pauseSec);

    const pairs = [];
    let bi = 0;
    for (let i = 0; i < sentences.length && bi < speechBuffers.length; i++, bi++) {
      pairs.push({ sentence: sentences[i], speechBuf: speechBuffers[bi] });
    }

    // Chỉ tính trước offset (toán học), KHÔNG dựng DOM ở đây.
    // Câu nào sẽ hiện ra đúng lúc câu đó tới lượt đọc (xem playChunk).
    const { sentenceOffsets } = buildSentenceOffsets(pairs.map(p => p.sentence));
    const wordSpans = [];            // sẽ được điền dần khi từng câu xuất hiện
    const appendedSentences = new Set();
    const lastIdxRef = { value: -1 };

    // Chọn kích thước gộp theo chế độ: liên tục gộp nhiều câu cho mượt,
    // "dừng để nhại lại" thì gộp đúng 1-2 câu mỗi lượt để có điểm dừng.
    const chunkSize = mode === "pause" ? pauseChunkSize : BATCH_SIZE_CONTINUOUS;

    const batches = [];
    const chunks = chunkArray(pairs, chunkSize);
    for (const chunk of chunks) {
      const batchBuffers = [];
      const batchMeta = [];
      for (const { sentence, speechBuf } of chunk) {
        const speechSec = speechBuf.length / speechBuf.sampleRate;
        const pauseSecEff = pauseBuf.length / pauseBuf.sampleRate;

        batchBuffers.push(speechBuf);
        batchBuffers.push(pauseBuf);

        batchMeta.push({
          text: sentence.text,
          words: sentence.text.trim().split(/\s+/).filter(Boolean),
          speechSamples: speechBuf.length,
          pauseSamples: pauseBuf.length,
          speechSec,
          pauseSec: pauseSecEff
        });
      }
      const batchBuffer = concatAudioBuffers(audioCtx, batchBuffers);
      batches.push({ batchBuffer, batchMeta });
    }

    status(mode === "pause" ? "Bắt đầu — sẽ dừng lại để bạn nhại theo..." : "Bắt đầu đọc mượt theo đoạn văn...");
    await playSession({
      batches,
      totalSentences: pairs.length,
      mode,
      wordSpans,
      sentenceOffsets,
      appendedSentences,
      lastIdxRef
    });

    if (!stopRequested) status("Hoàn tất.");
    stopShadow();
  } catch (err) {
    console.error("❌ Start shadow error:", err);
    toast("❌ Lỗi khởi chạy Shadow.");
    stopShadow();
  }
}

// ===== Compute word-count offsets for the whole session (index math only) =====
// Không dựng DOM ở đây nữa — chỉ tính trước "câu thứ i bắt đầu ở vị trí từ toàn cục nào"
// để khi 1 câu được thêm vào đoạn văn, ta biết đúng global index của từng từ trong nó.
function buildSentenceOffsets(sentenceList) {
  const sentenceOffsets = [];
  let g = 0;
  sentenceList.forEach((s) => {
    const words = s.text.trim().split(/\s+/).filter(Boolean);
    sentenceOffsets.push(g);
    g += words.length;
  });
  return { sentenceOffsets, totalWords: g };
}

// ===== Append ONE sentence to the paragraph, right when its turn comes =====
// Câu trước đó không bị xoá — câu mới chỉ được NỐI THÊM vào cuối.
// Câu chưa tới lượt thì hoàn toàn không có trong DOM (không lộ trước).
function appendSentenceToParagraph(globalSentenceIdx, words, wordSpansArray, baseOffset) {
  const sentenceEl = document.createElement("span");
  sentenceEl.className = "sentence";
  sentenceEl.dataset.sentence = String(globalSentenceIdx);

  words.forEach((w, i) => {
    const g = baseOffset + i;
    const span = document.createElement("span");
    span.className = "word upcoming";
    span.dataset.g = String(g);
    span.textContent = w;
    sentenceEl.appendChild(span);
    sentenceEl.appendChild(document.createTextNode(" "));
    wordSpansArray[g] = span;
  });

  lineInner.appendChild(sentenceEl);
}

// ===== Update highlight on words already in the DOM, gently auto-scroll =====
function setActiveWord(wordSpansArray, globalIdx, lastIdxRef) {
  if (globalIdx === lastIdxRef.value) return;
  for (let i = 0; i < wordSpansArray.length; i++) {
    const span = wordSpansArray[i];
    if (!span) continue;
    span.classList.remove("read", "active", "upcoming");
    if (i < globalIdx) span.classList.add("read");
    else if (i === globalIdx) span.classList.add("active");
    else span.classList.add("upcoming");
  }
  lastIdxRef.value = globalIdx;
  const activeEl = wordSpansArray[globalIdx];
  if (activeEl && typeof activeEl.scrollIntoView === "function") {
    // "nearest" chỉ cuộn khi từ thật sự nằm ngoài khung nhìn, không ép về giữa
    // -> không còn bị cắt mất phần đầu câu dài như bản trước.
    activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }
}

function setPlayingIndicator(playing) {
  document.body.classList.toggle("is-playing", playing);
  if (onAirLabel) onAirLabel.textContent = playing ? "Đang đọc" : "Sẵn sàng";
}

function updateProgress(current, total) {
  if (progressLabel) progressLabel.textContent = `${current}/${total}`;
  if (progressFill) progressFill.style.width = total > 0 ? `${Math.min(100, (current / total) * 100)}%` : "0%";
}

// ===== Play one audio chunk; mỗi câu trong chunk được NỐI vào đoạn văn đúng lúc tới lượt =====
// startSentenceIndex = vị trí câu đầu tiên của chunk này trong toàn bộ session.
function playChunk({ batchBuffer, batchMeta, startSentenceIndex, totalSentences, wordSpans, sentenceOffsets, appendedSentences, lastIdxRef }) {
  return new Promise((resolve) => {
    const ensureAppended = (localSIdx) => {
      const globalSIdx = startSentenceIndex + localSIdx;
      if (appendedSentences.has(globalSIdx)) return;
      appendedSentences.add(globalSIdx);
      appendSentenceToParagraph(globalSIdx, batchMeta[localSIdx].words, wordSpans, sentenceOffsets[globalSIdx]);
    };

    // Câu đầu tiên của chunk hiện ra ngay khi audio bắt đầu
    ensureAppended(0);

    let source = null;
    try {
      source = audioCtx.createBufferSource();
      source.buffer = batchBuffer;
      source.connect(audioCtx.destination);
      source.start();
      currentSource = source;
      console.log(`🔈 Chunk (câu ${startSentenceIndex + 1}..${startSentenceIndex + batchMeta.length}) start, dur(s):`, batchBuffer.duration);
    } catch (e) {
      console.error("❌ Chunk audio start error:", e);
      resolve();
      return;
    }

    const sr = batchBuffer.sampleRate;
    const cumulativeEndsSec = [];
    const cumulativeStartsSec = [];
    let accSamples = 0;
    for (const m of batchMeta) {
      cumulativeStartsSec.push(accSamples / sr);
      accSamples += m.speechSamples;
      accSamples += m.pauseSamples;
      cumulativeEndsSec.push(accSamples / sr);
    }

    const t0 = audioCtx.currentTime;
    let lastSentenceIdx = -1;
    const EPS = 1e-3;

    const frame = () => {
      if (stopRequested) return;
      const elapsed = audioCtx.currentTime - t0;

      if (elapsed >= batchBuffer.duration - EPS) {
        const lastLocalSIdx = batchMeta.length - 1;
        const lastWIdx = batchMeta[lastLocalSIdx].words.length - 1;
        ensureAppended(lastLocalSIdx);
        const globalSIdx = startSentenceIndex + lastLocalSIdx;
        setActiveWord(wordSpans, sentenceOffsets[globalSIdx] + lastWIdx, lastIdxRef);
        console.log("🏁 Chunk audio ended (clamp)");
        return;
      }

      let sIdx = 0;
      for (let i = 0; i < cumulativeEndsSec.length; i++) {
        if (elapsed < cumulativeEndsSec[i] - EPS) { sIdx = i; break; }
      }

      const sStart = cumulativeStartsSec[sIdx];
      const sEnd = cumulativeEndsSec[sIdx];
      const sElapsed = Math.max(0, Math.min(elapsed - sStart, sEnd - sStart));
      const speechSec = batchMeta[sIdx].speechSec;
      const words = batchMeta[sIdx].words;

      let wIdx;
      if (sElapsed >= speechSec - EPS) {
        wIdx = words.length - 1;
      } else {
        const p = sElapsed / Math.max(1e-6, speechSec);
        wIdx = Math.floor(p * words.length);
        if (wIdx >= words.length) wIdx = words.length - 1;
      }

      const globalSIdx = startSentenceIndex + sIdx;

      if (sIdx !== lastSentenceIdx) {
        ensureAppended(sIdx);
        updateProgress(globalSIdx + 1, totalSentences);
        lastSentenceIdx = sIdx;
      }

      setActiveWord(wordSpans, sentenceOffsets[globalSIdx] + wIdx, lastIdxRef);
      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);

    source.onended = () => {
      console.log("🏁 Chunk source onended");
      resolve();
    };
  });
}

// ===== Play a raw buffer with no highlight logic (used by "Nghe lại") =====
function playRawBuffer(buffer) {
  return new Promise((resolve) => {
    try {
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(audioCtx.destination);
      currentSource = src;
      src.onended = () => resolve();
      src.start();
    } catch (e) {
      console.error("❌ Replay error:", e);
      resolve();
    }
  });
}

// ===== Pause gate for "Dừng để nhại lại": countdown + Nghe lại + Đọc tiếp ngay =====
function runPauseGate(chunkBuffer, seconds) {
  return new Promise((resolve) => {
    let remaining = seconds;
    let timerId = null;
    let settled = false;

    const cleanup = () => {
      if (timerId) clearInterval(timerId);
      pausePanel.classList.remove("visible");
      replayBtn.onclick = null;
      continueBtn.onclick = null;
      activePauseResolve = null;
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    activePauseResolve = finish;

    const renderCountdown = () => {
      pauseCountdownEl.textContent = `${remaining}s`;
    };

    const tick = () => {
      if (stopRequested) { finish(); return; }
      remaining -= 1;
      if (remaining <= 0) { finish(); return; }
      renderCountdown();
    };

    pausePanel.classList.add("visible");
    renderCountdown();
    timerId = setInterval(tick, 1000);

    continueBtn.onclick = () => finish();

    replayBtn.onclick = async () => {
      if (settled) return;
      clearInterval(timerId);
      pauseCountdownEl.textContent = "đang nghe lại…";
      await playRawBuffer(chunkBuffer);
      if (settled || stopRequested) return;
      remaining = seconds;
      renderCountdown();
      timerId = setInterval(tick, 1000);
    };
  });
}

// ===== Drive the whole session: 1 đoạn văn cố định, phát theo chunk =====
// mode "continuous": chạy hết các chunk liên tiếp, không dừng.
// mode "pause": sau mỗi chunk (trừ chunk cuối), dừng lại chờ học sinh nhại theo.
async function playSession({ batches, totalSentences, mode, wordSpans, sentenceOffsets, appendedSentences, lastIdxRef }) {
  setPlayingIndicator(true);
  let startSentenceIndex = 0;

  for (let bIndex = 0; bIndex < batches.length; bIndex++) {
    if (stopRequested) break;
    const { batchBuffer, batchMeta } = batches[bIndex];

    await playChunk({
      batchBuffer,
      batchMeta,
      startSentenceIndex,
      totalSentences,
      wordSpans,
      sentenceOffsets,
      appendedSentences,
      lastIdxRef
    });

    startSentenceIndex += batchMeta.length;

    const isLastChunk = bIndex === batches.length - 1;
    if (mode === "pause" && !isLastChunk && !stopRequested) {
      status("Tạm dừng — tự nhại lại câu vừa nghe...");
      await runPauseGate(batchBuffer, PAUSE_WAIT_SECONDS);
      if (!stopRequested) status(mode === "pause" ? "Đang đọc tiếp..." : "");
    }
  }

  setPlayingIndicator(false);
}

// ===== Stop =====
function stopShadow() {
  stopRequested = true;
  isPlaying = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;

  try { currentSource && currentSource.stop(); } catch {}
  currentSource = null;

  if (currentTimer) { clearInterval(currentTimer); currentTimer = null; }
  if (activePauseResolve) activePauseResolve();
  setPlayingIndicator(false);
  status("Đã dừng.");
}

// ===== TTS =====
async function fetchBuffer(text, speed = 1, lang = "en-US", voice = "") {
  const url = `${TTS_BASE}/tts?q=${encodeURIComponent(text)}&speed=${encodeURIComponent(speed)}&lang=${encodeURIComponent(lang)}&voice=${encodeURIComponent(voice)}`;
  console.log("🎧 TTS URL:", url);

  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`TTS request failed: ${resp.status}`);

  const arrayBuffer = await resp.arrayBuffer();

  if (audioCtx.state === "suspended") {
    try { await audioCtx.resume(); } catch (e) {
      console.warn("⚠️ AudioContext resume failed before decode:", e);
    }
  }

  const buffer = await audioCtx.decodeAudioData(arrayBuffer);
  console.log("🔊 Audio decoded length(s):", buffer.duration);
  return buffer;
}

// ===== GViz fetch =====
async function fetchGVizRows(url) {
  console.log("🔗 Fetching Exec API:", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Network response was not ok");
  const data = await res.json();
  const rows = data.data || data;
  console.log("📥 Exec parsed rows:", rows.length);
  return rows;
}

// ===== Topics =====
function buildTopicDropdown(rows) {
  const topics = [...new Set(rows.map(r => {
    return (r.topic || r.Topic || r.ChuDe || (r.c ? r.c[6]?.v : r[6]))?.toString().trim();
  }).filter(Boolean))];

  topics.sort();

  let html = `<option value="ALL">-- Tất cả chủ đề --</option>`;
  html += topics
    .map(t => `<option value="${escapeHTML(String(t))}">${escapeHTML(String(t))}</option>`)
    .join("");

  topicSelect.innerHTML = html;
}

function filterByTopic(rows, topic) {
  if (!topic || topic === "ALL") return rows;
  return rows.filter(r => {
    const val = (r.topic || r.Topic || r.ChuDe || (r.c ? r.c[6]?.v : r[6]) || "").toString().trim();
    return val === String(topic).trim();
  });
}

// ===== Lesson code normalize + max lesson =====
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.toString().trim().split("-");
  if (parts.length < 3) return 0;
  const [cls, lesson, part] = parts;
  const c = parseInt(cls, 10);
  const l = parseInt(lesson, 10);
  const p = parseInt(part, 10);
  if (Number.isNaN(c) || Number.isNaN(l) || Number.isNaN(p)) return 0;
  return c * 1000 + l * 10 + p;
}

async function getMaxLessonCode() {
  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
  console.log("🎒 trainerClass:", trainerClass || "(chưa đặt)");

  const res = await fetch(window.SHEET_BAI_HOC);
  const data = await res.json();
  const rows = data.data || data;

  const baiList = rows
    .map(r => {
      const lop = r.lop || r.Lop || r.Class;
      const bai = r.bai || r.Bai || r.Lesson;
      return lop === trainerClass && bai ? parseInt(bai, 10) : null;
    })
    .filter(v => typeof v === "number");

  if (baiList.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(...baiList);
}

// ===== Extract presentation data (theo chủ đề + giới hạn max lesson) =====
function extractPresentationData(rows, maxLessonCode) {
  const items = [];
  for (const r of rows) {
    const lessonName = safeStr(r.lessonName || r.Lesson || r.MaBai || (r.c ? r.c[1]?.v : r[1]));
    const presentation = safeStr(r.presentation || r.Sentence || r.CauHoi || (r.c ? r.c[8]?.v : r[8])).replace(/\s+/g, " ").trim();
    const meaning = safeStr(r.meaning || r.Vietnamese || r.Nghia || (r.c ? r.c[24]?.v : r[24]));
    const targetsRaw = safeStr(r.targets || r.Vocab || r.TuVung || (r.c ? r.c[2]?.v : r[2]));
    const topic = safeStr(r.topic || r.Topic || r.ChuDe || (r.c ? r.c[6]?.v : r[6]));

    const targets = targetsRaw ? targetsRaw.split(/[,/;|]/).map(s => s.trim()).filter(Boolean) : [];
    const unitNum = normalizeUnitId(lessonName);

    if (!lessonName || !presentation) continue;

    if (unitNum >= LOWER_BOUND_UNIT && unitNum <= maxLessonCode) {
      items.push({ lessonName, unitNum, presentation, meaning, targets, topic });
    }
  }
  return items;
}

// ===== Build sentences: mỗi bài 1 câu, vòng lại nếu thiếu nhưng không trùng =====
function buildSentences(items, count) {
  const byLesson = new Map();
  for (const it of items) {
    const key = it.lessonName;
    if (!byLesson.has(key)) byLesson.set(key, []);
    byLesson.get(key).push(it);
  }

  console.log("📚 Bản đồ bài → số câu:", [...byLesson.entries()].map(([k, v]) => ({ lesson: k, count: v.length })));

  const picked = [];
  const usedPerLesson = new Map();

  for (const [lesson, arr] of byLesson.entries()) {
    const randomIdx = Math.floor(Math.random() * arr.length);
    const chosen = arr[randomIdx];
    picked.push({
      text: chosen.presentation,
      target: chosen.targets[0] || "",
      meaning: chosen.meaning || "",
      lesson: lesson
    });
    usedPerLesson.set(lesson, new Set([chosen.presentation]));
    if (picked.length >= count) break;
  }
  console.log("🟢 Sau pass đầu (mỗi bài 1 câu):", picked.length);

  let loopCount = 0;
  while (picked.length < count && loopCount < 20) {
    let added = false;
    for (const [lesson, arr] of byLesson.entries()) {
      const used = usedPerLesson.get(lesson) || new Set();
      const candidates = arr.filter(it => !used.has(it.presentation));
      if (candidates.length > 0) {
        const randomIdx = Math.floor(Math.random() * candidates.length);
        const next = candidates[randomIdx];
        picked.push({
          text: next.presentation,
          target: next.targets[0] || "",
          meaning: next.meaning || "",
          lesson: lesson
        });
        used.add(next.presentation);
        usedPerLesson.set(lesson, used);
        added = true;
        if (picked.length >= count) break;
      }
    }
    loopCount++;
    if (!added) {
      console.warn("⚠️ Hết câu mới để vòng lại. Tổng câu chọn:", picked.length);
      break;
    }
  }

  console.table(picked.map((p, i) => ({ idx: i + 1, lesson: p.lesson, text: p.text })));
  return picked;
}

// ===== Utilities =====
function safeStr(v) { return v == null ? "" : String(v); }
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
function status(msg) { if (statusLine) statusLine.textContent = msg || ""; }
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.display = "block";
  setTimeout(() => { toastEl.style.display = "none"; }, 2500);
}