import { displayBackground } from './backgroundPokeword.js';
import { showVictoryEffect } from './effect-win.js';
import { showDefeatEffect } from './effect-loose.js';

console.log("pokeword.js đã được load");

const bgMusic = new Audio("https://ninjavanxuantruong.github.io/mp3vietnam2/Pokemon1.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.9;

window.onload = () => {
  bgMusic.play().catch(err => console.log("Trình duyệt chặn phát nhạc:", err));

  const btn = document.createElement("button");
  btn.id = "toggle-music";
  btn.innerText = "Tắt nhạc";
  btn.style.margin = "12px";
  btn.style.padding = "8px 16px";
  btn.style.borderRadius = "6px";
  btn.style.backgroundColor = "#2196f3";
  btn.style.color = "#fff";
  btn.style.fontWeight = "bold";
  btn.style.border = "none";
  btn.style.cursor = "pointer";

  btn.onclick = () => {
    if (bgMusic.paused) {
      bgMusic.play();
      btn.innerText = "Tắt nhạc";
    } else {
      bgMusic.pause();
      btn.innerText = "Bật nhạc";
    }
  };

  document.querySelector("h1").after(btn);
};

const timeLimit = 20;
let vocabWords = [];
let currentIndex = 0;
let score = 0;
let timer;
let timerExpired = false;

const countdownEl = document.getElementById("countdown");
const scoreBox = document.getElementById("score-box");
const timerBox = document.getElementById("timer-box");
const grid = document.getElementById("word-grid");
const hintBox = document.getElementById("hint-box");
const hintBtn = document.getElementById("hint-btn");
const submitBtn = document.getElementById("submit-btn");

async function fetchWords() {
  // 1. Lấy link từ biến toàn cục SHEET_URL đã có sẵn
  const chosenWords = JSON.parse(localStorage.getItem("wordBank")) || [];

  try {
    const res = await fetch(SHEET_URL);
    // 2. Nhận mảng 2 chiều sạch từ Apps Script
    const rows = await res.json(); 

    const cleanWord = w => w.replace(/[^a-zA-Z]/g, "").toUpperCase();

    // 3. Mapping dữ liệu - GIỮ NGUYÊN INDEX CỘT (2 và 24)
    const raw = rows.map(row => {
      return {
        word: cleanWord((row[2] || "").toString()), // Cột C (Index 2)
        meaning: (row[24] || "").toString().trim()   // Cột Y (Index 24)
      };
    }).filter(item =>
      chosenWords.some(c => cleanWord(c) === item.word)
    );

    const unique = [];
    const seen = new Set();
    raw.forEach(item => {
      if (!seen.has(item.word)) {
        unique.push(item);
        seen.add(item.word);
      }
    });

    // Logic nhân đôi và xáo trộn (Giữ nguyên của bạn)
    const doubled = [...unique, ...unique];
    const shuffled = doubled.sort(() => Math.random() - 0.5);
    return shuffled;

  } catch (error) {
    console.error("Lỗi khi fetch dữ liệu từ Apps Script:", error);
    return [];
  }
}

function getMissingIndexes(len) {
  return Array.from({ length: len }, (_, i) => i)
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.floor(len / 2));
}

function renderWord(wordObj) {
  clearInterval(timer);
  timerExpired = false;
  countdownEl.textContent = timeLimit;
  timerBox.textContent = `Thời gian: ${timeLimit}s`;
  hintBox.textContent = "";
  grid.innerHTML = "";

  const letters = wordObj.word.split("");
  const missing = getMissingIndexes(letters.length);

  letters.forEach((char, i) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    if (missing.includes(i)) {
      const input = document.createElement("input");
      input.setAttribute("maxlength", 1);
      cell.appendChild(input);
    } else {
      cell.textContent = char;
    }
    grid.appendChild(cell);
  });

  displayBackground();
  startTimer();
}

function startTimer() {
  let sec = timeLimit;
  timerBox.textContent = `Thời gian: ${sec}s`;

  timer = setInterval(() => {
    sec--;
    timerBox.textContent = `Thời gian: ${sec}s`;

    if (sec <= 0) {
      clearInterval(timer);
      timerExpired = true;
      timerBox.textContent = "⏱️ Hết giờ! Vẫn có thể xác nhận.";
    }
  }, 1000);
}

function setResultGamePart(mode, score, total) {
  const raw = localStorage.getItem("result_game");
  const prev = raw ? JSON.parse(raw) : {};

  const updated = {
    scoreGame1: mode === 1 ? score : prev.scoreGame1 || 0,
    scoreGame2: mode === 2 ? score : prev.scoreGame2 || 0,
    scoreGame3: mode === 3 ? score : prev.scoreGame3 || 0,
    totalGame1: mode === 1 ? total : prev.totalGame1 || 0,
    totalGame2: mode === 2 ? total : prev.totalGame2 || 0,
    totalGame3: mode === 3 ? total : prev.totalGame3 || 0
  };

  const totalScore = updated.scoreGame1 + updated.scoreGame2 + updated.scoreGame3;
  const totalMax   = updated.totalGame1 + updated.totalGame2 + updated.totalGame3;

  localStorage.setItem("result_game", JSON.stringify({
    ...updated,
    score: totalScore,
    total: totalMax
  }));
}

function checkAnswer() {
  const wordObj = vocabWords[currentIndex];
  const expected = wordObj.word;
  const cells = document.querySelectorAll(".cell");
  let guess = "";

  cells.forEach(cell => {
    const input = cell.querySelector("input");
    guess += input
      ? (input.value || "_").toUpperCase()
      : cell.textContent.toUpperCase();
  });

  if (guess === expected) {
    if (!timerExpired) {   // ✅ chỉ cộng điểm khi còn thời gian
      score += 1;
      scoreBox.textContent = `Điểm: ${score}`;
    }
    updateMatchedWordsDisplay(wordObj);
    hintBox.textContent = timerExpired
      ? "✅ Đúng! Nhưng đã hết giờ, không cộng điểm."
      : "✅ Chính xác! Bạn được cộng điểm.";
  } else {
    hintBox.textContent = "❌ Sai rồi! Từ này không đúng.";
  }

  currentIndex++;
  if (currentIndex < vocabWords.length) {
    setTimeout(() => renderWord(vocabWords[currentIndex]), 1000);
  } else {
    clearInterval(timer);

    const totalWords = vocabWords.length; // ✅ tổng số câu = số từ gốc × 2
    const percent = score / totalWords;

    if (percent >= 0.7 && !timerExpired) {
      showVictoryEffect();
    } else {
      showDefeatEffect();
    }

    // ✅ Ghi điểm cho Game 3
    setResultGamePart(3, score, totalWords);
  }
}


submitBtn.onclick = () => {
  checkAnswer();
};

function updateMatchedWordsDisplay(obj) {
  let display = document.getElementById("matchedWordsDisplay");
  if (!display) {
    display = document.createElement("div");
    display.id = "matchedWordsDisplay";
    display.style.marginTop = "12px";
    display.style.fontSize = "16px";
    display.style.color = "#fff";
    document.getElementById("game-container").appendChild(display);
  }

  if (!display.dataset.init) {
    display.innerHTML = "<strong>Từ đã bắt được:</strong> ";
    display.dataset.init = "true";
  }

  const prev = display.textContent;
  const newEntry = obj.word.toLowerCase(); // 🔤 Hiển thị chữ thường
  display.textContent = prev.includes(":")
    ? prev + ", " + newEntry
    : "Từ đã bắt được: " + newEntry;
}







hintBtn.onclick = () => {
  const wordObj = vocabWords[currentIndex];
  hintBox.textContent = `📘 Gợi ý: ${wordObj.meaning}`;
};

document.addEventListener("DOMContentLoaded", async () => {
  vocabWords = await fetchWords();
  if (vocabWords.length === 0) {
    alert("Không có từ vựng nào!");
    return;
  }
  renderWord(vocabWords[currentIndex]);
});
