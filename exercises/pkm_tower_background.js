/**
 * ==========================================================
 * PKM TOWER BACKGROUND — NỀN + CỔNG TRIỆU HỒI THEO TỪNG CỤM ROUND
 * ==========================================================
 * Tách riêng khỏi pkm_tower.js để SAU NÀY MUỐN ĐỔI/THÊM BỐI CẢNH CHỈ CẦN
 * SỬA ĐÚNG FILE NÀY — pkm_tower.js chỉ gọi qua đúng 3 hàm công khai:
 *   - TowerBackground.injectStyles()        gọi 1 lần lúc khởi tạo
 *   - TowerBackground.applyTheme(round)      gọi mỗi khi 1 round MỚI bắt đầu
 *   - TowerBackground.spawnFadeIn(enemyEl)   gọi ngay sau khi 1 quái vừa
 *                                             được thêm vào DOM lúc spawn
 *
 * KIẾN TRÚC — giống hệt "sổ đăng ký" quái vật (MONSTER_BASE) trong
 * pkm_tower.js: muốn thêm bối cảnh thứ 6 chỉ cần thêm 1 entry vào THEMES +
 * 1 tên vào THEME_ORDER — không phải sửa gì ở nơi khác. Mỗi theme tự khai
 * báo: nền trời (gradient), màu đường đi, kiểu cổng triệu hồi, và 1 lớp
 * "hạt khí quyển" trôi nổi riêng (đom đóm/bong bóng/tuyết/phấn hoa/sao)
 * để mỗi vùng có không khí khác hẳn nhau dù dùng chung 1 khung kỹ thuật.
 *
 * THỨ TỰ BỐI CẢNH CỐ ĐỊNH (rừng đêm -> biển -> núi -> rừng nhiệt đới ->
 * trời -> quay lại rừng đêm...), nhưng ĐỘ DÀI mỗi chặng (2 hoặc 3 round)
 * được chọn bằng 1 hàm "random giả lập nhưng TẤT ĐỊNH theo round" — nhìn
 * vào thì như random thật, nhưng cùng 1 round luôn ra đúng y kết quả cũ dù
 * tải lại trang bao nhiêu lần, nên KHÔNG CẦN lưu gì thêm vào localStorage.
 *
 * HIỆU NĂNG: mọi phần tử trang trí (cổng, hạt khí quyển, vầng sáng góc
 * trời) chỉ được TẠO 1 LẦN DUY NHẤT cho cả trận — applyTheme() sau đó chỉ
 * đổi class/màu (qua CSS variable), không tạo lại DOM. Mọi animation lặp
 * đều là CSS @keyframes thuần (transform/opacity), không setInterval,
 * không sinh particle liên tục theo thời gian thực — không lặp lại lỗi đơ
 * máy đã gặp trước đây với pkm_skill_normal.js.
 * ==========================================================
 */

window.TowerBackground = {
    // Phải khớp với LANE_X trong pkm_tower.js (3 làn, vị trí % ngang)
    LANE_X: [20, 50, 80],
    AMBIENT_COUNT: 10,

    THEME_ORDER: ['forest', 'sea', 'mountain', 'jungle', 'sky'],

    THEMES: {
        forest: {
            label: 'Rừng Đêm',
            background: `
                radial-gradient(ellipse 70% 40% at 82% 6%, rgba(255,203,110,0.10) 0%, transparent 60%),
                radial-gradient(ellipse 95% 55% at 50% 0%, rgba(90,150,90,0.18) 0%, transparent 72%),
                radial-gradient(circle at 50% 100%, #1c3322 0%, transparent 55%),
                linear-gradient(180deg, #10200f 0%, #0b1710 55%, #060d06 100%)`,
            pathStone: '#7a6a4a', pathStoneDark: '#4a3d28',
            portalColor: '#ff8a3d', portalGlow: 'rgba(255,138,61,0.65)', portalShape: 'hole',
            skyGlow: 'radial-gradient(circle, rgba(255,210,140,0.55), transparent 70%)',
            ambient: { shape: 'firefly', color: '#d8ff8a', glow: '#eaff9a', motion: 'drift-glow', sizeMin: 3, sizeMax: 6 },
            bgDeep: '#0b1710', bgMid: '#16301f', chrome1: '#1c3322', chrome2: '#0e1e14',
        },
        sea: {
            label: 'Vùng Biển',
            background: `
                radial-gradient(ellipse 70% 40% at 18% 5%, rgba(180,240,255,0.14) 0%, transparent 60%),
                radial-gradient(ellipse 95% 60% at 50% 0%, rgba(120,200,220,0.2) 0%, transparent 72%),
                radial-gradient(circle at 50% 100%, #123a4a 0%, transparent 55%),
                linear-gradient(180deg, #0c2a38 0%, #082230 55%, #041420 100%)`,
            pathStone: '#3f7a8a', pathStoneDark: '#204a56',
            portalColor: '#4fc3f7', portalGlow: 'rgba(79,195,247,0.65)', portalShape: 'whirlpool',
            skyGlow: 'radial-gradient(circle, rgba(180,230,255,0.5), transparent 70%)',
            ambient: { shape: 'bubble', color: '#bdeeff', glow: '#eafcff', motion: 'rise', sizeMin: 4, sizeMax: 9 },
            bgDeep: '#051620', bgMid: '#0c2a38', chrome1: '#123a4a', chrome2: '#051620',
        },
        mountain: {
            label: 'Vùng Núi',
            background: `
                radial-gradient(ellipse 70% 40% at 50% 4%, rgba(230,240,255,0.16) 0%, transparent 62%),
                radial-gradient(ellipse 95% 55% at 50% 0%, rgba(220,230,240,0.16) 0%, transparent 72%),
                radial-gradient(circle at 50% 100%, #2e3844 0%, transparent 55%),
                linear-gradient(180deg, #1c242c 0%, #141a20 55%, #090c0f 100%)`,
            pathStone: '#8a94a0', pathStoneDark: '#4a525c',
            portalColor: '#cfe8ff', portalGlow: 'rgba(207,232,255,0.6)', portalShape: 'cave',
            skyGlow: 'radial-gradient(circle, rgba(255,255,255,0.5), transparent 70%)',
            ambient: { shape: 'snow', color: '#ffffff', glow: '#eaf4ff', motion: 'fall', sizeMin: 3, sizeMax: 6 },
            bgDeep: '#0c1014', bgMid: '#1c242c', chrome1: '#2e3844', chrome2: '#0c1014',
        },
        jungle: {
            label: 'Rừng Nhiệt Đới',
            background: `
                radial-gradient(ellipse 70% 40% at 78% 5%, rgba(255,235,160,0.12) 0%, transparent 60%),
                radial-gradient(ellipse 95% 55% at 50% 0%, rgba(140,220,110,0.22) 0%, transparent 72%),
                radial-gradient(circle at 50% 100%, #1f4a20 0%, transparent 55%),
                linear-gradient(180deg, #123018 0%, #0d2412 55%, #061505 100%)`,
            pathStone: '#5a8a3f', pathStoneDark: '#2f4f22',
            portalColor: '#8fe870', portalGlow: 'rgba(143,232,112,0.65)', portalShape: 'vines',
            skyGlow: 'radial-gradient(circle, rgba(255,235,170,0.5), transparent 70%)',
            ambient: { shape: 'pollen', color: '#e9ffb0', glow: '#f6ffd9', motion: 'drift-glow', sizeMin: 2, sizeMax: 5 },
            bgDeep: '#061505', bgMid: '#123018', chrome1: '#1f4a20', chrome2: '#061505',
        },
        sky: {
            label: 'Vùng Trời',
            background: `
                radial-gradient(ellipse 70% 40% at 50% 3%, rgba(255,255,255,0.28) 0%, transparent 60%),
                radial-gradient(ellipse 95% 60% at 50% 0%, rgba(255,255,255,0.16) 0%, transparent 72%),
                radial-gradient(circle at 50% 100%, #3a5a8a 0%, transparent 55%),
                linear-gradient(180deg, #274668 0%, #1c3454 55%, #0c1830 100%)`,
            pathStone: '#c9d8f0', pathStoneDark: '#8ba0c4',
            portalColor: '#ffffff', portalGlow: 'rgba(255,255,255,0.75)', portalShape: 'cloudrift',
            skyGlow: 'radial-gradient(circle, rgba(255,255,255,0.65), transparent 70%)',
            ambient: { shape: 'star', color: '#ffffff', glow: '#dceeff', motion: 'twinkle', sizeMin: 2, sizeMax: 4 },
            bgDeep: '#0c1830', bgMid: '#1c3454', chrome1: '#274668', chrome2: '#0c1830',
        },
    },

    // ── Random GIẢ LẬP nhưng TẤT ĐỊNH — cùng 1 input luôn ra đúng 1 kết quả,
    //    không dùng Math.random() thật nên không cần lưu state ──
    _hash01(n) {
        const x = Math.sin(n * 12.9898) * 43758.5453;
        return x - Math.floor(x); // 0..1
    },

    // Độ dài chặng thứ `chapterIndex` — luôn ra 2 hoặc 3, tất định theo index
    chapterLength(chapterIndex) {
        return 2 + Math.floor(this._hash01(chapterIndex * 7.31 + 1) * 2);
    },

    // Tính theme áp dụng cho 1 round cụ thể — hàm THUẦN (không side-effect),
    // gọi lại bao nhiêu lần với cùng round cũng ra đúng 1 kết quả.
    themeForRound(round) {
        let remaining = Math.max(1, round);
        let chapterIndex = 0;
        while (remaining > this.chapterLength(chapterIndex)) {
            remaining -= this.chapterLength(chapterIndex);
            chapterIndex++;
            if (chapterIndex > 2000) break; // chốt an toàn, tránh vòng lặp vô hạn
        }
        return this.THEME_ORDER[chapterIndex % this.THEME_ORDER.length];
    },

    // ================= CSS — inject 1 lần duy nhất =================
    injectStyles() {
        if (document.getElementById('tower-bg-style')) return;
        const style = document.createElement('style');
        style.id = 'tower-bg-style';
        style.textContent = `
            @keyframes towerPortalPulse { 0%,100%{opacity:0.75; filter:brightness(1);} 50%{opacity:1; filter:brightness(1.4);} }
            @keyframes towerPortalSpin { from{transform:translate(-50%,-50%) rotate(0deg);} to{transform:translate(-50%,-50%) rotate(360deg);} }
            @keyframes towerSkyGlowBreathe { 0%,100%{opacity:0.55; transform:scale(1);} 50%{opacity:0.85; transform:scale(1.08);} }

            @keyframes towerAmbientRise {
                0%   { transform: translateY(0) scale(0.6); opacity: 0; }
                12%  { opacity: 1; }
                88%  { opacity: 1; }
                100% { transform: translateY(-112vh) scale(1); opacity: 0; }
            }
            @keyframes towerAmbientFall {
                0%   { transform: translateY(0) translateX(0); opacity: 0; }
                10%  { opacity: 0.9; }
                90%  { opacity: 0.9; }
                100% { transform: translateY(112vh) translateX(18px); opacity: 0; }
            }
            @keyframes towerAmbientDriftGlow {
                0%   { transform: translate(0,0) scale(0.7); opacity: 0; filter: brightness(1); }
                20%  { opacity: 1; }
                50%  { filter: brightness(1.8); }
                80%  { opacity: 1; }
                100% { transform: translate(var(--drift-x,20px), -60px) scale(0.9); opacity: 0; filter: brightness(1); }
            }
            @keyframes towerAmbientTwinkle {
                0%,100% { opacity: 0.25; transform: scale(0.85); }
                50%     { opacity: 1;    transform: scale(1.15); }
            }

            /* ── Vầng sáng góc trời — 1 phần tử tái sử dụng, chỉ đổi gradient theo theme ── */
            #tower-sky-glow {
                position:absolute; top:-8%; left:50%; width:70%; height:34%;
                transform:translateX(-50%); z-index:0; pointer-events:none;
                filter: blur(14px); animation: towerSkyGlowBreathe 5s ease-in-out infinite;
            }

            /* ── Cổng triệu hồi — 3 điểm, 1 cho mỗi làn ── */
            .tower-portal-mark {
                position:absolute; top:3%; width:36px; height:22px;
                transform:translate(-50%,-50%); z-index:1; pointer-events:none;
                animation: towerPortalPulse 1.8s ease-in-out infinite;
            }
            .tower-portal-mark::after {
                content:''; position:absolute; inset:-8px; border-radius:50%;
                background: radial-gradient(circle, var(--portal-glow) 0%, transparent 70%);
                z-index:-1;
            }
            /* Rừng đêm — hố đen phát sáng cam */
            .portal-hole .tower-portal-mark {
                border-radius:50%;
                background: radial-gradient(ellipse, #000 0%, var(--portal-color) 65%, transparent 85%);
                box-shadow: 0 0 10px var(--portal-glow);
            }
            /* Biển — xoáy nước xoay tròn */
            .portal-whirlpool .tower-portal-mark {
                border-radius:50%;
                background: repeating-conic-gradient(var(--portal-color) 0deg 10deg, transparent 10deg 20deg);
                box-shadow: 0 0 10px var(--portal-glow);
                animation: towerPortalPulse 1.8s ease-in-out infinite, towerPortalSpin 2.6s linear infinite;
            }
            /* Núi — miệng hang đá */
            .portal-cave .tower-portal-mark {
                background: linear-gradient(180deg, #1a1a1a, #000);
                clip-path: polygon(20% 0%, 80% 0%, 100% 60%, 70% 100%, 30% 100%, 0% 60%);
                box-shadow: 0 0 8px var(--portal-glow);
            }
            /* Rừng nhiệt đới — cổng dây leo */
            .portal-vines .tower-portal-mark {
                border-radius: 50% 50% 20% 20%;
                background: repeating-linear-gradient(70deg, var(--portal-color) 0 4px, #1a3a12 4px 8px);
                box-shadow: 0 0 8px var(--portal-glow);
            }
            /* Trời — khe nứt giữa mây */
            .portal-cloudrift .tower-portal-mark {
                background: linear-gradient(180deg, transparent, var(--portal-color));
                clip-path: polygon(45% 0%, 55% 0%, 65% 30%, 50% 45%, 70% 60%, 55% 100%, 45% 100%, 60% 65%, 40% 50%, 55% 35%);
                box-shadow: 0 0 10px var(--portal-glow);
            }

            /* ── Hạt khí quyển trôi nổi — tô đúng "không khí" riêng của mỗi vùng ── */
            .tower-ambient-particle {
                position:absolute; bottom:-6%; border-radius:50%; z-index:1; pointer-events:none;
            }
            .amb-firefly, .amb-pollen {
                animation-name: towerAmbientDriftGlow; animation-timing-function: ease-in-out; animation-iteration-count: infinite;
            }
            .amb-bubble {
                animation-name: towerAmbientRise; animation-timing-function: linear; animation-iteration-count: infinite;
                border: 1px solid rgba(255,255,255,0.5);
            }
            .amb-snow {
                animation-name: towerAmbientFall; animation-timing-function: linear; animation-iteration-count: infinite;
                top:-6%; bottom:auto;
            }
            .amb-star {
                animation-name: towerAmbientTwinkle; animation-timing-function: ease-in-out; animation-iteration-count: infinite;
            }
        `;
        document.head.appendChild(style);
    },

    // ================= ÁP DỤNG THEME CHO 1 ROUND =================
    applyTheme(round) {
        this.injectStyles();
        const key = this.themeForRound(round);
        const theme = this.THEMES[key] || this.THEMES.forest;

        const arena = document.getElementById('tower-arena');
        if (arena) arena.style.background = theme.background;

        // Đổi màu đường-lát-đá + nền chung (body/màn sắp xếp) qua biến CSS
        // có sẵn trong HTML — không cần sửa gì trong HTML, chỉ ghi đè biến.
        document.documentElement.style.setProperty('--path-stone', theme.pathStone);
        document.documentElement.style.setProperty('--path-stone-dark', theme.pathStoneDark);
        document.documentElement.style.setProperty('--bg-deep', theme.bgDeep);
        document.documentElement.style.setProperty('--bg-mid', theme.bgMid);

        // #top-bar và .quiz-card trong pkm_tower.html KHÔNG dùng biến CSS
        // (màu viết cứng trong file) — set thẳng inline style ở đây để
        // chúng đổi màu theo đúng theme, không cần sửa HTML.
        const topBar = document.getElementById('top-bar');
        if (topBar) topBar.style.background = `linear-gradient(180deg, ${theme.chrome1} 0%, ${theme.chrome2} 100%)`;
        const quizCard = document.querySelector('.quiz-card');
        if (quizCard) quizCard.style.background = `linear-gradient(180deg, ${theme.chrome1} 0%, ${theme.chrome2} 100%)`;

        this.renderSkyGlow(theme);
        this.renderPortals(theme);
        this.renderAmbient(theme);
        return key;
    },

    renderSkyGlow(theme) {
        const arena = document.getElementById('tower-arena');
        if (!arena) return;
        let glow = document.getElementById('tower-sky-glow');
        if (!glow) {
            glow = document.createElement('div');
            glow.id = 'tower-sky-glow';
            arena.appendChild(glow);
        }
        glow.style.background = theme.skyGlow;
    },

    renderPortals(theme) {
        const arena = document.getElementById('tower-arena');
        if (!arena) return;
        let wrap = document.getElementById('tower-portal-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'tower-portal-wrap';
            wrap.style.cssText = 'position:absolute; inset:0; z-index:1; pointer-events:none;';
            this.LANE_X.forEach((x) => {
                const mark = document.createElement('div');
                mark.className = 'tower-portal-mark';
                mark.style.left = x + '%';
                wrap.appendChild(mark);
            });
            arena.appendChild(wrap);
        }
        wrap.className = `portal-${theme.portalShape}`;
        wrap.querySelectorAll('.tower-portal-mark').forEach((m) => {
            m.style.setProperty('--portal-color', theme.portalColor);
            m.style.setProperty('--portal-glow', theme.portalGlow);
        });
    },

    // Hạt khí quyển: tạo 1 LẦN DUY NHẤT (AMBIENT_COUNT phần tử), những lần
    // đổi theme sau chỉ RESTYLE lại đúng các phần tử đã có (đổi màu/hình
    // dạng/kiểu chuyển động qua className + CSS variable) — không tạo thêm
    // DOM, tránh phình bộ nhớ qua nhiều round.
    renderAmbient(theme) {
        const arena = document.getElementById('tower-arena');
        if (!arena) return;
        let wrap = document.getElementById('tower-ambient-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'tower-ambient-wrap';
            wrap.style.cssText = 'position:absolute; inset:0; overflow:hidden; z-index:1; pointer-events:none;';
            for (let i = 0; i < this.AMBIENT_COUNT; i++) {
                const p = document.createElement('div');
                p.className = 'tower-ambient-particle';
                p.dataset.seed = this._hash01(i * 3.17 + 5).toFixed(3);
                wrap.appendChild(p);
            }
            arena.appendChild(wrap);
        }

        const cfg = theme.ambient;
        const shapeClass = `amb-${cfg.shape}`;
        wrap.querySelectorAll('.tower-ambient-particle').forEach((p, i) => {
            const seed = parseFloat(p.dataset.seed) || 0.5;
            const seed2 = this._hash01(i * 9.13 + 2);
            const size = cfg.sizeMin + seed * (cfg.sizeMax - cfg.sizeMin);
            const left = 4 + seed2 * 92;
            const duration = 3.5 + seed * 4.5;
            const delay = -(seed2 * duration); // âm để mỗi hạt vào giữa vòng đời khác nhau ngay khi vừa đổi theme

            p.className = `tower-ambient-particle ${shapeClass}`;
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.left = left + '%';
            p.style.background = `radial-gradient(circle, #fff 0%, ${cfg.color} 55%, transparent 85%)`;
            p.style.boxShadow = `0 0 ${Math.round(size * 1.6)}px ${cfg.glow}`;
            p.style.animationDuration = duration + 's';
            p.style.animationDelay = delay + 's';
            p.style.setProperty('--drift-x', (seed > 0.5 ? 1 : -1) * (10 + seed2 * 22) + 'px');
        });
    },

    // ================= QUÁI HIỆN RA DẦN TỪ CỔNG =================
    // Gọi ngay sau khi enemyEl vừa được appendChild vào DOM lúc spawn.
    spawnFadeIn(enemyEl) {
        if (!enemyEl || typeof enemyEl.animate !== 'function') return;
        enemyEl.animate([
            { transform: 'translate(-50%,-50%) scale(0.15)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(1.18)', opacity: 1, offset: 0.7 },
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        ], { duration: 320, easing: 'ease-out' });
    },
};
