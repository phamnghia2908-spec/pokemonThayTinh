let score = 0; // 🏆 Tổng điểm
let correctCount = 0; // ✅ Số câu đúng
let wrongCount = 0; // ❌ Số câu sai
let words = [...new Set(JSON.parse(localStorage.getItem("wordBank")) || [])]; // 🛠️ Loại bỏ từ trùng nhau
let currentWordIndex = 0;
let exerciseIndex = 0;
let exercises = [];
let answeredQuestions = new Set(); // 🛠️ Lưu các câu đã làm để tránh tính điểm lại

async function fetchExercises() {
    let url = "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";

    try {
        let response = await fetch(url);
        let text = await response.text();
        let jsonData = JSON.parse(text.substring(47).slice(0, -2));

        let rows = jsonData.table.rows;

        rows.forEach((row, index) => { // 🛠️ Duyệt từng dòng trong Google Sheets
            let word = row.c[2]?.v || ""; // 🛠️ Lấy từ vựng từ cột 3

            if (words.includes(word)) { // 🛠️ Nếu từ vựng cần làm khớp
                exercises.push({ // 🛠️ Đưa vào danh sách bài tập theo đúng dòng của từ vựng
                    word: word,
                    index: index, // 🛠️ Lưu vị trí dòng trong Google Sheets
                    tasks: [
                        { type: "Chọn đáp án đúng", question: row.c[3]?.v, answer: row.c[4]?.v },
                        { type: "Sắp xếp từ thành câu", question: row.c[5]?.v, answer: row.c[6]?.v },
                        { type: "Tìm từ khác loại", question: row.c[7]?.v, answer: row.c[8]?.v },
                        { type: "Trả lời câu hỏi", question: row.c[9]?.v, answer: row.c[10]?.v },
                        { type: "Viết câu hỏi", question: row.c[11]?.v, answer: row.c[12]?.v },
                        { type: "Điền vào chỗ trống", question: row.c[13]?.v, answer: row.c[14]?.v },
                        { type: "Viết chính tả", question: row.c[15]?.v, answer: row.c[16]?.v },
                        { type: "Dịch Anh - Việt", question: row.c[17]?.v, answer: row.c[18]?.v }
                    ]
                });
            }
        });

        // 🆕 Lưu số lượng từ đã chốt vào localStorage
        console.log("🔍 Danh sách từ vựng đã chốt:", words);
        console.log("🔍 Tổng số từ cần ghép:", words.length);
        localStorage.setItem("totalWords", words.length);
        console.log("🔍 Đã lưu tổng số từ vào localStorage:", localStorage.getItem("totalWords"));

        loadExercise();
    } catch (error) {
        console.error("❌ Lỗi khi lấy dữ liệu:", error);
    }
}

// 📌 Hiển thị bài tập đầu tiên
function loadExercise() {
    if (currentWordIndex >= exercises.length) {
        document.getElementById("exerciseContainer").innerHTML = `
            <h3>🏆 Hoàn thành tất cả bài tập!</h3>
            <p>✅ Số câu đúng: ${correctCount}</p>
            <p>❌ Số câu sai: ${wrongCount}</p>
            <p>📌 Tổng số câu đã làm: ${correctCount + wrongCount}</p>
        `;
        return;
    }

    let ex = exercises[currentWordIndex]; // 🛠️ Lấy đúng bài tập theo dòng của từ vựng
    document.getElementById("currentWord").textContent = ex.word;

    if (exerciseIndex >= ex.tasks.length) {
        currentWordIndex++; // 🛠️ Chuyển sang từ vựng tiếp theo khi làm hết bài tập của từ hiện tại
        exerciseIndex = 0;
        loadExercise();
        return;
    }

    let task = ex.tasks[exerciseIndex]; // 🛠️ Hiển thị từng bài tập của từ đang làm
    document.getElementById("exerciseContainer").innerHTML = `
        <h3>${task.type}</h3>
        <p>${task.question || "❌ Không có bài tập"}</p>
        <input type="text" id="userAnswer" placeholder="Nhập câu trả lời">
    `;
}

// 📌 Hiển thị đáp án & chấm điểm
function showAnswer() {
    let ex = exercises[currentWordIndex];
    let task = ex.tasks[exerciseIndex];
    let userInput = document.getElementById("userAnswer").value.trim();
    let correctAnswer = task.answer.trim();
    let resultMessage = "";

    if (!answeredQuestions.has(`${currentWordIndex}-${exerciseIndex}`)) {
        answeredQuestions.add(`${currentWordIndex}-${exerciseIndex}`); // 🛠️ Đánh dấu câu đã làm

        if (userInput.toLowerCase() === correctAnswer.toLowerCase()) {
            score++;
            correctCount++;
            resultMessage = `<p>✅ Đúng! +1 điểm (Tổng điểm: ${score})</p>`;
        } else {
            wrongCount++;
            resultMessage = `<p>❌ Sai! Đáp án đúng: ${correctAnswer}</p>`;
        }
    } else {
        resultMessage = `<p>📌 Bạn đã làm câu này rồi, kết quả không thay đổi.</p>`;
    }

    document.getElementById("exerciseContainer").innerHTML += resultMessage;
    document.getElementById("statsContainer").innerHTML = `
        <h3>📊 Thống kê</h3>
        <p>✅ Số câu đúng: ${correctCount}</p>
        <p>❌ Số câu sai: ${wrongCount}</p>
        <p>📌 Tổng số câu đã làm: ${correctCount + wrongCount}</p>
    `;
}

// 📌 Quay lại bài tập trước
function previousExercise() {
    if (exerciseIndex > 0) {
        exerciseIndex--;
        loadExercise();
    }
}

// 📌 Chuyển bài tập tiếp theo
function nextExercise() {
    exerciseIndex++;
    loadExercise();
}

// 🚀 Gọi hàm khi tải trang
document.addEventListener("DOMContentLoaded", fetchExercises);

document.getElementById("gameButton").addEventListener("click", function() {
    window.location.href = "game.html"; 
});
