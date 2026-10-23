// ===== Cấu hình & Biến toàn cục =====


const STICKMAN_ACTIONS = [
    { desc: "1", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(1).png" },
    { desc: "2", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(2).png" },
    { desc: "3", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(3).png" },
    { desc: "4", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(4).png" },
    { desc: "5", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(5).png" },
    { desc: "6", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(6).png" },
    { desc: "7", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(7).png" },
    { desc: "8", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(8).png" },
    { desc: "9", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(9).png" },
    { desc: "10", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(10).png" },
    { desc: "11", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(11).png" },
    { desc: "12", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(12).png" },
    { desc: "13", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(13).png" },
    { desc: "14", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(14).png" },
    { desc: "15", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(15).png" },
    { desc: "16", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(16).png" },
    { desc: "17", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(17).png" },
    { desc: "18", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(18).png" },
    { desc: "19", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(19).png" },
    { desc: "20", img: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/e%20(20).png" }
];

let gamePool = [];
let currentIndex = 0;
let voiceEng = null;
window.speechSynthesis.onvoiceschanged = () => {
    voiceEng = window.speechSynthesis.getVoices().find(v => v.lang === "en-US" && (v.name.includes("David") || v.name.includes("Google")));
};

function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'en-US';
    if (voiceEng) msg.voice = voiceEng;
    window.speechSynthesis.speak(msg);
}
// 1. Helper: Chuyển Unit dạng "3-1-1" thành số 3011 để so sánh
function normalizeUnitId(unitStr) {
    if (!unitStr) return 0;
    const parts = unitStr.split("-");
    if (parts.length < 3) return 0;
    return parseInt(parts[0], 10) * 1000 + parseInt(parts[1], 10) * 10 + parseInt(parts[2], 10);
}

// 2. Lấy Max Lesson Code theo lớp (Fetch lần 1)
async function getMaxLessonCode() {
    const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
    try {
        const res = await fetch(SHEET_BAI_HOC);
        const data = await res.json();
        const rows = data.rows || data;

        const baiList = rows.map((r) => {
            const lop = (r.c ? r.c[0]?.v : r[0])?.toString().trim();
            const bai = (r.c ? r.c[2]?.v : r[2])?.toString().trim();
            return lop === trainerClass && bai ? parseInt(bai, 10) : null;
        }).filter((v) => typeof v === "number");

        return baiList.length === 0 ? null : Math.max(...baiList);
    } catch (e) {
        console.error("Lỗi lấy maxLessonCode:", e);
        return null;
    }
}

// 3. Tải và lọc dữ liệu (Fetch lần 2)
async function fetchPhysicalData() {
    try {
        const maxCode = await getMaxLessonCode();
        const response = await fetch(SHEET_URL);
        const data = await response.json();
        const rows = data.rows || data;

        const selectedTopic = localStorage.getItem("selectedTopic") || "ALL";

        return rows.map(r => {
            const lessonName = (r.c ? r.c[1]?.v : r[1])?.toString() || "";
            const questionJ = (r.c ? r.c[9]?.v : r[9])?.toString() || "";   // Cột J
            const answerL = (r.c ? r.c[11]?.v : r[11])?.toString() || "";  // Cột L
            const topicValue = (r.c ? r.c[6]?.v : r[6])?.toString() || ""; // Cột G

            return {
                question: questionJ.trim(),
                answer: answerL.trim(),
                unitNum: normalizeUnitId(lessonName),
                topic: topicValue.trim()
            };
        }).filter(item => {
            const hasData = item.question && item.answer;
            const isInRange = item.unitNum >= 3011 && (maxCode ? item.unitNum <= maxCode : true);
            const matchesTopic = (selectedTopic === "ALL" || item.topic === selectedTopic);
            return hasData && isInRange && matchesTopic;
        });
    } catch (e) {
        console.error("Lỗi fetch dữ liệu:", e);
        return [];
    }
}

// ===== Bộ máy chọn hình ảnh KHÔNG TRÙNG LẶP (deck-based) =====
//
// Nguyên tắc: xáo (shuffle) toàn bộ 20 hình thành 1 "cỗ bài" (deck).
// Mỗi câu hỏi rút 2 hình từ đầu deck ra dùng -> hình đã rút sẽ KHÔNG
// xuất hiện lại cho tới khi hết cả cỗ bài (tức phải dùng hết 20 hình
// mới bắt đầu xáo lại), nên không bao giờ trùng hình trong 1 vòng.
//
// Vấn đề của bản cũ: khi cỗ bài cạn, code random lại từ đầu ngay lập
// tức, nên 2 hình vừa dùng ở câu NGAY TRƯỚC đó có thể bị random trúng
// lại cho câu NGAY SAU -> gây cảm giác "2 câu liền nhau trùng hình".
// Bản mới: khi xáo lại deck mới, sẽ tráo vị trí để đảm bảo các hình
// vừa dùng ở câu ngay trước không đứng ở đầu deck mới -> không trùng
// hình giữa 2 câu liên tiếp, kể cả lúc giao ranh giữa 2 vòng.

let imageDeck = [];
let lastUsedImages = [];

function shuffle(arr) {
    return arr
        .map(v => ({ v, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map(o => o.v);
}

function refillImageDeck() {
    imageDeck = shuffle(STICKMAN_ACTIONS);

    // Đảm bảo hình vừa dùng ở câu trước không nằm ở đầu deck mới
    for (let i = 0; i < imageDeck.length; i++) {
        if (lastUsedImages.includes(imageDeck[i].img)) {
            for (let j = imageDeck.length - 1; j > i; j--) {
                if (!lastUsedImages.includes(imageDeck[j].img)) {
                    [imageDeck[i], imageDeck[j]] = [imageDeck[j], imageDeck[i]];
                    break;
                }
            }
        }
    }
}

function getUnusedActions(count) {
    if (imageDeck.length < count) {
        refillImageDeck();
    }
    const selected = imageDeck.splice(0, count);
    lastUsedImages = selected.map(s => s.img);
    return selected;
}

// 2. Logic nâng cấp: Mỗi bài 1 câu, hết 1 lượt rồi mới quay lại
async function initGame() {
    const rawData = await fetchPhysicalData();
    if (rawData.length === 0) {
        document.getElementById("question").textContent = "Không có dữ liệu phù hợp!";
        return;
    }

    // NHÓM THEO BÀI (Unit)
    const groupedByUnit = {};
    rawData.forEach(item => {
        if (!groupedByUnit[item.unitNum]) groupedByUnit[item.unitNum] = [];
        groupedByUnit[item.unitNum].push(item);
    });

    const unitIds = Object.keys(groupedByUnit);
    gamePool = [];

    // Tạo danh sách câu hỏi: Lấy ngẫu nhiên 1 câu từ mỗi Unit
    unitIds.forEach(unitId => {
        const questionsInUnit = groupedByUnit[unitId];
        const randomQuestion = questionsInUnit[Math.floor(Math.random() * questionsInUnit.length)];

        // Logic tìm câu trả lời sai (vẫn giữ logic lấy từ Unit khác)
        let wrongPool = rawData.filter(d => d.unitNum !== randomQuestion.unitNum);
        if (wrongPool.length === 0) {
            wrongPool = rawData.filter(d => d.answer !== randomQuestion.answer);
        }
        const randomWrong = wrongPool[Math.floor(Math.random() * wrongPool.length)];

        // LẤY HÌNH ẢNH THEO DECK KHÔNG TRÙNG LẶP
        const actions = getUnusedActions(2);

        gamePool.push({
            question: randomQuestion.question,
            options: [
                { text: randomQuestion.answer, isCorrect: true, action: actions[0] },
                { text: randomWrong ? randomWrong.answer : "N/A", isCorrect: false, action: actions[1] }
            ].sort(() => 0.5 - Math.random())
        });
    });

    // TRỘN LẠI DANH SÁCH GAMEPOOL (Để thứ tự các bài học không bị cố định)
    gamePool.sort(() => 0.5 - Math.random());

    currentIndex = 0;
    renderQuestion();
}

// 3. Hàm renderQuestion (Giữ nguyên hoặc chỉnh sửa nhẹ)
function renderQuestion() {
    if (currentIndex >= gamePool.length) {
        // TỰ ĐỘNG KHỞI TẠI VÒNG MỚI KHI HẾT BÀI
        alert("🎉 Hết một lượt bài tập! Bắt đầu vòng mới với các câu hỏi khác.");
        initGame();
        return;
    }

    const current = gamePool[currentIndex];
    document.getElementById("question").textContent = current.question;
    document.getElementById("current-step").textContent = currentIndex + 1;
    document.getElementById("total-step").textContent = gamePool.length;

    current.options.forEach((opt, i) => {
        document.getElementById(`text-${i}`).textContent = opt.text;
        document.getElementById(`img-${i}`).src = opt.action.img;
        document.getElementById(`desc-${i}`).textContent = `(${opt.action.desc})`;
    });

    speak(current.question);
}

// 6. Kiểm tra đáp án
window.checkAnswer = function(idx) {
    const isCorrect = gamePool[currentIndex].options[idx].isCorrect;
    if (isCorrect) {
        currentIndex++;
        renderQuestion();
    } else {
        alert("❌ Sai rồi! Tập trung nhìn kỹ đáp án đúng nhé.");
    }
};

// Khởi động khi load trang
document.addEventListener("DOMContentLoaded", initGame);
