// ===== Config =====
const writingSheetUrl2 = "https://docs.google.com/spreadsheets/d/17JUJya5fIL3BfH4-Ysfm1MKbfFFtOmgYQ9C6aiCo5S0/gviz/tq?tqx=out:json&sheet=2";

// ===== State =====
let writingInputs = [];
let writingScore = 0;
let writingTotal = 0;

// ===== Helpers =====
async function fetchWritingData() {
  const res = await fetch(writingSheetUrl2);
  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));
  return json.table.rows;
}

// ===== Main loader =====
async function startWritingCap2(mode = "practice") {
  const container = document.getElementById("writingContainer");
  container.innerHTML = "";

  const rows = await fetchWritingData();

  // Gom theo số bài (cột A)
  const lessonNumbers = [...new Set(rows.map(r => r.c[0]?.v).filter(v => v !== undefined))];
  const selectedLesson = lessonNumbers[Math.floor(Math.random() * lessonNumbers.length)];
  const lessonRows = rows.filter(r => r.c[0]?.v === selectedLesson);

  // Đề bài (cột B)
  const title = lessonRows[0]?.c[1]?.v || "Đề bài không xác định";
  const titleEl = document.createElement("h3");
  titleEl.innerText = `📝 ${title}`;
  container.appendChild(titleEl);

  writingInputs = [];
  writingScore = 0;
  writingTotal = lessonRows.length; // tổng số mục cố định

  // ✅ Cập nhật writingTotal vào kiemtra_totals
  const totals = JSON.parse(localStorage.getItem("kiemtra_totals") || "{}");
  totals.writingTotal = writingTotal;
  localStorage.setItem("kiemtra_totals", JSON.stringify(totals));

  // ✅ Đồng bộ lại result_kiemtra.total cho đủ 4 phần
  const resultKiemtra = JSON.parse(localStorage.getItem("result_kiemtra") || "{}");
  resultKiemtra.total = (totals.grammarTotal || 0)
                      + (totals.readingTotal || 0)
                      + (totals.listeningTotal || 0)
                      + (totals.writingTotal || 0);
  localStorage.setItem("result_kiemtra", JSON.stringify(resultKiemtra));

  // ✅ Lưu điểm riêng cho Writing
  localStorage.setItem("result_writingcap2", JSON.stringify({
    score: 0,
    total: writingTotal
  }));


  // Các mục (cột C) + gợi ý
  lessonRows.forEach((r) => {
    const label = r.c[2]?.v || "";
    const hintQ = r.c[3]?.v || "";
    const hintA = r.c[4]?.v || "";

    const block = document.createElement("div");
    block.className = "question-block";

    const labelEl = document.createElement("label");
    labelEl.innerHTML = `<strong>${label}</strong>`;
    block.appendChild(labelEl);

    const input = document.createElement("textarea");
    input.rows = 3;
    input.style.width = "100%";
    input.style.marginTop = "8px";
    input.placeholder = "Viết câu trả lời tại đây...";

    // ✅ Chấm điểm từng mục ngay khi blur
    input.onblur = () => {
      if (input.disabled) return;
      const val = input.value?.trim();
      if (val) {
        writingScore++;
        input.classList.add("correct");
      } else {
        input.classList.add("wrong");
      }
      input.disabled = true;
      saveWritingScore(writingScore, writingTotal, mode);

      // Cập nhật kết quả
      const resultBox = document.getElementById("writingResultBox");
      if (resultBox) {
        resultBox.innerText = `🎯 Bạn đã hoàn thành ${writingScore}/${writingTotal} mục.`;
      }
    };

    block.appendChild(input);
    writingInputs.push(input);

    // Container hiển thị gợi ý
    const hintBox = document.createElement("div");
    hintBox.style.marginTop = "8px";
    block.appendChild(hintBox);

    if (hintQ?.trim()) {
      const hintQBtn = document.createElement("button");
      hintQBtn.innerText = "💡 Gợi ý câu hỏi";
      hintQBtn.className = "btn primary";
      hintQBtn.style.marginRight = "8px";

      const hintQEl = document.createElement("div");
      hintQEl.style.display = "none";
      hintQEl.style.marginTop = "6px";
      hintQEl.style.color = "#2d3436";
      hintQEl.innerText = hintQ;

      hintQBtn.onclick = () => {
        hintQEl.style.display = hintQEl.style.display === "none" ? "block" : "none";
      };

      hintBox.appendChild(hintQBtn);
      hintBox.appendChild(hintQEl);
    }

    if (hintA?.trim()) {
      const hintABtn = document.createElement("button");
      hintABtn.innerText = "💡 Gợi ý câu trả lời";
      hintABtn.className = "btn primary";

      const hintAEl = document.createElement("div");
      hintAEl.style.display = "none";
      hintAEl.style.marginTop = "6px";
      hintAEl.style.color = "#636e72";
      hintAEl.innerText = hintA;

      hintABtn.onclick = () => {
        hintAEl.style.display = hintAEl.style.display === "none" ? "block" : "none";
      };

      hintBox.appendChild(hintABtn);
      hintBox.appendChild(hintAEl);
    }

    container.appendChild(block);
  });

  // Box hiển thị kết quả
  const resultBox = document.createElement("div");
  resultBox.id = "writingResultBox";
  resultBox.style.marginTop = "20px";
  resultBox.style.fontWeight = "bold";
  resultBox.innerText = `🎯 Bạn đã hoàn thành 0/${writingTotal} mục.`;
  container.appendChild(resultBox);
}

// ===== Hàm lưu điểm Writing =====
function saveWritingScore(currentCorrect, totalQ, mode) {
  localStorage.setItem("result_writingcap2", JSON.stringify({
    score: currentCorrect,
    total: totalQ
  }));

  if (mode === "kiemtra") {
    // Gọi hàm tổng để cộng 4 phần
    saveKiemtraScore();
  } else if (mode === "practice") {
    localStorage.setItem("result_grade8", JSON.stringify({
      score: currentCorrect,
      total: totalQ
    }));
  }
}
