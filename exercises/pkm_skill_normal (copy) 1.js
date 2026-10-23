/**
 * ==========================================================
 * PKM SKILL NORMAL — ĐÒN THƯỜNG, MỖI HỆ 1 SKILL ĐƠN GIẢN
 * ==========================================================
 * KIẾN TRÚC: khung sườn cố định (không cần đụng vào) + 1 VÙNG DÁN
 * duy nhất (coreSkills) nơi bạn copy NGUYÊN VĂN các hàm spawnXxx
 * từ file pkm_skill.js GỐC (bản 18 hệ, dùng class .particle-xxx
 * trong pkm_skill.css) dán thẳng vào — KHÔNG cần sửa cú pháp.
 *
 * VÌ SAO DÁN THẲNG ĐƯỢC MÀ KHÔNG LỖI (đọc trước khi dán):
 *  1) coreSkills là 1 OBJECT LITERAL — đúng định dạng
 *     "method-shorthand" (tenHam(...) {...}) giống hệt cách viết
 *     trong pkm_skill.js gốc. Nhớ giữ DẤU PHẨY giữa các hàm.
 *  2) Các hàm gốc gọi chéo nhau qua this (vd spawnFire gọi
 *     this.executeSingleFireball, hàm đó gọi this.createFireExplosion)
 *     — vì toàn bộ coreSkills được gộp vào SkillManager (SM) bằng
 *     Object.assign(SM, coreSkills), mọi this.xxx bên trong đều tự
 *     động trỏ đúng, không cần sửa.
 *  3) Các hàm gốc đọc this.durationConfig.projectileFly / .chargeAura
 *     / .targetSustain (cấp cao nhất, không lồng .aoe) — phần SHIM
 *     bên dưới đã tự tạo các key này (lấy giá trị từ durationConfig.aoe
 *     làm mặc định) để hàm dán vào luôn đọc được, không cần sửa.
 *
 * MUỐN THÊM 1 HỆ MỚI:
 *   Bước 1: Dán hàm spawnXxx (+ các hàm phụ nó gọi, nếu có) vào
 *           bên trong coreSkills, cách hàm trước bằng dấu phẩy.
 *   Bước 2: Thêm 1 dòng vào spawnMethodMap, ví dụ:
 *           water: 'spawnWater',
 *   Xong — không cần sửa gì khác trong file này.
 * ==========================================================
 */

(function () {
    if (!window.SkillManager) {
        console.warn('[pkm_skill_normal] window.SkillManager chưa tồn tại — hãy nạp pkm_skill_aoe.js trước.');
        window.SkillManager = {};
    }

    const SM = window.SkillManager;

    window.SoundEngine = window.SoundEngine || {
        _ctx: null,
        getCtx() {
            if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (this._ctx.state === 'suspended') this._ctx.resume();
            return this._ctx;
        },
        zap(vol = 0.15) { /* ... như đã đưa ... */ },
        boom(vol = 0.25) { /* ... */ },
        whoosh(vol = 0.18, dur = 0.25) { /* ... */ },
        chime(freq = 1200, vol = 0.12) { /* ... */ },
        crackle(vol = 0.15, dur = 0.25) { /* ... */ },
    };
    // Mở khoá AudioContext ngay lần chạm/click ĐẦU TIÊN của người dùng —
    // bắt buộc do chính sách autoplay trình duyệt. Nếu không làm bước
    // này, các tiếng động ngắn (zap/boom/crackle...) có thể phát xong
    // và tắt TRƯỚC KHI context kịp chuyển sang "running" → im lặng.
    (function unlockAudioOnce() {
        const unlock = () => {
            const ctx = window.SoundEngine.getCtx();
            if (ctx.state === 'suspended') ctx.resume();
            ['click', 'touchstart', 'keydown'].forEach(evt =>
                window.removeEventListener(evt, unlock)
            );
        };
        ['click', 'touchstart', 'keydown'].forEach(evt =>
            window.addEventListener(evt, unlock, { once: true })
        );
    })();

    SM.playRandomSfx = function () {
        const engine = window.SoundEngine;
        if (!engine) return;
        const presets = [
            () => engine.zap(0.12),
            () => engine.whoosh(0.14, 0.18),
            () => engine.crackle(0.14, 0.18),
            () => engine.chime(1000 + Math.random() * 400, 0.10),
        ];
        presets[Math.floor(Math.random() * presets.length)]();
    };
    

    // ── SHIM: cấp phát các key durationConfig CẤP CAO NHẤT mà các
    //    hàm gốc (dán từ pkm_skill.js cũ) cần đọc, lấy mặc định từ
    //    durationConfig.aoe nếu có, để KHÔNG PHẢI sửa hàm dán vào ──
    SM.durationConfig = SM.durationConfig || {};
    const AOE_CFG = SM.durationConfig.aoe || {};
    SM.durationConfig.projectileFly = SM.durationConfig.projectileFly || AOE_CFG.projectileFly || 2000;
    SM.durationConfig.chargeAura    = SM.durationConfig.chargeAura    || AOE_CFG.chargeAura    || 600;
    SM.durationConfig.targetSustain = SM.durationConfig.targetSustain || AOE_CFG.targetSustain || 2000;
    SM.durationConfig.delayBetween  = SM.durationConfig.delayBetween  || 300;
    SM.durationConfig.electricBolt  = SM.durationConfig.electricBolt  || 300;
    SM.durationConfig.statusText    = SM.durationConfig.statusText    || 1600;

    // ── Cấu hình riêng cho ĐÒN THƯỜNG (không đụng tới durationConfig.aoe) ──
    SM.durationConfig.normal = Object.assign({
        motionOut: 220,
        motionBack: 200,
        flight: 350,
        shake: 450,
        physicalStyleChance: 0.20,
        bigOrbChance: 0.20,       // ← giảm còn 20%
        streamChance: 0.30,       // ← MỚI: skill phun dải
        bigOrbFlightDuration: 1800,
    }, SM.durationConfig.normal || {});

    // ── Tên chiêu hiển thị (PkmUnitFX.showSkillName) ──
    const skillMetaNormal = {
        fire: 'Ember', water: 'Water Gun', grass: 'Vine Whip', electric: 'Thunder Shock',
        ice: 'Ice Shard', poison: 'Acid', ground: 'Mud Slap', flying: 'Gust',
        psychic: 'Confusion', fighting: 'Karate Chop', ghost: 'Lick', bug: 'Bug Bite',
        rock: 'Rock Throw', dark: 'Bite', steel: 'Metal Claw', dragon: 'Dragon Breath',
        fairy: 'Fairy Wind', normal: 'Tackle'
    };
    const bigOrbTypeConfig = {
        fire:     { core: '#ffffff', mid: '#ffcf4d', edge: '#e64a19', glow: '#ff6d00', label: 'Fireball' },
        water:    { core: '#eafaff', mid: '#4fc3f7', edge: '#0d47a1', glow: '#29b6f6', label: 'Water Orb' },
        grass:    { core: '#eaffea', mid: '#66bb6a', edge: '#1b5e20', glow: '#43a047', label: 'Vine Orb' },
        electric: { core: '#ffffff', mid: '#fff176', edge: '#f57f17', glow: '#ffd600', label: 'Thunder Orb' },
        ice:      { core: '#ffffff', mid: '#b3e5fc', edge: '#01579b', glow: '#81d4fa', label: 'Ice Orb' },
        poison:   { core: '#f3e5f5', mid: '#ab47bc', edge: '#4a148c', glow: '#8e24aa', label: 'Toxic Orb' },
        ground:   { core: '#fff3e0', mid: '#a1887f', edge: '#4e342e', glow: '#8d6e63', label: 'Earth Orb' },
        flying:   { core: '#f5f5ff', mid: '#b39ddb', edge: '#4527a0', glow: '#9575cd', label: 'Gale Orb' },
        psychic:  { core: '#ffffff', mid: '#f06292', edge: '#880e4f', glow: '#f8558a', label: 'Psychic Orb' },
        fighting: { core: '#fff3e0', mid: '#ff7043', edge: '#bf360c', glow: '#e64a19', label: 'Force Orb' },
        ghost:    { core: '#ece6ff', mid: '#7e57c2', edge: '#311b92', glow: '#6a5acd', label: 'Shadow Orb' },
        bug:      { core: '#f1f8e9', mid: '#9ccc65', edge: '#33691e', glow: '#7cb342', label: 'Bug Orb' },
        rock:     { core: '#efebe9', mid: '#a1887f', edge: '#3e2723', glow: '#8d6e63', label: 'Boulder Orb' },
        dark:     { core: '#e0e0e0', mid: '#616161', edge: '#000000', glow: '#424242', label: 'Dark Orb' },
        steel:    { core: '#ffffff', mid: '#b0bec5', edge: '#37474f', glow: '#90a4ae', label: 'Steel Orb' },
        dragon:   { core: '#ede7f6', mid: '#7e57c2', edge: '#311b92', glow: '#7038f8', label: 'Dragon Orb' },
        fairy:    { core: '#ffffff', mid: '#f8bbd0', edge: '#ad1457', glow: '#f48fb1', label: 'Fairy Orb' },
        normal:   { core: '#ffffff', mid: '#e0e0e0', edge: '#9e9e9e', glow: '#bdbdbd', label: 'Energy Orb' },
    };
    // Tên riêng cho chiêu QUẢ CẦU TO DẦN (khác với tên "... Orb" của chiêu chùm sáng)
    const growOrbNameMap = {
        fire: 'Fire Comet', water: 'Water Comet', grass: 'Leaf Comet', electric: 'Thunder Comet',
        ice: 'Ice Comet', poison: 'Toxic Comet', ground: 'Earth Comet', flying: 'Gale Comet',
        psychic: 'Psychic Comet', fighting: 'Force Comet', ghost: 'Shadow Comet', bug: 'Bug Comet',
        rock: 'Boulder Comet', dark: 'Dark Comet', steel: 'Steel Comet', dragon: 'Dragon Comet',
        fairy: 'Fairy Comet', normal: 'Energy Comet'
    };

    // ── Ánh xạ hệ → TÊN HÀM (chuỗi) trong coreSkills bên dưới.
    //    Thêm hệ mới = thêm 1 dòng ở đây, không cần sửa chỗ khác. ──
    const spawnMethodMap = {
        fire:     'spawnFire',
        electric: 'spawnElectric',
        water:    'spawnWater',
        grass:    'spawnGrass',
        ice:      'spawnIce',
        poison:   'spawnPoison',
        ground:   'spawnGround',
        flying:   'spawnFlying',
        psychic:  'spawnPsychic',
        fighting: 'spawnFighting',
        ghost:    'spawnGhost',
        bug:      'spawnBug',
        rock:     'spawnRock',
        dark:     'spawnDark',
        steel:    'spawnSteel',
        dragon:   'spawnDragon',
        fairy:    'spawnFairy',
        normal:   'spawnNormal',
    };
    function generateOrbPathPoints(sx, sy, ex, ey, kind) {
        const dx = ex - sx, dy = ey - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / (dist || 1);
        const perpY =  dx / (dist || 1);

        const lerp = (t) => ({ x: sx + dx * t, y: sy + dy * t });
        const pts = [];

        switch (kind) {
            case 'straight': {
                pts.push({ x: sx, y: sy }, { x: ex, y: ey });
                break;
            }
            case 'zigzag': {
                const zig = 60 + Math.random() * 40;
                for (let i = 0; i <= 6; i++) {
                    const t = i / 6;
                    const p = lerp(t);
                    const side = (i % 2 === 0 ? 1 : -1) * (i === 0 || i === 6 ? 0 : zig);
                    pts.push({ x: p.x + perpX * side, y: p.y + perpY * side });
                }
                break;
            }
            case 'arc_left':
            case 'arc_right': {
                const bulge = (100 + Math.random() * 60) * (kind === 'arc_left' ? -1 : 1);
                for (let i = 0; i <= 8; i++) {
                    const t = i / 8;
                    const p = lerp(t);
                    const bow = Math.sin(t * Math.PI) * bulge;
                    pts.push({ x: p.x + perpX * bow, y: p.y + perpY * bow });
                }
                break;
            }
            case 'spiral': {
                const turns = 1.5 + Math.random() * 0.5;
                const maxRadius = 70;
                for (let i = 0; i <= 14; i++) {
                    const t = i / 14;
                    const p = lerp(t);
                    const radius = maxRadius * (1 - t);
                    const angle = t * Math.PI * 2 * turns;
                    pts.push({
                        x: p.x + Math.cos(angle) * radius,
                        y: p.y + Math.sin(angle) * radius * 0.6
                    });
                }
                break;
            }
            case 'wave': {
                const amp = 50 + Math.random() * 30;
                for (let i = 0; i <= 10; i++) {
                    const t = i / 10;
                    const p = lerp(t);
                    const off = Math.sin(t * Math.PI * 3) * amp;
                    pts.push({ x: p.x + perpX * off, y: p.y + perpY * off });
                }
                break;
            }
        }
        return pts;
    }
    // Nội suy toạ độ trên đường bay (pathPts) tại 1 mốc t bất kỳ (0 → 1),
    // dùng cho việc lấy mẫu DÀY hơn số điểm gốc trong pathPts (để vẽ đuôi mượt).
    function pointAtT(pathPts, t) {
        const n = pathPts.length;
        if (n === 1) return pathPts[0];
        const scaled = t * (n - 1);
        const i = Math.min(Math.floor(scaled), n - 2);
        const localT = scaled - i;
        const a = pathPts[i], b = pathPts[i + 1];
        return { x: a.x + (b.x - a.x) * localT, y: a.y + (b.y - a.y) * localT };
    }
    const ORB_PATH_KINDS = ['straight', 'zigzag', 'arc_left', 'arc_right', 'spiral', 'wave'];
    const ORB_SHAPE_KINDS = ['orb']; // đã bỏ mũi tên (arrow) và cầu gai/răng cưa (spike), chỉ còn quả cầu tròn

    // Sinh clip-path hình cầu gai (nhím) — số cạnh nhọn tuỳ chỉnh qua "spikes"
    function buildSpikeBallClipPath(spikes = 10, outer = 50, inner = 26) {
        const points = [];
        const total = spikes * 2;
        for (let i = 0; i < total; i++) {
            const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
            const r = i % 2 === 0 ? outer : inner;
            const x = 50 + r * Math.cos(angle);
            const y = 50 + r * Math.sin(angle);
            points.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
        }
        return `polygon(${points.join(',')})`;
    }

    // Dựng hình ảnh bên trong theo shapeKind — container bên ngoài lo phần
    // translate/scale/rotate, hàm này chỉ trả về 1 div con full kích thước cfg
    function buildOrbShapeVisual(shapeKind, size, cfg) {
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:absolute; left:0; top:0; width:${size}px; height:${size}px;`;

        if (shapeKind === 'arrow') {
            wrap.innerHTML = `
                <div style="
                    position:absolute; left:50%; top:50%;
                    width:${size}px; height:${size * 0.32}px;
                    transform: translate(-50%,-50%);
                    background: linear-gradient(90deg, transparent 0%, ${cfg.mid} 25%, ${cfg.core} 60%, ${cfg.edge} 100%);
                    clip-path: polygon(0% 40%, 55% 40%, 55% 15%, 100% 50%, 55% 85%, 55% 60%, 0% 60%);
                    box-shadow: 0 0 ${size * 0.25}px ${cfg.glow};
                "></div>
            `;
        } else if (shapeKind === 'spike') {
            wrap.innerHTML = `
                <div style="
                    position:absolute; inset:0;
                    background: radial-gradient(circle, ${cfg.core} 0%, ${cfg.mid} 50%, ${cfg.edge} 100%);
                    clip-path: ${buildSpikeBallClipPath(10, 50, 26)};
                    box-shadow: 0 0 ${size * 0.3}px ${cfg.glow};
                "></div>
            `;
        } else {
            // orb (mặc định, giữ nguyên như trước)
            wrap.innerHTML = `
                <div style="
                    position:absolute; inset:0; border-radius:50%;
                    background: radial-gradient(circle, ${cfg.core} 0%, ${cfg.mid} 45%, ${cfg.edge} 100%);
                    box-shadow: 0 0 ${size * 0.3}px ${cfg.glow}, 0 0 ${size * 0.55}px ${cfg.glow};
                "></div>
            `;
        }
        return wrap;
    }

    function playLightSfx() {
        window.SoundEngine.whoosh(0.16, 0.12);
    }

    // ─────────────────────────────────────────────
    // CHUYỂN ĐỘNG GỒNG NHẸ TRƯỚC KHI RA CHIÊU (giữ nguyên, không đụng)
    // ─────────────────────────────────────────────
    async function playAttackerMotion_Projectile(attacker, scale) {
        const imgWrapper = attacker.querySelector('div');
        if (!imgWrapper) return;
        const s = scale || 1;
        const flip = parseFloat(attacker.dataset.flip) || 1;
        const half = (this.durationConfig.normal.motionOut * 0.5) || 100;

        imgWrapper.style.transition = 'transform 0.12s ease-in';
        imgWrapper.style.transform = `scale(${s * 0.9}) scaleX(${flip})`;
        await new Promise(r => setTimeout(r, half * 0.6));

        imgWrapper.style.transition = 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1)';
        imgWrapper.style.transform = `scale(${s * 1.08}) scaleX(${flip})`;
        await new Promise(r => setTimeout(r, half * 0.6));

        imgWrapper.style.transform = `scale(${s}) scaleX(${flip})`;
    }

    async function playAttackerMotion_Summon(attacker, scale) {
        const imgWrapper = attacker.querySelector('div');
        if (!imgWrapper) return;
        const s = scale || 1;
        const flip = parseFloat(attacker.dataset.flip) || 1;

        imgWrapper.style.transition = 'transform 0.1s ease-out';
        imgWrapper.style.transform = `scale(${s}) scaleX(${flip}) translateY(4px)`;
        await new Promise(r => setTimeout(r, 100));

        imgWrapper.style.transform = `scale(${s}) scaleX(${flip}) translateY(0px)`;
        await new Promise(r => setTimeout(r, 80));
    }

    // ─────────────────────────────────────────────
    // ĐÒN VẬT LÝ THUẦN (dự phòng, % nhỏ, giữ nguyên không đụng)
    // ─────────────────────────────────────────────
    async function executePhysicalAttack(attacker, target, damage) {
        const cfg = this.durationConfig.normal;
        const targetSide = target.id.startsWith('enemy') ? 'enemy' : 'player';
        const rectA = attacker.getBoundingClientRect();
        const rectT = target.getBoundingClientRect();
        const dx = rectT.left - rectA.left;
        const dy = rectT.top - rectA.top;
        const dist = targetSide === 'enemy' ? 50 : -50;
        const style = Math.floor(Math.random() * 3);

        if (style === 0) {
            attacker.style.transition = 'all 0.2s ease-in';
            attacker.style.transform = `translate(calc(-50% + ${dx - dist}px), calc(-50% + ${dy}px))`;
            await new Promise(r => setTimeout(r, 200));
            this.createDamageText(target, damage);
            target.classList.add('shake');
            attacker.style.transform = 'translate(-50%,-50%)';
            await new Promise(r => setTimeout(r, cfg.shake));
            target.classList.remove('shake');
            } else if (style === 1) {
                // 1. Lao hẳn lên áp sát ngay trước mặt kẻ địch (Giống y hệt Style 0)
                attacker.style.transition = 'all 0.2s ease-in';
                attacker.style.transform = `translate(calc(-50% + ${dx - dist}px), calc(-50% + ${dy}px))`;
                await new Promise(r => setTimeout(r, 200));

                // 2. Thực hiện 3 cú đấm/húc nhấp nhả liên hoàn ngay tại vị trí áp sát đó
                for (let i = 0; i < 3; i++) {
                    attacker.style.transition = 'all 0.08s ease-in';
                    // Nhích sâu thêm 15px vào người đối thủ để tạo cảm giác va chạm/đấm trúng thực tế
                    attacker.style.transform = `translate(calc(-50% + ${dx - dist + (dist > 0 ? 15 : -15)}px), calc(-50% + ${dy}px))`;
                    await new Promise(r => setTimeout(r, 80));

                    // Rút nhẹ về lại vị trí áp sát trước mặt
                    attacker.style.transform = `translate(calc(-50% + ${dx - dist}px), calc(-50% + ${dy}px))`;
                    await new Promise(r => setTimeout(r, 80));

                    if (i === 0) this.createDamageText(target, Math.floor(damage * 0.4));
                    if (i === 1) this.createDamageText(target, Math.floor(damage * 0.3));
                    if (i === 2) this.createDamageText(target, Math.floor(damage * 0.3));

                    target.classList.add('shake');
                    await new Promise(r => setTimeout(r, 100));
                    target.classList.remove('shake');
                    playLightSfx.call(this);
                }

                // 3. Kết thúc chuỗi đấm, rút hẳn về vị trí ban đầu
                attacker.style.transition = 'all 0.2s ease-out';
                attacker.style.transform = 'translate(-50%,-50%)';
                await new Promise(r => setTimeout(r, 200));
        } else {
            const r1 = dist * 1.5;
            attacker.style.transition = 'all 0.18s ease-in';
            attacker.style.transform = `translate(calc(-50% + ${dx + r1}px), calc(-50% + ${dy - 40}px))`;
            await new Promise(r => setTimeout(r, 180));

            attacker.style.transition = 'all 0.18s linear';
            attacker.style.transform = `translate(calc(-50% + ${dx - r1}px), calc(-50% + ${dy + 40}px))`;
            await new Promise(r => setTimeout(r, 180));

            attacker.style.transition = 'all 0.12s ease-in';
            attacker.style.transform = `translate(calc(-50% + ${dx - dist}px), calc(-50% + ${dy}px))`;
            await new Promise(r => setTimeout(r, 120));

            this.createDamageText(target, damage);
            target.classList.add('shake');
            playLightSfx.call(this);

            attacker.style.transition = 'all 0.2s ease-out';
            attacker.style.transform = 'translate(-50%,-50%)';
            await new Promise(r => setTimeout(r, cfg.shake));
            target.classList.remove('shake');
        }
        attacker.style.transition = '';
    }

    async function executeMissedNormal(attacker, target) {
        if (!attacker || !target) return;
        const targetSide = target.id.startsWith('enemy') ? 'enemy' : 'player';

        // random 1 trong 2 kiểu đánh hụt mỗi lần gọi
        const useTeleport = Math.random() < 0.5;

        if (useTeleport) {
            await missStyleTeleport.call(this, attacker, target, targetSide);
        } else {
            await missStyleRush.call(this, attacker, target, targetSide);
        }
    }

    // ═══════ KIỂU 1: LAO LÊN ĐÁNH TRỰC TIẾP (không teleport) ═══════
    async function missStyleRush(attacker, target, targetSide) {
        const rectA = attacker.getBoundingClientRect();
        const rectT = target.getBoundingClientRect();
        const dx = rectT.left - rectA.left;
        const dy = rectT.top - rectA.top;
        const dist = targetSide === 'enemy' ? 50 : -50;

        // 1. Lao hẳn lên áp sát ngay trước mặt kẻ địch
        attacker.style.transition = 'all 0.25s ease-in';
        attacker.style.transform = `translate(calc(-50% + ${dx - dist}px), calc(-50% + ${dy}px))`;
        await new Promise(r => setTimeout(r, 280));

        // 2. Combo 2-3 cú đấm/húc, mỗi cú cách nhau đủ lâu để nhìn rõ
        const hits = 2 + Math.floor(Math.random() * 2); // 2 hoặc 3 cú
        for (let i = 0; i < hits; i++) {
            attacker.style.transition = 'all 0.15s ease-in';
            attacker.style.transform = `translate(calc(-50% + ${dx - dist + (dist > 0 ? 18 : -18)}px), calc(-50% + ${dy}px))`;
            await new Promise(r => setTimeout(r, 160));

            attacker.style.transition = 'all 0.15s ease-out';
            attacker.style.transform = `translate(calc(-50% + ${dx - dist}px), calc(-50% + ${dy}px))`;
            await new Promise(r => setTimeout(r, 140));

            this.showStatusText(target, 'MISSED', '#feca57');
            target.classList.add('shake');
            playLightSfx.call(this);
            await new Promise(r => setTimeout(r, 220));
            target.classList.remove('shake');

            await new Promise(r => setTimeout(r, 150)); // nghỉ giữa các cú cho rõ nhịp
        }

        // 3. Rút hẳn về vị trí gốc
        attacker.style.transition = 'all 0.3s ease-out';
        attacker.style.transform = 'translate(-50%,-50%)';
        await new Promise(r => setTimeout(r, 320));
        attacker.style.transition = '';
    }

    // ═══════ KIỂU 2: TELEPORT CẢ 2 CON RA CHUNG 1 CHỖ HẸN RỒI ĐẤU ═══════
    // Vệt sáng "xé không gian" khi dịch chuyển tức thời — bắn ra quanh vị trí
    // HIỆN TẠI của 1 unit (gọi lúc vừa biến mất và lúc vừa hiện lại)
    function spawnTeleportStreaks(el) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const streakCount = 6 + Math.floor(Math.random() * 3); // 6-8 vệt

        for (let i = 0; i < streakCount; i++) {
            const angle = Math.random() * 360;
            const length = 40 + Math.random() * 50;
            const streak = document.createElement('div');
            streak.style.cssText = `
                position: fixed; left: ${cx}px; top: ${cy}px;
                width: 3px; height: ${length}px;
                background: linear-gradient(to bottom, transparent, #fff 40%, #7ff9ff 60%, transparent);
                box-shadow: 0 0 6px #fff, 0 0 12px #7ff9ff;
                transform: translate(-50%,-50%) rotate(${angle}deg) scaleY(0.2);
                opacity: 0.95;
                z-index: 10006; pointer-events: none;
            `;
            document.body.appendChild(streak);
            streak.animate([
                { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleY(0.2)`, opacity: 0.95 },
                { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleY(1.6)`, opacity: 0 }
            ], { duration: 180, easing: 'ease-out' }).onfinish = () => streak.remove();
        }
    }
    async function missStyleTeleport(attacker, target, targetSide) {
        const arenaEl = document.getElementById('battle-arena');
        const arenaRect = arenaEl
            ? arenaEl.getBoundingClientRect()
            : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

        // ĐO 1 LẦN DUY NHẤT lúc bắt đầu — mọi offset sau này đều tính dựa
        // trên rect GỐC này (không đo lại live giữa chừng), để mỗi lần ghi
        // đè transform luôn là toạ độ TUYỆT ĐỐI đúng, không bị trôi lệch
        // qua từng round.
        const rectA0 = attacker.getBoundingClientRect();
        const rectT0 = target.getBoundingClientRect();

        const rounds = 2 + Math.floor(Math.random() * 2); // 2 hoặc 3 lần teleport

        for (let round = 0; round < rounds; round++) {
            const meetX = arenaRect.left + arenaRect.width  * (0.3 + Math.random() * 0.4);
            const meetY = arenaRect.top  + arenaRect.height * (0.3 + Math.random() * 0.4);
            const gap = targetSide === 'enemy' ? 36 : -36;

            // Luôn tính từ rectA0/rectT0 GỐC — không phải rect live vừa đo lại
            const aDx = (meetX - gap) - (rectA0.left + rectA0.width / 2);
            const aDy = meetY - (rectA0.top + rectA0.height / 2);
            const tDx = (meetX + gap) - (rectT0.left + rectT0.width / 2);
            const tDy = meetY - (rectT0.top + rectT0.height / 2);

            spawnTeleportStreaks(attacker);
            spawnTeleportStreaks(target);

            attacker.style.transition = 'opacity 0.12s ease-out';
            target.style.transition   = 'opacity 0.12s ease-out';
            attacker.style.opacity = '0';
            target.style.opacity   = '0';
            await new Promise(r => setTimeout(r, 130));

            attacker.style.transition = 'none';
            target.style.transition   = 'none';
            attacker.style.transform  = `translate(calc(-50% + ${aDx}px), calc(-50% + ${aDy}px))`;
            target.style.transform    = `translate(calc(-50% + ${tDx}px), calc(-50% + ${tDy}px))`;
            void attacker.offsetWidth;

            attacker.style.transition = 'opacity 0.12s ease-in';
            target.style.transition   = 'opacity 0.12s ease-in';
            attacker.style.opacity = '1';
            target.style.opacity   = '1';
            spawnTeleportStreaks(attacker);
            spawnTeleportStreaks(target);
            await new Promise(r => setTimeout(r, 150));

            await new Promise(r => setTimeout(r, 200));

            // CHỈ 1 cú đánh hụt duy nhất — vẫn cộng thêm dist2() lên trên nền aDx/aDy vừa teleport tới
            attacker.style.transition = 'all 0.15s ease-in';
            attacker.style.transform = `translate(calc(-50% + ${aDx + dist2(targetSide)}px), calc(-50% + ${aDy}px))`;
            await new Promise(r => setTimeout(r, 160));

            attacker.style.transition = 'all 0.15s ease-out';
            attacker.style.transform = `translate(calc(-50% + ${aDx}px), calc(-50% + ${aDy}px))`;
            await new Promise(r => setTimeout(r, 140));

            this.showStatusText(target, 'MISSED', '#feca57');
            target.classList.add('shake');
            playLightSfx.call(this);
            await new Promise(r => setTimeout(r, 220));
            target.classList.remove('shake');

            await new Promise(r => setTimeout(r, 200));
        }

        // Hết các round mới teleport về ĐÚNG vị trí gốc — translate(-50%,-50%)
        // luôn đúng 100% vì đó chính là rect gốc (rectA0/rectT0) ban đầu.
        spawnTeleportStreaks(attacker);
        spawnTeleportStreaks(target);
        attacker.style.transition = 'opacity 0.12s ease-out';
        target.style.transition   = 'opacity 0.12s ease-out';
        attacker.style.opacity = '0';
        target.style.opacity   = '0';
        await new Promise(r => setTimeout(r, 130));

        attacker.style.transition = 'none';
        target.style.transition   = 'none';
        attacker.style.transform = 'translate(-50%,-50%)';
        target.style.transform   = 'translate(-50%,-50%)';
        void attacker.offsetWidth;

        attacker.style.transition = 'opacity 0.2s ease-in';
        target.style.transition   = 'opacity 0.2s ease-in';
        attacker.style.opacity = '1';
        target.style.opacity   = '1';
        spawnTeleportStreaks(attacker);
        spawnTeleportStreaks(target);
        await new Promise(r => setTimeout(r, 220));

        attacker.style.transition = '';
        target.style.transition = '';
        attacker.style.opacity = '';
        target.style.opacity = '';
    }

    function dist2(targetSide) {
        return targetSide === 'enemy' ? 18 : -18;
    }


    // ═══════════════════════════════════════════════════════════
    // 🔽🔽🔽 VÙNG DÁN 18 HỆ — object literal, dán NGUYÊN VĂN các
    // hàm spawnXxx (+ hàm phụ nó gọi tới) từ file pkm_skill.js GỐC
    // vào đây. Giữ đúng cú pháp method-shorthand + dấu phẩy ngăn
    // cách giữa các hàm. KHÔNG thêm chữ "function" phía trước tên hàm.
    // ═══════════════════════════════════════════════════════════
    
    const coreSkills = {

        // ---------- HỆ LỬA (đã dán sẵn làm mẫu, chạy được ngay) ----------
        async spawnFire(startEl, endEl, count, scale, data) {
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();

            const totalAvailableTime = 2000;
            const interval = count > 1 ? Math.min(200, totalAvailableTime / count) : 0;

            for (let i = 0; i < count; i++) {
                this.executeSingleFireball(rectS, rectE, scale, i * interval);
            }

            await new Promise(r => setTimeout(r, 2500));
        },

        async executeSingleFireball(rectS, rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const fireball = document.createElement('div');
            fireball.className = 'pkm-particle particle-fire';
            fireball.style.cssText = `
                position: fixed;
                left: ${rectS.left + rectS.width / 2}px;
                top: ${rectS.top + rectS.height / 2}px;
                width: ${22 * scale}px; height: ${22 * scale}px;
                background: radial-gradient(circle, #fff 10%, #ffdf00 40%, #e67e22 80%, #c0392b 100%);
                box-shadow: 0 0 ${15 * scale}px #e67e22, 0 0 ${30 * scale}px #f39c12;
                border-radius: 50%; z-index: 9999; pointer-events: none;
            `;
            document.body.appendChild(fireball);

            const sparkTimer = setInterval(() => {
                const spark = document.createElement('div');
                const fRect = fireball.getBoundingClientRect();
                spark.style.cssText = `
                    position: fixed; left: ${fRect.left + fRect.width / 2}px; top: ${fRect.top + fRect.height / 2}px;
                    width: ${6 * scale}px; height: ${6 * scale}px; background: #ff4d00;
                    border-radius: 50%; opacity: 0.9; z-index: 9998;
                `;
                document.body.appendChild(spark);
                spark.animate([{ opacity: 0.9 }, { transform: `translate(${(Math.random() - 0.5) * 40}px,40px)`, opacity: 0 }], 400).onfinish = () => spark.remove();
            }, 40);

            const targetX = rectE.left + rectE.width / 2 + (Math.random() - 0.5) * 60;
            const targetY = rectE.top + rectE.height / 2 + (Math.random() - 0.5) * 60;

            await fireball.animate([
                { left: fireball.style.left, top: fireball.style.top },
                { left: `${targetX}px`, top: `${targetY}px` }
            ], { duration: 600, easing: 'ease-in' }).finished;

            clearInterval(sparkTimer);
            this.createFireExplosion(targetX, targetY, scale);
            fireball.remove();
            if (this.playRandomSfx) this.playRandomSfx();
        },

        createFireExplosion(x, y, scale) {
            for (let i = 0; i < 8; i++) {
                const burst = document.createElement('div');
                const angle = (i / 8) * 360;
                burst.style.cssText = `
                    position: fixed; left: ${x}px; top: ${y}px;
                    width: ${30 * scale}px; height: 2px; background: #f1c40f;
                    transform: rotate(${angle}deg); transform-origin: 0 50%;
                    z-index: 9999; pointer-events: none;
                `;
                document.body.appendChild(burst);
                burst.animate([{ opacity: 1, width: '0px' }, { opacity: 0, width: `${50 * scale}px` }], 300)
                    .onfinish = () => burst.remove();
            }
        },

        // 🔽🔽 DÁN TIẾP 17 HỆ CÒN LẠI VÀO ĐÂY (electric, water, grass,
        // ice, poison, ground, flying, psychic, fighting, ghost, bug,
        // rock, dark, steel, dragon, fairy, normal) — nhớ dấu phẩy
        // ngăn cách sau hàm cuối cùng ở trên (createFireExplosion) 🔽🔽
        // --- HỆ NƯỚC (WATER) ---
        async spawnWater(startEl, endEl, count, scale, data) {
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();

            // Tính toán để tất cả bong bóng phun ra trong vòng 1.5s, 1s còn lại để nước tan
            const totalLaunchTime = 1500;
            const interval = count > 1 ? totalLaunchTime / count : 0;

            for (let i = 0; i < count; i++) {
                this.executeSingleBubble(rectS, rectE, scale, i * interval);
            }

            // Chờ đúng 2.5s như chốt chặn
            await new Promise(r => setTimeout(r, 2500));
        },

        async executeSingleBubble(rectS, rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const bubble = document.createElement('div');
            bubble.className = 'pkm-particle particle-water';

            // Style bong bóng: Trong suốt, có vệt sáng trắng (highlight) tạo độ bóng
            bubble.style.cssText = `
                position: fixed;
                left: ${rectS.left + rectS.width / 2}px;
                top: ${rectS.top + rectS.height / 2}px;
                width: ${18 * scale}px;
                height: ${18 * scale}px;
                background: rgba(52, 152, 219, 0.4);
                border: 1px solid rgba(255, 255, 255, 0.6);
                box-shadow: inset -3px -3px 8px rgba(0,0,0,0.2), inset 3px 3px 8px rgba(255,255,255,0.8);
                border-radius: 50%;
                z-index: 9999;
                pointer-events: none;
            `;
            document.body.appendChild(bubble);

            // Tạo một điểm sáng nhỏ bên trong bong bóng cho đẹp
            const highlight = document.createElement('div');
            highlight.style.cssText = `
                position: absolute; top: 20%; left: 20%; width: 30%; height: 30%;
                background: white; border-radius: 50%; opacity: 0.6;
            `;
            bubble.appendChild(highlight);

            const targetX = rectE.left + rectE.width / 2 + (Math.random() - 0.5) * 50;
            const targetY = rectE.top + rectE.height / 2 + (Math.random() - 0.5) * 50;

            // Quỹ đạo bay cong (Arc) bằng cách dùng CSS Keyframes ẩn hoặc animate trung gian
            const midX = (rectS.left + targetX) / 2;
            const midY = Math.min(rectS.top, targetY) - 100; // Bay vồng lên trên

            await bubble.animate([
                { left: bubble.style.left, top: bubble.style.top, transform: 'scale(1)' },
                { left: `${midX}px`, top: `${midY}px`, transform: 'scale(1.2)' },
                { left: `${targetX}px`, top: `${targetY}px`, transform: 'scale(1)' }
            ], {
                duration: 700,
                easing: 'ease-out'
            }).finished;

            // Khi chạm mục tiêu: Bong bóng vỡ thành các giọt nước nhỏ rơi xuống
            this.createWaterSplash(targetX, targetY, scale);
            bubble.remove();

            if (this.playRandomSfx) this.playRandomSfx();
        },

        // Hiệu ứng nước bắn tung tóe
        createWaterSplash(x, y, scale) {
            for (let i = 0; i < 8; i++) {
                const drop = document.createElement('div');
                const angle = (i / 8) * Math.PI * 2;
                const velocity = (30 + Math.random() * 30) * scale;

                drop.style.cssText = `
                    position: fixed; left: ${x}px; top: ${y}px;
                    width: ${5 * scale}px; height: ${5 * scale}px;
                    background: #3498db; border-radius: 50%; opacity: 0.8; z-index: 10000;
                `;
                document.body.appendChild(drop);

                drop.animate([
                    { transform: 'translate(0, 0)', opacity: 0.8 },
                    { transform: `translate(${Math.cos(angle) * velocity}px, ${Math.sin(angle) * velocity + 20}px)`, opacity: 0 }
                ], { duration: 400, easing: 'ease-in' }).onfinish = () => drop.remove();
            }
        },

        // --- HỆ BĂNG (ICE) ---
        async spawnIce(startEl, endEl, count, scale, data) {
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();

            // Phân bổ thời gian bắn các tinh thể băng trong 1.8s
            const totalLaunchTime = 1800;
            const interval = count > 1 ? totalLaunchTime / count : 0;

            for (let i = 0; i < count; i++) {
                this.executeSingleIceCrystal(rectS, rectE, scale, i * interval);
            }

            // Chốt chặn 2.5s đồng bộ toàn hệ thống
            await new Promise(r => setTimeout(r, 2500));
        },

        async executeSingleIceCrystal(rectS, rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const ice = document.createElement('div');
            ice.className = 'pkm-particle particle-ice';

            // Tạo hình bông tuyết/tinh thể bằng clip-path hoặc dùng ký tự đặc biệt
            // Ở đây dùng CSS để tạo khối kim cương sắc cạnh, màu xanh trắng buốt
            ice.style.cssText = `
                position: fixed;
                left: ${rectS.left + rectS.width / 2}px;
                top: ${rectS.top + rectS.height / 2}px;
                width: ${30 * scale}px;
                height: ${40 * scale}px;
                background: linear-gradient(135deg, #ffffff 0%, #74b9ff 50%, #a29bfe 100%);
                clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
                box-shadow: 0 0 ${10 * scale}px #fff;
                z-index: 9999;
                pointer-events: none;
                opacity: 0.9;
            `;
            document.body.appendChild(ice);

            const targetX = rectE.left + rectE.width / 2 + (Math.random() - 0.5) * 40;
            const targetY = rectE.top + rectE.height / 2 + (Math.random() - 0.5) * 40;

            // Băng bay thẳng và xoay tròn cực nhanh tạo cảm giác sắc lẹm
            await ice.animate([
                { left: ice.style.left, top: ice.style.top, transform: 'rotate(0deg) scale(1)' },
                { left: `${targetX}px`, top: `${targetY}px`, transform: `rotate(${360 * 2}deg) scale(1.2)` }
            ], {
                duration: 500,
                easing: 'ease-in'
            }).finished;

            // Khi chạm mục tiêu: Vỡ vụn thành các mảnh băng nhỏ (Shards)
            this.createIceShards(targetX, targetY, scale);
            ice.remove();

            if (this.playRandomSfx) this.playRandomSfx();
        },

        // Hiệu ứng vỡ vụn của băng
        createIceShards(x, y, scale) {
            for (let i = 0; i < 10; i++) {
                const shard = document.createElement('div');
                const angle = (i / 10) * Math.PI * 2;
                const dist = (30 + Math.random() * 20) * scale;

                shard.style.cssText = `
                    position: fixed; left: ${x}px; top: ${y}px;
                    width: ${4 * scale}px; height: ${4 * scale}px;
                    background: #fff; clip-path: polygon(20% 0%, 100% 40%, 70% 100%, 0% 80%);
                    opacity: 0.8; z-index: 10000;
                `;
                document.body.appendChild(shard);

                shard.animate([
                    { transform: 'translate(0, 0) rotate(0deg)', opacity: 0.8 },
                    { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) rotate(180deg)`, opacity: 0 }
                ], { duration: 400, easing: 'ease-out' }).onfinish = () => shard.remove();
            }
        },

        // --- HỆ ĐỘC (POISON) - PHUN MẢNG ĐỘC ---
        async spawnPoison(startEl, endEl, count, scale, data) {
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();

            // Phun toàn bộ mảng độc trong 1.5s để dành thời gian cho hiệu ứng loang nổ
            const totalLaunchTime = 1500;
            const interval = count > 1 ? totalLaunchTime / count : 0;

            for (let i = 0; i < count; i++) {
                this.executeSinglePoisonGunk(rectS, rectE, scale, i * interval);
            }

            await new Promise(r => setTimeout(r, 2500));
        },

        async executeSinglePoisonGunk(rectS, rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const gunk = document.createElement('div');
            gunk.className = 'pkm-particle particle-poison-gunk';

            // Style mảng độc: Hình dạng kéo dài (oblong), màu tím tối, bề mặt như bùn
            gunk.style.cssText = `
                position: fixed;
                left: ${rectS.left + rectS.width / 2}px;
                top: ${rectS.top + rectS.height / 2}px;
                width: ${40 * scale}px; 
                height: ${20 * scale}px;
                background: #4a235a;
                border-radius: 30% 70% 40% 60% / 50%; /* Hình dạng mảng bùn méo mó */
                box-shadow: inset -5px -5px 10px #2e1537, 0 0 ${10 * scale}px #8e44ad;
                z-index: 9999;
                pointer-events: none;
                filter: blur(0.5px);
            `;
            document.body.appendChild(gunk);

            const targetX = rectE.left + rectE.width / 2 + (Math.random() - 0.5) * 40;
            const targetY = rectE.top + rectE.height / 2 + (Math.random() - 0.5) * 40;

            // Quỹ đạo bay zigzag hiểm hóc
            const keyframes = [
                { left: gunk.style.left, top: gunk.style.top, transform: 'rotate(0deg) scaleX(1)' },
                { 
                    left: `${(rectS.left + targetX) / 2 + 50}px`, 
                    top: `${(rectS.top + targetY) / 2 - 20}px`, 
                    transform: 'rotate(15deg) scaleX(1.5)' // Kéo dài ra khi bay
                },
                { 
                    left: `${targetX}px`, 
                    top: `${targetY}px`, 
                    transform: 'rotate(-10deg) scaleX(1.2)' 
                }
            ];

            await gunk.animate(keyframes, {
                duration: 600,
                easing: 'ease-in'
            }).finished;

            // Khi chạm mục tiêu: Loang ra thành vũng độc
            this.createPoisonSplat(targetX, targetY, scale);
            gunk.remove();

            if (this.playRandomSfx) this.playRandomSfx();
        },

        // Hiệu ứng vũng độc loang lổ (Splat)
        createPoisonSplat(x, y, scale) {
            for (let i = 0; i < 5; i++) {
                const splat = document.createElement('div');
                const offX = (Math.random() - 0.5) * 60 * scale;
                const offY = (Math.random() - 0.5) * 60 * scale;
                const size = (20 + Math.random() * 30) * scale;

                splat.style.cssText = `
                    position: fixed; 
                    left: ${x + offX}px; 
                    top: ${y + offY}px;
                    width: ${size}px; height: ${size}px;
                    background: #8e44ad;
                    border-radius: 40% 60% 30% 70%;
                    opacity: 0.7;
                    filter: blur(5px);
                    z-index: 9998;
                    pointer-events: none;
                `;
                document.body.appendChild(splat);

                splat.animate([
                    { transform: 'scale(0.5)', opacity: 0.7 },
                    { transform: 'scale(1.5)', opacity: 0 }
                ], { duration: 800, easing: 'ease-out' }).onfinish = () => splat.remove();
            }
        },

        // --- HỆ ĐÁ (ROCK) - MỌC LÊN TỪ DƯỚI ĐẤT ---
        async spawnRock(startEl, endEl, count, scale, data) {
            const rectE = endEl.getBoundingClientRect();

            // Phân bổ thời gian mọc đá dồn dập trong 1.8s
            const totalDuration = 1800;
            const interval = count > 1 ? totalDuration / count : 0;

            for (let i = 0; i < count; i++) {
                this.executeSingleRockRise(rectE, scale, i * interval);
            }

            // Chốt chặn 2.5s đồng bộ
            await new Promise(r => setTimeout(r, 2500));
        },

        async executeSingleRockRise(rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const rock = document.createElement('div');
            rock.className = 'pkm-particle particle-rock';

            // Vị trí ngẫu nhiên quanh chân đối thủ
            const offsetX = (Math.random() - 0.5) * 80 * scale;
            const offsetY = (Math.random() - 0.5) * 40 * scale;

            // Style khối đá: Thô ráp, màu xám nâu, hình đa giác sắc cạnh
            rock.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2 + offsetX}px;
                top: ${rectE.top + rectE.height - 20 + offsetY}px;
                width: ${35 * scale}px;
                height: ${35 * scale}px;
                background: #7f8c8d;
                clip-path: polygon(20% 0%, 80% 10%, 100% 50%, 70% 90%, 20% 100%, 0% 50%);
                background-image: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 50%, #2c3e50 100%);
                box-shadow: inset 2px 2px 5px rgba(255,255,255,0.2);
                z-index: 10001;
                pointer-events: none;
                transform: translateY(100px) scale(0); /* Xuất phát từ dưới đất */
            `;
            document.body.appendChild(rock);

            // Hiệu ứng mọc lên (vút lên rồi khựng lại)
            await rock.animate([
                { transform: 'translateY(100px) scale(0) rotate(0deg)', opacity: 0 },
                { transform: 'translateY(-20px) scale(1.2) rotate(15deg)', opacity: 1, offset: 0.7 },
                { transform: 'translateY(0) scale(1) rotate(0deg)', opacity: 1 }
            ], {
                duration: 400,
                easing: 'ease-out'
            }).finished;

            // Rung màn hình nhẹ khi đá mọc lên
            if (this.playRandomSfx) this.playRandomSfx();

            // Sau khi mọc lên, đá sẽ vỡ vụn sau một khoảng ngắn
            setTimeout(() => {
                this.createRockDebris(rectE.left + rectE.width / 2 + offsetX, rectE.top + rectE.height / 2 + offsetY, scale);
                rock.remove();
            }, 300);
        },

        // Hiệu ứng mảnh vỡ và bụi đất
        createRockDebris(x, y, scale) {
            for (let i = 0; i < 8; i++) {
                const debris = document.createElement('div');
                const angle = Math.random() * Math.PI * 2;
                const dist = (40 + Math.random() * 40) * scale;

                debris.style.cssText = `
                    position: fixed; left: ${x}px; top: ${y}px;
                    width: ${10 * scale}px; height: ${10 * scale}px;
                    background: #5d6d7e;
                    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
                    opacity: 0.8; z-index: 10000;
                `;
                document.body.appendChild(debris);

                debris.animate([
                    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                    { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) rotate(180deg)`, opacity: 0 }
                ], { duration: 500, easing: 'ease-out' }).onfinish = () => debris.remove();
            }
        },

        // --- HỆ BAY (FLYING) - CẬP NHẬT MÀU ĐẬM RÕ NÉT ---
        async spawnFlying(startEl, endEl, count, scale, data) {
            const rectE = endEl.getBoundingClientRect();

            // Thời gian xả chiêu gói gọn trong 1.8s
            const totalDuration = 1800;
            const interval = count > 1 ? totalDuration / count : 0;

            for (let i = 0; i < count; i++) {
                this.executeSingleAirSlash(rectE, scale, i * interval);
            }

            // Chốt chặn 2.5s đồng bộ
            await new Promise(r => setTimeout(r, 2500));
        },

        async executeSingleAirSlash(rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const slash = document.createElement('div');
            slash.className = 'pkm-particle particle-flying';

            // Xuất phát từ trên cao, lệch ngẫu nhiên
            const startTop = -100;
            const startLeft = rectE.left + rectE.width/2 + (Math.random() - 0.5) * 500;

            // STYLE CẬP NHẬT: Màu đậm hơn, rõ nét hơn
            slash.style.cssText = `
                position: fixed;
                left: ${startLeft}px;
                top: ${startTop}px;
                width: ${80 * scale}px; /* Tăng chiều dài một chút */
                height: ${15 * scale}px; /* Tăng độ dày một chút */
                /* Sử dụng màu xanh tím đậm hệ bay */
                background: linear-gradient(to right, transparent, #a890f0 20%, #fff 50%, #a890f0 80%, transparent);
                border-radius: 50%;
                /* Tăng độ sáng của glow */
                box-shadow: 0 0 ${20 * scale}px #a890f0, 0 0 ${10 * scale}px #fff;
                z-index: 10001;
                pointer-events: none;
                /* Tính góc chém hướng về mục tiêu */
                transform: rotate(${this.calcAngleToTarget(startLeft, startTop, rectE.left + rectE.width/2, rectE.top + rectE.height/2)}deg);
                /* Giảm blur để nhìn rõ nét hơn */
                filter: blur(0.5px);
                opacity: 0;
            `;
            document.body.appendChild(slash);

            const targetX = rectE.left + rectE.width / 2 + (Math.random() - 0.5) * 80;
            const targetY = rectE.top + rectE.height / 2 + (Math.random() - 0.5) * 80;

            // Chém xuống cực nhanh (300ms)
            await slash.animate([
                { left: `${startLeft}px`, top: `${startTop}px`, opacity: 0 },
                { opacity: 1, offset: 0.1 }, // Hiện ra nhanh
                { opacity: 1, offset: 0.8 }, // Giữ nguyên độ đậm khi bay
                { left: `${targetX}px`, top: `${targetY}px`, opacity: 0 } // Biến mất khi chạm
            ], {
                duration: 300,
                easing: 'linear' // Bay đều tốc độ
            }).finished;

            this.createWindImpact(targetX, targetY, scale);
            slash.remove();

            if (this.playRandomSfx) this.playRandomSfx();
        },

        // Hiệu ứng va chạm của gió (Cũng làm màu xanh tím cho đồng bộ)
        createWindImpact(x, y, scale) {
            for (let i = 0; i < 4; i++) {
                const wind = document.createElement('div');
                wind.style.cssText = `
                    position: fixed; left: ${x}px; top: ${y}px;
                    width: ${50 * scale}px; height: ${10 * scale}px;
                    border: 3px solid #a890f0;
                    border-radius: 50%;
                    z-index: 10000;
                    pointer-events: none;
                    filter: blur(1px);
                `;
                document.body.appendChild(wind);

                wind.animate([
                    { transform: 'translate(-50%, -50%) rotate(0deg) scale(0.5)', opacity: 0.8 },
                    { transform: `translate(-50%, -50%) rotate(${Math.random() * 360}deg) scale(2)`, opacity: 0 }
                ], { duration: 400, easing: 'ease-out' }).onfinish = () => wind.remove();
            }
        },

        // Hàm helper tính góc xoay để lưỡi gió luôn hướng đầu về mục tiêu
        calcAngleToTarget(x1, y1, x2, y2) {
            return Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        },

        // --- HỆ TÂM LINH (PSYCHIC) - BIẾN DẠNG KHÔNG GIAN ---
        async spawnPsychic(startEl, endEl, count, scale, data) {
            const rectE = endEl.getBoundingClientRect();

            // Hệ Tâm Linh thường diễn ra đồng thời hoặc dồn dập
            const totalDuration = 1800;
            const interval = count > 1 ? totalDuration / count : 0;

            for (let i = 0; i < count; i++) {
                this.executeSinglePsychicWave(rectE, scale, i * interval);
            }

            await new Promise(r => setTimeout(r, 2500));
        },

        async executeSinglePsychicWave(rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            // 1. Tạo hiệu ứng Biến dạng không gian (Distortion)
            const distortion = document.createElement('div');
            distortion.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2}px;
                top: ${rectE.top + rectE.height / 2}px;
                width: ${120 * scale}px;
                height: ${120 * scale}px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 50%;
                z-index: 9998;
                pointer-events: none;
                transform: translate(-50%, -50%) scale(0);
                /* Hiệu ứng bẻ cong không gian quan trọng nhất ở đây */
                backdrop-filter: blur(5px) hue-rotate(90deg);
                -webkit-backdrop-filter: blur(5px) hue-rotate(90deg);
                border: 2px solid rgba(248, 88, 136, 0.3);
            `;
            document.body.appendChild(distortion);

            // 2. Tạo vòng tròn năng lượng co thắt (Shrinking Ring)
            const ring = document.createElement('div');
            ring.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2}px;
                top: ${rectE.top + rectE.height / 2}px;
                width: ${200 * scale}px;
                height: ${200 * scale}px;
                border: ${4 * scale}px solid #f85888;
                box-shadow: 0 0 20px #f85888, inset 0 0 20px #f85888;
                border-radius: 50%;
                z-index: 10001;
                pointer-events: none;
                transform: translate(-50%, -50%) scale(1);
                opacity: 0;
            `;
            document.body.appendChild(ring);

            // Chạy hiệu ứng biến dạng (phình ra rồi mất)
            distortion.animate([
                { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
                { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%, -50%) scale(2)', opacity: 0 }
            ], { duration: 1000, easing: 'ease-out' }).onfinish = () => distortion.remove();

            // Chạy hiệu ứng vòng tròn co thắt
            await ring.animate([
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
                { transform: 'translate(-50%, -50%) scale(0.8)', opacity: 1, offset: 0.2 },
                { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 }
            ], {
                duration: 800,
                easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }).finished;

            ring.remove();
            if (this.playRandomSfx) this.playRandomSfx();
        },

        // --- HỆ THÉP (STEEL) 2.0 - VẠN KIẾM QUY TÔNG ---
        async spawnSteel(startEl, endEl, count, scale, data) {
            const rectE = endEl.getBoundingClientRect();

            // Phân bổ thời gian rơi dồn dập
            const totalDuration = 1800;
            const interval = count > 1 ? totalDuration / count : 0;

            for (let i = 0; i < count; i++) {
                this.executeSteelHeavyBlade(rectE, scale, i * interval);
            }

            await new Promise(r => setTimeout(r, 2500));
        },

        async executeSteelHeavyBlade(rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const blade = document.createElement('div');
            // Tạo cấu trúc lưỡi kiếm sắc bén hơn
            blade.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2 + (Math.random() - 0.5) * 120 * scale}px;
                top: -250px;
                width: ${12 * scale}px;
                height: ${80 * scale}px;
                background: linear-gradient(90deg, #7f8c8d 0%, #ecf0f1 45%, #ffffff 50%, #ecf0f1 55%, #7f8c8d 100%);
                z-index: 10001;
                pointer-events: none;
                clip-path: polygon(50% 100%, 100% 85%, 100% 0%, 0% 0%, 0% 85%);
                box-shadow: 0 0 ${15 * scale}px rgba(255,255,255,0.8);
                filter: drop-shadow(2px 4px 6px rgba(0,0,0,0.4));
            `;
            document.body.appendChild(blade);

            // Hiệu ứng lóe sáng (Gleam) chạy dọc lưỡi kiếm
            const gleam = document.createElement('div');
            gleam.style.cssText = `
                position: absolute; top: 0; left: 0; width: 100%; height: 20%;
                background: rgba(255,255,255,0.8); filter: blur(4px);
            `;
            blade.appendChild(gleam);
            gleam.animate([{top: '0%'}, {top: '100%'}], {duration: 300, iterations: Infinity});

            const landY = rectE.top + rectE.height / 2 + (Math.random() - 0.5) * 40;

            // Rơi cực nhanh và cắm phập xuống
            await blade.animate([
                { transform: 'translateY(0) scaleY(1.5)', opacity: 0 },
                { transform: `translateY(${landY + 250}px) scaleY(1)`, opacity: 1 }
            ], {
                duration: 350,
                easing: 'cubic-bezier(0.6, 0.04, 0.98, 0.33)'
            }).finished;

            // Rung màn hình và tóe lửa
            this.createSteelHeavySparks(parseFloat(blade.style.left), landY, scale);

            // Hiệu ứng phản lực (nảy nhẹ khi cắm xuống đất)
            blade.animate([
                { transform: `translateY(${landY + 250}px) scaleY(1)` },
                { transform: `translateY(${landY + 245}px) scaleY(0.95)` },
                { transform: `translateY(${landY + 250}px) scaleY(1)` }
            ], { duration: 100 });

            // Biến mất sau khi cắm lại một lát
            setTimeout(() => {
                blade.animate([{opacity: 1}, {opacity: 0}], {duration: 200}).onfinish = () => blade.remove();
            }, 500);

            if (this.playRandomSfx) this.playRandomSfx();
        },

        createSteelHeavySparks(x, y, scale) {
            for (let i = 0; i < 10; i++) {
                const s = document.createElement('div');
                const angle = Math.random() * Math.PI * 2;
                const dist = (50 + Math.random() * 30) * scale;
                s.style.cssText = `
                    position: fixed; left: ${x}px; top: ${y}px;
                    width: ${3 * scale}px; height: ${15 * scale}px;
                    background: #f1c40f; z-index: 10002;
                    transform: rotate(${angle}rad);
                `;
                document.body.appendChild(s);
                s.animate([
                    { transform: `rotate(${angle}rad) translateY(0) scaleY(1)`, opacity: 1 },
                    { transform: `rotate(${angle}rad) translateY(-${dist}px) scaleY(0)`, opacity: 0 }
                ], { duration: 400, easing: 'ease-out' }).onfinish = () => s.remove();
            }
        },

        // --- HỆ CỎ (GRASS) - TỐI ƯU MOBILE: TO RÕ, MƯỢT MÀ ---
        async spawnGrass(startEl, endEl, count, scale, data) {
            const rectE = endEl.getBoundingClientRect();

            // Không nhân đôi count nữa để tránh lag trên mobile
            const leafCount = count;
            // Giảm tổng thời gian một chút để hiệu ứng diễn ra dồn dập, dứt khoát
            const totalDuration = 1500; 
            const interval = totalDuration / leafCount;

            for (let i = 0; i < leafCount; i++) {
                this.executeMobileRazorLeaf(rectE, scale, i * interval, i);
            }

            // Chốt chặn 2.5s đồng bộ
            await new Promise(r => setTimeout(r, 2500));
        },

        async executeMobileRazorLeaf(rectE, scale, delay, index) {
            await new Promise(r => setTimeout(r, delay));

            const leaf = document.createElement('div');
            // className giúp bạn dễ dàng debug hoặc thêm CSS style nếu cần
            leaf.className = 'pkm-particle particle-grass-leaf-mobile';

            // KÍCH THƯỚC TO GẤP ĐÔI (ví dụ: 18x10 lên 36x20)
            leaf.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2}px;
                top: ${rectE.top + rectE.height / 2}px;
                width: ${36 * scale}px; 
                height: ${20 * scale}px;
                background: linear-gradient(135deg, #2ecc71, #27ae60);
                /* Hình dáng chiếc lá nhọn, sắc bén */
                border-radius: 80% 10% 80% 10%;
                border: ${1 * scale}px solid #145a32;
                z-index: 10002;
                pointer-events: none;
                /* Thêm drop-shadow mạnh để nổi bật trên nền battle */
                filter: drop-shadow(0 0 ${4 * scale}px rgba(0,0,0,0.5));
                opacity: 0;
                /* Bỏ transform-style: preserve-3d để tối ưu performance */
            `;
            document.body.appendChild(leaf);

            // Tham số quỹ đạo đơn giản hóa (2D Vortex)
            // Bán kính xoáy rộng hơn để không bị rối mắt
            const radius = (80 + Math.random() * 60) * scale; 
            const angleStart = Math.random() * Math.PI * 2;
            const rotateSpeed = 2 + Math.random() * 1; // Xoay nhanh hơn

            // Hiệu ứng bão lá xoáy tròn đơn giản (Tối ưu GPU)
            await leaf.animate([
                { 
                    transform: `rotate(${angleStart}rad) translateX(${radius * 1.5}px) scale(0)`, 
                    opacity: 0 
                },
                { opacity: 1, offset: 0.1 },
                { 
                    // Xoay 1 vòng, bay vào tâm, không xoay 3D lật mặt
                    transform: `rotate(${angleStart + Math.PI * 2 * rotateSpeed}rad) translateX(${radius * 0.5}px) scale(1.1)`, 
                    opacity: 1,
                    offset: 0.8
                },
                { 
                    transform: `rotate(${angleStart + Math.PI * 2.5 * rotateSpeed}rad) translateX(${radius}px) scale(0)`, 
                    opacity: 0 
                }
            ], {
                // Giảm duration để lá bay nhanh, dứt khoát, giảm thời gian render
                duration: 800 + Math.random() * 200, 
                easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' // Out-back nhẹ
            }).finished;

            leaf.remove();

            // Chỉ chơi âm thanh cho một số lá để không bị ồn, tiết kiệm CPU
            if (index % 5 === 0 && this.playRandomSfx) this.playRandomSfx();
        },

        // --- HỆ ĐẤT (GROUND) - TẬP TRUNG HIỆU ỨNG VẬT LÝ ---
        async spawnGround(startEl, endEl, count, scale, data) {
            const rectE = endEl.getBoundingClientRect();

            // 1. Tạo các vết nứt mặt đất (Cracks)
            // Số lượng vết nứt tỷ lệ thuận với Gen
            const crackCount = Math.min(3, Math.ceil(count / 2));
            for (let i = 0; i < crackCount; i++) {
                this.executeGroundCrack(rectE, scale, i * 300);
            }

            // 2. Phun bùn đất (Mud/Dust particles)
            const totalDuration = 1500;
            const interval = totalDuration / count;
            for (let i = 0; i < count; i++) {
                this.executeMudEruption(rectE, scale, i * interval);
            }

            await new Promise(r => setTimeout(r, 2500));
        },

        // Hiệu ứng nứt đất (Tối ưu hóa hiển thị)
        async executeGroundCrack(rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const crack = document.createElement('div');
            const width = (100 + Math.random() * 50) * scale; // Tăng size nhẹ để nhìn rõ hơn

            crack.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2}px;
                top: ${rectE.top + rectE.height - 5}px;
                width: ${width}px;
                height: ${12 * scale}px;
                background: #4e342e;
                /* Hình dạng nứt vỡ răng cưa */
                clip-path: polygon(0% 50%, 15% 0%, 35% 70%, 50% 20%, 65% 80%, 85% 10%, 100% 50%, 90% 95%, 50% 100%, 10% 90%);
                z-index: 9997;
                pointer-events: none;
                transform: translate(-50%, 0) scaleX(0);
                opacity: 0.9;
            `;
            document.body.appendChild(crack);

            await crack.animate([
                { transform: 'translate(-50%, 0) scaleX(0)', opacity: 0.9 },
                { transform: 'translate(-50%, 0) scaleX(1.1)', opacity: 1, offset: 0.2 },
                { transform: 'translate(-50%, 0) scaleX(1)', opacity: 0 }
            ], { 
                duration: 1800, 
                easing: 'ease-out' 
            }).finished;

            crack.remove();
        },

        // Hiệu ứng phun bùn đất (Đã bỏ rung lẻ)
        async executeMudEruption(rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const mud = document.createElement('div');
            const size = (30 + Math.random() * 20) * scale; 

            mud.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2 + (Math.random() - 0.5) * 80 * scale}px;
                top: ${rectE.top + rectE.height}px;
                width: ${size}px;
                height: ${size}px;
                background: #6d4c41;
                clip-path: polygon(25% 5%, 75% 0%, 100% 45%, 85% 95%, 20% 100%, 0% 55%);
                box-shadow: inset -5px -5px 12px rgba(0,0,0,0.6);
                z-index: 10002;
                pointer-events: none;
                filter: drop-shadow(2px 3px 5px rgba(0,0,0,0.5));
            `;
            document.body.appendChild(mud);

            const peakY = -(120 + Math.random() * 120) * scale;
            const driftX = (Math.random() - 0.5) * 120 * scale;

            await mud.animate([
                { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
                { transform: `translate(${driftX/2}px, ${peakY}px) rotate(180deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${driftX}px, 60px) rotate(360deg)`, opacity: 0 }
            ], {
                duration: 900 + Math.random() * 300,
                easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' // Hiệu ứng rơi có trọng lực hơn
            }).finished;

            mud.remove();

            // Vẫn giữ âm thanh sfx khi va chạm cho sống động
            if (this.playRandomSfx) this.playRandomSfx();
        },

        // --- HỆ MA (GHOST) 2.0 - LINH HỒN MẶT QUỶ ---
        async spawnGhost(startEl, endEl, count, scale, data) {
            const rectE = endEl.getBoundingClientRect();

            const totalDuration = 2200; // Tăng thời gian để ma bay lờ lững
            const interval = totalDuration / count;

            for (let i = 0; i < count; i++) {
                this.executeSpecterApparition(rectE, scale, i * interval, i);
            }

            await new Promise(r => setTimeout(r, 3000));
        },

        async executeSpecterApparition(rectE, scale, delay, index) {
            await new Promise(r => setTimeout(r, delay));

            const specter = document.createElement('div');
            specter.className = 'pkm-particle particle-specter';

            // KÍCH THƯỚC TO, MỜ ẢO để dễ nhìn trên phone
            const size = (80 + Math.random() * 40) * scale;

            specter.style.cssText = `
                position: fixed;
                /* Xuất hiện quanh mục tiêu */
                left: ${rectE.left + rectE.width / 2 + (Math.random() - 0.5) * 150 * scale}px;
                top: ${rectE.top + rectE.height / 2 + (Math.random() - 0.5) * 150 * scale}px;
                width: ${size}px;
                height: ${size}px;
                /* Màu sắc ma mị: Tím, Xanh lam, Trắng mờ */
                background: radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.4) 0%, rgba(162, 155, 254, 0.1) 40%, rgba(108, 92, 231, 0.0) 70%);
                border-radius: 50% 50% 10% 10%;
                z-index: 10003;
                pointer-events: none;
                /* BLUR MẠNH để tạo cảm giác không xác thực */
                filter: blur(${5 * scale}px);
                opacity: 0;
                /* XUYÊN THẤU - Hòa trộn ánh sáng qua Pokemon */
                mix-blend-mode: screen; 
                transform-style: preserve-3d;
                box-shadow: 0 0 ${20 * scale}px rgba(162, 155, 254, 0.3);
            `;
            document.body.appendChild(specter);

            // --- TẠO HÌNH MẶT NGƯỜI/ĐẦU LÂU BẰNG KÝ TỰ ĐẶC BIỆT ---
            const face = document.createElement('div');
            face.style.cssText = `
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                display: flex; justify-content: center; align-items: center;
                font-size: ${size * 0.8}px;
                color: rgba(255, 255, 255, 0.2);
                font-family: monospace; /* Dùng phông monospace để ký tự chuẩn */
                filter: blur(1px); /* Giảm độ nét của ký tự */
            `;
            // Ngẫu nhiên các hình khuôn mặt khác nhau
            const faces = ['👻', '💀', '👽', '👁️‍🗨️', '😈', '🤮'];
            face.innerText = faces[Math.floor(Math.random() * faces.length)];
            specter.appendChild(face);

            // --- HIỆU ỨNG LINH HỒN LƠ LỬNG VÀ TAN BIẾN ---
            // Bay từ dưới lên theo hình vòng cung
            const driftY = -(120 + Math.random() * 120) * scale;
            const driftX = (Math.random() - 0.5) * 100 * scale;

            await specter.animate([
                { transform: 'translateY(100px) rotate(0deg) scale(0.7)', opacity: 0 },
                { opacity: 0.7, offset: 0.1 },
                { 
                    transform: `translate(${driftX/2}px, ${driftY/2}px) rotate(${(Math.random()-0.5)*30}deg) scale(1.1)`, 
                    opacity: 0.8, 
                    offset: 0.6 
                },
                { 
                    transform: `translate(${driftX}px, ${driftY}px) rotate(${(Math.random()-0.5)*60}deg) scale(1.5)`, 
                    opacity: 0 
                }
            ], {
                // Thời gian bay chậm rãi, ma quái
                duration: 1800 + Math.random() * 800,
                easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)' // Vào nhanh, xoáy đều, tan biến chậm
            }).finished;

            specter.remove();

            // Chỉ chơi âm thanh cho một số linh hồn để tránh ồn
            if (index % 3 === 0 && this.playRandomSfx) this.playRandomSfx();
        },

        // --- HỆ CHIẾN ĐẤU (FIGHTING) - CÚ ĐẤM NGÀN CÂN ---
        async spawnFighting(startEl, endEl, count, scale, data) {
            const rectE = endEl.getBoundingClientRect();

            // Với hệ Chiến đấu, ta ưu tiên các cú đánh dồn dập
            const totalDuration = 1500;
            const interval = totalDuration / count;

            for (let i = 0; i < count; i++) {
                this.executeFightingImpact(rectE, scale, i * interval);
            }

            await new Promise(r => setTimeout(r, 2000));
        },

        async executeFightingImpact(rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const impactContainer = document.createElement('div');
            const size = (100 + Math.random() * 50) * scale;

            impactContainer.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2}px;
                top: ${rectE.top + rectE.height / 2}px;
                width: ${size}px;
                height: ${size}px;
                transform: translate(-50%, -50%);
                z-index: 10005;
                pointer-events: none;
                display: flex;
                justify-content: center;
                align-items: center;
            `;
            document.body.appendChild(impactContainer);

            // 1. Tạo biểu tượng Nắm đấm hoặc Dấu chân (Emoji)
            const punch = document.createElement('div');
            punch.style.cssText = `
                font-size: ${size}px;
                filter: drop-shadow(0 0 10px rgba(231, 76, 60, 0.8));
                opacity: 0;
                transform: scale(2);
            `;
            const icons = ['👊', '🥊', '🦶', '💥'];
            punch.innerText = icons[Math.floor(Math.random() * icons.length)];
            impactContainer.appendChild(punch);

            // 2. Tạo hiệu ứng tia lửa va chạm (Shockwave)
            const ring = document.createElement('div');
            ring.style.cssText = `
                position: absolute;
                width: 100%;
                height: 100%;
                border: ${5 * scale}px solid #e74c3c;
                border-radius: 50%;
                opacity: 0;
            `;
            impactContainer.appendChild(ring);

            // --- ANIMATION TẤN CÔNG CHỚP NHOÁNG ---
            // Nắm đấm đập mạnh từ ngoài vào
            punch.animate([
                { transform: 'scale(3) rotate(-20deg)', opacity: 0 },
                { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.1 },
                { transform: 'scale(0.8) rotate(10deg)', opacity: 0, offset: 0.9 }
            ], {
                duration: 400,
                easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            });

            // Vòng tròn sóng xung kích tỏa ra
            ring.animate([
                { transform: 'scale(0.5)', opacity: 1, borderWeight: `${10 * scale}px` },
                { transform: 'scale(1.5)', opacity: 0, borderWeight: '1px' }
            ], {
                duration: 400,
                easing: 'ease-out'
            }).finished.then(() => impactContainer.remove());

            // Chơi âm thanh va chạm mạnh
            if (this.playRandomSfx) this.playRandomSfx();
        },
        // --- HỆ RỒNG (DRAGON) - LONG THẦN NỘ KÍCH ---
        async spawnDragon(startEl, endEl, count, scale, data) {
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();

            // 1. Tạo luồng năng lượng chính (Dragon Beam)
            const beam = document.createElement('div');
            beam.className = 'dragon-beam';

            // Tính toán khoảng cách và góc quay để nối từ Pokemon này sang Pokemon kia
            const deltaX = rectE.left + rectE.width / 2 - (rectS.left + rectS.width / 2);
            const deltaY = rectE.top + rectE.height / 2 - (rectS.top + rectS.height / 2);
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;

            beam.style.cssText = `
                position: fixed;
                left: ${rectS.left + rectS.width / 2}px;
                top: ${rectS.top + rectS.height / 2}px;
                width: 0px; /* Bắt đầu từ 0 để tạo hiệu ứng bắn ra */
                height: ${40 * scale}px;
                background: linear-gradient(to bottom, #7038f8, #ffffff 50%, #7038f8);
                box-shadow: 0 0 ${30 * scale}px #7038f8, 0 0 ${60 * scale}px rgba(112, 56, 248, 0.5);
                z-index: 10004;
                pointer-events: none;
                transform-origin: 0 50%;
                transform: rotate(${angle}deg);
                border-radius: ${20 * scale}px;
                filter: blur(1px);
                opacity: 0.9;
            `;
            document.body.appendChild(beam);

            // 2. Hiệu ứng vận công (Charge Aura) tại đầu tia laser
            const aura = document.createElement('div');
            aura.style.cssText = `
                position: absolute; left: -20px; top: 50%;
                width: ${80 * scale}px; height: ${80 * scale}px;
                background: radial-gradient(circle, #fff 0%, #7038f8 70%, transparent 100%);
                transform: translate(-50%, -50%);
                border-radius: 50%;
                filter: blur(10px);
            `;
            beam.appendChild(aura);

            // 3. Thực hiện bắn tia laser
            await beam.animate([
                { width: '0px', opacity: 0 },
                { width: `${distance}px`, opacity: 1, offset: 0.1 },
                { width: `${distance}px`, opacity: 1, offset: 0.8 },
                { width: `${distance}px`, opacity: 0 }
            ], {
                duration: 1200,
                easing: 'ease-out'
            }).finished;

            // 4. Các mảnh vỡ năng lượng bắn ra tại điểm va chạm
            for (let i = 0; i < 15; i++) {
                this.executeDragonParticle(rectE, scale);
            }

            beam.remove();
            await new Promise(r => setTimeout(r, 1000));
        },

        async executeDragonParticle(rectE, scale) {
            const p = document.createElement('div');
            const size = (10 + Math.random() * 15) * scale;
            p.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2}px;
                top: ${rectE.top + rectE.height / 2}px;
                width: ${size}px;
                height: ${size}px;
                background: #7038f8;
                clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); /* Hình kim cương */
                z-index: 10005;
                pointer-events: none;
                box-shadow: 0 0 10px #7038f8;
            `;
            document.body.appendChild(p);

            const angle = Math.random() * Math.PI * 2;
            const dist = (50 + Math.random() * 100) * scale;

            await p.animate([
                { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
                { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) rotate(360deg) scale(0)`, opacity: 0 }
            ], {
                duration: 800,
                easing: 'ease-out'
            }).finished;
            p.remove();
        },

        // --- HỆ TIÊN (FAIRY) - VŨ ĐIỆU ÁNH TRĂNG ---
        async spawnFairy(startEl, endEl, count, scale, data) {
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();

            // Số lượng hạt lấp lánh tỷ lệ theo Gen
            const totalParticles = count * 3; 
            const duration = 1800;
            const interval = duration / totalParticles;

            for (let i = 0; i < totalParticles; i++) {
                this.executeFairyMagic(rectS, rectE, scale, i * interval);
            }

            await new Promise(r => setTimeout(r, 2500));
        },

        async executeFairyMagic(rectS, rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const magic = document.createElement('div');
            const size = (20 + Math.random() * 25) * scale;

            // Ngẫu nhiên giữa Trái tim, Sao và Hạt lấp lánh
            const types = ['✨', '💖', '⭐', '🌸'];
            const type = types[Math.floor(Math.random() * types.length)];

            magic.style.cssText = `
                position: fixed;
                left: ${rectS.left + rectS.width / 2}px;
                top: ${rectS.top + rectS.height / 2}px;
                font-size: ${size}px;
                z-index: 10005;
                pointer-events: none;
                filter: drop-shadow(0 0 ${5 * scale}px #ee99ac);
                opacity: 0;
                user-select: none;
            `;
            magic.innerText = type;
            document.body.appendChild(magic);

            // Quỹ đạo bay vòng cung (Bezier)
            const destX = (rectE.left + rectE.width / 2 - (rectS.left + rectS.width / 2)) + (Math.random() - 0.5) * 60 * scale;
            const destY = (rectE.top + rectE.height / 2 - (rectS.top + rectS.height / 2)) + (Math.random() - 0.5) * 60 * scale;

            // Điểm uốn của vòng cung (tạo độ lượn)
            const midX = destX / 2 + (Math.random() - 0.5) * 200 * scale;
            const midY = destY / 2 - (100 + Math.random() * 150) * scale;

            await magic.animate([
                { transform: 'translate(0, 0) scale(0.5) rotate(0deg)', opacity: 0 },
                { transform: `translate(${midX}px, ${midY}px) scale(1.2) rotate(180deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${destX}px, ${destY}px) scale(0.8) rotate(360deg)`, opacity: 0.8, offset: 0.9 },
                { transform: `translate(${destX}px, ${destY}px) scale(1.5) rotate(360deg)`, opacity: 0 }
            ], {
                duration: 1000 + Math.random() * 500,
                easing: 'ease-in-out'
            }).finished;

            magic.remove();

            // Thỉnh thoảng phát tiếng chuông nhẹ (sfx) nếu muốn
            if (Math.random() > 0.8 && this.playRandomSfx) this.playRandomSfx();
        },

        // --- HỆ BÓNG TỐI (DARK) - VỰC THẲM HẮC ÁM ---
        async spawnDark(startEl, endEl, count, scale, data) {
            const rectE = endEl.getBoundingClientRect();

            // 1. Tạo vòng xoáy hắc ám dưới chân (Dark Vortex)
            this.executeDarkVortex(rectE, scale);

            // 2. Các lưỡi dao bóng tối chém dồn dập
            const totalDuration = 1500;
            const interval = totalDuration / count;

            for (let i = 0; i < count; i++) {
                this.executeDarkSlash(rectE, scale, i * interval);
            }

            await new Promise(r => setTimeout(r, 2500));
        },

        // Hiệu ứng vòng xoáy bóng tối
        async executeDarkVortex(rectE, scale) {
            const vortex = document.createElement('div');
            const size = 150 * scale;

            vortex.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2}px;
                top: ${rectE.top + rectE.height / 2}px;
                width: ${size}px;
                height: ${size}px;
                background: radial-gradient(circle, rgba(45, 0, 78, 0.8) 0%, rgba(0, 0, 0, 0.9) 50%, transparent 70%);
                border: ${2 * scale}px dashed #705848;
                border-radius: 50%;
                z-index: 10001;
                pointer-events: none;
                transform: translate(-50%, -50%) scale(0) rotate(0deg);
                filter: blur(${5 * scale}px);
                opacity: 0;
            `;
            document.body.appendChild(vortex);

            await vortex.animate([
                { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', opacity: 0 },
                { transform: 'translate(-50%, -50%) scale(1.2) rotate(180deg)', opacity: 1, offset: 0.2 },
                { transform: 'translate(-50%, -50%) scale(1) rotate(360deg)', opacity: 0.8, offset: 0.8 },
                { transform: 'translate(-50%, -50%) scale(1.5) rotate(540deg)', opacity: 0 }
            ], {
                duration: 2000,
                easing: 'ease-out'
            }).finished;

            vortex.remove();
        },

        // Hiệu ứng lưỡi dao bóng tối chém xuyên qua
        async executeDarkSlash(rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const slash = document.createElement('div');
            const width = (120 + Math.random() * 60) * scale;
            const height = (15 + Math.random() * 10) * scale;

            const angle = Math.random() * 360;

            slash.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2}px;
                top: ${rectE.top + rectE.height / 2}px;
                width: ${width}px;
                height: ${height}px;
                background: linear-gradient(90deg, transparent, #2d004e, #000, #705848, transparent);
                z-index: 10005;
                pointer-events: none;
                transform: translate(-50%, -50%) rotate(${angle}deg) scaleX(0);
                clip-path: polygon(10% 0%, 100% 50%, 10% 100%, 0% 50%);
                filter: drop-shadow(0 0 8px #705848);
                opacity: 0.9;
            `;
            document.body.appendChild(slash);

            await slash.animate([
                { transform: `translate(-50%, -50%) rotate(${angle}deg) scaleX(0)`, opacity: 0 },
                { transform: `translate(-50%, -50%) rotate(${angle}deg) scaleX(1.5)`, opacity: 1, offset: 0.2 },
                { transform: `translate(-50%, -50%) rotate(${angle}deg) scaleX(2)`, opacity: 0 }
            ], {
                duration: 400,
                easing: 'ease-in'
            }).finished;

            slash.remove();
            if (this.playRandomSfx) this.playRandomSfx();
        },

        // --- HỆ THƯỜNG (NORMAL) - SÓNG ÂM DỒN DẬP ---
        async spawnNormal(startEl, endEl, count, scale, data) {
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();

            // Số lượng vòng sóng âm bay đi
            const totalWaves = Math.max(count, 3);
            const duration = 1500;
            const interval = duration / totalWaves;

            for (let i = 0; i < totalWaves; i++) {
                this.executeSonicWave(rectS, rectE, scale, i * interval);
            }

            await new Promise(r => setTimeout(r, 2000));
        },

        async executeSonicWave(rectS, rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const wave = document.createElement('div');
            // Kích thước vòng sóng ban đầu nhỏ
            const size = 40 * scale;

            // Tính toán góc bay
            const deltaX = (rectE.left + rectE.width / 2) - (rectS.left + rectS.width / 2);
            const deltaY = (rectE.top + rectE.height / 2) - (rectS.top + rectS.height / 2);

            wave.style.cssText = `
                position: fixed;
                left: ${rectS.left + rectS.width / 2}px;
                top: ${rectS.top + rectS.height / 2}px;
                width: ${size}px;
                height: ${size}px;
                border: ${3 * scale}px solid rgba(255, 255, 255, 0.6);
                border-radius: 50%;
                z-index: 10004;
                pointer-events: none;
                transform: translate(-50%, -50%) scale(1);
                /* Hiệu ứng bóng mờ tạo cảm giác rung động */
                box-shadow: 0 0 ${10 * scale}px rgba(255, 255, 255, 0.4);
                filter: blur(1px);
            `;
            document.body.appendChild(wave);

            // Hiệu ứng bay: Vừa bay vừa to dần ra (như loa phóng thanh)
            await wave.animate([
                { 
                    transform: 'translate(-50%, -50%) scale(1)', 
                    opacity: 0.8 
                },
                { 
                    transform: `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(${3 * scale})`, 
                    opacity: 0 
                }
            ], {
                duration: 800,
                easing: 'ease-out'
            }).finished;

            wave.remove();

            // Phát âm thanh va chạm cho mỗi vòng sóng chạm đích
            if (this.playRandomSfx) this.playRandomSfx();
        },

        // --- HỆ CÔN TRÙNG (BUG) FINAL - DỆT KÉN CUỐN CHIẾU ---
        async spawnBug(startEl, endEl, count, scale, data) {
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();

            const fixedStrandCount = 7;
            const interval = 120; // Khoảng cách giữa mỗi lần phun tơ

            // 1. Phun sợi đầu tiên
            this.executeStringShot(rectS, rectE, scale, 0);

            // 2. KÉN BẮT ĐẦU XUẤT HIỆN NGAY KHI SỢI 1 CHẠM ĐÍCH (khoảng 300ms sau)
            // Chúng ta không dùng 'await' ở đây để kén nở song song với việc phun các sợi còn lại
            setTimeout(() => {
                this.executeCentricWebGrowth(rectE, scale);
            }, 300);

            // 3. Tiếp tục phun các sợi còn lại (từ sợi thứ 2 đến 7)
            for (let i = 1; i < fixedStrandCount; i++) {
                this.executeStringShot(rectS, rectE, scale, i * interval);
            }

            // Đợi toàn bộ quá trình dệt kén hoàn tất
            await new Promise(r => setTimeout(r, 2500));
        },

        // Hàm bắn tơ trực tiếp
        async executeStringShot(rectS, rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));
            const strand = document.createElement('div');
            const deltaX = rectE.left + rectE.width / 2 - (rectS.left + rectS.width / 2);
            const deltaY = rectE.top + rectE.height / 2 - (rectS.top + rectS.height / 2);
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;

            strand.style.cssText = `
                position: fixed;
                left: ${rectS.left + rectS.width / 2}px;
                top: ${rectS.top + rectS.height / 2}px;
                width: 0px; height: ${1.5 * scale}px;
                background: rgba(255, 255, 255, 0.9);
                box-shadow: 0 0 5px white;
                z-index: 10003;
                transform-origin: 0 50%;
                transform: rotate(${angle + (Math.random()-0.5)*10}deg);
                pointer-events: none;
            `;
            document.body.appendChild(strand);

            await strand.animate([
                { width: '0px', opacity: 1 },
                { width: `${distance}px`, opacity: 1, offset: 0.2 },
                { width: `${distance}px`, opacity: 0 }
            ], { duration: 600, easing: 'ease-out' }).finished;
            strand.remove();
        },

        // HIỆU ỨNG KÉN NỞ DẦN (LAN TỎA TỪ TÂM)
        async executeCentricWebGrowth(rectE, scale) {
            const cocoon = document.createElement('div');
            const fWidth = rectE.width * 1.25;
            const fHeight = rectE.height * 1.5;

            cocoon.style.cssText = `
                position: fixed;
                left: ${rectE.left + rectE.width / 2}px;
                top: ${rectE.top + rectE.height / 2}px;
                width: ${fWidth}px;
                height: ${fHeight}px;
                border-radius: 50%;
                background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(200,200,200,0.4) 80%, transparent 100%);
                z-index: 10005;
                pointer-events: none;
                transform: translate(-50%, -50%) scale(0);
                opacity: 0;
                filter: blur(5px);
            `;
            document.body.appendChild(cocoon);

            // Kén nở dần dần, chậm rãi lan ra trong khi tơ vẫn đang bắn vào
            await cocoon.animate([
                { transform: 'translate(-50%, -50%) scale(0)', opacity: 0, filter: 'blur(8px)' },
                { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0.6, filter: 'blur(4px)', offset: 0.3 },
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, filter: 'blur(1px)', offset: 0.7 },
                { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0, filter: 'blur(10px)' }
            ], {
                duration: 2200, // Thời gian nở dài hơn để thấy rõ quá trình lan tỏa
                easing: 'ease-out'
            }).finished;

            cocoon.remove();
        },
        // HỆ ĐIỆN
        async spawnElectric(startEl, endEl, count, scale, data) {
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();

            const totalAvailableTime = 2000;
            const interval = count > 1 ? Math.min(200, totalAvailableTime / count) : 0;

            for (let i = 0; i < count; i++) {
                this.executeSingleElectricOrb(rectS, rectE, scale, i * interval);
            }

            await new Promise(r => setTimeout(r, 2500));
        },

        async executeSingleElectricOrb(rectS, rectE, scale, delay) {
            await new Promise(r => setTimeout(r, delay));

            const cfg = this.durationConfig;
            const orb = document.createElement('div');
            orb.style.cssText = `
                position: fixed;
                left: ${rectS.left + rectS.width / 2}px; top: ${rectS.top + rectS.height / 2}px;
                width: ${14 * scale}px; height: ${14 * scale}px;
                background: #fff; border-radius: 50%;
                box-shadow: 0 0 8px #fff, 0 0 16px #f1c40f, 0 0 28px #f1c40f;
                z-index: 9999; pointer-events: none;
            `;
            document.body.appendChild(orb);

            // GỒNG — phình rồi co lại tại chỗ
            if (this.playRandomSfx) this.playRandomSfx();
            await orb.animate([
                { transform: 'scale(1)', opacity: 1 },
                { transform: 'scale(1.8)', opacity: 0.8 },
                { transform: 'scale(0.85)', opacity: 1 }
            ], { duration: cfg.chargeAura * 0.5, easing: 'ease-in-out' }).finished;

            orb.style.background = 'radial-gradient(circle, #fff 20%, #f1c40f 50%, #2980b9 100%)';
            orb.style.border = '2px solid #fff';
            orb.style.width = `${22 * scale}px`;
            orb.style.height = `${22 * scale}px`;
            orb.style.boxShadow = `0 0 14px #f1c40f, inset 0 0 10px #fff`;

            // DI CHUYỂN — bay thẳng sang đối thủ
            const targetX = rectE.left + rectE.width / 2 + (Math.random() - 0.5) * 40;
            const targetY = rectE.top + rectE.height / 2 + (Math.random() - 0.5) * 40;

            await orb.animate([
                { left: `${rectS.left + rectS.width / 2}px`, top: `${rectS.top + rectS.height / 2}px` },
                { left: `${targetX}px`, top: `${targetY}px` }
            ], { duration: 500, easing: 'ease-in' }).finished;

            orb.remove();

            // VA CHẠM — nổ tia sét toả tròn
            this.createElectricBurst(targetX, targetY, scale);
            if (this.playRandomSfx) this.playRandomSfx();
        },

        createElectricBurst(x, y, scale) {
            for (let i = 0; i < 8; i++) {
                const burst = document.createElement('div');
                const angle = (i / 8) * 360;
                burst.style.cssText = `
                    position: fixed; left: ${x}px; top: ${y}px;
                    width: ${30 * scale}px; height: 2px; background: #f1c40f;
                    transform: rotate(${angle}deg); transform-origin: 0 50%;
                    z-index: 9999; pointer-events: none;
                `;
                document.body.appendChild(burst);
                burst.animate([{ opacity: 1, width: '0px' }, { opacity: 0, width: `${50 * scale}px` }], 300)
                     .onfinish = () => burst.remove();
            }
        },
        //HÀM TỔNG QUAN
        async spawnBigOrb(startEl, endEl, count, scale, data) {
            const cfg = bigOrbTypeConfig[data?.type] || bigOrbTypeConfig.normal;
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();
            const flightMs = this.durationConfig.normal.bigOrbFlightDuration;
            const maxSize = 70 * scale; // kích cỡ TỐI ĐA — đạt được khi orb chạm đối thủ

            const startX = rectS.left + rectS.width / 2, startY = rectS.top + rectS.height / 2;
            const endX   = rectE.left + rectE.width / 2, endY   = rectE.top + rectE.height / 2;

            // Random hình dạng: quả cầu / mũi tên / cầu gai (nhím) — mỗi lần bắn 1 kiểu khác nhau
            const shapeKind = ORB_SHAPE_KINDS[Math.floor(Math.random() * ORB_SHAPE_KINDS.length)];

            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed; left: 0; top: 0;
                width: ${maxSize}px; height: ${maxSize}px;
                margin-left: -${maxSize / 2}px; margin-top: -${maxSize / 2}px;
                z-index: 10001; pointer-events: none;
                transform: translate3d(${startX}px, ${startY}px, 0) scale(0.15);
                opacity: 0;
            `;
            container.appendChild(buildOrbShapeVisual(shapeKind, maxSize, cfg));
            document.body.appendChild(container);

            // GIAI ĐOẠN GỒNG — bé xíu, phình nhẹ rồi ổn định ở scale nhỏ (0.3) trước khi bay
            if (this.playChargeSfx) this.playChargeSfx(data.type);
            await container.animate([
                { transform: `translate3d(${startX}px,${startY}px,0) scale(0.15)`, opacity: 0 },
                { transform: `translate3d(${startX}px,${startY}px,0) scale(0.35)`, opacity: 1, offset: 0.6 },
                { transform: `translate3d(${startX}px,${startY}px,0) scale(0.3)`, opacity: 1 }
            ], { duration: 500, easing: 'ease-out', fill: 'forwards' }).finished;

            // GIAI ĐOẠN BAY — random đường đi + SCALE TĂNG DẦN từ 0.3 lên ~1.05 (hơi nảy nhẹ khi tới đích)
            const pathKind = ORB_PATH_KINDS[Math.floor(Math.random() * ORB_PATH_KINDS.length)];
            const pathPts = generateOrbPathPoints(startX, startY, endX, endY, pathKind);
            const n = pathPts.length;
            const spinDir = Math.random() < 0.5 ? 1 : -1;
            const totalSpin = shapeKind === 'arrow' ? 0 : 360; // mũi tên không tự xoay lung tung, nó xoay theo hướng bay

            const keyframes = pathPts.map((p, i) => {
                const t = i / (n - 1);
                // Tăng size dần, 85% quãng đường đầu tăng đều, 15% cuối hơi "nảy" quá đà 1 chút cho có lực
                const growEase = t < 0.85 ? (t / 0.85) : 1 + (t - 0.85) * (0.4 / 0.15);
                const s = 0.3 + growEase * 0.75; // 0.3 → ~1.05

                let rot;
                if (shapeKind === 'arrow') {
                    // Mũi tên luôn xoay đầu theo đúng hướng đang bay tới (điểm kế tiếp trên path)
                    const next = pathPts[Math.min(i + 1, n - 1)];
                    rot = Math.atan2(next.y - p.y, next.x - p.x) * 180 / Math.PI;
                } else {
                    rot = t * totalSpin * spinDir;
                }

                return { transform: `translate3d(${p.x}px, ${p.y}px, 0) scale(${s}) rotate(${rot}deg)` };
            });

        // ── DẢI ĐUÔI SAO CHỔI: dọc theo đường bay, mỗi mốc thời gian gắn
            //    1 vòng tròn rỗng — kích cỡ vòng tỉ lệ theo độ to của quả cầu
            //    NGAY TẠI THỜI ĐIỂM ĐÓ, nên quả cầu càng bay xa/càng to thì
            //    vòng đuôi sinh ra sau cũng to hơn vòng sinh trước. ──
        // ── DẢI ĐUÔI SAO CHỔI: lấy mẫu DÀY dọc đường bay (không phụ thuộc
            //    pathPts thưa hay dày), mỗi mẫu gắn 1 vòng tròn tại đúng vị trí
            //    + đúng kích cỡ quả cầu ở thời điểm đó → càng bay xa vòng càng to,
            //    và vòng tồn tại lâu hơn nên nhiều vòng chồng lên nhau tạo đuôi dài. ──
            const TAIL_SAMPLES = 26; // tăng số này nếu muốn đuôi dày/mượt hơn nữa
            for (let k = 1; k <= TAIL_SAMPLES; k++) {
                const t = k / TAIL_SAMPLES;
                if (t < 0.12) continue; // bỏ đoạn đầu lúc quả cầu còn quá bé, chưa có gì để "để lại"

                const p = pointAtT(pathPts, t);
                const growEase = t < 0.85 ? (t / 0.85) : 1 + (t - 0.85) * (0.4 / 0.15);
                const orbSizeNow = maxSize * (0.3 + growEase * 0.75);
                const delay = t * flightMs;

                setTimeout(() => {
                    this.spawnOrbTailRing(p.x, p.y, orbSizeNow, cfg, scale);
                }, delay);
            }

            if (this.playTravelSfx) this.playTravelSfx(data.type); else if (this.playRandomSfx) this.playRandomSfx();
            await container.animate(keyframes, {
                duration: flightMs,
                easing: 'linear',
                fill: 'forwards'
            }).finished;

            container.remove();
            this.createBigOrbImpact(endX, endY, scale, cfg);
        },

        // Vòng tròn "đuôi sao chổi" — nhiều vòng đường kính khác nhau bám theo
        // quả cầu khi bay, dựng đúng kiểu vòng sóng âm rỗng của spawnNormal,
        // đứng yên tại chỗ sinh ra rồi phình to + mờ dần (thời gian dài hơn
        // trước để nhiều vòng chồng lấp nhau, tạo cảm giác đuôi liền mạch dài).
        spawnOrbTailRing(x, y, orbSize, cfg, scale) {
            const ring = document.createElement('div');
            const size = orbSize * (0.55 + Math.random() * 0.3);
            ring.style.cssText = `
                position: fixed; left: ${x}px; top: ${y}px;
                width: ${size}px; height: ${size}px;
                border: ${Math.max(2, 3 * scale)}px solid ${cfg.mid};
                border-radius: 50%;
                transform: translate(-50%,-50%) scale(0.6);
                box-shadow: 0 0 ${size * 0.3}px ${cfg.glow};
                z-index: 10000; pointer-events: none;
                opacity: 0.7;
            `;
            document.body.appendChild(ring);
            ring.animate([
                { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0.7 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0.4, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 }
            ], { duration: 850, easing: 'ease-out' }).onfinish = () => ring.remove();
        },

        

        

        createBigOrbImpact(x, y, scale, cfg) {
            const ring = document.createElement('div');
            const size = 90 * scale;
            ring.style.cssText = `
                position: fixed; left: ${x}px; top: ${y}px;
                width: ${size}px; height: ${size}px; border: 4px solid ${cfg.glow};
                border-radius: 50%; transform: translate(-50%,-50%) scale(0.3);
                box-shadow: 0 0 20px ${cfg.glow}; z-index: 10002; pointer-events: none;
            `;
            document.body.appendChild(ring);
            ring.animate([
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 1 },
                { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 0 }
            ], { duration: 400, easing: 'ease-out' }).onfinish = () => ring.remove();

            for (let i = 0; i < 10; i++) {
                const p = document.createElement('div');
                const angle = Math.random() * Math.PI * 2;
                const dist = (40 + Math.random() * 40) * scale;
                p.style.cssText = `
                    position: fixed; left: ${x}px; top: ${y}px;
                    width: ${6 * scale}px; height: ${6 * scale}px;
                    background: ${cfg.mid}; border-radius: 50%; z-index: 10002; pointer-events: none;
                `;
                document.body.appendChild(p);
                p.animate([
                    { transform: 'translate(0,0)', opacity: 1 },
                    { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`, opacity: 0 }
                ], { duration: 400, easing: 'ease-out' }).onfinish = () => p.remove();
            }
        },

        // —— SKILL CHUNG SỐ 3: PHUN DẢI (lửa/nước/gió/...) ——
        async spawnBeamStream(startEl, endEl, count, scale, data) {
            const cfg = bigOrbTypeConfig[data?.type] || bigOrbTypeConfig.normal;
            const rectS = startEl.getBoundingClientRect();
            const rectE = endEl.getBoundingClientRect();
            const sx = rectS.left + rectS.width / 2, sy = rectS.top + rectS.height / 2;
            const ex0 = rectE.left + rectE.width / 2, ey0 = rectE.top + rectE.height / 2;

            const rawDx = ex0 - sx, rawDy = ey0 - sy;
            const rawDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy) || 1;
            const dirX = rawDx / rawDist, dirY = rawDy / rawDist;
            const perpX = -dirY, perpY = dirX;

            const penetrate = Math.min(rectE.width, rectE.height) * 0.22;
            const ex = ex0 + dirX * penetrate, ey = ey0 + dirY * penetrate;

            const forwardOffset = Math.max(rectS.width, rectS.height) * 0.42;
            const bx = sx + dirX * forwardOffset, by = sy + dirY * forwardOffset;

            const chargeMs   = 1400;
            const beamMs     = 1300;
            const sustainMs  = 900;
            const fadeStepMs = 380;

            const chargeEls = [];
            const beamEls   = [];
            const impactEls = [];
            let sparkleTimer = null;

            // ═══════════ PHA 1: GỒNG ═══════════
            const ringW = 140 * scale, ringH = 54 * scale;
            const groundOuter = document.createElement('div');
            groundOuter.style.cssText = `
                position:fixed; left:${sx}px; top:${rectS.bottom - 6}px;
                width:${ringW}px; height:${ringH}px;
                transform:translate(-50%,-50%) scale(0.2);
                border-radius:50%;
                background:radial-gradient(ellipse, ${cfg.core}aa 0%, ${cfg.mid}88 30%, ${cfg.glow}44 60%, transparent 82%);
                filter:blur(5px); opacity:0; z-index:9986; pointer-events:none;
            `;
            document.body.appendChild(groundOuter);
            chargeEls.push(groundOuter);

            const groundInner = document.createElement('div');
            groundInner.style.cssText = `
                position:fixed; left:${sx}px; top:${rectS.bottom - 6}px;
                width:${ringW * 0.55}px; height:${ringH * 0.55}px;
                transform:translate(-50%,-50%) scale(0.2);
                border-radius:50%;
                background:radial-gradient(ellipse, #fff 0%, ${cfg.core} 40%, ${cfg.glow}aa 75%, transparent 100%);
                filter:blur(2px); opacity:0; z-index:9987; pointer-events:none;
            `;
            document.body.appendChild(groundInner);
            chargeEls.push(groundInner);

            groundOuter.animate([
                { transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.9, offset: 0.55 },
                { transform: 'translate(-50%,-50%) scale(1.08)', opacity: 0.8 }
            ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' });
            groundInner.animate([
                { transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.55 },
                { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0.9 }
            ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' });

            const haloSize = Math.max(rectS.width, rectS.height) * 1.5;
            const haloOuter = document.createElement('div');
            haloOuter.style.cssText = `
                position:fixed; left:${sx}px; top:${sy}px;
                width:${haloSize}px; height:${haloSize}px;
                transform:translate(-50%,-50%) scale(0.3);
                border-radius:50%;
                background:radial-gradient(circle, ${cfg.core}00 35%, ${cfg.mid}55 60%, ${cfg.glow}33 85%, transparent 100%);
                filter:blur(8px); opacity:0; z-index:9984; pointer-events:none;
            `;
            document.body.appendChild(haloOuter);
            chargeEls.push(haloOuter);

            const haloInner = document.createElement('div');
            haloInner.style.cssText = `
                position:fixed; left:${sx}px; top:${sy}px;
                width:${haloSize * 0.7}px; height:${haloSize * 0.7}px;
                transform:translate(-50%,-50%) scale(0.3);
                border-radius:50%;
                background:radial-gradient(circle, ${cfg.core}66 0%, ${cfg.mid}44 55%, transparent 85%);
                filter:blur(3px); opacity:0; z-index:9985; pointer-events:none;
                mix-blend-mode:screen;
            `;
            document.body.appendChild(haloInner);
            chargeEls.push(haloInner);

            haloOuter.animate([
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.65 },
                { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0.9 }
            ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' });
            haloInner.animate([
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.65 },
                { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0.85 }
            ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' });

            const orbSize = 16 * scale;
            const orb = document.createElement('div');
            orb.style.cssText = `
                position:fixed; left:${bx}px; top:${by}px;
                width:${orbSize}px; height:${orbSize}px;
                transform:translate(-50%,-50%) scale(0);
                border-radius:50%;
                background:radial-gradient(circle, #fff 0%, ${cfg.core} 35%, ${cfg.mid} 65%, ${cfg.edge} 100%);
                box-shadow:0 0 ${12 * scale}px ${cfg.glow}, 0 0 ${22 * scale}px ${cfg.glow};
                opacity:0; z-index:9992; pointer-events:none;
            `;
            document.body.appendChild(orb);
            chargeEls.push(orb);

            sparkleTimer = setInterval(() => {
                const ang = Math.random() * Math.PI * 2;
                const rad = orbSize * (1.3 + Math.random() * 0.9);
                const px = bx + Math.cos(ang) * rad;
                const py = by + Math.sin(ang) * rad * 0.6;
                const spark = document.createElement('div');
                const ssize = 2 + Math.random() * 3;
                spark.style.cssText = `
                    position:fixed; left:${px}px; top:${py}px;
                    width:${ssize}px; height:${ssize}px; border-radius:50%;
                    background:#fff; box-shadow:0 0 6px ${cfg.glow};
                    transform:translate(-50%,-50%); opacity:0.9; z-index:9993; pointer-events:none;
                `;
                document.body.appendChild(spark);
                spark.animate([
                    { opacity: 0.9, transform: 'translate(-50%,-50%) translate(0,0) scale(1)' },
                    { opacity: 0, transform: `translate(-50%,-50%) translate(${Math.cos(ang) * 14}px, ${Math.sin(ang) * 14}px) scale(0.3)` }
                ], { duration: 450 }).onfinish = () => spark.remove();
            }, 70);

            if (this.playRandomSfx) this.playRandomSfx();
            await orb.animate([
                { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.75 },
                { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1 }
            ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' }).finished;

            // Nhịp thở liên tục cho toàn bộ pha 1 — không đứng yên trong lúc chờ bắn
            const chargePulses = [
                groundOuter.animate(
                    [{ transform: 'translate(-50%,-50%) scale(1.08)' }, { transform: 'translate(-50%,-50%) scale(0.96)' }],
                    { duration: 550, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }),
                groundInner.animate(
                    [{ transform: 'translate(-50%,-50%) scale(1.05)' }, { transform: 'translate(-50%,-50%) scale(0.92)' }],
                    { duration: 480, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }),
                haloOuter.animate(
                    [{ transform: 'translate(-50%,-50%) scale(1.05)' }, { transform: 'translate(-50%,-50%) scale(0.94)' }],
                    { duration: 620, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }),
                haloInner.animate(
                    [{ transform: 'translate(-50%,-50%) scale(1.05)' }, { transform: 'translate(-50%,-50%) scale(0.93)' }],
                    { duration: 500, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }),
                orb.animate(
                    [{ transform: 'translate(-50%,-50%) scale(1.15)' }, { transform: 'translate(-50%,-50%) scale(1.02)' }],
                    { duration: 400, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' })
            ];

            // ═══════════ PHA 2: BẮN DẢI — xuất phát từ vị trí quả cầu (bx,by) ═══════════
            const dx = ex - bx, dy = ey - by;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const beamWidth = 30 * scale;

            const beamOuter = document.createElement('div');
            beamOuter.style.cssText = `
                position:fixed; left:${bx}px; top:${by}px;
                width:0px; height:${beamWidth}px;
                transform-origin:0 50%;
                transform:rotate(${angle}deg);
                background:linear-gradient(90deg, transparent 0%, ${cfg.glow}22 15%, ${cfg.glow}33 50%, ${cfg.glow}22 85%, transparent 100%);
                border-radius:${beamWidth / 2}px;
                filter:blur(4px); opacity:0; z-index:9998; pointer-events:none;
            `;
            document.body.appendChild(beamOuter);
            beamEls.push(beamOuter);

            if (this.playRandomSfx) this.playRandomSfx();

            beamOuter.animate([
                { width: '0px', opacity: 0 },
                { width: `${distance}px`, opacity: 0.7, offset: 0.2 },
                { width: `${distance}px`, opacity: 0.7 }
            ], { duration: beamMs, fill: 'forwards', easing: 'ease-in' });

            const flowInterval = 18;
            const flowDuration = 480;
            let flowActive = true;
            let firstHitDone = false;
            let hitTickCounter = 0;
            const hitEvery = 12; // cứ mỗi 12 hạt trúng đích thì rút 1 chunk damage (≈ mỗi ~215ms có 1 số hiện lên)
            let persistentImpact = null;

            const spawnHitSpark = () => {
                const jitter = (Math.random() - 0.5) * 26 * scale;
                const px = ex + perpX * jitter, py = ey + perpY * jitter;
                const spark = document.createElement('div');
                const ssize = (26 + Math.random() * 16) * scale;
                spark.style.cssText = `
                    position:fixed; left:${px}px; top:${py}px;
                    width:${ssize}px; height:${ssize}px; border-radius:50%;
                    background:radial-gradient(circle, #fff 0%, ${cfg.core} 35%, ${cfg.glow}aa 65%, transparent 85%);
                    box-shadow:0 0 ${18 * scale}px ${cfg.glow}, 0 0 ${34 * scale}px ${cfg.glow};
                    transform:translate(-50%,-50%) scale(0.3);
                    opacity:0; z-index:10004; pointer-events:none;
                    mix-blend-mode:screen;
                `;
                document.body.appendChild(spark);
                spark.animate([
                    { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.35 },
                    { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 0 }
                ], { duration: 240, easing: 'ease-out' }).onfinish = () => spark.remove();
            };

            const spawnFlowParticle = () => {
                if (!flowActive) return;
                const jitter = (Math.random() - 0.5) * beamWidth * 0.7;
                const psize = (4 + Math.random() * 5) * Math.min(1.3, scale);
                const p = document.createElement('div');
                p.style.cssText = `
                    position:fixed; left:${bx}px; top:${by}px;
                    width:${psize}px; height:${psize}px; border-radius:50%;
                    background:radial-gradient(circle, #fff 0%, ${cfg.core} 45%, ${cfg.mid} 100%);
                    box-shadow:0 0 ${6 * scale}px ${cfg.glow};
                    transform:translate(-50%,-50%); opacity:0; z-index:10001; pointer-events:none;
                `;
                document.body.appendChild(p);
                p.animate([
                    { offset: 0,    transform: `translate(-50%,-50%) translate(${perpX * jitter}px, ${perpY * jitter}px)`, opacity: 0 },
                    { offset: 0.15, opacity: 1 },
                    { offset: 0.85, opacity: 1 },
                    { offset: 1,    transform: `translate(-50%,-50%) translate(${dx + perpX * jitter}px, ${dy + perpY * jitter}px)`, opacity: 0 }
                ], { duration: flowDuration, easing: 'linear' }).onfinish = () => {
                    p.remove();
                    if (!flowActive && firstHitDone) return;
                    spawnHitSpark();
                    if (!firstHitDone) {
                        firstHitDone = true;
                        persistentImpact = this.createImpactAura(endEl, ex, ey, scale, cfg);
                        impactEls.push(persistentImpact.el);
                    } else if (persistentImpact) {
                        persistentImpact.bump();
                    }

                    // Damage ăn theo hạt THẬT SỰ chạm đích — cứ mỗi hitEvery hạt thì rút 1 chunk
                    hitTickCounter++;
                    if (hitTickCounter % hitEvery === 0) {
                        this.consumeHit();
                    }
                };
            };

            const flowTimer = setInterval(spawnFlowParticle, flowInterval);

            await new Promise(r => setTimeout(r, beamMs));

            // ═══════════ PHA 3: DUY TRÌ — dòng hạt + vùng sáng vẫn tiếp tục chạy ═══════════
            await new Promise(r => setTimeout(r, sustainMs));

            // ═══════════ DỌN DẸP TUẦN TỰ: pha 1 → pha 2 → pha 3, mượt dần ═══════════
            clearInterval(sparkleTimer);
            chargePulses.forEach(p => p.cancel());
            flowActive = false;
            clearInterval(flowTimer);
            if (persistentImpact) persistentImpact.stopPulse();

            await Promise.all(chargeEls.map(el => el.animate(
                [{ transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity },
                 { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 }],
                { duration: fadeStepMs, fill: 'forwards', easing: 'ease-in' }
            ).finished));
            chargeEls.forEach(el => el.remove());

            await Promise.all(beamEls.map(el => el.animate(
                [{ width: `${distance}px`, opacity: getComputedStyle(el).opacity },
                 { width: '0px', opacity: 0 }],
                { duration: fadeStepMs, fill: 'forwards', easing: 'ease-in' }
            ).finished));
            beamEls.forEach(el => el.remove());

            await Promise.all(impactEls.map(el => el.animate(
                [{ transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity },
                 { transform: getComputedStyle(el).transform.replace(/scale\([^)]+\)/, 'scale(0.3)'), opacity: 0 }],
                { duration: fadeStepMs, fill: 'forwards', easing: 'ease-in' }
            ).finished));
            impactEls.forEach(el => el.remove());
        },

        // PHA 3 — vùng sáng bao quanh thân đối thủ, LỚN DẦN + SÁNG DẦN theo từng
        // hạt trúng, có nhịp thở liên tục, thay thế hoàn toàn ring/cone tĩnh cũ.
        createImpactAura(targetEl, x, y, scale, cfg) {
            const rect = targetEl.getBoundingClientRect();
            const baseSize = Math.max(rect.width, rect.height) * 0.15; // nhỏ lại (trước: ×1.5)

            const aura = document.createElement('div');
            aura.style.cssText = `
                position:fixed; left:${x}px; top:${y}px;
                width:${baseSize}px; height:${baseSize}px;
                transform:translate(-50%,-50%) scale(0.3);
                border-radius:50%;
                background:radial-gradient(circle, #fff 0%, ${cfg.core} 22%, ${cfg.mid}bb 48%, ${cfg.glow}44 75%, transparent 100%);
                filter:blur(5px) brightness(1.1);
                opacity:0; z-index:10003; pointer-events:none;
                mix-blend-mode:screen;
            `;
            document.body.appendChild(aura);

            aura.animate([
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.85, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0.8 }
            ], { duration: 260, fill: 'forwards', easing: 'ease-out' });

            // Nhịp thở NHANH hơn (260ms thay vì 420ms) + biên độ sáng-tối RỘNG hơn
            // (đáy thấp hơn: brightness 0.85, đỉnh vẫn cao: brightness 2.2) →
            // cường độ dao động cao hơn nhưng mức sáng trung bình thấp hơn.
            const breathing = aura.animate(
                [{ filter: 'blur(4px) brightness(0.85)' }, { filter: 'blur(8px) brightness(2.2)' }],
                { duration: 260, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }
            );

            let growth = 0;
            return {
                el: aura,
                bump() {
                    growth = Math.min(growth + 1, 6);
                    const scaleTo = 1 + growth * 0.08;

                    const joltMult = 3; // ← gấp mấy lần độ giật + độ sáng mỗi lần trúng, chỉnh số này
                    const peakScale = scaleTo * (1 + 0.12 * joltMult);      // trước: scaleTo * 1.12
                    const troughBrightness = 0.9;
                    const peakBrightness = troughBrightness + (2.6 - 0.9) * joltMult; // trước: đỉnh cố định 2.6

                    aura.animate([
                        { transform: `translate(-50%,-50%) scale(${scaleTo})`, filter: `blur(4px) brightness(${troughBrightness})` },
                        { transform: `translate(-50%,-50%) scale(${peakScale})`, filter: `blur(9px) brightness(${peakBrightness})` },
                        { transform: `translate(-50%,-50%) scale(${scaleTo})`, filter: `blur(4px) brightness(${troughBrightness})` }
                    ], { duration: 160, easing: 'ease-out' });
                },
                stopPulse() { breathing.cancel(); }
            };
        },

    };

    SM.normalSkills = Object.assign(Object.create(SM), coreSkills);


    // ─────────────────────────────────────────────
    // ĐIỀU PHỐI CHUNG (Pokémon đứng yên tại chỗ ra chiêu)
    // ─────────────────────────────────────────────
    // Damage text RIÊNG cho hệ normal — không có combo "Brutal Hit/Critical..."
    // như this.createDamageText (dùng chung bên AOE), size nhỏ gọn hơn vì đây
    // là 1 đòn nhỏ trong 1 chuỗi nhiều đòn, không phải cú đánh to duy nhất.
    // 3 kiểu hiệu ứng "bụp" khác nhau — random mỗi lần trúng, KHÁC HẲN kiểu
    // "nổ to dần + combo chữ vàng" của this.createDamageText bên AOE.
    const normalHitStyles = [
        // 1. Nảy bụp lên — cam, lắc nhẹ 2 chiều
        {
            color: '#ffb347', stroke: '#3a1d00', size: 24,
            build() { return [
                { transform: 'translate(-50%,-40%) scale(0.2) rotate(-8deg)', opacity: 0 },
                { transform: 'translate(-50%,-95%) scale(1.25) rotate(4deg)', opacity: 1, offset: 0.35 },
                { transform: 'translate(-50%,-80%) scale(0.95) rotate(-2deg)', opacity: 1, offset: 0.55 },
                { transform: 'translate(-50%,-120%) scale(0.85) rotate(0deg)', opacity: 0 }
            ]; }
        },
        // 2. Bật ngang kiểu "chém" — đỏ cam, vọt sang ngang rồi rơi thẳng
        {
            color: '#ff5c4d', stroke: '#3a0000', size: 22,
            build() {
                const dir = Math.random() < 0.5 ? -1 : 1;
                return [
                    { transform: `translate(calc(-50% + ${-dir * 14}px), -30%) scale(0.3) skewX(${dir * 12}deg)`, opacity: 0 },
                    { transform: `translate(calc(-50% + ${dir * 10}px), -70%) scale(1.15) skewX(${-dir * 6}deg)`, opacity: 1, offset: 0.3 },
                    { transform: `translate(-50%, -95%) scale(1) skewX(0deg)`, opacity: 1, offset: 0.6 },
                    { transform: `translate(-50%, -125%) scale(0.85) skewX(0deg)`, opacity: 0 }
                ];
            }
        },
        // 3. Xoay bật vào — xanh lá, spin nhẹ từ nhỏ vào to
        {
            color: '#6bff6b', stroke: '#003300', size: 23,
            build() { return [
                { transform: 'translate(-50%,-50%) scale(0.1) rotate(60deg)', opacity: 0 },
                { transform: 'translate(-50%,-85%) scale(1.2) rotate(-8deg)', opacity: 1, offset: 0.4 },
                { transform: 'translate(-50%,-95%) scale(1) rotate(0deg)', opacity: 1, offset: 0.6 },
                { transform: 'translate(-50%,-125%) scale(0.9) rotate(0deg)', opacity: 0 }
            ]; }
        }
    ];

    function createNormalDamageText(targetEl, damage) {
        const rect = targetEl.getBoundingClientRect();
        const jitterX = (Math.random() - 0.5) * 24;
        const startX = rect.left + rect.width / 2 + jitterX;
        const startY = rect.top;

        const style = normalHitStyles[Math.floor(Math.random() * normalHitStyles.length)];

        const numEl = document.createElement('div');
        numEl.innerText = damage.toLocaleString('en-US');
        numEl.style.cssText = `
            position: fixed; left:${startX}px; top:${startY}px;
            font-size: ${style.size}px; font-weight: 900; font-family: 'Arial Black', Arial, sans-serif;
            color: ${style.color}; -webkit-text-stroke: 1px ${style.stroke};
            text-shadow: -1px -1px 0 ${style.stroke}, 1px -1px 0 ${style.stroke}, -1px 1px 0 ${style.stroke}, 1px 1px 0 ${style.stroke};
            z-index: 10005; pointer-events: none; white-space: nowrap;
        `;
        document.body.appendChild(numEl);
        numEl.animate(style.build(), { duration: 480, easing: 'ease-out' }).onfinish = () => numEl.remove();

        // đốm sáng "bụp" nhỏ đi kèm — thay cho vùng glow to của AOE
        const pop = document.createElement('div');
        pop.style.cssText = `
            position: fixed; left:${startX}px; top:${startY}px;
            width:20px; height:20px; border-radius:50%;
            background: radial-gradient(circle, #fff 0%, ${style.color}88 60%, transparent 80%);
            transform: translate(-50%,-50%) scale(0.3);
            z-index: 10004; pointer-events: none; opacity: 0.9;
        `;
        document.body.appendChild(pop);
        pop.animate([
            { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0.9 },
            { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }
        ], { duration: 260, easing: 'ease-out' }).onfinish = () => pop.remove();
    }

    // Chia damage tổng thành `count` đòn nhỏ, hiện lần lượt theo thời gian
    // ước lượng khớp với nhịp bắn hạt trong các spawnXxx (đa số dùng
    // interval = min(200, 2000/count) và mất ~600ms bay tới đích).
    function playMultiHitDamage(target, totalDamage, count, opts = {}) {
        const self = this;
        const n = Math.max(1, count);
        const base = Math.floor(totalDamage / n);
        const remainder = totalDamage - base * n; // dồn phần dư vào đòn cuối để tổng luôn khớp số máu thật

        const interval = opts.interval !== undefined ? opts.interval : (n > 1 ? Math.min(200, 2000 / n) : 0);
        const startDelay = opts.startDelay !== undefined ? opts.startDelay : 600;

        for (let i = 0; i < n; i++) {
            const chunk = base + (i === n - 1 ? remainder : 0);
            const delay = startDelay + i * interval;
            setTimeout(() => {
                self.createNormalDamageText(target, chunk);
                target.classList.add('shake');
                setTimeout(() => target.classList.remove('shake'), 90);
            }, delay);
        }
    }
    // Chia damage tổng thành N chunk, dồn phần dư vào chunk cuối để tổng luôn khớp
    function splitDamage(totalDamage, n) {
        const count = Math.max(1, n);
        const base = Math.floor(totalDamage / count);
        const remainder = totalDamage - base * count;
        const arr = new Array(count).fill(base);
        arr[count - 1] += remainder;
        return arr;
    }

    // Gọi hàm này NGAY TẠI ĐIỂM VA CHẠM thật sự của từng hạt/quả bên trong
    // các spawnXxx — rút 1 chunk từ hàng đợi và hiện số máu NGAY LÚC ĐÓ,
    // không còn đoán thời gian trước nữa.
    function consumeHit() {
        if (!this._hitQueue || this._hitQueue.length === 0 || !this._currentHitTarget) return;
        const chunk = this._hitQueue.shift();
        const target = this._currentHitTarget;
        this.createNormalDamageText(target, chunk);
        target.classList.add('shake');
        setTimeout(() => target.classList.remove('shake'), 90);
    }

    // Xả nốt phần damage còn dư thành 1 lần hiện cuối — phòng trường hợp 1 vài
    // hệ có số hạt hiển thị KHÔNG khớp với count (xem ghi chú Bug/Fairy/Dragon bên dưới)
    function flushHitQueue() {
        if (!this._hitQueue || this._hitQueue.length === 0 || !this._currentHitTarget) return;
        const remain = this._hitQueue.reduce((a, b) => a + b, 0);
        this._hitQueue = [];
        if (remain > 0) this.createNormalDamageText(this._currentHitTarget, remain);
    }
    async function executeThemedNormal(attacker, target, info) {
            const type = info.type || 'normal';
            const scale = parseFloat(attacker.dataset.scale) || 1;
            const cfg = this.durationConfig.normal;

            // Số lượng hạt/quả bắn ra theo Gen thật của Pokémon (giống bản AOE)
            let count = info.count;
            if (!count) {
                switch (info.gen) {
                    case 1: count = 4; break;
                    case 2: count = 6; break;
                    case 3: count = 8; break;
                    case 4: count = 10; break;
                    default: count = 4;
                }
            }

        const methodName = spawnMethodMap[type] || spawnMethodMap.fire;
            const currentSpawnAction = SM.normalSkills[methodName];

        const name = skillMetaNormal[type] || 'Tấn công';
        window.PkmUnitFX?.showSkillName(info.attackerSide, info.attackerIndex, name);

        const isSummonType = ['grass', 'ground', 'rock'].includes(type);
        if (isSummonType) {
            await playAttackerMotion_Summon.call(this, attacker, scale);
        } else {
            await playAttackerMotion_Projectile.call(this, attacker, scale);
        }

    this._hitQueue = splitDamage(info.damage, count);
        this._currentHitTarget = target;

        if (typeof currentSpawnAction === 'function') {
            await currentSpawnAction.call(SM.normalSkills, attacker, target, count, scale, info);
        }

        this.applyGlobalShake(scale * 0.5);
        this.flushHitQueue(); // phòng khi số hạt thực tế bắn ra không khớp count (bug/fairy/dragon — xem ghi chú)
        target.classList.add('shake');
        await new Promise(r => setTimeout(r, cfg.shake));
        target.classList.remove('shake');
    }
    async function executeBigOrbSkill(attacker, target, info) {
        const type = info.type || 'normal';
        const scale = parseFloat(attacker.dataset.scale) || 1;
        const cfg = this.durationConfig.normal;
        const meta = bigOrbTypeConfig[type] || bigOrbTypeConfig.normal;

        window.PkmUnitFX?.showSkillName(info.attackerSide, info.attackerIndex, growOrbNameMap[type] || meta.label);

        // Luôn dùng motion "phóng ra" vì đây luôn là 1 quả cầu bắn thẳng, không triệu hồi dưới đất
        await playAttackerMotion_Projectile.call(this, attacker, scale);

        await SM.normalSkills.spawnBigOrb.call(SM.normalSkills, attacker, target, 1, scale, info);

        this.applyGlobalShake(scale * 0.7);
        this.createNormalDamageText(target, info.damage);
        target.classList.add('shake');
        await new Promise(r => setTimeout(r, cfg.shake));
        target.classList.remove('shake');
    }
    async function executeStreamSkill(attacker, target, info) {
        const type = info.type || 'normal';
        const scale = parseFloat(attacker.dataset.scale) || 1;
        const cfg = this.durationConfig.normal;
        const meta = bigOrbTypeConfig[type] || bigOrbTypeConfig.normal;

        window.PkmUnitFX?.showSkillName(info.attackerSide, info.attackerIndex, meta.label);

        await playAttackerMotion_Projectile.call(this, attacker, scale);

    // Damage giờ ăn theo ĐÚNG lúc hạt trong dòng chảy thật sự chạm mục tiêu
        // (this.consumeHit() gọi ngay trong onfinish của từng hạt bên trong
        // spawnBeamStream, cứ mỗi 12 hạt trúng mới rút 1 chunk cho đỡ vụn số).
        const beamHits = 4 + Math.floor(Math.random() * 3); // 4-6 chunk damage
        this._hitQueue = splitDamage(info.damage, beamHits);
        this._currentHitTarget = target;

        await SM.normalSkills.spawnBeamStream.call(SM.normalSkills, attacker, target, 1, scale, info);

        this.applyGlobalShake(scale * 0.6);
        this.flushHitQueue(); // xả nốt phần dư nếu số hạt trúng thực tế ít hơn dự kiến
    }

    async function playNormalAttack(info) {
        console.log('[SKILL] playNormalAttack nhận info:', JSON.parse(JSON.stringify(info)));
        const attackerSide = info.attackerSide;
        const attackerIndex = info.attackerIndex;
        const targetSide = info.targetSide;
        const targetIdx = (info.targets && info.targets.length) ? info.targets[0] : undefined;

        const attacker = document.getElementById(`${attackerSide}-unit-${attackerIndex}`);
        const target = (targetIdx !== undefined)
            ? document.getElementById(`${targetSide}-unit-${targetIdx}`)
            : null;

        console.log('[SKILL] resolve ID:', {
            attackerLookupId: `${attackerSide}-unit-${attackerIndex}`, attackerFound: !!attacker,
            targetIdx, targetLookupId: targetIdx !== undefined ? `${targetSide}-unit-${targetIdx}` : '(không tìm)', targetFound: !!target
        });

        if (info.missed) {
            return executeMissedNormal.call(this, attacker, target);
        }
        if (!attacker || !target) return;

        const cfg = this.durationConfig.normal;
        const roll = Math.random();

        if (roll < cfg.physicalStyleChance) {
            window.PkmUnitFX?.showSkillName(attackerSide, attackerIndex, 'Tackle');
            await executePhysicalAttack.call(this, attacker, target, info.damage);
        } else if (roll < cfg.physicalStyleChance + cfg.bigOrbChance) {
            await executeBigOrbSkill.call(this, attacker, target, info);
        } else if (roll < cfg.physicalStyleChance + cfg.bigOrbChance + cfg.streamChance) {
            await executeStreamSkill.call(this, attacker, target, info);   // ← MỚI
        } else {
            await executeThemedNormal.call(this, attacker, target, info);
        }
    }

    Object.assign(SM, {
        skillMetaNormal,
        bigOrbTypeConfig,
        playLightSfx,
        playAttackerMotion_Projectile,
        playAttackerMotion_Summon,
        executePhysicalAttack,
        executeMissedNormal,
        createNormalDamageText,
            playMultiHitDamage,
        splitDamage,
            consumeHit,
            flushHitQueue,
        executeThemedNormal,
        executeBigOrbSkill,
        executeStreamSkill,   // ← MỚI
        playNormalAttack,
    });

})();