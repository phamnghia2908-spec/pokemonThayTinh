

let sentences = [];
let collocationBank = [];
let sentenceIndex = 0;
let chunkIndex = 0;
let currentChunks = [];
let voice = null;
let totalScore = 0;
let totalChunks = 0;

function chunkSentence(sentence) {
  const doc = nlp(sentence);
  const terms = doc.terms().json();
  const result = [];

  let i = 0;
  while (i < terms.length) {
    const tags = terms[i].terms[0]?.tags || [];
    const word = terms[i].text;

    const wordLower = word.toLowerCase();
    const isStarter = (
      (tags.includes('Verb') &&
       !['be', 'am', 'is', 'are', 'was', 'were'].includes(wordLower))
      || tags.includes('Preposition')
      || tags.includes('Determiner')
      || tags.includes('Possessive')
    );


    if (isStarter) {
      const chunk = [word];
      i++;

      while (i < terms.length) {
        const nextTags = terms[i].terms[0]?.tags || [];
        const nextWord = terms[i].text;

        const isConnector = nextTags.includes('Adjective') ||
                            nextTags.includes('Determiner') ||
                            nextTags.includes('Possessive');

        const isEnder = nextTags.includes('Noun');

        if (isConnector || isEnder) {
          chunk.push(nextWord);
          i++;

          // 🔁 Nếu là Noun → tiếp tục vòng để gom thêm Noun liên tiếp
          if (isEnder) continue;

          continue;
        }

        break;
      }


      result.push(chunk.join(" "));
    } else {
      result.push(word);
      i++;
    }
  }

  const layered = [];
  for (let j = 1; j <= result.length; j++) {
    layered.push(result.slice(0, j).join(" "));
  }
  return layered;
}


// ✅ Test ngay câu glow
console.log("🧪 Test:", chunkSentence("Eat healthy food at home."));
function renderChunk(autoSpeak = true, target = "", meaning = "") {
  const phrase = currentChunks[chunkIndex];
  const area = document.getElementById("speakingArea");
  area.innerHTML = `
    <div style="font-size:24px; margin-bottom:10px; text-align:center;">
      🔤 <b style="color:#cc3333;">${target}</b> <span style="font-size:18px;">(${meaning})</span>
    </div>
    <div style="font-size:30px; font-weight:bold; margin-bottom:18px; text-align:center;">
      ${phrase}
    </div>
    <div style="text-align:center;">
      <button id="playBtn">🔊 Nghe lại</button>
      <button id="recordBtn" style="margin:0 8px;">
        <img src="https://cdn-icons-png.flaticon.com/512/361/361998.png" alt="PokéBall" style="width:40px; vertical-align:middle;" />
      </button>
      <button id="nextBtn">⏩ Tiếp theo</button>
    </div>
    <div id="speechResult" style="margin-top:16px; text-align:center;"></div>
  `;


  document.getElementById("playBtn").onclick = () => speak(phrase);
  document.getElementById("nextBtn").onclick = () => {
    chunkIndex++;
    if (chunkIndex < currentChunks.length) {
      renderChunk(true, target, meaning);
    } else {
      sentenceIndex++;
      if (sentenceIndex < sentences.length) {
        startSentence();
      } else {
        showFinalResult(1);
      }
    }
  };

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Thiết bị của bạn không hỗ trợ nhận giọng nói trực tiếp.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  document.getElementById("recordBtn").onclick = () => {
    document.getElementById("speechResult").textContent = "🎙️ Đang nghe...";
    recognition.start();
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase().trim();
    checkAccuracy(transcript);
  };

  recognition.onerror = (event) => {
    document.getElementById("speechResult").innerText = `❌ Lỗi: ${event.error}`;
  };

  if (autoSpeak) speak(phrase);
}

import { showVictoryEffect } from './effect-win.js';
import { showDefeatEffect } from './effect-loose.js';

function showFinalResult(mode) {
  const area = document.getElementById("speakingArea");
  area.innerHTML = `<div style="font-size:24px;">🏁 Bạn đã luyện hết toàn bộ nội dung!</div>`;

  const percent = totalChunks > 0
    ? Math.round((totalScore / totalChunks) * 100)
    : 0;

  // ✅ Ghi điểm vào localStorage theo dạng part (1,2,3)
  setResultSpeakingPart(mode, totalScore, totalChunks);

  // ✅ Hiển thị kết quả
  area.innerHTML += `
    <div style="margin-top:16px;">
      📊 Tổng điểm: <b>${totalScore}/${totalChunks}</b> → <b>${percent}%</b>
    </div>
  `;

  if (percent >= 50) {
    area.innerHTML += `<br>🎉 Chuẩn Legendary! Bạn đã bắt được Pokémon!`;
    showVictoryEffect(area); // hiệu ứng thắng
  } else {
    area.innerHTML += `<br>🚫 Bạn chưa bắt được Pokémon nào! Hãy luyện thêm để đạt tối thiểu 50%.`;
    showDefeatEffect(area); // hiệu ứng thua
  }
}

function setResultSpeakingPart(mode, score, total) {
  const raw = localStorage.getItem("result_speaking");
  const prev = raw ? JSON.parse(raw) : {};

  const updated = {
    score1: mode === 1 ? score : prev.score1 || 0,
    score2: mode === 2 ? score : prev.score2 || 0,
    score3: mode === 3 ? score : prev.score3 || 0,
    total1: mode === 1 ? total : prev.total1 || 0,
    total2: mode === 2 ? total : prev.total2 || 0,
    total3: mode === 3 ? total : prev.total3 || 0
  };

  const totalScore = (updated.score1 || 0) + (updated.score2 || 0) + (updated.score3 || 0);
  const totalMax   = (updated.total1 || 0) + (updated.total2 || 0) + (updated.total3 || 0);

  localStorage.setItem("result_speaking", JSON.stringify({
    ...updated,
    score: totalScore,
    total: totalMax
  }));
}



function startSentence() {
  const { text, target, meaning } = sentences[sentenceIndex];
  currentChunks = chunkSentence(text);
  chunkIndex = 0;
  renderChunk(true, target, meaning);
}

function speak(text) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.voice = voice;
  speechSynthesis.speak(utter);
}

function checkAccuracy(userText) {
  const currentPhrase = currentChunks[chunkIndex].toLowerCase().replace(/[^a-z0-9'\s]/g, "");
  const userWords = userText.toLowerCase().replace(/[^a-z0-9'\s]/g, "").split(/\s+/);
  const targetWords = currentPhrase.split(/\s+/);
  let correct = 0;
  for (let word of targetWords) {
    if (userWords.includes(word)) correct++;
  }
  const percent = Math.round((correct / targetWords.length) * 100);
  if (percent >= 50) totalScore++;
  totalChunks++;

  const result = document.getElementById("speechResult");
  result.innerHTML = `✅ Bạn nói: "<i>${userText}</i>"<br>🎯 Đúng ${correct}/${targetWords.length} từ → <b>${percent}%</b>`;
}

function getVoices() {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.split("-");
  if (parts.length < 3) return 0;
  // Chuyển "30-1-1" thành 30011 để so sánh số lớn/nhỏ
  return parseInt(parts[0], 10) * 1000 + parseInt(parts[1], 10) * 10 + parseInt(parts[2], 10);
}
// Thay thế toàn bộ đoạn getVoices().then ở cuối file bằng đoạn này
// Thay thế toàn bộ đoạn getVoices().then ở cuối file bằng đoạn này để sửa lỗi Fetch
getVoices().then(async (v) => {
  voice = v.find(v => v.lang === "en-US" && v.name.includes("David")) || v.find(v => v.lang === "en-US") || v[0];

  const wordBankRaw = localStorage.getItem("wordBank");
  const wordBank = wordBankRaw ? JSON.parse(wordBankRaw).map(w => w.toLowerCase().trim()) : [];

  try {
    // 1. Lấy mã bài học lớn nhất để lọc
    const resBaiHoc = await fetch(window.SHEET_BAI_HOC);
    const dataBaiHoc = await resBaiHoc.json();
    // Xử lý nếu dataBaiHoc là Object {data: []}
    const rowsBaiHoc = dataBaiHoc.data || dataBaiHoc; 

    const baiList = rowsBaiHoc.map(r => {
        const col = Object.values(r);
        return col[2] ? parseInt(col[2], 10) : null;
    }).filter(v => !isNaN(v));
    const maxLessonCode = baiList.length === 0 ? 0 : Math.max(...baiList);

    // 2. Lấy dữ liệu từ SHEET_URL (Dạng Exec)
    const res = await fetch(window.SHEET_URL);
    if (!res.ok) throw new Error("Network response was not ok");
    const data = await res.json();

    // QUAN TRỌNG: Link Exec thường trả về { data: [...] }
    const rows = data.data || data;

    collocationBank = [];
    sentences = [];

    rows.forEach((r) => {
      // Chuyển Object hàng thành Array để truy cập theo Index như cũ
      const col = Object.values(r);

      const lessonName = (col[1] || "").toString().trim(); // Cột B
      const rawTarget = (col[2] || "").toString().trim().toLowerCase(); // Cột C
      const rawMeaning = (col[24] || "").toString().trim(); // Cột Y
      const q = (col[9] || "").toString().trim(); // Cột J
      const a = (col[11] || "").toString().trim(); // Cột L

      // Hàm hỗ trợ lọc Unit ID (Đảm bảo ông đã có hàm normalizeUnitId trong file hoặc global)
      const unitNum = typeof normalizeUnitId === 'function' ? normalizeUnitId(lessonName) : parseInt(lessonName.replace(/\D/g, ""));
      const targets = rawTarget.split(/[/;,]/).map(t => t.trim());

      // Lọc collocation
      if (rawTarget.includes(" ")) {
        collocationBank.push(...targets.filter(x => x.includes(" ")));
      }

      // Lọc câu theo WordBank và mã bài học
      const isLearned = targets.some(t => wordBank.includes(t));
      const isWithinLesson = unitNum >= 3011 && unitNum <= maxLessonCode;

      if (isLearned && isWithinLesson) {
        const targetWord = targets.find(t => wordBank.includes(t)) || rawTarget;
        if (q) sentences.push({ text: q, target: targetWord, meaning: rawMeaning });
        if (a) sentences.push({ text: a, target: targetWord, meaning: rawMeaning });
      }
    });

    // 3. Khởi tạo trạng thái ban đầu
    totalScore = 0;
    totalChunks = 0;
    sentenceIndex = 0;

    if (sentences.length > 0) {
      startSentence();
    } else {
      document.getElementById("speakingArea").innerHTML = `<div style="font-size:20px; padding:20px; text-align:center;">📭 Không tìm thấy câu nào phù hợp với từ vựng đã học trong phạm vi bài học.</div>`;
    }
  } catch (err) {
    console.error("Lỗi fetch dữ liệu:", err);
    document.getElementById("speakingArea").innerHTML = "❌ Lỗi kết nối dữ liệu Exec (Vui lòng kiểm tra SHEET_URL và Internet).";
  }
});