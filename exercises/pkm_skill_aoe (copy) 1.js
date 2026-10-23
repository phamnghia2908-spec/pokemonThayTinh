/**
 * ============================================================
 * PKM SKILL AOE — Chiêu diện rộng (tách từ pkm_skill.js cũ)
 * ============================================================
 * SO VỚI pkm_skill.js GỐC, FILE NÀY THAY ĐỔI:
 *
 *  1. KHÔNG còn xử lý "đánh thường" (húc / đấm liên tục / chạy vòng)
 *     — logic đó dời sang pkm_skill_normal.js.
 *     pkm_battle.js đã tự route rồi:
 *         playInfo.isAOE ? SkillManager.play(...) : SkillManager.playNormalAttack(...)
 *     => play() ở đây CHỈ còn chạy khi info.isSkill === true (AOE thật).
 *     Nhánh "đánh hụt" (info.missed) cũng được battle.js route sang
 *     playNormalAttack() luôn (vì missed thì isAOE luôn falsy) nên
 *     play() ở đây KHÔNG cần nhánh missed nữa.
 *
 *  2. durationConfig tách 2 tầng:
 *       this.durationConfig.aoe.*    ← dùng trong file này
 *       this.durationConfig.normal.* ← sẽ được pkm_skill_normal.js
 *                                       gộp vào bằng Object.assign
 *     Mọi spawnXxx trong file này đọc từ durationConfig.aoe.
 *
 *  3. Giao diện CHỌN CHIÊU đổi từ "orb xoay quanh Pokemon" sang
 *     BẢNG BẤM (button panel) nổi ở đáy màn hình — playSkillSelectPanel().
 *     - Người chơi: hiện bảng, có đếm ngược skillChoiceWindow (3s),
 *       bấm chọn hoặc hết giờ tự random.
 *     - AI địch: không hiện bảng, tự chọn ngay sau một khoảng "nghĩ" ngắn.
 *     - Nếu hệ chỉ có 1 chiêu (pool.length===1) thì bỏ qua bảng luôn
 *       (logic này giữ nguyên như bản gốc).
 *
 *  4. window.SoundEngine (Web Audio API, không cần file mp3) — mỗi
 *     chiêu gọi 3 mốc âm thanh riêng: playChargeSfx / playTravelSfx /
 *     playImpactSfx. Impact được gọi TẬP TRUNG trong triggerMultiEffect
 *     (tránh trùng lặp code ở từng spawnXxx), charge/travel do từng
 *     spawnXxx tự gọi vì thời điểm khác nhau tuỳ chiêu.
 *
 *  5. skillMeta{} — bảng tên hiển thị của từng chiêu (dùng để render
 *     label trên bảng bấm). Đặt cạnh từng spawnXxx tương ứng.
 *
 *  6. FILE TEST: mới viết ĐẦY ĐỦ 1 chiêu — spawnElectric (quả cầu điện,
 *     hệ Điện) — và 1 hàm dùng chung spawnDefault cho MỌI hệ chưa có
 *     chiêu riêng. Các hệ khác (lửa, nước, cỏ, ...) sẽ bổ sung dần sau,
 *     chỉ cần thêm hàm spawn<Hệ> + skillMeta tương ứng, không cần sửa
 *     logic tổng quan.
 *
 * pkm_skill_back.js (lớp tint nền theo hệ, fade in/out dần) giữ nguyên,
 * gọi qua toggleSkillScene() như cũ — không đổi trong file này.
 * ============================================================
 */

// Tự động nạp CSS cho Skill (giữ nguyên như bản gốc)
(function () {
    const cssPath = 'pkm_skill.css';
    if (!document.querySelector(`link[href="${cssPath}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = cssPath;
        document.head.appendChild(link);
    }
})();

// ─────────────────────────────────────────────
// SOUND ENGINE — âm thanh tạo bằng Web Audio API, không cần file mp3
// ─────────────────────────────────────────────
window.SoundEngine = {
    _ctx: null,
    getCtx() {
        if (!this._ctx) {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this._ctx.state === 'suspended') this._ctx.resume();
        return this._ctx;
    },

    // Tiếng "tách/zap" điện tử ngắn — hệ Điện
    zap(freqStart = 900, freqEnd = 200, duration = 0.1, volume = 0.15) {
        const ctx = this.getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), ctx.currentTime + duration);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.02);
    },

    // Tiếng "vù/whoosh" — đạn bay, gió, cắt không khí
    whoosh(duration = 0.3, volume = 0.2, freq = 1200) {
        const ctx = this.getCtx();
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(freq * 0.3, ctx.currentTime + duration);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + duration);

        noise.connect(filter).connect(gain).connect(ctx.destination);
        noise.start();
        noise.stop(ctx.currentTime + duration);
    },

    // Tiếng "bùm/boom" trầm — nổ, va chạm mạnh
    boom(duration = 0.35, volume = 0.3, freqStart = 150) {
        const ctx = this.getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + duration);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.02);

        const bufferSize = ctx.sampleRate * 0.08;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(volume * 0.6, ctx.currentTime);
        noise.connect(noiseGain).connect(ctx.destination);
        noise.start();
    },

    // Tiếng "chuông/chime" trong trẻo — Tiên, Tâm linh, phép nhẹ
    chime(freq = 1200, duration = 0.4, volume = 0.12) {
        const ctx = this.getCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.02);
    },

    // Tiếng "rung/rumble" trầm kéo dài — dậm đất, đá lở
    rumble(duration = 0.6, volume = 0.18, freq = 60) {
        const ctx = this.getCtx();
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq, ctx.currentTime);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + duration);

        noise.connect(filter).connect(gain).connect(ctx.destination);
        noise.start();
        noise.stop(ctx.currentTime + duration);
    },

    // Tiếng "sôi bùng/burn" cho lửa
    crackle(duration = 0.3, volume = 0.15) {
        const ctx = this.getCtx();
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1500, ctx.currentTime);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        noise.connect(filter).connect(gain).connect(ctx.destination);
        noise.start();
        noise.stop(ctx.currentTime + duration);
    },

    playDelayed(fnName, delay, ...args) {
        setTimeout(() => {
            if (typeof this[fnName] === 'function') this[fnName](...args);
        }, delay);
    },
};

// ─────────────────────────────────────────────
// SKILL MANAGER — lõi điều phối AOE
// ─────────────────────────────────────────────
window.SkillManager = {
    audioBaseUrl: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/s%20(",

    // Đếm số lượt skill đang chạy đồng thời (2 bên cùng đánh)
    _activeSceneCount: 0,
    _activeAttackers: new Set(),
    _bgInstances: { player: null, enemy: null },

    skillPools: {},

    // ── CONFIG THỜI GIAN — tách namespace .aoe để không đụng .normal ──
    durationConfig: {
        aoe: {
            chargeAura: 900,
            projectileFly: 3000,
            targetSustain: 4000,
            skillChoiceWindow: 3000,
            delayBetween: 300,
            particleLife: 1000,
            electricBolt: 300,
            shake: 800,
            statusText: 1600,
            sceneTransition: 1200,
        },
        // normal: {...} ← pkm_skill_normal.js sẽ Object.assign thêm vào đây
    },

    systemConfig: {
        'electric': { color: '#f1c40f' }, 'fire': { color: '#e67e22' },
        'water': { color: '#3498db' }, 'grass': { color: '#2ecc71' },
        'psychic': { color: '#9b59b6' }, 'fighting': { color: '#e74c3c' },
        'ice': { color: '#74b9ff' }, 'poison': { color: '#a040a0' },
        'ground': { color: '#e2bf65' }, 'flying': { color: '#a890f0' },
        'bug': { color: '#a8b820' }, 'rock': { color: '#b8a038' },
        'ghost': { color: '#705898' }, 'dark': { color: '#705848' },
        'normal': { color: '#a8a878' },
        'steel': { color: '#b8b8d0' },
        'dragon': { color: '#7038f8' },
        'fairy': { color: '#ee99ac' },
    },

    // ── TÊN HIỂN THỊ CỦA TỪNG CHIÊU (dùng cho bảng bấm) ──
    // Chỉ hệ Điện có chiêu thật ở bản test này; các hệ khác dùng
    // spawnDefault nên chưa cần khai báo — thêm dần khi viết chiêu mới.
    skillMeta: {
        fire: {
            spawnFire1: 'Meteor Descent',          // ★ mưa thiên thạch từ trời (dự trù, chưa code)
            spawnFire2: 'Wildfire Torrent',         // Trận pháp lửa thư pháp
            spawnFire3: 'Infernal Spirit Rush',     // Bản thể Thần Lửa khổng lồ
            spawnFire4: 'Solar Flare',              // ★ Skill toàn màn hình
        },
        electric: {
            spawnElectric:  'Thunderbolt',
            spawnElectric1: 'Thunderstorm Descent', // ★ skill mới (giáng thế) — đang làm
            spawnElectric3: 'Thunder Spirit Rush',  // Bản thể Thần Sấm khổng lồ
            spawnElectric4: 'Static Burst',         // ★ Skill toàn màn hình
            spawnElectric5: 'Thunderstorm',         // tên cũ của spawnElectric1 (đổi tên hàm)
        },
        water: {
            spawnWater1: 'Tidal Descent',           // ★ cột nước/vòi rồng giáng từ trời (dự trù)
            spawnWater2: 'Tidal Onslaught',
            spawnWater3: 'Tidal Spirit Rush',       // Bản thể Thần Nước khổng lồ
            spawnWater4: 'Tsunami Surge',           // ★
        },
        grass: {
            spawnGrass1: 'Root Uprising',           // ★ rễ cây/gai gỗ mọc từ đất (dự trù)
            spawnGrass2: 'Verdant Cyclone',
            spawnGrass3: 'Verdant Spirit Rush',     // Bản thể Thần Cỏ khổng lồ
            spawnGrass4: 'Bloom Cascade',           // ★
        },
        ice: {
            spawnIce1: 'Glacial Descent',           // ★ tảng băng rơi từ trời (dự trù)
            spawnIce2: 'Blizzard Fury',
            spawnIce3: 'Glacial Spirit Rush',       // Bản thể Thần Băng khổng lồ
            spawnIce4: 'Absolute Zero',             // ★
        },
        poison: {
            spawnPoison1: 'Venom Downpour',         // ★ giọt độc lớn rơi từ trời (dự trù)
            spawnPoison2: 'Toxic Deluge',
            spawnPoison3: 'Toxic Spirit Rush',      // Bản thể Thần Độc khổng lồ
            spawnPoison4: 'Miasma Surge',           // ★
        },
        ground: {
            spawnGround1: 'Spike Uprising',         // ★ gai đá mọc từ đất (dự trù)
            spawnGround2: 'Seismic Barrage',
            spawnGround3: 'Terra Spirit Rush',      // Bản thể Thần Đất khổng lồ
            spawnGround4: 'Tectonic Rift',          // ★
        },
        flying: {
            spawnFlying1: 'Skyfall Onslaught',      // ★ lông vũ/luồng gió giáng từ trời (dự trù)
            spawnFlying2: 'Gale Onslaught',
            spawnFlying3: 'Tempest Spirit Rush',    // Bản thể Thần Gió khổng lồ
            spawnFlying4: 'Tempest Wing',           // ★
        },
        psychic: {
            spawnPsychic1: 'Cosmic Descent',        // ★ mảnh năng lượng vũ trụ rơi từ trời (dự trù)
            spawnPsychic2: 'Mindquake Surge',
            spawnPsychic3: 'Mind Spirit Rush',      // Bản thể Thần Tâm Linh khổng lồ
            spawnPsychic4: 'Mind Swarm',            // ★
        },
        fighting: {
            spawnFighting1: 'Meteor Fist',          // ★ nắm đấm/thiên thạch giáng từ trời (dự trù)
            spawnFighting2: 'Berserker Onslaught',
            spawnFighting3: 'Warrior Spirit Rush',  // Bản thể Thần Đấu Sĩ khổng lồ
            spawnFighting4: "Titan's Fury",         // ★
        },
        ghost: {
            spawnGhost1: 'Wraith Descent',          // ★ hồn ma giáng/trồi từ 2 phía (dự trù)
            spawnGhost2: 'Spectral Onslaught',
            spawnGhost3: 'Phantom Spirit Rush',     // Bản thể Thần Ma khổng lồ
            spawnGhost4: 'Spectral Wail',           // ★
        },
        bug: {
            spawnBug1: 'Swarm Descent',             // ★ bầy côn trùng rơi/trồi từ đất (dự trù)
            spawnBug2: 'Swarm Onslaught',
            spawnBug3: 'Swarm Spirit Rush',         // Bản thể Thần Côn Trùng khổng lồ
            spawnBug4: 'Swarm Eclipse',             // ★
        },
        rock: {
            spawnRock1: 'Meteor Descent',           // ★ thiên thạch đá rơi từ trời (dự trù)
            spawnRock2: 'Stalagmite Barrage',
            spawnRock3: 'Boulder Spirit Rush',      // Bản thể Thần Đá khổng lồ
            spawnRock4: 'Meteor Fall',               // ★
        },
        dark: {
            spawnDark1: 'Umbral Descent',           // ★ vệt tối giáng/trồi 2 phía (dự trù)
            spawnDark2: 'Umbral Onslaught',
            spawnDark3: 'Abyssal Spirit Rush',      // Bản thể Thần Bóng Tối khổng lồ
            spawnDark4: 'Void Collapse',             // ★
        },
        steel: {
            spawnSteel1: 'Iron Downpour',           // ★ mảnh kim loại rơi từ trời (dự trù)
            spawnSteel2: 'Metallic Onslaught',
            spawnSteel3: 'Titan Spirit Rush',       // Bản thể Thần Thép khổng lồ
            spawnSteel4: 'Iron Cataclysm',          // ★
        },
        dragon: {
            spawnDragon1: 'Draconic Descent',       // ★ mảnh năng lượng rồng giáng từ trời (dự trù)
            spawnDragon2: 'Draconic Onslaught',
            spawnDragon3: 'Draconic Spirit Rush',   // Bản thể Thần Rồng khổng lồ
            spawnDragon4: 'Draconic Ascension',      // ★
        },
        fairy: {
            spawnFairy1: 'Stardust Descent',        // ★ ánh sao/cánh hoa rơi từ trời (dự trù)
            spawnFairy2: 'Fairy Onslaught',
            spawnFairy3: 'Celestial Spirit Rush',   // Bản thể Thần Tiên khổng lồ
            spawnFairy4: 'Starlight Requiem',        // ★
        },
        normal: {
            spawnNormal1: 'Meteoric Judgment',      // ★ vật thể trắng-vàng giáng từ trời (dự trù)
            spawnNormal2: 'Resonant Wavefront',
            spawnNormal3: 'Radiant Spirit Rush',
            spawnNormal4: 'Cosmic Judgment',         // ★ Skill toàn màn hình — 16 ngôi sao hoàng kim bao vây
        },
    },

    getSkillLabel(type, methodName) {
        return (this.skillMeta[type] && this.skillMeta[type][methodName]) || methodName;
    },

    // ─────────────────────────────────────────────
    // QUẢN LÝ POOL CHIÊU (giữ nguyên logic gốc)
    // ─────────────────────────────────────────────
    peekSkillPool(baseMethodName) {
        if (!this.skillPools[baseMethodName] || this.skillPools[baseMethodName].length === 0) {
            // Dò ĐỘNG, không giới hạn cứng ở suffix 3 — quét tới khi hết biến thể
            // (baseMethodName, baseMethodName1, baseMethodName2, ...). GIỮ NGUYÊN
            // thứ tự tăng dần (KHÔNG xáo trộn) để bảng chọn chiêu luôn hiển thị
            // cố định 1→2→3→4→5. Việc CHỌN skill nào vẫn ngẫu nhiên — xem
            // playSkillSelectPanel (Math.random(), không phụ thuộc thứ tự mảng này).
            const candidates = [baseMethodName];
            for (let n = 1; n <= 8; n++) candidates.push(`${baseMethodName}${n}`);
            this.skillPools[baseMethodName] = candidates.filter(name => typeof this[name] === 'function');
        }
        return this.skillPools[baseMethodName];
    },

    consumeSkillFromPool(baseMethodName, methodName) {
        const pool = this.skillPools[baseMethodName];
        if (!pool) return;
        const idx = pool.indexOf(methodName);
        if (idx !== -1) pool.splice(idx, 1);
    },

    getNextSkillMethod(baseMethodName) {
        const pool = this.peekSkillPool(baseMethodName);
        const methodName = pool[Math.floor(Math.random() * pool.length)];
        this.consumeSkillFromPool(baseMethodName, methodName);
        return methodName;
    },

    // Điều phối: người chơi chọn trong bảng bấm 3s, AI tự chọn ngay
    async chooseSkillInteractive(attacker, type, baseMethodName, isPlayerControlled) {
        const pool = this.peekSkillPool(baseMethodName).slice();

        // Chỉ còn 1 chiêu duy nhất -> không cần hỏi, dùng luôn
        if (pool.length === 1) {
            const methodName = pool[0];
            this.consumeSkillFromPool(baseMethodName, methodName);
            await this.playSkillSelectPanel(attacker, type, methodName, baseMethodName, pool, false);
            return methodName;
        }

        const interactive = !!isPlayerControlled;
        const chosen = await this.playSkillSelectPanel(attacker, type, null, baseMethodName, pool, interactive);
        this.consumeSkillFromPool(baseMethodName, chosen);
        return chosen;
    },

    // Hàm đọc tên Pokemon (giữ nguyên, dùng chung với battle.js)
    speakName(name) {
        if (!window.speechSynthesis || !name) return;
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(name);
        msg.lang = 'en-US';
        msg.rate = 1.0;
        window.speechSynthesis.speak(msg);
    },

    // SFX dự phòng từ file mp3 (legacy) — dùng khi 1 hệ chưa có âm SoundEngine riêng
    playRandomSfx() {
        const randomNum = Math.floor(Math.random() * 7) + 1;
        const audioUrl = `${this.audioBaseUrl}${randomNum}).wav`;
        const audio = new Audio(audioUrl);
        audio.volume = 0.6;
        audio.play().catch(() => {});
    },

    // Rung màn hình toàn cục theo scale (Gen càng cao rung càng mạnh)
    applyGlobalShake(scale) {
        const intensity = 2 * scale;
        const duration = 500;
        document.body.animate([
            { transform: `translate(${intensity}px, ${intensity}px)` },
            { transform: `translate(-${intensity}px, -${intensity * 2}px)` },
            { transform: `translate(-${intensity * 2}px, 0px)` },
            { transform: `translate(${intensity * 2}px, ${intensity}px)` },
            { transform: `translate(0px, 0px)` }
        ], { duration: 100, iterations: duration / 100 });
    },

    // ── 3 MỐC ÂM THANH — mỗi hệ tự tra, có fallback chung ──
    playChargeSfx(type) {
        switch (type) {
            case 'electric': window.SoundEngine.zap(300, 900, 0.25, 0.12); break;
            case 'fire':     window.SoundEngine.crackle(0.3, 0.12); break;
            case 'ground':
            case 'rock':     window.SoundEngine.rumble(0.4, 0.14); break;
            case 'fairy':
            case 'psychic':  window.SoundEngine.chime(900, 0.35, 0.1); break;
            default:         window.SoundEngine.chime(700, 0.3, 0.08);
        }
    },
    playTravelSfx(type) {
        switch (type) {
            case 'electric': window.SoundEngine.whoosh(0.25, 0.15, 1600); break;
            case 'flying':   window.SoundEngine.whoosh(0.2, 0.16, 2000); break;
            default:         window.SoundEngine.whoosh(0.25, 0.12, 1000);
        }
    },
    playImpactSfx(type) {
        switch (type) {
            case 'electric': window.SoundEngine.zap(900, 150, 0.15, 0.2); break;
            case 'fighting':
            case 'ground':
            case 'rock':      window.SoundEngine.boom(0.35, 0.28); break;
            default:          window.SoundEngine.boom(0.3, 0.2);
        }
    },

    // ─────────────────────────────────────────────
    // LỚP TINT NỀN THEO HỆ (giữ nguyên, phần fade-in/out do
    // pkm_skill_back.js đảm nhận qua instance.show()/hide())
    // ─────────────────────────────────────────────
    toggleSkillScene(show, side = '', attackerIndex = null, type = 'normal') {
        const arena = document.getElementById('battle-arena');

        if (show) {
            this._activeSceneCount++;
            this._activeAttackers.add(`${side}-unit-${attackerIndex}`);

            let sideOverlay = document.getElementById(`skill-scene-overlay-${side}`);
            if (!sideOverlay) {
                sideOverlay = document.createElement('div');
                sideOverlay.id = `skill-scene-overlay-${side}`;
                if (arena) arena.appendChild(sideOverlay); // ✅ nằm TRONG arena, không phải body
                else document.body.appendChild(sideOverlay);
            }
            sideOverlay.style.cssText = `
                position: absolute;
                inset: 0;
                overflow: hidden;
                z-index: 0;
                pointer-events: none;
                display: block;
                opacity: 1;
            `;

            if (!this._bgInstances[side] && window.PkmSkillBack) {
                this._bgInstances[side] = window.PkmSkillBack.createInstance();
            }

            const attackerEl = document.getElementById(`${side}-unit-${attackerIndex}`);
            const posX = attackerEl?.getAttribute('data-left') || '50';
            const posY = attackerEl?.getAttribute('data-top') || '50';
            if (this._bgInstances[side]) {
                this._bgInstances[side].show(sideOverlay, type, posX, posY);
            }

        } else {
            const sideOverlay = document.getElementById(`skill-scene-overlay-${side}`);
            if (sideOverlay && this._bgInstances[side]) {
                this._bgInstances[side].hide(sideOverlay);
            }

            this._activeSceneCount = Math.max(0, this._activeSceneCount - 1);
            if (this._activeSceneCount > 0) return;

            this._activeAttackers.clear();
        }
    },

    // ─────────────────────────────────────────────
    // BẢNG BẤM CHỌN CHIÊU (thay thế orb xoay quanh cũ)
    // ─────────────────────────────────────────────
    // ── ICON THEO HỆ (hiện trên nút tròn) ──
    getTypeIcon(type) {
        const icons = {
            fire: '🔥', water: '💧', electric: '⚡', grass: '🌿',
            ice: '❄️', poison: '☠️', ground: '⛰️', flying: '🌪️',
            psychic: '🔮', fighting: '👊', ghost: '👻', bug: '🐛',
            rock: '🪨', dark: '🌑', steel: '⚙️', dragon: '🐉',
            fairy: '✨', normal: '⭐',
        };
        return icons[type] || '✦';
    },

    // ── CSS cho bảng chọn chiêu kiểu Pokémon Masters (chỉ inject 1 lần) ──
    injectSkillPanelStyles() {
        if (document.getElementById('pkm-skillpanel-style')) return;
        const style = document.createElement('style');
        style.id = 'pkm-skillpanel-style';
        style.textContent = `
            .pkm-skillpanel-wrap {
                position: fixed;
                left: 50%; bottom: 20px;
                transform: translateX(-50%) translateY(30px) scale(0.85);
                opacity: 0;
                z-index: 10010;
                transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
                pointer-events: none;
            }
            .pkm-skillpanel-wrap.show {
                opacity: 1;
                transform: translateX(-50%) translateY(0) scale(1);
                pointer-events: auto;
            }
            .pkm-skillpanel-wrap.hide {
                opacity: 0;
                transform: translateX(-50%) translateY(20px) scale(0.9);
            }
            .pkm-skillpanel-card {
                position: relative;
                background: radial-gradient(ellipse at 50% 0%, rgba(45,30,35,0.96) 0%, rgba(15,10,12,0.97) 75%);
                border: 3px solid var(--accent, #ffcb05);
                border-radius: 26px;
                padding: 22px 18px 16px;
                box-shadow: 0 0 30px var(--accent, #ffcb05), inset 0 0 20px rgba(255,255,255,0.05);
                min-width: 220px;
            }
            .pkm-skillpanel-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 16px 26px;
                position: relative;
            }
            .pkm-skillpanel-btn {
                position: relative;
                width: 76px; height: 76px;
                border-radius: 50%;
                border: 3px solid rgba(255,255,255,0.3);
                background: radial-gradient(circle at 35% 30%, var(--accent, #ffcb05) 0%, rgba(0,0,0,0.55) 100%);
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.25);
                transition: transform 0.15s ease, border-color 0.15s ease;
                margin: 0 auto;
            }
            .pkm-skillpanel-btn:active {
                transform: scale(0.92);
                border-color: #fff;
            }
            .pkm-skillpanel-icon {
                font-size: 20px;
                text-shadow: 0 0 6px rgba(255,255,255,0.8);
                margin-bottom: 2px;
            }
            .pkm-skillpanel-label {
                font-size: 10px;
                font-weight: 800;
                color: #fff;
                text-align: center;
                line-height: 1.15;
                padding: 0 4px;
                text-shadow: 1px 1px 2px rgba(0,0,0,0.85);
            }
            .pkm-skillpanel-hex {
                position: absolute;
                left: 50%; top: 50%;
                transform: translate(-50%, -50%);
                width: 56px; height: 56px;
                z-index: 2;
            }
            .pkm-skillpanel-hex-ring {
                position: absolute; inset: 0;
                clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%);
                background: linear-gradient(160deg, #fff 0%, var(--accent, #ffcb05) 55%, rgba(0,0,0,0.4) 100%);
                box-shadow: 0 0 16px var(--accent, #ffcb05);
                animation: pkm-skillpanel-pulse 1s ease-in-out infinite;
            }
            .pkm-skillpanel-hex-num {
                position: absolute; inset: 0;
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-weight: 900; font-size: 20px;
                text-shadow: 1px 1px 2px #000;
            }
            @keyframes pkm-skillpanel-pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.08); }
            }
        `;
        document.head.appendChild(style);
    },
    injectAnnounceBannerStyles() {
        if (document.getElementById('pkm-announce-style')) return;
        const style = document.createElement('style');
        style.id = 'pkm-announce-style';
        style.textContent = `
            .pkm-announce-wrap {
                position: absolute; inset: 0;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                z-index: 10020; opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
                overflow: hidden;
            }
            .pkm-announce-wrap.show { opacity: 1; }

            .pkm-announce-dim {
                position: absolute; inset: 0;
                background: radial-gradient(ellipse 75% 65% at 50% 45%, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.15) 55%, transparent 80%);
            }

            .pkm-announce-avatar-big {
                position: relative;
                width: min(58%, 230px);
                height: min(58%, 230px);
                object-fit: contain;
                z-index: 2;
                filter: drop-shadow(0 10px 16px rgba(0,0,0,0.6));
                transform: scale(0.6) translateY(30px);
                opacity: 0;
                transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease;
            }
            .pkm-announce-wrap.show .pkm-announce-avatar-big {
                transform: scale(1) translateY(0);
                opacity: 1;
            }

            /* Khối ruy băng đè lên khoảng 1/3 dưới avatar */
            .pkm-announce-ribbons {
                position: relative;
                width: 100%;
                margin-top: -34%;
                z-index: 3;
                display: flex;
                flex-direction: column;
                align-items: stretch;
            }

            /* Icon âm dương góc trên-trái của dải chính */
            .pkm-announce-yinyang {
                position: absolute;
                left: 6%;
                top: 8px;
                width: 34px; height: 34px;
                z-index: 4;
                filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));
                opacity: 0;
                transform: scale(0.5) rotate(-30deg);
                transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1) 0.15s, opacity 0.25s ease 0.15s;
            }
            .pkm-announce-wrap.show .pkm-announce-yinyang {
                opacity: 1; transform: scale(1) rotate(0deg);
            }

            /* Dải mỏng phía trên, màu xanh lục, to bên trái nhỏ dần bên phải */
            .pkm-announce-ribbon-top {
                width: 92%; margin: 0 auto;
                height: 14px;
                background: linear-gradient(90deg, #8de85a 0%, #4caf2e 60%, #4caf2e 100%);
                clip-path: polygon(0% 0%, 100% 25%, 100% 75%, 0% 100%);
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                transform: scaleX(0);
                transform-origin: left center;
                transition: transform 0.3s ease-out 0.05s;
                margin-bottom: -3px;
            }
            .pkm-announce-wrap.show .pkm-announce-ribbon-top {
                transform: scaleX(1);
            }

            /* Dải chính, to hơn, màu xanh biển, vuốt nhọn dần sang phải */
            .pkm-announce-ribbon-main {
                position: relative;
                width: 100%;
                min-height: 58px;
                display: flex; align-items: center; justify-content: center;
                background:
                    repeating-linear-gradient(115deg, rgba(255,255,255,0.12) 0px, rgba(255,255,255,0.12) 8px, transparent 8px, transparent 22px),
                    linear-gradient(180deg, #57c6f7 0%, #1e90d8 55%, #0d6cb0 100%);
                clip-path: polygon(0% 4%, 100% 22%, 100% 78%, 0% 96%);
                border-top: 2px solid rgba(255,255,255,0.5);
                box-shadow: 0 6px 14px rgba(0,0,0,0.4);
                transform: scaleX(0);
                transform-origin: left center;
                transition: transform 0.32s cubic-bezier(0.22,1,0.36,1) 0.08s;
            }
            .pkm-announce-wrap.show .pkm-announce-ribbon-main {
                transform: scaleX(1);
            }

            .pkm-announce-ribbon-text {
                color: #fff;
                font-weight: 900;
                font-size: clamp(15px, 3.6vw, 21px);
                text-align: center;
                text-shadow: 1px 2px 3px rgba(0,0,0,0.5);
                padding: 0 20% 0 12%;
                opacity: 0;
                transition: opacity 0.25s ease 0.25s;
                line-height: 1.15;
            }
            .pkm-announce-wrap.show .pkm-announce-ribbon-text {
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    },
    async showSkillAnnounceBanner(side, label, attackerIndex) {
        this.injectAnnounceBannerStyles();
        const trainerUrl = window.PkmStyles?.getTrainerUrl
            ? window.PkmStyles.getTrainerUrl(side, attackerIndex)
            : 'https://play.pokemonshowdown.com/sprites/trainers/red.png';

        // Neo vào #battle-arena (khu 2/3 chiến đấu), KHÔNG dùng document.body,
        // để không tràn sang khu quiz (1/3 còn lại của màn hình).
        const arena = document.getElementById('battle-arena') || document.body;

        const wrap = document.createElement('div');
        wrap.className = 'pkm-announce-wrap';
        wrap.innerHTML = `
            <div class="pkm-announce-dim"></div>
            <img class="pkm-announce-avatar-big" src="${trainerUrl}" alt="trainer">
            <div class="pkm-announce-ribbons">
                <svg class="pkm-announce-yinyang" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="18" fill="#fff" stroke="#222" stroke-width="1.5"/>
                    <path d="M20,2 A18,18 0 0,1 20,38 A9,9 0 0,1 20,20 A9,9 0 0,0 20,2 Z" fill="#222"/>
                    <circle cx="20" cy="11" r="3" fill="#222"/>
                    <circle cx="20" cy="29" r="3" fill="#fff"/>
                </svg>
                <div class="pkm-announce-ribbon-top"></div>
                <div class="pkm-announce-ribbon-main">
                    <div class="pkm-announce-ribbon-text">${label}</div>
                </div>
            </div>
        `;
        arena.appendChild(wrap);
        requestAnimationFrame(() => wrap.classList.add('show'));

        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(label);
            utter.lang = 'en-US';
            window.speechSynthesis.speak(utter);
        }

        await new Promise(r => setTimeout(r, 1400));
        wrap.classList.remove('show');
        setTimeout(() => wrap.remove(), 300);
    },
    async playSkillSelectPanel(attackerEl, type, chosenMethod, baseMethodName, pool, interactive) {
        const methods = (pool && pool.length > 0) ? pool : [baseMethodName];

        // AI địch: không hiện bảng, tự chọn sau một khoảng "suy nghĩ" ngắn
        if (!interactive) {
            await new Promise(r => setTimeout(r, 300));
            return chosenMethod || methods[Math.floor(Math.random() * methods.length)];
        }

        this.injectSkillPanelStyles();
        const color = (this.systemConfig[type] || {}).color || '#ffcb05';

        return new Promise((resolve) => {
            const wrap = document.createElement('div');
            wrap.className = 'pkm-skillpanel-wrap';
            wrap.style.setProperty('--accent', color);

            const card = document.createElement('div');
            card.className = 'pkm-skillpanel-card';
            wrap.appendChild(card);

            const grid = document.createElement('div');
            grid.className = 'pkm-skillpanel-grid';
            card.appendChild(grid);

            const trainerAvatar = document.createElement('img');
            trainerAvatar.src = 'https://play.pokemonshowdown.com/sprites/trainers/red.png';
            trainerAvatar.style.cssText = `
                position:absolute; left:-28px; bottom:-6px;
                width:70px; height:auto; z-index:3; pointer-events:none;
                filter: drop-shadow(2px 4px 4px rgba(0,0,0,0.5));
            `;
            card.appendChild(trainerAvatar);

            // Hình lục giác đếm ngược ở giữa
            const hex = document.createElement('div');
            hex.className = 'pkm-skillpanel-hex';
            hex.innerHTML = `<div class="pkm-skillpanel-hex-ring"></div><div class="pkm-skillpanel-hex-num"></div>`;
            card.appendChild(hex);
            const hexNum = hex.querySelector('.pkm-skillpanel-hex-num');

            // Các nút tròn xếp lưới 2 cột quanh hex trung tâm
            methods.forEach((methodName) => {
                const btn = document.createElement('button');
                btn.className = 'pkm-skillpanel-btn';
                btn.innerHTML = `
                    <div class="pkm-skillpanel-icon">${this.getTypeIcon(type)}</div>
                    <div class="pkm-skillpanel-label">${this.getSkillLabel(type, methodName)}</div>
                `;
                btn.addEventListener('click', () => finish(methodName));
                grid.appendChild(btn);
            });

            document.body.appendChild(wrap);
            requestAnimationFrame(() => wrap.classList.add('show'));

            let done = false;
            const finish = (methodName) => {
                if (done) return;
                done = true;
                clearInterval(timer);
                wrap.classList.remove('show');
                wrap.classList.add('hide');
                setTimeout(() => wrap.remove(), 220);
                resolve(methodName);
            };

            const startTime = performance.now();
            const windowMs = this.durationConfig.aoe.skillChoiceWindow;
            hexNum.innerText = Math.ceil(windowMs / 1000);
            const timer = setInterval(() => {
                const remain = Math.max(0, Math.ceil((windowMs - (performance.now() - startTime)) / 1000));
                hexNum.innerText = remain;
                if (remain <= 0) finish(methods[Math.floor(Math.random() * methods.length)]);
            }, 200);
        });
    },

    // ─────────────────────────────────────────────
    // play() — ĐIỀU PHỐI CHIÊU AOE (CHỈ AOE, không còn đánh thường/hụt)
    // Được gọi từ pkm_battle.js: playInfo.isAOE ? SkillManager.play(info) : ...
    // ─────────────────────────────────────────────
    async play(info) {
        return new Promise(async (resolve) => {
            const attackerSide = info.attackerSide;
            const attackerIndex = info.attackerIndex;
            const attacker = document.getElementById(`${attackerSide}-unit-${attackerIndex}`);
            const aliveTargets = info.targets || [];

            if (!attacker) { resolve(); return; }

            // Bật lớp tint nền theo hệ (fade-in do pkm_skill_back.js xử lý)
            if (!info.skipScene) {
                this.toggleSkillScene(true, attackerSide, attackerIndex, info.type);
            }

            aliveTargets.forEach(idx => {
                const targetEl = document.getElementById(`${info.targetSide}-unit-${idx}`);
                if (targetEl) targetEl.style.zIndex = '10000';
            });

            // Số hạt/tia + kích thước theo Gen (giữ nguyên buff Đời 1 đã chỉnh trước đó)
            let countPerTarget = 1, sizeScale = 1;
            switch (info.gen) {
                case 1: countPerTarget = 4; sizeScale = 1.6; break;
                case 2: countPerTarget = 5; sizeScale = 1.8; break;
                case 3: countPerTarget = 6; sizeScale = 2.2; break;
                case 'mega':
                case 4: countPerTarget = 10; sizeScale = 3.0; break;
            }

            const pos = {
                scale: parseFloat(attacker.dataset.scale) || 1,
                flip: parseFloat(attacker.dataset.flip) || 1
            };
            attacker.style.zIndex = '10001';

            const baseMethodName = `spawn${info.type.charAt(0).toUpperCase() + info.type.slice(1)}`;

            // PHASE 1: GỒNG CHIÊU (thu nhỏ tại chỗ)
            const imgWrapper = attacker.querySelector('div');
            if (imgWrapper) {
                imgWrapper.style.transition = `transform 0.3s ease-in`;
                imgWrapper.style.transform = `scale(${pos.scale * 0.85}) scaleX(${pos.flip})`;
            }

            // PHASE 2: CHỌN CHIÊU — bảng bấm (player) / auto (AI)
            const chosenMethod = await this.chooseSkillInteractive(
                attacker, info.type, baseMethodName, attackerSide === 'player'
            );

            // PHASE 2.5: BANNER TÊN CHIÊU + AVATAR TRAINER
            await this.showSkillAnnounceBanner(attackerSide, this.getSkillLabel(info.type, chosenMethod), attackerIndex);

            // PHASE 3: BUNG CHIÊU (phóng to lại rồi về scale gốc)
            if (imgWrapper) {
                imgWrapper.style.transition = `transform 0.2s cubic-bezier(0.34,1.56,0.64,1)`;
                imgWrapper.style.transform = `scale(${pos.scale * 1.2}) scaleX(${pos.flip})`;
                await new Promise(r => setTimeout(r, 200));
                imgWrapper.style.transform = `scale(${pos.scale}) scaleX(${pos.flip})`;
            }

            if (this.playRandomSfx) this.playRandomSfx();

            // PHASE 4: TUNG CHIÊU tới từng mục tiêu (song song)
            const allAnimations = aliveTargets.map(targetIdx =>
                this.triggerMultiEffect(attacker, targetIdx, info.targetSide, countPerTarget, sizeScale, info.type, info.damage, chosenMethod)
            );
            await Promise.all(allAnimations);

            // PHASE 5: THU QUÂN
            attacker.style.transition = 'transform 0.3s ease-out';
            attacker.style.transform = 'translate(-50%,-50%)';
            await new Promise(r => setTimeout(r, 320));
            attacker.style.transition = '';
            attacker.style.zIndex = '';

            setTimeout(() => {
                if (!info.skipScene) this.toggleSkillScene(false, attackerSide);
                resolve();
            }, this.durationConfig.aoe.sceneTransition);
        });
    },

    // 1 mục tiêu: chạy spawnXxx đã chọn -> va chạm -> rung + text + sustain CSS
    // ĐÃ SỬA THEO YÊU CẦU: COI MỌI CHIÊU LÀ "TOÀN MÀN HÌNH" — action() chỉ thực
    // sự được gọi ĐÚNG 1 LẦN cho cả đòn đánh, dù trúng bao nhiêu mục tiêu. Các
    // mục tiêu còn lại chỉ CHỜ CHUNG 1 promise, KHÔNG vẽ lại hiệu ứng nền —
    // tránh chồng CSS/DOM theo số lượng mục tiêu gây đơ máy.
    // ══════════════════════════════════════════════
    // BỌC CHUNG — biến MỌI chiêu "chỉ nhắm 1 mục tiêu" thành "toàn màn hình"
    // MÀ KHÔNG SỬA GÌ bên trong từng hàm spawnXxx gốc. Cách làm: gọi lại ĐÚNG
    // hàm gốc đó nhiều lần song song, mỗi lần cho nó 1 "điểm ảo" (div ẩn, rỗng,
    // rải ngẫu nhiên khắp arena) làm endEl — hàm gốc tưởng đang bay tới Pokémon
    // thật nhưng thực ra đang bay tới toạ độ ảo đó, tạo cảm giác phủ khắp màn hình.
    // ══════════════════════════════════════════════
        async runAsScreenBarrage(action, attacker, realTarget, count, scale, targetSide, damage) {
        const arena = document.getElementById('battle-arena');
        const arenaRect = arena ? arena.getBoundingClientRect()
                                 : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

        // Ô giữa của bên bị đánh: dich_2 (nếu đánh địch) hoặc ta_2 (nếu đánh mình)
        // — đây chính là "tâm quân địch" theo bố cục vòng cung trong pkm_styles.js
        const prefix = targetSide === 'player' ? 'ta' : 'dich';
        const midPos = window.PkmStyles?.positions?.[`${prefix}_2`]
            || { left: 50, top: targetSide === 'player' ? 80 : 18 };

        const px = arenaRect.left + arenaRect.width * (midPos.left / 100);
        const py = arenaRect.top + arenaRect.height * (midPos.top / 100);

        // CHỈ 1 điểm ảo duy nhất, dù bên địch còn 1 hay 3 quân
        const singlePoint = document.createElement('div');
        singlePoint.style.cssText = `position:fixed; left:${px}px; top:${py}px; width:1px; height:1px; pointer-events:none; opacity:0;`;
        singlePoint.dataset.targetSide = targetSide; // ✅ để spawn3 (giant spirit) biết đẩy lùi đúng phe
        document.body.appendChild(singlePoint);

            await action.call(this, attacker, singlePoint, count, scale, damage); // gọi action() ĐÚNG 1 LẦN

        singlePoint.remove();
    },
    async triggerMultiEffect(attacker, targetIdx, targetSide, count, sizeScale, type, damage, methodName) {
        const target = document.getElementById(`${targetSide}-unit-${targetIdx}`);
        if (!target) return;

        const baseMethodName = `spawn${type.charAt(0).toUpperCase() + type.slice(1)}`;
        let action = typeof this[methodName] === 'function' ? this[methodName] : this[baseMethodName];
        if (typeof action !== 'function') action = this.spawnDefault;

        // Cache promise theo attacker + tên chiêu: mục tiêu ĐẦU TIÊN xử lý sẽ thực
        // sự gọi action() (vẽ hiệu ứng đúng 1 lần), mọi mục tiêu còn lại chỉ CHỜ
        // CHUNG đúng promise đó, không tạo lại DOM/particle.
        if (!attacker._screenSkillCache) attacker._screenSkillCache = {};
        const cache = attacker._screenSkillCache;

        if (!cache[methodName]) {
            // Chỗ đang gọi (trong triggerMultiEffect):
            cache[methodName] = this.runAsScreenBarrage(action, attacker, target, count, sizeScale, targetSide, damage);
            cache[methodName].finally(() => { delete cache[methodName]; });
        }
        await cache[methodName];

        // GIAI ĐOẠN B: va chạm — rung, damage text (mặc định dramatic=true cho AOE), sfx tập trung
        // Phần này LUÔN chạy riêng cho từng mục tiêu (nhẹ, không gây đơ) — mỗi Pokémon
        // trúng đòn vẫn có số damage/rung/viền riêng dù hiệu ứng nền dùng chung.
        this.applyGlobalShake(sizeScale);
        this.playImpactSfx(type);
        this.createDamageText(target, damage, true);

    const sustainClass = `sustain-${type}`;
        target.classList.add('shake', sustainClass);
        this.attachSustainFlames(target, type);
        await new Promise(r => setTimeout(r, this.durationConfig.aoe.targetSustain));
        target.classList.remove('shake', sustainClass);
        this.removeSustainFlames(target);
    },

    // ══════════════════════════════════════════════
    // HỆ ĐIỆN — spawnElectric (Quả Cầu Điện)
    // Timeline: GỒNG (chargeAura) -> DI CHUYỂN (projectileFly) -> NỔ
    // ══════════════════════════════════════════════
    // ══════════════════════════════════════════════
    // SKILL 1 HỆ ĐIỆN — Thunderbolt (Tia Sét Phóng Điện)
    // Dạng kỹ năng: Phóng các tia chớp zigzag trực tiếp từ ta sang địch
    // Tối ưu hóa: Dùng DocumentFragment, giảm segment, rải đều delay bất đồng bộ
    // ══════════════════════════════════════════════
    async spawnElectric(startEl, endEl, count, scale, data) {
        const rectS = startEl.getBoundingClientRect();
        const rectE = endEl.getBoundingClientRect();
        const totalSpan = this.durationConfig.aoe.projectileFly; // Đọc từ config chuẩn aoe

        // Giới hạn số lượng tia sét đồng thời xuất hiện hợp lý, tránh nghẽn DOM
        const numBolts = Math.min(8, Math.max(4, count)); 
        const boltDuration = 120; // Thời gian tồn tại chớp nhoáng của mỗi tia sét

        const startX = rectS.left + rectS.width / 2;
        const startY = rectS.top + rectS.height / 2;
        const endX   = rectE.left + rectE.width / 2;
        const endY   = rectE.top + rectE.height / 2;

        // Kích hoạt âm thanh gồng chiêu tích điện hệ Điện đầu trận
        this.playChargeSfx('electric');

        // Hàm xử lý tạo riêng rẽ từng tia một cách bất đồng bộ để chia nhỏ tải cho GPU/CPU
        const spawnSingleBolt = (delay, index) => {
            return new Promise((resolveBolt) => {
                setTimeout(() => {
                    let curX = startX, curY = startY;
                    const segments = 6; // 6 đoạn chuẩn zigzag, mượt và giảm tải DOM
                    const fragment = document.createDocumentFragment();
                    const currentSegmentsEls = [];

                    // Kèm theo một tiếng giật điện nhỏ (zap) tương ứng với thời gian xuất hiện của từng tia
                    if (window.SoundEngine) {
                        window.SoundEngine.playDelayed('zap', 0, 900 - (index * 30), 100, 0.15, 0.15);
                    }

                    for (let j = 1; j <= segments; j++) {
                        const t = j / segments;
                        const noise = (Math.random() - 0.5) * 45 * scale;

                        // Điểm kết thúc bắt buộc phải trúng đích, các đoạn giữa lệch ngẫu nhiên
                        const nextX = j === segments ? endX : (startX + (endX - startX) * t + noise);
                        const nextY = j === segments ? endY : (startY + (endY - startY) * t + (Math.random() - 0.5) * 25 * scale);

                        const dx = nextX - curX;
                        const dy = nextY - curY;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        const bolt = document.createElement('div');
                        bolt.className = 'pkm-particle particle-electric';

                        // Chiều cao lõi tia sét lớn từ 6px-9px nhân theo tỉ lệ để tia điện dày rõ rệt
                        const boltHeight = (6 + Math.random() * 3) * scale;

                        bolt.style.cssText = `
                            position: fixed; left: ${curX}px; top: ${curY}px;
                            width: ${dist}px; height: ${boltHeight}px;
                            background: rgba(255, 255, 255, 0.95);
                            transform: rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg);
                            transform-origin: 0 50%;
                            /* Tăng bán kính vầng sáng màu vàng bao quanh bung to rực rỡ */
                            box-shadow: 0 0 ${10 * scale}px #fff, 0 0 ${25 * scale}px #f1c40f, 0 0 ${40 * scale}px #ff9f43;
                            z-index: 9999;
                            pointer-events: none;
                            will-change: transform, opacity;
                        `;

                        fragment.appendChild(bolt);
                        currentSegmentsEls.push(bolt);

                        curX = nextX;
                        curY = nextY;
                    }

                    // Đẩy nguyên 1 cụm tia vào DOM cùng một lúc thông qua fragment để tối ưu performance
                    document.body.appendChild(fragment);

                    // Xóa nhanh phần tử ngay khi diễn hoạt xong để giải phóng bộ nhớ
                    setTimeout(() => {
                        currentSegmentsEls.forEach(el => el.remove());
                        resolveBolt();
                    }, boltDuration);

                }, delay);
            });
        };

        const boltPromises = [];
        for (let i = 0; i < numBolts; i++) {
            // Rải đều thời gian bắn ngẫu nhiên các tia trong khoảng thời gian xả chiêu
            const delay = (i / numBolts) * (totalSpan * 0.5);
            boltPromises.push(spawnSingleBolt(delay, i));
        }

        await Promise.all(boltPromises);
    },
    // HỆ ĐIỆN
    // SKILL 3 HỆ ĐIỆN — spawnElectric3 (Bão Điện Thiên Lôi)
    // Dạng kỹ năng: Triệu hồi bão mây tĩnh điện và giáng sấm sét liên tục
    // ══════════════════════════════════════════════
    async spawnElectric5(startEl, endEl, count, scale) {
        const cfg = this.durationConfig.aoe;
        const rectE = endEl.getBoundingClientRect();
        const centerX = rectE.left + rectE.width / 2;
        const centerY = rectE.top + rectE.height / 2;
        const cloudY  = rectE.top - 50 * scale;

        const chargeMs  = cfg.chargeAura;
        const sustainMs = cfg.targetSustain;
        const totalMs   = chargeMs + sustainMs;

        const allEls = [];

        // Kích hoạt âm thanh gồng chiêu tích điện
        this.playChargeSfx('electric');

        // 1. Mây tích điện (được tối ưu hóa kích thước theo scale)
        const cloudW = 110 * scale;
        const cloudH = 55  * scale;
        const cloud = document.createElement('div');
        cloud.style.cssText = `
            position: fixed; left: ${centerX - cloudW / 2}px; top: ${cloudY - cloudH / 2}px;
            width: ${cloudW}px; height: ${cloudH}px;
            background: radial-gradient(ellipse at center, #34495e 20%, #1c2833 70%, transparent 100%);
            border-radius: 50%; z-index: 9998;
            filter: blur(${6 * scale}px); pointer-events: none;
            opacity: 0; transform: scale(0.5);
            will-change: transform, opacity;
        `;
        document.body.appendChild(cloud);
        allEls.push(cloud);

        cloud.animate([
            { opacity: 0, transform: 'scale(0.5)' },
            { opacity: 0.9, transform: 'scale(1)' }
        ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' });

        // 2. Tia tĩnh điện lấm tấm quanh đám mây
        const sparkCount = Math.max(12, count * 5);
        for (let i = 0; i < sparkCount; i++) {
            const spark = document.createElement('div');
            const sx = centerX + (Math.random() - 0.5) * cloudW;
            const sy = cloudY  + (Math.random() - 0.5) * cloudH;
            const delay = chargeMs * 0.2 + Math.random() * (totalMs - chargeMs * 0.2);
            spark.style.cssText = `
                position: fixed; left: ${sx}px; top: ${sy}px;
                width: ${2 * scale}px; height: ${2 * scale}px; background: #fff;
                box-shadow: 0 0 ${5 * scale}px #f1c40f; z-index: 9999; pointer-events: none;
                opacity: 0; will-change: opacity;
            `;
            document.body.appendChild(spark);
            allEls.push(spark);
            spark.animate([
                { opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }
            ], { duration: 220, delay, fill: 'forwards' });
        }

        // Kích hoạt âm thanh tiếng gió rít/travel sfx chuẩn bị giáng sét
        window.SoundEngine.playDelayed('whoosh', chargeMs * 0.8, 0.3, 0.15, 1400);

        // 3. Giáng loạt tia sét zigzag dồn dập xuống đối thủ
        const boltCount = Math.max(8, count * 4); 
        const strikeStart = chargeMs;
        const strikeSpan  = sustainMs;

        for (let i = 0; i < boltCount; i++) {
            const delay = strikeStart + (i / boltCount) * strikeSpan + Math.random() * 100;
            const x1 = centerX + (Math.random() - 0.5) * cloudW * 0.7;
            const y1 = cloudY;
            const x2 = centerX + (Math.random() - 0.5) * cloudW * 0.4;
            const y2 = centerY;

            this.createZigzagBoltDelayed(x1, y1, x2, y2, scale, delay, allEls);

            // Cứ mỗi tia sét giáng xuống, kèm theo một tiếng zap/ nổ sấm nhỏ tương ứng với delay
            window.SoundEngine.playDelayed('zap', delay, 800 - (i * 20), 200, 0.12, 0.12);
        }

        // Chờ toàn bộ quá trình thực hiện xong và quét dọn các thẻ DOM dư thừa
        await new Promise((r) => setTimeout(r, totalMs));
        allEls.forEach((el) => el.remove());
    },

    // Tạo 1 tia sét zigzag hiển thị ngay lập tức (Đồng bộ)
    createZigzagBolt(x1, y1, x2, y2, scale) {
        const segments = 10;
        let curX = x1, curY = y1;

        for (let i = 1; i <= segments; i++) {
            const targetX = x1 + (x2 - x1) * (i / segments);
            const targetY = y1 + (y2 - y1) * (i / segments);

            const noise = (Math.random() - 0.5) * 70 * scale;
            const nextX = i < segments ? targetX + noise : x2;
            const nextY = targetY;

            const dist = Math.sqrt((nextX - curX)**2 + (nextY - curY)**2);

            const bolt = document.createElement('div');
            bolt.style.cssText = `
                position: fixed; left: ${curX}px; top: ${curY}px;
                width: ${dist}px; height: ${1.5 * scale}px; 
                background: #fff;
                transform: rotate(${Math.atan2(nextY - curY, nextX - curX) * 180 / Math.PI}deg);
                transform-origin: 0 50%;
                box-shadow: 0 0 8px #fff, 0 0 15px #f1c40f;
                z-index: 9999; pointer-events: none;
            `;
            document.body.appendChild(bolt);
            setTimeout(() => bolt.remove(), 120);

            curX = nextX; curY = nextY;
        }
    },

    // Tạo tia sét tĩnh và điều khiển hiển thị bằng animation delay (Tối ưu Mobile)
    createZigzagBoltDelayed(x1, y1, x2, y2, scale, delay, collector) {
        const segments = 10;
        let curX = x1, curY = y1;

        for (let i = 1; i <= segments; i++) {
            const targetX = x1 + (x2 - x1) * (i / segments);
            const targetY = y1 + (y2 - y1) * (i / segments);

            const noise = (Math.random() - 0.5) * 60 * scale;
            const nextX = i < segments ? targetX + noise : x2;
            const nextY = targetY;

            const dist = Math.sqrt((nextX - curX) ** 2 + (nextY - curY) ** 2);

            const bolt = document.createElement('div');
            bolt.style.cssText = `
                position: fixed; left: ${curX}px; top: ${curY}px;
                width: ${dist}px; height: ${1.5 * scale}px;
                background: #fff;
                transform: rotate(${Math.atan2(nextY - curY, nextX - curX) * 180 / Math.PI}deg);
                transform-origin: 0 50%;
                box-shadow: 0 0 ${8 * scale}px #fff, 0 0 ${15 * scale}px #f1c40f;
                z-index: 9999; pointer-events: none;
                opacity: 0; will-change: opacity;
            `;
            document.body.appendChild(bolt);
            if (collector) collector.push(bolt);

            bolt.animate([
                { opacity: 0 },
                { opacity: 1, offset: 0.2 },
                { opacity: 1, offset: 0.6 },
                { opacity: 0 }
            ], { duration: 150, delay, fill: 'forwards' });

            curX = nextX; curY = nextY;
        }
    },
    

    // ══════════════════════════════════════════════
    //SKILL 1 TRIỆU HỒI TOÀN MÀN HÌNH
    // ══════════════════════════════════════════════════════════
    // ENGINE DÙNG CHUNG CHO SKILL "TOÀN MÀN HÌNH" — sửa 1 chỗ,
    // mọi hệ hưởng lợi. Mỗi hệ chỉ cần gọi hàm này với itemBuilder
    // + màu + pattern riêng.
    // ══════════════════════════════════════════════════════════
    async playScreenSummonBurst(target, scale, opts) {
        const {
            itemBuilder,
            color = '#fff',
            count = 18,
            phase2 = 'random', // 'converge' | 'glow' | 'detonate' | 'random'
        } = opts;

        const arena = document.getElementById('battle-arena');
        const arenaRect = arena ? arena.getBoundingClientRect()
                                 : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const rectT = target.getBoundingClientRect();
        const targetX = rectT.left + rectT.width / 2;
        const targetY = rectT.top + rectT.height / 2;

        const cfg = this.durationConfig.aoe;

        // ── TIMELINE 3 PHA: TRIỆU HỒI → HÀNH ĐỘNG → NỔ TOÀN MÀN HÌNH ──
        const summonStart = cfg.chargeAura;
        const summonDur   = cfg.targetSustain * 0.45;
        const actionStart = summonStart + summonDur;
        const actionDur   = cfg.targetSustain * 0.30;
        const finaleStart = actionStart + actionDur;
        const finaleDur   = cfg.targetSustain * 0.25;
        const totalMs     = cfg.chargeAura + cfg.targetSustain;

        // Random hoá bước 2 nếu để 'random' — mỗi lần đánh có thể ra hành vi khác nhau
        const chosenPhase2 = phase2 === 'random'
            ? ['converge', 'glow', 'detonate'][Math.floor(Math.random() * 3)]
            : phase2;

        const particleCount = Math.max(15, Math.min(25, count));
        const allEls = [];
        const particles = [];

        if (this.playChargeSfx) this.playChargeSfx('normal');

        // ── PHA 1: TRIỆU HỒI — xuất hiện random vị trí/kích cỡ, tích luỹ dần, bập bềnh tại chỗ ──
        for (let i = 0; i < particleCount; i++) {
            const x = arenaRect.left + arenaRect.width * (0.08 + Math.random() * 0.84);
            const y = arenaRect.top + arenaRect.height * (0.1 + Math.random() * 0.6);
            const pScale = scale * (0.55 + Math.random() * 0.85); // kích cỡ random mỗi phần tử
            const spawnDelay = summonStart + (i / particleCount) * summonDur * 0.85 + Math.random() * 120;

            const el = itemBuilder(x, y, pScale, color);
            document.body.appendChild(el);
            allEls.push(el);
            particles.push({ el, x, y, scale: pScale });

            const bobAmp = (6 + Math.random() * 10) * pScale;
            const idleDur = Math.max(300, actionStart - spawnDelay);
            el.animate([
                { opacity: 0, transform: 'translate(-50%,-50%) scale(0.3)' },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.15 },
                { opacity: 1, transform: `translate(-50%,-50%) translateY(${-bobAmp}px) scale(1.05)`, offset: 0.5 },
                { opacity: 1, transform: `translate(-50%,-50%) translateY(${bobAmp * 0.6}px) scale(0.97)`, offset: 0.8 },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }
            ], { duration: idleDur, delay: spawnDelay, fill: 'forwards', easing: 'ease-in-out' });
        }

        // ── PHA 2: HÀNH ĐỘNG — random 1 trong 3 kiểu để đỡ nhàm giữa các lượt đánh ──
        if (this.playTravelSfx) this.playTravelSfx('normal');

        particles.forEach((p, idx) => {
            if (chosenPhase2 === 'converge') {
                // Cùng bay hội tụ về phía đối thủ, kéo theo CHUỖI ẢNH MỜ (afterimage) dọc đường bay
                const dx = targetX - p.x, dy = targetY - p.y;
                p.el.animate([
                    { transform: 'translate(-50%,-50%) translate(0px,0px) scale(1)', offset: 0 },
                    { transform: `translate(-50%,-50%) translate(${dx * 0.9}px,${dy * 0.9}px) scale(1.15)`, offset: 0.88 },
                    { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(0.3)`, opacity: 0 }
                ], { duration: actionDur, delay: actionStart, fill: 'forwards', easing: 'ease-in' });

                // Thả 4 bản sao mờ dần dọc đường bay, mỗi bản trễ hơn 1 nhịp so với phần tử gốc
                const ghostCount = 4;
                for (let g = 1; g <= ghostCount; g++) {
                    const t = g / (ghostCount + 1);
                    const ghostDelay = actionStart + actionDur * t * 0.9;
                    const ghost = document.createElement('div');
                    const gSize = 10 * p.scale;
                    ghost.style.cssText = `
                        position: fixed; left:${p.x + dx * t}px; top:${p.y + dy * t}px;
                        width:${gSize}px; height:${gSize}px; border-radius:50%;
                        background: radial-gradient(circle, ${color}cc 15%, ${color}55 60%, transparent 100%);
                        filter: blur(${1.5 * p.scale}px);
                        transform: translate(-50%,-50%) scale(1); opacity: 0;
                        z-index: 9994; pointer-events:none;
                    `;
                    document.body.appendChild(ghost);
                    allEls.push(ghost);
                    ghost.animate([
                        { opacity: 0.55, transform: 'translate(-50%,-50%) scale(1)' },
                        { opacity: 0, transform: 'translate(-50%,-50%) scale(0.4)' }
                    ], { duration: 260, delay: ghostDelay, fill: 'forwards', easing: 'ease-out' });
                }

                // ÂM THANH — 1 tiếng "vù" mạnh đồng loạt lúc cả đàn bắt đầu lao đi (chỉ bắn 1 lần)
                if (idx === 0 && window.SoundEngine) {
                    window.SoundEngine.playDelayed('whoosh', actionStart, 0.45, 0.22, 850);
                }
                // Rải thêm vài tiếng "vù" nhỏ lệch pha nhẹ cho có chiều sâu, không dồn ồn cùng lúc
                if (idx % 4 === 0 && window.SoundEngine) {
                    window.SoundEngine.playDelayed('whoosh', actionStart + Math.random() * 120, 0.3, 0.12, 1100 + idx * 10);
                }

            } else if (chosenPhase2 === 'glow') {
                // 'glow' — SÁNG LẦN LƯỢT THEO THỨ TỰ (domino): phần tử nào sáng rồi thì
                // GIỮ NGUYÊN độ sáng đó, và độ sáng đỉnh tăng dần theo thứ tự.
                const stepDur = Math.max(90, actionDur / particleCount);
                const glowDelay = actionStart + idx * stepDur;

                const peakBrightness = 2.2 + (idx / particleCount) * 2.2;
                const peakScale = 1.15 + (idx / particleCount) * 0.35;

                p.el.animate([
                    { filter: 'brightness(1) saturate(1)', transform: 'translate(-50%,-50%) scale(1)' },
                    { filter: `brightness(${peakBrightness}) saturate(1.5)`, transform: `translate(-50%,-50%) scale(${peakScale})` }
                ], { duration: stepDur, delay: glowDelay, fill: 'forwards', easing: 'ease-out' });

                const spot = document.createElement('div');
                const spotSize = (60 + idx * 2) * p.scale;
                spot.style.cssText = `
                    position: fixed; left:${p.x}px; top:${p.y}px;
                    width:${spotSize}px; height:${spotSize}px; border-radius:50%;
                    background: radial-gradient(circle, ${color}88 0%, ${color}33 45%, transparent 75%);
                    transform: translate(-50%,-50%) scale(0.3); opacity: 0;
                    z-index: 9993; pointer-events:none;
                `;
                document.body.appendChild(spot);
                allEls.push(spot);
                spot.animate([
                    { opacity: 0, transform: 'translate(-50%,-50%) scale(0.3)' },
                    { opacity: Math.min(1, 0.6 + idx * 0.02), transform: 'translate(-50%,-50%) scale(1.3)' }
                ], { duration: stepDur, delay: glowDelay, fill: 'forwards', easing: 'ease-out' });

                // ÂM THANH — chuông "chime" ngân lên đúng lúc phần tử này sáng, cao độ TĂNG DẦN
                // theo thứ tự (idx) để nghe như đang dồn năng lượng cao trào — bỏ bớt 1 nửa để đỡ dày
                if (idx % 2 === 0 && window.SoundEngine) {
                    const pitch = 500 + idx * 35;
                    const vol = 0.08 + (idx / particleCount) * 0.09;
                    window.SoundEngine.playDelayed('chime', glowDelay, pitch, 0.22, vol);
                }

            } else {
                // 'detonate' — NỔ DÂY CHUYỀN (domino): nổ lần lượt đúng thứ tự, quy mô nổ TĂNG DẦN.
                const stepDur = Math.max(110, (actionDur * 0.9) / particleCount);
                const detDelay = actionStart + idx * stepDur;
                const burstScale = 1.8 + (idx / particleCount) * 1.6;

                p.el.animate([
                    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
                    { transform: `translate(-50%,-50%) scale(${burstScale})`, opacity: 0.9, offset: 0.4 },
                    { transform: 'translate(-50%,-50%) scale(0.15)', opacity: 0 }
                ], { duration: stepDur * 1.4, delay: detDelay, fill: 'forwards', easing: 'ease-out' });

                const ring = document.createElement('div');
                const ringSize = 26 * p.scale * (1 + idx / particleCount);
                ring.style.cssText = `
                    position: fixed; left:${p.x}px; top:${p.y}px;
                    width:${ringSize}px; height:${ringSize}px; border-radius:50%;
                    background: radial-gradient(circle, #fff 15%, ${color} 55%, transparent 100%);
                    transform: translate(-50%,-50%) scale(0); opacity: 0;
                    z-index: 9994; pointer-events:none;
                `;
                document.body.appendChild(ring);
                allEls.push(ring);
                ring.animate([
                    { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0.9, offset: 0.35 },
                    { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 }
                ], { duration: stepDur * 1.3, delay: detDelay, fill: 'forwards', easing: 'ease-out' });

                setTimeout(() => {
                    if (this.applyGlobalShake) this.applyGlobalShake(scale * (0.3 + (idx / particleCount) * 0.5));
                }, detDelay);

                // ÂM THANH — mỗi vụ nổ trong chuỗi phát 1 tiếng "boom", TRẦM DẦN + TO DẦN
                // theo thứ tự (idx) để nghe như quả sau luôn mạnh hơn quả trước.
                if (window.SoundEngine) {
                    const boomVol = 0.12 + (idx / particleCount) * 0.16;
                    const boomFreq = 220 - (idx / particleCount) * 90; // trầm dần
                    window.SoundEngine.playDelayed('boom', detDelay, 0.22 + (idx / particleCount) * 0.08, boomVol, boomFreq);

                    // Thêm 1 tiếng "tách" lửa nhỏ ngay trước tiếng nổ để có kết cấu, bỏ bớt cho đỡ dày
                    if (idx % 2 === 0) {
                        window.SoundEngine.playDelayed('crackle', Math.max(0, detDelay - 40), 0.12, 0.08);
                    }
                }
            }
        });

        // ── PHA 3: NỔ TOÀN MÀN HÌNH + RUNG CHẤN (dùng chung cho mọi hệ) ──
        const finaleEls = [];
        setTimeout(() => {
            this.triggerScreenFinale(arenaRect, targetX, targetY, color, scale, finaleDur, finaleEls);
        }, finaleStart);

        await new Promise(r => setTimeout(r, totalMs + 250));
        allEls.forEach(el => el.remove());
        finaleEls.forEach(el => el.remove());
    },

    // ── PHA NỔ TOÀN MÀN HÌNH DÙNG CHUNG — mọi hệ gọi lại, chỉ đổi màu ──
    // Gồm: sóng xung kích lớn tại điểm hội tụ + chớp sáng phủ toàn arena
    // + mảnh vỡ bắn ra biên + rung màn hình toàn cục.
    triggerScreenFinale(arenaRect, cx, cy, color, scale, duration, collectEls) {
        const push = (el) => { document.body.appendChild(el); if (collectEls) collectEls.push(el); };

        // Sóng xung kích lớn từ điểm hội tụ lan phủ gần hết arena
        const shockSize = Math.max(arenaRect.width, arenaRect.height) * 0.15;
        const shock = document.createElement('div');
        shock.style.cssText = `
            position: fixed; left:${cx}px; top:${cy}px;
            width:${shockSize}px; height:${shockSize}px; border-radius:50%;
            background: radial-gradient(circle, #fff 10%, ${color} 40%, ${color}55 70%, transparent 100%);
            box-shadow: 0 0 ${40 * scale}px ${color};
            transform: translate(-50%,-50%) scale(0);
            z-index: 9995; pointer-events:none; opacity:0;
        `;
        push(shock);
        shock.animate([
            { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(4)', opacity: 1, offset: 0.2 },
            { transform: 'translate(-50%,-50%) scale(7)', opacity: 0 }
        ], { duration, fill: 'forwards', easing: 'ease-out' });

        // Chớp sáng toàn khung arena (không tràn full màn hình)
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed; left:${arenaRect.left}px; top:${arenaRect.top}px;
            width:${arenaRect.width}px; height:${arenaRect.height}px;
            background:#fff; mix-blend-mode: overlay;
            z-index: 9996; pointer-events:none; opacity:0;
        `;
        push(flash);
        flash.animate([
            { opacity: 0 },
            { opacity: 0.9, offset: 0.15 },
            { opacity: 0 }
        ], { duration: duration * 0.6, fill: 'forwards', easing: 'ease-out' });

        // Mảnh vỡ bắn ra biên arena (số lượng cố định thấp để tránh lag)
        const fragmentCount = 10;
        for (let f = 0; f < fragmentCount; f++) {
            const shard = document.createElement('div');
            const shardSize = (10 + Math.random() * 12) * scale;
            shard.style.cssText = `
                position: fixed; left:${cx}px; top:${cy}px;
                width:${shardSize}px; height:${shardSize}px; border-radius:50%;
                background: radial-gradient(circle, #fff 20%, ${color} 75%);
                box-shadow: 0 0 ${10 * scale}px ${color};
                transform: translate(-50%,-50%) scale(0);
                z-index: 9997; pointer-events:none; opacity:0;
            `;
            push(shard);
            const angle = (f / fragmentCount) * Math.PI * 2 + Math.random() * 0.4;
            const dist = arenaRect.width * (0.35 + Math.random() * 0.25);
            const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
            shard.animate([
                { transform: 'translate(-50%,-50%) translate(0px,0px) scale(0)', opacity: 0 },
                { transform: `translate(-50%,-50%) translate(${dx * 0.5}px,${dy * 0.5}px) scale(1.2)`, opacity: 1, offset: 0.3 },
                { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(0.2)`, opacity: 0 }
            ], { duration: duration * 0.9, fill: 'forwards', easing: 'ease-out' });
        }

        if (this.applyGlobalShake) this.applyGlobalShake(scale * 2);
        if (this.playImpactSfx) { /* impact sfx đã được gọi tập trung ở triggerMultiEffect, không gọi lại ở đây */ }
    },



    // HỆ ĐIỆN — spawnElectric4 (Static Burst) — ★ Skill toàn màn hình
    // CSS phần tử tia điện vẽ riêng ngay trong hàm này (core sáng + tia chớp zigzag,
    // xoay góc random để tạo cảm giác lộn xộn đặc trưng của điện).
    // Bước 2 để 'random': mỗi lượt đánh ngẫu nhiên rơi vào 1 trong 3 hiệu ứng
    // (nổ tại chỗ / sáng lên theo làn sóng / hội tụ kéo theo chuỗi ảnh mờ).
    async spawnElectric4(startEl, endEl, count, scale) {
        const buildBolt = (x, y, s, c) => {
            const size = 16 * s;
            const angle = Math.random() * 70 - 35; // random để mỗi tia lệch hướng khác nhau
            const el = document.createElement('div');
            el.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${size * 0.6}px; height:${size * 1.7}px;
                transform: translate(-50%,-50%) rotate(${angle}deg);
                pointer-events: none; z-index: 9998; opacity: 0;
                filter: drop-shadow(0 0 ${4 * s}px #aef1ff);
            `;
            el.innerHTML = `
                <div style="position:absolute; left:50%; top:50%; width:${size * 0.55}px; height:${size * 0.55}px;
                    transform:translate(-50%,-50%); border-radius:50%;
                    background:radial-gradient(circle,#fff 20%,#fff59d 55%,${c} 100%);
                    box-shadow:0 0 ${size * 0.5}px ${c};"></div>
                <div style="position:absolute; left:50%; top:50%; width:${size * 0.32}px; height:${size * 1.6}px;
                    transform:translate(-50%,-50%);
                    background:linear-gradient(to bottom, transparent, #fff, ${c}, #fff, transparent);
                    clip-path:polygon(50% 0%,66% 20%,42% 28%,62% 46%,36% 56%,58% 74%,50% 100%,32% 76%,56% 60%,30% 44%,54% 30%,34% 14%);
                    box-shadow:0 0 ${size * 0.4}px ${c};"></div>
            `;
            return el;
        };

        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildBolt,
            color: '#f1c40f', phase2: 'random', count: 20,
        });
    },
    // HỆ LỬA — spawnFire4 (Solar Flare) — ★ Skill toàn màn hình
    // Mỗi phần tử là 1 "mặt trời" nhỏ: lõi sáng + các tia nắng toả quanh,
    // góc xoay random để trông tự nhiên, không đều tăm tắp.
    async spawnFire4(startEl, endEl, count, scale) {
        const buildSun = (x, y, s, c) => {
            const size = 20 * s;
            const rayCount = 8;
            const el = document.createElement('div');
            el.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${size}px; height:${size}px;
                transform: translate(-50%,-50%) rotate(${Math.random() * 360}deg);
                pointer-events: none; z-index: 9998; opacity: 0;
                filter: drop-shadow(0 0 ${5 * s}px #ffb347);
            `;
            let raysHtml = '';
            for (let i = 0; i < rayCount; i++) {
                const angle = (360 / rayCount) * i;
                raysHtml += `
                    <div style="position:absolute; left:50%; top:50%; width:${size * 0.16}px; height:${size * 0.62}px;
                        background:linear-gradient(to bottom, ${c}, transparent);
                        transform:translate(-50%,-100%) rotate(${angle}deg); transform-origin:50% 100%;
                        border-radius:50% 50% 0 0;"></div>
                `;
            }
            el.innerHTML = `
                ${raysHtml}
                <div style="position:absolute; inset:0; border-radius:50%;
                    background:radial-gradient(circle,#fff 10%,#ffe066 40%,${c} 80%);
                    box-shadow:0 0 ${size * 0.7}px ${c};"></div>
            `;
            return el;
        };

        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildSun,
            color: '#ff6d00', phase2: 'random', count: 18,
        });
    },

    // HỆ NƯỚC — spawnWater4 (Tsunami Surge) — ★ Skill toàn màn hình
    // Bong bóng nước trong suốt, có viền sáng + điểm highlight nhỏ tạo độ bóng thật.
    async spawnWater4(startEl, endEl, count, scale) {
        const buildBubble = (x, y, s, c) => {
            const size = 18 * s;
            const el = document.createElement('div');
            el.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${size}px; height:${size}px; border-radius:50%;
                transform: translate(-50%,-50%);
                pointer-events: none; z-index: 9998; opacity: 0;
                background: radial-gradient(circle at 32% 28%, #fff 0%, ${c}99 45%, ${c}33 80%, transparent 100%);
                border: 1.5px solid rgba(255,255,255,0.75);
                box-shadow: inset -2px -2px 5px rgba(0,0,0,0.15), inset 2px 2px 6px rgba(255,255,255,0.6), 0 0 ${size * 0.35}px ${c}88;
            `;
            const highlight = document.createElement('div');
            highlight.style.cssText = `
                position:absolute; left:22%; top:20%; width:26%; height:26%;
                background:#fff; border-radius:50%; opacity:0.7;
            `;
            el.appendChild(highlight);
            return el;
        };

        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildBubble,
            color: '#3498db', phase2: 'random', count: 20,
        });
    },

    // HỆ ĐÁ — spawnRock4 (Meteor Fall) — ★ Skill toàn màn hình
    // Mỗi viên đá random 1 trong 3 hình đa giác thô ráp khác nhau, xoay góc ngẫu nhiên
    // để đàn đá trông tự nhiên, không giống hệt nhau.
    async spawnRock4(startEl, endEl, count, scale) {
        const buildStone = (x, y, s, c) => {
            const size = 18 * s;
            const el = document.createElement('div');
            const clipPaths = [
                'polygon(20% 0%,80% 8%,100% 45%,78% 100%,20% 95%,0% 50%)',
                'polygon(10% 15%,60% 0%,100% 30%,90% 80%,45% 100%,0% 65%)',
                'polygon(30% 0%,90% 20%,100% 70%,55% 100%,5% 75%,0% 25%)',
            ];
            const clip = clipPaths[Math.floor(Math.random() * clipPaths.length)];
            el.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${size}px; height:${size}px;
                transform: translate(-50%,-50%) rotate(${Math.random() * 360}deg);
                pointer-events: none; z-index: 9998; opacity: 0;
                background: linear-gradient(135deg, #fff2, ${c} 55%, #00000055);
                clip-path: ${clip};
                box-shadow: 0 0 ${size * 0.3}px #00000066;
            `;
            return el;
        };

        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildStone,
            color: '#8d6e63', phase2: 'random', count: 18,
        });
    },


    // HỆ BĂNG — spawnIce4 (Absolute Zero) — ★ Skill toàn màn hình
    // Bông tuyết 6 cánh đối xứng, dựng bằng nhiều nhánh xoay đều 60°.
    async spawnIce4(startEl, endEl, count, scale) {
        const buildSnowflake = (x, y, s, c) => {
            const size = 18 * s;
            const el = document.createElement('div');
            el.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${size}px; height:${size}px;
                transform: translate(-50%,-50%) rotate(${Math.random() * 60}deg);
                pointer-events: none; z-index: 9998; opacity: 0;
                filter: drop-shadow(0 0 ${4 * s}px #fff) drop-shadow(0 0 ${6 * s}px ${c});
            `;
            let branches = '';
            for (let i = 0; i < 6; i++) {
                const angle = i * 60;
                branches += `
                    <div style="position:absolute; left:50%; top:50%; width:2px; height:${size * 0.5}px;
                        background: linear-gradient(to top, transparent, #fff 40%, ${c});
                        transform: translate(-50%,-100%) rotate(${angle}deg); transform-origin: 50% 100%;">
                        <div style="position:absolute; top:30%; left:-3px; width:0; height:0;
                            border-left:3px solid transparent; border-right:3px solid transparent;
                            border-bottom:4px solid #fff; transform: rotate(35deg);"></div>
                        <div style="position:absolute; top:30%; right:-3px; width:0; height:0;
                            border-left:3px solid transparent; border-right:3px solid transparent;
                            border-bottom:4px solid #fff; transform: rotate(-35deg);"></div>
                    </div>
                `;
            }
            el.innerHTML = `
                ${branches}
                <div style="position:absolute; left:50%; top:50%; width:${size * 0.22}px; height:${size * 0.22}px;
                    transform:translate(-50%,-50%); border-radius:50%;
                    background: radial-gradient(circle,#fff 30%,${c} 100%);"></div>
            `;
            return el;
        };

        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildSnowflake,
            color: '#74b9ff', phase2: 'random', count: 20,
        });
    },

    // HỆ CỎ — spawnGrass4 (Bloom Cascade) — ★ Skill toàn màn hình
    // Lá cây dựng đúng theo tinh thần CSS bạn gửi: gradient xanh chéo, viền đậm,
    // bo góc nhọn-sắc (80% 10% 80% 10%), drop-shadow nổi bật + gân lá chạy chéo.
    async spawnGrass4(startEl, endEl, count, scale) {
        // Vài bảng màu khác nhau để đàn lá không đồng nhất 1 tông
        const leafPalettes = [
            ['#2ecc71', '#27ae60', '#145a32'],
            ['#58d68d', '#229954', '#0b3d1e'],
            ['#82e0aa', '#1e8449', '#0e4d24'],
        ];

        const buildLeaf = (x, y, s, c) => {
            const [top, bottom, edge] = leafPalettes[Math.floor(Math.random() * leafPalettes.length)];
            const w = 34 * s, h = 19 * s;
            const angle = Math.random() * 360;

            // outer: KHÔNG tự set transform — nhường toàn quyền vị trí/scale/opacity
            // cho playScreenSummonBurst animate, tránh bị ghi đè góc xoay.
            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            // inner: giữ NGUYÊN góc xoay + toàn bộ hình dạng/màu sắc lá, không bị animate đè
            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                transform: rotate(${angle}deg);
                background: linear-gradient(135deg, ${top}, ${bottom});
                border-radius: 80% 10% 80% 10%;
                border: ${1.2 * s}px solid ${edge};
                filter: drop-shadow(0 0 ${4 * s}px rgba(0,0,0,0.5));
            `;
            // Gân lá chạy chéo theo trục dài của lá
            inner.innerHTML = `
                <div style="position:absolute; left:8%; top:48%; width:84%; height:${Math.max(1, 1 * s)}px;
                    background: rgba(0,0,0,0.25); transform: rotate(-6deg);"></div>
            `;

            outer.appendChild(inner);
            return outer;
        };

        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildLeaf,
            color: '#2ecc71', phase2: 'random', count: 22,
        });
    },

    // HỆ BAY — spawnFlying4 (Tempest Wing) — ★ Skill toàn màn hình
    // Lưỡi liềm gió dựng bằng SVG mask (2 vòng tròn lệch tâm) đúng kiểu tham khảo —
    // ID gradient/mask random riêng từng lưỡi để nhiều lưỡi bay cùng lúc không giẫm ID.
    async spawnFlying4(startEl, endEl, count, scale) {
        let uidCounter = 0;

        const buildCrescentBlade = (x, y, s, c) => {
            const uid = `af4-${Date.now()}-${uidCounter++}`;
            const size = 56 * s;
            const angle = Math.random() * 360;

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${size}px; height:${size}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            // inner: giữ nguyên góc xoay của lưỡi liềm, không bị animate cha ghi đè
            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                transform: rotate(${angle}deg);
            `;
            inner.innerHTML = `
                <svg width="${size}" height="${size}" viewBox="0 0 96 96">
                    <defs>
                        <radialGradient id="grad-${uid}" cx="28%" cy="50%" r="70%">
                            <stop offset="0%" stop-color="#fff"/>
                            <stop offset="65%" stop-color="#dff3ff"/>
                            <stop offset="100%" stop-color="rgba(200,240,255,0)"/>
                        </radialGradient>
                        <mask id="mask-${uid}">
                            <rect x="0" y="0" width="96" height="96" fill="black"/>
                            <circle cx="48" cy="48" r="38" fill="white"/>
                            <circle cx="32" cy="48" r="30" fill="black"/>
                        </mask>
                    </defs>
                    <circle cx="48" cy="48" r="38" fill="url(#grad-${uid})" mask="url(#mask-${uid})"
                        style="filter: drop-shadow(0 0 ${8 * s}px rgba(200,240,255,0.9));"/>
                </svg>
            `;

            outer.appendChild(inner);
            return outer;
        };

        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildCrescentBlade,
            color: '#a890f0', phase2: 'random', count: 18,
        });
    },
    async spawnDragon4(startEl, endEl, count, scale) {
        // Tự động thêm hiệu ứng chuyển động Thần Long lượn sóng (chỉ chạy 1 lần)
        if (!document.getElementById('pkm-dragon-epic-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pkm-dragon-epic-keyframes';
            style.textContent = `
                @keyframes dragon-epic-glide {
                    0%, 100% { transform: translateY(0) scale(1) rotate(0deg); }
                    25% { transform: translateY(-5px) scale(0.98) rotate(1deg); }
                    50% { transform: translateY(2px) scale(1.02) rotate(-1deg); }
                    75% { transform: translateY(-3px) scale(1) rotate(0.5deg); }
                }
            `;
            document.head.appendChild(style);
        }

        let uid = 0;
        const buildDragonSpirit = (x, y, s, c) => {
            // Tăng kích thước rộng rãi để hiển thị toàn bộ Thần Long uốn lượn kiêu hùng
            const w = 120 * s, h = 60 * s;
            const angle = Math.random() * 360;
            const gid = `epic-drg-${Date.now()}-${uid++}`;

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                transform: rotate(${angle}deg);
                /* Hào quang Thần Long huyền thoại xếp chồng nhiều lớp màu cực đẹp */
                filter: drop-shadow(0 0 ${4 * s}px ${c}) 
                        drop-shadow(0 0 ${10 * s}px #00f0ff) 
                        drop-shadow(0 0 ${2 * s}px #fff);
                /* Áp dụng hoạt ảnh chuyển động uốn lượn */
                animation: dragon-epic-glide 0.8s ease-in-out infinite;
                animation-delay: -${Math.random() * 800}ms;
            `;

            // SVG Thần Long phương Đông uốn lượn nghệ thuật cao cấp
            inner.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 160 80" style="overflow:visible;">
                    <defs>
                        <linearGradient id="drgGrad-${gid}" x1="0%" y1="50%" x2="100%" y2="30%">
                            <stop offset="0%" stop-color="#2a085c" stop-opacity="0.4"/>
                            <stop offset="40%" stop-color="${c}" stop-opacity="0.95"/>
                            <stop offset="85%" stop-color="#00f0ff" stop-opacity="0.95"/>
                            <stop offset="100%" stop-color="#ffffff"/>
                        </linearGradient>
                    </defs>

                    <path d="M 14,45 C 4,43 -2,32 3,22 C 6,30 10,38 14,45 Z" fill="#00f0ff" opacity="0.8"/>

                    <path d="M 12,45 C 25,18 45,72 65,40 C 85,8 105,62 125,32 C 135,18 146,22 152,32 C 144,48 130,45 122,45 C 105,72 85,20 65,52 C 45,82 25,32 12,45 Z" 
                          fill="url(#drgGrad-${gid})" />

                    <path d="M 16,46 C 26,30 46,74 65,42 C 76,26 90,34 100,50 C 90,22 72,16 65,38 C 45,68 26,28 16,46 Z" 
                          fill="rgba(255, 255, 255, 0.35)" />

                    <polygon points="32,25 35,12 42,23" fill="#ffffff" opacity="0.9"/>
                    <polygon points="54,46 56,60 64,48" fill="#00f0ff" opacity="0.9"/>
                    <polygon points="82,18 85,4 92,16" fill="#ffffff" opacity="0.9"/>
                    <polygon points="106,44 109,58 117,46" fill="#00f0ff" opacity="0.9"/>

                    <path d="M 124,33 C 130,22 142,20 152,30 C 155,33 151,39 148,41 C 149,45 143,48 135,42 Z" fill="url(#drgGrad-${gid})"/>

                    <polygon points="135,26 148,8 142,24" fill="#ffffff"/>
                    <polygon points="131,25 142,5 137,23" fill="#ffffff" opacity="0.7"/>

                    <circle cx="142" cy="32" r="2.2" fill="#ffffff" style="filter: drop-shadow(0 0 2px #fff);"/>

                    <path d="M 148,39 Q 164,44 170,39 M 146,41 Q 160,52 166,51" stroke="#00f0ff" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                </svg>
            `;

            outer.appendChild(inner);
            return outer;
        };

        // Kích hoạt bùng nổ trận pháp rồng bay lượn ngẫu nhiên toàn màn hình qua bộ lõi AOE của bạn
        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildDragonSpirit,
            color: '#7038f8', // Sắc tím đặc trưng tối thượng của hệ Rồng
            phase2: 'random', 
            count: 16,
        });
    },

    async spawnFighting4(startEl, endEl, count, scale) {
        const weapons = ['sword', 'axe', 'mace'];

        const buildWeaponSpirit = (x, y, s, c) => {
            const kind = weapons[Math.floor(Math.random() * weapons.length)];
            const w = 26 * s, h = 46 * s;
            const angle = Math.random() * 360;

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                transform: rotate(${angle}deg);
                filter: drop-shadow(0 0 ${5 * s}px ${c});
            `;

            if (kind === 'sword') {
                inner.innerHTML = `
                    <div style="position:absolute; left:38%; top:0%; width:24%; height:62%;
                        clip-path:polygon(50% 0%, 100% 30%, 78% 100%, 22% 100%, 0% 30%);
                        background:linear-gradient(180deg,#fff 0%, ${c}dd 40%, ${c}88 100%);
                        box-shadow:0 0 ${5 * s}px ${c};"></div>
                    <div style="position:absolute; left:20%; top:60%; width:60%; height:8%;
                        background:${c}cc; border-radius:2px;"></div>
                    <div style="position:absolute; left:42%; top:66%; width:16%; height:30%;
                        background:linear-gradient(${c}, ${c}aa); border-radius:2px;"></div>
                    <div style="position:absolute; left:36%; top:94%; width:28%; height:10%;
                        border-radius:50%; background:${c};"></div>
                `;
            } else if (kind === 'axe') {
                inner.innerHTML = `
                    <div style="position:absolute; left:44%; top:6%; width:12%; height:88%;
                        background:linear-gradient(${c}, ${c}aa); border-radius:2px;"></div>
                    <div style="position:absolute; left:0%; top:0%; width:100%; height:38%;
                        clip-path:polygon(50% 40%, 30% 0%, 100% 10%, 90% 50%, 50% 65%);
                        background:radial-gradient(circle at 60% 20%, #fff 0%, ${c}dd 45%, ${c}88 100%);
                        box-shadow:0 0 ${5 * s}px ${c};"></div>
                `;
            } else {
                inner.innerHTML = `
                    <div style="position:absolute; left:44%; top:22%; width:12%; height:72%;
                        background:linear-gradient(${c}, ${c}aa); border-radius:2px;"></div>
                    <div style="position:absolute; left:20%; top:0%; width:60%; height:34%; border-radius:50%;
                        background:radial-gradient(circle at 35% 30%, #fff 0%, ${c}dd 50%, ${c}88 100%);
                        box-shadow:0 0 ${5 * s}px ${c};"></div>
                    <div style="position:absolute; left:47%; top:-6%; width:6%; height:14%; background:#fff;
                        clip-path:polygon(50% 0%,100% 100%,0% 100%);"></div>
                    <div style="position:absolute; left:8%; top:8%; width:6%; height:14%; background:#fff;
                        clip-path:polygon(50% 0%,100% 100%,0% 100%); transform:rotate(-60deg);"></div>
                    <div style="position:absolute; left:78%; top:8%; width:6%; height:14%; background:#fff;
                        clip-path:polygon(50% 0%,100% 100%,0% 100%); transform:rotate(60deg);"></div>
                `;
            }

            outer.appendChild(inner);
            return outer;
        };

        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildWeaponSpirit,
            color: '#e74c3c', phase2: 'random', count: 16,
        });
    },
    async spawnFairy4(startEl, endEl, count, scale) {
        // Tự động inject keyframes vỗ cánh (chỉ chạy 1 lần duy nhất)
        if (!document.getElementById('pkm-fairy-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pkm-fairy-keyframes';
            style.textContent = `
                @keyframes fairy-wing-flap-l {
                    0%, 100% { transform: rotate(20deg) scaleX(-1); }
                    50% { transform: rotate(-35deg) scaleX(-1); }
                }
                @keyframes fairy-wing-flap-r {
                    0%, 100% { transform: rotate(20deg); }
                    50% { transform: rotate(-35deg); }
                }
            `;
            document.head.appendChild(style);
        }

        // Định nghĩa cấu trúc Tinh linh Tiên tộc đồng bộ với hệ thống vật thể
        const buildFairySpirit = (x, y, s, c) => {
            const w = 36 * s, h = 36 * s;
            // Giữ độ nghiêng nhẹ tự nhiên khi bay lượn thay vì xoay tròn 360 độ
            const angle = (Math.random() - 0.5) * 30; 

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                transform: rotate(${angle}deg);
                display: flex; align-items: center; justify-content: center;
            `;

            // Khởi tạo cơ thể tinh linh hình người phát sáng kèm 2 cánh vỗ liên tục
            inner.innerHTML = `
                <div style="position: relative; width: ${8 * s}px; height: ${18 * s}px; 
                            background: linear-gradient(to bottom, #ffffff, ${c}); 
                            border-radius: ${4 * s}px ${4 * s}px ${5 * s}px ${5 * s}px; 
                            box-shadow: 0 0 ${10 * s}px ${c}, 0 0 ${4 * s}px #fff;">

                    <!-- Đầu tinh linh -->
                    <div style="position: absolute; top: -${8 * s}px; left: 50%; transform: translateX(-50%); 
                                width: ${8 * s}px; height: ${8 * s}px; background: #fff; border-radius: 50%; 
                                box-shadow: 0 0 ${6 * s}px #fff, 0 0 ${12 * s}px ${c};"></div>

                    <!-- Cánh Trái -->
                    <div style="position: absolute; right: 100%; top: -${1 * s}px; 
                                width: ${14 * s}px; height: ${22 * s}px; 
                                background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.95) 0%, rgba(255, 182, 193, 0.6) 80%); 
                                border-radius: 100% 0% 100% 40%; box-shadow: 0 0 ${8 * s}px rgba(255, 182, 193, 0.8); 
                                transform-origin: right top; animation: fairy-wing-flap-l 0.12s ease-in-out infinite;"></div>

                    <!-- Cánh Phải -->
                    <div style="position: absolute; left: 100%; top: -${1 * s}px; 
                                width: ${14 * s}px; height: ${22 * s}px; 
                                background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.95) 0%, rgba(255, 182, 193, 0.6) 80%); 
                                border-radius: 0% 100% 40% 100%; box-shadow: 0 0 ${8 * s}px rgba(255, 182, 193, 0.8); 
                                transform-origin: left top; animation: fairy-wing-flap-r 0.12s ease-in-out infinite;"></div>
                </div>
            `;

            outer.appendChild(inner);
            return outer;
        };

        // Kích hoạt nổ trận pháp triệu hồi toàn màn hình, di chuyển lượn và rung lắc qua bộ lõi AOE
        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildFairySpirit,
            color: '#ee99ac', // Màu hồng phấn đặc trưng của hệ Tiên
            phase2: 'random', 
            count: 16,
        });
    },
    async spawnBug4(startEl, endEl, count, scale) {
        // Tự động thêm hiệu ứng hoạt ảnh co duỗi bò trườn của sâu nhỏ (chỉ chạy 1 lần)
        if (!document.getElementById('pkm-bug-epic-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pkm-bug-epic-keyframes';
            style.textContent = `
                @keyframes bug-caterpillar-crawl {
                    0%, 100% { transform: scaleX(1) scaleY(1) translateY(0); }
                    30% { transform: scaleX(0.82) scaleY(1.15) translateY(-4px); }
                    65% { transform: scaleX(1.08) scaleY(0.92) translateY(1px); }
                }
            `;
            document.head.appendChild(style);
        }

        let uid = 0;
        const buildBugSpirit = (x, y, s, c) => {
            // Định kích thước vừa vặn cho chú sâu nhỏ tinh nghịch
            const w = 50 * s, h = 25 * s;
            const angle = Math.random() * 360;
            const gid = `bug-${Date.now()}-${uid++}`;

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                transform: rotate(${angle}deg);
                /* Hào quang tinh linh Bọ đặc trưng (Xanh rêu -> Lục bảo Neon -> Lõi Bạch Kim) */
                filter: drop-shadow(0 0 ${3 * s}px ${c}) 
                        drop-shadow(0 0 ${8 * s}px #adff2f) 
                        drop-shadow(0 0 ${1.5 * s}px #fff);
                /* Áp dụng hiệu ứng trườn bò nhấp nhô */
                animation: bug-caterpillar-crawl 0.42s ease-in-out infinite;
                /* Lệch nhịp hoạt ảnh giữa các con sâu để nhìn tự nhiên hơn */
                animation-delay: -${Math.random() * 420}ms;
            `;

            // SVG chú sâu nhỏ phân đốt tròn béo ú siêu dễ thương kèm râu đầu lấp lánh
            inner.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 60 30" style="overflow:visible;">
                    <defs>
                        <linearGradient id="bugGrad-${gid}" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stop-color="#3c6116" stop-opacity="0.4"/>
                            <stop offset="35%" stop-color="${c}" stop-opacity="0.95"/>
                            <stop offset="75%" stop-color="#adff2f" stop-opacity="0.95"/>
                            <stop offset="100%" stop-color="#ffffff"/>
                        </linearGradient>
                    </defs>

                    <circle cx="12" cy="16" r="4.2" fill="url(#bugGrad-${gid})" />
                    <circle cx="20" cy="15" r="4.8" fill="url(#bugGrad-${gid})" />
                    <circle cx="28" cy="14.5" r="5.3" fill="url(#bugGrad-${gid})" />
                    <circle cx="36" cy="15" r="4.8" fill="url(#bugGrad-${gid})" />

                    <circle cx="44" cy="16" r="5.8" fill="url(#bugGrad-${gid})" />

                    <path d="M 45,11 Q 47,4 52,3 M 47,12 Q 51,6 56,7" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" fill="none"/>

                    <circle cx="45" cy="14" r="1.2" fill="#ffffff" />
                    <circle cx="45" cy="14" r="0.5" fill="#000000" />
                </svg>
            `;

            outer.appendChild(inner);
            return outer;
        };

        // Kích hoạt bùng nổ trận pháp bầy sâu nhỏ trườn bò toàn màn hình qua bộ lõi AOE của bạn
        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildBugSpirit,
            color: '#a8b820', // Sắc xanh đọt chuối/lục đặc trưng của hệ Bọ
            phase2: 'random', 
            count: 20,        // Tăng số lượng lên 20 con cho bầy sâu nhìn đông đúc, vui mắt
        });
    },
    async spawnGhost4(startEl, endEl, count, scale) {
        // Tự động thêm hiệu ứng hoạt ảnh lơ lửng chập chờn của linh hồn ma (chỉ chạy 1 lần)
        if (!document.getElementById('pkm-ghost-epic-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pkm-ghost-epic-keyframes';
            style.textContent = `
                @keyframes ghost-spectral-wobble {
                    0%, 100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 0.95; }
                    25% { transform: translateY(-6px) scaleX(0.93) scaleY(1.05) rotate(2deg); opacity: 0.6; }
                    50% { transform: translateY(2px) scale(1) rotate(-1deg); opacity: 0.9; }
                    75% { transform: translateY(-4px) scaleX(1.05) scaleY(0.95) rotate(1deg); opacity: 0.5; }
                }
            `;
            document.head.appendChild(style);
        }

        let uid = 0;
        const buildGhostSpirit = (x, y, s, c) => {
            // Thiết kế dáng đứng thon dài cho linh hồn lơ lửng
            const w = 42 * s, h = 52 * s;
            // Giữ độ nghiêng nhẹ tự nhiên khi bay thay vì xoay tròn 360 độ để bóng ma luôn hướng lên
            const angle = (Math.random() - 0.5) * 40; 
            const gid = `ghst-${Date.now()}-${uid++}`;

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                transform: rotate(${angle}deg);
                /* Hào quang bóng ma u linh (Tím ma -> Xanh Lục linh hồn -> Lõi Bạch Kim) */
                filter: drop-shadow(0 0 ${4 * s}px ${c}) 
                        drop-shadow(0 0 ${10 * s}px #00ffcc) 
                        drop-shadow(0 0 ${2 * s}px #fff);
                /* Áp dụng hiệu ứng chập chờn, lơ lửng ma mị */
                animation: ghost-spectral-wobble 0.7s ease-in-out infinite;
                animation-delay: -${Math.random() * 700}ms;
            `;

            // SVG Linh hồn ma uốn lượn kèm đôi mắt rực sáng huyền bí
            inner.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 40 50" style="overflow:visible;">
                    <defs>
                        <linearGradient id="ghstGrad-${gid}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#ffffff"/>
                            <stop offset="25%" stop-color="#00ffcc" stop-opacity="0.95"/>
                            <stop offset="70%" stop-color="${c}" stop-opacity="0.85"/>
                            <stop offset="100%" stop-color="#1c0d30" stop-opacity="0"/>
                        </linearGradient>
                    </defs>

                    <path d="M 20,4 
                             C 33,4 35,16 33,26 
                             C 31,35 23,37 23,45 
                             C 23,49 20,49 20,45 
                             C 20,37 13,35 11,26 
                             C 9,16 7,4 20,4 Z" 
                          fill="url(#ghstGrad-${gid})" />

                    <ellipse cx="15" cy="17" rx="2" ry="3" fill="#ffffff" transform="rotate(-10 15 17)"/>
                    <ellipse cx="25" cy="17" rx="2" ry="3" fill="#ffffff" transform="rotate(10 25 17)"/>

                    <circle cx="15.5" cy="17" r="0.8" fill="#1c0d30"/>
                    <circle cx="24.5" cy="17" r="0.8" fill="#1c0d30"/>

                    <path d="M 6,22 Q 2,26 4,29" stroke="#00ffcc" stroke-width="1.2" fill="none" opacity="0.6"/>
                    <path d="M 34,22 Q 38,26 36,29" stroke="#00ffcc" stroke-width="1.2" fill="none" opacity="0.6"/>
                </svg>
            `;

            outer.appendChild(inner);
            return outer;
        };

        // Kích hoạt bùng nổ trận pháp ma mị, bay lượn lơ lửng toàn màn hình qua bộ lõi AOE của bạn
        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildGhostSpirit,
            color: '#705898', // Sắc tím đặc trưng huyền bí của hệ Ma
            phase2: 'random', 
            count: 16,
        });
    },
    async spawnSteel4(startEl, endEl, count, scale) {
        // Tự động inject hiệu ứng xoay tròn thuận/ngược chiều kim đồng hồ của bánh răng (chỉ chạy 1 lần)
        if (!document.getElementById('pkm-steel-epic-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pkm-steel-epic-keyframes';
            style.textContent = `
                @keyframes steel-gear-spin-cw {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes steel-gear-spin-ccw {
                    0% { transform: rotate(360deg); }
                    100% { transform: rotate(0deg); }
                }
            `;
            document.head.appendChild(style);
        }

        let uid = 0;
        const buildSteelSpirit = (x, y, s, c) => {
            // Ngẫu nhiên chọn loại bánh răng và hướng xoay để tạo sự đa dạng cơ khí
            const gearTypes = ['standard', 'heavy'];
            const kind = gearTypes[Math.floor(Math.random() * gearTypes.length)];
            const isClockwise = Math.random() > 0.5;

            // Kích thước vuông vắn cho bánh răng tròn
            const w = 45 * s, h = 45 * s;
            const gid = `steel-${Date.now()}-${uid++}`;

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                /* Hào quang kim loại lạnh toát (Xám thép -> Trắng bạc Bạch kim) */
                filter: drop-shadow(0 0 ${3 * s}px ${c}) 
                        drop-shadow(0 0 ${7 * s}px #e0e0e0) 
                        drop-shadow(0 0 ${1.5 * s}px #fff);
                /* Áp dụng hoạt ảnh xoay tròn tốc độ cao vô hạn */
                animation: ${isClockwise ? 'steel-gear-spin-cw' : 'steel-gear-spin-ccw'} 0.8s linear infinite;
            `;

            if (kind === 'standard') {
                // Mẫu 1: Bánh răng 8 răng tiêu chuẩn với các nan hoa đối xứng
                inner.innerHTML = `
                    <svg width="${w}" height="${h}" viewBox="0 0 50 50" style="overflow:visible;">
                        <defs>
                            <linearGradient id="stlGrad-${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#4a525a"/>
                                <stop offset="30%" stop-color="${c}"/>
                                <stop offset="70%" stop-color="#e1e4e6"/>
                                <stop offset="100%" stop-color="#ffffff"/>
                            </linearGradient>
                        </defs>
                        <rect x="21" y="2" width="8" height="46" rx="1.5" fill="url(#stlGrad-${gid})" />
                        <rect x="2" y="21" width="46" height="8" rx="1.5" fill="url(#stlGrad-${gid})" />
                        <rect x="21" y="2" width="8" height="46" rx="1.5" transform="rotate(45 25 25)" fill="url(#stlGrad-${gid})" />
                        <rect x="21" y="2" width="8" height="46" rx="1.5" transform="rotate(-45 25 25)" fill="url(#stlGrad-${gid})" />

                        <circle cx="25" cy="25" r="17" fill="url(#stlGrad-${gid})" stroke="#7f8c8d" stroke-width="1"/>

                        <circle cx="25" cy="25" r="6" fill="#1e272e" />
                        <circle cx="25" cy="25" r="4" fill="#000000" />
                    </svg>
                `;
            } else {
                // Mẫu 2: Bánh răng hạng nặng (Heavy Cogwheel) dày dặn và nhiều răng cưa hơn (12 răng)
                inner.innerHTML = `
                    <svg width="${w}" height="${h}" viewBox="0 0 50 50" style="overflow:visible;">
                        <defs>
                            <linearGradient id="stlGradH-${gid}" x1="10%" y1="0%" x2="90%" y2="100%">
                                <stop offset="0%" stop-color="#2c3e50"/>
                                <stop offset="40%" stop-color="${c}"/>
                                <stop offset="75%" stop-color="#dcdde1"/>
                                <stop offset="100%" stop-color="#ffffff"/>
                            </linearGradient>
                        </defs>
                        <rect x="20" y="1" width="10" height="48" rx="1" fill="url(#stlGradH-${gid})" />
                        <rect x="1" y="20" width="48" height="10" rx="1" fill="url(#stlGradH-${gid})" />
                        <rect x="20" y="1" width="10" height="48" rx="1" transform="rotate(30 25 25)" fill="url(#stlGradH-${gid})" />
                        <rect x="20" y="1" width="10" height="48" rx="1" transform="rotate(60 25 25)" fill="url(#stlGradH-${gid})" />
                        <rect x="20" y="1" width="10" height="48" rx="1" transform="rotate(-30 25 25)" fill="url(#stlGradH-${gid})" />
                        <rect x="20" y="1" width="10" height="48" rx="1" transform="rotate(-60 25 25)" fill="url(#stlGradH-${gid})" />

                        <circle cx="25" cy="25" r="18" fill="url(#stlGradH-${gid})" stroke="#57606f" stroke-width="1.5"/>
                        <circle cx="25" cy="25" r="12" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.4"/>
                        <circle cx="25" cy="25" r="5" fill="#1e272e" />
                    </svg>
                `;
            }

            outer.appendChild(inner);
            return outer;
        };

        // Kích hoạt bùng nổ trận pháp mưa bánh răng cơ khí thép tràn màn hình qua bộ lõi AOE của bạn
        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildSteelSpirit,
            color: '#b8b8d0', // Màu xám bạc đặc trưng của hệ Thép (Steel)
            phase2: 'random', 
            count: 16,
        });
    },
    async spawnDark4(startEl, endEl, count, scale) {
        // Tự động inject hiệu ứng Vòng xoáy Hư không tự quay và co giãn xung kích (chỉ chạy 1 lần)
        if (!document.getElementById('pkm-dark-vortex-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pkm-dark-vortex-keyframes';
            style.textContent = `
                @keyframes dark-abyss-vortex {
                    0% { transform: rotate(0deg) scale(0.85); opacity: 0.8; }
                    50% { transform: rotate(180deg) scale(1.15); opacity: 1; }
                    100% { transform: rotate(360deg) scale(0.85); opacity: 0.8; }
                }
            `;
            document.head.appendChild(style);
        }

        let uid = 0;
        const buildDarkSpirit = (x, y, s, c) => {
            // Kích thước vuông đối xứng hoàn hảo cho vòng xoáy hố đen tròn
            const w = 55 * s, h = 55 * s;
            const gid = `vortex-${Date.now()}-${uid++}`;

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                /* Hào quang Hư Không ác liệt (Đen kịt nuốt chửng -> Tím thẫm -> Neon Magenta phát sáng) */
                filter: drop-shadow(0 0 ${4 * s}px ${c}) 
                        drop-shadow(0 0 ${9 * s}px #bd00ff) 
                        drop-shadow(0 0 ${1.5 * s}px #000);
                /* Áp dụng hoạt ảnh chuyển động xoáy và xung kích tinh vân */
                animation: dark-abyss-vortex 0.9s linear infinite;
                /* Lệch pha thời gian giữa các hố đen để nhìn tự nhiên và hỗn loạn */
                animation-delay: -${Math.random() * 900}ms;
            `;

            // SVG Vòng xoáy Hố đen Hư không siêu thực cao cấp
            inner.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 60 60" style="overflow:visible;">
                    <defs>
                        <radialGradient id="vrtxGrad-${gid}" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="#000000" />
                            <stop offset="25%" stop-color="#120024" />
                            <stop offset="60%" stop-color="${c}" stop-opacity="0.95" />
                            <stop offset="85%" stop-color="#bd00ff" stop-opacity="0.8" />
                            <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
                        </radialGradient>
                    </defs>

                    <circle cx="30" cy="30" r="28" fill="url(#vrtxGrad-${gid})" opacity="0.6"/>

                    <path d="M 30,5 C 45,5 55,15 55,30 C 55,42 42,48 35,42 C 28,36 34,26 30,26 C 26,26 22,34 16,30 C 10,26 15,14 22,9 C 26,6 28,5 30,5 Z" 
                          fill="url(#vrtxGrad-${gid})" />

                    <path d="M 30,55 C 15,55 5,45 5,30 C 5,18 18,12 25,18 C 32,24 26,34 30,34 C 34,34 38,26 44,30 C 50,34 45,46 38,51 C 34,54 32,55 30,55 Z" 
                          fill="url(#vrtxGrad-${gid})" opacity="0.85" transform="rotate(90 30 30)"/>

                    <circle cx="30" cy="30" r="11" fill="none" stroke="#bd00ff" stroke-width="2.5" stroke-dasharray="4 8" opacity="0.7"/>
                    <circle cx="30" cy="30" r="9" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="12 6" opacity="0.5"/>

                    <circle cx="30" cy="30" r="7.5" fill="#000000" stroke="#120024" stroke-width="1"/>

                    <circle cx="14" cy="18" r="1.5" fill="#bd00ff" opacity="0.8"/>
                    <circle cx="46" cy="42" r="1.2" fill="#ffffff" opacity="0.9"/>
                    <circle cx="42" cy="15" r="2" fill="#000000" />
                    <circle cx="18" cy="45" r="1.8" fill="#bd00ff" opacity="0.7"/>
                </svg>
            `;

            outer.appendChild(inner);
            return outer;
        };

        // Bùng nổ trận pháp triệu hồi binh đoàn Hố Đen Hư Không tàn phá màn hình qua bộ lõi AOE của bạn
        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildDarkSpirit,
            color: '#705848', // Sắc xám đen hắc ám đặc trưng của hệ Dark hệ thống Pokemon
            phase2: 'random', 
            count: 15,        // 15 hố đen cùng xuất hiện co giãn xoay tròn sẽ cực kỳ áp đảo
        });
    },
    async spawnGround4(startEl, endEl, count, scale) {
        // Tự động inject hiệu ứng nhấp nhô vác búa hành quân của dũng sĩ (chỉ chạy 1 lần)
        if (!document.getElementById('pkm-ground-dwarf-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pkm-ground-dwarf-keyframes';
            style.textContent = `
                @keyframes ground-dwarf-march {
                    0%, 100% { transform: translateY(0) scale(1); }
                    25% { transform: translateY(-4px) scaleY(1.03) rotate(-1deg); } /* Nhấc chân bước */
                    50% { transform: translateY(1px) scaleX(1.02) scaleY(0.98); }  /* Giậm chân nện đất */
                    75% { transform: translateY(-2px) scaleY(1.01) rotate(1deg); }
                }
            `;
            document.head.appendChild(style);
        }

        let uid = 0;
        const buildGroundSpirit = (x, y, s, c) => {
            // Khung hình chữ nhật đứng rộng rãi để chứa trọn vẹn dũng sĩ vác búa ngang vai
            const w = 70 * s, h = 70 * s;
            const gid = `dwarf-${Date.now()}-${uid++}`;

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                /* Hào quang Thần Đất cổ xưa (Nâu đất cổ đại -> Vàng kim quặng đá -> Lõi sáng) */
                filter: drop-shadow(0 0 ${4 * s}px ${c}) 
                        drop-shadow(0 0 ${9 * s}px #d35400) 
                        drop-shadow(0 0 ${1.5 * s}px #fff);
                /* Áp dụng hoạt ảnh hành quân vác búa cực nặng */
                animation: ground-dwarf-march 0.65s ease-in-out infinite;
                animation-delay: -${Math.random() * 650}ms;
            `;

            // SVG Thiết kế Người lùn chiến binh bám sát 100% theo ảnh mẫu
            inner.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 100 100" style="overflow:visible;">
                    <defs>
                        <!-- Gradient màu búa thép vát cạnh -->
                        <linearGradient id="wpGrad-${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#95a5a6"/>
                            <stop offset="40%" stop-color="#34495e"/>
                            <stop offset="100%" stop-color="#1a252f"/>
                        </linearGradient>
                        <!-- Gradient bộ râu cam đỏ rực lửa sử thi -->
                        <linearGradient id="beardGrad-${gid}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#f39c12"/>
                            <stop offset="30%" stop-color="#e67e22"/>
                            <stop offset="75%" stop-color="#d35400"/>
                            <stop offset="100%" stop-color="#873600"/>
                        </linearGradient>
                        <!-- Gradient áo giáp vải xanh lục bảo tối trong ảnh -->
                        <linearGradient id="tunicGrad-${gid}" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stop-color="#145a32"/>
                            <stop offset="50%" stop-color="#196f3d"/>
                            <stop offset="100%" stop-color="#0e6251"/>
                        </linearGradient>
                    </defs>

                    <!-- 1. CÁN BÚA THÉP (Đặt ngang vai phía sau đầu) -->
                    <rect x="5" y="24" width="90" height="5" rx="2" fill="#bdc3c7" stroke="#7f8c8d" stroke-width="1"/>

                    <!-- 2. ĐẦU BÚA TẠ KHỔNG LỒ (Dáng vuông vát cạnh bọc thép cực nặng bên trái y như ảnh) -->
                    <path d="M 3,10 L 25,14 L 25,39 L 3,43 Z" fill="url(#wpGrad-${gid})" stroke="#111" stroke-width="1.5" />
                    <!-- Viền gờ nổi bọc thép đầu búa -->
                    <rect x="1" y="8" width="5" height="37" fill="#7f8c8d" rx="1" transform="rotate(-5 3 26)" />
                    <!-- Hoa văn cổ tự / Rãnh khắc cơ khí màu vàng trên búa -->
                    <path d="M 10,20 L 18,22 L 18,31 L 10,33 Z" fill="#f1c40f" opacity="0.65"/>

                    <!-- 3. THÂN HÌNH & GIÁP VẢI XANH LỤC BẢO (Dáng thấp lùn nhưng vai rộng lực lưỡng) -->
                    <path d="M 22,42 C 22,36 78,36 78,42 L 83,85 C 83,92 17,92 17,85 Z" fill="url(#tunicGrad-${gid})" />
                    <!-- Đai lưng da to bản kèm khóa vàng ở bụng -->
                    <rect x="30" y="68" width="40" height="8" fill="#5c4033" />
                    <rect x="44" y="66" width="12" height="12" fill="none" stroke="#f1c40f" stroke-width="2" />

                    <!-- 4. ĐẦU NGƯỜI LÙN CHÂN THỰC (Đầu hói/trọc oai phong, da sạm nắng, không đội mũ) -->
                    <circle cx="50" cy="32" r="13" fill="#f5b041" />
                    <!-- Đôi mắt ti hí cau có phát sáng tinh anh -->
                    <ellipse cx="45" cy="29" rx="2.2" ry="1.2" fill="#ffffff" style="filter: drop-shadow(0 0 2px #fff);"/>
                    <ellipse cx="55" cy="29" rx="2.2" ry="1.2" fill="#ffffff" style="filter: drop-shadow(0 0 2px #fff);"/>
                    <!-- Chân mày rậm hung dữ màu cam -->
                    <path d="M 40,25 Q 45,27 49,28 M 60,25 Q 55,27 51,28" stroke="#ba4a00" stroke-width="2.5" stroke-linecap="round"/>

                    <!-- 5. BỘ RÂU QUAI NÓN CAM ĐỎ SIÊU DÀY & TẾT BÍM (Trọng tâm nghệ thuật của ảnh) -->
                    <!-- Lớp râu quai nón bao phủ hai má -->
                    <path d="M 37,32 C 32,55 40,88 50,88 C 60,88 68,55 63,32 Z" fill="url(#beardGrad-${gid})" />
                    <!-- Bím tóc tết râu dài đổ dọc chính giữa ngực -->
                    <path d="M 45,36 Q 50,68 46,84 L 54,84 Q 50,68 55,36 Z" fill="#ba4a00" />
                    <!-- Vòng khuyên kim loại vàng buộc túm đuôi râu đúng như ảnh mẫu -->
                    <rect x="45" y="72" width="10" height="4" fill="#f1c40f" rx="1" />

                    <!-- 6. ĐÔI TAY ĐEO BAO TAY DA ĐỎ (Nắm chặt lấy cán búa tạ) -->
                    <circle cx="32" cy="26" r="5" fill="#78281f" stroke="#511812" stroke-width="1"/>
                    <circle cx="68" cy="26" r="5" fill="#78281f" stroke="#511812" stroke-width="1"/>
                </svg>
            `;

            outer.appendChild(inner);
            return outer;
        };

        // Triệu hồi bùng nổ trận pháp quân đoàn Người Lùn vác búa nện đất rung chuyển màn hình
        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildGroundSpirit,
            color: '#e0c068', // Màu vàng đất đặc trưng của hệ Ground
            phase2: 'random', 
            count: 14,        // 14 chiến binh khổng lồ cùng vác búa xung trận cực kỳ hoành tráng
        });
    },
    async spawnPoison4(startEl, endEl, count, scale) {
        // Tự động inject hiệu ứng co giật uốn lượn rùng rợn của độc vật (chạy 1 lần duy nhất)
        if (!document.getElementById('pkm-poison-epic-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pkm-poison-epic-keyframes';
            style.textContent = `
                @keyframes poison-beast-twitch {
                    0%, 100% { transform: scale(1) translate(0, 0) rotate(0deg); opacity: 0.9; }
                    20% { transform: scale(1.05, 0.95) translate(-2px, 1px) rotate(-3deg); opacity: 1; }
                    40% { transform: scale(0.95, 1.05) translate(2px, -2px) rotate(3deg); }
                    60% { transform: scale(1.02, 0.98) translate(-1px, -1px) rotate(-1deg); }
                    80% { transform: scale(0.98, 1.02) translate(1px, 2px) rotate(2deg); opacity: 0.8; }
                }
            `;
            document.head.appendChild(style);
        }

        let uid = 0;
        const buildPoisonSpirit = (x, y, s, c) => {
            // Phân bổ đều đặn 5 con trong Ngũ Độc dựa trên ID tuần hoàn
            const types = ['toad', 'centipede', 'frog', 'scorpion', 'snake'];
            const kind = types[uid % types.length];
            const gid = `psn-${Date.now()}-${uid++}`;

            const w = 50 * s, h = 50 * s;
            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                /* Hào quang Độc dược rực rỡ (Tím Hệ Độc -> Xanh Neon Độc lực -> Lõi Đen kịch độc) */
                filter: drop-shadow(0 0 ${4 * s}px ${c}) 
                        drop-shadow(0 0 ${8 * s}px #39ff14) 
                        drop-shadow(0 0 ${1.5 * s}px #000);
                /* Áp dụng hoạt ảnh giật nảy, ngo ngoe đầy rùng rợn */
                animation: poison-beast-twitch 0.7s ease-in-out infinite;
                animation-delay: -${Math.random() * 700}ms;
            `;

            // Định nghĩa SVG chi tiết cho từng loại trong Ngũ Độc
            let svgContent = '';
            if (kind === 'toad') {
                // 1. CÓC ĐỘC (Toad): Mập mạp, nhiều mụn cóc phát sáng dạ quang, mắt đỏ rực
                svgContent = `
                    <svg width="${w}" height="${h}" viewBox="0 0 50 50" style="overflow:visible;">
                        <defs>
                            <linearGradient id="toadGrad-${gid}" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stop-color="#2e1a47"/>
                                <stop offset="70%" stop-color="${c}"/>
                                <stop offset="100%" stop-color="#12021c"/>
                            </linearGradient>
                        </defs>
                        <!-- Chân sau gấp khúc -->
                        <path d="M 6,32 Q 2,38 9,40 Q 12,35 9,32" fill="#12021c" />
                        <path d="M 44,32 Q 48,38 41,40 Q 38,35 41,32" fill="#12021c" />
                        <!-- Thân cóc mập mạp -->
                        <ellipse cx="25" cy="28" rx="15" ry="13" fill="url(#toadGrad-${gid})" stroke="#12021c" stroke-width="1.2" />
                        <!-- Đầu và miệng rộng bản -->
                        <ellipse cx="25" cy="18" rx="10" ry="7.5" fill="url(#toadGrad-${gid})" />
                        <path d="M 18,20 Q 25,24 32,20" stroke="#12021c" stroke-width="1" fill="none" />
                        <!-- Mụn cóc chứa dịch độc phát sáng màu xanh dạ quang -->
                        <circle cx="16" cy="23" r="1.5" fill="#39ff14" opacity="0.9"/>
                        <circle cx="34" cy="23" r="1.5" fill="#39ff14" opacity="0.9"/>
                        <circle cx="21" cy="29" r="1.8" fill="#39ff14" opacity="0.9"/>
                        <circle cx="29" cy="29" r="1.8" fill="#39ff14" opacity="0.9"/>
                        <circle cx="25" cy="34" r="1.2" fill="#39ff14" opacity="0.9"/>
                        <!-- Đôi mắt Độc Cóc rực lửa hồng neon -->
                        <circle cx="19" cy="14" r="2.2" fill="#ff007f" />
                        <circle cx="31" cy="14" r="2.2" fill="#ff007f" />
                    </svg>
                `;
            } else if (kind === 'centipede') {
                // 2. RẾT ĐỘC (Centipede): Thân phân đốt uốn lượn S-line, chân tua tủa nhọn hoắt
                svgContent = `
                    <svg width="${w}" height="${h}" viewBox="0 0 50 50" style="overflow:visible;">
                        <defs>
                            <linearGradient id="centGrad-${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#12051c"/>
                                <stop offset="50%" stop-color="${c}"/>
                                <stop offset="100%" stop-color="#ff007f"/>
                            </linearGradient>
                        </defs>
                        <!-- Cặp râu dài ngo ngoe ở đầu -->
                        <path d="M 22,6 Q 14,2 10,5" stroke="#ff007f" stroke-width="1.2" fill="none" stroke-linecap="round"/>
                        <path d="M 28,6 Q 36,2 40,5" stroke="#ff007f" stroke-width="1.2" fill="none" stroke-linecap="round"/>
                        <!-- Hàng chân tăm nhọn tỏa ra hai bên thân -->
                        <path d="M 18,12 L 11,11 M 32,12 L 39,11" stroke="#39ff14" stroke-width="1.2" stroke-linecap="round"/>
                        <path d="M 16,18 L 9,18 M 34,18 L 41,18" stroke="#39ff14" stroke-width="1.2" stroke-linecap="round"/>
                        <path d="M 17,24 L 10,25 M 33,24 L 40,25" stroke="#39ff14" stroke-width="1.2" stroke-linecap="round"/>
                        <path d="M 19,30 L 12,32 M 31,30 L 38,32" stroke="#39ff14" stroke-width="1.2" stroke-linecap="round"/>
                        <path d="M 22,36 L 15,39 M 28,36 L 35,39" stroke="#39ff14" stroke-width="1.2" stroke-linecap="round"/>
                        <path d="M 24,42 L 18,46 M 26,42 L 32,46" stroke="#39ff14" stroke-width="1.2" stroke-linecap="round"/>
                        <!-- Thân rết uốn lượn u viễn kéo dài -->
                        <path d="M 25,7 Q 16,21 25,31 T 25,47" fill="none" stroke="url(#centGrad-${gid})" stroke-width="5" stroke-linecap="round"/>
                        <!-- Đầu rết cứng cáp với mắt sáng -->
                        <circle cx="25" cy="7" r="3.5" fill="#12051c" stroke="#ff007f" stroke-width="1"/>
                        <circle cx="23.5" cy="6" r="0.6" fill="#39ff14"/>
                        <circle cx="26.5" cy="6" r="0.6" fill="#39ff14"/>
                    </svg>
                `;
            } else if (kind === 'frog') {
                // 3. ẾCH ĐỘC (Toxic Dart Frog): Kiểu dáng ếch phi tiêu, da xanh neon loang lổ đốm đen chí mạng
                svgContent = `
                    <svg width="${w}" height="${h}" viewBox="0 0 50 50" style="overflow:visible;">
                        <defs>
                            <linearGradient id="frogGrad-${gid}" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stop-color="#39ff14"/>
                                <stop offset="55%" stop-color="#00aa50"/>
                                <stop offset="100%" stop-color="#12021c"/>
                            </linearGradient>
                        </defs>
                        <!-- Đôi chân ếch gấp nếp dài sẵn sàng bật nhảy -->
                        <path d="M 15,34 C 8,34 8,42 15,42" stroke="#39ff14" stroke-width="2.8" fill="none" stroke-linecap="round"/>
                        <path d="M 35,34 C 42,34 42,42 35,42" stroke="#39ff14" stroke-width="2.8" fill="none" stroke-linecap="round"/>
                        <!-- Thân ếch thon gọn dài -->
                        <ellipse cx="25" cy="25" rx="10" ry="14.5" fill="url(#frogGrad-${gid})" />
                        <!-- Cánh tay bám đá -->
                        <path d="M 16,21 Q 9,23 12,28" stroke="#39ff14" stroke-width="1.8" fill="none" stroke-linecap="round"/>
                        <path d="M 34,21 Q 41,23 38,28" stroke="#39ff14" stroke-width="1.8" fill="none" stroke-linecap="round"/>
                        <!-- Đốm đen kịch độc (Hắc sắc tố đặc trưng của loài ếch phi tiêu) -->
                        <circle cx="21" cy="18" r="1.5" fill="#12021c"/>
                        <circle cx="29" cy="18" r="1.5" fill="#12021c"/>
                        <circle cx="25" cy="26" r="2" fill="#12021c"/>
                        <circle cx="19" cy="31" r="1.5" fill="#12021c"/>
                        <circle cx="31" cy="31" r="1.5" fill="#12021c"/>
                        <!-- Cặp mắt ếch lồi to rực vàng rùng rợn -->
                        <circle cx="17" cy="12" r="2.8" fill="#ffd700" />
                        <circle cx="17" cy="12" r="1" fill="#000" />
                        <circle cx="33" cy="12" r="2.8" fill="#ffd700" />
                        <circle cx="33" cy="12" r="1" fill="#000" />
                    </svg>
                `;
            } else if (kind === 'scorpion') {
                // 4. BỌ CẠP (Scorpion): Đôi càng vạm vỡ rực hồng, đuôi cong vút găm kim độc phát quang
                svgContent = `
                    <svg width="${w}" height="${h}" viewBox="0 0 50 50" style="overflow:visible;">
                        <defs>
                            <linearGradient id="scGrad-${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#12021c"/>
                                <stop offset="60%" stop-color="${c}"/>
                                <stop offset="100%" stop-color="#000000"/>
                            </linearGradient>
                        </defs>
                        <!-- Chân bọ cạp tủa hai bên -->
                        <path d="M 15,26 L 8,28 M 35,26 L 42,28" stroke="#4a125a" stroke-width="1.5" stroke-linecap="round" />
                        <path d="M 15,30 L 7,33 M 35,30 L 43,33" stroke="#4a125a" stroke-width="1.5" stroke-linecap="round" />
                        <path d="M 15,34 L 9,38 M 35,34 L 41,38" stroke="#4a125a" stroke-width="1.5" stroke-linecap="round" />
                        <!-- Thân chính giáp bảo vệ phân đốt -->
                        <ellipse cx="25" cy="29" rx="9" ry="12" fill="url(#scGrad-${gid})" stroke="#4a125a" stroke-width="1"/>
                        <!-- Cánh tay và Càng kẹp to khỏe sẵn sàng nghiền nát con mồi -->
                        <path d="M 18,22 Q 9,16 11,10" stroke="url(#scGrad-${gid})" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                        <path d="M 11,10 C 8,8 11,3 14,7 C 12,9 15,10 11,10" fill="#ff007f" />
                        <path d="M 32,22 Q 41,16 39,10" stroke="url(#scGrad-${gid})" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                        <path d="M 39,10 C 42,8 39,3 36,7 C 38,9 35,10 39,10" fill="#ff007f" />
                        <!-- Đuôi bọ cạp phân đốt lượn ngược lên trên -->
                        <path d="M 25,39 C 25,49 43,45 37,31 C 34,23 29,21 31,16" fill="none" stroke="url(#scGrad-${gid})" stroke-width="3" stroke-linecap="round" />
                        <!-- Kim độc châm phát dạ quang xanh lá kịch độc cực ngầu -->
                        <path d="M 31,16 Q 34,12 30,9 Q 27,13 31,16 Z" fill="#39ff14" style="filter: drop-shadow(0 0 2.5px #39ff14);" />
                    </svg>
                `;
            } else {
                // 5. RẮN ĐỘC (Snake): Rắn hổ mang uốn lượn S-shape, nhe nanh phè lưỡi đỏ chót cực tàn bạo
                svgContent = `
                    <svg width="${w}" height="${h}" viewBox="0 0 50 50" style="overflow:visible;">
                        <defs>
                            <linearGradient id="snakeGrad-${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#12021c"/>
                                <stop offset="50%" stop-color="${c}"/>
                                <stop offset="85%" stop-color="#39ff14"/>
                                <stop offset="100%" stop-color="#000000"/>
                            </linearGradient>
                        </defs>
                        <!-- Thân rắn uốn khúc uyển chuyển thon nhỏ dần -->
                        <path d="M 16,39 C 6,29 18,21 25,24 C 32,27 44,19 34,11 C 29,7 23,9 20,13" 
                              fill="none" stroke="url(#snakeGrad-${gid})" stroke-width="4.5" stroke-linecap="round" />
                        <!-- Đầu rắn hổ mang bành bự che chở phát sáng -->
                        <path d="M 20,13 L 16,11 L 18,16 Z" fill="#12021c" stroke="#39ff14" stroke-width="0.8" />
                        <!-- Cặp mắt rắn xếch tàn độc màu vàng hổ phách -->
                        <circle cx="17.8" cy="12.5" r="0.7" fill="#ffd700" />
                        <circle cx="18.8" cy="14" r="0.7" fill="#ffd700" />
                        <!-- Chiếc lưỡi phân nhánh phóng ra hung tợn màu đỏ neon -->
                        <path d="M 16,11 Q 12,9 10,10 M 16,11 Q 13,7 12,7" stroke="#ff0055" stroke-width="1" fill="none" stroke-linecap="round"/>
                    </svg>
                `;
            }

            inner.innerHTML = svgContent;
            outer.appendChild(inner);
            return outer;
        };

        // Kích hoạt bùng nổ trận pháp Ngũ Độc vây hãm, tàn sát đối thủ toàn màn hình
        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildPoisonSpirit,
            color: '#a040a0', // Sắc tím Độc dược huyền thoại của hệ Poison
            phase2: 'random', 
            count: 15,        // 15 độc vật xuất thế (đảm bảo xuất hiện trọn vẹn 3 vòng tuần hoàn đầy đủ Ngũ Độc)
        });
    },
    async spawnPsychic4(startEl, endEl, count, scale) {
        // Tự động thêm hiệu ứng bẻ cán thìa nghệ thuật và sóng não đồng bộ
        if (!document.getElementById('pkm-psychic-spoon-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pkm-psychic-spoon-keyframes';
            style.textContent = `
                /* Trôi nổi tâm linh nhẹ nhàng */
                @keyframes psychic-spoon-float {
                    0%, 100% { transform: translateY(0) rotate(0deg); }
                    50% { transform: translateY(-6px) rotate(1.5deg); }
                }
                /* Bẻ cong cán thìa cực mượt tại khớp nối */
                @keyframes psychic-spoon-bend {
                    0%, 30% { transform: rotate(0deg); }
                    52% { transform: rotate(-68deg); } /* Lực bẻ gập mạnh mẽ */
                    78% { transform: rotate(-68deg); } /* Giữ trạng thái giải phóng năng lượng */
                    92%, 100% { transform: rotate(0deg); }
                }
                /* Sóng chấn động não Psywave lan tỏa đồng điệu với nhịp gập */
                @keyframes psywave-expansion {
                    0%, 32% { transform: scale(0.1); opacity: 0; }
                    36% { opacity: 0.85; stroke-width: 2.5; }
                    72% { transform: scale(3); opacity: 0; stroke-width: 0.5; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        let uid = 0;
        const buildPsychicSpirit = (x, y, s, c) => {
            const w = 75 * s, h = 75 * s; // Tăng nhẹ kích thước hiển thị rõ chi tiết tinh xảo
            const gid = `spoon-adv-${Date.now()}-${uid++}`;

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                /* Hào quang bóp méo thực tại: Hồng Neon phối Xanh Băng siêu thực */
                filter: drop-shadow(0 0 ${3.5 * s}px ${c}) 
                        drop-shadow(0 0 ${7 * s}px #00f0ff);
                animation: psychic-spoon-float 1.8s ease-in-out infinite;
                animation-delay: -${Math.random() * 1800}ms;
            `;

            // SVG Thiết kế Thực thể Thìa Cổ Đại cao cấp bám sát ảnh mẫu
            inner.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 80 80" style="overflow:visible;">
                    <defs>
                        <linearGradient id="metal-${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#ffffff"/>
                            <stop offset="25%" stop-color="#e5e8e8"/>
                            <stop offset="48%" stop-color="#95a5a6"/>
                            <stop offset="52%" stop-color="#7f8c8d"/>
                            <stop offset="65%" stop-color="#bdc3c7"/>
                            <stop offset="85%" stop-color="#ffffff"/>
                            <stop offset="100%" stop-color="#2c3e50"/>
                        </linearGradient>

                        <radialGradient id="jewel-${gid}" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="#ffffff"/>
                            <stop offset="45%" stop-color="#ff00ff"/>
                            <stop offset="100%" stop-color="#4a004a"/>
                        </radialGradient>
                    </defs>

                    <circle cx="40" cy="36" r="5" fill="none" stroke="#ff007f" 
                            style="transform-origin: 40px 36px; animation: psywave-expansion 1.8s ease-out infinite; animation-delay: inherit;" />
                    <circle cx="40" cy="36" r="5" fill="none" stroke="#00f0ff" 
                            style="transform-origin: 40px 36px; animation: psywave-expansion 1.8s ease-out infinite; animation-delay: inherit; animation-delay: -0.2s;" />

                    <g style="transform-origin: 40px 36px;">
                        <path d="M 36,36 L 44,36 L 42,41 L 38,41 Z" fill="url(#metal-${gid})" stroke="#566573" stroke-width="0.5"/>
                        <circle cx="40" cy="38" r="2" fill="#ff007f" />

                        <path d="M 40,41 C 33,41 25,47 25,58 C 25,69 32,73 40,73 C 48,73 55,69 55,58 C 55,47 47,41 40,41 Z" 
                              fill="url(#metal-${gid})" stroke="#566573" stroke-width="0.5" />

                        <path d="M 40,44 C 35,44 29,49 29,58 C 29,66 34,70 40,70 C 46,70 51,66 51,58 C 51,49 45,44 40,44 Z" 
                              fill="#000000" opacity="0.18" />

                        <path d="M 33,52 C 31,56 31,61 34,64 C 32,62 31,58 32,54 Z" fill="#ffffff" opacity="0.55" />
                    </g>

                    <g style="transform-origin: 40px 36px; animation: psychic-spoon-bend 1.8s ease-in-out infinite; animation-delay: inherit;">
                        <path d="M 37,36 L 43,36 L 42,20 C 44,16 45,12 43,7 C 40,4 40,4 37,7 C 35,12 36,16 38,20 Z" 
                              fill="url(#metal-${gid})" stroke="#566573" stroke-width="0.5" />

                        <path d="M 40,33 L 40,20" stroke="#00f0ff" stroke-width="1.2" stroke-linecap="round" opacity="0.85"/>

                        <path d="M 40,3 L 44,7 L 40,11 L 36,7 Z" fill="url(#metal-${gid})" stroke="#566573" stroke-width="0.5" />

                        <circle cx="40" cy="7" r="2.2" fill="url(#jewel-${gid})" style="filter: drop-shadow(0 0 2px #ff00ff);" />
                    </g>
                </svg>
            `;

            outer.appendChild(inner);
            return outer;
        };

        // Kích nổ trận pháp quân đoàn Thìa Thần Bí bao vây toàn diện đối thủ
        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildPsychicSpirit,
            color: '#f85888',
            phase2: 'random', 
            count: 14,        
        });
    },
    async spawnNormal4(startEl, endEl, count, scale) {
        // Tự động thêm hiệu ứng hoạt ảnh xoay ngôi sao hoàng kim và vòng xung kích hệ Thường
        if (!document.getElementById('pkm-normal-star-keyframes')) {
            const style = document.createElement('style');
            style.id = 'pkm-normal-star-keyframes';
            style.textContent = `
                /* Hoạt ảnh triệu hồi: Ngôi sao xoay tít và phóng to từ tâm */
                @keyframes normal-star-spin {
                    0% { transform: rotate(0deg) scale(0.1); opacity: 0; }
                    15% { opacity: 1; transform: rotate(180deg) scale(1.1); }
                    30% { transform: rotate(360deg) scale(1); }
                    80% { transform: rotate(720deg) scale(1); opacity: 1; }
                    100% { transform: rotate(900deg) scale(0); opacity: 0; }
                }
                /* Sóng xung kích năng lượng thuần khiết lan tỏa khi thực thể xuất hiện */
                @keyframes normal-shockwave {
                    0% { transform: scale(0.1); opacity: 0; }
                    20% { opacity: 0.8; stroke-width: 2; }
                    60% { transform: scale(2.2); opacity: 0; stroke-width: 0.5; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        let uid = 0;
        const buildNormalSpirit = (x, y, s, c) => {
            const w = 65 * s, h = 65 * s; // Kích thước ngôi sao cân đối
            const gid = `star-${Date.now()}-${uid++}`;

            const outer = document.createElement('div');
            outer.style.cssText = `
                position: fixed; left:${x}px; top:${y}px;
                width:${w}px; height:${h}px;
                pointer-events: none; z-index: 9998; opacity: 0;
            `;

            const inner = document.createElement('div');
            inner.style.cssText = `
                position: absolute; inset: 0;
                /* Hào quang năng lượng hệ Thường chói sáng: Vàng kim phối Trắng tinh khôi */
                filter: drop-shadow(0 0 ${3 * s}px #f1c40f) 
                        drop-shadow(0 0 ${6 * s}px #ffffff);
                /* Kích hoạt hoạt ảnh xoay và bùng nổ của ngôi sao */
                animation: normal-star-spin 1.5s cubic-bezier(0.25, 1, 0.5, 1) infinite;
                animation-delay: -${Math.random() * 1500}ms;
            `;

            // SVG Thiết kế Ngôi Sao Hoàng Kim nguyên khối 3D sắc nét
            inner.innerHTML = `
                <svg width="${w}" height="${h}" viewBox="0 0 60 60" style="overflow:visible;">
                    <defs>
                        <linearGradient id="goldGrad-${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#ffffff"/>
                            <stop offset="20%" stop-color="#fff200"/>
                            <stop offset="50%" stop-color="#f1c40f"/>
                            <stop offset="80%" stop-color="#d35400"/>
                            <stop offset="100%" stop-color="#9a7d0a"/>
                        </linearGradient>

                        <linearGradient id="goldDarkGrad-${gid}" x1="100%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#f39c12"/>
                            <stop offset="70%" stop-color="#b7950b"/>
                            <stop offset="100%" stop-color="#7e5109"/>
                        </linearGradient>
                    </defs>

                    <circle cx="30" cy="30" r="6" fill="none" stroke="#ffffff" 
                            style="transform-origin: 30px 30px; animation: normal-shockwave 1.5s ease-out infinite; animation-delay: inherit;" />
                    <circle cx="30" cy="30" r="6" fill="none" stroke="#f1c40f" 
                            style="transform-origin: 30px 30px; animation: normal-shockwave 1.5s ease-out infinite; animation-delay: inherit; animation-delay: -0.3s;" />

                    <g style="transform-origin: 30px 30px;">
                        <polygon points="30,4 38,20 56,20 42,31 47,48 30,38 13,48 18,31 4,20 22,20" 
                                 fill="url(#goldGrad-${gid})" stroke="#f39c12" stroke-width="0.3" />

                        <polygon points="30,4 30,38 38,20" fill="url(#goldDarkGrad-${gid})" opacity="0.35" />
                        <polygon points="56,20 30,38 42,31" fill="url(#goldDarkGrad-${gid})" opacity="0.35" />
                        <polygon points="47,48 30,38 30,38" fill="url(#goldDarkGrad-${gid})" opacity="0.35" />
                        <polygon points="13,48 30,38 18,31" fill="url(#goldDarkGrad-${gid})" opacity="0.35" />
                        <polygon points="4,20 30,38 22,20" fill="url(#goldDarkGrad-${gid})" opacity="0.35" />

                        <circle cx="30" cy="30" r="3" fill="#ffffff" opacity="0.8" style="filter: blur(0.5px);" />
                    </g>
                </svg>
            `;

            outer.appendChild(inner);
            return outer;
        };

        // Triệu hồi trận pháp kích nổ 16 ngôi sao tốc độ bao vây và oanh tạc đối thủ
        await this.playScreenSummonBurst(endEl, scale, {
            itemBuilder: buildNormalSpirit,
            color: '#a8a878', // Màu sắc đặc trưng đại diện cho hệ Thường (Normal)
            phase2: 'random', 
            count: 16,        
        });
    },
    // ══════════════════════════════════════════════════════════
    // ENGINE DÙNG CHUNG CHO SKILL "TRIỆU HỒI BẢN THỂ KHỔNG LỒ" (spawn3)
    // Timeline 3 pha — mỗi hệ chỉ cần gọi hàm này với { color, sfxType }:
    //   Pha 1 (chargeAura)          : Pokemon tự nâng lên + vòng xoáy gió
    //                                 dưới chân (màu hệ) + bản thể ma khổng
    //                                 lồ (x7, opacity 0.5, dùng ĐÚNG ảnh
    //                                 đang hiển thị — gif động hay ảnh tĩnh
    //                                 fallback đều tự động đúng vì clone
    //                                 thẳng currentSrc/src) hiện dần, Pokemon
    //                                 thật đứng giữa bản thể (z-index cao hơn).
    //   Pha 2 (60% targetSustain)   : Bản thể tách khỏi Pokemon, lao thẳng
    //                                 tới điểm trung tâm phe địch (endEl —
    //                                 đã được runAsScreenBarrage tính sẵn).
    //                                 Pokemon thật chầm chậm hạ xuống lại.
    //   Pha 3 (40% targetSustain)   : Va chạm — nổ tại điểm trúng, đẩy lùi
    //                                 toàn bộ Pokemon địch còn sống ra xa
    //                                 tâm nổ, hiện sao choáng ~1s, rồi tất cả
    //                                 trượt về đúng vị trí cũ.
    // Ngân sách thời gian TUÂN THỦ đúng quy ước cũ: tổng = chargeAura +
    // targetSustain (không cộng dồn thêm ngoài đó).
    // ══════════════════════════════════════════════════════════
    async playGiantSpiritCharge(attacker, endEl, scale, opts) {
        const { color = '#fff', ghostMultiplier = 14, sfxType = 'normal' } = opts || {};
        const cfg = this.durationConfig.aoe;
        const chargeMs = cfg.chargeAura;
        const descendMs = Math.min(320, cfg.targetSustain * 0.22);
        const flyMs   = cfg.targetSustain * 0.4;
        const knockMs = cfg.targetSustain * 0.6 - descendMs;

        const imgEl = attacker.querySelector('img');
        const imgWrapper = attacker.querySelector('div');
        if (!imgEl || !imgWrapper) return;

        const flip = parseFloat(attacker.dataset.flip) || 1;
        const flipSign = flip < 0 ? -1 : 1;
        const baseScale = parseFloat(attacker.dataset.scale) || 1;

        const imgRect = imgEl.getBoundingClientRect();
        const centerX = imgRect.left + imgRect.width / 2;
        const centerY = imgRect.top + imgRect.height / 2;
        const ghostW = imgRect.width * ghostMultiplier;
        const ghostH = imgRect.height * ghostMultiplier;

        const allEls = [];

        // ── PHA 1: GỒNG CHIÊU — Pokémon nâng lên nhẹ + cụm ánh sáng (ghost + hào quang) hiện dần ──
        this.playChargeSfx(sfxType);

        const liftPx = Math.max(22, imgRect.height * 0.32) * scale;
        imgWrapper.style.transition = `transform ${chargeMs}ms cubic-bezier(0.22,1,0.36,1)`;
        imgWrapper.style.transform = `translateY(-${liftPx}px) scale(${baseScale}) scaleX(${flip})`;

        // ✅ Container neo tại đúng vị trí Pokémon — MỌI lớp hào quang + ghost đều
        // là con của group này, nên khi group di chuyển (Pha 2), tất cả bay theo cùng nhau.
        const ghostGroup = document.createElement('div');
        ghostGroup.style.cssText = `
            position: fixed; left:${centerX}px; top:${centerY}px;
            width:0; height:0;
            transform: translate(0px,0px);
            z-index: 9987; pointer-events:none;
            will-change: transform;
        `;
        document.body.appendChild(ghostGroup);
        allEls.push(ghostGroup);

        // 1. Tia sáng toả sau lưng (sunburst) — xoay chậm, liên tục suốt vòng đời
        const sunburstSize = ghostW * 1.15;
        const sunburst = document.createElement('div');
        sunburst.style.cssText = `
            position: absolute; left:0; top:0;
            width:${sunburstSize}px; height:${sunburstSize}px;
            background: conic-gradient(from 0deg,
                transparent 0deg, ${color}55 8deg, transparent 16deg,
                transparent 40deg, ${color}55 48deg, transparent 56deg,
                transparent 80deg, ${color}55 88deg, transparent 96deg,
                transparent 120deg, ${color}55 128deg, transparent 136deg,
                transparent 160deg, ${color}55 168deg, transparent 176deg,
                transparent 200deg, ${color}55 208deg, transparent 216deg,
                transparent 240deg, ${color}55 248deg, transparent 256deg,
                transparent 280deg, ${color}55 288deg, transparent 296deg,
                transparent 320deg, ${color}55 328deg, transparent 336deg, transparent 360deg);
            border-radius: 50%;
            transform: translate(-50%,-50%) scale(0.3) rotate(0deg);
            opacity: 0; pointer-events:none;
            will-change: transform, opacity;
        `;
        ghostGroup.appendChild(sunburst);
        sunburst.animate([
            { transform: 'translate(-50%,-50%) scale(0.3) rotate(0deg)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(1) rotate(60deg)', opacity: 0.9, offset: 0.6 },
            { transform: 'translate(-50%,-50%) scale(1) rotate(360deg)', opacity: 0.8 }
        ], { duration: 4000, iterations: Infinity, easing: 'linear' });

        // 2. Vòng hào quang nhấp nháy
        const haloOuter = document.createElement('div');
        haloOuter.style.cssText = `
            position: absolute; left:0; top:0;
            width:${ghostW * 0.55}px; height:${ghostH * 0.55}px;
            border-radius: 50%; background: ${color};
            filter: blur(${18 * scale}px);
            transform: translate(-50%,-50%) scale(0.3);
            opacity: 0; pointer-events:none;
            will-change: transform, opacity;
        `;
        ghostGroup.appendChild(haloOuter);
        haloOuter.animate([
            { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.45 }
        ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' });
        haloOuter.animate([
            { transform: 'translate(-50%,-50%) scale(0.9)' },
            { transform: 'translate(-50%,-50%) scale(1.08)' },
            { transform: 'translate(-50%,-50%) scale(0.9)' }
        ], { duration: 1400, iterations: Infinity, easing: 'ease-in-out', delay: chargeMs });

        // 3. Hạt sáng lấp lánh bay quanh
        const sparkleCount = 7;
        for (let i = 0; i < sparkleCount; i++) {
            const angle = (i / sparkleCount) * 360;
            const orbitR = ghostW * (0.42 + Math.random() * 0.12);
            const sparkle = document.createElement('div');
            const sSize = (3.5 + Math.random() * 2.5) * scale;
            sparkle.style.cssText = `
                position: absolute; left:0; top:0;
                width:${sSize}px; height:${sSize}px; border-radius:50%;
                background: #fff; box-shadow: 0 0 ${6 * scale}px ${color};
                opacity: 0; pointer-events:none;
                will-change: transform, opacity;
            `;
            ghostGroup.appendChild(sparkle);
            const spinDur = 2200 + Math.random() * 1200;
            sparkle.animate([
                { transform: `translate(-50%,-50%) rotate(${angle}deg) translateX(${orbitR}px) rotate(-${angle}deg) scale(0.5)`, opacity: 0 },
                { transform: `translate(-50%,-50%) rotate(${angle + 180}deg) translateX(${orbitR}px) rotate(-${angle + 180}deg) scale(1.1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(-50%,-50%) rotate(${angle + 360}deg) translateX(${orbitR}px) rotate(-${angle + 360}deg) scale(0.5)`, opacity: 0 }
            ], { duration: spinDur, iterations: Infinity, easing: 'linear' });
        }

        // 4. Bản thể ma khổng lồ — clone ĐÚNG ảnh đang hiển thị (cũng là con của group)
        const ghost = document.createElement('img');
        ghost.src = imgEl.currentSrc || imgEl.src;
        ghost.style.cssText = `
            position: absolute; left:0; top:0;
            width:${ghostW}px; height:${ghostH}px;
            object-fit: contain;
            transform: translate(-50%,-50%) scaleX(${flipSign}) scale(0.4);
            opacity: 0;
            filter: brightness(1.35) saturate(1.15) contrast(1.05);
            will-change: transform, opacity;
            z-index: 9990; pointer-events:none;
        `;
        ghostGroup.appendChild(ghost);
        ghost.animate([
            { transform: `translate(-50%,-50%) scaleX(${flipSign}) scale(0.4)`, opacity: 0 },
            { transform: `translate(-50%,-50%) scaleX(${flipSign}) scale(1.05)`, opacity: 0.55, offset: 0.75 },
            { transform: `translate(-50%,-50%) scaleX(${flipSign}) scale(1)`, opacity: 0.5 }
        ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' });

        await new Promise(r => setTimeout(r, chargeMs));

        // ── PHA 2: TÁCH RA & LAO ĐI — chỉ cần animate GROUP, mọi lớp hào quang bay theo cùng ghost ──
        if (this.playTravelSfx) this.playTravelSfx(sfxType);

        const rectEnd = endEl.getBoundingClientRect();
        const targetX = rectEnd.left + (rectEnd.width || 0) / 2;
        const targetY = rectEnd.top + (rectEnd.height || 0) / 2;
        const dx = targetX - centerX, dy = targetY - centerY;

        ghostGroup.animate([
            { transform: 'translate(0px,0px)', offset: 0 },
            { transform: `translate(${dx}px,${dy}px)`, offset: 1 }
        ], { duration: flyMs, fill: 'forwards', easing: 'ease-in' });

        // Ghost tự co nhỏ lại đôi chút trong lúc bay (chuyển động riêng, độc lập với group)
        ghost.animate([
            { transform: `translate(-50%,-50%) scaleX(${flipSign}) scale(1)`, opacity: 0.5, offset: 0 },
            { transform: `translate(-50%,-50%) scaleX(${flipSign}) scale(0.6)`, opacity: 0.8, offset: 1 }
        ], { duration: flyMs, fill: 'forwards', easing: 'ease-in' });

        await new Promise(r => setTimeout(r, flyMs));

        // ── PHA 3: VA CHẠM — nổ + đẩy lùi phe địch (group đã đứng yên tại điểm target) ──
        ghost.animate([
            { transform: `scaleX(${flipSign}) scale(0.6)`, opacity: 0.8 },
            { transform: `scaleX(${flipSign}) scale(1.3)`, opacity: 0.9, offset: 0.3 },
            { transform: `scaleX(${flipSign}) scale(0.2)`, opacity: 0 }
        ], { duration: Math.max(150, knockMs * 0.35), fill: 'forwards', easing: 'ease-out' });

        this.applyGlobalShake?.(scale * 1.4);
        this.playImpactSfx?.(sfxType);
        this.spawnImpactBurst(targetX, targetY, color, scale, allEls);

        const targetSide = endEl.dataset.targetSide;
        if (targetSide) this.knockbackTeam(targetSide, targetX, targetY, scale, knockMs, color);

        await new Promise(r => setTimeout(r, knockMs));

        // ── PHA 4: HẠ CÁNH — Pokemon hạ xuống lại vị trí cũ ──
        imgWrapper.style.transition = `transform ${descendMs}ms ease-in`;
        imgWrapper.style.transform = `translateY(0px) scale(${baseScale}) scaleX(${flip})`;

        await new Promise(r => setTimeout(r, descendMs));
        allEls.forEach(el => el.remove());
        imgWrapper.style.transition = '';
    },



    // Hệ thống CSS keyframe 2.5D xoay chậm vững chãi và cuộn lửa xoắn ốc đi lên
    injectVortexKeyframes() {
        if (document.getElementById('pkm-vortex-keyframes')) return;
        const style = document.createElement('style');
        style.id = 'pkm-vortex-keyframes';
        style.textContent = `
            /* Xoay chậm rãi theo chiều kim đồng hồ */
            @keyframes pkm-vortex-band-spin-clockwise {
                0%   { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            /* Xoay chậm rãi ngược chiều kim đồng hồ (để tạo độ cuộn chéo phức tạp) */
            @keyframes pkm-vortex-band-spin-counter {
                0%   { transform: rotate(360deg); }
                100% { transform: rotate(0deg); }
            }
            /* Quỹ đạo hạt xoáy 3D cuộn tròn đi lên từ chân lên đỉnh lốc */
            @keyframes pkm-vortex-orbit-up {
                0% {
                    transform: translate(-50%, -50%) translateY(var(--start-y)) rotate(0deg) translateX(var(--start-r)) scale(0.3);
                    opacity: 0;
                }
                15% {
                    opacity: 0.9;
                }
                85% {
                    opacity: 0.9;
                }
                100% {
                    transform: translate(-50%, -50%) translateY(var(--end-y)) rotate(720deg) translateX(var(--end-r)) scale(1.2);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    },

    // Nổ nhỏ (ring + flash) tại đúng điểm bản thể ma va chạm
    spawnImpactBurst(x, y, color, scale, collector) {
        const size = 70 * scale;
        const ring = document.createElement('div');
        ring.style.cssText = `
            position: fixed; left:${x}px; top:${y}px;
            width:${size}px; height:${size}px; border-radius:50%;
            background: radial-gradient(circle, #fff 10%, ${color} 45%, transparent 100%);
            box-shadow: 0 0 ${30 * scale}px ${color};
            transform: translate(-50%,-50%) scale(0);
            z-index: 9994; pointer-events:none; opacity:0;
        `;
        document.body.appendChild(ring);
        if (collector) collector.push(ring);
        ring.animate([
            { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(2.2)', opacity: 0.9, offset: 0.35 },
            { transform: 'translate(-50%,-50%) scale(3.2)', opacity: 0 }
        ], { duration: 500, fill: 'forwards', easing: 'ease-out' });

        const flash = document.createElement('div');
        const fsize = size * 2.2;
        flash.style.cssText = `
            position: fixed; left:${x}px; top:${y}px;
            width:${fsize}px; height:${fsize}px; border-radius:50%;
            background: radial-gradient(circle, #fff 0%, transparent 70%);
            transform: translate(-50%,-50%) scale(0);
            z-index: 9993; pointer-events:none; opacity:0;
        `;
        document.body.appendChild(flash);
        if (collector) collector.push(flash);
        flash.animate([
            { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 0.8, offset: 0.25 },
            { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 0 }
        ], { duration: 400, fill: 'forwards', easing: 'ease-out' });
    },

    // Đẩy lùi toàn bộ Pokemon còn sống của 1 phe ra xa điểm va chạm,
    // hiện sao choáng trên đầu ~1s, rồi tất cả trượt về đúng vị trí cũ.
    knockbackTeam(targetSide, impactX, impactY, scale, budgetMs, color) {
        this.injectDazedKeyframes();

        const outDur = 200, backDur = 320;
        const holdDur = Math.max(400, budgetMs - outDur - backDur);
        const total = outDur + holdDur + backDur;
        const knockDist = 55 * scale;

        document.querySelectorAll(`.pkm-unit[id^="${targetSide}-unit-"]`).forEach(el => {
            if (el.dataset.dead === '1') return;

            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            let dx = cx - impactX, dy = cy - impactY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            dx = (dx / dist) * knockDist;
            dy = (dy / dist) * knockDist;

            el.animate([
                { transform: 'translate(-50%,-50%)', offset: 0 },
                { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${dx > 0 ? 8 : -8}deg)`, offset: outDur / total },
                { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(0deg)`, offset: (outDur + holdDur) / total },
                { transform: 'translate(-50%,-50%)', offset: 1 }
            ], { duration: total, easing: 'ease-out' });

            // Sao choáng trên đầu
            const dazed = document.createElement('div');
            dazed.style.cssText = `
                position: fixed; left:${cx + dx}px; top:${cy - rect.height * 0.55}px;
                width:${34 * scale}px; height:${34 * scale}px;
                transform: translate(-50%,-50%); z-index: 10005;
                pointer-events:none; opacity:0;
            `;
            dazed.innerHTML = `
                <div style="position:relative; width:100%; height:100%; animation: pkm-dazed-spin 0.6s linear infinite;">
                    <span style="position:absolute; left:50%; top:0; transform:translate(-50%,-50%); font-size:${14 * scale}px;">✨</span>
                    <span style="position:absolute; left:100%; top:50%; transform:translate(-50%,-50%); font-size:${12 * scale}px;">💫</span>
                    <span style="position:absolute; left:0; top:50%; transform:translate(-50%,-50%); font-size:${12 * scale}px;">⭐</span>
                </div>
            `;
            document.body.appendChild(dazed);
            dazed.animate([
                { opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }
            ], { duration: holdDur, delay: outDur, fill: 'forwards' });
            setTimeout(() => dazed.remove(), outDur + holdDur + 100);
        });
    },

    injectDazedKeyframes() {
        if (document.getElementById('pkm-dazed-keyframes')) return;
        const style = document.createElement('style');
        style.id = 'pkm-dazed-keyframes';
        style.textContent = `
            @keyframes pkm-dazed-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    },
    // HỆ ĐIỆN — spawnElectric3 (Thunder Spirit Rush) — Bản thể Thần Sấm khổng lồ
    async spawnElectric3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#f1c40f',
            sfxType: 'electric',
        });
    },
    // HỆ CỎ — spawnGrass3 (Verdant Spirit Rush) — Bản thể Thần Cỏ khổng lồ
    async spawnGrass3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#2ecc71',
            sfxType: 'grass',
        });
    },
    // HỆ LỬA — spawnFire3 (Infernal Spirit Rush) — Bản thể Thần Lửa khổng lồ
    async spawnFire3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#e67e22',
            sfxType: 'fire',
        });
    },
    // HỆ NƯỚC — spawnWater3 (Tidal Spirit Rush) — Bản thể Thần Nước khổng lồ
    async spawnWater3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#3498db',
            sfxType: 'water',
        });
    },
    // HỆ TÂM LINH — spawnPsychic3 (Mind Spirit Rush) — Bản thể Thần Tâm Linh khổng lồ
    async spawnPsychic3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#9b59b6',
            sfxType: 'psychic',
        });
    },
    // HỆ ĐẤU — spawnFighting3 (Warrior Spirit Rush) — Bản thể Thần Đấu Sĩ khổng lồ
    async spawnFighting3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#e74c3c',
            sfxType: 'fighting',
        });
    },
    // HỆ BĂNG — spawnIce3 (Glacial Spirit Rush) — Bản thể Thần Băng khổng lồ
    async spawnIce3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#74b9ff',
            sfxType: 'ice',
        });
    },
    // HỆ ĐỘC — spawnPoison3 (Toxic Spirit Rush) — Bản thể Thần Độc khổng lồ
    async spawnPoison3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#a040a0',
            sfxType: 'poison',
        });
    },
    // HỆ ĐẤT — spawnGround3 (Terra Spirit Rush) — Bản thể Thần Đất khổng lồ
    async spawnGround3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#e2bf65',
            sfxType: 'ground',
        });
    },
    // HỆ BAY — spawnFlying3 (Tempest Spirit Rush) — Bản thể Thần Gió khổng lồ
    async spawnFlying3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#a890f0',
            sfxType: 'flying',
        });
    },
    // HỆ CÔN TRÙNG — spawnBug3 (Swarm Spirit Rush) — Bản thể Thần Côn Trùng khổng lồ
    async spawnBug3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#a8b820',
            sfxType: 'bug',
        });
    },
    // HỆ ĐÁ — spawnRock3 (Boulder Spirit Rush) — Bản thể Thần Đá khổng lồ
    async spawnRock3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#b8a038',
            sfxType: 'rock',
        });
    },
    // HỆ MA — spawnGhost3 (Phantom Spirit Rush) — Bản thể Thần Ma khổng lồ
    async spawnGhost3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#705898',
            sfxType: 'ghost',
        });
    },
    // HỆ BÓNG TỐI — spawnDark3 (Abyssal Spirit Rush) — Bản thể Thần Bóng Tối khổng lồ
    async spawnDark3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#705848',
            sfxType: 'dark',
        });
    },
    // HỆ THƯỜNG — spawnNormal3 (Radiant Spirit Rush) — Bản thể Thần Thường khổng lồ
    async spawnNormal3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#a8a878',
            sfxType: 'normal',
        });
    },
    // HỆ THÉP — spawnSteel3 (Titan Spirit Rush) — Bản thể Thần Thép khổng lồ
    async spawnSteel3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#b8b8d0',
            sfxType: 'steel',
        });
    },
    // HỆ RỒNG — spawnDragon3 (Draconic Spirit Rush) — Bản thể Thần Rồng khổng lồ
    async spawnDragon3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#7038f8',
            sfxType: 'dragon',
        });
    },
    // HỆ TIÊN — spawnFairy3 (Celestial Spirit Rush) — Bản thể Thần Tiên khổng lồ
    async spawnFairy3(startEl, endEl, count, scale) {
        await this.playGiantSpiritCharge(startEl, endEl, scale, {
            color: '#ee99ac',
            sfxType: 'fairy',
        });
    },



    // ══════════════════════════════════════════════════════════
    // ENGINE DÙNG CHUNG — "DÒNG CHẢY NGUYÊN TỐ" (skill thứ 3, toàn màn
    // hình). KHÔNG hệ nào được sửa vào hàm này. Mỗi hệ tự viết 1 hàm
    // spawn<Hệ>2 riêng, TỰ CHỨA toàn bộ hàm vẽ hình bên trong nó, rồi
    // gọi engine này — xem khuôn mẫu spawnFire2 ngay dưới.
    // ══════════════════════════════════════════════════════════
    async playElementalStreamBarrage(startEl, endEl, count, scale, damage, opts) {
        const {
            itemBuilder,
            color = '#fff',
            emberColors = null,
            curveStyle = 'wavy',
            spawnRatePerSec = 14,
            travelDuration = 750,
            sfxType = 'normal',
            buildFrame = null,
            screenSpreadRatio = 0.92,
        } = opts || {};
        

        // Random 1 trong 2 kiểu MỖI LẦN tung skill: giữ đúng curveStyle đã
        // cấu hình cho hệ đó, hoặc bay thẳng luôn — chọn 1 lần, áp dụng
        // đồng nhất cho toàn bộ streak trong lượt đánh này.
        const effectiveCurveStyle = Math.random() < 0.5 ? curveStyle : 'straight';
        console.log(`[STREAM BARRAGE] curveStyle gốc: ${curveStyle} -> chọn: ${effectiveCurveStyle}`);

        const palette = (emberColors && emberColors.length) ? emberColors : [color];

        const cfg = this.durationConfig.aoe;
        const arena = document.getElementById('battle-arena');
        const arenaRect = arena ? arena.getBoundingClientRect()
                                 : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

        const rectS = startEl.getBoundingClientRect();
        const rectE = endEl.getBoundingClientRect();

        const attackerSide = startEl.id.startsWith('player') ? 'player' : 'enemy';
        const behindSign = attackerSide === 'player' ? 1 : -1;
        const behindY = rectS.top + rectS.height / 2 + behindSign * rectS.height * 1.1;

        // Căn theo TÂM ARENA (không theo vị trí attacker) để phủ toàn màn hình
        const bandCenterX = arenaRect.left + arenaRect.width / 2;
        const bandW = arenaRect.width * screenSpreadRatio;

        const targetX = rectE.left + (rectE.width || 0) / 2;
        const targetY = rectE.top + (rectE.height || 0) / 2;

        const targetSide = endEl.dataset.targetSide || (attackerSide === 'player' ? 'enemy' : 'player');
        const getRealTargets = () => Array.from(
            document.querySelectorAll(`.pkm-unit[id^="${targetSide}-unit-"]`)
        ).filter(el => el.dataset.dead !== '1');

        const chargeMs = cfg.chargeAura * 0.7;
        const streamMs = cfg.targetSustain * 1.15;
        const finaleMs = 420;

        const allEls = [];

        // ── PHA 1: GỒNG ──
        this.playChargeSfx(sfxType);

        const bandGlow = document.createElement('div');
        bandGlow.style.cssText = `
            position: fixed; left:${bandCenterX}px; top:${behindY}px;
            width:${bandW}px; height:${34 * scale}px;
            transform: translate(-50%,-50%) scaleX(0.2);
            background: linear-gradient(90deg, transparent, ${color}bb 30%, #fff 50%, ${color}bb 70%, transparent);
            filter: blur(${6 * scale}px);
            opacity: 0; z-index: 9985; pointer-events:none;
        `;
        document.body.appendChild(bandGlow);
        allEls.push(bandGlow);

        const frameEls = buildFrame ? buildFrame(arenaRect, scale, color) : [];
        frameEls.forEach(el => {
            if (!el.parentNode) document.body.appendChild(el); // fallback nếu hàm build chưa tự chèn vào đâu
            allEls.push(el);
        });

        const introAnims = [
            bandGlow.animate([
                { transform: 'translate(-50%,-50%) scaleX(0.2)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 0.9 }
            ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' }).finished
        ];
        frameEls.forEach(el => {
            const targetOpacity = el.dataset.targetOpacity || '0.95';
            introAnims.push(el.animate([
                { opacity: 0 },
                { opacity: targetOpacity }
            ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' }).finished);
        });
        await Promise.all(introAnims);

        const bandPulse = bandGlow.animate(
            [{ opacity: 0.75, filter: `blur(${5 * scale}px)` }, { opacity: 1, filter: `blur(${9 * scale}px)` }],
            { duration: 380, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }
        );

        // ── PHA 2: DÒNG CHẢY LIÊN TỤC ──
        if (this.playTravelSfx) this.playTravelSfx(sfxType);

        let flowActive = true;
        let hitTickCounter = 0;
        const activeStreaks = new Set();

        const estimatedHits = Math.max(8, Math.round(streamMs / (1000 / spawnRatePerSec) / 2.2));
        const hitQueue = [];
        if (damage > 0) {
            const n = estimatedHits;
            const base = Math.floor(damage / n);
            const rem = damage - base * n;
            for (let i = 0; i < n; i++) hitQueue.push(base + (i === n - 1 ? rem : 0));
        }

        const consumeStreamHit = () => {
            if (hitQueue.length === 0) return;
            const chunk = hitQueue.shift();
            const targets = getRealTargets();
            if (targets.length === 0 || chunk <= 0) return;
            const t = targets[Math.floor(Math.random() * targets.length)];
            this.createDamageText(t, chunk, false);
            this.playImpactSfx(sfxType);
            t.classList.add('shake');
            setTimeout(() => t.classList.remove('shake'), 90);
        };

        const spawnStreak = () => {
            if (!flowActive) return;
            const originX = bandCenterX + (Math.random() - 0.5) * bandW * 0.96;
            const originY = behindY + (Math.random() - 0.5) * 20 * scale;

            const jitterTX = targetX + (Math.random() - 0.5) * arenaRect.width * 0.96;
            const dx = jitterTX - originX;
            const dy = targetY - originY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            const streakColor = palette[Math.floor(Math.random() * palette.length)];
            const el = itemBuilder(scale, streakColor);
            el.style.position = 'fixed';
            el.style.left = `${originX}px`;
            el.style.top = `${originY}px`;
            el.style.zIndex = '9997';
            el.style.pointerEvents = 'none';
            el.style.willChange = 'transform, opacity';
            document.body.appendChild(el);
            allEls.push(el);
            activeStreaks.add(el);

            const perpX = -dy / dist, perpY = dx / dist;
            const amp = effectiveCurveStyle === 'straight' ? 0 : (effectiveCurveStyle === 'zigzag' ? 22 * scale : 36 * scale);
            const waveCount = effectiveCurveStyle === 'zigzag' ? 3 : 1.6;

            const steps = 10;
            const kfs = [];
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                let off = 0;
                if (amp) {
                    off = effectiveCurveStyle === 'zigzag'
                        ? amp * Math.sign(Math.sin(t * Math.PI * waveCount * 2)) * (1 - t * 0.2)
                        : Math.sin(t * Math.PI * waveCount) * amp * (1 - t * 0.35);
                }
                const opacity = t < 0.1 ? t / 0.1 : (t > 0.82 ? Math.max(0, (1 - t) / 0.18) : 1);
                kfs.push({
                    transform: `translate(calc(-50% + ${dx * t + perpX * off}px), calc(-50% + ${dy * t + perpY * off}px)) rotate(${angle}deg) scale(${0.85 + t * 0.3})`,
                    opacity
                });
            }

            const dur = travelDuration * (0.82 + Math.random() * 0.36);
            const anim = el.animate(kfs, { duration: dur, easing: 'linear', fill: 'forwards' });
            anim.onfinish = () => {
                el.remove();
                activeStreaks.delete(el);
                const idx = allEls.indexOf(el);
                if (idx !== -1) allEls.splice(idx, 1);
                if (!flowActive) return;
                hitTickCounter++;
                if (hitTickCounter % 2 === 0) consumeStreamHit();
            };
        };

        const spawnInterval = 1000 / spawnRatePerSec;
        const flowTimer = setInterval(spawnStreak, spawnInterval);
        spawnStreak(); spawnStreak(); spawnStreak();

        const rumbleTimer = setInterval(() => {
            if (this.applyGlobalShake) this.applyGlobalShake(scale * 0.45);
        }, 260);

        await new Promise(r => setTimeout(r, streamMs));

        // ── PHA 3: TẮT DÒNG CHẢY ──
        flowActive = false;
        clearInterval(flowTimer);
        clearInterval(rumbleTimer);
        bandPulse.cancel();
        while (hitQueue.length > 0) consumeStreamHit();

        await Promise.all([...activeStreaks].map(el => el.animate(
            [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }],
            { duration: 220, fill: 'forwards' }
        ).finished));

        const outroAnims = [
            bandGlow.animate([
                { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 0.9 },
                { transform: 'translate(-50%,-50%) scaleX(0.3)', opacity: 0 }
            ], { duration: 260, fill: 'forwards', easing: 'ease-in' }).finished
        ];
        frameEls.forEach(el => {
            outroAnims.push(el.animate([
                { opacity: getComputedStyle(el).opacity },
                { opacity: 0 }
            ], { duration: 300, fill: 'forwards', easing: 'ease-in' }).finished);
        });
        await Promise.all(outroAnims);

        // ── PHA 4: NỔ TOÀN MÀN HÌNH ──
        const finaleEls = [];
        this.triggerScreenFinale(arenaRect, targetX, targetY, color, scale * 1.15, finaleMs, finaleEls);
        await new Promise(r => setTimeout(r, finaleMs + 150));

        allEls.forEach(el => el.remove());
        finaleEls.forEach(el => el.remove());
    },

    // ══════════════════════════════════════════════════════════
    // HỆ LỬA — spawnFire2 (Wildfire Torrent) — KHUÔN MẪU đầy đủ, TỰ CHỨA
    // toàn bộ hàm vẽ hình bên trong. Muốn thêm hệ khác: copy nguyên hàm
    // này, đổi tên, đổi nội dung 2 hàm build bên trong + màu/curveStyle.
    // KHÔNG cần đụng gì ở engine hay bất kỳ đâu khác.
    // ══════════════════════════════════════════════════════════
    async spawnFire2(startEl, endEl, count, scale, damage) {
        // Đốm lửa dạng "sao chổi" — KHÔNG dùng clip-path (tránh viền răng cưa
        // giả), chỉ dùng gradient + blur mềm mại, đầu sáng trắng ở cạnh dẫn
        // hướng bay (được engine tự rotate theo hướng di chuyển).
        const buildFlameEmber = (s, c) => {
            const w = (72 + Math.random() * 24) * s;
            const h = (15 + Math.random() * 6) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px; border-radius:${h}px;
                background:
                    radial-gradient(circle at 88% 50%, #fff 0%, #fff6cf 20%, #ffb703 36%, transparent 62%),
                    linear-gradient(90deg, transparent 0%, ${c}33 20%, ${c}aa 55%, ${c}dd 82%, transparent 100%);
                filter: blur(${1.1 * s}px) drop-shadow(0 0 ${7 * s}px ${c});
            `;
            return el;
        };

        // Lớp SƯƠNG NỀN toàn màn hình arena — gắn NGAY TRONG #battle-arena,
        // z-index THẤP (nằm SAU Pokémon), giống đúng cách các skill toàn
        // màn hình khác (spawn*4) và nền pkm_arena3d.css đang làm — đây là
        // lý do chúng nhìn tự nhiên, không phẳng/giả như lớp dán phía trên.
        const buildFireMist = (arenaRect) => {
            if (!document.getElementById('pkm-fire2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-fire2-mist-style';
                style.textContent = `
                    @keyframes pkmFire2Eruption {
                        0%, 100% { opacity: 0.75; transform: scale(1); }
                        50%      { opacity: 1;    transform: scale(1.04); }
                    }
                    @keyframes pkmFire2EmberDrift {
                        0%   { background-position: 0px 0px, 0px 0px, 0px 0px; }
                        100% { background-position: 30px -260px, -40px -320px, 15px -220px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `
                position: absolute; inset: 0;
                z-index: 0; pointer-events: none; overflow: hidden;
                opacity: 0;
            `;

            // Lớp 1: hào quang nóng lan toả (đáy sáng rực, 2 góc trên ấm nhẹ)
            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 80% at 50% 105%, rgba(255,230,150,0.9) 0%, rgba(255,110,0,0.55) 32%, rgba(120,20,0,0.35) 60%, transparent 82%),
                    radial-gradient(ellipse 70% 60% at 15% 15%, rgba(255,90,0,0.25) 0%, transparent 65%),
                    radial-gradient(ellipse 70% 60% at 85% 15%, rgba(255,90,0,0.25) 0%, transparent 65%);
                animation: pkmFire2Eruption 1.8s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            // Lớp 2: tàn lửa nhỏ trôi lên liên tục, tiled khắp toàn arena
            const emberLayer = document.createElement('div');
            emberLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 3px, rgba(255,255,255,0.9) 0%, transparent 70%),
                    radial-gradient(circle 4px, rgba(255,200,0,0.85) 0%, transparent 70%),
                    radial-gradient(circle 3px, rgba(255,120,0,0.8) 0%, transparent 70%);
                background-size: 140px 180px, 190px 230px, 160px 200px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmFire2EmberDrift 2.6s linear infinite;
                opacity: 0.85;
            `;
            mistRoot.appendChild(emberLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildFlameEmber,
            buildFrame: buildFireMist,
            color: '#ff6d00',
            emberColors: ['#ff6d00', '#ff3d00', '#ffab00'],
            curveStyle: 'wavy',
            spawnRatePerSec: 20,
            travelDuration: 850,
            sfxType: 'fire',
        });
    },
    // ══════════════════════════════════════════════════════════
    // HỆ NƯỚC — spawnWater2 (Tidal Onslaught) — làn sóng dập dờn
    // ══════════════════════════════════════════════════════════
    async spawnWater2(startEl, endEl, count, scale, damage) {
        // Từng con sóng cong, đỉnh sáng trắng, thân xanh đậm dần, có bọt tràn
        const buildWaveCrest = (s, c) => {
            const w = (95 + Math.random() * 30) * s;
            const h = (26 + Math.random() * 10) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background:
                    radial-gradient(ellipse ${w*0.3}px ${h*0.9}px at 85% 40%, #fff 0%, #eafaff 25%, transparent 60%),
                    linear-gradient(90deg, transparent 0%, ${c}33 18%, ${c}bb 55%, ${c}ee 85%, transparent 100%);
                border-radius: 0 50% 50% 0 / 0 90% 90% 0;
                filter: blur(${1 * s}px) drop-shadow(0 0 ${6 * s}px ${c});
            `;
            return el;
        };

        // Lớp NỀN đại dương dập dờn toàn arena — nằm trong arena, z-index thấp
        const buildOceanMist = (arenaRect) => {
            if (!document.getElementById('pkm-water2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-water2-mist-style';
                style.textContent = `
                    @keyframes pkmWater2Swell {
                        0%, 100% { opacity: 0.7; transform: scale(1) translateY(0); }
                        50%      { opacity: 1;   transform: scale(1.03) translateY(-1%); }
                    }
                    @keyframes pkmWater2FoamDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 280px 40px, -220px -30px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 95% 75% at 50% 100%, rgba(140,220,255,0.55) 0%, rgba(20,110,200,0.4) 40%, rgba(5,40,90,0.3) 65%, transparent 85%),
                    radial-gradient(ellipse 70% 50% at 10% 10%, rgba(120,200,255,0.2) 0%, transparent 65%),
                    radial-gradient(ellipse 70% 50% at 90% 10%, rgba(120,200,255,0.2) 0%, transparent 65%);
                animation: pkmWater2Swell 2.2s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const foamLayer = document.createElement('div');
            foamLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 4px, rgba(255,255,255,0.85) 0%, transparent 70%),
                    radial-gradient(circle 3px, rgba(200,240,255,0.7) 0%, transparent 70%);
                background-size: 170px 130px, 140px 110px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmWater2FoamDrift 3s linear infinite;
                opacity: 0.75;
            `;
            mistRoot.appendChild(foamLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildWaveCrest,
            buildFrame: buildOceanMist,
            color: '#3498db',
            emberColors: ['#3498db', '#5dade2', '#a9d6f5'],
            curveStyle: 'wavy',
            spawnRatePerSec: 16,
            travelDuration: 900,
            sfxType: 'water',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ ĐIỆN — spawnElectric2 (Voltage Deluge) — tia điện dày đặc
    // ══════════════════════════════════════════════════════════
    async spawnElectric2(startEl, endEl, count, scale, damage) {
        // Tia sét ngắn, lõi trắng chói, viền vàng, giật lag ngẫu nhiên bằng skew
        const buildElectricBolt = (s, c) => {
            const w = (60 + Math.random() * 20) * s;
            const h = (5 + Math.random() * 3) * s;
            const skew = (Math.random() - 0.5) * 30;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                transform: skewY(${skew}deg);
                background: linear-gradient(90deg, transparent 0%, ${c} 20%, #fff 50%, ${c} 80%, transparent 100%);
                box-shadow: 0 0 ${6 * s}px #fff, 0 0 ${12 * s}px ${c};
                filter: drop-shadow(0 0 ${4 * s}px #fff);
            `;
            return el;
        };

        // Lớp NỀN bão điện — chớp sáng ngẫu nhiên + tia lưới điện toàn arena
        const buildStormMist = (arenaRect) => {
            if (!document.getElementById('pkm-electric2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-electric2-mist-style';
                style.textContent = `
                    @keyframes pkmElectric2Flicker {
                        0%, 82%, 100% { opacity: 0.55; }
                        84%  { opacity: 1; }
                        86%  { opacity: 0.6; }
                        90%  { opacity: 0.95; }
                        92%  { opacity: 0.55; }
                    }
                    @keyframes pkmElectric2GridDrift {
                        0%   { background-position: 0px 0px; }
                        100% { background-position: 60px -180px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 80% at 50% 50%, rgba(255,240,150,0.35) 0%, rgba(90,70,10,0.35) 45%, transparent 78%);
                animation: pkmElectric2Flicker 0.9s steps(3) infinite;
            `;
            mistRoot.appendChild(washLayer);

            const gridLayer = document.createElement('div');
            gridLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    repeating-linear-gradient(80deg, transparent 0px, transparent 38px, rgba(255,255,255,0.18) 39px, rgba(255,235,80,0.3) 40px, transparent 41px, transparent 70px),
                    repeating-linear-gradient(-70deg, transparent 0px, transparent 46px, rgba(255,255,255,0.14) 47px, rgba(255,235,80,0.24) 48px, transparent 49px, transparent 80px);
                mix-blend-mode: screen;
                animation: pkmElectric2GridDrift 1.4s linear infinite;
            `;
            mistRoot.appendChild(gridLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildElectricBolt,
            buildFrame: buildStormMist,
            color: '#f1c40f',
            emberColors: ['#fff8b0', '#f1c40f', '#ffe066'],
            curveStyle: 'zigzag',
            spawnRatePerSec: 26,
            travelDuration: 480,
            sfxType: 'electric',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ CỎ — spawnGrass2 (Verdant Cyclone) — lá xoay tròn kèm gió
    // ══════════════════════════════════════════════════════════
    async spawnGrass2(startEl, endEl, count, scale, damage) {
        // Lá cây bo cong, tự xoay liên tục trong lúc bay (animation riêng bên trong)
        const buildSpinningLeaf = (s, c) => {
            const w = (30 + Math.random() * 14) * s;
            const h = w * 0.55;
            if (!document.getElementById('pkm-grass2-leaf-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-grass2-leaf-style';
                style.textContent = `
                    @keyframes pkmGrass2LeafSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                `;
                document.head.appendChild(style);
            }
            const outer = document.createElement('div');
            outer.style.cssText = `width:${w}px; height:${h}px;`;
            const inner = document.createElement('div');
            inner.style.cssText = `
                width:100%; height:100%;
                background: linear-gradient(135deg, #eaffea, ${c} 55%, #1b5e20);
                border-radius: 80% 10% 80% 10%;
                border: ${1 * s}px solid #145a32;
                animation: pkmGrass2LeafSpin ${0.5 + Math.random() * 0.4}s linear infinite;
                filter: drop-shadow(0 0 ${4 * s}px rgba(0,0,0,0.4));
            `;
            outer.appendChild(inner);
            return outer;
        };

        // Lớp NỀN gió lốc lá cuộn khắp arena
        const buildWindLeafMist = (arenaRect) => {
            if (!document.getElementById('pkm-grass2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-grass2-mist-style';
                style.textContent = `
                    @keyframes pkmGrass2Sway {
                        0%, 100% { opacity: 0.65; transform: skewX(0deg); }
                        50%      { opacity: 0.95; transform: skewX(-2deg); }
                    }
                    @keyframes pkmGrass2LeafDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: -260px 220px, 220px -180px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 95% 70% at 50% 100%, rgba(120,220,110,0.5) 0%, rgba(20,90,30,0.4) 45%, transparent 78%),
                    radial-gradient(ellipse 60% 50% at 20% 20%, rgba(150,255,140,0.2) 0%, transparent 60%);
                animation: pkmGrass2Sway 1.6s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const leafLayer = document.createElement('div');
            leafLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 6px 3px, rgba(200,255,160,0.8) 0%, transparent 70%),
                    radial-gradient(ellipse 5px 3px, rgba(46,204,113,0.75) 0%, transparent 70%);
                background-size: 150px 140px, 190px 170px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmGrass2LeafDrift 3.4s linear infinite;
                opacity: 0.8;
            `;
            mistRoot.appendChild(leafLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildSpinningLeaf,
            buildFrame: buildWindLeafMist,
            color: '#2ecc71',
            emberColors: ['#2ecc71', '#6fcf5a', '#a8e063'],
            curveStyle: 'zigzag',
            spawnRatePerSec: 15,
            travelDuration: 780,
            sfxType: 'grass',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ BĂNG — spawnIce2 (Blizzard Fury) — bão tuyết
    // ══════════════════════════════════════════════════════════
    async spawnIce2(startEl, endEl, count, scale, damage) {
        // Bông tuyết nhỏ + mảnh băng dài xen kẽ, lấp lánh trắng-xanh
        const buildSnowShard = (s, c) => {
            const isFlake = Math.random() < 0.5;
            const el = document.createElement('div');
            if (isFlake) {
                const size = (10 + Math.random() * 8) * s;
                el.style.cssText = `
                    width:${size}px; height:${size}px;
                    background: radial-gradient(circle, #fff 0%, ${c} 60%, transparent 90%);
                    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
                    filter: drop-shadow(0 0 ${4 * s}px #fff);
                `;
            } else {
                const w = (55 + Math.random() * 20) * s, h = (9 + Math.random() * 4) * s;
                el.style.cssText = `
                    width:${w}px; height:${h}px;
                    background: linear-gradient(90deg, transparent, #fff 30%, ${c} 60%, transparent);
                    filter: blur(${0.6 * s}px) drop-shadow(0 0 ${5 * s}px ${c});
                `;
            }
            return el;
        };

        // Lớp NỀN bão tuyết — tuyết rơi dày tiled toàn arena + sương lạnh
        const buildBlizzardMist = (arenaRect) => {
            if (!document.getElementById('pkm-ice2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-ice2-mist-style';
                style.textContent = `
                    @keyframes pkmIce2Glow {
                        0%, 100% { opacity: 0.7; }
                        50%      { opacity: 1; }
                    }
                    @keyframes pkmIce2SnowFall {
                        0%   { background-position: 0px 0px, 0px 0px, 0px 0px; }
                        100% { background-position: 40px 300px, -30px 340px, 20px 260px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 95% 80% at 50% 50%, rgba(220,245,255,0.45) 0%, rgba(120,180,220,0.35) 45%, transparent 80%);
                animation: pkmIce2Glow 2s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const snowLayer = document.createElement('div');
            snowLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 3px, rgba(255,255,255,0.95) 0%, transparent 70%),
                    radial-gradient(circle 2px, rgba(220,245,255,0.85) 0%, transparent 70%),
                    radial-gradient(circle 4px, rgba(255,255,255,0.7) 0%, transparent 70%);
                background-size: 120px 150px, 90px 120px, 160px 190px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmIce2SnowFall 2.6s linear infinite;
                opacity: 0.9;
            `;
            mistRoot.appendChild(snowLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildSnowShard,
            buildFrame: buildBlizzardMist,
            color: '#74b9ff',
            emberColors: ['#74b9ff', '#b3e5fc', '#dff6ff'],
            curveStyle: 'wavy',
            spawnRatePerSec: 18,
            travelDuration: 950,
            sfxType: 'ice',
        });
    },
    // ══════════════════════════════════════════════════════════
    // HỆ THƯỜNG — spawnNormal2 (Resonant Wavefront) — vành sóng âm lan tỏa
    // ══════════════════════════════════════════════════════════
    async spawnNormal2(startEl, endEl, count, scale, damage) {
        // Vành khuyên rỗng (crescent ring), lõi trong suốt, viền trắng-vàng nhạt sáng rực
        const buildSonicArc = (s, c) => {
            const w = (70 + Math.random() * 26) * s;
            const h = w * 0.42;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px; border-radius:50%;
                border: ${3.2 * s}px solid #fff;
                border-left-color: transparent; border-right-color: transparent;
                box-shadow: 0 0 ${8 * s}px ${c}, inset 0 0 ${6 * s}px ${c};
                filter: drop-shadow(0 0 ${5 * s}px #fff);
            `;
            return el;
        };

        // Lớp NỀN hào quang trắng-vàng lan tỏa toàn arena, nhịp co giãn theo tần số âm
        const buildResonanceMist = (arenaRect) => {
            if (!document.getElementById('pkm-normal2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-normal2-mist-style';
                style.textContent = `
                    @keyframes pkmNormal2Pulse {
                        0%, 100% { opacity: 0.6; transform: scale(1); }
                        50%      { opacity: 0.95; transform: scale(1.05); }
                    }
                    @keyframes pkmNormal2RingDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 200px 0px, -180px 0px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 75% at 50% 50%, rgba(255,255,240,0.5) 0%, rgba(200,200,170,0.32) 45%, transparent 80%);
                animation: pkmNormal2Pulse 1.4s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const ringLayer = document.createElement('div');
            ringLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 90px at 50% 50%, transparent 60%, rgba(255,255,255,0.18) 62%, transparent 66%),
                    radial-gradient(circle 60px at 50% 50%, transparent 60%, rgba(255,240,200,0.16) 62%, transparent 66%);
                background-size: 260px 260px, 200px 200px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmNormal2RingDrift 3s linear infinite;
                opacity: 0.7;
            `;
            mistRoot.appendChild(ringLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildSonicArc,
            buildFrame: buildResonanceMist,
            color: '#e8e2c0',
            emberColors: ['#fff8e0', '#e8e2c0', '#d6d6c2'],
            curveStyle: 'straight',
            spawnRatePerSec: 15,
            travelDuration: 720,
            sfxType: 'normal',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ CHIẾN ĐẤU — spawnFighting2 (Berserker Onslaught) — vệt chém + bụi
    // ══════════════════════════════════════════════════════════
    async spawnFighting2(startEl, endEl, count, scale, damage) {
        // Vệt móng vuốt/chém xé không khí — 3 sọc song song, đỏ-cam, viền trắng chói
        const buildClawSlash = (s, c) => {
            const w = (78 + Math.random() * 24) * s;
            const h = (20 + Math.random() * 6) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background:
                    linear-gradient(90deg, transparent 0%, #fff 10%, transparent 16%, transparent 30%,
                        #fff 40%, transparent 46%, transparent 60%, #fff 70%, transparent 76%, transparent 100%),
                    linear-gradient(90deg, transparent 0%, ${c}66 15%, ${c}dd 50%, ${c}66 85%, transparent 100%);
                filter: drop-shadow(0 0 ${5 * s}px ${c});
            `;
            return el;
        };

        // Lớp NỀN bụi đất bay + rung động chiến trường, đỏ cam ám khói
        const buildBattleDustMist = (arenaRect) => {
            if (!document.getElementById('pkm-fighting2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-fighting2-mist-style';
                style.textContent = `
                    @keyframes pkmFighting2Shock {
                        0%, 100% { opacity: 0.6; transform: scale(1); }
                        45%      { opacity: 0.95; transform: scale(1.03); }
                        55%      { opacity: 0.7; transform: scale(0.99); }
                    }
                    @keyframes pkmFighting2DustDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: -220px 180px, 260px -140px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 75% at 50% 100%, rgba(255,120,60,0.5) 0%, rgba(100,20,10,0.4) 45%, transparent 80%),
                    radial-gradient(ellipse 60% 45% at 15% 15%, rgba(255,90,50,0.2) 0%, transparent 60%),
                    radial-gradient(ellipse 60% 45% at 85% 15%, rgba(255,90,50,0.2) 0%, transparent 60%);
                animation: pkmFighting2Shock 0.7s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const dustLayer = document.createElement('div');
            dustLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 5px, rgba(200,150,110,0.55) 0%, transparent 70%),
                    radial-gradient(circle 4px, rgba(255,190,140,0.5) 0%, transparent 70%);
                background-size: 130px 110px, 170px 150px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmFighting2DustDrift 2.8s linear infinite;
                opacity: 0.7;
            `;
            mistRoot.appendChild(dustLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildClawSlash,
            buildFrame: buildBattleDustMist,
            color: '#e74c3c',
            emberColors: ['#e74c3c', '#ff7043', '#ffab91'],
            curveStyle: 'zigzag',
            spawnRatePerSec: 18,
            travelDuration: 560,
            sfxType: 'fighting',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ ĐỘC — spawnPoison2 (Toxic Deluge) — giọt độc nhớt rơi kéo vệt
    // ══════════════════════════════════════════════════════════
    async spawnPoison2(startEl, endEl, count, scale, damage) {
        // Giọt độc hình bầu, đầu tròn đặc, thân kéo dài nhớt dần, viền xanh lục dạ quang
        const buildToxinDrop = (s, c) => {
            const w = (16 + Math.random() * 10) * s;
            const h = w * 3.4;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background:
                    radial-gradient(circle at 50% 18%, #eafce0 0%, #a3e635 22%, ${c} 48%, transparent 70%),
                    linear-gradient(180deg, transparent 0%, ${c}55 30%, ${c}22 70%, transparent 100%);
                border-radius: 50% 50% 30% 30% / 60% 60% 40% 40%;
                filter: blur(${0.6 * s}px) drop-shadow(0 0 ${5 * s}px ${c});
            `;
            return el;
        };

        // Lớp NỀN đầm lầy độc — bong bóng khí sủi lên, sương tím-lục ám khói
        const buildToxicSwampMist = (arenaRect) => {
            if (!document.getElementById('pkm-poison2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-poison2-mist-style';
                style.textContent = `
                    @keyframes pkmPoison2Bubble {
                        0%, 100% { opacity: 0.6; transform: scale(1) translateY(0); }
                        50%      { opacity: 0.95; transform: scale(1.03) translateY(-1%); }
                    }
                    @keyframes pkmPoison2BubbleRise {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 30px -260px, -25px -220px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 75% at 50% 100%, rgba(160,0,220,0.45) 0%, rgba(60,0,90,0.4) 45%, transparent 80%),
                    radial-gradient(ellipse 55% 45% at 20% 15%, rgba(140,220,40,0.2) 0%, transparent 60%);
                animation: pkmPoison2Bubble 1.7s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const bubbleLayer = document.createElement('div');
            bubbleLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 4px, rgba(180,255,80,0.65) 0%, transparent 70%),
                    radial-gradient(circle 5px, rgba(180,0,255,0.5) 0%, transparent 70%);
                background-size: 150px 170px, 190px 200px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmPoison2BubbleRise 3.2s linear infinite;
                opacity: 0.75;
            `;
            mistRoot.appendChild(bubbleLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildToxinDrop,
            buildFrame: buildToxicSwampMist,
            color: '#a040a0',
            emberColors: ['#a040a0', '#8e24aa', '#39ff14'],
            curveStyle: 'wavy',
            spawnRatePerSec: 14,
            travelDuration: 880,
            sfxType: 'poison',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ ĐẤT — spawnGround2 (Seismic Barrage) — mảnh đá vụn xoay tumble + bụi
    // ══════════════════════════════════════════════════════════
    async spawnGround2(startEl, endEl, count, scale, damage) {
        // Mảnh đá góc cạnh thô ráp, tự xoay lăn liên tục khi bay (khác hẳn dáng người/linh hồn)
        const buildRockShard = (s, c) => {
            if (!document.getElementById('pkm-ground2-shard-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-ground2-shard-style';
                style.textContent = `
                    @keyframes pkmGround2Tumble { from { transform: rotate(0deg); } to { transform: rotate(720deg); } }
                `;
                document.head.appendChild(style);
            }
            const size = (22 + Math.random() * 16) * s;
            const clipPaths = [
                'polygon(20% 0%,80% 8%,100% 45%,78% 100%,20% 95%,0% 50%)',
                'polygon(10% 15%,60% 0%,100% 30%,90% 80%,45% 100%,0% 65%)',
                'polygon(30% 0%,90% 20%,100% 70%,55% 100%,5% 75%,0% 25%)',
            ];
            const clip = clipPaths[Math.floor(Math.random() * clipPaths.length)];
            const outer = document.createElement('div');
            outer.style.cssText = `width:${size}px; height:${size}px;`;
            const inner = document.createElement('div');
            inner.style.cssText = `
                width:100%; height:100%;
                background: linear-gradient(135deg, #fff2, ${c} 55%, #00000055);
                clip-path: ${clip};
                box-shadow: 0 0 ${size * 0.3}px #00000066;
                animation: pkmGround2Tumble ${0.6 + Math.random() * 0.5}s linear infinite;
                filter: drop-shadow(0 0 ${3 * s}px ${c});
            `;
            outer.appendChild(inner);
            return outer;
        };

        // Lớp NỀN địa chấn — nứt đất phát sáng cam + bụi cát dày đặc toàn arena
        const buildQuakeDustMist = (arenaRect) => {
            if (!document.getElementById('pkm-ground2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-ground2-mist-style';
                style.textContent = `
                    @keyframes pkmGround2Rumble {
                        0%, 100% { opacity: 0.65; transform: translateX(0); }
                        25%      { opacity: 0.9;  transform: translateX(-1%); }
                        75%      { opacity: 0.9;  transform: translateX(1%); }
                    }
                    @keyframes pkmGround2DustDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 240px 40px, -200px -30px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 78% at 50% 100%, rgba(220,150,60,0.5) 0%, rgba(90,50,10,0.4) 45%, transparent 80%);
                animation: pkmGround2Rumble 0.5s steps(4) infinite;
            `;
            mistRoot.appendChild(washLayer);

            const dustLayer = document.createElement('div');
            dustLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 5px, rgba(200,160,100,0.6) 0%, transparent 70%),
                    radial-gradient(circle 6px, rgba(160,110,60,0.5) 0%, transparent 70%);
                background-size: 160px 130px, 200px 170px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmGround2DustDrift 3s linear infinite;
                opacity: 0.8;
            `;
            mistRoot.appendChild(dustLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildRockShard,
            buildFrame: buildQuakeDustMist,
            color: '#e2bf65',
            emberColors: ['#e2bf65', '#c19a5b', '#8d6e63'],
            curveStyle: 'straight',
            spawnRatePerSec: 16,
            travelDuration: 700,
            sfxType: 'ground',
        });
    },
    // ══════════════════════════════════════════════════════════
    // HỆ BAY — spawnFlying2 (Gale Onslaught) — lưỡi gió mảnh dài cong
    // ══════════════════════════════════════════════════════════
    async spawnFlying2(startEl, endEl, count, scale, damage) {
        // Lưỡi gió cong hình lưỡi liềm mảnh, viền trắng sáng, thân tím nhạt trong suốt
        const buildWindBlade = (s, c) => {
            const w = (88 + Math.random() * 26) * s;
            const h = (10 + Math.random() * 5) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(90deg, transparent 0%, ${c}44 15%, #fff 50%, ${c}44 85%, transparent 100%);
                border-radius: 50%;
                filter: blur(${0.8 * s}px) drop-shadow(0 0 ${6 * s}px #fff);
            `;
            return el;
        };

        // Lớp NỀN cuồng phong — xoáy gió cuộn toàn arena, mờ trắng-tím lướt nhanh
        const buildGaleMist = (arenaRect) => {
            if (!document.getElementById('pkm-flying2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-flying2-mist-style';
                style.textContent = `
                    @keyframes pkmFlying2Gust {
                        0%, 100% { opacity: 0.6; transform: skewX(0deg); }
                        50%      { opacity: 0.9; transform: skewX(-3deg); }
                    }
                    @keyframes pkmFlying2StreakDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: -300px 20px, 260px -15px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 75% at 50% 50%, rgba(200,180,255,0.4) 0%, rgba(90,60,150,0.32) 45%, transparent 80%);
                animation: pkmFlying2Gust 0.9s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const streakLayer = document.createElement('div');
            streakLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    repeating-linear-gradient(8deg, transparent 0px, transparent 40px, rgba(255,255,255,0.16) 42px, transparent 46px, transparent 90px),
                    repeating-linear-gradient(-6deg, transparent 0px, transparent 55px, rgba(230,220,255,0.14) 57px, transparent 60px, transparent 100px);
                mix-blend-mode: screen;
                animation: pkmFlying2StreakDrift 1.6s linear infinite;
            `;
            mistRoot.appendChild(streakLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildWindBlade,
            buildFrame: buildGaleMist,
            color: '#a890f0',
            emberColors: ['#a890f0', '#c5b3ff', '#f5f5ff'],
            curveStyle: 'wavy',
            spawnRatePerSec: 19,
            travelDuration: 560,
            sfxType: 'flying',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ TÂM LINH — spawnPsychic2 (Mindquake Surge) — mắt/vòng năng lượng méo mó
    // ══════════════════════════════════════════════════════════
    async spawnPsychic2(startEl, endEl, count, scale, damage) {
        // Vòng năng lượng hình elip méo, tâm sáng như "con mắt", nhấp nháy loạn nhịp
        const buildPsiRing = (s, c) => {
            if (!document.getElementById('pkm-psychic2-ring-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-psychic2-ring-style';
                style.textContent = `
                    @keyframes pkmPsychic2Warp {
                        0%   { transform: scale(1, 1) rotate(0deg); }
                        33%  { transform: scale(1.25, 0.8) rotate(8deg); }
                        66%  { transform: scale(0.8, 1.2) rotate(-6deg); }
                        100% { transform: scale(1, 1) rotate(0deg); }
                    }
                `;
                document.head.appendChild(style);
            }
            const size = (34 + Math.random() * 18) * s;
            const outer = document.createElement('div');
            outer.style.cssText = `width:${size}px; height:${size}px;`;
            const inner = document.createElement('div');
            inner.style.cssText = `
                width:100%; height:100%; border-radius:50%;
                border: ${3 * s}px solid ${c};
                background: radial-gradient(circle at 50% 50%, #fff 0%, ${c}aa 40%, transparent 75%);
                box-shadow: 0 0 ${8 * s}px ${c}, inset 0 0 ${6 * s}px #fff;
                animation: pkmPsychic2Warp ${0.5 + Math.random() * 0.3}s ease-in-out infinite;
                filter: drop-shadow(0 0 ${5 * s}px ${c});
            `;
            outer.appendChild(inner);
            return outer;
        };

        // Lớp NỀN không gian bóp méo — sóng đồng tâm tím-hồng lan toàn arena
        const buildPsychicMist = (arenaRect) => {
            if (!document.getElementById('pkm-psychic2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-psychic2-mist-style';
                style.textContent = `
                    @keyframes pkmPsychic2Pulse {
                        0%, 100% { opacity: 0.6; transform: scale(1); }
                        50%      { opacity: 0.95; transform: scale(1.06); }
                    }
                    @keyframes pkmPsychic2RingExpand {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 220px 0px, -180px 0px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 75% at 50% 50%, rgba(248,88,136,0.4) 0%, rgba(90,10,60,0.35) 45%, transparent 80%);
                animation: pkmPsychic2Pulse 1.3s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const ringLayer = document.createElement('div');
            ringLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 80px at 50% 50%, transparent 55%, rgba(248,88,136,0.2) 58%, transparent 63%),
                    radial-gradient(circle 50px at 50% 50%, transparent 55%, rgba(200,140,255,0.18) 58%, transparent 63%);
                background-size: 240px 240px, 180px 180px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmPsychic2RingExpand 2.6s linear infinite;
                opacity: 0.7;
            `;
            mistRoot.appendChild(ringLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildPsiRing,
            buildFrame: buildPsychicMist,
            color: '#f85888',
            emberColors: ['#f85888', '#c58fff', '#ffffff'],
            curveStyle: 'zigzag',
            spawnRatePerSec: 13,
            travelDuration: 800,
            sfxType: 'psychic',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ BỌ — spawnBug2 (Swarm Onslaught) — cánh bọ mảnh vo ve rung
    // ══════════════════════════════════════════════════════════
    async spawnBug2(startEl, endEl, count, scale, damage) {
        // Cặp cánh mảnh trong suốt rung nhanh (khác hẳn thân sâu bò trườn), màu vàng-lục dạ quang
        const buildBuzzWing = (s, c) => {
            if (!document.getElementById('pkm-bug2-wing-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-bug2-wing-style';
                style.textContent = `
                    @keyframes pkmBug2Buzz {
                        0%, 100% { transform: scaleY(1) skewX(0deg); }
                        50%      { transform: scaleY(0.7) skewX(8deg); }
                    }
                `;
                document.head.appendChild(style);
            }
            const w = (30 + Math.random() * 14) * s;
            const h = w * 0.6;
            const outer = document.createElement('div');
            outer.style.cssText = `width:${w}px; height:${h}px; display:flex; gap:${2*s}px;`;
            for (let i = 0; i < 2; i++) {
                const wing = document.createElement('div');
                wing.style.cssText = `
                    flex:1; height:100%;
                    background: radial-gradient(ellipse at 30% 30%, #fff 0%, ${c}99 40%, transparent 75%);
                    border: ${1 * s}px solid ${c};
                    border-radius: 60% 40% 60% 40%;
                    animation: pkmBug2Buzz ${0.08 + Math.random() * 0.05}s ease-in-out infinite;
                    filter: drop-shadow(0 0 ${3 * s}px ${c});
                `;
                outer.appendChild(wing);
            }
            return outer;
        };

        // Lớp NỀN bầy đàn vo ve — hạt phấn dạ quang lấp lánh dày đặc toàn arena
        const buildSwarmMist = (arenaRect) => {
            if (!document.getElementById('pkm-bug2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-bug2-mist-style';
                style.textContent = `
                    @keyframes pkmBug2Flicker {
                        0%, 100% { opacity: 0.55; }
                        50%      { opacity: 0.9; }
                    }
                    @keyframes pkmBug2SporeDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 180px 200px, -160px -180px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 75% at 50% 50%, rgba(168,184,32,0.4) 0%, rgba(60,70,10,0.32) 45%, transparent 80%);
                animation: pkmBug2Flicker 0.6s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const sporeLayer = document.createElement('div');
            sporeLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 3px, rgba(220,255,80,0.75) 0%, transparent 70%),
                    radial-gradient(circle 2px, rgba(168,184,32,0.7) 0%, transparent 70%);
                background-size: 110px 100px, 90px 80px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmBug2SporeDrift 2.4s linear infinite;
                opacity: 0.85;
            `;
            mistRoot.appendChild(sporeLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildBuzzWing,
            buildFrame: buildSwarmMist,
            color: '#a8b820',
            emberColors: ['#a8b820', '#c6e05a', '#d4e157'],
            curveStyle: 'zigzag',
            spawnRatePerSec: 24,
            travelDuration: 500,
            sfxType: 'bug',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ ĐÁ — spawnRock2 (Stalagmite Barrage) — cột đá nhọn mọc trồi
    // ══════════════════════════════════════════════════════════
    async spawnRock2(startEl, endEl, count, scale, damage) {
        // Cột đá nhọn hình tam giác dài, khác hẳn mảnh đá vụn góc cạnh (hệ Đất) —
        // đây là dáng cột NHỌN, thẳng, giống thạch nhũ mọc lên.
        const buildStoneSpike = (s, c) => {
            const w = (18 + Math.random() * 10) * s;
            const h = (60 + Math.random() * 24) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(180deg, #efebe9 0%, ${c} 45%, #4a3a20 90%);
                clip-path: polygon(50% 0%, 85% 100%, 15% 100%);
                filter: drop-shadow(0 0 ${3 * s}px #00000066);
            `;
            return el;
        };

        // Lớp NỀN hang đá — bụi khoáng nâu vàng phát sáng nhẹ, rung theo nhịp
        const buildStoneDustMist = (arenaRect) => {
            if (!document.getElementById('pkm-rock2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-rock2-mist-style';
                style.textContent = `
                    @keyframes pkmRock2Flicker {
                        0%, 100% { opacity: 0.6; }
                        50%      { opacity: 0.9; }
                    }
                    @keyframes pkmRock2DustDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 200px 60px, -180px -50px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 78% at 50% 100%, rgba(184,160,56,0.45) 0%, rgba(70,50,15,0.4) 45%, transparent 80%);
                animation: pkmRock2Flicker 0.9s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const dustLayer = document.createElement('div');
            dustLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 4px, rgba(200,180,120,0.55) 0%, transparent 70%),
                    radial-gradient(circle 5px, rgba(160,130,70,0.5) 0%, transparent 70%);
                background-size: 150px 140px, 190px 170px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmRock2DustDrift 3s linear infinite;
                opacity: 0.75;
            `;
            mistRoot.appendChild(dustLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildStoneSpike,
            buildFrame: buildStoneDustMist,
            color: '#b8a038',
            emberColors: ['#b8a038', '#a08050', '#efebe9'],
            curveStyle: 'straight',
            spawnRatePerSec: 13,
            travelDuration: 650,
            sfxType: 'rock',
        });
    },
    // ══════════════════════════════════════════════════════════
    // HỆ BAY — spawnFlying2 (Gale Onslaught) — lưỡi gió mảnh dài cong
    // ══════════════════════════════════════════════════════════
    async spawnFlying2(startEl, endEl, count, scale, damage) {
        // Lưỡi gió cong hình lưỡi liềm mảnh, viền trắng sáng, thân tím nhạt trong suốt
        const buildWindBlade = (s, c) => {
            const w = (88 + Math.random() * 26) * s;
            const h = (10 + Math.random() * 5) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(90deg, transparent 0%, ${c}44 15%, #fff 50%, ${c}44 85%, transparent 100%);
                border-radius: 50%;
                filter: blur(${0.8 * s}px) drop-shadow(0 0 ${6 * s}px #fff);
            `;
            return el;
        };

        // Lớp NỀN cuồng phong — xoáy gió cuộn toàn arena, mờ trắng-tím lướt nhanh
        const buildGaleMist = (arenaRect) => {
            if (!document.getElementById('pkm-flying2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-flying2-mist-style';
                style.textContent = `
                    @keyframes pkmFlying2Gust {
                        0%, 100% { opacity: 0.6; transform: skewX(0deg); }
                        50%      { opacity: 0.9; transform: skewX(-3deg); }
                    }
                    @keyframes pkmFlying2StreakDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: -300px 20px, 260px -15px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 75% at 50% 50%, rgba(200,180,255,0.4) 0%, rgba(90,60,150,0.32) 45%, transparent 80%);
                animation: pkmFlying2Gust 0.9s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const streakLayer = document.createElement('div');
            streakLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    repeating-linear-gradient(8deg, transparent 0px, transparent 40px, rgba(255,255,255,0.16) 42px, transparent 46px, transparent 90px),
                    repeating-linear-gradient(-6deg, transparent 0px, transparent 55px, rgba(230,220,255,0.14) 57px, transparent 60px, transparent 100px);
                mix-blend-mode: screen;
                animation: pkmFlying2StreakDrift 1.6s linear infinite;
            `;
            mistRoot.appendChild(streakLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildWindBlade,
            buildFrame: buildGaleMist,
            color: '#a890f0',
            emberColors: ['#a890f0', '#c5b3ff', '#f5f5ff'],
            curveStyle: 'wavy',
            spawnRatePerSec: 19,
            travelDuration: 560,
            sfxType: 'flying',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ TÂM LINH — spawnPsychic2 (Mindquake Surge) — mắt/vòng năng lượng méo mó
    // ══════════════════════════════════════════════════════════
    async spawnPsychic2(startEl, endEl, count, scale, damage) {
        // Vòng năng lượng hình elip méo, tâm sáng như "con mắt", nhấp nháy loạn nhịp
        const buildPsiRing = (s, c) => {
            if (!document.getElementById('pkm-psychic2-ring-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-psychic2-ring-style';
                style.textContent = `
                    @keyframes pkmPsychic2Warp {
                        0%   { transform: scale(1, 1) rotate(0deg); }
                        33%  { transform: scale(1.25, 0.8) rotate(8deg); }
                        66%  { transform: scale(0.8, 1.2) rotate(-6deg); }
                        100% { transform: scale(1, 1) rotate(0deg); }
                    }
                `;
                document.head.appendChild(style);
            }
            const size = (34 + Math.random() * 18) * s;
            const outer = document.createElement('div');
            outer.style.cssText = `width:${size}px; height:${size}px;`;
            const inner = document.createElement('div');
            inner.style.cssText = `
                width:100%; height:100%; border-radius:50%;
                border: ${3 * s}px solid ${c};
                background: radial-gradient(circle at 50% 50%, #fff 0%, ${c}aa 40%, transparent 75%);
                box-shadow: 0 0 ${8 * s}px ${c}, inset 0 0 ${6 * s}px #fff;
                animation: pkmPsychic2Warp ${0.5 + Math.random() * 0.3}s ease-in-out infinite;
                filter: drop-shadow(0 0 ${5 * s}px ${c});
            `;
            outer.appendChild(inner);
            return outer;
        };

        // Lớp NỀN không gian bóp méo — sóng đồng tâm tím-hồng lan toàn arena
        const buildPsychicMist = (arenaRect) => {
            if (!document.getElementById('pkm-psychic2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-psychic2-mist-style';
                style.textContent = `
                    @keyframes pkmPsychic2Pulse {
                        0%, 100% { opacity: 0.6; transform: scale(1); }
                        50%      { opacity: 0.95; transform: scale(1.06); }
                    }
                    @keyframes pkmPsychic2RingExpand {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 220px 0px, -180px 0px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 75% at 50% 50%, rgba(248,88,136,0.4) 0%, rgba(90,10,60,0.35) 45%, transparent 80%);
                animation: pkmPsychic2Pulse 1.3s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const ringLayer = document.createElement('div');
            ringLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 80px at 50% 50%, transparent 55%, rgba(248,88,136,0.2) 58%, transparent 63%),
                    radial-gradient(circle 50px at 50% 50%, transparent 55%, rgba(200,140,255,0.18) 58%, transparent 63%);
                background-size: 240px 240px, 180px 180px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmPsychic2RingExpand 2.6s linear infinite;
                opacity: 0.7;
            `;
            mistRoot.appendChild(ringLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildPsiRing,
            buildFrame: buildPsychicMist,
            color: '#f85888',
            emberColors: ['#f85888', '#c58fff', '#ffffff'],
            curveStyle: 'zigzag',
            spawnRatePerSec: 13,
            travelDuration: 800,
            sfxType: 'psychic',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ BỌ — spawnBug2 (Swarm Onslaught) — cánh bọ mảnh vo ve rung
    // ══════════════════════════════════════════════════════════
    async spawnBug2(startEl, endEl, count, scale, damage) {
        // Cặp cánh mảnh trong suốt rung nhanh (khác hẳn thân sâu bò trườn), màu vàng-lục dạ quang
        const buildBuzzWing = (s, c) => {
            if (!document.getElementById('pkm-bug2-wing-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-bug2-wing-style';
                style.textContent = `
                    @keyframes pkmBug2Buzz {
                        0%, 100% { transform: scaleY(1) skewX(0deg); }
                        50%      { transform: scaleY(0.7) skewX(8deg); }
                    }
                `;
                document.head.appendChild(style);
            }
            const w = (30 + Math.random() * 14) * s;
            const h = w * 0.6;
            const outer = document.createElement('div');
            outer.style.cssText = `width:${w}px; height:${h}px; display:flex; gap:${2*s}px;`;
            for (let i = 0; i < 2; i++) {
                const wing = document.createElement('div');
                wing.style.cssText = `
                    flex:1; height:100%;
                    background: radial-gradient(ellipse at 30% 30%, #fff 0%, ${c}99 40%, transparent 75%);
                    border: ${1 * s}px solid ${c};
                    border-radius: 60% 40% 60% 40%;
                    animation: pkmBug2Buzz ${0.08 + Math.random() * 0.05}s ease-in-out infinite;
                    filter: drop-shadow(0 0 ${3 * s}px ${c});
                `;
                outer.appendChild(wing);
            }
            return outer;
        };

        // Lớp NỀN bầy đàn vo ve — hạt phấn dạ quang lấp lánh dày đặc toàn arena
        const buildSwarmMist = (arenaRect) => {
            if (!document.getElementById('pkm-bug2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-bug2-mist-style';
                style.textContent = `
                    @keyframes pkmBug2Flicker {
                        0%, 100% { opacity: 0.55; }
                        50%      { opacity: 0.9; }
                    }
                    @keyframes pkmBug2SporeDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 180px 200px, -160px -180px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 75% at 50% 50%, rgba(168,184,32,0.4) 0%, rgba(60,70,10,0.32) 45%, transparent 80%);
                animation: pkmBug2Flicker 0.6s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const sporeLayer = document.createElement('div');
            sporeLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 3px, rgba(220,255,80,0.75) 0%, transparent 70%),
                    radial-gradient(circle 2px, rgba(168,184,32,0.7) 0%, transparent 70%);
                background-size: 110px 100px, 90px 80px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmBug2SporeDrift 2.4s linear infinite;
                opacity: 0.85;
            `;
            mistRoot.appendChild(sporeLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildBuzzWing,
            buildFrame: buildSwarmMist,
            color: '#a8b820',
            emberColors: ['#a8b820', '#c6e05a', '#d4e157'],
            curveStyle: 'zigzag',
            spawnRatePerSec: 24,
            travelDuration: 500,
            sfxType: 'bug',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ ĐÁ — spawnRock2 (Stalagmite Barrage) — cột đá nhọn mọc trồi
    // ══════════════════════════════════════════════════════════
    async spawnRock2(startEl, endEl, count, scale, damage) {
        // Cột đá nhọn hình tam giác dài, khác hẳn mảnh đá vụn góc cạnh (hệ Đất) —
        // đây là dáng cột NHỌN, thẳng, giống thạch nhũ mọc lên.
        const buildStoneSpike = (s, c) => {
            const w = (18 + Math.random() * 10) * s;
            const h = (60 + Math.random() * 24) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(180deg, #efebe9 0%, ${c} 45%, #4a3a20 90%);
                clip-path: polygon(50% 0%, 85% 100%, 15% 100%);
                filter: drop-shadow(0 0 ${3 * s}px #00000066);
            `;
            return el;
        };

        // Lớp NỀN hang đá — bụi khoáng nâu vàng phát sáng nhẹ, rung theo nhịp
        const buildStoneDustMist = (arenaRect) => {
            if (!document.getElementById('pkm-rock2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-rock2-mist-style';
                style.textContent = `
                    @keyframes pkmRock2Flicker {
                        0%, 100% { opacity: 0.6; }
                        50%      { opacity: 0.9; }
                    }
                    @keyframes pkmRock2DustDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 200px 60px, -180px -50px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 78% at 50% 100%, rgba(184,160,56,0.45) 0%, rgba(70,50,15,0.4) 45%, transparent 80%);
                animation: pkmRock2Flicker 0.9s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const dustLayer = document.createElement('div');
            dustLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 4px, rgba(200,180,120,0.55) 0%, transparent 70%),
                    radial-gradient(circle 5px, rgba(160,130,70,0.5) 0%, transparent 70%);
                background-size: 150px 140px, 190px 170px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmRock2DustDrift 3s linear infinite;
                opacity: 0.75;
            `;
            mistRoot.appendChild(dustLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildStoneSpike,
            buildFrame: buildStoneDustMist,
            color: '#b8a038',
            emberColors: ['#b8a038', '#a08050', '#efebe9'],
            curveStyle: 'straight',
            spawnRatePerSec: 13,
            travelDuration: 650,
            sfxType: 'rock',
        });
    },
    // ══════════════════════════════════════════════════════════
    // HỆ MA — spawnGhost2 (Spectral Onslaught) — vệt hồn ma lượn lờ, đuôi tan biến
    // ══════════════════════════════════════════════════════════
    async spawnGhost2(startEl, endEl, count, scale, damage) {
        // Vệt sáng dài mờ ảo, đầu đặc dần mờ ra sau (khác dáng người/mặt đã có)
        const buildWispTrail = (s, c) => {
            const w = (80 + Math.random() * 26) * s;
            const h = (16 + Math.random() * 8) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(90deg, transparent 0%, ${c}22 20%, ${c}bb 55%, #e8dfff 78%, transparent 100%);
                border-radius: 50%;
                filter: blur(${2.2 * s}px) drop-shadow(0 0 ${7 * s}px ${c});
            `;
            return el;
        };

        // Lớp NỀN sương hồn — sương xanh lục-tím lượn lờ, đủ sáng để nhìn rõ streak
        const buildSpectralMist = (arenaRect) => {
            if (!document.getElementById('pkm-ghost2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-ghost2-mist-style';
                style.textContent = `
                    @keyframes pkmGhost2Drift {
                        0%, 100% { opacity: 0.55; transform: translateX(0); }
                        50%      { opacity: 0.85; transform: translateX(1.5%); }
                    }
                    @keyframes pkmGhost2WispFloat {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: -240px -60px, 200px 50px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 78% at 50% 50%, rgba(112,88,152,0.42) 0%, rgba(40,20,60,0.35) 45%, transparent 80%),
                    radial-gradient(ellipse 55% 45% at 20% 20%, rgba(0,255,200,0.15) 0%, transparent 60%);
                animation: pkmGhost2Drift 2s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const wispLayer = document.createElement('div');
            wispLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 5px, rgba(200,255,240,0.5) 0%, transparent 70%),
                    radial-gradient(circle 4px, rgba(180,140,255,0.5) 0%, transparent 70%);
                background-size: 180px 200px, 150px 170px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmGhost2WispFloat 3.6s linear infinite;
                opacity: 0.7;
            `;
            mistRoot.appendChild(wispLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildWispTrail,
            buildFrame: buildSpectralMist,
            color: '#705898',
            emberColors: ['#705898', '#8a6fd8', '#00ffcc'],
            curveStyle: 'wavy',
            spawnRatePerSec: 14,
            travelDuration: 900,
            sfxType: 'ghost',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ RỒNG — spawnDragon2 (Draconic Onslaught) — tia năng lượng xoắn đôi
    // ══════════════════════════════════════════════════════════
    async spawnDragon2(startEl, endEl, count, scale, damage) {
        // 2 sọc xoắn quanh nhau (double-helix), tím-xanh, khác hẳn thân rồng SVG đã có
        const buildDracoHelix = (s, c) => {
            if (!document.getElementById('pkm-dragon2-helix-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-dragon2-helix-style';
                style.textContent = `
                    @keyframes pkmDragon2Spin { from { background-position: 0px 0px; } to { background-position: 40px 0px; } }
                `;
                document.head.appendChild(style);
            }
            const w = (86 + Math.random() * 22) * s;
            const h = (22 + Math.random() * 6) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background:
                    repeating-linear-gradient(70deg, transparent 0px, transparent 6px, #fff 7px, ${c} 10px, transparent 12px, transparent 20px),
                    linear-gradient(90deg, transparent 0%, ${c}55 15%, ${c}dd 50%, ${c}55 85%, transparent 100%);
                animation: pkmDragon2Spin 0.35s linear infinite;
                filter: drop-shadow(0 0 ${6 * s}px ${c});
            `;
            return el;
        };

        // Lớp NỀN thiên hà rồng — tinh vân tím sâu + sao lấp lánh toàn arena
        const buildDraconicMist = (arenaRect) => {
            if (!document.getElementById('pkm-dragon2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-dragon2-mist-style';
                style.textContent = `
                    @keyframes pkmDragon2Pulse {
                        0%, 100% { opacity: 0.6; transform: scale(1); }
                        50%      { opacity: 0.95; transform: scale(1.04); }
                    }
                    @keyframes pkmDragon2StarDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 160px 140px, -140px -120px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 78% at 50% 50%, rgba(112,56,248,0.42) 0%, rgba(30,10,60,0.35) 45%, transparent 80%);
                animation: pkmDragon2Pulse 1.5s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const starLayer = document.createElement('div');
            starLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 3px, rgba(230,210,255,0.8) 0%, transparent 70%),
                    radial-gradient(circle 2px, rgba(112,56,248,0.7) 0%, transparent 70%);
                background-size: 130px 140px, 100px 110px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmDragon2StarDrift 3s linear infinite;
                opacity: 0.85;
            `;
            mistRoot.appendChild(starLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildDracoHelix,
            buildFrame: buildDraconicMist,
            color: '#7038f8',
            emberColors: ['#7038f8', '#a684ff', '#00f0ff'],
            curveStyle: 'wavy',
            spawnRatePerSec: 15,
            travelDuration: 700,
            sfxType: 'dragon',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ TỐI — spawnDark2 (Umbral Onslaught) — vệt hắc ám viền neon tím RÕ NÉT
    // (chú ý: luôn giữ glow đủ mạnh + nền không quá đen để hiệu ứng dễ nhìn)
    // ══════════════════════════════════════════════════════════
    async spawnDark2(startEl, endEl, count, scale, damage) {
        // Lõi đen đặc nhưng viền neon tím-magenta RẤT SÁNG bao quanh — đảm bảo
        // luôn nổi rõ trên bất kỳ nền nào, không bị "chìm" vào tối.
        const buildShadowStreak = (s, c) => {
            const w = (78 + Math.random() * 24) * s;
            const h = (14 + Math.random() * 6) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(90deg, transparent 0%, ${c}33 15%, #1a1024 45%, #1a1024 55%, ${c}33 85%, transparent 100%);
                border-radius: ${h}px;
                box-shadow: 0 0 ${9 * s}px ${c}, 0 0 ${16 * s}px #bd00ff88;
                filter: drop-shadow(0 0 ${4 * s}px #fff);
            `;
            return el;
        };

        // Lớp NỀN: KHÔNG dùng đen thui — dùng tím đậm + glow magenta để vẫn
        // thấy rõ Pokémon và streak phía trên, tránh tình trạng "tối quá không nhìn rõ".
        const buildUmbralMist = (arenaRect) => {
            if (!document.getElementById('pkm-dark2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-dark2-mist-style';
                style.textContent = `
                    @keyframes pkmDark2Pulse {
                        0%, 100% { opacity: 0.45; transform: scale(1); }
                        50%      { opacity: 0.7;  transform: scale(1.04); }
                    }
                    @keyframes pkmDark2SparkDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 180px 100px, -160px -90px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '0.75'; // NHẸ HƠN các hệ khác — tránh che mờ toàn cảnh
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 85% 70% at 50% 50%, rgba(120,0,180,0.32) 0%, rgba(40,0,60,0.24) 50%, transparent 80%);
                animation: pkmDark2Pulse 1.1s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const sparkLayer = document.createElement('div');
            sparkLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 3px, rgba(189,0,255,0.75) 0%, transparent 70%),
                    radial-gradient(circle 2px, rgba(255,255,255,0.6) 0%, transparent 70%);
                background-size: 140px 150px, 110px 120px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmDark2SparkDrift 2.8s linear infinite;
                opacity: 0.7;
            `;
            mistRoot.appendChild(sparkLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildShadowStreak,
            buildFrame: buildUmbralMist,
            color: '#bd00ff',
            emberColors: ['#bd00ff', '#705848', '#ffffff'],
            curveStyle: 'zigzag',
            spawnRatePerSec: 16,
            travelDuration: 620,
            sfxType: 'dark',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ THÉP — spawnSteel2 (Metallic Onslaught) — thanh kim loại vát cạnh xoay lăn
    // ══════════════════════════════════════════════════════════
    async spawnSteel2(startEl, endEl, count, scale, damage) {
        // Thanh kim loại dài, phản sáng (highlight trắng chạy giữa), tự xoay quanh trục dọc
        const buildMetalRod = (s, c) => {
            if (!document.getElementById('pkm-steel2-rod-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-steel2-rod-style';
                style.textContent = `
                    @keyframes pkmSteel2Roll { from { transform: scaleY(1); } 50% { transform: scaleY(0.15); } to { transform: scaleY(1); } }
                `;
                document.head.appendChild(style);
            }
            const w = (74 + Math.random() * 22) * s;
            const h = (13 + Math.random() * 5) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(90deg, transparent 0%, ${c} 15%, #fff 50%, ${c} 85%, transparent 100%);
                animation: pkmSteel2Roll ${0.35 + Math.random() * 0.2}s linear infinite;
                filter: drop-shadow(0 0 ${5 * s}px ${c});
            `;
            return el;
        };

        // Lớp NỀN nhà máy — tia lửa hàn bắn + ánh kim xám bạc phản chiếu toàn arena
        const buildForgeMist = (arenaRect) => {
            if (!document.getElementById('pkm-steel2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-steel2-mist-style';
                style.textContent = `
                    @keyframes pkmSteel2Shimmer {
                        0%, 100% { opacity: 0.55; }
                        50%      { opacity: 0.85; }
                    }
                    @keyframes pkmSteel2SparkDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 200px -60px, -180px 50px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 78% at 50% 50%, rgba(184,184,208,0.38) 0%, rgba(60,60,70,0.32) 45%, transparent 80%);
                animation: pkmSteel2Shimmer 0.8s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const sparkLayer = document.createElement('div');
            sparkLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 3px, rgba(255,255,255,0.85) 0%, transparent 70%),
                    radial-gradient(circle 2px, rgba(255,240,180,0.7) 0%, transparent 70%);
                background-size: 120px 130px, 95px 105px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmSteel2SparkDrift 2.2s linear infinite;
                opacity: 0.75;
            `;
            mistRoot.appendChild(sparkLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildMetalRod,
            buildFrame: buildForgeMist,
            color: '#b8b8d0',
            emberColors: ['#b8b8d0', '#eef0f5', '#787887'],
            curveStyle: 'straight',
            spawnRatePerSec: 17,
            travelDuration: 600,
            sfxType: 'steel',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ TIÊN — spawnFairy2 (Fairy Onslaught) — cánh hoa + ánh sao lấp lánh bay
    // ══════════════════════════════════════════════════════════
    async spawnFairy2(startEl, endEl, count, scale, damage) {
        // Cánh hoa mềm mại xoay nhẹ khi bay, hồng phấn dạ quang (khác thực thể tinh linh hình người đã có)
        const buildPetalGlint = (s, c) => {
            if (!document.getElementById('pkm-fairy2-petal-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-fairy2-petal-style';
                style.textContent = `
                    @keyframes pkmFairy2Flutter {
                        0%, 100% { transform: rotate(0deg) scale(1); }
                        50%      { transform: rotate(20deg) scale(0.9); }
                    }
                `;
                document.head.appendChild(style);
            }
            const size = (22 + Math.random() * 14) * s;
            const outer = document.createElement('div');
            outer.style.cssText = `width:${size}px; height:${size}px;`;
            const inner = document.createElement('div');
            inner.style.cssText = `
                width:100%; height:100%;
                background: radial-gradient(circle at 35% 30%, #fff 0%, ${c}cc 45%, transparent 80%);
                border-radius: 100% 0% 100% 0%;
                animation: pkmFairy2Flutter ${0.4 + Math.random() * 0.3}s ease-in-out infinite;
                filter: drop-shadow(0 0 ${4 * s}px ${c});
            `;
            outer.appendChild(inner);
            return outer;
        };

        // Lớp NỀN vườn tiên — ánh cầu vồng nhẹ + lấp lánh sao hồng-vàng toàn arena
        const buildFairyMist = (arenaRect) => {
            if (!document.getElementById('pkm-fairy2-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-fairy2-mist-style';
                style.textContent = `
                    @keyframes pkmFairy2Glow {
                        0%, 100% { opacity: 0.6; }
                        50%      { opacity: 0.92; }
                    }
                    @keyframes pkmFairy2SparkleDrift {
                        0%   { background-position: 0px 0px, 0px 0px; }
                        100% { background-position: 160px 140px, -140px -120px; }
                    }
                `;
                document.head.appendChild(style);
            }

            const arena = document.getElementById('battle-arena') || document.body;

            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const washLayer = document.createElement('div');
            washLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(ellipse 90% 78% at 50% 50%, rgba(238,153,172,0.42) 0%, rgba(120,60,90,0.32) 45%, transparent 80%),
                    linear-gradient(135deg, rgba(255,180,220,0.12) 0%, rgba(200,150,255,0.1) 50%, rgba(255,220,150,0.12) 100%);
                animation: pkmFairy2Glow 1.4s ease-in-out infinite;
            `;
            mistRoot.appendChild(washLayer);

            const sparkleLayer = document.createElement('div');
            sparkleLayer.style.cssText = `
                position:absolute; inset:-10%;
                background:
                    radial-gradient(circle 3px, rgba(255,255,255,0.9) 0%, transparent 70%),
                    radial-gradient(circle 3px, rgba(238,153,172,0.75) 0%, transparent 70%);
                background-size: 130px 140px, 105px 115px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmFairy2SparkleDrift 3s linear infinite;
                opacity: 0.8;
            `;
            mistRoot.appendChild(sparkleLayer);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playElementalStreamBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildPetalGlint,
            buildFrame: buildFairyMist,
            color: '#ee99ac',
            emberColors: ['#ee99ac', '#ffd1e6', '#c58fff'],
            curveStyle: 'wavy',
            spawnRatePerSec: 18,
            travelDuration: 700,
            sfxType: 'fairy',
        });
    },

    // ══════════════════════════════════════════════════════════
    // ENGINE DÙNG CHUNG — "GIÁNG THẾ TỪ TRỜI/ĐẤT" (skill slot 1 mới).
    // Vật thể rơi thẳng từ trên trời XUỐNG hoặc mọc thẳng từ ĐẤT LÊN,
    // rải khắp NHIỀU vị trí ngang màn hình, NHIỀU CỠ khác nhau (to hiếm/
    // nổi bật, nhỏ nhiều/dồn dập) — đúng kiểu "mưa sét/mưa thiên thạch".
    // KHÔNG hệ nào được sửa vào hàm này. Mỗi hệ tự viết 1 hàm spawn<Hệ>1
    // riêng, TỰ CHỨA toàn bộ hàm vẽ hình bên trong nó, rồi gọi engine
    // này — xem khuôn mẫu spawnElectric1 ngay dưới.
    // ══════════════════════════════════════════════════════════
    async playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, opts) {
        const {
            itemBuilder,
            color = '#fff',
            direction = 'sky',
            bigRatio = 0.15,
            mediumRatio = 0.35,
            fallDuration = 480,
            strikeIntervalMs = 90,     // GIÃN CÁCH GIỮA CÁC LẦN SINH — nhỏ hơn fallDuration nhiều -> nhiều cái rơi CÙNG LÚC
            sfxType = 'normal',
            buildFrame = null,
        } = opts || {};

        const arena = document.getElementById('battle-arena');
        const arenaRect = arena ? arena.getBoundingClientRect()
                                 : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

        const rectE = endEl.getBoundingClientRect();
        const targetX = rectE.left + (rectE.width || 0) / 2;
        const targetY = rectE.top + (rectE.height || 0) / 2;

        const attackerSide = startEl.id.startsWith('player') ? 'player' : 'enemy';
        const targetSide = endEl.dataset.targetSide || (attackerSide === 'player' ? 'enemy' : 'player');
        const getRealTargets = () => Array.from(
            document.querySelectorAll(`.pkm-unit[id^="${targetSide}-unit-"]`)
        ).filter(el => el.dataset.dead !== '1');

        const bandCenterX = arenaRect.left + arenaRect.width / 2;
        const bandW = arenaRect.width * 0.9;

        const skyY = arenaRect.top - arenaRect.height * 0.35;
        const groundY = arenaRect.top + arenaRect.height * 1.35;

        const totalStrikes = Math.max(10, Math.round(count * 4)); // NHIỀU HƠN — cho cảm giác mưa rào
        const allEls = [];

        // ── LỚP NỀN KHÍ QUYỂN (tuỳ chọn) ──
        const frameEls = buildFrame ? buildFrame(arenaRect, scale, color) : [];
        frameEls.forEach(el => { if (!el.parentNode) document.body.appendChild(el); allEls.push(el); });
        await Promise.all(frameEls.map(el => {
            const targetOpacity = el.dataset.targetOpacity || '1';
            return el.animate([{ opacity: 0 }, { opacity: targetOpacity }],
                { duration: 220, fill: 'forwards', easing: 'ease-out' }).finished;
        }));

        this.playChargeSfx(sfxType);

        // ── PHÂN BỔ CỠ ──
        const bigCount = Math.max(1, Math.round(totalStrikes * bigRatio));
        const mediumCount = Math.max(1, Math.round(totalStrikes * mediumRatio));
        const smallCount = Math.max(1, totalStrikes - bigCount - mediumCount);
        const tierList = [
            ...Array(bigCount).fill('big'),
            ...Array(mediumCount).fill('medium'),
            ...Array(smallCount).fill('small'),
        ];
        for (let i = tierList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tierList[i], tierList[j]] = [tierList[j], tierList[i]];
        }

        const weightOf = t => t === 'big' ? 3 : t === 'medium' ? 1.5 : 1;
        const totalWeight = tierList.reduce((s, t) => s + weightOf(t), 0);
        const dmgChunks = tierList.map(t => Math.max(1, Math.round(damage * weightOf(t) / totalWeight)));

        // ── 1 CÚ RƠI — KHÔNG telegraph, chỉ pop-in nhẹ rồi lao thẳng xuống/lên ──
        const runOneStrike = async (tier, chunk) => {
            const fromSky = direction === 'sky' || (direction === 'both' && Math.random() < 0.5);
            const startY = fromSky ? skyY : groundY;
            const strikeX = bandCenterX + (Math.random() - 0.5) * bandW;

            const sizeMul = tier === 'big' ? 1.7 : tier === 'medium' ? 1.15 : 0.75;
            const durMul  = tier === 'big' ? 1.25 : tier === 'medium' ? 1.0 : 0.8;

            const el = itemBuilder(tier, scale * sizeMul, color);
            el.style.position = 'fixed';
            el.style.left = `${strikeX}px`;
            el.style.top = `${startY}px`;
            el.style.transform = 'translate(-50%,-50%) scale(0.5)';
            el.style.opacity = '0';
            el.style.zIndex = '9998';
            el.style.pointerEvents = 'none';
            document.body.appendChild(el);
            allEls.push(el);

            const dy = targetY - startY;
            const anim = el.animate([
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: `translate(-50%, calc(-50% + ${dy * 0.08}px)) scale(1)`, opacity: 1, offset: 0.12 },
                { transform: `translate(-50%, calc(-50% + ${dy}px)) scale(1)`, opacity: 1 }
            ], { duration: fallDuration * durMul, easing: 'cubic-bezier(0.5,0,0.85,0.4)', fill: 'forwards' });
            await anim.finished;

            el.remove();
            const idx = allEls.indexOf(el);
            if (idx !== -1) allEls.splice(idx, 1);

            // IMPACT
            const flashSize = (tier === 'big' ? 140 : tier === 'medium' ? 85 : 50) * scale;
            const flash = document.createElement('div');
            flash.style.cssText = `
                position: fixed; left:${strikeX}px; top:${targetY}px;
                width:${flashSize}px; height:${flashSize}px; border-radius:50%;
                background: radial-gradient(circle, #fff 0%, ${color} 45%, transparent 80%);
                transform: translate(-50%,-50%) scale(0.3); opacity: 0.95;
                z-index: 9999; pointer-events:none;
            `;
            document.body.appendChild(flash);
            allEls.push(flash);
            flash.animate([
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0.95 },
                { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }
            ], { duration: 300, easing: 'ease-out' }).onfinish = () => {
                flash.remove();
                const fi = allEls.indexOf(flash);
                if (fi !== -1) allEls.splice(fi, 1);
            };

            this.applyGlobalShake(scale * (tier === 'big' ? 1.6 : tier === 'medium' ? 0.9 : 0.5));
            this.playImpactSfx(sfxType);

            const targets = getRealTargets();
            if (targets.length > 0) {
                const t = targets[Math.floor(Math.random() * targets.length)];
                this.createDamageText(t, chunk, tier === 'big');
                t.classList.add('shake');
                setTimeout(() => t.classList.remove('shake'), 120);
            }
        };

        // ── LÊN LỊCH DỒN DẬP: KHÔNG await tuần tự — dùng setTimeout để
        // nhiều thiên thạch/tia rơi CHỒNG LẤN thời gian, tạo cảm giác mưa rào ──
        const durationMultiplier = 2; // 1 = giữ nguyên ~2s, 2 = kéo dài gấp đôi (~4s), v.v.

        let scheduleT = 0;
        const strikePromises = tierList.map((tier, i) => {
            const delay = scheduleT;
            scheduleT += strikeIntervalMs * durationMultiplier * (0.4 + Math.random() * 0.7);
            return new Promise((resolve) => {
                setTimeout(() => { runOneStrike(tier, dmgChunks[i]).then(resolve); }, delay);
            });
        });

        await Promise.all(strikePromises);
        await new Promise(r => setTimeout(r, 150));

        // ── KẾT: chớp sáng toàn màn hình cuối cùng ──
        const finaleEls = [];
        this.triggerScreenFinale(arenaRect, targetX, targetY, color, scale * 1.2, 420, finaleEls);
        await new Promise(r => setTimeout(r, 560));

        const outroAnims = frameEls.map(el => el.animate(
            [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }],
            { duration: 300, fill: 'forwards' }
        ).finished);
        await Promise.all(outroAnims);

        allEls.forEach(el => el.remove());
        finaleEls.forEach(el => el.remove());
    },

    // ══════════════════════════════════════════════════════════
    // HỆ ĐIỆN — spawnElectric1 (Thunderstorm Descent) — KHUÔN MẪU skill
    // "giáng thế": sét to+nhỏ rơi khắp màn hình từ trên trời xuống, kèm
    // nền trời chớp sáng đồng bộ (giống ảnh tham khảo).
    // LƯU Ý: đổi tên bản spawnElectric1 CŨ hiện có thành spawnElectric5
    // trước khi dán hàm này vào, để tránh trùng tên.
    // ══════════════════════════════════════════════════════════
    async spawnElectric1(startEl, endEl, count, scale, damage) {
        // Tia sét zigzag — cỡ 'big' có nhiều nhánh phụ rẽ ngang, cỡ nhỏ chỉ 1 tia thẳng gọn
        const buildLightningBolt = (tier, s, c) => {
            const w = (tier === 'big' ? 26 : tier === 'medium' ? 15 : 8) * s;
            const h = (tier === 'big' ? 260 : tier === 'medium' ? 170 : 110) * s;
            const branchOpacity = tier === 'big' ? 1 : tier === 'medium' ? 0.6 : 0;

            const el = document.createElement('div');
            el.style.cssText = `width:${w}px; height:${h}px; position:relative;`;

            const core = document.createElement('div');
            core.style.cssText = `
                position:absolute; left:50%; top:0; width:${w * 0.4}px; height:100%;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, #fff 15%, ${c} 45%, #fff 55%, ${c} 85%, transparent);
                clip-path: polygon(50% 0%, 70% 20%, 45% 38%, 65% 55%, 40% 72%, 60% 88%, 50% 100%,
                                    40% 88%, 60% 72%, 35% 55%, 55% 38%, 30% 20%);
                filter: drop-shadow(0 0 ${8 * s}px #fff) drop-shadow(0 0 ${14 * s}px ${c});
            `;
            el.appendChild(core);

            if (branchOpacity > 0) {
                [0.28, 0.62].forEach((posT, idx) => {
                    const branch = document.createElement('div');
                    const bw = w * 0.9, bh = h * 0.22;
                    const dir = idx === 0 ? -1 : 1;
                    branch.style.cssText = `
                        position:absolute; left:50%; top:${posT * 100}%;
                        width:${bw}px; height:${bh}px;
                        transform: translateX(-50%) rotate(${dir * 35}deg);
                        transform-origin: 50% 0%;
                        background: linear-gradient(180deg, ${c}, transparent);
                        clip-path: polygon(45% 0%, 55% 0%, 65% 60%, 50% 100%, 35% 60%);
                        opacity: ${branchOpacity};
                        filter: drop-shadow(0 0 ${5 * s}px ${c});
                    `;
                    el.appendChild(branch);
                });
            }
            return el;
        };

        // Lớp nền: trời tối sầm + chớp sáng đồng bộ định kỳ toàn arena
        const buildStormSky = (arenaRect) => {
            if (!document.getElementById('pkm-electric1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-electric1-sky-style';
                style.textContent = `
                    @keyframes pkmElectric1SkyFlash {
                        0%, 78%, 100% { opacity: 0.35; }
                        80% { opacity: 0.9; }
                        84% { opacity: 0.4; }
                        88% { opacity: 0.75; }
                        92% { opacity: 0.35; }
                    }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `
                position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;
                background: radial-gradient(ellipse 90% 70% at 50% 30%, rgba(255,240,150,0.35) 0%, rgba(40,40,20,0.4) 55%, transparent 85%);
                animation: pkmElectric1SkyFlash 1.6s linear infinite;
            `;
            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildLightningBolt,
            buildFrame: buildStormSky,
            color: '#f1c40f',
            direction: 'sky',
            bigRatio: 0.12,
            mediumRatio: 0.35,
            fallDuration: 420,
            telegraphDuration: 220,
            strikeIntervalMs: 190,
            sfxType: 'electric',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ LỬA — spawnFire1 (Meteor Descent) — thiên thạch lửa rơi từ trời,
    // khác hẳn Wildfire Torrent (dòng chảy ngang) và Solar Flare (hội tụ).
    // ══════════════════════════════════════════════════════════
    async spawnFire1(startEl, endEl, count, scale, damage) {
        // Thiên thạch: khối đá lõi lửa, xoay tròn liên tục, đuôi lửa dài phía sau
        const buildMeteor = (tier, s, c) => {
            if (!document.getElementById('pkm-fire1-meteor-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-fire1-meteor-style';
                style.textContent = `
                    @keyframes pkmFire1Spin { from { transform: translateX(-50%) rotate(0deg); } to { transform: translateX(-50%) rotate(360deg); } }
                `;
                document.head.appendChild(style);
            }
            const bodySize = (tier === 'big' ? 34 : tier === 'medium' ? 22 : 13) * s;
            const tailLen  = (tier === 'big' ? 220 : tier === 'medium' ? 150 : 95) * s;

            const el = document.createElement('div');
            el.style.cssText = `width:${bodySize}px; height:${tailLen}px; position:relative;`;

            const tail = document.createElement('div');
            tail.style.cssText = `
                position:absolute; left:50%; top:0; width:${bodySize * 0.55}px; height:100%;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, ${c}33 30%, ${c}bb 65%, #fff 100%);
                filter: blur(${1.2 * s}px);
                border-radius: 50%;
            `;
            el.appendChild(tail);

            const body = document.createElement('div');
            body.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${bodySize}px; height:${bodySize}px;
                background: radial-gradient(circle at 35% 30%, #fff2b0 0%, #ffb300 30%, ${c} 55%, #5a1500 85%);
                border-radius: 50%;
                animation: pkmFire1Spin ${0.5 + Math.random() * 0.3}s linear infinite;
                box-shadow: 0 0 ${10 * s}px ${c}, 0 0 ${20 * s}px #ff6d00aa;
                filter: drop-shadow(0 0 ${4 * s}px #fff);
            `;
            el.appendChild(body);
            return el;
        };

        // Lớp nền: bầu trời ám đỏ cam + tro tàn bay lơ lửng toàn arena
        const buildEmberSky = (arenaRect) => {
            if (!document.getElementById('pkm-fire1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-fire1-sky-style';
                style.textContent = `
                    @keyframes pkmFire1Glow { 0%,100%{opacity:0.4;} 50%{opacity:0.7;} }
                    @keyframes pkmFire1AshDrift { 0%{background-position:0px 0px;} 100%{background-position:40px -220px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(255,140,0,0.35) 0%, rgba(60,10,0,0.35) 55%, transparent 85%);
                animation: pkmFire1Glow 1.4s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const ash = document.createElement('div');
            ash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 3px, rgba(255,180,80,0.7) 0%, transparent 70%);
                background-size: 130px 150px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmFire1AshDrift 2.6s linear infinite;
                opacity: 0.7;
            `;
            skyRoot.appendChild(ash);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildMeteor,
            buildFrame: buildEmberSky,
            color: '#ff6d00',
            direction: 'sky',
            bigRatio: 0.12,
            mediumRatio: 0.35,
            fallDuration: 460,
            telegraphDuration: 200,
            strikeIntervalMs: 200,
            sfxType: 'fire',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ NƯỚC — spawnWater1 (Tidal Descent) — cột nước khổng lồ giáng từ
    // trời xuống, khác hẳn Tidal Onslaught (sóng ngang) và Tsunami (hội tụ).
    // ══════════════════════════════════════════════════════════
    async spawnWater1(startEl, endEl, count, scale, damage) {
        // Cột nước: thân trong suốt óng ánh, viền sáng trắng, xoáy nhẹ theo chiều rơi
        const buildWaterColumn = (tier, s, c) => {
            const w = (tier === 'big' ? 30 : tier === 'medium' ? 18 : 10) * s;
            const h = (tier === 'big' ? 240 : tier === 'medium' ? 160 : 100) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(180deg, transparent, ${c}22 12%, ${c}99 50%, #eafaff 78%, #fff 100%);
                border-radius: ${w}px;
                box-shadow: inset -2px 0 6px rgba(255,255,255,0.5), 0 0 ${8 * s}px ${c};
                filter: drop-shadow(0 0 ${5 * s}px #fff);
            `;
            return el;
        };

        // Lớp nền: mưa nhẹ + ánh sáng xanh biển lan toả toàn arena
        const buildRainMist = (arenaRect) => {
            if (!document.getElementById('pkm-water1-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-water1-mist-style';
                style.textContent = `
                    @keyframes pkmWater1Glow { 0%,100%{opacity:0.45;} 50%{opacity:0.75;} }
                    @keyframes pkmWater1RainFall { 0%{background-position:0px 0px;} 100%{background-position:10px 260px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(80,180,255,0.35) 0%, rgba(10,40,90,0.35) 55%, transparent 85%);
                animation: pkmWater1Glow 1.6s ease-in-out infinite;
            `;
            mistRoot.appendChild(wash);

            const rain = document.createElement('div');
            rain.style.cssText = `
                position:absolute; inset:-10%;
                background: repeating-linear-gradient(100deg, transparent 0px, transparent 30px, rgba(200,240,255,0.22) 31px, transparent 33px, transparent 60px);
                mix-blend-mode: screen;
                animation: pkmWater1RainFall 0.8s linear infinite;
                opacity: 0.6;
            `;
            mistRoot.appendChild(rain);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildWaterColumn,
            buildFrame: buildRainMist,
            color: '#3498db',
            direction: 'sky',
            bigRatio: 0.15,
            mediumRatio: 0.35,
            fallDuration: 500,
            telegraphDuration: 230,
            strikeIntervalMs: 210,
            sfxType: 'water',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ BĂNG — spawnIce1 (Glacial Descent) — băng nhũ rơi từ trời, khác
    // hẳn Blizzard Fury (bão tuyết ngang) và Absolute Zero (bông tuyết SVG).
    // ══════════════════════════════════════════════════════════
    async spawnIce1(startEl, endEl, count, scale, damage) {
        // Băng nhũ: khối lăng trụ nhọn 1 đầu, trong suốt ánh sáng lam, viền trắng sắc lạnh
        const buildIcicle = (tier, s, c) => {
            const w = (tier === 'big' ? 28 : tier === 'medium' ? 17 : 10) * s;
            const h = (tier === 'big' ? 210 : tier === 'medium' ? 140 : 90) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(180deg, #fff 0%, ${c}cc 45%, ${c} 75%, #fff 100%);
                clip-path: polygon(50% 100%, 15% 20%, 30% 0%, 70% 0%, 85% 20%);
                box-shadow: 0 0 ${6 * s}px #fff;
                filter: drop-shadow(0 0 ${5 * s}px ${c});
            `;
            return el;
        };

        // Lớp nền: sương giá lạnh buốt + hạt tuyết lấp lánh rơi toàn arena
        const buildFrostMist = (arenaRect) => {
            if (!document.getElementById('pkm-ice1-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-ice1-mist-style';
                style.textContent = `
                    @keyframes pkmIce1Glow { 0%,100%{opacity:0.5;} 50%{opacity:0.8;} }
                    @keyframes pkmIce1SnowFall { 0%{background-position:0px 0px;} 100%{background-position:20px 240px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(200,240,255,0.4) 0%, rgba(70,110,160,0.35) 55%, transparent 85%);
                animation: pkmIce1Glow 1.7s ease-in-out infinite;
            `;
            mistRoot.appendChild(wash);

            const snow = document.createElement('div');
            snow.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 3px, rgba(255,255,255,0.9) 0%, transparent 70%);
                background-size: 120px 140px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmIce1SnowFall 2.4s linear infinite;
                opacity: 0.8;
            `;
            mistRoot.appendChild(snow);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildIcicle,
            buildFrame: buildFrostMist,
            color: '#74b9ff',
            direction: 'sky',
            bigRatio: 0.13,
            mediumRatio: 0.35,
            fallDuration: 440,
            telegraphDuration: 210,
            strikeIntervalMs: 195,
            sfxType: 'ice',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ ĐẤT — spawnGround1 (Spike Uprising) — gai đá MỌC TỪ ĐẤT LÊN
    // (direction: 'ground'), khác hẳn Seismic Barrage (đá vụn xoay ngang)
    // và Terra Spirit Rush (bản thể khổng lồ) — đây là hướng NGƯỢC LẠI
    // duy nhất trong 5 hệ đã làm, chứng minh engine dùng chung cho cả 2 chiều.
    // ══════════════════════════════════════════════════════════
    async spawnGround1(startEl, endEl, count, scale, damage) {
        // Gai đá: thân lăng trụ góc cạnh, đáy rộng đỉnh nhọn (đúng hướng trồi lên),
        // viền nứt nẻ nâu vàng, bụi đất bám quanh gốc.
        const buildEarthSpike = (tier, s, c) => {
            const w = (tier === 'big' ? 32 : tier === 'medium' ? 20 : 12) * s;
            const h = (tier === 'big' ? 200 : tier === 'medium' ? 135 : 85) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(0deg, #4a3a20 0%, ${c} 40%, #efebe9 85%);
                clip-path: polygon(50% 0%, 78% 30%, 100% 100%, 0% 100%, 22% 30%);
                box-shadow: 0 0 ${5 * s}px #00000066;
                filter: drop-shadow(0 0 ${3 * s}px ${c});
            `;
            return el;
        };

        // Lớp nền: mặt đất nứt phát sáng cam + bụi cát rung toàn arena
        const buildQuakeGroundMist = (arenaRect) => {
            if (!document.getElementById('pkm-ground1-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-ground1-mist-style';
                style.textContent = `
                    @keyframes pkmGround1Rumble { 0%,100%{opacity:0.5; transform:translateY(0);} 50%{opacity:0.8; transform:translateY(-1%);} }
                    @keyframes pkmGround1DustDrift { 0%{background-position:0px 0px;} 100%{background-position:180px -30px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 75% at 50% 100%, rgba(220,150,60,0.5) 0%, rgba(90,50,10,0.4) 45%, transparent 80%);
                animation: pkmGround1Rumble 0.55s ease-in-out infinite;
            `;
            mistRoot.appendChild(wash);

            const dust = document.createElement('div');
            dust.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 5px, rgba(200,160,100,0.6) 0%, transparent 70%);
                background-size: 150px 130px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmGround1DustDrift 2.6s linear infinite;
                opacity: 0.75;
            `;
            mistRoot.appendChild(dust);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildEarthSpike,
            buildFrame: buildQuakeGroundMist,
            color: '#e2bf65',
            direction: 'ground',
            bigRatio: 0.15,
            mediumRatio: 0.35,
            fallDuration: 420,
            telegraphDuration: 200,
            strikeIntervalMs: 200,
            sfxType: 'ground',
        });
    },
    // ══════════════════════════════════════════════════════════
    // HỆ CỎ — spawnGrass1 (Root Uprising) — rễ gai MỌC TỪ ĐẤT LÊN
    // (direction: 'ground'), khác hẳn Verdant Cyclone (lá xoay ngang)
    // và Bloom Cascade (thân lá bay). Rễ có gai nhọn xen kẽ dọc thân.
    // ══════════════════════════════════════════════════════════
    async spawnGrass1(startEl, endEl, count, scale, damage) {
        const buildThornRoot = (tier, s, c) => {
            const w = (tier === 'big' ? 26 : tier === 'medium' ? 16 : 10) * s;
            const h = (tier === 'big' ? 210 : tier === 'medium' ? 145 : 90) * s;
            const el = document.createElement('div');
            el.style.cssText = `width:${w}px; height:${h}px; position:relative;`;

            const stem = document.createElement('div');
            stem.style.cssText = `
                position:absolute; left:50%; top:0; width:${w * 0.4}px; height:100%;
                transform: translateX(-50%);
                background: linear-gradient(0deg, #145a32 0%, ${c} 45%, #6fcf5a 85%, #eaffea 100%);
                border-radius: ${w}px ${w}px 0 0;
                filter: drop-shadow(0 0 ${3 * s}px ${c});
            `;
            el.appendChild(stem);

            const thornCount = tier === 'big' ? 5 : tier === 'medium' ? 3 : 2;
            for (let i = 0; i < thornCount; i++) {
                const dir = i % 2 === 0 ? -1 : 1;
                const posT = 0.25 + (i / thornCount) * 0.6;
                const thorn = document.createElement('div');
                const tw = w * 0.9, th = h * 0.1;
                thorn.style.cssText = `
                    position:absolute; left:50%; top:${posT * 100}%;
                    width:${tw}px; height:${th}px;
                    transform: translateX(-50%) rotate(${dir * 35}deg) translateX(${dir * tw * 0.35}px);
                    background: linear-gradient(${dir > 0 ? '90deg' : '270deg'}, ${c}, transparent);
                    clip-path: polygon(0% 40%, 70% 0%, 100% 50%, 70% 100%, 0% 60%);
                    filter: drop-shadow(0 0 ${2 * s}px ${c});
                `;
                el.appendChild(thorn);
            }
            return el;
        };

        const buildForestMist = (arenaRect) => {
            if (!document.getElementById('pkm-grass1-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-grass1-mist-style';
                style.textContent = `
                    @keyframes pkmGrass1Rumble { 0%,100%{opacity:0.5; transform:scale(1);} 50%{opacity:0.8; transform:scale(1.03);} }
                    @keyframes pkmGrass1PollenDrift { 0%{background-position:0px 0px;} 100%{background-position:-200px -30px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '1';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 78% at 50% 100%, rgba(46,204,113,0.5) 0%, rgba(10,60,20,0.4) 45%, transparent 80%);
                animation: pkmGrass1Rumble 0.7s ease-in-out infinite;
            `;
            mistRoot.appendChild(wash);

            const pollen = document.createElement('div');
            pollen.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 3px, rgba(220,255,170,0.75) 0%, transparent 70%);
                background-size: 130px 120px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmGrass1PollenDrift 2.4s linear infinite;
                opacity: 0.75;
            `;
            mistRoot.appendChild(pollen);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildThornRoot,
            buildFrame: buildForestMist,
            color: '#2ecc71',
            direction: 'ground',
            bigRatio: 0.14,
            mediumRatio: 0.35,
            fallDuration: 400,
            strikeIntervalMs: 90,
            sfxType: 'grass',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ ĐỘC — spawnPoison1 (Venom Downpour) — giọt acid RƠI TỪ TRỜI
    // (direction: 'sky'), khác hẳn Toxic Deluge (nghiêng bay ngang)
    // và Miasma Surge (5 con vật độc). Giọt có vệt nhớt kéo dài phía sau.
    // ══════════════════════════════════════════════════════════
    async spawnPoison1(startEl, endEl, count, scale, damage) {
        const buildVenomDrop = (tier, s, c) => {
            const w = (tier === 'big' ? 24 : tier === 'medium' ? 15 : 9) * s;
            const h = (tier === 'big' ? 180 : tier === 'medium' ? 125 : 80) * s;
            const el = document.createElement('div');
            el.style.cssText = `width:${w}px; height:${h}px; position:relative;`;

            const trail = document.createElement('div');
            trail.style.cssText = `
                position:absolute; left:50%; top:0; width:${w * 0.35}px; height:${h * 0.8}px;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, ${c}44 40%, ${c}aa 100%);
                filter: blur(${1 * s}px);
            `;
            el.appendChild(trail);

            const head = document.createElement('div');
            head.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${w}px; height:${w * 1.3}px;
                transform: translateX(-50%);
                background: radial-gradient(circle at 40% 30%, #eafce0 0%, #a3e635 25%, ${c} 55%, #4a148c 90%);
                border-radius: 50% 50% 40% 40% / 60% 60% 40% 40%;
                filter: drop-shadow(0 0 ${5 * s}px ${c});
            `;
            el.appendChild(head);
            return el;
        };

        const buildToxicRainSky = (arenaRect) => {
            if (!document.getElementById('pkm-poison1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-poison1-sky-style';
                style.textContent = `
                    @keyframes pkmPoison1Glow { 0%,100%{opacity:0.45;} 50%{opacity:0.75;} }
                    @keyframes pkmPoison1RainFall { 0%{background-position:0px 0px;} 100%{background-position:-10px 250px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(160,0,220,0.35) 0%, rgba(40,0,60,0.4) 55%, transparent 85%);
                animation: pkmPoison1Glow 1.5s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const rain = document.createElement('div');
            rain.style.cssText = `
                position:absolute; inset:-10%;
                background: repeating-linear-gradient(96deg, transparent 0px, transparent 26px, rgba(160,255,80,0.2) 27px, transparent 29px, transparent 55px);
                mix-blend-mode: screen;
                animation: pkmPoison1RainFall 0.9s linear infinite;
                opacity: 0.65;
            `;
            skyRoot.appendChild(rain);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildVenomDrop,
            buildFrame: buildToxicRainSky,
            color: '#a040a0',
            direction: 'sky',
            bigRatio: 0.14,
            mediumRatio: 0.35,
            fallDuration: 440,
            strikeIntervalMs: 90,
            sfxType: 'poison',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ ĐÁ — spawnRock1 (Meteor Descent) — thiên thạch đá nứt nham
    // thạch RƠI TỪ TRỜI, khác hẳn Stalagmite Barrage (cột nhọn thẳng)
    // và Boulder Spirit Rush/Meteor Fall (bản thể/thiên thạch cầu tròn).
    // Đây là khối ĐA GIÁC THÔ, có vết nứt cam sáng chạy trên bề mặt.
    // ══════════════════════════════════════════════════════════
    async spawnRock1(startEl, endEl, count, scale, damage) {
        const buildCrackedBoulder = (tier, s, c) => {
            if (!document.getElementById('pkm-rock1-spin-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-rock1-spin-style';
                style.textContent = `
                    @keyframes pkmRock1Tumble { from { transform: translateX(-50%) rotate(0deg); } to { transform: translateX(-50%) rotate(300deg); } }
                `;
                document.head.appendChild(style);
            }
            const bodySize = (tier === 'big' ? 40 : tier === 'medium' ? 25 : 15) * s;
            const tailLen  = (tier === 'big' ? 150 : tier === 'medium' ? 100 : 65) * s;

            const el = document.createElement('div');
            el.style.cssText = `width:${bodySize}px; height:${tailLen}px; position:relative;`;

            const tail = document.createElement('div');
            tail.style.cssText = `
                position:absolute; left:50%; top:0; width:${bodySize * 0.45}px; height:100%;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, #ff6d0055 40%, #ff6d00aa 100%);
                filter: blur(${1 * s}px);
            `;
            el.appendChild(tail);

            const body = document.createElement('div');
            body.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${bodySize}px; height:${bodySize}px;
                background:
                    linear-gradient(120deg, transparent 46%, #ff6d00 48%, #ffb300 50%, transparent 52%),
                    linear-gradient(30deg, transparent 60%, #ff6d00 62%, transparent 64%),
                    radial-gradient(circle at 35% 35%, #8d6e63 0%, ${c} 55%, #3e2723 90%);
                clip-path: polygon(20% 0%, 80% 8%, 100% 45%, 78% 100%, 20% 95%, 0% 50%);
                animation: pkmRock1Tumble ${0.7 + Math.random() * 0.4}s linear infinite;
                box-shadow: 0 0 ${6 * s}px #ff6d0088;
                filter: drop-shadow(0 0 ${3 * s}px #00000066);
            `;
            el.appendChild(body);
            return el;
        };

        const buildAshSky = (arenaRect) => {
            if (!document.getElementById('pkm-rock1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-rock1-sky-style';
                style.textContent = `
                    @keyframes pkmRock1Glow { 0%,100%{opacity:0.4;} 50%{opacity:0.7;} }
                    @keyframes pkmRock1DustDrift { 0%{background-position:0px 0px;} 100%{background-position:30px -200px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(255,140,0,0.32) 0%, rgba(50,30,10,0.4) 55%, transparent 85%);
                animation: pkmRock1Glow 1.4s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const dust = document.createElement('div');
            dust.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 3px, rgba(220,180,120,0.65) 0%, transparent 70%);
                background-size: 140px 150px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmRock1DustDrift 2.5s linear infinite;
                opacity: 0.7;
            `;
            skyRoot.appendChild(dust);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildCrackedBoulder,
            buildFrame: buildAshSky,
            color: '#8d6e63',
            direction: 'sky',
            bigRatio: 0.16,
            mediumRatio: 0.35,
            fallDuration: 460,
            strikeIntervalMs: 95,
            sfxType: 'rock',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ BAY — spawnFlying1 (Skyfall Onslaught) — lông vũ xoáy RƠI TỪ
    // TRỜI, khác hẳn Gale Onslaught (lưỡi gió cong ngang) và Tempest
    // Spirit Rush/Wing (bản thể/lưỡi liềm SVG). Lông vũ mảnh, tự xoay
    // tròn liên tục khi rơi, viền ánh tím nhạt.
    // ══════════════════════════════════════════════════════════
    async spawnFlying1(startEl, endEl, count, scale, damage) {
        const buildFallingFeather = (tier, s, c) => {
            if (!document.getElementById('pkm-flying1-feather-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-flying1-feather-style';
                style.textContent = `
                    @keyframes pkmFlying1Twirl { from { transform: translateX(-50%) rotate(0deg); } to { transform: translateX(-50%) rotate(360deg); } }
                `;
                document.head.appendChild(style);
            }
            const w = (tier === 'big' ? 30 : tier === 'medium' ? 19 : 11) * s;
            const h = w * 2.6;
            const el = document.createElement('div');
            el.style.cssText = `width:${w}px; height:${h}px; position:relative;`;

            const feather = document.createElement('div');
            feather.style.cssText = `
                position:absolute; left:50%; top:0; width:100%; height:100%;
                background: linear-gradient(180deg, #fff 0%, ${c}cc 40%, ${c} 75%, transparent 100%);
                clip-path: polygon(50% 0%, 85% 20%, 70% 55%, 90% 75%, 50% 100%, 10% 75%, 30% 55%, 15% 20%);
                animation: pkmFlying1Twirl ${0.6 + Math.random() * 0.35}s linear infinite;
                filter: drop-shadow(0 0 ${4 * s}px ${c});
            `;
            el.appendChild(feather);
            return el;
        };

        const buildStormWindSky = (arenaRect) => {
            if (!document.getElementById('pkm-flying1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-flying1-sky-style';
                style.textContent = `
                    @keyframes pkmFlying1Sway { 0%,100%{opacity:0.45; transform:skewX(0deg);} 50%{opacity:0.75; transform:skewX(-2deg);} }
                    @keyframes pkmFlying1StreakDrift { 0%{background-position:0px 0px;} 100%{background-position:-260px 40px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(200,180,255,0.35) 0%, rgba(50,30,90,0.35) 55%, transparent 85%);
                animation: pkmFlying1Sway 1.1s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const streak = document.createElement('div');
            streak.style.cssText = `
                position:absolute; inset:-10%;
                background: repeating-linear-gradient(78deg, transparent 0px, transparent 34px, rgba(255,255,255,0.16) 36px, transparent 39px, transparent 75px);
                mix-blend-mode: screen;
                animation: pkmFlying1StreakDrift 1.3s linear infinite;
            `;
            skyRoot.appendChild(streak);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildFallingFeather,
            buildFrame: buildStormWindSky,
            color: '#a890f0',
            direction: 'sky',
            bigRatio: 0.13,
            mediumRatio: 0.35,
            fallDuration: 420,
            strikeIntervalMs: 90,
            sfxType: 'flying',
        });
    },
    // ══════════════════════════════════════════════════════════
    // HỆ TÂM LINH — spawnPsychic1 (Cosmic Descent) — mảnh gương vỡ vũ trụ
    // RƠI TỪ TRỜI, khác hẳn Mindquake Surge (vòng méo mó ngang) và Mind
    // Spirit Rush/Swarm (bản thể/thìa cổ đại). Mảnh gương lục giác phản
    // chiếu ánh hồng-tím, tự xoay khi rơi.
    // ══════════════════════════════════════════════════════════
    async spawnPsychic1(startEl, endEl, count, scale, damage) {
        const buildMirrorShard = (tier, s, c) => {
            if (!document.getElementById('pkm-psychic1-shard-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-psychic1-shard-style';
                style.textContent = `
                    @keyframes pkmPsychic1Tumble { from { transform: translateX(-50%) rotate(0deg) scale(1); } 50% { transform: translateX(-50%) rotate(180deg) scale(0.85); } to { transform: translateX(-50%) rotate(360deg) scale(1); } }
                `;
                document.head.appendChild(style);
            }
            const size = (tier === 'big' ? 34 : tier === 'medium' ? 21 : 13) * s;
            const tailLen = (tier === 'big' ? 170 : tier === 'medium' ? 115 : 75) * s;

            const el = document.createElement('div');
            el.style.cssText = `width:${size}px; height:${tailLen}px; position:relative;`;

            const trail = document.createElement('div');
            trail.style.cssText = `
                position:absolute; left:50%; top:0; width:${size * 0.35}px; height:100%;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, ${c}44 40%, #fff8 100%);
                filter: blur(${1 * s}px);
            `;
            el.appendChild(trail);

            const shard = document.createElement('div');
            shard.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${size}px; height:${size}px;
                background: linear-gradient(135deg, #fff 0%, ${c} 40%, #4a004a 90%);
                clip-path: polygon(50% 0%, 90% 25%, 100% 70%, 60% 100%, 15% 85%, 0% 40%);
                animation: pkmPsychic1Tumble ${0.8 + Math.random() * 0.4}s ease-in-out infinite;
                box-shadow: 0 0 ${7 * s}px ${c};
                filter: drop-shadow(0 0 ${4 * s}px #fff);
            `;
            el.appendChild(shard);
            return el;
        };

        const buildVoidSky = (arenaRect) => {
            if (!document.getElementById('pkm-psychic1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-psychic1-sky-style';
                style.textContent = `
                    @keyframes pkmPsychic1Pulse { 0%,100%{opacity:0.45; transform:scale(1);} 50%{opacity:0.8; transform:scale(1.05);} }
                    @keyframes pkmPsychic1StarDrift { 0%{background-position:0px 0px;} 100%{background-position:120px -180px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(248,88,136,0.35) 0%, rgba(50,10,60,0.4) 55%, transparent 85%);
                animation: pkmPsychic1Pulse 1.3s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const star = document.createElement('div');
            star.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 2px, rgba(255,255,255,0.85) 0%, transparent 70%);
                background-size: 100px 110px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmPsychic1StarDrift 2.8s linear infinite;
                opacity: 0.8;
            `;
            skyRoot.appendChild(star);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildMirrorShard,
            buildFrame: buildVoidSky,
            color: '#f85888',
            direction: 'sky',
            bigRatio: 0.14,
            mediumRatio: 0.35,
            fallDuration: 440,
            strikeIntervalMs: 92,
            sfxType: 'psychic',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ ĐẤU — spawnFighting1 (Meteor Fist) — thiên thạch nắm đấm bốc lửa
    // RƠI TỪ TRỜI, khác hẳn Berserker Onslaught (vệt chém ngang) và
    // Warrior Spirit Rush/Titan's Fury (bản thể/icon vũ khí).
    // ══════════════════════════════════════════════════════════
    async spawnFighting1(startEl, endEl, count, scale, damage) {
        const buildFistMeteor = (tier, s, c) => {
            const bodySize = (tier === 'big' ? 36 : tier === 'medium' ? 23 : 14) * s;
            const tailLen  = (tier === 'big' ? 190 : tier === 'medium' ? 130 : 82) * s;

            const el = document.createElement('div');
            el.style.cssText = `width:${bodySize}px; height:${tailLen}px; position:relative;`;

            const tail = document.createElement('div');
            tail.style.cssText = `
                position:absolute; left:50%; top:0; width:${bodySize * 0.5}px; height:100%;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, #ff704322 35%, ${c}bb 70%, #fff 100%);
                filter: blur(${1 * s}px);
            `;
            el.appendChild(tail);

            const fist = document.createElement('div');
            fist.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${bodySize}px; height:${bodySize * 1.1}px;
                transform: translateX(-50%);
                background:
                    radial-gradient(circle at 40% 30%, #fff3e0 0%, #ff7043 30%, ${c} 60%, #4a0e00 90%);
                clip-path: polygon(30% 0%, 70% 0%, 90% 25%, 100% 55%, 75% 100%, 25% 100%, 0% 55%, 10% 25%);
                box-shadow: 0 0 ${8 * s}px ${c};
                filter: drop-shadow(0 0 ${4 * s}px #ff9800);
            `;
            el.appendChild(fist);
            return el;
        };

        const buildImpactSky = (arenaRect) => {
            if (!document.getElementById('pkm-fighting1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-fighting1-sky-style';
                style.textContent = `
                    @keyframes pkmFighting1Shock { 0%,100%{opacity:0.45; transform:scale(1);} 50%{opacity:0.8; transform:scale(1.04);} }
                    @keyframes pkmFighting1DustDrift { 0%{background-position:0px 0px;} 100%{background-position:-160px 200px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(255,120,60,0.35) 0%, rgba(60,20,10,0.4) 55%, transparent 85%);
                animation: pkmFighting1Shock 0.55s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const dust = document.createElement('div');
            dust.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 4px, rgba(255,180,140,0.6) 0%, transparent 70%);
                background-size: 130px 120px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmFighting1DustDrift 2.2s linear infinite;
                opacity: 0.7;
            `;
            skyRoot.appendChild(dust);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildFistMeteor,
            buildFrame: buildImpactSky,
            color: '#e74c3c',
            direction: 'sky',
            bigRatio: 0.15,
            mediumRatio: 0.35,
            fallDuration: 400,
            strikeIntervalMs: 85,
            sfxType: 'fighting',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ MA — spawnGhost1 (Wraith Descent) — linh hồn VỪA RƠI TỪ TRỜI
    // VỪA TRỒI TỪ ĐẤT cùng lúc (direction: 'both'), khác hẳn Spectral
    // Onslaught (vệt sáng ngang) và Phantom Spirit Rush/Spectral Wail
    // (bản thể/emoji mặt). Linh hồn hình elip mờ ảo, đuôi tan biến.
    // ══════════════════════════════════════════════════════════
    async spawnGhost1(startEl, endEl, count, scale, damage) {
        const buildWraithWisp = (tier, s, c) => {
            if (!document.getElementById('pkm-ghost1-wisp-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-ghost1-wisp-style';
                style.textContent = `
                    @keyframes pkmGhost1Wobble { 0%,100%{transform:translateX(-50%) scaleX(1);} 50%{transform:translateX(-50%) scaleX(0.75);} }
                `;
                document.head.appendChild(style);
            }
            const w = (tier === 'big' ? 32 : tier === 'medium' ? 20 : 12) * s;
            const h = (tier === 'big' ? 200 : tier === 'medium' ? 135 : 85) * s;

            const el = document.createElement('div');
            el.style.cssText = `width:${w}px; height:${h}px; position:relative;`;

            const trail = document.createElement('div');
            trail.style.cssText = `
                position:absolute; left:50%; top:0; width:${w * 0.6}px; height:${h * 0.75}px;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, ${c}55 40%, #00ffcc66 100%);
                filter: blur(${2 * s}px);
            `;
            el.appendChild(trail);

            const head = document.createElement('div');
            head.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${w}px; height:${w}px;
                transform: translateX(-50%);
                background: radial-gradient(circle at 45% 40%, #fff 0%, #00ffcc88 30%, ${c}cc 60%, transparent 90%);
                border-radius: 50%;
                animation: pkmGhost1Wobble ${0.5 + Math.random() * 0.3}s ease-in-out infinite;
                filter: drop-shadow(0 0 ${5 * s}px ${c});
            `;
            el.appendChild(head);
            return el;
        };

        const buildHauntedMist = (arenaRect) => {
            if (!document.getElementById('pkm-ghost1-mist-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-ghost1-mist-style';
                style.textContent = `
                    @keyframes pkmGhost1Drift { 0%,100%{opacity:0.5; transform:translateX(0);} 50%{opacity:0.8; transform:translateX(1%);} }
                    @keyframes pkmGhost1WispFloat { 0%{background-position:0px 0px;} 100%{background-position:-180px -60px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const mistRoot = document.createElement('div');
            mistRoot.dataset.targetOpacity = '0.85';
            mistRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 78% at 50% 50%, rgba(112,88,152,0.4) 0%, rgba(30,20,45,0.32) 50%, transparent 80%);
                animation: pkmGhost1Drift 1.6s ease-in-out infinite;
            `;
            mistRoot.appendChild(wash);

            const wisp = document.createElement('div');
            wisp.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 4px, rgba(200,255,240,0.55) 0%, transparent 70%);
                background-size: 160px 170px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmGhost1WispFloat 2.8s linear infinite;
                opacity: 0.65;
            `;
            mistRoot.appendChild(wisp);

            arena.appendChild(mistRoot);
            return [mistRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildWraithWisp,
            buildFrame: buildHauntedMist,
            color: '#705898',
            direction: 'both',
            bigRatio: 0.14,
            mediumRatio: 0.35,
            fallDuration: 460,
            strikeIntervalMs: 95,
            sfxType: 'ghost',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ BỌ — spawnBug1 (Swarm Descent) — nhện độc + kén tơ RƠI TỪ TRỜI,
    // khác hẳn Swarm Onslaught (cánh vo ve ngang) và Swarm Spirit Rush/
    // Eclipse (bản thể/SVG sâu bò). Kén hình bầu, tơ dính lơ lửng phía sau.
    // ══════════════════════════════════════════════════════════
    async spawnBug1(startEl, endEl, count, scale, damage) {
        const buildCocoonDrop = (tier, s, c) => {
            const w = (tier === 'big' ? 26 : tier === 'medium' ? 17 : 10) * s;
            const h = w * 1.6;
            const tailLen = (tier === 'big' ? 160 : tier === 'medium' ? 105 : 68) * s;

            const el = document.createElement('div');
            el.style.cssText = `width:${w * 1.4}px; height:${tailLen}px; position:relative;`;

            const web = document.createElement('div');
            web.style.cssText = `
                position:absolute; left:50%; top:0; width:${1.5 * s}px; height:${tailLen - h}px;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, rgba(255,255,255,0.7));
            `;
            el.appendChild(web);

            const cocoon = document.createElement('div');
            cocoon.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${w}px; height:${h}px;
                transform: translateX(-50%);
                background: repeating-linear-gradient(70deg, #f1f8e9 0px, #f1f8e9 3px, ${c} 4px, ${c} 6px);
                border-radius: 50% 50% 45% 45% / 60% 60% 40% 40%;
                box-shadow: 0 0 ${5 * s}px ${c};
                filter: drop-shadow(0 0 ${3 * s}px #00000055);
            `;
            el.appendChild(cocoon);
            return el;
        };

        const buildSwarmSky = (arenaRect) => {
            if (!document.getElementById('pkm-bug1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-bug1-sky-style';
                style.textContent = `
                    @keyframes pkmBug1Flicker { 0%,100%{opacity:0.45;} 50%{opacity:0.75;} }
                    @keyframes pkmBug1SporeDrift { 0%{background-position:0px 0px;} 100%{background-position:150px -190px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(168,184,32,0.35) 0%, rgba(30,40,10,0.4) 55%, transparent 85%);
                animation: pkmBug1Flicker 0.65s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const spore = document.createElement('div');
            spore.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 2px, rgba(220,255,80,0.7) 0%, transparent 70%);
                background-size: 95px 90px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmBug1SporeDrift 2.3s linear infinite;
                opacity: 0.8;
            `;
            skyRoot.appendChild(spore);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildCocoonDrop,
            buildFrame: buildSwarmSky,
            color: '#a8b820',
            direction: 'sky',
            bigRatio: 0.13,
            mediumRatio: 0.35,
            fallDuration: 430,
            strikeIntervalMs: 88,
            sfxType: 'bug',
        });
    },
    // ══════════════════════════════════════════════════════════
    // HỆ BÓNG TỐI — spawnDark1 (Umbral Descent) — mảnh hố đen vỡ vụn
    // RƠI TỪ TRỜI, khác hẳn Umbral Onslaught (vệt lõi đen ngang) và
    // Abyssal Spirit Rush/Void Collapse (bản thể/SVG hố đen tròn).
    // Giữ glow neon tím-trắng ĐỦ MẠNH để luôn nhìn rõ, không bị "chìm".
    // ══════════════════════════════════════════════════════════
    async spawnDark1(startEl, endEl, count, scale, damage) {
        const buildVoidShard = (tier, s, c) => {
            if (!document.getElementById('pkm-dark1-shard-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-dark1-shard-style';
                style.textContent = `
                    @keyframes pkmDark1Tumble { from { transform: translateX(-50%) rotate(0deg); } to { transform: translateX(-50%) rotate(300deg); } }
                `;
                document.head.appendChild(style);
            }
            const bodySize = (tier === 'big' ? 34 : tier === 'medium' ? 21 : 13) * s;
            const tailLen  = (tier === 'big' ? 175 : tier === 'medium' ? 118 : 76) * s;

            const el = document.createElement('div');
            el.style.cssText = `width:${bodySize}px; height:${tailLen}px; position:relative;`;

            const trail = document.createElement('div');
            trail.style.cssText = `
                position:absolute; left:50%; top:0; width:${bodySize * 0.4}px; height:100%;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, #bd00ff55 40%, #fff8 100%);
                filter: blur(${1 * s}px);
            `;
            el.appendChild(trail);

            const body = document.createElement('div');
            body.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${bodySize}px; height:${bodySize}px;
                background: #1a1024;
                clip-path: polygon(10% 0%, 100% 50%, 10% 100%, 0% 50%);
                border: ${1.5 * s}px solid #bd00ff;
                box-shadow: 0 0 ${9 * s}px #bd00ff, 0 0 ${16 * s}px #bd00ffaa, inset 0 0 ${5 * s}px #fff;
                animation: pkmDark1Tumble ${0.7 + Math.random() * 0.4}s linear infinite;
                filter: drop-shadow(0 0 ${5 * s}px #fff);
            `;
            el.appendChild(body);
            return el;
        };

        // Lớp nền NHẸ hơn các hệ khác — vẫn tím sâu nhưng KHÔNG quá đen,
        // để streak + Pokémon luôn nổi rõ (đúng lưu ý đã chốt trước đây).
        const buildUmbralSky = (arenaRect) => {
            if (!document.getElementById('pkm-dark1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-dark1-sky-style';
                style.textContent = `
                    @keyframes pkmDark1Pulse { 0%,100%{opacity:0.35;} 50%{opacity:0.55;} }
                    @keyframes pkmDark1SparkDrift { 0%{background-position:0px 0px;} 100%{background-position:140px -170px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '0.7';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 85% 68% at 50% 20%, rgba(120,0,180,0.28) 0%, rgba(40,0,60,0.22) 55%, transparent 82%);
                animation: pkmDark1Pulse 1.2s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const spark = document.createElement('div');
            spark.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 2px, rgba(189,0,255,0.7) 0%, transparent 70%);
                background-size: 110px 120px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmDark1SparkDrift 2.4s linear infinite;
                opacity: 0.7;
            `;
            skyRoot.appendChild(spark);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildVoidShard,
            buildFrame: buildUmbralSky,
            color: '#bd00ff',
            direction: 'sky',
            bigRatio: 0.14,
            mediumRatio: 0.35,
            fallDuration: 420,
            strikeIntervalMs: 90,
            sfxType: 'dark',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ THÉP — spawnSteel1 (Iron Downpour) — mảnh giáp kim loại nhọn
    // RƠI TỪ TRỜI, khác hẳn Metallic Onslaught (thanh kim loại lăn ngang)
    // và Titan Spirit Rush/Iron Cataclysm (bản thể/bánh răng SVG).
    // ══════════════════════════════════════════════════════════
    async spawnSteel1(startEl, endEl, count, scale, damage) {
        const buildIronShard = (tier, s, c) => {
            if (!document.getElementById('pkm-steel1-shard-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-steel1-shard-style';
                style.textContent = `
                    @keyframes pkmSteel1Glint { 0%,100%{filter:brightness(1);} 50%{filter:brightness(1.6);} }
                `;
                document.head.appendChild(style);
            }
            const w = (tier === 'big' ? 22 : tier === 'medium' ? 14 : 9) * s;
            const h = (tier === 'big' ? 190 : tier === 'medium' ? 130 : 82) * s;
            const el = document.createElement('div');
            el.style.cssText = `
                width:${w}px; height:${h}px;
                background: linear-gradient(180deg, #fff 0%, ${c} 20%, #787887 45%, #fff 55%, ${c} 80%, #787887 100%);
                clip-path: polygon(50% 100%, 20% 20%, 35% 0%, 65% 0%, 80% 20%);
                animation: pkmSteel1Glint ${0.4 + Math.random() * 0.3}s ease-in-out infinite;
                box-shadow: 0 0 ${5 * s}px #fff;
                filter: drop-shadow(0 0 ${4 * s}px ${c});
            `;
            return el;
        };

        const buildForgeSky = (arenaRect) => {
            if (!document.getElementById('pkm-steel1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-steel1-sky-style';
                style.textContent = `
                    @keyframes pkmSteel1Shimmer { 0%,100%{opacity:0.4;} 50%{opacity:0.65;} }
                    @keyframes pkmSteel1SparkDrift { 0%{background-position:0px 0px;} 100%{background-position:170px -140px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(184,184,208,0.32) 0%, rgba(40,40,50,0.4) 55%, transparent 85%);
                animation: pkmSteel1Shimmer 0.7s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const spark = document.createElement('div');
            spark.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 2px, rgba(255,255,255,0.8) 0%, transparent 70%);
                background-size: 100px 110px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmSteel1SparkDrift 2s linear infinite;
                opacity: 0.75;
            `;
            skyRoot.appendChild(spark);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildIronShard,
            buildFrame: buildForgeSky,
            color: '#b8b8d0',
            direction: 'sky',
            bigRatio: 0.13,
            mediumRatio: 0.35,
            fallDuration: 400,
            strikeIntervalMs: 85,
            sfxType: 'steel',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ RỒNG — spawnDragon1 (Draconic Descent) — mảnh vảy năng lượng
    // rồng RƠI TỪ TRỜI, khác hẳn Draconic Onslaught (xoắn đôi ngang) và
    // Draconic Spirit Rush/Ascension (bản thể/SVG rồng dài).
    // ══════════════════════════════════════════════════════════
    async spawnDragon1(startEl, endEl, count, scale, damage) {
        const buildScaleShard = (tier, s, c) => {
            if (!document.getElementById('pkm-dragon1-scale-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-dragon1-scale-style';
                style.textContent = `
                    @keyframes pkmDragon1Tumble { from { transform: translateX(-50%) rotate(0deg); } to { transform: translateX(-50%) rotate(320deg); } }
                `;
                document.head.appendChild(style);
            }
            const bodySize = (tier === 'big' ? 32 : tier === 'medium' ? 20 : 12) * s;
            const tailLen  = (tier === 'big' ? 180 : tier === 'medium' ? 122 : 78) * s;

            const el = document.createElement('div');
            el.style.cssText = `width:${bodySize}px; height:${tailLen}px; position:relative;`;

            const trail = document.createElement('div');
            trail.style.cssText = `
                position:absolute; left:50%; top:0; width:${bodySize * 0.4}px; height:100%;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, ${c}55 40%, #00f0ffaa 100%);
                filter: blur(${1 * s}px);
            `;
            el.appendChild(trail);

            const scale2 = document.createElement('div');
            scale2.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${bodySize}px; height:${bodySize}px;
                background: radial-gradient(circle at 35% 30%, #fff 0%, #00f0ff 30%, ${c} 60%, #2a085c 90%);
                clip-path: polygon(50% 0%, 100% 35%, 80% 100%, 20% 100%, 0% 35%);
                animation: pkmDragon1Tumble ${0.65 + Math.random() * 0.35}s linear infinite;
                box-shadow: 0 0 ${8 * s}px ${c};
                filter: drop-shadow(0 0 ${4 * s}px #00f0ff);
            `;
            el.appendChild(scale2);
            return el;
        };

        const buildDraconicSky = (arenaRect) => {
            if (!document.getElementById('pkm-dragon1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-dragon1-sky-style';
                style.textContent = `
                    @keyframes pkmDragon1Pulse { 0%,100%{opacity:0.4;} 50%{opacity:0.7;} }
                    @keyframes pkmDragon1StarDrift { 0%{background-position:0px 0px;} 100%{background-position:130px -160px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(112,56,248,0.35) 0%, rgba(20,10,50,0.4) 55%, transparent 85%);
                animation: pkmDragon1Pulse 1.4s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const star = document.createElement('div');
            star.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 2px, rgba(230,210,255,0.85) 0%, transparent 70%);
                background-size: 95px 100px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmDragon1StarDrift 2.6s linear infinite;
                opacity: 0.8;
            `;
            skyRoot.appendChild(star);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildScaleShard,
            buildFrame: buildDraconicSky,
            color: '#7038f8',
            direction: 'sky',
            bigRatio: 0.15,
            mediumRatio: 0.35,
            fallDuration: 440,
            strikeIntervalMs: 92,
            sfxType: 'dragon',
        });
    },

    // ══════════════════════════════════════════════════════════
    // HỆ TIÊN — spawnFairy1 (Stardust Descent) — sao băng cổ tích RƠI
    // TỪ TRỜI, khác hẳn Fairy Onslaught (cánh hoa bay ngang) và
    // Celestial Spirit Rush/Starlight Requiem (bản thể/16 sao vàng).
    // ══════════════════════════════════════════════════════════
    async spawnFairy1(startEl, endEl, count, scale, damage) {
        const buildStardust = (tier, s, c) => {
            if (!document.getElementById('pkm-fairy1-star-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-fairy1-star-style';
                style.textContent = `
                    @keyframes pkmFairy1Twinkle { from { transform: translateX(-50%) rotate(0deg); } to { transform: translateX(-50%) rotate(360deg); } }
                `;
                document.head.appendChild(style);
            }
            const w = (tier === 'big' ? 30 : tier === 'medium' ? 19 : 11) * s;
            const tailLen = (tier === 'big' ? 165 : tier === 'medium' ? 112 : 72) * s;

            const el = document.createElement('div');
            el.style.cssText = `width:${w * 1.6}px; height:${tailLen}px; position:relative;`;

            const trail = document.createElement('div');
            trail.style.cssText = `
                position:absolute; left:50%; top:0; width:${w * 0.5}px; height:100%;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, #ffd1e666 40%, #fff 100%);
                filter: blur(${1 * s}px);
            `;
            el.appendChild(trail);

            const star = document.createElement('div');
            star.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${w}px; height:${w}px;
                background: ${c};
                clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
                animation: pkmFairy1Twinkle ${0.5 + Math.random() * 0.3}s linear infinite;
                box-shadow: 0 0 ${7 * s}px #fff;
                filter: drop-shadow(0 0 ${5 * s}px ${c});
            `;
            el.appendChild(star);
            return el;
        };

        const buildFairySky = (arenaRect) => {
            if (!document.getElementById('pkm-fairy1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-fairy1-sky-style';
                style.textContent = `
                    @keyframes pkmFairy1Glow { 0%,100%{opacity:0.45;} 50%{opacity:0.75;} }
                    @keyframes pkmFairy1SparkleDrift { 0%{background-position:0px 0px;} 100%{background-position:110px -150px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(238,153,172,0.38) 0%, rgba(70,30,55,0.35) 55%, transparent 85%);
                animation: pkmFairy1Glow 1.3s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const sparkle = document.createElement('div');
            sparkle.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 2px, rgba(255,255,255,0.9) 0%, transparent 70%);
                background-size: 90px 95px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmFairy1SparkleDrift 2.4s linear infinite;
                opacity: 0.85;
            `;
            skyRoot.appendChild(sparkle);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildStardust,
            buildFrame: buildFairySky,
            color: '#ee99ac',
            direction: 'sky',
            bigRatio: 0.14,
            mediumRatio: 0.35,
            fallDuration: 410,
            strikeIntervalMs: 88,
            sfxType: 'fairy',
        });
    },
    // ══════════════════════════════════════════════════════════
    // HỆ THƯỜNG — spawnNormal1 (Meteoric Judgment) — khối năng lượng
    // trắng-vàng đa giác RƠI TỪ TRỜI, khác hẳn Resonant Wavefront (vành
    // sóng âm ngang) và Radiant Spirit Rush/Cosmic Judgment (bản thể/
    // 16 ngôi sao hội tụ). Đây là khối THUẦN KHIẾT, không hoa văn cầu kỳ.
    // ══════════════════════════════════════════════════════════
    async spawnNormal1(startEl, endEl, count, scale, damage) {
        const buildEnergyBlock = (tier, s, c) => {
            if (!document.getElementById('pkm-normal1-block-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-normal1-block-style';
                style.textContent = `
                    @keyframes pkmNormal1Tumble { from { transform: translateX(-50%) rotate(0deg); } to { transform: translateX(-50%) rotate(300deg); } }
                `;
                document.head.appendChild(style);
            }
            const bodySize = (tier === 'big' ? 32 : tier === 'medium' ? 20 : 12) * s;
            const tailLen  = (tier === 'big' ? 175 : tier === 'medium' ? 118 : 76) * s;

            const el = document.createElement('div');
            el.style.cssText = `width:${bodySize}px; height:${tailLen}px; position:relative;`;

            const trail = document.createElement('div');
            trail.style.cssText = `
                position:absolute; left:50%; top:0; width:${bodySize * 0.42}px; height:100%;
                transform: translateX(-50%);
                background: linear-gradient(180deg, transparent, ${c}44 40%, #fff 100%);
                filter: blur(${1 * s}px);
            `;
            el.appendChild(trail);

            const block = document.createElement('div');
            block.style.cssText = `
                position:absolute; left:50%; bottom:0; width:${bodySize}px; height:${bodySize}px;
                background: radial-gradient(circle at 35% 30%, #fff 0%, #fff8dc 35%, ${c} 65%, #9a7d0a 90%);
                clip-path: polygon(50% 0%, 90% 30%, 78% 90%, 22% 90%, 10% 30%);
                animation: pkmNormal1Tumble ${0.7 + Math.random() * 0.4}s linear infinite;
                box-shadow: 0 0 ${8 * s}px #fff, 0 0 ${12 * s}px ${c}aa;
                filter: drop-shadow(0 0 ${4 * s}px #fff);
            `;
            el.appendChild(block);
            return el;
        };

        const buildRadiantSky = (arenaRect) => {
            if (!document.getElementById('pkm-normal1-sky-style')) {
                const style = document.createElement('style');
                style.id = 'pkm-normal1-sky-style';
                style.textContent = `
                    @keyframes pkmNormal1Glow { 0%,100%{opacity:0.4;} 50%{opacity:0.68;} }
                    @keyframes pkmNormal1SparkDrift { 0%{background-position:0px 0px;} 100%{background-position:130px -160px;} }
                `;
                document.head.appendChild(style);
            }
            const arena = document.getElementById('battle-arena') || document.body;
            const skyRoot = document.createElement('div');
            skyRoot.dataset.targetOpacity = '1';
            skyRoot.style.cssText = `position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; opacity:0;`;

            const wash = document.createElement('div');
            wash.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(ellipse 90% 70% at 50% 20%, rgba(255,248,220,0.35) 0%, rgba(60,55,40,0.35) 55%, transparent 85%);
                animation: pkmNormal1Glow 1.3s ease-in-out infinite;
            `;
            skyRoot.appendChild(wash);

            const spark = document.createElement('div');
            spark.style.cssText = `
                position:absolute; inset:-10%;
                background: radial-gradient(circle 2px, rgba(255,255,255,0.85) 0%, transparent 70%);
                background-size: 100px 110px;
                background-repeat: repeat;
                mix-blend-mode: screen;
                animation: pkmNormal1SparkDrift 2.4s linear infinite;
                opacity: 0.75;
            `;
            skyRoot.appendChild(spark);

            arena.appendChild(skyRoot);
            return [skyRoot];
        };

        await this.playCelestialStrikeBarrage(startEl, endEl, count, scale, damage, {
            itemBuilder: buildEnergyBlock,
            buildFrame: buildRadiantSky,
            color: '#e8e2c0',
            direction: 'sky',
            bigRatio: 0.14,
            mediumRatio: 0.35,
            fallDuration: 420,
            strikeIntervalMs: 90,
            sfxType: 'normal',
        });
    },












    
    // ══════════════════════════════════════════════
    // FALLBACK CHUNG — dùng cho MỌI hệ CHƯA có chiêu riêng.
    // Khi viết chiêu thật cho 1 hệ, chỉ cần thêm spawn<Hệ> +
    // skillMeta[<hệ>] tương ứng, không cần sửa gì ở play()/
    // triggerMultiEffect (tự động dùng spawn<Hệ> nếu tồn tại).
    // ══════════════════════════════════════════════
    async spawnDefault(startEl, endEl, count, scale) {
        const cfg = this.durationConfig.aoe;

        this.playChargeSfx('normal');
        await new Promise(r => setTimeout(r, cfg.chargeAura * 0.4));

        this.playTravelSfx('normal');
        for (let i = 0; i < count; i++) {
            this.createProjectile(startEl, endEl, '#ddd', i, scale);
            await new Promise(r => setTimeout(r, cfg.delayBetween));
        }
        await new Promise(r => setTimeout(r, cfg.projectileFly * 0.3));
    },

    createProjectile(startEl, endEl, color, offset, sizeScale) {
        const cfg = this.durationConfig.aoe;
        const rectS = startEl.getBoundingClientRect(), rectE = endEl.getBoundingClientRect();
        const p = document.createElement('div');
        p.style.cssText = `
            position:fixed; left:${rectS.left + rectS.width / 2}px; top:${rectS.top + rectS.height / 2}px;
            width:${8 * sizeScale}px; height:${25 * sizeScale}px; background:${color};
            box-shadow:0 0 10px ${color}; border-radius:50%; z-index:9999;
            transform:rotate(${this.calcAngle(rectS, rectE)}deg);
            transition:all ${cfg.projectileFly}ms ease-in;
        `;
        document.body.appendChild(p);
        requestAnimationFrame(() => {
            p.style.left = (rectE.left + rectE.width / 2) + 'px';
            p.style.top = (rectE.top + rectE.height / 2) + 'px';
        });
        setTimeout(() => p.remove(), cfg.projectileFly);
    },

    // ── TEXT / HELPER DÙNG CHUNG ──
    showStatusText(targetEl, text, color, dramatic = false) {
        const rect = targetEl.getBoundingClientRect();
        const div = document.createElement('div');
        div.innerText = text;
        const fontSize = dramatic ? 30 : 20;
        div.style.cssText = `
            position:fixed; left:${rect.left + rect.width / 2}px; top:${rect.top}px;
            color:${color}; font-weight:900; font-size:${fontSize}px;
            text-shadow:2px 2px 0px #000; z-index:10000; pointer-events:none;
            animation:damageFloat ${this.durationConfig.aoe.statusText}ms ease-out forwards;
            transform:translateX(-50%) scale(${dramatic ? 1.15 : 1});
        `;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), this.durationConfig.aoe.statusText);
    },

    // ── BẢNG MÀU LƯỠI LỬA THEO HỆ — dùng chung 1 kiểu chuyển động, chỉ đổi màu ──
    flameLickColors: {
        fire:     { core:'#fff8dc', mid:'#ff8c1a', edge:'#c0392b' },
        water:    { core:'#eafaff', mid:'#4fc3f7', edge:'#1565c0' },
        electric: { core:'#ffffff', mid:'#ffe066', edge:'#f39c12' },
        grass:    { core:'#eaffea', mid:'#66bb6a', edge:'#1b5e20' },
        ice:      { core:'#ffffff', mid:'#b3e5fc', edge:'#4a90c2' },
        fighting: { core:'#fff3e0', mid:'#ff7043', edge:'#8e2b0f' },
        poison:   { core:'#f3e5f5', mid:'#ab47bc', edge:'#4a148c' },
        ground:   { core:'#fff3e0', mid:'#c19a5b', edge:'#6d4c22' },
        flying:   { core:'#f5f5ff', mid:'#b39ddb', edge:'#5e35b1' },
        psychic:  { core:'#ffe6f0', mid:'#f06292', edge:'#880e4f' },
        bug:      { core:'#f1f8e9', mid:'#c0d94a', edge:'#556b0f' },
        rock:     { core:'#efebe9', mid:'#b8a038', edge:'#5d4a1a' },
        ghost:    { core:'#ece6ff', mid:'#8a6fd8', edge:'#33206b' },
        dragon:   { core:'#ede7f6', mid:'#7038f8', edge:'#33206b' },
        steel:    { core:'#ffffff', mid:'#b0bec5', edge:'#5c6b73' },
        dark:     { core:'#5c5c5c', mid:'#2d2d2d', edge:'#000000' },
        fairy:    { core:'#ffffff', mid:'#f48fb1', edge:'#ad1457' },
        normal:   { core:'#ffffff', mid:'#d6d6c2', edge:'#8a8a72' },
    },

    // Gắn N "lưỡi lửa" độc lập lên Pokémon bị trúng đòn — mỗi lưỡi có
    // kích thước / vị trí / nhịp cháy RIÊNG (không dùng chung 1 layer),
    // tạo đúng cảm giác "chỗ to chỗ nhỏ, chỗ thưa chỗ dày, lệch nhịp"
    // như ảnh tham khảo, thay vì 1 khối gradient đồng nhất.
    attachSustainFlames(targetEl, type) {
        if (!targetEl) return;
        this.removeSustainFlames(targetEl); // dọn lượt cũ nếu còn sót, phòng hờ

        const cfg = this.flameLickColors[type] || this.flameLickColors.normal;
        const container = document.createElement('div');
        container.className = 'pkm-flame-container';
        container.style.cssText = `
            position: absolute; left: 0; top: 0; width: 100%; height: 100%;
            pointer-events: none; z-index: 3; overflow: visible;
        `;
        targetEl.appendChild(container);
        targetEl._flameContainer = container;

        const lickCount = 7 + Math.floor(Math.random() * 3); // 7-9 lưỡi lửa mỗi lần

        for (let i = 0; i < lickCount; i++) {
            const lick = document.createElement('div');

            // Vị trí rải NGẪU NHIÊN — từ ngang thân giữa tới trồi lên khỏi đầu
            const leftPct   = 18 + Math.random() * 64;    // 18%-82% chiều ngang, không đối xứng đều
            const bottomPx  = 18 + Math.random() * 118;    // 18px (ngang thân) -> 136px (khoảng không trên đầu)
            const w         = 10 + Math.random() * 26;     // 10-36px — to nhỏ khác nhau rõ rệt
            const h         = w * (1.3 + Math.random() * 0.6);
            const baseOpacity = 0.5 + Math.random() * 0.45; // có lưỡi đậm, có lưỡi mờ — "chỗ có chỗ không"

            lick.style.cssText = `
                position: absolute; left:${leftPct}%; bottom:${bottomPx}px;
                width:${w}px; height:${h}px;
                transform: translate(-50%, 0);
                transform-origin: center bottom;
                border-radius: ${40 + Math.random() * 20}% ${60 - Math.random() * 20}% ${55 + Math.random() * 15}% ${45 - Math.random() * 15}% / 60% 45% 55% 40%;
                filter: blur(${1 + Math.random() * 1.5}px);
                mix-blend-mode: screen;
                background: radial-gradient(circle at 50% 85%, ${cfg.core} 0%, ${cfg.mid} 45%, ${cfg.edge} 78%, transparent 92%);
                opacity: ${baseOpacity};
            `;
            container.appendChild(lick);

            // Mỗi lưỡi lửa có NHỊP/ĐỘ TRỄ/BIÊN ĐỘ RIÊNG — tạo lệch pha tự nhiên,
            // không nhấp nháy đồng loạt như 1 khối.
            const dur       = 500 + Math.random() * 500;
            const delay     = Math.random() * 400;
            const drift     = 2 + Math.random() * 4;
            const peakScale = 1.15 + Math.random() * 0.25;
            const skew      = 4 + Math.random() * 6;

            lick.animate([
                { transform: `translate(-50%,0) scale(1) skewX(0deg)`, opacity: baseOpacity },
                { transform: `translate(calc(-50% + ${drift}px), -2px) scale(${peakScale}) skewX(-${skew}deg)`, opacity: Math.min(1, baseOpacity + 0.25) },
                { transform: `translate(calc(-50% - ${drift}px), 1px) scale(${0.88})`, opacity: baseOpacity * 0.85 },
                { transform: `translate(-50%,0) scale(1) skewX(0deg)`, opacity: baseOpacity }
            ], { duration: dur, delay, iterations: Infinity, easing: 'ease-in-out' });
        }
    },

    // Gỡ toàn bộ lưỡi lửa khi hết thời gian sustain
    removeSustainFlames(targetEl) {
        if (!targetEl) return;
        if (targetEl._flameContainer) {
            targetEl._flameContainer.remove();
            targetEl._flameContainer = null;
        }
    },
    // Pool các câu "khen thưởng" hiển thị phía trên số damage — random mỗi lần trúng đòn
    damageComboPool: [
        'Critical hit!', 'Super Effective!', 'Massive Damage!',
        'Devastating!', 'Perfect Strike!', 'Brutal Hit!',
        'Colossal Damage!', 'Overwhelming!',
    ],

    createDamageText(targetEl, damage, dramatic = true) {
        const rect = targetEl.getBoundingClientRect();
        const displayDamage = (damage * 10).toLocaleString('en-US'); // hiển thị x10 cho hoành tráng (chỉ thị giác, không đổi số máu thật)
        const comboText = this.damageComboPool[Math.floor(Math.random() * this.damageComboPool.length)];

        const wrap = document.createElement('div');
        wrap.style.cssText = `
            position: fixed; left:${rect.left + rect.width / 2}px; top:${rect.top - 10}px;
            transform: translate(-50%,-50%) scale(0.2);
            z-index: 10005; pointer-events: none;
            display: flex; flex-direction: column; align-items: center;
            opacity: 0;
        `;

        // Dòng chữ combo — MÀU VÀNG, viền đen MỎNG, nghiêng nhẹ giống ảnh mẫu
        const combo = document.createElement('div');
        combo.innerText = comboText;
        combo.style.cssText = `
            font-size: 16px; font-weight: 900; font-style: italic;
            color: #ffd400; -webkit-text-stroke: 1px #000;
            text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
            transform: rotate(-6deg);
            white-space: nowrap; margin-bottom: -2px;
        `;
        wrap.appendChild(combo);

        // Dòng số damage to đùng — TRẮNG DÀY (font-weight tối đa), viền đen MỎNG
        const numEl = document.createElement('div');
        numEl.innerText = displayDamage;
        numEl.style.cssText = `
            font-size: 36px; font-weight: 900; font-family: 'Arial Black', Arial, sans-serif;
            color: #fff; -webkit-text-stroke: 1.5px #000;
            text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000,
                         2px 2px 4px rgba(0,0,0,0.4);
            white-space: nowrap; line-height: 1;
        `;
        wrap.appendChild(numEl);

        document.body.appendChild(wrap);

        // Hiệu ứng "NỔ TO LÊN": phóng to vượt mức rồi lắng lại, giữ 1 nhịp, rồi bay lên mờ dần
        const holdMs = this.durationConfig.aoe.statusText + 400;
        wrap.animate([
            { transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0,  offset: 0 },
            { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 1, offset: 0.35 },
            { transform: 'translate(-50%,-50%) scale(1)',    opacity: 1, offset: 0.55 },
            { transform: 'translate(-50%,-58%) scale(1)',    opacity: 1, offset: 0.8 },
            { transform: 'translate(-50%,-70%) scale(0.9)',  opacity: 0, offset: 1 }
        ], { duration: holdMs, easing: 'ease-out' });

        setTimeout(() => wrap.remove(), holdMs + 50);
    },

    calcAngle(s, e) {
        return Math.atan2(e.top - s.top, e.left - s.left) * 180 / Math.PI + 90;
    },
};