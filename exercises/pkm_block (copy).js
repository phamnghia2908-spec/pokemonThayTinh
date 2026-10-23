/**
 * ==========================================
 * POKEMON BLOCK BLAST - GAME LOGIC (v2)
 * ==========================================
 * Luồng: giống hệt pkm_battle.js ở phần "học từ vựng trước" (VocabularyModule),
 * chỉ khác phần "sân chơi" — thay vì đấu Pokémon thì xếp khối phá hàng.
 *
 * LƯU Ý QUAN TRỌNG: pkm_vocabulary.js (dùng chung, KHÔNG sửa) sau khi học xong
 * gọi cứng `window.startPokemonBattle()`. Vì vậy bên dưới ta vẫn đặt tên hàm
 * khởi động game là `window.startPokemonBattle` (dù thực chất nó khởi động
 * Block Blast) để không phải đụng vào file gốc.
 *
 * Phần ghi điểm theo 4 kỹ năng + tổng điểm "Trò chơi" nay dùng chung
 * window.PkmScore (file pkm_score.js, nạp TRƯỚC file này trong HTML).
 */

window.BlockGame = {
    GRID_SIZE: 8,
    MIN_QUESTIONS: 8, // = số câu cần trả lời để chốt xong 1 VÒNG

    // ═══════════════════════════════════════════════════════════
    // HỆ THỐNG "VÒNG" (round): cứ đủ MIN_QUESTIONS câu -> chốt 1 vòng,
    // ghi điểm/thưởng qua PkmScore + lưu local NGAY (không đợi đến hết cả
    // ván), rồi thu nhỏ bàn cờ chơi tiếp. Nhờ vậy nếu máy đơ/crash giữa
    // chừng thì tối thiểu các vòng đã hoàn thành vẫn còn nguyên trong
    // localStorage (pkm_global_exp/pkm_global_dv/result_battle/... đã được
    // PkmScore ghi, cộng thêm pkm_block_rounds để lưu chi tiết từng vòng).
    BOARD_SIZE_FLOOR: 5, // nhỏ nhất 5x5 (đủ chỗ cho khối dài 5 ô / vuông 3x3)
    ROUND_STORAGE_KEY: "pkm_block_rounds",
    roundQuestionCount: 0, // số câu đã trả lời TRONG vòng hiện tại
    roundIndex: 1,

    grid: [], // 8x8, mỗi ô: null hoặc mã màu (string)
    pokemonGrid: [], // 8x8 song song với grid, mỗi ô: null hoặc {id, url}
    tray: [null, null, null],
    selectedTrayIndex: null,

    score: 0,
    correctCount: 0,
    wrongCount: 0,
    totalCount: 0,

    isPaused: false,
    gameOver: false,
    movesSinceLastQuiz: 0,
    movesUntilNextQuiz: 3,

    COLORS: [
        "#ff6b6b",
        "#4ecdc4",
        "#ffe66d",
        "#a29bfe",
        "#55efc4",
        "#fd79a8",
        "#74b9ff",
        "#fab1a0",
        "#ffb142",
    ],

    // Mỗi shape là danh sách toạ độ [row, col] đã chuẩn hoá về gốc (0,0)
    PIECE_SHAPES: [
        { cells: [[0, 0]] },
        {
            cells: [
                [0, 0],
                [0, 1],
            ],
        },
        {
            cells: [
                [0, 0],
                [1, 0],
            ],
        },
        {
            cells: [
                [0, 0],
                [0, 1],
                [0, 2],
            ],
        },
        {
            cells: [
                [0, 0],
                [1, 0],
                [2, 0],
            ],
        },
        {
            cells: [
                [0, 0],
                [0, 1],
                [0, 2],
                [0, 3],
            ],
        },
        {
            cells: [
                [0, 0],
                [1, 0],
                [2, 0],
                [3, 0],
            ],
        },
        {
            cells: [
                [0, 0],
                [0, 1],
                [0, 2],
                [0, 3],
                [0, 4],
            ],
        },
        {
            cells: [
                [0, 0],
                [1, 0],
                [2, 0],
                [3, 0],
                [4, 0],
            ],
        },
        {
            cells: [
                [0, 0],
                [0, 1],
                [1, 0],
                [1, 1],
            ],
        }, // vuông 2x2
        {
            cells: [
                [0, 0],
                [0, 1],
                [0, 2],
                [1, 0],
                [1, 1],
                [1, 2],
                [2, 0],
                [2, 1],
                [2, 2],
            ],
        }, // vuông 3x3
        {
            cells: [
                [0, 0],
                [1, 0],
                [2, 0],
                [2, 1],
            ],
        }, // L
        {
            cells: [
                [0, 0],
                [0, 1],
                [0, 2],
                [1, 0],
            ],
        }, // L lật
        {
            cells: [
                [0, 0],
                [0, 1],
                [1, 1],
                [2, 1],
            ],
        }, // L lật 2
        {
            cells: [
                [0, 2],
                [1, 0],
                [1, 1],
                [1, 2],
            ],
        }, // L lật 3
        {
            cells: [
                [0, 0],
                [0, 1],
                [0, 2],
                [1, 1],
            ],
        }, // T
        {
            cells: [
                [0, 1],
                [1, 0],
                [1, 1],
                [2, 1],
            ],
        }, // T dọc
        {
            cells: [
                [0, 1],
                [0, 2],
                [1, 0],
                [1, 1],
            ],
        }, // S
        {
            cells: [
                [0, 0],
                [0, 1],
                [1, 1],
                [1, 2],
            ],
        }, // Z
        {
            cells: [
                [0, 0],
                [0, 1],
                [1, 0],
            ],
        }, // góc nhỏ
        {
            cells: [
                [0, 0],
                [0, 1],
                [1, 1],
            ],
        }, // góc nhỏ
        {
            cells: [
                [0, 1],
                [1, 0],
                [1, 1],
            ],
        }, // góc nhỏ
        {
            cells: [
                [0, 0],
                [1, 0],
                [1, 1],
            ],
        }, // góc nhỏ
        {
            cells: [
                [0, 1],
                [1, 0],
                [1, 1],
                [1, 2],
                [2, 1],
            ],
        }, // dấu cộng
    ],

    // ═══════════════════════════════════════════════════════════
    // HỆ POKÉMON HOÁ (1 CON CỐ ĐỊNH / MÀU — nhẹ, chỉ tải 9 ảnh/ván)
    // ═══════════════════════════════════════════════════════════
    POKEMON_ID_MAX: 649, // giới hạn Gen 1-5, khớp cách random enemy bên Battle

    colorPokemonMap: {}, // { "#ff6b6b": {id,url}, ... } — cố định suốt ván, không đổi
    collectedList: [], // log các con đã thu phục trong ván (để vẽ dải UI)
    captureBusy: false, // khoá để hiện popup thu phục tuần tự, không đè lên nhau

    PRAISE_WORDS: [
        "EXCELLENT!",
        "GREAT!",
        "BRAVO!",
        "AWESOME!",
        "FANTASTIC!",
        "SUPER!",
    ],

    pokemonSpriteUrl(id) {
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
    },

    preloadImage(url) {
        const img = new Image();
        img.src = url;
    },

    randomPokemonId(excludeSet) {
        let id,
            attempts = 0;
        do {
            id = Math.floor(Math.random() * this.POKEMON_ID_MAX) + 1;
            attempts++;
        } while (excludeSet && excludeSet.has(id) && attempts < 60);
        return id;
    },

    // Gán CỐ ĐỊNH 1 Pokémon cho mỗi màu, làm 1 LẦN DUY NHẤT lúc bắt đầu ván —
    // cả ván chỉ tải đúng this.COLORS.length ảnh, không bao giờ tải thêm nữa.
    initColorPokemonMap() {
        const usedIds = new Set();
        this.COLORS.forEach((color) => {
            const id = this.randomPokemonId(usedIds);
            usedIds.add(id);
            const url = this.pokemonSpriteUrl(id);
            this.preloadImage(url);
            this.colorPokemonMap[color] = { id, url };
        });
    },

    // ═══════════════════════════════════════════════════════════
    // ÂM THANH (tự tạo bằng Web Audio API — khỏi cần file mp3)
    // ═══════════════════════════════════════════════════════════
    _audioCtx: null,
    ensureAudioCtx() {
        if (!this._audioCtx) {
            this._audioCtx = new (window.AudioContext ||
                window.webkitAudioContext)();
        }
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
    playPlaceSound() {
        this.playTone(520, 0.08, "triangle", 0.22);
    },
    playClearSound(linesCleared) {
        const notes = [660, 880, 1046, 1318];
        const count = Math.min(notes.length, 1 + linesCleared);
        for (let i = 0; i < count; i++) {
            this.playTone(notes[i], 0.15, "sine", 0.25, i * 0.09);
        }
    },
    playCaptureSound() {
        this.playTone(784, 0.1, "sine", 0.22, 0);
        this.playTone(988, 0.1, "sine", 0.22, 0.09);
        this.playTone(1318, 0.18, "sine", 0.25, 0.18);
    },
    // Đọc to chữ khen (Excellent!/Bravo!...) bằng giọng đọc trình duyệt
    speakPraise(text) {
        try {
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = "en-US";
            utter.rate = 1.05;
            utter.pitch = 1.1;
            window.speechSynthesis.speak(utter);
        } catch (e) {
            /* im lặng nếu trình duyệt không hỗ trợ */
        }
    },

    async init() {
        console.log("🧱 [DEBUG] BlockGame.init() started");

        this.setupGrid();
        this.renderBoard();
        this.attachTraySlotHandlers();
        this.initColorPokemonMap(); // gán cố định 1 Pokémon/màu, tải ảnh 1 lần duy nhất

        // Pre-fetch dữ liệu quiz (4 kỹ năng) NGAY TỪ ĐẦU, chạy song song lúc
        // học từ vựng — giống hệt battle.js — để câu hỏi đầu tiên không bị
        // khựng chờ fetch network.
        if (window.QuizManager) window.QuizManager.prepareData();

        const quizOverlay = document.getElementById("quiz-overlay");
        if (quizOverlay) quizOverlay.style.display = "none";

        // Màn chọn cấp độ riêng cho Block Blast — 3 lựa chọn giống Battle
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
                        <div style="font-size:16px;color:#FFCB05;font-weight:700;margin-bottom:18px;">🧱 Chọn cấp độ Block Blast!</div>
                        <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
                            ${LEVELS.map(
                                (lv) => `
                                <div class="block-level-card" data-level="${lv.key}" style="
                                    background:rgba(255,255,255,.06); border:2px solid rgba(255,203,5,.3);
                                    border-radius:16px; padding:18px 22px; text-align:center; cursor:pointer;
                                    min-width:120px; transition:all .2s;">
                                    <div style="font-size:38px;">${lv.emoji}</div>
                                    <div style="font-weight:800;color:#FFCB05;margin-top:6px;font-size:16px;">${lv.label}</div>
                                    <div style="font-size:12px;color:#bbb;margin-top:4px;">${lv.sub}</div>
                                </div>`,
                            ).join("")}
                        </div>
                    </div>`;
                container
                    .querySelectorAll(".block-level-card")
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
            console.log("🧱 Chọn cấp độ trước khi vào Block Blast...");

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

            await renderLevelSelect(mainCard);
            mainCard.style.display = "none";

            if (window.QuizManager) {
                window.QuizManager.loadLevel();
                window.QuizManager.initSkillPools();
            }

            this.startPlaying();
        };

        if (
            window.VocabularyModule &&
            typeof window.VocabularyModule.start === "function"
        ) {
            console.log(
                "📘 [Block] Gọi VocabularyModule chạy phần học từ vựng...",
            );
            await window.VocabularyModule.start();
        } else {
            console.warn(
                "⚠️ Không tìm thấy VocabularyModule, tự động vào thẳng Block Blast!",
            );
            window.startPokemonBattle();
        }
    },

    startPlaying() {
        this.spawnTray();
        this.renderTray();
        this.updateScoreUI();
        this.updateStatsUI();
        this.movesSinceLastQuiz = 0;
        this.movesUntilNextQuiz = this.randomMoveThreshold();
    },

    // ═══════════════════════════════════════════════════════════
    // BÀN CỜ
    // ═══════════════════════════════════════════════════════════
    setupGrid() {
        this.grid = Array.from({ length: this.GRID_SIZE }, () =>
            Array(this.GRID_SIZE).fill(null),
        );
        this.pokemonGrid = Array.from({ length: this.GRID_SIZE }, () =>
            Array(this.GRID_SIZE).fill(null),
        );
    },

    // Cache tham chiếu DOM của 64 ô ngay khi tạo, tránh gọi document.querySelector
    // (duyệt lại toàn bộ DOM) hàng chục-hàng trăm lần mỗi lượt chơi — đây là
    // nguyên nhân chính gây giật/lag trên máy yếu, đặc biệt lúc phá nhiều hàng/cột.
    cellEls: [],

    // Máy cảm ứng (điện thoại) không thực sự có "hover" theo kiểu chuột, nên
    // bỏ hẳn 2 listener mouseenter/mouseleave trên mỗi ô khi thiết bị chỉ có
    // con trỏ "coarse" (chạm) — đỡ 128 listener vô ích + tránh việc trình
    // duyệt di động đôi khi bắn nhầm sự kiện hover khi chạm, gây thêm việc
    // cho main thread.
    _isCoarsePointer:
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(pointer: coarse)").matches,

    renderBoard() {
        const board = document.getElementById("block-board");
        if (!board) return;
        board.innerHTML = "";
        // Bàn cờ co dần theo từng vòng -> phải set lại số cột/hàng CSS mỗi
        // lần render, không thể để cố định repeat(8,...) trong file CSS nữa.
        board.style.gridTemplateColumns = `repeat(${this.GRID_SIZE}, 1fr)`;
        board.style.gridTemplateRows = `repeat(${this.GRID_SIZE}, 1fr)`;
        this.cellEls = Array.from({ length: this.GRID_SIZE }, () =>
            new Array(this.GRID_SIZE).fill(null),
        );
        const frag = document.createDocumentFragment();
        const attachHover = !this._isCoarsePointer;
        for (let r = 0; r < this.GRID_SIZE; r++) {
            for (let c = 0; c < this.GRID_SIZE; c++) {
                const cell = document.createElement("div");
                cell.className = "block-cell";
                cell.dataset.r = r;
                cell.dataset.c = c;
                cell.addEventListener("click", () =>
                    this.handleCellClick(r, c),
                );
                if (attachHover) {
                    cell.addEventListener("mouseenter", () =>
                        this.handleCellHover(r, c),
                    );
                    cell.addEventListener("mouseleave", () =>
                        this.clearPreview(),
                    );
                }
                this.cellEls[r][c] = cell;
                frag.appendChild(cell);
            }
        }
        board.appendChild(frag);
    },

    getCellEl(r, c) {
        return this.cellEls[r]?.[c] || null;
    },

    paintCell(r, c, color, pokemonUrl) {
        const el = this.getCellEl(r, c);
        if (!el) return;
        if (color) {
            el.classList.add("filled");
            el.style.background = color;
            el.style.backgroundImage = pokemonUrl ? `url('${pokemonUrl}')` : "";
        } else {
            el.classList.remove("filled");
            el.style.background = "";
            el.style.backgroundImage = "";
        }
    },

    // ═══════════════════════════════════════════════════════════
    // KHAY KHỐI
    // ═══════════════════════════════════════════════════════════
    randomShape() {
        const shape =
            this.PIECE_SHAPES[
                Math.floor(Math.random() * this.PIECE_SHAPES.length)
            ];
        const color =
            this.COLORS[Math.floor(Math.random() * this.COLORS.length)];
        const pokemon = this.colorPokemonMap[color];
        return { cells: shape.cells, color, pokemon };
    },

    spawnTray() {
        this.tray = [
            this.randomShape(),
            this.randomShape(),
            this.randomShape(),
        ];
    },

    // Bổ sung NGAY 1 khối mới vào đúng ô vừa dùng hết — không cần chờ dùng hết
    // cả 3 ô mới có khối mới nữa (đỡ bị bí chỗ đặt).
    refillTraySlot(idx) {
        this.tray[idx] = this.randomShape();
    },

    attachTraySlotHandlers() {
        [0, 1, 2].forEach((i) => {
            const slot = document.getElementById(`traySlot${i}`);
            if (slot)
                slot.addEventListener("click", () => this.selectTraySlot(i));
        });
    },

    renderTray() {
        this.tray.forEach((piece, i) => {
            const slot = document.getElementById(`traySlot${i}`);
            if (!slot) return;
            slot.classList.remove("selected");
            if (!piece) {
                slot.classList.add("empty");
                slot.innerHTML = "";
                return;
            }
            slot.classList.remove("empty");
            const maxR = Math.max(...piece.cells.map((p) => p[0])) + 1;
            const maxC = Math.max(...piece.cells.map((p) => p[1])) + 1;
            const cellPx = Math.floor(70 / Math.max(maxR, maxC));
            const filledSet = new Set(
                piece.cells.map((p) => `${p[0]}_${p[1]}`),
            );
            const bg = piece.pokemon ? piece.pokemon.url : "";

            let html = `<div class="tray-piece-grid" style="grid-template-columns:repeat(${maxC},${cellPx}px);grid-template-rows:repeat(${maxR},${cellPx}px);">`;
            for (let r = 0; r < maxR; r++) {
                for (let c = 0; c < maxC; c++) {
                    const on = filledSet.has(`${r}_${c}`);
                    const style = on
                        ? `background-color:${piece.color};background-image:url('${bg}');`
                        : "";
                    html += `<div class="tray-piece-cell ${on ? "" : "empty"}" style="${style}"></div>`;
                }
            }
            html += `</div>`;
            slot.innerHTML = html;
        });

        if (
            this.selectedTrayIndex !== null &&
            !this.tray[this.selectedTrayIndex]
        ) {
            this.selectedTrayIndex = null;
        }
        if (this.selectedTrayIndex !== null) {
            document
                .getElementById(`traySlot${this.selectedTrayIndex}`)
                ?.classList.add("selected");
        }
    },

    selectTraySlot(i) {
        if (this.isPaused || this.gameOver) return;
        if (!this.tray[i]) return;
        this.selectedTrayIndex = this.selectedTrayIndex === i ? null : i;
        this.renderTray();
    },

    // ═══════════════════════════════════════════════════════════
    // ĐẶT KHỐI
    // ═══════════════════════════════════════════════════════════
    canPlace(shapeCells, anchorR, anchorC) {
        for (const [dr, dc] of shapeCells) {
            const r = anchorR + dr,
                c = anchorC + dc;
            if (r < 0 || r >= this.GRID_SIZE || c < 0 || c >= this.GRID_SIZE)
                return false;
            if (this.grid[r][c]) return false;
        }
        return true;
    },

    _previewEls: [],

    handleCellHover(r, c) {
        if (this.selectedTrayIndex === null || this.isPaused || this.gameOver)
            return;
        const piece = this.tray[this.selectedTrayIndex];
        if (!piece) return;
        this.clearPreview();
        const ok = this.canPlace(piece.cells, r, c);
        const cls = ok ? "preview-ok" : "preview-bad";
        piece.cells.forEach(([dr, dc]) => {
            const el = this.getCellEl(r + dr, c + dc);
            if (el) {
                el.classList.add(cls);
                this._previewEls.push(el);
            }
        });
    },

    clearPreview() {
        // Chỉ xoá đúng những ô đã tô preview lần trước (lưu sẵn tham chiếu),
        // thay vì querySelectorAll quét lại cả 64 ô mỗi lần di chuyển.
        if (this._previewEls.length) {
            this._previewEls.forEach((el) =>
                el.classList.remove("preview-ok", "preview-bad"),
            );
            this._previewEls.length = 0;
        }
    },

    handleCellClick(r, c) {
        if (this.selectedTrayIndex === null || this.isPaused || this.gameOver)
            return;
        const idx = this.selectedTrayIndex;
        const piece = this.tray[idx];
        if (!piece) return;

        if (!this.canPlace(piece.cells, r, c)) {
            const board = document.getElementById("block-board");
            board?.classList.add("shake");
            setTimeout(() => board?.classList.remove("shake"), 300);
            return;
        }

        this.clearPreview();
        this.selectedTrayIndex = null;
        this.playPlaceSound();
        this.commitPlacement(idx, piece, r, c, { auto: false });
    },

    commitPlacement(idx, piece, anchorR, anchorC, opts = {}) {
        piece.cells.forEach(([dr, dc]) => {
            const r = anchorR + dr,
                c = anchorC + dc;
            this.grid[r][c] = piece.color;
            this.pokemonGrid[r][c] = piece.pokemon;
            this.paintCell(
                r,
                c,
                piece.color,
                piece.pokemon ? piece.pokemon.url : null,
            );
            if (opts.auto) {
                const el = this.getCellEl(r, c);
                el?.classList.add("auto-placed");
                setTimeout(() => el?.classList.remove("auto-placed"), 700);
            }
        });

        this.score += piece.cells.length;
        this.refillTraySlot(idx); // bổ sung khối mới NGAY vào đúng ô vừa dùng
        this.renderTray();

        setTimeout(
            () => {
                this.clearFullLines();
                this.updateScoreUI();
                if (this.checkGameOver()) return;
                if (!opts.auto) this.registerMovePlayed();
            },
            opts.auto ? 350 : 0,
        );
    },

    clearFullLines() {
        const fullRows = [];
        const fullCols = [];
        for (let r = 0; r < this.GRID_SIZE; r++) {
            if (this.grid[r].every((cell) => cell)) fullRows.push(r);
        }
        for (let c = 0; c < this.GRID_SIZE; c++) {
            if (this.grid.every((row) => row[c])) fullCols.push(c);
        }
        if (fullRows.length === 0 && fullCols.length === 0) return;

        const cellsToClear = new Set();
        fullRows.forEach((r) => {
            for (let c = 0; c < this.GRID_SIZE; c++)
                cellsToClear.add(`${r}_${c}`);
        });
        fullCols.forEach((c) => {
            for (let r = 0; r < this.GRID_SIZE; r++)
                cellsToClear.add(`${r}_${c}`);
        });

        // Thu thập các loài Pokémon xuất hiện trong những ô sắp bị xoá — đây
        // chính là các con "bị thu phục" ở lượt này.
        const capturedMap = new Map(); // id -> {id,url}
        cellsToClear.forEach((key) => {
            const [r, c] = key.split("_").map(Number);
            const p = this.pokemonGrid[r][c];
            if (p) capturedMap.set(p.id, p);
        });

        cellsToClear.forEach((key) => {
            const [r, c] = key.split("_").map(Number);
            this.getCellEl(r, c)?.classList.add("clearing");
        });

        const linesCleared = fullRows.length + fullCols.length;
        this.score += linesCleared * linesCleared * 10;
        this.playClearSound(linesCleared);

        setTimeout(() => {
            cellsToClear.forEach((key) => {
                const [r, c] = key.split("_").map(Number);
                this.grid[r][c] = null;
                this.pokemonGrid[r][c] = null;
                this.paintCell(r, c, null, null);
                this.getCellEl(r, c)?.classList.remove("clearing");
            });
            this.updateScoreUI();

            if (capturedMap.size > 0) {
                this.processCaptures(Array.from(capturedMap.values()));
            }
        }, 350);
    },

    // ═══════════════════════════════════════════════════════════
    // THU PHỤC POKÉMON (popup + dải "Đã thu phục")
    // ═══════════════════════════════════════════════════════════
    // mới — gộp toàn bộ Pokémon thu phục trong CÙNG 1 lần xoá hàng/cột thành
    // 1 lần hiển thị duy nhất (kiểu "Combo xN") thay vì đợi tuần tự ~950ms/con.
    // Máy yếu xoá nhiều hàng/cột cùng lúc trước đây phải chờ dồn nhiều giây liền,
    // đây là nguyên nhân chính gây cảm giác đơ.
    async processCaptures(list) {
        this.captureQueue = (this.captureQueue || []).concat(list);
        if (this.captureBusy) return;
        this.captureBusy = true;
        while (this.captureQueue.length > 0) {
            const batch = this.captureQueue;
            this.captureQueue = [];
            await this.showCaptureEvent(batch);
        }
        this.captureBusy = false;
    },

    showCaptureEvent(pokemonList) {
        return new Promise((resolve) => {
            pokemonList.forEach(p => this.collectedList.push(p));

            this.playCaptureSound();

            const popup = document.getElementById("capture-popup");
            const praiseEl = document.getElementById("capturePraiseText");
            const imgEl = document.getElementById("capturePokemonImg");
            const praiseWord =
                this.PRAISE_WORDS[
                    Math.floor(Math.random() * this.PRAISE_WORDS.length)
                ];

            const isCombo = pokemonList.length > 1;
            if (praiseEl) praiseEl.innerText = isCombo ? `${praiseWord} Combo x${pokemonList.length}!` : praiseWord;
            if (imgEl) imgEl.src = pokemonList[0].url;
            this.speakPraise(isCombo ? `${praiseWord} Combo` : praiseWord);

            // Nhiều con cùng lúc -> tự chèn thêm icon nhỏ cạnh ảnh chính (không cần
            // sửa HTML), tự dọn dẹp ngay sau khi popup ẩn.
            let extraRow = null;
            if (isCombo && imgEl && imgEl.parentElement) {
                extraRow = document.createElement("div");
                extraRow.style.cssText = "display:flex;gap:4px;justify-content:center;margin-top:6px;flex-wrap:wrap;";
                pokemonList.slice(1, 6).forEach(p => {
                    const mini = document.createElement("img");
                    mini.src = p.url;
                    mini.style.cssText = "width:28px;height:28px;object-fit:contain;";
                    extraRow.appendChild(mini);
                });
                if (pokemonList.length > 6) {
                    const more = document.createElement("span");
                    more.style.cssText = "font-size:12px;color:#fff;align-self:center;";
                    more.textContent = `+${pokemonList.length - 6}`;
                    extraRow.appendChild(more);
                }
                imgEl.parentElement.appendChild(extraRow);
            }

            if (popup) {
                popup.classList.remove("show");
                void popup.offsetWidth; // ép reflow để restart animation
                popup.classList.add("show");
                setTimeout(() => popup.classList.remove("show"), isCombo ? 1100 : 900);
            }

            setTimeout(() => {
                if (extraRow) extraRow.remove();
                resolve();
            }, isCombo ? 1150 : 950);
        });
    },

    isBoardStuck() {
        const activePieces = this.tray.filter((p) => p);
        if (activePieces.length === 0) return false; // sẽ được refill ngay
        for (const piece of activePieces) {
            for (let r = 0; r < this.GRID_SIZE; r++) {
                for (let c = 0; c < this.GRID_SIZE; c++) {
                    if (this.canPlace(piece.cells, r, c)) return false;
                }
            }
        }
        return true;
    },

    findFirstFitPosition(shapeCells) {
        for (let r = 0; r < this.GRID_SIZE; r++) {
            for (let c = 0; c < this.GRID_SIZE; c++) {
                if (this.canPlace(shapeCells, r, c)) return { r, c };
            }
        }
        return null;
    },

    // Phạt khi trả lời sai: tự chọn 1 khối trong khay và ghép vào ô đầu tiên
    // tìm thấy (không tối ưu để phá hàng) — mô phỏng "rơi thẳng" ẩu.
    autoPlayPenalty() {
        for (let idx = 0; idx < this.tray.length; idx++) {
            const piece = this.tray[idx];
            if (!piece) continue;
            const pos = this.findFirstFitPosition(piece.cells);
            if (pos) {
                this.commitPlacement(idx, piece, pos.r, pos.c, { auto: true });
                return;
            }
        }
        // Không khối nào đặt được nữa — bàn cờ coi như đã kẹt, checkGameOver() sẽ xử lý.
    },

    setInteractionEnabled(enabled) {
        document
            .getElementById("block-board")
            ?.classList.toggle("locked", !enabled);
        document
            .getElementById("tray-area")
            ?.classList.toggle("locked", !enabled);
        if (!enabled) this.clearPreview();
    },

    // ═══════════════════════════════════════════════════════════
    // QUIZ THEO LƯỢT CHƠI (cứ 3-4 lượt đặt khối thành công thì hỏi 1 câu)
    // ═══════════════════════════════════════════════════════════
    randomMoveThreshold() {
        return 3 + Math.floor(Math.random() * 2); // ra 3 hoặc 4
    },

    // Gọi mỗi khi người chơi tự đặt được 1 khối (không tính lượt phạt auto)
    registerMovePlayed() {
        if (this.gameOver || this.isPaused) return;
        this.movesSinceLastQuiz++;
        if (this.movesSinceLastQuiz >= this.movesUntilNextQuiz) {
            this.movesSinceLastQuiz = 0;
            this.movesUntilNextQuiz = this.randomMoveThreshold();
            this.triggerQuiz();
        }
    },

    triggerQuiz() {
        if (this.gameOver || this.isPaused) return;
        this.isPaused = true;
        this.selectedTrayIndex = null;
        this.setInteractionEnabled(false);

        if (window.QuizManager) {
            window.QuizManager.ask((isCorrect) =>
                this.onQuizAnswered(isCorrect),
            );
        } else {
            this.onQuizAnswered(true);
        }
    },

    onQuizAnswered(isCorrect) {
        if (window.PkmScore) window.PkmScore.recordAnswer(isCorrect);

        this.totalCount++;
        if (isCorrect) this.correctCount++;
        else this.wrongCount++;
        this.updateStatsUI();

        this.roundQuestionCount++;
        if (this.roundQuestionCount >= this.MIN_QUESTIONS) {
            this.roundQuestionCount = 0;
            this.completeRound(); // chốt vòng + reset bàn cờ mới, tự bật lại tương tác
            return;
        }

        this.isPaused = false;
        this.setInteractionEnabled(true);

        if (!isCorrect) this.autoPlayPenalty();

        this.checkGameOver();
    },

    // ═══════════════════════════════════════════════════════════
    // CHỐT 1 VÒNG (đủ MIN_QUESTIONS câu): ghi điểm/thưởng NGAY qua PkmScore,
    // lưu chi tiết vòng vào localStorage để phòng đơ/crash, rồi thu nhỏ bàn
    // cờ và chơi tiếp (không kết thúc ván).
    // ═══════════════════════════════════════════════════════════
    completeRound() {
        const result = window.PkmScore
            ? window.PkmScore.finishMatch({ won: true, minQuestions: 0 })
            : { bonusEXP: 0, bonusDV: 0 };

        this.saveRoundLocal({
            round: this.roundIndex,
            boardSize: this.GRID_SIZE,
            blockScore: this.score,
            correct: this.correctCount,
            wrong: this.wrongCount,
            bonusEXP: result.bonusEXP || 0,
            bonusDV: result.bonusDV || 0,
            ts: Date.now(),
        });

        // Reset session của PkmScore để vòng SAU không bị tính trùng số câu
        // của vòng NÀY (finishMatch đã cộng dồn EXP/DV vào localStorage rồi,
        // nên reset ở đây an toàn, không mất dữ liệu).
        if (window.PkmScore) window.PkmScore.resetForNewRound();

        this.showRoundToast(
            `✅ Vòng ${this.roundIndex} xong! +${result.bonusEXP || 0} KN +${result.bonusDV || 0} DV`,
        );
        this.roundIndex++;

        // Thu nhỏ bàn cờ dần, dừng lại ở BOARD_SIZE_FLOOR (5x5)
        this.GRID_SIZE = Math.max(this.BOARD_SIZE_FLOOR, this.GRID_SIZE - 1);

        this.setupGrid();
        this.renderBoard();
        this.spawnTray();
        this.renderTray();
        this.updateScoreUI();
        this.updateStatsUI();

        this.selectedTrayIndex = null;
        this.movesSinceLastQuiz = 0;
        this.movesUntilNextQuiz = this.randomMoveThreshold();

        this.isPaused = false;
        this.setInteractionEnabled(true);
    },

    // Lưu chi tiết từng vòng vào localStorage (mảng nối dài, chưa tự xoá —
    // để sau này đẩy lên Firebase rồi chủ động dọn nếu cần).
    saveRoundLocal(entry) {
        try {
            const list = JSON.parse(
                localStorage.getItem(this.ROUND_STORAGE_KEY) || "[]",
            );
            list.push(entry);
            localStorage.setItem(this.ROUND_STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.error("❌ [BlockGame] Lỗi lưu round local:", e);
        }
    },

    // Toast nhỏ báo "xong 1 vòng" — tự tạo DOM, không cần sửa HTML.
    showRoundToast(text) {
        let toast = document.getElementById("round-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "round-toast";
            toast.style.cssText = `
                position: fixed; top: 54px; left: 50%; transform: translateX(-50%);
                background: rgba(20,24,40,0.95); border: 2px solid #ffcb05; color: #ffcb05;
                font-weight: 900; font-size: 13px; padding: 8px 18px; border-radius: 20px;
                z-index: 9500; text-align: center; box-shadow: 0 6px 18px rgba(0,0,0,0.4);
                opacity: 0; transition: opacity .25s ease; pointer-events: none; white-space: nowrap;
            `;
            document.body.appendChild(toast);
        }
        toast.textContent = text;
        requestAnimationFrame(() => {
            toast.style.opacity = "1";
        });
        clearTimeout(this._roundToastTimer);
        this._roundToastTimer = setTimeout(() => {
            toast.style.opacity = "0";
        }, 1600);
    },

    // ═══════════════════════════════════════════════════════════
    // UI PHỤ
    // ═══════════════════════════════════════════════════════════
    updateScoreUI() {
        const el = document.getElementById("blockScoreValue");
        if (el) el.innerText = this.score;
    },

    updateStatsUI() {
        const el = document.getElementById("quiz-stats");
        if (el)
            el.innerHTML = `✅ ${this.correctCount} &nbsp; ❌ ${this.wrongCount} &nbsp; 📊 ${this.totalCount} câu`;
    },

    // ═══════════════════════════════════════════════════════════
    // KẾT THÚC GAME
    // ═══════════════════════════════════════════════════════════
    checkGameOver() {
        if (this.gameOver) return true;

        if (this.isBoardStuck()) {
            this.gameOver = true;
            this.handleMatchEnd();
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
                '❌ PkmScore chưa được nạp — thiếu <script src="pkm_score.js"> trong pkm_block.html (phải đặt TRƯỚC thẻ <script src="pkm_block.js">)?',
            );
            return;
        }

        // Các vòng đã hoàn thành (đủ MIN_QUESTIONS câu) đã được ghi điểm +
        // lưu local NGAY tại thời điểm chốt vòng, xem completeRound(). Ở đây
        // chỉ cần chốt nốt phần câu hỏi CÒN DANG DỞ (chưa đủ 1 vòng) của
        // vòng hiện tại, nếu có — không tính lại từ đầu để tránh trùng điểm.
        const leftoverQuestions = window.PkmScore.session.totalCount;
        const result = window.PkmScore.finishMatch({
            won: true,
            minQuestions: 0,
        });
        if (leftoverQuestions > 0) window.PkmScore.resetForNewRound();

        const completedRounds = this.roundIndex - 1;
        const titleEl = document.getElementById("victory-title-text");
        const expText = document.getElementById("victory-exp-text");

        // Trường hợp hiếm: bàn cờ kẹt ngay từ đầu, chưa trả lời được câu nào
        // cả (chưa có vòng nào, cũng chưa có câu dở dang nào).
        if (this.totalCount === 0) {
            this.getRewardImage().then((src) => {
                const img = document.getElementById("victory-pkm-img");
                if (img) {
                    img.src = src;
                    img.style.filter = "grayscale(100%) opacity(0.7)";
                }
            });

            if (titleEl) {
                titleEl.innerText = "💥 BÀN CỜ ĐÃ ĐẦY!";
                titleEl.style.color = "#e74c3c";
                titleEl.style.textShadow = "0 0 30px #e74c3c, 0 0 60px #c0392b";
            }
            if (expText) {
                expText.innerHTML = `
                    <div style="color:#ccc;">Bàn cờ hết chỗ đặt trước khi trả lời được câu nào. Chơi lại nhé!</div>`;
            }
            const overlay = document.getElementById("victory-overlay");
            if (overlay) overlay.style.display = "flex";
            return;
        }

        // Đã đủ câu tối thiểu -> tính là 1 ván hoàn thành, thưởng đầy đủ
        this.getRewardImage().then((src) => {
            const img = document.getElementById("victory-pkm-img");
            if (img) img.src = src;
        });

        if (titleEl) titleEl.innerText = "🏆 HOÀN THÀNH!";

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
                <div style="color:#8fd18f; font-size:13px; margin-bottom:10px;">
                    🔁 Đã hoàn thành ${completedRounds} vòng${leftoverQuestions > 0 ? ` + ${leftoverQuestions} câu dở dang vòng cuối` : ""}
                </div>
                <div style="font-size:13px; text-align:left; margin-bottom:12px; line-height:2;">
                    ${messages.map((m) => `<div>${m}</div>`).join("")}
                </div>
                <div style="border-top:1px solid #444; padding-top:10px; margin-bottom:12px;">
                    <div style="color:#4caf50; font-size:16px; font-weight:bold;">+${result.bonusEXP} KN &nbsp; +${result.bonusDV} DV</div>
                    <div style="color:#aaa; font-size:12px;">Tổng: ${result.newEXP} KN | ${result.newDV} DV</div>
                </div>
                <div style="color:#aaa; font-size:12px; margin-bottom:4px;">
                    🧱 Điểm Block Blast: ${this.score}
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
};

window.BlockGame.init();
