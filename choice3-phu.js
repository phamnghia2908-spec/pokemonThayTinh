window.addEventListener("choice3:trigger", async () => {
  console.log("🏆 Bắt đầu chế độ cuộc thi cả lớp");

  const className = localStorage.getItem("trainerClass")?.trim().toLowerCase();

  if (!className) {
    alert("❌ Không tìm thấy lớp đã chọn. Vui lòng chọn lớp trước.");
    throw new Error("Không có trainerClass");
  }

  const docRef = window.doc(window.db, "test", className);

  try {
    const snapshot = await window.getDoc(docRef);
    if (!snapshot.exists()) {
      alert("❌ Không tìm thấy dữ liệu test cho lớp " + className);
      return;
    }

    const data = snapshot.data();
    const words = data.words || [];

    if (words.length === 0) {
      alert("📭 Không có từ vựng nào trong test của lớp " + className);
      return;
    }

    const wordBank = words.map(w => w.word).filter(Boolean);
    const shuffled = shuffleArray(wordBank);

    localStorage.setItem("wordBank", JSON.stringify(shuffled));
    localStorage.setItem("victoryTotalWords", shuffled.length);
    localStorage.setItem("selectedLesson", `Cuộc thi lớp ${className}`);

    console.log("📦 Từ vựng đã lấy từ test:", shuffled);
    window.location.href = "exercise.html";
  } catch (err) {
    console.error("❌ Lỗi khi lấy dữ liệu test:", err);
    alert("Không thể lấy dữ liệu test. Vui lòng thử lại sau.");
  }
});

// ✅ Xáo trộn từ vựng
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
