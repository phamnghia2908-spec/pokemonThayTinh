// ✅ Gộp phần lấy dữ liệu từ Firebase
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCCVdzWiiFvcWiHVJN-x33YKarsjyziS8E",
  authDomain: "pokemon-capture-10d03.firebaseapp.com",
  projectId: "pokemon-capture-10d03",
  storageBucket: "pokemon-capture-10d03.appspot.com",
  messagingSenderId: "1068125543917",
  appId: "1:1068125543917:web:57de4365ee56729ea8dbe4"
};

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  app = getApp();
}
const db = getFirestore(app);

// ✅ Truy vấn Firestore và gán ID vào window
(async () => {
  const rawName = localStorage.getItem("trainerName") || "Không tên";
  const rawClass = localStorage.getItem("trainerClass") || "Chưa có lớp";
  const docId = `${rawName.trim()}-${rawClass.trim()}`;

  try {
    const ref = doc(db, "bosuutap", docId);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    window.selectedPokemonID = data.selected || 25;
    console.log("✅ ID đã gán từ Firebase:", window.selectedPokemonID);
  } catch (err) {
    console.error("❌ Lỗi khi lấy ID từ Firebase:", err.message);
    window.selectedPokemonID = 25;
  }
})();


export function showCatchEffect(container = document.body) {
  const selectedID = window.selectedPokemonID || 25;
  console.log("🔥 Hiệu ứng PokéBall được gọi với ID:", selectedID);

  const maxID = 649;
  const randomID = Math.floor(Math.random() * maxID) + 1;

  const pokeball = document.createElement('img');
  pokeball.src = 'https://cdn-icons-png.flaticon.com/512/361/361998.png';
  pokeball.alt = 'PokéBall';
  pokeball.style.position = 'fixed';
  pokeball.style.top = '50%';
  pokeball.style.left = '50%';
  pokeball.style.transform = 'translate(-50%, -50%)';
  pokeball.style.height = '120px';
  pokeball.style.zIndex = '1000';
  pokeball.style.animation = 'shake 0.5s ease-in-out 2';
  container.appendChild(pokeball);

  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes shake { 0%,100%{transform:translate(-50%,-50%)rotate(0deg);}25%{transform:translate(-50%,-50%)rotate(10deg);}50%{transform:translate(-50%,-50%)rotate(-10deg);}75%{transform:translate(-50%,-50%)rotate(10deg);} }
    @keyframes beamFlash { 0%{opacity:0;transform:translate(-50%,-50%)scale(0.5);}50%{opacity:1;transform:translate(-50%,-50%)scale(1.2);}100%{opacity:0;transform:translate(-50%,-50%)scale(1.6);} }
    @keyframes chase { 0%{top:40%;left:30%;}25%{top:35%;left:50%;}50%{top:45%;left:40%;}75%{top:38%;left:60%;}100%{top:40%;left:30%;} }
    @keyframes dodge { 0%{top:60%;left:70%;}25%{top:65%;left:50%;}50%{top:55%;left:60%;}75%{top:62%;left:40%;}100%{top:60%;left:70%;} }
    @keyframes zap { 0%{transform:translate(-50%,-50%)scale(1);opacity:1;}50%{transform:translate(-150%,-50%)scale(2);opacity:1;}100%{transform:translate(-300%,-50%)scale(3);opacity:0;} }
    @keyframes attackPose { 0%{transform:translate(-50%,-50%)scale(1.4);}50%{transform:translate(-50%,-52%)scale(1.6);}100%{transform:translate(-50%,-50%)scale(1.4);} }
    @keyframes faint { 0%{opacity:1;transform:translate(-50%,-50%)scale(1.4);}50%{opacity:0.5;transform:translate(-50%,-50%)rotate(20deg)scale(1.2);}100%{opacity:0;transform:translate(-50%,-50%)rotate(90deg)scale(0.8);} }
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    pokeball.remove();

    const beam = document.createElement('div');
    beam.style.position = 'fixed';
    beam.style.top = '50%';
    beam.style.left = '50%';
    beam.style.transform = 'translate(-50%, -50%)';
    beam.style.width = '200px';
    beam.style.height = '200px';
    beam.style.background = 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%)';
    beam.style.borderRadius = '50%';
    beam.style.animation = 'beamFlash 1s ease-out forwards';
    beam.style.zIndex = '999';
    container.appendChild(beam);

    setTimeout(() => {
      beam.remove();

      const wildPokemon = document.createElement('img');
      wildPokemon.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${randomID}.png`;
      wildPokemon.alt = 'Pokémon hoang dã';
      wildPokemon.style.position = 'fixed';
      wildPokemon.style.top = '40%';
      wildPokemon.style.left = '30%';
      wildPokemon.style.transform = 'translate(-50%, -50%) scale(1.4)';
      wildPokemon.style.boxShadow = '0 0 30px rgba(255,255,255,0.9)';
      wildPokemon.style.height = '180px';
      wildPokemon.style.zIndex = '1000';
      wildPokemon.style.animation = 'chase 2.4s ease-in-out';
      container.appendChild(wildPokemon);

      const fighter = document.createElement('img');
      fighter.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${selectedID}.png`;
      fighter.alt = 'Pokémon của bạn';
      fighter.style.position = 'fixed';
      fighter.style.top = '60%';
      fighter.style.left = '70%';
      fighter.style.transform = 'translate(-50%, -50%) scale(1.4)';
      fighter.style.boxShadow = '0 0 30px rgba(255,255,0,0.9)';
      fighter.style.height = '180px';
      fighter.style.zIndex = '1000';
      fighter.style.animation = 'dodge 2.4s ease-in-out';
      container.appendChild(fighter);

      setTimeout(() => {
        fighter.style.animation = 'attackPose 0.6s ease-in-out';

        const attack = document.createElement('div');
        attack.style.position = 'fixed';
        attack.style.top = '60%';
        attack.style.left = '70%';
        attack.style.transform = 'translate(-50%, -50%)';
        attack.style.width = '120px';
        attack.style.height = '120px';
        attack.style.borderRadius = '50%';
        attack.style.background = 'radial-gradient(circle, yellow 40%, orange 80%, transparent 100%)';
        attack.style.boxShadow = '0 0 120px yellow, 0 0 160px orange';
        attack.style.zIndex = '1002';
        attack.style.animation = 'zap 1.5s ease-out forwards';
        container.appendChild(attack);

        setTimeout(() => {
          wildPokemon.style.animation = 'faint 1s ease-in-out forwards';
        }, 1000);

        setTimeout(() => {
          const result = document.createElement('div');
          result.textContent = '🎉 Pokémon của bạn đã chiến thắng!';
          result.style.position = 'fixed';
          result.style.top = '85%';
          result.style.left = '50%';
          result.style.transform = 'translateX(-50%)';
          result.style.fontSize = '22px';
          result.style.color = '#00ff00';
          result.style.textShadow = '2px 2px 6px black';
          result.style.zIndex = '1003';
          container.appendChild(result);
        }, 2000);
      }, 2400);
    }, 1000);
  }, 1100);
}
