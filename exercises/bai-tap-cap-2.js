// ✅ Điều hướng các nút
function goToPractice() {
  window.location.href = "bai-tap-tung-dang.html";
}
function goToTest() {
  window.location.href = "bai-kiem-tra.html";
}
function goToTheory() {
  window.location.href = "ly-thuyet.html";
}

// ✅ Danh sách dạng bài
const types = [
  "pronunciation", "verb", "article", "preposition", "pronoun",
  "connector", "rewrite", "plural", "wordform", "vocabulary",
  "reading", "kiemtra"
];

// ✅ Nhãn tiếng Việt cho từng dạng bài
const typeLabels = {
  pronunciation: "Phát âm",
  verb: "Động từ",
  article: "Mạo từ",
  preposition: "Giới từ",
  pronoun: "Đại từ",
  connector: "Liên từ",
  rewrite: "Viết lại câu",
  plural: "Số nhiều",
  wordform: "Biến đổi từ",
  vocabulary: "Từ vựng",
  reading: "Đọc hiểu",
  kiemtra: "Kiểm tra"
};

// ✅ Hàm lấy điểm từ localStorage
function getScore(type) {
  const key = `score_${type}_grade8`;
  const data = JSON.parse(localStorage.getItem(key) || "{}");
  return {
    correct: data.correct || 0,
    total: data.total || 0
  };
}

// ✅ Hiển thị bảng điểm chi tiết
function renderScoreTable() {
  const tbody = document.querySelector("#scoreTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  let totalCorrect = 0;
  let totalQuestions = 0;

  types.forEach(type => {
    const { correct, total } = getScore(type);
    const percent = total ? Math.round((correct / total) * 100) : 0;
    const label = typeLabels[type] || type;

    totalCorrect += correct;
    totalQuestions += total;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Poké_Ball_icon.svg" class="pokeball">${label}</td>
      <td>${correct}</td>
      <td>${total}</td>
      <td>${percent}%</td>
    `;
    tbody.appendChild(row);
  });

  const totalPercent = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  // ✅ Lưu vào localStorage để dùng ở file khác
  localStorage.setItem("totalCorrect_grade8", totalCorrect.toString());
  localStorage.setItem("totalQuestions_grade8", totalQuestions.toString());
  localStorage.setItem("totalPercent_grade8", totalPercent.toString());

  const totalRow = document.createElement("tr");
  totalRow.innerHTML = `
    <td><strong>Tổng cộng</strong></td>
    <td><strong>${totalCorrect}</strong></td>
    <td><strong>${totalQuestions}</strong></td>
    <td><strong>${totalPercent}%</strong></td>
  `;
  tbody.appendChild(totalRow);

}


// ✅ Tạo mã kết quả tóm tắt
function generateResultCode() {
  const studentName = localStorage.getItem("trainerName") || "Không tên";
  const studentClass = localStorage.getItem("trainerClass") || "Chưa có lớp";

  const resultParts = types
    .map(type => {
      const { correct, total } = getScore(type);
      if (total > 0) {
        const label = typeLabels[type] || type;
        return `${label}: ${correct}/${total}`;
      }
      return null;
    })
    .filter(Boolean)
    .join(" - ");

  // ✅ Tính thời gian làm bài
  const startTime = parseInt(localStorage.getItem("startTime_grade8") || "0");
  let durationText = "Không xác định";

  if (startTime > 0) {
    const durationMs = Date.now() - startTime;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    durationText = `${minutes} phút ${seconds} giây`;
  }

  // ✅ Gộp thời gian vào chuỗi mã
  const resultCode = `${studentName}-${studentClass} - ${resultParts} - Thời gian: ${durationText}`;
  return resultCode;
}


// ✅ Hiển thị mã kết quả và nút sao chép
function renderResultCode() {
  const resultSection = document.getElementById("resultSection");
  if (!resultSection) return;

  const resultCode = generateResultCode();
  const now = new Date();
  const dateStr = now.toLocaleDateString("vi-VN");
  const timeStr = now.toLocaleTimeString("vi-VN");

  // ✅ Tính thời gian làm bài
  const startTime = parseInt(localStorage.getItem("startTime_grade8") || "0");
  let durationText = "Không xác định";

  if (startTime > 0) {
    const durationMs = Date.now() - startTime;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    durationText = `${minutes} phút ${seconds} giây`;
  }

  const resultCodeEl = document.createElement("p");
  resultCodeEl.innerHTML = `
    <strong>Mã kết quả:</strong> ${resultCode}
    <br><em>Thời gian tạo: ${dateStr} ${timeStr}</em>
    <br><em>Thời gian làm bài: ${durationText}</em>
  `;

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "📋 Sao chép mã kết quả";
  copyBtn.className = "copy-btn";
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(resultCode).then(() => {
      alert("✅ Đã sao chép mã kết quả!");
    });
  };

  resultSection.appendChild(resultCodeEl);
  resultSection.appendChild(copyBtn);
}


// ✅ Khởi chạy khi trang tải xong
// ✅ Gắn sự kiện khi người dùng ấn nút
document.addEventListener("DOMContentLoaded", () => {
  const showBtn = document.getElementById("showResultBtn");
  const section = document.getElementById("resultSection");

  if (showBtn && section) {
    showBtn.addEventListener("click", () => {
      console.log("Đã ấn nút Xem kết quả");

      section.style.display = "block";
      section.querySelector(".summary").innerHTML = "";
      section.querySelector("#tableBody").innerHTML = "";

      renderScoreTable();
      renderResultCode();

      showBtn.style.display = "none";
    });
  } else {
    console.warn("Không tìm thấy nút hoặc vùng kết quả");
  }
});





