/**
 * ==========================================================
 * PKM SKILL BACK — LỚP NỀN TINT MÀU + HẠT KHÍ QUYỂN (v3)
 * ==========================================================
 * Không dùng canvas/requestAnimationFrame. Toàn bộ chạy bằng
 * CSS @keyframes (GPU, không tốn CPU dù chạy suốt skill).
 *
 * 3 LỚP xếp chồng, tất cả chỉ dựng 1 lần lúc show():
 *   1) TINT     — phủ màu theo hệ, opacity tăng dần.
 *   2) STREAKS  — vài dải sáng chéo bất định (giữ nguyên bản v2).
 *   3) PARTICLES— hạt "khí quyển" theo hệ (MỚI):
 *        - Hình dạng (shape) + màu + khoảng kích cỡ (sizeRange)
 *          + số lượng (count) KHAI BÁO RIÊNG cho từng hệ.
 *        - Kiểu chuyển động (motion) dùng CHUNG cho mọi hệ,
 *          chỉ 6 kiểu cố định (rise-fast/float-up/fall-slow/
 *          sway-fall/sparkle/drift-side) — mỗi hệ chỉ CHỌN 1
 *          kiểu có sẵn, không tự vẽ chuyển động riêng.
 *
 * Muốn đổi hạt của 1 hệ → chỉ sửa 1 dòng trong PARTICLE_CONFIG.
 * Muốn thêm hình dạng mới → thêm 1 case trong buildShapeStyle().
 * Muốn thêm kiểu chuyển động mới → thêm 1 @keyframes trong
 * CSS_PARTICLE_MOTION + 1 dòng trong MOTION_DEFAULTS.
 *
 * API giữ NGUYÊN như bản cũ — chỗ gọi (pkm_skill_aoe.js) không
 * cần sửa gì:
 *   const instance = window.PkmSkillBack.createInstance();
 *   instance.show(el, type, posX, posY);
 *   instance.hide(el);
 *   window.PkmSkillBack.register(type, colorHex);
 * ==========================================================
 */

window.PkmSkillBack = (() => {

    // ══════════════════════════════════════════════════════
    // MÀU TINT THEO HỆ (dùng cho lớp 1 - TINT)
    // ══════════════════════════════════════════════════════
    const TYPE_COLORS = {
        fire:     '#ff5500', water:    '#3498db', electric: '#f1c40f',
        grass:    '#2ecc71', ice:      '#74b9ff', poison:   '#9b59b6',
        ground:   '#c68a3d', flying:   '#a890f0', psychic:  '#f85888',
        fighting: '#e74c3c', ghost:    '#705898', dark:     '#4a3d5c',
        steel:    '#b8b8d0', dragon:   '#7038f8', fairy:    '#ee99ac',
        normal:   '#c9c1a9', rock:     '#b8a038', bug:      '#a8b820',
    };

    // ══════════════════════════════════════════════════════
    // KIỂU CHUYỂN ĐỘNG DÙNG CHUNG (6 kiểu cố định)
    // Mỗi hệ ở PARTICLE_CONFIG bên dưới chỉ CHỌN 1 trong 6 tên này.
    // ══════════════════════════════════════════════════════
    const MOTION_DEFAULTS = {
        'rise-fast':  { durMin: 1.0, durMax: 1.8 }, // bay vụt lên nhanh (tàn lửa, bụi bật lên)
        'float-up':   { durMin: 2.5, durMax: 4.0 }, // trôi lên chậm rãi (bong bóng, phấn hoa, khí)
        'fall-slow':  { durMin: 3.0, durMax: 5.0 }, // rơi chậm (tuyết, đá vụn)
        'sway-fall':  { durMin: 3.0, durMax: 4.5 }, // rơi lắc lư 2 bên (lá cây)
        'sparkle':    { durMin: 0.7, durMax: 1.3 }, // lấp lánh tại chỗ (điện, thép, tiên, bóng tối)
        'drift-side': { durMin: 1.6, durMax: 2.6 }, // lướt ngang (gió, lưỡi đao)
    };

    const CSS_PARTICLE_MOTION = `
        @keyframes pkmback-p-rise-fast {
            0%   { opacity: 0; transform: translateY(0)      scale(0.6); }
            15%  { opacity: 1; transform: translateY(-10px)  scale(1);   }
            100% { opacity: 0; transform: translateY(-70px)  scale(0.8); }
        }
        @keyframes pkmback-p-float-up {
            0%   { opacity: 0; transform: translate(0,0)      scale(0.7); }
            20%  { opacity: 0.9; }
            100% { opacity: 0; transform: translate(6px,-90px) scale(1); }
        }
        @keyframes pkmback-p-fall-slow {
            0%   { opacity: 0; transform: translate(0,0)      scale(0.8); }
            20%  { opacity: 0.85; }
            100% { opacity: 0; transform: translate(-8px,90px) scale(0.9); }
        }
        @keyframes pkmback-p-sway-fall {
            0%   { opacity: 0;   transform: translate(0,-10px)   rotate(0deg)   scale(0.7); }
            25%  { opacity: 0.9; }
            50%  { transform: translate(18px,20px) rotate(35deg)  scale(1);    }
            75%  { transform: translate(-14px,55px) rotate(-20deg) scale(0.95); }
            100% { opacity: 0; transform: translate(10px,85px)   rotate(50deg) scale(0.85); }
        }
        @keyframes pkmback-p-sparkle {
            0%   { opacity: 0; transform: scale(0.3); }
            40%  { opacity: 1; transform: scale(1.15); }
            70%  { opacity: 0.8; transform: scale(0.9); }
            100% { opacity: 0; transform: scale(0.3); }
        }
        @keyframes pkmback-p-drift-side {
            0%   { opacity: 0; transform: translate(-40px,0) rotate(-10deg); }
            15%  { opacity: 1; }
            85%  { opacity: 1; }
            100% { opacity: 0; transform: translate(70px,10px) rotate(10deg); }
        }
    `;

    // ══════════════════════════════════════════════════════
    // CẤU HÌNH HẠT THEO TỪNG HỆ — SỬA HỆ NÀO CHỈ SỬA DÒNG ĐÓ
    // shape: tên hình dạng (map ở buildShapeStyle bên dưới)
    // color: màu chính (có thể là mảng để random nhiều màu)
    // sizeRange: [min, max] px — hạt to/nhỏ ngẫu nhiên trong khoảng này
    // count: số hạt hiển thị cùng lúc
    // motion: 1 trong 6 kiểu ở MOTION_DEFAULTS
    // ══════════════════════════════════════════════════════
    const PARTICLE_CONFIG = {
        fire:     { shape: 'ember',        color: ['#fff','#ffdf00','#ff8c00'], sizeRange: [3, 8],   count: 10, motion: 'rise-fast'  },
        water:    { shape: 'bubble',       color: '#8ecdf0',                    sizeRange: [5, 11],  count: 8,  motion: 'float-up'   },
        electric: { shape: 'spark',        color: '#fff8b0',                    sizeRange: [3, 10],  count: 9,  motion: 'sparkle'    },
        grass:    { shape: 'leaf',         color: ['#2ecc71','#6fcf5a'],        sizeRange: [9, 17],  count: 8,  motion: 'sway-fall'  },
        ice:      { shape: 'crystal',      color: '#dff6ff',                    sizeRange: [4, 9],   count: 9,  motion: 'fall-slow'  },
        poison:   { shape: 'blob',         color: '#b366d9',                    sizeRange: [7, 15],  count: 7,  motion: 'float-up'   },
        ground:   { shape: 'dust',         color: '#c68a3d',                    sizeRange: [3, 7],   count: 9,  motion: 'rise-fast'  },
        flying:   { shape: 'blade',        color: '#e6e0ff',                    sizeRange: [10, 18], count: 7,  motion: 'drift-side' },
        psychic:  { shape: 'ring',         color: '#f88bb0',                    sizeRange: [7, 14],  count: 7,  motion: 'sparkle'    },
        fighting: { shape: 'shard',        color: '#ff6b5b',                    sizeRange: [5, 11],  count: 8,  motion: 'rise-fast'  },
        bug:      { shape: 'spore',        color: '#c6e05a',                    sizeRange: [2, 5],   count: 12, motion: 'float-up'   },
        rock:     { shape: 'rockchunk',    color: '#a08050',                    sizeRange: [7, 15],  count: 8,  motion: 'fall-slow'  },
        ghost:    { shape: 'wisp',         color: '#9a8bd6',                    sizeRange: [12, 22], count: 5,  motion: 'float-up', durMin: 4, durMax: 6 },
        dark:     { shape: 'darkshard',    color: '#5a4a78',                    sizeRange: [6, 13],  count: 8,  motion: 'sparkle'    },
        steel:    { shape: 'glint',        color: '#eef0f5',                    sizeRange: [4, 9],   count: 8,  motion: 'sparkle'    },
        dragon:   { shape: 'dragonshard',  color: '#a684ff',                    sizeRange: [6, 13],  count: 7,  motion: 'float-up'   },
        fairy:    { shape: 'star',         color: ['#ffd1e6','#fff'],           sizeRange: [4, 9],   count: 9,  motion: 'sparkle'    },
        normal:   { shape: 'plaindot',     color: '#d8d2c0',                    sizeRange: [4, 8],   count: 7,  motion: 'float-up'   },
    };

    // ══════════════════════════════════════════════════════
    // HÌNH DẠNG CSS THEO TỪNG HỆ — thêm hệ mới thì thêm 1 case ở đây
    // ══════════════════════════════════════════════════════
    function buildShapeStyle(shape, size, color) {
        switch (shape) {
            case 'ember': // Lửa — tròn nhỏ, glow lõi sáng
                return `width:${size}px;height:${size}px;border-radius:50%;
                    background:radial-gradient(circle, #fff 10%, ${color} 55%, transparent 100%);
                    box-shadow:0 0 ${size}px ${color};`;

            case 'bubble': // Nước — tròn có highlight, viền sáng
                return `width:${size}px;height:${size}px;border-radius:50%;
                    background:radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, ${color}99 55%, transparent 100%);
                    border:1px solid rgba(255,255,255,0.5);`;

            case 'spark': // Điện — que sáng ngắn, glow mạnh
                return `width:${size * 3}px;height:${Math.max(1.5, size * 0.3)}px;
                    background:${color};border-radius:2px;
                    box-shadow:0 0 ${size}px #fff, 0 0 ${size * 1.6}px ${color};`;

            case 'leaf': // Cỏ — lá bất đối xứng
                return `width:${size}px;height:${size * 0.6}px;
                    background:linear-gradient(135deg, ${color}, #1f8a44);
                    border-radius:80% 10% 80% 10%;`;

            case 'crystal': // Băng — tinh thể kim cương
                return `width:${size}px;height:${size}px;
                    background:linear-gradient(160deg, #fff, ${color});
                    clip-path:polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
                    box-shadow:0 0 ${size * 0.8}px #fff;`;

            case 'blob': // Độc — mảng hữu cơ méo mó
                return `width:${size}px;height:${size * 0.75}px;
                    background:radial-gradient(circle, ${color}, #4a1866);
                    border-radius:40% 60% 70% 30% / 40% 50% 60% 50%;
                    filter:blur(0.5px);`;

            case 'dust': // Đất — bụi nhỏ mờ
                return `width:${size}px;height:${size}px;border-radius:50%;
                    background:${color};opacity:0.85;filter:blur(0.6px);`;

            case 'blade': // Bay — lưỡi gió cong dài
                return `width:${size * 3}px;height:${size * 0.5}px;
                    background:linear-gradient(to right, transparent, ${color}, #fff, ${color}, transparent);
                    border-radius:100% 0% 100% 0%;`;

            case 'ring': // Tâm linh — vòng tròn rỗng
                return `width:${size}px;height:${size}px;border-radius:50%;
                    border:2px solid ${color};background:transparent;
                    box-shadow:0 0 ${size * 0.6}px ${color};`;

            case 'shard': // Chiến đấu — tam giác nhọn
                return `width:${size}px;height:${size}px;
                    background:linear-gradient(160deg, #fff, ${color});
                    clip-path:polygon(50% 0%, 100% 100%, 0% 100%);`;

            case 'spore': // Côn trùng — hạt phấn li ti
                return `width:${size}px;height:${size}px;border-radius:50%;
                    background:${color};box-shadow:0 0 3px ${color};`;

            case 'rockchunk': // Đá — mảnh đá góc cạnh
                return `width:${size}px;height:${size}px;
                    background:linear-gradient(135deg, #cdb37a, ${color});
                    clip-path:polygon(20% 0%, 80% 10%, 100% 50%, 70% 100%, 20% 100%, 0% 50%);`;

            case 'wisp': // Ma — quầng mờ ảo
                return `width:${size}px;height:${size}px;border-radius:50%;
                    background:radial-gradient(circle, ${color}aa 0%, transparent 75%);
                    filter:blur(3px);`;

            case 'darkshard': // Bóng tối — mảnh vỡ tối màu
                return `width:${size}px;height:${size}px;
                    background:${color};
                    clip-path:polygon(10% 0%, 100% 50%, 10% 100%, 0% 50%);
                    box-shadow:0 0 ${size * 0.5}px ${color};`;

            case 'glint': // Thép — thoi kim loại sáng
                return `width:${size}px;height:${size}px;
                    background:linear-gradient(135deg, #fff, ${color});
                    clip-path:polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
                    box-shadow:0 0 ${size}px #fff;`;

            case 'dragonshard': // Rồng — mảnh năng lượng
                return `width:${size}px;height:${size}px;
                    background:linear-gradient(160deg, #fff, ${color});
                    clip-path:polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
                    box-shadow:0 0 ${size}px ${color};`;

            case 'star': // Tiên — ngôi sao 4 cánh
                return `width:${size}px;height:${size}px;
                    background:${color};
                    clip-path:polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
                    box-shadow:0 0 ${size * 0.6}px #fff;`;

            case 'plaindot': // Thường — chấm tròn trơn
            default:
                return `width:${size}px;height:${size}px;border-radius:50%;
                    background:${color};opacity:0.8;`;
        }
    }

    function injectStyles() {
        if (document.getElementById('pkm-skillback-style')) return;
        const style = document.createElement('style');
        style.id = 'pkm-skillback-style';
        style.textContent = `
            .pkm-back-tint {
                position: absolute; inset: 0;
                z-index: 0;
                opacity: 0;
                transition: opacity 0.45s ease-out;
                pointer-events: none;
            }
            .pkm-back-tint.show { opacity: 1; }

            

            .pkm-back-particle {
                position: absolute;
                pointer-events: none;
                animation-iteration-count: infinite;
                animation-timing-function: ease-in-out;
            }
            ${CSS_PARTICLE_MOTION}
        `;
        document.head.appendChild(style);
    }

    // ── Dải sáng chéo bất định (giữ nguyên bản v2) ──
    

    // ── Hạt khí quyển theo hệ (MỚI) ──
    function buildParticles(container, type) {
        const cfg = PARTICLE_CONFIG[type] || PARTICLE_CONFIG.normal;
        const motionCfg = MOTION_DEFAULTS[cfg.motion] || MOTION_DEFAULTS['float-up'];
        const durMin = cfg.durMin || motionCfg.durMin;
        const durMax = cfg.durMax || motionCfg.durMax;

        const particles = [];
        for (let i = 0; i < cfg.count; i++) {
            const size = cfg.sizeRange[0] + Math.random() * (cfg.sizeRange[1] - cfg.sizeRange[0]);
            const color = Array.isArray(cfg.color) ? cfg.color[Math.floor(Math.random() * cfg.color.length)] : cfg.color;

            const el = document.createElement('div');
            el.className = 'pkm-back-particle';
            el.style.cssText = buildShapeStyle(cfg.shape, size, color);
            el.style.top = `${Math.random() * 90}%`;
            el.style.left = `${Math.random() * 90}%`;
            el.style.animationName = `pkmback-p-${cfg.motion}`;
            el.style.animationDuration = `${(durMin + Math.random() * (durMax - durMin)).toFixed(2)}s`;
            el.style.animationDelay = `${(Math.random() * durMax).toFixed(2)}s`;

            container.appendChild(el);
            particles.push(el);
        }
        return particles;
    }

    function createInstance() {
        let tintEl = null;
        let decorEls = []; // gồm cả streaks + particles, dọn chung 1 lượt
        let hideTimer = null;

        return {
            show(el, type, posX = 50, posY = 50) {
                injectStyles();
                if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

                const color = TYPE_COLORS[type] || TYPE_COLORS.normal;

                if (tintEl) tintEl.remove();
                decorEls.forEach(d => d.remove());
                decorEls = [];

                // 1) TINT
                tintEl = document.createElement('div');
                tintEl.className = 'pkm-back-tint';
                tintEl.style.background =
                    `radial-gradient(ellipse 140% 140% at ${posX}% ${posY}%, ${color}40 0%, ${color}22 55%, rgba(0,0,0,0.15) 100%)`;
                el.appendChild(tintEl);

                // PARTICLES — hạt khí quyển riêng theo hệ
                decorEls = decorEls.concat(buildParticles(tintEl, type));

                requestAnimationFrame(() => tintEl.classList.add('show'));
            },

            hide(el) {
                if (!tintEl) return;
                tintEl.classList.remove('show');
                const target = tintEl;
                const toRemove = decorEls;
                hideTimer = setTimeout(() => {
                    target.remove();
                    toRemove.forEach(d => d.remove());
                }, 480);
                tintEl = null;
                decorEls = [];
            },
        };
    }

    const defaultInstance = createInstance();

    return {
        show: defaultInstance.show,
        hide: defaultInstance.hide,
        createInstance,
        register(type, colorHex) {
            TYPE_COLORS[type] = colorHex;
        },
    };
})();
