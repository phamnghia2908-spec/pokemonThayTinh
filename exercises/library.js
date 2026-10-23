// library.js

// -------------------------------
// Danh sách background dự phòng
// -------------------------------
const backgroundImages = [
  "https://drive.google.com/uc?export=view&id=1nvn5_v4XSAh_4dRXpoIT0gOFMeTQfmKP"
];

// -------------------------------
// Hàm lấy hình nền ngẫu nhiên
// -------------------------------
function getRandomBackground() {
  return backgroundImages[Math.floor(Math.random() * backgroundImages.length)];
}

// -------------------------------
// Danh sách phản hồi dạng text khi trả lời đúng
// -------------------------------
const positiveResponses = [
  "Good job!",
  "Excellent!",
  "You're amazing!",
  "Fantastic!",
  "Well done!",
  "Superb!",
  "Great work!",
  "Awesome!",
  "Nice going!",
  "You're a star!"
];

// -------------------------------
// Danh sách phản hồi dạng text khi trả lời sai
// -------------------------------
const negativeResponses = [
  "Try again!",
  "Don't give up!",
  "You can do it!",
  "Keep going!",
  "Almost there!",
  "Stay strong!",
  "Give it another shot!",
  "Not quite, but you're learning!",
  "Keep practicing!",
  "You'll get it next time!"
];

// -------------------------------
// Hàm lấy phản hồi ngẫu nhiên dạng text
// -------------------------------
function getRandomResponse(isCorrect) {
  return isCorrect
    ? positiveResponses[Math.floor(Math.random() * positiveResponses.length)]
    : negativeResponses[Math.floor(Math.random() * negativeResponses.length)];
}

// -------------------------------
// Các link âm thanh cho đáp án đúng
// -------------------------------
const correctAudioURLs = [
  "https://ninjavanxuantruong.github.io/mp3vietnam2/excellent.mp3",
  "https://ninjavanxuantruong.github.io/mp3vietnam2/amazing.mp3",
  "https://ninjavanxuantruong.github.io/mp3vietnam2/fantastic.mp3",
  "https://ninjavanxuantruong.github.io/mp3vietnam2/well-done.mp3",
  "https://ninjavanxuantruong.github.io/mp3vietnam2/good-job.mp3"
];

// -------------------------------
// Các link âm thanh cho đáp án sai
// -------------------------------
const wrongAudioURLs = [
  "https://ninjavanxuantruong.github.io/mp3vietnam2/try-again.mp3",
  "https://ninjavanxuantruong.github.io/mp3vietnam2/dont-give-up.mp3",
  "https://ninjavanxuantruong.github.io/mp3vietnam2/you-can-do-it.mp3",
  "https://ninjavanxuantruong.github.io/mp3vietnam2/keep-going.mp3",
  "https://ninjavanxuantruong.github.io/mp3vietnam2/keep-practising.mp3"
];

// -------------------------------
// Hàm đọc phản hồi bằng giọng nói từ file âm thanh
// -------------------------------
function speakResponse(isCorrect) {
  let audioURL = isCorrect 
    ? correctAudioURLs[Math.floor(Math.random() * correctAudioURLs.length)] 
    : wrongAudioURLs[Math.floor(Math.random() * wrongAudioURLs.length)];

  const audio = new Audio(audioURL);
  audio.play().catch(err => console.error("Error playing audio:", err));
}

export { getRandomResponse, speakResponse, getRandomBackground };
export const ASSETS = {
  backgroundMusic: "https://ninjavanxuantruong.github.io/mp3vietnam2/Pokemon.mp3",
};
