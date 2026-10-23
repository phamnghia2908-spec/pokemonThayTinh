// ===== Biến toàn cục =====
let currentExercises = [];
let voiceEng = null;
// THAY URL NÀY BẰNG URL THỰC TẾ CỦA GOOGLE SHEET
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.split("-");
  if (parts.length < 3) return 0;
  const [cls, lesson, part] = parts;
  return parseInt(cls, 10) * 1000 + parseInt(lesson, 10) * 10 + parseInt(part, 10);
}

// ===== 1. Lấy dữ liệu từ Google Sheet =====
async function fetchSheetData(maxLessonCode) {
    try {
        const response = await fetch(SHEET_URL);
        const data = await response.json();
        const rows = data.rows || data;

        let items = rows.map(r => ({
            lessonName: (r.c?.[1]?.v || "").toString().trim(),
            vocab: (r.c?.[2]?.v || r[2] || "").toString().split(/[/;,]/)[0].trim(),
            sentence: (r.c?.[8]?.v || r[8] || "").toString()
        })).filter(item => item.sentence && item.vocab && item.sentence.toLowerCase().includes(item.vocab.toLowerCase()));

        console.log("📊 Tổng số câu ban đầu:", items.length);
        console.log("📌 maxLessonCode nhận được:", maxLessonCode, "type:", typeof maxLessonCode);

        // Ép kiểu maxLessonCode thành number (giống listening3)
        const maxCode = Number(maxLessonCode);
        if (isNaN(maxCode)) {
            console.warn("maxLessonCode không phải số, bỏ qua lọc");
            return items;
        }

        // Lọc y hệt listening3: giữ unitNum >= 3011 và <= maxCode
        const filtered = items.filter(item => {
            const unitNum = normalizeUnitId(item.lessonName);
            const maxCode = Number(maxLessonCode);
            const keep = unitNum >= 3011 && unitNum <= maxCode;
            // Log chi tiết 10 câu đầu để xem unitNum thực tế
            if (items.indexOf(item) < 10) {
                console.log(`📖 ${item.lessonName} => unitNum=${unitNum}, keep=${keep}`);
            }
            return keep;
        });

        console.log(`✅ Sau lọc: ${filtered.length} câu (đã loại ${items.length - filtered.length} câu)`);
        return filtered;
    } catch (e) {
        console.error("Lỗi tải Sheet:", e);
        return [];
    }
}

// ===== 2. Dựng giao diện bài tập =====
async function initExercise() {
    const mainArea = document.getElementById("mainArea");
    const total = parseInt(document.getElementById("totalSelect")?.value || 8);

    mainArea.innerHTML = "<div class='loading'>⏳ Đang triệu hồi Pokémon...</div>";

    // Lấy maxLessonCode từ localStorage (key cần đúng với key bạn đang dùng)
    const maxLessonCode = localStorage.getItem("maxLessonCode") || null; // thay key nếu khác

    const allData = await fetchSheetData(maxLessonCode);
    if (allData.length === 0) {
        mainArea.innerHTML = "❌ Không có dữ liệu bài tập.";
        return;
    }

    // Xáo trộn và chọn câu hỏi
    currentExercises = allData.sort(() => Math.random() - 0.5).slice(0, total);

    let html = '<div class="exercise-card">';
    let imgCounter = 1;
    const taskQueue = [];

    // Duyệt từng câu, thay thế từ vựng bằng ảnh
    currentExercises.forEach((item, idx) => {
        let content = item.sentence;
        const imgId = `img-target-${imgCounter}`;
        const imgHtml = `
            <span class="image-placeholder" style="display:inline-flex; align-items:center; border:2px solid #ff9800; border-radius:10px; padding:4px; background:#fff; vertical-align:middle; margin:0 5px;">
                <img id="${imgId}" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png" style="width:70px; height:70px; border-radius:5px; object-fit:cover;">
                <b style="margin-left:5px; color:#ff6b6b;">(${imgCounter})</b>
            </span>`;
        content = content.replace(new RegExp(`\\b${item.vocab}\\b`, "gi"), imgHtml);
        taskQueue.push({ id: imgId, word: item.vocab, order: imgCounter });
        imgCounter++;

        html += `<div class="sentence-row" style="margin-bottom:20px; font-size:1.2rem; line-height:2.2; border-bottom:1px dashed #eee; padding-bottom:10px;">${content}</div>`;
    });
    html += '</div>';

    // Khu vực nhập đáp án (không có nộp bài)
    html += '<div class="inputs-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px; margin-top:20px;">';
    for (let i = 1; i <= total; i++) {
        html += `
            <div class="input-box" style="background:#f0f7ff; padding:10px; border-radius:10px; text-align:center;">
                <label style="display:block; font-weight:bold; margin-bottom:5px;">Ảnh (${i})</label>
                <input type="text" id="ans-${i}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:5px; text-align:center;">
            </div>`;
    }
    html += '</div>';

    mainArea.innerHTML = html;

    // Ẩn nút submit và score-board nếu có
    const submitBtn = document.getElementById("submitBtn");
    if (submitBtn) submitBtn.style.display = "none";
    const scoreBoard = document.getElementById("scoreDisplay");
    if (scoreBoard) scoreBoard.style.display = "none";

    // Tải ảnh
    await loadImagesForTaskQueue(taskQueue);

    // Hiển thị đáp án
    displayAnswers();
}

// ===== 3. Tải ảnh =====
async function loadImagesForTaskQueue(queue) {
    for (const task of queue) {
        const imgElement = document.getElementById(task.id);
        if (!imgElement) continue;

        try {
            if (typeof imageCache !== 'undefined' && imageCache.getImage) {
                const imageData = await imageCache.getImage(task.word);
                const imageUrl = imageData?.url;
                if (imageUrl) {
                    imgElement.src = imageUrl;
                } else {
                    imgElement.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${task.word}`;
                }
            } else {
                imgElement.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${task.word}`;
            }
        } catch (err) {
            console.error(`Lỗi tải ảnh cho từ: ${task.word}`, err);
            imgElement.src = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/master-ball.png";
        }
    }
}

// ===== 4. Hiển thị đáp án =====
function displayAnswers() {
    const ansBox = document.getElementById("ansBox");
    if (!ansBox) return;

    if (!currentExercises.length) {
        ansBox.innerHTML = "<p>Chưa có dữ liệu.</p>";
        return;
    }

    let answersHtml = '<div style="padding: 10px;"><h3>📖 Đáp án từng câu</h3><ul style="list-style: none; padding-left: 0;">';
    currentExercises.forEach((item, idx) => {
        answersHtml += `<li style="margin-bottom: 8px;"><strong>Ảnh ${idx+1}:</strong> ${item.vocab}</li>`;
    });
    answersHtml += '</ul></div>';

    ansBox.innerHTML = answersHtml;
    ansBox.style.display = "block";
}

// ===== 5. Đọc toàn bộ văn bản (text-to-speech) =====
function playFullText() {
    if (!currentExercises.length) return;
    const text = currentExercises.map(e => e.sentence).join(". ");
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'en-US';
    if (voiceEng) msg.voice = voiceEng;
    window.speechSynthesis.speak(msg);
}

// ===== 6. Khởi tạo =====
window.onload = () => {
    window.speechSynthesis.onvoiceschanged = () => {
        voiceEng = window.speechSynthesis.getVoices().find(v => v.lang === "en-US" && (v.name.includes("David") || v.name.includes("Google")));
    };
    initExercise();
};

// Xuất hàm để dùng nút làm mới, nghe
window.initExercise = initExercise;
window.playFullText = playFullText;