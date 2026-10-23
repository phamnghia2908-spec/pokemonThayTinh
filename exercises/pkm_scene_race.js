/**
 * ==========================================
 * PKM SCENE — ĐUA XE — pkm_scene_race.js
 * ==========================================
 * Cảnh nền full-screen cho nhóm "answer" (Nghe/Nói/Đọc/Viết). Vẽ đường đua
 * full màn hình, xe của học sinh + 2 xe đối thủ. KHÔNG tự vẽ câu hỏi/đáp án
 * — bảng trả lời (MCQ/mic/gõ chữ) do all-shared.js/module vẽ đè lên qua
 * PkmGameSession.getAnswerHost(), scene chỉ PHẢN ỨNG khi có kết quả.
 *
 * Tuân thủ hợp đồng của pkm_game_session.js:
 *   mount(sceneEl)     — vẽ cảnh nền 1 lần khi module bắt đầu
 *   reactToResult(ok)  — chạy hiệu ứng tiến/lùi mỗi khi có kết quả 1 câu
 *   unmount()          — dọn dẹp khi module chạy xong
 *
 * NẠP SAU pkm_game_session.js, TRƯỚC all-orchestrator.js.
 */

(function () {
  const BOOST = 12;          // % xe học sinh tiến lên khi đúng
  const RIVAL_CATCHUP_MIN = 5; // % xe đối thủ tự nhích khi học sinh sai
  const RIVAL_CATCHUP_MAX = 10;

  let styleInjected = false;
  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .pks-race-road { position: absolute; inset: 0; }
      .pks-race-lane {
        position: absolute; left: 0; right: 0; height: 30%;
        border-bottom: 2px dashed rgba(255,255,255,.1);
      }
      .pks-race-lane:nth-child(1) { top: 8%; }
      .pks-race-lane:nth-child(2) { top: 38%; }
      .pks-race-lane:nth-child(3) { top: 68%; }
      .pks-race-finish {
        position: absolute; right: 3%; top: 5%; bottom: 5%; width: 5px;
        background: repeating-linear-gradient(#fff 0 10px, #333 10px 20px);
        opacity: .55;
      }
      .pks-race-car {
        position: absolute; top: 50%; transform: translateY(-50%);
        font-size: 40px; line-height: 1;
        transition: left 1s cubic-bezier(.3,.7,.2,1);
        filter: drop-shadow(0 2px 5px rgba(0,0,0,.4));
      }
      .pks-race-car .pks-race-name {
        display: block; text-align: center; font-size: 11px; color: #ffcb05;
        font-weight: 700; margin-top: -2px; text-shadow: 0 1px 2px #000;
      }
      .pks-race-car.pks-boost { filter: drop-shadow(0 0 10px rgba(255,203,5,.8)); }
      .pks-race-car.pks-slip  { filter: drop-shadow(0 0 8px rgba(231,76,60,.7)); }
    `;
    document.head.appendChild(style);
  }

  // Nhân vật chung chung (không dùng tên/hình Pokémon thật để tránh vướng
  // bản quyền IP) — b có thể tự thay emoji/ảnh riêng của app sau.
  const RACERS = [
    { id: "player", emoji: "🚗", label: "Bạn", isPlayer: true, lane: 0 },
    { id: "rival1", emoji: "🚙", label: "Đối thủ 1", lane: 1 },
    { id: "rival2", emoji: "🚕", label: "Đối thủ 2", lane: 2 },
  ];

  let sceneEl = null;
  let pos = { player: 4, rival1: 4, rival2: 4 }; // % dọc đường đua, bắt đầu hơi lệch vạch xuất phát

  function renderPositions() {
    if (!sceneEl) return;
    RACERS.forEach((r) => {
      const el = sceneEl.querySelector(`#pksCar_${r.id}`);
      if (!el) return;
      const p = Math.max(0, Math.min(100, pos[r.id]));
      el.style.left = `calc(${p}% * 0.88)`;
    });
  }

  function clampAndMaybeLoop() {
    const allNearFinish = RACERS.every((r) => pos[r.id] >= 96);
    if (allNearFinish) RACERS.forEach((r) => { pos[r.id] = 4; }); // chạy tiếp vòng mới cho vui, không đứng hình
  }

  const api = {
    mount(el) {
      injectStyles();
      sceneEl = el;
      pos = { player: 4, rival1: 4, rival2: 4 };
      sceneEl.innerHTML = `
        <div class="pks-race-road">
          <div class="pks-race-lane"></div>
          <div class="pks-race-lane"></div>
          <div class="pks-race-lane"></div>
          <div class="pks-race-finish"></div>
          ${RACERS.map((r, i) => `
            <div class="pks-race-car" id="pksCar_${r.id}" style="top:${18 + i * 30}%;">
              <div>${r.emoji}</div>
              <span class="pks-race-name">${r.label}</span>
            </div>
          `).join("")}
        </div>
      `;
      renderPositions();
    },

    reactToResult(isCorrect) {
      if (!sceneEl) return;
      const playerEl = sceneEl.querySelector("#pksCar_player");
      if (isCorrect) {
        pos.player = Math.min(100, pos.player + BOOST);
        playerEl?.classList.add("pks-boost");
        setTimeout(() => playerEl?.classList.remove("pks-boost"), 1000);
      } else {
        playerEl?.classList.add("pks-slip");
        setTimeout(() => playerEl?.classList.remove("pks-slip"), 1000);
        ["rival1", "rival2"].forEach((id) => {
          pos[id] = Math.min(100, pos[id] + rand(RIVAL_CATCHUP_MIN, RIVAL_CATCHUP_MAX));
        });
      }
      clampAndMaybeLoop();
      renderPositions();
    },

    unmount() {
      sceneEl = null;
    },
  };

  function rand(min, max) {
    return Math.round(min + Math.random() * (max - min));
  }

  window.PkmGameSession?.registerScene("race", api, { category: "answer" });
})();
