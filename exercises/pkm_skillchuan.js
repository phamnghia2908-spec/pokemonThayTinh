// Tự động nạp CSS cho Skill
(function() {
    const cssPath = 'pkm_skill.css';
    if (!document.querySelector(`link[href="${cssPath}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = cssPath;
        document.head.appendChild(link);
    }
})();

window.SkillManager = {
    // --- CẤU HÌNH ÂM THANH MỚI ---
    audioBaseUrl: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/s%20(",
    // Đếm số lượt skill đang chạy đồng thời (để xử lý 2 bên cùng đánh)
    _activeSceneCount: 0,
    _activeAttackers: new Set(),
    // Mỗi bên có 1 background-instance riêng để 2 nền có thể chạy chồng lên nhau
    _bgInstances: {
        player: null,
        enemy:  null,
    },// Lưu các unit đang là attacker trong lượt hiện tại
    skillPools: {},

    // Xem (và tạo nếu cần) danh sách chiêu còn lại của hệ này trong vòng hiện tại — KHÔNG rút ra
    peekSkillPool(baseMethodName) {
        if (!this.skillPools[baseMethodName] || this.skillPools[baseMethodName].length === 0) {
            const candidates = [
                baseMethodName,
                `${baseMethodName}2`,
                `${baseMethodName}3`
            ].filter(name => typeof this[name] === 'function');

            for (let i = candidates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }
            this.skillPools[baseMethodName] = candidates;
        }
        return this.skillPools[baseMethodName];
    },

    // Rút 1 chiêu cụ thể khỏi pool (dùng sau khi đã biết chiêu nào được chọn)
    consumeSkillFromPool(baseMethodName, methodName) {
        const pool = this.skillPools[baseMethodName];
        if (!pool) return;
        const idx = pool.indexOf(methodName);
        if (idx !== -1) pool.splice(idx, 1);
    },

    // Giữ hàm cũ để tương thích (AI địch dùng auto-random)
    getNextSkillMethod(baseMethodName) {
        const pool = this.peekSkillPool(baseMethodName);
        const methodName = pool[Math.floor(Math.random() * pool.length)];
        this.consumeSkillFromPool(baseMethodName, methodName);
        return methodName;
    },

    // Điều phối: người chơi được chọn skill trong 3s, AI địch tự chọn ngay
    async chooseSkillInteractive(attacker, type, baseMethodName, isPlayerControlled) {
        const pool = this.peekSkillPool(baseMethodName).slice();

        // Chỉ còn 1 chiêu duy nhất -> không cần hỏi, dùng luôn
        if (pool.length === 1) {
            const methodName = pool[0];
            this.consumeSkillFromPool(baseMethodName, methodName);
            await this.playSkillSelectAura(attacker, type, methodName, baseMethodName, pool, false);
            return methodName;
        }

        const interactive = !!isPlayerControlled;
        const chosen = await this.playSkillSelectAura(attacker, type, null, baseMethodName, pool, interactive);
        this.consumeSkillFromPool(baseMethodName, chosen);
        return chosen;
    },

    // Hàm đọc tên Pokemon
    speakName(name) {
        if (!window.speechSynthesis || !name) return;
        window.speechSynthesis.cancel(); // Ngắt tiếng cũ nếu đang đọc dở
        const msg = new SpeechSynthesisUtterance(name);
        msg.lang = 'en-US';
        msg.rate = 1.0;
        window.speechSynthesis.speak(msg);
    },

    // Hàm phát âm thanh ngẫu nhiên từ s (1).wav đến s (7).wav
    playRandomSfx() {
        const randomNum = Math.floor(Math.random() * 7) + 1; // Ngẫu nhiên từ 1-7
        const audioUrl = `${this.audioBaseUrl}${randomNum}).wav`;
        const audio = new Audio(audioUrl);
        audio.volume = 0.6;
        audio.play().catch(e => console.warn("Audio play blocked hoặc lỗi link"));
    },
    // Hàm rung màn hình hệ thống - Tỷ lệ theo Gen (sizeScale)
    applyGlobalShake(scale) {
        // Gen 1 (scale 1) rung 4px, Gen 4 (scale 2.5) rung 10px
        const intensity = 2 * scale; 
        const duration = 500; 

        document.body.animate([
            { transform: `translate(${intensity}px, ${intensity}px)` },
            { transform: `translate(-${intensity}px, -${intensity * 2}px)` },
            { transform: `translate(-${intensity * 2}px, 0px)` },
            { transform: `translate(${intensity * 2}px, ${intensity}px)` },
            { transform: `translate(0px, 0px)` }
        ], { 
            duration: 100, 
            iterations: duration / 100 
        });
    },

    durationConfig: {
        chargeAura: 900,        // tăng từ 600
        projectileFly: 3000,    // tăng từ 2000 - đạn bay chậm hơn
        targetSustain: 4000,    // tăng từ 3000 - giữ hiệu ứng lâu hơn
        skillChoiceWindow: 3000, // MỚI: 3s cho người chơi chọn skill
        delayBetween: 300,
        particleLife: 1000,
        electricBolt: 300,
        shake: 800,
        statusText: 1600,
        sceneTransition: 1200 
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
        'steel': { color: '#b8b8d0' },    // Hệ Thép (Màu bạc ánh kim)
        'dragon': { color: '#7038f8' },   // Hệ Rồng (Màu lam tím đậm)
        'fairy': { color: '#ee99ac' },    // Hệ Tiên (Màu hồng phấn)
    },
    toggleSkillScene(show, side = '', attackerIndex = null, type = 'normal') {
        const arena = document.getElementById('battle-arena');

        if (show) {
            this._activeSceneCount++;
            this._activeAttackers.add(`${side}-unit-${attackerIndex}`);

            // Ẩn nền arena
            if (arena) arena.style.setProperty('background-image', 'none', 'important');

            // Teleport TẤT CẢ Pokemon còn sống ra body, không ẩn ai cả
            document.querySelectorAll('.pkm-unit').forEach(u => {
                if (u.dataset.dead === '1') return;
                if (u._teleportData) return;

                const rect = u.getBoundingClientRect();

                u._teleportData = {
                    parent:      u.parentNode,
                    nextSibling: u.nextSibling,
                    origStyle:   u.getAttribute('style') || ''
                };

                u.style.cssText = `
                    position: fixed !important;
                    left: ${rect.left + rect.width  / 2}px !important;
                    top:  ${rect.top  + rect.height / 2}px !important;
                    width:  ${rect.width}px  !important;
                    height: ${rect.height}px !important;
                    transform: translate(-50%, -50%) !important;
                    z-index: 200 !important;
                    opacity: 1 !important;
                    visibility: visible !important;
                    margin: 0 !important;
                    pointer-events: none;
                `;

                document.body.appendChild(u);
            });

            // Mỗi bên (player/enemy) có overlay + instance nền RIÊNG để 2 nền chồng lên nhau được
            let sideOverlay = document.getElementById(`skill-scene-overlay-${side}`);
            if (!sideOverlay) {
                sideOverlay = document.createElement('div');
                sideOverlay.id = `skill-scene-overlay-${side}`;
                document.body.appendChild(sideOverlay);
            }
            const arenaRectForOverlay = arena
                ? arena.getBoundingClientRect()
                : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            sideOverlay.style.cssText = `
                position: fixed;
                top: ${arenaRectForOverlay.top}px; left: ${arenaRectForOverlay.left}px;
                width: ${arenaRectForOverlay.width}px; height: ${arenaRectForOverlay.height}px;
                overflow: hidden;
                z-index: 50;
                pointer-events: none;
                display: block;
                opacity: 1;
            `;

            if (!this._bgInstances[side] && window.PkmSkillBack) {
                this._bgInstances[side] = window.PkmSkillBack.createInstance();
            }

            const attackerEl = document.getElementById(`${side}-unit-${attackerIndex}`);
            const posX = attackerEl?.getAttribute('data-left') || '50';
            const posY = attackerEl?.getAttribute('data-top')  || '50';
            if (this._bgInstances[side]) {
                this._bgInstances[side].show(sideOverlay, type, posX, posY);
            }

        } else {
            // Tắt riêng nền của bên này ngay (không phải đợi bên kia)
            const sideOverlay = document.getElementById(`skill-scene-overlay-${side}`);
            if (sideOverlay && this._bgInstances[side]) {
                this._bgInstances[side].hide(sideOverlay);
                sideOverlay.style.opacity = '0';
                setTimeout(() => { sideOverlay.style.display = 'none'; }, 500);
            }

            this._activeSceneCount = Math.max(0, this._activeSceneCount - 1);

            // Còn bên kia đang chạy → chưa restore DOM Pokemon, chưa trả lại nền arena
            if (this._activeSceneCount > 0) {
                return;
            }

            this._activeAttackers.clear();

            // Trả lại nền arena
            if (arena && window.ArenaBgUrl) {
                arena.style.setProperty('background-image', `url('${window.ArenaBgUrl}')`, 'important');
            }

            // Restore tất cả Pokemon còn sống về vị trí DOM gốc
            document.querySelectorAll('.pkm-unit').forEach(u => {
                if (u._teleportData) {
                    const { parent, nextSibling, origStyle } = u._teleportData;
                    if (nextSibling) {
                        parent.insertBefore(u, nextSibling);
                    } else {
                        parent.appendChild(u);
                    }
                    u.setAttribute('style', origStyle);
                    delete u._teleportData;

                    if (u.dataset.dead === '1') {
                        u.style.opacity    = '0';
                        u.style.visibility = 'hidden';
                        u.style.pointerEvents = 'none';
                    } else {
                        u.style.opacity    = '1';
                        u.style.visibility = 'visible';
                        u.style.zIndex     = '';
                        if (!u.style.transform || u.style.transform === 'none') {
                            u.style.transform = 'translate(-50%,-50%)';
                        }
                    }
                } else if (u.dataset.dead !== '1') {
                    u.style.opacity    = '1';
                    u.style.visibility = 'visible';
                    u.style.zIndex     = '';
                }
            });
        }
    },
    async playSkillSelectAura(attackerEl, type, chosenMethod, baseMethodName, pool, interactive) {
        const methods   = (pool && pool.length > 0) ? pool : [baseMethodName];
        const count     = methods.length;
        const rectA     = attackerEl.getBoundingClientRect();
        const cx        = rectA.left + rectA.width  / 2;
        const cy        = rectA.top  + rectA.height / 2;
        const orbR      = rectA.width * 1.6;
        const orbSize   = rectA.width * 0.85;
        const typeColor = (this.systemConfig[type] || {}).color || '#ffcb05';
        const SCALE     = 0.66;
        const LOOP_MS   = 500;

        let resolveChoice;
        const choicePromise = new Promise(res => { resolveChoice = res; });

        const items = methods.map((name, i) => {
            const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
            const x = cx + Math.cos(angle) * orbR;
            const y = cy + Math.sin(angle) * orbR;

            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed;
                left: ${x}px; top: ${y}px;
                width: ${orbSize}px; height: ${orbSize}px;
                border-radius: 50%;
                overflow: hidden;
                pointer-events: ${interactive ? 'auto' : 'none'};
                cursor: ${interactive ? 'pointer' : 'default'};
                z-index: 10009;
                transform: translate(-50%, -50%) scale(0);
                transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease-out;
                box-shadow: 0 0 16px ${typeColor}, 0 0 32px ${typeColor}55;
                border: ${interactive ? '3px solid rgba(255,255,255,0.85)' : 'none'};
                background: radial-gradient(circle, rgba(0,0,0,0.55) 0%, transparent 80%);
            `;
            document.body.appendChild(container);

            const fakeEl = document.createElement('div');
            fakeEl.style.cssText = `
                position: fixed;
                left: ${x}px; top: ${y}px;
                width: ${orbSize}px; height: ${orbSize}px;
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: -1;
            `;
            document.body.appendChild(fakeEl);

            const item = { container, fakeEl, method: name, angle, stopped: false, loopTimer: null };

            if (interactive) {
                container.addEventListener('click', () => {
                    if (item.stopped) return;
                    resolveChoice(name);
                });
            }
            return item;
        });

        // Đếm ngược hiển thị khi tới lượt người chơi chọn
        let countdownEl = null;
        if (interactive) {
            countdownEl = document.createElement('div');
            countdownEl.style.cssText = `
                position: fixed;
                left: ${cx}px; top: ${cy - orbR - 40}px;
                transform: translate(-50%, -50%);
                color: #fff; font-weight: 900; font-size: 20px;
                text-shadow: 2px 2px 4px #000;
                z-index: 10010; pointer-events: none; white-space: nowrap;
            `;
            document.body.appendChild(countdownEl);
        }

        requestAnimationFrame(() => {
            items.forEach(it => { it.container.style.transform = 'translate(-50%, -50%) scale(1)'; });
        });
        await new Promise(r => setTimeout(r, 320));

        const patchForItem = (item) => {
            const origAppend = document.body.appendChild.bind(document.body);
            document.body.appendChild = (el) => {
                if (item.stopped) { document.body.appendChild = origAppend; return origAppend(el); }
                if (el && el.style && el.style.position === 'fixed') {
                    const elLeft = parseFloat(el.style.left) || 0;
                    const elTop  = parseFloat(el.style.top)  || 0;
                    const cRect  = item.container.getBoundingClientRect();
                    el.style.position = 'absolute';
                    el.style.left     = `${elLeft - cRect.left}px`;
                    el.style.top      = `${elTop  - cRect.top}px`;
                    item.container.appendChild(el);
                    return el;
                }
                return origAppend(el);
            };
        };

        const runLoop = (item) => {
            const fn = () => {
                if (item.stopped) return;
                patchForItem(item);
                const spawnFn = this[item.method];
                if (typeof spawnFn === 'function') {
                    spawnFn.call(this, item.fakeEl, item.fakeEl, 1, SCALE, {});
                }
                setTimeout(() => {
                    document.body.appendChild = document.body.appendChild.__orig__ 
                        || document.body.appendChild;
                }, 100);
                item.loopTimer = setTimeout(fn, LOOP_MS);
            };
            fn();
        };

        // PHASE 1: xoay + (nếu interactive) chờ bấm chọn hoặc hết giờ
        const phase1Dur = interactive ? this.durationConfig.skillChoiceWindow : 1200;
        const t0        = performance.now();
        items.forEach(item => runLoop(item));

        const spinPromise = new Promise(resolve => {
            const tick = () => {
                const elapsed = performance.now() - t0;
                const offset  = (elapsed / phase1Dur) * Math.PI * 0.5;
                items.forEach(item => {
                    const a  = item.angle + offset;
                    const x  = cx + Math.cos(a) * orbR;
                    const y  = cy + Math.sin(a) * orbR;
                    item.container.style.left = `${x}px`;
                    item.container.style.top  = `${y}px`;
                    item.fakeEl.style.left    = `${x}px`;
                    item.fakeEl.style.top     = `${y}px`;
                });
                if (countdownEl) {
                    const remain = Math.max(0, Math.ceil((phase1Dur - elapsed) / 1000));
                    countdownEl.innerText = `⏱ ${remain}s — Chọn chiêu!`;
                }
                if (elapsed < phase1Dur) requestAnimationFrame(tick);
                else resolve();
            };
            requestAnimationFrame(tick);
        });

        let finalChoice;
        if (interactive) {
            finalChoice = await Promise.race([choicePromise, spinPromise.then(() => null)]);
            if (!finalChoice) {
                finalChoice = methods[Math.floor(Math.random() * methods.length)];
            }
            if (countdownEl) countdownEl.remove();
        } else {
            await spinPromise;
            finalChoice = chosenMethod || methods[Math.floor(Math.random() * methods.length)];
        }

        // PHASE 2a: loại các orb không được chọn
        items.forEach(item => {
            if (item.method !== finalChoice) {
                item.stopped = true;
                clearTimeout(item.loopTimer);
                item.container.style.transform = 'translate(-50%, -50%) scale(0)';
                item.container.style.opacity   = '0';
                setTimeout(() => { item.container.remove(); item.fakeEl.remove(); }, 250);
            }
        });

        const chosen = items.find(i => i.method === finalChoice);
        if (!chosen) { items.forEach(i => { i.container.remove(); i.fakeEl.remove(); }); return finalChoice; }

        chosen.container.style.pointerEvents = 'none';
        chosen.container.style.boxShadow = `0 0 28px ${typeColor}, 0 0 56px ${typeColor}, 0 0 84px ${typeColor}66`;
        chosen.container.style.border    = 'none';

        // PHASE 2b: xoay nhanh rồi nổ ra chiêu
        const angleAtEnd = Math.PI * 1.5;
        const phase2Dur  = 700;
        const t1         = performance.now();

        await new Promise(resolve => {
            const tick = () => {
                const elapsed = performance.now() - t1;
                const a = chosen.angle + angleAtEnd + (elapsed / phase2Dur) * Math.PI * 4;
                const x = cx + Math.cos(a) * orbR;
                const y = cy + Math.sin(a) * orbR;
                chosen.container.style.left = `${x}px`;
                chosen.container.style.top  = `${y}px`;
                chosen.fakeEl.style.left    = `${x}px`;
                chosen.fakeEl.style.top     = `${y}px`;
                if (elapsed < phase2Dur) requestAnimationFrame(tick);
                else resolve();
            };
            requestAnimationFrame(tick);
        });

        chosen.stopped = true;
        clearTimeout(chosen.loopTimer);
        chosen.container.style.transition = 'transform 0.15s ease-out, opacity 0.15s';
        chosen.container.style.transform  = 'translate(-50%, -50%) scale(2.5)';
        chosen.container.style.opacity    = '0';
        await new Promise(r => setTimeout(r, 160));
        chosen.container.remove();
        chosen.fakeEl.remove();

        return finalChoice;
    },

    async play(info) {
        const aliveEnemies = info.targets || [];
        const attackerSide = info.attackerSide;
        const attackerIndex = info.attackerIndex;
        const attacker = document.getElementById(`${attackerSide}-unit-${attackerIndex}`);

        // --- 1. XỬ LÝ ĐÁNH HỤT (Né đòn & Hiện chữ - Im lặng) ---
        if (info.missed) {
            return new Promise(async resolve => {
                const targetSide = info.targetSide;
                const targetIdx = aliveEnemies[0];
                const targetEl = document.getElementById(`${targetSide}-unit-${targetIdx}`);

                if (attacker) {
                    attacker.style.transition = "all 0.2s ease-in";
                    const moveY = attackerSide === 'player' ? -30 : 30;
                    const aScale = attacker.dataset.scale || 1;
                    const aFlip  = attacker.dataset.flip  || 1;
                    attacker.style.transform = `translate(-50%,-50%) translateY(${moveY}px) scale(${aScale}) scaleX(${aFlip})`;
                }
                if (targetEl) {
                    targetEl.style.transition = "all 0.15s ease-out";
                    const dodgeX = targetSide === 'enemy' ? 30 : -30;
                    targetEl.style.transform = `translateX(${dodgeX}px)`;
                }

                await new Promise(r => setTimeout(r, 200));
                // Hiện chữ HỤT! theo style sếp chọn
                if (targetEl) this.showStatusText(targetEl, 'HỤT!', '#feca57');

                await new Promise(r => setTimeout(r, 300));
                if (attacker) {
                    const aScale = attacker.dataset.scale || 1;
                    const aFlip  = attacker.dataset.flip  || 1;
                    attacker.style.transform = 'translate(-50%,-50%)';
                }
                if (targetEl) {
                    const tScale = targetEl.dataset.scale || 1;
                    const tFlip  = targetEl.dataset.flip  || 1;
                    targetEl.style.transform = 'translate(-50%,-50%)';
                }

                setTimeout(resolve, 300);
            });
        }

        return new Promise(async (resolve) => {
            // Bật nền tối kỹ năng
            // Bật nền Arena 3D chỉ khi là skill thật sự
            if (info.isSkill && !info.skipScene) {
                this.toggleSkillScene(true, attackerSide, attackerIndex, info.type);
            }

            // Đẩy các mục tiêu lên z-index cao để nổi trên nền đen
            aliveEnemies.forEach(idx => {
                const targetEl = document.getElementById(`${info.targetSide}-unit-${idx}`);
                if (targetEl) targetEl.style.zIndex = '10000';
            });

            // --- 2. XỬ LÝ ĐÁNH THƯỜNG (Lao vào húc - Im lặng) ---
                // --- 2. XỬ LÝ ĐÁNH THƯỜNG (3 kiểu random) ---
                if (!info.isSkill) {
                    const targetIdx = aliveEnemies[0];
                    const target = document.getElementById(`${info.targetSide}-unit-${targetIdx}`);
                    const normalStyle = Math.floor(Math.random() * 3); // 0, 1, 2

                    if (attacker && target) {
                        const rectA = attacker.getBoundingClientRect();
                        const rectT = target.getBoundingClientRect();
                        const dx = rectT.left - rectA.left;
                        const dy = rectT.top  - rectA.top;
                        const dist = info.targetSide === 'enemy' ? 50 : -50;

                        if (normalStyle === 0) {
                            // --- KIỂU 1: Lao húc thẳng vào (như cũ) ---
                            attacker.style.transition = "all 0.2s ease-in";
                            attacker.style.transform = `translate(calc(-50% + ${dx - dist}px), calc(-50% + ${dy}px))`;
                            await new Promise(r => setTimeout(r, 200));
                            this.createDamageText(target, info.damage);
                            target.classList.add('shake');
                            attacker.style.transform = 'translate(-50%,-50%)';
                            await new Promise(r => setTimeout(r, this.durationConfig.shake));
                            target.classList.remove('shake');

                        } else if (normalStyle === 1) {
                            // --- KIỂU 2: Tiến gần rồi đấm liên tục ---
                            attacker.style.transition = "all 0.25s ease-in";
                            attacker.style.transform = `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy * 0.6}px))`;
                            await new Promise(r => setTimeout(r, 250));

                            // Đấm 3 cái liên tiếp
                            for (let i = 0; i < 3; i++) {
                                attacker.style.transition = "all 0.08s ease-in";
                                attacker.style.transform = `translate(calc(-50% + ${dx * 0.6 + (dist > 0 ? 30 : -30)}px), calc(-50% + ${dy * 0.6}px))`;
                                await new Promise(r => setTimeout(r, 80));
                                attacker.style.transform = `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy * 0.6}px))`;
                                await new Promise(r => setTimeout(r, 80));
                                if (i === 0) this.createDamageText(target, Math.floor(info.damage * 0.4));
                                if (i === 1) this.createDamageText(target, Math.floor(info.damage * 0.3));
                                if (i === 2) this.createDamageText(target, Math.floor(info.damage * 0.3));
                                target.classList.add('shake');
                                await new Promise(r => setTimeout(r, 100));
                                target.classList.remove('shake');
                                if (this.playRandomSfx) this.playRandomSfx();
                            }

                            // Rút về
                            attacker.style.transition = "all 0.2s ease-out";
                            attacker.style.transform = 'translate(-50%,-50%)';
                            await new Promise(r => setTimeout(r, 200));

                        } else {
                            // --- KIỂU 3: Chạy vòng quanh đối thủ rồi tấn công ---
                            const r1 = dist * 1.5;
                            attacker.style.transition = "all 0.18s ease-in";

                            // Điểm 1: lướt sang một bên
                            attacker.style.transform = `translate(calc(-50% + ${dx + r1}px), calc(-50% + ${dy - 40}px))`;
                            await new Promise(r => setTimeout(r, 180));

                            // Điểm 2: vòng sang bên kia
                            attacker.style.transition = "all 0.18s linear";
                            attacker.style.transform = `translate(calc(-50% + ${dx - r1}px), calc(-50% + ${dy + 40}px))`;
                            await new Promise(r => setTimeout(r, 180));

                            // Điểm 3: đâm thẳng vào
                            attacker.style.transition = "all 0.12s ease-in";
                            attacker.style.transform = `translate(calc(-50% + ${dx - dist}px), calc(-50% + ${dy}px))`;
                            await new Promise(r => setTimeout(r, 120));

                            this.createDamageText(target, info.damage);
                            target.classList.add('shake');
                            if (this.playRandomSfx) this.playRandomSfx();

                            // Bật về
                            attacker.style.transition = "all 0.2s ease-out";
                            attacker.style.transform = 'translate(-50%,-50%)';
                            await new Promise(r => setTimeout(r, this.durationConfig.shake));
                            target.classList.remove('shake');
                        }
                    }
                } 
            // --- 3. XỬ LÝ SKILL (Có hiệu ứng & 1 tiếng SFX duy nhất) ---
            // --- 3. XỬ LÝ SKILL (Di chuyển ra điểm giữa sân rồi tung chiêu) ---
            // --- XỬ LÝ SKILL CHUẨN HÓA THEO NHỊP ĐỘ MỚI ---
            else {
                let countPerTarget = 1, sizeScale = 1;
                const pos = {
                    scale: parseFloat(attacker.dataset.scale) || 1,
                    flip:  parseFloat(attacker.dataset.flip)  || 1
                };
                // ====================================================================
                // ĐOẠN CODE ĐÃ ĐƯỢC ĐIỀU CHỈNH CHỈ SỐ BUFF ĐỜI 1 (Thay cho đoạn cũ)
                // ====================================================================
                switch(info.gen) {
                    case 1: 
                        countPerTarget = 4; // TĂNG TẦN SUẤT: Đời 1 giờ bắn hẳn 4 hạt/tia liên tục thay vì 1
                        sizeScale = 1.6;    // TĂNG ĐỘ TO: Kích thước skill Đời 1 to gấp 1.6 lần mặc định
                        break;          
                    case 2: 
                        countPerTarget = 5; // Tăng nhẹ Đời 2 để không bị Đời 1 đuổi kịp
                        sizeScale = 1.8; 
                        break;
                    case 3: 
                        countPerTarget = 6; 
                        sizeScale = 2.2; 
                        break;
                    case 'mega': 
                    case 4: 
                        countPerTarget = 10; 
                        sizeScale = 3.0; 
                        break;
                }
                // ====================================================================

                // 1. Pokémon di chuyển mượt mà ra giữa sân
                // --- THAY THẾ ĐOẠN ĐIỀU HƯỚNG VÀ DI CHUYỂN CŨ BẰNG ĐOẠN NÀY ---

                // 1. Lấy vị trí hiện tại của Pokémon để làm tâm gồng chiêu (Bỏ di chuyển ra giữa sân)
                const arena = document.getElementById('battle-arena');
                const rectArena = arena ? arena.getBoundingClientRect() : null;
                const rectA = attacker.getBoundingClientRect();

                // Tâm chiêu thức giờ sẽ xuất hiện ngay tại vị trí hiện tại của Pokémon đang đứng
                const stageCX = rectA.left + rectA.width / 2;
                const stageCY = rectA.top + rectA.height / 2;

                // TẮT CÁC DÒNG DI CHUYỂN RA GIỮA SÂN (Giữ nguyên vị trí ban đầu)
                /* const moveX = stageCX - (rectA.left + rectA.width  / 2);
                const moveY = stageCY - (rectA.top  + rectA.height / 2);
                attacker.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                attacker.style.transform  = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
                */

                // Giữ nguyên z-index cao để nổi bật khi gồng chiêu tại chỗ
                attacker.style.zIndex     = '10001'; 
                await new Promise(r => setTimeout(r, 100));
                const baseMethodName = `spawn${info.type.charAt(0).toUpperCase() + info.type.slice(1)}`;

                // 2. PHASE GỒNG CHIÊU
                const imgWrapper = attacker.querySelector('div');
                if (imgWrapper) {
                    imgWrapper.style.transition = `transform 0.3s ease-in`;
                    imgWrapper.style.transform  = `scale(${pos.scale * 0.85}) scaleX(${pos.flip})`;
                }

                // ✅ Người chơi được chọn chiêu trong 3s; AI địch tự chọn ngay
                const chosenMethod = await this.chooseSkillInteractive(
                    attacker, info.type, baseMethodName, attackerSide === 'player'
                );

                // Bung ra khi chiêu được chọn

                // Bung ra khi chiêu được chọn
                if (imgWrapper) {
                    imgWrapper.style.transition = `transform 0.2s cubic-bezier(0.34,1.56,0.64,1)`;
                    imgWrapper.style.transform  = `scale(${pos.scale * 1.2}) scaleX(${pos.flip})`;
                    await new Promise(r => setTimeout(r, 200));
                    imgWrapper.style.transform  = `scale(${pos.scale}) scaleX(${pos.flip})`;
                }

                // 3. TUNG CHIÊU + DI CHUYỂN ĐẾN ĐỊCH + ĐỊCH DÍNH CHƯỞNG
                if (this.playRandomSfx) this.playRandomSfx();
                const effectData = this.systemConfig[info.type] || this.systemConfig['normal'];

                

                // Kích hoạt chuỗi và ĐỢI cho đến khi toàn bộ mục tiêu hoàn thành xong hành trình dính đòn
                const allAnimations = aliveEnemies.map(targetIdx =>
                    this.triggerMultiEffect(attacker, targetIdx, info.targetSide, countPerTarget, effectData, sizeScale, info.type, info.damage, chosenMethod)
                );
                await Promise.all(allAnimations);

                // 4. THU QUÂN: Pokémon lướt về vị trí cũ trên map
                attacker.style.transition = 'transform 0.3s ease-out';
                attacker.style.transform  = 'translate(-50%,-50%)';
                await new Promise(r => setTimeout(r, 320));
                attacker.style.transition = '';
                attacker.style.zIndex     = '';
            }

            // Kết thúc: Ẩn nền đen và kết thúc lượt
            // Kết thúc: Ẩn nền Arena 3D và kết thúc lượt
            setTimeout(() => { 
                if (info.isSkill && !info.skipScene) this.toggleSkillScene(false, attackerSide); 
                resolve(); 
            }, this.durationConfig.sceneTransition);
        });
    },

    async triggerMultiEffect(attacker, targetIdx, targetSide, count, effectData, sizeScale, type, damage, methodName) {
        const target = document.getElementById(`${targetSide}-unit-${targetIdx}`);
        if (!target) return;

        // 1. Sinh tên hàm cơ sở (Ví dụ: 'spawnElectric', 'spawnFire')
        const baseMethodName = `spawn${type.charAt(0).toUpperCase() + type.slice(1)}`;

        // 2. Thuật toán Random chia đều tỷ lệ cho tối đa 3 chiêu (Không số, số 2, số 3)
        // 2. Dùng methodName đã được chọn sẵn từ bên ngoài (truyền vào qua tham số)
        // 3. Kiểm tra an toàn: Nếu chưa viết chiêu 2 hoặc 3, tự động fallback về chiêu 1
        let action = typeof this[methodName] === 'function' ? this[methodName] : this[baseMethodName];

        // Nếu ngay cả chiêu 1 hệ đó cũng chưa viết, dùng spawnDefault hệ thống
        if (typeof action !== 'function') {
            action = this.spawnDefault;
        }

        // ==========================================
        // GIAI ĐOẠN A: CHIÊU DI CHUYỂN ĐẾN ĐỊCH
        // ==========================================
        // Chạy hàm chiêu thức đã chọn (Hàm này sẽ chạy trong khoảng thời gian durationConfig.projectileFly)
        await action.call(this, attacker, target, count, sizeScale, effectData);

        // GIAI ĐOẠN B: VA CHẠM → KÍCH HOẠT HIỆU ỨNG CSS THEO HỆ
        // ==========================================
        this.applyGlobalShake(sizeScale);
        this.createDamageText(target, damage);

        // 1. CHUYỂN TỪ SHAKE SANG HIỆU ỨNG HỆ (CSS)
        // Thay vì chỉ add 'shake', ta thêm class hệ: 'sustain-electric', 'sustain-fire',...
        const sustainClass = `sustain-${type}`;
        target.classList.add('shake', sustainClass);

        // 2. GIỮ NGUYÊN THỜI GIAN ĐỢI THEO CONFIG
        await new Promise(r => setTimeout(r, this.durationConfig.targetSustain));

        // 3. XÓA BỎ CẢ HIỆU ỨNG CSS VÀ LẮC LƯ SAU KHI XONG
        target.classList.remove('shake', sustainClass);
    },


    

    // --- CÁC HÀM SPAWN GIỮ NGUYÊN NHƯ FILE CŨ CỦA BẠN ---
    async spawnElectric(startEl, endEl, count, scale) {
        const rectS = startEl.getBoundingClientRect();
        const rectE = endEl.getBoundingClientRect();

        const totalSpan  = this.durationConfig.projectileFly;
        const numBolts    = Math.max(6, count * 3); // NHIỀU tia hơn bản cũ
        const boltDuration = 150;

        const startX = rectS.left + rectS.width / 2;
        const startY = rectS.top + rectS.height / 2;
        const endX   = rectE.left + rectE.width / 2;
        const endY   = rectE.top + rectE.height / 2;

        const allBolts = [];

        // Tạo TOÀN BỘ tia sét NGAY (đồng bộ) — chỉ delay phần hiển thị
        for (let i = 0; i < numBolts; i++) {
            const delay = (i / numBolts) * totalSpan;
            let curX = startX, curY = startY;
            const segments = 12;

            for (let j = 1; j <= segments; j++) {
                const noise = (Math.random() - 0.5) * 60;
                const nextX = curX + (endX - curX) * (1 / (segments - j + 1)) + noise;
                const nextY = curY + (endY - curY) * (1 / (segments - j + 1)) + (Math.random() - 0.5) * 30;

                const dx = nextX - curX;
                const dy = nextY - curY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                const bolt = document.createElement('div');
                bolt.className = 'pkm-particle particle-electric';
                const boltHeight = (2 + Math.random() * 2) * scale;
                bolt.style.cssText = `
                    position: fixed; left: ${curX}px; top: ${curY}px;
                    width: ${dist}px; height: ${boltHeight}px;
                    background: rgba(255, 255, 255, 0.9);
                    transform: rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg);
                    transform-origin: 0 50%;
                    box-shadow: 0 0 ${4 * scale}px #fff, 0 0 ${8 * scale}px #f1c40f;
                    z-index: 9999; pointer-events: none;
                    opacity: 0;
                `;
                document.body.appendChild(bolt);
                allBolts.push(bolt);

                bolt.animate([
                    { opacity: 0 },
                    { opacity: 1, offset: 0.15 },
                    { opacity: 1, offset: 0.5 },
                    { opacity: 0 }
                ], { duration: boltDuration, delay, fill: 'forwards' });

                curX = nextX;
                curY = nextY;
            }
        }

        await new Promise((resolve) => {
            setTimeout(() => {
                allBolts.forEach((b) => b.remove());
                resolve();
            }, totalSpan + boltDuration);
        });
    },
    async spawnElectric2(startEl, endEl, count, scale) {
        const rectS = startEl.getBoundingClientRect();
        const rectE = endEl.getBoundingClientRect();

        const orb = document.createElement('div');
        orb.style.cssText = `
            position: fixed;
            left: ${rectS.left + rectS.width/2}px; top: ${rectS.top + rectS.height/2}px;
            width: ${20 * scale}px; height: ${20 * scale}px;
            background: #fff; border-radius: 50%;
            box-shadow: 0 0 10px #fff, 0 0 20px #f1c40f, 0 0 40px #f1c40f;
            z-index: 9999; pointer-events: none;
        `;
        document.body.appendChild(orb);

        await orb.animate([
            { transform: 'scale(1)', opacity: 1 },
            { transform: 'scale(2.5)', opacity: 0.8 },
            { transform: 'scale(0.8)', opacity: 1 }
        ], { duration: this.durationConfig.chargeAura, easing: 'ease-in-out' }).finished;

        orb.style.background = 'radial-gradient(circle, #fff 20%, #f1c40f 50%, #2980b9 100%)';
        orb.style.border = `2px solid #fff`;
        orb.style.width = `${40 * scale}px`;
        orb.style.height = `${40 * scale}px`;
        orb.style.boxShadow = `0 0 20px #f1c40f, inset 0 0 15px #fff`;

        for(let i=0; i<4; i++) {
            const spark = document.createElement('div');
            spark.style.cssText = `position: absolute; width: 4px; height: 10px; background: #fff; border-radius: 2px;`;
            orb.appendChild(spark);
        }

        await orb.animate([
            { left: `${rectS.left + rectS.width/2}px`, top: `${rectS.top + rectS.height/2}px` },
            { left: `${rectE.left + rectE.width/2}px`, top: `${rectE.top + rectE.height/2}px` }
        ], { duration: this.durationConfig.projectileFly, easing: 'linear' }).finished;

        orb.remove();

        // SỬA LỖI: Gọi trực tiếp qua window.SkillManager để đảm bảo scope
        if (typeof window.SkillManager !== 'undefined') {
            window.SkillManager.createElectricBurst(rectE.left + rectE.width/2, rectE.top + rectE.height/2, scale);
        } else {
            this.createElectricBurst(rectE.left + rectE.width/2, rectE.top + rectE.height/2, scale);
        }
    },

    createElectricBurst(x, y, scale) {
        for(let i=0; i<8; i++) {
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
    //skill lửa 3 bão điện
    async spawnElectric3(startEl, endEl, count, scale) {
        const rectE = endEl.getBoundingClientRect();
        const centerX = rectE.left + rectE.width / 2;
        const centerY = rectE.top + rectE.height / 2;
        const cloudY  = rectE.top - 50 * scale;

        const chargeMs  = this.durationConfig.chargeAura;
        const sustainMs = this.durationConfig.targetSustain;
        const totalMs   = chargeMs + sustainMs;

        const allEls = [];

        // 1. Mây (kích thước co theo scale để không tràn quá orb nhỏ khi ở màn chọn skill)
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
        `;
        document.body.appendChild(cloud);
        allEls.push(cloud);

        cloud.animate([
            { opacity: 0, transform: 'scale(0.5)' },
            { opacity: 0.9, transform: 'scale(1)' }
        ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' });

        // 2. Tia tĩnh điện lấm tấm quanh mây — tạo hết 1 lần, tự chớp tắt theo delay riêng
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
                opacity: 0;
            `;
            document.body.appendChild(spark);
            allEls.push(spark);
            spark.animate([
                { opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }
            ], { duration: 220, delay, fill: 'forwards' });
        }

        // 3. NHIỀU tia sét giáng xuống hơn — tạo hết ngay, rải delay đều trong lúc giữ chiêu
        const boltCount = Math.max(8, count * 4); // tăng đáng kể số tia so với bản cũ
        const strikeStart = chargeMs;
        const strikeSpan  = sustainMs;

        for (let i = 0; i < boltCount; i++) {
            const delay = strikeStart + (i / boltCount) * strikeSpan + Math.random() * 100;
            const x1 = centerX + (Math.random() - 0.5) * cloudW * 0.7;
            const y1 = cloudY;
            const x2 = centerX + (Math.random() - 0.5) * cloudW * 0.4;
            const y2 = centerY;
            this.createZigzagBoltDelayed(x1, y1, x2, y2, scale, delay, allEls);
        }

        await new Promise((r) => setTimeout(r, totalMs));
        allEls.forEach((el) => el.remove());
    },

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
    // Tạo 1 tia sét zigzag NGAY LẬP TỨC (đồng bộ), chỉ delay phần HIỂN THỊ bằng animate()
    // để tương thích với cơ chế "khoanh vùng orb" khi chọn skill.
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
                opacity: 0;
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

    // --- HỆ LỬA (FIRE) CÂN BẰNG THỜI GIAN ---
    // --- HỆ LỬA 1 - QUẢ CẦU LỬA (Fireball) ---
    // Timeline TUÂN THỦ durationConfig.projectileFly (toàn bộ thời gian bay + va chạm)
    async spawnFire(startEl, endEl, count, scale, data) {
        const rectS = startEl.getBoundingClientRect();
        const rectE = endEl.getBoundingClientRect();

        const totalMs = this.durationConfig.projectileFly; // ✅ lấy từ config, không hardcode
        const flightDuration = Math.min(600, totalMs * 0.45);
        const launchSpan = Math.max(0, totalMs - flightDuration);
        const interval = count > 1 ? launchSpan / count : 0;

        const allEls = [];

        for (let i = 0; i < count; i++) {
            const launchDelay = i * interval;
            const startX = rectS.left + rectS.width / 2;
            const startY = rectS.top + rectS.height / 2;
            const targetX = rectE.left + rectE.width / 2 + (Math.random() - 0.5) * 60;
            const targetY = rectE.top + rectE.height / 2 + (Math.random() - 0.5) * 60;

            // Quả cầu lửa — tạo NGAY, chỉ delay hiển thị/di chuyển
            const fireball = document.createElement('div');
            fireball.className = 'pkm-particle particle-fire';
            fireball.style.cssText = `
                position: fixed; left:${startX}px; top:${startY}px;
                width:${22 * scale}px; height:${22 * scale}px;
                background: radial-gradient(circle, #fff 10%, #ffdf00 40%, #e67e22 80%, #c0392b 100%);
                box-shadow: 0 0 ${15 * scale}px #e67e22, 0 0 ${30 * scale}px #f39c12;
                border-radius:50%; z-index:9999; pointer-events:none; opacity:0;
            `;
            document.body.appendChild(fireball);
            allEls.push(fireball);

            fireball.animate([
                { opacity: 0 },
                { opacity: 1, offset: 0.05 },
                { opacity: 1, offset: 0.9 },
                { opacity: 0 }
            ], { duration: flightDuration, delay: launchDelay, fill: 'forwards' });

            fireball.animate([
                { left: `${startX}px`, top: `${startY}px` },
                { left: `${targetX}px`, top: `${targetY}px` }
            ], { duration: flightDuration, delay: launchDelay, fill: 'forwards', easing: 'ease-in' });

            // Tia lửa vệt theo đường bay — tạo NGAY từ đầu, chỉ delay theo tỉ lệ đường bay
            const trailCount = 6;
            for (let s = 0; s < trailCount; s++) {
                const frac = s / trailCount;
                const sx = startX + (targetX - startX) * frac;
                const sy = startY + (targetY - startY) * frac;
                const spark = document.createElement('div');
                spark.style.cssText = `
                    position: fixed; left:${sx}px; top:${sy}px;
                    width:${6 * scale}px; height:${6 * scale}px; background:#ff4d00;
                    border-radius:50%; opacity:0; z-index:9998; pointer-events:none;
                `;
                document.body.appendChild(spark);
                allEls.push(spark);
                const sparkDelay = launchDelay + frac * flightDuration;
                spark.animate([
                    { opacity: 0.9, transform: 'translate(0,0)' },
                    { opacity: 0, transform: `translate(${(Math.random() - 0.5) * 30}px,25px)` }
                ], { duration: 350, delay: sparkDelay, fill: 'forwards', easing: 'ease-out' });
            }

            // Nổ va chạm — tạo NGAY, chỉ delay tới đúng thời điểm chạm đích
            const impactTime = launchDelay + flightDuration;
            const burstCount = 8;
            for (let b = 0; b < burstCount; b++) {
                const angle = (b / burstCount) * Math.PI * 2;
                const dist = (25 + Math.random() * 20) * scale;
                const size = (5 + Math.random() * 4) * scale;
                const shard = document.createElement('div');
                shard.style.cssText = `
                    position: fixed; left:${targetX}px; top:${targetY}px;
                    width:${size}px; height:${size}px;
                    background: radial-gradient(circle,#fff 20%, #ffb347 60%, #ff5500 100%);
                    border-radius:50%; box-shadow:0 0 ${8 * scale}px #ff8c00;
                    z-index:10000; pointer-events:none; opacity:0;
                `;
                document.body.appendChild(shard);
                allEls.push(shard);
                shard.animate([
                    { opacity: 0, transform: 'translate(-50%,-50%) scale(0.3)' },
                    { opacity: 1, transform: 'translate(-50%,-50%) scale(1.2)', offset: 0.2 },
                    { opacity: 0, transform: `translate(-50%,-50%) translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.3)` }
                ], { duration: 380, delay: impactTime, fill: 'forwards', easing: 'ease-out' });
            }

            // Âm thanh — chỉ setTimeout để phát SFX, KHÔNG tạo DOM nên không vi phạm quy tắc orb
            if (this.playRandomSfx) {
                setTimeout(() => this.playRandomSfx(), impactTime);
            }
        }

        await new Promise((resolve) => {
            setTimeout(() => {
                allEls.forEach((el) => el.remove());
                resolve();
            }, totalMs + 80);
        });
    },
    // --- HỆ LỬA 2 - ĐẠI HOẢ CHIÊU (Chữ 大 - ĐẠI - hình thành tại chỗ rồi bay lao vào địch) ---
    // Timeline TUÂN THỦ durationConfig: chargeAura = vẽ chữ + giữ sáng tại chỗ tấn công,
    // targetSustain = bay lao sang đối thủ -> va chạm nổ -> tàn lụi
    async spawnFire2(startEl, endEl, count, scale, data) {
        const rectS = startEl.getBoundingClientRect();
        const rectE = endEl.getBoundingClientRect();

        // Chữ hình thành NGAY TẠI VỊ TRÍ KẺ TẤN CÔNG
        const atkCx = rectS.left + rectS.width / 2;
        const atkCy = rectS.top + rectS.height / 2;

        // Đích bay tới: vị trí đối thủ
        const targetCx = rectE.left + rectE.width / 2;
        const targetCy = rectE.top + rectE.height / 2;
        const deltaX = targetCx - atkCx;
        const deltaY = targetCy - atkCy;

        const charSize = rectS.width * 1.4 * scale;
        const half = charSize / 2;

        if (this.playRandomSfx) this.playRandomSfx();

        // Toạ độ chuẩn hoá (0..1) cho 3 nét chữ 大 — thứ tự viết thư pháp: ngang trước, 2 nét chéo sau
        const strokes = [
            { from: [0.15, 0.38], to: [0.85, 0.38] }, // Nét 1: Nét ngang (一)
            { from: [0.50, 0.18], to: [0.12, 0.92] }, // Nét 2: Nét phẩy trái (丿)
            { from: [0.50, 0.18], to: [0.88, 0.92] }, // Nét 3: Nét mác phải (㇏)
        ];

        const toPx = ([nx, ny]) => [atkCx - half + nx * charSize, atkCy - half + ny * charSize];

        const pointsPerStroke = Math.max(10, 8 + count * 2);

        // ── TIMELINE (lấy trực tiếp từ durationConfig, không hardcode) ──
        const chargeMs  = this.durationConfig.chargeAura;    // vẽ chữ + giữ sáng
        const sustainMs = this.durationConfig.targetSustain; // bay -> va chạm -> tàn lụi

        const drawDuration   = chargeMs * 0.6;   // 60% thời gian gồng chiêu để vẽ nét
        const holdDuration   = chargeMs * 0.4;   // 40% còn lại giữ sáng nguyên hình chữ
        const travelDuration = sustainMs * 0.5;  // 50% sustain để bay lao sang đối thủ
        const impactDuration = sustainMs * 0.25; // 25% sustain cho khoảnh khắc va chạm/nổ
        // 25% sustain còn lại dùng làm khoảng đệm tàn lụi tự nhiên (không cần biến riêng)

        const flyStart   = drawDuration + holdDuration;
        const impactTime = flyStart + travelDuration;
        const totalMs    = chargeMs + sustainMs;

        const allEls = [];

        strokes.forEach((stroke, strokeIdx) => {
            const [x1, y1] = toPx(stroke.from);
            const [x2, y2] = toPx(stroke.to);

            const strokeStartDelay  = strokeIdx === 0 ? 0 : drawDuration * 0.35;
            const strokeOwnDuration = strokeIdx === 0 ? drawDuration * 0.55 : drawDuration * 0.65;

            for (let i = 0; i <= pointsPerStroke; i++) {
                const t = i / pointsPerStroke;
                const px = x1 + (x2 - x1) * t;
                const py = y1 + (y2 - y1) * t;
                const litAt = strokeStartDelay + t * strokeOwnDuration;

                // Mỗi hạt bay lệch nhẹ quanh đường thẳng để trông tự nhiên hơn khi lao tới
                const jitterX = (Math.random() - 0.5) * 14 * scale;
                const jitterY = (Math.random() - 0.5) * 14 * scale;

                const size = (10 + Math.random() * 8) * scale;
                const flame = document.createElement('div');
                flame.className = 'pkm-particle particle-fire';
                flame.style.cssText = `
                    position: fixed;
                    left: ${px}px; top: ${py}px;
                    width: ${size}px; height: ${size}px;
                    background: radial-gradient(circle, #fff 10%, #ffdf00 40%, #e67e22 80%, #c0392b 100%);
                    box-shadow: 0 0 ${12 * scale}px #e67e22, 0 0 ${22 * scale}px #f39c12;
                    border-radius: 50%;
                    transform: translate(-50%, -50%) scale(0);
                    z-index: 9999; pointer-events: none;
                    opacity: 0;
                `;
                document.body.appendChild(flame);
                allEls.push(flame);

                // Giai đoạn 1: hiện ra thành hình chữ (pop-in), giữ nguyên tới hết hold
                flame.animate([
                    { transform: 'translate(-50%,-50%) scale(0)',   opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.15 },
                    { transform: 'translate(-50%,-50%) scale(1)',   opacity: 1 }
                ], {
                    duration: Math.max(1, drawDuration - litAt),
                    delay: litAt,
                    fill: 'forwards',
                    easing: 'ease-out'
                });

                // Giai đoạn 2: cả cụm bay lao sang vị trí đối thủ
                flame.animate([
                    { left: `${px}px`, top: `${py}px` },
                    { left: `${px + deltaX + jitterX}px`, top: `${py + deltaY + jitterY}px` }
                ], {
                    duration: travelDuration,
                    delay: flyStart,
                    fill: 'forwards',
                    easing: 'ease-in'
                });

                // Giai đoạn 3: chớp sáng rồi tắt lúc va chạm
                flame.animate([
                    { opacity: 1, transform: 'translate(-50%,-50%) scale(1.4)' },
                    { opacity: 0, transform: 'translate(-50%,-50%) scale(0.4)' }
                ], {
                    duration: impactDuration,
                    delay: impactTime,
                    fill: 'forwards',
                    easing: 'ease-out'
                });

                // Tàn lửa nhỏ bay lên khi chữ đang hình thành gần kẻ tấn công
                if (i % 3 === 0) {
                    const ember = document.createElement('div');
                    const emberSize = (3 + Math.random() * 3) * scale;
                    ember.style.cssText = `
                        position: fixed; left: ${px}px; top: ${py}px;
                        width: ${emberSize}px; height: ${emberSize}px;
                        background: #ffcf5c; border-radius: 50%;
                        box-shadow: 0 0 6px #ff9500;
                        z-index: 9998; pointer-events: none; opacity: 0;
                    `;
                    document.body.appendChild(ember);
                    allEls.push(ember);

                    const riseDist = (20 + Math.random() * 25) * scale;
                    ember.animate([
                        { transform: 'translate(-50%,-50%) translateY(0px)',            opacity: 0.9 },
                        { transform: `translate(-50%,-50%) translateY(-${riseDist}px)`, opacity: 0 }
                    ], {
                        duration: 700,
                        delay: litAt + 150,
                        fill: 'forwards',
                        easing: 'ease-out'
                    });
                }
            }
        });

        // Quầng sáng phía sau chữ: hiện tại chỗ kẻ tấn công, rồi bay theo cùng cụm chữ
        const glowSize = charSize * 1.3;
        const glow = document.createElement('div');
        glow.style.cssText = `
            position: fixed; left: ${atkCx}px; top: ${atkCy}px;
            width: ${glowSize}px; height: ${glowSize}px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255,140,0,0.35) 0%, transparent 70%);
            transform: translate(-50%, -50%) scale(0.6);
            z-index: 9997; pointer-events: none; opacity: 0;
            filter: blur(${6 * scale}px);
        `;
        document.body.appendChild(glow);
        allEls.push(glow);

        glow.animate([
            { opacity: 0,   transform: 'translate(-50%,-50%) scale(0.6)' },
            { opacity: 0.9, transform: 'translate(-50%,-50%) scale(1.05)' }
        ], {
            duration: drawDuration,
            fill: 'forwards',
            easing: 'ease-out'
        });

        glow.animate([
            { left: `${atkCx}px`, top: `${atkCy}px` },
            { left: `${targetCx}px`, top: `${targetCy}px` }
        ], {
            duration: travelDuration,
            delay: flyStart,
            fill: 'forwards',
            easing: 'ease-in'
        });

        glow.animate([
            { opacity: 0.9, transform: 'translate(-50%,-50%) scale(1.05)' },
            { opacity: 0,   transform: 'translate(-50%,-50%) scale(1.8)' }
        ], {
            duration: impactDuration,
            delay: impactTime,
            fill: 'forwards',
            easing: 'ease-out'
        });

        // Bùng nổ khi va chạm đối thủ
        setTimeout(() => {
            this.createFireExplosion(targetCx, targetCy, scale);
        }, impactTime);

        await new Promise((resolve) => {
            setTimeout(() => {
                allEls.forEach((el) => el.remove());
                resolve();
            }, totalMs + 50);
        });
    },
    // --- HỆ LỬA 3 - BLAST BURN (Rực Lửa Hủy Diệt) ---
    // Dậm đất -> khe nứt lan sang đối thủ -> HOA LỬA bắn đầy trời -> nổ hủy diệt cuối cùng
    // Timeline TUÂN THỦ durationConfig: chargeAura = dậm đất/xung chấn,
    // targetSustain = nứt đất -> hoa lửa đầy trời -> nổ -> tàn lụi
    async spawnFire3(startEl, endEl, count, scale, data) {
        const rectS = startEl.getBoundingClientRect();
        const rectE = endEl.getBoundingClientRect();

        const atkCx = rectS.left + rectS.width / 2;
        const groundYAtk = rectS.top + rectS.height * 0.85;
        const tgtCx = rectE.left + rectE.width / 2;
        const groundYTgt = rectE.top + rectE.height * 0.85;
        const impactAngle = Math.atan2(groundYTgt - groundYAtk, tgtCx - atkCx) * 180 / Math.PI;

        if (this.playRandomSfx) this.playRandomSfx();

        // ── TIMELINE (lấy trực tiếp từ durationConfig, không hardcode) ──
        const chargeMs  = this.durationConfig.chargeAura;    // dậm đất + xung chấn
        const sustainMs = this.durationConfig.targetSustain; // nứt đất -> hoa lửa -> nổ -> tàn lụi

        const travelDuration     = sustainMs * 0.22; // khe nứt lan tới
        const fireworksDuration  = sustainMs * 0.55; // hoa lửa bắn đầy trời
        const explosionDuration  = sustainMs * 0.23; // vụ nổ cuối + tàn lụi

        const fissureStart    = chargeMs;
        const fireworksStart  = fissureStart + travelDuration * 0.4;
        const explosionStart  = fireworksStart + fireworksDuration;
        const totalMs = chargeMs + sustainMs;

        const allEls = [];
        const fissureSegments = Math.max(6, 5 + count);
        const burstCount = Math.max(4, 3 + count * 2);   // số cụm hoa lửa
        const petalCount = Math.max(8, 6 + count * 2);   // số cánh mỗi cụm

        const fireColors = ['#ff3b0a', '#ff8c00', '#ffcf00', '#fff2b0', '#ff5e00'];

        // ── Helper: 1 cụm hoa lửa (nổ tròn toả cánh) ──
        const createFireFlower = (fx, fy, fDelay, fScale) => {
            // Lõi sáng bùng lên tại tâm nổ
            const core = document.createElement('div');
            const coreSize = 14 * fScale;
            core.style.cssText = `
                position: fixed; left:${fx}px; top:${fy}px;
                width:${coreSize}px; height:${coreSize}px;
                border-radius:50%;
                background: radial-gradient(circle, #fff 20%, #ffcf5c 55%, #ff5500 100%);
                box-shadow: 0 0 ${16 * fScale}px #ff8c00;
                transform: translate(-50%,-50%) scale(0);
                z-index: 9997; pointer-events:none; opacity:0;
            `;
            document.body.appendChild(core);
            allEls.push(core);
            core.animate([
                { opacity: 0, transform: 'translate(-50%,-50%) scale(0)' },
                { opacity: 1, transform: 'translate(-50%,-50%) scale(1.6)', offset: 0.25 },
                { opacity: 0, transform: 'translate(-50%,-50%) scale(0.4)' }
            ], { duration: 400, delay: fDelay, fill: 'forwards', easing: 'ease-out' });

            // Các cánh hoa lửa bắn toả tròn ra từ tâm
            const petals = 8 + Math.floor(Math.random() * (petalCount - 6));
            for (let p = 0; p < petals; p++) {
                const angle = (p / petals) * Math.PI * 2 + Math.random() * 0.4;
                const dist = (40 + Math.random() * 55) * fScale;
                const dropY = (10 + Math.random() * 20) * fScale; // rơi nhẹ do trọng lực
                const size = (4 + Math.random() * 5) * fScale;
                const color = fireColors[Math.floor(Math.random() * fireColors.length)];

                const petal = document.createElement('div');
                petal.style.cssText = `
                    position: fixed; left:${fx}px; top:${fy}px;
                    width:${size}px; height:${size}px;
                    border-radius:50%;
                    background: ${color};
                    box-shadow: 0 0 ${6 * fScale}px ${color};
                    z-index: 9996; pointer-events:none; opacity:0;
                `;
                document.body.appendChild(petal);
                allEls.push(petal);

                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist;

                petal.animate([
                    { opacity: 0,   transform: 'translate(-50%,-50%) translate(0px,0px) scale(1)' },
                    { opacity: 1,   transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(1)`, offset: 0.45 },
                    { opacity: 0,   transform: `translate(-50%,-50%) translate(${dx * 1.15}px,${dy * 1.15 + dropY}px) scale(0.4)` }
                ], { duration: 550 + Math.random() * 150, delay: fDelay, fill: 'forwards', easing: 'ease-out' });
            }
        };

        // 1. XUNG CHẤN — dậm đất tại vị trí kẻ tấn công
        const shockSize = rectS.width * 2.2 * scale;
        const shock = document.createElement('div');
        shock.style.cssText = `
            position: fixed; left:${atkCx}px; top:${groundYAtk}px;
            width:${shockSize}px; height:${shockSize * 0.4}px;
            border-radius:50%;
            background: radial-gradient(ellipse at center, rgba(255,190,60,0.9) 0%, rgba(255,80,0,0.5) 40%, transparent 75%);
            transform: translate(-50%,-50%) scale(0.2);
            z-index: 9996; pointer-events:none; opacity:0;
            filter: blur(${2 * scale}px);
        `;
        document.body.appendChild(shock);
        allEls.push(shock);
        shock.animate([
            { opacity: 0, transform: 'translate(-50%,-50%) scale(0.2)' },
            { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.3 },
            { opacity: 0, transform: 'translate(-50%,-50%) scale(1.8)' }
        ], { duration: chargeMs, fill: 'forwards', easing: 'ease-out' });

        // 2. KHE NỨT lan dọc mặt đất từ kẻ tấn công sang đối thủ
        for (let i = 0; i < fissureSegments; i++) {
            const t0 = i / fissureSegments;
            const midT = (t0 + (i + 1) / fissureSegments) / 2;
            const px = atkCx + (tgtCx - atkCx) * midT;
            const py = groundYAtk + (groundYTgt - groundYAtk) * midT;
            const segDelay = fissureStart + t0 * travelDuration;

            const crackW = (55 + Math.random() * 30) * scale;
            const crack = document.createElement('div');
            crack.style.cssText = `
                position: fixed; left:${px}px; top:${py}px;
                width:${crackW}px; height:${7 * scale}px;
                background:#2a0a00;
                clip-path: polygon(0% 50%, 15% 0%, 35% 70%, 50% 20%, 65% 80%, 85% 10%, 100% 50%, 90% 95%, 50% 100%, 10% 90%);
                box-shadow: 0 0 ${6 * scale}px #ff5500;
                transform-origin: 0% 50%;
                z-index: 9995; pointer-events:none; opacity:0;
            `;
            document.body.appendChild(crack);
            allEls.push(crack);

            crack.animate([
                { opacity: 0, transform: `translate(-50%,-50%) rotate(${impactAngle}deg) scaleX(0)` },
                { opacity: 1, transform: `translate(-50%,-50%) rotate(${impactAngle}deg) scaleX(1)`, offset: 0.4 },
                { opacity: 0.85, transform: `translate(-50%,-50%) rotate(${impactAngle}deg) scaleX(1)` }
            ], { duration: 300, delay: segDelay, fill: 'forwards', easing: 'ease-out' });
        }

        // 3. HOA LỬA BẮN ĐẦY TRỜI — nhiều cụm nổ toả cánh rải trên vùng đối thủ
        for (let b = 0; b < burstCount; b++) {
            const spreadX = (Math.random() - 0.5) * rectE.width * 3.5;
            const spreadY = (60 + Math.random() * 160) * scale; // độ cao trên "trời"
            const fx = tgtCx + spreadX;
            const fy = groundYTgt - spreadY;
            const burstDelay = fireworksStart + (b / burstCount) * fireworksDuration * 0.85 + Math.random() * 120;
            const burstScale = scale * (0.75 + Math.random() * 0.6);

            createFireFlower(fx, fy, burstDelay, burstScale);
        }

        // 4. VỤ NỔ HỦY DIỆT cuối cùng — hoa lửa lớn nhất, ngay tại đối thủ
        createFireFlower(tgtCx, groundYTgt - 20 * scale, explosionStart, scale * 2.2);

        // Vòng lửa lan trên mặt đất tại thời điểm nổ cuối
        const groundBurst = document.createElement('div');
        const groundBurstSize = rectE.width * 2.6 * scale;
        groundBurst.style.cssText = `
            position: fixed; left:${tgtCx}px; top:${groundYTgt}px;
            width:${groundBurstSize}px; height:${groundBurstSize * 0.4}px;
            border-radius:50%;
            background: radial-gradient(ellipse at center, rgba(255,200,80,0.85) 0%, rgba(200,40,0,0.4) 45%, transparent 80%);
            transform: translate(-50%,-50%) scale(0.2);
            z-index: 9994; pointer-events:none; opacity:0;
            filter: blur(${2 * scale}px);
        `;
        document.body.appendChild(groundBurst);
        allEls.push(groundBurst);
        groundBurst.animate([
            { opacity: 0, transform: 'translate(-50%,-50%) scale(0.2)' },
            { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.3 },
            { opacity: 0, transform: 'translate(-50%,-50%) scale(1.7)' }
        ], { duration: explosionDuration, delay: explosionStart, fill: 'forwards', easing: 'ease-out' });

        // Chớp sáng cam đỏ giới hạn trong khung battle-arena (không tràn full màn hình)
        const arenaEl = document.getElementById('battle-arena');
        const arenaRect = arenaEl ? arenaEl.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed; left:${arenaRect.left}px; top:${arenaRect.top}px;
            width:${arenaRect.width}px; height:${arenaRect.height}px;
            background: radial-gradient(circle at ${tgtCx - arenaRect.left}px ${groundYTgt - arenaRect.top}px, rgba(255,140,0,0.5) 0%, rgba(180,0,0,0.22) 45%, transparent 80%);
            z-index: 9993; pointer-events:none; opacity:0;
        `;
        document.body.appendChild(flash);
        allEls.push(flash);
        flash.animate([
            { opacity: 0 },
            { opacity: 1, offset: 0.25 },
            { opacity: 0 }
        ], { duration: explosionDuration, delay: explosionStart, fill: 'forwards', easing: 'ease-out' });

        // Rung màn hình đúng lúc bùng nổ
        setTimeout(() => this.applyGlobalShake(scale * 1.4), explosionStart);

        await new Promise((resolve) => {
            setTimeout(() => {
                allEls.forEach((el) => el.remove());
                resolve();
            }, totalMs + 80);
        });
    },
    

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





    

    async spawnDefault(startEl, endEl, count, scale, data) {
        for (let i = 0; i < count; i++) {
            this.createProjectile(startEl, endEl, data.color, i, scale);
            await new Promise(r => setTimeout(r, this.durationConfig.delayBetween));
        }
    },

    createProjectile(startEl, endEl, color, offset, sizeScale) {
        const rectS = startEl.getBoundingClientRect(), rectE = endEl.getBoundingClientRect();
        const p = document.createElement('div');
        p.className = 'skill-projectile';
        p.style.cssText = `position:fixed; left:${rectS.left + rectS.width / 2}px; top:${rectS.top + rectS.height / 2}px; width:${8*sizeScale}px; height:${25*sizeScale}px; background:${color}; box-shadow:0 0 10px ${color}; border-radius:50%; z-index:9999; transform:rotate(${this.calcAngle(rectS, rectE)}deg); transition:all ${this.durationConfig.projectileFly}ms ease-in;`;
        document.body.appendChild(p);
        requestAnimationFrame(() => { p.style.left = (rectE.left + rectE.width/2) + 'px'; p.style.top = (rectE.top + rectE.height/2) + 'px'; });
        setTimeout(() => p.remove(), this.durationConfig.projectileFly);
    },

    showStatusText(targetEl, text, color) {
        const rect = targetEl.getBoundingClientRect();
        const div = document.createElement('div');
        div.innerText = text;
        div.style.cssText = `position:fixed; left:${rect.left + rect.width/2}px; top:${rect.top}px; color:${color}; font-weight:900; font-size:24px; text-shadow:2px 2px 0px #000; z-index:10000; pointer-events:none; animation:damageFloat ${this.durationConfig.statusText}ms ease-out forwards; transform:translateX(-50%);`;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), this.durationConfig.statusText);
    },

    createDamageText(targetEl, damage) { this.showStatusText(targetEl, `-${damage}`, '#ff4757'); },
    calcAngle(s, e) { return Math.atan2(e.top - s.top, e.left - s.left) * 180 / Math.PI + 90; },
    
};