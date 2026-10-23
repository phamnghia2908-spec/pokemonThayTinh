// ===== Config nguồn dữ liệu =====
const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTZBSB2UBklxSCr3Q-g6DyJ731csJmsh2-GyZ8ajbdTuYWFrA3KLUdS8SsbHOcENX3PnMknXP2KRpqs/pub?gid=163446275&single=true&output=csv";


const readingSheetUrl = "https://docs.google.com/spreadsheets/d/17JUJya5fIL3BfH4-Ysfm1MKbfFFtOmgYQ9C6aiCo5S0/gviz/tq?tqx=out:json";

// ===== Offset dạng bài (mỗi dạng chiếm 7 cột ngang) =====
// [question, A, B, C, D, correct, note]
const typeOffsets = {
  pronunciation: 0,
  verb: 7,
  article: 14,
  preposition: 21,
  pronoun: 28,
  connector: 35,
  rewrite: 42,
  plural: 49,
  wordform: 56,
  vocabulary: 63
};

// ===== Số lượng câu cho mỗi dạng + số bài đọc =====
const config = {
  pronunciation: 2,
  verb: 4,
  article: 1,
  preposition: 2,
  pronoun: 1,
  connector: 1,
  rewrite: 4,
  plural: 1,
  wordform: 1,
  vocabulary: 3,
  reading: 1
};

let totalScore = 0;
let totalQuestions = 0;
let correctCount = 0;
let wrongCount = 0;
let totalGrammarQuestions = 0;

// ===== Helpers chung =====
function normalize(text) {
  // Đồng bộ với baitaptungdang: cho phép chữ, số, khoảng trắng, dấu nháy đơn
  return text?.trim().toLowerCase().replace(/[^a-z0-9'\s]/g, "");
}

function shuffleArray(array) {
  return array
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

function updateStats() {
  document.getElementById("score").innerHTML = `
    <strong>Điểm:</strong> ${totalScore} |
    <strong>Đã làm:</strong> ${totalQuestions} |
    <strong>Đúng:</strong> ${correctCount} |
    <strong>Sai:</strong> ${wrongCount}
  `;
}

async function fetchSheetData() {
  const res = await fetch(sheetUrl);
  const text = await res.text();

  const lines = text.split("\n").filter(line => line.trim());
  const rows = lines.map(line => line.split(",").map(cell => cell.trim()));

  return rows;
}


async function fetchReadingData() {
  const res = await fetch(readingSheetUrl);
  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));
  return json.table.rows;
}

// Chia sheet thành các "khoảng" 30 dòng (bắt đầu từ dòng 2 = index 1)
function buildRangesIndices(totalRows, startIndex = 1, blockSize = 30) {
  const effectiveRows = totalRows - startIndex;
  const numRanges = Math.ceil(effectiveRows / blockSize);
  const ranges = [];
  for (let r = 0; r < numRanges; r++) {
    const start = startIndex + r * blockSize;
    const end = Math.min(start + blockSize - 1, totalRows - 1);
    ranges.push([start, end]);
  }
  return ranges;
}

// Phân bổ số câu cần lấy theo số khoảng
function allocateCounts(totalNeeded, numRanges) {
  if (numRanges <= 0) return [];
  if (numRanges === 1) return [totalNeeded];
  if (numRanges === 2) return [Math.floor(totalNeeded / 2), Math.ceil(totalNeeded / 2)];
  if (numRanges === 3) {
    const first = Math.round(totalNeeded * 0.3);
    const second = Math.round(totalNeeded * 0.4);
    return [first, second, totalNeeded - first - second];
  }
  if (numRanges === 4) {
    const q = Math.floor(totalNeeded / 4);
    return [q, q, q, totalNeeded - 3 * q];
  }
  // >4 khoảng → chia đều + dồn phần dư
  const base = Math.floor(totalNeeded / numRanges);
  const counts = Array(numRanges).fill(base);
  let remainder = totalNeeded - base * numRanges;
  for (let i = 0; i < counts.length && remainder > 0; i++) {
    counts[i]++;
    remainder--;
  }
  return counts;
}

// Parser CSV chuẩn, không bị tách sai khi có dấu phẩy trong ô
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(cell.trim());
        cell = "";
      } else if (char === "\n") {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = "";
      } else if (char === "\r") {
        // bỏ qua CR
      } else {
        cell += char;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

async function fetchSheetData() {
  const res = await fetch(sheetUrl);
  const text = await res.text();
  return parseCSV(text).filter(r => r.length > 0);
}

// Hàm đọc 1 câu hỏi theo offset
function readQuestionRow(row, offset) {
  if (!row || row.length < offset + 6) return null;

  const question = row[offset] || "";
  const ansA = row[offset + 1] || "";
  const ansB = row[offset + 2] || "";
  const ansC = row[offset + 3] || "";
  const ansD = row[offset + 4] || "";

  // Cho phép nhiều đáp án đúng, ngăn cách bởi dấu phẩy
  const correctRaw = row[offset + 5] || "";
  const correctArr = correctRaw
    .split(",")
    .map(x => normalize(x))
    .filter(Boolean);

  const note = row[offset + 6] || "";

  if (!question.trim()) return null;

  return {
    question,
    answers: [
      { letter: "A", text: ansA },
      { letter: "B", text: ansB },
      { letter: "C", text: ansC },
      { letter: "D", text: ansD }
    ],
    correctArr,
    note
  };
}



// ===== Main: startTest (phần 1: reset, dạng thường) =====
// ===== Main: startTest =====
// ===== Main: startTest (phiên bản mới) =====
// ===== Main: startTest (phiên bản mới) =====
async function startTest(mode = "kiemtra") {
  localStorage.setItem("startTime_grade8", Date.now());

  // Reset counters dùng cho Grammar hiển thị
  totalScore = 0;
  totalQuestions = 0;
  correctCount = 0;
  wrongCount = 0;

  const container = document.getElementById("quizContainer");
  container.innerHTML = "";
  const readingPassageContainer = document.getElementById("readingPassageContainer");
  const readingQuestionsContainer = document.getElementById("readingQuestionsContainer");
  if (readingPassageContainer) readingPassageContainer.innerHTML = "";
  if (readingQuestionsContainer) readingQuestionsContainer.innerHTML = "";

  // ===== 1) Grammar/Vocab: render + tính tổng max =====
  const rows = await fetchSheetData();
  const totalRows = rows.length;

  let grammarTotal = 0; // tổng số câu Grammar/Vocab cố định của đề này

  for (const type in config) {
    if (type === "reading") continue;
    const offset = typeOffsets[type];
    if (offset === undefined) continue;

    const questionLimit = config[type];
    const rangeBlocks = buildRangesIndices(totalRows, 1, 30);
    const perRangeCounts = allocateCounts(questionLimit, rangeBlocks.length);

    const selected = [];
    for (let r = 0; r < rangeBlocks.length; r++) {
      const [startIdx, endIdx] = rangeBlocks[r];
      const pool = [];
      for (let i = startIdx; i <= endIdx; i++) {
        const q = readQuestionRow(rows[i], offset);
        if (q) pool.push(q);
      }
      if (pool.length > 0 && perRangeCounts[r] > 0) {
        selected.push(...shuffleArray(pool).slice(0, perRangeCounts[r]));
      }
    }

    if (selected.length < questionLimit) {
      const globalPool = [];
      for (let i = 1; i < totalRows; i++) {
        const q = readQuestionRow(rows[i], offset);
        if (q) globalPool.push(q);
      }
      const needed = questionLimit - selected.length;
      selected.push(...shuffleArray(globalPool).slice(0, needed));
    }

    const questions = shuffleArray(selected).slice(0, questionLimit);
    grammarTotal += questionLimit;
    localStorage.setItem("result_grammar", JSON.stringify({
      score: 0,
      total: grammarTotal
    }));



    // Render từng câu Grammar
    questions.forEach((q) => {
      const block = document.createElement("div");
      block.className = "question-block";
      block.innerHTML = `<strong>Câu hỏi (${type}):</strong> ${q.question}`;

      const ul = document.createElement("ul");
      ul.className = "answers";

      shuffleArray(q.answers).forEach((opt, i) => {
        if (opt.text?.trim()) {
          const li = document.createElement("li");
          const btn = document.createElement("button");
          btn.className = "answer-btn";
          btn.innerText = `${String.fromCharCode(65 + i)}. ${opt.text}`;

          btn.onclick = () => {
            totalQuestions++;
            const userAnswer = normalize(opt.text);
            if (q.correctArr.includes(userAnswer)) {
              btn.classList.add("correct");
              totalScore++;
              correctCount++;
            } else {
              btn.classList.add("wrong");
              wrongCount++;
            }
            ul.querySelectorAll("button").forEach(b => b.disabled = true);
            input.disabled = true;
            updateStats();

            // Lưu điểm Grammar riêng + cập nhật tổng kiểm tra
            saveGrammarScore(correctCount, grammarTotal);
            saveKiemtraScore(); // chỉ cập nhật score tổng, total giữ nguyên
          };

          li.appendChild(btn);
          ul.appendChild(li);
        }
      });

      block.appendChild(ul);

      const input = document.createElement("input");
      input.placeholder = "Nhập đáp án ...";
      input.onblur = () => {
        if (input.disabled) return;
        const userAnswer = normalize(input.value);
        totalQuestions++;
        if (q.correctArr.includes(userAnswer)) {
          input.classList.add("correct");
          totalScore++;
          correctCount++;
        } else {
          input.classList.add("wrong");
          wrongCount++;
        }
        input.disabled = true;
        ul.querySelectorAll("button").forEach(b => b.disabled = true);
        updateStats();

        saveGrammarScore(correctCount, grammarTotal);
        saveKiemtraScore();
      };

      block.appendChild(input);
      container.appendChild(block);
    });
  }

  // ===== 2) Reading: load + render (5 câu) =====
  let readingTotal = 0;
  try {
    const readingRows = await fetchReadingData();
    const lessonNumbers = [...new Set(readingRows.map(r => r.c[0]?.v).filter(v => v !== undefined))];
    const selectedLesson = lessonNumbers[Math.floor(Math.random() * lessonNumbers.length)];
    const lessonRows = readingRows.filter(r => r.c[0]?.v === selectedLesson);

    const passageRow = lessonRows.find(r => r.c[1]?.v?.trim());
    const passage = passageRow?.c[1]?.v || "";

    const passageBlock = document.createElement("div");
    passageBlock.className = "passage";
    passageBlock.innerHTML = `<strong>📘 Bài đọc:</strong><br>${passage}`;
    readingPassageContainer.appendChild(passageBlock);

    const questions = lessonRows
      .filter(r => r.c[2]?.v?.trim())
      .map(r => ({
        question: r.c[2]?.v || "",
        options: [
          { letter: "A", text: r.c[3]?.v || "" },
          { letter: "B", text: r.c[4]?.v || "" },
          { letter: "C", text: r.c[5]?.v || "" },
          { letter: "D", text: r.c[6]?.v || "" },
        ],
        correctArr: (r.c[7]?.v || "")
          .split(",")
          .map(x => normalize(x))
          .filter(Boolean)
      }));

    const picked = shuffleArray(questions).slice(0, 5);
    readingTotal = picked.length;
    localStorage.setItem("result_reading", JSON.stringify({
      score: 0,
      total: readingTotal
    }));


    let readingCorrect = 0;

    picked.forEach((q, index) => {
      const block = document.createElement("div");
      block.className = "question-block";
      block.innerHTML = `<strong>Câu đọc hiểu ${index + 1}:</strong> ${q.question}`;

      const ul = document.createElement("ul");
      ul.className = "answers";

      shuffleArray(q.options).forEach((opt, i) => {
        if (opt.text?.trim()) {
          const li = document.createElement("li");
          const btn = document.createElement("button");
          btn.className = "answer-btn";
          btn.innerText = `${String.fromCharCode(65 + i)}. ${opt.text}`;

          btn.onclick = () => {
            const userAnswer = normalize(opt.text);
            if (q.correctArr.includes(userAnswer)) {
              btn.classList.add("correct");
              readingCorrect++;
            } else {
              btn.classList.add("wrong");
            }
            ul.querySelectorAll("button").forEach(b => b.disabled = true);
            input.disabled = true;

            saveReadingScore(readingCorrect, readingTotal, "kiemtra");
            saveKiemtraScore();
          };

          li.appendChild(btn);
          ul.appendChild(li);
        }
      });

      block.appendChild(ul);

      const input = document.createElement("input");
      input.placeholder = "Nhập đáp án ...";
      input.onblur = () => {
        if (input.disabled) return;
        const userAnswer = normalize(input.value);
        if (q.correctArr.includes(userAnswer)) {
          input.classList.add("correct");
          readingCorrect++;
        } else {
          input.classList.add("wrong");
        }
        input.disabled = true;
        ul.querySelectorAll("button").forEach(b => b.disabled = true);

        saveReadingScore(readingCorrect, readingTotal, "kiemtra");
        saveKiemtraScore();
      };

      block.appendChild(input);
      readingQuestionsContainer.appendChild(block);
    });
  } catch (e) {
    console.error("Lỗi tải dữ liệu Reading:", e);
  }

  // ===== 3) Listening: khởi tạo tổng max cố định + gọi từng part =====
  try {
    const lc = document.getElementById("listeningContainer");
    if (lc) lc.style.display = "block";

    // Khởi tạo tổng max cố định (Part1=5, Part2=5)
    localStorage.setItem("result_listeningcap2", JSON.stringify({
      score1: 0, score2: 0,
      total1: 5, total2: 5,
      score: 0, total: 10
    }));

    if (typeof startListeningMode1_L2 === "function") startListeningMode1_L2(mode);
    if (typeof startListeningMode2_L2 === "function") startListeningMode2_L2(mode);
  } catch (e) {
    console.error("Lỗi tải Listening:", e);
  }

  // ===== 4) Writing: khởi tạo và để file writing tự chấm onblur =====
  try {
    const wc = document.getElementById("writingContainer");
    if (wc) wc.style.display = "block";
    if (typeof startWritingCap2 === "function") {
      startWritingCap2(mode); // writing sẽ tự set total + cập nhật điểm dần và gọi saveKiemtraScore()
    }
  } catch (e) {
    console.error("Lỗi tải Writing:", e);
  }

  // ===== 5) Khởi tạo tổng max cho toàn bài kiểm tra ngay từ đầu =====
  // GrammarTotal đã tính ở trên, ReadingTotal đã xác định (5), ListeningTotal = 10, WritingTotal lấy từ writing khi khởi tạo
  // Để chắc chắn có totals ngay, set một bản ghi "khung" và để writing ghi đè phần viết sau:
  const kiemtraTotals = {
    grammarTotal: grammarTotal,
    readingTotal: readingTotal || 5,
    listeningTotal: 10,
    // writingTotal sẽ được file writing cập nhật khi render (ghi đè lại kiemtra_totals)
    writingTotal: 0
  };
  localStorage.setItem("kiemtra_totals", JSON.stringify(kiemtraTotals));

  // Khởi tạo result_kiemtra: score=0, total = tổng max (tạm thời, writingTotal sẽ cộng thêm khi writing set lại)
  const initialTotal = kiemtraTotals.grammarTotal + kiemtraTotals.readingTotal + kiemtraTotals.listeningTotal + kiemtraTotals.writingTotal;
  localStorage.setItem("result_kiemtra", JSON.stringify({
    score: 0,
    total: initialTotal
  }));
}





function saveKiemtraScore() {
  const totals = JSON.parse(localStorage.getItem("kiemtra_totals") || "{}");

  const grammar   = JSON.parse(localStorage.getItem("result_grammar") || "{}");
  const reading   = JSON.parse(localStorage.getItem("result_reading") || "{}");
  const listening = JSON.parse(localStorage.getItem("result_listeningcap2") || "{}");
  const writing   = JSON.parse(localStorage.getItem("result_writingcap2") || "{}");

  const scoreTotal =
    (grammar.score || 0) +
    (reading.score || 0) +
    (listening.score || 0) +
    (writing.score || 0);

  const maxTotal =
    (totals.grammarTotal || 0) +
    (totals.readingTotal || 0) +
    (totals.listeningTotal || 0) +
    (totals.writingTotal || 0);

  localStorage.setItem("result_kiemtra", JSON.stringify({
    score: scoreTotal,
    total: maxTotal
  }));
}



function saveGrammarScore(score, total) {
  localStorage.setItem("result_grammar", JSON.stringify({
    score,
    total
  }));
}






// Hàm tính thời gian định dạng mm:ss
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min} phút ${sec} giây`;
}

function finishTest() {
  const start = parseInt(localStorage.getItem("startTime_grade8") || "0", 10);
  const elapsed = start ? Date.now() - start : 0;

  // Lấy điểm từng phần riêng biệt
  const grammar   = JSON.parse(localStorage.getItem("result_grammar") || "{}");
  const reading   = JSON.parse(localStorage.getItem("result_reading") || "{}");
  const listening = JSON.parse(localStorage.getItem("result_listeningcap2") || "{}");
  const writing   = JSON.parse(localStorage.getItem("result_writingcap2") || "{}");

  // Tính tổng số câu đúng và tổng số câu tối đa
  const totalCorrect = (grammar.score   || 0)
                     + (reading.score   || 0)
                     + (listening.score || 0)
                     + (writing.score   || 0);

  const totalMax = (grammar.total   || 0)
                 + (reading.total   || 0)
                 + (listening.total || 0)
                 + (writing.total   || 0);

  // Quy đổi ra thang điểm 10
  const score10 = totalMax > 0 ? ((totalCorrect / totalMax) * 10).toFixed(2) : "0.00";

  // Đánh giá xếp loại
  let danhGia = "";
  if (score10 >= 8.5) danhGia = "🎉 Giỏi";
  else if (score10 >= 7) danhGia = "👍 Khá";
  else if (score10 >= 5) danhGia = "🙂 Trung bình";
  else danhGia = "⚠️ Yếu";

  // Gợi ý phần cần học lại (chỉ khi có câu hỏi và tỉ lệ đúng < 60%)
  const weaknesses = [];
  if ((grammar.total || 0) > 0 && (grammar.score || 0) / grammar.total < 0.6) weaknesses.push("Grammar/Vocab");
  if ((reading.total || 0) > 0 && (reading.score || 0) / reading.total < 0.6) weaknesses.push("Reading");
  if ((listening.total || 0) > 0 && (listening.score || 0) / listening.total < 0.6) weaknesses.push("Listening");
  if ((writing.total || 0) > 0 && (writing.score || 0) / writing.total < 0.6) weaknesses.push("Writing");

  let advice = weaknesses.length > 0
    ? "👉 Bạn nên tập trung học lại phần: " + weaknesses.join(", ") + "."
    : "✅ Bạn làm tốt tất cả các phần, hãy tiếp tục phát huy!";

  // Hiển thị kết quả
  const resultDiv = document.getElementById("finalResult");
  resultDiv.innerHTML = `
    <h3>📊 Kết quả cuối cùng</h3>
    <p>Grammar/Vocab: ${grammar.score || 0}/${grammar.total || 0}</p>
    <p>Reading: ${reading.score || 0}/${reading.total || 0}</p>
    <p>Listening: ${listening.score || 0}/${listening.total || 0}</p>
    <p>Writing: ${writing.score || 0}/${writing.total || 0}</p>
    <hr>
    <p><strong>Tổng số câu đúng:</strong> ${totalCorrect}/${totalMax}</p>
    <p><strong>Điểm quy đổi (thang 10):</strong> ${score10} (${danhGia})</p>
    <p><strong>Lời khuyên:</strong> ${advice}</p>
    <p><strong>Thời gian làm bài:</strong> ${formatTime(elapsed)}</p>
  `;
}

// Gắn sự kiện cho nút
document.getElementById("finishBtn").addEventListener("click", finishTest);
