import { showVictoryEffect } from './effect-win.js';
import { showDefeatEffect } from './effect-loose.js';

// GHI CHÚ: SHEET_URL và SHEET_BAI_HOC đã được load từ googleSheetLinks.js qua HTML

let listeningData = [];
let currentIndex = 0;
let score = 0;
let voiceMale = null;
let voiceFemale = null;

// ===== Helpers =====
function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/gi, "").trim();
}

function cleanText(text) {
  return text.replace(/\([^)]*\)/g, "").trim();
}

function getVoices() {
  return new Promise(resolve => {
    let voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}

function speak(text, voice) {
  if (!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.voice = voice;
  speechSynthesis.speak(utter);
}

/**
 * Lấy mã bài học lớn nhất để giới hạn phạm vi bài tập
 */
async function getMaxLessonCode() {
  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
  try {
    const res = await fetch(SHEET_BAI_HOC);
    const rows = await res.json();
    const baiList = rows
      .map(r => {
        const lop = (r[0] || "").toString().trim();
        const bai = (r[2] || "").toString().trim();
        return lop === trainerClass && bai ? parseInt(bai, 10) : null;
      })
      .filter(v => typeof v === "number" && !isNaN(v));

    return baiList.length > 0 ? Math.max(...baiList) : null;
  } catch (err) {
    console.error("❌ Lỗi lấy maxLessonCode:", err);
    return null;
  }
}

// ✅ Load dữ liệu từ Apps Script Exec
async function fetchListeningData() {
  try {
    const maxLessonCode = await getMaxLessonCode();
    if (!maxLessonCode) return [];

    const res = await fetch(SHEET_URL);
    const rows = await res.json();

    const wordBank = JSON.parse(localStorage.getItem("wordBank")) || [];
    const uniqueWords = [...new Set(wordBank.map(w => w.toLowerCase().trim()))];

    // Lọc và mapping dữ liệu
    const parsed = rows.map(row => {
      const lessonName = (row[1] || "").toString().trim(); // Cột B (1)
      const target = (row[2] || "").toString().trim();     // Cột C (2)
      const rawQuestion = (row[9] || "").toString().trim(); // Cột J (9)
      const rawAnswer = (row[11] || "").toString().trim();  // Cột L (11)

      // Hàm helper tính unitNum (cần giống file Speaking 3)
      const unitNum = (function(unitStr) {
        if (!unitStr) return 0;
        const parts = unitStr.split("-");
        if (parts.length < 3) return 0;
        return parseInt(parts[0]) * 1000 + parseInt(parts[1]) * 10 + parseInt(parts[2]);
      })(lessonName);

      return { 
        question: cleanText(rawQuestion), 
        answer: cleanText(rawAnswer), 
        target, 
        unitNum 
      };
    }).filter(item => 
      item.question && 
      item.answer && 
      item.unitNum <= maxLessonCode && // Chỉ lấy bài đã học hoặc trước đó
      uniqueWords.includes(item.target.toLowerCase().trim())
    );

    // Shuffle (trộn) dữ liệu và lấy tối đa 10-15 câu để luyện tập
    return parsed.sort((a, b) => a.unitNum - b.unitNum).slice(0, 15);
  } catch (error) {
    console.error("❌ Lỗi khi fetch dữ liệu Listening:", error);
    return [];
  }
}

function updateScoreBoard() {
  const scoreBoard = document.getElementById("scoreBoard");
  if (scoreBoard) {
    scoreBoard.textContent = `🎯 Điểm: ${score}/${currentIndex}`;
  }
}

function nextListening1() {
  if (currentIndex >= listeningData.length) {
    showSummary();
    return;
  }

  const item = listeningData[currentIndex];
  const { question, answer, target } = item;

  // Tạo regex để ẩn từ cần điền (case-insensitive)
  const regex = new RegExp(`\\b${target}\\b`, "gi");
  const displayQuestion = question.replace(regex, "___");
  const displayAnswer = answer.replace(regex, "___");

  document.getElementById("exerciseArea").innerHTML = `
    <div class="dialogue-text">
      <div class="line" style="font-size:24px; margin-bottom:12px; color: #fff;">🗣 ${displayQuestion}</div>
      <div class="line" style="font-size:24px; color: #ffd700;">🗣 ${displayAnswer}</div>
    </div>
  `;

  const inputEl = document.getElementById("inputWord");
  if (inputEl) inputEl.value = "";

  const resultBox = document.getElementById("resultBox");
  if (resultBox) resultBox.textContent = "";

  // Phát âm hội thoại
  playConversation(question, answer);

  document.getElementById("playBtn").onclick = () => playConversation(question, answer);

  document.getElementById("submitBtn").onclick = () => {
    const userVal = inputEl.value;

    if (normalize(userVal) === normalize(target)) {
      score++;
      resultBox.textContent = "✅ Chính xác!";
      resultBox.style.color = "#4CAF50";
    } else {
      resultBox.textContent = `❌ Sai rồi. Đáp án là: ${target}`;
      resultBox.style.color = "#FF5252";
    }

    // Phát âm lại từ đúng để ghi nhớ
    speak(target, voiceFemale);

    currentIndex++;
    updateScoreBoard();

    // Chuyển câu sau 2 giây
    setTimeout(nextListening1, 2000);
  };
}

function playConversation(q, a) {
  speak(q, voiceMale);
  setTimeout(() => speak(a, voiceFemale), 1500);
}

function showSummary() {
  const total = listeningData.length;
  const percent = total > 0 ? score / total : 0;
  const passed = percent >= 0.7;
  const area = document.getElementById("exerciseArea");

  setResultListeningPart(1, score, total);

  let html = `
    <div class="dialogue-text" style="text-align: center;">
      <h2 style="color: #ffd700;">🏁 Hoàn thành!</h2>
      <div style="font-size: 20px; margin: 15px 0;">
        ✅ Đúng: <b>${score}/${total}</b> câu (${Math.round(percent * 100)}%)
      </div>
  `;

  if (passed) {
    html += `<div style="color: #4CAF50;">🎉 Chuẩn Legendary! Bạn đã bắt được Pokémon!</div>`;
    area.innerHTML = html + `</div>`;
    showVictoryEffect(area);
  } else {
    html += `<div style="color: #FF5252;">🚫 Thất bại! Cần đạt tối thiểu 70% để bắt Pokémon.</div>`;
    area.innerHTML = html + `</div>`;
    showDefeatEffect(area);
  }

  if (document.getElementById("resultBox")) document.getElementById("resultBox").textContent = "";
}

function setResultListeningPart(mode, score, total) {
  const raw = localStorage.getItem("result_listening");
  const prev = raw ? JSON.parse(raw) : {};

  const updated = {
    score1: mode === 1 ? score : (prev.score1 || 0),
    score2: mode === 2 ? score : (prev.score2 || 0),
    score3: mode === 3 ? score : (prev.score3 || 0),
    total1: mode === 1 ? total : (prev.total1 || 0),
    total2: mode === 2 ? total : (prev.total2 || 0),
    total3: mode === 3 ? total : (prev.total3 || 0)
  };

  localStorage.setItem("result_listening", JSON.stringify({
    ...updated,
    score: updated.score1 + updated.score2 + updated.score3,
    total: updated.total1 + updated.total2 + updated.total3
  }));
}

// ===== Khởi chạy =====
// ===== Khởi chạy =====
getVoices().then(async (voices) => {
  // Ép lấy giọng y hệt như cấu hình của file Listening 2
  voiceMale = voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("david")) ||
              voices.find(v => v.lang === "en-US");

  voiceFemale = voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("zira")) ||
                voices.find(v => v.lang === "en-US");

  const res = await fetchListeningData();
  listeningData = res;

  if (listeningData.length > 0) {
    currentIndex = 0;
    score = 0;
    updateScoreBoard();
    nextListening1();
  } else {
    document.getElementById("exerciseArea").innerHTML = `
      <div style="padding: 20px; color: #ffd700;">
        📭 Không tìm thấy dữ liệu nghe phù hợp bài học hiện tại.
      </div>`;
  }
});