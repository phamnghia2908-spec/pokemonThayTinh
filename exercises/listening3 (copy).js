// ===== Config =====


// ===== State =====
// ===== State =====
let L3_sentences = []; // [{ text, target, lessonName, unitNum }]
let L3_targets = []; // danh sách 8 từ vựng cột C (tương ứng từng câu)
let L3_blankIndices = []; // index các câu bị che (5 trong 8)
let L3_voiceMale = null;
let L3_voiceFemale = null;
let L3_score = 0;
let L3_total = 0; // số blank (5)
let L3_ready = false;
let L3_speechRate = 1.0;
// THÊM 2 DÒNG NÀY
let L3_totalSentences = 8; // mặc định 8 câu
let L3_blankCount = 5; // mặc định 5 từ cần điền
let L3_isHighlight = true; // Mặc định bật
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
// --- THAY THẾ TOÀN BỘ HÀM pickRandomIndices ---
function pickRandomIndices(n, k) {
    let indices = [];
    const allPossible = Array.from({ length: n }, (_, i) => i);

    // Thử tối đa 50 lần để tìm ra bộ chỉ số hợp lệ (tránh vòng lặp vô tận)
    for (let attempt = 0; attempt < 50; attempt++) {
        allPossible.sort(() => Math.random() - 0.5);
        let candidate = allPossible.slice(0, k).sort((a, b) => a - b);

        // Kiểm tra xem có 3 số liên tiếp không (ví dụ: 1, 2, 3)
        let hasThreeConsecutive = false;
        for (let i = 0; i <= candidate.length - 3; i++) {
            if (candidate[i+1] === candidate[i] + 1 && candidate[i+2] === candidate[i] + 2) {
                hasThreeConsecutive = true;
                break;
            }
        }

        if (!hasThreeConsecutive) {
            indices = candidate;
            break;
        }

        // Nếu là lần thử cuối cùng mà vẫn không được, cứ lấy đại kết quả gần nhất
        indices = candidate; 
    }

    return indices;
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function getVoices() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    speechSynthesis.onvoiceschanged = () =>
      resolve(speechSynthesis.getVoices());
  });
}
function speak(text, voice) {
  if (!text) return;

  // Dừng các câu đang đọc dở để tránh bị loạn khi nhấn nút nghe liên tục
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  if (voice) u.voice = voice;

  // ÁP DỤNG TỐC ĐỘ ĐÃ CHỌN Ở ĐÂY
  u.rate = L3_speechRate; 

  window.speechSynthesis.speak(u);
}
function updateScoreBoardL3() {
  const el = document.getElementById("scoreBoard");
  if (el) el.textContent = `🎯 Điểm: ${L3_score}/${L3_total}`;
}


async function getMaxLessonCode() {
  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
  console.log("🏫 Đang kiểm tra mã bài cho lớp:", trainerClass);

  try {
    const res = await fetch(SHEET_BAI_HOC);
    const rows = await res.json(); 

    const baiList = rows
      .map((r) => {
        const lop = (r[0] || "").toString().trim(); // Cột A: Tên lớp
        const bai = (r[2] || "").toString().trim(); // Cột C: Mã bài học
        // CHỈ LẤY mã bài nếu dòng đó đúng là lớp của mình
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

// Hàm fetch dữ liệu câu hỏi (Dùng SHEET_URL từ googleSheetLinks.js)
// Hàm fetch dữ liệu và tự động cập nhật danh sách Topic vào dropdown
async function fetchGVizRows() {
  try {
    const res = await fetch(SHEET_URL);
    const rows = await res.json();

    if (rows && rows.length > 0) {
      updateTopicDropdown(rows);
    }

    return rows || [];
  } catch (err) {
    console.error("❌ Lỗi fetch dữ liệu SHEET_URL:", err);
    return [];
  }
}

// Hàm trích xuất và hiển thị danh sách Topic duy nhất
function updateTopicDropdown(rows) {
  const topicSelect = document.getElementById("topicSelect");
  if (!topicSelect) return;

  // 1. Lưu lại giá trị hiện tại người dùng đang chọn
  const currentSelected = topicSelect.value;

  // 2. Lấy danh sách Topic duy nhất
  const topics = [...new Set(rows.map(r => (r[6] || "").toString().trim()))]
    .filter(Boolean)
    .sort();

  // 3. Render lại danh sách
  topicSelect.innerHTML = '<option value="all">-- Tất cả chủ đề --</option>';

  topics.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    topicSelect.appendChild(opt);
  });

  // 4. QUAN TRỌNG: Gán lại giá trị cũ nếu nó vẫn tồn tại trong danh sách mới
  if (currentSelected && topics.includes(currentSelected)) {
    topicSelect.value = currentSelected;
  } else {
    topicSelect.value = "all";
  }
}
/**
 * Trích xuất và lọc dữ liệu Presentation (Câu ví dụ)
 * @param {Array} rows - Mảng 2 chiều từ Google Sheets
 * @param {Number} maxLessonCode - Mã bài học lớn nhất để giới hạn phạm vi học
 * @param {Number} totalSentences - Số lượng câu cần lấy (mặc định 8)
 * @param {String} selectedTopic - Tên chủ đề để lọc (mặc định "all")
 */
function extractPresentationData(rows, maxLessonCode, totalSentences = 8, selectedTopic = "all") {
  // 1. Mapping và lọc thô dữ liệu
  const items = rows
    .map((r) => {
      const lessonName = (r[1] || "").toString().trim();   // Cột B (Index 1)
      const vocabRaw = (r[2] || "").toString().trim();     // Cột C (Index 2)
      const topic = (r[6] || "").toString().trim();        // Cột G (Index 6) - CHỦ ĐỀ
      const presentation = (r[8] || "").toString().trim(); // Cột I (Index 8) - CÂU VÍ DỤ

      const unitNum = normalizeUnitId(lessonName);
      const targets = splitTargets(vocabRaw);
      const mainTarget = targets[0] || ""; // Lấy từ vựng đầu tiên làm mục tiêu chính

      return { lessonName, unitNum, presentation, mainTarget, topic };
    })
    .filter((it) => {
      // Điều kiện bắt buộc: Phải có tên bài, có câu ví dụ và có từ vựng mục tiêu
      const hasData = it.lessonName && it.presentation && it.mainTarget;

      // Lọc theo Topic (nếu chọn "all" thì bỏ qua bước này)
      const matchesTopic = (selectedTopic === "all" || it.topic === selectedTopic);

      // Kiểm tra xem từ vựng mục tiêu có thực sự nằm trong câu presentation không (để còn đục lỗ)
      const targetInText = new RegExp(`\\b${escapeRegExp(it.mainTarget)}\\b`, "i").test(it.presentation);

      return hasData && matchesTopic && targetInText;
    });

  // 2. Lọc theo phạm vi bài đã học (từ bài 3011 đến bài hiện tại)
  const filtered = items.filter(
    (it) => it.unitNum >= 3011 && it.unitNum <= maxLessonCode
  );

  // 3. Gom nhóm theo bài học (Unit/Lesson) để tránh lấy trùng câu trong cùng 1 bài
  const unitMap = {};
  filtered.forEach((it) => {
    if (!unitMap[it.lessonName]) unitMap[it.lessonName] = [];
    unitMap[it.lessonName].push(it);
  });

  const unitNames = Object.keys(unitMap);
  if (unitNames.length === 0) return [];

  // Bước 4 trong extractPresentationData của ông
  const selected = [];
  unitNames.sort(() => Math.random() - 0.5);

  let unitIdx = 0;
  let safetyCounter = 0; // Thêm biến bảo vệ
  const maxAttempts = totalSentences * 5; // Giới hạn số lần thử tìm câu

  while (selected.length < totalSentences && unitNames.length > 0 && safetyCounter < maxAttempts) {
      const currentUnitName = unitNames[unitIdx % unitNames.length];
      const rowsInUnit = unitMap[currentUnitName];

      // Lọc lấy những câu chưa có trong danh sách selected
      const availableRows = rowsInUnit.filter(row => !selected.includes(row));

      if (availableRows.length > 0) {
          // Chọn ngẫu nhiên 1 câu trong số các câu còn lại của Unit này
          const chosen = availableRows[Math.floor(Math.random() * availableRows.length)];
          selected.push(chosen);
      }

      unitIdx++;
      safetyCounter++;
  }

  // 5. Sắp xếp lại theo mã bài học (unitNum) để mạch truyện/đoạn văn logic hơn
  selected.sort((a, b) => a.unitNum - b.unitNum);

  return selected; // Trả về mảng các object [{ lessonName, unitNum, presentation, mainTarget, topic }]
}

function buildParagraphAndBlanks() {
  // L3_sentences: 8 câu, mỗi câu có text và target
  // Chọn ngẫu nhiên 5 câu để che từ (blank)
  L3_blankIndices = pickRandomIndices(
    L3_sentences.length,
    Math.min(L3_blankCount, L3_sentences.length),
  );
  L3_total = L3_blankIndices.length;
}

function renderListening3() {
  const area = document.getElementById("exerciseArea");
  const resultBox = document.getElementById("resultBox");

  // Tạo map idx -> số thứ tự theo thứ tự xuất hiện
  const blankOrderMap = {};
  let counter = 1;
  L3_sentences.forEach((s, idx) => {
    if (L3_blankIndices.includes(idx)) {
      blankOrderMap[idx] = counter++;
    }
  });

  // Đoạn văn hiển thị với (n)__
  const renderedParts = L3_sentences.map((s, idx) => {
    if (L3_blankIndices.includes(idx)) {
      const n = blankOrderMap[idx];
      const rx = new RegExp(`\\b${escapeRegExp(s.target)}\\b`, "gi");
      return s.text.replace(rx, `(${n})__`);
    }
    return s.text;
  });

  const paragraphDisplay =
    renderedParts.join(". ").replace(/\s+\./g, ".").trim() + ".";
  const paragraphOriginal =
    L3_sentences.map((s) => s.text)
      .join(". ")
      .replace(/\s+\./g, ".")
      .trim() + ".";

  area.innerHTML = `
    <div class="dialogue-text">
      <p>🧩 Nghe đoạn văn và điền 5 từ còn thiếu:</p>
      <div id="paragraphBox" style="font-size:20px; color:#667; margin-bottom:10px;">${paragraphDisplay}</div>
      <div style="margin-bottom:10px;">
        <button id="playParagraphBtn" class="btn primary">▶️ Nghe đoạn văn</button>
      </div>
      <div id="inputsArea"></div>
      <div style="margin-top:12px;">
        <button id="submitL3Btn" class="btn success">✅ Nộp bài</button>
      </div>
    </div>
  `;

  // Render inputs theo đúng thứ tự 1..5
  const inputsArea = document.getElementById("inputsArea");
  inputsArea.innerHTML = "";
  Object.entries(blankOrderMap).forEach(([idx, n]) => {
    const row = document.createElement("div");
    row.style.margin = "6px 0";
    row.innerHTML = `
      <label><strong>(${n})</strong></label>
      <input type="text" id="blankInput-${n}" placeholder="Điền từ" style="padding:6px; width:220px;" />
    `;
    inputsArea.appendChild(row);
  });

  // Nút nghe: đọc nguyên văn
  document.getElementById("playParagraphBtn").onclick = () => {
    speak(paragraphOriginal, L3_voiceMale);
  };

  // Nút nộp bài
  // Nút nộp bài
  document.getElementById("submitL3Btn").onclick = function() {
    const submitBtn = this; // Lưu lại tham chiếu nút nộp bài
    let correct = 0;

    // Duyệt qua các ô input để tính điểm
    Object.entries(blankOrderMap).forEach(([idx, n]) => {
      const inputEl = document.getElementById(`blankInput-${n}`);
      const inputVal = (inputEl.value || "").trim().toLowerCase();
      const target = (L3_sentences[idx].target || "").trim().toLowerCase();

      if (inputVal && inputVal === target) correct++;

      // ✅ KHOÁ ô điền từ: Không cho sửa sau khi đã nộp
      inputEl.disabled = true;
      inputEl.style.backgroundColor = "#f0f0f0"; // Đổi màu nền cho người dùng biết là đã khoá
    });

    // Cập nhật kết quả
    L3_score = correct;
    resultBox.textContent = `✅ Đúng ${correct}/${L3_total}`;
    updateScoreBoardL3();
    setResultListeningPart(3, L3_score, L3_total);

    // Hiển thị đáp án
    showL3Answers();

    // ✅ KHOÁ nút nộp bài: Không cho ấn nhiều lần
    submitBtn.disabled = true;
    submitBtn.textContent = "⌛ Đã ghi nhận điểm";
    submitBtn.classList.remove("success");
    submitBtn.style.opacity = "0.6";
    submitBtn.style.cursor = "not-allowed";
  };
}

function showL3Answers() {
  // Hiển thị đoạn văn với đáp án đúng được tô màu
  const area = document.getElementById("exerciseArea");
  const resolvedParts = L3_sentences.map((s, idx) => {
    const target = s.target;
    if (L3_blankIndices.includes(idx)) {
      const highlighted = `<b style="color:#cc3333;">${target}</b>`;
      const rx = new RegExp(`\\b${escapeRegExp(target)}\\b`, "gi");
      return `${s.text.replace(rx, highlighted)}`;
    }
    return s.text;
  });
  const resolvedParagraph =
    resolvedParts.join(". ").replace(/\s+\./g, ".").trim() + ".";
  const answerBox = document.createElement("div");
  answerBox.style.marginTop = "10px";
  answerBox.innerHTML = `
    <div style="margin-top:10px; font-size:18px;">
      🧠 Đáp án đầy đủ:
      <div style="color:#333; margin-top:6px;">${resolvedParagraph}</div>
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

// ===== Main: start + bootstrapping =====
// ✅ FULL: Hàm khởi chạy chế độ Listening 3
async function startListeningMode3(totalSentences = 8, blankCount = 5) {
  try {
    const area = document.getElementById("exerciseArea");
    const resultBox = document.getElementById("resultBox");

    // 1. Lấy mã bài học lớn nhất (quét từ SHEET_BAI_HOC)
    const maxLessonCode = await getMaxLessonCode();
    if (!maxLessonCode) {
      area.innerHTML = "⚠️ Không xác định được phạm vi bài học từ dữ liệu Sheet.";
      return;
    }

    // 2. Lấy giá trị Topic đang chọn từ Dropdown (mặc định là 'all')
    const topicSelect = document.getElementById("topicSelect");
    const selectedTopic = topicSelect ? topicSelect.value : "all";

    // 3. Tải dữ liệu từ SHEET_URL (Link Apps Script)
    const rows = await fetchGVizRows();
    if (!rows || rows.length === 0) {
      area.innerHTML = "📭 Không có dữ liệu từ Google Sheets.";
      return;
    }

    // 4. Lọc và trích xuất dữ liệu dựa trên Topic và mã bài học
    const selected = extractPresentationData(
      rows,
      maxLessonCode,
      totalSentences,
      selectedTopic
    );

    // 5. Kiểm tra nếu không đủ câu để tạo đoạn văn
    if (selected.length < totalSentences) {
      const topicName = selectedTopic === "all" ? "" : ` thuộc chủ đề "${selectedTopic}"`;
      area.innerHTML = `
        <div class="dialogue-text">
          📭 Không đủ dữ liệu câu${topicName} để tạo đoạn văn. 
          <br>Hiện có: <b>${selected.length}/${totalSentences}</b> câu thỏa mãn.
          <br><i>Gợi ý: Hãy thử giảm số lượng câu hoặc chọn "Tất cả chủ đề".</i>
        </div>`;
      return;
    }

    // 6. Chuẩn bị dữ liệu sentences cho State toàn cục
    // Chỉ lấy đúng số lượng câu người dùng yêu cầu (đã sort theo unitNum trong extract)
    const selectedSentences = selected.slice(0, totalSentences);

    L3_sentences = selectedSentences.map((it) => ({
      text: it.presentation,
      target: it.mainTarget,
      lessonName: it.lessonName,
      unitNum: it.unitNum,
    }));

    L3_targets = L3_sentences.map((s) => s.target);
    L3_blankCount = blankCount;

    // 7. Xây dựng đoạn văn và vị trí đục lỗ (Random indices)
    buildParagraphAndBlanks();

    // 8. Cập nhật trạng thái và hiển thị giao diện
    L3_ready = true;
    L3_score = 0;
    if (resultBox) resultBox.textContent = ""; // Xóa thông báo cũ
    updateScoreBoardL3();
    renderListening3();

    console.log(`✅ Đã nạp xong ${L3_sentences.length} câu. Topic: ${selectedTopic}`);

  } catch (err) {
    console.error("❌ Listening 3 error:", err);
    document.getElementById("exerciseArea").innerHTML = "❌ Lỗi hệ thống khi tải dữ liệu Listening 3.";
  }
}

// ===== Bootstrapping =====
// ===== Xử lý dropdown =====
// ✅ FULL: Cấu hình lúc khởi động trang
getVoices().then(async (voices) => {
  // 1. Thiết lập giọng đọc
  L3_voiceMale = voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("david")) || 
                 voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("male")) || 
                 voices[0];

  // 2. Tải dữ liệu ban đầu ĐỂ LẤY TOPIC (nhưng chưa tạo bài)
  const rows = await fetchGVizRows(); 
  // Hàm fetchGVizRows của bạn phải có dòng updateTopicDropdown(rows) bên trong nhé

  // 3. Hiển thị thông báo chờ
  document.getElementById("exerciseArea").innerHTML = `
    <div style="text-align:center; padding:40px; color:#888; border:2px dashed #ddd; border-radius:10px;">
      <h3>🎧 Sẵn sàng bài nghe Mode 3</h3>
      <p>Vui lòng chọn Topic và số câu bên trên, sau đó nhấn <b>"Áp dụng & Tạo bài"</b></p>
    </div>
  `;

  // 4. Kích hoạt bộ lắng nghe cho nút Apply
  setupDropdownListeners();
});

// ✅ FULL: Sửa nút Apply để đảm bảo tạo bài mới mỗi lần nhấn
function setupDropdownListeners() {
  const applyBtn = document.getElementById("applySettingsBtn");
  const rateSelect = document.getElementById("speechRateSelect");

  if (applyBtn) {
    applyBtn.onclick = () => {
      // 1. Lấy tốc độ từ Dropdown và gán vào biến global
      if (rateSelect) {
        L3_speechRate = parseFloat(rateSelect.value);
      }

      // 2. Lấy số lượng câu và từ cần điền
      const total = parseInt(document.getElementById("totalSentences").value, 10);
      const blank = parseInt(document.getElementById("blankCount").value, 10);

      // 3. Kiểm tra logic và tạo bài
      if (blank > total) {
        alert("⚠️ Số từ cần điền không thể lớn hơn tổng số câu!");
        return;
      }

      startListeningMode3(total, blank);
    };
  }
}
