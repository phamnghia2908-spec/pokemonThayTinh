import { startTalking, stopTalking } from "./pikachuTalk.js";

document.addEventListener("DOMContentLoaded", function () {
  const selectionMode = localStorage.getItem("selectionMode"); // thêm
  const selectedUnit = localStorage.getItem("selectedLesson");
  const startUnit = localStorage.getItem("startLesson");
  const endUnit = localStorage.getItem("endLesson");
  const selectedTopic = localStorage.getItem("selectedTopic"); // thêm
  const topicUnits = JSON.parse(localStorage.getItem("topicUnits") || "[]"); // thêm


  
  const chatContainer = document.getElementById("chatContainer");

  let questionPool = [];
  let askedQuestions = [];
  let currentQuestion = null;
  let questionAnswerMap = {};
  let vocabVoice = null;
  let totalPoints = 0;
  let waitingAfterCorrection = false;
  let currentBotResponse = [];

  // ✅ Cache ảnh theo câu hỏi để giảm độ trễ
  // ✅ Dùng biến này để lưu ảnh đã fetch cho từng câu hỏi
  const chatImageMap = {};

  // ✅ Hàm gọi ảnh từ Openverse theo keyword
  // ✅ Hàm lấy ảnh từ hệ thống imagecache2 (Unsplash, DiceBear, RoboHash...)
  async function fetchImageForKeyword(keyword) {
    try {
      console.log("👉 Đang gọi imagecache2 cho từ khóa:", keyword);
      const result = await imageCache.getImage(keyword);
      if (result && result.url) {
        return { url: result.url, keyword: keyword };
      }
      return null;
    } catch (err) {
      console.error("❌ Lỗi khi lấy ảnh từ imagecache2:", err);
      return null;
    }
  }




  // ✅ Chèn ảnh trực tiếp vào khung chat, kích thước responsive
  function addImage(url, keyword) {
    console.log("👉 Hiển thị ảnh:", url, "ứng với từ vựng:", keyword); // ✅ log rõ ràng
    if (!url) return;
    const wrapper = document.createElement("div");
    wrapper.className = "message bot";

    const img = document.createElement("img");
    img.src = url;
    img.className = "chat-image";
    img.style.maxWidth = "60%";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.borderRadius = "8px";
    img.style.margin = "6px 0";
    img.style.objectFit = "cover";

    wrapper.appendChild(img);
    chatContainer.appendChild(wrapper);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }




  function getVocabVoice() {
    return new Promise(resolve => {
      let voices = speechSynthesis.getVoices();
      if (voices.length) return resolve(voices);

      // Trên điện thoại, đôi khi cần chờ thêm để giọng nói sẵn sàng
      let attempts = 0;
      const maxAttempts = 20;
      const interval = setInterval(() => {
        voices = speechSynthesis.getVoices();
        if (voices.length || attempts >= maxAttempts) {
          clearInterval(interval);
          resolve(voices);
        }
        attempts++;
      }, 100);
    });
  }

  getVocabVoice().then(voices => {
    const preferredVoiceName = localStorage.getItem("selectedVoice");
    vocabVoice = voices.find(v => v.name === preferredVoiceName)
               || voices.find(v => v.lang === "en-US")
               || voices[0]; // fallback nếu không có gì khớp
  });

  function speak(text) {
    if (!vocabVoice) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.voice = vocabVoice;

    // 👉 thêm hiệu ứng Pikachu
    utter.onstart = startTalking;
    utter.onend = stopTalking;

    speechSynthesis.speak(utter);
  }


  function addMessage(sender, text) {
    const msg = document.createElement("div");
    msg.className = "message " + (sender === "Bot" ? "bot" : "user");
    msg.textContent = `${sender}: ${text}`;
    chatContainer.appendChild(msg);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    if (sender === "Bot") speak(text);
  }

  function askNextQuestion() {
    const remaining = questionPool.filter(q => !askedQuestions.includes(q.question));
    if (remaining.length === 0) {
      addMessage("Bot", `Congratulations. You have ${totalPoints} points!`);
      localStorage.setItem("result_communication", JSON.stringify({
        score: totalPoints,
        total: totalPoints
      }));
      setTimeout(() => {
        if (typeof showVictoryEffect === "function") {
          showVictoryEffect(chatContainer);
        }
      }, 600);
      return;
    }
    const next = remaining[Math.floor(Math.random() * remaining.length)];
    askedQuestions.push(next.question);
    currentQuestion = next;
    addMessage("Bot", next.question);
    currentBotResponse = [next.question]; // ✅ thêm dòng này

    // ✅ Hiển thị ảnh từ cache nếu có, nếu chưa có thì thử lấy theo vocabList
    // ✅ Đổi imageCache -> chatImageMap
    const cached = chatImageMap[next.question];
    if (cached && cached.url) {
        addImage(cached.url, cached.keyword);
    } else if (next.vocabList && next.vocabList.length > 0) {
        const keyword = next.vocabList[Math.floor(Math.random() * next.vocabList.length)];
        fetchImageForKeyword(keyword).then(img => {
            if (img && img.url) {
                chatImageMap[next.question] = img; // ✅ Đổi ở đây
                addImage(img.url, img.keyword);
            }
        });
    }
  }

  function extractUnitCode(text) {
    return text.split(" ")[0].trim();
  }

  function normalize(text) {
    return text.trim().replace(/\?$/, "").toLowerCase();
  }

  function cleanWord(word) {
    return word.replace(/[.,!?]/g, "").toLowerCase();
  }

  // Thay đổi fetch để dùng biến SHEET_URL (toàn cục) và xử lý JSON từ Exec
  fetch(SHEET_URL)
    .then(response => response.json())
    .then(rows => {
      let rawQuestions = [];

      rows.forEach(row => {
        // ✅ Thay row.c[index].v thành row[index]
        // Chỉ sửa phần truy cập dữ liệu, giữ nguyên logic gốc của bạn
        if (row && row[1] && row[9] && row[10]) {
          const fullUnit = row[1].toString().trim();
          const unitCode = extractUnitCode(fullUnit);
          const question = row[9].toString().trim();
          const answer = row[10].toString().trim();
          const suggestion = row[11] ? row[11].toString().trim() : "";

          const vocabRaw = row[47] ? row[47].toString().trim() : "";
          const vocabList = vocabRaw
            ? vocabRaw.split(",").map(s => s.trim()).filter(Boolean)
            : [];

          if (selectionMode === "topic") {
            if (topicUnits.includes(fullUnit)) {
              rawQuestions.push({ unit: fullUnit, question, answer, suggestion, vocabList });
            }
          } else {
            const startCode = extractUnitCode(startUnit);
            const endCode = extractUnitCode(endUnit);
            if (unitCode >= startCode && unitCode <= endCode) {
              rawQuestions.push({ unit: fullUnit, question, answer, suggestion, vocabList });
            }
          }

          const userQuestion = row[8] ? row[8].toString().trim() : null;
          const botAnswer = row[11] ? row[11].toString().trim() : null;
          if (userQuestion && botAnswer) {
            const key = normalize(userQuestion);
            if (!questionAnswerMap[key]) {
              questionAnswerMap[key] = [];
            }
            questionAnswerMap[key].push(botAnswer);
          }
        }
      });

      // --- GIỮ NGUYÊN TOÀN BỘ LOGIC CŨ PHÍA DƯỚI ---
      const unitMap = new Map();
      rawQuestions.forEach(item => {
        const unit = item.unit;
        if (!unitMap.has(unit)) {
          unitMap.set(unit, []);
        }
        unitMap.get(unit).push(item);
      });

      questionPool = [];
      for (const [unit, questions] of unitMap.entries()) {
        const randomIndex = Math.floor(Math.random() * questions.length);
        questionPool.push(questions[randomIndex]);
      }

      // ✅ Prefetch ảnh bằng hệ thống imagecache2
      const prefetchPromises = questionPool.map(item => {
          if (item.vocabList && item.vocabList.length > 0) {
              const keyword = item.vocabList[Math.floor(Math.random() * item.vocabList.length)];

              // Gọi imageCache (của file imagecache2.js)
              return imageCache.getImage(keyword).then(img => {
                  if (img && img.url) {
                      // Lưu vào chatImageMap để sử dụng hiển thị trong chat
                      chatImageMap[item.question] = img; // ✅ Đổi ở đây
                      item.imageUrl = img.url;
                  }
              });
          }
          return Promise.resolve();
      });

      Promise.all(prefetchPromises).then(() => {
        addMessage("Bot", `Hello my friend`);
        askNextQuestion();
      });
    });

  const positiveFeedback = [
    "Great job!", "Well done!", "That's correct!", "Nice work!",
    "Exactly!", "Perfect!", "You got it!", "That's right!",
    "Awesome!", "Spot on!"
  ];

  function handleUserInput(input) {
    const studentName = localStorage.getItem("trainerName") || "You";
    addMessage(studentName, input);
    const normalizedInput = normalize(input);

    if (waitingAfterCorrection) {
      waitingAfterCorrection = false;

      const normalizedInput = normalize(input);
      const inputWords = normalizedInput.split(" ").map(cleanWord);

      // Dùng lại logic xác định câu hỏi
      const matchedQuestions = [];

      questionPool.forEach(item => {
        const normJ = normalize(item.question);
        const questionWords = normJ.split(" ").map(cleanWord);
        const allWordsPresent = questionWords.every(word => inputWords.includes(word));
        if (allWordsPresent) {
          matchedQuestions.push(item.suggestion);
        }
      });

      if (matchedQuestions.length > 0) {
        const reply = matchedQuestions[Math.floor(Math.random() * matchedQuestions.length)];
        addMessage("Bot", reply);
        currentBotResponse = [reply]; // ✅ thêm dòng này
      }

      // Dù là câu hỏi hay câu trả lời → đều hỏi tiếp câu mới
      askNextQuestion();
      return;
    }

    const matchedQuestions = [];

    questionPool.forEach(item => {
      const normJ = normalize(item.question);
      const questionWords = normJ.split(" ").map(cleanWord);
      const inputWords = normalizedInput.split(" ").map(cleanWord);
      const allWordsPresent = questionWords.every(word => inputWords.includes(word));
      if (allWordsPresent) {
        matchedQuestions.push(item.suggestion);
      }
    });

    if (matchedQuestions.length > 0) {
      const reply = matchedQuestions[Math.floor(Math.random() * matchedQuestions.length)];
      addMessage("Bot", reply);
      askNextQuestion();
      return;
    }

    if (currentQuestion && currentQuestion.answer) {
      const correctAnswers = currentQuestion.answer
        .split('"')
        .filter((text, i) => i % 2 === 1)
        .map(text => normalize(text));

      const isCorrect = correctAnswers.some(keyword =>
        normalizedInput.includes(keyword)
      );

      if (isCorrect) {
        const feedback = positiveFeedback[Math.floor(Math.random() * positiveFeedback.length)];
        addMessage("Bot", feedback);
        askNextQuestion();
      } else {
        const fallbackSuggestions = questionPool
          .filter(item => normalize(item.question) === normalize(currentQuestion.question))
          .map(item => item.suggestion);

        const suggestion = fallbackSuggestions.length > 0
          ? fallbackSuggestions[Math.floor(Math.random() * fallbackSuggestions.length)]
          : currentQuestion.suggestion;

        addMessage("Bot", `You can say: ${suggestion}`);
        currentBotResponse = [`You can say: ${suggestion}`]; // ✅ thêm dòng này

        waitingAfterCorrection = true;
      }
    } else {
      askNextQuestion();
    }
  }

  const recordBtn = document.getElementById("recordBtn");
  const speechResult = document.getElementById("speechResult");

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition && recordBtn) {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recordBtn.onclick = () => {
      speechResult.textContent = "🎙️ Listening...";
      recognition.start();
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      speechResult.textContent = "";
      totalPoints += 3;
      handleUserInput(transcript);
    };

    recognition.onerror = (event) => {
      speechResult.innerText = `❌ Error: ${event.error}`;
    };
  }

  // ✅ Nút đọc lại nội dung bot nói
  const repeatBtn = document.getElementById("repeatBtn");
  if (repeatBtn) {
    repeatBtn.onclick = () => {
      if (currentBotResponse.length > 0) {
        const fullText = currentBotResponse.join(" ");
        speak(fullText);
      } else {
        alert("Chưa có nội dung để đọc lại.");
      }
    };
  }
});


const popup = document.getElementById("pikachuPopup");
const toggleBtn = document.getElementById("togglePikachuBtn");

if (toggleBtn && popup) {
  toggleBtn.onclick = () => {
    if (popup.style.display === "none") {
      popup.style.display = "flex"; // hiện lại
    } else {
      popup.style.display = "none"; // ẩn đi
    }
  };
}

let isDragging = false;
let offsetX, offsetY;

// PC: kéo bằng chuột
popup.addEventListener("mousedown", (e) => {
  isDragging = true;
  offsetX = e.clientX - popup.offsetLeft;
  offsetY = e.clientY - popup.offsetTop;
});

document.addEventListener("mousemove", (e) => {
  if (isDragging) {
    popup.style.left = (e.clientX - offsetX) + "px";
    popup.style.top = (e.clientY - offsetY) + "px";
    popup.style.bottom = "auto";
    popup.style.right = "auto";
  }
});

document.addEventListener("mouseup", () => {
  isDragging = false;
});

// Mobile: kéo bằng tay
popup.addEventListener("touchstart", (e) => {
  isDragging = true;
  const touch = e.touches[0];
  offsetX = touch.clientX - popup.offsetLeft;
  offsetY = touch.clientY - popup.offsetTop;
});

document.addEventListener("touchmove", (e) => {
  if (isDragging) {
    const touch = e.touches[0];
    popup.style.left = (touch.clientX - offsetX) + "px";
    popup.style.top = (touch.clientY - offsetY) + "px";
    popup.style.bottom = "auto";
    popup.style.right = "auto";
  }
});

document.addEventListener("touchend", () => {
  isDragging = false;
});
