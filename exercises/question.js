// ===== 1. CẤU HÌNH (Config) =====
const COL = {
    lessonCode: 1,   // Cột B
    vocab: 2,        // Cột C
    subTopic: 5,     // Cột F
    mainTopic: 6,    // Cột G
    question: 9,     // Cột J
    meaning: 24      // Cột Y
};

// ===== 2. TRẠNG THÁI (State) =====
let allRows = [];           
let filteredRows = [];      
let currentVocabList = [];  
let displayedImageCount = 0; 
const LOAD_STEP = 15;        

// ===== 3. PHƠI HÀM RA GLOBAL (Sửa lỗi Not Defined) =====

// Hàm mở/đóng menu
window.toggleTopicMenu = function() {
    const dropdown = document.getElementById("topicCheckboxes");
    if (dropdown) {
        dropdown.classList.toggle("show");
    }
};

// Hàm cập nhật số lượng checkbox đã chọn
window.updateCheckedCount = function() {
    const checked = document.querySelectorAll('input[name="topic"]:checked').length;
    const label = document.getElementById("selectedCount");
    const selectedLabel = document.getElementById("selectedLabel");

    if (label) label.textContent = `(Đã chọn ${checked})`;
    if (selectedLabel) {
        selectedLabel.textContent = checked === 0 ? "Chọn chủ đề..." : `Đã chọn ${checked} chủ đề`;
    }
};

// Đóng menu khi click ra ngoài
window.addEventListener('click', function(event) {
    const container = document.querySelector('.custom-multiselect');
    const dropdown = document.getElementById("topicCheckboxes");
    if (container && !container.contains(event.target)) {
        if (dropdown && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        }
    }
});
// --- ĐIỀU KHIỂN ẨN/HIỆN TỪ VỰNG ---

window.toggleVocabLabels = function(show) {
    const grid = document.getElementById("imageGrid");
    if (!grid) return;

    if (show) {
        grid.classList.remove("hide-labels");
        // Xóa trạng thái lật lẻ tẻ của từng thẻ để đồng bộ
        document.querySelectorAll('.img-card').forEach(c => c.classList.remove('reveal'));
    } else {
        grid.classList.add("hide-labels");
    }
};
// ===== 4. KHỞI TẠO (Init) =====
document.addEventListener("DOMContentLoaded", initQuestionMode);

async function initQuestionMode() {
    status("Đang tải dữ liệu...");
    try {
        // Gán sự kiện cho nút Start
        const startBtn = document.getElementById("startBtn");
        if (startBtn) startBtn.onclick = handleStart;

        // Tải dữ liệu từ Google Sheets (SHEET_URL khai báo ở link.js)
        allRows = await fetchExecRows(SHEET_URL);
        const limitCode = await getMaxLessonCode();

        // Lọc theo lớp học
        filteredRows = allRows.filter(r => {
            const unitNum = normalizeUnitId(safeStr(r[COL.lessonCode]));
            return unitNum <= limitCode;
        });

        buildSubTopicDropdown();
        setupInfiniteScroll();
        status("Sẵn sàng.");
    } catch (e) {
        console.error("❌ Init error:", e);
        status("Lỗi nạp dữ liệu.");
    }
}

// ===== 5. CÁC HÀM XỬ LÝ CHÍNH =====

function buildSubTopicDropdown() {
    const container = document.getElementById("topicCheckboxes");
    if (!container) return;

    const subTopics = [...new Set(filteredRows.map(r => safeStr(r[COL.subTopic])).filter(Boolean))].sort();

    container.innerHTML = subTopics.map(t => `
        <label class="topic-item">
            <input type="checkbox" name="topic" value="${escapeHTML(t)}" onchange="window.updateCheckedCount()">
            <span>${escapeHTML(t)}</span>
        </label>
    `).join("");
}

async function handleStart() {
    document.getElementById("imageGrid").classList.add("hide-labels");
    const checkedNodes = document.querySelectorAll('input[name="topic"]:checked');
    const selectedTopics = Array.from(checkedNodes).map(node => node.value);

    if (selectedTopics.length === 0) return alert("Vui lòng chọn ít nhất một chủ đề!");

    // Reset giao diện
    const imageGrid = document.getElementById("imageGrid");
    const questionList = document.getElementById("questionList");
    imageGrid.innerHTML = "";
    questionList.innerHTML = "";
    displayedImageCount = 0;

    // Lọc từ vựng và câu hỏi
    currentVocabList = filteredRows.filter(r => selectedTopics.includes(safeStr(r[COL.subTopic])))
                                   .map(r => safeStr(r[COL.vocab]));

    const mainTopicsG = [...new Set(
        filteredRows.filter(r => selectedTopics.includes(safeStr(r[COL.subTopic])))
                    .map(r => safeStr(r[COL.mainTopic]))
                    .filter(Boolean)
    )];

    mainTopicsG.forEach(topicG => renderQuestions(topicG));
    await loadMoreImages();
}

function renderQuestions(mainTopicG) {
    const questionList = document.getElementById("questionList");
    const rowsOfG = filteredRows.filter(r => safeStr(r[COL.mainTopic]) === mainTopicG);

    // 1. Danh sách tạm chứa các câu bốc ngẫu nhiên từ Unit
    let tempQuestions = [
        { en: "What is it?", vocab: "" },
        { en: "What are they?", vocab: "" }
    ];

    // 2. Gom theo Unit và lấy ngẫu nhiên mỗi Unit 1 câu
    const unitMap = new Map();
    rowsOfG.forEach(r => {
        const unit = safeStr(r[COL.lessonCode]);
        if (!unitMap.has(unit)) unitMap.set(unit, []);
        unitMap.get(unit).push({ 
            en: safeStr(r[COL.question]), 
            vocab: safeStr(r[COL.vocab]) 
        });
    });

    unitMap.forEach((questions) => {
        const randomQ = questions[Math.floor(Math.random() * questions.length)];
        if (randomQ.en) tempQuestions.push(randomQ);
    });

    // 3. LỌC TRÙNG TUYỆT ĐỐI
    const finalQuestions = [];
    const seen = new Set();

    tempQuestions.forEach(q => {
        // Chuẩn hóa: Viết thường + Xóa khoảng trắng thừa ở đầu/cuối + Thu gọn khoảng trắng ở giữa
        const normalizedContent = q.en.trim().toLowerCase().replace(/\s+/g, ' ');

        if (normalizedContent && !seen.has(normalizedContent)) {
            finalQuestions.push(q);
            seen.add(normalizedContent);
        }
    });

    // 4. Render ra giao diện
    questionList.innerHTML = ""; // Xóa trắng danh sách cũ trước khi nạp mới
    finalQuestions.forEach(q => {
        const div = document.createElement("div");
        div.className = "q-item";

        let displayEn = q.en;
        let speakEn = q.en;

        if (q.vocab && q.en.toLowerCase().includes(q.vocab.toLowerCase())) {
            const regex = new RegExp(q.vocab, 'gi');
            displayEn = q.en.replace(regex, "......");
            speakEn = q.en.replace(regex, "um");
        }

        div.innerHTML = `<span class="q-en">${displayEn}</span>`;
        div.onclick = () => speak(speakEn);
        questionList.appendChild(div);
    });
}

async function loadMoreImages() {
    // 1. Kiểm tra giới hạn: Nếu đã tải hết danh sách thì dừng
    if (displayedImageCount >= currentVocabList.length) return;

    const loader = document.getElementById("loader");
    const grid = document.getElementById("imageGrid");
    if (loader) loader.style.display = "block";

    // Lấy nhóm từ tiếp theo (ví dụ: 15 từ mỗi lần tải)
    const nextBatch = currentVocabList.slice(displayedImageCount, displayedImageCount + LOAD_STEP); 

    // 2. Chế độ tải tuần tự (Xếp hàng từng từ một)
    for (const vocab of nextBatch) {
        // Nghỉ 100ms giữa các từ để "đánh lừa" server, tránh bị chặn do gửi yêu cầu quá nhanh
        await new Promise(r => setTimeout(r, 100)); 

        const card = document.createElement("div");
        card.className = "img-card";

        // Gán sự kiện Click: Lật thẻ hiện chữ + Đọc âm thanh
        card.onclick = function() {
            this.classList.toggle("reveal"); // Thêm/Xóa class để hiện chữ
            speak(vocab); // Gọi hàm phát âm
        };

        let imgUrl = '';
        try {
            // Đợi lấy ảnh từ cache hoặc API xong mới chạy tiếp từ sau
            const imageData = await imageCache.getImage(vocab);
            if (imageData) imgUrl = imageData.url;
        } catch (e) {
            console.warn(`⚠️ Không tải được ảnh cho từ: ${vocab}`);
        }

        // Tạo cấu trúc HTML cho mỗi thẻ ảnh
        card.innerHTML = `
            <img src="${imgUrl}" alt="${vocab}" 
                 onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR42mP8/w8AAwAB/al+jgAAAABJRU5ErkJggg=='">
            <span>${vocab}</span> 
        `;

        grid.appendChild(card);
        displayedImageCount++;
    }

    if (loader) loader.style.display = "none";
}

function setupInfiniteScroll() {
    const area = document.getElementById("imageScrollArea");
    if (!area) return;
    area.onscroll = () => {
        if (area.scrollTop + area.clientHeight >= area.scrollHeight - 50) {
            loadMoreImages();
        }
    };
}

function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = 'en-US';
    window.speechSynthesis.speak(ut);
}

// ===== 6. TIỆN ÍCH (Utilities) =====
async function fetchExecRows(url) {
    const res = await fetch(url, { cache: "no-store" });
    return await res.json();
}

async function getMaxLessonCode() {
    const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
    try {
        const res = await fetch(SHEET_BAI_HOC, { cache: "no-store" });
        const rows = await res.json();
        const baiList = rows.map(r => {
            const lop = r[0]?.toString().trim(); 
            const bai = r[2]?.toString().trim(); 
            return lop === trainerClass && bai ? parseInt(bai, 10) : null;
        }).filter(v => v !== null);
        return baiList.length === 0 ? 999999 : Math.max(...baiList);
    } catch (e) { return 999999; }
}

function normalizeUnitId(unitStr) {
    if (!unitStr) return 0;
    const parts = unitStr.split("-");
    if (parts.length < 3) return 0;
    const [c, l, p] = parts.map(v => parseInt(v, 10));
    return (isNaN(c) || isNaN(l) || isNaN(p)) ? 0 : c * 1000 + l * 10 + p;
}

function safeStr(v) { return v == null ? "" : String(v).trim(); }
function status(msg) { 
    const line = document.getElementById("statusLine");
    if(line) line.textContent = msg; 
}
function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
}
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}