// =============== Firebase A: parents ===============
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const firebaseConfigParents = {
  apiKey: "AIzaSyCCVdzWiiFvcWiHVJN-x33YKarsjyziS8E",
  authDomain: "pokemon-capture-10d03.firebaseapp.com",
  projectId: "pokemon-capture-10d03",
  storageBucket: "pokemon-capture-10d03.firebasestorage.app",
  messagingSenderId: "1068125543917",
  appId: "1:1068125543917:web:57de4365ee56729ea8dbe4"
};
let appParents; try { appParents = initializeApp(firebaseConfigParents, "parentsApp"); } catch { appParents = getApp("parentsApp"); }
const dbParents = getFirestore(appParents);

// =============== Firebase B: tonghop (lớp học thầy Tình) ===============
import { initializeApp as initApp2, getApp as getApp2 } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getFirestore as getFirestore2 } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const firebaseConfigTonghop = {
  apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
  authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
  projectId: "lop-hoc-thay-tinh",
  storageBucket: "lop-hoc-thay-tinh.appspot.com",
  messagingSenderId: "391812475288",
  appId: "1:391812475288:web:ca4c275ac776d69deb23ed"
};
let appTonghop; try { appTonghop = initApp2(firebaseConfigTonghop, "tonghopApp"); } catch { appTonghop = getApp2("tonghopApp"); }
const dbTonghop = getFirestore2(appTonghop);


// =============== Firebase C: vocabulary (từ vựng học sinh) ===============
import { initializeApp as initApp3, getApp as getApp3 } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getFirestore as getFirestore3, doc as doc3, getDoc as getDoc3 } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const firebaseConfigVocabulary = {
  apiKey: "AIzaSyCCVdzWiiFvcWiHVJN-x33YKarsjyziS8E",
  authDomain: "pokemon-capture-10d03.firebaseapp.com",
  projectId: "pokemon-capture-10d03",
  storageBucket: "pokemon-capture-10d03.appspot.com",
  messagingSenderId: "1068125543917",
  appId: "1:1068125543917:web:57de4365ee56729ea8dbe4"
};
let appVocabulary; 
try { appVocabulary = initApp3(firebaseConfigVocabulary, "vocabularyApp"); } 
catch { appVocabulary = getApp3("vocabularyApp"); }
const dbVocabulary = getFirestore3(appVocabulary);


// =============== DOM ===============
const infoBox = document.getElementById("infoBox");
const monthsBox = document.getElementById("monthsBox");

// =============== LocalStorage ===============
const trainerName = (localStorage.getItem("trainerName") || "").toLowerCase().trim();
const trainerClass = localStorage.getItem("trainerClass") || "";
const docId = `${trainerName}-${trainerClass}`;

// =============== Google Sheet config ===============
const SHEET_ID = "1RRnMZJJd6U8_gQp80k5S_w7Li58nEts2mT5Nxg7CPIQ";

// Fetch toàn bộ sheet theo tên lớp
async function fetchSheetValues(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=0&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  const text = await res.text();
  let cleaned = text.replace(/^\)\]\}'\s*\n?/, "");
  if (cleaned.includes("google.visualization.Query.setResponse(")) {
    const start = cleaned.indexOf("(") + 1;
    const end = cleaned.lastIndexOf(")");
    cleaned = cleaned.substring(start, end);
  }
  const obj = JSON.parse(cleaned);
  return obj.table.rows.map(r => r.c.map(c => (c?.v != null ? String(c.v) : "")));
}

// Chuẩn hoá nickname
function normalizeNickname(raw) {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/^[\s,.;]+|[\s,.;]+$/g, "")
    .replace(/\s+/g, " ");
}

// =============== Metrics ===============
// Tính chỉ số + liệt kê ngày có làm / điểm kém / không làm, và đánh giá chữ
function buildStudentMetrics(entries, allDates) {
  let totalScore = 0, totalMax = 0;

  const daysDoneList = [];
  const daysWeakList = [];
  const daysMissedList = [];

  const WEAK_THRESHOLD = 50; // dưới 50 điểm coi là điểm kém

  // Duyệt qua tất cả ngày trong summary
  for (const date of allDates) {
    const entry = entries.find(e => e.date === date);
    if (entry) {
      daysDoneList.push(date);

      const score = entry.score || 0;
      const max = entry.max || 0;

      if (score < WEAK_THRESHOLD) {
        daysWeakList.push(date);
      }

      totalScore += score;
      totalMax += max;
    } else {
      daysMissedList.push(date);
    }
  }

  const daysDone = daysDoneList.length;
  const daysMissed = daysMissedList.length;
  const daysWeak = daysWeakList.length;
  const totalDays = allDates.length || (daysDone + daysMissed);

  const scorePercent = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
  const avgScorePerDay = daysDone > 0 ? totalScore / daysDone : 0;

  // ✅ 1. Cường độ làm bài (tần suất làm)
  const ratio = totalDays > 0 ? daysDone / totalDays : 0;
  let cuongDo = "Ít làm";
  if (ratio >= 0.8) cuongDo = "Luôn luôn";
  else if (ratio >= 0.6) cuongDo = "Thường xuyên";
  else if (ratio >= 0.3) cuongDo = "Thi thoảng";

  // ✅ 2. Hiệu quả (dựa vào % điểm)
  let hieuQua = "Kém";
  if (scorePercent >= 90) hieuQua = "Rất tốt";
  else if (scorePercent >= 70) hieuQua = "Tốt";
  else if (scorePercent >= 50) hieuQua = "Hơi tốt";

  // ✅ 3. Chăm chỉ (dựa vào điểm trung bình tuyệt đối/ngày)
  let chamChi = "Rất lười";
  if (avgScorePerDay >= 100) chamChi = "Rất chăm";
  else if (avgScorePerDay >= 70) chamChi = "Chăm";
  else if (avgScorePerDay >= 30) chamChi = "Lười";

  // ✅ 4. Đánh giá chung (tổng hợp 3 trụ cột)
  let danhGiaChung = "Cần cố gắng";
  const highCount = [cuongDo, hieuQua, chamChi].filter(v =>
    ["Luôn luôn","Thường xuyên","Rất tốt","Tốt","Rất chăm","Chăm"].includes(v)
  ).length;
  if (highCount === 3) danhGiaChung = "Tuyệt vời";
  else if (highCount === 2) danhGiaChung = "Khá";
  else if (highCount === 1) danhGiaChung = "Hơi lười";
  else danhGiaChung = "Rất kém";

  return {
    // Số liệu cơ bản
    daysDone,
    daysMissed,
    daysWeak,
    daysDoneList,
    daysMissedList,
    daysWeakList,

    // Điểm số
    scorePercent: Math.round(scorePercent),
    avgScorePerDay: Math.round(avgScorePerDay),

    // Đánh giá chữ
    cuongDo,
    hieuQua,
    chamChi,
    danhGiaChung
  };
}



// Diễn giải ngày làm/không làm/điểm kém thành lời + liệt kê ngày
function interpretDays(d) {
  function fmt(code) {
    // "280925" -> "28/09/25"
    return code && code.length === 6 ? `${code.slice(0,2)}/${code.slice(2,4)}/${code.slice(4)}` : code;
  }
  const done = d.daysDoneList.map(fmt).join(", ") || "Không có";
  const weak = d.daysWeakList.map(fmt).join(", ") || "Không có";
  const missed = d.daysMissedList.map(fmt).join(", ") || "Không có";

  const parts = [
    `Ngày có làm: ${d.daysDone} (${done})`,
    `Ngày điểm kém: ${d.daysWeak} (${weak})`,
    `Ngày không làm: ${d.daysMissed} (${missed})`
  ];
  return parts.join("<br>");
}


// Lấy chỉ số cho học sinh hiện tại
// Lấy metrics + danh sách ngày cho học sinh hiện tại từ Firebase "lop-hoc-thay-tinh"
async function fetchStudentMetricsForLocal() {
  const docId = `summary-${trainerClass}-recent`;
  const targetNick = normalizeNickname(trainerName);

  console.log("=== FETCH METRICS START ===");
  console.log("Doc path:", `tonghop/${docId}`);
  console.log("trainerClass:", trainerClass, "trainerName:", trainerName, "targetNick:", targetNick);

  try {
    const ref = doc(dbTonghop, "tonghop", docId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn("❗ Không tìm thấy document:", `tonghop/${docId}`);
      return null;
    }

    const data = snap.data();
    const dayData = data?.dayData || {};
    const allDates = (data.days && Array.isArray(data.days) ? data.days : Object.keys(dayData)).sort((a, b) => a.localeCompare(b)); // cũ -> mới

    console.log("class field trong doc:", data.class);
    console.log("Tổng số ngày:", allDates.length);

    // Thu thập entries của học sinh theo từng ngày (nếu có)
    const entries = [];
    for (const date of allDates) {
      const students = dayData[date] || {};
      for (const rawName of Object.keys(students)) {
        const normalizedName = normalizeNickname(rawName);
        if (normalizedName === targetNick) {
          entries.push({ ...students[rawName], date, name: rawName });
        }
      }
    }

    console.log("Tổng entries match:", entries.length);

    if (entries.length === 0) {
      console.warn("❗ Không tìm thấy nickname trong dayData. Kiểm tra lại trainerName.");
      return null;
    }

    const metrics = buildStudentMetrics(entries, allDates);

    console.log("Kết quả metrics:", metrics);
    console.log("=== FETCH METRICS END ===");
    return metrics;

  } catch (err) {
    console.error("❌ Lỗi khi fetch metrics:", err);
    return null;
  }
}



// Lấy đánh giá của thầy từ sheet (cột E=nickname, cột F=đánh giá)
async function fetchTeacherComment(className, nickname) {
  const rows = await fetchSheetValues(className);
  if (!rows || rows.length === 0) return "";
  const targetNick = normalizeNickname(nickname);
  for (const row of rows) {
    const rowNick = normalizeNickname(row[4] || ""); // cột E
    if (rowNick === targetNick) {
      return row[5] || ""; // cột F
    }
  }
  return "";
}

function getLevel(percent) {
  if (percent >= 90) return "Rất tốt";
  if (percent >= 75) return "Tốt";
  if (percent >= 60) return "Khá";
  if (percent >= 40) return "Trung bình";
  return "Yếu";
}

async function fetchVocabularyResult() {
  const ref = doc3(dbVocabulary, "vocabulary", docId);
  const snap = await getDoc3(ref);
  if (!snap.exists()) return "(chưa có dữ liệu từ vựng)";

  const data = snap.data();
  let html = `<p><b>Kết quả từ vựng:</b><br>`;
  html += `Tổng quan: ${data.overall.correct}/${data.overall.total} (${data.overall.percent}%) → ${data.overall.level}<br>`;

  html += `<u>Chủ đề lớn:</u><br>`;
  for (const [topic, d] of Object.entries(data.mainTopics)) {
    const percent = Math.round((d.correct / d.total) * 100);
    html += `${topic}: ${d.correct}/${d.total} (${percent}%) → ${getLevel(percent)}<br>`;
  }

  html += `<u>Chủ đề nhỏ:</u><br>`;
  for (const [topic, d] of Object.entries(data.subTopics)) {
    const percent = Math.round((d.correct / d.total) * 100);
    html += `${topic}: ${d.correct}/${d.total} (${percent}%) → ${getLevel(percent)}<br>`;
  }

  html += `</p>`;
  return html;
}


// =============== Load Parent Data ===============
async function loadParentData() {
  if (!trainerName || !trainerClass) {
    infoBox.innerHTML = "<p>❌ Chưa có thông tin học sinh trong localStorage</p>";
    return;
  }

  try {
    // 1) Lấy dữ liệu học phí từ Firebase A
    const ref = doc(dbParents, "parents", docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      infoBox.innerHTML = "<p>❌ Không tìm thấy dữ liệu học sinh trên hệ thống</p>";
      return;
    }

    const data = snap.data();
    const realName = data.realName || "";
    const nickname = data.nickname || trainerName;
    const parentName = data.parentName || "";

    // Tính tổng tiền chưa nộp
    const unpaidList = [];
    for (const [key, val] of Object.entries(data)) {
      if (/^\d{1,2}-\d{4}$/.test(key) && val && !val.paid) {
        unpaidList.push({ monthYear: key, money: Number(val.totalMoney || 0) });
      }
    }
    const totalUnpaid = unpaidList.reduce((sum, u) => sum + u.money, 0);
    const unpaidText = unpaidList.length
      ? unpaidList.map(u => `Tháng ${u.monthYear}: ${u.money.toLocaleString("vi-VN")} VND`).join("<br>")
        + `<br><b>Tổng cộng:</b> ${totalUnpaid.toLocaleString("vi-VN")} VND`
      : "Không còn nợ học phí 🎉";

    // 2) Đánh giá mức độ tham gia (Firebase B)
    const metrics = await fetchStudentMetricsForLocal();
    const fmt = code => code && code.length === 6
      ? `${code.slice(0,2)}/${code.slice(2,4)}/${code.slice(4)}`
      : code;

    const metricsHtml = metrics
      ? `
        Ngày có làm: ${metrics.daysDone} (${metrics.daysDoneList.map(fmt).join(", ") || "Không có"})<br>
        Ngày không làm: ${metrics.daysMissed} (${metrics.daysMissedList.map(fmt).join(", ") || "Không có"})<br>
        Ngày điểm kém (<50 điểm): ${metrics.daysWeak} (${metrics.daysWeakList.map(fmt).join(", ") || "Không có"})<br>
        Điểm trung bình/ngày: ${metrics.avgScorePerDay}<br>
        <hr>
        Cường độ làm bài: ${metrics.cuongDo}<br>
        Hiệu quả: ${metrics.hieuQua}<br>
        Chăm chỉ: ${metrics.chamChi}<br>
        <b>Đánh giá chung: ${metrics.danhGiaChung}</b>
      `
      : "(chưa có dữ liệu)";






    // 3) Đánh giá của thầy (Google Sheet)
    const teacherComment = await fetchTeacherComment(trainerClass, trainerName);

    // 4) Đọc kết quả từ vựng (Firebase C)
    const vocabHtml = await fetchVocabularyResult();


    // Render phần thông tin chung
    infoBox.innerHTML = `
      <h2>Thông tin học sinh</h2>
      <p><b>Tên học sinh:</b> ${realName}</p>
      <p><b>Nickname:</b> ${nickname}</p>
      <p><b>Phụ huynh:</b> ${parentName}</p>
      <p><b>Đánh giá mức độ tham gia:</b><br>${metricsHtml}</p>
      <p><b>Đánh giá của thầy:</b> ${teacherComment || "(chưa có)"}</p>
      <p><b>Kết quả từ vựng:</b><br>${vocabHtml}</p>
      <p class="summary">💰 Tiền chưa nộp:<br>${unpaidText}</p>
    `;


    // Render chi tiết từng tháng
    monthsBox.innerHTML = "";
    const monthEntries = Object.entries(data)
      .filter(([key]) => /^\d{1,2}-\d{4}$/.test(key))
      .sort((a, b) => {
        const [ma, ya] = a[0].split("-").map(Number);
        const [mb, yb] = b[0].split("-").map(Number);
        if (ya !== yb) return ya - yb;
        return ma - mb;
      });

    for (const [key, val] of monthEntries) {
      const monthDiv = document.createElement("div");
      monthDiv.className = "month";

      const header = document.createElement("div");
      header.className = "month-header";
      header.textContent = `Tháng ${key}`;

      const body = document.createElement("div");
      body.className = "month-body";

      header.onclick = () => {
        body.style.display = body.style.display === "none" ? "block" : "none";
      };

      function formatDays(list) {
        if (!list || list.length === 0) return "(không có)";
        return list.map(d => {
          const parts = String(d).split("-");
          return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
        }).join(", ");
      }

      body.innerHTML = `
        <p><b>Buổi học:</b> ${val.totalX || 0} <br><i>Ngày:</i> ${formatDays(val.daysISO?.x)}</p>
        <p><b>Buổi học 1 nửa:</b> ${val.totalHalf || 0} <br><i>Ngày:</i> ${formatDays(val.daysISO?.half)}</p>
        <p><b>Nghỉ có phép (CP):</b> ${val.totalCP || 0} <br><i>Ngày:</i> ${formatDays(val.daysISO?.cp)}</p>
        <p><b>Nghỉ không phép (KP):</b> ${val.totalKP || 0} <br><i>Ngày:</i> ${formatDays(val.daysISO?.kp)}</p>
        <p><b>Khác:</b> ${val.totalOther || 0} <br><i>Ngày:</i> ${formatDays(val.daysISO?.other)}</p>
        <hr>
        <p><b>Tổng tiền:</b> ${(val.totalMoney || 0).toLocaleString("vi-VN")} VND</p>
        <p><b>Trạng thái:</b> <span class="${val.paid ? "paid-true" : "paid-false"}">${val.paid ? "Đã nộp" : "Chưa nộp"}</span></p>
        <p><b>Ngày nộp:</b> ${val.paidDate || "-"}</p>
      `;

      monthDiv.appendChild(header);
      monthDiv.appendChild(body);
      monthsBox.appendChild(monthDiv);
    }
  } catch (e) {
    console.error(e);
    infoBox.innerHTML = "<p>❌ Lỗi tải dữ liệu: " + e.message + "</p>";
  }
}

// =============== Khởi chạy sau khi DOM sẵn sàng ===============
document.addEventListener("DOMContentLoaded", loadParentData);
