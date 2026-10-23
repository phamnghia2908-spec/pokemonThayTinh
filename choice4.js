// ===== Config =====
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";

// ===== State =====
let allRows = [];             // raw rows from sheet
let topicIndex = new Map();   // displayTopic -> normalizedTopic
let unitIndex = new Map();    // unit -> Set(normalizedTopic)
let wordBank = [];            // selected words for exercises

// ===== Utilities =====
function safeText(cell) {
  const v = cell?.v;
  return typeof v === "string" ? v.trim() : (typeof v === "number" ? String(v) : "");
}
function normalizeTopicName(name) {
  return name.trim().toLowerCase();
}
function splitTopics(raw) {
  return String(raw)
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
}
function uniquePush(arr, item) {
  if (!arr.includes(item)) arr.push(item);
}
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ===== Data fetching and indexing =====
async function fetchGoogleSheetsData() {
  try {
    const res = await fetch(SHEET_URL);
    const text = await res.text();
    const jsonData = JSON.parse(text.substring(47).slice(0, -2));
    allRows = jsonData.table.rows || [];

    buildTopicAndUnitIndexes();
    renderTopicDropdown();
  } catch (err) {
    console.error("❌ Lỗi khi tải dữ liệu:", err);
    const topicSelect = document.getElementById("topicSelect");
    if (topicSelect) {
      topicSelect.innerHTML = `<option value="">Lỗi tải dữ liệu</option>`;
    }
  }
}

function buildTopicAndUnitIndexes() {
  topicIndex.clear();
  unitIndex.clear();

  // Columns: B=1 (unit), C=2 (word), F=5 (topic1), G=6 (topic2)
  for (const row of allRows) {
    const unit = safeText(row.c?.[1]);
    const topicF = safeText(row.c?.[5]);
    const topicG = safeText(row.c?.[6]);

    if (!unit) continue;

    const topics = [...splitTopics(topicF), ...splitTopics(topicG)];
    if (!unitIndex.has(unit)) unitIndex.set(unit, new Set());

    topics.forEach(display => {
      if (!display) return;
      const norm = normalizeTopicName(display);
      topicIndex.set(display, norm);
      unitIndex.get(unit).add(norm);
    });
  }
}

function renderTopicDropdown() {
  const topicSelect = document.getElementById("topicSelect");
  if (!topicSelect) return;

  // Build unique list of display topics sorted A-Z
  const displayTopics = Array.from(topicIndex.keys()).sort((a, b) =>
    a.localeCompare(b, "vi", { sensitivity: "base" })
  );

  topicSelect.innerHTML = `<option value="">-- Chọn chủ đề --</option>`;
  displayTopics.forEach(display => {
    const opt = document.createElement("option");
    opt.value = topicIndex.get(display); // normalized value
    opt.textContent = display;
    topicSelect.appendChild(opt);
  });
}

// ===== UI: units by topic =====
function loadUnitsByTopic(normalizedTopic) {
  const unitList = document.getElementById("unitList");
  const unitCount = document.getElementById("unitCount");
  const loadWordsBtn = document.getElementById("loadWordsBtn");
  const wordDisplay = document.getElementById("wordDisplay");
  const wordCount = document.getElementById("wordCount");
  const exerciseButton = document.getElementById("exerciseButton");

  if (!unitList) return;

  unitList.innerHTML = "";
  wordDisplay.textContent = "Chưa có từ vựng. Hãy chọn bài và bấm “Lấy từ vựng”.";
  wordDisplay.classList.add("muted");
  wordCount.textContent = "0 từ";
  exerciseButton.style.display = "none";
  wordBank = [];

  // Filter units that include the selected topic in F or G (supports multi-values)
  const matchedUnits = [];
  unitIndex.forEach((topicSet, unit) => {
    if (topicSet.has(normalizedTopic)) matchedUnits.push(unit);
  });
  matchedUnits.sort((a, b) => a.localeCompare(b, "vi", { sensitivity: "base" }));

  matchedUnits.forEach(unit => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = unit;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" " + unit));
    unitList.appendChild(label);
  });

  unitCount.textContent = `${matchedUnits.length} bài`;
  loadWordsBtn.style.display = matchedUnits.length > 0 ? "inline-block" : "none";
}

// ===== Words collection =====
function loadWords() {
  const selectedUnits = Array.from(
    document.querySelectorAll('#unitList input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  const wordDisplay = document.getElementById("wordDisplay");
  const wordCount = document.getElementById("wordCount");
  const exerciseButton = document.getElementById("exerciseButton");

  wordBank = [];

  if (selectedUnits.length === 0) {
    wordDisplay.textContent = "Bạn chưa chọn bài nào.";
    wordDisplay.classList.add("muted");
    wordCount.textContent = "0 từ";
    exerciseButton.style.display = "none";
    return;
  }

  // Collect words (column C) for the selected units
  for (const row of allRows) {
    const unit = safeText(row.c?.[1]);
    const word = safeText(row.c?.[2]);
    if (unit && selectedUnits.includes(unit) && word) {
      uniquePush(wordBank, word);
    }
  }

  shuffleArray(wordBank);

  if (wordBank.length > 0) {
    wordDisplay.textContent = wordBank.join(", ");
    wordDisplay.classList.remove("muted");
    wordCount.textContent = `${wordBank.length} từ`;
    exerciseButton.style.display = "inline-block";
  } else {
    wordDisplay.innerHTML = `<i>Không có từ nào được chọn.</i>`;
    wordDisplay.classList.add("muted");
    wordCount.textContent = "0 từ";
    exerciseButton.style.display = "none";
  }
}

// ===== Helpers: select/clear units =====
function selectAllUnits() {
  document.querySelectorAll('#unitList input[type="checkbox"]').forEach(cb => cb.checked = true);
}
function clearUnits() {
  document.querySelectorAll('#unitList input[type="checkbox"]').forEach(cb => cb.checked = false);
}

// ===== Navigation to exercises =====
function startExercises() {
  localStorage.setItem("wordBank", JSON.stringify(wordBank));
  localStorage.setItem("victoryTotalWords", String(wordBank.length));

  const selectedUnits = Array.from(
    document.querySelectorAll('#unitList input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  localStorage.setItem("selectedLesson", selectedUnits.join(", "));
  localStorage.setItem("selectedTopic", document.getElementById("topicSelect").value || "");

  window.location.href = "exercise.html";
}

// ===== Boot =====
document.addEventListener("DOMContentLoaded", () => {
  fetchGoogleSheetsData();

  document.getElementById("topicSelect").addEventListener("change", (e) => {
    const normalizedTopic = e.target.value;
    if (normalizedTopic) {
      loadUnitsByTopic(normalizedTopic);
    } else {
      document.getElementById("unitList").innerHTML = "";
      document.getElementById("unitCount").textContent = "0 bài";
      document.getElementById("loadWordsBtn").style.display = "none";
      document.getElementById("wordDisplay").textContent = "Chưa có từ vựng. Hãy chọn bài và bấm “Lấy từ vựng”.";
      document.getElementById("wordDisplay").classList.add("muted");
      document.getElementById("wordCount").textContent = "0 từ";
      document.getElementById("exerciseButton").style.display = "none";
      wordBank = [];
    }
  });

  document.getElementById("loadWordsBtn").addEventListener("click", loadWords);
  document.getElementById("exerciseButton").addEventListener("click", startExercises);
  document.getElementById("selectAllUnitsBtn").addEventListener("click", selectAllUnits);
  document.getElementById("clearUnitsBtn").addEventListener("click", clearUnits);
});
