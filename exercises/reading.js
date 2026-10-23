// ===== Config =====
const readingSheetUrl2 = "https://docs.google.com/spreadsheets/d/17JUJya5fIL3BfH4-Ysfm1MKbfFFtOmgYQ9C6aiCo5S0/gviz/tq?tqx=out:json";

// ===== State =====
let readingCorrect = 0; // số câu đúng riêng cho Reading

// ===== Helpers =====
async function fetchReadingData() {
  const res = await fetch(readingSheetUrl2);
  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));
  return json.table.rows;
}

function normalize(text) {
  return text?.trim().toLowerCase().replace(/[:.,]/g, "");
}

function shuffleArray(array) {
  return array
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

function updateStats() {
  document.getElementById("score").innerHTML = `
    <strong>Điểm:</strong> ${readingCorrect}
  `;
}

// ===== Lưu điểm Reading =====
function saveReadingScore(currentCorrect, totalQ, mode) {
  // ✅ Luôn lưu điểm riêng cho Reading
  localStorage.setItem("result_reading", JSON.stringify({
    score: currentCorrect,
    total: totalQ
  }));

  // 👉 Không cộng dồn vào result_kiemtra ở đây nữa
  // Việc cộng tổng sẽ do saveKiemtraScore() trong baikiemtra.js xử lý
}

// ===== Main loader =====
async function loadReadingExercise(mode = "practice") {
  // Reset điểm cho phần Reading
  readingCorrect = 0;
  updateStats();

  // Lấy dữ liệu Reading từ sheet
  const rows = await fetchReadingData();

  // Chọn ngẫu nhiên một bài đọc
  const lessonNumbers = [...new Set(rows.map(r => r.c[0]?.v).filter(v => v !== undefined))];
  const selectedLesson = lessonNumbers[Math.floor(Math.random() * lessonNumbers.length)];
  const lessonRows = rows.filter(r => r.c[0]?.v === selectedLesson);

  // Đoạn văn (cột 1)
  const passageRow = lessonRows.find(r => r.c[1]?.v?.trim());
  const passage = passageRow?.c[1]?.v || "";

  // Câu hỏi (cột 2–7)
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

  // ✅ Tách vùng hiển thị
  const passageContainer = document.getElementById("readingPassageContainer");
  const questionsContainer = document.getElementById("readingQuestionsContainer");

  passageContainer.innerHTML = `<div class="passage"><strong>📘 Bài đọc:</strong><br>${passage}</div>`;
  questionsContainer.innerHTML = "";

  // Render từng câu hỏi
  questions.forEach((q, index) => {
    const block = document.createElement("div");
    block.className = "question-block";
    block.innerHTML = `<strong>Câu ${index + 1}:</strong> ${q.question}`;

    const ul = document.createElement("ul");
    ul.className = "answers";

    // Shuffle đáp án
    const shuffledOptions = shuffleArray(q.options);
    shuffledOptions.forEach((opt, i) => {
      if (opt.text?.trim()) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.className = "answer-btn";
        btn.innerText = `${String.fromCharCode(65 + i)}. ${opt.text}`;

        btn.onclick = () => {
          if (btn.disabled) return;

          const userAnswer = normalize(opt.text);

          if (q.correctArr.includes(userAnswer)) {
            btn.classList.add("correct");
            readingCorrect++;   // ✅ mỗi câu đúng +1
          } else {
            btn.classList.add("wrong");
          }

          ul.querySelectorAll("button").forEach(b => b.disabled = true);
          input.disabled = true;

          updateStats();
          saveReadingScore(readingCorrect, questions.length, mode);
        };

        li.appendChild(btn);
        ul.appendChild(li);
      }
    });

    block.appendChild(ul);

    // ✅ Ô input nhập tay
    const input = document.createElement("input");
    input.placeholder = "Nhập đáp án ...";
    input.onblur = () => {
      if (input.disabled) return;

      const userAnswer = normalize(input.value);

      if (q.correctArr.includes(userAnswer)) {
        input.classList.add("correct");
        readingCorrect++;   // ✅ mỗi câu đúng +1
      } else {
        input.classList.add("wrong");
      }

      input.disabled = true;
      ul.querySelectorAll("button").forEach(b => b.disabled = true);

      updateStats();
      saveReadingScore(readingCorrect, questions.length, mode);
    };

    block.appendChild(input);
    questionsContainer.appendChild(block);
  });
}
