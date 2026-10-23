/**
 * ============================================================
 * PKM SKILL BACK — CANVAS BACKGROUND SYSTEM v2.0
 * Kiến trúc: Mỗi hệ = 1 hàm renderer độc lập
 *
 * Cách thêm/sửa hệ:
 *   1. Tìm hàm render_<tên_hệ>(ctx, W, H, t, state) bên dưới
 *   2. Sửa thoải mái — các hệ khác không bị ảnh hưởng
 *   3. Nếu cần utility mới → thêm vào khu vực SHARED UTILITIES
 *
 * Public API (giữ nguyên để tương thích):
 *   PkmSkillBack.show(el, type, posX, posY)
 *   PkmSkillBack.hide(el)
 * ============================================================
 */

window.PkmSkillBack = (() => {
    // ─────────────────────────────────────────────
    // ENGINE STATE
    // ─────────────────────────────────────────────
    function createInstance() {
        // ─────────────────────────────────────────────
        // ENGINE STATE
        // ─────────────────────────────────────────────
    let canvas = null;
    let ctx = null;
    let raf = null;
    let startTime = 0;
    let overlayEl = null;
    let bgLayer = null;
    let currentType = "normal";

    // State object truyền vào renderer mỗi frame
    // Mỗi hệ có thể lưu dữ liệu riêng vào state.local
    let state = { local: {}, particles: [] };

    // ─────────────────────────────────────────────
    // SHARED UTILITIES — dùng chung cho nhiều hệ
    // ─────────────────────────────────────────────
    const U = {
        // Random trong khoảng [a, b]
        rand: (a, b) => a + Math.random() * (b - a),

        // Random phần tử trong mảng
        pick: (arr) => arr[Math.floor(Math.random() * arr.length)],

        // Vẽ vòng tròn (stroke)
        ring(ctx, cx, cy, r, color, alpha, lineWidth = 2, blur = 0) {
            ctx.save();
            if (blur) ctx.filter = `blur(${blur}px)`;
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        },

        // Vẽ hình tròn (fill)
        circle(ctx, x, y, r, color, alpha) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },

        // Vẽ tia sét gấp khúc từ (x1,y1) đến (x2,y2)
        lightning(
            ctx,
            x1,
            y1,
            x2,
            y2,
            color = "#fff",
            glowColor = "#f1c40f",
            segments = 10,
            spread = 60,
        ) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            let cx = x1,
                cy = y1;
            ctx.moveTo(cx, cy);
            for (let i = 1; i <= segments; i++) {
                const noise = (Math.random() - 0.5) * spread;
                const nx = cx + (x2 - cx) / (segments - i + 1) + noise;
                const ny =
                    cy +
                    (y2 - cy) / (segments - i + 1) +
                    (Math.random() - 0.5) * 25;
                ctx.lineTo(nx, ny);
                cx = nx;
                cy = ny;
            }
            ctx.stroke();
            ctx.restore();
        },

        // Gradient radial đơn giản
        radialGrad(ctx, cx, cy, r0, r1, stops) {
            const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
            stops.forEach(([pos, color]) => g.addColorStop(pos, color));
            return g;
        },

        // Particle đơn giản: { x,y,vx,vy,r,color,alpha,gravity,life,age,fade,fadeSpeed,shape,spin,angle }
        makeParticle(cfg, W, H) {
            return {
                x: U.rand(cfg.spawnX[0], cfg.spawnX[1]) * W,
                y: U.rand(cfg.spawnY[0], cfg.spawnY[1]) * H,
                vx: U.rand(cfg.velX[0], cfg.velX[1]),
                vy: U.rand(cfg.velY[0], cfg.velY[1]),
                r: U.rand(cfg.size[0], cfg.size[1]),
                color: U.pick(cfg.colors),
                alpha: U.rand(0.3, 1.0),
                gravity: cfg.gravity || 0,
                life: U.rand(...(cfg.life || [0.5, 1.0])),
                age: Math.random() * U.rand(...(cfg.life || [0.5, 1.0])), // stagger
                fade: cfg.fade || false,
                fadeSpeed: cfg.fadeSpeed || 0.01,
                shape: cfg.shape || "circle",
                spin: cfg.spin || false,
                angle: Math.random() * Math.PI * 2,
                flicker: cfg.flicker || false,
                blur: cfg.blur || 0,
                _cfg: cfg,
                _W: W,
                _H: H,
            };
        },

        respawn(p) {
            const c = p._cfg,
                W = p._W,
                H = p._H;
            p.x = U.rand(c.spawnX[0], c.spawnX[1]) * W;
            p.y = U.rand(c.spawnY[0], c.spawnY[1]) * H;
            p.vx = U.rand(c.velX[0], c.velX[1]);
            p.vy = U.rand(c.velY[0], c.velY[1]);
            p.color = U.pick(c.colors);
            p.alpha = U.rand(0.3, 1.0);
            p.age = 0;
        },

        // Update + draw toàn bộ particle array
        tickParticles(ctx, particles, W, H) {
            for (const p of particles) {
                p.age += 0.016;
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity;
                if (p.spin) p.angle += 0.05;
                if (p.flicker) p.alpha = U.rand(0.3, 1.0);
                else if (p.fade) p.alpha -= p.fadeSpeed;

                const dead =
                    p.age > p.life ||
                    p.alpha <= 0 ||
                    p.y > H + 30 ||
                    p.y < -30 ||
                    p.x < -30 ||
                    p.x > W + 30;
                if (dead) U.respawn(p);
                else U.drawParticle(ctx, p);
            }
        },

        drawParticle(ctx, p) {
            ctx.save();
            if (p.blur > 0) ctx.filter = `blur(${p.blur}px)`;
            ctx.globalAlpha = Math.max(0, p.alpha);
            if (p.shape === "ring") {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = Math.max(1, p.r * 0.25);
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (p.shape === "leaf") {
                ctx.translate(p.x, p.y);
                ctx.rotate(p.angle);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.ellipse(0, 0, p.r * 0.5, p.r, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "rgba(80,160,60,0.4)";
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(0, -p.r);
                ctx.lineTo(0, p.r);
                ctx.stroke();
            } else if (p.shape === "petal") {
                ctx.translate(p.x, p.y);
                ctx.rotate(p.angle);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.ellipse(0, 0, p.r * 0.4, p.r * 0.8, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.shape === "diamond") {
                ctx.translate(p.x, p.y);
                ctx.rotate(p.angle);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.moveTo(0, -p.r);
                ctx.lineTo(p.r * 0.6, 0);
                ctx.lineTo(0, p.r);
                ctx.lineTo(-p.r * 0.6, 0);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        },

        // Spawn một batch particle từ config, push vào mảng
        spawnBatch(particles, cfg, W, H) {
            for (let i = 0; i < cfg.count; i++) {
                particles.push(U.makeParticle(cfg, W, H));
            }
        },
    };

    // ─────────────────────────────────────────────
    // RENDERER MỖI HỆ
    // Signature: (ctx, W, H, t, state)
    //   ctx   — canvas 2d context
    //   W, H  — kích thước canvas
    //   t     — milliseconds từ lúc show()
    //   state — { local: {}, particles: [] }
    //           local: bộ nhớ riêng của hệ, reset mỗi lần show()
    // ─────────────────────────────────────────────

    const R = {};

    // ── 🔥 HỆ LỬA ──────────────────────────────
    R.fire = function (ctx, W, H, t, state) {
        const L = state.local;
        const period = 2000;
        if (!L.ready) {
            L.ready = true;
            overlayEl.style.backgroundColor = "#050000";
            U.spawnBatch(
                state.particles,
                {
                    count: 35,
                    size: [1.5, 3.5],
                    colors: ["#fff", "#ffdf00", "#ff8800"],
                    spawnX: [0.1, 0.9],
                    spawnY: [0.85, 1.0],
                    velX: [-0.6, 0.6],
                    velY: [-3.5, -1.2],
                    gravity: 0.04,
                    fade: true,
                    fadeSpeed: 0.012,
                    life: [0.6, 1.0],
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 18,
                    size: [3, 6],
                    colors: [
                        "rgba(255,200,0,0.8)",
                        "rgba(255,100,0,0.9)",
                        "rgba(255,255,255,0.7)",
                    ],
                    spawnX: [0.2, 0.8],
                    spawnY: [0.7, 1.0],
                    velX: [-1.0, 1.0],
                    velY: [-4.5, -1.5],
                    gravity: 0.06,
                    fade: true,
                    fadeSpeed: 0.008,
                    life: [0.5, 0.9],
                },
                W,
                H,
            );
        }
        const phase = (t % period) / period;
        const scale = 0.9 + Math.sin(phase * Math.PI * 2) * 0.2;
        const alpha = 0.4 + Math.sin(phase * Math.PI * 2) * 0.15;
        ctx.save();
        const g = ctx.createRadialGradient(
            W * 0.5,
            H * 1.1,
            0,
            W * 0.5,
            H * 1.1,
            H * scale,
        );
        g.addColorStop(0, `rgba(255,160,30,${alpha})`);
        g.addColorStop(0.4, `rgba(255,80,0,${alpha * 0.6})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 💧 HỆ NƯỚC ──────────────────────────────
    R.water = function (ctx, W, H, t, state) {
        const L = state.local;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 20,
                    size: [2, 4],
                    colors: ["rgba(255,255,255,0.9)", "rgba(200,240,255,0.8)"],
                    spawnX: [0, 1],
                    spawnY: [0.5, 1.0],
                    velX: [-0.3, 0.3],
                    velY: [-1.8, -0.6],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.007,
                    life: [0.6, 1.0],
                    shape: "circle",
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 12,
                    size: [7, 14],
                    colors: ["rgba(255,255,255,0.7)", "rgba(200,240,255,0.65)"],
                    spawnX: [0, 1],
                    spawnY: [0.3, 1.0],
                    velX: [-0.2, 0.2],
                    velY: [-1.2, -0.4],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.005,
                    life: [0.5, 0.9],
                    shape: "ring",
                },
                W,
                H,
            );
        }
        const progress = (t % 2000) / 2000;
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(progress * Math.PI * 2) * 0.2;
        for (let i = 0; i < 5; i++) {
            const x = ((i / 5 + progress * 0.3) % 1) * W;
            const g = ctx.createLinearGradient(x, 0, x + W * 0.15, H);
            g.addColorStop(0, "rgba(100,200,255,0.12)");
            g.addColorStop(0.5, "rgba(200,240,255,0.2)");
            g.addColorStop(1, "transparent");
            ctx.fillStyle = g;
            ctx.save();
            ctx.transform(1, 0, Math.tan(Math.PI / 8), 1, 0, 0);
            ctx.fillRect(x, 0, W * 0.08, H);
            ctx.restore();
        }
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🌿 HỆ CỎ ──────────────────────────────
    R.grass = function (ctx, W, H, t, state) {
        const L = state.local;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 14,
                    size: [6, 14],
                    colors: [
                        "#e6ffd2",
                        "#c9f6aa",
                        "#9be37f",
                        "#bff2a0",
                        "#d7ffc0",
                    ],
                    spawnX: [0, 1],
                    spawnY: [-0.2, 0.1],
                    velX: [-0.8, 0.8],
                    velY: [0.8, 2.2],
                    gravity: 0.015,
                    fade: true,
                    fadeSpeed: 0.004,
                    life: [0.7, 1.0],
                    shape: "leaf",
                    spin: true,
                },
                W,
                H,
            );
        }
        const h = H * 0.35,
            y0 = H - h;
        ctx.save();
        const gGrass = ctx.createLinearGradient(0, y0, 0, H);
        gGrass.addColorStop(0, "#57c754");
        gGrass.addColorStop(0.44, "#2f8736");
        gGrass.addColorStop(1, "#1d6326");
        ctx.fillStyle = gGrass;
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(0, y0 + h * 0.4);
        for (let i = 0; i <= 50; i++) {
            const x = (i / 50) * W;
            const spike = i % 2 === 0 ? 0.3 : 0.6;
            ctx.lineTo(x, y0 + h * spike * (0.7 + Math.random() * 0.3));
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.save();
        const gTop = ctx.createLinearGradient(0, 0, 0, H * 0.3);
        gTop.addColorStop(0, "rgba(255,255,255,0.13)");
        gTop.addColorStop(1, "transparent");
        ctx.fillStyle = gTop;
        ctx.fillRect(0, 0, W, H * 0.3);
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── ⚡ HỆ ĐIỆN ──────────────────────────────
    R.electric = function (ctx, W, H, t, state) {
        const L = state.local;
        const period = 2000;
        if (!L.ready) {
            L.ready = true;
            L.lightPositions = [0.18, 0.72, 0.32, 0.5, 0.08, 0.26, 0.64, 0.88];
            U.spawnBatch(
                state.particles,
                {
                    count: 30,
                    size: [1.5, 3.5],
                    colors: ["#00f3ff", "#0070ff", "#0055ff"],
                    spawnX: [0, 1],
                    spawnY: [0, 0.3],
                    velX: [-0.3, 0.3],
                    velY: [1.5, 3.5],
                    gravity: 0.02,
                    fade: true,
                    fadeSpeed: 0.006,
                    life: [0.5, 1.0],
                },
                W,
                H,
            );
        }
        const flashColors = ["#050914", "#111a30", "#17163c", "#1d133a"];
        const flashTimings = [
            [8, 12, 1],
            [25, 29, 2],
            [42, 46, 1],
            [60, 64, 3],
            [77, 81, 2],
            [92, 96, 1],
        ];
        const pct = ((t % period) / period) * 100;
        let bgColor = flashColors[0];
        for (const [from, to, ci] of flashTimings) {
            if (pct >= from && pct <= to) {
                bgColor = flashColors[ci];
                break;
            }
        }
        if (overlayEl) overlayEl.style.backgroundColor = bgColor;
        for (const [from, to] of flashTimings) {
            if (pct >= from && pct <= to) {
                const pos = L.lightPositions;
                const idx = Math.floor((pct - from) / 2) % pos.length;
                U.lightning(ctx, pos[idx] * W, 0, pos[idx] * W, H);
                if (to - from > 5 && idx + 1 < pos.length) {
                    U.lightning(
                        ctx,
                        pos[(idx + 1) % pos.length] * W,
                        0,
                        pos[(idx + 1) % pos.length] * W,
                        H,
                    );
                }
            }
        }
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🧊 HỆ BĂNG ──────────────────────────────
    R.ice = function (ctx, W, H, t, state) {
        const L = state.local;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 22,
                    size: [1.5, 2.5],
                    colors: ["#ffffff", "#e0f7ff", "#cceeff"],
                    spawnX: [0, 1],
                    spawnY: [0, 0.2],
                    velX: [-0.4, 0.4],
                    velY: [0.8, 2.0],
                    gravity: 0.01,
                    fade: false,
                    life: [0.7, 1.0],
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 14,
                    size: [2.5, 4],
                    colors: ["#ffffff", "#d6f0ff"],
                    spawnX: [0, 1],
                    spawnY: [0, 0.3],
                    velX: [-0.5, 0.5],
                    velY: [1.2, 2.5],
                    gravity: 0.012,
                    fade: false,
                    life: [0.6, 1.0],
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 8,
                    size: [4, 7],
                    colors: ["#ffffff", "#e6fbff"],
                    spawnX: [0, 1],
                    spawnY: [0, 0.2],
                    velX: [-0.6, 0.6],
                    velY: [1.5, 3.0],
                    gravity: 0.015,
                    fade: true,
                    fadeSpeed: 0.005,
                    life: [0.5, 0.9],
                },
                W,
                H,
            );
        }
        const phase = (t % 2000) / 2000;
        const alpha = 0.25 + Math.sin(phase * Math.PI * 2) * 0.1;
        ctx.save();
        const g = ctx.createRadialGradient(
            W * 0.5,
            0,
            0,
            W * 0.5,
            H * 0.3,
            H * 0.6,
        );
        g.addColorStop(0, `rgba(255,255,255,${alpha})`);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── ☠️ HỆ ĐỘC ──────────────────────────────
    R.poison = function (ctx, W, H, t, state) {
        const L = state.local;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 18,
                    size: [18, 40],
                    colors: [
                        "rgba(140,0,200,0.18)",
                        "rgba(160,0,220,0.15)",
                        "rgba(100,0,160,0.20)",
                    ],
                    spawnX: [0.1, 0.9],
                    spawnY: [0.6, 1.0],
                    velX: [-0.5, 0.5],
                    velY: [-1.0, -0.3],
                    gravity: -0.008,
                    fade: true,
                    fadeSpeed: 0.005,
                    life: [0.5, 0.9],
                    shape: "circle",
                    blur: 12,
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 22,
                    size: [3, 7],
                    colors: ["rgba(180,0,255,0.7)", "rgba(120,0,180,0.8)"],
                    spawnX: [0, 1],
                    spawnY: [0.7, 1.0],
                    velX: [-0.4, 0.4],
                    velY: [-2.0, -0.5],
                    gravity: 0.01,
                    fade: true,
                    fadeSpeed: 0.01,
                    life: [0.4, 0.8],
                    shape: "ring",
                },
                W,
                H,
            );
        }
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🌍 HỆ ĐẤT ──────────────────────────────
    R.ground = function (ctx, W, H, t, state) {
        const L = state.local;
        const period = 2000;
        if (!L.ready) {
            L.ready = true;
            L.quakeOffsets = [
                [0, 0],
                [-3, 2],
                [3, -2],
                [-2, 3],
                [2, -3],
                [-3, 1],
            ];
            U.spawnBatch(
                state.particles,
                {
                    count: 28,
                    size: [4, 10],
                    colors: [
                        "rgba(180,100,30,0.7)",
                        "rgba(150,80,20,0.6)",
                        "rgba(200,120,40,0.5)",
                    ],
                    spawnX: [0, 1],
                    spawnY: [0.7, 1.0],
                    velX: [-1.5, 1.5],
                    velY: [-3.0, -0.8],
                    gravity: 0.08,
                    fade: true,
                    fadeSpeed: 0.009,
                    life: [0.4, 0.8],
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 15,
                    size: [2, 4],
                    colors: ["rgba(255,150,0,0.9)", "rgba(200,100,0,0.8)"],
                    spawnX: [0.1, 0.9],
                    spawnY: [0.8, 1.0],
                    velX: [-0.8, 0.8],
                    velY: [-2.5, -0.5],
                    gravity: 0.05,
                    fade: true,
                    fadeSpeed: 0.015,
                    life: [0.3, 0.7],
                },
                W,
                H,
            );
        }
        const step = Math.floor((t % period) / (period / 6));
        const [ox, oy] = L.quakeOffsets[step % 6];
        if (overlayEl) overlayEl.style.transform = `translate(${ox}px,${oy}px)`;
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🌬️ HỆ BAY ──────────────────────────────
    R.flying = function (ctx, W, H, t, state) {
        const L = state.local;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 30,
                    size: [1.5, 4],
                    colors: [
                        "rgba(200,180,255,0.7)",
                        "rgba(168,144,240,0.5)",
                        "rgba(255,255,255,0.4)",
                    ],
                    spawnX: [0.2, 0.8],
                    spawnY: [0.2, 0.8],
                    velX: [-2.0, 2.0],
                    velY: [-2.0, 2.0],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.008,
                    life: [0.5, 1.0],
                },
                W,
                H,
            );
        }
        ctx.save();
        const cx = W * 0.5,
            cy = H * 0.5;
        const maxR = Math.min(W, H) * 0.45;
        ctx.translate(cx, cy);
        ctx.rotate((t / 2000) * Math.PI * 2);
        for (let i = 0; i < 3; i++) {
            const r = maxR * (0.3 + i * 0.35);
            ctx.globalAlpha = 0.1 + i * 0.04;
            ctx.strokeStyle = "rgba(168,144,240,1)";
            ctx.lineWidth = 3 - i * 0.5;
            ctx.shadowColor = "rgba(200,180,255,0.5)";
            ctx.shadowBlur = 8;
            ctx.beginPath();
            for (let a = 0; a < Math.PI * 2; a += 0.05) {
                const px = Math.cos(a) * r,
                    py = Math.sin(a) * r * 0.5;
                a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.stroke();
        }
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🧠 HỆ TÂM LINH ──────────────────────────
    R.psychic = function (ctx, W, H, t, state) {
        const L = state.local;
        const period = 2000;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 20,
                    size: [2, 5],
                    colors: [
                        "rgba(248,88,136,0.8)",
                        "rgba(200,100,255,0.6)",
                        "rgba(255,150,200,0.5)",
                    ],
                    spawnX: [0.2, 0.8],
                    spawnY: [0.2, 0.8],
                    velX: [-1.5, 1.5],
                    velY: [-1.5, 1.5],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.008,
                    life: [0.5, 1.0],
                },
                W,
                H,
            );
        }
        const cx = W * 0.5,
            cy = H * 0.5;
        for (let i = 0; i < 3; i++) {
            const phase = (t + (i * period) / 3) % period;
            const progress = phase / period;
            const r = progress * Math.min(W, H) * 0.5;
            const alpha =
                progress < 0.3
                    ? (progress / 0.3) * 0.5
                    : (1 - (progress - 0.3) / 0.7) * 0.5;
            U.ring(ctx, cx, cy, r, "rgba(248,88,136,1)", alpha, 2);
        }
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🥊 HỆ CHIẾN ĐẤU ──────────────────────────
    R.fighting = function(ctx, W, H, t, state) {
        const L = state.local;
        const period = 2000;

        if (!L.ready) {
            L.ready = true;
            // Bụi đất và cát bay
            U.spawnBatch(state.particles, {
                count:25, size:[3,8],
                colors:['rgba(180,120,40,0.7)','rgba(150,90,20,0.6)','rgba(220,160,60,0.5)'],
                spawnX:[0,1], spawnY:[0.7,0.9],
                velX:[-2.5,2.5], velY:[-3.0,-0.5],
                gravity:0.07, fade:true, fadeSpeed:0.01, life:[0.4,0.9],
            }, W, H);
            // Tàn lửa nhỏ từ đuốc
            U.spawnBatch(state.particles, {
                count:18, size:[1.5,3],
                colors:['rgba(255,200,50,0.9)','rgba(255,100,0,0.8)','rgba(255,255,150,0.7)'],
                spawnX:[0.05,0.15], spawnY:[0.3,0.5],
                velX:[-0.5,0.5], velY:[-2.5,-0.8],
                gravity:0.03, fade:true, fadeSpeed:0.015, life:[0.3,0.7],
            }, W, H);
            U.spawnBatch(state.particles, {
                count:18, size:[1.5,3],
                colors:['rgba(255,200,50,0.9)','rgba(255,100,0,0.8)','rgba(255,255,150,0.7)'],
                spawnX:[0.85,0.95], spawnY:[0.3,0.5],
                velX:[-0.5,0.5], velY:[-2.5,-0.8],
                gravity:0.03, fade:true, fadeSpeed:0.015, life:[0.3,0.7],
            }, W, H);
        }

        const phase = (t % period) / period;

        // ── NỀN ĐẤT HOANG ──
        ctx.save();
        const groundY = H * 0.72;
        // Bầu trời đêm hoang dã
        const gSky = ctx.createLinearGradient(0, 0, 0, groundY);
        gSky.addColorStop(0, '#0a0500');
        gSky.addColorStop(0.5, '#1a0800');
        gSky.addColorStop(1, '#2d1200');
        ctx.fillStyle = gSky;
        ctx.fillRect(0, 0, W, groundY);

        // Mặt đất đất đỏ nứt nẻ
        const gGround = ctx.createLinearGradient(0, groundY, 0, H);
        gGround.addColorStop(0, '#5a2800');
        gGround.addColorStop(0.4, '#3d1a00');
        gGround.addColorStop(1, '#1a0800');
        ctx.fillStyle = gGround;
        ctx.fillRect(0, groundY, W, H - groundY);

        // Vết nứt mặt đất
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5;
        const cracks = [
            [[0.2,1],[0.35,0.95],[0.28,0.92]],
            [[0.5,1],[0.45,0.94],[0.55,0.90],[0.48,0.88]],
            [[0.75,1],[0.68,0.95],[0.72,0.91]],
            [[0.1,0.97],[0.18,0.93]],
            [[0.85,0.98],[0.78,0.94],[0.82,0.90]],
        ];
        for (const crack of cracks) {
            ctx.beginPath();
            ctx.moveTo(crack[0][0]*W, crack[0][1]*H);
            for (let i=1; i<crack.length; i++) ctx.lineTo(crack[i][0]*W, crack[i][1]*H);
            ctx.stroke();
        }

        // Ánh sáng lửa dưới đất (magma glow)
        const magmaAlpha = 0.08 + Math.sin(phase * Math.PI * 2) * 0.04;
        for (const cx_ of [0.35, 0.65]) {
            const gMagma = ctx.createRadialGradient(W*cx_, H, 0, W*cx_, H*0.85, H*0.3);
            gMagma.addColorStop(0, `rgba(255,80,0,${magmaAlpha})`);
            gMagma.addColorStop(1, 'transparent');
            ctx.fillStyle = gMagma;
            ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();

        // ── ĐÁ TẢNG HAI BÊN ──
        ctx.save();
        const rocks = [[0.08, 0.78, 0.12, 0.18], [0.88, 0.76, 0.10, 0.20], [0.02, 0.82, 0.08, 0.14], [0.93, 0.80, 0.07, 0.16]];
        for (const [rx, ry, rw, rh] of rocks) {
            const gRock = ctx.createLinearGradient(W*rx, H*ry, W*(rx+rw), H*(ry+rh));
            gRock.addColorStop(0, '#4a3020');
            gRock.addColorStop(0.5, '#2d1c0e');
            gRock.addColorStop(1, '#1a0e05');
            ctx.fillStyle = gRock;
            ctx.beginPath();
            ctx.moveTo(W*(rx+rw*0.3), H*ry);
            ctx.lineTo(W*(rx+rw*0.8), H*(ry+rh*0.1));
            ctx.lineTo(W*(rx+rw), H*(ry+rh));
            ctx.lineTo(W*rx, H*(ry+rh));
            ctx.lineTo(W*(rx+rw*0.1), H*(ry+rh*0.3));
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // ── ĐUỐC HAI BÊN ──
        ctx.save();
        for (const tx of [0.08, 0.92]) {
            // Cán đuốc
            ctx.fillStyle = '#3d2010';
            ctx.fillRect(W*tx - 3, H*0.38, 6, H*0.32);

            // Lửa đuốc nhấp nháy
            const flicker = 0.7 + Math.sin(t*0.008 + tx*100)*0.2 + Math.sin(t*0.013)*0.1;
            const gFire = ctx.createRadialGradient(W*tx, H*0.36, 0, W*tx, H*0.36, 28*flicker);
            gFire.addColorStop(0, `rgba(255,255,200,${0.95*flicker})`);
            gFire.addColorStop(0.2, `rgba(255,180,0,${0.85*flicker})`);
            gFire.addColorStop(0.5, `rgba(255,80,0,${0.6*flicker})`);
            gFire.addColorStop(1, 'transparent');
            ctx.fillStyle = gFire;
            ctx.beginPath();
            ctx.ellipse(W*tx, H*0.36, 18*flicker, 28*flicker, 0, 0, Math.PI*2);
            ctx.fill();

            // Ánh sáng đuốc hắt lên tường/nền
            const gTorch = ctx.createRadialGradient(W*tx, H*0.4, 0, W*tx, H*0.4, W*0.3);
            gTorch.addColorStop(0, `rgba(255,140,0,${0.12*flicker})`);
            gTorch.addColorStop(1, 'transparent');
            ctx.fillStyle = gTorch;
            ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();

        // ── KHÁN GIẢ MỜ PHÍA SAU ──
        ctx.save();
        ctx.globalAlpha = 0.18 + Math.sin(phase * Math.PI * 4) * 0.03;
        for (let i = 0; i < 30; i++) {
            const cx_ = (i / 30) * W;
            const cy_ = H * 0.55 + Math.sin(i * 1.7) * H * 0.06;
            const r = 6 + Math.sin(i * 2.3) * 3;
            ctx.fillStyle = i % 3 === 0 ? '#3a2010' : (i % 3 === 1 ? '#2a1808' : '#4a2818');
            ctx.beginPath();
            ctx.arc(cx_, cy_, r, 0, Math.PI*2);
            ctx.fill();
            // Đầu khán giả
            ctx.fillStyle = '#5a3820';
            ctx.beginPath();
            ctx.arc(cx_, cy_ - r * 1.4, r * 0.7, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();

        // ── RUNG MẶT ĐẤT KHI ĐẤM ──
        const shake = Math.sin(phase * Math.PI * 10) * 0.012;
        const sy = 1 + Math.abs(Math.sin(phase * Math.PI * 8)) * 0.008;
        if (overlayEl) overlayEl.style.transform = `scale(${1 + shake}, ${sy})`;

        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🥊 HỆ CHIẾN ĐẤU - SÀN BOXING ──────────────────────────────
    R.fighting1 = function(ctx, W, H, t, state) {
        const L = state.local;
        const period = 3000;

        if (!L.ready) {
            L.ready = true;
            // Tia lửa va chạm
            U.spawnBatch(state.particles, {
                count:20, size:[2,5],
                colors:['rgba(255,80,0,0.9)','rgba(255,200,0,0.8)','rgba(255,255,255,0.7)'],
                spawnX:[0.2,0.8], spawnY:[0.4,0.7],
                velX:[-3.0,3.0], velY:[-3.0,-0.5],
                gravity:0.08, fade:true, fadeSpeed:0.02, life:[0.3,0.6],
            }, W, H);
            // Bụi mồ hôi / resin từ sàn
            U.spawnBatch(state.particles, {
                count:15, size:[1,3],
                colors:['rgba(255,255,255,0.4)','rgba(200,200,200,0.3)'],
                spawnX:[0.1,0.9], spawnY:[0.75,0.85],
                velX:[-0.5,0.5], velY:[-1.5,-0.3],
                gravity:0.02, fade:true, fadeSpeed:0.008, life:[0.5,1.0],
            }, W, H);
        }

        const phase = (t % period) / period;

        // ── SÀN BOXING ──
        ctx.save();
        // Nền sàn canvas
        const floorY = H * 0.78;
        const gFloor = ctx.createLinearGradient(0, floorY, 0, H);
        gFloor.addColorStop(0, '#8B1A1A');
        gFloor.addColorStop(0.3, '#6B0F0F');
        gFloor.addColorStop(1, '#3a0808');
        ctx.fillStyle = gFloor;
        ctx.fillRect(0, floorY, W, H - floorY);

        // Góc sàn (lưới dây)
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        // Các đường kẻ ngang sàn (phối cảnh)
        for (let i = 0; i < 5; i++) {
            const y = floorY + (H - floorY) * (i / 4);
            const shrink = 1 - i * 0.15;
            ctx.beginPath();
            ctx.moveTo(W * (0.5 - 0.5 * shrink), y);
            ctx.lineTo(W * (0.5 + 0.5 * shrink), y);
            ctx.stroke();
        }
        // Các đường kẻ dọc sàn (phối cảnh)
        for (let i = 0; i <= 6; i++) {
            ctx.beginPath();
            ctx.moveTo(W * (i / 6), floorY);
            ctx.lineTo(W * (0.5 - 0.5 * (1 - (i/6 - 0.5) * 2 * 0) + (i/6 - 0.5)), H);
            ctx.stroke();
        }
        ctx.restore();

        // ── DÂY BOXING (3 dây ngang) ──
        ctx.save();
        const ropeY = [H * 0.35, H * 0.48, H * 0.61];
        const ropeColors = ['#e8c84a', '#d4b83c', '#c8aa30'];
        for (let r = 0; r < 3; r++) {
            // Dây có độ võng nhẹ
            const sag = 8 + Math.sin(t * 0.001 + r) * 2;
            ctx.beginPath();
            ctx.moveTo(W * 0.05, ropeY[r]);
            ctx.quadraticCurveTo(W * 0.5, ropeY[r] + sag, W * 0.95, ropeY[r]);
            ctx.strokeStyle = ropeColors[r];
            ctx.lineWidth = 3.5;
            ctx.shadowColor = ropeColors[r];
            ctx.shadowBlur = 6;
            ctx.stroke();

            // Highlight trên dây
            ctx.beginPath();
            ctx.moveTo(W * 0.05, ropeY[r] - 1);
            ctx.quadraticCurveTo(W * 0.5, ropeY[r] + sag - 1, W * 0.95, ropeY[r] - 1);
            ctx.strokeStyle = 'rgba(255,255,200,0.4)';
            ctx.lineWidth = 1;
            ctx.shadowBlur = 0;
            ctx.stroke();
        }
        ctx.restore();

        // ── CỘT GÓC RING ──
        ctx.save();
        const postX = [W * 0.05, W * 0.95];
        const postColors = ['#cc0000', '#0000cc', '#cc0000', '#0000cc'];
        for (let p = 0; p < 2; p++) {
            // Thân cột
            const gPost = ctx.createLinearGradient(postX[p] - 8, 0, postX[p] + 8, 0);
            gPost.addColorStop(0, '#555');
            gPost.addColorStop(0.4, '#aaa');
            gPost.addColorStop(1, '#333');
            ctx.fillStyle = gPost;
            ctx.fillRect(postX[p] - 7, H * 0.28, 14, H * 0.55);

            // Băng màu trên cột
            const stripeH = 18;
            for (let s = 0; s < 4; s++) {
                ctx.fillStyle = postColors[s % 2 === 0 ? p * 2 : p * 2 + 1] || (p === 0 ? '#cc0000' : '#0000cc');
                ctx.fillRect(postX[p] - 7, H * 0.28 + s * stripeH * 2, 14, stripeH);
            }
        }
        ctx.restore();

        // ── ĐÈN SPOTLIGHT TỪ TRÊN ──
        ctx.save();
        const flicker = 0.85 + Math.sin(t * 0.007) * 0.1 + Math.sin(t * 0.013) * 0.05;
        for (const [lx, intensity] of [[0.35, 1.0], [0.65, 0.9]]) {
            const g = ctx.createRadialGradient(W * lx, 0, 0, W * lx, H * 0.5, H * 0.7);
            g.addColorStop(0, `rgba(255,240,200,${0.22 * flicker * intensity})`);
            g.addColorStop(0.3, `rgba(255,200,150,${0.10 * flicker * intensity})`);
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(W * lx, 0);
            ctx.lineTo(W * lx - W * 0.18, H);
            ctx.lineTo(W * lx + W * 0.18, H);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // ── NHỊP ĐẬP — flash đỏ khi "đấm" ──
        const punchBeat = Math.max(0, Math.sin(phase * Math.PI * 6) - 0.7) / 0.3;
        if (punchBeat > 0) {
            ctx.save();
            ctx.globalAlpha = punchBeat * 0.18;
            ctx.fillStyle = '#ff2200';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        U.tickParticles(ctx, state.particles, W, H);
    };
    R.fighting2 = function(ctx, W, H, t, state) {
        const L = state.local;
        const period = 2000;

        if (!L.ready) {
            L.ready = true;
            // Cánh hoa anh đào rơi
            U.spawnBatch(state.particles, {
                count:20, size:[4,9],
                colors:['rgba(255,180,200,0.85)','rgba(255,150,180,0.75)','rgba(255,200,220,0.80)','rgba(240,130,160,0.70)'],
                spawnX:[0,1], spawnY:[-0.1,0.4],
                velX:[-1.2,1.2], velY:[0.6,1.8],
                gravity:0.008, fade:true, fadeSpeed:0.004, life:[0.7,1.2],
                shape:'petal', spin:true,
            }, W, H);
            // Tàn nhang hương
            U.spawnBatch(state.particles, {
                count:12, size:[1,2.5],
                colors:['rgba(200,180,150,0.5)','rgba(220,200,170,0.4)'],
                spawnX:[0.45,0.55], spawnY:[0.5,0.65],
                velX:[-0.3,0.3], velY:[-1.2,-0.4],
                gravity:-0.005, fade:true, fadeSpeed:0.006, life:[0.6,1.0],
            }, W, H);
        }

        const phase = (t % period) / period;

        // ── NỀN TRỜI HOÀNG HÔN NHẬT BẢN ──
        ctx.save();
        const groundY = H * 0.68;
        const gSky = ctx.createLinearGradient(0, 0, 0, groundY);
        gSky.addColorStop(0,   '#0d0510');
        gSky.addColorStop(0.3, '#2d0d1a');
        gSky.addColorStop(0.6, '#5a1a0d');
        gSky.addColorStop(1,   '#8b2500');
        ctx.fillStyle = gSky;
        ctx.fillRect(0, 0, W, groundY);
        ctx.restore();

        // ── MẶT TRĂNG / MẶT TRỜI ĐỎ ──
        ctx.save();
        const moonX = W * 0.5, moonY = H * 0.18;
        const moonR = W * 0.07;
        // Hào quang
        const gMoon = ctx.createRadialGradient(moonX, moonY, moonR*0.5, moonX, moonY, moonR*3);
        gMoon.addColorStop(0, 'rgba(220,60,0,0.25)');
        gMoon.addColorStop(1, 'transparent');
        ctx.fillStyle = gMoon;
        ctx.fillRect(0, 0, W, H);
        // Đĩa mặt trăng đỏ
        const gDisc = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR);
        gDisc.addColorStop(0,   '#ff6030');
        gDisc.addColorStop(0.6, '#cc2200');
        gDisc.addColorStop(1,   '#880000');
        ctx.fillStyle = gDisc;
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // ── NÚI FUJI MỜ PHÍA SAU ──
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#1a0808';
        ctx.beginPath();
        ctx.moveTo(W*0.5, H*0.12);
        ctx.lineTo(W*0.28, groundY);
        ctx.lineTo(W*0.72, groundY);
        ctx.closePath();
        ctx.fill();
        // Tuyết đỉnh núi
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#fff5f0';
        ctx.beginPath();
        ctx.moveTo(W*0.5, H*0.12);
        ctx.lineTo(W*0.435, H*0.22);
        ctx.lineTo(W*0.565, H*0.22);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // ── CÂY ANH ĐÀO HAI BÊN ──
        ctx.save();
        for (const [tx, flip] of [[0.07, 1], [0.93, -1]]) {
            ctx.save();
            ctx.translate(W*tx, groundY);
            ctx.scale(flip, 1);

            // Thân cây
            const gTrunk = ctx.createLinearGradient(-6, 0, 6, 0);
            gTrunk.addColorStop(0, '#1a0a05');
            gTrunk.addColorStop(0.5, '#3d1f0a');
            gTrunk.addColorStop(1, '#1a0a05');
            ctx.fillStyle = gTrunk;
            ctx.beginPath();
            ctx.moveTo(-5, 0);
            ctx.quadraticCurveTo(-8, -H*0.2, -3, -H*0.38);
            ctx.quadraticCurveTo(0, -H*0.42, 4, -H*0.35);
            ctx.quadraticCurveTo(8, -H*0.18, 5, 0);
            ctx.closePath();
            ctx.fill();

            // Cành
            ctx.strokeStyle = '#2d1508';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(0, -H*0.3);
            ctx.quadraticCurveTo(W*0.08, -H*0.38, W*0.14, -H*0.32);
            ctx.stroke();
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, -H*0.2);
            ctx.quadraticCurveTo(-W*0.04, -H*0.3, W*0.06, -H*0.36);
            ctx.stroke();

            // Tán hoa anh đào
            const blooms = [
                [0, -H*0.42, W*0.1],
                [W*0.06, -H*0.36, W*0.08],
                [-W*0.04, -H*0.36, W*0.07],
                [W*0.12, -H*0.32, W*0.07],
                [W*0.02, -H*0.28, W*0.06],
            ];
            for (const [bx, by, br] of blooms) {
                const sway = Math.sin(t*0.001 + bx) * 3;
                const gBloom = ctx.createRadialGradient(bx+sway, by, 0, bx+sway, by, br);
                gBloom.addColorStop(0,   'rgba(255,180,200,0.7)');
                gBloom.addColorStop(0.5, 'rgba(220,120,150,0.5)');
                gBloom.addColorStop(1,   'rgba(180,80,110,0.0)');
                ctx.fillStyle = gBloom;
                ctx.beginPath();
                ctx.arc(bx+sway, by, br, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.restore();
        }
        ctx.restore();

        // ── SÀN ĐẤU GỖ (DOJO) ──
        ctx.save();
        const gFloor = ctx.createLinearGradient(0, groundY, 0, H);
        gFloor.addColorStop(0,   '#3d1f08');
        gFloor.addColorStop(0.3, '#2d1505');
        gFloor.addColorStop(1,   '#150a02');
        ctx.fillStyle = gFloor;
        ctx.fillRect(0, groundY, W, H - groundY);

        // Vân gỗ ngang
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
            const y = groundY + (H - groundY) * (i / 7);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        // Đường tròn trung tâm sàn đấu (sumo ring)
        const ringCX = W*0.5, ringCY = groundY + (H-groundY)*0.35;
        const ringR  = Math.min(W,H) * 0.2;
        ctx.strokeStyle = 'rgba(200,150,80,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(ringCX, ringCY, ringR, ringR*0.35, 0, 0, Math.PI*2);
        ctx.stroke();
        // Vạch xuất phát
        for (const sx of [-ringR*0.15, ringR*0.15]) {
            ctx.strokeStyle = 'rgba(200,150,80,0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(ringCX+sx, ringCY - ringR*0.06);
            ctx.lineTo(ringCX+sx, ringCY + ringR*0.06);
            ctx.stroke();
        }
        ctx.restore();

        // ── CỔNG TORII ──
        ctx.save();
        ctx.globalAlpha = 0.6;
        const toriiCX = W*0.5;
        const toriiY  = groundY - H*0.38;
        const toriiW  = W*0.55;
        const toriiH  = H*0.36;
        // Màu đỏ torii
        ctx.fillStyle = '#8b1a00';
        ctx.shadowColor = '#cc2200';
        ctx.shadowBlur = 8;
        // 2 cột
        for (const cx_ of [-toriiW*0.42, toriiW*0.42]) {
            ctx.fillRect(toriiCX+cx_-6, toriiY, 12, toriiH);
        }
        // Xà ngang trên
        ctx.fillRect(toriiCX - toriiW*0.5, toriiY - 12, toriiW, 14);
        // Xà ngang dưới
        ctx.fillRect(toriiCX - toriiW*0.42, toriiY + toriiH*0.2, toriiW*0.84, 10);
        // Hai đầu xà cong lên
        ctx.beginPath();
        ctx.moveTo(toriiCX - toriiW*0.5, toriiY - 12);
        ctx.quadraticCurveTo(toriiCX - toriiW*0.55, toriiY - 22, toriiCX - toriiW*0.48, toriiY - 28);
        ctx.lineTo(toriiCX - toriiW*0.44, toriiY - 12);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(toriiCX + toriiW*0.5, toriiY - 12);
        ctx.quadraticCurveTo(toriiCX + toriiW*0.55, toriiY - 22, toriiCX + toriiW*0.48, toriiY - 28);
        ctx.lineTo(toriiCX + toriiW*0.44, toriiY - 12);
        ctx.fill();
        ctx.restore();

        // ── ĐÈN LỒNG HAI BÊN ──
        ctx.save();
        for (const [lx, ly] of [[0.2, 0.42],[0.8, 0.42],[0.35, 0.52],[0.65, 0.52]]) {
            const flicker = 0.8 + Math.sin(t*0.005 + lx*50)*0.15 + Math.sin(t*0.011 + ly*30)*0.05;
            // Thân đèn lồng
            ctx.fillStyle = `rgba(180,30,0,${0.85*flicker})`;
            ctx.beginPath();
            ctx.ellipse(W*lx, H*ly, 10, 14, 0, 0, Math.PI*2);
            ctx.fill();
            // Ánh sáng hắt ra
            const gLantern = ctx.createRadialGradient(W*lx, H*ly, 0, W*lx, H*ly, 60*flicker);
            gLantern.addColorStop(0, `rgba(255,120,0,${0.15*flicker})`);
            gLantern.addColorStop(1, 'transparent');
            ctx.fillStyle = gLantern;
            ctx.fillRect(0, 0, W, H);
            // Sợi dây treo
            ctx.strokeStyle = 'rgba(80,40,10,0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(W*lx, H*ly - 14);
            ctx.lineTo(W*lx, H*ly - 30);
            ctx.stroke();
        }
        ctx.restore();

        // ── KHÓI HƯƠNG NHẸ ──
        ctx.save();
        const smokeAlpha = 0.06 + Math.sin(phase * Math.PI * 2) * 0.02;
        const gSmoke = ctx.createRadialGradient(W*0.5, groundY, 0, W*0.5, groundY, W*0.3);
        gSmoke.addColorStop(0, `rgba(200,180,150,${smokeAlpha})`);
        gSmoke.addColorStop(1, 'transparent');
        ctx.fillStyle = gSmoke;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // ── RUNG NHẸ KHI ĐẬP ──
        const beat = Math.max(0, Math.sin(phase * Math.PI * 6) - 0.75) / 0.25;
        if (overlayEl) overlayEl.style.transform = `scale(${1 + beat*0.008}, ${1 + beat*0.005})`;

        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 👻 HỆ MA ──────────────────────────────
    R.ghost = function (ctx, W, H, t, state) {
        const L = state.local;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 15,
                    size: [20, 50],
                    colors: [
                        "rgba(80,120,160,0.12)",
                        "rgba(100,140,180,0.10)",
                        "rgba(150,180,220,0.08)",
                    ],
                    spawnX: [0, 1],
                    spawnY: [0.6, 1.0],
                    velX: [-0.4, 0.4],
                    velY: [-0.5, -0.1],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.003,
                    life: [0.5, 1.0],
                    shape: "circle",
                    blur: 15,
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 8,
                    size: [3, 7],
                    colors: ["rgba(180,200,255,0.6)", "rgba(150,170,220,0.5)"],
                    spawnX: [0, 1],
                    spawnY: [0, 0.8],
                    velX: [-0.6, 0.6],
                    velY: [-0.8, -0.2],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.005,
                    life: [0.4, 0.9],
                },
                W,
                H,
            );
        }
        const phase = (t % 2000) / 2000;
        ctx.save();
        for (let i = 0; i < 2; i++) {
            const drift = Math.sin(phase * Math.PI * 2 + i) * 0.05;
            const g = ctx.createRadialGradient(
                W * (0.3 + i * 0.4 + drift),
                H,
                0,
                W * (0.3 + i * 0.4 + drift),
                H * 0.8,
                H * 0.3,
            );
            g.addColorStop(0, "rgba(80,120,160,0.18)");
            g.addColorStop(1, "transparent");
            ctx.fillStyle = g;
            ctx.globalAlpha = 0.6;
            ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
        ctx.save();
        const gm = ctx.createRadialGradient(
            W * 0.7,
            0,
            0,
            W * 0.7,
            H * 0.3,
            H * 0.5,
        );
        gm.addColorStop(0, "rgba(150,180,220,0.12)");
        gm.addColorStop(1, "transparent");
        ctx.fillStyle = gm;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🐛 HỆ CÔN TRÙNG ──────────────────────────
    R.bug = function (ctx, W, H, t, state) {
        const L = state.local;
        const period = 2000;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 25,
                    size: [3, 6],
                    colors: [
                        "rgba(100,255,50,0.85)",
                        "rgba(80,220,40,0.75)",
                        "rgba(120,255,60,0.90)",
                        "rgba(90,240,50,0.80)",
                    ],
                    spawnX: [0, 1],
                    spawnY: [0.1, 0.9],
                    velX: [-0.5, 0.5],
                    velY: [-0.3, 0.3],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.006,
                    life: [0.4, 0.9],
                    flicker: true,
                },
                W,
                H,
            );
        }
        const bioPhase = (t % period) / period;
        const bright = 0.8 + Math.sin(bioPhase * Math.PI * 2) * 0.35;
        ctx.save();
        ctx.globalAlpha = bright * 0.3;
        ctx.fillStyle = "rgba(50,150,30,0.08)";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🪨 HỆ ĐÁ ──────────────────────────────
    R.rock = function (ctx, W, H, t, state) {
        const L = state.local;
        const period = 2000;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 20,
                    size: [2, 6],
                    colors: [
                        "rgba(130,100,60,0.7)",
                        "rgba(100,80,40,0.6)",
                        "rgba(160,120,70,0.5)",
                    ],
                    spawnX: [0, 1],
                    spawnY: [0, 0.3],
                    velX: [-0.3, 0.3],
                    velY: [0.5, 2.0],
                    gravity: 0.04,
                    fade: true,
                    fadeSpeed: 0.007,
                    life: [0.5, 1.0],
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 15,
                    size: [1.5, 3.5],
                    colors: ["rgba(255,200,50,0.9)", "rgba(255,140,0,0.8)"],
                    spawnX: [0.1, 0.4],
                    spawnY: [0.7, 1.0],
                    velX: [-0.8, 0.8],
                    velY: [-3.0, -0.8],
                    gravity: 0.06,
                    fade: true,
                    fadeSpeed: 0.015,
                    life: [0.3, 0.7],
                },
                W,
                H,
            );
        }
        const step = Math.floor((t % period) / (period / 3)) % 3;
        const brightness = [1.0, 1.4, 1.1][step];
        ctx.save();
        for (const [px, py] of [
            [0.2, 1.0],
            [0.8, 1.0],
        ]) {
            const g = ctx.createRadialGradient(
                W * px,
                H * py,
                0,
                W * px,
                H * py,
                W * 0.4,
            );
            g.addColorStop(0, `rgba(200,100,0,${0.25 * brightness})`);
            g.addColorStop(1, "transparent");
            ctx.fillStyle = g;
            ctx.globalAlpha = brightness * 0.6;
            ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🌑 HỆ BÓNG TỐI ──────────────────────────
    R.dark = function (ctx, W, H, t, state) {
        const L = state.local;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 28,
                    size: [3, 8],
                    colors: [
                        "rgba(80,0,120,0.7)",
                        "rgba(50,0,80,0.6)",
                        "rgba(100,10,140,0.5)",
                        "rgba(60,0,90,0.8)",
                    ],
                    spawnX: [0, 1],
                    spawnY: [0, 1],
                    velX: [-1.5, 1.5],
                    velY: [-1.5, 1.5],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.008,
                    life: [0.4, 0.9],
                },
                W,
                H,
            );
        }
        ctx.save();
        const cx = W * 0.5,
            cy = H * 0.5;
        const angle = -(t / 2000) * Math.PI * 2;
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            const r = Math.min(W, H) * 0.35;
            const x1 = Math.cos(a) * r * 0.2,
                y1 = Math.sin(a) * r * 0.2;
            const x2 = Math.cos(a + 0.5) * r,
                y2 = Math.sin(a + 0.5) * r;
            const g = ctx.createLinearGradient(x1, y1, x2, y2);
            g.addColorStop(0, "rgba(80,10,100,0.25)");
            g.addColorStop(1, "transparent");
            ctx.strokeStyle = g;
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.quadraticCurveTo(0, 0, x2, y2);
            ctx.stroke();
        }
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── ⚙️ HỆ THÉP ──────────────────────────────
    R.steel = function (ctx, W, H, t, state) {
        const L = state.local;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 30,
                    size: [1.5, 4],
                    colors: [
                        "rgba(255,255,255,0.95)",
                        "rgba(255,240,180,0.90)",
                        "rgba(255,230,100,0.85)",
                    ],
                    spawnX: [0.1, 0.9],
                    spawnY: [0.2, 0.8],
                    velX: [-3.0, 3.0],
                    velY: [-3.0, 3.0],
                    gravity: 0.04,
                    fade: true,
                    fadeSpeed: 0.02,
                    life: [0.2, 0.6],
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 10,
                    size: [4, 8],
                    colors: ["rgba(180,190,210,0.5)", "rgba(200,210,230,0.4)"],
                    spawnX: [0.2, 0.8],
                    spawnY: [0.3, 0.7],
                    velX: [-1.5, 1.5],
                    velY: [-1.5, 1.5],
                    gravity: 0.03,
                    fade: true,
                    fadeSpeed: 0.01,
                    life: [0.3, 0.7],
                    shape: "diamond",
                },
                W,
                H,
            );
        }
        const progress = (t % 2000) / 2000;
        const x = -W * 0.3 + progress * W * 1.6;
        ctx.save();
        const g = ctx.createLinearGradient(x, 0, x + W * 0.25, H);
        g.addColorStop(0, "transparent");
        g.addColorStop(0.3, "rgba(220,230,255,0.10)");
        g.addColorStop(0.5, "rgba(220,230,255,0.08)");
        g.addColorStop(0.7, "rgba(220,230,255,0.10)");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(x, 0, W * 0.25, H);
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🐉 HỆ RỒNG ──────────────────────────────
    R.dragon = function (ctx, W, H, t, state) {
        const L = state.local;
        const period = 2000;
        if (!L.ready) {
            L.ready = true;
            L.stars = Array.from({ length: 25 }, () => ({
                x: Math.random(),
                y: Math.random() * 0.8,
                r: 0.5 + Math.random() * 1.5,
                color: U.pick([
                    "rgba(200,160,255,0.8)",
                    "rgba(180,140,255,0.7)",
                    "rgba(210,170,255,0.85)",
                ]),
            }));
            U.spawnBatch(
                state.particles,
                {
                    count: 25,
                    size: [2, 6],
                    colors: [
                        "rgba(150,80,255,0.8)",
                        "rgba(200,140,255,0.6)",
                        "rgba(112,56,248,0.9)",
                    ],
                    spawnX: [0.2, 0.8],
                    spawnY: [0.2, 0.8],
                    velX: [-2.0, 2.0],
                    velY: [-2.0, 2.0],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.008,
                    life: [0.5, 1.0],
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 12,
                    size: [3, 7],
                    colors: ["rgba(200,160,255,0.7)", "rgba(112,56,248,0.8)"],
                    spawnX: [0, 1],
                    spawnY: [0, 1],
                    velX: [-1.0, 1.0],
                    velY: [-1.0, 1.0],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.006,
                    life: [0.4, 0.9],
                    shape: "diamond",
                },
                W,
                H,
            );
        }
        ctx.save();
        for (const s of L.stars) {
            const twinkle = 0.5 + 0.5 * Math.sin(t * 0.003 + s.x * 100);
            ctx.globalAlpha = twinkle * 0.8;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        const cx = W * 0.5,
            cy = H * 0.5;
        for (let i = 0; i < 4; i++) {
            const phase = (t + (i * period) / 4) % period;
            const progress = phase / period;
            const r = 30 + progress * Math.min(W, H) * 0.45;
            const alpha =
                progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;
            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha * 0.6);
            ctx.strokeStyle = "rgba(150,80,255,1)";
            ctx.lineWidth = 3;
            ctx.shadowColor = "rgba(150,80,255,1)";
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🧚 HỆ TIÊN ──────────────────────────────
    R.fairy = function (ctx, W, H, t, state) {
        const L = state.local;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 22,
                    size: [5, 10],
                    colors: [
                        "rgba(255,150,180,0.85)",
                        "rgba(255,120,160,0.75)",
                        "rgba(255,160,190,0.90)",
                        "rgba(255,130,170,0.80)",
                    ],
                    spawnX: [0, 1],
                    spawnY: [-0.1, 0.3],
                    velX: [-0.8, 0.8],
                    velY: [0.5, 1.8],
                    gravity: 0.008,
                    fade: true,
                    fadeSpeed: 0.005,
                    life: [0.6, 1.0],
                    shape: "petal",
                    spin: true,
                },
                W,
                H,
            );
            U.spawnBatch(
                state.particles,
                {
                    count: 20,
                    size: [1.5, 3.5],
                    colors: [
                        "rgba(255,200,255,0.8)",
                        "rgba(200,150,255,0.7)",
                        "rgba(255,255,200,0.6)",
                    ],
                    spawnX: [0, 1],
                    spawnY: [0, 0.8],
                    velX: [-1.0, 1.0],
                    velY: [-1.0, 1.0],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.01,
                    life: [0.3, 0.8],
                    flicker: true,
                },
                W,
                H,
            );
        }
        const progress = (t % 2000) / 2000;
        const alpha = 0.04 + Math.sin(progress * Math.PI * 2) * 0.02;
        ctx.save();
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, `rgba(255,100,150,${alpha})`);
        g.addColorStop(0.25, `rgba(200,100,255,${alpha})`);
        g.addColorStop(0.5, `rgba(100,150,255,${alpha})`);
        g.addColorStop(0.75, `rgba(100,255,200,${alpha})`);
        g.addColorStop(1, `rgba(255,200,100,${alpha})`);
        ctx.fillStyle = g;
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ── 🤍 HỆ THƯỜNG ──────────────────────────────
    R.normal = function (ctx, W, H, t, state) {
        const L = state.local;
        const period = 2000;
        if (!L.ready) {
            L.ready = true;
            U.spawnBatch(
                state.particles,
                {
                    count: 15,
                    size: [2, 4],
                    colors: ["rgba(200,200,200,0.6)", "rgba(255,255,255,0.5)"],
                    spawnX: [0.3, 0.7],
                    spawnY: [0.3, 0.7],
                    velX: [-1.5, 1.5],
                    velY: [-1.5, 1.5],
                    gravity: 0,
                    fade: true,
                    fadeSpeed: 0.01,
                    life: [0.4, 0.8],
                },
                W,
                H,
            );
        }
        const cx = W * 0.5,
            cy = H * 0.5;
        for (let i = 0; i < 4; i++) {
            const phase = (t + (i * period) / 4) % period;
            const progress = phase / period;
            const r = progress * Math.min(W, H) * 0.6;
            const alpha =
                progress < 0.1 ? progress / 0.1 : (1 - progress) * 0.6;
            U.ring(ctx, cx, cy, r, "rgba(255,255,255,1)", alpha, 1.5);
        }
        U.tickParticles(ctx, state.particles, W, H);
    };

    // ─────────────────────────────────────────────
    // REGISTRY — map tên hệ → hàm renderer + gradient nền
    // ─────────────────────────────────────────────
    const RENDERERS = {
        fire: {
            bg: `radial-gradient(ellipse 120% 100% at 50% 100%, #ff4d00 0%, #aa0000 40%, #220000 75%, #050000 100%)`,
        },
        water: {
            bg: `radial-gradient(ellipse 150% 120% at 50% 0%, #00bfff 0%, #0055ff 40%, #001144 75%, #000411 100%)`,
        },
        grass: {
            bg: `linear-gradient(to bottom, #a0f37d 0%, #7ee56f 18%, #57c655 42%, #3aa043 72%, #2d7f33 100%)`,
        },
        electric: { bg: `#050914` },
        ice: {
            bg: `radial-gradient(ellipse 120% 100% at 50% 0%, #dff6ff 0%, #a8d8ff 30%, #6ea8d9 60%, #2a3f66 100%)`,
        },
        poison: {
            bg: `linear-gradient(to bottom, #0a0018 0%, #200038 50%, #050010 100%)`,
        },
        ground: {
            bg: `linear-gradient(to bottom, #0a0400 0%, #291000 50%, #080300 100%)`,
        },
        flying: {
            bg: `radial-gradient(ellipse 100% 100% at 50% 50%, #0a0518 0%, #100a2a 40%, #05020d 100%)`,
        },
        psychic: {
            bg: `radial-gradient(ellipse 100% 100% at 50% 50%, #1a0015 0%, #2d0028 40%, #08000a 100%)`,
        },
        fighting: {
            bg: `radial-gradient(ellipse 60% 60% at 50% 50%, #3d0000 0%, #1a0000 40%, #050000 100%)`,
        },
        ghost: {
            bg: `linear-gradient(to bottom, #020810 0%, #0a1828 40%, #010308 100%)`,
        },
        bug: {
            bg: `linear-gradient(to bottom, #000500 0%, #001200 50%, #000200 100%)`,
        },
        rock: {
            bg: `linear-gradient(to bottom, #080500 0%, #1a0d00 50%, #050300 100%)`,
        },
        dark: {
            bg: `radial-gradient(ellipse 100% 100% at 50% 50%, #050005 0%, #0a000a 30%, #000000 100%)`,
        },
        steel: {
            bg: `linear-gradient(135deg, #0a0c10 0%, #151a20 30%, #0c1018 60%, #080c12 100%)`,
        },
        dragon: {
            bg: `radial-gradient(ellipse 100% 100% at 50% 50%, #08001a 0%, #120030 40%, #030008 100%)`,
        },
        fairy: {
            bg: `radial-gradient(ellipse 100% 100% at 50% 30%, #1a0010 0%, #280018 40%, #08000a 100%)`,
        },
        normal: {
            bg: `radial-gradient(ellipse 100% 100% at 50% 50%, #0f0f0f 0%, #1a1a1a 40%, #050505 100%)`,
        },
    };

    // ─────────────────────────────────────────────
    // RENDER LOOP ENGINE
    // ─────────────────────────────────────────────
    function renderLoop(timestamp) {
        if (!canvas || !ctx) return;
        const t = timestamp - startTime;
        const W = canvas.width, H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        state._renderFn(ctx, W, H, t, state);

        raf = requestAnimationFrame(renderLoop);
    }

    // ─────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────
    return {
        show(el, type, posX = 50, posY = 50) {
            overlayEl = el;
            currentType = RENDERERS[type] || R[type] ? type : "normal";

            // Reset state cho hệ mới
            state = { local: {}, particles: [] };
            const _type = (RENDERERS[type] || R[type]) ? type : 'normal';
            const _candidates = [R[_type], R[_type + '1'], R[_type + '2']].filter(fn => typeof fn === 'function');
            state._renderFn = _candidates[Math.floor(Math.random() * _candidates.length)] || R.normal;

            // Style cơ bản cho overlay
            // Style cơ bản cho overlay — giới hạn trong khung battle-arena, không full màn hình
            const arenaElForBg = document.getElementById('battle-arena');
            const arenaRectBg = arenaElForBg
                ? arenaElForBg.getBoundingClientRect()
                : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            el.style.cssText = `
                position: fixed;
                top: ${arenaRectBg.top}px; left: ${arenaRectBg.left}px;
                width: ${arenaRectBg.width}px; height: ${arenaRectBg.height}px;
                overflow: hidden;
                z-index: 50;
                pointer-events: none;
                display: block;
                opacity: 1;
                transition: opacity 0.3s ease;
            `;

            // Gradient nền (div phía sau canvas)
            // Gradient nền (div phía sau canvas)
            if (!bgLayer) {
                bgLayer = document.createElement("div");
                bgLayer.style.cssText = `position:absolute;inset:0;z-index:0;pointer-events:none;mix-blend-mode:screen;`;
                el.appendChild(bgLayer);
            }
            bgLayer.style.background = (
                RENDERERS[currentType] || RENDERERS.normal
            ).bg;
            // Canvas
            if (!canvas) {
                canvas = document.createElement("canvas");
                canvas.style.cssText = `position:absolute;inset:0;z-index:1;pointer-events:none;mix-blend-mode:screen;`;
                el.appendChild(canvas);
            }
            canvas.width = arenaRectBg.width;
            canvas.height = arenaRectBg.height;
            ctx = canvas.getContext("2d");

            // Bắt đầu loop
            if (raf) cancelAnimationFrame(raf);
            startTime = performance.now();
            raf = requestAnimationFrame(renderLoop);
        },

        hide(el) {
            if (raf) {
                cancelAnimationFrame(raf);
                raf = null;
            }
            if (el) el.style.transform = "";
            if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
            state = { local: {}, particles: [] };
            overlayEl = null;
        },

        // Cho phép đăng ký renderer mới từ bên ngoài
        // Ví dụ: PkmSkillBack.register('custom', fn, '#background')
// Cho phép đăng ký renderer mới từ bên ngoài
        // Ví dụ: PkmSkillBack.register('custom', fn, '#background')
        register(type, renderFn, bg = "#000") {
            RENDERERS[type] = { fn: renderFn, bg };
        },
    };
    } // end createInstance

    // Giữ 1 instance mặc định để code cũ gọi PkmSkillBack.show()/hide() vẫn chạy như trước
    const defaultInstance = createInstance();

    return {
        show:     defaultInstance.show,
        hide:     defaultInstance.hide,
        register: defaultInstance.register,
        // Cho phép tạo thêm instance độc lập khi cần 2 nền chạy song song
        createInstance,
    };

})();
