/**
 * ==========================================================
 * PKM CHESS — SCENERY (cảnh nền xung quanh bàn cờ)
 * ==========================================================
 * Vẽ hậu cảnh kiểu "diorama" nhiều lớp (trời + dải xa + dải giữa + mặt đất
 * gần) bao quanh bàn cờ nghiêng 3D, với 4 chủ đề xoay vòng theo ván đấu:
 *   Đồng Bằng (plains) → Rừng Rậm (forest) → Núi Cao (mountain) → Đại Dương (sea)
 *
 * KHÔNG dùng ảnh/asset có bản quyền — mọi thứ vẽ bằng CSS gradient +
 * clip-path polygon, tô màu qua CSS custom properties. Đổi theme chỉ cần
 * đổi biến màu + toggle 1 class, KHÔNG build lại DOM -> rất nhẹ.
 *
 * CÁCH DÙNG (đã được gắn sẵn trong pkm_chess.js):
 *   window.ChessScenery.mount('chess-scenery');   // gọi 1 lần lúc init
 *   window.ChessScenery.setTheme('forest');       // đổi cảnh bất kỳ lúc nào
 *   window.ChessScenery.themeForRound(round);     // xoay vòng theo số ván
 *
 * TÙY CHỈNH NHANH:
 *   - Muốn đổi màu 1 theme -> sửa trong PALETTES bên dưới.
 *   - Muốn thêm theme mới -> thêm 1 key vào THEMES + PALETTES tương ứng,
 *     mọi lớp (sky/far/mid/ground) sẽ tự động ăn theo màu mới.
 *   - Muốn chỉnh độ "sâu" giữa các lớp -> sửa `bottom`/`height` trong CSS
 *     của .scenery-far / .scenery-mid / .scenery-ground bên dưới.
 * ==========================================================
 */
window.ChessScenery = {
    THEMES: ['plains', 'forest', 'mountain', 'sea'],

    PALETTES: {
        plains: {
            label: 'Đồng Bằng',
            skyTop: '#3a2a12', skyBottom: '#8a5a2a', sun: '#ffdca0',
            far: '#6b4a26', mid: '#9c7a3a', midAccent: '#7a5e28',
            ground: '#3f2c16', groundLine: '#6b4a24',
        },
        forest: {
            label: 'Rừng Rậm',
            skyTop: '#0e1c14', skyBottom: '#2c4a30', sun: '#d8e8a0',
            far: '#1c3524', mid: '#204020', midAccent: '#173318',
            ground: '#1c220f', groundLine: '#33401a',
        },
        mountain: {
            label: 'Núi Cao',
            skyTop: '#141b30', skyBottom: '#4a3a5a', sun: '#f0d8ff',
            far: '#332a4a', mid: '#463c58', midAccent: '#2a2440',
            ground: '#221d2c', groundLine: '#382f4a',
        },
        sea: {
            label: 'Đại Dương',
            skyTop: '#0c2436', skyBottom: '#3a6a6a', sun: '#ffd9a0',
            far: '#123444', mid: '#1a5060', midAccent: '#0e3c4a',
            ground: '#0a262e', groundLine: '#1c4a54',
        },
    },

    _mounted: false,
    _current: null,

    injectStyles() {
        if (document.getElementById('chess-scenery-style')) return;
        const style = document.createElement('style');
        style.id = 'chess-scenery-style';
        style.textContent = `
            @keyframes sceneryDrift     { 0% { transform:translateX(-4%); } 100% { transform:translateX(4%); } }
            @keyframes sceneryTwinkle   { 0%,100% { opacity:.2; } 50% { opacity:.9; } }
            @keyframes sceneryWaveShift { 0% { background-position-x:0; } 100% { background-position-x:120px; } }
            @keyframes scenerySunPulse  { 0%,100% { opacity:.8; filter:blur(6px); } 50% { opacity:1; filter:blur(9px); } }

            .chess-scenery-root { --sc-transition: 1.1s ease; }

            .scenery-sky {
                position:absolute; inset:0;
                background: linear-gradient(180deg, var(--sc-sky-top) 0%, var(--sc-sky-bottom) 78%, transparent 100%);
                transition: background var(--sc-transition);
            }
            .scenery-sun {
                position:absolute; left:50%; top:13%; width:34vw; height:34vw; max-width:220px; max-height:220px;
                transform:translate(-50%,-50%); border-radius:50%; opacity:.85;
                background: radial-gradient(circle, var(--sc-sun) 0%, transparent 72%);
                animation: scenerySunPulse 6s ease-in-out infinite;
                transition: background var(--sc-transition);
            }
            .scenery-stars { position:absolute; left:0; right:0; top:0; height:55%; opacity:0; transition:opacity var(--sc-transition); }
            .scenery-star {
                position:absolute; width:3px; height:3px; border-radius:50%; background:#fff;
                animation: sceneryTwinkle 3.4s ease-in-out infinite;
            }
            /* Sao chỉ hiện rõ trên nền trời tối (núi / biển đêm) */
            .theme-mountain .scenery-stars, .theme-sea .scenery-stars { opacity:.8; }

            /* Dải XA — răng cưa (núi / đường chân trời gợn sóng), 1 clip-path
               dùng chung cho mọi theme, chỉ đổi màu nền theo biến CSS. */
            .scenery-far {
                position:absolute; left:-12%; right:-12%; bottom:31%; height:20vh; min-height:100px;
                background: var(--sc-far); opacity:.9; transition: background var(--sc-transition);
                clip-path: polygon(0% 100%, 0% 58%, 8% 32%, 16% 60%, 24% 18%, 33% 52%, 42% 24%, 51% 58%,
                                    60% 22%, 69% 50%, 78% 15%, 87% 48%, 95% 26%, 100% 56%, 100% 100%);
            }
            /* Dải GIỮA — gò/rừng/đồi, 2 lớp chồng (bo tròn hơn dải xa) */
            .scenery-mid {
                position:absolute; left:-12%; right:-12%; bottom:20%; height:15vh; min-height:86px;
                background: var(--sc-mid); opacity:.95; transition: background var(--sc-transition);
                clip-path: polygon(0% 100%, 0% 66%, 6% 42%, 12% 63%, 18% 38%, 25% 62%, 32% 34%, 40% 60%,
                                    48% 40%, 56% 62%, 64% 36%, 72% 60%, 80% 40%, 88% 62%, 94% 44%, 100% 64%, 100% 100%);
            }
            .scenery-mid::after {
                content:''; position:absolute; inset:0; background: var(--sc-mid-accent);
                opacity:.65; transition: background var(--sc-transition);
                clip-path: polygon(0% 100%, 3% 72%, 10% 54%, 20% 74%, 30% 52%, 40% 76%, 50% 54%,
                                    60% 78%, 70% 56%, 80% 76%, 90% 58%, 100% 74%, 100% 100%);
            }
            /* Sóng — chỉ hiện ở theme biển */
            .scenery-waves {
                position:absolute; left:-12%; right:-12%; bottom:16%; height:8vh; min-height:42px;
                background-image: repeating-linear-gradient(100deg, rgba(255,255,255,.16) 0 6px, transparent 6px 60px);
                opacity:0; transition:opacity .6s ease; animation: sceneryWaveShift 4s linear infinite;
            }
            .theme-sea .scenery-waves { opacity:.55; }

            /* Sọc ruộng — chỉ hiện rõ ở theme đồng bằng (đất canh tác) */
            .scenery-fields {
                position:absolute; left:-12%; right:-12%; bottom:18%; height:11vh; min-height:56px;
                background-image: repeating-linear-gradient(88deg, rgba(255,220,140,.10) 0 18px, transparent 18px 46px);
                opacity:0; transition:opacity .6s ease;
            }
            .theme-plains .scenery-fields { opacity:.8; }

            /* Mặt đất GẦN — nghiêng cùng góc với bàn cờ (rotateX 42deg) để
               tạo cảm giác cùng 1 mặt phẳng 3D, mờ dần lên trên để hoà vào
               bóng đổ dưới bàn cờ (không cần khớp pixel-perfect). */
            .scenery-ground-wrap {
                position:absolute; left:50%; bottom:0; width:150vw; max-width:1400px;
                transform:translateX(-50%); perspective:1400px; z-index:1;
            }
            .scenery-ground {
                position:relative; width:100%; height:32vh; min-height:150px;
                background: linear-gradient(180deg, transparent 0%, var(--sc-ground) 40%, var(--sc-ground) 100%);
                transform: rotateX(42deg); transform-origin: center bottom;
                -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 32%);
                        mask-image: linear-gradient(180deg, transparent 0%, #000 32%);
                transition: background var(--sc-transition);
            }
            .scenery-ground::before {
                content:''; position:absolute; inset:0; opacity:.35;
                background-image: repeating-linear-gradient(90deg, var(--sc-ground-line) 0 2px, transparent 2px 64px);
                transition: background-image var(--sc-transition);
            }

            .scenery-drift-slow { animation: sceneryDrift 34s ease-in-out infinite alternate; }
            .scenery-drift-fast { animation: sceneryDrift 22s ease-in-out infinite alternate-reverse; }
        `;
        document.head.appendChild(style);
    },

    applyPalette(root, key) {
        const p = this.PALETTES[key] || this.PALETTES.plains;
        root.style.setProperty('--sc-sky-top', p.skyTop);
        root.style.setProperty('--sc-sky-bottom', p.skyBottom);
        root.style.setProperty('--sc-sun', p.sun);
        root.style.setProperty('--sc-far', p.far);
        root.style.setProperty('--sc-mid', p.mid);
        root.style.setProperty('--sc-mid-accent', p.midAccent);
        root.style.setProperty('--sc-ground', p.ground);
        root.style.setProperty('--sc-ground-line', p.groundLine);
    },

    // Gọi 1 LẦN lúc khởi tạo game — dựng khung DOM cố định, sau đó mọi lần
    // đổi cảnh chỉ cần setTheme() (đổi biến màu + toggle class, không rebuild).
    mount(containerId, initialTheme) {
        this.injectStyles();
        const root = document.getElementById(containerId);
        if (!root) return;
        root.classList.add('chess-scenery-root');
        root.innerHTML = `
            <div class="scenery-sky"></div>
            <div class="scenery-sun"></div>
            <div class="scenery-stars" id="chess-scenery-stars"></div>
            <div class="scenery-far scenery-drift-slow"></div>
            <div class="scenery-mid scenery-drift-fast"></div>
            <div class="scenery-waves"></div>
            <div class="scenery-fields"></div>
            <div class="scenery-ground-wrap"><div class="scenery-ground"></div></div>
        `;
        const starsEl = document.getElementById('chess-scenery-stars');
        if (starsEl) {
            let html = '';
            for (let i = 0; i < 18; i++) {
                const left = (Math.random() * 100).toFixed(1);
                const top = (Math.random() * 55).toFixed(1);
                const delay = (Math.random() * 3).toFixed(2);
                html += `<div class="scenery-star" style="left:${left}%; top:${top}%; animation-delay:${delay}s;"></div>`;
            }
            starsEl.innerHTML = html;
        }
        this._mounted = true;
        this.setTheme(initialTheme || this.THEMES[0], root);
    },

    // Đổi cảnh nền — có thể gọi bất cứ lúc nào (ví dụ mỗi khi bắt đầu ván mới).
    setTheme(key, root) {
        root = root || document.querySelector('.chess-scenery-root');
        if (!root) return;
        if (!this.PALETTES[key]) key = 'plains';
        this.THEMES.forEach(t => root.classList.remove('theme-' + t));
        root.classList.add('theme-' + key);
        this.applyPalette(root, key);
        this._current = key;
    },

    // Xoay vòng chủ đề theo số ván (Ván 1 = plains, Ván 2 = forest, ...).
    themeForRound(round) {
        const n = Math.max(1, parseInt(round, 10) || 1);
        return this.THEMES[(n - 1) % this.THEMES.length];
    },
};