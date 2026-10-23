// effect-normal.js
import { pokemonData } from "./pokemonData.js";
import { skillEffects } from "./skillEffects.js";

// ————————————————————————————————————————————————
// Helpers
// ————————————————————————————————————————————————
function getPokemonInfo(id) {
  return pokemonData.find(p => p.id === id) || {
    id,
    name: "Unknown",
    type: "normal",
    skills: ["Tackle"]
  };
}

function getRandomWildPokemon() {
  const idx = Math.floor(Math.random() * pokemonData.length);
  return pokemonData[idx];
}

function createSprite(id, role) {
  const pos = role === "my"
    ? { top: "60%", left: "70%" }
    : { top: "40%", left: "30%" };

  const isMobile = window.innerWidth < 768;
  const scale = isMobile ? 0.7 : 1.2;
  const height = isMobile ? "90px" : "160px";

  const img = document.createElement("img");
  img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  img.dataset.pokeId = id;

  Object.assign(img.style, {
    position: "fixed",
    top: pos.top,
    left: pos.left,
    transform: `translate(-50%,-50%) scale(${scale})`,
    height,
    zIndex: 1000,
    clipPath: "circle(48% at 50% 50%)",
    WebkitClipPath: "circle(48% at 50% 50%)",
    background: "transparent",
    pointerEvents: "none"
  });

  return img;
}

function getSpriteCenter(id) {
  const el = document.querySelector(`img[data-poke-id="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function animateSkillEffect(attackerId, skills, container, targetId) {
  const from = getSpriteCenter(attackerId);
  const to   = getSpriteCenter(targetId);
  if (!from || !to) return;

  skills.forEach(name => {
    const fn = skillEffects[name];
    if (typeof fn === "function") {
      fn(container, { x: from.x, y: from.y, targetX: to.x, targetY: to.y });
    }
  });
}

function castRandomSkill(attackerId, targetId, container) {
  const info = getPokemonInfo(attackerId);
  const allSkills = Array.isArray(info.skills) ? info.skills : ["Tackle"];

  // Lọc ra các skill có hiệu ứng đã định nghĩa
  const validSkills = allSkills.filter(name => typeof skillEffects[name] === "function");

  if (validSkills.length === 0) {
    console.warn(`Không có hiệu ứng nào cho các skill của ${info.name}`);
    return;
  }

  const skill = validSkills[Math.floor(Math.random() * validSkills.length)];
  animateSkillEffect(attackerId, [skill], container, targetId);
}


// ————————————————————————————————————————————————
// Public API
// ————————————————————————————————————————————————
// ❌ Bỏ code cũ:
// overlay = document.createElement("div");
// Object.assign(overlay.style, { position:"fixed", top:0, left:0, width:"100%", height:"100%", ... });
// document.body.appendChild(overlay);

export function initNormalBattle(myId, container = document.body) {
  // Xóa battlefield cũ nếu có
  let field = document.getElementById("battlefield");
  if (field) field.remove();

  // ✅ Tạo khung battlefield chỉ chiếm phần trên
  field = document.createElement("div");
  field.id = "battlefield";
  Object.assign(field.style, {
    width: "100%",
    height: "40vh",       // chỉ chiếm 40% màn hình
    position: "relative",
    background: "transparent", // nền do backgroundgame.js lo
    overflow: "hidden"
  });
  container.prepend(field); // đặt battlefield ở trên cùng body

  // Pokémon của mình (góc phải trên)
  const mySprite = createSprite(myId, "my");
  mySprite.style.position = "absolute";
  mySprite.style.top = "30%";
  mySprite.style.right = "10%";

  // Pokémon hoang dã (góc trái trên)
  const wild = getRandomWildPokemon();
  const wildSprite = createSprite(wild.id, "wild");
  wildSprite.style.position = "absolute";
  wildSprite.style.top = "30%";
  wildSprite.style.left = "10%";

  field.append(mySprite, wildSprite);

  return { overlay: field, myId, wildId: wild.id };
}


export function playerAttack(battle) {
  castRandomSkill(battle.myId, battle.wildId, battle.overlay);
}

export function wildAttack(battle) {
  castRandomSkill(battle.wildId, battle.myId, battle.overlay);
}

export function destroyNormalBattle() {
  const overlay = document.getElementById("normal-battle-overlay");
  if (overlay) overlay.remove();
}
