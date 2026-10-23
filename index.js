import { fetchStudentList } from './studentList.js';

console.log("✅ index.js đã chạy");

// Hàm chuẩn hóa để lưu
function cleanInput(str) {
  return str
    .toLowerCase()               // chuyển về chữ thường
    .replace(/[.,;/:]/g, "")     // xóa dấu câu
    .trim();                     // xóa khoảng trắng đầu/cuối
}

async function startApp() {
  const name = document.getElementById("studentName").value.trim();
  const className = document.getElementById("studentClass").value.trim();
  const password = document.getElementById("studentPassword").value.trim();
  const errorBox = document.getElementById("errorMessage");

  if (!name || !className) {
    errorBox.textContent = "⚠️ Vui lòng nhập đầy đủ tên và lớp.";
    return;
  }

  const studentList = await fetchStudentList();

  // Hàm normalize để so khớp
  const normalize = str => str.toLowerCase().trim();

  // Tìm trong danh sách
  const matchedStudent = studentList.find(s =>
    normalize(s.name) === normalize(name) &&
    normalize(s.class) === normalize(className)
  );

  // Chuẩn hóa để lưu
  const cleanedName = cleanInput(name);
  const cleanedClass = cleanInput(className);

  // Lưu vào localStorage
  localStorage.setItem("trainerName", cleanedName);
  localStorage.setItem("trainerClass", cleanedClass);
  localStorage.setItem("startTime_global", Date.now());

  if (matchedStudent) {
    const sheetPassword = (matchedStudent.password || "").trim();

    // Nếu sheet có mật khẩu thì phải nhập đúng
    if (sheetPassword) {
      if (!password) {
        errorBox.textContent = "⚠️ Vui lòng nhập mật khẩu.";
        return;
      }
      if (normalize(password) !== normalize(sheetPassword)) {
        errorBox.textContent = "❌ Mật khẩu không đúng.";
        return;
      }
    }

    // Nếu không có mật khẩu hoặc mật khẩu đúng
    localStorage.setItem("isVerifiedStudent", "true");
    localStorage.setItem("studentPassword", sheetPassword);

    // Lưu cả bản chuẩn hóa để dùng khi ghi Firebase
    localStorage.setItem("normalizedTrainerName", cleanedName);
    localStorage.setItem("normalizedTrainerClass", cleanedClass);

    console.log(`✅ Đăng nhập thành công: ${cleanedName} - lớp ${cleanedClass}`);
    window.location.href = "choice.html";
  } else {
    localStorage.setItem("isVerifiedStudent", "false");
    alert("⚠️ Bạn chưa được cấp nick. Bạn vẫn có thể tiếp tục học.");
    console.log(`⚠️ Nick chưa xác thực: ${cleanedName} - lớp ${cleanedClass}`);
  }
}

// Gắn sự kiện cho nút
window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("startBtn");
  if (btn) {
    btn.addEventListener("click", startApp);
  }
});
