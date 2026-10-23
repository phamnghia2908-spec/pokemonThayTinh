



let sentences = [];
let sentenceIndex = 0;
let voice = null;
let totalScore = 0;

function renderSentence(autoSpeak = true, target = "", meaning = "") {
  const { text } = sentences[sentenceIndex];
  const area = document.getElementById("sentenceArea");
  area.innerHTML = `
    <div style="font-size:24px; margin-bottom:10px; text-align:center;">
      🔤 <b style="color:#cc3333;">${target}</b>
      <span style="font-size:18px;">(${meaning})</span>
    </div>
    <div style="font-size:28px; font-weight:bold; margin-bottom:18px; text-align:center;">
      ${text}
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

  document.getElementById("playBtn").onclick = () => speak(text);
  document.getElementById("nextBtn").onclick = () => {
    sentenceIndex++;
    if (sentenceIndex < sentences.length) {
      startSentence();
    } else {
      showFinalResult(2);
    }
  };

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Thiết bị của bạn không hỗ trợ nhận giọng nói.");
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

  if (autoSpeak) speak(text);
}

function checkAccuracy(userText) {
  const currentSentence = sentences[sentenceIndex].text.toLowerCase().replace(/[^a-z0-9'\s]/g, "");
  const user = userText.toLowerCase().replace(/[^a-z0-9'\s]/g, "");
  const targetWords = currentSentence.split(/\s+/);
  const userWords = user.split(/\s+/);

  let correct = 0;
  for (let word of targetWords) {
    if (userWords.includes(word)) correct++;
  }

  const percent = Math.round((correct / targetWords.length) * 100);
  if (percent >= 50) totalScore++;

  const result = document.getElementById("speechResult");
  result.innerHTML = `✅ Bạn nói: "<i>${userText}</i>"<br>🎯 Đúng ${correct}/${targetWords.length} từ → <b>${percent}%</b>`;
  // Không gọi hiệu ứng ở đây — chỉ gọi khi kết thúc toàn bộ
}

import { showVictoryEffect } from './effect-win.js';
import { showDefeatEffect } from './effect-loose.js';
function showFinalResult() {
  const area = document.getElementById("sentenceArea");
  const percent = sentences.length > 0
    ? Math.round((totalScore / sentences.length) * 100)
    : 0;

  // ✅ Ghi điểm vào localStorage theo dạng part 2
  setResultSpeakingPart(2, totalScore, sentences.length);

  // ✅ Hiển thị kết quả UI
  area.innerHTML = `
    <div style="font-size:24px;">🏁 Bạn đã luyện hết toàn bộ nội dung!</div>
    <div style="margin-top:16px;">
      📊 Tổng điểm: <b>${totalScore}/${sentences.length}</b> → <b>${percent}%</b>
    </div>
  `;

  if (percent >= 50) {
    area.innerHTML += `<br>🎉 Chuẩn Legendary! Bạn đã bắt được Pokémon!`;
    showVictoryEffect(area);
  } else {
    area.innerHTML += `<br>🚫 Bạn chưa bắt được Pokémon nào! Hãy luyện thêm để đạt tối thiểu 50%.`;
    showDefeatEffect(area);
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


function speak(text) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.voice = voice;
  speechSynthesis.speak(utter);
}

function startSentence() {
  const { text, target, meaning } = sentences[sentenceIndex];
  renderSentence(true, target, meaning);
}

function getVoices() {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}
// Thêm hàm này vào để hết lỗi "normalizeUnitId is not defined"
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.split("-");
  if (parts.length < 3) return 0;
  // Chuyển "30-1-1" thành 30011 để so sánh số lớn/nhỏ
  return parseInt(parts[0], 10) * 1000 + parseInt(parts[1], 10) * 10 + parseInt(parts[2], 10);
}
// ✅ THAY THẾ TOÀN BỘ ĐOẠN CUỐI FILE (getVoices)
getVoices().then(async (v) => {
  // 1. Thiết lập giọng đọc
  voice = v.find(v => v.lang === "en-US" && v.name.includes("David")) || v.find(v => v.lang === "en-US") || v[0];
  const wordBank = JSON.parse(localStorage.getItem("wordBank"))?.map(w => w.toLowerCase().trim()) || [];

  try {
    // 2. Lấy maxLessonCode từ SHEET_BAI_HOC để giới hạn phạm vi học
    const resBai = await fetch(SHEET_BAI_HOC);
    const rowsBai = await resBai.json();
    const baiList = rowsBai.map(r => {
      const code = (r[2] || "").toString().trim(); // Cột C
      return code ? parseInt(code, 10) : null;
    }).filter(val => val !== null && !isNaN(val));
    const maxLessonCode = baiList.length === 0 ? 0 : Math.max(...baiList);

    // 3. Fetch dữ liệu bài học từ SHEET_URL (Định dạng Exec - mảng 2 chiều)
    const res = await fetch(SHEET_URL);
    const rows = await res.json(); 

    sentences = [];
    for (const r of rows) {
      // Mapping index: B=1 (Lesson), C=2 (Target), J=9 (Q), L=11 (A), Y=24 (Meaning)
      const lessonName = (r[1] || "").toString().trim();
      const rawTarget  = (r[2] || "").toString().trim().toLowerCase();
      const rawMeaning = (r[24] || "").toString().trim();
      const q = (r[9] || "").toString().trim();
      const a = (r[11] || "").toString().trim();

      const unitNum = normalizeUnitId(lessonName);
      const targets = rawTarget.split(/[/;,]/).map(t => t.trim());

      // Điều kiện: Từ nằm trong WordBank VÀ thuộc phạm vi bài đã học (>= 3011)
      const isLearned = targets.some(t => wordBank.includes(t));
      const isWithinLesson = unitNum >= 3011 && unitNum <= maxLessonCode;

      if (isLearned && isWithinLesson) {
        const targetWord = targets.find(t => wordBank.includes(t)) || rawTarget;
        if (q) sentences.push({ text: q, target: targetWord, meaning: rawMeaning });
        if (a) sentences.push({ text: a, target: targetWord, meaning: rawMeaning });
      }
    }

    // 4. Reset trạng thái và bắt đầu luyện tập
    totalScore = 0;
    sentenceIndex = 0;

    if (sentences.length > 0) {
      startSentence();
    } else {
      document.getElementById("sentenceArea").innerHTML = `
        <div style="font-size:20px; padding:30px; text-align:center;">
          📭 Không tìm thấy câu nào phù hợp với từ vựng đã học trong phạm vi bài học.
        </div>`;
    }
  } catch (err) {
    console.error("❌ Lỗi tải dữ liệu Speaking Part 2:", err);
    document.getElementById("sentenceArea").innerHTML = "❌ Lỗi kết nối dữ liệu Exec.";
  }
});
