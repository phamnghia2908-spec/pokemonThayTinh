/**
 * ==========================================================
 * PKM TOWER SKILL — HIỆU ỨNG RIÊNG, NHẸ, CHO CHẾ ĐỘ THỦ THÀNH
 * ==========================================================
 * LÝ DO VIẾT RIÊNG: pkm_skill_normal.js / pkm_skill_aoe.js được thiết kế
 * cho trận đấu 3v3 lượt-đối-lượt (mỗi lượt chỉ 1-2 cặp ra đòn). Thủ Thành
 * có thể có tới 9 tháp cùng bắn liên tục — nếu dùng lại các hàm đó (mỗi
 * phát tạo hàng chục DOM node, có hàm còn chạy setInterval để rắc tia lửa)
 * thì bắn dồn dập nhiều tháp cùng lúc sẽ đơ máy ngay.
 *
 * File này chỉ có ĐÚNG 2 kỹ năng DÙNG CHUNG cho MỌI hệ Pokémon (không phân
 * biệt lửa/nước/điện...), tối giản hết mức:
 *   - TowerSkill.fireRanged(attackerEl, targetEl, opts) — tháp TẦM XA:
 *     1 viên đạn tròn bay thẳng tới mục tiêu rồi nổ nhẹ.
 *   - TowerSkill.meleeAttack(attackerEl, targetEl, opts) — tháp CẬN CHIẾN:
 *     tháp giật nhẹ tại chỗ + 1 vệt chớp tại mục tiêu (không di chuyển
 *     tháp, không tính toán vị trí phức tạp).
 *
 * Mỗi lần bắn chỉ tạo tối đa 3 phần tử DOM (đạn/chớp + hiệu ứng nổ + số
 * damage bay lên), toàn bộ dùng Element.animate() (Web Animations API,
 * chỉ animate transform/opacity — chạy trên GPU, không ép trình duyệt tính
 * lại layout liên tục), và tự gỡ khỏi DOM ngay khi animate xong
 * (.onfinish). KHÔNG setInterval, KHÔNG setTimeout lồng nhau nhiều tầng.
 * Âm thanh phát ra bằng Web Audio API TỰ TỔNG HỢP (oscillator, không cần
 * file mp3 — giống cách SoundEngine trong pkm_skill_aoe.js đã làm), rất
 * nhẹ, dùng chung 1 AudioContext cho cả trận.
 *
 * MÀU theo hệ Pokémon — chỉ để hiệu ứng có chút khác biệt giữa các con,
 * không ảnh hưởng gì tới cách hoạt động. Muốn đổi màu 1 hệ chỉ sửa 1 dòng.
 * ==========================================================
 */

window.TowerSkill = {
    TYPE_COLORS: {
        fire: '#ff7043', water: '#4fc3f7', electric: '#ffe066', grass: '#66bb6a',
        ice: '#b3e5fc', poison: '#ab47bc', ground: '#c19a5b', flying: '#b39ddb',
        psychic: '#f06292', fighting: '#ff8a65', ghost: '#8a6fd8', bug: '#c0d94a',
        rock: '#b8a038', dark: '#8d7a63', steel: '#b0bec5', dragon: '#7038f8',
        fairy: '#f48fb1', normal: '#d0d0c0',
    },

    colorFor(type) {
        return this.TYPE_COLORS[type] || this.TYPE_COLORS.normal;
    },

    // ══════════════════════════════════════════════════════
    // ÂM THANH — tự tổng hợp bằng Web Audio API (không cần file mp3),
    // dùng chung 1 AudioContext cho cả trận để đỡ tốn tài nguyên.
    // ══════════════════════════════════════════════════════
    _audioCtx: null,
    getAudioCtx() {
        if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
        return this._audioCtx;
    },

    // Tiếng "tách/zap" điện tử ngắn — dùng cho tháp TẦM XA
    playRangedSfx() {
        try {
            const ctx = this.getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(900, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
        } catch (e) { /* im lặng nếu trình duyệt chặn audio */ }
    },

    // Tiếng "huỵch" đấm trực diện — dùng cho tháp CẬN CHIẾN
    playMeleeSfx() {
        try {
            const ctx = this.getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(160, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.13);
        } catch (e) { /* im lặng nếu trình duyệt chặn audio */ }
    },

    // ══════════════════════════════════════════════════════
    // THÁP TẦM XA — 1 viên đạn bay thẳng attacker -> target
    // ══════════════════════════════════════════════════════
    fireRanged(attackerEl, targetEl, opts = {}) {
        if (!attackerEl || !targetEl) return;
        const { type = 'normal', damage = 0 } = opts;
        const color = this.colorFor(type);

        const rectA = attackerEl.getBoundingClientRect();
        const rectT = targetEl.getBoundingClientRect();
        const sx = rectA.left + rectA.width / 2, sy = rectA.top + rectA.height * 0.35;
        const ex = rectT.left + rectT.width / 2, ey = rectT.top + rectT.height / 2;
        const dx = ex - sx, dy = ey - sy;

        const bolt = document.createElement('div');
        bolt.style.cssText = `
            position: fixed; left: 0; top: 0; width: 10px; height: 10px;
            margin: -5px; border-radius: 50%;
            background: radial-gradient(circle, #fff 20%, ${color} 70%);
            box-shadow: 0 0 6px ${color};
            pointer-events: none; z-index: 9990; will-change: transform, opacity;
        `;
        document.body.appendChild(bolt);

        const dist = Math.max(1, Math.hypot(dx, dy));
        const duration = Math.min(420, Math.max(160, dist * 0.5)); // xa hơn thì bay lâu hơn 1 chút, có trần

            this.playRangedSfx();

            const anim = bolt.animate([
                { transform: `translate(${sx}px, ${sy}px) scale(0.5)`, opacity: 0 },
                { transform: `translate(${sx + dx * 0.15}px, ${sy + dy * 0.15}px) scale(1)`, opacity: 1, offset: 0.15 },
                { transform: `translate(${ex}px, ${ey}px) scale(1)`, opacity: 1 },
            ], { duration, easing: 'linear' });

            anim.onfinish = () => {
            bolt.remove();
            this.impactFlash(ex, ey, color);
            this.floatDamage(targetEl, damage, color);
        };
    },

    // ══════════════════════════════════════════════════════
    // THÁP CẬN CHIẾN — giật nhẹ tại chỗ + chớp tại mục tiêu
    // ══════════════════════════════════════════════════════
    meleeAttack(attackerEl, targetEl, opts = {}) {
        if (!attackerEl || !targetEl) return;
        const { type = 'normal', damage = 0 } = opts;
        const color = this.colorFor(type);

        // Tháp giật nhẹ (chỉ animate transform của lớp bọc trong, không đụng
        // vị trí left/top gốc của tháp — an toàn, không làm lệch đội hình).
        const wrapper = attackerEl.querySelector('div');
        if (wrapper) {
            const baseTransform = wrapper.style.transform || '';
            wrapper.animate([
                { transform: baseTransform || 'none' },
                { transform: (baseTransform || '') + ' scale(1.1)' },
                { transform: baseTransform || 'none' },
            ], { duration: 160, easing: 'ease-out' });
        }

    this.playMeleeSfx();

        const rectT = targetEl.getBoundingClientRect();
        const ex = rectT.left + rectT.width / 2, ey = rectT.top + rectT.height / 2;
        this.slashFlash(ex, ey, color);
        this.floatDamage(targetEl, damage, color);
    },

    // ── Hiệu ứng nổ tròn nhỏ khi đạn tầm xa trúng đích ──
    impactFlash(x, y, color) {
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; left: ${x}px; top: ${y}px; width: 22px; height: 22px; margin: -11px;
            border-radius: 50%;
            background: radial-gradient(circle, #fff 0%, ${color} 55%, transparent 78%);
            pointer-events: none; z-index: 9991;
        `;
        document.body.appendChild(el);
        const anim = el.animate([
            { transform: 'scale(0.3)', opacity: 1 },
            { transform: 'scale(1.7)', opacity: 0 },
        ], { duration: 220, easing: 'ease-out' });
        anim.onfinish = () => el.remove();
    },

    // ── Vệt chớp chéo khi cận chiến đấm trúng ──
    slashFlash(x, y, color) {
        const angle = Math.random() * 40 - 20;
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; left: ${x}px; top: ${y}px; width: 30px; height: 6px; margin: -3px -15px;
            background: linear-gradient(90deg, transparent, #fff, ${color}, transparent);
            border-radius: 4px; pointer-events: none; z-index: 9991;
        `;
        document.body.appendChild(el);
        const anim = el.animate([
            { transform: `rotate(${angle}deg) scaleX(0.3)`, opacity: 0 },
            { transform: `rotate(${angle}deg) scaleX(1.3)`, opacity: 1, offset: 0.35 },
            { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 0 },
        ], { duration: 200, easing: 'ease-out' });
        anim.onfinish = () => el.remove();
    },

    // ── Số damage bay lên đầu mục tiêu (con của targetEl, targetEl phải
    //    đang position:absolute/relative sẵn — enemy trong Thủ Thành đã vậy) ──
    floatDamage(targetEl, damage, color) {
        if (!damage) return;
        const div = document.createElement('div');
        div.innerText = damage;
        div.style.cssText = `
            position: absolute; left: 50%; top: 8%; transform: translate(-50%, 0);
            color: ${color}; font-weight: 900; font-size: 12px;
            text-shadow: 1px 1px 2px #000, -1px -1px 2px #000;
            pointer-events: none; z-index: 15; will-change: transform, opacity;
        `;
        targetEl.appendChild(div);
        const anim = div.animate([
            { transform: 'translate(-50%, 0)', opacity: 1 },
            { transform: 'translate(-50%, -22px)', opacity: 0 },
        ], { duration: 550, easing: 'ease-out' });
        anim.onfinish = () => div.remove();
    },
};