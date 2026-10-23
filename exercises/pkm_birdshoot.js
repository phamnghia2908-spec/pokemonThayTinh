/**
 * ==========================================
 * POKÉMON BIRD SHOOT — GAME LOGIC (kiểu Moorhuhn: bắn chim qua màn hình)
 * ==========================================
 * Luồng tổng thể HỆT pkm_race.js: học từ vựng trước (VocabularyModule) ->
 * chọn cấp độ -> chạm để bắt đầu -> đếm ngược -> chơi. Quiz gọi theo SỐ CHIM
 * ĐÃ BẮN TRÚNG (giống coinsUntilQuiz), điểm/EXP/DV dùng chung window.PkmScore
 * (pkm_score.js, KHÔNG sửa) — Y HỆT cách pkm_race.js đang làm.
 *
 * ĐIỂM KHÁC BIỆT SO VỚI pkm_race.js:
 *  - Không có phối cảnh 3D/lane — đây là bắn súng 2D phẳng: chim/cối xay
 *    gió/khinh khí cầu có toạ độ (x,y) + "depth" (0=xa..1=gần) quyết định
 *    kích cỡ hiển thị + bán kính bắn trúng (xa = bé = khó bắn = ĐIỂM CAO
 *    hơn; gần = to = dễ bắn = điểm thấp hơn).
 *  - Điều khiển: TAP TRỰC TIẾP vào mục tiêu trên canvas (mobile-first),
 *    không phải né/nhảy như race.
 *  - Đạn giới hạn (MAX_AMMO viên) + nút NẠP ĐẠN (khoá bắn trong lúc nạp).
 *  - Mất mạng theo TỈ LỆ BẮN TRƯỢT: theo dõi cửa sổ trượt MISS_WINDOW_SIZE
 *    phát bắn gần nhất, nếu tỉ lệ trượt > 50% thì trừ 1 tim rồi reset cửa sổ.
 *  - Cối xay gió (5 cánh): bắn TỪNG CÁNH ăn điểm riêng, bắn hết 5 cánh ->
 *    CẢ CỐI XAY GIÓ mờ dần biến mất, một lúc sau hồi sinh ở VỊ TRÍ KHÁC.
 *  - Bù nhìn đội nón: bắn trúng NÓN ăn điểm -> xong nhiệm vụ, cả bù nhìn mờ
 *    dần biến mất rồi hồi sinh vị trí khác (giống cối xay gió). Bắn trúng
 *    THÂN bù nhìn (không phải nón) thì bị TRỪ điểm + phạt "ĐƠ" (khoá bắn/
 *    nạp đạn) STUN_DURATION giây — bù nhìn KHÔNG biến mất khi bị bắn thân.
 *  - Khinh khí cầu: bắn phải TRỪ điểm + phạt "ĐƠ" STUN_DURATION giây, giống
 *    hệt bắn trúng thân bù nhìn (mục tiêu cần TRÁNH).
 *  - Lúc bị "ĐƠ": không bắn/nạp đạn được, nhưng THẾ GIỚI VẪN CHẠY TIẾP
 *    (chim vẫn bay, KHÔNG phải tạm dừng game như lúc mở quiz).
 *  - Cối xay gió/bù nhìn/khinh khí cầu đều KHÔNG tính vào bộ đếm quiz / lên
 *    màn (chỉ chim thật mới tính), nhưng vẫn tính là "bắn trúng" cho thống
 *    kê tỉ lệ trượt (trừ phát bắn hụt hoàn toàn không trúng gì).
 *  - Chim còn có pattern thứ 4 "popup" kiểu mồi Duck Hunt: nhô từ mép dưới
 *    màn hình lên, đứng giật nhẹ ~1-1.5s rồi tự tụt xuống biến mất — bắn
 *    hụt/không kịp bắn thì KHÔNG bị trừ mạng, chỉ đơn giản mất cơ hội.
 *
 * PHẦN VẼ HÌNH ẢNH (ảnh nền banchim1.png, sprite chim/cối xay gió/khinh khí
 * cầu/bù nhìn) nằm HOÀN TOÀN ở file RIÊNG pkm_birdshoot_background.js — file
 * này chỉ GỌI qua object window.BirdShootBackground theo API cố định:
 *
 *   BirdShootBackground.preload()                     // tải ảnh nền 1 lần
 *   BirdShootBackground.rebuildGradients(ctx, state)   // gọi lúc resize()
 *   BirdShootBackground.drawBackground(ctx, state)     // vẽ nền/bầu trời/mây
 *   BirdShootBackground.drawBird(ctx, obj, state)      // obj xem spawnBird()
 *   BirdShootBackground.drawWindmill(ctx, obj, state)  // obj xem spawnWindmill()
 *   BirdShootBackground.drawBalloon(ctx, obj, state)   // obj xem spawnBalloon()
 *   BirdShootBackground.drawScarecrow(ctx, obj, state) // obj xem spawnScarecrow()
 *
 * state truyền vào mọi hàm trên = kết quả của this.shootState() bên dưới:
 *   { VW, VH, level, speedMul, tNow }
 *
 * QUY ƯỚC TOẠ ĐỘ: mọi obj dùng thẳng toạ độ KHÔNG GIAN ẢO (VW x VH), KHÔNG
 * qua phép chiếu phối cảnh nào — vì đây là bắn súng 2D phẳng, không phải
 * đường chạy 3D như race. obj.scale (suy từ obj.depth) là hệ số phóng to/
 * nhỏ sprite mà BirdShootBackground.drawXxx() phải tự nhân vào khi vẽ.
 * ==========================================
 */

window.BirdShootGame = {
    // ═══════════════════════════════════════════════════════════
    // CẤU HÌNH
    // ═══════════════════════════════════════════════════════════
    VW: 720,
    VH: 1280,
    MIN_QUESTIONS: 8,

    MISS_WINDOW_SIZE: 10,
    MISS_RATE_THRESHOLD: 0.5,

    // điểm chim: xa (depth~0) khó bắn hơn -> điểm cao hơn; gần (depth~1) dễ
    // bắn hơn -> điểm thấp hơn. Công thức: BIRD_SCORE_FAR - (FAR-NEAR)*depth
    BIRD_SCORE_FAR: 25,
    BIRD_SCORE_NEAR: 10,
    WINDMILL_BLADE_SCORE: 15,
    WINDMILL_CLEAR_BONUS: 50,
    BALLOON_PENALTY: 20,
    SCARECROW_HAT_SCORE: 20,
    SCARECROW_BODY_PENALTY: 15,

    STUN_DURATION: 3, // giây bị "đơ" khi bắn trúng thân bù nhìn / khinh khí cầu

    SCALE_FAR: 0.42,
    SCALE_NEAR: 1.15,
    HIT_RADIUS_BASE: 46, // bán kính bắn trúng ở scale=1 (đơn vị không gian ảo)

    BASE_SPEED: 150, // px ảo/giây ở depth trung bình, level 1
    MAX_SPEED_MUL: 2.1,

    GUN_RECOIL_DURATION: 0.12, // giây súng giật lùi sau mỗi phát (hiệu ứng thị giác)

    // ═══════════════════════════════════════════════════════════
    // 10 LOẠI SÚNG — nhặt được từ túi quà (xem spawnGiftBag/collectGiftBag).
    // mode: "single" = bắn 1 mục tiêu gần điểm chạm nhất (findTargetAt)
    //       "spread" = toả đạn, trúng MỌI mục tiêu trong spreadRadius quanh
    //                  điểm chạm (findTargetsInRadius)
    //       "explosive" = như spread nhưng KHÔNG phân biệt tốt/xấu (nổ trúng
    //                     khinh khí cầu/thân bù nhìn vẫn bị phạt như thường)
    //       "pierce" = xuyên táo, trúng mọi chim/túi quà THẲNG HÀNG dọc theo
    //                  toạ độ X điểm chạm (findTargetsInCorridor)
    // barrelLen: chiều dài nòng (đơn vị ảo) — pkm_birdshoot_background.js
    // PHẢI vẽ đầu nòng ở đúng khoảng cách này từ pivotPoint() để tia lửa
    // đầu nòng (muzzleTipPos()) khớp với hình vẽ viewmodel.
    // ═══════════════════════════════════════════════════════════
    WEAPON_DEFS: {
        pistol: {
            id: "pistol",
            name: "Súng lục",
            maxAmmo: 7,
            fireCooldown: 0,
            reloadDuration: 0.6,
            hitRadiusMul: 1,
            mode: "single",
            barrelLen: 120,
            viewmodel: "pistol",
        },
        rifle: {
            id: "rifle",
            name: "Súng trường",
            maxAmmo: 10,
            fireCooldown: 0.18,
            reloadDuration: 1.0,
            hitRadiusMul: 1.25,
            farScoreMul: 2,
            mode: "single",
            barrelLen: 200,
            viewmodel: "rifle",
        },
        shotgun: {
            id: "shotgun",
            name: "Súng 2 nòng",
            maxAmmo: 5,
            fireCooldown: 0,
            reloadDuration: 1.3,
            hitRadiusMul: 1,
            mode: "spread",
            spreadRadius: 150,
            barrelLen: 170,
            viewmodel: "shotgun",
        },
        sniper: {
            id: "sniper",
            name: "Súng ngắm",
            maxAmmo: 5,
            fireCooldown: 0.9,
            reloadDuration: 1.4,
            hitRadiusMul: 1,
            requiresScope: true,
            scopedHitRadiusMul: 1.8,
            unscopedHitRadiusMul: 0.6,
            farScoreMul: 3,
            mode: "single",
            barrelLen: 210,
            viewmodel: "sniper",
        },
        smg: {
            id: "smg",
            name: "Súng máy",
            maxAmmo: 24,
            fireCooldown: 0.09,
            reloadDuration: 1.6,
            hitRadiusMul: 0.85,
            scoreMul: 0.7,
            autoFire: true,
            mode: "single",
            barrelLen: 140,
            viewmodel: "smg",
        },
        revolver: {
            id: "revolver",
            name: "Súng ổ quay",
            maxAmmo: 6,
            fireCooldown: 0.12,
            reloadDuration: 2.2,
            hitRadiusMul: 1,
            scoreMul: 1.8,
            critChance: 0.15,
            critMul: 2,
            mode: "single",
            barrelLen: 110,
            viewmodel: "revolver",
        },
        crossbow: {
            id: "crossbow",
            name: "Nỏ",
            maxAmmo: 4,
            fireCooldown: 0.7,
            reloadDuration: 0.5,
            hitRadiusMul: 1,
            mode: "pierce",
            corridorWidth: 55,
            pierceMax: 4,
            barrelLen: 150,
            viewmodel: "crossbow",
        },
        grenade: {
            id: "grenade",
            name: "Súng cối",
            maxAmmo: 3,
            fireCooldown: 1.0,
            reloadDuration: 2.0,
            hitRadiusMul: 1,
            mode: "explosive",
            spreadRadius: 150,
            barrelLen: 160,
            viewmodel: "grenade",
        },
        blunderbuss: {
            id: "blunderbuss",
            name: "Hoả mai cổ",
            maxAmmo: 4,
            fireCooldown: 0.6,
            reloadDuration: 2.6,
            hitRadiusMul: 1,
            mode: "spread",
            spreadRadius: 210,
            nearOnlyDepthMin: 0.35,
            barrelLen: 180,
            viewmodel: "blunderbuss",
        },
        silenced: {
            id: "silenced",
            name: "Súng giảm thanh",
            maxAmmo: 8,
            fireCooldown: 0,
            reloadDuration: 0.55,
            hitRadiusMul: 1,
            missRateThreshold: 0.55,
            mode: "single",
            barrelLen: 150,
            viewmodel: "silenced",
        },
    },

    weapon() {
        return (
            this.WEAPON_DEFS[this.currentWeaponId] || this.WEAPON_DEFS.pistol
        );
    },

    // Điểm trục súng — hơi thấp hơn đáy màn hình 1 chút để trông như súng
    // cắm từ dưới lên (giống ảnh mẫu). MỌI khẩu đều xoay quanh CÙNG 1 trục.
    pivotPoint() {
        return { x: this.VW / 2, y: this.VH * 1.02 };
    },

    // Đầu nòng súng theo góc ngắm HIỆN TẠI (lastAimAngle) — dùng để đặt tia
    // lửa đầu nòng đúng chỗ. pkm_birdshoot_background.js PHẢI vẽ đầu nòng
    // viewmodel ở ĐÚNG khoảng cách barrelLen này từ pivotPoint() để tia lửa
    // khớp hình vẽ (giống nguyên tắc đồng bộ windmillBladeTipPos()).
    muzzleTipPos() {
        const w = this.weapon();
        const pivot = this.pivotPoint();
        const len = w.barrelLen || 140;
        return {
            x: pivot.x + Math.sin(this.lastAimAngle) * len,
            y: pivot.y - Math.cos(this.lastAimAngle) * len,
        };
    },

    // Hệ số nhân bán kính bắn trúng theo súng đang cầm + trạng thái ngắm
    // (chỉ sniper mới có requiresScope — KHÔNG ngắm thì bắn "từ hông" rất trượt).
    currentHitRadiusMul() {
        const w = this.weapon();
        let mul = w.hitRadiusMul || 1;
        if (w.requiresScope)
            mul *= this.aiming
                ? w.scopedHitRadiusMul || 1.8
                : w.unscopedHitRadiusMul || 0.6;
        return mul;
    },

    randomHitsUntilQuiz() {
        return 5 + Math.floor(Math.random() * 4);
    }, // 5..8  // số chim gọi quiz 84=5 đến 8
    randomLevelTarget() {
        return 10 + Math.floor(Math.random() * 4);
    }, // 10..13
    // dùng chung cho cối xay gió LẪN bù nhìn — khoảng nghỉ trước khi hồi
    // sinh lại (ở vị trí khác) sau khi bị bắn hết/bắn xong nhiệm vụ.
    randomStructureInterval() {
        return 14 + Math.random() * 8;
    }, // 14..22s
    randomBalloonInterval() {
        return 10 + Math.random() * 8;
    }, // 10..18s
    randomSpawnGap() {
        return Math.max(0.35, (0.75 + Math.random() * 0.5) / this.speedMul);
    },
    // vị trí X ngẫu nhiên cho cối xay gió/bù nhìn — chọn ngẫu nhiên 1 trong 2
    // dải trái/phải rồi random tiếp trong dải đó, để mỗi lần hồi sinh KHÔNG
    // lặp lại đúng 1 điểm cố định như trước (chỉ toggle trái<->phải).
    randomStructureX() {
        const band = Math.random() < 0.5 ? [0.08, 0.34] : [0.66, 0.92];
        return this.VW * (band[0] + Math.random() * (band[1] - band[0]));
    },

    // ═══════════════════════════════════════════════════════════
    // TRẠNG THÁI
    // ═══════════════════════════════════════════════════════════
    canvas: null,
    ctx: null,
    dpr: 1,
    cssW: 0,
    cssH: 0,

    running: false,
    paused: false,
    gameOver: false,
    controlsLocked: false,
    rafId: null,
    lastTs: 0,
    _boundLoop: null,

    score: 0,
    lives: 10,
    level: 1,
    speedMul: 1,

    birdsCollected: 0,
    correctCount: 0,
    wrongCount: 0,
    totalCount: 0,

    birdsHitSinceQuiz: 0,
    hitsUntilQuiz: 6,

    levelBirdsHit: 0,
    levelTarget: 10,

    ammo: 6,
    reloading: false,
    reloadT: 0,

    currentWeaponId: "pistol",
    aiming: false, // chỉ có tác dụng khi weapon().requiresScope === true (sniper)
    fireCooldownT: 0, // đếm ngược giữa 2 phát (súng KHÔNG auto-fire — rifle/sniper/crossbow/grenade/blunderbuss)
    gunRecoilT: 0, // đếm ngược hiệu ứng giật lùi viewmodel sau mỗi phát
    lastAimAngle: 0, // góc xoay súng hiện tại (radian, tính từ pivotPoint tới điểm bắn gần nhất)

    // theo dõi ngón tay/chuột đang giữ (CHỈ dùng cho auto-fire SMG — không
    // theo dõi khi súng khác đang cầm, tránh tốn tài nguyên không cần thiết).
    _pointerActive: false,
    _pointerX: 0,
    _pointerY: 0,
    autoFireAccum: 0,

    // cửa sổ trượt theo dõi TỈ LỆ BẮN TRƯỢT — mỗi phát bắn đẩy 1 giá trị
    // (1 = trúng mục tiêu bất kỳ, 0 = bắn hụt hoàn toàn không trúng gì).
    // Đầy MISS_WINDOW_SIZE phát thì chấm điểm 1 lần rồi làm rỗng lại.
    shotWindow: [],

    objects: [], // {kind:'bird'|'windmill'|'balloon'|'scarecrow', ...} xem các hàm spawnXxx()
    particles: [],

    spawnTimer: 0.8,
    windmillTimer: 6,
    balloonTimer: 8,
    scarecrowTimer: 5,
    windmillActive: false,
    balloonActive: false,
    scarecrowActive: false,

    // "ĐƠ" — phạt khoá bắn/nạp đạn khi bắn trúng thân bù nhìn / khinh khí
    // cầu. Thế giới (chim/spawn timer) VẪN chạy tiếp trong lúc này, khác
    // hẳn "paused" (chỉ dùng khi mở quiz, dừng hẳn cả update()).
    stunned: false,
    stunT: 0,

    shake: { t: 0, mag: 0 },

    // ═══════════════════════════════════════════════════════════
    // ÂM THANH (Web Audio API tự tạo — cùng phong cách pkm_race.js)
    // ═══════════════════════════════════════════════════════════
    _audioCtx: null,
    ensureAudioCtx() {
        if (!this._audioCtx)
            this._audioCtx = new (window.AudioContext ||
                window.webkitAudioContext)();
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
        } catch (e) {
            /* im lặng nếu trình duyệt chặn audio */
        }
    },
    playNoiseBurst(duration, volume, delay = 0) {
        try {
            const ctx = this.ensureAudioCtx();
            const bufferSize = Math.floor(ctx.sampleRate * duration);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++)
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            const gain = ctx.createGain();
            gain.gain.value = volume;
            src.connect(gain);
            gain.connect(ctx.destination);
            src.start(ctx.currentTime + delay);
        } catch (e) {
            /* ignore */
        }
    },
    // tiếng súng: nổ (noise) + "đề pa" tần số thấp
    playGunshotSound() {
        this.playNoiseBurst(0.14, 0.5, 0);
        this.playTone(120, 0.1, "square", 0.22, 0);
        this.playTone(70, 0.14, "sine", 0.18, 0.015);
    },
    // tiếng cò súng bấm khi hết đạn (khô, không nổ)
    playEmptyClickSound() {
        this.playTone(1400, 0.03, "square", 0.08, 0);
        this.playTone(900, 0.03, "square", 0.06, 0.03);
    },
    // tiếng nạp đạn: 2 nhịp lách cách kim loại
    playReloadSound() {
        this.playTone(320, 0.06, "square", 0.16, 0);
        this.playTone(220, 0.05, "square", 0.14, 0.14);
        this.playTone(500, 0.05, "square", 0.15, 0.32);
        this.playTone(260, 0.08, "square", 0.16, 0.42);
    },
    playBirdHitSound() {
        this.playTone(700, 0.05, "triangle", 0.22, 0);
        this.playTone(1100, 0.09, "sine", 0.22, 0.04);
    },
    playWindmillHitSound() {
        this.playTone(300, 0.05, "square", 0.2, 0);
        this.playTone(180, 0.08, "square", 0.16, 0.03);
    },
    playWindmillDestroySound() {
        this.playTone(523, 0.1, "sine", 0.22, 0);
        this.playTone(659, 0.1, "sine", 0.22, 0.1);
        this.playTone(784, 0.1, "sine", 0.22, 0.2);
        this.playTone(1047, 0.2, "sine", 0.26, 0.3);
    },
    playBalloonPopSound() {
        this.playNoiseBurst(0.2, 0.35, 0);
        this.playTone(180, 0.22, "sawtooth", 0.22, 0);
    },
    playScarecrowHatSound() {
        this.playTone(880, 0.06, "triangle", 0.22, 0);
        this.playTone(1320, 0.1, "sine", 0.22, 0.05);
        this.playTone(1760, 0.14, "sine", 0.2, 0.12);
    },
    // tiếng "choáng váng" khi bị phạt đơ — chuỗi tần số tụt dần kiểu sao nhấp nháy quanh đầu
    playStunSound() {
        this.playNoiseBurst(0.15, 0.3, 0);
        this.playTone(500, 0.1, "sawtooth", 0.18, 0);
        this.playTone(380, 0.1, "sawtooth", 0.16, 0.1);
        this.playTone(280, 0.14, "sawtooth", 0.15, 0.2);
        this.playTone(190, 0.2, "sawtooth", 0.14, 0.32);
    },
    playHeartLostSound() {
        this.playTone(160, 0.2, "square", 0.24, 0);
        this.playTone(100, 0.24, "sawtooth", 0.2, 0.05);
    },
    playQuizChime() {
        this.playTone(784, 0.1, "sine", 0.22, 0);
        this.playTone(988, 0.1, "sine", 0.22, 0.09);
        this.playTone(1318, 0.18, "sine", 0.25, 0.18);
    },
    playGoSound() {
        this.playTone(523, 0.12, "sine", 0.25, 0);
        this.playTone(659, 0.12, "sine", 0.25, 0.12);
        this.playTone(784, 0.2, "sine", 0.28, 0.24);
    },
    playGameOverSound() {
        this.playTone(392, 0.2, "sawtooth", 0.2, 0);
        this.playTone(330, 0.2, "sawtooth", 0.2, 0.18);
        this.playTone(220, 0.35, "sawtooth", 0.2, 0.36);
    },
    playLevelUpSound() {
        this.playTone(440, 0.1, "sine", 0.22, 0);
        this.playTone(587, 0.1, "sine", 0.24, 0.1);
        this.playTone(880, 0.24, "sine", 0.28, 0.2);
    },
    // tiếng nhặt túi quà — đổi súng, vui tươi kiểu "level up nhỏ"
    playGiftPickupSound() {
        this.playTone(660, 0.06, "triangle", 0.2, 0);
        this.playTone(880, 0.06, "triangle", 0.2, 0.06);
        this.playTone(1100, 0.06, "triangle", 0.2, 0.12);
        this.playTone(1568, 0.16, "sine", 0.24, 0.18);
    },
    // tiếng "chí mạng" (revolver) — vang và nặng hơn phát thường
    playCritSound() {
        this.playTone(200, 0.05, "square", 0.3, 0);
        this.playTone(880, 0.1, "sine", 0.26, 0.03);
        this.playTone(1320, 0.14, "sine", 0.22, 0.1);
    },

    // ═══════════════════════════════════════════════════════════
    // KHỞI TẠO — luồng học từ vựng -> chọn cấp -> chạm bắt đầu, HỆT pkm_race.js
    // ═══════════════════════════════════════════════════════════
    async init() {
        console.log("🎯 [DEBUG] BirdShootGame.init() started");

        this.canvas = document.getElementById("shootCanvas");
        this.ctx = this.canvas.getContext("2d");
        if (window.BirdShootBackground && window.BirdShootBackground.preload) {
            window.BirdShootBackground.preload();
        }
        this.resize();
        window.addEventListener("resize", () => this.resize());

        this.attachControls();

        if (window.QuizManager) window.QuizManager.prepareData();

        const quizOverlay = document.getElementById("quiz-overlay");
        if (quizOverlay) quizOverlay.style.display = "none";

        const renderLevelSelect = (container) => {
            return new Promise((resolve) => {
                const LEVELS = [
                    {
                        key: "de",
                        emoji: "🟢",
                        label: "Dễ",
                        sub: "Hội thoại/đoạn văn ngắn",
                    },
                    {
                        key: "trung_binh",
                        emoji: "🟡",
                        label: "Trung bình",
                        sub: "Độ dài vừa phải",
                    },
                    {
                        key: "kho",
                        emoji: "🔴",
                        label: "Khó",
                        sub: "Hội thoại/đoạn văn dài",
                    },
                ];
                container.innerHTML = `
                    <div style="text-align:center;">
                        <div class="shoot-level-select-title">🎯 Chọn cấp độ Bird Shoot!</div>
                        <div class="shoot-level-row">
                            ${LEVELS.map(
                                (lv) => `
                                <div class="shoot-level-card" data-level="${lv.key}">
                                    <div class="lv-emoji">${lv.emoji}</div>
                                    <div class="lv-label">${lv.label}</div>
                                    <div class="lv-sub">${lv.sub}</div>
                                </div>`,
                            ).join("")}
                        </div>
                    </div>`;
                container
                    .querySelectorAll(".shoot-level-card")
                    .forEach((card) => {
                        card.onclick = () => {
                            localStorage.setItem(
                                "selected_level",
                                card.dataset.level,
                            );
                            resolve(card.dataset.level);
                        };
                    });
            });
        };

        // Tên hàm PHẢI là startPokemonBattle vì pkm_vocabulary.js gọi cứng tên này
        window.startPokemonBattle = async () => {
            console.log("🎯 Chọn cấp độ trước khi vào Bird Shoot...");

            let mainCard = document.getElementById("mainCard");
            if (!mainCard) {
                mainCard = document.createElement("div");
                mainCard.id = "mainCard";
                document.body.appendChild(mainCard);
            }
            mainCard.style.cssText = `
                position: fixed; top:0; left:0; width:100vw; height:100dvh;
                background: radial-gradient(circle, #2b4a1f 0%, #0c1608 100%);
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

            this.showTapToStart();
        };

        if (
            window.VocabularyModule &&
            typeof window.VocabularyModule.start === "function"
        ) {
            console.log(
                "📘 [BirdShoot] Gọi VocabularyModule chạy phần học từ vựng...",
            );
            await window.VocabularyModule.start();
        } else {
            console.warn(
                "⚠️ Không tìm thấy VocabularyModule, tự động vào thẳng Bird Shoot!",
            );
            window.startPokemonBattle();
        }
    },

    // ═══════════════════════════════════════════════════════════
    // CANVAS RESIZE (full-bleed, giống pkm_race.js nhưng không cần lane)
    // ═══════════════════════════════════════════════════════════
    resize() {
        const stage = document.getElementById("shoot-stage");
        const wrapW = Math.max(1, stage.clientWidth);
        const wrapH = Math.max(1, stage.clientHeight);

        this.cssW = wrapW;
        this.cssH = wrapH;
        this.canvas.style.width = wrapW + "px";
        this.canvas.style.height = wrapH + "px";

        this.VH = 1280;
        this.VW = Math.round(this.VH * (wrapW / wrapH));

        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.round(this.VW * this.dpr);
        this.canvas.height = Math.round(this.VH * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        if (window.BirdShootBackground)
            window.BirdShootBackground.rebuildGradients(
                this.ctx,
                this.shootState(),
            );
    },

    // Đóng gói thông số cho pkm_birdshoot_background.js — xem API ở đầu file.
    shootState() {
        return {
            VW: this.VW,
            VH: this.VH,
            level: this.level,
            speedMul: this.speedMul,
            tNow: performance.now() / 1000,
            weaponId: this.currentWeaponId,
            weaponName: this.weapon().name,
            aimAngle: this.lastAimAngle,
            recoilAmt: this.GUN_RECOIL_DURATION
                ? Math.max(0, this.gunRecoilT / this.GUN_RECOIL_DURATION)
                : 0,
            aiming: this.aiming,
            requiresScope: !!this.weapon().requiresScope,
            ammo: this.ammo,
            maxAmmo: this.weapon().maxAmmo,
            reloading: this.reloading,
            pivot: this.pivotPoint(),
        };
    },

    // ═══════════════════════════════════════════════════════════
    // MÀN "CHẠM ĐỂ BẮT ĐẦU" + ĐẾM NGƯỢC (HỆT pkm_race.js)
    // ═══════════════════════════════════════════════════════════
    showTapToStart() {
        const layer = document.getElementById("shoot-overlay-layer");
        layer.className = "show";
        layer.innerHTML = `
            <div id="tapStartCard">
                <div id="tapStartBtn"></div>
                <div class="tap-label">Chạm để bắt đầu!</div>
                <div class="tap-sub">Chạm trúng chim · Nạp đạn kịp lúc · Né khinh khí cầu</div>
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
        const layer = document.getElementById("shoot-overlay-layer");
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
        this.objects = [];
        this.particles = [];
        this.level = 1;
        this.speedMul = 1;
        this.levelBirdsHit = 0;
        this.levelTarget = this.randomLevelTarget();
        this.currentWeaponId = "pistol";
        this.ammo = this.weapon().maxAmmo;
        this.reloading = false;
        this.reloadT = 0;
        this.aiming = false;
        this.fireCooldownT = 0;
        this.gunRecoilT = 0;
        this.lastAimAngle = 0;
        this._pointerActive = false;
        this._pointerX = this.VW / 2;
        this._pointerY = this.VH * 0.5;
        this.autoFireAccum = 0;
        this.shotWindow = [];
        this.spawnTimer = 0.6;
        this.windmillTimer = this.randomStructureInterval();
        this.balloonTimer = this.randomBalloonInterval();
        this.scarecrowTimer = this.randomStructureInterval() * 0.7; // xuất hiện sớm hơn 1 chút cho đỡ chờ ở đầu ván
        this.windmillActive = false;
        this.balloonActive = false;
        this.scarecrowActive = false;
        this.stunned = false;
        this.stunT = 0;
        if (window.BirdShootBackground)
            window.BirdShootBackground.rebuildGradients(
                this.ctx,
                this.shootState(),
            );
    },

    startPlaying() {
        this.resetRunState();
        this.running = true;
        this.paused = false;
        this.gameOver = false;
        this.controlsLocked = false;
        this.score = 0;
        this.lives = 10;
        this.birdsCollected = 0;
        this.correctCount = 0;
        this.wrongCount = 0;
        this.totalCount = 0;
        this.birdsHitSinceQuiz = 0;
        this.hitsUntilQuiz = this.randomHitsUntilQuiz();
        this.updateHUD();
        this.updateHeartsUI();
        this.updateAmmoUI();
        document.getElementById("shoot-controls").classList.remove("locked");

        this.lastTs = performance.now();
        if (!this._boundLoop) this._boundLoop = this.gameLoopStep.bind(this);
        this.rafId = requestAnimationFrame(this._boundLoop);
    },

    // Y HỆT cơ chế dừng hẳn rAF khi paused (mở quiz) của pkm_race.js — đỡ
    // hao pin/CPU và không bị giật hình phía sau lớp quiz-overlay mờ.
    gameLoopStep(ts) {
        if (!this.running) return;
        let dt = (ts - this.lastTs) / 1000;
        this.lastTs = ts;
        if (dt > 0.05) dt = 0.05;
        if (!this.paused && !this.gameOver) this.update(dt);
        this.drawScene(dt);
        if (!this.paused && !this.gameOver) {
            this.rafId = requestAnimationFrame(this._boundLoop);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // CẬP NHẬT MỖI KHUNG HÌNH
    // ═══════════════════════════════════════════════════════════
    update(dt) {
        this.updateStun(dt);
        this.updateReload(dt);
        this.updateWeaponTimers(dt);
        this.updateAutoFire(dt);
        this.updateSpawns(dt);
        this.updateObjects(dt);
        this.updateParticles(dt);

        if (this.shake.t > 0) {
            this.shake.t -= dt;
            if (this.shake.t < 0) this.shake.t = 0;
        }

        this.updateControlsLockVisual();
        this.updateHUD();
    },

    // "ĐƠ" — chỉ khoá bắn/nạp đạn trong STUN_DURATION giây, KHÔNG this.paused
    // (thế giới vẫn chạy tiếp, khác hẳn lúc mở quiz).
    updateStun(dt) {
        if (!this.stunned) return;
        this.stunT -= dt;
        if (this.stunT <= 0) {
            this.stunned = false;
            this.stunT = 0;
        }
    },

    // Đồng bộ class "locked" của #shoot-controls theo CẢ controlsLocked (quiz)
    // LẪN stunned (phạt đơ) — 2 trạng thái độc lập nhưng cùng khoá UI.
    updateControlsLockVisual() {
        const el = document.getElementById("shoot-controls");
        if (el)
            el.classList.toggle("locked", this.controlsLocked || this.stunned);
    },

    // Đếm ngược cooldown giữa 2 phát (rifle/sniper/crossbow/grenade/blunderbuss)
    // + hiệu ứng giật lùi viewmodel — thuần thị giác + gating bắn, không liên
    // quan gì tới reload.
    updateWeaponTimers(dt) {
        if (this.fireCooldownT > 0) {
            this.fireCooldownT -= dt;
            if (this.fireCooldownT < 0) this.fireCooldownT = 0;
        }
        if (this.gunRecoilT > 0) {
            this.gunRecoilT -= dt;
            if (this.gunRecoilT < 0) this.gunRecoilT = 0;
        }
    },

    // Auto-fire — CHỈ áp dụng khi súng hiện tại có autoFire=true (SMG) VÀ
    // người chơi đang giữ ngón tay/chuột (xem attachControls). Tự bắn liên
    // tục theo fireCooldown của súng cho tới khi nhả tay hoặc hết đạn.
    updateAutoFire(dt) {
        if (!this._pointerActive) return;
        const w = this.weapon();
        if (!w.autoFire) return;
        if (
            this.controlsLocked ||
            this.stunned ||
            this.reloading ||
            !this.running ||
            this.gameOver
        )
            return;
        if (this.ammo <= 0) {
            this._pointerActive = false;
            return;
        }
        this.autoFireAccum -= dt;
        if (this.autoFireAccum <= 0) {
            this.onTapShoot(this._pointerX, this._pointerY);
            this.autoFireAccum = w.fireCooldown || 0.09;
        }
    },

    updateReload(dt) {
        if (!this.reloading) return;
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
            this.reloading = false;
            this.ammo = this.weapon().maxAmmo;
            this.updateAmmoUI();
        }
    },

    updateSpawns(dt) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.spawnBird();
            this.spawnTimer = this.randomSpawnGap();
        }
        if (!this.windmillActive) {
            this.windmillTimer -= dt;
            if (this.windmillTimer <= 0) this.spawnWindmill();
        }
        if (!this.scarecrowActive) {
            this.scarecrowTimer -= dt;
            if (this.scarecrowTimer <= 0) this.spawnScarecrow();
        }
        if (!this.balloonActive) {
            this.balloonTimer -= dt;
            if (this.balloonTimer <= 0) this.spawnBalloon();
        }
    },

    // ═══════════════════════════════════════════════════════════
    // SINH MỤC TIÊU
    // ═══════════════════════════════════════════════════════════
    // 45% bay ngang trái<->phải, 23% bay chéo lên trời, 17% lượn giữa màn
    // hình, 15% nhô lên từ mép dưới rồi tụt xuống (kiểu mồi Duck Hunt).
    spawnBird() {
        const roll = Math.random();
        const depth = Math.random(); // 0 = xa/bé, 1 = gần/to
        const scale =
            this.SCALE_FAR + (this.SCALE_NEAR - this.SCALE_FAR) * depth;
        const speed = this.BASE_SPEED * (0.65 + 0.55 * depth) * this.speedMul;
        const species = ["brown", "red", "white"][
            Math.floor(Math.random() * 3)
        ];
        const base = {
            kind: "bird",
            alive: true,
            depth,
            scale,
            species,
            hitRadius: this.HIT_RADIUS_BASE * scale,
            flapPhase: Math.random() * Math.PI * 2,
            rot: 0,
            bornT: performance.now() / 1000,
        };

        if (roll < 0.45) {
            // bay ngang: trái->phải hoặc phải->trái, hơi nhấp nhô theo sin
            const dir = Math.random() < 0.5 ? 1 : -1;
            const y = this.VH * 0.14 + Math.random() * this.VH * 0.42;
            this.objects.push(
                Object.assign(base, {
                    pattern: "horizontal",
                    x: dir < 0 ? this.VW + 70 : -70,
                    y,
                    baseY: y,
                    vx: dir * speed,
                    vy: 0,
                    bobAmp: 14 + Math.random() * 26,
                    bobFreq: 1.4 + Math.random() * 1.4,
                }),
            );
        } else if (roll < 0.68) {
            // bay chéo lên trời: xuất phát đáy 1 bên, bay chéo qua và thoát lên trên
            const dir = Math.random() < 0.5 ? 1 : -1;
            const x = dir < 0 ? this.VW + 40 : -40;
            const y = this.VH * 0.62 + Math.random() * this.VH * 0.28;
            this.objects.push(
                Object.assign(base, {
                    pattern: "diagonal",
                    x,
                    y,
                    vx: dir * speed * 0.72,
                    vy: -speed * 0.95,
                }),
            );
        } else if (roll < 0.85) {
            // lượn giữa màn hình 1 lúc rồi bay thoát — mục tiêu "ngon ăn" nhưng thời gian có hạn
            const x = this.VW * 0.34 + Math.random() * this.VW * 0.32;
            const y = this.VH * 0.22 + Math.random() * this.VH * 0.24;
            this.objects.push(
                Object.assign(base, {
                    pattern: "center",
                    x,
                    y,
                    baseX: x,
                    baseY: y,
                    vx: 0,
                    vy: 0,
                    centerT: 0,
                    centerLife: 2.4 + Math.random() * 1.3,
                    fleeing: false,
                }),
            );
        } else {
            // "popup" kiểu mồi Duck Hunt: nhô từ mép dưới lên, đứng giật nhẹ
            // 1-1.5s rồi tự tụt xuống mất — bắn hụt KHÔNG bị trừ mạng.
            const x = this.VW * 0.12 + Math.random() * this.VW * 0.76;
            const targetY = this.VH * 0.3 + Math.random() * this.VH * 0.28;
            this.objects.push(
                Object.assign(base, {
                    pattern: "popup",
                    x,
                    baseX: x,
                    y: this.VH * 1.08,
                    targetY,
                    vx: 0,
                    vy: 0,
                    phase: "rising",
                    holdT: 0,
                    holdDur: 1.0 + Math.random() * 0.5,
                    jitterSeed: Math.random() * 10,
                }),
            );
        }
    },

    // Cối xay gió 5 cánh — vị trí NGẪU NHIÊN mỗi lần xuất hiện (randomStructureX),
    // cánh tự quay, bắn từng cánh ăn điểm riêng, bắn hết 5 cánh -> cả cối
    // xay gió mờ dần biến mất rồi hồi sinh ở vị trí khác sau 1 khoảng nghỉ.
    spawnWindmill() {
        this.windmillActive = true;
        this.objects.push({
            kind: "windmill",
            alive: true,
            x: this.randomStructureX(),
            y: this.VH * (0.18 + Math.random() * 0.08),
            scale: 1,
            bladeLen: 92,
            rotAngle: 0,
            rotSpeed: 1.05 + Math.random() * 0.5,
            blades: [0, 1, 2, 3, 4].map(() => ({ alive: true })),
            destroyed: false,
            despawnT: 0,
        });
    },

    // Bù nhìn đội nón — đứng cố định như cối xay gió. Bắn NÓN ăn điểm, xong
    // là "nhiệm vụ" hoàn thành -> cả bù nhìn mờ dần biến mất rồi hồi sinh
    // vị trí khác. Bắn THÂN (không phải nón) bị trừ điểm + phạt đơ, nhưng
    // bù nhìn KHÔNG biến mất vì lỗi đó — vẫn đứng nguyên để bắn tiếp.
    spawnScarecrow() {
        this.scarecrowActive = true;
        this.objects.push({
            kind: "scarecrow",
            alive: true,
            x: this.randomStructureX(),
            y: this.VH * (0.72 + Math.random() * 0.06),
            scale: 0.92 + Math.random() * 0.2,
            hatAlive: true,
            swayPhase: Math.random() * Math.PI * 2,
            destroyed: false,
            despawnT: 0,
        });
    },

    // Vị trí nón / thân bù nhìn tại thời điểm hiện tại — dùng chung cho cả
    // hit-test (findTargetAt) lẫn vẽ hình (pkm_birdshoot_background.js phải
    // định vị nón/thân Ở ĐÚNG toạ độ tương đối này, xem ghi chú offset).
    scarecrowHatPos(sc) {
        return { x: sc.x, y: sc.y - 96 * sc.scale };
    },
    scarecrowBodyPos(sc) {
        return { x: sc.x, y: sc.y - 30 * sc.scale };
    },

    // Khinh khí cầu — bay ngang chậm rãi, bắn trúng bị TRỪ điểm + phạt đơ
    // (mục tiêu cần tránh, không tính vào bộ đếm quiz/lên màn). "Hầu như"
    // khí cầu nào cũng thả 1 túi quà (85%) sau 0.7-2.1s kể từ lúc xuất hiện.
    spawnBalloon() {
        this.balloonActive = true;
        const dir = Math.random() < 0.5 ? 1 : -1;
        const y = this.VH * 0.1 + Math.random() * this.VH * 0.16;
        this.objects.push({
            kind: "balloon",
            alive: true,
            x: dir < 0 ? this.VW + 90 : -90,
            y,
            vx: dir * this.BASE_SPEED * 0.42 * this.speedMul,
            vy: 0,
            scale: 0.95 + Math.random() * 0.25,
            hitRadius: this.HIT_RADIUS_BASE * 1.35,
            bobPhase: Math.random() * Math.PI * 2,
            carriedWeaponId: Object.keys(this.WEAPON_DEFS)[
                Math.floor(Math.random() * Object.keys(this.WEAPON_DEFS).length)
            ],
        });
    },

    // Túi quà rơi từ khinh khí cầu — bắn trúng trước khi rơi khỏi màn hình
    // sẽ đổi sang 1 khẩu súng NGẪU NHIÊN (khác khẩu đang cầm nếu có thể).
    spawnGiftBag(x, y) {
        this.objects.push({
            kind: "giftBag",
            alive: true,
            x,
            y,
            vy: 0,
            scale: 0.85 + Math.random() * 0.25,
            hitRadius: this.HIT_RADIUS_BASE * 1.1,
            spin: Math.random() * 10,
        });
    },

    // ═══════════════════════════════════════════════════════════
    // CẬP NHẬT VỊ TRÍ MỤC TIÊU
    // ═══════════════════════════════════════════════════════════
    updateObjects(dt) {
        const remain = [];
        for (const obj of this.objects) {
            if (obj.kind === "bird") this.updateBird(obj, dt);
            else if (obj.kind === "windmill") this.updateWindmill(obj, dt);
            else if (obj.kind === "scarecrow") this.updateScarecrow(obj, dt);
            else if (obj.kind === "balloon") this.updateBalloon(obj, dt);
            else if (obj.kind === "giftBag") this.updateGiftBag(obj, dt);

            if (this.isOffscreenRemovable(obj)) continue;
            remain.push(obj);
        }
        this.objects = remain;
    },

    updateBird(b, dt) {
        b.flapPhase += dt * 9;
        if (b.pattern === "horizontal") {
            b.x += b.vx * dt;
            b.y = b.baseY + Math.sin(b.flapPhase * (b.bobFreq / 9)) * b.bobAmp;
            b.rot = b.vx > 0 ? 0.08 : -0.08;
        } else if (b.pattern === "diagonal") {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.rot = Math.atan2(b.vy, b.vx) * 0.5;
        } else if (b.pattern === "center") {
            if (!b.fleeing) {
                b.centerT += dt;
                b.x = b.baseX + Math.sin(b.centerT * 1.6) * 30;
                b.y = b.baseY + Math.cos(b.centerT * 1.1) * 18;
                if (b.centerT >= b.centerLife) {
                    b.fleeing = true;
                    const ang = Math.random() * Math.PI * 2;
                    const spd =
                        this.BASE_SPEED * (0.8 + 0.6 * b.depth) * this.speedMul;
                    b.vx = Math.cos(ang) * spd;
                    b.vy = Math.sin(ang) * spd - 40;
                }
            } else {
                b.x += b.vx * dt;
                b.y += b.vy * dt;
            }
        } else if (b.pattern === "popup") {
            const RISE_SPEED = 520; // px ảo/giây — tốc độ nhô lên/tụt xuống
            if (b.phase === "rising") {
                b.y -= RISE_SPEED * dt;
                if (b.y <= b.targetY) {
                    b.y = b.targetY;
                    b.phase = "holding";
                    b.holdT = 0;
                }
            } else if (b.phase === "holding") {
                b.holdT += dt;
                // giật nhẹ qua lại tại chỗ, mô phỏng chim mồi "cảnh giác"
                b.x = b.baseX + Math.sin(b.holdT * 26 + b.jitterSeed) * 4;
                if (b.holdT >= b.holdDur) b.phase = "sinking";
            } else if (b.phase === "sinking") {
                b.y += RISE_SPEED * 1.15 * dt;
            }
            b.rot = 0;
        }
    },

    updateWindmill(w, dt) {
        w.rotAngle += dt * w.rotSpeed;
        if (w.destroyed) {
            w.despawnT += dt;
            if (w.despawnT > 0.6 && w.alive) {
                w.alive = false;
                this.windmillActive = false;
                // reset đồng hồ hồi sinh NGAY LÚC NÀY (trước đây quên reset
                // nên nó respawn gần như tức thì) -> giờ đợi 1 khoảng nghỉ
                // thật sự rồi mới xuất hiện lại, ở vị trí khác.
                this.windmillTimer = this.randomStructureInterval();
            }
        }
    },

    // Bù nhìn: KHÔNG di chuyển, chỉ lắc nhẹ trang trí (swayPhase) + xử lý
    // mờ dần biến mất/hồi sinh giống hệt cối xay gió khi bắn trúng nón.
    updateScarecrow(sc, dt) {
        sc.swayPhase += dt;
        if (sc.destroyed) {
            sc.despawnT += dt;
            if (sc.despawnT > 0.6 && sc.alive) {
                sc.alive = false;
                this.scarecrowActive = false;
                this.scarecrowTimer = this.randomStructureInterval();
            }
        }
    },

    updateBalloon(bl, dt) {
        bl.bobPhase += dt * 1.2;
        bl.x += bl.vx * dt;
        bl.y += Math.sin(bl.bobPhase) * 0.6;
    },

    // Túi quà rơi tự do (trọng lực) + xoay nhẹ khi rơi cho sinh động.
    updateGiftBag(bag, dt) {
        bag.spin += dt * 3;
        bag.vy = (bag.vy || 0) + 260 * dt;
        bag.y += bag.vy * dt;
        bag.x += Math.sin(bag.spin * 0.5) * 5 * dt;
    },

    isOffscreenRemovable(obj) {
        // cối xay gió/bù nhìn không di chuyển — chỉ gỡ khi đã fade xong (alive=false)
        if (obj.kind === "windmill" || obj.kind === "scarecrow")
            return !obj.alive;
        const margin = 140;
        if (
            obj.x < -margin ||
            obj.x > this.VW + margin ||
            obj.y < -margin ||
            obj.y > this.VH + margin
        ) {
            if (obj.kind === "balloon") {
                this.balloonActive = false;
                // FIX: trước đây quên reset -> khinh khí cầu bay thoát xong
                // respawn gần như ngay lập tức. Giờ đợi 1 khoảng nghỉ thật sự.
                this.balloonTimer = this.randomBalloonInterval();
            }
            return true;
        }
        return false;
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
    // ĐIỀU KHIỂN — TAP TRỰC TIẾP VÀO MỤC TIÊU TRÊN CANVAS
    // ═══════════════════════════════════════════════════════════
    attachControls() {
        document
            .getElementById("btnReload")
            .addEventListener("click", () => this.doReload());

        const stage = document.getElementById("shoot-stage");
        const toVirtual = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            const relX = (clientX - rect.left) / rect.width;
            const relY = (clientY - rect.top) / rect.height;
            return { x: relX * this.VW, y: relY * this.VH };
        };

        const canShoot = () =>
            this.controlsLocked ||
            this.stunned ||
            !this.running ||
            this.gameOver;

        stage.addEventListener(
            "touchstart",
            (e) => {
                if (canShoot()) return;
                const t = e.changedTouches[0];
                const p = toVirtual(t.clientX, t.clientY);
                this._pointerActive = true;
                this._pointerX = p.x;
                this._pointerY = p.y;
                this.autoFireAccum = 0;
                this.onTapShoot(p.x, p.y);
            },
            { passive: true },
        );
        stage.addEventListener(
            "touchend",
            () => {
                this._pointerActive = false;
            },
            { passive: true },
        );
        stage.addEventListener(
            "touchcancel",
            () => {
                this._pointerActive = false;
            },
            { passive: true },
        );
        // CHỈ theo dõi di chuyển ngón tay khi súng hiện tại autoFire (SMG) VÀ
        // đang giữ — để giữ tay + rê ngón tay sẽ "quét" đạn theo, đúng như
        // súng máy thật. Các súng khác KHÔNG track di chuyển (đỡ tốn tài nguyên).
        stage.addEventListener(
            "touchmove",
            (e) => {
                if (!this._pointerActive || !this.weapon().autoFire) return;
                const t = e.changedTouches[0];
                const p = toVirtual(t.clientX, t.clientY);
                this._pointerX = p.x;
                this._pointerY = p.y;
            },
            { passive: true },
        );

        // Chuột cho PC (test trên máy tính) — cùng logic như cảm ứng
        stage.addEventListener("mousedown", (e) => {
            if (canShoot()) return;
            const p = toVirtual(e.clientX, e.clientY);
            this._pointerActive = true;
            this._pointerX = p.x;
            this._pointerY = p.y;
            this.autoFireAccum = 0;
            this.onTapShoot(p.x, p.y);
        });
        stage.addEventListener("mouseup", () => {
            this._pointerActive = false;
        });
        stage.addEventListener("mouseleave", () => {
            this._pointerActive = false;
        });
        stage.addEventListener("mousemove", (e) => {
            if (!this._pointerActive || !this.weapon().autoFire) return;
            const p = toVirtual(e.clientX, e.clientY);
            this._pointerX = p.x;
            this._pointerY = p.y;
        });

        window.addEventListener("keydown", (e) => {
            if (canShoot()) return;
            if (e.key === "r" || e.key === "R") this.doReload();
            if (e.key === "v" || e.key === "V") this.toggleAim(); // phím tắt PC cho nút NGẮM (sniper)
        });
    },

    // Bật/tắt chế độ NGẮM — chỉ có tác dụng khi súng hiện tại requiresScope
    // (sniper). Cần 1 nút riêng trong HTML gọi BirdShootGame.toggleAim().
    toggleAim() {
        if (!this.weapon().requiresScope) return;
        this.aiming = !this.aiming;
        this.playTone(this.aiming ? 720 : 480, 0.06, "triangle", 0.16, 0);
    },

    doReload() {
        if (
            this.controlsLocked ||
            this.stunned ||
            !this.running ||
            this.gameOver
        )
            return;
        const w = this.weapon();
        if (this.reloading || this.ammo === w.maxAmmo) return;
        this.reloading = true;
        this.reloadT = w.reloadDuration;
        this.playReloadSound();
    },

    // ═══════════════════════════════════════════════════════════
    // BẮN — dispatch theo weapon().mode: "single" (nearest), "spread" (toả
    // đạn trúng nhiều mục tiêu), "pierce" (xuyên táo thẳng hàng), "explosive"
    // (nổ diện rộng không phân biệt tốt/xấu).
    // ═══════════════════════════════════════════════════════════
    onTapShoot(x, y) {
        if (this.stunned) {
            this.playEmptyClickSound();
            return;
        }
        if (this.reloading) {
            this.playEmptyClickSound();
            return;
        }
        if (this.fireCooldownT > 0) return; // súng chưa kịp lên đạn giữa 2 phát -> lờ tap này, không tốn đạn
        if (this.ammo <= 0) {
            this.playEmptyClickSound();
            this.flashNoAmmoHint();
            return;
        }

        const w = this.weapon();
        this.ammo--;
        this.fireCooldownT = w.fireCooldown || 0;
        this.gunRecoilT = this.GUN_RECOIL_DURATION;

        // xoay súng hướng theo điểm vừa bắn (giới hạn góc để không "gãy tay")
        const pivot = this.pivotPoint();
        this.lastAimAngle = Math.max(
            -0.55,
            Math.min(0.55, Math.atan2(x - pivot.x, pivot.y - y)),
        );

        this.playGunshotSound();
        const tip = this.muzzleTipPos();
        this.spawnMuzzleFlash(tip.x, tip.y, this.lastAimAngle);
        this.updateAmmoUI();

        let targets;
        if (w.mode === "spread" || w.mode === "explosive")
            targets = this.findTargetsInRadius(x, y, w.spreadRadius || 140, w);
        else if (w.mode === "pierce")
            targets = this.findTargetsInCorridor(
                x,
                w.corridorWidth || 55,
                w.pierceMax || 4,
            );
        else {
            const t = this.findTargetAt(x, y);
            targets = t ? [t] : [];
        }

        if (targets.length === 0) {
            this.pushShotResult(0);
            return;
        }
        this.pushShotResult(1);
        targets.forEach((t) => this.resolveHit(t, w));
    },

    // Trả về { kind, obj, bladeIndex?, dist } của mục tiêu gần điểm chạm nhất
    // trong bán kính bắn trúng (đã nhân currentHitRadiusMul), hoặc null nếu
    // bắn hụt hoàn toàn. Dùng cho mode "single".
    findTargetAt(x, y) {
        const mul = this.currentHitRadiusMul();
        let best = null,
            bestDist = Infinity;
        for (const obj of this.objects) {
            if (obj.kind === "bird" && obj.alive) {
                const d = Math.hypot(obj.x - x, obj.y - y);
                if (d <= obj.hitRadius * mul && d < bestDist) {
                    bestDist = d;
                    best = { kind: "bird", obj, dist: d };
                }
            } else if (obj.kind === "giftBag" && obj.alive) {
                const d = Math.hypot(obj.x - x, obj.y - y);
                if (d <= obj.hitRadius * mul && d < bestDist) {
                    bestDist = d;
                    best = { kind: "giftBag", obj, dist: d };
                }
            } else if (obj.kind === "balloon" && obj.alive) {
                const d = Math.hypot(obj.x - x, obj.y - y);
                if (d <= obj.hitRadius * mul && d < bestDist) {
                    bestDist = d;
                    best = { kind: "balloon", obj, dist: d };
                }
            } else if (obj.kind === "windmill" && obj.alive && !obj.destroyed) {
                obj.blades.forEach((blade, i) => {
                    if (!blade.alive) return;
                    const tip = this.windmillBladeTipPos(obj, i);
                    const d = Math.hypot(tip.x - x, tip.y - y);
                    const r = 44 * obj.scale * mul;
                    if (d <= r && d < bestDist) {
                        bestDist = d;
                        best = {
                            kind: "windmillBlade",
                            obj,
                            bladeIndex: i,
                            dist: d,
                        };
                    }
                });
            } else if (
                obj.kind === "scarecrow" &&
                obj.alive &&
                !obj.destroyed
            ) {
                // ưu tiên NÓN (bán kính nhỏ hơn, hầu như luôn gần điểm chạm hơn
                // khi người chơi thật sự nhắm nón) — cả 2 vùng cùng vào so sánh
                // khoảng cách chung với mọi mục tiêu khác nên tự nhiên ưu tiên đúng.
                if (obj.hatAlive) {
                    const hp = this.scarecrowHatPos(obj);
                    const d = Math.hypot(hp.x - x, hp.y - y);
                    const r = 34 * obj.scale * mul;
                    if (d <= r && d < bestDist) {
                        bestDist = d;
                        best = { kind: "scarecrowHat", obj, dist: d };
                    }
                }
                const bp = this.scarecrowBodyPos(obj);
                const db = Math.hypot(bp.x - x, bp.y - y);
                const rb = 56 * obj.scale * mul;
                if (db <= rb && db < bestDist) {
                    bestDist = db;
                    best = { kind: "scarecrowBody", obj, dist: db };
                }
            }
        }
        return best;
    },

    // TOẢ ĐẠN (shotgun/blunderbuss) & NỔ DIỆN RỘNG (grenade) — trả về MỌI
    // mục tiêu trong bán kính quanh điểm chạm (tối đa 8 mục tiêu/phát để
    // tránh dây chuyền vô lý). weapon.nearOnlyDepthMin (hoả mai cổ) lọc bỏ
    // chim quá xa (gần vô dụng tầm xa). Nổ/toả KHÔNG phân biệt tốt/xấu —
    // dính cả khinh khí cầu/thân bù nhìn nếu nằm trong bán kính (rủi ro).
    findTargetsInRadius(x, y, radius, weapon) {
        const R = radius * this.currentHitRadiusMul();
        const found = [];
        for (const obj of this.objects) {
            if (obj.kind === "bird" && obj.alive) {
                if (
                    weapon &&
                    weapon.nearOnlyDepthMin != null &&
                    obj.depth < weapon.nearOnlyDepthMin
                )
                    continue;
                const d = Math.hypot(obj.x - x, obj.y - y);
                if (d <= R) found.push({ kind: "bird", obj, dist: d });
            } else if (obj.kind === "giftBag" && obj.alive) {
                const d = Math.hypot(obj.x - x, obj.y - y);
                if (d <= R) found.push({ kind: "giftBag", obj, dist: d });
            } else if (obj.kind === "windmill" && obj.alive && !obj.destroyed) {
                obj.blades.forEach((blade, i) => {
                    if (!blade.alive) return;
                    const tip = this.windmillBladeTipPos(obj, i);
                    const d = Math.hypot(tip.x - x, tip.y - y);
                    if (d <= R)
                        found.push({
                            kind: "windmillBlade",
                            obj,
                            bladeIndex: i,
                            dist: d,
                        });
                });
            } else if (obj.kind === "balloon" && obj.alive) {
                const d = Math.hypot(obj.x - x, obj.y - y);
                if (d <= R) found.push({ kind: "balloon", obj, dist: d });
            } else if (
                obj.kind === "scarecrow" &&
                obj.alive &&
                !obj.destroyed
            ) {
                let hatHit = false;
                if (obj.hatAlive) {
                    const hp = this.scarecrowHatPos(obj);
                    const d = Math.hypot(hp.x - x, hp.y - y);
                    if (d <= R) {
                        found.push({ kind: "scarecrowHat", obj, dist: d });
                        hatHit = true;
                    }
                }
                if (!hatHit) {
                    const bp = this.scarecrowBodyPos(obj);
                    const db = Math.hypot(bp.x - x, bp.y - y);
                    if (db <= R)
                        found.push({ kind: "scarecrowBody", obj, dist: db });
                }
            }
        }
        return found.slice(0, 8);
    },

    // XUYÊN TÁO (nỏ) — trúng mọi chim/túi quà THẲNG HÀNG theo trục X của
    // điểm chạm (mô phỏng mũi tên bay xuyên dọc đường ngắm), gần nhất trước.
    findTargetsInCorridor(tapX, width, maxCount) {
        const W = width * this.currentHitRadiusMul();
        const found = [];
        for (const obj of this.objects) {
            if ((obj.kind === "bird" || obj.kind === "giftBag") && obj.alive) {
                const dx = Math.abs(obj.x - tapX);
                if (dx <= W) found.push({ kind: obj.kind, obj, dist: dx });
            }
        }
        found.sort((a, b) => a.dist - b.dist);
        return found.slice(0, maxCount);
    },

    resolveHit(t, weapon) {
        if (t.kind === "bird") this.collectBird(t.obj, weapon);
        else if (t.kind === "windmillBlade")
            this.hitWindmillBlade(t.obj, t.bladeIndex, weapon);
        else if (t.kind === "balloon") this.hitBalloon(t.obj);
        else if (t.kind === "scarecrowHat") this.hitScarecrowHat(t.obj, weapon);
        else if (t.kind === "scarecrowBody") this.hitScarecrowBody(t.obj);
        else if (t.kind === "giftBag") this.collectGiftBag(t.obj);
    },

    // Vị trí đầu cánh cối xay gió tại thời điểm hiện tại — dùng chung cho cả
    // hit-test (ở đây) lẫn vẽ hình (pkm_birdshoot_background.js phải tính
    // GIỐNG HỆT công thức này để hình vẽ khớp đúng vùng bắn trúng được).
    windmillBladeTipPos(w, index) {
        const angle = w.rotAngle + index * ((Math.PI * 2) / 5);
        const r = w.bladeLen * 0.66 * w.scale;
        return { x: w.x + Math.cos(angle) * r, y: w.y + Math.sin(angle) * r };
    },

    pushShotResult(v) {
        this.shotWindow.push(v);
        if (this.shotWindow.length >= this.MISS_WINDOW_SIZE) {
            const misses = this.shotWindow.filter((s) => s === 0).length;
            const threshold =
                this.weapon().missRateThreshold || this.MISS_RATE_THRESHOLD;
            if (misses / this.shotWindow.length > threshold) {
                this.loseHeart("miss_rate");
            }
            this.shotWindow = [];
        }
    },

    flashNoAmmoHint() {
        this.spawnFloatText(
            this.VW / 2,
            this.VH * 0.42,
            "🔄 Hết đạn — Nạp đạn!",
            "#ffcb05",
        );
    },

    // ═══════════════════════════════════════════════════════════
    // KẾT QUẢ TRÚNG ĐÍCH
    // ═══════════════════════════════════════════════════════════
    collectBird(bird, weapon = this.weapon()) {
        bird.alive = false;
        this.objects = this.objects.filter((o) => o !== bird);

        let pts = Math.round(
            this.BIRD_SCORE_FAR -
                (this.BIRD_SCORE_FAR - this.BIRD_SCORE_NEAR) * bird.depth,
        );

        // Bonus chim XA theo súng (rifle x2, sniper x3 NHƯNG chỉ khi đang
        // NGẮM — không ngắm thì sniper không có bonus này, xem currentHitRadiusMul).
        const farMul =
            !weapon.requiresScope || this.aiming ? weapon.farScoreMul || 1 : 1;
        if (farMul > 1)
            pts = Math.round(pts * (1 + (farMul - 1) * (1 - bird.depth)));

        pts = Math.round(pts * (weapon.scoreMul || 1));

        let isCrit = false;
        if (weapon.critChance && Math.random() < weapon.critChance) {
            pts = Math.round(pts * (weapon.critMul || 2));
            isCrit = true;
        }

        this.score += pts;
        this.birdsCollected++;
        this.birdsHitSinceQuiz++;
        this.levelBirdsHit++;

        if (isCrit) {
            this.playCritSound();
            this.spawnBurst(bird.x, bird.y, "#ff9f1c", 16);
            this.spawnFloatText(
                bird.x,
                bird.y - 34,
                `💥 CHÍ MẠNG +${pts}`,
                "#ff9f1c",
            );
        } else {
            this.playBirdHitSound();
            this.spawnBurst(bird.x, bird.y, "#ffcb05", 10);
            this.spawnFloatText(bird.x, bird.y - 30, `+${pts}`, "#ffe38a");
        }

        if (this.birdsHitSinceQuiz >= this.hitsUntilQuiz) {
            this.birdsHitSinceQuiz = 0;
            this.hitsUntilQuiz = this.randomHitsUntilQuiz();
            this.triggerQuiz();
        }

        if (this.levelBirdsHit >= this.levelTarget) {
            this.levelUp();
        }
    },

    hitWindmillBlade(windmill, index, weapon = this.weapon()) {
        const blade = windmill.blades[index];
        if (!blade.alive) return;
        blade.alive = false;
        const pts = Math.round(
            this.WINDMILL_BLADE_SCORE * (weapon.scoreMul || 1),
        );
        this.score += pts;
        this.playWindmillHitSound();
        const tip = this.windmillBladeTipPos(windmill, index);
        this.spawnBurst(tip.x, tip.y, "#c9a0ff", 8);
        this.spawnFloatText(tip.x, tip.y - 20, `+${pts}`, "#c9a0ff");

        if (windmill.blades.every((b) => !b.alive) && !windmill.destroyed) {
            windmill.destroyed = true;
            windmill.despawnT = 0;
            this.score += this.WINDMILL_CLEAR_BONUS;
            this.playWindmillDestroySound();
            this.spawnBurst(windmill.x, windmill.y, "#ffcb05", 26);
            this.spawnFloatText(
                windmill.x,
                windmill.y - 60,
                `🎉 +${this.WINDMILL_CLEAR_BONUS}`,
                "#ffcb05",
            );
        }
    },

    hitBalloon(balloon) {
        balloon.alive = false;
        this.objects = this.objects.filter((o) => o !== balloon);
        this.balloonActive = false;
        this.balloonTimer = this.randomBalloonInterval();
        this.equipWeapon(balloon.carriedWeaponId);
        this.playGiftPickupSound();
        this.spawnBurst(balloon.x, balloon.y, "#ffcb05", 18);
        this.spawnFloatText(
            balloon.x,
            balloon.y - 24,
            `🎁 ${this.WEAPON_DEFS[balloon.carriedWeaponId].name}!`,
            "#ffe38a",
        );
    },

    // Bắn trúng NÓN bù nhìn — ăn điểm, xong "nhiệm vụ" -> cả bù nhìn mờ dần
    // biến mất rồi hồi sinh vị trí khác (giống windmill hết 5 cánh).
    hitScarecrowHat(sc, weapon = this.weapon()) {
        sc.hatAlive = false;
        const pts = Math.round(
            this.SCARECROW_HAT_SCORE * (weapon.scoreMul || 1),
        );
        this.score += pts;
        this.playScarecrowHatSound();
        const hp = this.scarecrowHatPos(sc);
        this.spawnBurst(hp.x, hp.y, "#ffcb05", 12);
        this.spawnFloatText(hp.x, hp.y - 20, `+${pts}`, "#ffe38a");

        sc.destroyed = true;
        sc.despawnT = 0;
    },

    // Bắn trúng THÂN bù nhìn (không phải nón) — trừ điểm + phạt đơ, nhưng
    // bù nhìn KHÔNG biến mất, vẫn đứng nguyên để chơi tiếp.
    hitScarecrowBody(sc) {
        this.score = Math.max(0, this.score - this.SCARECROW_BODY_PENALTY);
        this.playBalloonPopSound();
        const bp = this.scarecrowBodyPos(sc);
        this.spawnBurst(bp.x, bp.y, "#ff6b6b", 12);
        this.spawnFloatText(
            bp.x,
            bp.y - 20,
            `-${this.SCARECROW_BODY_PENALTY}`,
            "#ff6b6b",
        );
        this.shake.t = 0.2;
        this.shake.mag = 8;
        this.applyStun();
    },

    // Phạt "ĐƠ" — khoá bắn/nạp đạn STUN_DURATION giây (thế giới vẫn chạy
    // tiếp). Dùng chung cho bắn trúng thân bù nhìn LẪN khinh khí cầu.
    applyStun() {
        this.stunned = true;
        this.stunT = this.STUN_DURATION;
        this.playStunSound();
        this.spawnFloatText(
            this.VW / 2,
            this.VH * 0.3,
            `😵 Đơ ${this.STUN_DURATION}s!`,
            "#ffcb05",
        );
        this.updateControlsLockVisual();
    },

    // Nhặt túi quà — đổi sang 1 khẩu súng NGẪU NHIÊN (ưu tiên khác khẩu đang
    // cầm để luôn có cảm giác đổi mới). Súng dùng VĨNH VIỄN tới khi nhặt
    // được túi quà khác (không tự rã).
    collectGiftBag(bag) {
        this.objects = this.objects.filter((o) => o !== bag);
        const ids = Object.keys(this.WEAPON_DEFS);
        const otherIds = ids.filter((id) => id !== this.currentWeaponId);
        const pick = (otherIds.length > 0 ? otherIds : ids)[
            Math.floor(
                Math.random() *
                    (otherIds.length > 0 ? otherIds.length : ids.length),
            )
        ];
        this.equipWeapon(pick);
        this.playGiftPickupSound();
        this.spawnBurst(bag.x, bag.y, "#ffcb05", 18);
        this.spawnFloatText(
            bag.x,
            bag.y - 24,
            `🎁 ${this.WEAPON_DEFS[pick].name}!`,
            "#ffe38a",
        );
    },

    // Đổi súng đang cầm — nạp đầy đạn theo súng mới, reset mọi cooldown/ngắm
    // để tránh trạng thái "kẹt" từ súng cũ lọt sang súng mới.
    equipWeapon(id) {
        if (!this.WEAPON_DEFS[id]) id = "pistol";
        this.currentWeaponId = id;
        const w = this.weapon();
        this.ammo = w.maxAmmo;
        this.reloading = false;
        this.reloadT = 0;
        this.fireCooldownT = 0;
        this.aiming = false;
        this._pointerActive = false; // an toàn, tránh auto-fire của súng cũ còn treo
        this.autoFireAccum = 0;
        this.updateAmmoUI();
        this.updateHUD();
    },

    levelUp() {
        this.level++;
        this.levelBirdsHit = 0;
        this.levelTarget = this.randomLevelTarget();
        this.speedMul = Math.min(
            this.MAX_SPEED_MUL,
            1 + (this.level - 1) * 0.16,
        );
        this.playLevelUpSound();
        this.showLevelBanner();
    },

    showLevelBanner() {
        const el = document.getElementById("level-banner");
        if (!el) return;
        const txt = el.querySelector(".level-banner-txt");
        if (txt) txt.textContent = `🎯 Màn ${this.level}`;
        el.classList.remove("show");
        void el.offsetWidth;
        el.classList.add("show");
        clearTimeout(this._levelBannerTimer);
        this._levelBannerTimer = setTimeout(
            () => el.classList.remove("show"),
            2200,
        );
    },

    // ═══════════════════════════════════════════════════════════
    // MẤT MẠNG
    // ═══════════════════════════════════════════════════════════
    loseHeart(reason) {
        this.lives = Math.max(0, this.lives - 1);
        this.shake.t = 0.3;
        this.shake.mag = 14;
        this.playHeartLostSound();
        this.spawnFloatText(this.VW / 2, this.VH * 0.36, "-1 ❤️", "#ff6b6b");
        this.updateHeartsUI();
        this.checkGameOver();
    },

    // ═══════════════════════════════════════════════════════════
    // HIỆU ỨNG HẠT
    // ═══════════════════════════════════════════════════════════
    // Tia lửa đầu nòng — toé chủ yếu theo HƯỚNG NÒNG SÚNG (dirAngle, radian
    // tính từ phương thẳng đứng) thay vì toé đều 360°, trông giống phát bắn
    // thật hơn. Gọi tại muzzleTipPos(), không phải tại điểm chạm.
    spawnMuzzleFlash(x, y, dirAngle = 0) {
        // vài hạt sáng loé lên tại đầu nòng (glow chớp nhoáng)
        for (let i = 0; i < 3; i++) {
            this.particles.push({
                x,
                y,
                vx: (Math.random() - 0.5) * 30,
                vy: (Math.random() - 0.5) * 30,
                gravity: 0,
                life: 0.06 + Math.random() * 0.04,
                maxLife: 0.1,
                color: "rgba(255,244,200,0.95)",
                size: 6 + Math.random() * 4,
            });
        }
        // tia lửa bắn ra theo hình nón quanh hướng nòng súng
        for (let i = 0; i < 7; i++) {
            const ang = dirAngle + (Math.random() - 0.5) * 0.9;
            const spd = 90 + Math.random() * 130;
            this.particles.push({
                x,
                y,
                vx: Math.sin(ang) * spd,
                vy: -Math.cos(ang) * spd,
                gravity: 90,
                life: 0.14 + Math.random() * 0.1,
                maxLife: 0.24,
                color: "rgba(255,205,90,0.9)",
                size: 2 + Math.random() * 2.5,
            });
        }
    },
    spawnBurst(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 60 + Math.random() * 120;
            this.particles.push({
                x,
                y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 40,
                gravity: 260,
                life: 0.5 + Math.random() * 0.3,
                maxLife: 0.8,
                color,
                size: 3 + Math.random() * 3,
            });
        }
    },
    spawnFloatText(x, y, text, color) {
        this.particles.push({
            x,
            y,
            vx: 0,
            vy: -55,
            gravity: 40,
            life: 0.9,
            maxLife: 0.9,
            color,
            text,
            size: 20,
        });
    },

    // ═══════════════════════════════════════════════════════════
    // QUIZ THEO SỐ CHIM ĐÃ BẮN TRÚNG (HỆT pkm_race.js)
    // ═══════════════════════════════════════════════════════════
    triggerQuiz() {
        if (this.gameOver) return;
        this.paused = true;
        this.controlsLocked = true;
        document.getElementById("shoot-controls").classList.add("locked");
        this.playQuizChime();

        const banner = document.getElementById("quiz-intro-banner");
        banner.classList.add("show");
        setTimeout(() => {
            banner.classList.remove("show");
        }, 900);

        setTimeout(() => {
            if (window.QuizManager) {
                window.QuizManager.ask((isCorrect) =>
                    this.onQuizAnswered(isCorrect),
                );
            } else {
                this.onQuizAnswered(true);
            }
        }, 750);
    },

    onQuizAnswered(isCorrect) {
        if (window.PkmScore) window.PkmScore.recordAnswer(isCorrect);

        this.totalCount++;
        if (isCorrect) this.correctCount++;
        else this.wrongCount++;
        this.updateHUD();

        this.paused = false;
        this.controlsLocked = false;
        document.getElementById("shoot-controls").classList.remove("locked");
        this.lastTs = performance.now();

        if (!isCorrect) {
            this.loseHeart("quiz_wrong");
        } else {
            this.spawnFloatText(
                this.VW / 2,
                this.VH * 0.36,
                "🎉 Chuẩn!",
                "#2ecc71",
            );
        }

        const isOver = this.checkGameOver();
        if (!isOver) {
            this.lastTs = performance.now();
            this.rafId = requestAnimationFrame(this._boundLoop);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // HUD
    // ═══════════════════════════════════════════════════════════
    updateHUD() {
        const scoreEl = document.getElementById("scoreValue");
        if (scoreEl) scoreEl.innerText = this.score;
        const stats = document.getElementById("quiz-stats");
        if (stats)
            stats.innerHTML = `✅ ${this.correctCount} &nbsp; ❌ ${this.wrongCount} &nbsp; 📊 ${this.totalCount} câu`;
        const levelEl = document.getElementById("levelChip");
        if (levelEl) levelEl.textContent = `🎯 Màn ${this.level}`;
        const weaponEl = document.getElementById("weaponChip");
        if (weaponEl) weaponEl.textContent = `🔫 ${this.weapon().name}`;
    },

    updateHeartsUI() {
        document.querySelectorAll("#heartsBox .heart-icon").forEach((el, i) => {
            el.classList.toggle("heart-lost", i >= this.lives);
        });
    },

    updateAmmoUI() {
        const w = this.weapon();
        const ammoText = document.getElementById("ammoText");
        if (ammoText) ammoText.textContent = `${this.ammo} / ${w.maxAmmo}`;
        // fallback cho HTML cũ (nếu còn dùng icon viên đạn cố định) — an toàn
        // dù số icon có ít/nhiều hơn maxAmmo thật của súng đang cầm.
        const box = document.getElementById("ammoBox");
        if (box) {
            box.querySelectorAll(".bullet-icon").forEach((el, i) => {
                el.classList.toggle("bullet-used", i >= this.ammo);
            });
        }
        const reloadBtn = document.getElementById("btnReload");
        if (reloadBtn) reloadBtn.classList.toggle("reloading", this.reloading);
        const aimBtn = document.getElementById("btnAim");
        if (aimBtn) {
            aimBtn.classList.toggle("hidden-weapon", !w.requiresScope);
            aimBtn.classList.toggle("active", this.aiming);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // KẾT THÚC GAME (dùng chung PkmScore — HỆT pkm_race.js)
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
            const team = inv
                .filter((p) => p.inTeam)
                .sort((a, b) => a.position - b.position);
            if (team.length > 0)
                return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${team[0].id}.png`;
        } catch (e) {
            /* ignore */
        }
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png`;
    },

    handleMatchEnd() {
        if (!window.PkmScore) {
            console.error(
                '❌ PkmScore chưa được nạp — thiếu <script src="pkm_score.js"> trong pkm_birdshoot.html?',
            );
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
                if (img) {
                    img.src = src;
                    img.style.filter = "grayscale(100%) opacity(0.7)";
                }
            });
            if (titleEl) {
                titleEl.innerText = "💥 HẾT MẠNG RỒI!";
                titleEl.style.color = "#e74c3c";
                titleEl.style.textShadow = "0 0 30px #e74c3c, 0 0 60px #c0392b";
            }
            if (expText) {
                expText.innerHTML = `
                    <div style="color:#ccc; margin-bottom:14px;">Cuộc săn kết thúc quá sớm!</div>
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

        if (titleEl) titleEl.innerText = "🏆 SĂN THÀNH CÔNG!";

        const messages = (result.breakdown || [])
            .map((b) => {
                if (b.type === "new_lesson")
                    return `🌟 BÀI MỚI HOÀN THÀNH (${b.accuracy}% đúng): <b>+${b.exp} KN +${b.dv} DV</b>`;
                if (b.type === "new_lesson_failed")
                    return `⚠️ Bài mới nhưng chỉ ${b.accuracy}% đúng — cần ≥${b.requiredAccuracy}% để mở khoá!`;
                if (b.type === "correct_answers")
                    return `📝 ${b.correctCount} câu đúng ÷ ${b.divisor} = <b>+${b.exp} KN +${b.dv} DV</b>`;
                if (b.type === "streak")
                    return b.exp > 0
                        ? `🔥 Chuỗi ${b.streak} ngày liên tục: <b>+${b.exp} KN +${b.dv} DV</b>`
                        : `📅 Chuỗi hiện tại: <b>${b.streak} ngày</b>`;
                return "";
            })
            .filter(Boolean);

        const skillOrder = window.PkmScore.SKILL_ORDER;
        const skillStatsNow = window.PkmScore.session.skillStats;
        const skillLines = skillOrder
            .map((s) => {
                const st = skillStatsNow[s] || { correct: 0, total: 0 };
                const label = {
                    listening: "🎧 Nghe",
                    speaking: "🗣️ Nói",
                    reading: "📖 Đọc",
                    writing: "✍️ Viết",
                }[s];
                return `<div>${label}: ${st.correct}/${st.total}</div>`;
            })
            .join("");

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
                    🐦 Chim bắn trúng: ${this.birdsCollected} &nbsp; | &nbsp; 🎯 Màn đã qua: ${this.level} &nbsp; | &nbsp; ⭐ Điểm: ${this.score}
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
    // VẼ TOÀN CẢNH — nền/sprite giao hết cho BirdShootBackground, ở đây chỉ
    // lo THỨ TỰ vẽ + hiệu ứng hạt + rung màn hình.
    // ═══════════════════════════════════════════════════════════
    drawScene(dt) {
        const ctx = this.ctx;
        ctx.save();
        ctx.clearRect(0, 0, this.VW, this.VH);

        if (this.shake.t > 0) {
            const m = this.shake.mag * (this.shake.t / 0.3);
            ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
        }

        const state = this.shootState();
        if (window.BirdShootBackground)
            window.BirdShootBackground.drawBackground(ctx, state);

        // vẽ mục tiêu theo thứ tự XA -> GẦN (depth thấp trước) để vật gần đè lên vật xa
        const drawList = this.objects.slice().sort((a, b) => {
            const depthOf = (o) =>
                o.kind === "bird" ? o.depth : o.kind === "balloon" ? 0.5 : 0.8;
            return depthOf(a) - depthOf(b);
        });
        if (window.BirdShootBackground) {
            drawList.forEach((obj) => {
                if (obj.kind === "bird")
                    window.BirdShootBackground.drawBird(ctx, obj, state);
                else if (obj.kind === "windmill")
                    window.BirdShootBackground.drawWindmill(ctx, obj, state);
                else if (obj.kind === "scarecrow")
                    window.BirdShootBackground.drawScarecrow(ctx, obj, state);
                else if (obj.kind === "balloon")
                    window.BirdShootBackground.drawBalloon(ctx, obj, state);
            });
        }

        this.drawParticles();

        // Viewmodel súng hiện tại luôn hiện đáy màn hình; ống ngắm sniper chỉ
        // hiện khi đang bật NGẮM (đè lên trên cùng, che luôn viewmodel bên dưới).
        if (window.BirdShootBackground) {
            window.BirdShootBackground.drawWeaponViewmodel(ctx, state);
            if (state.aiming && state.requiresScope)
                window.BirdShootBackground.drawScopeOverlay(ctx, state);
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
                ctx.strokeStyle = "rgba(0,0,0,0.6)";
                ctx.lineWidth = 3;
                ctx.strokeText(pt.text, pt.x, pt.y);
                ctx.fillText(pt.text, pt.x, pt.y);
            } else {
                ctx.fillStyle = pt.color;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });
    },
};

window.BirdShootGame.init();
