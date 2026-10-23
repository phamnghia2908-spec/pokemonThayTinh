import { showCatchEffect } from './pokeball-effect.js';
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}


const SHEET_URL = "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";

let listeningData = [];
let currentIndex = 0;
let score = 0;
let voiceMale = null;
let voiceFemale = null;
let inPhaseTwo = false;

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
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.voice = voice;
  speechSynthesis.speak(utter);
}

async function fetchListeningData() {
  const res = await fetch(SHEET_URL);
  const txt = await res.text();
  const json = JSON.parse(txt.substring(47).slice(0, -2));
  const rows = json.table.rows;

  const wordBank = JSON.parse(localStorage.getItem("wordBank")) || [];
  const uniqueWords = [...new Set(wordBank)];

  const parsed = rows.map(row => {
    const rawQuestion = row.c[9]?.v?.trim() || "";
    const rawAnswer = row.c[11]?.v?.trim() || "";
    const target = row.c[2]?.v?.trim() || "";
    const question = cleanText(rawQuestion);
    const answer = cleanText(rawAnswer);
    return { question, answer, target };
  }).filter(item =>
    item.question && item.answer &&
    uniqueWords.includes(item.target)
  );

  return parsed;
}

function updateScoreBoard() {
  const offset = inPhaseTwo ? listeningData.length : 0;
  document.getElementById("scoreBoard").textContent = `🎯 Điểm: ${score}/${currentIndex + offset}`;
}

function nextListening1() {
  const item = listeningData[currentIndex];
  const question = item.question;
  const answer = item.answer;

  let displayQuestion = "";
  let displayAnswer = "";
  let correct = "";

  if (!inPhaseTwo) {
    const regex = new RegExp(`\\b${item.target}\\b`, "gi");
    displayQuestion = question.replace(regex, "___");
    displayAnswer = answer.replace(regex, "___");
    correct = item.target;
  } else {
    const allWords = [...question.split(" "), ...answer.split(" ")].filter(w => w.length > 2);
    const randWord = allWords[Math.floor(Math.random() * allWords.length)];
    const regex = new RegExp(`\\b${randWord}\\b`, "gi");
    displayQuestion = question.replace(regex, "___");
    displayAnswer = answer.replace(regex, "___");
    correct = randWord;
  }

  document.getElementById("exerciseArea").innerHTML = `
    <div class="dialogue-text">
      <div class="line" style="font-size:24px; margin-bottom:12px;">🗣 ${displayQuestion}</div>
      <div class="line" style="font-size:24px;">🗣 ${displayAnswer}</div>
    </div>
  `;

  document.getElementById("inputWord").value = "";
  document.getElementById("resultBox").textContent = "";

  // 🔊 Tự đọc ngay khi vào câu
  speak(question, voiceMale);
  setTimeout(() => speak(answer, voiceFemale), 1200);

  document.getElementById("playBtn").onclick = () => {
    speak(question, voiceMale);
    setTimeout(() => speak(answer, voiceFemale), 1200);
  };

  document.getElementById("submitBtn").onclick = () => {
    const input = document.getElementById("inputWord").value;
    const resultBox = document.getElementById("resultBox");

    if (normalize(input) === normalize(correct)) {
      score++;
      resultBox.textContent = "✅ Chính xác!";
    } else {
      resultBox.textContent = `❌ Sai rồi. Đáp án là: ${correct}`;
    }

    speak(correct, voiceFemale);
    currentIndex++;
    updateScoreBoard();

    setTimeout(() => {
      if (!inPhaseTwo && currentIndex >= listeningData.length) {
        inPhaseTwo = true;
        currentIndex = 0;
      }

      if (inPhaseTwo && currentIndex >= listeningData.length) {
        showSummary();
      } else {
        nextListening1();
      }
    }, 1800);
  };
}

function showSummary() {
  const total = listeningData.length * 2;
  const passed = score >= Math.ceil(total / 2);
  const area = document.getElementById("exerciseArea");

  // ✅ Ghi điểm vào localStorage
  localStorage.setItem("result_listening", JSON.stringify({
    score: score,
    total: total
  }));

  let html = `
    <div class="dialogue-text">
      🏁 Bạn đã luyện xong ${total} câu
      <br>✅ Trả lời đúng ${score} câu!
  `;

  if (passed) {
    html += `<br>🎉 Chuẩn Legendary! Bạn đã bắt được Pokémon!`;
    area.innerHTML = html + `</div>`;
    showCatchEffect(area);
  } else {
    html += `<br>🚫 Bạn chưa bắt được Pokémon nào! Hãy luyện thêm để đạt tối thiểu 50%.`;
    area.innerHTML = html + `</div>`;
  }

  document.getElementById("resultBox").textContent = "";
}


function startListeningMode1() {
  currentIndex = 0;
  score = 0;
  inPhaseTwo = false;
  updateScoreBoard();
  nextListening1();
}

getVoices().then(voices => {
  voiceMale = voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("david")) ||
              voices.find(v => v.lang === "en-US");

  voiceFemale = voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("zira")) ||
                voices.find(v => v.lang === "en-US");

  fetchListeningData().then(res => {
    listeningData = res;

    shuffleArray(listeningData); // ✅ Thêm dòng này để xáo dữ liệu Phase 1

    if (listeningData.length) {
      startListeningMode1();
    } else {
      document.getElementById("exerciseArea").innerHTML = "📭 Không tìm thấy dữ liệu từ vựng đã học.";
    }
  });
});
