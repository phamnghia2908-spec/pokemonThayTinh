// 📌 URL API Google Sheets
let url = "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";
let wordBank = []; // Danh sách từ vựng đã chọn

// 📌 Hàm lấy dữ liệu từ Google Sheets
async function fetchGoogleSheetsData() {
    try {
        let response = await fetch(url);
        let text = await response.text();
        let jsonData = JSON.parse(text.substring(47).slice(0, -2));

        let rows = jsonData.table.rows;
        let unitSet = new Set();

        rows.forEach(row => {
            if (row.c[1]?.v) unitSet.add(row.c[1].v);
        });

        let unitList = document.getElementById("unitList");
        unitList.innerHTML = ""; // Xóa nội dung cũ nếu có

        unitSet.forEach(unit => {
            let label = document.createElement("label");
            label.style.display = "block";
            label.style.marginBottom = "8px";

            let checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = unit;

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(" " + unit));
            unitList.appendChild(label);
        });

    } catch (error) {
        console.error("❌ Lỗi khi tải dữ liệu:", error);
    }
}

// 📌 Hàm lấy danh sách từ vựng theo lựa chọn của người dùng
function loadWords() {
    let selectedUnits = Array.from(document.querySelectorAll('#unitList input[type="checkbox"]:checked'))
                             .map(cb => cb.value);

    wordBank = [];

    fetch(url).then(response => response.text()).then(text => {
        let jsonData = JSON.parse(text.substring(47).slice(0, -2));
        let rows = jsonData.table.rows;

        rows.forEach(row => {
            let unit = row.c[1]?.v || "";
            let word = row.c[2]?.v || "";

            if (selectedUnits.includes(unit)) {
                wordBank.push(word);
            }
        });

        wordBank = shuffleArray(wordBank);

        // Hiển thị từ vựng (dù có thể rỗng)
        document.getElementById("wordDisplay").innerHTML = wordBank.length > 0
            ? `<p>${wordBank.join(", ")}</p>`
            : `<p><i>Không có từ nào được chọn.</i></p>`;

        document.getElementById("exerciseButton").style.display = "block";
    });
}



// 📌 Hàm xáo trộn từ vựng
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// 📌 Hàm chuyển sang phần bài tập
function startExercises() {
    localStorage.setItem("wordBank", JSON.stringify(wordBank));
    localStorage.setItem("victoryTotalWords", wordBank.length);  // 🆕 Biến RIÊNG cho checkVictory
    console.log("🔍 Số từ phục vụ kiểm tra chiến thắng:", localStorage.getItem("victoryTotalWords"));

    // ✅ Lưu bài học đã chọn
    const selectedUnits = Array.from(document.querySelectorAll('#unitList input[type="checkbox"]:checked'))
                               .map(cb => cb.value);
    const selectedLesson = selectedUnits.join(", ");
    localStorage.setItem("selectedLesson", selectedLesson);

    window.location.href = "exercise.html";
}

// 🚀 Khởi chạy khi tải trang
document.addEventListener("DOMContentLoaded", function () {
    const unitList = document.getElementById("unitList");
    if (!unitList) {
        console.error("❌ Không tìm thấy phần tử unitList trong DOM.");
        return;
    }

    fetchGoogleSheetsData();
});
