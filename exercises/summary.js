// ✅ RESET DỮ LIỆU SAU 3 TIẾNG KHÔNG HOẠT ĐỘNG (tính theo LẦN CHƠI GẦN NHẤT,
// không phải lần chơi đầu tiên trong đời — startTime_global chỉ ghi 1 lần
// duy nhất nên không dùng để phát hiện "bỏ lâu không chơi" được)
const lastActivity = localStorage.getItem("pkm_last_activity") || localStorage.getItem("startTime_global");
const now = Date.now();

if (lastActivity && now - parseInt(lastActivity) > 3 * 60 * 60 * 1000) {
  const keysToReset = Object.keys(localStorage).filter(k =>
    k.startsWith("result_") || k.startsWith("startTime_") || k === "pkm_skill_scores" || k === "pkm_last_activity"
  );
  keysToReset.forEach(k => localStorage.removeItem(k));
  localStorage.removeItem("startTime_global");
}

const startTimeGlobal = localStorage.getItem("startTime_global");

// ✅ THÔNG TIN HỌC SINH
const studentName = localStorage.getItem("trainerName") || "Không tên";
const studentClass = localStorage.getItem("trainerClass") || "Chưa có lớp";

// Đã được cleanInput từ đầu vào nên ở đây chỉ cần lấy ra
const normalizedName = studentName;
const normalizedClass = studentClass;

const selectedLesson = localStorage.getItem("selectedLesson") || "Chưa chọn bài học";

document.getElementById("studentInfo").textContent = `${studentName} (${studentClass})`;

/**
 * ================== 6 NHÓM ĐIỂM CHUẨN + BÀI TẬP CẤP 2 (TÍNH RIÊNG) ==================
 * Mỗi nhóm = tổng các key cũ (result_<key>, KHÔNG đổi tên, không đụng các
 * trang bài tập cũ) CỘNG THÊM phần đóng góp từ Battle/Block/game sau này
 * (đọc trong pkm_skill_scores — do pkm_score.js ghi). Việc gộp chỉ diễn ra
 * LÚC HIỂN THỊ ở đây, dữ liệu gốc vẫn tách bạch, an toàn cho các trang cũ.
 *
 * "Trò chơi" không có skillKey vì lấy thẳng result_game (mini-game cũ, nếu
 * có) + result_battle (đã là tổng Battle + Block + mọi game sau này, do
 * pkm_score.js cộng dồn sẵn).
 *
 * "Giới thiệu" không có skillKey vì hệ quiz 4 kỹ năng trong Battle/Block
 * không có dạng "giới thiệu từ mới" — điểm này chỉ đến từ trang Từ vựng/
 * Hình ảnh cũ.
 */
const GROUPS = [
  { label: "🎯 Giới thiệu", legacyKeys: ["vocabulary", "image"], skillKey: "intro" },
  { label: "🎧 Nghe",       legacyKeys: ["listening"],                            skillKey: "listening" },
  { label: "🗣️ Nói",        legacyKeys: ["speaking", "phonics", "communication"], skillKey: "speaking" },
  { label: "📖 Đọc",        legacyKeys: [],                                       skillKey: "reading" },
  { label: "✍️ Viết",       legacyKeys: ["overview"],                            skillKey: "writing" },
  { label: "🎮 Trò chơi",   legacyKeys: ["game", "battle"] },
];
const GRADE8_GROUP = { label: "📐 Bài tập cấp 2 (tính riêng)", legacyKeys: ["grade8"] };

function getLegacyResult(key) {
  const r = JSON.parse(localStorage.getItem(`result_${key}`)) || {};
  const score = r.score || 0;
  const total = r.total || 0;
  if (total === 0 && !localStorage.getItem(`startTime_${key}`)) {
    localStorage.setItem(`startTime_${key}`, Date.now());
  }
  return { score, total };
}

function getSkillResult(skillKey) {
  const skills = JSON.parse(localStorage.getItem("pkm_skill_scores")) || {};
  const s = skills[skillKey] || {};
  return { score: s.correct || 0, total: s.total || 0 };
}

function computeGroup(group) {
  let score = 0, total = 0;
  group.legacyKeys.forEach(key => {
    const r = getLegacyResult(key);
    score += r.score;
    total += r.total;
  });
  if (group.skillKey) {
    const r = getSkillResult(group.skillKey);
    score += r.score;
    total += r.total;
  }
  return { score, total };
}

function ratingFromPercent(percent) {
  if (percent < 50) return "😕 Cần cố gắng";
  if (percent < 70) return "🙂 Khá";
  if (percent < 90) return "😃 Tốt";
  return "🏆 Tuyệt vời";
}

// ================== RENDER BẢNG ==================
const tableBody = document.getElementById("tableBody");

let totalScore = 0;
let totalMax = 0;
const completedLabelsCore = [];   // dùng để tính % chăm chỉ/kỹ năng (6 nhóm chuẩn, KHÔNG có cấp 2)
const zeroLabelsCore = [];
const completedLabelsAll = [];    // gửi Firebase (có cả cấp 2, để lưu đủ lịch sử)
const learnedGroups = new Set();  // dùng tính % kỹ năng (6 nhóm chuẩn)
let rowIndex = 0;

function renderGroupRow(group, isCore) {
  const { score, total } = computeGroup(group);
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  const rating = ratingFromPercent(percent);

  if (isCore) {
    totalScore += score;
    totalMax += total;
  }

  if (total > 0) {
    completedLabelsAll.push(group.label);
    if (isCore) {
      completedLabelsCore.push(group.label);
      learnedGroups.add(group.label);
    }
  } else if (isCore) {
    zeroLabelsCore.push(group.label);
  }

  rowIndex++;
  const row = `
    <tr${isCore ? "" : ' style="background:#fff7e0;"'}>
      <td>${rowIndex}</td>
      <td>${group.label}</td>
      <td>${score}</td>
      <td>${total}</td>
      <td>${percent}%</td>
      <td class="rating">${rating}</td>
    </tr>
  `;
  tableBody.innerHTML += row;
}

GROUPS.forEach(g => renderGroupRow(g, true));
renderGroupRow(GRADE8_GROUP, false);

// 👉 Tổng kết cuối (KHÔNG tính Bài tập cấp 2)
const finalPercent = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

// ✅ Gọi hàm đánh giá (mẫu số dựa trên 6 nhóm chuẩn, không có cấp 2)
const evaluation = getFullEvaluation({
  totalScore,
  totalMax,
  completedParts: completedLabelsCore,
  learnedGroups,
  totalGroupsCount: GROUPS.length,
});

document.getElementById("totalRating").textContent =
`📦 Chăm chỉ: ${evaluation.diligence} | 🎯 Hiệu quả: ${evaluation.effectiveness} | 🧠 Kỹ năng: ${evaluation.skill} | 🧾 Đánh giá chung: ${evaluation.overall}`;

const finalRating = evaluation.overall;

document.getElementById("totalScore").textContent = totalScore;
document.getElementById("totalMax").textContent = totalMax;
document.getElementById("totalPercent").textContent = `${finalPercent}%`;

// 🧠 Mã ngày
const dateStr = new Date();
const day = String(dateStr.getDate()).padStart(2, '0');
const month = String(dateStr.getMonth() + 1).padStart(2, '0');
const year = String(dateStr.getFullYear()).slice(-2);
const dateCode = `${day}${month}${year}`;

const completedCount = completedLabelsCore.length;

// ✅ Tính tổng thời gian làm bài
let totalMinutes = 0;
if (startTimeGlobal) {
  const durationMs = Date.now() - parseInt(startTimeGlobal);
  totalMinutes = Math.max(1, Math.floor(durationMs / 60000));
}

const zeroText = zeroLabelsCore.length > 0 ? ` (Các phần 0 điểm: ${zeroLabelsCore.join(", ")})` : "";
const timeText = totalMinutes > 0 ? ` [ ${totalMinutes} phút]` : "";

const code = `${studentName}-${studentClass}-${selectedLesson}-${dateCode}-${totalScore}/${totalMax}-${completedCount}/${GROUPS.length}-${finalRating}${zeroText}${timeText}`;
document.getElementById("resultCode").textContent = code;

// ✅ Lưu local history
const historyKey = `history_${studentName}_${studentClass}`;
const history = JSON.parse(localStorage.getItem(historyKey)) || [];

const newEntry = {
  name: normalizedName,
  class: normalizedClass,
  score: totalScore,
  max: totalMax,
  doneParts: completedCount,
  rating: finalRating,
  date: dateCode,
  duration: totalMinutes,
  parts: completedLabelsAll
};

const existingIndex = history.findIndex(entry => entry.date === dateCode);
if (existingIndex >= 0) {
  history[existingIndex] = newEntry;
} else {
  history.push(newEntry);
}
localStorage.setItem(historyKey, JSON.stringify(history));

// ✅ Auto-save một lần sau khi đã có completedParts
saveTodayResult();

// ================== HÀM ĐÁNH GIÁ ==================
function getFullEvaluation({ totalScore, totalMax, completedParts, learnedGroups, totalGroupsCount }) {
  const percentCorrect = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const coveragePercent = Math.round((completedParts.length / totalGroupsCount) * 100);
  const skillPercent = Math.round((learnedGroups.size / totalGroupsCount) * 100);

  let effectiveness = "";
  if (percentCorrect < 50) effectiveness = "😕 Cần cố gắng";
  else if (percentCorrect < 70) effectiveness = "🙂 Khá";
  else if (percentCorrect < 90) effectiveness = "😃 Tốt";
  else effectiveness = "🏆 Tuyệt vời";

  let diligence = "";
  if (coveragePercent < 30) diligence = "⚠️ Học quá ít";
  else if (coveragePercent < 60) diligence = "🙂 Học chưa đủ";
  else if (coveragePercent < 90) diligence = "😃 Học khá đầy đủ";
  else diligence = "🏆 Học toàn diện";

  let skill = "";
  if (skillPercent < 40) skill = "⚠️ Thiếu kỹ năng";
  else if (skillPercent < 70) skill = "🙂 Chưa đủ nhóm";
  else if (skillPercent < 90) skill = "😃 Đa kỹ năng";
  else skill = "🏆 Kỹ năng toàn diện";

  const ratings = [effectiveness, diligence, skill];
  const scoreMap = {
    "😕 Cần cố gắng": 1,
    "⚠️ Học quá ít": 1,
    "⚠️ Thiếu kỹ năng": 1,
    "🙂 Khá": 2,
    "🙂 Học chưa đủ": 2,
    "🙂 Chưa đủ nhóm": 2,
    "😃 Tốt": 3,
    "😃 Học khá đầy đủ": 3,
    "😃 Đa kỹ năng": 3,
    "🏆 Tuyệt vời": 4,
    "🏆 Học toàn diện": 4,
    "🏆 Kỹ năng toàn diện": 4
  };

  const scoreSum = ratings.reduce((sum, r) => sum + scoreMap[r], 0);

  let overall = "";
  if (scoreSum >= 10) overall = "🏆 Xuất sắc";
  else if (scoreSum >= 7) overall = "🙂 Tốt";
  else overall = "⚠️ Cần cải thiện";

  return {
    effectiveness,
    diligence,
    skill,
    overall
  };
}

// ================== TẠO ENTRY HÔM NAY (chuẩn hóa + có parts) ==================
function getTodayEntry() {
  const studentName = localStorage.getItem("trainerName") || "";
  const studentClass = localStorage.getItem("trainerClass") || "";

  const normalizedName =
    localStorage.getItem("normalizedTrainerName") ||
    studentName.toLowerCase().trim();
  const normalizedClass =
    localStorage.getItem("normalizedTrainerClass") ||
    studentClass.toLowerCase().trim();

  const dateStr = new Date();
  const day = String(dateStr.getDate()).padStart(2, "0");
  const month = String(dateStr.getMonth() + 1).padStart(2, "0");
  const year = String(dateStr.getFullYear()).slice(-2);
  const dateCode = `${day}${month}${year}`;

  const totalScore = parseInt(document.getElementById("totalScore").textContent) || 0;
  const totalMax   = parseInt(document.getElementById("totalMax").textContent) || 0;
  const finalRating = document
    .getElementById("totalRating")
    .textContent.split(" | ")
    .pop()
    .split(": ")
    .pop();

  const startTimeGlobal = localStorage.getItem("startTime_global");
  const totalMinutes = startTimeGlobal
    ? Math.max(1, Math.floor((Date.now() - parseInt(startTimeGlobal)) / 60000))
    : 0;

  // Dùng lại đúng logic gộp nhóm ở trên để tránh 2 nơi tính lệch nhau
  const allLabelsDone = [];
  GROUPS.forEach(g => {
    const { total } = computeGroup(g);
    if (total > 0) allLabelsDone.push(g.label);
  });
  {
    const { total } = computeGroup(GRADE8_GROUP);
    if (total > 0) allLabelsDone.push(GRADE8_GROUP.label);
  }

  return {
    name: normalizedName,
    class: normalizedClass,
    score: totalScore,
    max: totalMax,
    doneParts: allLabelsDone.length,
    rating: finalRating,
    date: dateCode,
    duration: totalMinutes,
    parts: allLabelsDone,
    _displayName: studentName,
    _displayClass: studentClass
  };
}

// ================== LƯU KẾT QUẢ HÔM NAY (DUY NHẤT GỌI FIREBASE) ==================
async function saveTodayResult() {
  const entryBase = getTodayEntry();
  const selectedLesson = localStorage.getItem("selectedLesson") || "Chưa chọn bài học";

  // 👇 đảm bảo giữ cả duration từ entryBase
  const entry = {
    ...entryBase,
    lesson: selectedLesson,
    duration: entryBase.duration   // thêm rõ ràng để chắc chắn ghi lên Firebase
  };

  // Lưu local history (giữ nguyên)
  const historyKey = `history_${entry._displayName}_${entry._displayClass}`;
  const history = JSON.parse(localStorage.getItem(historyKey)) || [];
  const existingIndex = history.findIndex(e => e.date === entry.date);
  if (existingIndex >= 0) {
    history[existingIndex] = entry;
  } else {
    history.push(entry);
  }
  localStorage.setItem(historyKey, JSON.stringify(history));

  // Ghi Firebase
  if (window.saveStudentResultToFirebase) {
    try {
      await window.saveStudentResultToFirebase(entry);

      const scoreText = `${entry.score}/${entry.max}`;
      const partText = `${entry.doneParts} phần`;
      const timeText = entry.duration ? `${entry.duration} phút` : "–";

      alert(`✅ Đã ghi kết quả lên hệ thống:\n• Điểm: ${scoreText}\n• Số phần: ${partText}\n• Thời gian: ${timeText}`);

    } catch (err) {
      console.error("❌ Lỗi khi ghi Firebase:", err.message);
      alert("❌ Ghi không thành công. Vui lòng kiểm tra mạng hoặc ấn gửi lại kết quả.");
    }
  } else {
    alert("⚠️ Hệ thống chưa sẵn sàng để ghi kết quả. Vui lòng thử lại hoặc báo cho giáo viên.");
  }
}



// ================== BẢNG TUẦN TỪ FIREBASE ==================
async function renderStudentWeekSummary() {
  const isVerified = localStorage.getItem("isVerifiedStudent") === "true";
  if (!isVerified) {
    alert("❌ Bạn chưa được xác thực, không thể xem kết quả tuần.");
    return;
  }

  const entryToday = getTodayEntry();

  // Khởi tạo Firebase
  const { initializeApp, getApp } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js");
  const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");

  // Giữ nguyên cấu hình Firebase của Anh (đặt đúng như trong HTML)
  const firebaseConfig = window.__FIREBASE_CONFIG__ || {
    // Nếu Anh đã khởi tạo app ở HTML, có thể dùng getApp() ở dưới
  };

  let app;
  try { app = initializeApp(firebaseConfig); } catch { app = getApp(); }
  const db = getFirestore(app);

  // ✅ Lấy summary chung
  const ref = doc(db, "tonghop", `summary-${entryToday.class}-recent`);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    alert("⚠️ Chưa có dữ liệu tổng hợp cho lớp này.");
    return;
  }

  const data = snap.data();
  const allDates = [...(data.days || [])].sort((a,b)=>b.localeCompare(a));
  const dayData = data.dayData || {};

  // Gom dữ liệu của học sinh này
  const entries = [];
  for (const dateCode of allDates) {
    const students = dayData[dateCode] || {};
    if (students[entryToday.name]) {
      entries.push({ date: dateCode, ...students[entryToday.name] });
    }
  }

  // Lấy 7 ngày gần nhất
  const recentEntries = entries.slice(0,7);

  // Render bảng
  const tbody = document.getElementById("weeklySummaryBody");
  tbody.innerHTML = "";
  recentEntries.forEach(e => {
    const dateCode = e.date;
    const date = `${dateCode.slice(0,2)}-${dateCode.slice(2,4)}-${dateCode.slice(4)}`;
    const row = `
      <tr>
        <td>${date}</td>
        <td>${e.score}</td>
        <td>${e.max}</td>
        <td>${e.doneParts}</td>
        <td>${e.rating}</td>
        <td><button onclick="deleteStudentDayResult('${dateCode}')">🗑️ Xoá</button></td>
      </tr>
    `;
    tbody.innerHTML += row;
  });


  document.getElementById("weeklySummarySection").style.display = "block";
}
async function deleteStudentDayResult(dateCode) {
  // Hiện popup nhập mật khẩu
  const password = prompt("🔑 Nhập mật khẩu để xoá kết quả:");

  if (password !== "1111") {
    alert("❌ Mật khẩu sai. Không thể xoá kết quả.");
    return; // dừng lại, không xoá
  }

  const entryToday = getTodayEntry();

  const { initializeApp, getApp } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js");
  const { getFirestore, doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");

  const firebaseConfig = window.__FIREBASE_CONFIG__ || {};
  let app;
  try { app = initializeApp(firebaseConfig); } catch { app = getApp(); }
  const db = getFirestore(app);

  const ref = doc(db, "tonghop", `summary-${entryToday.class}-recent`);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    alert("⚠️ Không tìm thấy dữ liệu để xoá.");
    return;
  }

  const data = snap.data();
  const dayData = data.dayData || {};

  if (dayData[dateCode] && dayData[dateCode][entryToday.name]) {
    delete dayData[dateCode][entryToday.name]; // xoá học sinh khỏi ngày đó

    await updateDoc(ref, { dayData });
    alert(`✅ Đã xoá kết quả ngày ${dateCode} của ${entryToday._displayName}`);
    // Refresh lại bảng
    renderStudentWeekSummary();
  } else {
    alert("⚠️ Không có dữ liệu của bạn trong ngày này.");
  }
}

// 👇 để HTML gọi được
window.deleteStudentDayResult = deleteStudentDayResult;

// ================== GẮN SỰ KIỆN ==================
document.getElementById("saveResultBtn").addEventListener("click", saveTodayResult);
document.getElementById("weeklySummaryBtn").addEventListener("click", renderStudentWeekSummary);
