// Khởi tạo localStorage với mảng từ vựng nếu chưa có
if (!localStorage.getItem("wordBank")) {
    localStorage.setItem("wordBank", JSON.stringify(["cat", "dog"]));
}
