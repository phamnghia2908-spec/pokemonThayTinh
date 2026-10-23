/**
 * ==========================================================
 * PKM SKILL CHESS — HIỆU ỨNG ĂN QUÂN RIÊNG CHO CỜ VUA
 * ==========================================================
 * DÙNG GIỐNG HỆT API CỦA pkm_tower_skill.js (để dễ thay thế trong
 * pkm_chess.js — chỉ cần đổi TowerSkill -> ChessSkill), nhưng:
 *
 *   1) THỜI LƯỢNG DÀI HƠN — mỗi lần ăn quân kéo dài ~2000ms (2 giây)
 *      thay vì ~300-550ms như bản Thủ Thành (bản đó cố tình làm NHANH
 *      vì Thủ Thành có nhiều tháp bắn liên tục cùng lúc; Cờ Vua là
 *      lượt-đối-lượt nên có thể "diễn" lâu hơn cho đã mắt).
 *
 *   2) NHIỀU BIẾN THỂ NGẪU NHIÊN — mỗi lần ăn quân, hệ thống tự bốc
 *      thăm 1 trong các kiểu hiệu ứng bên dưới, không lặp lại y hệt
 *      nhau liên tục:
 *        - CẬN CHIẾN (melee): "cào" (claw), "húc" (ram/tackle),
 *          "cắn" (bite) — random chọn 1 trong 3.
 *        - TẦM XA (ranged): "bắn dồn dập nhiều viên" (volley),
 *          "tích năng lượng bắn 1 viên to" (big orb), "tia laser"
 *          (beam) — random chọn 1 trong 3.
 *
 *   3) TỰ CHỨA (KHÔNG phụ thuộc pkm_tower_skill.js) — copy sẵn bảng
 *      màu theo hệ + tự tổng hợp âm thanh riêng, chỉ cần include đúng
 *      1 file này là chạy được.
 *
 * API:
 *   ChessSkill.meleeAttack(attackerEl, targetEl, opts) -> Promise
 *   ChessSkill.fireRanged(attackerEl, targetEl, opts)  -> Promise
 *   opts = { type: 'fire', damage: 123 }
 *
 * QUAN TRỌNG: cả 2 hàm đều TRẢ VỀ 1 PROMISE, resolve đúng lúc hiệu ứng
 * chạy xong hẳn (~2000ms). Trong pkm_chess.js, nên `await` thẳng promise
 * này thay vì tự đoán số ms sleep — vừa chính xác vừa tự động đồng bộ
 * nếu sau này đổi TOTAL_DURATION.
 * ==========================================================
 */

window.ChessSkill = {
    TOTAL_DURATION: 2000, // đổi số này để skill dài/ngắn lại toàn bộ

    TYPE_COLORS: {
        fire: '#ff7043', water: '#4fc3f7', electric: '#ffe066', grass: '#66bb6a',
        ice: '#b3e5fc', poison: '#ab47bc', ground: '#c19a5b', flying: '#b39ddb',
        psychic: '#f06292', fighting: '#ff8a65', ghost: '#8a6fd8', bug: '#c0d94a',
        rock: '#b8a038', dark: '#8d7a63', steel: '#b0bec5', dragon: '#7038f8',
        fairy: '#f48fb1', normal: '#d0d0c0',
    },

    colorFor(type) { return this.TYPE_COLORS[type] || this.TYPE_COLORS.normal; },

    // ══════════════════════════════════════════════════════
    // TIỆN ÍCH DÙNG CHUNG
    // ══════════════════════════════════════════════════════
    randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
    randFloat(min, max) { return Math.random() * (max - min) + min; },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

    centerOf(el, fracX = 0.5, fracY = 0.5) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width * fracX, y: r.top + r.height * fracY };
    },

    spawnDiv(cssText) {
        const el = document.createElement('div');
        el.style.cssText = cssText;
        document.body.appendChild(el);
        return el;
    },

    // ══════════════════════════════════════════════════════
    // ÂM THANH — tự tổng hợp bằng Web Audio API, dùng chung 1 AudioContext.
    // ══════════════════════════════════════════════════════
    _audioCtx: null,
    getAudioCtx() {
        if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
        return this._audioCtx;
    },

    // Phát 1 tiếng "tone" tuỳ chỉnh — dùng chung cho mọi hiệu ứng SFX.
    playTone({ wave = 'sine', freqStart = 440, freqEnd = 220, duration = 0.15, gain = 0.15, delay = 0 }) {
        try {
            const ctx = this.getAudioCtx();
            const t0 = ctx.currentTime + delay;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = wave;
            osc.frequency.setValueAtTime(freqStart, t0);
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
            g.gain.setValueAtTime(gain, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
            osc.connect(g).connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + duration + 0.02);
        } catch (e) { /* im lặng nếu trình duyệt chặn audio */ }
    },

    playClawSfx() {
        // 3 tiếng "xoẹt" liên tiếp, cao dần — nghe như móng vuốt cào.
        for (let i = 0; i < 3; i++) {
            this.playTone({ wave: 'sawtooth', freqStart: 700 + i * 120, freqEnd: 250 + i * 80, duration: 0.09, gain: 0.1, delay: i * 0.07 });
        }
    },
    playRamSfx() {
        // Tiếng "huỵch" trầm, nặng — húc trực diện.
        this.playTone({ wave: 'square', freqStart: 140, freqEnd: 45, duration: 0.22, gain: 0.22 });
        this.playTone({ wave: 'sine', freqStart: 90, freqEnd: 30, duration: 0.28, gain: 0.14, delay: 0.02 });
    },
    playBiteSfx() {
        // Tiếng "cạp" ngắn gọn, 2 nhịp đóng hàm.
        this.playTone({ wave: 'square', freqStart: 320, freqEnd: 90, duration: 0.09, gain: 0.18 });
        this.playTone({ wave: 'square', freqStart: 260, freqEnd: 70, duration: 0.1, gain: 0.16, delay: 0.1 });
    },
    playShotSfx() {
        this.playTone({ wave: 'sawtooth', freqStart: 950, freqEnd: 240, duration: 0.11, gain: 0.11 });
    },
    playChargeSfx(duration) {
        // Tiếng "vo ve" tăng dần khi tích năng lượng.
        this.playTone({ wave: 'sine', freqStart: 120, freqEnd: 900, duration, gain: 0.08 });
    },
    playBoomSfx() {
        this.playTone({ wave: 'sawtooth', freqStart: 260, freqEnd: 40, duration: 0.3, gain: 0.2 });
        this.playTone({ wave: 'square', freqStart: 90, freqEnd: 30, duration: 0.35, gain: 0.12, delay: 0.03 });
    },
    playBeamSfx(duration) {
        this.playTone({ wave: 'sawtooth', freqStart: 500, freqEnd: 500, duration, gain: 0.07 });
    },

    // ══════════════════════════════════════════════════════
    // HIỆU ỨNG DÙNG CHUNG (impact / số damage / rung nhẹ)
    // ══════════════════════════════════════════════════════
    impactFlash(x, y, color, size = 26, duration = 260) {
        const el = this.spawnDiv(`
            position:fixed; left:${x}px; top:${y}px; width:${size}px; height:${size}px; margin:${-size / 2}px;
            border-radius:50%; background:radial-gradient(circle, #fff 0%, ${color} 55%, transparent 78%);
            pointer-events:none; z-index:9991;
        `);
        const anim = el.animate([
            { transform: 'scale(0.3)', opacity: 1 },
            { transform: `scale(${size > 30 ? 2.4 : 1.8})`, opacity: 0 },
        ], { duration, easing: 'ease-out' });
        anim.onfinish = () => el.remove();
    },

    shockwaveRing(x, y, color, duration = 420) {
        const el = this.spawnDiv(`
            position:fixed; left:${x}px; top:${y}px; width:14px; height:14px; margin:-7px;
            border-radius:50%; border:3px solid ${color}; box-shadow:0 0 10px ${color};
            pointer-events:none; z-index:9990;
        `);
        const anim = el.animate([
            { transform: 'scale(0.5)', opacity: 0.9 },
            { transform: 'scale(6)', opacity: 0 },
        ], { duration, easing: 'ease-out' });
        anim.onfinish = () => el.remove();
    },

    slashMark(x, y, color, angleDeg, width = 34, duration = 320) {
        const el = this.spawnDiv(`
            position:fixed; left:${x}px; top:${y}px; width:${width}px; height:5px; margin:-2.5px ${-width / 2}px;
            background:linear-gradient(90deg, transparent, #fff, ${color}, transparent);
            border-radius:4px; pointer-events:none; z-index:9992;
        `);
        const anim = el.animate([
            { transform: `rotate(${angleDeg}deg) scaleX(0.2)`, opacity: 0 },
            { transform: `rotate(${angleDeg}deg) scaleX(1.3)`, opacity: 1, offset: 0.4 },
            { transform: `rotate(${angleDeg}deg) scaleX(1)`, opacity: 0 },
        ], { duration, easing: 'ease-out' });
        anim.onfinish = () => el.remove();
    },

    // Số damage bay lên đầu mục tiêu — nảy nhẹ lúc xuất hiện rồi trôi lên
    // và mờ dần, kéo dài hơn bản Tower cho "đã mắt" (khớp tổng thời lượng).
    floatDamage(targetEl, damage, color, delayMs = 0, duration = 1100) {
        if (!damage) return;
        setTimeout(() => {
            const div = document.createElement('div');
            div.innerText = damage;
            div.style.cssText = `
                position:absolute; left:50%; top:8%; transform:translate(-50%,0) scale(0.4);
                color:${color}; font-weight:900; font-size:14px;
                text-shadow:1px 1px 2px #000, -1px -1px 2px #000, 0 0 6px ${color};
                pointer-events:none; z-index:15; will-change:transform, opacity;
            `;
            targetEl.appendChild(div);
            const anim = div.animate([
                { transform: 'translate(-50%, 6px) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%, -4px) scale(1.25)', opacity: 1, offset: 0.22 },
                { transform: 'translate(-50%, -10px) scale(1)', opacity: 1, offset: 0.55 },
                { transform: 'translate(-50%, -30px) scale(1)', opacity: 0 },
            ], { duration, easing: 'ease-out' });
            anim.onfinish = () => div.remove();
        }, delayMs);
    },

    // Tháp/quân giật nhẹ hoặc lao về phía mục tiêu rồi bật lại.
    lungeToward(attackerEl, dx, dy, distancePx, duration = 500) {
        const wrapper = attackerEl.querySelector('div');
        if (!wrapper) return;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const ux = (dx / dist) * distancePx, uy = (dy / dist) * distancePx;
        const baseTransform = wrapper.style.transform || '';
        wrapper.animate([
            { transform: baseTransform || 'none' },
            { transform: `${baseTransform} translate(${ux * 0.3}px, ${uy * 0.3}px)`, offset: 0.18 },
            { transform: `${baseTransform} translate(${ux}px, ${uy}px) scale(1.08)`, offset: 0.45 },
            { transform: baseTransform || 'none' },
        ], { duration, easing: 'ease-in-out' });
    },

    shakeElement(el, duration = 300) {
        const wrapper = el.querySelector('div') || el;
        const baseTransform = wrapper.style.transform || '';
        wrapper.animate([
            { transform: `${baseTransform} rotate(0deg)` },
            { transform: `${baseTransform} rotate(-6deg)`, offset: 0.25 },
            { transform: `${baseTransform} rotate(5deg)`, offset: 0.5 },
            { transform: `${baseTransform} rotate(-3deg)`, offset: 0.75 },
            { transform: `${baseTransform} rotate(0deg)` },
        ], { duration, easing: 'ease-in-out' });
    },

    // ══════════════════════════════════════════════════════
    // CẬN CHIẾN — 3 biến thể: claw / ram / bite (random chọn 1)
    // ══════════════════════════════════════════════════════
    meleeAttack(attackerEl, targetEl, opts = {}) {
        if (!attackerEl || !targetEl) return Promise.resolve();
        const { type = 'normal', damage = 0 } = opts;
        const color = this.colorFor(type);
        const variant = this.pick(['claw', 'ram', 'bite']);
        const a = this.centerOf(attackerEl), t = this.centerOf(targetEl);
        const dx = t.x - a.x, dy = t.y - a.y;

        if (variant === 'claw') this._meleeClaw(attackerEl, targetEl, t, dx, dy, color, damage);
        else if (variant === 'ram') this._meleeRam(attackerEl, targetEl, t, dx, dy, color, damage);
        else this._meleeBite(attackerEl, targetEl, t, dx, dy, color, damage);

        return new Promise((resolve) => setTimeout(resolve, this.TOTAL_DURATION));
    },

    // "Cào" — quân lao nhẹ tới rồi 3 vệt cào chéo hiện lần lượt, so le
    // góc ngẫu nhiên, sau đó bùng sáng nhẹ tại mục tiêu.
    _meleeClaw(attackerEl, targetEl, t, dx, dy, color, damage) {
        this.lungeToward(attackerEl, dx, dy, 16, 480);
        setTimeout(() => this.playClawSfx(), 140);

        const baseAngle = this.randInt(-40, -10);
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const angle = baseAngle + i * 14 + this.randInt(-6, 6);
                const ox = this.randInt(-6, 6), oy = this.randInt(-6, 6);
                this.slashMark(t.x + ox, t.y + oy, color, angle, this.randInt(28, 40), 360);
            }, 160 + i * 130);
        }

        setTimeout(() => this.impactFlash(t.x, t.y, color, 24, 260), 700);
        this.floatDamage(targetEl, damage, color, 780, 1050);
    },

    // "Húc" — quân lao mạnh (khoảng cách dài hơn claw) đâm thẳng vào mục
    // tiêu, tạo vòng sóng xung kích + mục tiêu rung lắc.
    _meleeRam(attackerEl, targetEl, t, dx, dy, color, damage) {
        this.lungeToward(attackerEl, dx, dy, 26, 460);
        setTimeout(() => {
            this.playRamSfx();
            this.impactFlash(t.x, t.y, '#ffffff', 30, 220);
            this.shockwaveRing(t.x, t.y, color, 460);
            this.shakeElement(targetEl, 340);
        }, 220);

        this.floatDamage(targetEl, damage, color, 300, 1200);
    },

    // "Cắn" — 2 vệt cong (như hàm răng khép lại) áp vào 2 bên mục tiêu
    // rồi khép nhanh vào giữa kèm chớp sáng.
    _meleeBite(attackerEl, targetEl, t, dx, dy, color, damage) {
        this.lungeToward(attackerEl, dx, dy, 14, 420);

        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        [-1, 1].forEach((side, i) => {
            const arc = this.spawnDiv(`
                position:fixed; left:${t.x}px; top:${t.y}px; width:26px; height:26px; margin:-13px;
                border:4px solid ${color}; border-radius:50%;
                clip-path: inset(0 ${side > 0 ? '0 0 50%' : '50% 0 0'});
                box-shadow:0 0 6px ${color}; pointer-events:none; z-index:9992;
                transform: rotate(${angle}deg);
            `);
            const anim = arc.animate([
                { transform: `rotate(${angle}deg) scale(1.6)`, opacity: 0 },
                { transform: `rotate(${angle}deg) scale(1)`, opacity: 1, offset: 0.5 },
                { transform: `rotate(${angle}deg) scale(0.7)`, opacity: 0 },
            ], { duration: 380, delay: 120 + i * 60, easing: 'ease-in' });
            anim.onfinish = () => arc.remove();
        });

        setTimeout(() => { this.playBiteSfx(); this.impactFlash(t.x, t.y, color, 20, 220); }, 260);
        this.floatDamage(targetEl, damage, color, 560, 1150);
    },

    // ══════════════════════════════════════════════════════
    // TẦM XA — 3 biến thể: volley / bigOrb / beam (random chọn 1)
    // ══════════════════════════════════════════════════════
    fireRanged(attackerEl, targetEl, opts = {}) {
        if (!attackerEl || !targetEl) return Promise.resolve();
        const { type = 'normal', damage = 0 } = opts;
        const color = this.colorFor(type);
        const variant = this.pick(['volley', 'bigOrb', 'beam']);
        const a = this.centerOf(attackerEl, 0.5, 0.35), t = this.centerOf(targetEl);

        if (variant === 'volley') this._rangedVolley(attackerEl, targetEl, a, t, color, damage);
        else if (variant === 'bigOrb') this._rangedBigOrb(attackerEl, targetEl, a, t, color, damage);
        else this._rangedBeam(attackerEl, targetEl, a, t, color, damage);

        return new Promise((resolve) => setTimeout(resolve, this.TOTAL_DURATION));
    },

    _fireOneBolt(a, t, color, size, duration) {
        const bolt = this.spawnDiv(`
            position:fixed; left:0; top:0; width:${size}px; height:${size}px; margin:${-size / 2}px;
            border-radius:50%; background:radial-gradient(circle, #fff 20%, ${color} 70%);
            box-shadow:0 0 8px ${color}; pointer-events:none; z-index:9990; will-change:transform, opacity;
        `);
        const dx = t.x - a.x, dy = t.y - a.y;
        const anim = bolt.animate([
            { transform: `translate(${a.x}px, ${a.y}px) scale(0.5)`, opacity: 0 },
            { transform: `translate(${a.x + dx * 0.15}px, ${a.y + dy * 0.15}px) scale(1)`, opacity: 1, offset: 0.15 },
            { transform: `translate(${t.x}px, ${t.y}px) scale(1)`, opacity: 1 },
        ], { duration, easing: 'linear' });
        anim.onfinish = () => { bolt.remove(); this.impactFlash(t.x, t.y, color, 18, 200); };
    },

    // "Bắn dồn dập" — 4-5 viên đạn nhỏ bắn liên tiếp, mỗi viên lệch hướng
    // ngẫu nhiên nhẹ, dồn dập rồi kết bằng 1 chớp lớn + số damage.
    _rangedVolley(attackerEl, targetEl, a, t, color, damage) {
        const shots = this.randInt(4, 5);
        const interval = 150;
        let lastLandTime = 0;

        for (let i = 0; i < shots; i++) {
            const fireAt = i * interval;
            setTimeout(() => {
                this.playShotSfx();
                const jitterT = { x: t.x + this.randInt(-14, 14), y: t.y + this.randInt(-14, 14) };
                const flightDuration = this.randInt(260, 380);
                this._fireOneBolt(a, jitterT, color, 9, flightDuration);
            }, fireAt);
            lastLandTime = fireAt + 380;
        }

        setTimeout(() => this.impactFlash(t.x, t.y, color, 32, 320), lastLandTime + 40);
        this.floatDamage(targetEl, damage, color, lastLandTime + 120, 1000);
    },

    // "Tích năng lượng" — quầng sáng lớn dần tại vị trí quân bắn (charge),
    // sau đó phóng 1 viên đạn to kèm đuôi lửa, nổ lớn khi trúng đích.
    _rangedBigOrb(attackerEl, targetEl, a, t, color, damage) {
        const chargeDuration = 650;
        const charge = this.spawnDiv(`
            position:fixed; left:${a.x}px; top:${a.y}px; width:10px; height:10px; margin:-5px;
            border-radius:50%; background:radial-gradient(circle, #fff 10%, ${color} 60%, transparent 80%);
            box-shadow:0 0 10px ${color}; pointer-events:none; z-index:9990;
        `);
        this.playChargeSfx(chargeDuration / 1000);
        const chargeAnim = charge.animate([
            { transform: 'scale(0.3)', opacity: 0.3 },
            { transform: 'scale(2.4)', opacity: 1 },
        ], { duration: chargeDuration, easing: 'ease-in' });
        chargeAnim.onfinish = () => {
            charge.remove();
            const orb = this.spawnDiv(`
                position:fixed; left:0; top:0; width:26px; height:26px; margin:-13px;
                border-radius:50%; background:radial-gradient(circle, #fff 15%, ${color} 65%, transparent 85%);
                box-shadow:0 0 18px ${color}; pointer-events:none; z-index:9990; will-change:transform, opacity;
            `);
            const dx = t.x - a.x, dy = t.y - a.y;
            const flightDuration = 480;
            const anim = orb.animate([
                { transform: `translate(${a.x}px, ${a.y}px) scale(0.6)`, opacity: 0.9 },
                { transform: `translate(${a.x + dx * 0.5}px, ${a.y + dy * 0.5}px) scale(1.1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${t.x}px, ${t.y}px) scale(1)`, opacity: 1 },
            ], { duration: flightDuration, easing: 'ease-in' });
            anim.onfinish = () => {
                orb.remove();
                this.playBoomSfx();
                this.impactFlash(t.x, t.y, color, 46, 380);
                this.shockwaveRing(t.x, t.y, color, 520);
            };
            this.floatDamage(targetEl, damage, color, flightDuration + 60, 1000);
        };
    },

    // "Tia laser" — 1 dải sáng nối liền quân bắn tới mục tiêu, nhấp nháy
    // vài nhịp trước khi tắt, kèm hạt sáng nhỏ bắn ra tại điểm trúng.
    _rangedBeam(attackerEl, targetEl, a, t, color, damage) {
        const dx = t.x - a.x, dy = t.y - a.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const beamDuration = 780;

        const beam = this.spawnDiv(`
            position:fixed; left:${a.x}px; top:${a.y}px; width:${dist}px; height:6px; margin-top:-3px;
            transform-origin:0 50%; transform:rotate(${angle}deg) scaleX(0);
            background:linear-gradient(90deg, ${color}, #fff, ${color});
            box-shadow:0 0 10px ${color}; border-radius:3px; pointer-events:none; z-index:9990;
        `);
        this.playBeamSfx(beamDuration / 1000);
        const anim = beam.animate([
            { transform: `rotate(${angle}deg) scaleX(0)`, opacity: 0 },
            { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.18 },
            { opacity: 0.55, offset: 0.35 },
            { opacity: 1, offset: 0.5 },
            { opacity: 0.55, offset: 0.65 },
            { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.8 },
            { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 0 },
        ], { duration: beamDuration, easing: 'ease-in-out' });
        anim.onfinish = () => {
            beam.remove();
            this.impactFlash(t.x, t.y, color, 30, 300);
            for (let i = 0; i < 4; i++) {
                const spreadAngle = this.randFloat(0, 360);
                const spark = this.spawnDiv(`
                    position:fixed; left:${t.x}px; top:${t.y}px; width:5px; height:5px; margin:-2.5px;
                    border-radius:50%; background:${color}; box-shadow:0 0 6px ${color};
                    pointer-events:none; z-index:9991;
                `);
                const sx = Math.cos(spreadAngle * Math.PI / 180) * 22, sy = Math.sin(spreadAngle * Math.PI / 180) * 22;
                const sparkAnim = spark.animate([
                    { transform: 'translate(0,0)', opacity: 1 },
                    { transform: `translate(${sx}px, ${sy}px)`, opacity: 0 },
                ], { duration: 300, easing: 'ease-out' });
                sparkAnim.onfinish = () => spark.remove();
            }
        };
        this.floatDamage(targetEl, damage, color, beamDuration - 200, 950);
    },
};