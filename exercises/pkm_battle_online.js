/**
 * ==========================================================
 * PKM BATTLE ONLINE v3 — dựa trên pkm_battle.js, không đụng file gốc
 * ==========================================================
 * THAY ĐỔI SO VỚI BẢN TRƯỚC:
 *   - Trước khi phát animation ra chưởng, LUÔN hiện 1 thông báo ngắn cho
 *     BIẾT RÕ chuyện gì vừa xảy ra với CHÍNH MÌNH (trả lời đúng/sai, kịp
 *     giờ hay không, có ra chưởng hay không) — lấy từ sự kiện round:result
 *     mà server gửi riêng cho từng người.
 *   - CHỈ hỏi câu hỏi tiếp theo SAU KHI animation ra chưởng phát xong hẳn
 *     (gọi window.PkmBattleNet.readyForNextQuestion()) — không còn tình
 *     trạng vừa làm quiz mới vừa thấy chưởng của lượt cũ bay ra.
 *   - Thêm nút "Rời trận" chủ động: trừ 1 KN + 1 DV (đọc thẳng key
 *     pkm_global_exp / pkm_global_dv mà pkm_score.js đang dùng, không
 *     sửa pkm_score.js), rồi báo server kết thúc phòng ngay.
 * ==========================================================
 */

window.BattleOnlineGame = {
    playerTeam: [],
    enemyTeam: [],
    playerActiveIdx: 0,
    enemyActiveIdx: 0,
    myPlayerId: null,
    oppPlayerId: null,
    firstStateReceived: false,
    lastIsAOE: false,
    lastPrimaryId: null,
    isProcessing: false,

    async init() {
        console.log("⚔️🌐 [DEBUG] BattleOnlineGame.init() started");

        if (!window.PkmBattleNet) {
            alert("Thiếu pkm_battle_net.js — không thể vào trận online!");
            window.location.href = 'pkm.html';
            return;
        }

        await this.setupOnlineQuestionPool();
        window.addEventListener('beforeunload', () => this.restoreQuestionPool());

        window.PkmBattleNet.connect();
        this.myPlayerId = window.PkmBattleNet.getMyPlayerId();

        window.PkmBattleNet.on('stateUpdate', (state) => this.onServerState(state));
        window.PkmBattleNet.on('battleEnd', (data) => this.onBattleEnd(data));
        window.PkmBattleNet.on('opponentDisconnected', () => this.log("⚠️ Đối thủ mất kết nối, đang chờ..."));
        window.PkmBattleNet.on('opponentReconnected', () => this.log("✅ Đối thủ đã quay lại!"));

        const quizOverlay = document.getElementById("quiz-overlay");
        if (quizOverlay) quizOverlay.style.display = "flex";
        this.log("⏳ Đang đồng bộ trận đấu...");

        this.wireLeaveButton();
    },

    // ============ NGUỒN CÂU HỎI: KHÔNG lấy vocab của 1 bài cố định ============
    _prevSelectedLevel: undefined,
    async setupOnlineQuestionPool() {
        this._prevSelectedLevel = localStorage.getItem('selected_level');
        localStorage.setItem('selected_level', 'kho');

        if (!window.PkmLessonPicker) {
            console.warn("⚠️ Thiếu pkm_battle_random.js — không chọn được bài ngẫu nhiên, dùng current_mission hiện có (nếu có).");
            return;
        }
        try {
            const lesson = await window.PkmLessonPicker.pickLesson();
            if (lesson) {
                localStorage.setItem('selected_lesson_name', lesson.lessonName);
                localStorage.setItem('current_mission', JSON.stringify({ id: lesson.fullId, type: 'online' }));
                localStorage.setItem('wordBank', JSON.stringify(lesson.words));
                console.log("🌐 [BATTLE ONLINE] Bài random cho trận này:", lesson.lessonName);
            } else {
                console.warn("⚠️ Không tìm được bài phù hợp (có thể đã học hết) — dùng current_mission cũ nếu có.");
            }
        } catch (e) {
            console.warn("⚠️ Lỗi khi chọn bài random cho online:", e);
        }
    },
    restoreQuestionPool() {
        if (this._prevSelectedLevel === undefined) return;
        if (this._prevSelectedLevel === null) localStorage.removeItem('selected_level');
        else localStorage.setItem('selected_level', this._prevSelectedLevel);
        this._prevSelectedLevel = undefined;
    },

    // ============ RỜI TRẬN CHỦ ĐỘNG — trừ 1 KN + 1 DV ============
    wireLeaveButton() {
        const btn = document.getElementById('btn-leave-battle');
        if (btn) btn.onclick = () => this.requestLeaveBattle();
    },
    requestLeaveBattle() {
        const ok = confirm("Bạn có chắc muốn rời trận? Bạn sẽ bị trừ 1 KN và 1 DV vì bỏ dở giữa chừng.");
        if (!ok) return;
        this.applyLeavePenalty();
        if (window.PkmBattleNet) window.PkmBattleNet.leaveBattle();
        this.restoreQuestionPool();
        window.location.href = 'pkm.html';
    },
    applyLeavePenalty() {
        try {
            const exp = Math.max(0, (parseInt(localStorage.getItem('pkm_global_exp'), 10) || 0) - 1);
            const dv = Math.max(0, (parseInt(localStorage.getItem('pkm_global_dv'), 10) || 0) - 1);
            localStorage.setItem('pkm_global_exp', exp);
            localStorage.setItem('pkm_global_dv', dv);
        } catch (e) { console.warn("Không trừ được điểm rời trận:", e); }
    },

    // ============ THÔNG BÁO KẾT QUẢ LƯỢT (từ round:result) ============
    buildRoundResultMessage(rr) {
        if (!rr) return null;
        if (rr.wasPrimary) {
            if (!rr.submitted) return "⌛ Quá 30 giây — bạn mất lượt!";
            return rr.correct ? "✅ Bạn trả lời đúng — RA CHƯỞNG!" : "❌ Bạn trả lời sai — mất lượt.";
        }
        if (!rr.submitted) return "📖 Câu phụ: bạn chưa kịp trả lời (không sao, không ảnh hưởng trận).";
        return rr.correct
            ? "📖 Câu phụ: bạn trả lời đúng (tính KN/DV) — chưa tới lượt chính nên chưa ra chưởng."
            : "📖 Câu phụ: bạn trả lời sai (không ảnh hưởng trận vì chưa tới lượt chính).";
    },
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

    // ============ NHẬN TRẠNG THÁI THẬT TỪ SERVER ============
    async onServerState(state) {
        this.oppPlayerId = Object.keys(state.teams).find(id => id !== this.myPlayerId) || this.oppPlayerId;

        if (!this.firstStateReceived) {
            this.firstStateReceived = true;
            this.buildTeamsFromState(state);
            this.renderBattlefield();
            this.showTelegraphForUpcoming(state);
            this.lastIsAOE = state.isAOE;
            this.lastPrimaryId = state.primaryId;
            const quizOverlay = document.getElementById("quiz-overlay");
            if (quizOverlay) quizOverlay.style.display = "flex";
            window.PkmBattleNet.readyForNextQuestion(); // hỏi câu ĐẦU TIÊN
            return;
        }

        // 1) Hiện thông báo kết quả lượt VỪA RỒI cho người chơi đọc trước
        const rr = window.PkmBattleNet.getLastRoundResult();
        const msg = this.buildRoundResultMessage(rr);
        if (msg) { this.log(msg); await this.sleep(1300); }

        // 2) So khớp HP cũ vs HP mới để biết vừa xảy ra chuyện gì, phát animation
        const prevAttackerWasMe = this.lastPrimaryId === this.myPlayerId;
        const attackerSide = prevAttackerWasMe ? 'player' : 'enemy';
        const defenderSide = prevAttackerWasMe ? 'enemy' : 'player';
        const attackerTeamOld = prevAttackerWasMe ? this.playerTeam : this.enemyTeam;
        const defenderTeamOld = prevAttackerWasMe ? this.enemyTeam : this.playerTeam;
        const defenderNewUnits = state.teams[prevAttackerWasMe ? this.oppPlayerId : this.myPlayerId];

        const hits = [];
        defenderNewUnits.forEach((newU, i) => {
            const oldU = defenderTeamOld[i];
            if (oldU && newU.hp < oldU.currentHp) {
                hits.push({ idx: i, damage: oldU.currentHp - newU.hp, killed: newU.hp <= 0 });
            }
        });

        const attackerActiveIdx = prevAttackerWasMe ? this.playerActiveIdx : this.enemyActiveIdx;
        const attackerUnit = attackerTeamOld[attackerActiveIdx];

        await this.playAttackAnimation({
            attackerSide, defenderSide, attackerUnit, attackerIdx: attackerActiveIdx,
            hits, isAOE: this.lastIsAOE,
        });

        // 3) Đồng bộ số liệu THẬT từ server, rồi MỚI hỏi câu tiếp theo
        this.applyServerTeams(state);
        this.updateUI();
        this.showTelegraphForUpcoming(state);
        this.lastIsAOE = state.isAOE;
        this.lastPrimaryId = state.primaryId;
        window.PkmBattleNet.readyForNextQuestion(); // CHỈ gọi SAU KHI animation xong hẳn
    },

    buildTeamsFromState(state) {
        const mine = state.teams[this.myPlayerId] || [];
        const opp = state.teams[this.oppPlayerId] || [];
        this.playerTeam = mine.map(u => ({ ...u, currentHp: u.hp }));
        this.enemyTeam = opp.map(u => ({ ...u, currentHp: u.hp }));
        this.playerActiveIdx = state.activeIdx[this.myPlayerId] || 0;
        this.enemyActiveIdx = state.activeIdx[this.oppPlayerId] || 0;
    },

    applyServerTeams(state) {
        const mine = state.teams[this.myPlayerId] || [];
        const opp = state.teams[this.oppPlayerId] || [];
        mine.forEach((u, i) => { if (this.playerTeam[i]) this.playerTeam[i].currentHp = u.hp; });
        opp.forEach((u, i) => { if (this.enemyTeam[i]) this.enemyTeam[i].currentHp = u.hp; });
        this.playerActiveIdx = state.activeIdx[this.myPlayerId] || 0;
        this.enemyActiveIdx = state.activeIdx[this.oppPlayerId] || 0;
    },

    showTelegraphForUpcoming(state) {
        const primaryIsMe = state.primaryId === this.myPlayerId;
        const attackerSide = primaryIsMe ? 'player' : 'enemy';
        const defenderSide = primaryIsMe ? 'enemy' : 'player';
        const attackerIdx = primaryIsMe ? this.playerActiveIdx : this.enemyActiveIdx;
        const defenderIdx = primaryIsMe ? this.enemyActiveIdx : this.playerActiveIdx;

        window.PkmUnitFX?.setAttacking(attackerSide, attackerIdx, true);
        if (!state.isAOE) {
            window.PkmUnitFX?.setIncoming?.(defenderSide, defenderIdx, true);
        }
    },

    async playAttackAnimation({ attackerSide, defenderSide, attackerUnit, attackerIdx, hits, isAOE }) {
        window.PkmUnitFX?.setAttacking(attackerSide, attackerIdx, false);

        if (!attackerUnit) return;
        if (attackerUnit.name && window.SkillManager) window.SkillManager.speakName(attackerUnit.name);

        if (hits.length === 0) {
            this.log(`${attackerUnit.name} đánh hụt!`);
            const playInfo = { attackerIndex: attackerIdx, attackerSide, targetSide: defenderSide, missed: true, targets: [] };
            if (window.SkillManager) await window.SkillManager.playNormalAttack(playInfo);
            return;
        }

        if (!isAOE) {
            const h = hits[0];
            const playInfo = {
                type: attackerUnit.type || 'normal', attackerIndex: attackerIdx, attackerSide,
                attackerId: attackerUnit.id, attackerName: attackerUnit.name, targetSide: defenderSide,
                damage: h.damage, isAOE: false, targets: [h.idx], isSkill: true,
            };
            if (window.SkillManager) await window.SkillManager.playNormalAttack(playInfo);
        } else {
            const playInfo = {
                type: attackerUnit.type || 'normal', attackerIndex: attackerIdx, attackerSide,
                attackerId: attackerUnit.id, attackerName: attackerUnit.name, targetSide: defenderSide,
                targets: hits.map(h => h.idx), damage: hits[0]?.damage || 0, isAOE: true, isSkill: true,
            };
            if (window.SkillManager) await window.SkillManager.play(playInfo);
        }
    },

    // ============ KẾT THÚC TRẬN — do SERVER báo, không tự tính ============
    onBattleEnd({ winnerId, reason }) {
        this.restoreQuestionPool();
        if (winnerId === this.myPlayerId) this.victory(reason);
        else if (winnerId === this.oppPlayerId) this.defeat(reason);
        else this.draw(reason);
    },

    // ============ VẼ TRẬN (TÁI DÙNG NGUYÊN VĂN TỪ pkm_battle.js) ============
    renderBattlefield() {
        const arena = document.getElementById('battle-arena');
        if (arena) arena.className = 'battle-arena';
        const pContainer = document.getElementById('player-team-container');
        const eContainer = document.getElementById('enemy-team-container');
        if (!pContainer || !eContainer) return;
        pContainer.innerHTML = '';
        eContainer.innerHTML = '';
        const teamSize = Math.max(this.playerTeam.length, this.enemyTeam.length);
        if (window.SkillManager?.resetNormalStylePools) window.SkillManager.resetNormalStylePools();
        if (window.PkmStyles?.assignEnemyTrainers) window.PkmStyles.assignEnemyTrainers(teamSize);

        this.enemyTeam.forEach((p, i) => {
            if (window.PkmStyles?.renderTrainer) eContainer.innerHTML += window.PkmStyles.renderTrainer('enemy', i, teamSize);
        });
        this.playerTeam.forEach((p, i) => { pContainer.innerHTML += this.createUnitHTML(p, i, 'player', teamSize); });
        this.enemyTeam.forEach((p, i) => { eContainer.innerHTML += this.createUnitHTML(p, i, 'enemy', teamSize); });
        this.playerTeam.forEach((p, i) => { if (p.currentHp > 0) window.PkmUnitFX?.attachBaseRings('player', i); });
        this.enemyTeam.forEach((p, i) => { if (p.currentHp > 0) window.PkmUnitFX?.attachBaseRings('enemy', i); });

        this.updateActiveStatus();
    },
    createUnitHTML(pkm, index, side, teamSize) {
        return window.PkmStyles.renderUnit(pkm, index, side, teamSize);
    },

    updateUI() {
        [...this.playerTeam.entries()].forEach(([i, p]) => {
            const fill = document.getElementById(`player-hp-fill-${i}`);
            const text = document.getElementById(`player-hp-text-${i}`);
            if (fill) {
                const pct = Math.max(0, (p.currentHp / p.maxHp) * 100);
                fill.style.width = pct + "%";
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
                fill.style.width = pct + "%";
                fill.style.background = pct > 50 ? "#2ecc71" : pct > 25 ? "#f1c40f" : "#e74c3c";
            }
            if (text) text.innerText = `${Math.max(0, p.currentHp)}/${p.maxHp}`;
            this.markDeadIfNeeded(`enemy-unit-${i}`, p.currentHp);
        });
        this.updateActiveStatus();
    },
    markDeadIfNeeded(unitId, currentHp) {
        const el = document.getElementById(unitId);
        if (!el) return;
        if (currentHp <= 0) {
            el.dataset.dead = '1';
            if (!el._teleportData) {
                el.style.opacity = '0';
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
        const pEl = document.getElementById(`player-unit-${this.playerActiveIdx}`);
        if (pEl) pEl.classList.add('active-unit');
        const eEl = document.getElementById(`enemy-unit-${this.enemyActiveIdx}`);
        if (eEl) eEl.classList.add('active-unit');
    },
    log(msg) {
        console.log("🎮🌐 [BATTLE ONLINE]: " + msg);
        const logElement = document.getElementById('turn-display');
        if (logElement) {
            logElement.innerHTML = msg;
            logElement.style.display = 'block';
            if (this.turnTimeout) clearTimeout(this.turnTimeout);
            this.turnTimeout = setTimeout(() => { logElement.style.display = 'none'; }, 1200);
        }
    },

    // ============ KẾT QUẢ TRẬN ============
    victory(reason) {
        const msg = reason === 'opponent_left_voluntarily' ? "🏆 ĐỐI THỦ ĐÃ RỜI TRẬN — BẠN THẮNG!"
            : reason === 'opponent_disconnected' ? "🏆 ĐỐI THỦ MẤT KẾT NỐI — BẠN THẮNG!"
            : "🏆 CHIẾN THẮNG!";
        this.log(msg);
        const result = window.PkmScore ? window.PkmScore.finishMatch({ won: true, minQuestions: 0, allowLessonUnlock: false }) : {};
        this.showResultOverlay(true, result, reason);
    },
    defeat(reason) {
        this.log("💀 BẠN ĐÃ THUA TRẬN!");
        const result = window.PkmScore ? window.PkmScore.finishMatch({ won: false, minQuestions: 0, allowLessonUnlock: false }) : {};
        this.showResultOverlay(false, result, reason);
    },
    draw(reason) {
        this.log("🤝 HOÀ!");
        const result = window.PkmScore ? window.PkmScore.finishMatch({ won: false, minQuestions: 0, allowLessonUnlock: false }) : {};
        this.showResultOverlay(null, result, reason);
    },
    showResultOverlay(won, result, reason) {
        const firstPkm = this.playerTeam[0];
        const victoryImg = document.getElementById('victory-pkm-img');
        if (victoryImg && firstPkm) {
            victoryImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${firstPkm.id}.png`;
            victoryImg.style.filter = won === false ? "grayscale(100%) opacity(0.7)" : "";
        }
        const expText = document.getElementById('victory-exp-text');
        const title = won === true ? "🏆 CHIẾN THẮNG" : won === false ? "💀 THẤT BẠI" : "🤝 HOÀ";
        const color = won === true ? "#2ecc71" : won === false ? "#ff4757" : "#f1c40f";
        if (expText) {
            expText.innerHTML = `
                <div style="color:${color}; font-weight:bold; font-size:1.4em; margin-bottom:10px;">${title}</div>
                <div style="color:#4caf50; font-size:16px; font-weight:bold;">+${result.bonusEXP || 0} KN &nbsp; +${result.bonusDV || 0} DV</div>
                <div style="color:#aaa; font-size:12px; margin:8px 0;">Tổng: ${result.newEXP || 0} KN | ${result.newDV || 0} DV</div>
                <button onclick="window.location.href='pkm.html'"
                        style="background:${color}; color:white; border:none; padding:10px 30px;
                               border-radius:25px; cursor:pointer; font-weight:bold;">
                    TIẾP TỤC
                </button>`;
        }
        const overlay = document.getElementById('victory-overlay');
        if (overlay) overlay.style.display = 'flex';
    },
};

// KHÔNG tự gọi init() ở đây nữa — trang .html chỉ gọi khi thực sự có 1
// phòng đang chờ (tránh chạy nhầm khi ai đó mở thẳng trang này mà chưa
// ghép trận qua pkm_presence.js).
if (sessionStorage.getItem("pkm_net_room_id")) {
    window.BattleOnlineGame.init();
}