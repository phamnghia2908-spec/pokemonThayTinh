/**
 * ==========================================
 * PKM GAME SESSION — pkm_game_session.js
 * ==========================================
 * Điều phối game FULL-SCREEN theo từng MODULE — thay thế hẳn vai trò của
 * pkm_minigame_router.js / pkm_minigame_race.js cũ (2 file đó điều phối
 * theo TỪNG CÂU, không dùng trong luồng chính nữa).
 *
 * Ý TƯỞNG: mỗi module khi bắt đầu chạy được gán NGẪU NHIÊN 1 "scene" (cảnh
 * nền full-screen), giữ nguyên trong suốt module đó (không đổi theo từng
 * câu). Bảng trả lời (nút MCQ / mic nói / ô gõ chữ) vẫn do all-shared.js
 * (askMCQ...) và các module (Nói, Viết) tự vẽ như cũ — CHỈ đổi NƠI vẽ: nổi
 * trên scene (getAnswerHost()) thay vì nằm phẳng trong #mainCard.
 *
 * NẠP FILE NÀY (và các file scene, vd pkm_scene_race.js) TRƯỚC
 * all-orchestrator.js và trước all-shared.js chạy tới câu hỏi đầu tiên.
 *
 * ------------------------------------------------------------------
 * CÁCH 1 SCENE TỰ ĐĂNG KÝ (viết trong chính file scene đó):
 *
 *   window.PkmGameSession.registerScene("race", {
 *     mount(sceneEl)     { ... vẽ cảnh nền vào sceneEl (phần tử DOM rỗng,
 *                          chiếm phần lớn màn hình, phía TRÊN bảng trả lời) ... },
 *     reactToResult(ok)  { ... hiệu ứng tiến (ok=true) / lùi (ok=false)
 *                          khi có kết quả LẦN TRẢ LỜI ĐẦU TIÊN của 1 câu ... },
 *     unmount()          { ... dọn dẹp timer/animation khi module chạy xong ... },
 *   }, { category: "answer" }); // "intro" hoặc "answer" — xem MODULE_CATEGORY
 *
 * ------------------------------------------------------------------
 * API DÙNG Ở NƠI KHÁC (all-shared.js, module-1..5):
 *
 *   PkmGameSession.startModule(moduleId)   // gọi lúc module BẮT ĐẦU chạy
 *   PkmGameSession.getAnswerHost()         // DOM container để vẽ bảng trả
 *                                          // lời — null nếu không có scene
 *                                          // nào đang chạy (nơi gọi tự
 *                                          // fallback dùng container gốc).
 *   PkmGameSession.reportRoundResult(bool) // gọi khi 1 câu ra kết quả CUỐI
 *                                          // của LẦN TRẢ LỜI ĐẦU TIÊN.
 *   PkmGameSession.end()                   // gọi lúc module CHẠY XONG.
 * ------------------------------------------------------------------
 */

(function () {
  const LAST_SCENE_KEY_PREFIX = "pkl_last_scene_"; // + category, sessionStorage

  // Module nào thuộc nhóm scene nào — SỬA Ở ĐÂY khi thêm module/nhóm mới.
  // (id module phải khớp id trong MODULES của all-orchestrator.js)
  const MODULE_CATEGORY = {
    intro: "intro",
    listening: "answer",
    speaking: "answer",
    reading: "answer",
    writing: "answer",
  };

  const scenes = []; // [{ id, api, category }]
  let active = null; // { category, scene, sceneEl, answerHostEl, layerEl }

  function injectStyles() {
    if (document.getElementById("pklGameStyles")) return;
    const style = document.createElement("style");
    style.id = "pklGameStyles";
    style.textContent = `
      #pklGameLayer {
        position: fixed; inset: 0; z-index: 40; /* dưới #progressWrap (z-index:100) */
        display: flex; flex-direction: column;
        background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);
      }
      #pklGameScene { position: relative; flex: 1 1 auto; overflow: hidden; min-height: 0; }
      #pklGameAnswerHost {
        position: relative; flex: 0 0 auto; width: 100%; max-width: 960px;
        margin: 0 auto; box-sizing: border-box; padding: 16px;
        background: rgba(10, 14, 30, 0.72); backdrop-filter: blur(3px);
        border-top: 1px solid rgba(255,203,5,0.25);
        box-shadow: 0 -8px 24px rgba(0,0,0,0.35);
        max-height: 46vh; overflow-y: auto;
      }
      /* Progress bar mờ bớt lúc đang chơi để không lấn scene quá nhiều,
         nhưng vẫn thấy rõ & bấm nhảy module được bình thường. */
      body.pkl-game-active #progressWrap { background: rgba(0,0,0,0.4); }
      body.pkl-game-active #stageContainer { display: none; }
      @media (max-width: 600px) {
        #pklGameAnswerHost { padding: 12px; max-height: 52vh; }
      }
    `;
    document.head.appendChild(style);
  }

  function pickScene(category) {
    const eligible = scenes.filter((s) => s.category === category);
    if (eligible.length === 0) return null;
    const key = LAST_SCENE_KEY_PREFIX + category;
    const lastId = sessionStorage.getItem(key);
    const candidates = eligible.length > 1 ? eligible.filter((s) => s.id !== lastId) : eligible;
    const pool = candidates.length > 0 ? candidates : eligible;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    sessionStorage.setItem(key, chosen.id);
    return chosen;
  }

  window.PkmGameSession = {
    // Gọi trong chính file scene để tự đăng ký vào hệ thống.
    registerScene(id, api, meta = {}) {
      scenes.push({ id, api, category: meta.category || "answer" });
    },

    // Gọi ở ĐẦU mỗi module.run(...) — vd runListeningModule() gọi ngay dòng
    // đầu tiên: window.PkmGameSession?.startModule("listening");
    startModule(moduleId) {
      this.end(); // an toàn: dọn phiên trước đó nếu lỡ còn sót

      const category = MODULE_CATEGORY[moduleId];
      if (!category) return; // module không tham gia hệ game -> UI cũ như thường

      const chosen = pickScene(category);
      if (!chosen) return; // chưa có scene nào đăng ký cho nhóm này -> UI cũ như thường

      injectStyles();
      const layerEl = document.createElement("div");
      layerEl.id = "pklGameLayer";
      layerEl.innerHTML = `<div id="pklGameScene"></div><div id="pklGameAnswerHost"></div>`;
      document.body.appendChild(layerEl);
      document.body.classList.add("pkl-game-active");

      const sceneEl = layerEl.querySelector("#pklGameScene");
      const answerHostEl = layerEl.querySelector("#pklGameAnswerHost");

      active = { category, scene: chosen, sceneEl, answerHostEl, layerEl };
      chosen.api.mount(sceneEl);
    },

    // askMCQ / recordSpeech / askWriting gọi hàm này để lấy nơi vẽ bảng trả
    // lời — trả về null nếu không có scene đang chạy (tự fallback container gốc).
    getAnswerHost() {
      return active ? active.answerHostEl : null;
    },

    // Gọi khi 1 câu ra kết quả CUỐI của LẦN TRẢ LỜI ĐẦU TIÊN.
    reportRoundResult(isFirstAttemptCorrect) {
      if (!active) return;
      active.scene.api.reactToResult?.(isFirstAttemptCorrect);
    },

    // Gọi ở CUỐI mỗi module.run(...), kể cả khi thoát sớm/lỗi (nên đặt
    // trong finally nếu module có try/catch).
    end() {
      if (!active) return;
      active.scene.api.unmount?.();
      active.layerEl.remove();
      document.body.classList.remove("pkl-game-active");
      active = null;
    },
  };
})();
