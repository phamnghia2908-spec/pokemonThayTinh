// Speaking 3 — built from Speaking 2 flow, with images, hint-on-2-words, and final paragraph reading.
// Notes:
// - Uses column I for presentation sentences, column C for vocab, column B for lesson name.
// - Shows only first two words as hint (e.g., "my name...").
// - Does NOT auto-speak at render; speaks the correct full sentence AFTER scoring.
// - Fetches and displays an image for each sentence via Pixabay; caches by keyword.
// - After all sentences, builds a paragraph of all sentences, plays sample, then lets user read it; scores the long read.
// - Detailed logs included for data extraction, selection, images, and scoring.

// ===== Config =====



// ===== State =====
let sentences = []; // [{ text, target, meaning, lesson, imageUrl }]
let sentenceIndex = 0;
let voice = null;
let totalScore = 0;
let recognition = null;
let isListening = false;

// ===== Image cache =====


// ===== Helpers =====
function normText(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9'\s]/g, "").trim();
}

function firstTwoWordsHint(s) {
  const words = (s || "").trim().split(/\s+/);
  return words.slice(0, 2).join(" ") + (words.length > 2 ? "..." : "");
}

function splitTargets(rawTarget) {
  return (rawTarget || "")
    .toLowerCase()
    .split(/[/;,]/)
    .map(t => t.trim())
    .filter(Boolean);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function speak(text) {
  if (!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.voice = voice;
  speechSynthesis.speak(utter);
}

function getVoices() {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}

async function fetchGVizRows(url) {
  console.log("🔗 Fetching GViz:", url);
  const res = await fetch(url);
  const txt = await res.text();
  try {
    const json = JSON.parse(txt.substring(47).slice(0, -2));
    const rows = json.table?.rows || [];
    console.log("📥 GViz parsed rows:", rows.length);
    return rows;
  } catch (err) {
    console.error("❌ GViz parse error:", err);
    console.log("🧾 Raw head(200):", txt.slice(0, 200));
    throw err;
  }
}

/**
 * Extract presentation data from sheet rows.
 * Columns:
 * - B (index 1): lesson/mã bài (e.g., "3-07-2")
 * - C (index 2): vocab raw (keywords)
 * - I (index 8): presentation sentence
 * - Y (index 24): meaning (if available; same as Speaking 2)
 */
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.split("-");
  if (parts.length < 3) return 0;
  const [cls, lesson, part] = parts;
  return parseInt(cls) * 1000 + parseInt(lesson) * 10 + parseInt(part);
}

async function getMaxLessonCode() {
  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";

  try {
    const res = await fetch(SHEET_BAI_HOC); // Gọi biến từ googleSheetLinks.js
    const rows = await res.json();

    const baiList = rows
      .map(r => {
        const lop = (r[0] || "").toString().trim(); // Cột A
        const bai = (r[2] || "").toString().trim(); // Cột C
        return lop === trainerClass && bai ? parseInt(bai, 10) : null;
      })
      .filter(v => typeof v === "number" && !isNaN(v));

    if (baiList.length === 0) {
      console.warn("⚠️ Không tìm thấy bài học nào cho lớp", trainerClass);
      return null;
    }

    const maxLessonCode = Math.max(...baiList);
    return maxLessonCode;
  } catch (err) {
    console.error("❌ Lỗi lấy maxLessonCode:", err);
    return null;
  }
}


function extractPresentationData(rows, maxLessonCode) {
  const allItems = rows.map((r) => {
    const lessonName = (r[1] || "").toString().trim();      // Cột B
    const vocabRaw   = (r[2] || "").toString().trim();      // Cột C
    const presentation = (r[8] || "").toString().trim();    // Cột I
    const meaning    = (r[24] || "").toString().trim();     // Cột Y
    const targets    = splitTargets(vocabRaw);
    const unitNum    = normalizeUnitId(lessonName);

    return { lessonName, unitNum, vocabRaw, presentation, meaning, targets };
  }).filter(it => it.lessonName && it.presentation);

  const unitMap = {};
  allItems.forEach(it => {
    if (it.unitNum >= 3011 && it.unitNum <= maxLessonCode) {
      if (!unitMap[it.lessonName]) unitMap[it.lessonName] = [];
      unitMap[it.lessonName].push(it);
    }
  });

  const unitNames = Object.keys(unitMap);
  const shuffled = unitNames.sort(() => Math.random() - 0.5);
  const pickedUnits = shuffled.slice(0, 8); // Lấy 8 bài

  const selectedItems = [];
  pickedUnits.forEach(u => {
    const rowsInUnit = unitMap[u];
    const chosen = rowsInUnit[Math.floor(Math.random() * rowsInUnit.length)];
    selectedItems.push(chosen);
  });

  return selectedItems.sort((a, b) => a.unitNum - b.unitNum);
}



// ===== Images: Pixabay fetch + cache =====
// Sửa lại hàm lấy ảnh để dùng ImageCacheManager
async function fetchImageForKeyword(keyword) {
  try {
    // Gọi instance imageCache từ file imagecache2.js
    const result = await imageCache.getImage(keyword);
    return result; // Trả về { url, source, keyword, ... }
  } catch (err) {
    console.error("❌ Lỗi lấy ảnh từ ImageCacheManager:", err);
    return null;
  }
}
function showIntroParagraph() {
  const area = document.getElementById("sentenceArea");
  const fullParagraph = sentences.map(s => s.text).join(". ").replace(/\s+\./g, ".").trim() + ".";
  area.innerHTML = `
    <div style="font-size:20px; margin-bottom:8px;">🧩 Đoạn văn tổng thể (nghe mẫu)</div>
    <div id="paragraphBox" style="margin-bottom:12px; color:#a7b1d0;">${fullParagraph}</div>
    <div style="text-align:center;">
      <button id="playParagraphBtn">🔊 Nghe đoạn</button>
      <button id="startPracticeBtn">Bắt đầu luyện từng câu</button>
    </div>
  `;
  document.getElementById("playParagraphBtn").onclick = () => speak(fullParagraph);
  document.getElementById("startPracticeBtn").onclick = () => startSentence();
}

// ===== Rendering and scoring =====
function renderSentence(autoSpeak = false, target = "", meaning = "") {
  const { text } = sentences[sentenceIndex];

  const area = document.getElementById("sentenceArea");
  const imageBox = document.getElementById("imageBox");

  const hint = firstTwoWordsHint(text);

  area.innerHTML = `
    <div style="font-size:24px; margin-bottom:10px; text-align:center;">
      🔤 <b style="color:#cc3333;">${target}</b>
      <span style="font-size:18px;">${meaning ? `(${meaning})` : ""}</span>
    </div>
    <div style="font-size:28px; font-weight:bold; margin-bottom:18px; text-align:center;">
      ${hint}
    </div>
    <div style="text-align:center;">
      <button id="recordBtn" style="margin:0 8px;">
        <img src="https://cdn-icons-png.flaticon.com/512/361/361998.png" alt="PokéBall" style="width:40px; vertical-align:middle;" />
      </button>
      <button id="nextBtn">⏩ Tiếp theo</button>
    </div>
    <div id="speechResult" style="margin-top:16px; text-align:center;"></div>
  `;

  // Load image (cache -> fetch)
  // Tìm đoạn này trong renderSentence và sửa lại:
  const sentenceObj = sentences[sentenceIndex];
  if (imageBox) {
    imageBox.innerHTML = ""; // Reset box

    if (sentenceObj.target) {
      // Gọi hàm fetch đã sửa ở trên
      fetchImageForKeyword(sentenceObj.target).then(img => {
        if (img && img.url) {
          sentenceObj.imageUrl = img.url;
          imageBox.innerHTML = `
            <div style="position: relative;">
              <img src="${img.url}" alt="${sentenceObj.target}" 
                   style="max-width:60%; width:100%; height:auto; border-radius:8px; margin:6px 0; object-fit:cover; border: 2px solid #eee;" />
              <div style="font-size: 10px; color: #999;">Source: ${img.source || 'Unknown'}</div>
            </div>`;
        }
      });
    }
  }

  document.getElementById("nextBtn").onclick = () => {
    sentenceIndex++;
    if (sentenceIndex < sentences.length) {
      startSentence();
    } else {
      showFinalResult(3);
    }
  };

  // Recognition setup per render (Speaking 2 style)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Thiết bị của bạn không hỗ trợ nhận giọng nói.");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  isListening = false;

  document.getElementById("recordBtn").onclick = () => {
    document.getElementById("speechResult").textContent = "🎙️ Đang nghe...";
    try {
      isListening = true;
      recognition.start();
    } catch (err) {
      console.warn("⚠️ start() failed, trying abort→start:", err);
      try { recognition.abort(); } catch {}
      setTimeout(() => {
        try { isListening = true; recognition.start(); } catch (e2) {
          document.getElementById("speechResult").innerText = "❌ Không thể bắt đầu nhận giọng. Kiểm tra quyền mic/HTTPS.";
        }
      }, 120);
    }
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase().trim();
    console.log("🗣️ Transcript:", transcript);
    checkAccuracy(transcript);
    // Speak the correct sentence AFTER scoring
    const correctSentence = sentences[sentenceIndex].text;
    speak(correctSentence);
  };

  recognition.onerror = (event) => {
    isListening = false;
    document.getElementById("speechResult").innerText = `❌ Lỗi: ${event.error}`;
    console.error("❌ Recognition error:", event.error);
  };

  recognition.onend = () => { isListening = false; };
}

function checkAccuracy(userText) {
  const currentSentence = sentences[sentenceIndex].text.toLowerCase().replace(/[^a-z0-9'\s]/g, "");
  const user = userText.toLowerCase().replace(/[^a-z0-9'\s]/g, "");
  const targetWords = currentSentence.split(/\s+/).filter(Boolean);
  const userWordsSet = new Set(user.split(/\s+/).filter(Boolean));

  let correct = 0;
  for (let word of targetWords) {
    if (userWordsSet.has(word)) correct++;
  }

  const percent = targetWords.length ? Math.round((correct / targetWords.length) * 100) : 0;
  if (percent >= 50) totalScore++;

  const result = document.getElementById("speechResult");
  result.innerHTML = `✅ Bạn nói: "<i>${userText}</i>"<br>🎯 Đúng ${correct}/${targetWords.length} từ → <b>${percent}%</b>`;
  console.log("🧮 Sentence scoring:", { index: sentenceIndex, percent, correct, total: targetWords.length, totalScore });
}

// ===== Final stage: show result, then paragraph reading =====
import { showVictoryEffect } from './effect-win.js';
import { showDefeatEffect } from './effect-loose.js';

function showFinalResult(mode) {
  const area = document.getElementById("sentenceArea");
  const percent = sentences.length > 0
    ? Math.round((totalScore / sentences.length) * 100)
    : 0;

  // ✅ Ghi điểm vào localStorage theo dạng part (1,2,3)
  setResultSpeakingPart(mode, totalScore, sentences.length);

  // ✅ Hiển thị kết quả UI
  area.innerHTML = `
    <div style="font-size:24px;">🏁 Bạn đã luyện hết toàn bộ câu!</div>
    <div style="margin-top:16px;">
      📊 Tổng điểm: <b>${totalScore}/${sentences.length}</b> → <b>${percent}%</b>
    </div>
    <hr style="margin:16px 0; opacity:.35;">
    <div style="font-size:20px; margin-bottom:8px;">🧩 Bước cuối: Đọc cả đoạn văn</div>
    <div id="paragraphBox" style="margin-bottom:12px; color:#a7b1d0;"></div>
    <div style="text-align:center;">
      <button id="playParagraphBtn">🔊 Nghe mẫu đoạn</button>
      <button id="recordParagraphBtn" style="margin-left:8px;">🎙️ Đọc cả đoạn</button>
    </div>
    <div id="paragraphResult" style="margin-top:12px; text-align:center;"></div>
  `;

  // Build the paragraph
  const fullParagraph = sentences.map(s => s.text).join(". ").replace(/\s+\./g, ".").trim() + ".";
  document.getElementById("paragraphBox").textContent = fullParagraph;

  // Play sample
  document.getElementById("playParagraphBtn").onclick = () => speak(fullParagraph);

  // Record entire paragraph
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById("paragraphResult").textContent = "⚠️ Thiết bị không hỗ trợ thu âm đoạn dài.";
    return;
  }

  const longRec = new SpeechRecognition();
  longRec.lang = "en-US";
  longRec.interimResults = false;
  longRec.maxAlternatives = 1;

  document.getElementById("recordParagraphBtn").onclick = () => {
    document.getElementById("paragraphResult").textContent = "🎙️ Đang nghe đoạn...";
    try {
      longRec.start();
    } catch (err) {
      try { longRec.abort(); } catch {}
      setTimeout(() => {
        try { longRec.start(); } catch (e2) {
          document.getElementById("paragraphResult").textContent = "❌ Không thể bắt đầu thu đoạn. Kiểm tra mic/HTTPS.";
        }
      }, 120);
    }
  };

  // Sửa lại đoạn tính điểm trong showFinalResult
  longRec.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      const targetWords = normText(fullParagraph).split(/\s+/).filter(Boolean);
      const userWordsSet = new Set(normText(transcript).split(/\s+/).filter(Boolean));

      let correct = 0;
      for (let word of targetWords) if (userWordsSet.has(word)) correct++;
      const percentPara = targetWords.length ? Math.round((correct / targetWords.length) * 100) : 0;

      // Tính điểm Bonus dựa trên % độ chính xác của cả đoạn
      let paragraphBonus = 0; 
      if (percentPara >= 80) paragraphBonus = 10;
      else if (percentPara >= 50) paragraphBonus = 5;

      const grandScore = totalScore + paragraphBonus; 
      const grandTotal = sentences.length + 10; // Giả định đoạn văn đáng giá 10 điểm
      const percentTotal = Math.round((grandScore / grandTotal) * 100);

      setResultSpeakingPart(3, grandScore, grandTotal);

      const resEl = document.getElementById("paragraphResult");
      resEl.innerHTML = `
          📣 Bạn đọc: "<i>${transcript}</i>"<br>
          🎯 Khớp ${correct}/${targetWords.length} từ → <b>${percentPara}%</b><br>
          🧮 Điểm thưởng đoạn văn: <b>+${paragraphBonus}</b><br>
          📊 Tổng điểm cuối cùng: <b>${grandScore}/${grandTotal}</b> → <b>${percentTotal}%</b>
      `;

      if (percentTotal >= 50) {
          resEl.innerHTML += `<div style="margin-top:10px;">🎉 Chuẩn Legendary! Bạn đã bắt được Pokémon!</div>`;
          showVictoryEffect(area);
      } else {
          resEl.innerHTML += `<div style="margin-top:10px;">🚫 Bạn đã thua! Hãy luyện thêm để đạt tối thiểu 50%.</div>`;
          showDefeatEffect(area);
      }
  };
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


// ===== Flow control =====
function startSentence() {
  const { text, target, meaning } = sentences[sentenceIndex];
  renderSentence(false, target, meaning);
}

// ===== Init =====
getVoices().then(async (v) => {
  // 1. Thiết lập giọng đọc chuẩn David (hoặc giọng EN-US đầu tiên tìm thấy)
  voice = v.find(v => v.lang === "en-US" && v.name.includes("David")) || v.find(v => v.lang === "en-US") || v[0];

  try {
    // 2. Lấy mã bài học lớn nhất (maxLessonCode)
    const maxLessonCode = await getMaxLessonCode();
    if (!maxLessonCode) {
      document.getElementById("sentenceArea").innerHTML = "⚠️ Không xác định được bài học (Kiểm tra trainerClass trong LocalStorage).";
      return;
    }

    // 3. Fetch dữ liệu từ SHEET_URL
    const res = await fetch(SHEET_URL);
    if (!res.ok) throw new Error("Không thể kết nối với Script Exec.");
    const data = await res.json();

    // ✅ SỬA LỖI EXEC: Link Exec thường trả về { data: [...] } hoặc mảng trực tiếp
    const rows = data.data || data;

    // 4. Lọc và ánh xạ dữ liệu vào mảng sentences
    // Đảm bảo extractPresentationData của ông xử lý được cả Object và Array
    const items = extractPresentationData(rows, maxLessonCode);

    sentences = items.map(it => ({
      text: it.presentation,
      target: it.targets[0] || "",
      meaning: it.meaning || "",
      lesson: it.lessonName,
      imageUrl: ""
    }));

    sentenceIndex = 0;
    totalScore = 0;

    // 5. Xử lý PREFETCH ảnh an toàn (Sửa lỗi TypeError)
    if (sentences.length > 0) {
      const targetWords = sentences.map(s => s.target).filter(Boolean);
      console.log("🚀 Đang nạp ảnh cho:", targetWords);

      try {
        // Kiểm tra xem hàm prefetchImages có tồn tại không
        if (typeof imageCache.prefetchImages === 'function') {
          await imageCache.prefetchImages(targetWords, {
            onProgress: (current, total) => console.log(`🖼️ Đang tải ảnh: ${current}/${total}`)
          });
        } else {
          // 🛡️ Cách dự phòng: Nếu không có hàm prefetch, tự nạp từng ảnh vào cache qua getImage
          console.warn("⚠️ imageCache.prefetchImages không tồn tại, đang nạp thủ công...");
          await Promise.all(targetWords.map(word => imageCache.getImage(word).catch(() => null)));
        }
      } catch (imgErr) {
        console.error("⚠️ Lỗi nạp ảnh (không ảnh hưởng đến bài học):", imgErr);
      }

      // 6. Hiển thị giao diện bắt đầu
      showIntroParagraph();
    } else {
      document.getElementById("sentenceArea").innerHTML = `
        <div style="font-size:18px; padding:20px; text-align:center; color:#ffcc00;">
          📭 Không tìm thấy câu thuyết trình phù hợp cho bài học này.
        </div>`;
    }
  } catch (err) {
    console.error("❌ Lỗi khởi tạo Speaking 3:", err);
    document.getElementById("sentenceArea").innerHTML = `
      <div style="color:#ff4444; padding:20px; text-align:center;">
        ❌ Lỗi kết nối dữ liệu Exec.<br>
        <small style="color:#888;">Hãy kiểm tra lại quyền truy cập hoặc link SHEET_URL của ông.</small>
      </div>`;
  }
});