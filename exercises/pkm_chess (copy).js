/**
 * ==========================================================
 * PKM CHESS — CỜ VUA POKÉMON (BẢN 2)
 * ==========================================================
 * THAY ĐỔI SO VỚI BẢN 1 (theo yêu cầu mới):
 *
 *  1) CHỈ CẦN 6 POKÉMON CHO CẢ VÁN — Vua/Hậu/Xe/Tượng/Mã/Tốt, DÙNG CHUNG
 *     CHO CẢ 2 PHE (quân Tốt bên ta và bên địch là ĐÚNG 1 con Pokémon,
 *     chỉ khác viền trắng/đen). Người chơi TỰ CHỌN trong toàn bộ kho
 *     Pokémon đang sở hữu (không phải chỉ đội hình), thiếu con nào thì hệ
 *     thống random thêm qua PokeAPI cho đủ 6.
 *
 *  2) SPRITE ĐỘNG ĐÚNG HƯỚNG — dùng lại đúng quy ước của pkm_styles.js:
 *     phe ta = thư mục "ani-back" (quay lưng/nhìn lên trên), phe địch =
 *     thư mục "ani" (quay mặt xuống dưới) — y hệt trận đấu thật.
 *
 *  3) VIỀN TRẮNG/ĐEN dạng "huy hiệu" tròn ĐẶT SAU sprite (không phải viền
 *     thẳng lên ảnh trong suốt — sẽ xấu vì ảnh GIF không lấp đầy khung).
 *     Mọi quân cùng 1 kích cỡ cố định (không co giãn theo loài).
 *
 *  4) HIỆU ỨNG RA CHIÊU DÙNG ĐÚNG ENGINE THẬT (pkm_skill_normal.js +
 *     pkm_skill_aoe.js) — KHÔNG dùng pkm_tower_skill.js (nhẹ) nữa, vì cờ
 *     vua là lượt-đối-lượt (không có chuyện nhiều tháp bắn dồn dập cùng
 *     lúc như Thủ Thành), nên dùng bản đầy đủ hoàn toàn không lo đơ máy.
 *     CHỈ DÙNG 3/4 kiểu chiêu của engine đó — bigOrb / stream / themed —
 *     BỎ kiểu "physical" (đấm trực diện) vì kiểu đó tính vị trí theo
 *     calc(-50% + Xpx), giả định quân đã có sẵn transform:translate(-50%,
 *     -50%) kiểu pkm_battle. Quân cờ nằm trong Ô LƯỚI (CSS Grid) không có
 *     nền đó — dùng nguyên xi sẽ bị giật lệch vị trí lúc ra đòn.
 *
 *  5) BÀN CỜ NGHIÊNG 3D — dùng CSS perspective/rotateX (không sao chép ảnh
 *     tham khảo vì đó là tài sản có bản quyền của 1 game khác), phủ toàn
 *     màn hình.
 *
 *  6) ĐỘ KHÓ AI do NGƯỜI CHƠI CHỌN (Dễ/Trung bình/Khó) ở màn riêng, tách
 *     biệt với màn chọn cấp độ quiz. Quiz cứ 2 NƯỚC ĐI (của người chơi)
 *     hỏi 1 câu; tối thiểu 8 câu mới được tính thưởng EXP/DV (điều kiện
 *     thắng, qua PkmScore.finishMatch minQuestions).
 * ==========================================================
 */

window.ChessGame = {
    // ================= CẤU HÌNH =================
    STORAGE_KEY: 'pkm_chess_state',
    RESET_AFTER_DAYS: 3,
    QUIZ_EVERY_N_MOVES: 2,     // cứ 2 nước đi CỦA NGƯỜI CHƠI thì hỏi 1 câu
    WRONG_STUN_MS: 5000,       // trả lời sai -> hoãn ván cờ 5 giây
    MIN_QUESTIONS: 8,          // tối thiểu 8 câu mới được tính thưởng EXP/DV

    UNIT_SIZE: 64,             // kích cỡ CỐ ĐỊNH cho MỌI quân, không phụ thuộc loài

    PIECE_VALUE: { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 },
    ROLE_LABEL: { pawn: 'Tốt', knight: 'Mã', bishop: 'Tượng', rook: 'Xe', queen: 'Hậu', king: 'Vua' },
    // Chỉ 6 vai — DÙNG CHUNG cho cả 2 phe (không phải 6 vai/phe)
    ROLE_ORDER: ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'],

    // Độ khó AI — người chơi chọn, không còn suy ra từ round nữa
    AI_DIFFICULTY: {
        de:         { label: 'Dễ',         blunderChance: 0.55, depth: 1 },
        trung_binh: { label: 'Trung bình', blunderChance: 0.28, depth: 1 },
        kho:        { label: 'Khó',        blunderChance: 0.08, depth: 2 },
    },

    session: null,
    board: null, // board[r][c] = null | {side, role, entry, el, idx}

    // ================= 1. LƯU TRỮ LÂU DÀI =================
    todayStr() { return new Date().toISOString().split('T')[0]; },
    daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); },
    defaultState() { return { gold: 0, round: 1, roster: null, lastPlayDate: this.todayStr() }; },

    loadPersisted() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(this.STORAGE_KEY)); } catch (e) { raw = null; }
        if (!raw) return { state: this.defaultState(), wasReset: true };
        const gap = this.daysBetween(raw.lastPlayDate || this.todayStr(), this.todayStr());
        if (gap >= this.RESET_AFTER_DAYS) return { state: this.defaultState(), wasReset: true };
        // Bản cũ có thể còn roster 16 con (bản 1) — nếu không đúng 6 thì coi
        // như chưa có, bắt build/chọn lại từ đầu cho khớp thiết kế mới.
        if (raw.roster && raw.roster.length !== this.ROLE_ORDER.length) raw.roster = null;
        return { state: raw, wasReset: false };
    },

    savePersisted() {
        this.session.persisted.lastPlayDate = this.todayStr();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.session.persisted));
    },

    wipeAndRestart() {
        this.session.persisted = this.defaultState();
        this.savePersisted();
    },

    // ================= 2. CHIẾN LỰC (CP) + KHO POKÉMON =================
    calcCP(baseStats, lv = 1) {
        const hp = baseStats?.hp || 20, atk = baseStats?.atk || 20,
              def = baseStats?.def || 15, sAtk = baseStats?.sAtk || 20;
        const baseCP = (hp * 15) + (def * 17.6) + (atk * 20) + (sAtk * 28.8);
        return Math.floor(baseCP * (1 + (lv - 1) * 0.1));
    },

    async fetchPokeData(id) {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        const data = await res.json();
        const stat = (n) => (data.stats.find(s => s.stat.name === n) || {}).base_stat || 20;
        return {
            id: data.id,
            name: data.name.charAt(0).toUpperCase() + data.name.slice(1),
            type: (data.types[0] || { type: { name: 'normal' } }).type.name,
            baseStats: { hp: stat('hp'), atk: stat('attack'), def: stat('defense'), sAtk: stat('special-attack') },
        };
    },

    makeRosterEntry(d, role) {
        return {
            uid: 'c' + Math.random().toString(36).slice(2, 9),
            pkmId: d.pkmId, name: d.name, type: d.type || 'normal', gen: d.gen || 1,
            cp: this.calcCP(d.baseStats, 1),
            role,
        };
    },

    // Toàn bộ Pokémon ĐANG SỞ HỮU (không chỉ đội hình) — dùng cho màn chọn quân
    getOwnedList() {
        const inv = JSON.parse(localStorage.getItem('pkm_inventory')) || [];
        return inv.map(p => ({
            pkmId: p.id, name: p.name, type: p.type, gen: p.gen, baseStats: p.baseStats,
            cp: this.calcCP(p.baseStats, 1),
        }));
    },

    // Lấp 1 vai còn thiếu bằng Pokémon RANDOM qua PokeAPI — thử vài ID khác
    // nhau nếu lỗi mạng, KHÔNG rơi vào 1 con fallback cố định lặp lại nhiều
    // lần (tránh tình trạng "toàn bộ quân giống hệt nhau" nếu mạng chập chờn).
    async fetchRandomFiller(excludeIds) {
        for (let attempt = 0; attempt < 5; attempt++) {
            const id = Math.floor(Math.random() * 649) + 1;
            if (excludeIds.has(id)) continue;
            try {
                const d = await this.fetchPokeData(id);
                excludeIds.add(id);
                return { ...d, gen: 1 };
            } catch (e) { /* thử ID khác */ }
        }
        // Vẫn lỗi mạng sau nhiều lần thử — dùng ID tăng dần theo số quân đã
        // có, KHÔNG BAO GIỜ trùng 1 con cố định.
        const fallbackId = 1 + (excludeIds.size % 649);
        excludeIds.add(fallbackId);
        return { pkmId: fallbackId, name: `Pokémon #${fallbackId}`, type: 'normal', gen: 1, baseStats: { hp: 45, atk: 49, def: 49, sAtk: 65 } };
    },

    // Tự động lấp đủ 6 vai (ưu tiên CP cao nhất trong kho sở hữu), dùng làm
    // GIÁ TRỊ MẶC ĐỊNH cho màn chọn quân — người chơi có thể đổi lại sau.
    async buildDefaultRoster() {
        const owned = this.getOwnedList().sort((a, b) => b.cp - a.cp);
        const used = new Set();
        const roster = [];
        for (const role of this.ROLE_ORDER) {
            const pick = owned.find(o => !used.has(o.pkmId));
            if (pick) { used.add(pick.pkmId); roster.push(this.makeRosterEntry(pick, role)); }
            else {
                const d = await this.fetchRandomFiller(used);
                roster.push(this.makeRosterEntry(d, role));
            }
        }
        return roster;
    },

    // ================= 3. KHỞI TẠO =================
    async init() {
        this.injectStyles();

        // Cảnh nền (núi/rừng/biển/đồng bằng) phía sau bàn cờ — vẽ 1 lần,
        // sau đó chỉ đổi theme (đổi màu/biến CSS) mỗi ván, không build lại DOM.
        if (window.ChessScenery) {
            window.ChessScenery.mount('chess-scenery');
        } else {
            console.warn('⚠️ [CHESS] Không tìm thấy window.ChessScenery — kiểm tra lại đã thêm file "pkm_chess_scenery.js" vào project và có <script src="pkm_chess_scenery.js"> TRƯỚC <script src="pkm_chess.js"> trong HTML chưa.');
        }

        // Xoay máy / đổi cỡ màn hình -> đo lại chiều cao thật của bàn cờ 3D.
        if (!this._resizeListenerBound) {
            this._resizeListenerBound = true;
            let t = null;
            window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => this.fitBoardWrap(), 120); });
            window.addEventListener('orientationchange', () => setTimeout(() => this.fitBoardWrap(), 250));
        }

        const { state, wasReset } = this.loadPersisted();
        this.session = {
            persisted: state,
            correctCount: 0, wrongCount: 0, totalCount: 0,
            playerMoveCount: 0,
            turn: 'player',
            inputLocked: true,
            selected: null,
            gameEnded: false,
            aiDifficulty: 'trung_binh',
        };

        if (wasReset || !this.session.persisted.roster) {
            this.log('♟️ Bắt đầu chiến dịch Cờ Vua mới!');
            this.session.persisted.roster = await this.buildDefaultRoster();
            this.savePersisted();
        }

        if (window.QuizManager) window.QuizManager.prepareData();

        const quizOverlay = document.getElementById('quiz-overlay');
        if (quizOverlay) quizOverlay.style.display = 'none';

        const renderLevelSelect = (container) => new Promise((resolve) => {
            const LEVELS = [
                { key: 'de', emoji: '🟢', label: 'Dễ' },
                { key: 'trung_binh', emoji: '🟡', label: 'Trung bình' },
                { key: 'kho', emoji: '🔴', label: 'Khó' },
            ];
            container.innerHTML = `
                <div style="text-align:center;">
                    <div style="font-size:16px;color:#f0c766;font-weight:700;margin-bottom:18px;">♟️ Chọn cấp độ câu hỏi!</div>
                    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
                        ${LEVELS.map(lv => `
                            <div class="chess-level-card" data-level="${lv.key}" style="
                                background:rgba(255,255,255,.06); border:2px solid rgba(240,199,102,.35);
                                border-radius:16px; padding:18px 22px; text-align:center; cursor:pointer; min-width:110px;">
                                <div style="font-size:34px;">${lv.emoji}</div>
                                <div style="font-weight:800;color:#f0c766;margin-top:6px;font-size:15px;">${lv.label}</div>
                            </div>`).join('')}
                    </div>
                </div>`;
            container.querySelectorAll('.chess-level-card').forEach(card => {
                card.onclick = () => { localStorage.setItem('selected_level', card.dataset.level); resolve(); };
            });
        });

        // Màn chọn ĐỘ KHÓ AI — TÁCH RIÊNG khỏi cấp độ câu hỏi ở trên
        const renderAIDifficultySelect = (container) => new Promise((resolve) => {
            const opts = [
                { key: 'de', emoji: '🟢', label: 'Dễ', sub: 'Máy hay đi ẩu' },
                { key: 'trung_binh', emoji: '🟡', label: 'Trung bình', sub: 'Máy biết ăn quân lời' },
                { key: 'kho', emoji: '🔴', label: 'Khó', sub: 'Máy tính trước 2 nước' },
            ];
            container.innerHTML = `
                <div style="text-align:center;">
                    <div style="font-size:16px;color:#f0c766;font-weight:700;margin-bottom:18px;">🤖 Chọn độ thông minh của máy!</div>
                    <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
                        ${opts.map(o => `
                            <div class="chess-ai-card" data-key="${o.key}" style="
                                background:rgba(255,255,255,.06); border:2px solid rgba(240,199,102,.35);
                                border-radius:16px; padding:16px 20px; text-align:center; cursor:pointer; min-width:130px;">
                                <div style="font-size:34px;">${o.emoji}</div>
                                <div style="font-weight:800;color:#f0c766;margin-top:6px;font-size:15px;">${o.label}</div>
                                <div style="font-size:11px;color:#aaa;margin-top:4px;">${o.sub}</div>
                            </div>`).join('')}
                    </div>
                </div>`;
            container.querySelectorAll('.chess-ai-card').forEach(card => {
                card.onclick = () => resolve(card.dataset.key);
            });
        });

        window.startPokemonBattle = async () => {
            let mainCard = document.getElementById('mainCard');
            if (!mainCard) { mainCard = document.createElement('div'); mainCard.id = 'mainCard'; document.body.appendChild(mainCard); }
            mainCard.style.cssText = `position:fixed; inset:0; background:radial-gradient(circle,#1c140a 0%,#0a0705 100%);
                z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;`;

            await renderLevelSelect(mainCard);
            if (window.QuizManager) { window.QuizManager.loadLevel(); window.QuizManager.initSkillPools(); }

            this.session.aiDifficulty = await renderAIDifficultySelect(mainCard);

            mainCard.style.display = 'none';
            this.updateHud();
            await this.openRoleAssignScreen(); // cho người chơi TỰ CHỌN 6 Pokémon trước khi vào ván
            this.startMatch();
        };

        if (window.VocabularyModule && typeof window.VocabularyModule.start === 'function') {
            await window.VocabularyModule.start();
        } else {
            window.startPokemonBattle();
        }
    },

    // ================= 4. MÀN CHỌN QUÂN (tương tác, 6 vai dùng chung 2 phe) =================
    openRoleAssignScreen() {
        return new Promise((resolve) => {
            const overlay = document.getElementById('role-assign-overlay');
            if (!overlay) { resolve(); return; } // HTML chưa có màn này thì bỏ qua, dùng roster mặc định

            this._selectedBenchPkmId = null;
            const renderAll = () => {
                const roster = this.session.persisted.roster;
                const grid = document.getElementById('role-assign-grid');
                grid.innerHTML = this.ROLE_ORDER.map(role => {
                    const entry = roster.find(e => e.role === role);
                    return `
                        <div class="role-slot" data-role="${role}">
                            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${entry.pkmId}.png">
                            <div class="role-slot-label">${this.ROLE_LABEL[role]}</div>
                            <div class="role-slot-name">${entry.name}</div>
                        </div>`;
                }).join('');
                grid.querySelectorAll('.role-slot').forEach(el => {
                    el.onclick = () => {
                        if (!this._selectedBenchPkmId) return;
                        const owned = this.getOwnedList();
                        const chosen = owned.find(o => o.pkmId === this._selectedBenchPkmId);
                        if (!chosen) return;
                        const role = el.dataset.role;
                        const idx = roster.findIndex(e => e.role === role);
                        roster[idx] = this.makeRosterEntry(chosen, role);
                        this._selectedBenchPkmId = null;
                        this.savePersisted();
                        renderAll();
                    };
                });

                const bench = document.getElementById('role-assign-bench');
                const owned = this.getOwnedList();
                bench.innerHTML = owned.length
                    ? owned.map(o => `
                        <div class="bench-item ${this._selectedBenchPkmId === o.pkmId ? 'selected' : ''}" data-id="${o.pkmId}">
                            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${o.pkmId}.png">
                            <div class="bench-item-name">${o.name}</div>
                        </div>`).join('')
                    : `<div style="color:#888;font-size:12px;">Kho trống — dùng Pokémon random cho đủ 6 vai.</div>`;
                bench.querySelectorAll('.bench-item').forEach(el => {
                    el.onclick = () => {
                        const id = parseInt(el.dataset.id, 10);
                        this._selectedBenchPkmId = (this._selectedBenchPkmId === id) ? null : id;
                        renderAll();
                    };
                });
            };

            renderAll();
            overlay.style.display = 'flex';
            document.getElementById('role-assign-start-btn').onclick = () => {
                overlay.style.display = 'none';
                resolve();
            };
        });
    },

    // ================= 5. DỰNG BÀN CỜ =================
    startMatch() {
        if (window.ChessScenery) {
            window.ChessScenery.setTheme(window.ChessScenery.themeForRound(this.session.persisted.round));
        }
        this.setupBoard();
        this.renderBoard();
        this.fitBoardWrap(); // chỉ tính scale() 1 lần khi vào ván mới — không gọi lại mỗi nước đi
        this.session.turn = 'player';
        this.session.inputLocked = false;
        this.session.playerMoveCount = 0;
        this.session.gameEnded = false;
        this.updateTurnIndicator();
        this.log(`♟️ Ván ${this.session.persisted.round} bắt đầu — bạn đi trước!`);
    },

    // Vị trí chuẩn: hàng 0 = hậu phương địch (trên), hàng 7 = hậu phương ta (dưới)
    BACK_RANK: ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'],

    setupBoard() {
        const roster = this.session.persisted.roster; // 6 entry, DÙNG CHUNG cho cả 2 phe
        const byRole = {};
        roster.forEach(e => { byRole[e.role] = e; });

        this.board = Array.from({ length: 8 }, () => Array(8).fill(null));

        const placeSide = (side, backRow, pawnRow) => {
            let idx = 0;
            this.BACK_RANK.forEach((role, c) => {
                this.board[backRow][c] = { side, role, entry: byRole[role], el: null, idx: idx++ };
            });
            for (let c = 0; c < 8; c++) {
                this.board[pawnRow][c] = { side, role: 'pawn', entry: byRole.pawn, el: null, idx: idx++ };
            }
        };

        placeSide('player', 7, 6);
        placeSide('enemy', 0, 1);
    },

    renderBoard() {
        const boardEl = document.getElementById('chess-board');
        if (!boardEl) return;
        boardEl.innerHTML = '';
        const CELL = 60; // 8 × 60 = 480px, khớp đúng #chess-board 480×480 ở CSS
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const sq = document.createElement('div');
                sq.className = `chess-square ${(r + c) % 2 === 0 ? 'sq-light' : 'sq-dark'}`;
                sq.dataset.r = r; sq.dataset.c = c;
                sq.style.left = (c * CELL) + 'px';
                sq.style.top = (r * CELL) + 'px';
                sq.style.width = CELL + 'px';
                sq.style.height = CELL + 'px';
                sq.onclick = () => this.onSquareClick(r, c);
                boardEl.appendChild(sq);

                const piece = this.board[r][c];
                if (piece) {
                    const el = this.buildPieceElement(piece, c);
                    piece.el = el;
                    sq.appendChild(el);
                }
            }
        }
        // KHÔNG gọi fitBoardWrap() ở đây — hàm này chỉ nên chạy 1 lần khi vào
        // ván mới (startMatch) + khi resize/orientationchange, KHÔNG chạy lại
        // mỗi lần đi quân, nếu không kích thước ô sẽ "trôi" dần qua từng nước.
    },

    // Cấu trúc DOM tương thích với pkm_skill_normal.js:
    //   attacker.querySelector('div')  -> PHẢI ra đúng .piece-scale-wrap
    //   attacker.dataset.scale/.flip   -> đọc trực tiếp
    // Vì vậy nhãn vai trò dùng <span> (không phải <div>) để không bị nhầm
    // là "div đầu tiên", và huy hiệu tròn trắng/đen nằm TRONG scale-wrap,
    // phía SAU ảnh (z-index thấp hơn).
    pieceFlipFor(side, c) {
        const isLeftHalf = c < 4;
        return side === 'player' ? (isLeftHalf ? 1 : -1) : (isLeftHalf ? -1 : 1);
    },
    buildPieceElement(piece, c) {
        const side = piece.side;
        const folder = side === 'player' ? 'ani-back' : 'ani'; // ta nhìn lên trên, địch nhìn xuống dưới — đúng quy ước pkm_styles.js
        const cleanName = (piece.entry.name || 'pikachu').toLowerCase().replace(/\s+/g, '');
        const imgUrl = `https://play.pokemonshowdown.com/sprites/${folder}/${cleanName}.gif`;
        const fallbackUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${piece.entry.pkmId}.png`;
        const size = this.UNIT_SIZE;

        // Quân bên trái (cột 0-3) và bên phải (cột 4-7) quay mặt ngược nhau
        // để "nhìn vào giữa bàn cờ" — phe ta và phe địch đối xứng nhau.
        const flip = this.pieceFlipFor(side, c);

        const el = document.createElement('div');
        el.className = `pkm-unit chess-piece side-${side}`;
        el.id = `${side}-unit-${piece.idx}`;
        el.dataset.scale = 1;   // CỐ ĐỊNH — mọi quân cùng kích cỡ, không co giãn theo loài
        el.dataset.flip = flip;
        el.dataset.type = piece.entry.type;
        el.innerHTML = `
            <span class="piece-label">${this.ROLE_LABEL[piece.role]}</span>
            <div class="piece-scale-wrap" style="width:${size}px;height:${size}px;">
                <div class="piece-badge side-${side}"></div>
                <img src="${imgUrl}" alt="${piece.entry.name}" loading="lazy"
                     onerror="this.onerror=null; this.src='${fallbackUrl}';">
            </div>`;
        return el;
    },

    getSquareEl(r, c) { return document.querySelector(`.chess-square[data-r="${r}"][data-c="${c}"]`); },
    moveElementToSquare(el, r, c, side) {
        const sq = this.getSquareEl(r, c);
        if (sq && el) sq.appendChild(el);
        if (el && side) el.dataset.flip = this.pieceFlipFor(side, c);
    },

    // Bàn cờ luôn có kích thước THAM CHIẾU cố định 480×480 (xem CSS +
    // renderBoard). Ở đây chỉ tính 1 hệ số scale() duy nhất để khối 480×480
    // đó vừa với màn hình — không đụng gì tới width/height/grid của các ô,
    // nên 8×8 ô luôn hiện đủ và luôn bằng nhau tuyệt đối, bất kể đi quân.
    //
    // Đo hình học của #chess-board-tilt ở scale(1) để biết chiều cao THẬT
    // sau khi xoay rotateX(42deg) — con số này CỐ ĐỊNH về mặt hình học (chỉ
    // phụ thuộc góc xoay + perspective, không phụ thuộc quân cờ), nên đo 1
    // lần là đủ, gọi lại nhiều lần cũng luôn ra cùng 1 kết quả (không trôi).
    fitBoardWrap() {
        const wrap = document.getElementById('chess-board-wrap');
        const tilt = document.getElementById('chess-board-tilt');
        const arena = document.getElementById('arena-area');
        if (!wrap || !tilt) return;
        requestAnimationFrame(() => {
            const REF = 480;
            tilt.style.left = '0px';
            tilt.style.transform = 'rotateX(42deg)';
            const naturalH = tilt.getBoundingClientRect().height || REF * 0.62;

            const availW = (arena ? arena.clientWidth : window.innerWidth) * 0.94;
            const availH = arena ? Math.max(140, arena.clientHeight - 20) : window.innerHeight * 0.72;
            const widthLimitFromHeight = availH * (REF / naturalH);
            const targetPx = Math.max(160, Math.min(availW, widthLimitFromHeight, 640));
            const factor = targetPx / REF;

            // wrap: chỉ đặt đúng kích thước để flex cha canh giữa, KHÔNG xoay/scale gì cả
            wrap.style.width = Math.ceil(REF * factor) + 'px';
            wrap.style.height = Math.ceil(naturalH * factor) + 'px';

            // tilt: luôn giữ 480×480 gốc rồi tự scale, chỉ dịch "left" để tâm
            // ngang của nó trùng đúng tâm wrap (bất kể factor bao nhiêu)
            const wrapWidth = REF * factor;
            tilt.style.left = (wrapWidth / 2 - REF / 2) + 'px';
            tilt.style.transform = `scale(${factor}) rotateX(42deg)`;
        });
    },

    // ================= 6. LUẬT CỜ =================
    onBoard(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; },
    getPiece(board, r, c) { return this.onBoard(r, c) ? board[r][c] : null; },

    cloneBoard(board) { return board.map(row => row.slice()); },

    simulateMove(board, from, to) {
        const nb = this.cloneBoard(board);
        let piece = nb[from.r][from.c];
        nb[to.r][to.c] = piece;
        nb[from.r][from.c] = null;
        if (piece && piece.role === 'pawn' && (to.r === 0 || to.r === 7)) {
            nb[to.r][to.c] = { ...piece, role: 'queen' }; // phong Hậu (chỉ ảnh hưởng bản sao dùng để tính luật/AI)
        }
        return nb;
    },

    pawnMovesRaw(board, r, c, side) {
        const dir = side === 'player' ? -1 : 1;
        const startRow = side === 'player' ? 6 : 1;
        const moves = [];
        const oneR = r + dir;
        if (this.onBoard(oneR, c) && !this.getPiece(board, oneR, c)) {
            moves.push({ r: oneR, c });
            const twoR = r + dir * 2;
            if (r === startRow && !this.getPiece(board, twoR, c)) moves.push({ r: twoR, c });
        }
        [-1, 1].forEach(dc => {
            const nr = r + dir, nc = c + dc;
            const p = this.getPiece(board, nr, nc);
            if (p && p.side !== side) moves.push({ r: nr, c: nc });
        });
        return moves;
    },

    knightMovesRaw(board, r, c, side) {
        const offsets = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
        return offsets.map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
            .filter(({ r: nr, c: nc }) => this.onBoard(nr, nc))
            .filter(({ r: nr, c: nc }) => { const p = this.getPiece(board, nr, nc); return !p || p.side !== side; });
    },

    kingMovesRaw(board, r, c, side) {
        const moves = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (!this.onBoard(nr, nc)) continue;
            const p = this.getPiece(board, nr, nc);
            if (!p || p.side !== side) moves.push({ r: nr, c: nc });
        }
        return moves;
    },

    slidingMovesRaw(board, r, c, side, dirs) {
        const moves = [];
        dirs.forEach(([dr, dc]) => {
            let nr = r + dr, nc = c + dc;
            while (this.onBoard(nr, nc)) {
                const p = this.getPiece(board, nr, nc);
                if (!p) { moves.push({ r: nr, c: nc }); }
                else { if (p.side !== side) moves.push({ r: nr, c: nc }); break; }
                nr += dr; nc += dc;
            }
        });
        return moves;
    },

    ROOK_DIRS: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    BISHOP_DIRS: [[1, 1], [1, -1], [-1, 1], [-1, -1]],

    pieceMovesRaw(board, r, c) {
        const p = this.getPiece(board, r, c);
        if (!p) return [];
        switch (p.role) {
            case 'pawn': return this.pawnMovesRaw(board, r, c, p.side);
            case 'knight': return this.knightMovesRaw(board, r, c, p.side);
            case 'king': return this.kingMovesRaw(board, r, c, p.side);
            case 'rook': return this.slidingMovesRaw(board, r, c, p.side, this.ROOK_DIRS);
            case 'bishop': return this.slidingMovesRaw(board, r, c, p.side, this.BISHOP_DIRS);
            case 'queen': return this.slidingMovesRaw(board, r, c, p.side, [...this.ROOK_DIRS, ...this.BISHOP_DIRS]);
            default: return [];
        }
    },

    findKing(board, side) {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.side === side && p.role === 'king') return { r, c, piece: p };
        }
        return null;
    },

    isSquareAttacked(board, r, c, bySide) {
        const dirBySide = bySide === 'player' ? -1 : 1;
        const attackerRow = r - dirBySide;
        for (const cc of [c - 1, c + 1]) {
            const p = this.getPiece(board, attackerRow, cc);
            if (p && p.side === bySide && p.role === 'pawn') return true;
        }
        const knightOffsets = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
        for (const [dr, dc] of knightOffsets) {
            const p = this.getPiece(board, r + dr, c + dc);
            if (p && p.side === bySide && p.role === 'knight') return true;
        }
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const p = this.getPiece(board, r + dr, c + dc);
            if (p && p.side === bySide && p.role === 'king') return true;
        }
        const scan = (dirs, roles) => {
            for (const [dr, dc] of dirs) {
                let rr = r + dr, cc = c + dc;
                while (this.onBoard(rr, cc)) {
                    const p = this.getPiece(board, rr, cc);
                    if (p) { if (p.side === bySide && roles.includes(p.role)) return true; break; }
                    rr += dr; cc += dc;
                }
            }
            return false;
        };
        if (scan(this.ROOK_DIRS, ['rook', 'queen'])) return true;
        if (scan(this.BISHOP_DIRS, ['bishop', 'queen'])) return true;
        return false;
    },

    isInCheck(board, side) {
        const king = this.findKing(board, side);
        if (!king) return false;
        const opp = side === 'player' ? 'enemy' : 'player';
        return this.isSquareAttacked(board, king.r, king.c, opp);
    },

    legalMovesForPiece(board, r, c) {
        const piece = this.getPiece(board, r, c);
        if (!piece) return [];
        const raw = this.pieceMovesRaw(board, r, c);
        return raw.filter(mv => {
            const nb = this.simulateMove(board, { r, c }, mv);
            return !this.isInCheck(nb, piece.side);
        });
    },

    allLegalMoves(board, side) {
        const moves = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p || p.side !== side) continue;
            this.legalMovesForPiece(board, r, c).forEach(to => moves.push({ from: { r, c }, to }));
        }
        return moves;
    },

    isCheckmate(board, side) { return this.isInCheck(board, side) && this.allLegalMoves(board, side).length === 0; },
    isStalemate(board, side) { return !this.isInCheck(board, side) && this.allLegalMoves(board, side).length === 0; },

    // ================= 7. AI (độ khó do người chơi chọn) =================
    evalMaterial(board) {
        let score = 0;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;
            const v = this.PIECE_VALUE[p.role] || 0;
            score += (p.side === 'enemy' ? v : -v);
        }
        return score; // dương = có lợi cho AI (enemy)
    },

    negamax(board, side, depth) {
        if (depth <= 0) {
            const m = this.evalMaterial(board);
            return side === 'enemy' ? m : -m;
        }
        const moves = this.allLegalMoves(board, side);
        if (moves.length === 0) {
            const m = this.evalMaterial(board);
            return side === 'enemy' ? m : -m;
        }
        let best = -Infinity;
        const nextSide = side === 'enemy' ? 'player' : 'enemy';
        moves.forEach(mv => {
            const nb = this.simulateMove(board, mv.from, mv.to);
            const score = -this.negamax(nb, nextSide, depth - 1);
            if (score > best) best = score;
        });
        return best;
    },

    pickAIMove(board) {
        const moves = this.allLegalMoves(board, 'enemy');
        if (moves.length === 0) return null;

        const diff = this.AI_DIFFICULTY[this.session.aiDifficulty] || this.AI_DIFFICULTY.trung_binh;
        if (Math.random() < diff.blunderChance) return moves[Math.floor(Math.random() * moves.length)];

        let best = null, bestScore = -Infinity;
        moves.forEach(mv => {
            const nb = this.simulateMove(board, mv.from, mv.to);
            const score = -this.negamax(nb, 'player', diff.depth - 1);
            if (score > bestScore || (score === bestScore && Math.random() < 0.35)) { bestScore = score; best = mv; }
        });
        return best;
    },

    // ================= 8. HIỆU ỨNG RA CHIÊU (dùng thật pkm_skill_normal.js) =================
    // Chỉ 3/4 kiểu — xem giải thích ở đầu file (bỏ 'physical' vì lý do vị trí)
    async fireSkill(attackerPiece, targetPiece, damage, dist) {
        const CS = window.ChessSkill;
        if (!CS) return;
        const attackerEl = attackerPiece.el, targetEl = targetPiece.el;
        const opts = { type: attackerPiece.entry.type, damage };
        const isMelee = dist <= 1 || attackerPiece.role === 'knight';
        if (isMelee) await CS.meleeAttack(attackerEl, targetEl, opts);
        else await CS.fireRanged(attackerEl, targetEl, opts);
    },

    // ================= 9. THỰC THI 1 NƯỚC ĐI (dùng chung người chơi + AI) =================
    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },

    async performMove(fromR, fromC, toR, toC) {
        const piece = this.board[fromR][fromC];
        const captured = this.board[toR][toC];

        if (captured) {
            // Damage chỉ là con số TRANG TRÍ cho hiệu ứng (cờ vua ăn quân là
            // loại bỏ hẳn, không có khái niệm máu) — nhân lên cho "đã mắt".
            const flourishDamage = ((this.PIECE_VALUE[captured.role] || 1) * 111);
            const dist = Math.max(Math.abs(toR - fromR), Math.abs(toC - fromC));
            await this.fireSkill(piece, captured, flourishDamage, dist); // đợi đúng lúc ChessSkill chạy xong hẳn (~2s)

            if (piece.side === 'player') {
                const gold = Math.round((this.PIECE_VALUE[captured.role] || 1) * (3 + (this.session.persisted.round - 1) * 0.6));
                this.session.persisted.gold += gold;
                this.floatingText(piece.el, `+${gold}💰`, '#ffd700');
            }
            captured.el.remove();
        }

        this.board[toR][toC] = piece;
        this.board[fromR][fromC] = null;
        this.moveElementToSquare(piece.el, toR, toC, piece.side);

        // Phong cấp: Tốt tới cuối bàn -> tự động thành Hậu
        if (piece.role === 'pawn' && (toR === 0 || toR === 7)) {
            piece.role = 'queen';
            const label = piece.el.querySelector('.piece-label');
            if (label) label.innerText = this.ROLE_LABEL.queen;
            piece.el.classList.add('piece-promoted');
        }

        this.clearCheckHighlight();
        const opponentSide = piece.side === 'player' ? 'enemy' : 'player';

        if (this.isInCheck(this.board, opponentSide)) {
            const king = this.findKing(this.board, opponentSide);
            if (king) {
                this.fireSkill(piece, king.piece, 0); // chỉ chiếu — damage:0, KHÔNG xoá Vua
                this.highlightCheck(king.piece.el);
            }
            this.log(opponentSide === 'player' ? '⚠️ Vua của bạn đang bị chiếu!' : '⚔️ Bạn chiếu tướng đối thủ!');
        }

        if (this.isCheckmate(this.board, opponentSide)) return piece.side === 'player' ? 'player_win' : 'player_lose';
        if (this.isStalemate(this.board, opponentSide)) return 'draw';
        return 'continue';
    },

    // ================= 10. TƯƠNG TÁC NGƯỜI CHƠI =================
    onSquareClick(r, c) {
        const s = this.session;
        if (s.inputLocked || s.turn !== 'player' || s.gameEnded) return;

        const clickedPiece = this.board[r][c];

        if (s.selected) {
            const isTarget = s.selected.moves.some(m => m.r === r && m.c === c);
            if (isTarget) {
                const from = s.selected.pos;
                this.clearSelection();
                this.handlePlayerMove(from.r, from.c, r, c);
                return;
            }
            this.clearSelection();
            if (clickedPiece && clickedPiece.side === 'player') this.selectPiece(r, c);
            return;
        }

        if (clickedPiece && clickedPiece.side === 'player') this.selectPiece(r, c);
    },

    selectPiece(r, c) {
        const moves = this.legalMovesForPiece(this.board, r, c);
        this.session.selected = { pos: { r, c }, moves };
        this.getSquareEl(r, c)?.classList.add('sq-selected');
        moves.forEach(m => {
            const sq = this.getSquareEl(m.r, m.c);
            if (sq) sq.classList.add(this.board[m.r][m.c] ? 'sq-capture-hint' : 'sq-move-hint');
        });
    },

    clearSelection() {
        document.querySelectorAll('.sq-selected, .sq-move-hint, .sq-capture-hint')
            .forEach(el => el.classList.remove('sq-selected', 'sq-move-hint', 'sq-capture-hint'));
        this.session.selected = null;
    },

    highlightCheck(kingEl) { kingEl?.classList.add('piece-in-check'); this._checkedEl = kingEl; },
    clearCheckHighlight() { this._checkedEl?.classList.remove('piece-in-check'); this._checkedEl = null; },

    async handlePlayerMove(fromR, fromC, toR, toC) {
        const s = this.session;
        s.inputLocked = true;
        const result = await this.performMove(fromR, fromC, toR, toC);
        s.playerMoveCount++;
        this.updateHud();

        if (result === 'player_win') return this.onPlayerWin();
        if (result === 'draw') return this.onDraw();

        if (s.playerMoveCount % this.QUIZ_EVERY_N_MOVES === 0) {
            await this.runQuiz();
            if (s.gameEnded) return;
        }

        s.turn = 'enemy';
        this.updateTurnIndicator();
        await this.sleep(450);
        await this.doAITurn();
    },

    async doAITurn() {
        const s = this.session;
        if (s.gameEnded) return;
        const move = this.pickAIMove(this.board);
        if (!move) { s.inputLocked = false; s.turn = 'player'; this.updateTurnIndicator(); return; } // an toàn, không nên xảy ra

        const result = await this.performMove(move.from.r, move.from.c, move.to.r, move.to.c);
        this.updateHud();

        if (result === 'player_lose') return this.onPlayerLose();
        if (result === 'draw') return this.onDraw();

        s.turn = 'player';
        s.inputLocked = false;
        this.updateTurnIndicator();
    },

    // ================= 11. QUIZ MỖI 2 NƯỚC ĐI =================
    runQuiz() {
        return new Promise((resolve) => {
            const s = this.session;
            const overlay = document.getElementById('quiz-overlay');
            if (overlay) overlay.style.display = 'flex';

            const finish = async (isCorrect) => {
                if (window.PkmScore) window.PkmScore.recordAnswer(isCorrect);
                s.totalCount++;
                if (isCorrect) s.correctCount++; else s.wrongCount++;
                this.updateHud();
                if (overlay) overlay.style.display = 'none';
                if (!isCorrect) {
                    this.log('⏳ Trả lời sai — ván cờ bị hoãn 5 giây!');
                    document.getElementById('chess-board')?.classList.add('board-stunned');
                    await this.sleep(this.WRONG_STUN_MS);
                    document.getElementById('chess-board')?.classList.remove('board-stunned');
                }
                resolve();
            };

            if (window.QuizManager) window.QuizManager.ask((isCorrect) => finish(isCorrect));
            else finish(true);
        });
    },

    // ================= 12. KẾT THÚC VÁN =================
    onPlayerWin() {
        const s = this.session;
        s.gameEnded = true;
        s.inputLocked = true;
        let scoreResult = null;
        if (window.PkmScore) scoreResult = window.PkmScore.finishMatch({ won: true, minQuestions: this.MIN_QUESTIONS });

        const bonus = Math.round(30 + (s.persisted.round - 1) * 12);
        s.persisted.gold += bonus;
        s.persisted.round++;
        this.savePersisted();
        this.updateHud();

        // Dòng báo EXP/DV kiếm được từ quiz — chỉ hiện nếu có kết quả và
        // không bị "skipped" (tức là đã trả lời đủ số câu tối thiểu).
        let scoreLine = '';
        if (scoreResult && !scoreResult.skipped) {
            scoreLine = `<div style="color:#7ed6ff; font-size:14px; font-weight:bold; margin-top:6px;">
                            +${scoreResult.bonusEXP} EXP &nbsp; +${scoreResult.bonusDV} DV
                          </div>
                          <div style="color:#888; font-size:11px; margin-top:2px;">
                            Đúng ${scoreResult.correctCount}/${scoreResult.totalCount} câu (${scoreResult.accuracy}%)
                          </div>`;
        } else if (scoreResult && scoreResult.skipped) {
            scoreLine = `<div style="color:#e74c3c; font-size:11px; margin-top:6px;">
                            Chưa đủ ${this.MIN_QUESTIONS} câu quiz nên chưa được tính EXP/DV.
                          </div>`;
        }

        this.showEndOverlay({
            title: '🏆 CHIẾU BÍ! BẠN THẮNG!',
            color: '#f0c766',
            message: `<div style="color:#4caf50; font-size:16px; font-weight:bold;">+${bonus} 💰</div>
                       ${scoreLine}
                       <div style="color:#aaa; font-size:12px; margin-top:6px;">Ván tiếp theo (đợt ${s.persisted.round}) — chọn lại độ khó nếu muốn!</div>`,
            buttonText: '⚔️ VÁN TIẾP THEO',
            onContinue: () => window.location.reload(),
            onExit: () => window.location.href = 'pkm_mode_select.html',
        });
    },
    onPlayerLose() {
        const s = this.session;
        s.gameEnded = true;
        s.inputLocked = true;
        let scoreResult = null;
        if (window.PkmScore) scoreResult = window.PkmScore.finishMatch({ won: false, minQuestions: this.MIN_QUESTIONS });
        this.wipeAndRestart();

        this.showEndOverlay({
            title: '💀 CHIẾU BÍ! BẠN THUA!',
            color: '#e74c3c',
            message: `<div style="color:#ccc; font-size:13px;">Toàn bộ vàng và đội hình cờ đã được <b>đặt lại từ đầu</b>.</div>`,
            buttonText: '🔄 CHƠI LẠI TỪ ĐẦU',
            onContinue: () => window.location.reload(),
        });
    },

    onDraw() {
        const s = this.session;
        s.gameEnded = true;
        s.inputLocked = true;
        this.log('🤝 Hoà cờ (hết nước đi hợp lệ) — đấu lại ván này!');
        this.showEndOverlay({
            title: '🤝 HOÀ CỜ!',
            color: '#7ed6ff',
            message: `<div style="color:#ccc; font-size:13px;">Không bên nào còn nước đi hợp lệ. Đấu lại ván này với cùng đội hình.</div>`,
            buttonText: '♟️ ĐẤU LẠI',
            onContinue: () => this.startMatch(),
        });
    },

    showEndOverlay({ title, color, message, buttonText, onContinue, onExit }) {
        const overlay = document.getElementById('match-end-overlay');
        const titleEl = document.getElementById('match-end-title');
        const msgEl = document.getElementById('match-end-message');
        const btn = document.getElementById('match-end-btn');
        const btnExit = document.getElementById('match-end-btn-secondary');
        if (titleEl) { titleEl.innerText = title; titleEl.style.color = color; }
        if (msgEl) msgEl.innerHTML = message;
        if (btn) { btn.innerText = buttonText; btn.onclick = () => { overlay.style.display = 'none'; onContinue(); }; }
        if (btnExit) { btnExit.onclick = () => { overlay.style.display = 'none'; onExit(); }; }
        if (overlay) overlay.style.display = 'flex';
    },

    // ================= 13. HUD / LOG / HIỆU ỨNG NHỎ =================
    updateHud() {
        const s = this.session.persisted;
        const el = (id) => document.getElementById(id);
        if (el('chess-round')) el('chess-round').innerText = `Ván ${s.round}`;
        if (el('chess-gold')) el('chess-gold').innerText = `💰 ${s.gold}`;
        if (el('quiz-stats')) el('quiz-stats').innerHTML = `✅ ${this.session.correctCount} &nbsp; ❌ ${this.session.wrongCount} &nbsp; 📊 ${this.session.totalCount} câu`;
    },

    updateTurnIndicator() {
        const el = document.getElementById('chess-turn');
        if (!el) return;
        el.innerText = this.session.turn === 'player' ? '🔵 Lượt của bạn' : '⚫ Đối thủ đang suy nghĩ...';
        el.className = this.session.turn === 'player' ? 'turn-player' : 'turn-enemy';
    },

    floatingText(anchorEl, text, color) {
        const div = document.createElement('div');
        div.innerText = text;
        div.style.cssText = `position:absolute; left:50%; top:0; transform:translate(-50%,0);
            color:${color}; font-weight:900; font-size:12px; text-shadow:1px 1px 2px #000;
            pointer-events:none; z-index:30; transition: transform .8s ease-out, opacity .8s ease-out;`;
        anchorEl.appendChild(div);
        requestAnimationFrame(() => { div.style.transform = 'translate(-50%,-26px)'; div.style.opacity = '0'; });
        setTimeout(() => div.remove(), 850);
    },

    log(msg) {
        console.log('♟️ [CHESS]: ' + msg);
        const el = document.getElementById('chess-log');
        if (!el) return;
        el.innerText = msg;
        el.style.opacity = '1';
        clearTimeout(this._logTimeout);
        this._logTimeout = setTimeout(() => { el.style.opacity = '0'; }, 2200);
    },

    // ================= 14. CSS BÀN CỜ 3D + QUÂN CỜ =================
    injectStyles() {
        if (document.getElementById('chess-style')) return;
        const style = document.createElement('style');
        style.id = 'chess-style';
        style.textContent = `
            @keyframes chessCheckPulse { 0%,100%{ box-shadow:0 0 6px 2px rgba(231,76,60,.8);} 50%{ box-shadow:0 0 16px 6px rgba(231,76,60,1);} }
            @keyframes chessMoveHintPulse { 0%,100%{ opacity:.55; transform:translate(-50%,-50%) scale(0.9);} 50%{ opacity:1; transform:translate(-50%,-50%) scale(1.15);} }
            @keyframes chessBoardStunPulse { 0%,100%{ filter:brightness(.75) saturate(.6);} 50%{ filter:brightness(.55) saturate(.4);} }
            @keyframes chessPromoSparkle { 0%{ filter:brightness(1);} 30%{ filter:brightness(2.2);} 100%{ filter:brightness(1);} }
            @keyframes chessShake { 0%,100%{transform:translate(0,0);} 25%{transform:translate(3px,-2px);} 75%{transform:translate(-3px,2px);} }

            /* ── KHU VỰC BÀN CỜ + CẢNH NỀN ── */
            #arena-area { position:relative; }
            /* Lớp cảnh nền (núi/rừng/biển/đồng bằng) do pkm_chess_scenery.js
               tự vẽ bên trong — ở đây chỉ khai chỗ đứng, luôn nằm SAU bàn cờ. */
            #chess-scenery { position:absolute; inset:0; z-index:0; overflow:hidden; pointer-events:none; }

            /* BÀN CỜ 3D — thiết kế lại HOÀN TOÀN không dùng CSS Grid nữa.
               Lý do: khi 1 phần tử display:grid (dùng track "1fr") vừa nằm
               trong ngữ cảnh transform 3D (rotateX) vừa tự suy chiều cao từ
               aspect-ratio, một số bản Safari/WebKit tính SAI kích thước các
               hàng giữa (co gần về 0px) — đây chính là lỗi "chỉ hiện 6/8,
               4/8 hàng" đã gặp.
               Cách né triệt để: bàn cờ luôn được dựng ở một kích thước THAM
               CHIẾU CỐ ĐỊNH 480×480px (8 ô, mỗi ô đúng 60×60px, đặt bằng
               position:absolute + left/top/width/height tuyệt đối trong JS
               — không có gì để trình duyệt "tính sai" cả). Việc thu vừa
               màn hình di động chỉ là phóng to/thu nhỏ ĐỀU cả khối này bằng
               transform:scale(), nên 8x8 ô luôn hiện đủ và luôn bằng nhau,
               kể cả khi đổi quân/đi nước mới. */
            #chess-board-wrap {
    position:relative; z-index:2;
    margin: 0 auto;
    perspective: 1400px;
}
#chess-board-tilt {
    position:absolute; bottom:0; width:480px; height:480px;
    transform: rotateX(42deg);
    transform-origin: center bottom;
    border:6px solid #6b4a2a; border-radius:8px; overflow:hidden;
    box-shadow:0 24px 50px rgba(0,0,0,.6), 0 0 0 1px rgba(240,199,102,.15);
}
            #chess-board {
                position:relative; width:480px; height:480px;
                transition: filter .3s ease;
            }
            #chess-board.board-stunned { animation: chessBoardStunPulse 1s ease-in-out infinite; pointer-events:none; }

            .chess-square { position:absolute; display:flex; align-items:center; justify-content:center; cursor:pointer; }
            .sq-light { background:#ecd9b0; }
            .sq-dark  { background:#8a5a34; }
            .sq-selected { outline:3px solid #f0c766; outline-offset:-3px; z-index:2; }
            .sq-move-hint::after {
                content:''; position:absolute; left:50%; top:50%; width:24%; height:24%;
                transform:translate(-50%,-50%); border-radius:50%;
                background:rgba(46,204,113,.65); animation: chessMoveHintPulse 1.1s ease-in-out infinite;
                pointer-events:none;
            }
            .sq-capture-hint { outline:3px solid rgba(231,76,60,.85); outline-offset:-3px; }

            .chess-piece {
                position:relative; width:88%; height:88%; display:flex; flex-direction:column;
                align-items:center; justify-content:center; user-select:none;
            }
            .chess-piece.shake { animation: chessShake .3s; }
            .piece-label {
                position:absolute; top:-2px; font-size:8.5px; font-weight:800; color:#fff;
                background:rgba(0,0,0,.55); padding:0 4px; border-radius:6px; white-space:nowrap; z-index:3;
            }
            .piece-scale-wrap { position:relative; display:flex; align-items:center; justify-content:center; }

            /* Huy hiệu tròn trắng/đen ĐẶT SAU sprite (không phải viền thẳng lên
               ảnh trong suốt) — sprite GIF nổi lên trên nhờ z-index cao hơn. */
            .piece-badge {
                position:absolute; inset:6%; border-radius:50%; z-index:0;
            }
            .piece-badge.side-player {
                background:radial-gradient(circle, rgba(255,255,255,.9) 0%, rgba(255,255,255,.15) 70%, transparent 85%);
                border:3px solid #fdfdfd; box-shadow:0 0 8px rgba(255,255,255,.55);
            }
            .piece-badge.side-enemy {
                background:radial-gradient(circle, rgba(20,20,20,.9) 0%, rgba(20,20,20,.2) 70%, transparent 85%);
                border:3px solid #141414; box-shadow:0 0 8px rgba(0,0,0,.75);
            }
                        .chess-piece img {
                position:relative; z-index:1;
                width:86%; height:86%; object-fit:contain;
                filter:drop-shadow(0 3px 5px rgba(0,0,0,.6));
            }
            .chess-piece[data-flip="-1"] img { transform: scaleX(-1); }
            .chess-piece.piece-promoted img { animation: chessPromoSparkle .6s ease-out; }
            .chess-piece.piece-in-check .piece-badge { animation: chessCheckPulse .7s ease-in-out infinite; }

            #chess-turn { font-family:'Baloo 2',sans-serif; font-weight:700; font-size:13px; }
            #chess-turn.turn-player { color:#7ed6ff; }
            #chess-turn.turn-enemy { color:#ff8a8a; }

            /* ── MÀN CHỌN QUÂN (6 vai dùng chung 2 phe) ── */
            #role-assign-overlay {
                position:fixed; inset:0; display:none; flex-direction:column;
                background:radial-gradient(circle,#1c140a 0%,#0a0705 80%); z-index:6500;
                padding:16px; overflow-y:auto;
            }
            #role-assign-grid { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom:18px; }
            .role-slot {
                width:84px; background:rgba(255,255,255,.05); border:2px solid rgba(240,199,102,.4);
                border-radius:12px; padding:8px; text-align:center; cursor:pointer;
            }
            .role-slot img { width:48px; height:48px; object-fit:contain; }
            .role-slot-label { font-size:11px; font-weight:800; color:#f0c766; margin-top:4px; }
            .role-slot-name { font-size:9px; color:#ccc; }
            #role-assign-bench-wrap { text-align:center; margin-bottom:16px; }
            #role-assign-bench { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; max-width:640px; margin:0 auto; }
            .bench-item {
                width:64px; background:rgba(255,255,255,.05); border:2px solid #4a3a24; border-radius:10px;
                padding:5px; text-align:center; cursor:pointer;
            }
            .bench-item.selected { border-color:#f0c766; background:rgba(240,199,102,.12); }
            .bench-item img { width:40px; height:40px; object-fit:contain; }
            .bench-item-name { font-size:9px; font-weight:700; }
            #role-assign-start-btn {
                display:block; margin:0 auto; padding:13px 34px; border-radius:24px; border:none;
                background:linear-gradient(160deg,#f0c766,#c99a3a); color:#2a1a00; font-weight:800;
                font-size:14.5px; cursor:pointer; box-shadow:0 3px 0 #8a6a20;
            }
        `;
        document.head.appendChild(style);
    },
};

window.ChessGame.init();