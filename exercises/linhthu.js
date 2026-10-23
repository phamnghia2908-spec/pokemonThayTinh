// linhthu.js
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { skillEffects } from "./skillEffects.js"; 
import { pokemonData } from "./pokemonData.js";   

(function() {
    const firebaseConfig = {
        apiKey: "AIzaSyCCVdzWiiFvcWiHVJN-x33YKarsjyziS8E",
        authDomain: "pokemon-capture-10d03.firebaseapp.com",
        projectId: "pokemon-capture-10d03",
        storageBucket: "pokemon-capture-10d03.appspot.com",
        messagingSenderId: "1068125543917",
        appId: "1:1068125543917:web:57de4365ee56729ea8dbe4"
    };

    let app;
    try { app = initializeApp(firebaseConfig); } catch { app = getApp(); }
    const db = getFirestore(app);

    let isRemoved = false;
    let clickCount = 0;
    let targetClicks = Math.floor(Math.random() * 3) + 3;
    let originalImgUrl = "";

    function getPokeInfo(id) {
        return pokemonData.find(p => p.id === id) || { skills: ["Tackle"] };
    }

    function speakAndShow(parent, text) {
        if (isRemoved) return;
        const oldBubbles = parent.querySelectorAll('.poke-bubble');
        oldBubbles.forEach(b => b.remove());

        const bubble = document.createElement('div');
        bubble.className = 'poke-bubble'; 
        bubble.innerText = text; 

        Object.assign(bubble.style, {
            position: 'absolute', bottom: '105%', left: '50%', transform: 'translateX(-50%)',
            background: 'white', border: '2px solid #333', borderRadius: '12px',
            padding: '4px 10px', fontSize: '14px', fontWeight: 'bold', color: '#333',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)', whiteSpace: 'nowrap', zIndex: '1000',
            pointerEvents: 'none', animation: 'bubble-up 2s ease-out forwards'
        });

        const arrow = document.createElement('div');
        Object.assign(arrow.style, {
            position: 'absolute', bottom: '-8px', left: '50%', transform: 'translateX(-50%)',
            borderWidth: '8px 8px 0', borderStyle: 'solid', borderColor: 'white transparent transparent'
        });
        bubble.appendChild(arrow);
        parent.appendChild(bubble);

        setTimeout(() => bubble.remove(), 2000);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US'; utterance.volume = 0.5;
        window.speechSynthesis.speak(utterance);
    }

    function launchFirework(parent) {
        for(let i=0; i<8; i++) {
            const p = document.createElement('div');
            const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
            Object.assign(p.style, {
                position: 'absolute', top: '50%', left: '50%', width: '6px', height: '6px',
                background: color, borderRadius: '50%', zIndex: '99',
                animation: `firework-burst 0.8s ease-out forwards`
            });
            const angle = (i / 8) * Math.PI * 2;
            p.style.setProperty('--tx', Math.cos(angle) * 70 + 'px');
            p.style.setProperty('--ty', Math.sin(angle) * 70 + 'px');
            parent.appendChild(p);
            setTimeout(() => p.remove(), 800);
        }
    }

    async function initPet() {
        if (!document.body) return;

        // KIỂM TRA TRẠNG THÁI XÓA
        if (localStorage.getItem("pokeStatus") === "removed") {
            console.log("Linh thú đã bị xóa vĩnh viễn.");
            return; 
        }

        const name = localStorage.getItem("trainerName") || "Không tên";
        const cls  = localStorage.getItem("trainerClass") || "Chưa có lớp";
        const snap = await getDoc(doc(db, "bosuutap", `${name.trim()}-${cls.trim()}`));
        const pokeId = snap.exists() ? snap.data().selected : 25;

        const savedLeft = localStorage.getItem("pokePosLeft") || "20px";
        const savedTop = localStorage.getItem("pokePosTop") || ""; 
        const savedBottom = savedTop ? "" : "20px";

        const pet = document.createElement('div');
        pet.id = 'global-pet';
        originalImgUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokeId}.png`;

        pet.innerHTML = `<div id="pet-container"><img src="${originalImgUrl}" width="100"></div>`;

        Object.assign(pet.style, {
            position: 'fixed', zIndex: '99999', pointerEvents: 'auto', 
            transition: 'all 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            left: savedLeft, top: savedTop, bottom: savedBottom, cursor: 'pointer'
        });

        const styleSheet = document.createElement("style");
        styleSheet.innerText = `
            @keyframes bubble-up { 0% { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.8); } 15% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } 85% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } 100% { opacity: 0; transform: translateX(-50%) translateY(-40px) scale(0.8); } }
            @keyframes firework-burst { 100% { transform: translate(var(--tx), var(--ty)); opacity: 0; } }
            @keyframes pet-breath { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05) translateY(-5px); } }
            @keyframes pet-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes pet-jump { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-30px); } }
            @keyframes pet-teleport-out { 0% { transform: scale(1); opacity: 1; filter: blur(0); } 100% { transform: scale(0); opacity: 0; filter: blur(10px); } }
            @keyframes pet-teleport-in { 0% { transform: scale(0); opacity: 0; filter: blur(10px); } 100% { transform: scale(1); opacity: 1; filter: blur(0); } }
            .pet-breathing { animation: pet-breath 3s infinite ease-in-out; }
            .anim-spin { animation: pet-spin 0.6s ease-in-out; }
            .anim-jump { animation: pet-jump 0.5s ease-in-out; }
            .anim-tp-out { animation: pet-teleport-out 0.5s forwards; }
            .anim-tp-in { animation: pet-teleport-in 0.5s forwards; }
        `;
        document.head.appendChild(styleSheet);

        const container = pet.querySelector('#pet-container');
        container.classList.add('pet-breathing');
        document.body.appendChild(pet);

        // --- CLICK: NHẢY TRỐN HOẶC BIẾN MẤT VĨNH VIỄN ---
        pet.addEventListener('click', (e) => {
            e.stopPropagation(); 
            if (isRemoved) return;

            clickCount++;
            if (clickCount < targetClicks) {
                // Hiệu ứng nhảy trốn
                container.classList.add('anim-tp-out');
                setTimeout(() => {
                    const newLeft = `${Math.random() * (window.innerWidth - 150) + 50}px`;
                    const newTop = `${Math.random() * (window.innerHeight - 150) + 50}px`;
                    pet.style.left = newLeft; pet.style.top = newTop; pet.style.bottom = 'auto';
                    localStorage.setItem("pokePosLeft", newLeft);
                    localStorage.setItem("pokePosTop", newTop);
                    container.classList.remove('anim-tp-out');
                    container.classList.add('anim-tp-in');
                    setTimeout(() => container.classList.remove('anim-tp-in'), 500);
                }, 500);
            } else {
                // BIẾN MẤT VĨNH VIỄN
                isRemoved = true; 
                container.classList.add('anim-tp-out');
                setTimeout(() => {
                    pet.remove(); 
                    localStorage.setItem("pokeStatus", "removed");
                }, 500);
            }
        });

        // --- VÒNG LẶP HÀNH ĐỘNG ---
        setInterval(() => {
            if (isRemoved) return; 

            const rand = Math.random();
            container.classList.remove('pet-breathing');

            // 1. Teleport ngẫu nhiên
            if (rand < 0.10) {
                container.classList.add('anim-tp-out');
                setTimeout(() => {
                    const nLeft = `${Math.random() * (window.innerWidth - 150) + 50}px`;
                    const nTop = `${Math.random() * (window.innerHeight - 150) + 50}px`;
                    pet.style.left = nLeft; pet.style.top = nTop; pet.style.bottom = 'auto';
                    localStorage.setItem("pokePosLeft", nLeft);
                    localStorage.setItem("pokePosTop", nTop);
                    container.classList.remove('anim-tp-out');
                    container.classList.add('anim-tp-in');
                    setTimeout(() => container.classList.remove('anim-tp-in'), 500);
                }, 500);
            }
            // 2. Sử dụng chiêu thức (Skill)
            else if (rand < 0.35) {
                const info = getPokeInfo(pokeId);
                const sName = info.skills[Math.floor(Math.random() * info.skills.length)];
                if (typeof skillEffects[sName] === "function") {
                    const rect = container.getBoundingClientRect();
                    const from = { x: rect.left + 50, y: rect.top + 50 };
                    const to = { x: from.x + (Math.random()-0.5)*400, y: from.y + (Math.random()-0.5)*400 };
                    skillEffects[sName](document.body, { x: from.x, y: from.y, targetX: to.x, targetY: to.y });
                }
            }
            // 3. Khen ngợi và pháo hoa
            else if (rand < 0.55) {
                const cheers = ["Great!", "Good job!", "Excellent!", "Amazing!", "Try more!"];
                speakAndShow(container, cheers[Math.floor(Math.random() * cheers.length)]);
                if (Math.random() > 0.5) launchFirework(container);
            }
            // 4. Di chuyển tại chỗ (Xoay/Nhảy)
            else if (rand < 0.75) {
                const anim = Math.random() > 0.5 ? 'anim-spin' : 'anim-jump';
                container.classList.add(anim);
                setTimeout(() => container.classList.remove(anim), 600);
            }

            setTimeout(() => { 
                if(!isRemoved && !container.classList.contains('pet-breathing')) 
                    container.classList.add('pet-breathing'); 
            }, 1000);
        }, 5000);

        // --- LOGIC NHẤC (DRAG) ---
        let isDragging = false;
        document.addEventListener('mousedown', (e) => {
            if (['BUTTON', 'INPUT', 'A', 'SELECT'].includes(e.target.tagName)) return;
            if (!isRemoved && !pet.contains(e.target)) {
                const mLeft = `${e.clientX - 50}px`;
                const mTop = `${e.clientY - 50}px`;
                pet.style.left = mLeft; pet.style.top = mTop; pet.style.bottom = 'auto';
                localStorage.setItem("pokePosLeft", mLeft);
                localStorage.setItem("pokePosTop", mTop);
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPet);
    else initPet();
})();