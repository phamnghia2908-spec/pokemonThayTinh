// conversation.js
import { skillEffects } from "./skillEffects.js";
import { prefetchImagesBatch, getImageFromMap } from "./imageCache.js";

// ===== Config & state =====
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";

const wordBank = JSON.parse(localStorage.getItem("wordBank")) || [];

const A = document.getElementById("pokeA");
const B = document.getElementById("pokeB");
const wildContainer = document.getElementById("wild-container");

const bubbleTextA = document.getElementById("bubble-text-A");
const bubbleTextB = document.getElementById("bubble-text-B");
const bubbleImageA = document.getElementById("bubble-image-A");
const bubbleImageB = document.getElementById("bubble-image-B");

const flashcard = document.getElementById("flashcard");
const flashWord = document.getElementById("flashWord");
const flashPhonetic = document.getElementById("flashPhonetic");
const flashMeaning = document.getElementById("flashMeaning");
const flashImage = document.getElementById("flashImage");

let vocabData = [];
let currentIndex = 0;
let turnPhase = "ask"; // "ask" (A speaks) -> "answer" (B speaks)
let wildList = [];
let isAnimating = false;

// ===== Utilities =====
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function placeSpriteRandom(el) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = clamp(randInt(12, 88), 8, 92);
  const top = clamp(randInt(18, 82), 12, 88);
  el.style.left = left + "%";
  el.style.top = top + "%";
  el.style.animation = "appear 0.5s";
}
function vanishAndReappear(el) {
  return new Promise((resolve) => {
    el.style.animation = "vanish 0.35s";
    setTimeout(() => {
      placeSpriteRandom(el);
      resolve();
    }, 380);
  });
}
function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function highlightWord(sentence, vocabWord) {
  if (!sentence || !vocabWord) return sentence || "";
  const regex = new RegExp(`\\b(${vocabWord})\\b`, "gi");
  return sentence.replace(regex, `<span class="highlight">$1</span>`);
}
function positionBubbleAbove(bubble, sprite, offsetY = 70) {
  const r = sprite.getBoundingClientRect();
  bubble.style.left = `${r.left + r.width / 2}px`;
  bubble.style.top = `${r.top - offsetY}px`;
}
function positionImageBubbleAbove(bubble, sprite, offsetY = 160) {
  const r = sprite.getBoundingClientRect();
  bubble.style.left = `${r.left + r.width / 2}px`;
  bubble.style.top = `${r.top - offsetY}px`;
}
function hideAllBubbles() {
  [bubbleTextA, bubbleTextB, bubbleImageA, bubbleImageB].forEach((b) => {
    b.style.display = "none";
  });
}

// ===== PokeAPI =====
async function getRandomPokemon() {
  const id = randInt(1, 898); // Gen 1–8
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
  const data = await res.json();
  return {
    id: data.id,
    name: data.name,
    sprite: data.sprites?.other?.["official-artwork"]?.front_default || data.sprites?.front_default || "",
  };
}

// ===== Google Sheet data =====
async function fetchVocabularyData() {
  const response = await fetch(SHEET_URL);
  const text = await response.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));
  const rows = json.table.rows;

  const allWords = rows.map((row) => {
    const word = row.c[2]?.v?.trim() || "";
    const meaning = row.c[24]?.v?.trim() || "";
    const question = row.c[9]?.v?.trim() || "";  // J
    const answer = row.c[11]?.v?.trim() || "";   // L
    return { word, meaning, question, answer };
  });

  const filtered = allWords.filter((item) => wordBank.includes(item.word));
  const uniqueByWord = [];
  const seen = new Set();
  for (let item of filtered) {
    const key = item.word.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueByWord.push(item);
    }
  }
  return uniqueByWord;
}

function buildImageKeywords(data) {
  const set = new Set();
  for (const item of data) {
    [item.word].forEach((k) => {
      if (k) set.add(k.toLowerCase().trim());
    });
  }
  return Array.from(set);
}

// ===== Wild spawns =====
async function spawnWildPokemons(count = 6) {
  wildContainer.innerHTML = "";
  wildList = [];

  for (let i = 0; i < count; i++) {
    const wild = await getRandomPokemon();
    const img = document.createElement("img");
    img.src = wild.sprite;
    img.alt = wild.name;
    img.dataset.pokeId = String(wild.id);
    img.className = "poke-sprite poke-wild";

    // random quanh viền
    const side = randInt(0, 3);
    if (side === 0) {
      img.style.top = "5%";
      img.style.left = `${randInt(10, 90)}%`;
    } else if (side === 1) {
      img.style.top = "95%";
      img.style.left = `${randInt(10, 90)}%`;
    } else if (side === 2) {
      img.style.left = "5%";
      img.style.top = `${randInt(10, 90)}%`;
    } else {
      img.style.left = "95%";
      img.style.top = `${randInt(10, 90)}%`;
    }

    wildContainer.appendChild(img);
    wildList.push({ id: wild.id, name: wild.name });
  }
}


// Hàm typing effect
// ===== Typing helper (safe, plain text) =====
let typingTimers = new Map();

function typeTextSafe(el, fullText, speed = 60, onDone = () => {}) {
  // Hủy typing trước đó nếu còn
  const prevTimer = typingTimers.get(el);
  if (prevTimer) clearTimeout(prevTimer);

  el.textContent = ""; // gõ chữ thuần
  let i = 0;

  function step() {
    if (i < fullText.length) {
      el.textContent += fullText.charAt(i);
      i++;
      const t = setTimeout(step, speed);
      typingTimers.set(el, t);
    } else {
      typingTimers.delete(el);
      onDone();
    }
  }

  step();
}

// Tiện ích: highlight sau khi gõ xong
function typeThenHighlight(el, rawText, vocabWord, speed = 60) {
  typeTextSafe(el, rawText, speed, () => {
    // Sau khi gõ xong, thay nội dung bằng HTML đã highlight
    const highlighted = highlightWord(rawText, vocabWord) || rawText || "";
    el.innerHTML = highlighted;
  });
}


// ===== Bubbles =====
function showAskBubble(item) {
  const raw = item.question || "(No question)";
  positionBubbleAbove(bubbleTextA, A, 80);
  bubbleTextA.style.display = "block";

  // Gõ từng ký tự (textContent), xong rồi mới highlight
  typeThenHighlight(bubbleTextA, raw, item.word, 60);
}


function showAnswerBubble(item) {
  const raw = item.answer || "(No answer)";

  // Bubble chữ bên trái sprite B
  positionBubbleAbove(bubbleTextB, B, 80);
  bubbleTextB.style.transform = "translateX(-90%)";
  bubbleTextB.style.display = "block";

  // Gõ từng ký tự (textContent), xong rồi mới highlight
  typeThenHighlight(bubbleTextB, raw, item.word, 60);

  // Bubble ảnh bên phải (gần hơn)
  const imgUrl = getImageFromMap(item.word);
  console.log("Image URL:", imgUrl); // kiểm tra trên điện thoại

  if (imgUrl) {
    bubbleImageB.innerHTML = `<img src="${imgUrl}" alt="${item.word}" />`;
    positionImageBubbleAbove(bubbleImageB, B, 40);
    bubbleImageB.style.transform = "translateX(40%)";
    bubbleImageB.style.display = "block";
  } else {
    bubbleImageB.style.display = "none";
  }

}



async function replaceWild(targetEl) {
  return new Promise(async (resolve) => {
    // Animation biến mất
    targetEl.style.animation = "wildVanish 0.6s forwards";
    setTimeout(async () => {
      // Xóa khỏi DOM và wildList
      const id = targetEl.dataset.pokeId;
      wildList = wildList.filter(w => String(w.id) !== id);
      targetEl.remove();

      // Spawn 1 wild mới
      const wild = await getRandomPokemon();
      const img = document.createElement("img");
      img.src = wild.sprite;
      img.alt = wild.name;
      img.dataset.pokeId = String(wild.id);
      img.className = "poke-sprite poke-wild";

      // random quanh viền
      const side = randInt(0, 3);
      if (side === 0) {
        img.style.top = "5%";
        img.style.left = `${randInt(10, 90)}%`;
      } else if (side === 1) {
        img.style.top = "95%";
        img.style.left = `${randInt(10, 90)}%`;
      } else if (side === 2) {
        img.style.left = "5%";
        img.style.top = `${randInt(10, 90)}%`;
      } else {
        img.style.left = "95%";
        img.style.top = `${randInt(10, 90)}%`;
      }

      wildContainer.appendChild(img);
      wildList.push({ id: wild.id, name: wild.name });
      resolve();
    }, 600); // sau khi animation xong
  });
}

// ===== Skills =====
async function castSkillAtRandomWild(attackerEl) {
  if (!wildList.length) return;

  const targetMeta = wildList[randInt(0, wildList.length - 1)];
  const targetEl = wildContainer.querySelector(`img[data-poke-id="${targetMeta.id}"]`);
  if (!attackerEl || !targetEl) return;

  const skillNames = Object.keys(skillEffects);
  const skillName = skillNames[randInt(0, skillNames.length - 1)];
  const fn = skillEffects[skillName];
  if (typeof fn !== "function") return;

  const from = centerOf(attackerEl);
  const to = centerOf(targetEl);

  // Hiệu ứng attack pose cho attacker
  attackerEl.style.animation = "attackPose 0.8s";

  // Gọi skill effect (bay tới mục tiêu)
  fn(document.body, { x: from.x, y: from.y, targetX: to.x, targetY: to.y });

  // ⏳ Delay ~700ms để skill tới mục tiêu rồi mới biến mất
  setTimeout(() => {
    replaceWild(targetEl);
  }, 1800);
}




let voiceMale = null;
let voiceFemale = null;

function getVoices() {
  return new Promise(resolve => {
    const list = speechSynthesis.getVoices();
    if (list.length) return resolve(list);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}

function speak(text, voice) {
  if (!text || !voice) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.voice = voice;
  utter.rate = 1;
  utter.pitch = 1;
  speechSynthesis.speak(utter);
}

// Load voices and pick by priority
getVoices().then(voices => {
  // Nam: David → Alex → male → en-US
  voiceMale =
    voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("david")) ||
    voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("alex")) ||
    voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("male")) ||
    voices.find(v => v.lang === "en-US");

  // Nữ: Zira → Samantha → female → en-US
  voiceFemale =
    voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("zira")) ||
    voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("samantha")) ||
    voices.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("female")) ||
    voices.find(v => v.lang === "en-US");
});
function bindMainClicks() {
  A.onclick = async () => {
    if (turnPhase !== "ask") return;
    const item = vocabData[currentIndex];
    hideAllBubbles();
    showAskBubble(item);
    castSkillAtRandomWild(A);

    // Đọc câu hỏi: dùng giọng nữ (voiceFemale)
    speak(item.question, voiceFemale);

    turnPhase = "answer";
  };

  B.onclick = async () => {
    if (turnPhase !== "answer") return;
    const item = vocabData[currentIndex];
    hideAllBubbles();
    showAnswerBubble(item);
    castSkillAtRandomWild(B);

    // Đọc câu trả lời: dùng giọng nam (voiceMale)
    speak(item.answer, voiceMale);

    isAnimating = true;
    setTimeout(async () => {
      hideAllBubbles();
      await Promise.all([vanishAndReappear(A), vanishAndReappear(B)]);
      isAnimating = false;
      currentIndex = (currentIndex + 1) % vocabData.length;
      turnPhase = "ask";
    }, 2000);
  };
}


// ===== Init =====
async function init() {
  // 1) Load vocab data
  vocabData = await fetchVocabularyData();
  if (!vocabData.length) {
    console.warn("No vocab data found for wordBank.");
    // fallback: still allow interactions but with placeholders
    vocabData = [{ word: "apple", meaning: "quả táo", question: "What is this?", answer: "This is an apple." }];
  }

  // 2) Prefetch images by word
  const keywords = buildImageKeywords(vocabData);
  if (keywords.length) {
    try { await prefetchImagesBatch(keywords); } catch (e) { /* ignore */ }
  }

  // 3) Random 2 main Pokémon
  const pokeA = await getRandomPokemon();
  const pokeB = await getRandomPokemon();
  A.src = pokeA.sprite;
  B.src = pokeB.sprite;
  A.dataset.pokeId = String(pokeA.id);
  B.dataset.pokeId = String(pokeB.id);

  // 4) Place them randomly
  placeSpriteRandom(A);
  placeSpriteRandom(B);

  // 5) Spawn wilds on edges
  await spawnWildPokemons(randInt(5, 6));

  // 6) Bind clicks
  bindMainClicks();

  // 7) Initial phase
  hideAllBubbles();
  turnPhase = "ask";
}

window.addEventListener("DOMContentLoaded", init);
