/**
 * ==========================================
 * POKEMON BATTLE LOGIC - TURN BASED VERSION
 * ==========================================
 */

window.BattleGame = {
    playerTeam: [],
    enemyTeam: [],
    activeUnitIndex: 0, // Chỉ số con đang đến lượt (0-4)
    isPlayerSide: true, // Đang là lượt phe mình hay phe địch
    isProcessing: false,
    telegraph: null, // Kế hoạch (attacker/target/AOE) đã "dự báo" trước 1 lượt, đang hiện FX chờ tới lượt thực thi
    pendingHealBursts: [], // Hàng đợi hiệu ứng buff (hồi máu) chờ phát SAU khi animation đòn đánh đã tắt hẳn
        turnCounter: 0, // Đếm tổng số turn đã diễn ra — dùng để chia khối normal/AOE theo từng "round" (round = turnCounter / số Pokémon trong đội)
        // Thống kê câu hỏi
        correctCount: 0,
    wrongCount: 0,
    totalCount: 0,
        // 🆕 THÊM 2 DÒNG NÀY
        MIN_QUESTIONS: 10,
        MAX_QUESTIONS: 24,

    const canStop = this.totalCount >= this.MIN_QUESTIONS;
        async init() {
        console.log("⚔️ [DEBUG] BattleGame.init() started");
            if (window.ArenaReady) await window.ArenaReady;

        const inv = JSON.parse(localStorage.getItem('pkm_inventory')) || [];

        // 🔧 TỰ ĐỘNG DỌN DỮ LIỆU CŨ: đội hình tối đa giờ chỉ còn 3
        let migrated = false;
        inv.forEach(p => {
            if (p.inTeam && p.position > 3) {
                p.inTeam = false;
                p.position = null;
                migrated = true;
            }
        });
        if (migrated) localStorage.setItem('pkm_inventory', JSON.stringify(inv));

            const team = inv.filter(p => p.inTeam).sort((a, b) => a.position - b.position);

            if (team.length === 0) {
                alert("Đội hình trống!");
                window.location.href = 'pkm_team.html';
                return;
            }

            // 🆕 FETCH BÙ height cho Pokémon cũ (ấp trứng trước khi có field này),
            // để bodyScale (pkm_styles.js) tính đúng cho mọi con, kể cả dữ liệu cũ.
            const heightsChanged = await this.ensureHeights(team);
            if (heightsChanged) localStorage.setItem('pkm_inventory', JSON.stringify(inv));

            this.playerTeam = team.map(p => this.calculateStats(p, false));

            // Dùng đội địch đã được CHỐT SẴN từ màn hình xem trước trận
            // (pkm_prebattle.js) — luôn khắc hệ đúng từng vị trí, và đã hiển
            // thị cho người chơi xem trước khi họ chỉnh sửa đội hình của mình.
            const prebuiltEnemy = window.__pkmPrebattleEnemyPreview;

            if (prebuiltEnemy && prebuiltEnemy.length === team.length) {
                this.enemyTeam = team.map((p, i) => {
                    const stats = this.calculateStats(p, true);
                    stats.id     = prebuiltEnemy[i].id;
                    stats.type   = prebuiltEnemy[i].type;   // ép cứng để đảm bảo LUÔN khắc hệ
                    stats.name   = prebuiltEnemy[i].name;
                    stats.height = prebuiltEnemy[i].height;
                    return stats;
                });
            } else {
                // Fallback an toàn (không có màn xem trước, VD test trực tiếp): random như cũ
                this.enemyTeam = team.map(p => this.calculateStats(p, true));
                for (let p of this.enemyTeam) {
                    try {
                        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${p.id}`);
                        const data = await res.json();
                        p.name = data.name.charAt(0).toUpperCase() + data.name.slice(1);
                        if (data.types && data.types.length > 0) p.type = data.types[0].type.name;
                        p.height = data.height;
                    } catch (e) {
                        p.name = "Unknown";
                        p.type = "normal";
                        p.height = 10;
                    }
                }
            }

    if (window.QuizManager) window.QuizManager.prepareData();

        this.renderBattlefield();

        // 🔥 Tiến trình điều khiển: Học từ vựng (wordBank2) -> Đấu trắc nghiệm
        // 🔥 Tiến trình điều khiển ĐÃ CHUẨN HÓA: Học từ vựng (VocabularyModule) -> Xong mới Đấu trắc nghiệm
        (async () => {
            // 1. Ẩn bảng câu hỏi trắc nghiệm khi bắt đầu vào trang để ưu tiên học từ
            const quizOverlay = document.getElementById("quiz-overlay");
            if (quizOverlay) quizOverlay.style.display = "none";

            // 2. Định nghĩa hàm callback toàn cục để khi bên module Vocab học xong thì gọi ngược lại đây
            // 🆕 Hàm chọn cấp độ riêng cho trận đấu — CHỈ 3 lựa chọn (không có Mầm non)
            const renderBattleLevelSelect = (container) => {
                return new Promise((resolve) => {
                    const LEVELS = [
                        { key: "de",         emoji: "🟢", label: "Dễ",         sub: "Hội thoại/đoạn văn ngắn" },
                        { key: "trung_binh", emoji: "🟡", label: "Trung bình", sub: "Độ dài vừa phải" },
                        { key: "kho",        emoji: "🔴", label: "Khó",        sub: "Hội thoại/đoạn văn dài" },
                    ];
                    container.innerHTML = `
                        <div style="text-align:center;">
                            <div style="font-size:16px;color:#FFCB05;font-weight:700;margin-bottom:18px;">🎮 Chọn cấp độ trận đấu!</div>
                            <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
                                ${LEVELS.map(lv => `
                                    <div class="battle-level-card" data-level="${lv.key}" style="
                                        background:rgba(255,255,255,.06); border:2px solid rgba(255,203,5,.3);
                                        border-radius:16px; padding:18px 22px; text-align:center; cursor:pointer;
                                        min-width:120px; transition:all .2s;">
                                        <div style="font-size:38px;">${lv.emoji}</div>
                                        <div style="font-weight:800;color:#FFCB05;margin-top:6px;font-size:16px;">${lv.label}</div>
                                        <div style="font-size:12px;color:#bbb;margin-top:4px;">${lv.sub}</div>
                                    </div>`).join("")}
                            </div>
                        </div>`;
                    container.querySelectorAll(".battle-level-card").forEach(card => {
                        card.onclick = () => {
                            const level = card.dataset.level;
                            localStorage.setItem("selected_level", level);
                            resolve(level);
                        };
                    });
                });
            };

            window.startPokemonBattle = async () => {
                console.log("⚔️ Chọn cấp độ trước khi vào trận...");

                // Tự tạo mainCard nếu chưa có (phòng trường hợp VocabularyModule lỗi)
                let mainCard = document.getElementById("mainCard");
                if (!mainCard) {
                    mainCard = document.createElement("div");
                    mainCard.id = "mainCard";
                    document.body.appendChild(mainCard);
                }
                mainCard.style.cssText = `
                    position: fixed; top:0; left:0; width:100vw; height:100dvh;
                    background: radial-gradient(circle, #1a1c28 0%, #0a0c16 100%);
                    z-index: 99999; display:flex; align-items:center; justify-content:center;
                    padding:20px; box-sizing:border-box;
                `;

                await renderBattleLevelSelect(mainCard);
                mainCard.style.display = "none";

                // Nạp lại cấu hình cấp độ vừa chọn cho QuizManager (prepareData() đã chạy
                // TRƯỚC KHI học sinh chọn nên cần gọi lại loadLevel() ở đây mới nhận đúng)
                if (window.QuizManager) {
                    window.QuizManager.loadLevel();
                    // 🆕 Xây lại bể dạng bài theo ĐÚNG cấp độ vừa chọn — bắt buộc vì
                    // initSkillPools() ban đầu (trong prepareData) chạy TRƯỚC khi chọn
                    // cấp độ nên còn lọc theo cấp mặc định "Dễ" (loại speaking4/writing4).
                    window.QuizManager.initSkillPools();
                }

                if (quizOverlay) quizOverlay.style.display = "flex";

            if (window.PkmScore) window.PkmScore.resetMatchTotals();
            this.activeUnitIndex = 0;
            this.telegraph = this.buildTelegraph(this.activeUnitIndex);
            this.showTelegraphFX(this.telegraph);
            setTimeout(() => this.askAndResolve(), 1000);
            };

            // 3. Kích hoạt gọi thằng VocabularyModule tự mò localStorage/sessionStorage bốc dữ liệu và chạy
            if (window.VocabularyModule && typeof window.VocabularyModule.start === "function") {
                console.log("📘 [Battle Script] Gọi VocabularyModule chạy phần học từ vựng...");
                await window.VocabularyModule.start();
            } else {
                // Phương án dự phòng nếu file vocab bị lỗi hoặc không tải được, vào thẳng trận đấu luôn
                console.warn("⚠️ Không tìm thấy VocabularyModule, tự động vào thẳng trận đấu!");
                window.startPokemonBattle();
            }
        })();
    },
    // Fetch bù trường "height" (đơn vị decimet, PokeAPI) cho các Pokémon
    // CŨ chưa có field này (ấp trứng trước khi pkm_egg.js được cập nhật).
    // Trả về true nếu có ít nhất 1 con vừa được fetch bù (để nơi gọi biết
    // mà lưu lại localStorage).
    async ensureHeights(team) {
        const missing = team.filter(p => !p.height);
        if (missing.length === 0) return false;

        await Promise.all(missing.map(async (p) => {
            try {
                const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${p.id}`);
                const data = await res.json();
                p.height = data.height;
            } catch (e) {
                p.height = 10; // fallback ~1m nếu fetch lỗi, tránh vỡ hiển thị
            }
        }));

        return true;
    },

    calculateStats(pkm, isEnemy) {
        const stats = pkm.baseStats || {};
        let hp   = parseInt(stats.hp)  || 20;
        let atk  = parseInt(stats.atk) || 20;
        let def  = parseInt(stats.def) || 15;
        let sAtk = parseInt(stats.sAtk) || 20;

        if (!isEnemy) {
            // 1. ĐỌC VÀ CỘNG CHỈ SỐ TỪ TRANG BỊ
            const equipped = JSON.parse(localStorage.getItem('pkm_equipped')) || {};
            const equippedIds = Object.values(equipped);
            let bonusAtk = 0, bonusDef = 0, bonusHP = 0, bonusSAtk = 0;

            const rankBonusMap = { 'silver': 0.02, 'gold': 0.03, 'red': 0.04, 'orange': 0.05 };

            equippedIds.forEach(id => {
                const parts = id.split('_');
                const type = parts[0];
                const rank = parts[1];
                const b = rankBonusMap[rank] || 0;

                if (type === 'weapon' || type === 'gloves') {
                    bonusAtk += b;
                    bonusSAtk += b;
                } else if (type === 'armor' || type === 'earring') {
                    bonusDef += b;
                } else if (type === 'helmet' || type === 'shoes') {
                    bonusHP += b;
                } else if (type === 'cloak' || type === 'belt') {
                    bonusSAtk += b;

                }
            });

            atk = Math.floor(atk * (1 + bonusAtk));
            sAtk = Math.floor(sAtk * (1 + bonusSAtk));
            def = Math.floor(def * (1 + bonusDef));
            hp  = Math.floor(hp  * (1 + bonusHP));

            // 2. TÍCH HỢP KIỂM TRA VÀ CỘNG BUFF ĐỘI HÌNH (+5% Toàn bộ chỉ số gốc + trang bị)
            const teamBuffStatus = localStorage.getItem('pkm_team_buff');
            if (teamBuffStatus === 'active') {
                atk  = Math.floor(atk * 1.05);
                sAtk = Math.floor(sAtk * 1.05);
                def  = Math.floor(def * 1.05);
                hp   = Math.floor(hp * 1.05);
                console.log(`💪 [BUFF ACTIVE] Đã cộng 5% chỉ số chiến đấu cho: ${pkm.name}`);
            }
        }

        // 🔥 ĐOẠN SỬA ĐỔI: Tối ưu HP co giãn riêng cho 1 con và 2 con, giữ nguyên 3-5 con
        const inv = JSON.parse(localStorage.getItem('pkm_inventory')) || [];
        const actualTeamSize = inv.filter(p => p.inTeam).length || 1;

        let hpMultiplier = 17; // Mặc định là x15 cho các trường hợp 3, 4, 5 con

        if (actualTeamSize === 1) {
            hpMultiplier = 45; // Đi 1 con đơn độc: x30 máu để kéo dài trận đấu
        } else if (actualTeamSize === 2) {
            hpMultiplier = 25; // Đi 2 con: x25 máu để trận đấu vừa vặn
        }

        // Cả phe ta và phe địch đều sẽ áp dụng hệ số co giãn này
        const baseHP = (hp * hpMultiplier) + 200;
        const randomPkmID = Math.floor(Math.random() * 649) + 1;

        return {
            ...pkm,
            id: isEnemy ? randomPkmID : pkm.id,
            name: isEnemy ? "Loading..." : pkm.name, 
            maxHp: isEnemy ? Math.floor(baseHP * 0.7) : baseHP,
            currentHp: isEnemy ? Math.floor(baseHP * 0.7) : baseHP,
            atk: atk, 
            sAtk: sAtk,
            def: def,
            type: pkm.type || 'normal',
            gen: pkm.gen || 1,
            hitsTaken: 0
        };
    },

    // ═══════════════════════════════════════════════════════════
    // PIPELINE LƯỢT ĐẤU MỚI — "dự báo trước 1 lượt" (telegraph)
    // ═══════════════════════════════════════════════════════════
    // Ý tưởng: ngay khi 1 cặp vừa đánh xong, ta CHỐT TRƯỚC (roll AOE/
    // mục tiêu) cho cặp KẾ TIẾP và bật FX (Ring1/Ring2/Ring3) lên
    // NGAY LÚC ĐÓ — trong khi cặp đó còn đứng yên chưa tới lượt.
    // Chỉ khi tới lượt của cặp đó, ta mới hỏi quiz rồi thực thi ĐÚNG
    // như đã báo trước (không roll lại). Nhờ vậy FX luôn xuất hiện
    // trước, cách xa thời điểm ra đòn thật.

    // Chốt trước kế hoạch tấn công cho 1 cặp (chưa thực thi damage)
    buildTelegraph(unitIndex) {
        const playerAttacker = this.playerTeam[unitIndex];
        const enemyAttacker  = this.enemyTeam[unitIndex];
        const pAlive = playerAttacker && playerAttacker.currentHp > 0;
        const eAlive = enemyAttacker  && enemyAttacker.currentHp  > 0;

        // Chia khối theo ROUND thay vì roll ngẫu nhiên: mỗi "round" gồm đủ
        // N turn (N = số Pokémon trong đội). Round chẵn (0, 2, 4...) → cả
        // đội đánh thường; round lẻ (1, 3, 5...) → cả đội tung AOE. Cả 2
        // phe (ta + địch) LUÔN dùng chung 1 kết quả để đồng bộ loại đòn.
        const teamLen = this.playerTeam.length || 1;
        const roundIndex = Math.floor(this.turnCounter / teamLen);
        const isAOE = (roundIndex % 2 === 1);
        this.turnCounter++;

        const plan = { unitIndex, enemyPlan: null, playerPlan: null };
        if (eAlive) plan.enemyPlan  = this.rollActionPlan(enemyAttacker, this.playerTeam, 'enemy', unitIndex, isAOE);
        if (pAlive) plan.playerPlan = this.rollActionPlan(playerAttacker, this.enemyTeam, 'player', unitIndex, isAOE);
        return plan;
    },

    // Roll mục tiêu theo `isAOE` đã chốt sẵn từ buildTelegraph — KHÔNG tự
    // roll random ở đây nữa (tránh lệch pha với bên còn lại)
    rollActionPlan(attacker, opponentTeam, side, unitIndex, isAOE) {
        const targetSide = side === 'player' ? 'enemy' : 'player';

        if (!isAOE) {
            const targetIdx = opponentTeam.findIndex(p => p.currentHp > 0);
            if (targetIdx === -1) return null;
            return { attacker, side, targetSide, unitIndex, isAOE: false, targetIdx, targets: [targetIdx] };
        }

        const targets = opponentTeam.map((p, i) => p.currentHp > 0 ? i : -1).filter(i => i !== -1);
        if (targets.length === 0) return null;
        return { attacker, side, targetSide, unitIndex, isAOE: true, targets };
    },

    // Bật FX Ring1 (sắp tấn công) / Ring2 (sắp AOE) / Ring3 (sắp bị tấn công) cho cả kế hoạch của 1 cặp
    showTelegraphFX(plan) {
        if (plan.enemyPlan)  this.showPlanFX(plan.enemyPlan);
        if (plan.playerPlan) this.showPlanFX(plan.playerPlan);
    },
    showPlanFX(actionPlan) {
        window.PkmUnitFX?.setAttacking(actionPlan.side, actionPlan.unitIndex, true);
        if (actionPlan.isAOE) window.PkmUnitFX?.setAOECasting(actionPlan.side, actionPlan.unitIndex, true);
        (actionPlan.targets || []).forEach(i => window.PkmUnitFX?.setTargeted(actionPlan.targetSide, i, true));
    },
    // Tắt hết FX telegraph của 1 cặp (gọi sau khi đã thực thi xong đòn đánh thật)
    clearTelegraphFX(plan) {
        [plan.enemyPlan, plan.playerPlan].forEach(actionPlan => {
            if (!actionPlan) return;
            window.PkmUnitFX?.setAttacking(actionPlan.side, actionPlan.unitIndex, false);
            window.PkmUnitFX?.setAOECasting(actionPlan.side, actionPlan.unitIndex, false);
            (actionPlan.targets || []).forEach(i => window.PkmUnitFX?.setTargeted(actionPlan.targetSide, i, false));
        });
    },

    // Log + hỏi quiz (nếu phe ta có tham chiến ở cặp đang được telegraph), rồi thực thi
    askAndResolve() {
        const plan = this.telegraph;
        if (!plan || this.checkGameOver()) return;

        const enemyName  = plan.enemyPlan?.attacker?.name;
        const playerName = plan.playerPlan?.attacker?.name;

        if (plan.enemyPlan && plan.playerPlan) {
            this.log(`${enemyName} tấn công trước, ${playerName} phản công sau!`);
        } else if (plan.playerPlan) {
            this.log(`Lượt của ${playerName} (Phe mình)`);
        } else if (plan.enemyPlan) {
            this.log(`Lượt của ${enemyName} (Đối thủ)`);
        }

        if (plan.playerPlan) {
            if (window.QuizManager) {
                window.QuizManager.ask((isCorrect) => this.resolveRound(isCorrect));
            } else {
                this.resolveRound(true);
            }
        } else {
            // Chỉ địch còn sống ở cặp này → không cần hỏi quiz
            setTimeout(() => this.resolveRound(true), 600);
        }
    },

    // Thực thi kế hoạch đã telegraph: ĐỊCH đánh trước, TA đánh sau (theo đúng kết quả quiz)
    async resolveRound(playerCorrect) {
        this.isProcessing = true;

        const plan = this.telegraph;
        this.telegraph = null;

        // SAU
        if (plan.playerPlan) {
            if (window.PkmScore) window.PkmScore.recordAnswer(playerCorrect);   // ⬅️ THÊM DÒNG NÀY

            this.totalCount++;
            if (playerCorrect) this.correctCount++; else this.wrongCount++;
            const statEl = document.getElementById('quiz-stats');
            if (statEl) statEl.innerHTML =
                `✅ ${this.correctCount} &nbsp; ❌ ${this.wrongCount} &nbsp; 📊 ${this.totalCount} câu`;
        }

        // ĐỊCH đánh trước — luôn trúng
        if (plan.enemyPlan) await this.executePlannedAction(plan.enemyPlan, true);

        // Nghỉ 1 nhịp cho animation đòn địch "lắng" hẳn trước khi đòn ta bắn ra, đỡ đơ
        if (plan.enemyPlan && plan.playerPlan) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // TA đánh sau — theo kết quả quiz
        if (plan.playerPlan) await this.executePlannedAction(plan.playerPlan, playerCorrect);

        this.clearTelegraphFX(plan);
        this.updateUI();

        // Phát hiệu ứng buff (nếu có) SAU KHI mọi animation đòn đánh của lượt này đã xong hẳn
        await this.flushHealBursts();

        if (this.checkGameOver()) {
            this.isProcessing = false;
            return;
        }

        // Tìm cặp kế tiếp còn ít nhất 1 bên sống
        let nextIndex = (plan.unitIndex + 1) % this.playerTeam.length;
        let guard = 0;
        while (guard < this.playerTeam.length) {
            const p = this.playerTeam[nextIndex], e = this.enemyTeam[nextIndex];
            if ((p && p.currentHp > 0) || (e && e.currentHp > 0)) break;
            nextIndex = (nextIndex + 1) % this.playerTeam.length;
            guard++;
        }
        this.activeUnitIndex = nextIndex;

        // DỰ BÁO TRƯỚC cho cặp kế tiếp NGAY BÂY GIỜ — trong khi cặp vừa xong vẫn còn hiện trên sân,
        // FX của cặp kế tiếp đã bật sẵn để người chơi thấy trước 1 lượt.
        this.telegraph = this.buildTelegraph(this.activeUnitIndex);
        this.showTelegraphFX(this.telegraph);

        this.isProcessing = false;

        // CHECKPOINT: cứ mỗi 10 câu đã trả lời thì dừng lại hỏi chơi tiếp/dừng.
        if (window.PkmScore.shouldCheckpoint(this.totalCount)) {
            this.showCheckpoint();
            return;
        }

        setTimeout(() => this.askAndResolve(), 1000);
    },

    // Chốt điểm GIỮA CHỪNG — không kết thúc trận thật. <20 câu: luôn
    // allowLessonUnlock=false. >=20 câu: nếu bấm Dừng, quyết thắng/thua theo
    // tổng máu hiện tại và cho phép mở khoá bài mới như 1 trận thật.
    showCheckpoint() {
        const result = window.PkmScore.finishMatch({
            won: true, minQuestions: 0, allowLessonUnlock: false,
        });
        window.PkmScore.resetForNewRound();

        const canStop = this.totalCount >= window.PkmScore.CHECKPOINT_INTERVAL * 2;
        const messages = (result.breakdown || []).map(b => {
            if (b.type === 'correct_answers') return `📝 ${b.correctCount} câu đúng ÷ ${b.divisor} = <b>+${b.exp} KN +${b.dv} DV</b>`;
            if (b.type === 'streak') return b.exp > 0 ? `🔥 Chuỗi ${b.streak} ngày: <b>+${b.exp} KN +${b.dv} DV</b>` : '';
            return '';
        }).filter(Boolean);

        window.PkmScore.showCheckpointPopup({
            title: `🎁 Đã trả lời ${this.totalCount} câu!`,
            breakdownHTML: messages.map(m => `<div>${m}</div>`).join('') || '<div>Chưa có thưởng mới ở mốc này.</div>',
            stopHint: canStop ? '' : `Dừng trước câu ${this.MIN_QUESTIONS} sẽ KHÔNG được xét mở khoá bài mới.`,
            onContinue: () => { setTimeout(() => this.askAndResolve(), 400); },
            onStop: () => {
                if (canStop) {
                    const playerHpSum = this.playerTeam.reduce((s, p) => s + Math.max(0, p.currentHp), 0);
                    const enemyHpSum = this.enemyTeam.reduce((s, p) => s + Math.max(0, p.currentHp), 0);
                    if (playerHpSum >= enemyHpSum) this.victory(); else this.defeat();
                } else {
                    this.victoryEarlyStop();
                }
            },
        });
    },

    // Dừng sớm trước câu 20 — đã chốt điểm ở showCheckpoint() rồi (allowLessonUnlock:false),
    // ở đây chỉ hiển thị tổng kết từ window.PkmScore.matchTotals, KHÔNG gọi finishMatch nữa.
    victoryEarlyStop() {
        this.log("🏁 DỪNG SỚM!");
        const firstPkm = this.playerTeam[0];
        const victoryImg = document.getElementById('victory-pkm-img');
        if (victoryImg && firstPkm) {
            victoryImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${firstPkm.id}.png`;
        }
        const expText = document.getElementById('victory-exp-text');
        if (expText) {
            expText.innerHTML = `
                <div style="color:#4caf50; font-size:16px; font-weight:bold;">+${window.PkmScore.matchTotals.bonusEXP} KN &nbsp; +${window.PkmScore.matchTotals.bonusDV} DV</div>
                <div style="color:#aaa; font-size:12px; margin:8px 0;">Dừng ở câu ${this.totalCount} — chưa đủ điều kiện xét mở khoá bài mới.</div>
                <button onclick="window.location.href='pkm_map.html'"
                        style="background:#2ecc71; color:white; border:none; padding:10px 30px;
                               border-radius:25px; cursor:pointer; font-weight:bold;">
                    TIẾP TỤC
                </button>`;
        }
        const overlay = document.getElementById('victory-overlay');
        if (overlay) overlay.style.display = 'flex';
    },

    // Thực thi 1 đòn đánh đã được telegraph từ trước: tính damage thật, phát animation, trừ máu
    async executePlannedAction(actionPlan, isCorrect) {
        if (!actionPlan) return;
        const { attacker, side, targetSide, isAOE, targetIdx, targets, unitIndex } = actionPlan;
        if (!attacker || attacker.currentHp <= 0) return; // đã chết trong lúc chờ telegraph

        const opponentTeam = targetSide === 'enemy' ? this.enemyTeam : this.playerTeam;

        if (!isCorrect) {
            this.log(`${attacker.name} đánh hụt!`);
            const missTargetIdx = isAOE ? (targets && targets[0]) : targetIdx;
            const playInfo = {
                attackerIndex: unitIndex,
                attackerSide: side,
                targetSide,
                missed: true,
                targets: (missTargetIdx !== undefined ? [missTargetIdx] : [])
            };
            console.log('[BATTLE] playInfo khi MISS:', JSON.parse(JSON.stringify(playInfo)), 'missTargetIdx=', missTargetIdx, 'targetIdx=', targetIdx, 'targets=', targets); // ← thêm dòng này
            if (window.SkillManager) await window.SkillManager.playNormalAttack(playInfo);
            return;
        }

        if (attacker.name && window.SkillManager) window.SkillManager.speakName(attacker.name);

        if (!isAOE) {
            const target = opponentTeam[targetIdx];
            if (!target || target.currentHp <= 0) return; // mục tiêu đã chết trước đó (VD dính AOE của lượt vừa rồi)
            const typeBonus = window.PkmTypeChart?.isSuperEffective(attacker.type, target.type) ? 1.10 : 1.0;

            // 💥 Đã x2 damage cho đòn đơn
            const damage = Math.max(15, Math.floor((attacker.atk * 1.8) / (1 + target.def / 100) * typeBonus) * 2);

            this.dealDamage(target, damage, targetSide, targetIdx);

            const playInfo = { type: attacker.type || 'normal', gen: attacker.gen || 1, attackerIndex: unitIndex, attackerSide: side,
                                attackerId: attacker.id, attackerName: attacker.name, targetSide, damage, isAOE: false, targets: [targetIdx], isSkill: true };
            await window.SkillManager.playNormalAttack(playInfo);
        } else {
            const aliveTargets = targets.filter(i => opponentTeam[i] && opponentTeam[i].currentHp > 0);
            if (aliveTargets.length === 0) return;

            const playInfo = { type: attacker.type || 'normal', gen: attacker.gen || 1, attackerIndex: unitIndex, attackerSide: side,
                                attackerId: attacker.id, attackerName: attacker.name, targetSide, targets: aliveTargets, damage: 0, isAOE: true, isSkill: true };
            aliveTargets.forEach(idx => {
                const target = opponentTeam[idx];
                const typeBonus = window.PkmTypeChart?.isSuperEffective(attacker.type, target.type) ? 1.10 : 1.0;

                // 💥 Đã x2 damage cho đòn AOE
                const damage = Math.max(20, Math.floor((attacker.sAtk * 1.2) / (1 + target.def / 100) * typeBonus) * 2);

                this.dealDamage(target, damage, targetSide, idx);
                playInfo.damage = damage;
            });
            await window.SkillManager.play(playInfo);
        }

        this.updateUI();
    },

    // Trừ máu + đếm số lần bị dính đòn → cứ đủ 3 đòn thì hồi máu (buff thật),
    // và bật sẵn hiệu ứng "sắp được buff" (2 sao) ngay từ đòn thứ 2 để dự báo trước.
        dealDamage(target, damage, targetSide, targetIndex) {
        const team = targetSide === 'enemy' ? this.enemyTeam : this.playerTeam;
        const otherAlive = team.some((p, i) => i !== targetIndex && p && p.currentHp > 0);
        const wouldWipeTeam = (target.currentHp - damage) <= 0 && !otherAlive;

        if (wouldWipeTeam && this.totalCount < this.MIN_QUESTIONS) {
            // Chưa đủ số câu tối thiểu -> giữ sàn 1 máu, không cho đội bị xoá sổ sớm
            target.currentHp = 1;
        } else {
            target.currentHp = Math.max(0, target.currentHp - damage);
        }
        target.hitsTaken = (target.hitsTaken || 0) + 1;

        if (target.currentHp <= 0) return; // chết rồi thì thôi, khỏi buff

        const mod = target.hitsTaken % 3;
        if (mod === 2) {
            // Đã lãnh đủ 2 đòn — báo trước sắp được buff ở đòn kế tiếp
            window.PkmUnitFX?.setBuffing(targetSide, targetIndex, true);
        } else if (mod === 0) {
            // Đủ 3 đòn — CHƯA cộng máu ở đây nữa. Giờ buff hồi máu là buff
            // cho CẢ ĐỘI, số liệu từng con khác nhau tuỳ maxHp, và máu chỉ
            // thực sự được cộng đúng lúc hiệu ứng Pha 3 xuất hiện trên từng
            // con (xem playHealBuffSequence). Ở đây chỉ ghi nhận SỰ KIỆN.
            window.PkmUnitFX?.setBuffing(targetSide, targetIndex, false);
            this.log(`${target.name} kích hoạt hồi máu đồng đội!`);

            this.pendingHealBursts.push({
                side: targetSide,
                sourceIndex: targetIndex,
                sourceType: target.type || 'normal'
            });
        }
    },

    // Phát các hiệu ứng buff đã dồn trong hàng đợi — chỉ gọi SAU KHI mọi animation
    // đòn đánh của lượt đã hoàn toàn kết thúc, cách nhau 1 nhịp để không đơ.
    async flushHealBursts() {
        if (this.pendingHealBursts.length === 0) return;
        const events = this.pendingHealBursts;
        this.pendingHealBursts = [];

        // Đợi Pokémon "im" trở lại sau đòn đánh rồi mới phát hiệu ứng buff
        await new Promise(resolve => setTimeout(resolve, 500));

        // Tách sự kiện theo PHE — trong 1 phe, nếu có nhiều con cùng proc buff
        // ở turn này thì chạy TUẦN TỰ (con này xong hết mới tới con kia).
        // Nhưng phe ta và phe địch thì chạy SONG SONG với nhau.
        const bySide = { player: [], enemy: [] };
        events.forEach(ev => bySide[ev.side]?.push(ev));

        const runSideQueue = async (side, queue) => {
            for (const ev of queue) {
                await this.playHealBuffSequence(side, ev.sourceIndex, ev.sourceType);
            }
        };

        await Promise.all([
            runSideQueue('player', bySide.player),
            runSideQueue('enemy', bySide.enemy)
        ]);
    },

    // Chạy trọn 3 pha của 1 sự kiện buff hồi máu:
    // Pha 1: cột sáng giáng xuống đúng con vừa đủ 3 đòn (con "chủ buff")
    // Pha 2: mảng sáng lan từ con đó ra khắp các ô CÒN SỐNG cùng phe
    // Pha 3: hồi máu đồng loạt cho cả đội còn sống — CỘNG MÁU THẬT đúng
    //        lúc này, mỗi con hồi = min(20, 1% maxHp của chính nó)
    async playHealBuffSequence(side, sourceIndex, sourceType) {
        const team = side === 'player' ? this.playerTeam : this.enemyTeam;
        const aliveIndices = team
            .map((p, i) => (p && p.currentHp > 0) ? i : -1)
            .filter(i => i !== -1);
        if (aliveIndices.length === 0) return;

        const color = (window.SkillManager?.systemConfig?.[sourceType] || {}).color || '#2ecc71';

        // PHA 1
        await window.PkmUnitFX?.playDescendBeam(side, sourceIndex, color);

        // PHA 2
        await window.PkmUnitFX?.playGroundSpread(side, sourceIndex, aliveIndices, color);

        // PHA 3 — cộng máu thật + hiện hiệu ứng + số hồi, từng con nối tiếp nhẹ
        for (let i = 0; i < aliveIndices.length; i++) {
            const idx = aliveIndices[i];
            const p = team[idx];
            if (!p || p.currentHp <= 0) continue;

            const healAmount = Math.min(20, Math.floor(p.maxHp * 0.005));
            p.currentHp = Math.min(p.maxHp, p.currentHp + healAmount);

            window.PkmUnitFX?.showHealBurst(side, idx);
            window.PkmUnitFX?.showHealNumber(side, idx, healAmount);

            if (i < aliveIndices.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        }

        this.updateUI();
    },

    renderBattlefield() {
    const arena = document.getElementById('battle-arena');
    if (arena) arena.className = 'battle-arena';
    const pContainer = document.getElementById('player-team-container');
    const eContainer = document.getElementById('enemy-team-container');
    if (!pContainer || !eContainer) return;
    pContainer.innerHTML = '';
    eContainer.innerHTML = '';
    const teamSize = this.playerTeam.length; // player và enemy luôn cùng số lượng slot
    if (window.SkillManager?.resetNormalStylePools) {
        window.SkillManager.resetNormalStylePools();
    }
    // Chốt cố định trainer cho phe địch NGAY LÚC NÀY, 1 lần duy nhất mỗi trận
    if (window.PkmStyles?.assignEnemyTrainers) {
        window.PkmStyles.assignEnemyTrainers(teamSize);
    }

        // Vẽ TRAINER TRƯỚC (lớp dưới) rồi mới vẽ POKEMON (lớp trên) —
        // trainer là phần tử riêng, không nằm trong .pkm-unit, không bị
        // ảnh hưởng bởi animation đánh/trúng chiêu/AOE của Pokémon.
        this.enemyTeam.forEach((p, i) => {
            if (window.PkmStyles?.renderTrainer) {
                eContainer.innerHTML += window.PkmStyles.renderTrainer('enemy', i, teamSize);
            }
        });

        this.playerTeam.forEach((p, i) => { 
            pContainer.innerHTML += this.createUnitHTML(p, i, 'player', teamSize); 
        });
        this.enemyTeam.forEach((p, i)  => { 
            eContainer.innerHTML += this.createUnitHTML(p, i, 'enemy', teamSize);  
        });
        this.playerTeam.forEach((p,i)=>{ if(p.currentHp>0) window.PkmUnitFX?.attachBaseRings('player', i); });
        this.enemyTeam.forEach((p,i)=>{ if(p.currentHp>0) window.PkmUnitFX?.attachBaseRings('enemy', i); });

        this.updateActiveStatus();
    },
    createUnitHTML(pkm, index, side, teamSize) {
        // Chỉ gọi style, không xử lý ảnh ở đây nữa
        return PkmStyles.renderUnit(pkm, index, side, teamSize);
    },

    updateUI() {
        [...this.playerTeam.entries()].forEach(([i, p]) => {
            const fill = document.getElementById(`player-hp-fill-${i}`);
            const text = document.getElementById(`player-hp-text-${i}`);
            if (fill) {
                const pct = Math.max(0, (p.currentHp / p.maxHp) * 100);
                fill.style.width      = pct + "%";
                fill.style.background = pct > 50 ? "#2ecc71" : pct > 25 ? "#f1c40f" : "#e74c3c";
            }
            if (text) text.innerText = `${Math.max(0, p.currentHp)}/${p.maxHp}`;
            this.markDeadIfNeeded(`player-unit-${i}`, p.currentHp);
        });

        [...this.enemyTeam.entries()].forEach(([i, p]) => {
            const fill = document.getElementById(`enemy-hp-fill-${i}`);
            const text = document.getElementById(`enemy-hp-text-${i}`);
            if (fill) {
                const pct = Math.max(0, (p.currentHp / p.maxHp) * 100);
                fill.style.width      = pct + "%";
                fill.style.background = pct > 50 ? "#2ecc71" : pct > 25 ? "#f1c40f" : "#e74c3c";
            }
            if (text) text.innerText = `${Math.max(0, p.currentHp)}/${p.maxHp}`;
            this.markDeadIfNeeded(`enemy-unit-${i}`, p.currentHp);
        });

        this.updateActiveStatus();
    },

    // Đánh dấu Pokemon chết và ẩn vĩnh viễn khỏi màn hình
    markDeadIfNeeded(unitId, currentHp) {
        const el = document.getElementById(unitId);
        if (!el) return;
        if (currentHp <= 0) {
            el.dataset.dead = '1';
            if (!el._teleportData) {
                el.style.opacity    = '0';
                el.style.visibility = 'hidden';
                el.style.pointerEvents = 'none';
            }
            const side = unitId.startsWith('player') ? 'player' : 'enemy';
            const idx = parseInt(unitId.split('-').pop());
            window.PkmUnitFX?.removeUnit(side, idx);
        }
    },

    updateActiveStatus() {
        document.querySelectorAll('.pkm-unit').forEach(u => u.classList.remove('active-unit'));
        const side = this.isPlayerSide ? 'player' : 'enemy';
        const activeEl = document.getElementById(`${side}-unit-${this.activeUnitIndex}`);
        if (activeEl) activeEl.classList.add('active-unit');
    },
    log(msg) {
        console.log("🎮 [BATTLE]: " + msg);
        const logElement = document.getElementById('turn-display'); // Đã đổi ID
        if (logElement) {
            logElement.innerHTML = msg;
            logElement.style.display = 'block';

            // Tự động ẩn sau 1.2 giây để tiếp tục trận đấu
            if (this.turnTimeout) clearTimeout(this.turnTimeout);
            this.turnTimeout = setTimeout(() => {
                logElement.style.display = 'none';
            }, 1200);
        }
    }, // Thêm dấu phẩy ở đây

    checkGameOver() {
        const isEnemyOut = this.enemyTeam.every(p => p.currentHp <= 0);
        const isPlayerOut = this.playerTeam.every(p => p.currentHp <= 0);

        if (this.totalCount < this.MIN_QUESTIONS) {
            if (isEnemyOut || isPlayerOut) return false; // lớp bảo hiểm, thường không rơi vào vì dealDamage đã chặn
        }

        if (this.totalCount >= this.MAX_QUESTIONS && !isEnemyOut && !isPlayerOut) {
            const playerHpSum = this.playerTeam.reduce((s, p) => s + Math.max(0, p.currentHp), 0);
            const enemyHpSum  = this.enemyTeam.reduce((s, p) => s + Math.max(0, p.currentHp), 0);
            if (playerHpSum >= enemyHpSum) { this.victory(); } else { this.defeat(); }
            return true;
        }

        if (isEnemyOut) { this.victory(); return true; }
        if (isPlayerOut) { this.defeat(); return true; }
        return false;
    },


    // ✅ Victory: hiện overlay đẹp, chờ bấm nút mới về map
    victory() {
    this.log("🏆 CHIẾN THẮNG!");

    const result = window.PkmScore.finishMatch({ won: true, minQuestions: this.MIN_QUESTIONS });

    const messages = (result.breakdown || []).map(b => {
        if (b.type === 'new_lesson')        return `🌟 BÀI MỚI HOÀN THÀNH (${b.accuracy}% đúng): <b>+${b.exp} KN +${b.dv} DV</b>`;
        if (b.type === 'new_lesson_failed')  return `⚠️ Bài mới nhưng chỉ ${b.accuracy}% đúng — cần ≥${b.requiredAccuracy}% để mở khoá!`;
        if (b.type === 'correct_answers')    return `📝 ${b.correctCount} câu đúng ÷ ${b.divisor} = <b>+${b.exp} KN +${b.dv} DV</b>`;
        if (b.type === 'streak')             return b.exp > 0
            ? `🔥 Chuỗi ${b.streak} ngày liên tục: <b>+${b.exp} KN +${b.dv} DV</b>`
            : `📅 Chuỗi hiện tại: <b>${b.streak} ngày</b>`;
        return '';
    }).filter(Boolean);

    const bonusEXP = result.bonusEXP, bonusDV = result.bonusDV;
    const newEXP = result.newEXP, newDV = result.newDV;

        // ── 6. HIỆN UI ──
        const firstPkm   = this.playerTeam[0];
        const victoryImg = document.getElementById('victory-pkm-img');
        if (victoryImg && firstPkm) {
            victoryImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${firstPkm.id}.png`;
        }

        const expText = document.getElementById('victory-exp-text');
        if (expText) {
            expText.innerHTML = `
                <div style="font-size:13px; text-align:left; margin-bottom:12px; line-height:2;">
                    ${messages.map(m => `<div>${m}</div>`).join('')}
                </div>
                <div style="border-top:1px solid #444; padding-top:10px; margin-bottom:12px;">
                    <div style="color:#4caf50; font-size:16px; font-weight:bold;">+${bonusEXP} KN &nbsp; +${bonusDV} DV</div>
                    <div style="color:#aaa; font-size:12px;">Tổng: ${newEXP} KN | ${newDV} DV</div>
                </div>
                <div style="color:#aaa; font-size:12px; margin-bottom:12px;">
                    📊 Kết quả: ✅ ${this.correctCount} đúng / ❌ ${this.wrongCount} sai / tổng ${this.totalCount} câu
                </div>
                <button onclick="window.location.href='pkm_map.html'"
                        style="background:#2ecc71; color:white; border:none; padding:10px 30px;
                               border-radius:25px; cursor:pointer; font-weight:bold;">
                    TIẾP TỤC
                </button>
            `;
        }

        const overlay = document.getElementById('victory-overlay');
        if (overlay) overlay.style.display = 'flex';
    },

    // ── HÀM TÍNH CHUỖI NGÀY ──
    
    defeat() {
    this.log("💀 BẠN ĐÃ THẤT BẠI!");
    this.isProcessing = true;
    const result = window.PkmScore.finishMatch({ won: false, minQuestions: this.MIN_QUESTIONS });

        // 1. Cập nhật hình ảnh Pokemon thất bại (làm xám)
        const firstPkm = this.playerTeam[0];
        const victoryImg = document.getElementById('victory-pkm-img');
        if (victoryImg && firstPkm) {
            victoryImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${firstPkm.id}.png`;
            victoryImg.style.filter = "grayscale(100%) opacity(0.7)";
        }

        // 2. Nội dung thông báo và Nút quay lại
        const expText = document.getElementById('victory-exp-text');
        if (expText) {
            expText.innerHTML = `
                <div style="color: #ff4757; font-weight: bold; font-size: 1.5em; margin-bottom: 10px;">THẤT BẠI</div>
                <p style="color: #ccc; margin-bottom: 20px;">Đội hình của bạn đã kiệt sức!</p>

                <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; border: 1px solid #444; margin-bottom: 20px;">
                    <div style="color: #4caf50; font-weight: bold;">+${result.bonusEXP} EXP</div>
                    <div style="color: #4caf50; font-weight: bold;">+${result.bonusDV} Danh vọng</div>
                    <div style="font-size: 0.8em; margin-top: 5px; color: #ffbc00;">An ủi cho lần cố gắng — thử lại để nhận thưởng lớn hơn!</div>
                </div>

                <!-- Nút bấm quay lại Map -->
                <button onclick="window.location.href='pkm_map.html'" 
                        style="background: #444; color: white; border: 2px solid #666; padding: 10px 30px; 
                               border-radius: 25px; cursor: pointer; font-weight: bold; transition: 0.3s;"
                        onmouseover="this.style.background='#ff4757'; this.style.borderColor='#fff'"
                        onmouseout="this.style.background='#444'; this.style.borderColor='#666'">
                    QUAY LẠI BẢN ĐỒconst pkmImgRef = unit.querySelector('img');
                </button>
            `;
        }

        // 3. Hiển thị Overlay
        const overlay = document.getElementById('victory-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
        }
    }
};

if (!window.PkmPreBattle) {
    // Không có màn xem trước (pkm_prebattle.js chưa nạp) -> vào thẳng trận như cũ
    window.BattleGame.init();
}
// Có PkmPreBattle: chính pkm_prebattle.js đã tự chạy begin() và sẽ gọi
// window.BattleGame.init() sau khi người chơi bấm "BẮT ĐẦU TRẬN".