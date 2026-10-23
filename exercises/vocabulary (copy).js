import { showVictoryEffect } from "./effect-win.js";
import { prefetchImagesBatch, getImageFromMap } from "./imageCache.js";



const wordBank = JSON.parse(localStorage.getItem("wordBank")) || [];

let currentIndex = 0;
let roundCount = 0;
let hasCaught = false;
let vocabVoice = null;
let vocabData = [];

let listenCount = 0;
const REQUIRED_LISTENS = 1;

// ===== Voice =====
function getVocabVoice() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}
getVocabVoice().then((voices) => {
  vocabVoice =
    voices.find((v) => v.lang === "en-US" && v.name?.toLowerCase().includes("zira")) ||
    voices.find((v) => v.lang === "en-US") ||
    null;
});

// ===== Fetch vocab data =====
// ===== Fetch vocab data từ link Exec =====
async function fetchVocabularyData() {
  try {
    // Gọi trực tiếp từ window.SHEET_URL (đã khai báo trong googleSheetLinks.js)
    const response = await fetch(window.SHEET_URL);
    const data = await response.json();

    // Lấy mảng dữ liệu (hỗ trợ cả cấu trúc {data: []} hoặc [])
    const rows = data.data || data;

    const allWords = rows.map((r) => {
      // Biến Object thành Array để lấy theo Index cột giống hệt bản cũ
      const col = Object.values(r); 
      const getVal = (idx) => (col[idx] || "").toString().trim();

      return {
        word: getVal(2),          // Cột C
        meaning: getVal(24),       // Cột Y
        extraNote: getVal(30),     // Cột AE
        noteAH: getVal(33),        // Cột AH
        noteAI: getVal(34),        // Cột AI
        syllables: getVal(42),     // Cột AQ
        imageKeyword: getVal(47)   // Cột AV
      };
    });

    // Lọc theo wordBank của người dùng
    const filtered = allWords.filter((item) => wordBank.includes(item.word));

    // Loại bỏ trùng lặp nếu có
    const uniqueByWord = [];
    const seen = new Set();
    for (let item of filtered) {
      const key = item.word.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueByWord.push(item);
      }
    }
    return uniqueByWord;
  } catch (error) {
    console.error("❌ Lỗi Fetch từ Exec:", error);
    return [];
  }
}

// ===== Build image keywords =====
function buildImageKeywords(data) {
  const set = new Set();
  for (const item of data) {
    // Chỉ giữ lại imageKeyword và word để hiện ảnh chính ở trên đầu
    [item.imageKeyword, item.word].forEach((k) => {
      if (k) set.add(k.toLowerCase().trim());
    });
  }
  return Array.from(set);
}

// ===== Phonetic =====
async function getPhonetic(phrase) {
  if (!phrase) return "";

  // Tách cụm từ thành các từ đơn (ví dụ: "look after" -> ["look", "after"])
  const words = phrase.trim().split(/\s+/);

  // Hàm con để tra cứu 1 từ đơn lẻ
  const fetchSinglePhonetic = async (word) => {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
      if (!res.ok) return ""; // Nếu từ điển không có từ này, trả về rỗng
      const data = await res.json();
      // Lấy phiên âm đầu tiên tìm thấy
      return data?.[0]?.phonetic || data?.[0]?.phonetics?.find(p => p.text)?.text || "";
    } catch {
      return "";
    }
  };

  // Tra cứu tất cả các từ trong cụm cùng một lúc
  const phoneticResults = await Promise.all(words.map(fetchSinglePhonetic));

  // Ghép các phiên âm lại với nhau, ngăn cách bởi khoảng trắng
  // Loại bỏ các phần rỗng nếu từ điển không trả về kết quả cho từ đó
  return phoneticResults.filter(p => p !== "").join(" ");
}

// ===== Hiển thị từ =====
// Hàm hỗ trợ đọc chậm từng từ đơn
// Hàm đọc chậm 0.5 cho từng từ khi click trực tiếp
function speakSingleWord(text) {
  if (!text) return;

  // Dừng các âm thanh đang phát để tránh bị đọc đè
  window.speechSynthesis.cancel(); 

  const utter = new SpeechSynthesisUtterance(text);

  // Thiết lập giọng đọc (Ưu tiên giọng Zira hoặc tiếng Anh mặc định)
  utter.voice = vocabVoice || speechSynthesis.getVoices().find(v => v.lang === 'en-US');

  // TỐC ĐỘ: 0.5 (Rất chậm để học sinh nghe rõ từng âm tiết)
  utter.rate = 0.2; 
  utter.pitch = 1.0; 

  window.speechSynthesis.speak(utter);
}

// --- HÀM CHÍNH ---
async function displayWord(wordObj) {
  if (!wordObj) return;

  // 1. Biến khu vực hiển thị từ vựng thành khu vực tương tác (Interactive Area)
  const wordArea = document.getElementById("vocabWord");
  const words = wordObj.word.split(" "); // Tách "AM GOING TO" -> ["AM", "GOING", "TO"]

  wordArea.innerHTML = ""; // Xóa nội dung cũ

  words.forEach(w => {
    const span = document.createElement("span");
    span.textContent = w.toUpperCase();

    // CSS trực tiếp để biến thành "nút" bấm
    span.style.cursor = "pointer";
    span.style.display = "inline-block";
    span.style.marginRight = "12px"; // Khoảng cách giữa các từ
    span.style.transition = "all 0.2s ease";
    // 2. CHÈN THÊM 2 DÒNG NÀY Ở ĐÂY:
    span.style.userSelect = "none";       // Chặn bôi đen (Chrome, Firefox, Edge)
    span.style.webkitUserSelect = "none";

    // Hiệu ứng khi di chuột vào (đổi sang màu đỏ Pokemon để biết là bấm được)
    span.onmouseover = () => {
      span.style.color = "#f44336"; 
      span.style.transform = "scale(1.1)"; // Phóng to nhẹ
    };
    span.onmouseout = () => {
      span.style.color = ""; 
      span.style.transform = "scale(1)";
    };

    // Sự kiện CLICK: Đọc đúng từ được bấm với tốc độ 0.5
    span.onclick = (e) => {
      e.stopPropagation();
      speakSingleWord(w);
    };

    wordArea.appendChild(span);
  });

  // 2. Hiển thị Nghĩa tiếng Việt
  document.getElementById("vocabMeaning").textContent = wordObj.meaning || "Không có nghĩa";

  // 3. Hiển thị Phiên âm (giữ nguyên logic cũ của ông)
  const phonetic = await getPhonetic(wordObj.word);
  document.getElementById("vocabPhonetic").textContent = phonetic;

  // 4. Hiển thị Ảnh minh họa
  const imgEl = document.getElementById("vocabImage");
  const keywordForImage = (wordObj.imageKeyword || wordObj.word).toLowerCase().trim();
  const mainImg = getImageFromMap(keywordForImage);

  if (mainImg) {
    imgEl.src = mainImg;
    imgEl.style.display = "block";
  } else {
    imgEl.style.display = "none";
  }

  // 5. Reset trạng thái nút Next và Ghi chú
  if (document.getElementById("funContent")) document.getElementById("funContent").innerHTML = "";
  listenCount = 0;
  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) nextBtn.disabled = true;

  console.log(`✅ Đã hiển thị từ: ${wordObj.word}`);
}

// ===== Nút nghe lại =====
// Tìm đoạn này trong code của ông và thay thế:
document.getElementById("playSound").onclick = () => {
  // THAY ĐỔI: Lấy từ mảng dữ liệu thay vì lấy từ giao diện
  const word = vocabData[currentIndex].word; 
  if (!word) return;

  const utter = new SpeechSynthesisUtterance(word);
  utter.voice = vocabVoice || speechSynthesis.getVoices()[0] || null;

  // Nếu ông muốn nút loa tổng cũng đọc thong thả (ví dụ 0.8) thì thêm dòng này:
  // utter.rate = 0.8; 

  utter.onend = () => {
    listenCount++;
    if (listenCount >= REQUIRED_LISTENS) {
      document.getElementById("nextBtn").disabled = false;
    }
  };

  speechSynthesis.cancel();
  speechSynthesis.speak(utter);

  const img = document.querySelector("#playSound img");
  if (img) {
    img.style.animation = "shake 0.6s ease-in-out 1";
    setTimeout(() => (img.style.animation = ""), 700);
  }
};

// ===== Nút Next =====
document.getElementById("nextBtn").onclick = async () => {
  if (listenCount < REQUIRED_LISTENS) {
    alert(`Bạn cần nghe ít nhất ${REQUIRED_LISTENS} lần trước khi Next!`);
    return;
  }

  currentIndex++;
  if (currentIndex >= vocabData.length) {
    currentIndex = 0;
    roundCount++;
  }

  await displayWord(vocabData[currentIndex]);

  if (roundCount >= 2) {
    const completeBtn = document.getElementById("completeBtn");
    completeBtn.disabled = false;
    completeBtn.style.cursor = "pointer";
    completeBtn.style.backgroundColor = "#2196f3";
    completeBtn.textContent = "🌟 Hoàn thành nhiệm vụ!";
  }
};

// ===== Hàm lưu kết quả Vocabulary =====
function setResultVocabulary(part, score, total) {
  const raw = localStorage.getItem("result_vocabulary");
  const prev = raw ? JSON.parse(raw) : {};

  const updated = {
    scoreV1: part === "V1" ? score : prev.scoreV1 || 0,
    totalV1: part === "V1" ? total : prev.totalV1 || 0,
    scoreV2: part === "V2" ? score : prev.scoreV2 || 0,
    totalV2: part === "V2" ? total : prev.totalV2 || 0
  };

  const totalScore = (updated.scoreV1 + updated.scoreV2);
  const totalMax = (updated.totalV1 + updated.totalV2);

  localStorage.setItem("result_vocabulary", JSON.stringify({
    ...updated,
    score: totalScore,
    total: totalMax
  }));
}

// ===== Hoàn thành =====
document.getElementById("completeBtn").onclick = () => {
  if (roundCount >= 2 && !hasCaught) {
    showVictoryEffect();
    const score = vocabData.length > 0 ? 10 : 0;
    setResultVocabulary("V1", score, 10); // ✅ Lưu kết quả Vocabulary 1
    hasCaught = true;

    const btn = document.getElementById("completeBtn");
    btn.textContent = "✅ Đã hoàn thành!";
    btn.disabled = true;
    btn.style.opacity = "0.6";

    setTimeout(() => {
      const nextStageBtn = document.createElement("button");
      nextStageBtn.textContent = "🎮 Vào khu huấn luyện";
      nextStageBtn.style.marginTop = "20px";
      nextStageBtn.style.padding = "12px 20px";
      nextStageBtn.style.fontSize = "1rem";
      nextStageBtn.style.borderRadius = "8px";
      nextStageBtn.style.backgroundColor = "#e17055";
      nextStageBtn.style.color = "#fff";
      nextStageBtn.style.cursor = "pointer";
      nextStageBtn.onclick = () => (window.location.href = "vocabulary2.html");
      document.body.appendChild(nextStageBtn);
    }, 5000);
  }
};

document.getElementById("funBtn").onclick = () => {
  const wordObj = vocabData[currentIndex];
  const container = document.getElementById("funContent");
  const closeBtn = document.getElementById("closeFunBtn");

  const syl = wordObj.syllables || ""; 
  const note1 = wordObj.noteAH || "";
  const note2 = wordObj.noteAI || "";

  container.innerHTML = `
    <div style="padding:15px; border:2px dashed #ffcb05; border-radius:15px; background-color: #fffbe6; color: #333;">

      ${syl ? `
        <div style="text-align: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #eee;">
          <p style="font-size: 0.8rem; color: #666; margin: 0;">Cách đọc tách vần:</p>
          <h2 style="color: #ff1c1c; letter-spacing: 3px; font-size: 1.6rem; margin: 5px 0;">
            ${syl.toUpperCase().split('-').join(' <span style="color:#ccc">-</span> ')}
          </h2>
        </div>
      ` : ""}

      <h3 style="color: #3b4cca; margin-top: 0; font-size: 1rem;">📌 Ghi chú bổ trợ:</h3>

      <div class="notes-wrapper">
         ${note1 ? `<p style="margin: 8px 0; color: #d35400; font-weight: bold;">• ${note1}</p>` : ""}
         ${note2 ? `<p style="margin: 8px 0; color: #2980b9;">• ${note2}</p>` : ""}
      </div>

      ${(!syl && !note1 && !note2) ? "<p>Chưa có thông tin bổ sung.</p>" : ""}
    </div>
  `;
  closeBtn.style.display = "inline-block";
};

document.getElementById("closeFunBtn").onclick = () => {
  document.getElementById("funContent").innerHTML = "";
  document.getElementById("closeFunBtn").style.display = "none";
};

// ===== Init =====
(async function init() {
  try {
    vocabData = await fetchVocabularyData();

    if (vocabData.length === 0) {
      document.getElementById("vocabWord").textContent = "Không có từ";
      document.getElementById("vocabMeaning").textContent =
        "Danh sách wordBank trống hoặc không khớp với dữ liệu Google Sheet.";
      return;
    }

    // Cache trước ảnh để load nhanh hơn (nếu có)
    const keywords = buildImageKeywords(vocabData);
    await prefetchImagesBatch(keywords);

    // Hiển thị từ đầu tiên
    await displayWord(vocabData[currentIndex]);
  } catch (err) {
    console.error("Init error:", err);
    document.getElementById("vocabWord").textContent = "Lỗi khởi tạo";
    document.getElementById("vocabMeaning").textContent = "Vui lòng thử lại sau.";
  }
})();
