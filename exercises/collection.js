import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// App 1: Pokémon (bosuutap)
const pokemonConfig = {
  apiKey: "AIzaSyCCVdzWiiFvcWiHVJN-x33YKarsjyziS8E",
  authDomain: "pokemon-capture-10d03.firebaseapp.com",
  projectId: "pokemon-capture-10d03",
  storageBucket: "pokemon-capture-10d03.firebasestorage.app",
  messagingSenderId: "1068125543917",
  appId: "1:1068125543917:web:57de4365ee56729ea8dbe4"
};
const pokemonApp = initializeApp(pokemonConfig, "pokemonApp");
const dbPokemon = getFirestore(pokemonApp);

// App 2: Lớp học thầy Tình (tonghop)
const lopHocConfig = {
  apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
  authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
  projectId: "lop-hoc-thay-tinh",
  storageBucket: "lop-hoc-thay-tinh.firebasestorage.app",
  messagingSenderId: "391812475288",
  appId: "1:391812475288:web:ca4c275ac776d69deb23ed"
};
const lopHocApp = initializeApp(lopHocConfig, "lopHocApp");
const dbLopHoc = getFirestore(lopHocApp);

// ✅ Import dữ liệu Pokémon
import { pokemonData } from './pokemonData.js';

// ✅ Hàm chọn Pokémon theo tiến hoá và tỉ lệ
function getNextPokemonToCapture(currentList = []) {
  const owned = new Set(currentList);
  const stage1 = pokemonData.filter(p => p.stage === 1);
  const stage2 = pokemonData.filter(p => p.stage === 2);
  const stage3 = pokemonData.filter(p => p.stage === 3);

  if (currentList.length === 0) {
    const starters = stage1.filter(p => !p.evolvesFrom || p.name === "Pikachu");
    const chosen = starters[Math.floor(Math.random() * starters.length)];
    console.log(`🎯 Thu phục khởi đầu: ${chosen.name}`);
    return chosen;
  }

  const evolvable = pokemonData.filter(p => {
    return p.evolvesFrom && owned.has(p.evolvesFrom) && !owned.has(p.id);
  });

  const evolvableStage2 = evolvable.filter(p => p.stage === 2);
  const evolvableStage3 = evolvable.filter(p => {
    const from = pokemonData.find(x => x.id === p.evolvesFrom);
    return p.stage === 3 && from && owned.has(from.id);
  });

  const pool = [];

  for (let i = 0; i < 6; i++) {
    const candidates = stage1.filter(p => !owned.has(p.id));
    if (candidates.length) pool.push(candidates[Math.floor(Math.random() * candidates.length)]);
  }

  for (let i = 0; i < 3; i++) {
    if (evolvableStage2.length) pool.push(evolvableStage2[Math.floor(Math.random() * evolvableStage2.length)]);
  }

  for (let i = 0; i < 1; i++) {
    if (evolvableStage3.length) pool.push(evolvableStage3[Math.floor(Math.random() * evolvableStage3.length)]);
  }

  const finalPool = pool.filter(Boolean);
  const selected = finalPool[Math.floor(Math.random() * finalPool.length)];
  console.log(`🎯 Đã chọn từ pool: ${selected.name} (stage ${selected.stage})`);
  return selected;
}

// ✅ Lấy tên và lớp từ localStorage
const studentName = localStorage.getItem("trainerName") || "Không tên";
const studentClass = localStorage.getItem("trainerClass") || "Chưa có lớp";
document.getElementById("studentName").textContent = studentName;

// ✅ Tạo document ID
const docId = `${studentName}-${studentClass}`;

// ✅ Lấy sao từ điểm hôm qua trong tonghop (lop-hoc-thay-tinh) rồi cộng vào bosuutap (pokemon-capture-10d03)
async function updateStarsFromYesterday() {
  try {
    const name = localStorage.getItem("trainerName") || "Không tên";
    const clazz = localStorage.getItem("trainerClass") || "Chưa có lớp";

    const pad = n => String(n).padStart(2, "0");
    const now = new Date();
    const todayCode = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${String(now.getFullYear()).slice(-2)}`;
    const yesterday = new Date(now.getTime() - 86400000);
    const yesterdayCode = `${pad(yesterday.getDate())}${pad(yesterday.getMonth() + 1)}${String(yesterday.getFullYear()).slice(-2)}`;

    console.log(`📅 Hôm nay: ${todayCode} | Hôm qua: ${yesterdayCode} | HS: ${name} | Lớp: ${clazz}`);

    // Lấy điểm từ project lop-hoc-thay-tinh
    const refSummary = doc(dbLopHoc, "tonghop", `summary-${clazz}-recent`);
    const snapSummary = await getDoc(refSummary);

    if (!snapSummary.exists()) {
      console.warn(`⚠️ Không tìm thấy doc tonghop/summary-${clazz}-recent`);
      alert("⚠️ Không tìm thấy dữ liệu tổng hợp của lớp.");
      return;
    }

    const summaryData = snapSummary.data();
    const dayBucket = summaryData.dayData?.[yesterdayCode];
    if (!dayBucket || !dayBucket[name]) {
      console.warn(`⚠️ Không có dữ liệu cho ${name} ngày ${yesterdayCode}`);
      alert("📭 Hôm qua bạn không làm bài, không có sao nào được cộng.");
      return;
    }

    const score = parseInt(dayBucket[name].score || 0, 10);
    console.log(`📦 Điểm hôm qua của ${name}: ${score}`);

    // ✅ Cộng sao vào project pokemon-capture-10d03
    const id = `${name}-${clazz}`;
    const refCollection = doc(dbPokemon, "bosuutap", id);

    // Lấy dữ liệu cũ (nếu có)
    const snapCollection = await getDoc(refCollection);
    const oldData = snapCollection.exists() ? snapCollection.data() : {};

    // Nếu hôm nay đã cộng rồi thì bỏ qua
    if (oldData.lastStarUpdate === todayCode) {
      console.log(`⏳ Hôm nay (${todayCode}) đã cộng sao rồi. Bỏ qua.`);
      alert("⏳ Hôm nay bạn đã được cộng sao rồi, không cộng lại nữa.");
      return;
    }

    // Tính số sao mới
    const previousStars = parseInt(oldData.stars || 0, 10);
    const newStars = previousStars + score;

    // Ghi lại dữ liệu mới
    await setDoc(refCollection, {
      ...oldData,
      stars: newStars,
      lastStarUpdate: todayCode
    });

    // Cập nhật giao diện
    const starEl = document.getElementById("starCount");
    if (starEl) starEl.textContent = newStars;

    if (score > 0) {
      alert(`✅ Bạn đã được cộng ${score} sao từ hôm qua (${yesterdayCode}). ⭐ Tổng mới: ${newStars}`);
    } else {
      alert("ℹ️ Hôm qua bạn làm nhưng không được sao nào.");
    }

    console.log(`✅ Đã cộng ${score} sao từ ngày ${yesterdayCode}. ⭐ Tổng mới: ${newStars}`);
  } catch (error) {
    console.error("❌ Lỗi khi cập nhật sao:", error.message);
    alert("❌ Có lỗi khi cập nhật sao. Vui lòng thử lại sau.");
  }
}

// ✅ Hàm tải dữ liệu từ Firebase và hiển thị bộ sưu tập
async function loadCollection() {
  console.log("📥 Đang tải dữ liệu bộ sưu tập Pokémon...");

  try {
    // Dùng dbPokemon (project pokemon-capture-10d03)
    const ref = doc(dbPokemon, "bosuutap", docId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn("⚠️ Không tìm thấy dữ liệu học sinh:", docId);
      return;
    }

    const data = snap.data();
    console.log("📦 Dữ liệu bộ sưu tập:", data);

    document.getElementById("starCount").textContent = data.stars || 0;

    const container = document.getElementById("pokemonCollection");
    container.innerHTML = "";

    (data.pokemons || []).forEach(id => {
      const imgURL = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
      const card = document.createElement("div");
      card.className = "pokemon-card";
      card.innerHTML = `<img src="${imgURL}" /><div>#${id}</div>`;
      container.appendChild(card);
    });

    console.log("✅ Đã hiển thị bộ sưu tập Pokémon");
    renderCapturedPokemons(data);

    // ✅ Gọi cập nhật sao sau khi tải xong
    updateStarsFromYesterday();
  } catch (error) {
    console.error("❌ Lỗi khi tải dữ liệu Firebase:", error.message);
  }
}

loadCollection();

// ✅ Bắt đầu quy trình thu phục Pokémon
document.getElementById("startCaptureBtn").addEventListener("click", async () => {
  console.log("🎯 Bắt đầu kiểm tra điều kiện thu phục...");

  // Dùng dbPokemon
  const ref = doc(dbPokemon, "bosuutap", docId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    alert("❌ Không tìm thấy dữ liệu học sinh.");
    return;
  }

  const data = snap.data();
  const currentStars = data.stars || 0;
  const today = new Date().toISOString().slice(0, 10);

  if (currentStars < 500) {
    alert("❌ Bạn chưa đủ 500 sao để thu phục Pokémon.");
    console.log("❌ Không đủ sao để thu phục.");
    return;
  }

  // ✅ Trừ 500 sao và ghi lại
  const newStars = currentStars - 500;
  await setDoc(ref, {
    ...data,
    stars: newStars,
    lastCaptureDate: today
  });

  document.getElementById("starCount").textContent = newStars;
  console.log(`✅ Đã trừ 500 sao. Còn lại: ${newStars}`);
  console.log("🧠 Bắt đầu tạo quiz thu phục...");

  // ✅ Tạo quiz từ dữ liệu lớp và bài học
  const trainerClass = localStorage.getItem("trainerClass")?.trim();
  console.log(`📦 Lớp hiện tại từ localStorage: ${trainerClass}`);

  const SHEET_BAI_HOC = "https://docs.google.com/spreadsheets/d/1xdGIaXekYFQqm1K6ZZyX5pcrmrmjFdSgTJeW27yZJmQ/gviz/tq?tqx=out:json";
  const res1 = await fetch(SHEET_BAI_HOC);
  const text1 = await res1.text();
  const json1 = JSON.parse(text1.substring(47).slice(0, -2));
  const rows1 = json1.table.rows;

  const baiList = rows1
    .map(r => {
      const lop = r.c[0]?.v?.toString().trim();
      const bai = r.c[2]?.v?.toString().trim();
      return lop === trainerClass && bai ? parseInt(bai) : null;
    })
    .filter(v => typeof v === "number");

  if (baiList.length === 0) {
    console.warn(`⚠️ Không tìm thấy bài học nào cho lớp ${trainerClass}`);
    return;
  }

  const maxLessonCode = Math.max(...baiList);
  console.log(`📈 Bài lớn nhất của lớp ${trainerClass}: ${maxLessonCode}`);

  // ✅ Truy vấn Sheet từ vựng
  const SHEET_TU_VUNG = "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";
  const res2 = await fetch(SHEET_TU_VUNG);
  const text2 = await res2.text();
  const json2 = JSON.parse(text2.substring(47).slice(0, -2));
  const rows2 = json2.table.rows.slice(1); // ✅ Bỏ dòng đầu tiên

  const baiTuVung = {};
  rows2.forEach(r => {
    const rawCode = r.c[1]?.v?.toString().trim();
    const word = r.c[2]?.v?.toString().trim();
    const meaning = r.c[24]?.v?.toString().trim();

    const normalizedCode = parseInt(rawCode?.replace(/\D/g, ""));
    if (!normalizedCode || normalizedCode > maxLessonCode || !word || !meaning) return;

    if (!baiTuVung[normalizedCode]) baiTuVung[normalizedCode] = [];
    baiTuVung[normalizedCode].push({ word, meaning });
  });

  const allCodes = Object.keys(baiTuVung).map(c => parseInt(c));
  console.log("📚 Các mã bài hợp lệ:", allCodes);

  const shuffledCodes = allCodes.sort(() => Math.random() - 0.5).slice(0, 20);
  console.log("🎯 Các bài được chọn:", shuffledCodes);

  const usedMeanings = new Set();
  const quizItems = [];

  shuffledCodes.forEach(code => {
    const words = baiTuVung[code];
    if (!words || words.length === 0) return;

    const candidates = words.filter(w => !usedMeanings.has(w.meaning));
    if (candidates.length === 0) return;

    const item = candidates[Math.floor(Math.random() * candidates.length)];
    usedMeanings.add(item.meaning);
    quizItems.push(item);
  });

  console.log(`✅ Đã tạo quiz gồm ${quizItems.length} từ vựng.`);

  // ✅ Hiển thị quiz
  const container = document.getElementById("quizContainer");
  container.innerHTML = "";
  document.getElementById("quizSection").style.display = "block";

  quizItems.forEach((item, index) => {
    const allMeanings = rows2
      .map(r => r.c[24]?.v?.toString().trim())
      .filter(m => m && m !== item.meaning);

    const wrongOptions = allMeanings.sort(() => Math.random() - 0.5).slice(0, 3);
    const allOptions = [...wrongOptions, item.meaning].sort(() => Math.random() - 0.5);

    const div = document.createElement("div");
    div.className = "quiz-item";
    div.innerHTML = `<strong>Câu ${index + 1}:</strong> Nghĩa của "<em>${item.word}</em>"<br/>`;

    allOptions.forEach((opt, i) => {
      const label = String.fromCharCode(65 + i);
      div.innerHTML += `
        <label>
          <input type="radio" name="q${index}" value="${opt}" data-correct="${item.meaning}" />
          ${label}. ${opt}
        </label><br/>
      `;
    });

    container.appendChild(div);
  });

  console.log(`✅ Đã tạo quiz từ ${shuffledCodes.length} bài, mỗi bài 1 từ.`);
});

// Nút nộp bài quiz
document.getElementById("submitQuizBtn").addEventListener("click", async () => {
  const radios = document.querySelectorAll("input[type=radio]:checked");
  let correctCount = 0;

  radios.forEach(r => {
    if (r.value === r.dataset.correct) correctCount++;
  });

  const totalQuestions = document.querySelectorAll(".quiz-item").length;
  const passThreshold = Math.ceil(totalQuestions * 0.8);

  console.log(`📊 Số câu đúng: ${correctCount}/${totalQuestions} | Yêu cầu: ≥${passThreshold}`);

  if (correctCount >= passThreshold) {
    // Dùng dbPokemon
    const ref = doc(dbPokemon, "bosuutap", docId);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const currentList = data.pokemons || [];
    const owned = new Set(currentList);

    const newPokemonObj = getNextPokemonToCapture(currentList);
    const newPokemon = newPokemonObj.id;
    let updatedList = [...currentList];
    let message = "";

    if (newPokemonObj.evolvesFrom && owned.has(newPokemonObj.evolvesFrom)) {
      updatedList = updatedList.filter(id => id !== newPokemonObj.evolvesFrom);
      message = `✨ Tiến hoá lên ${newPokemonObj.name}!`;
      console.log(`🔁 Tiến hoá: ${newPokemonObj.evolvesFrom} → ${newPokemon}`);
    } else {
      message = `✅ Thu phục thành công ${newPokemonObj.name}!`;
      console.log(`🆕 Thu phục mới: ${newPokemonObj.name}`);
    }

    updatedList.push(newPokemon);

    await setDoc(ref, {
      ...data,
      pokemons: updatedList,
      selected: newPokemon,
      stage: newPokemonObj.stage
    });

    // ✅ Tạo hiệu ứng PokéBall
    const pokeball = document.createElement('img');
    pokeball.src = 'https://cdn-icons-png.flaticon.com/512/361/361998.png';
    pokeball.alt = 'PokéBall';
    pokeball.style.position = 'fixed';
    pokeball.style.top = '50%';
    pokeball.style.left = '50%';
    pokeball.style.transform = 'translate(-50%, -50%)';
    pokeball.style.height = '120px';
    pokeball.style.zIndex = '1000';
    pokeball.style.animation = 'shake 1s ease-in-out 3';
    document.body.appendChild(pokeball);

    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes shake {
        0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
        25% { transform: translate(-50%, -50%) rotate(10deg); }
        50% { transform: translate(-50%, -50%) rotate(-10deg); }
        75% { transform: translate(-50%, -50%) rotate(10deg); }
      }
      @keyframes summon {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
      }
    `;
    document.head.appendChild(style);

    // ✅ Hiện Pokémon sau hiệu ứng
    setTimeout(() => {
      pokeball.remove();

      const pokemonImg = document.createElement('img');
      pokemonImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${newPokemon}.png`;
      pokemonImg.alt = newPokemonObj.name;
      pokemonImg.style.position = 'fixed';
      pokemonImg.style.top = '50%';
      pokemonImg.style.left = '50%';
      pokemonImg.style.transform = 'translate(-50%, -50%)';
      pokemonImg.style.height = '140px';
      pokemonImg.style.zIndex = '1000';
      pokemonImg.style.animation = 'summon 0.6s ease-out';
      document.body.appendChild(pokemonImg);

      setTimeout(() => {
        alert(message);
        window.location.reload();
      }, 1000);
    }, 3000);
  } else {
    alert("❌ Bạn chưa đủ điểm để thu phục Pokémon.");
    console.log("❌ Không vượt qua bài kiểm tra.");

    document.getElementById("quizSection").style.display = "none";
    document.getElementById("quizContainer").innerHTML = "";
  }
});

function renderCapturedPokemons(data) {
  const container = document.getElementById("pokemonCollection");
  const infoBox = document.getElementById("selectedPokemonInfo");
  container.innerHTML = "";
  infoBox.textContent = "";

  const captured = data.pokemons || [];
  const selectedId = data.selected;

  captured.forEach(id => {
    const p = pokemonData.find(p => p.id === id);
    if (!p) return;

    const card = document.createElement("div");
    card.className = "pokemon-card";
    card.innerHTML = `
      <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png" alt="${p.name}" class="pokemon-img" data-id="${p.id}" />
      <p>#${p.id} - ${p.name}</p>
      <button class="battle-btn" data-id="${p.id}">Chọn để xuất chiến</button>
    `;

    // Dùng dbPokemon
    card.querySelector("button").addEventListener("click", async () => {
      const ref = doc(dbPokemon, "bosuutap", docId);
      await setDoc(ref, {
        ...data,
        selected: p.id
      });

      infoBox.textContent = `🛡️ Bạn đang chọn Pokémon ${p.name} (#${p.id}) để xuất chiến`;
      console.log(`✅ Đã chọn Pokémon ${p.name} (#${p.id}) để xuất chiến`);
    });

    container.appendChild(card);
    card.querySelector(".pokemon-img").addEventListener("click", () => {
      showPokemonDetail(p.id);
    });

    if (p.id === selectedId) {
      infoBox.textContent = `🛡️ Bạn đang chọn Pokémon ${p.name} (#${p.id}) để xuất chiến`;
    }
  });
}

function showPokemonDetail(id) {
  const poke = pokemonData.find(p => p.id === id);
  if (!poke) return;

  const html = `
    <h2>${poke.name} (#${poke.id})</h2>
    <p>🔰 Hệ: ${poke.type}</p>
    <p>Stage: ${poke.stage} – Kích thước: ${poke.size}</p>
    <p>❤️ HP: ${poke.hp} – ⚔️ Power: ${poke.power}</p>
    <p>🎯 Kỹ năng: ${poke.skills.join(", ")}</p>
    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${poke.id}.png" style="margin-top:10px;" />
  `;

  document.getElementById("popupContentInner").innerHTML = html;
  document.getElementById("pokemonDetailPopup").style.display = "block";
}

document.getElementById("closePopupBtn").addEventListener("click", () => {
  document.getElementById("pokemonDetailPopup").style.display = "none";
});
