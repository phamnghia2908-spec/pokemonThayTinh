import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import {
  getFirestore,
  setDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// ✅ Khởi tạo Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
  authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
  projectId: "lop-hoc-thay-tinh",
  storageBucket: "lop-hoc-thay-tinh.appspot.com",
  messagingSenderId: "391812475288",
  appId: "1:391812475288:web:ca4c275ac776d69deb23ed"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ✅ Sheet nguồn
const SHEET_BAI_MOI = "https://docs.google.com/spreadsheets/d/1xdGIaXekYFQqm1K6ZZyX5pcrmrmjFdSgTJeW27yZJmQ/gviz/tq?tqx=out:json";
const SHEET_TU_VUNG = "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";

function normalizeUnit(str) {
  if (!str || typeof str !== "string") return "";
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^0-9]/g, "").trim();
}

// ✅ Biến tạm
let finalWords = [];
let selectedCodes = [];
let selectedClass = "";

document.getElementById("btnCreateTest").addEventListener("click", async () => {
  selectedClass = document.getElementById("classSelect").value;
  const numLessons = parseInt(document.getElementById("numLessons").value);

  console.log("🚀 Bắt đầu tạo test cho lớp:", selectedClass, "| Số bài:", numLessons);

  // ✅ Bước 1: Lấy bài mới nhất từ Sheet 1
  const res1 = await fetch(SHEET_BAI_MOI);
  const text1 = await res1.text();
  const json1 = JSON.parse(text1.substring(47).slice(0, -2));
  const rows1 = json1.table.rows;

  const baiList = rows1
    .map(r => ({
      lop: r.c[0]?.v?.toString().trim(),
      code: r.c[2]?.v?.toString().trim()
    }))
    .filter(r => r.lop === selectedClass && /^\d+$/.test(r.code));

  const maxCode = baiList.reduce((max, r) => Math.max(max, parseInt(r.code)), 0);
  console.log("📌 Bài mới nhất lớp", selectedClass, "là:", maxCode);

  // ✅ Bước 2: Lấy từ vựng từ Sheet 2
  const res2 = await fetch(SHEET_TU_VUNG);
  const text2 = await res2.text();
  const json2 = JSON.parse(text2.substring(47).slice(0, -2));
  const rows2 = json2.table.rows;

  const baiTuVung = {};
  rows2.forEach(r => {
    const rawCode = r.c[1]?.v?.toString().trim();
    const word = r.c[2]?.v?.toString().trim();
    if (!rawCode || !word) return;

    const normalizedCode = normalizeUnit(rawCode); // ví dụ: "4-04-1" → "4041"
    const maxCodeStr = maxCode.toString();         // ví dụ: 4041 → "4041"

    if (normalizedCode < maxCodeStr) {
      if (!baiTuVung[normalizedCode]) baiTuVung[normalizedCode] = [];
      baiTuVung[normalizedCode].push(word);
    }
  });


  const allCodes = Object.keys(baiTuVung);
  const shuffledCodes = allCodes.sort(() => Math.random() - 0.5);
  selectedCodes = shuffledCodes.slice(0, numLessons);
  console.log("📚 Đã chọn các bài:", selectedCodes);

  const usedWords = new Set();
  finalWords = [];

  selectedCodes.forEach(code => {
    const words = baiTuVung[code].filter(w => !usedWords.has(w));
    if (words.length > 0) {
      const word = words[Math.floor(Math.random() * words.length)];
      finalWords.push({ word, code });
      usedWords.add(word);
    }
  });

  console.log("📝 Các từ đã chọn:", finalWords.map(w => `${w.word} (${w.code})`).join(", "));

  // ✅ Hiển thị lên giao diện
  const box = document.getElementById("summaryBox");
  box.innerHTML = `
    <h3>📋 Danh sách bài và từ đã chọn:</h3>
    <ul>
      ${finalWords.map(w => `<li><strong>${w.word}</strong> (bài ${w.code})</li>`).join("")}
    </ul>
  `;
  document.getElementById("btnConfirmSave").style.display = "inline-block";
});

document.getElementById("btnConfirmSave").addEventListener("click", async () => {
  const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const docId = selectedClass; // ✅ tên tài liệu là tên lớp
  const payload = {
    class: selectedClass,
    date: dateCode, // ✅ ngày tạo nằm trong nội dung
    words: finalWords,
    createdAt: Date.now()
  };

  await setDoc(doc(db, "test", docId), payload); // ✅ ghi đè nếu đã tồn tại


  await setDoc(doc(db, "test", docId), payload);
  console.log("✅ Đã lưu test:", docId, "| Tổng từ:", finalWords.length);

  document.getElementById("summaryBox").innerHTML += `<p style="color:green;">✅ Đã lưu lên Firebase!</p>`;
  document.getElementById("btnConfirmSave").style.display = "none";
});

// ✅ Biến riêng cho chế độ thủ công
let manualWords = [];
let manualClass = [];
let selectedUnits = [];

document.getElementById("btnManualStart").addEventListener("click", async () => {
  manualClass = document.getElementById("manualClassSelect").value;
  console.log("📌 Tạo thủ công cho lớp:", manualClass);

  const res = await fetch(SHEET_TU_VUNG);
  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));
  const rows = json.table.rows;

  const unitSet = new Set();
  rows.forEach(row => {
    const unit = row.c[1]?.v?.toString().trim();
    if (unit) unitSet.add(unit);
  });

  const unitList = document.getElementById("unitList");
  unitList.innerHTML = "";
  unitSet.forEach(unit => {
    const label = document.createElement("label");
    label.style.display = "block";
    label.style.marginBottom = "6px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = unit;

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" " + unit));
    unitList.appendChild(label);
  });

  document.getElementById("btnConfirmManual").style.display = "inline-block";
});

document.getElementById("btnConfirmManual").addEventListener("click", async () => {
  selectedUnits = Array.from(document.querySelectorAll('#unitList input[type="checkbox"]:checked'))
                       .map(cb => cb.value);

  if (selectedUnits.length === 0) {
    alert("❌ Bạn chưa chọn bài nào.");
    return;
  }

  console.log("📚 Các bài đã chọn:", selectedUnits);

  const res = await fetch(SHEET_TU_VUNG);
  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));
  const rows = json.table.rows;

  const wordMap = {};
  rows.forEach(row => {
    const unit = row.c[1]?.v?.toString().trim();
    const word = row.c[2]?.v?.toString().trim();
    if (unit && word) {
      if (!wordMap[unit]) wordMap[unit] = [];
      wordMap[unit].push(word);
    }
  });

  manualWords = [];
  const usedWords = new Set();

  selectedUnits.forEach(unit => {
    const words = wordMap[unit]?.filter(w => !usedWords.has(w)) || [];
    if (words.length > 0) {
      const word = words[Math.floor(Math.random() * words.length)];
      manualWords.push({ word, code: normalizeUnit(unit) });
      usedWords.add(word);
    }
  });

  console.log("📝 Từ đã chọn:", manualWords.map(w => `${w.word} (${w.code})`).join(", "));

  const summary = document.getElementById("manualSummary");
  summary.innerHTML = `
    <h3>📋 Danh sách bài và từ đã chọn (thủ công):</h3>
    <ul>
      ${manualWords.map(w => `<li><strong>${w.word}</strong> (bài ${w.code})</li>`).join("")}
    </ul>
  `;

  document.getElementById("btnSaveManual").style.display = "inline-block";
});

document.getElementById("btnSaveManual").addEventListener("click", async () => {
  const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const docId = manualClass;

  const payload = {
    class: manualClass,
    date: dateCode,
    words: manualWords,
    createdAt: Date.now()
  };

  await setDoc(doc(db, "test", docId), payload);
  console.log("✅ Đã lưu test thủ công:", docId, "| Tổng từ:", manualWords.length);

  document.getElementById("manualSummary").innerHTML += `<p style="color:green;">✅ Đã lưu lên Firebase!</p>`;
  document.getElementById("btnSaveManual").style.display = "none";
});

// ✅ Tự động xóa dữ liệu test sau 15 tiếng
import { getDocs, deleteDoc, collection } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

async function autoDeleteOldTests() {
  const snapshot = await getDocs(collection(db, "test"));
  const now = Date.now();
  const cutoff = now - 15 * 60 * 60 * 1000; // 15 tiếng

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const createdAt = data.createdAt;

    if (createdAt && createdAt < cutoff) {
      await deleteDoc(doc(db, "test", docSnap.id));
      console.log("🗑️ Đã xóa test cũ:", docSnap.id);
    }
  }
}

autoDeleteOldTests();
