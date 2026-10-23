// ——————————————————————————————————————————————————
// 1. IMPORTS & FIREBASE SETUP
// ——————————————————————————————————————————————————
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { pokemonData } from "./pokemonData.js";
import { skillEffects } from "./skillEffects.js";
// Nếu anh đã có backgroundgame.js tự áp nền, có thể bỏ hàm applyRandomBackground ở dưới.

// Firebase config (giữ nguyên)
const firebaseConfig = {
  apiKey: "AIzaSyCCVdzWiiFvcWiHVJN-x33YKarsjyziS8E",
  authDomain: "pokemon-capture-10d03.firebaseapp.com",
  projectId: "pokemon-capture-10d03",
  storageBucket: "pokemon-capture-10d03.appspot.com",
  messagingSenderId: "1068125543917",
  appId: "1:1068125543917:web:57de4365ee56729ea8dbe4"
};

let app;
try { app = initializeApp(firebaseConfig); }
catch { app = getApp(); }
const db = getFirestore(app);

// Lấy selected Pokémon ID (giữ nguyên)
(async () => {
  const name = localStorage.getItem("trainerName") || "Không tên";
  const cls  = localStorage.getItem("trainerClass") || "Chưa có lớp";
  const ref  = doc(db, "bosuutap", `${name.trim()}-${cls.trim()}`);
  try {
    const snap = await getDoc(ref);
    window.selectedPokemonID = snap.exists() ? snap.data().selected : 25;
  } catch {
    window.selectedPokemonID = 25;
  }
})();

// ——————————————————————————————————————————————————
// 2. HELPERS (styles, data, centers, background)
// ——————————————————————————————————————————————————

function injectGlobalStyles() {
  if (document.getElementById("poke-effect-styles")) return;
  const s = document.createElement("style");
  s.id = "poke-effect-styles";
  s.innerHTML = `
    @keyframes shake { 0%,100%{transform:translate(-50%,-50%)rotate(0);}25%{transform:translate(-50%,-50%)rotate(10deg);}50%{transform:translate(-50%,-50%)rotate(-10deg);}75%{transform:translate(-50%,-50%)rotate(10deg);} }
    @keyframes beamFlash { 0%{opacity:0;transform:translate(-50%,-50%)scale(0.5);}50%{opacity:1;transform:translate(-50%,-50%)scale(1.2);}100%{opacity:0;transform:translate(-50%,-50%)scale(1.6);} }
    @keyframes faint { 0%{opacity:1;transform:translate(-50%,-50%)scale(1.2);}50%{opacity:0.6;transform:translate(-50%,-50%)rotate(12deg)scale(1.0);}100%{opacity:0;transform:translate(-50%,-50%)rotate(90deg)scale(0.7);} }
    @keyframes chase { 0%{top:40%;left:30%;}25%{top:35%;left:50%;}50%{top:45%;left:40%;}75%{top:38%;left:60%;}100%{top:40%;left:30%;} }
    @keyframes dodge { 0%{top:60%;left:70%;}25%{top:65%;left:50%;}50%{top:55%;left:60%;}75%{top:62%;left:40%;}100%{top:60%;left:70%;} }
    @keyframes zigzag { 0%{top:40%;left:40%;}25%{top:35%;left:60%;}50%{top:45%;left:50%;}75%{top:38%;left:70%;}100%{top:40%;left:40%;} }
    @keyframes circle { 0%{transform:translate(-50%,-50%)rotate(0);}100%{transform:translate(-50%,-50%)rotate(360deg);} }
    @keyframes hop { 0%{top:50%;}50%{top:40%;}100%{top:50%;} }
    @keyframes slideX { 0% { left: 10%; } 100% { left: 90%; } }
    @keyframes slideY { 0% { top: 10%; } 100% { top: 90%; } }
    @keyframes diagonal { 0% { top: 10%; left: 10%; } 100% { top: 90%; left: 90%; } }
    @keyframes teleportOut { 0% { opacity: 1; transform: translate(-50%,-50%) scale(1); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(0.5); } }
    @keyframes teleportIn  { 0% { opacity: 0; transform: translate(-50%,-50%) scale(0.5); } 100% { opacity: 1; transform: translate(-50%,-50%) scale(1.2); } }
  `;
  document.head.appendChild(s);
}

function getPokemonInfo(id) {
  return pokemonData.find(p => p.id === id) || {
    id,
    type: "normal",
    skills: ["Tackle", "Headbutt"],
    power: 30,
    size: "medium",
    stage: 1
  };
}

// Tính tâm sprite (để skill luôn bắn đúng tâm)
function getSpriteCenter(id) {
  const el = document.querySelector(`img[data-poke-id="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Random nền chiến đấu (nếu chưa có backgroundgame.js tự áp)
function applyRandomBackground() {
  const backgrounds = [
    'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(1).jpg',
    'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(2).jpg',
    'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(3).jpg',
    'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(4).jpg',
    'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(5).jpg',
    'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(6).jpg',
    'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(7).jpg',
    'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(8).jpg',
    'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(9).jpg',
    'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(10).jpg',
  ];
  const bg = backgrounds[Math.floor(Math.random() * backgrounds.length)];

  // Nếu đã có overlay thì chỉ đổi ảnh
  let overlay = document.getElementById("battle-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "battle-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      zIndex: 999,   // đè hẳn lên nền cũ
      overflow: "hidden"
    });
    document.body.appendChild(overlay);
  }
  overlay.style.backgroundImage = `url('${bg}')`;

  return overlay; // trả về overlay để append sprite/hiệu ứng vào
}


// ——————————————————————————————————————————————————
// 3. SPRITES, MOVEMENT & SKILL EFFECTS
// ——————————————————————————————————————————————————

function createSprite(id, role) {
  const pos = role === "my"
    ? { top: "60%", left: "70%" }
    : { top: "40%", left: "30%" };

  // Mobile responsive: nhỏ đi ~1/2
  const isMobile = window.innerWidth < 768;
  const scale = isMobile ? 0.7 : 1.4;
  const height = isMobile ? "90px" : "180px";

  const img = document.createElement("img");
  // ✅ Dùng official artwork (nền trong suốt, không khung vuông)
  img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  img.dataset.pokeId = id;

  Object.assign(img.style, {
    position: "fixed",
    top: pos.top,
    left: pos.left,
    transform: `translate(-50%,-50%) scale(${scale})`,
    height,
    boxShadow: role === "my"
      ? "0 0 30px rgba(255,255,0,0.9)"
      : "0 0 30px rgba(255,255,255,0.9)",
    zIndex: 1000,
    // ✅ Cắt gọn hình tròn để loại bỏ viền vuông
    clipPath: "circle(48% at 50% 50%)",
    WebkitClipPath: "circle(48% at 50% 50%)",
    background: "transparent"
  });

  return img;
}


function getRandomMovement() {
  const names = ["chase", "dodge", "zigzag", "circle", "hop", "slideX", "slideY", "diagonal"];
  const name = names[Math.floor(Math.random() * names.length)];
  const duration = (Math.random() * 3 + 3).toFixed(2) + "s"; // 3–6s
  return { name, duration };
}

// Giữ nguyên phong cách di chuyển ngắt quãng hiện tại
function animateSpriteSequence(sprite, totalMs, role) {
  const moveCount = Math.floor(totalMs / 1500);
  const moveTypes = ["slideX", "slideY", "diagonal", "chase", "hop", "zigzag", "circle"];

  for (let i = 0; i < moveCount; i++) {
    const delay = i * 1500;
    setTimeout(() => {
      const move = moveTypes[Math.floor(Math.random() * moveTypes.length)];
      const randTop  = Math.random() * 80 + 10;
      const randLeft = Math.random() * 80 + 10;

      sprite.style.animation = `${move} 1.5s ease-in-out`;
      sprite.style.top  = `${randTop}%`;
      sprite.style.left = `${randLeft}%`;

      if (i === moveCount - 1) {
        sprite.style.top  = `${Math.random() * 80 + 10}%`;
        sprite.style.left = role === "my"
          ? `${Math.random() * 20 + 70}%`
          : `${Math.random() * 20 + 10}%`;
      }
    }, delay);
  }
}

// FIX: skill luôn bắn từ tâm attacker → tâm target
function animateSkillEffect(pokemonId, skills, container, targetId) {
  const from = getSpriteCenter(pokemonId);
  const to   = getSpriteCenter(targetId);
  if (!from || !to) return;

  skills.forEach(name => {
    const fn = skillEffects[name];
    if (typeof fn === "function") {
      fn(container, { x: from.x, y: from.y, targetX: to.x, targetY: to.y });
    }
  });
}

// PokéBall intro (giữ nguyên)
function animatePokeBall(container) {
  injectGlobalStyles();
  return new Promise(resolve => {
    const ball = document.createElement("img");
    ball.src = "https://cdn-icons-png.flaticon.com/512/361/361998.png";
    Object.assign(ball.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      height: "120px",
      zIndex: 1000,
      animation: "shake 0.5s ease-in-out 2"
    });
    container.append(ball);

    setTimeout(() => {
      ball.remove();
      const beam = document.createElement("div");
      Object.assign(beam.style, {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%,-50%)",
        width: "200px",
        height: "200px",
        background: "radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%)",
        borderRadius: "50%",
        zIndex: 999,
        animation: "beamFlash 1s ease-out forwards"
      });
      container.append(beam);

      setTimeout(() => {
        beam.remove();
        resolve();
      }, 1000);
    }, 1100);
  });
}

// ——————————————————————————————————————————————————
// 4. SKILL SELECTION UI (giữ đầy đủ skill)
// ——————————————————————————————————————————————————

function showSkillSelection(pokemonId, callback) {
  const { skills } = getPokemonInfo(pokemonId);

  const validSkills = (skills || []).filter(name => typeof skillEffects[name] === "function");
  const finalSkills = validSkills.length > 0 ? validSkills : skills || ["Tackle"];

  let menu = document.getElementById("skillMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "skillMenu";
    Object.assign(menu.style, {
      position: "fixed",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.7)",
      padding: "12px 16px",
      borderRadius: "8px",
      display: "flex",
      gap: "10px",
      zIndex: 3000
    });
    document.body.appendChild(menu);
  }
  menu.innerHTML = "";

  finalSkills.forEach(name => {
    const btn = document.createElement("button");
    btn.textContent = name;
    Object.assign(btn.style, {
      padding: "8px 14px",
      borderRadius: "8px",
      border: "none",
      cursor: "pointer",
      background: "#ffcc00",
      fontWeight: "bold",
      boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
    });
    btn.onclick = () => {
      menu.remove();
      callback([name]);
    };
    menu.appendChild(btn);
  });
}

// ——————————————————————————————————————————————————
// 5. PUBLIC API: SHOW VICTORY EFFECT (mới)
// ——————————————————————————————————————————————————

/**
 * Hiệu ứng chiến thắng:
 * - Random nền chiến đấu
 * - Xuất hiện 2 Pokémon, vừa di chuyển vừa spam skill cơ bản (2–4 lần mỗi con)
 * - Người chơi chọn chiêu cuối → đối thủ trúng, animation "faint" → hiển thị "Bạn đã chiến thắng!"
 * - Giữ các hành vi cũ: PokéBall intro, menu chọn skill, phong cách di chuyển ngắt quãng
 */
export async function showVictoryEffect() {
  injectGlobalStyles();

  // Tạo overlay nền mới
  const overlay = applyRandomBackground();

  await animatePokeBall(overlay);

  const myId   = window.selectedPokemonID || 25;
  const wildId = Math.floor(Math.random() * 649) + 1;

  // Render sprites
  const mySprite   = createSprite(myId, "my");
  const wildSprite = createSprite(wildId, "wild");
  overlay.append(mySprite, wildSprite);

  // Thời gian di chuyển 5–8s
  const totalMs = Math.floor(Math.random() * 3000 + 5000);
  animateSpriteSequence(mySprite, totalMs, "my");
  animateSpriteSequence(wildSprite, totalMs, "wild");

  // Trong lúc di chuyển: spam skill cơ bản 2–4 lần mỗi con
  function spamSkills(attackerId, targetId, durationMs) {
    const base = getPokemonInfo(attackerId).skills.slice(0, 2);
    const times = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < times; i++) {
      const delay = (durationMs / times) * i + 400;
      setTimeout(() => {
        const skill = base[Math.floor(Math.random() * base.length)];
        animateSkillEffect(attackerId, [skill], overlay, targetId);
      }, delay);
    }
  }
  spamSkills(myId, wildId, totalMs);
  spamSkills(wildId, myId, totalMs);

  // Kết thúc di chuyển → người chơi chọn chiêu cuối
  setTimeout(() => {
    showSkillSelection(myId, chosen => {
      animateSkillEffect(myId, chosen, overlay, wildId);

      // Wild Pokémon gục
      setTimeout(() => {
        wildSprite.style.animation = "faint 1.2s ease-out forwards";
      }, 1000);

      // Thông báo chiến thắng
      setTimeout(() => {
        const result = document.createElement("div");
        result.textContent = "🎉 Bạn đã chiến thắng!";
        Object.assign(result.style, {
          position: "fixed",
          top: "85%",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: "22px",
          color: "#00ff00",
          textShadow: "2px 2px 6px black",
          zIndex: 2000
        });
        overlay.appendChild(result);
      }, 1600);
    });
  }, totalMs + 200);
}

