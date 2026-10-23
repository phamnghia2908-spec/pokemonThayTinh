/**
 * ==========================================
 * PKM SCORE SYSTEM — ghi điểm + thưởng EXP/DV dùng chung cho mọi game
 * ==========================================
 * Dùng chung cho pkm_battle.js, pkm_block.js, và mọi game Pokémon sau này.
 * Nạp file này (thẻ <script src="pkm_score.js">) TRƯỚC script của game.
 *
 * CÁCH DÙNG trong 1 game:
 *   1. Ngay trong callback của QuizManager.ask((isCorrect) => { ... }),
 *      gọi PkmScore.recordAnswer(isCorrect) — CHỈ gọi khi thật sự có 1 câu
 *      quiz vừa được hỏi.
 *   2. Lúc trận đấu/ván chơi KẾT THÚC (thắng hoặc thua), gọi:
 *
 *          const result = PkmScore.finishMatch({
 *              won: true/false,
 *              minQuestions: 10,   // (tuỳ chọn) số câu tối thiểu để được
 *                                  // tính là 1 ván hoàn chỉnh; mặc định 0
 *              unlockThreshold: 80,        // (tuỳ chọn) % đúng để mở khoá bài mới
 *              answerBonusDivisor: 2,      // (tuỳ chọn) chia số câu đúng ra thưởng
 *              loseFlatExp: 2, loseFlatDv: 2, // (tuỳ chọn) thưởng an ủi khi thua
 *          });
 *
 *      finishMatch() tự lo HẾT: ghi cộng dồn điểm kỹ năng (nếu đủ điều kiện),
 *      tính thưởng bài mới / số câu đúng / streak (nếu thắng) hoặc thưởng an
 *      ủi cố định (nếu thua), cộng dồn EXP/DV vào localStorage, rồi TRẢ VỀ
 *      dữ liệu thuần (không phải HTML) để game tự dựng UI theo ý mình:
 *
 *          {
 *            skipped: false,           // true nếu totalCount < minQuestions
 *            won, accuracy, correctCount, totalCount,
 *            bonusEXP, bonusDV, newEXP, newDV,
 *            isNewLesson, newLessonUnlocked, streak,
 *            breakdown: [ {type: 'new_lesson', exp, dv, accuracy}, ... ]
 *          }
 *
 *      Nếu skipped === true: KHÔNG có gì được ghi cả (không commitSession,
 *      không cộng EXP/DV) — coi như ván đó chưa tính.
 *
 * LƯU Ý QUAN TRỌNG: pkm_quiz.js (dùng chung, KHÔNG sửa) không lộ ra ngoài
 * "câu vừa hỏi thuộc kỹ năng nào" qua callback của ask(). Nhưng nó có biến
 * đếm nội bộ `skillCycleIndex` — tăng đúng 1 lần cho MỖI câu hỏi THẬT SỰ
 * được hỏi, xoay vòng đúng thứ tự SKILL_ORDER bên dưới.
 *
 * SKILL_ORDER dưới đây PHẢI khớp đúng thứ tự với SKILL_ORDER trong
 * pkm_quiz.js (hiện là ["listening","speaking","reading","writing"]).
 */

window.PkmScore = {
    SKILL_ORDER: ["listening", "speaking", "reading", "writing"],

    session: {
        correctCount: 0,
        wrongCount: 0,
        totalCount: 0,
        introRecorded: false, // đảm bảo "Giới thiệu" chỉ cộng đúng 1 lần / ván
        skillStats: {
            intro: { correct: 0, total: 0 },
            listening: { correct: 0, total: 0 },
            speaking: { correct: 0, total: 0 },
            reading: { correct: 0, total: 0 },
            writing: { correct: 0, total: 0 },
        },
    },

    // Gọi lúc bắt đầu 1 ván mới (không bắt buộc — hầu hết game hiện tại
    // tải lại trang mỗi ván nên session đã sạch sẵn từ đầu).
    reset() {
        this.session = {
            correctCount: 0,
            wrongCount: 0,
            totalCount: 0,
            introRecorded: false,
            skillStats: {
                intro: { correct: 0, total: 0 },
                listening: { correct: 0, total: 0 },
                speaking: { correct: 0, total: 0 },
                reading: { correct: 0, total: 0 },
                writing: { correct: 0, total: 0 },
            },
        };
    },

    // Suy ra kỹ năng của câu VỪA hỏi từ skillCycleIndex của QuizManager.
    getSkillJustAsked() {
        if (!window.QuizManager || typeof window.QuizManager.skillCycleIndex !== "number") return null;
        const order = this.SKILL_ORDER;
        const idx = ((window.QuizManager.skillCycleIndex - 1) % order.length + order.length) % order.length;
        return order[idx];
    },

    // Gọi ngay trong callback của QuizManager.ask((isCorrect) => ...).
    recordAnswer(isCorrect) {
        if (!this.session.introRecorded) {
            this.session.introRecorded = true;
            this.session.skillStats.intro.correct += 3;
            this.session.skillStats.intro.total += 3;
        }

        const skillName = this.getSkillJustAsked();
        this.session.totalCount++;
        if (isCorrect) this.session.correctCount++; else this.session.wrongCount++;
        if (skillName && this.session.skillStats[skillName]) {
            this.session.skillStats[skillName].total++;
            if (isCorrect) this.session.skillStats[skillName].correct++;
        }
        return skillName;
    },

    // Ghi cộng dồn kết quả của ván vừa chơi vào localStorage (điểm kỹ năng
    // + tổng điểm "Trò chơi") — KHÔNG đụng tới EXP/DV, đó là việc của
    // finishMatch() bên dưới. Có thể gọi độc lập nếu 1 game nào đó chỉ cần
    // ghi điểm kỹ năng mà không cần luồng thưởng EXP/DV chuẩn.
    commitSession() {
        try {
            const prevTotal = JSON.parse(localStorage.getItem("result_battle")) || { score: 0, total: 0 };
            const updatedTotal = {
                score: (prevTotal.score || 0) + this.session.correctCount,
                total: (prevTotal.total || 0) + this.session.totalCount,
            };
            localStorage.setItem("result_battle", JSON.stringify(updatedTotal));

            const defaultSkills = () => ({
                intro: { correct: 0, total: 0 },
                listening: { correct: 0, total: 0 },
                speaking: { correct: 0, total: 0 },
                reading: { correct: 0, total: 0 },
                writing: { correct: 0, total: 0 },
            });
            const prevSkills = JSON.parse(localStorage.getItem("pkm_skill_scores")) || defaultSkills();
            Object.keys(this.session.skillStats).forEach(skill => {
                if (!prevSkills[skill]) prevSkills[skill] = { correct: 0, total: 0 };
                prevSkills[skill].correct += this.session.skillStats[skill].correct;
                prevSkills[skill].total += this.session.skillStats[skill].total;
            });
            localStorage.setItem("pkm_skill_scores", JSON.stringify(prevSkills));

            if (!localStorage.getItem("startTime_global")) {
                localStorage.setItem("startTime_global", Date.now().toString());
            }

            console.log("📊 [PkmScore] Đã ghi cộng dồn:", updatedTotal, prevSkills);
        } catch (e) {
            console.error("❌ [PkmScore] Lỗi lưu kết quả:", e);
        }
    },

    // Dùng cho các game chia theo "vòng" (VD: Block Blast — cứ đủ N câu là
    // chốt 1 vòng, gọi finishMatch() rồi reset để vòng sau không bị tính
    // trùng số câu của vòng trước. CHỦ Ý giữ nguyên introRecorded — điểm
    // "Giới thiệu" chỉ nên cộng 1 lần cho CẢ VÁN (nhiều vòng), không phải
    // mỗi vòng cộng lại.
    resetForNewRound() {
        this.session.correctCount = 0;
        this.session.wrongCount = 0;
        this.session.totalCount = 0;
        this.session.skillStats = {
            intro: { correct: 0, total: 0 },
            listening: { correct: 0, total: 0 },
            speaking: { correct: 0, total: 0 },
            reading: { correct: 0, total: 0 },
            writing: { correct: 0, total: 0 },
        };
    },

    // Cập nhật chuỗi ngày chơi liên tục — CHỈ nên gọi khi THẮNG (finishMatch
    // tự gọi hàm này ở nhánh thắng). Trả về số ngày streak hiện tại.
    updateStreak() {
        const today = new Date().toISOString().slice(0, 10);
        const lastPlay = localStorage.getItem("pkm_last_play_date") || "";
        let streak = parseInt(localStorage.getItem("pkm_streak_days")) || 0;

        if (lastPlay === today) {
            // đã chơi hôm nay rồi -> giữ nguyên
        } else {
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            if (lastPlay === yesterday) streak++;
            else streak = 1;
            localStorage.setItem("pkm_last_play_date", today);
            localStorage.setItem("pkm_streak_days", streak);
        }
        return streak;
    },

    // ==========================================
    // KẾT THÚC 1 VÁN — ghi điểm + tính & cộng thưởng EXP/DV, trả về dữ
    // liệu thuần để game tự dựng UI.
    // ==========================================
    finishMatch(opts = {}) {
        const {
            won,
            minQuestions = 0,
            unlockThreshold = 80,
            answerBonusDivisor = 2,
            loseFlatExp = 2,
            loseFlatDv = 2,
        } = opts;

        const totalCount = this.session.totalCount;
        const correctCount = this.session.correctCount;

        if (totalCount < minQuestions) {
            // Chưa chơi đủ số câu tối thiểu -> KHÔNG tính là 1 ván hoàn
            // chỉnh: không ghi điểm kỹ năng, không thưởng gì cả.
            return {
                skipped: true,
                won, totalCount, minQuestions,
                bonusEXP: 0, bonusDV: 0,
                breakdown: [],
            };
        }

        // Ghi điểm/kỹ năng — dùng chung cho cả thắng lẫn thua, miễn đã đủ
        // số câu tối thiểu.
        this.commitSession();

        const missionData = localStorage.getItem("current_mission");
        const currentLessonId = missionData ? JSON.parse(missionData).id : null;
        let passedMaps = JSON.parse(localStorage.getItem("pkm_passed_maps")) || [];
        const currentEXP = parseInt(localStorage.getItem("pkm_global_exp")) || 0;
        const currentDV = parseInt(localStorage.getItem("pkm_global_dv")) || 0;
        const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

        let bonusEXP = 0, bonusDV = 0;
        let isNewLesson = false;
        let newLessonUnlocked = false;
        let streak = parseInt(localStorage.getItem("pkm_streak_days")) || 0;
        const breakdown = [];

        if (won) {
            // Thưởng 1: bài mới (cần đạt unlockThreshold% đúng)
            isNewLesson = !!(currentLessonId && !passedMaps.includes(currentLessonId));
            if (isNewLesson) {
                if (accuracy >= unlockThreshold) {
                    bonusEXP += 5; bonusDV += 5;
                    passedMaps.push(currentLessonId);
                    localStorage.setItem("pkm_passed_maps", JSON.stringify(passedMaps));
                    newLessonUnlocked = true;
                    breakdown.push({ type: "new_lesson", exp: 5, dv: 5, accuracy });
                } else {
                    breakdown.push({ type: "new_lesson_failed", accuracy, requiredAccuracy: unlockThreshold });
                }
            }

            // Thưởng 2: số câu đúng chia đôi (hoặc theo divisor tuỳ game)
            const reward2 = Math.round(correctCount / answerBonusDivisor);
            if (reward2 > 0) {
                bonusEXP += reward2; bonusDV += reward2;
                breakdown.push({ type: "correct_answers", correctCount, divisor: answerBonusDivisor, exp: reward2, dv: reward2 });
            }

            // Thưởng 3: chuyên cần (chuỗi ngày liên tục) — chỉ cập nhật/thưởng khi THẮNG
            streak = this.updateStreak();
            let streakBonus = 0;
            if (streak >= 30) streakBonus = 3;
            else if (streak >= 10) streakBonus = 2;
            else if (streak >= 4) streakBonus = 1;
            if (streakBonus > 0) { bonusEXP += streakBonus; bonusDV += streakBonus; }
            breakdown.push({ type: "streak", streak, exp: streakBonus, dv: streakBonus });
        } else {
            // Thua: thưởng an ủi cố định, không tính bài mới, không tính streak
            bonusEXP += loseFlatExp;
            bonusDV += loseFlatDv;
            breakdown.push({ type: "consolation", exp: loseFlatExp, dv: loseFlatDv });
        }

        const newEXP = currentEXP + bonusEXP;
        const newDV = currentDV + bonusDV;
        localStorage.setItem("pkm_global_exp", newEXP);
        localStorage.setItem("pkm_global_dv", newDV);

        console.log("🎁 [PkmScore] finishMatch:", { won, accuracy, bonusEXP, bonusDV, newEXP, newDV, breakdown });

        return {
            skipped: false,
            won, accuracy, correctCount, totalCount,
            bonusEXP, bonusDV, newEXP, newDV,
            isNewLesson, newLessonUnlocked, streak,
            breakdown,
        };
    },

    // ==========================================
    // KẾT THÚC 1 BUỔI HỌC 5-MODULE (all-shared.html) — không có thắng/thua
    // như Battle, luôn coi là hoàn thành khi được gọi (orchestrator chỉ gọi
    // sau khi chạy xong đủ cả 5 module). Dùng lại công thức thưởng của
    // finishMatch() + cộng thêm điểm "Trò chơi" cố định vì buổi học không
    // có mini-game riêng để tự sinh điểm phần đó.
    // ==========================================
    finishStudySession(opts = {}) {
        const {
            correctCount, totalCount,
            unlockThreshold = 80,
            answerBonusDivisor = 2,
            fixedGameScore = 10,
        } = opts;

        if (!totalCount || totalCount <= 0) {
            return { skipped: true, bonusEXP: 0, bonusDV: 0, breakdown: [] };
        }

        try {
            const prevGame = JSON.parse(localStorage.getItem("result_game")) || { score: 0, total: 0 };
            localStorage.setItem("result_game", JSON.stringify({
                score: (prevGame.score || 0) + fixedGameScore,
                total: (prevGame.total || 0) + fixedGameScore,
            }));
        } catch (e) { console.error("❌ [PkmScore] Lỗi ghi result_game:", e); }

        const missionData = localStorage.getItem("current_mission");
        const currentLessonId = missionData ? JSON.parse(missionData).id : null;
        let passedMaps = JSON.parse(localStorage.getItem("pkm_passed_maps")) || [];
        const currentEXP = parseInt(localStorage.getItem("pkm_global_exp")) || 0;
        const currentDV = parseInt(localStorage.getItem("pkm_global_dv")) || 0;
        const accuracy = Math.round((correctCount / totalCount) * 100);

        let bonusEXP = 0, bonusDV = 0;
        let isNewLesson = false, newLessonUnlocked = false;
        const breakdown = [];

        isNewLesson = !!(currentLessonId && !passedMaps.includes(currentLessonId));
        if (isNewLesson) {
            if (accuracy >= unlockThreshold) {
                bonusEXP += 5; bonusDV += 5;
                passedMaps.push(currentLessonId);
                localStorage.setItem("pkm_passed_maps", JSON.stringify(passedMaps));
                newLessonUnlocked = true;
                breakdown.push({ type: "new_lesson", exp: 5, dv: 5, accuracy });
            } else {
                breakdown.push({ type: "new_lesson_failed", accuracy, requiredAccuracy: unlockThreshold });
            }
        }

        const reward2 = Math.round(correctCount / answerBonusDivisor);
        if (reward2 > 0) {
            bonusEXP += reward2; bonusDV += reward2;
            breakdown.push({ type: "correct_answers", correctCount, divisor: answerBonusDivisor, exp: reward2, dv: reward2 });
        }

        const streak = this.updateStreak();
        let streakBonus = 0;
        if (streak >= 30) streakBonus = 3;
        else if (streak >= 10) streakBonus = 2;
        else if (streak >= 4) streakBonus = 1;
        if (streakBonus > 0) { bonusEXP += streakBonus; bonusDV += streakBonus; }
        breakdown.push({ type: "streak", streak, exp: streakBonus, dv: streakBonus });

        const newEXP = currentEXP + bonusEXP;
        const newDV = currentDV + bonusDV;
        localStorage.setItem("pkm_global_exp", newEXP);
        localStorage.setItem("pkm_global_dv", newDV);

        console.log("🎓 [PkmScore] finishStudySession:", { accuracy, bonusEXP, bonusDV, newEXP, newDV, breakdown });

return {
    skipped: false,
    accuracy, correctCount, totalCount,
    bonusEXP, bonusDV, newEXP, newDV,
    isNewLesson, newLessonUnlocked, streak,
    breakdown,
};
},

// ==========================================
// THƯỞNG CỐ ĐỊNH khi hoàn thành đủ 5 module (all-shared) — KHÔNG xét
// mở khoá bài mới/streak/số câu đúng như finishStudySession(), chỉ cần
// học xong hết module là +5 EXP +5 DV, học lại vẫn được thưởng như cũ.
// ==========================================
rewardCompletedSession(exp = 5, dv = 5) {
const currentEXP = parseInt(localStorage.getItem("pkm_global_exp")) || 0;
const currentDV = parseInt(localStorage.getItem("pkm_global_dv")) || 0;
const newEXP = currentEXP + exp;
const newDV = currentDV + dv;
localStorage.setItem("pkm_global_exp", newEXP);
localStorage.setItem("pkm_global_dv", newDV);
console.log("🎓 [PkmScore] rewardCompletedSession:", { exp, dv, newEXP, newDV });
return { bonusEXP: exp, bonusDV: dv, newEXP, newDV };
},
};