// ✅ choice1.js — phiên bản mới (mỗi ngày chỉ 1 bài + tự đề xuất random khi chưa có lịch)

const todayISO = new Date().toISOString().split("T")[0];
const className = localStorage.getItem("trainerClass")?.trim().toLowerCase();
const VOCAB_URL = "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";

if (!className) {
  document.getElementById("lessonList").innerHTML = "<p>❌ Không tìm thấy lớp đã chọn.</p>";
  document.getElementById("scheduleTable").style.display = "none";
  document.getElementById("statusMessage").textContent = "Vui lòng chọn lớp trước.";
  throw new Error("Không có trainerClass");
}

const docRef = window.doc(window.db, "lich", className);
window.getDoc(docRef).then(async snapshot => {
  const data = snapshot.exists() ? snapshot.data() : {};
  let todayLesson = data[todayISO] || null;
  let isSuggested = false;

  // ✅ Nếu không có bài học nào hôm nay → tự đề xuất random 1 bài (nhỏ hơn bài lớn nhất)
  if (!todayLesson) {
    todayLesson = await suggestRandomLesson(className);
    isSuggested = !!todayLesson;
  }

  // ✅ Hiển thị bài học hôm nay (thật hoặc đề xuất random)
  const container = document.getElementById("lessonList");
  container.innerHTML = "";

  if (!todayLesson) {
    container.innerHTML = "<p>📭 Không có bài học nào hôm nay và không tìm được bài để đề xuất.</p>";
  } else {
    const item = todayLesson; // object duy nhất
    const label = isSuggested
      ? "🎲 Đề xuất ngẫu nhiên (chưa có lịch hôm nay)"
      : item.type === "new" ? "Bài mới" :
        item.type === "related" ? `Liên quan đến ${item.relatedTo}` :
        item.type === "review" ? `Ôn tập của ${item.relatedTo}` :
        item.type === "old" ? "Bài cũ" : item.type;

    const div = document.createElement("div");
    div.innerHTML = `
      <label>
        <input type="checkbox" value="${normalizeUnit(item.code)}" data-title="${item.title}" />
        ${item.title} (${label})
      </label>
    `;
    container.appendChild(div);

    // Lưu vào localStorage để choice.js đọc được
    localStorage.setItem("todayLesson", JSON.stringify(item));
  }

  // ✅ Hiển thị lịch từ hôm nay trở đi (chỉ khi document lịch có tồn tại)
  const tableBody = document.querySelector("#scheduleTable tbody");
  tableBody.innerHTML = "";

  if (snapshot.exists()) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toISOString().split("T")[0];

    const entries = Object.entries(data)
      .filter(([date]) => date >= yesterdayISO)
      .sort(([a], [b]) => new Date(a) - new Date(b));

    for (let [dateStr, lesson] of entries) {
      const [yyyy, mm, dd] = dateStr.split("-");
      const formattedDate = `${dd}/${mm}/${yyyy}`;

      const label =
        lesson.type === "new" ? "Bài mới – Phù hợp" :
        lesson.type === "review" ? "Ôn tập – Nên học lại" :
        lesson.type === "related" ? "Liên quan – Nên học" :
        lesson.type === "old" ? "Bài cũ – Nên học lại" :
        lesson.type;

      const related = lesson.relatedTo ? ` (liên quan ${lesson.relatedTo})` : "";
      const combined = `${lesson.title} – ${label}${related}`;

      const code = normalizeUnit(lesson.code);
      const title = lesson.title;

      const button = document.createElement("button");
      button.textContent = "Học bài";
      button.style.padding = "6px 12px";
      button.style.borderRadius = "6px";
      button.style.border = "none";
      button.style.background = "#4caf50";
      button.style.color = "white";
      button.style.cursor = "pointer";
      button.onclick = () => {
        localStorage.setItem("selectedCodes", JSON.stringify([code]));
        localStorage.setItem("selectedTitles", JSON.stringify([title]));
        localStorage.setItem("selectedLesson", title);
        fetchVocabularyFromSelectedCodes([code]);
      };

      const noteCell = document.createElement("td");
      noteCell.appendChild(button);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formattedDate}</td>
        <td>${combined}</td>
      `;
      row.appendChild(noteCell);

      if (dateStr === todayISO) row.classList.add("today-row");

      tableBody.appendChild(row);
    }
  }

  document.getElementById("btnLearnSuggested").disabled = false;
}).catch(err => {
  console.error("❌ Lỗi khi lấy lịch học:", err);
  document.getElementById("lessonList").innerHTML = "<p>❌ Lỗi khi tải dữ liệu.</p>";
});

// ✅ Gắn sự kiện nút học bài đề xuất
document.getElementById("btnLearnSuggested").addEventListener("click", () => {
  const checkbox = document.querySelector("#lessonList input[type='checkbox']");
  if (!checkbox || !checkbox.checked) {
    alert("Bạn chưa chọn bài nào.");
    return;
  }

  const code = normalizeUnit(checkbox.value);
  const title = checkbox.dataset.title;

  localStorage.setItem("selectedCodes", JSON.stringify([code]));
  localStorage.setItem("selectedTitles", JSON.stringify([title]));
  localStorage.setItem("selectedLesson", title);

  fetchVocabularyFromSelectedCodes([code]);
});

// ✅ Lấy từ vựng từ Google Sheets theo mã bài
async function fetchVocabularyFromSelectedCodes(unitCodes) {
  try {
    const res = await fetch(VOCAB_URL);
    const text = await res.text();
    const json = JSON.parse(text.substring(47).slice(0, -2));
    const rows = json.table.rows;

    let wordBank = [];

    rows.forEach(row => {
      const unitRaw = row.c[1]?.v?.toString().trim();
      const word = row.c[2]?.v?.toString().trim();
      const code = extractCodeFromTitle(unitRaw);

      if (unitCodes.includes(code)) {
        wordBank.push(word);
      }
    });

    wordBank = shuffleArray(wordBank);

    localStorage.setItem("wordBank", JSON.stringify(wordBank));
    localStorage.setItem("victoryTotalWords", wordBank.length);
    console.log("📦 Từ vựng đã lấy:", wordBank);

    window.location.href = "exercise.html";
  } catch (err) {
    console.error("❌ Lỗi khi lấy từ vựng:", err);
    alert("Không thể lấy từ vựng. Vui lòng thử lại sau.");
  }
}

// ✅ Random 1 bài (nhỏ hơn mã bài lớn nhất của lớp) khi không có lịch hôm nay
async function suggestRandomLesson(className) {
  try {
    const res = await fetch(VOCAB_URL);
    const text = await res.text();
    const json = JSON.parse(text.substring(47).slice(0, -2));
    const rows = json.table.rows;

    // Gom các mã bài (dạng số) thuộc đúng lớp — cột B chứa tiêu đề dạng "lớp-bài-phần ..."
    const unitsMap = new Map(); // codeNum -> title gốc

    rows.forEach(row => {
      const unitRaw = row.c?.[1]?.v?.toString().trim();
      if (!unitRaw) return;

      const firstPart = unitRaw.split(/[-\s.]+/)[0];
      if (firstPart !== className) return; // chỉ lấy đúng lớp hiện tại

      const codeStr = extractCodeFromTitle(unitRaw);
      if (!codeStr) return;
      const codeNum = parseInt(codeStr, 10);
      if (Number.isNaN(codeNum)) return;

      if (!unitsMap.has(codeNum)) unitsMap.set(codeNum, unitRaw);
    });

    if (unitsMap.size === 0) return null;

    const maxCode = Math.max(...unitsMap.keys());

    // Chỉ lấy các bài NHỎ HƠN bài lớn nhất trong Sheet bài học
    const candidates = [...unitsMap.entries()].filter(([code]) => code < maxCode);
    if (candidates.length === 0) return null;

    const [randCode, randTitle] = candidates[Math.floor(Math.random() * candidates.length)];

    return {
      code: normalizeUnit(String(randCode)),
      title: randTitle,
      type: "random",
      relatedTo: ""
    };
  } catch (err) {
    console.error("❌ Lỗi khi random bài đề xuất:", err);
    return null;
  }
}

// ✅ Chuẩn hóa mã bài
function normalizeUnit(str) {
  if (!str || typeof str !== "string") return "";
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^0-9]/g, "").trim();
}

function extractCodeFromTitle(title) {
  if (!title || typeof title !== "string") return "";
  const parts = title.trim().split(/[-\s.]+/);
  if (parts.length >= 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
    return parts[0] + parts[1] + parts[2];
  }
  return "";
}

// ✅ Xáo trộn từ vựng
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}