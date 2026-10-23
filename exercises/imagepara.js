// ===== Biến toàn cục =====
let currentExercises = [];
let voiceEng = null;
const COL_TOPIC = 6; // Cột G

function buildTopicDropdown(rows) {
    const topicSelect = document.getElementById("topicSelect");
    if (!topicSelect) return;

    // Lấy danh sách Topic duy nhất từ cột G
    const topics = [...new Set(rows.map(r => {
        return (r.c ? r.c[COL_TOPIC]?.v : r[COL_TOPIC])?.toString().trim();
    }).filter(Boolean))];

    topics.sort();

    // Giữ lại lựa chọn "Tất cả" và thêm các topic từ Sheet
    topicSelect.innerHTML = `<option value="ALL">-- Tất cả chủ đề --</option>` +
        topics.map(t => `<option value="${t}">${t}</option>`).join("");
}

// ===== Helpers chuẩn Listening 3 =====
function normalizeUnitId(unitStr) {
    if (!unitStr) return 0;
    const parts = unitStr.split("-");
    if (parts.length < 3) return 0;
    return parseInt(parts[0], 10) * 1000 + parseInt(parts[1], 10) * 10 + parseInt(parts[2], 10);
}

async function getMaxLessonCode() {
    const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
    try {
        const res = await fetch(SHEET_BAI_HOC);
        const data = await res.json(); // Dùng thẳng .json() vì link .exec trả về JSON chuẩn

        // Cấu trúc link .exec thường trả về mảng trực tiếp hoặc data.rows
        const rows = data.rows || data; 

        const baiList = rows.map((r) => {
            // Tùy vào script .exec của bạn trả về object hay array
            // Nếu trả về Array: r[0] là lớp, r[2] là mã bài
            // Nếu trả về Object: r.lop, r.mabai (bạn kiểm tra lại script nhé)
            const lop = (r.c ? r.c[0]?.v : (r[0] || r.class))?.toString().trim();
            const bai = (r.c ? r.c[2]?.v : (r[2] || r.lessonCode))?.toString().trim();

            return lop === trainerClass && bai ? parseInt(bai, 10) : null;
        }).filter((v) => typeof v === "number");

        return baiList.length === 0 ? null : Math.max(...baiList);
    } catch (e) { 
        console.error("Lỗi lấy maxLessonCode:", e);
        return null; 
    }
}

// ===== 1. Lấy dữ liệu từ Google Sheet (Đã thêm lọc) =====
async function fetchSheetData() {
    try {
        const maxCode = await getMaxLessonCode();
        const response = await fetch(SHEET_URL);
        const data = await response.json();
        const rows = data.rows || data;

        // Lấy giá trị đang được chọn tại thời điểm ấn nút
        const selectedTopic = document.getElementById("topicSelect")?.value || "ALL";

        return rows.map(r => {
            const lessonName = (r.c ? r.c[1]?.v : r[1])?.toString() || "";
            const vocabRaw   = (r.c ? r.c[2]?.v : r[2])?.toString() || "";
            const presentation = (r.c ? r.c[8]?.v : r[8])?.toString() || "";
            const topicValue = (r.c ? r.c[COL_TOPIC]?.v : r[COL_TOPIC])?.toString() || "";

            return {
                vocab: vocabRaw.split(/[/;,]/)[0].trim(),
                sentence: presentation,
                unitNum: normalizeUnitId(lessonName),
                topic: topicValue.trim()
            };
        }).filter(item => {
            const hasData = item.sentence && item.vocab && item.sentence.toLowerCase().includes(item.vocab.toLowerCase());
            const isInRange = item.unitNum >= 3011 && (maxCode ? item.unitNum <= maxCode : true);

            // Lọc theo Topic đã chọn trong menu
            const matchesTopic = (selectedTopic === "ALL" || item.topic === selectedTopic);

            return hasData && isInRange && matchesTopic;
        });
    } catch (e) {
        console.error("❌ Lỗi tải dữ liệu:", e);
        return [];
    }
}

// ===== 2. Dựng giao diện bài tập =====
async function initExercise() {
    const mainArea = document.getElementById("mainArea");
    const total = parseInt(document.getElementById("totalSelect")?.value || 8);

    mainArea.innerHTML = "<div class='loading'>⏳ Đang lọc Pokémon từ bài 3011...</div>";

    const allData = await fetchSheetData();
    if (allData.length === 0) {
        mainArea.innerHTML = "❌ Không có dữ liệu bài tập trong phạm vi này.";
        return;
    }

    // Xáo trộn và chọn câu hỏi, sau đó sắp xếp theo unitNum cho mượt
    currentExercises = allData.sort(() => Math.random() - 0.5).slice(0, total);
    currentExercises.sort((a, b) => a.unitNum - b.unitNum);

    let html = '<div class="exercise-card">';
    let imgCounter = 1;
    const taskQueue = [];

    currentExercises.forEach((item) => {
        let content = item.sentence;
        const imgId = `img-target-${imgCounter}`;
        const imgHtml = `
            <span class="image-placeholder" style="display:inline-flex; align-items:center; border:2px solid #ff9800; border-radius:10px; padding:4px; background:#fff; vertical-align:middle; margin:0 5px;">
                <img id="${imgId}" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png" style="width:70px; height:70px; border-radius:5px; object-fit:cover;">
                <b style="margin-left:5px; color:#ff6b6b;">(${imgCounter})</b>
            </span>`;

        // Dùng Regex để thay thế chính xác từ
        const safeVocab = item.vocab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        content = content.replace(new RegExp(`\\b${safeVocab}\\b`, "gi"), imgHtml);

        taskQueue.push({ id: imgId, word: item.vocab, order: imgCounter });
        imgCounter++;

        html += `<div class="sentence-row" style="margin-bottom:20px; font-size:1.2rem; line-height:2.2; border-bottom:1px dashed #eee; padding-bottom:10px;">${content}</div>`;
    });
    html += '</div>';

    html += '<div class="inputs-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px; margin-top:20px;">';
    for (let i = 1; i < imgCounter; i++) {
        html += `
            <div class="input-box" style="background:#f0f7ff; padding:10px; border-radius:10px; text-align:center;">
                <label style="display:block; font-weight:bold; margin-bottom:5px;">Ảnh (${i})</label>
                <input type="text" id="ans-${i}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:5px; text-align:center;">
            </div>`;
    }
    html += '</div>';

    mainArea.innerHTML = html;

    const submitBtn = document.getElementById("submitBtn");
    if (submitBtn) submitBtn.style.display = "none";
    const scoreBoard = document.getElementById("scoreDisplay");
    if (scoreBoard) scoreBoard.style.display = "none";

    await loadImagesForTaskQueue(taskQueue);
    displayAnswers();
}

// ===== 3. Tải ảnh (Giữ nguyên logic của bạn) =====
async function loadImagesForTaskQueue(queue) {
    for (const task of queue) {
        const imgElement = document.getElementById(task.id);
        if (!imgElement) continue;

        try {
            if (typeof imageCache !== 'undefined' && imageCache.getImage) {
                const imageData = await imageCache.getImage(task.word);
                const imageUrl = imageData?.url || imageData; // Hỗ trợ cả string và object
                imgElement.src = imageUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${task.word}`;
            } else {
                imgElement.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${task.word}`;
            }
        } catch (err) {
            imgElement.src = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/master-ball.png";
        }
    }
}

// ===== 4. Hiển thị đáp án (Giữ nguyên) =====
function displayAnswers() {
    const ansBox = document.getElementById("ansBox");
    if (!ansBox) return;
    let answersHtml = '<div style="padding: 10px;"><h3>📖 Đáp án từng câu</h3><ul style="list-style: none; padding-left: 0;">';
    currentExercises.forEach((item, idx) => {
        answersHtml += `<li style="margin-bottom: 8px;"><strong>Ảnh ${idx+1}:</strong> ${item.vocab}</li>`;
    });
    answersHtml += '</ul></div>';
    ansBox.innerHTML = answersHtml;
    ansBox.style.display = "block";
}

// ===== 5. Đọc văn bản (Giữ nguyên) =====
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
    // Thiết lập giọng đọc
    window.speechSynthesis.onvoiceschanged = () => {
        voiceEng = window.speechSynthesis.getVoices().find(v => v.lang === "en-US" && (v.name.includes("David") || v.name.includes("Google")));
    };

    // Bước 1: Chỉ tải dữ liệu thô để đổ vào Menu Topic, chưa tạo bài tập
    loadInitialTopics(); 

    // Giao diện lúc mới vào sẽ hiển thị lời chào hoặc hướng dẫn thay vì xoay loading
    const mainArea = document.getElementById("mainArea");
    if (mainArea) {
        mainArea.innerHTML = "<div style='text-align:center; padding:40px; color:#666;'>👋 Chọn Chủ đề và Số câu, sau đó ấn <b>Làm mới</b> để bắt đầu!</div>";
    }
};

// Hàm bổ sung để nạp Topic lúc mới vào trang
async function loadInitialTopics() {
    try {
        const response = await fetch(SHEET_URL);
        const data = await response.json();
        const rows = data.rows || data;
        buildTopicDropdown(rows); // Đổ dữ liệu vào menu G
    } catch (e) {
        console.error("Lỗi nạp danh sách chủ đề:", e);
    }
}

window.initExercise = initExercise;
window.playFullText = playFullText;