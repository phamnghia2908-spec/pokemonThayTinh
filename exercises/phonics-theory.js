// ✅ Hàm phát âm từ file mp3 trên GitHub
function playIPAFromText(text) {
  const match = text.match(/\/([^/]+)\//); // lấy phần giữa dấu gạch chéo
  const ipa = match?.[1];

  if (ipa) {
    const url = `https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/${encodeURIComponent(ipa)}.mp3`;
    const audio = new Audio(url);
    audio.play();
  } else {
    console.warn("Không tìm thấy IPA trong nút:", text);
  }
}

// ✅ Hàm cập nhật điểm hiển thị
function updatePhonicsScoreDisplay() {
  const scoreDisplay = document.getElementById("scoreValue");
  const raw = localStorage.getItem("result_phonics");
  if (raw) {
    const data = JSON.parse(raw);
    scoreDisplay.textContent = `${data.score}/${data.total}`;
  } else {
    scoreDisplay.textContent = "0/0";
  }
}

// ✅ Hàm cập nhật điểm Phonics vào result_phonics
function setResultPhonicsPart(mode, score, total) {
  const raw = localStorage.getItem("result_phonics");
  const prev = raw ? JSON.parse(raw) : {};

  const updated = {
    score1: mode === 1 ? score : prev.score1 || 0,
    score2: mode === 2 ? score : prev.score2 || 0,
    score3: mode === 3 ? score : prev.score3 || 0,
    total1: mode === 1 ? total : prev.total1 || 0,
    total2: mode === 2 ? total : prev.total2 || 0,
    total3: mode === 3 ? total : prev.total3 || 0
  };

  const totalScore = (updated.score1 || 0) + (updated.score2 || 0) + (updated.score3 || 0);
  const totalMax   = (updated.total1 || 0) + (updated.total2 || 0) + (updated.total3 || 0);

  localStorage.setItem("result_phonics", JSON.stringify({
    ...updated,
    score: totalScore,
    total: totalMax
  }));
}

// ✅ Gắn sự kiện click cho các nút âm thanh
document.addEventListener("DOMContentLoaded", () => {
  console.log("📦 Phonics lý thuyết đã sẵn sàng");

  // Hiển thị điểm tổng (score/total) từ result_phonics
  updatePhonicsScoreDisplay();

  // Tổng số câu đã làm thực tế (total1), đọc từ localStorage
  let totalDone = parseInt(localStorage.getItem("phonicsTheoryDone") || "0", 10);

  document.querySelectorAll(".sound-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const text = btn.textContent.trim();
      playIPAFromText(text);

      // Điểm thô hiện tại (dùng để cộng 0.25)
      const currentRaw = parseFloat(localStorage.getItem("phonicsTheoryScore") || "0");
      const roundedScore = Math.ceil(currentRaw);

      // Điểm tối đa là 20
      if (roundedScore >= 20) {
        console.log("🏁 Đã đạt tối đa 20 điểm. Không cộng thêm.");
        return;
      }

      // Cộng điểm phần này: +0.25, làm tròn lên, tối đa 20
      const updatedRaw = currentRaw + 0.25;
      const newRounded = Math.min(20, Math.ceil(updatedRaw));

      // Ghi lại điểm phần Phonics 1 (thô và làm tròn)
      localStorage.setItem("phonicsTheoryScore", updatedRaw.toFixed(2));
      localStorage.setItem("phonicsTheoryRounded", String(newRounded));

      // Tăng số câu đã làm thực tế (total1), và lưu
      totalDone += 1;
      localStorage.setItem("phonicsTheoryDone", String(totalDone));

      // Ghi vào result_phonics: Phonics 1 = mode 1
      // score1 = newRounded (thang 20), total1 = totalDone (số câu đã làm)
      // total1 = score1 (chính điểm đã đạt sau khi round)
      setResultPhonicsPart(1, newRounded, newRounded);


      // Cập nhật hiển thị tổng điểm (score/total)
      updatePhonicsScoreDisplay();

      console.log(`📚 Phonics 1: raw=${updatedRaw.toFixed(2)}, rounded=${newRounded}, done=${totalDone}`);
    });
  });
});

