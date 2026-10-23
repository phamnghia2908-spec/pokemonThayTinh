// pikachuTalk.js
const frames = ["pikachuclose.png", "pikachuopen.png"];
let idx = 0;
let talkingInterval = null;

export function startTalking() {
  const imgEl = document.getElementById("pikachuImg");
  if (!imgEl) return;
  if (talkingInterval) clearInterval(talkingInterval);
  talkingInterval = setInterval(() => {
    imgEl.src = frames[idx];
    idx = (idx + 1) % frames.length;
  }, 300);
}

export function stopTalking() {
  clearInterval(talkingInterval);
  talkingInterval = null;
  const imgEl = document.getElementById("pikachuImg");
  if (imgEl) imgEl.src = frames[0]; // trở về miệng đóng
}