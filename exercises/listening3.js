// ===== listening3.js =====
// Bài nghe điền từ / trắc nghiệm, dựa trên dữ liệu Google Sheet dùng chung.
//
// === TÍNH NĂNG (bản rebuild) ===
// 1. Lọc theo phạm vi: "Trong phạm vi đã học" (giống trước, giới hạn theo mã bài
//    lớn nhất của lớp) hoặc "Theo dãy bài" (chọn từ bài - đến bài, không giới hạn).
// 2. Hình thức bài: "Đoạn văn" (dùng cột I - câu ví dụ, như trước) hoặc
//    "Đoạn hội thoại" (dùng cột J - câu hỏi và cột L - câu trả lời, đọc bằng
//    2 giọng nam/nữ xen kẽ như 2 người đang nói chuyện).
// 3. Hình thức làm bài: "Điền từ" (gõ vào ô trống, như trước) hoặc
//    "Trắc nghiệm A/B/C/D" (chọn từ đúng trong 4 lựa chọn).

// ===== Cột dữ liệu trong Sheet chính (SHEET_URL) =====
const COL = {
  lessonName: 1,   // B
  vocab: 2,        // C
  topic: 6,        // G
  presentation: 8, // I  - câu ví dụ (dùng cho "Đoạn văn")
  question: 9,     // J  - câu hỏi (dùng cho "Đoạn hội thoại")
  answer: 11       // L  - câu trả lời (dùng cho "Đoạn hội thoại")
};

const LOWER_BOUND_UNIT = 3011;

// ===== State =====
let L3_sentences = []; // mảng các "turn": paragraph {text,target,...} hoặc dialogue {question,answer,target,blankIn,...}
let L3_targets = [];
let L3_blankIndices = []; // index các turn bị đục lỗ
let L3_voiceMale = null;
let L3_voiceFemale = null;
let L3_score = 0;
let L3_total = 0;
let L3_ready = false;
let L3_speechRate = 1.0;
let L3_totalSentences = 8;
let L3_blankCount = 5;
let L3_isHighlight = true;

// Cấu hình mới
let L3_scopeMode = "hoc";       // "hoc" | "range"
let L3_contentForm = "paragraph"; // "paragraph" | "dialogue"
let L3_answerMode = "fill";     // "fill" | "choice"
let L3_allRows = [];
let L3_globalVocabPool = [];
let L3_userChoices = {};   // n -> giá trị đã chọn (chế độ trắc nghiệm)
let L3_choiceRefs = {};    // n -> { buttons:[], correct }

// Trạng thái đọc (phục vụ nút Tạm dừng / Tiếp tục / Dừng)
let L3_isSpeaking = false;
let L3_speechToken = 0;

// ===== Helpers =====
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.split("-");
  if (parts.length < 3) return 0;
  const [cls, lesson, part] = parts;
  return (
    parseInt(cls, 10) * 1000 + parseInt(lesson, 10) * 10 + parseInt(part, 10)
  );
}
function splitTargets(rawTarget) {
  return (rawTarget || "")
    .toLowerCase()
    .split(/[/;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
function pickRandomIndices(n, k) {
  let indices = [];
  const allPossible = Array.from({ length: n }, (_, i) => i);

  for (let attempt = 0; attempt < 50; attempt++) {
    allPossible.sort(() => Math.random() - 0.5);
    let candidate = allPossible.slice(0, k).sort((a, b) => a - b);

    let hasThreeConsecutive = false;
    for (let i = 0; i <= candidate.length - 3; i++) {
      if (candidate[i + 1] === candidate[i] + 1 && candidate[i + 2] === candidate[i] + 2) {
        hasThreeConsecutive = true;
        break;
      }
    }

    if (!hasThreeConsecutive) {
      indices = candidate;
      break;
    }
    indices = candidate;
  }

  return indices;
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function getVoices() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    speechSynthesis.onvoiceschanged = () =>
      resolve(speechSynthesis.getVoices());
  });
}
function updateScoreBoardL3() {
  const el = document.getElementById("scoreBoard");
  if (el) el.textContent = `🎯 Điểm: ${L3_score}/${L3_total}`;
}

// ===== TTS: đọc tuần tự 1 danh sách "lines" (mỗi line có text/voice/phần tử highlight) =====
// onDone (tùy chọn): gọi khi đọc xong toàn bộ (hoặc bị dừng hẳn), dùng để reset nút tạm dừng.
function speakLines(lines, onDone) {
  window.speechSynthesis.cancel();
  L3_isSpeaking = false;
  if (!lines || lines.length === 0) {
    if (onDone) onDone();
    return;
  }

  // Đánh dấu token của lượt đọc hiện tại để phân biệt với lượt đọc bị hủy trước đó
  const myToken = ++L3_speechToken;

  const clearHighlight = () => {
    document.querySelectorAll(".sentence-item").forEach((s) => {
      s.style.color = "";
      s.style.fontWeight = "";
      s.style.backgroundColor = "";
    });
  };
  const highlight = (el) => {
    if (!L3_isHighlight) return;
    clearHighlight();
    if (el) {
      el.style.color = "#e3350d";
      el.style.fontWeight = "bold";
      el.style.backgroundColor = "#fff3cd";
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const finish = () => {
    L3_isSpeaking = false;
    setTimeout(clearHighlight, 500);
    if (onDone) onDone();
  };

  const speakAt = (i) => {
    if (myToken !== L3_speechToken) return; // đã bị hủy/thay thế bởi lượt đọc khác
    if (i >= lines.length) { finish(); return; }

    const { text, voice, el } = lines[i];
    if (!text) { speakAt(i + 1); return; }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.voice = voice;
    utter.rate = L3_speechRate;

    utter.onstart = () => { L3_isSpeaking = true; highlight(el); };
    utter.onend = () => {
      if (myToken !== L3_speechToken) return;
      speakAt(i + 1);
    };
    utter.onerror = () => {
      if (myToken !== L3_speechToken) return;
      speakAt(i + 1);
    };
    window.speechSynthesis.speak(utter);
  };

  speakAt(0);
}

// Dừng hẳn việc đọc (hủy toàn bộ hàng đợi)
function stopSpeakingL3() {
  L3_speechToken++; // vô hiệu hóa callback của lượt đọc đang chạy
  window.speechSynthesis.cancel();
  L3_isSpeaking = false;
  document.querySelectorAll(".sentence-item").forEach((s) => {
    s.style.color = "";
    s.style.fontWeight = "";
    s.style.backgroundColor = "";
  });
}

// Xây danh sách "lines" cần đọc, tùy theo hình thức bài (đoạn văn / hội thoại)
function buildTTSLines() {
  if (L3_contentForm === "dialogue") {
    const lines = [];
    L3_sentences.forEach((s, idx) => {
      const qEl = document.querySelector(`.sentence-item[data-turn="${idx}"][data-role="question"]`);
      const aEl = document.querySelector(`.sentence-item[data-turn="${idx}"][data-role="answer"]`);
      lines.push({ text: s.question, voice: L3_voiceMale, el: qEl });
      lines.push({ text: s.answer, voice: L3_voiceFemale || L3_voiceMale, el: aEl });
    });
    return lines;
  }
  const spans = document.querySelectorAll(".sentence-item");
  return L3_sentences.map((s, idx) => ({ text: s.text, voice: L3_voiceMale, el: spans[idx] }));
}

// ===== Lấy mã bài học lớn nhất =====
async function getMaxLessonCode() {
  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
  console.log("🏫 Đang kiểm tra mã bài cho lớp:", trainerClass);

  try {
    const res = await fetch(SHEET_BAI_HOC);
    const rows = await res.json();

    const baiList = rows
      .map((r) => {
        const lop = (r[0] || "").toString().trim();
        const bai = (r[2] || "").toString().trim();
        return lop === trainerClass && bai ? parseInt(bai, 10) : null;
      })
      .filter((v) => typeof v === "number" && !isNaN(v));

    if (baiList.length === 0) {
      console.warn("⚠️ Không thấy bài học cho lớp này, dùng mã mặc định 3011");
      return 3011;
    }

    const maxCode = Math.max(...baiList);
    console.log("🚀 Mã bài học lớn nhất của lớp bạn là:", maxCode);
    return maxCode;
  } catch (err) {
    console.error("❌ Lỗi quét SHEET_BAI_HOC:", err);
    return 3011;
  }
}

// ===== Fetch dữ liệu chính, đồng thời cập nhật dropdown chủ đề + dãy bài =====
async function fetchGVizRows() {
  try {
    const res = await fetch(SHEET_URL);
    const rows = await res.json();

    if (rows && rows.length > 0) {
      updateTopicDropdown(rows);
      populateRangeSelectors(rows);
    }

    return rows || [];
  } catch (err) {
    console.error("❌ Lỗi fetch dữ liệu SHEET_URL:", err);
    return [];
  }
}

function updateTopicDropdown(rows) {
  const topicSelect = document.getElementById("topicSelect");
  if (!topicSelect) return;

  const currentSelected = topicSelect.value;

  const topics = [...new Set(rows.map(r => (r[COL.topic] || "").toString().trim()))]
    .filter(Boolean)
    .sort();

  topicSelect.innerHTML = '<option value="all">-- Tất cả chủ đề --</option>';

  topics.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    topicSelect.appendChild(opt);
  });

  if (currentSelected && topics.includes(currentSelected)) {
    topicSelect.value = currentSelected;
  } else {
    topicSelect.value = "all";
  }
}

// Đổ danh sách bài học (>= 3011) vào 2 dropdown "Từ bài" / "Đến bài" cho chế độ "Theo dãy bài"
function populateRangeSelectors(rows) {
  const rangeStartSelect = document.getElementById("rangeStartSelect");
  const rangeEndSelect = document.getElementById("rangeEndSelect");
  if (!rangeStartSelect || !rangeEndSelect) return;

  const seen = new Map();
  rows.forEach(r => {
    const lessonName = (r[COL.lessonName] || "").toString().trim();
    const unitNum = normalizeUnitId(lessonName);
    if (!lessonName || !unitNum || unitNum < LOWER_BOUND_UNIT) return;
    if (!seen.has(unitNum)) seen.set(unitNum, lessonName);
  });
  const entries = [...seen.entries()].sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return;

  const prevStart = rangeStartSelect.value;
  const prevEnd = rangeEndSelect.value;

  const optionsHTML = entries
    .map(([unitNum, name]) => `<option value="${unitNum}">${escapeHTML(name)}</option>`)
    .join("");
  rangeStartSelect.innerHTML = optionsHTML;
  rangeEndSelect.innerHTML = optionsHTML;

  if (prevStart && [...rangeStartSelect.options].some(o => o.value === prevStart)) {
    rangeStartSelect.value = prevStart;
  }
  if (prevEnd && [...rangeEndSelect.options].some(o => o.value === prevEnd)) {
    rangeEndSelect.value = prevEnd;
  } else {
    rangeEndSelect.selectedIndex = rangeEndSelect.options.length - 1;
  }
}

// Lọc rows theo phạm vi: "hoc" (giới hạn maxLessonCode) hoặc "range" (từ bài - đến bài)
function filterRowsByScope(rows, scopeMode, maxLessonCode, rangeStart, rangeEnd) {
  return rows.filter(r => {
    const lessonName = (r[COL.lessonName] || "").toString().trim();
    const unitNum = normalizeUnitId(lessonName);
    if (!unitNum) return false;
    if (scopeMode === "range") {
      if (!rangeStart || !rangeEnd) return false;
      return unitNum >= rangeStart && unitNum <= rangeEnd;
    }
    return unitNum >= LOWER_BOUND_UNIT && unitNum <= maxLessonCode;
  });
}

function groupByUnit(items) {
  const map = {};
  items.forEach(it => {
    if (!map[it.lessonName]) map[it.lessonName] = [];
    map[it.lessonName].push(it);
  });
  return map;
}

// Chọn ngẫu nhiên, rải đều theo từng bài học, tránh trùng trong cùng 1 bài
function selectAcrossUnits(unitMap, totalSentences) {
  const unitNames = Object.keys(unitMap);
  if (unitNames.length === 0) return [];

  const selected = [];
  unitNames.sort(() => Math.random() - 0.5);

  let unitIdx = 0;
  let safetyCounter = 0;
  const maxAttempts = totalSentences * 5;

  while (selected.length < totalSentences && unitNames.length > 0 && safetyCounter < maxAttempts) {
    const currentUnitName = unitNames[unitIdx % unitNames.length];
    const rowsInUnit = unitMap[currentUnitName];
    const availableRows = rowsInUnit.filter(row => !selected.includes(row));

    if (availableRows.length > 0) {
      const chosen = availableRows[Math.floor(Math.random() * availableRows.length)];
      selected.push(chosen);
    }
    unitIdx++;
    safetyCounter++;
  }

  selected.sort((a, b) => a.unitNum - b.unitNum);
  return selected;
}

// ===== Trích xuất dữ liệu "Đoạn văn" (cột I) =====
function extractParagraphData(rows, opts) {
  const { scopeMode, maxLessonCode, rangeStart, rangeEnd, totalSentences, selectedTopic } = opts;
  const scopeRows = filterRowsByScope(rows, scopeMode, maxLessonCode, rangeStart, rangeEnd);

  const items = scopeRows
    .map((r) => {
      const lessonName = (r[COL.lessonName] || "").toString().trim();
      const vocabRaw = (r[COL.vocab] || "").toString().trim();
      const topic = (r[COL.topic] || "").toString().trim();
      const presentation = (r[COL.presentation] || "").toString().trim();

      const unitNum = normalizeUnitId(lessonName);
      const targets = splitTargets(vocabRaw);
      const mainTarget = targets[0] || "";

      return { lessonName, unitNum, presentation, mainTarget, topic };
    })
    .filter((it) => {
      const hasData = it.lessonName && it.presentation && it.mainTarget;
      const matchesTopic = (selectedTopic === "all" || it.topic === selectedTopic);
      const targetInText = new RegExp(`\\b${escapeRegExp(it.mainTarget)}\\b`, "i").test(it.presentation);
      return hasData && matchesTopic && targetInText;
    });

  const unitMap = groupByUnit(items);
  return selectAcrossUnits(unitMap, totalSentences);
}

// ===== Trích xuất dữ liệu "Đoạn hội thoại" (cột J = câu hỏi, cột L = câu trả lời) =====
function extractDialogueData(rows, opts) {
  const { scopeMode, maxLessonCode, rangeStart, rangeEnd, totalSentences, selectedTopic } = opts;
  const scopeRows = filterRowsByScope(rows, scopeMode, maxLessonCode, rangeStart, rangeEnd);

  const items = scopeRows
    .map((r) => {
      const lessonName = (r[COL.lessonName] || "").toString().trim();
      const vocabRaw = (r[COL.vocab] || "").toString().trim();
      const topic = (r[COL.topic] || "").toString().trim();
      const question = (r[COL.question] || "").toString().trim();
      const answer = (r[COL.answer] || "").toString().trim();

      const unitNum = normalizeUnitId(lessonName);
      const targets = splitTargets(vocabRaw);
      const mainTarget = targets[0] || "";

      return { lessonName, unitNum, question, answer, mainTarget, topic };
    })
    .filter((it) => {
      const hasData = it.lessonName && it.question && it.answer && it.mainTarget;
      const matchesTopic = (selectedTopic === "all" || it.topic === selectedTopic);
      if (!hasData || !matchesTopic) return false;

      const rx = new RegExp(`\\b${escapeRegExp(it.mainTarget)}\\b`, "i");
      const inQuestion = rx.test(it.question);
      const inAnswer = rx.test(it.answer);
      if (!inQuestion && !inAnswer) return false;

      // Ưu tiên đục lỗ ở câu trả lời; nếu từ mục tiêu chỉ nằm trong câu hỏi thì đục lỗ ở câu hỏi
      it.blankIn = inAnswer ? "answer" : "question";
      return true;
    });

  const unitMap = groupByUnit(items);
  return selectAcrossUnits(unitMap, totalSentences);
}

// Danh sách từ vựng toàn cục (>= 3011) dùng làm đáp án nhiễu cho chế độ trắc nghiệm
function buildGlobalVocabPool(rows) {
  const set = new Set();
  rows.forEach(r => {
    const lessonName = (r[COL.lessonName] || "").toString().trim();
    const unitNum = normalizeUnitId(lessonName);
    if (!unitNum || unitNum < LOWER_BOUND_UNIT) return;
    const vocabRaw = (r[COL.vocab] || "").toString().trim();
    const targets = splitTargets(vocabRaw);
    if (targets[0]) set.add(targets[0]);
  });
  return [...set];
}

// Xây 4 lựa chọn (1 đúng + 3 nhiễu) cho 1 chỗ trống
function buildOptionsForBlank(correct, sessionTargets, globalPool) {
  const correctLower = correct.toLowerCase();
  let pool = [...new Set(sessionTargets.filter(t => t && t.toLowerCase() !== correctLower))];
  shuffleInPlace(pool);
  let distractors = pool.slice(0, 3);

  if (distractors.length < 3) {
    const usedLower = new Set([correctLower, ...distractors.map(d => d.toLowerCase())]);
    const extra = globalPool.filter(t => t && !usedLower.has(t.toLowerCase()));
    distractors = distractors.concat(shuffleInPlace(extra).slice(0, 3 - distractors.length));
  }

  return shuffleInPlace([correct, ...distractors]);
}

function buildParagraphAndBlanks() {
  L3_blankIndices = pickRandomIndices(
    L3_sentences.length,
    Math.min(L3_blankCount, L3_sentences.length),
  );
  L3_total = L3_blankIndices.length;
}

function buildInstructionText() {
  const formText = L3_contentForm === "dialogue" ? "đoạn hội thoại" : "đoạn văn";
  const actionText = L3_answerMode === "choice"
    ? `chọn đúng đáp án cho ${L3_blankCount} chỗ trống (trắc nghiệm A/B/C/D)`
    : `điền ${L3_blankCount} từ còn thiếu`;
  return `🧩 Nghe ${formText} và ${actionText}:`;
}

// ===== Render giao diện bài làm =====
function renderListening3() {
  const area = document.getElementById("exerciseArea");
  const resultBox = document.getElementById("resultBox");

  const blankOrderMap = {};
  let counter = 1;
  L3_sentences.forEach((s, idx) => {
    if (L3_blankIndices.includes(idx)) blankOrderMap[idx] = counter++;
  });

  let paragraphDisplay = "";
  let listenBtnLabel = "▶️ Nghe đoạn văn";

  if (L3_contentForm === "dialogue") {
    listenBtnLabel = "▶️ Nghe hội thoại";
    paragraphDisplay = L3_sentences.map((s, idx) => {
      const blanked = L3_blankIndices.includes(idx);
      const n = blankOrderMap[idx];
      let qDisplay = s.question;
      let aDisplay = s.answer;

      if (blanked) {
        const rx = new RegExp(`\\b${escapeRegExp(s.target)}\\b`, "gi");
        if (s.blankIn === "question") qDisplay = s.question.replace(rx, `(${n})__`);
        else aDisplay = s.answer.replace(rx, `(${n})__`);
      }

      return `
        <div class="dialogue-turn">
          <div class="dialogue-line q"><span class="speaker-tag">🔴 A:</span> <span class="sentence-item" data-turn="${idx}" data-role="question">${qDisplay}</span></div>
          <div class="dialogue-line a"><span class="speaker-tag">🔵 B:</span> <span class="sentence-item" data-turn="${idx}" data-role="answer">${aDisplay}</span></div>
        </div>
      `;
    }).join("");
  } else {
    const renderedParts = L3_sentences.map((s, idx) => {
      let displayBody = s.text;
      if (L3_blankIndices.includes(idx)) {
        const n = blankOrderMap[idx];
        const rx = new RegExp(`\\b${escapeRegExp(s.target)}\\b`, "gi");
        displayBody = s.text.replace(rx, `(${n})__`);
      }
      return `<span class="sentence-item" data-turn="${idx}">${displayBody}</span>`;
    });
    paragraphDisplay = renderedParts.join(". ").replace(/\s+\./g, ".").trim() + ".";
  }

  area.innerHTML = `
    <div class="dialogue-text">
      <p>${buildInstructionText()}</p>
      <div id="paragraphBox" style="font-size:20px; color:#667; margin-bottom:10px; line-height:1.6;">
        ${paragraphDisplay}
      </div>
      <div style="margin-bottom:10px; display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
        <button id="playParagraphBtn" class="btn primary">${listenBtnLabel}</button>
        <button id="pauseResumeBtn" class="btn secondary" disabled>⏸ Tạm dừng</button>
        <button id="stopSpeakBtn" class="btn secondary" disabled>⏹ Dừng đọc</button>
      </div>
      <div id="inputsArea"></div>
      <div style="margin-top:12px;">
        <button id="submitL3Btn" class="btn success">✅ Nộp bài</button>
      </div>
    </div>
  `;

  renderInputsArea(blankOrderMap);

  const playBtn = document.getElementById("playParagraphBtn");
  const pauseResumeBtn = document.getElementById("pauseResumeBtn");
  const stopSpeakBtn = document.getElementById("stopSpeakBtn");

  const resetPlaybackButtons = () => {
    pauseResumeBtn.disabled = true;
    pauseResumeBtn.textContent = "⏸ Tạm dừng";
    stopSpeakBtn.disabled = true;
  };

  playBtn.onclick = () => {
    pauseResumeBtn.disabled = false;
    pauseResumeBtn.textContent = "⏸ Tạm dừng";
    stopSpeakBtn.disabled = false;
    speakLines(buildTTSLines(), resetPlaybackButtons);
  };

  pauseResumeBtn.onclick = () => {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      pauseResumeBtn.textContent = "▶️ Tiếp tục";
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      pauseResumeBtn.textContent = "⏸ Tạm dừng";
    }
  };

  stopSpeakBtn.onclick = () => {
    stopSpeakingL3();
    resetPlaybackButtons();
  };

  document.getElementById("submitL3Btn").onclick = function () {
    stopSpeakingL3();
    resetPlaybackButtons();

    const submitBtn = this;
    let correct = 0;

    Object.entries(blankOrderMap).forEach(([idx, n]) => {
      const target = (L3_sentences[idx].target || "").trim().toLowerCase();

      if (L3_answerMode === "choice") {
        const ref = L3_choiceRefs[n];
        const chosen = (L3_userChoices[n] || "").trim().toLowerCase();
        const isRight = chosen && chosen === target;
        if (isRight) correct++;

        if (ref) {
          ref.buttons.forEach(b => {
            b.disabled = true;
            const val = b.textContent.trim().toLowerCase();
            if (val === target) b.classList.add("choice-correct");
            else if (b.classList.contains("selected")) b.classList.add("choice-wrong");
          });
        }
      } else {
        const inputEl = document.getElementById(`blankInput-${n}`);
        const inputVal = (inputEl.value || "").trim().toLowerCase();
        if (inputVal && inputVal === target) correct++;
        inputEl.disabled = true;
        inputEl.style.backgroundColor = "#f0f0f0";
      }
    });

    L3_score = correct;
    resultBox.textContent = `✅ Đúng ${correct}/${L3_total}`;
    updateScoreBoardL3();
    setResultListeningPart(3, L3_score, L3_total);

    showL3Answers();

    submitBtn.disabled = true;
    submitBtn.textContent = "⌛ Đã ghi nhận điểm";
    submitBtn.classList.remove("success");
    submitBtn.style.opacity = "0.6";
    submitBtn.style.cursor = "not-allowed";
  };
}

// Render khu vực trả lời: ô nhập (fill) hoặc 4 nút trắc nghiệm (choice)
function renderInputsArea(blankOrderMap) {
  const inputsArea = document.getElementById("inputsArea");
  inputsArea.innerHTML = "";
  L3_userChoices = {};
  L3_choiceRefs = {};

  if (L3_answerMode === "choice") {
    inputsArea.className = "choice-area";
    const sessionTargets = L3_sentences.map(s => s.target);

    Object.entries(blankOrderMap).forEach(([idx, n]) => {
      const correct = L3_sentences[idx].target;
      const options = buildOptionsForBlank(correct, sessionTargets, L3_globalVocabPool);

      const group = document.createElement("div");
      group.className = "choice-group";

      const label = document.createElement("div");
      label.className = "choice-label";
      label.textContent = `(${n})`;
      group.appendChild(label);

      const optsWrap = document.createElement("div");
      optsWrap.className = "choice-options";
      const buttons = [];

      options.forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn";
        btn.textContent = opt;
        btn.onclick = () => {
          optsWrap.querySelectorAll(".choice-btn").forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
          L3_userChoices[n] = opt;
        };
        buttons.push(btn);
        optsWrap.appendChild(btn);
      });

      group.appendChild(optsWrap);
      inputsArea.appendChild(group);

      L3_choiceRefs[n] = { buttons, correct };
    });
  } else {
    inputsArea.className = "inputs-area";
    Object.entries(blankOrderMap).forEach(([idx, n]) => {
      const row = document.createElement("div");
      row.className = "input-row";
      row.innerHTML = `
        <label><strong>(${n})</strong></label>
        <input type="text" id="blankInput-${n}" placeholder="Điền từ" />
      `;
      inputsArea.appendChild(row);
    });
  }
}

// Hiển thị đáp án đầy đủ sau khi nộp bài
function showL3Answers() {
  const area = document.getElementById("exerciseArea");
  let resolvedHTML = "";

  if (L3_contentForm === "dialogue") {
    resolvedHTML = L3_sentences.map(s => {
      const rx = new RegExp(`\\b${escapeRegExp(s.target)}\\b`, "gi");
      const highlight = `<b style="color:#cc3333;">${s.target}</b>`;
      const q = s.blankIn === "question" ? s.question.replace(rx, highlight) : s.question;
      const a = s.blankIn === "answer" ? s.answer.replace(rx, highlight) : s.answer;
      return `<div class="dialogue-line q">🔴 A: ${q}</div><div class="dialogue-line a">🔵 B: ${a}</div>`;
    }).join("");
  } else {
    const resolvedParts = L3_sentences.map(s => {
      const rx = new RegExp(`\\b${escapeRegExp(s.target)}\\b`, "gi");
      const highlighted = `<b style="color:#cc3333;">${s.target}</b>`;
      return s.text.replace(rx, highlighted);
    });
    resolvedHTML = resolvedParts.join(". ").replace(/\s+\./g, ".").trim() + ".";
  }

  const answerBox = document.createElement("div");
  answerBox.style.marginTop = "10px";
  answerBox.innerHTML = `
    <div style="margin-top:10px; font-size:18px;">
      🧠 Đáp án đầy đủ:
      <div style="color:#333; margin-top:6px;">${resolvedHTML}</div>
    </div>
  `;
  area.appendChild(answerBox);
}

function setResultListeningPart(mode, score, total) {
  const raw = localStorage.getItem("result_listening");
  const prev = raw ? JSON.parse(raw) : {};

  const updated = {
    score1: mode === 1 ? score : prev.score1 || 0,
    score2: mode === 2 ? score : prev.score2 || 0,
    score3: mode === 3 ? score : prev.score3 || 0,
    total1: mode === 1 ? total : prev.total1 || 0,
    total2: mode === 2 ? total : prev.total2 || 0,
    total3: mode === 3 ? total : prev.total3 || 0,
  };

  const totalScore = updated.score1 + updated.score2 + updated.score3;
  const totalMax = updated.total1 + updated.total2 + updated.total3;

  localStorage.setItem(
    "result_listening",
    JSON.stringify({
      ...updated,
      score: totalScore,
      total: totalMax,
    }),
  );
}

// ===== Main: khởi chạy bài =====
async function startListeningMode3(options) {
  const {
    totalSentences = 8,
    blankCount = 5,
    scopeMode = "hoc",
    rangeStart = null,
    rangeEnd = null,
    contentForm = "paragraph",
    answerMode = "fill"
  } = options || {};

  try {
    const area = document.getElementById("exerciseArea");
    const resultBox = document.getElementById("resultBox");

    L3_scopeMode = scopeMode;
    L3_contentForm = contentForm;
    L3_answerMode = answerMode;

    let maxLessonCode = null;
    if (scopeMode === "hoc") {
      maxLessonCode = await getMaxLessonCode();
      if (!maxLessonCode) {
        area.innerHTML = "⚠️ Không xác định được phạm vi bài học từ dữ liệu Sheet.";
        return;
      }
    } else {
      if (!rangeStart || !rangeEnd) {
        area.innerHTML = "⚠️ Vui lòng chọn dãy bài (từ bài - đến bài).";
        return;
      }
    }

    const topicSelect = document.getElementById("topicSelect");
    const selectedTopic = topicSelect ? topicSelect.value : "all";

    const rows = await fetchGVizRows();
    if (!rows || rows.length === 0) {
      area.innerHTML = "📭 Không có dữ liệu từ Google Sheets.";
      return;
    }
    L3_allRows = rows;
    L3_globalVocabPool = buildGlobalVocabPool(rows);

    let rs = rangeStart ? parseInt(rangeStart, 10) : null;
    let re = rangeEnd ? parseInt(rangeEnd, 10) : null;
    if (rs && re && rs > re) { [rs, re] = [re, rs]; }

    const extractOpts = {
      scopeMode,
      maxLessonCode,
      rangeStart: rs,
      rangeEnd: re,
      totalSentences,
      selectedTopic
    };

    const selected = contentForm === "dialogue"
      ? extractDialogueData(rows, extractOpts)
      : extractParagraphData(rows, extractOpts);

    if (selected.length < totalSentences) {
      const topicName = selectedTopic === "all" ? "" : ` thuộc chủ đề "${selectedTopic}"`;
      const formName = contentForm === "dialogue" ? "câu hội thoại" : "câu";
      area.innerHTML = `
        <div class="dialogue-text">
          📭 Không đủ dữ liệu ${formName}${topicName} để tạo bài.
          <br>Hiện có: <b>${selected.length}/${totalSentences}</b> ${formName} thỏa mãn.
          <br><i>Gợi ý: Hãy thử giảm số lượng câu, chọn "Tất cả chủ đề", hoặc mở rộng phạm vi/dãy bài.</i>
        </div>`;
      return;
    }

    const selectedFinal = selected.slice(0, totalSentences);

    if (contentForm === "dialogue") {
      L3_sentences = selectedFinal.map((it) => ({
        type: "dialogue",
        question: it.question,
        answer: it.answer,
        target: it.mainTarget,
        blankIn: it.blankIn,
        lessonName: it.lessonName,
        unitNum: it.unitNum,
      }));
    } else {
      L3_sentences = selectedFinal.map((it) => ({
        type: "paragraph",
        text: it.presentation,
        target: it.mainTarget,
        lessonName: it.lessonName,
        unitNum: it.unitNum,
      }));
    }

    L3_targets = L3_sentences.map((s) => s.target);
    L3_blankCount = blankCount;

    buildParagraphAndBlanks();

    stopSpeakingL3();

    L3_ready = true;
    L3_score = 0;
    if (resultBox) resultBox.textContent = "";
    updateScoreBoardL3();
    renderListening3();

    console.log(`✅ Đã nạp xong ${L3_sentences.length} câu (${contentForm}/${answerMode}). Topic: ${selectedTopic}, Scope: ${scopeMode}`);

  } catch (err) {
    console.error("❌ Listening 3 error:", err);
    document.getElementById("exerciseArea").innerHTML = "❌ Lỗi hệ thống khi tải dữ liệu Listening 3.";
  }
}

// ===== Bootstrapping =====
getVoices().then(async (voices) => {
  L3_voiceMale = voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("david")) ||
                 voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("male")) ||
                 voices[0];

  L3_voiceFemale = voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("zira")) ||
                    voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("female")) ||
                    voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("samantha")) ||
                    voices.find(v => v.lang === "en-US" && v !== L3_voiceMale) ||
                    voices[0];

  const rows = await fetchGVizRows(); // đã tự gọi updateTopicDropdown + populateRangeSelectors bên trong

  document.getElementById("exerciseArea").innerHTML = `
    <div style="text-align:center; padding:40px; color:#888; border:2px dashed #ddd; border-radius:10px;">
      <h3>🎧 Sẵn sàng bài nghe Mode 3</h3>
      <p>Vui lòng chọn các tùy chọn bên trên, sau đó nhấn <b>"Tạo bài mới"</b></p>
    </div>
  `;

  setupDropdownListeners();
});

function setupDropdownListeners() {
  const applyBtn = document.getElementById("applySettingsBtn");

  const rateSelect = document.getElementById("speechRateSelect");
  const highlightSelect = document.getElementById("highlightSelect");
  const totalSelect = document.getElementById("totalSentences");
  const blankSelect = document.getElementById("blankCount");
  const rangeStartSelect = document.getElementById("rangeStartSelect");
  const rangeEndSelect = document.getElementById("rangeEndSelect");
  const rangeRow = document.getElementById("rangeRow");

  // Khung "Từ bài / Đến bài" luôn hiển thị; chỉ làm mờ (disabled) khi không dùng tới
  document.querySelectorAll('input[name="scopeMode"]').forEach(r => {
    r.onchange = () => {
      const mode = document.querySelector('input[name="scopeMode"]:checked').value;
      if (rangeRow) rangeRow.classList.toggle("disabled-range", mode !== "range");
    };
  });

  if (applyBtn) {
    applyBtn.onclick = () => {
      if (rateSelect) L3_speechRate = parseFloat(rateSelect.value);
      if (highlightSelect) L3_isHighlight = (highlightSelect.value === "yes");

      const total = parseInt(totalSelect.value, 10);
      const blank = parseInt(blankSelect.value, 10);

      if (blank > total) {
        alert(`⚠️ Lỗi: Số từ cần điền (${blank}) không thể lớn hơn tổng số câu (${total})!`);
        return;
      }

      const scopeMode = document.querySelector('input[name="scopeMode"]:checked').value;
      const contentForm = document.querySelector('input[name="contentForm"]:checked').value;
      const answerMode = document.querySelector('input[name="answerMode"]:checked').value;

      let rangeStart = null, rangeEnd = null;
      if (scopeMode === "range") {
        rangeStart = rangeStartSelect ? rangeStartSelect.value : null;
        rangeEnd = rangeEndSelect ? rangeEndSelect.value : null;
        if (!rangeStart || !rangeEnd) {
          alert("⚠️ Vui lòng chọn dãy bài (từ bài - đến bài).");
          return;
        }
      }

      const resultBox = document.getElementById("resultBox");
      if (resultBox) {
        resultBox.textContent = "⏳ Đang khởi tạo bài học mới...";
        resultBox.style.color = "#2a75bb";
      }

      startListeningMode3({
        totalSentences: total,
        blankCount: blank,
        scopeMode,
        rangeStart,
        rangeEnd,
        contentForm,
        answerMode
      });
    };
  }
}