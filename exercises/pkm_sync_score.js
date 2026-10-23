/**
 * Đồng bộ điểm học tập (bao gồm cả Battle) lên Firebase "lop-hoc-thay-tinh"
 * Dùng logic giống hệt summary.js để đảm bảo học sinh xem ở đâu cũng ra cùng 1 kết quả.
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const LESSON_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
    authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
    projectId: "lop-hoc-thay-tinh",
    storageBucket: "lop-hoc-thay-tinh.firebasestorage.app",
    messagingSenderId: "391812475288",
    appId: "1:391812475288:web:ca4c275ac776d69deb23ed"
};

// Dùng tên riêng "lessonApp" để không đụng Firebase app khác (pokemon-capture) đang chạy song song
const lessonApp = getApps().find(a => a.name === "lessonApp")
    || initializeApp(LESSON_FIREBASE_CONFIG, "lessonApp");
const lessonDb = getFirestore(lessonApp);

// ✅ PHẢI giống hệt mảng "parts" trong summary.js
const PARTS_META = [
    { key: "vocabulary",    label: "Từ vựng" },
    { key: "image",         label: "Hình ảnh" },
    { key: "game",          label: "Trò chơi" },
    { key: "listening",     label: "Bài tập nghe" },
    { key: "speaking",      label: "Bài tập nói" },
    { key: "phonics",       label: "Phát âm" },
    { key: "overview",      label: "Bài viết" },
    { key: "communication", label: "Giao tiếp" },
    { key: "grade8",        label: "Bài tập cấp 2" },
    { key: "battle",        label: "⚔️ Chiến đấu (Battle)" }
];

// ✅ PHẢI giống hệt logic quy đổi tương đương trong summary.js
const BATTLE_EQUIVALENT_LABELS = ["Từ vựng", "Hình ảnh", "Trò chơi", "Bài tập nghe", "Bài tập nói", "Bài viết"];
const BATTLE_EQUIVALENT_SKILLS = ["Từ vựng", "Hình ảnh", "Trò chơi", "Nghe", "Nói", "Viết"];

const SKILL_GROUPS = {
    vocabulary: "Từ vựng", image: "Hình ảnh", game: "Trò chơi",
    listening: "Nghe", speaking: "Nói", phonics: "Phát âm",
    overview: "Viết", communication: "Giao tiếp", grade8: "Bài cấp 2"
};

// ✅ PHẢI giống hệt hàm getFullEvaluation trong summary.js
function getFullEvaluation({ totalScore, totalMax, completedParts, learnedGroups }) {
    const percentCorrect = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    const coveragePercent = Math.round((completedParts.length / 8) * 100);
    const skillPercent = Math.round((learnedGroups.size / 8) * 100);

    let effectiveness = percentCorrect < 50 ? "😕 Cần cố gắng" : percentCorrect < 70 ? "🙂 Khá" : percentCorrect < 90 ? "😃 Tốt" : "🏆 Tuyệt vời";
    let diligence = coveragePercent < 30 ? "⚠️ Học quá ít" : coveragePercent < 60 ? "🙂 Học chưa đủ" : coveragePercent < 90 ? "😃 Học khá đầy đủ" : "🏆 Học toàn diện";
    let skill = skillPercent < 40 ? "⚠️ Thiếu kỹ năng" : skillPercent < 70 ? "🙂 Chưa đủ nhóm" : skillPercent < 90 ? "😃 Đa kỹ năng" : "🏆 Kỹ năng toàn diện";

    const scoreMap = {
        "😕 Cần cố gắng": 1, "⚠️ Học quá ít": 1, "⚠️ Thiếu kỹ năng": 1,
        "🙂 Khá": 2, "🙂 Học chưa đủ": 2, "🙂 Chưa đủ nhóm": 2,
        "😃 Tốt": 3, "😃 Học khá đầy đủ": 3, "😃 Đa kỹ năng": 3,
        "🏆 Tuyệt vời": 4, "🏆 Học toàn diện": 4, "🏆 Kỹ năng toàn diện": 4
    };
    const scoreSum = [effectiveness, diligence, skill].reduce((s, r) => s + scoreMap[r], 0);

    let overall = scoreSum >= 11 ? "🏆 Tuyệt vời toàn diện" : scoreSum >= 9 ? "😃 Rất tốt" : scoreSum >= 7 ? "🙂 Tốt" : "⚠️ Cần cải thiện";
    return { overall };
}

function buildEntryFromLocalStorage() {
    const name = localStorage.getItem("trainerName") || "Không tên";
    const cls  = localStorage.getItem("trainerClass") || "0";

    let totalScore = 0, totalMax = 0;
    const completedParts = [];

    PARTS_META.forEach(({ key, label }) => {
        const r = JSON.parse(localStorage.getItem(`result_${key}`) || "null");
        totalScore += r?.score || 0;
        totalMax   += r?.total || 0;
        if ((r?.total || 0) > 0) completedParts.push(label);
    });

    // ✅ Cộng thêm điểm theo kỹ năng (pkm_skill_scores) — nguồn dùng chung giữa
    // Battle/Block và buổi học 5-module (all-shared.html), y hệt cách
    // summary.js đang cộng gộp 2 nguồn (legacy result_* + pkm_skill_scores).
    const skillScores = JSON.parse(localStorage.getItem("pkm_skill_scores") || "null") || {};
    const SKILL_TO_PART_LABEL = {
        intro: "Từ vựng", listening: "Bài tập nghe", speaking: "Bài tập nói",
        reading: "Đọc hiểu", writing: "Bài viết",
    };
    Object.entries(skillScores).forEach(([skillKey, s]) => {
        totalScore += s?.correct || 0;
        totalMax   += s?.total || 0;
        const label = SKILL_TO_PART_LABEL[skillKey];
        if (label && (s?.total || 0) > 0 && !completedParts.includes(label)) completedParts.push(label);
    });

    const battlePlayed = (JSON.parse(localStorage.getItem('result_battle'))?.total || 0) > 0;
    if (battlePlayed) {
        BATTLE_EQUIVALENT_LABELS.forEach(l => { if (!completedParts.includes(l)) completedParts.push(l); });
    }

    const learnedGroups = new Set();
    PARTS_META.forEach(({ key }) => {
        const r = JSON.parse(localStorage.getItem(`result_${key}`) || "null");
        if (r?.total > 0 && SKILL_GROUPS[key]) learnedGroups.add(SKILL_GROUPS[key]);
    });

    // ✅ Cộng thêm nhóm kỹ năng đã học từ pkm_skill_scores vào learnedGroups
    const SKILL_TO_GROUP_NAME = {
        intro: "Từ vựng", listening: "Nghe", speaking: "Nói",
        reading: "Đọc hiểu", writing: "Viết",
    };
    Object.entries(skillScores).forEach(([skillKey, s]) => {
        if ((s?.total || 0) > 0 && SKILL_TO_GROUP_NAME[skillKey]) learnedGroups.add(SKILL_TO_GROUP_NAME[skillKey]);
    });

    if (battlePlayed) BATTLE_EQUIVALENT_SKILLS.forEach(g => learnedGroups.add(g));

    const { overall } = getFullEvaluation({ totalScore, totalMax, completedParts, learnedGroups });

    const d = new Date();
    const dateCode = `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getFullYear()).slice(-2)}`;

    const startTimeGlobal = localStorage.getItem("startTime_global");
    const duration = startTimeGlobal
        ? Math.max(1, Math.floor((Date.now() - parseInt(startTimeGlobal)) / 60000))
        : 0;

    return {
        name, class: cls, score: totalScore, max: totalMax,
        doneParts: completedParts.length, rating: overall,
        date: dateCode, duration, parts: completedParts
    };
}

// ✅ Logic đẩy Firebase — copy y hệt saveStudentResultToFirebase trong summary.html
async function pushEntryToFirebase(entry) {
    const safeNum = (n) => Number.isFinite(n) ? n : 0;
    const sessionId = localStorage.getItem("startTime_global") || Date.now().toString();
    const partsArray = Array.isArray(entry.parts) ? entry.parts : [];

    const detailId = `${entry.name}_${entry.class}_${entry.date}_${sessionId}`;
    await setDoc(doc(lessonDb, "hocsinh", detailId), { ...entry, sessionId, parts: partsArray });

    const summaryRef = doc(lessonDb, "tonghop", `summary-${entry.class}-recent`);
    const snap = await getDoc(summaryRef);

    const computeTotals = (sessions) => {
        const list = Object.values(sessions || {});
        const allParts = new Set();
        list.forEach(s => (Array.isArray(s.parts) ? s.parts : []).forEach(p => allParts.add(p)));
        return {
            score: list.reduce((s,x)=>s+safeNum(x.score),0),
            max: list.reduce((s,x)=>s+safeNum(x.max),0),
            duration: list.reduce((s,x)=>s+safeNum(x.duration),0),
            doneParts: allParts.size,
            attempt: list.length
        };
    };

    if (snap.exists()) {
        const data = snap.data();
        const days = new Set(data.days || []);
        days.add(entry.date);
        const dayData = data.dayData || {};
        if (!dayData[entry.date]) dayData[entry.date] = {};

        let node = dayData[entry.date][entry.name] || {};
        if (!node.sessions) node.sessions = {};
        node.sessions[sessionId] = {
            score: safeNum(entry.score), max: safeNum(entry.max),
            duration: safeNum(entry.duration), rating: entry.rating, parts: partsArray
        };
        node.total = computeTotals(node.sessions);
        node.score = node.total.score;
        node.max = node.total.max;
        node.doneParts = node.total.doneParts;
        node.rating = entry.rating;
        dayData[entry.date][entry.name] = node;

        await updateDoc(summaryRef, {
            days: Array.from(days).sort((a,b)=>b.localeCompare(a)),
            dayData
        });
    } else {
        const sessions = { [sessionId]: {
            score: safeNum(entry.score), max: safeNum(entry.max),
            duration: safeNum(entry.duration), rating: entry.rating, parts: partsArray
        }};
        const total = computeTotals(sessions);
        const node = { sessions, total, score: total.score, max: total.max, doneParts: total.doneParts, rating: entry.rating };
        await setDoc(summaryRef, { days: [entry.date], dayData: { [entry.date]: { [entry.name]: node } } });
    }
}

// ✅ Hàm public để pkm.html / pkm_results.html gọi
window.syncLearningResultToFirebase = async function () {
    try {
        const entry = buildEntryFromLocalStorage();
        if (entry.max > 0) {
            await pushEntryToFirebase(entry);
            console.log("✅ [Sync] Đã đồng bộ điểm học tập (kể cả Battle) lên hệ thống.");
            return true;
        }
        console.log("ℹ️ [Sync] Chưa có dữ liệu điểm nào để đồng bộ.");
        return false;
    } catch (err) {
        console.error("❌ [Sync] Lỗi đồng bộ điểm:", err.message);
        return false;
    }
};