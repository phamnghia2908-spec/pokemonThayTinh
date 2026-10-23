console.log("word-puzzle.js đã được load");

// 🆕 Khởi tạo nhạc nền
const bgMusic = new Audio("https://ninjavanxuantruong.github.io/mp3vietnam2/Pokemon1.mp3");
bgMusic.loop = true;  // Lặp vô hạn
bgMusic.volume = 0.9; // Âm lượng mặc định

// 🆕 Tự động phát nhạc khi trang tải xong
window.onload = () => {
  bgMusic.play().catch(error => console.log("Trình duyệt chặn phát nhạc tự động:", error));

  // 🆕 Tạo nút bật/tắt nhạc
  let btn = document.createElement("button");
  btn.id = "toggle-music";
  btn.innerText = "Tắt Nhạc";
  btn.style.marginTop = "10px";
  btn.onclick = () => {
    if (bgMusic.paused) {
      bgMusic.play();
      btn.innerText = "Tắt Nhạc";
    } else {
      bgMusic.pause();
      btn.innerText = "Bật Nhạc";
    }
  };

  let guideText = document.querySelector("h2"); // 🆕 Đặt nút ngay dưới hướng dẫn
  guideText.parentNode.insertBefore(btn, guideText.nextSibling);
};

let vocabWords = [];     // Danh sách từ đúng (đã làm sạch) có kèm nghĩa
let selectedCells = [];  // Danh sách các ô người chơi đã chọn (theo thứ tự)
let displayCells = [];   // Mảng chứa tất cả các ô hiển thị (bao gồm từ đúng và ký tự ngẫu nhiên)
let matchedWords = [];   // Danh sách các từ ghép đúng (có nghĩa)
let totalTime = 0;
let countdown = 0;
let totalTimer;
let timerExpired = false;

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Hàm làm sạch từ: loại bỏ ký tự không phải chữ, khoảng trắng và chuyển thành chữ in hoa
// Hàm làm sạch từ: loại bỏ các ký tự không phải chữ và chuyển toàn bộ về chữ in hoa
function cleanWord(word) {
  return word.replace(/[^a-zA-Z]/g, "").toUpperCase();
}


// Hàm fetch từ Google Sheet (cột C: từ, cột Y: nghĩa)
// Hàm fetch từ Google Sheet qua Apps Script Exec (cột 2: từ, cột 24: nghĩa)
async function fetchWords() {
  let chosenWords = JSON.parse(localStorage.getItem("wordBank")) || [];

  if (chosenWords.length === 0) {
    console.warn("Không có danh sách từ vựng đã chốt!");
    return [];
  }

  try {
    // 1. Gọi trực tiếp SHEET_URL (Link exec đã có sẵn ở window từ googleSheetLinks.js)
    const response = await fetch(SHEET_URL);

    // 2. Nhận mảng 2 chiều sạch từ Apps Script
    const rows = await response.json(); 

    // 3. Tạo danh sách và lọc - GIỮ NGUYÊN INDEX CỘT (2 và 24)
    const rawWords = rows.map(row => {
      return {
        word: cleanWord((row[2] || "").toString()), // Cột C (Index 2)
        meaning: (row[24] || "").toString().trim()   // Cột Y (Index 24)
      };
    })
    // Lọc những từ trùng khớp với danh sách đã chọn
    .filter(item =>
      chosenWords.some(chosen => cleanWord(chosen) === item.word)
    );

    console.log("Tổng số dòng trùng khớp:", rawWords.length);

    // 🧠 Loại bỏ từ trùng lặp, chỉ lấy bản ghi đầu tiên
    const uniqueWords = [];
    const seen = new Set();

    for (let item of rawWords) {
      if (!seen.has(item.word)) {
        uniqueWords.push(item);
        seen.add(item.word);
      }
    }

    console.log("Danh sách từ đã lọc và loại trùng:", uniqueWords);
    return uniqueWords;
  } catch (error) {
    console.error("Lỗi khi fetch từ Apps Script:", error);
    return [];
  }
}







// Hàm xáo trộn danh sách từ đúng
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Hàm hiển thị nghĩa của tất cả từ đã chọn (gợi ý cho người chơi)
function displayHints() {
  let hintContainer = document.getElementById("hintDisplay");
  if (!hintContainer) {
    hintContainer = document.createElement("div");
    hintContainer.id = "hintDisplay";
    hintContainer.style.marginTop = "10px";
    hintContainer.style.fontSize = "16px"; // Giảm kích thước chữ
    hintContainer.style.color = "#fff";
    hintContainer.style.display = "flex";  // 🆕 Dùng Flexbox
    hintContainer.style.flexWrap = "wrap"; // 🆕 Cho phép xuống dòng nếu cần
    hintContainer.style.gap = "10px"; // 🆕 Tạo khoảng cách giữa các mục

    let guideText = document.querySelector("h2");
    guideText.parentNode.insertBefore(hintContainer, guideText.nextSibling);
  }

  // Tạo danh sách nghĩa theo chiều ngang
  hintContainer.innerHTML = "<strong>Gợi ý nghĩa của các từ:</strong><br>";
  hintContainer.innerHTML += vocabWords.map(item => `<span>${item.meaning}</span>`).join(" | ");
}


// Hàm khởi tạo game
async function setupGame() {
  vocabWords = await fetchWords();
  if (vocabWords.length === 0) {
    console.error("Không có từ vựng nào được tải về!");
    return;
  }

  shuffleArray(vocabWords);
  
  totalTime = vocabWords.length * 15;
  countdown = totalTime;
  startTotalTimer();


  displayCells = [];

  vocabWords.forEach(item => {
    const preCount = Math.floor(Math.random() * 4) + 1;
    for (let i = 0; i < preCount; i++) {
      let randLetter = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      displayCells.push({ letter: randLetter, isCorrect: false });
    }

    item.word.split("").forEach(letter => {
      displayCells.push({ letter: letter, isCorrect: true, word: item.word, meaning: item.meaning });
    });

    const postCount = Math.floor(Math.random() * 4) + 1;
    for (let i = 0; i < postCount; i++) {
      let randLetter = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      displayCells.push({ letter: randLetter, isCorrect: false });
    }
  });

  displayBoard();
  displayHints();  // 🆕 Hiển thị danh sách nghĩa gợi ý
  updateMatchedWordsDisplay();
  console.log("Game đã được hiển thị!");
}

// Hàm hiển thị bảng ô chữ
function displayBoard() {
  const gameBoard = document.getElementById("gameBoard");
  if (!gameBoard) {
    console.error("Không tìm thấy phần tử với id 'gameBoard'.");
    return;
  }
  gameBoard.innerHTML = "";

  displayCells.forEach((cellObj, index) => {
    const cell = document.createElement("div");
    cell.classList.add("card");
    // Chuyển ký tự hiển thị sang in hoa
    cell.innerText = cellObj.letter.toUpperCase();
    cell.dataset.index = index;
    cell.addEventListener("click", () => handleCellClick(cell));
    gameBoard.appendChild(cell);
  });
}


// Xử lý khi người chơi click vào 1 ô
function handleCellClick(cell) {
  if (cell.classList.contains("matched-green")) return;

  const cellIndex = parseInt(cell.dataset.index);

  // 🆕 Kiểm tra nếu ô mới không liền kề với các ô đã chọn trước đó
  const isAdjacent = selectedCells.some(selectedCell => {
    const selectedIndex = parseInt(selectedCell.dataset.index);
    return Math.abs(selectedIndex - cellIndex) === 1; // 🆕 Kiểm tra vị trí liền kề
  });

  if (!isAdjacent && selectedCells.length > 0) {
    // 🆕 Nếu ô không liền kề, reset toàn bộ lựa chọn
    selectedCells.forEach(selectedCell => selectedCell.classList.remove("selected"));
    selectedCells = [];
  }

  // Toggle trạng thái "selected"
  if (cell.classList.contains("selected")) {
    cell.classList.remove("selected");
    selectedCells = selectedCells.filter(c => c !== cell);
  } else {
    cell.classList.add("selected");
    selectedCells.push(cell);
  }

  checkSelectedWord();
}


// Kiểm tra từ đúng
function checkSelectedWord() {
  // Ghép các ký tự đã chọn và chuyển về chữ in hoa để khớp với kết quả cleanWord()
  const candidate = selectedCells.map(cell => cell.innerText).join("").toUpperCase();
  console.log("Candidate:", candidate);

  // Log để kiểm tra danh sách ký tự đã chọn và danh sách từ hợp lệ
  console.log("Danh sách ký tự đã chọn:", selectedCells.map(cell => cell.innerText));
  console.log("Danh sách từ hợp lệ:", vocabWords.map(item => item.word));

  // Tìm từ phù hợp: cleanWord() luôn trả về chữ in hoa
  const found = vocabWords.find(item => cleanWord(item.word) === candidate);

  if (found) {
    // Kiểm tra nếu từ đã được chọn trước đó
    if (matchedWords.some(item => cleanWord(item.word) === cleanWord(found.word))) {
      console.log(`"${found.word}" đã được chọn trước đó, không cho chọn lại.`);
      return;
    }

    // Đánh dấu các ô đã chọn là đúng
    selectedCells.forEach(cell => {
      cell.classList.remove("selected");
      cell.classList.add("matched-green");
    });

    matchedWords.push(found);
    console.log("Từ đúng:", found.word);

    updateMatchedWordsDisplay();
    // Kiểm tra xem đã chiến thắng chưa (tức là đã chọn hết các từ)
    checkVictory();

    selectedCells = [];
  } else {
    console.log("Không tìm thấy từ phù hợp.");

    // Nếu số ô đã chọn vượt quá chiều dài từ dài nhất mà không khớp, reset lựa chọn
    if (selectedCells.length > Math.max(...vocabWords.map(item => item.word.length))) {
      selectedCells.forEach(cell => cell.classList.remove("selected"));
      selectedCells = [];
    }
  }
}

function startTotalTimer() {
  const timeDisplay = document.getElementById("globalTimerBox");
  timeDisplay.textContent = `🕒 Còn lại: ${countdown}s`;

  totalTimer = setInterval(() => {
    countdown--;
    timeDisplay.textContent = `🕒 Còn lại: ${countdown}s`;

    if (countdown <= 0) {
      clearInterval(totalTimer);
      timerExpired = true;
      timeDisplay.textContent = "⏱️ Hết giờ! Bạn vẫn có thể hoàn thành.";
    }
  }, 1000);
}




// Hiển thị danh sách các từ đã chọn và nghĩa của chúng khi chọn đúng
function updateMatchedWordsDisplay() {
  let container = document.getElementById("matchedWordsDisplay");
  if (!container) {
    container = document.createElement("div");
    container.id = "matchedWordsDisplay";
    container.style.marginTop = "10px";
    container.style.fontSize = "16px";
    container.style.color = "#fff";
    container.style.display = "flex";
    container.style.flexWrap = "wrap";
    container.style.gap = "10px";

    let gameBoard = document.getElementById("gameBoard");
    gameBoard.parentNode.insertBefore(container, gameBoard);
  }
  // Hiển thị danh sách từ, tất cả đều in hoa
  container.innerHTML = "<strong>Các từ đã chọn:</strong><br>";
  container.innerHTML += matchedWords
    .map(item => `<span>${item.word.toUpperCase()}: ${item.meaning.toUpperCase()}</span>`)
    .join(" | ");
}

import { showVictoryEffect } from './effect-win.js';
import { showDefeatEffect } from './effect-loose.js';


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


function checkVictory() {
  console.log("Hàm checkVictory đã chạy!");

  const totalWords = vocabWords.length;
  const completedWords = matchedWords.length;
  const percent = completedWords / totalWords;

  console.log("🔍 Tổng số từ cần hoàn thành:", totalWords);
  console.log("🔍 Số từ đã ghép đúng:", completedWords);
  console.log("📊 Tỷ lệ đúng:", (percent * 100).toFixed(2) + "%");
  console.log("⏱️ Trạng thái thời gian:", timerExpired ? "Hết giờ" : "Trong thời gian");

  if (completedWords === totalWords) {
    console.log("✅ Người chơi đã hoàn thành trò chơi!");

    // ✅ Ghi điểm vào localStorage (cộng dồn vào result_game)
    // ✅ Ghi điểm cho Game 2 (ghi đè, giống listening)
    setResultGamePart(2, completedWords, totalWords);


    if (percent >= 0.7 && !timerExpired) {
      console.log("🏆 Gọi hiệu ứng chiến thắng!");
      showVictoryEffect();
    } else {
      console.log("💥 Gọi hiệu ứng thất bại!");
      showDefeatEffect();

      let msg = `🚫 Bạn chưa đạt đủ điều kiện để bắt Pokémon! Hãy hoàn tất ít nhất 70% trong thời gian ${totalTime}s nhé.`;
      let hintBox = document.getElementById("hintDisplay");
      if (hintBox) hintBox.textContent = msg;
      else alert(msg);
    }
  }
}


document.addEventListener("DOMContentLoaded", setupGame);
