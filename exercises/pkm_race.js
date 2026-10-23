/**
 * ==========================================
 * POKÉMON TEMPLE DASH — GAME LOGIC (kiểu Temple Run, giả lập phối cảnh 3D bằng Canvas 2D)
 * ==========================================
 * Luồng: giống hệt pkm_block.js ở phần "học từ vựng trước" (VocabularyModule),
 * chỉ khác phần "sân chơi" — thay vì xếp khối thì chạy vượt chướng ngại vật + ăn vàng.
 *
 * LƯU Ý QUAN TRỌNG: pkm_vocabulary.js (dùng chung, KHÔNG sửa) sau khi học xong
 * gọi cứng `window.startPokemonBattle()`. Vì vậy bên dưới ta vẫn đặt tên hàm
 * khởi động game là `window.startPokemonBattle` (dù thực chất nó khởi động
 * Temple Dash) để không phải đụng vào file gốc.
 *
 * KHÁC BIỆT SO VỚI pkm_block.js: pkm_block.js gọi quiz theo SỐ LƯỢT ĐẶT KHỐI.
 * Ở đây quiz được gọi theo SỐ VÀNG ĐÃ ĂN (randomCoinThreshold()).
 *
 * HỆ THỐNG KHU VỰC (MỚI): bản đồ được chia thành nhiều KHU VỰC (ZONES) khác
 * nhau — mỗi khu vực có bầu trời/đường/vật trang trí 2 bên/chướng ngại vật
 * riêng. Ăn đủ số vàng trong 1 khu vực (randomZoneTarget()) sẽ xuất hiện 1
 * CỔNG DỊCH CHUYỂN (portal) — chạy xuyên qua cổng sẽ đổi sang khu vực TIẾP
 * THEO, hết danh sách thì quay vòng lại khu vực đầu (this.ZONES.length).
 * MUỐN THÊM KHU VỰC MỚI: chỉ cần thêm 1 object vào mảng `ZONES` bên dưới,
 * không cần sửa logic — mọi thứ (sky/road/props/obstacles/ambient) đều đọc
 * động từ object khu vực hiện tại qua this.zone().
 *
 * Phần ghi điểm theo 4 kỹ năng + tổng điểm "Trò chơi" + EXP/DV nay dùng chung
 * window.PkmScore (file pkm_score.js, nạp TRƯỚC file này trong HTML) — Y HỆT
 * cách pkm_block.js đang làm, không có gì khác biệt ở phần này.
 */

window.RaceGame = {
    // ═══════════════════════════════════════════════════════════
    // CẤU HÌNH & KHÔNG GIAN ẢO (virtual resolution — co giãn động theo máy, xem resize())
    // ═══════════════════════════════════════════════════════════
    VW: 720,
    VH: 1280,
    LANES: [-1, 0, 1],
    MIN_QUESTIONS: 8,
    COLLIDE_T: 0.05,

    // 7 loại chướng ngại vật, 3 kiểu né khác nhau — dùng chung mọi khu vực,
    // mỗi khu vực chỉ chọn ra 1 TẬP CON phù hợp bối cảnh (xem ZONES.obstacleTypes):
    //  - "jump"  : rock (đá tảng), spike (gai kim loại), chasm (hố/vực sâu), pendulum (cân/lưỡi chém đong đưa)
    //  - "slide" : branch (cành cây/cổng gỗ), swarm (đàn quái bay ngang qua)
    //  - "dodge" : wall (bức tường chắn 2/3 làn) — KHÔNG né được bằng nhảy/trượt,
    //              bắt buộc phải đứng đúng làn còn trống.
    OBSTACLE_ACTIONS: { rock: "jump", spike: "jump", chasm: "jump", pendulum: "jump", branch: "slide", swarm: "slide", wall: "dodge" },

    HORIZON_Y: 300,
    ROAD_BOTTOM_Y: 1120,
    LANE_OFFSET_BOTTOM: 190,
    LANE_OFFSET_TOP: 24,
    PLAYER_Y: 1080,

    // ═══════════════════════════════════════════════════════════
    // CÁC KHU VỰC — dữ liệu + hình ảnh nay do pkm_race_background.js quản lý
    // hoàn toàn (window.RaceBackground.ZONES). Ở đây chỉ giữ CHỈ SỐ khu vực
    // hiện tại + hàm tiện ích zone() để phần logic game (spawn/va chạm/HUD)
    // không phải sửa gì thêm.
    // ═══════════════════════════════════════════════════════════
    currentZoneIndex: 0,
    zone() { return window.RaceBackground.zoneAt(this.currentZoneIndex); },
    zoneCoins: 0,
    zoneCoinsTarget: 40,
    portalPending: false,

    canvas: null,
    ctx: null,
    dpr: 1,
    cssW: 0,
    cssH: 0,

    // ── trạng thái ván chơi ──
    running: false,
    paused: false,
    gameOver: false,
    controlsLocked: false,
    rafId: null,
    lastTs: 0,

    coinsCollected: 0,
    score: 0,
    lives: 10,
    distance: 0,
    speed: 0.35, // đơn vị t/giây (tốc độ thế giới trôi qua nhân vật)
    BASE_SPEED: 0.35,
    MAX_SPEED: 1.35,

    correctCount: 0,
    wrongCount: 0,
    totalCount: 0,

    coinsSinceQuiz: 0,
    coinsUntilQuiz: 6,

    spawnTimer: 0.9,
    propTimer: 0.4,

    objects: [], // {kind:'coin'|'obstacle'|'portal', lane, t, type, resolved, spin, overBarrier}
    sideProps: [], // {lane, t, kind}
    particles: [], // {x,y,vx,vy,life,maxLife,color,size,text}
    ambientParticles: [], // hiệu ứng bầu không khí theo khu vực (đom đóm/bong bóng/mây/tro lửa...)

    player: {
        lane: 0,
        xOff: 0, // vị trí x mượt hiện tại (lerp dần về lane target)
        jumping: false,
        jumpT: 0,
        JUMP_DUR: 0.62,
        sliding: false,
        slideT: 0,
        SLIDE_DUR: 0.55,
        hit: false,
        invulnT: 0,
        runCycle: 0,
        squash: 1,
    },

    shake: { t: 0, mag: 0 },

    // ═══════════════════════════════════════════════════════════
    // KHÚC CUA NGẪU NHIÊN (kiểu Temple Run) — chỉ là hiệu ứng THỊ GIÁC
    // (Hướng A): không gây mất mạng dù chọn gì hay không chọn. Luồng:
    //   "none" -> (hết giờ ngẫu nhiên) -> "prompt" (hiện mũi tên 2 bên, chờ
    //   bấm trái/phải) -> hết giờ chờ mà không bấm thì TỰ CHỌN ngẫu nhiên ->
    //   "turning" (đường bẻ cong theo hướng đã chọn rồi tự thẳng lại) -> "none".
    // ═══════════════════════════════════════════════════════════
    corner: { active: false, phase: "none", dir: 0, promptT: 0, progress: 0 },
    cornerPending: false,
    cornerTimer: 18,
    CORNER_PROMPT_DURATION: 1.1,
    CORNER_TURN_DURATION: 1.9,
    CORNER_MAX_OFFSET: 230,

    characterUrl: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/back/25.gif",
    characterImg: null,

    // ═══════════════════════════════════════════════════════════
    // ÂM THANH (Web Audio API tự tạo — copy phong cách pkm_block.js)
    // ═══════════════════════════════════════════════════════════
    _audioCtx: null,
    ensureAudioCtx() {
        if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (this._audioCtx.state === "suspended") this._audioCtx.resume();
        return this._audioCtx;
    },
    playTone(freq, duration = 0.12, type = "sine", volume = 0.25, delay = 0) {
        try {
            const ctx = this.ensureAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(ctx.destination);
            const startTime = ctx.currentTime + delay;
            gain.gain.setValueAtTime(volume, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.start(startTime);
            osc.stop(startTime + duration + 0.02);
        } catch (e) { /* im lặng nếu trình duyệt chặn audio */ }
    },
    playCoinSound() { this.playTone(880, 0.1, "triangle", 0.3, 0); this.playTone(1320, 0.12, "triangle", 0.28, 0.05); this.playTone(1760, 0.14, "sine", 0.22, 0.1); },
    playJumpSound() { this.playTone(440, 0.08, "square", 0.15, 0); this.playTone(660, 0.1, "square", 0.15, 0.06); },
    playLandSound() { this.playTone(180, 0.08, "sine", 0.18, 0); this.playTone(120, 0.1, "sine", 0.14, 0.03); },
    playSlideSound() { this.playTone(220, 0.14, "sawtooth", 0.14, 0); },
    playSwitchSound() { this.playTone(520, 0.05, "triangle", 0.15, 0); this.playTone(700, 0.06, "triangle", 0.12, 0.03); },
    playHitSound() { this.playTone(140, 0.22, "square", 0.28, 0); this.playTone(90, 0.25, "sawtooth", 0.22, 0.05); },
    playQuizChime() { this.playTone(784, 0.1, "sine", 0.22, 0); this.playTone(988, 0.1, "sine", 0.22, 0.09); this.playTone(1318, 0.18, "sine", 0.25, 0.18); },
    playGoSound() { this.playTone(523, 0.12, "sine", 0.25, 0); this.playTone(659, 0.12, "sine", 0.25, 0.12); this.playTone(784, 0.2, "sine", 0.28, 0.24); },
    playGameOverSound() { this.playTone(392, 0.2, "sawtooth", 0.2, 0); this.playTone(330, 0.2, "sawtooth", 0.2, 0.18); this.playTone(220, 0.35, "sawtooth", 0.2, 0.36); },
    playCornerAlertSound() { this.playTone(660, 0.08, "square", 0.16, 0); this.playTone(660, 0.08, "square", 0.16, 0.18); },
    playCornerTurnSound(dir) {
        if (dir < 0) { this.playTone(700, 0.18, "sawtooth", 0.17, 0); this.playTone(420, 0.16, "sawtooth", 0.14, 0.09); }
        else { this.playTone(420, 0.18, "sawtooth", 0.17, 0); this.playTone(700, 0.16, "sawtooth", 0.14, 0.09); }
    },
    playZoneChangeSound() {
        this.playTone(392, 0.15, "sine", 0.22, 0);
        this.playTone(523, 0.15, "sine", 0.24, 0.12);
        this.playTone(659, 0.2, "sine", 0.26, 0.24);
        this.playTone(880, 0.32, "sine", 0.28, 0.36);
    },

    // ═══════════════════════════════════════════════════════════
    // KHỞI TẠO
    // ═══════════════════════════════════════════════════════════
    async init() {
        console.log("🏃 [DEBUG] RaceGame.init() started");

        this.canvas = document.getElementById("raceCanvas");
        this.ctx = this.canvas.getContext("2d");
        this.resize();
        window.addEventListener("resize", () => this.resize());

        this.attachControls();

        if (window.QuizManager) window.QuizManager.prepareData();

        const quizOverlay = document.getElementById("quiz-overlay");
        if (quizOverlay) quizOverlay.style.display = "none";

        // Màn chọn cấp độ — giống hệt kiểu pkm_block.js
        const renderLevelSelect = (container) => {
            return new Promise((resolve) => {
                const LEVELS = [
                    { key: "de", emoji: "🟢", label: "Dễ", sub: "Hội thoại/đoạn văn ngắn" },
                    { key: "trung_binh", emoji: "🟡", label: "Trung bình", sub: "Độ dài vừa phải" },
                    { key: "kho", emoji: "🔴", label: "Khó", sub: "Hội thoại/đoạn văn dài" },
                ];
                container.innerHTML = `
                    <div style="text-align:center;">
                        <div class="race-level-select-title">🏃 Chọn cấp độ Temple Dash!</div>
                        <div class="race-level-row">
                            ${LEVELS.map((lv) => `
                                <div class="race-level-card" data-level="${lv.key}">
                                    <div class="lv-emoji">${lv.emoji}</div>
                                    <div class="lv-label">${lv.label}</div>
                                    <div class="lv-sub">${lv.sub}</div>
                                </div>`).join("")}
                        </div>
                    </div>`;
                container.querySelectorAll(".race-level-card").forEach((card) => {
                    card.onclick = () => {
                        localStorage.setItem("selected_level", card.dataset.level);
                        resolve(card.dataset.level);
                    };
                });
            });
        };

        // Tên hàm PHẢI là startPokemonBattle vì pkm_vocabulary.js gọi cứng tên này
        window.startPokemonBattle = async () => {
            console.log("🏃 Chọn cấp độ trước khi vào Temple Dash...");

            let mainCard = document.getElementById("mainCard");
            if (!mainCard) {
                mainCard = document.createElement("div");
                mainCard.id = "mainCard";
                document.body.appendChild(mainCard);
            }
            mainCard.style.cssText = `
                position: fixed; top:0; left:0; width:100vw; height:100dvh;
                background: radial-gradient(circle, #241143 0%, #0a0616 100%);
                z-index: 99999; display:flex; align-items:center; justify-content:center;
                padding:20px; box-sizing:border-box;
            `;
            mainCard.style.display = "flex";

            await renderLevelSelect(mainCard);
            mainCard.style.display = "none";

            if (window.QuizManager) {
                window.QuizManager.loadLevel();
                window.QuizManager.initSkillPools();
            }

            await this.chooseCompanion();
            this.showTapToStart();
        };

        if (window.VocabularyModule && typeof window.VocabularyModule.start === "function") {
            console.log("📘 [Race] Gọi VocabularyModule chạy phần học từ vựng...");
            await window.VocabularyModule.start();
        } else {
            console.warn("⚠️ Không tìm thấy VocabularyModule, tự động vào thẳng Temple Dash!");
            window.startPokemonBattle();
        }
    },

    // Lấy 1 Pokémon trong đội hình làm nhân vật chính chạy (bản GIF hoạt hình), fallback Pikachu
    // Hiện màn CHỌN POKÉMON ĐỒNG HÀNH (dùng chung renderCompanionSelect() từ
    // all-shared.js — y hệt cách các minigame khác đang làm), rồi tải sprite
    // GIF chạy (bản lưng, hoạt hình) từ pkmId người chơi vừa chọn.
    async chooseCompanion() {
        let id = 25;
        try {
            const mod = await import("./all-shared.js?update=now");
            const mainCard = document.getElementById("mainCard");
            mainCard.style.display = "flex";
            const companion = await mod.renderCompanionSelect(mainCard);
            mainCard.style.display = "none";
            if (companion && companion.pkmId) id = companion.pkmId;
        } catch (e) {
            console.warn("⚠️ Không tải được màn chọn đồng hành, dùng Pikachu mặc định:", e);
        }

        this.characterUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/back/${id}.gif`;
        this.characterImg = new Image();
        this.characterImg.crossOrigin = "anonymous";
        await new Promise((resolve) => {
            this.characterImg.onload = resolve;
            this.characterImg.onerror = () => {
                this.characterUrl = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/back/25.gif";
                this.characterImg.src = this.characterUrl;
                resolve();
            };
            this.characterImg.src = this.characterUrl;
        });
    },

    // ═══════════════════════════════════════════════════════════
    // CANVAS RESIZE (full-bleed, co giãn động theo tỉ lệ máy thật — PC/mobile khác nhau)
    // ═══════════════════════════════════════════════════════════
    resize() {
        const stage = document.getElementById("race-stage");
        const wrapW = Math.max(1, stage.clientWidth);
        const wrapH = Math.max(1, stage.clientHeight);

        // FULL-BLEED: canvas luôn phủ kín đúng kích thước khung chứa (không
        // còn viền đen 2 bên) — bí quyết là để CHIỀU RỘNG ẢO (this.VW) co
        // giãn theo đúng tỉ lệ khung hình thật của máy, còn CHIỀU CAO ẢO
        // (this.VH) giữ cố định. Vì tỉ lệ ảo == tỉ lệ CSS thật nên ảnh không
        // hề bị kéo méo. Kết quả: điện thoại (dọc, hẹp) thấy đường chạy gần
        // và chật, còn PC/màn ngang (rộng) thấy thêm khung cảnh 2 bên đường
        // — đúng cảm giác "PC khác, mobile khác" mà vẫn luôn full màn hình.
        this.cssW = wrapW; this.cssH = wrapH;
        this.canvas.style.width = wrapW + "px";
        this.canvas.style.height = wrapH + "px";

        this.VH = 1280;
        this.VW = Math.round(this.VH * (wrapW / wrapH));

        // Làn đường co giãn nhẹ theo bề rộng ảo nhưng có trần (210) — để
        // trên màn hình siêu rộng, đường chạy không phình to vô lý; phần dư
        // ra 2 bên sẽ tự hiện thêm cây/trụ đá trang trí (sideProps).
        this.LANE_OFFSET_BOTTOM = Math.min(210, this.VW * 0.26);
        this.LANE_OFFSET_TOP = this.LANE_OFFSET_BOTTOM * 0.25;

        // Giới hạn devicePixelRatio tối đa 2x — màn hình điện thoại "retina"
        // có dpr tới 3, nếu không giới hạn thì canvas phải vẽ gấp ĐÔI số
        // pixel cần thiết mỗi khung hình, rất nặng trên máy yếu mà mắt gần
        // như không thấy khác biệt so với 2x.
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.round(this.VW * this.dpr);
        this.canvas.height = Math.round(this.VH * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        window.RaceBackground.rebuildGradients(this.ctx, this.raceState());
    },

    // Đóng gói mọi thông số hình học/trạng thái mà pkm_race_background.js
    // cần để vẽ — truyền 1 object duy nhất cho gọn thay vì nhiều tham số rời.
    raceState() {
        return {
            VW: this.VW, VH: this.VH,
            HORIZON_Y: this.HORIZON_Y, ROAD_BOTTOM_Y: this.ROAD_BOTTOM_Y,
            LANE_OFFSET_BOTTOM: this.LANE_OFFSET_BOTTOM, LANE_OFFSET_TOP: this.LANE_OFFSET_TOP,
            distance: this.distance, zoneIndex: this.currentZoneIndex,
            renderProjFor: (lane, t) => this.renderProjFor(lane, t),
        };
    },

    // ═══════════════════════════════════════════════════════════
    // MÀN "CHẠM ĐỂ BẮT ĐẦU" + ĐẾM NGƯỢC
    // ═══════════════════════════════════════════════════════════
    showTapToStart() {
        const layer = document.getElementById("race-overlay-layer");
        layer.className = "show";
        layer.innerHTML = `
            <div id="tapStartCard">
                <div id="tapStartBtn"></div>
                <div class="tap-label">Chạm để bắt đầu!</div>
                <div class="tap-sub">Vượt chướng ngại · Ăn vàng · Khám phá 5 khu vực</div>
            </div>`;
        this.renderIdleFrame();
        document.getElementById("tapStartBtn").onclick = () => {
            this.ensureAudioCtx();
            layer.className = "";
            layer.innerHTML = "";
            this.runCountdown();
        };
    },

    renderIdleFrame() {
        this.resetRunState();
        this.drawScene(0);
    },

    runCountdown() {
        const layer = document.getElementById("race-overlay-layer");
        layer.className = "show";
        const seq = ["3", "2", "1", "GO!"];
        let i = 0;
        const step = () => {
            layer.innerHTML = "";
            const el = document.createElement("div");
            el.className = seq[i] === "GO!" ? "go-text" : "countdown-num";
            el.innerText = seq[i];
            layer.appendChild(el);
            this.playTone(seq[i] === "GO!" ? 880 : 523, 0.15, "sine", 0.22, 0);
            i++;
            if (i < seq.length) {
                setTimeout(step, 700);
            } else {
                setTimeout(() => {
                    layer.className = "";
                    layer.innerHTML = "";
                    this.playGoSound();
                    this.startPlaying();
                }, 650);
            }
        };
        step();
    },

    // ═══════════════════════════════════════════════════════════
    // BẮT ĐẦU / VÒNG LẶP CHÍNH
    // ═══════════════════════════════════════════════════════════
    resetRunState() {
        this.player.lane = 0;
        this.player.xOff = 0;
        this.player.jumping = false; this.player.jumpT = 0;
        this.player.sliding = false; this.player.slideT = 0;
        this.player.hit = false; this.player.invulnT = 0;
        this.player.runCycle = 0; this.player.squash = 1;
        this.objects = [];
        this.sideProps = [];
        this.particles = [];
        this.currentZoneIndex = 0;
        this.zoneCoins = 0;
        this.zoneCoinsTarget = this.randomZoneTarget();
        this.portalPending = false;
        this.corner = { active: false, phase: "none", dir: 0, promptT: 0, progress: 0 };
        this.cornerPending = false;
        this.cornerTimer = this.randomCornerInterval();
        this.initAmbientParticles();
        window.RaceBackground.rebuildGradients(this.ctx, this.raceState());
        this.spawnTimer = 0.6;
        this.propTimer = 0.2;
    },

        startPlaying() {
            if (window.PkmScore) window.PkmScore.resetMatchTotals();
            this.resetRunState();
            this.running = true;
        this.paused = false;
        this.gameOver = false;
        this.controlsLocked = false;
        this.coinsCollected = 0;
        this.score = 0;
        this.lives = 10;
        this.distance = 0;
        this.speed = this.BASE_SPEED;
        this.correctCount = 0; this.wrongCount = 0; this.totalCount = 0;
        this.coinsSinceQuiz = 0;
        this.coinsUntilQuiz = this.randomCoinThreshold();
        this.updateHUD();
        this.updateHeartsUI();
        document.getElementById("race-controls").classList.remove("locked");
        this.flashObstacleLegend();

        this.lastTs = performance.now();
        if (!this._boundLoop) this._boundLoop = this.gameLoopStep.bind(this);
        this.rafId = requestAnimationFrame(this._boundLoop);
    },

    flashObstacleLegend() {
        const el = document.getElementById("obstacle-legend");
        if (!el) return;
        el.classList.remove("show");
        void el.offsetWidth;
        el.classList.add("show");
    },

    // Vòng lặp chính. QUAN TRỌNG: khi this.paused = true (đang mở quiz) thì
    // KHÔNG tự xin thêm khung hình nữa — dừng hẳn requestAnimationFrame,
    // giống hệt cách pkm_block.js dừng hẳn xử lý khi mở quiz, thay vì vẫn
    // phải vẽ lại toàn bộ canvas 60 lần/giây phía sau lớp quiz-overlay mờ
    // (backdrop-filter) — đây là nguyên nhân chính gây đơ/giật khi quiz mở
    // và cũng giúp máy yếu đỡ hao pin/CPU hơn nhiều.
    gameLoopStep(ts) {
        if (!this.running) return;
        let dt = (ts - this.lastTs) / 1000;
        this.lastTs = ts;
        if (dt > 0.05) dt = 0.05; // chống giật khung hình khi tab bị treo
        if (!this.paused && !this.gameOver) this.update(dt);
        this.drawScene(dt);
        if (!this.paused && !this.gameOver) {
            this.rafId = requestAnimationFrame(this._boundLoop);
        }
        // Nếu paused/gameOver -> KHÔNG gọi requestAnimationFrame nữa, vòng
        // lặp dừng hẳn tại đây. Muốn chạy lại phải tự gọi
        // requestAnimationFrame(this._boundLoop) ở nơi khác (xem onQuizAnswered()).
    },

    randomCoinThreshold() { return 6 + Math.floor(Math.random() * 2); }, // 6..7
    randomZoneTarget() { return 40 + Math.floor(Math.random() * 2); }, // 24..25 vàng/khu vực

    // ═══════════════════════════════════════════════════════════
    // CẬP NHẬT MỖI KHUNG HÌNH
    // ═══════════════════════════════════════════════════════════
    update(dt) {
        // tăng dần độ khó theo quãng đường
        this.distance += this.speed * dt * 40;
        this.speed = Math.min(this.MAX_SPEED, this.BASE_SPEED + this.distance * 0.00015);
        this.score = this.coinsCollected * 10 + Math.floor(this.distance);

        this.updatePlayer(dt);
        this.updateCorner(dt);
        this.updateSpawns(dt);
        this.updateObjects(dt);
        this.updateSideProps(dt);
        this.updateParticles(dt);
        this.updateAmbientParticles(dt);

        if (this.shake.t > 0) { this.shake.t -= dt; if (this.shake.t < 0) this.shake.t = 0; }

        this.updateHUD();
    },

    updatePlayer(dt) {
        const p = this.player;
        // di chuyển mượt sang lane mục tiêu
        const targetX = p.lane * this.LANE_OFFSET_BOTTOM;
        p.xOff += (targetX - p.xOff) * Math.min(1, dt * 12);

        p.runCycle += dt * (6 + this.speed * 4);

        if (p.jumping) {
            p.jumpT += dt / p.JUMP_DUR;
            if (p.jumpT >= 1) {
                p.jumpT = 0; p.jumping = false;
                // hiệu ứng + âm thanh TIẾP ĐẤT
                this.playLandSound();
                this.spawnDustBurst(this.VW / 2 + p.xOff, this.PLAYER_Y + 30, 12);
            }
        }
        if (p.sliding) {
            p.slideT += dt / p.SLIDE_DUR;
            // bụi kéo dài liên tục phía dưới trong lúc trượt
            this._slideDustTimer = (this._slideDustTimer || 0) - dt;
            if (this._slideDustTimer <= 0) {
                this._slideDustTimer = 0.055;
                this.spawnDustBurst(this.VW / 2 + p.xOff, this.PLAYER_Y + 30, 2);
            }
            if (p.slideT >= 1) { p.slideT = 0; p.sliding = false; }
        }
        if (p.invulnT > 0) { p.invulnT -= dt; if (p.invulnT < 0) p.invulnT = 0; }
    },

    // Bụi đất bắn ra dưới chân — dùng cho lúc nhảy/tiếp đất/trượt, giúp 2
    // hành động này "rõ ràng" hơn hẳn thay vì chỉ có animation co giãn.
    spawnDustBurst(x, y, count) {
        for (let i = 0; i < count; i++) {
            const ang = Math.PI + (Math.random() - 0.5) * 1.7; // toé chủ yếu ra sau + 2 bên
            const spd = 40 + Math.random() * 70;
            this.particles.push({
                x, y, vx: Math.cos(ang) * spd, vy: -20 - Math.random() * 30,
                gravity: 220, life: 0.3 + Math.random() * 0.25, maxLife: 0.55,
                color: "rgba(225,214,180,0.7)", size: 2.5 + Math.random() * 3,
            });
        }
    },

    // ═══════════════════════════════════════════════════════════
    // KHÚC CUA NGẪU NHIÊN — cập nhật máy trạng thái mỗi khung hình
    // ═══════════════════════════════════════════════════════════
    randomCornerInterval() { return 13 + Math.random() * 15; }, // 13..28 giây

    updateCorner(dt) {
        if (!this.corner.active) {
            this.cornerTimer -= dt;
            if (this.cornerTimer <= 0) this.triggerCorner();
            return;
        }
        if (this.corner.phase === "prompt") {
            this.corner.promptT += dt;
            if (this.corner.promptT >= this.CORNER_PROMPT_DURATION) {
                // hết giờ mà không bấm gì -> TỰ ĐỘNG chọn ngẫu nhiên
                this.chooseCorner(Math.random() < 0.5 ? -1 : 1);
            }
        } else if (this.corner.phase === "turning") {
            this.corner.progress += dt / this.CORNER_TURN_DURATION;
            if (this.corner.progress >= 1) this.endCorner();
        }
    },

    triggerCorner() {
        if (this.gameOver) return;
        this.corner.active = true;
        this.corner.phase = "prompt";
        this.corner.promptT = 0;
        this.corner.dir = 0;
        this.corner.progress = 0;
        this.cornerPending = true; // tạm dừng sinh chướng ngại/vàng, giữ đường quang đãng
        this.playCornerAlertSound();
    },

    chooseCorner(dir) {
        if (this.corner.phase !== "prompt") return;
        this.corner.dir = dir;
        this.corner.phase = "turning";
        this.corner.progress = 0;
        this.playCornerTurnSound(dir);
    },

    endCorner() {
        this.corner.active = false;
        this.corner.phase = "none";
        this.corner.dir = 0;
        this.corner.progress = 0;
        this.cornerPending = false;
        this.cornerTimer = this.randomCornerInterval();
    },

    // Độ lệch ngang do khúc cua gây ra tại độ sâu t — CỘNG THÊM vào project()
    // (không thay thế pathOffsetX của khu vực), theo đúng "Hướng A": chỉ lệch
    // toạ độ VẼ, hoàn toàn không đụng vào lane (-1/0/1) dùng để tính va chạm.
    cornerOffsetX(t) {
        if (!this.corner.active || this.corner.phase !== "turning") return 0;
        const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, this.corner.progress))); // 0 -> 1 -> 0
        const depthWeight = 0.25 + 0.75 * Math.max(0, Math.min(1, t)); // xa lệch nhiều, gần lệch ít
        return this.corner.dir * this.CORNER_MAX_OFFSET * envelope * depthWeight;
    },

    updateSpawns(dt) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.spawnWave();
            const desiredGap = 0.85 + Math.random() * 0.55;
            this.spawnTimer = Math.max(0.55, desiredGap / this.speed);
        }
        this.propTimer -= dt;
        if (this.propTimer <= 0) {
            this.spawnSideProp();
            this.propTimer = 0.35 + Math.random() * 0.4;
        }
    },

    spawnSideProp() {
        const lane = Math.random() < 0.5 ? -1 : 1;
        const kinds = this.zone().propKinds || ["pillar"];
        this.sideProps.push({
            lane: lane * (1.75 + Math.random() * 0.5),
            t: 1.08,
            kind: kinds[Math.floor(Math.random() * kinds.length)],
            jitter: Math.random() * 40 - 20,
        });
    },

    // Đang chờ người chơi chạy tới cổng dịch chuyển -> KHÔNG sinh thêm
    // chướng ngại/vàng mới, để đường tới cổng luôn quang đãng, an toàn.
    spawnWave() {
        if (this.portalPending || this.cornerPending) return;
        const roll = Math.random();
        const wallOK = this.zone().wallEnabled;
        if (roll < 0.28) {
            this.spawnCoinLine();
        } else if (roll < 0.42) {
            this.spawnCoinLine();
            this.spawnSingleObstacle();
        } else if (roll < 0.66) {
            this.spawnSingleObstacle();
        } else if (roll < 0.85 || !wallOK) {
            this.spawnBarrier();
        } else {
            this.spawnWallGap();
        }
    },

    spawnCoinLine() {
        const lane = this.LANES[Math.floor(Math.random() * this.LANES.length)];
        const count = 2 + Math.floor(Math.random() * 2); // 2..3
        for (let i = 0; i < count; i++) {
            this.objects.push({ kind: "coin", lane, t: 1.05 + i * 0.055, resolved: false, spin: Math.random() * 10 });
        }
    },

    spawnSingleObstacle() {
        const lane = this.LANES[Math.floor(Math.random() * this.LANES.length)];
        const pool = this.zone().obstacleTypes;
        const type = pool[Math.floor(Math.random() * pool.length)];
        this.objects.push({ kind: "obstacle", lane, t: 1.08, type, resolved: false, spanAll: false, spin: Math.random() * 10 });
        // thưởng vàng ở 1 lane an toàn bên cạnh để khuyến khích đổi lane
        if (Math.random() < 0.6) {
            const safeLanes = this.LANES.filter((l) => l !== lane);
            const safeLane = safeLanes[Math.floor(Math.random() * safeLanes.length)];
            for (let i = 0; i < 3; i++) {
                this.objects.push({ kind: "coin", lane: safeLane, t: 1.08 + i * 0.05, resolved: false, spin: Math.random() * 10 });
            }
        }
    },

    spawnBarrier() {
        const pool = this.zone().obstacleTypes;
        const type = pool[Math.floor(Math.random() * pool.length)];
        const action = this.OBSTACLE_ACTIONS[type];
        this.objects.push({ kind: "obstacle", lane: 0, t: 1.1, type, resolved: false, spanAll: true, spin: Math.random() * 10 });
        // vàng thưởng ngay tại chỗ, chỉ ăn được nếu thực hiện đúng động tác (nhảy/trượt)
        this.LANES.forEach((lane) => {
            this.objects.push({
                kind: "coin", lane, t: 1.1, resolved: false, spin: Math.random() * 10,
                overBarrier: action === "jump",
                underBarrier: action === "slide",
            });
        });
    },

    // Chướng ngại: bức tường cổ chắn 2/3 làn, chỉ chừa lại đúng 1 làn
    // trống — không né được bằng nhảy/trượt, buộc người chơi phải ĐỔI LÀN
    // sang đúng chỗ trống trước khi va tới. (Chỉ xuất hiện ở khu vực có
    // zone.wallEnabled === true — xem spawnWave()).
    spawnWallGap() {
        const freeLane = this.LANES[Math.floor(Math.random() * this.LANES.length)];
        const blockedLanes = this.LANES.filter((l) => l !== freeLane);
        this.objects.push({ kind: "obstacle", type: "wall", lane: freeLane, blockedLanes, t: 1.12, resolved: false, spanAll: false });
        // vàng dẫn đường ngay tại làn trống để gợi ý hướng né
        for (let i = 0; i < 3; i++) {
            this.objects.push({ kind: "coin", lane: freeLane, t: 1.12 + i * 0.05, resolved: false, spin: Math.random() * 10 });
        }
    },

    // Cổng dịch chuyển sang khu vực TIẾP THEO (quay vòng hết danh sách ZONES).
    spawnPortal() {
        const nextIndex = (this.currentZoneIndex + 1) % window.RaceBackground.ZONES.length;
        this.objects.push({ kind: "portal", lane: 0, t: 1.25, resolved: false, nextIndex, spin: 0 });
    },

    updateObjects(dt) {
        const remain = [];
        for (const obj of this.objects) {
            obj.t -= this.speed * dt;
            if (obj.spin !== undefined) obj.spin += dt * 6;
            if (!obj.resolved && Math.abs(obj.t) < this.COLLIDE_T) {
                if (obj.kind === "portal") this.resolvePortal(obj);
                else this.resolveCollision(obj);
            }
            if (obj.t > -0.12) remain.push(obj);
        }
        this.objects = remain;
    },

    updateSideProps(dt) {
        const remain = [];
        for (const sp of this.sideProps) {
            sp.t -= this.speed * dt;
            if (sp.t > -0.12) remain.push(sp);
        }
        this.sideProps = remain;
    },

    updateParticles(dt) {
        const remain = [];
        for (const pt of this.particles) {
            pt.life -= dt;
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.vy += (pt.gravity || 0) * dt;
            if (pt.life > 0) remain.push(pt);
        }
        this.particles = remain;
    },

    // ═══════════════════════════════════════════════════════════
    // BẦU KHÔNG KHÍ THEO KHU VỰC (đom đóm/phấn hoa/bong bóng/mây/tro lửa)
    // ═══════════════════════════════════════════════════════════
    initAmbientParticles() {
        this.ambientParticles = [];
        for (let i = 0; i < 16; i++) this.ambientParticles.push(this.makeAmbientParticle(true));
    },

    makeAmbientParticle(randomY) {
        const ember = this.zone().ambient === "ember";
        return {
            x: Math.random() * this.VW,
            y: randomY ? Math.random() * this.HORIZON_Y * 1.3 : (ember ? this.HORIZON_Y * 1.25 : -10),
            vx: (Math.random() - 0.5) * 14,
            vy: 6 + Math.random() * 14,
            size: 1.4 + Math.random() * 2.6,
            phase: Math.random() * Math.PI * 2,
        };
    },

    updateAmbientParticles(dt) {
        const ember = this.zone().ambient === "ember";
        for (const p of this.ambientParticles) {
            p.phase += dt;
            p.x += (p.vx + Math.sin(p.phase) * 8) * dt;
            p.y += (ember ? -p.vy : p.vy) * dt;
            if (p.y > this.HORIZON_Y * 1.4 || p.y < -20 || p.x < -20 || p.x > this.VW + 20) {
                Object.assign(p, this.makeAmbientParticle(false));
            }
        }
    },

    drawAmbientParticles() {
        const ctx = this.ctx;
        const z = this.zone();
        ctx.save();
        ctx.fillStyle = z.ambientColor;
        this.ambientParticles.forEach((p) => {
            ctx.globalAlpha = z.ambient === "firefly" ? (0.35 + 0.65 * Math.abs(Math.sin(p.phase * 2))) : 0.8;
            if (z.ambient === "cloudwisp") {
                ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 3, p.size * 1.3, 0, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            }
        });
        ctx.restore();
    },

    // ═══════════════════════════════════════════════════════════
    // VA CHẠM
    // ═══════════════════════════════════════════════════════════
    resolveCollision(obj) {
        const p = this.player;

        if (obj.kind === "coin") {
            if (obj.lane !== p.lane) { obj.resolved = true; return; }
            if (obj.overBarrier && !p.jumping) { obj.resolved = true; return; }
            if (obj.underBarrier && !p.sliding) { obj.resolved = true; return; }
            obj.resolved = true;
            this.collectCoin(obj);
            return;
        }

        // obstacle — "covered" = người chơi đang ở làn bị chướng ngại này che
        const covered = obj.spanAll || (obj.blockedLanes ? obj.blockedLanes.includes(p.lane) : obj.lane === p.lane);
        if (!covered) { obj.resolved = true; return; }
        obj.resolved = true;
        if (p.invulnT > 0) return; // đang bất tử sau va chạm trước đó

        const action = this.OBSTACLE_ACTIONS[obj.type] || "jump";
        // "dodge" (bức tường đổi làn) không có cách né nào ngoài việc đứng
        // đúng làn trống ngay từ đầu — nếu đã "covered" thì luôn va chạm.
        const avoided =
            (action === "jump" && p.jumping) ||
            (action === "slide" && p.sliding);
        if (!avoided) this.hitObstacle(obj);
    },

    resolvePortal(obj) {
        obj.resolved = true;
        this.changeZone(obj.nextIndex);
    },

    collectCoin(obj) {
        this.coinsCollected++;
        this.coinsSinceQuiz++;
        this.zoneCoins++;
        this.playCoinSound();
        const pos = this.projectPlayerPoint();
        this.spawnBurst(pos.x, pos.y - 20, "#ffd54f", 8);
        this.spawnFloatText(pos.x, pos.y - 40, "+10", "#ffd54f");

        if (this.coinsSinceQuiz >= this.coinsUntilQuiz) {
            this.coinsSinceQuiz = 0;
            this.coinsUntilQuiz = this.randomCoinThreshold();
            this.triggerQuiz();
        }

        if (!this.portalPending && this.zoneCoins >= this.zoneCoinsTarget) {
            this.portalPending = true;
            this.spawnPortal();
        }
    },

    hitObstacle(obj) {
        this.lives = Math.max(0, this.lives - 1);
        this.player.hit = true;
        this.player.invulnT = 1.3;
        this.shake.t = 0.35; this.shake.mag = 16;
        this.playHitSound();
        const pos = this.projectPlayerPoint();
        this.spawnBurst(pos.x, pos.y - 30, "#ff6b6b", 12);
        this.spawnFloatText(pos.x, pos.y - 50, "-1 ❤️", "#ff6b6b");
        this.updateHeartsUI();
        setTimeout(() => { this.player.hit = false; }, 260);
        this.checkGameOver();
    },

    // Đổi sang khu vực mới: cập nhật chỉ số + dựng lại gradient theo màu khu
    // vực mới + hiệu ứng chào mừng (banner tên khu vực, chớp hạt sáng, âm
    // thanh). Quay vòng hết ZONES.length thì lại về khu vực đầu tiên.
    changeZone(nextIndex) {
        this.currentZoneIndex = nextIndex;
        this.zoneCoins = 0;
        this.zoneCoinsTarget = this.randomZoneTarget();
        this.portalPending = false;
        window.RaceBackground.rebuildGradients(this.ctx, this.raceState());
        this.spawnBurst(this.VW / 2, this.HORIZON_Y * 0.7, this.zone().portalColor, 34);
        this.showZoneBanner();
        this.playZoneChangeSound();
    },

    showZoneBanner() {
        const el = document.getElementById("zone-banner");
        if (!el) return;
        const txt = el.querySelector(".zone-banner-txt");
        if (txt) txt.textContent = this.zone().label;
        el.classList.remove("show");
        void el.offsetWidth;
        el.classList.add("show");
        clearTimeout(this._zoneBannerTimer);
        this._zoneBannerTimer = setTimeout(() => el.classList.remove("show"), 2400);
    },

    spawnBurst(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 60 + Math.random() * 120;
            this.particles.push({
                x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 40,
                gravity: 260, life: 0.5 + Math.random() * 0.3, maxLife: 0.8,
                color, size: 3 + Math.random() * 3,
            });
        }
    },

    spawnFloatText(x, y, text, color) {
        this.particles.push({ x, y, vx: 0, vy: -55, gravity: 40, life: 0.9, maxLife: 0.9, color, text, size: 20 });
    },

    // ═══════════════════════════════════════════════════════════
    // QUIZ THEO SỐ VÀNG ĐÃ ĂN
    // ═══════════════════════════════════════════════════════════
    triggerQuiz() {
        if (this.gameOver) return;
        this.paused = true;
        this.controlsLocked = true;
        document.getElementById("race-controls").classList.add("locked");
        this.playQuizChime();

        const banner = document.getElementById("quiz-intro-banner");
        banner.classList.add("show");
        setTimeout(() => { banner.classList.remove("show"); }, 900);

        setTimeout(() => {
            if (window.QuizManager) {
                window.QuizManager.ask((isCorrect) => this.onQuizAnswered(isCorrect));
            } else {
                this.onQuizAnswered(true);
            }
        }, 750);
    },

    onQuizAnswered(isCorrect) {
        if (window.PkmScore) window.PkmScore.recordAnswer(isCorrect);

        this.totalCount++;
        if (isCorrect) this.correctCount++; else this.wrongCount++;
        this.updateHUD();

        this.paused = false;
        this.controlsLocked = false;
        document.getElementById("race-controls").classList.remove("locked");
        this.lastTs = performance.now(); // tránh dt khổng lồ ngay sau khi resume

        if (!isCorrect) {
            // Phạt khi trả lời sai: mất 1 mạng, mô phỏng va vấp
            this.player.invulnT = 0.1;
            this.hitObstacle({ type: "penalty" });
        } else {
            const pos = this.projectPlayerPoint();
            this.spawnFloatText(pos.x, pos.y - 60, "🎉 Chuẩn!", "#2ecc71");
        }

    const isOver = this.checkGameOver();
    if (isOver) return;

    // CHECKPOINT — cứ đủ PkmScore.CHECKPOINT_INTERVAL câu (dùng this.totalCount,
    // KHÔNG bị reset mỗi lần chốt) thì dừng lại hỏi Tiếp tục/Dừng.
    if (window.PkmScore && window.PkmScore.shouldCheckpoint(this.totalCount)) {
        this.showCheckpoint();
        return;
    }

    // gameLoopStep() đã tự dừng hẳn khi paused=true ở trên -> phải chủ
    // động khởi động lại tại đây.
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this._boundLoop);
    },

    // Chốt điểm GIỮA CHỪNG + hỏi Chơi tiếp/Dừng. Vẫn giữ this.paused = true
    // (đã được triggerQuiz() bật từ trước) nên thế giới đứng yên trong lúc
    // popup hiện — CHỈ khi bấm "Chơi tiếp" mới thực sự resume rAF.
    showCheckpoint() {
    const result = window.PkmScore.finishMatch({ won: true, minQuestions: 0, allowLessonUnlock: true });
    window.PkmScore.resetForNewRound();

    const messages = (result.breakdown || []).map(b => {
        if (b.type === 'new_lesson') return `🌟 BÀI MỚI HOÀN THÀNH (${b.accuracy}% đúng): <b>+${b.exp} KN +${b.dv} DV</b>`;
        if (b.type === 'new_lesson_failed') return `⚠️ Bài mới nhưng chỉ ${b.accuracy}% đúng — cần ≥${b.requiredAccuracy}%!`;
        if (b.type === 'correct_answers') return `📝 ${b.correctCount} câu đúng ÷ ${b.divisor} = <b>+${b.exp} KN +${b.dv} DV</b>`;
        if (b.type === 'streak') return b.exp > 0 ? `🔥 Chuỗi ${b.streak} ngày: <b>+${b.exp} KN +${b.dv} DV</b>` : '';
        return '';
    }).filter(Boolean);

    window.PkmScore.showCheckpointPopup({
        title: `🎁 Đã trả lời ${this.totalCount} câu!`,
        breakdownHTML: messages.map(m => `<div>${m}</div>`).join('') || '<div>Chưa có thưởng mới ở mốc này.</div>',
        onContinue: () => {
            this.lastTs = performance.now();
            this.rafId = requestAnimationFrame(this._boundLoop);
        },
        onStop: () => this.handleMatchEnd(),
    });
    },

    // ═══════════════════════════════════════════════════════════
    // ĐIỀU KHIỂN
    // ═══════════════════════════════════════════════════════════
    attachControls() {
        const doLeft = () => this.moveLane(-1);
        const doRight = () => this.moveLane(1);
        const doJump = () => this.jumpAction();
        const doSlide = () => this.slideAction();

        document.getElementById("btnLeft").addEventListener("click", doLeft);
        document.getElementById("btnRight").addEventListener("click", doRight);
        document.getElementById("btnJump").addEventListener("click", doJump);
        document.getElementById("btnSlide").addEventListener("click", doSlide);

        window.addEventListener("keydown", (e) => {
            if (this.controlsLocked || !this.running || this.gameOver) return;
            if (e.key === "ArrowLeft" || e.key === "a") doLeft();
            else if (e.key === "ArrowRight" || e.key === "d") doRight();
            else if (e.key === "ArrowUp" || e.key === " " || e.key === "w") doJump();
            else if (e.key === "ArrowDown" || e.key === "s") doSlide();
        });

        // Cử chỉ vuốt trên canvas
        let touchStartX = 0, touchStartY = 0, touchActive = false;
        const stage = document.getElementById("race-stage");
        stage.addEventListener("touchstart", (e) => {
            if (this.controlsLocked) return;
            const t = e.changedTouches[0];
            touchStartX = t.clientX; touchStartY = t.clientY; touchActive = true;
        }, { passive: true });
        stage.addEventListener("touchend", (e) => {
            if (!touchActive || this.controlsLocked) return;
            touchActive = false;
            const t = e.changedTouches[0];
            const dx = t.clientX - touchStartX;
            const dy = t.clientY - touchStartY;
            const absX = Math.abs(dx), absY = Math.abs(dy);
            const THRESH = 28;
            if (Math.max(absX, absY) < THRESH) return;
            if (absX > absY) { dx > 0 ? doRight() : doLeft(); }
            else { dy > 0 ? doSlide() : doJump(); }
        }, { passive: true });
    },

    moveLane(dir) {
        if (this.controlsLocked || !this.running || this.gameOver) return;
        // Đang chờ người chơi chọn hướng khúc cua -> trái/phải lúc này dùng
        // để CHỌN HƯỚNG CUA, không phải đổi làn bình thường.
        if (this.corner.phase === "prompt") { this.chooseCorner(dir); return; }
        const idx = this.LANES.indexOf(this.player.lane);
        const next = Math.max(0, Math.min(this.LANES.length - 1, idx + dir));
        if (next === idx) return; // đã ở làn ngoài cùng, không có gì đổi thì khỏi phát âm thanh
        this.player.lane = this.LANES[next];
        this.playSwitchSound();
    },

    jumpAction() {
        if (this.controlsLocked || !this.running || this.gameOver) return;
        if (this.player.jumping || this.player.sliding) return;
        this.player.jumping = true;
        this.player.jumpT = 0;
        this.playJumpSound();
        this.spawnDustBurst(this.VW / 2 + this.player.xOff, this.PLAYER_Y + 30, 10);
    },

    slideAction() {
        if (this.controlsLocked || !this.running || this.gameOver) return;
        if (this.player.jumping || this.player.sliding) return;
        this.player.sliding = true;
        this.player.slideT = 0;
        this.playSlideSound();
        this.spawnDustBurst(this.VW / 2 + this.player.xOff, this.PLAYER_Y + 30, 8);
    },

    // ═══════════════════════════════════════════════════════════
    // HUD
    // ═══════════════════════════════════════════════════════════
    updateHUD() {
        const coinsEl = document.getElementById("coinsValue");
        const scoreEl = document.getElementById("scoreValue");
        if (coinsEl) coinsEl.innerText = this.coinsCollected;
        if (scoreEl) scoreEl.innerText = this.score;
        const stats = document.getElementById("quiz-stats");
        if (stats) stats.innerHTML = `✅ ${this.correctCount} &nbsp; ❌ ${this.wrongCount} &nbsp; 📊 ${this.totalCount} câu`;
        const zoneEl = document.getElementById("zoneChip");
        if (zoneEl) zoneEl.textContent = (this.zone().label || "").split(" ")[0] || "🏛️";
    },

    updateHeartsUI() {
        document.querySelectorAll("#heartsBox .heart-icon").forEach((el, i) => {
            el.classList.toggle("heart-lost", i >= this.lives);
        });
    },

    // ═══════════════════════════════════════════════════════════
    // KẾT THÚC GAME
    // ═══════════════════════════════════════════════════════════
    checkGameOver() {
        if (this.gameOver) return true;
        if (this.lives <= 0) {
            this.gameOver = true;
            this.running = false;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.playGameOverSound();
            setTimeout(() => this.handleMatchEnd(), 500);
            return true;
        }
        return false;
    },

    async getRewardImage() {
        try {
            const inv = JSON.parse(localStorage.getItem("pkm_inventory")) || [];
            const team = inv.filter((p) => p.inTeam).sort((a, b) => a.position - b.position);
            if (team.length > 0) return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${team[0].id}.png`;
        } catch (e) { /* ignore */ }
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png`;
    },

    handleMatchEnd() {
        if (!window.PkmScore) {
            console.error('❌ PkmScore chưa được nạp — thiếu <script src="pkm_score.js"> trong pkm_race.html (phải đặt TRƯỚC thẻ <script src="pkm_race.js">)?');
            return;
        }

        const enoughQuestions = this.totalCount >= this.MIN_QUESTIONS;
        const result = window.PkmScore.finishMatch({
            won: enoughQuestions,
            minQuestions: this.MIN_QUESTIONS,
        });

        const titleEl = document.getElementById("victory-title-text");
        const expText = document.getElementById("victory-exp-text");

        if (result.skipped) {
            this.getRewardImage().then((src) => {
                const img = document.getElementById("victory-pkm-img");
                if (img) { img.src = src; img.style.filter = "grayscale(100%) opacity(0.7)"; }
            });
            if (titleEl) {
                titleEl.innerText = "💥 HẾT MẠNG RỒI!";
                titleEl.style.color = "#e74c3c";
                titleEl.style.textShadow = "0 0 30px #e74c3c, 0 0 60px #c0392b";
            }
            if (expText) {
                expText.innerHTML = `
                    <div style="color:#ccc; margin-bottom:14px;">Chuyến chạy kết thúc quá sớm!</div>
                    <div style="font-size:13px; color:#ff9f43; margin-bottom:10px;">
                        Ván này mới trả lời ${this.totalCount}/${this.MIN_QUESTIONS} câu tối thiểu nên
                        chưa được tính điểm hay thưởng.
                    </div>
                    <div style="font-size:12px; color:#ffbc00;">Chơi lại và trả lời đủ ${this.MIN_QUESTIONS} câu để được ghi nhận nhé!</div>`;
            }
            const overlay = document.getElementById("victory-overlay");
            if (overlay) overlay.style.display = "flex";
            return;
        }

        this.getRewardImage().then((src) => {
            const img = document.getElementById("victory-pkm-img");
            if (img) img.src = src;
        });

        if (titleEl) titleEl.innerText = "🏆 VỀ ĐÍCH!";

        const messages = (result.breakdown || []).map((b) => {
            if (b.type === "new_lesson") return `🌟 BÀI MỚI HOÀN THÀNH (${b.accuracy}% đúng): <b>+${b.exp} KN +${b.dv} DV</b>`;
            if (b.type === "new_lesson_failed") return `⚠️ Bài mới nhưng chỉ ${b.accuracy}% đúng — cần ≥${b.requiredAccuracy}% để mở khoá!`;
            if (b.type === "correct_answers") return `📝 ${b.correctCount} câu đúng ÷ ${b.divisor} = <b>+${b.exp} KN +${b.dv} DV</b>`;
            if (b.type === "streak") return b.exp > 0 ? `🔥 Chuỗi ${b.streak} ngày liên tục: <b>+${b.exp} KN +${b.dv} DV</b>` : `📅 Chuỗi hiện tại: <b>${b.streak} ngày</b>`;
            return "";
        }).filter(Boolean);

        const skillOrder = window.PkmScore.SKILL_ORDER;
        const skillStatsNow = window.PkmScore.session.skillStats;
        const skillLines = skillOrder.map((s) => {
            const st = skillStatsNow[s] || { correct: 0, total: 0 };
            const label = { listening: "🎧 Nghe", speaking: "🗣️ Nói", reading: "📖 Đọc", writing: "✍️ Viết" }[s];
            return `<div>${label}: ${st.correct}/${st.total}</div>`;
        }).join("");

        if (expText) {
            expText.innerHTML = `
                <div style="font-size:13px; text-align:left; margin-bottom:12px; line-height:2;">
                    ${messages.map((m) => `<div>${m}</div>`).join("")}
                </div>
                <div style="border-top:1px solid #444; padding-top:10px; margin-bottom:12px;">
                    <div style="color:#4caf50; font-size:16px; font-weight:bold;">+${result.bonusEXP} KN &nbsp; +${result.bonusDV} DV</div>
                    <div style="color:#aaa; font-size:12px;">Tổng: ${result.newEXP} KN | ${result.newDV} DV</div>
                </div>
                <div style="color:#aaa; font-size:12px; margin-bottom:4px;">
                    🪙 Vàng thu được: ${this.coinsCollected} &nbsp; | &nbsp; 🗺️ Khu vực đã qua: ${this.currentZoneIndex + 1} &nbsp; | &nbsp; 🏁 Quãng đường: ${Math.floor(this.distance)}m &nbsp; | &nbsp; ⭐ Điểm: ${this.score}
                </div>
                <div style="color:#aaa; font-size:12px; margin-bottom:8px;">
                    📊 Tổng: ✅ ${this.correctCount} đúng / ❌ ${this.wrongCount} sai / ${this.totalCount} câu
                </div>
                <div style="color:#8fa3d1; font-size:11px; text-align:left;">
                    ${skillLines}
                </div>`;
        }

        const overlay = document.getElementById("victory-overlay");
        if (overlay) overlay.style.display = "flex";
    },

    // ═══════════════════════════════════════════════════════════
    // PHỐI CẢNH GIẢ 3D (chiếu 1 điểm lane/t ra toạ độ màn hình)
    // ═══════════════════════════════════════════════════════════
    project(lane, t) {
        const f = Math.max(0, Math.min(1, t)) ** 1.6;
        const centerX = this.VW / 2;
        const laneOffset = this.LANE_OFFSET_BOTTOM + (this.LANE_OFFSET_TOP - this.LANE_OFFSET_BOTTOM) * f;
        const zone = this.zone();
        const x = centerX + lane * laneOffset + window.RaceBackground.pathOffsetX(zone, t, this.distance) + this.cornerOffsetX(t);
        const y = this.ROAD_BOTTOM_Y + (this.HORIZON_Y - this.ROAD_BOTTOM_Y) * f + window.RaceBackground.pathOffsetY(zone, t, this.distance);
        const scale = 1 + (0.12 - 1) * f;
        return { x, y, scale, f };
    },

    // Trả về toạ độ trong KHÔNG GIAN ẢO (VWxVH) — khớp hệ toạ độ mà drawScene()
    // đang dùng cho mọi thứ khác (KHÔNG quy đổi ra px CSS, tránh lệch vị trí particle).
    projectPlayerPoint() {
        return { x: this.VW / 2 + this.player.xOff, y: this.PLAYER_Y - 60 };
    },

    // ═══════════════════════════════════════════════════════════
    // VẼ TOÀN CẢNH
    // ═══════════════════════════════════════════════════════════
    drawScene(dt) {
        const ctx = this.ctx;
        ctx.save();
        ctx.clearRect(0, 0, this.VW, this.VH);

        if (this.shake.t > 0) {
            const m = this.shake.mag * (this.shake.t / 0.35);
            ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
        }

        const state = this.raceState();
        window.RaceBackground.drawSky(ctx, state);
        this.drawAmbientParticles();
        window.RaceBackground.drawGroundFill(ctx, state);
        window.RaceBackground.drawRoad(ctx, state);

        // gộp props + objects rồi vẽ theo thứ tự xa->gần
        const drawList = [];
        this.sideProps.forEach((sp) => drawList.push({ ref: sp, isProp: true }));
        this.objects.forEach((o) => drawList.push({ ref: o, isProp: false }));
        drawList.sort((a, b) => b.ref.t - a.ref.t);
        drawList.forEach((item) => {
            if (item.isProp) window.RaceBackground.drawSideProp(ctx, item.ref, state);
            else this.drawObject(item.ref);
        });

        this.drawPlayer();
        this.drawParticles();
        this.drawCornerPrompt();
        this.drawVignette();

        ctx.restore();
    },

    // Tính toạ độ chiếu cho 1 vật thể tại (lane, t) — tách riêng thành helper
    // để dùng lại được cho cả obstacle 'wall'/'portal' (chặn/che NHIỀU làn
    // cùng lúc, cần chiếu riêng từng làn) lẫn coin/obstacle bình thường (1 làn).
    renderProjFor(lane, t) {
        if (t >= 0) return this.project(lane, t);
        // Đã lướt qua khỏi camera -> phóng to nhanh & rơi khỏi màn hình dưới,
        // tránh hiện tượng "đứng khựng" ở đúng vị trí người chơi vài khung hình.
        const base = this.project(lane, 0);
        const k = -t; // 0 -> 0.12
        return { x: base.x, y: base.y + k * 3200, scale: base.scale + k * 10, f: 0 };
    },

    drawObject(obj) {
        const state = this.raceState();
        if (obj.kind === "portal") { window.RaceBackground.drawPortal(this.ctx, obj, state); return; }
        if (obj.type === "wall") { window.RaceBackground.drawWallGap(this.ctx, obj, state); return; }
        const proj = this.renderProjFor(obj.lane, obj.t);
        if (obj.kind === "coin") this.drawCoin(proj, obj);
        else window.RaceBackground.drawObstacle(this.ctx, proj, obj, state);
    },

    drawCoin(proj, obj) {
        const ctx = this.ctx;
        const r = 20 * proj.scale;
        const squish = Math.abs(Math.cos(obj.spin));
        ctx.save();
        ctx.translate(proj.x, proj.y - 14 * proj.scale);
        // bóng đổ dưới đồng vàng
        ctx.save();
        ctx.translate(0, 14 * proj.scale);
        ctx.scale(1, 0.3);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        ctx.scale(Math.max(0.15, squish), 1);
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        grad.addColorStop(0, "#fff6c9");
        grad.addColorStop(0.5, "#ffd54f");
        grad.addColorStop(1, "#e08e00");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#a85f00"; ctx.lineWidth = Math.max(1, 2 * proj.scale);
        ctx.stroke();
        ctx.fillStyle = "rgba(160,90,0,0.85)";
        ctx.font = `bold ${r * 1.05}px Baloo 2, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("₽", 0, 1);
        ctx.restore();
    },

    drawPlayer() {
        const ctx = this.ctx;
        const p = this.player;
        const x = this.VW / 2 + p.xOff;
        let y = this.PLAYER_Y;
        let scale = 1;

        if (p.jumping) {
            const arc = Math.sin(Math.PI * p.jumpT);
            y -= arc * 190;
            scale = 1 + arc * 0.05;
        }
        let squashY = 1, squashX = 1;
        if (p.sliding) {
            const s = Math.sin(Math.PI * Math.min(1, p.slideT * 1.6));
            squashY = 1 - s * 0.42;
            squashX = 1 + s * 0.22;
            y += 26 * s;
        }

        // bóng đổ dưới nhân vật
        ctx.save();
        ctx.translate(x, this.PLAYER_Y + 46);
        ctx.scale(1, 0.28);
        const shadowAlpha = p.jumping ? 0.18 : 0.4;
        ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
        ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // hào quang vàng phía sau
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = (window.RaceBackground._gradCache && window.RaceBackground._gradCache.playerGlow) || "rgba(255,203,5,0.2)";
        ctx.beginPath(); ctx.arc(0, 20, 90, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // vệt tốc độ phía sau khi chạy nhanh
        if (this.speed > 0.75 && !p.sliding) {
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = "#ffd54f";
            ctx.lineWidth = 4;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(x - 40 - i * 14, y - 10 + i * 14);
                ctx.lineTo(x - 80 - i * 18, y - 6 + i * 14);
                ctx.stroke();
            }
            ctx.restore();
        }

        // nhấp nháy khi đang bất tử (mới bị va chạm)
        const blinking = p.invulnT > 0 && Math.floor(p.invulnT * 12) % 2 === 0;
        ctx.save();
        ctx.globalAlpha = blinking ? 0.35 : 1;
        ctx.translate(x, y);
        const bob = p.jumping || p.sliding ? 0 : Math.sin(p.runCycle) * 8;
        ctx.translate(0, bob);
        ctx.scale(squashX * scale, squashY * scale);

        const size = 160;
        if (this.characterImg && this.characterImg.complete && this.characterImg.naturalWidth > 0) {
            ctx.save();
            if (p.hit) ctx.filter = "brightness(1.8) saturate(0.4)";
            ctx.drawImage(this.characterImg, -size / 2, -size, size, size);
            ctx.restore();
        } else {
            ctx.fillStyle = "#ffcb05";
            ctx.beginPath(); ctx.arc(0, -size / 2, size * 0.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    },

    drawParticles() {
        const ctx = this.ctx;
        this.particles.forEach((pt) => {
            const alpha = Math.max(0, pt.life / pt.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            if (pt.text) {
                ctx.fillStyle = pt.color;
                ctx.font = `bold ${pt.size}px Baloo 2, sans-serif`;
                ctx.textAlign = "center";
                ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 3;
                ctx.strokeText(pt.text, pt.x, pt.y);
                ctx.fillText(pt.text, pt.x, pt.y);
            } else {
                ctx.fillStyle = pt.color;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        });
    },

    // Mũi tên gợi ý 2 bên + vòng đếm ngược — chỉ hiện trong giai đoạn "prompt"
    // (đang chờ người chơi bấm trái/phải để chọn hướng khúc cua).
    drawCornerPrompt() {
        if (this.corner.phase !== "prompt") return;
        const ctx = this.ctx;
        const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.corner.promptT * 6));
        const remain = Math.max(0, 1 - this.corner.promptT / this.CORNER_PROMPT_DURATION);
        const cy = this.HORIZON_Y + 110;

        [[-1, this.VW * 0.14], [1, this.VW * 0.86]].forEach(([dir, cx]) => {
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.translate(cx, cy);
            ctx.fillStyle = "#ffcb05";
            ctx.shadowColor = "rgba(255,203,5,0.85)";
            ctx.shadowBlur = 20;
            ctx.beginPath();
            if (dir < 0) { ctx.moveTo(18, -24); ctx.lineTo(-20, 0); ctx.lineTo(18, 24); }
            else { ctx.moveTo(-18, -24); ctx.lineTo(20, 0); ctx.lineTo(-18, 24); }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });

        ctx.save();
        ctx.translate(this.VW / 2, cy);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 22px Baloo 2, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("↔", 0, 1);
        ctx.restore();
    },

    drawVignette() {
        const ctx = this.ctx;
        ctx.fillStyle = (window.RaceBackground._gradCache && window.RaceBackground._gradCache.vign) || "rgba(0,0,0,0.25)";
        ctx.fillRect(0, 0, this.VW, this.VH);
    },
};

window.RaceGame.init();
