/**
 * ============================================================================
 * POKÉMON TEMPLE DASH — RACE BACKGROUND MODULE
 * ============================================================================
 * File RIÊNG chuyên vẽ toàn bộ phần hình ảnh của 5 khu vực (Đền Cổ / Rừng
 * Rậm / Bờ Biển / Trên Mây / Hang Động): bầu trời, nền lấp đầy 2 bên đường,
 * mặt đường (kết cấu + HÌNH HỌC riêng — có khu vực đường thẳng, có khu vực
 * đường LƯỢN CONG, có khu vực NHẤP NHÔ theo sóng), vật trang trí ven đường,
 * và hình ảnh chướng ngại vật (dùng chung cơ chế né nhưng khoác "áo" riêng
 * theo khu vực). pkm_race.js chỉ cần GỌI các hàm ở đây, không tự vẽ nữa.
 *
 * NGUYÊN TẮC AN TOÀN (Hướng A): mọi độ lệch hình học (đường cong ở Rừng,
 * rung lắc ở Biển) CHỈ là lệch TOẠ ĐỘ VẼ (pathOffsetX/pathOffsetY), áp dụng
 * ĐỒNG NHẤT cho cả đường + vật trang trí. Vị trí LANE (-1/0/1) dùng để tính
 * va chạm trong pkm_race.js hoàn toàn không đổi — muốn nhân vật/obstacle
 * "đi theo" đường cong, pkm_race.js chỉ cần cộng thêm
 * RaceBackground.pathOffsetX(zone, t, distance) vào x sau khi tính lane như
 * bình thường (xem ghi chú "TÍCH HỢP" ở cuối file).
 *
 * API CHÍNH (state = {VW,VH,HORIZON_Y,ROAD_BOTTOM_Y,LANE_OFFSET_BOTTOM,
 * LANE_OFFSET_TOP,PLAYER_Y,distance,zoneIndex}):
 *   RaceBackground.zoneAt(index)
 *   RaceBackground.rebuildGradients(ctx, state)     // gọi lúc resize()/đổi khu vực
 *   RaceBackground.drawSky(ctx, state)
 *   RaceBackground.drawGroundFill(ctx, state)        // NỀN LẤP ĐẦY 2 BÊN — mới
 *   RaceBackground.drawRoad(ctx, state)
 *   RaceBackground.drawSideProp(ctx, sp, state)
 *   RaceBackground.drawObstacle(ctx, proj, obj, state)
 *   RaceBackground.drawWallGap(ctx, obj, state)
 *   RaceBackground.drawPortal(ctx, obj, state)
 *   RaceBackground.pathOffsetX(zone, t, distance)
 *   RaceBackground.pathOffsetY(zone, t, distance)
 * ============================================================================
 */

window.RaceBackground = {

    // ═══════════════════════════════════════════════════════════
    // CẤU HÌNH 5 KHU VỰC — mỗi khu vực có TONE MÀU, HÌNH HỌC ĐƯỜNG, NỀN LẤP
    // ĐẦY, VẬT TRANG TRÍ, và ÁO CHƯỚNG NGẠI VẬT hoàn toàn riêng.
    // Thêm khu vực mới: chỉ cần thêm 1 object vào mảng này.
    // ═══════════════════════════════════════════════════════════
    ZONES: [
        {
            id: "temple", label: "🏛️ Đền Cổ",
            sky: ["#160a2e", "#4c2270", "#a4477a", "#ff8c42"],
            roadTop: "#453a68", roadBottom: "#6a5c88",
            groundColors: ["#241a3a", "#120b22"],
            laneColor: "rgba(255,213,79,0.55)", edgeColor: "rgba(255,203,5,0.4)",
            orb: { color: "#fff6d8", glow: "rgba(255,240,190,0.9)" },
            silhouette: "temple", silhouetteColor: "#241132",
            groundStyle: "tile", roadStyle: "stoneSlab",
            curveAmp: 0, curveFreq: 0, bobAmp: 0, bobFreq: 0,
            propKinds: ["pillar", "statue", "lantern"],
            propPalette: {
                pillar: { body: "#6a5a94", body2: "#3a3160", gem: "#ffcb05" },
                statue: { body: "#7c72a0", eye: "#ffcb05" },
                lantern: { body: "#3a3160", flame: "#ffcb05", glow: "rgba(255,203,5,0.5)" },
            },
            ambient: "firefly", ambientColor: "rgba(255,224,130,0.85)",
            structureColor: ["#5a4a7a", "#3a2c58", "#241a3d"],
            obstacleTypes: ["rock", "spike", "chasm", "branch", "swarm", "pendulum"],
            obstacleAccent: "#ffcb05", obstacleFlourish: "glyph",
            wallEnabled: true, portalColor: "#ffcb05",
        },
        {
            id: "forest", label: "🌳 Rừng Rậm",
            sky: ["#031f12", "#0c4a2e", "#2e7d4f", "#c8f08a"],
            roadTop: "#4a3520", roadBottom: "#6b5230",
            groundColors: ["#0a2e1a", "#062012"],
            laneColor: "rgba(220,255,150,0.55)", edgeColor: "rgba(120,90,50,0.6)",
            orb: { color: "#fff3c4", glow: "rgba(255,240,150,0.8)" },
            silhouette: "forest", silhouetteColor: "#08200f",
            groundStyle: "undergrowth", roadStyle: "wovenDirt",
            curveAmp: 62, curveFreq: 1, bobAmp: 0, bobFreq: 0,
            propKinds: ["bigtree", "vine", "mushroom"],
            propPalette: {
                bigtree: { fill: "#0f4a24", fill2: "#1d7038", trunk: "#3a2612" },
                vine: { body: "#2e7d4f", leaf: "#c8f08a" },
                mushroom: { stem: "#e8dcc0", cap: "#e0524f", spot: "#fff6e0", glow: "rgba(200,255,140,0.5)" },
            },
            ambient: "pollen", ambientColor: "rgba(220,255,180,0.8)",
            structureColor: ["#4a6b3a", "#2e4a26", "#1c3018"],
            obstacleTypes: ["rock", "branch", "swarm", "wall", "pendulum"],
            obstacleAccent: "#c8f08a", obstacleFlourish: "vine",
            wallEnabled: true, portalColor: "#a8e063",
        },
        {
            id: "ocean", label: "🌊 Bờ Biển",
            sky: ["#021322", "#0a3a5c", "#1f8bc4", "#bff3ff"],
            roadTop: "#8a6a3f", roadBottom: "#c9a35c",
            groundColors: ["#0e3550", "#082238"],
            laneColor: "rgba(255,255,255,0.6)", edgeColor: "rgba(255,255,255,0.55)",
            orb: { color: "#fff0c0", glow: "rgba(255,235,180,0.85)" },
            silhouette: "ocean", silhouetteColor: "#0a2e40",
            groundStyle: "water", roadStyle: "pierPlanks",
            curveAmp: 0, curveFreq: 0, bobAmp: 7, bobFreq: 0.018,
            propKinds: ["palm", "coral", "driftwood"],
            propPalette: {
                palm: { trunk: "#7a5a3a", frond: "#1f8a5a" },
                coral: { body: "#ff7f6b", body2: "#ff4f81", glow: "rgba(255,180,200,0.5)" },
                driftwood: { body: "#8a6a48", moss: "rgba(160,240,255,0.5)" },
            },
            ambient: "bubble", ambientColor: "rgba(200,245,255,0.75)",
            structureColor: ["#2e6e80", "#1c4a5a", "#0f2e3a"],
            obstacleTypes: ["rock", "chasm", "branch", "swarm"],
            obstacleAccent: "#7fe6ff", obstacleFlourish: "barnacle",
            wallEnabled: false, portalColor: "#7fd8e8",
        },
        {
            id: "sky", label: "☁️ Trên Mây",
            sky: ["#132868", "#3a5aa8", "#8fc0f0", "#fff8e8"],
            roadTop: "#ffffff", roadBottom: "#d8e8ff",
            groundColors: ["#eaf2ff", "#c9def8"],
            laneColor: "rgba(255,220,120,0.7)", edgeColor: "rgba(255,255,255,0.7)",
            orb: { color: "#fffde0", glow: "rgba(255,253,220,0.95)" },
            silhouette: "sky", silhouetteColor: "#dce8fb",
            groundStyle: "cloudsea", roadStyle: "floatTiles",
            curveAmp: 0, curveFreq: 0, bobAmp: 0, bobFreq: 0,
            propKinds: ["cloudpuff", "floatisle", "starcluster"],
            propPalette: {
                cloudpuff: { fill: "#ffffff", shade: "#c9def8" },
                floatisle: { body: "#8aa0d0", grass: "#7ee6a0" },
                starcluster: { body: "#fffde0", glow: "rgba(255,255,200,0.6)" },
            },
            ambient: "cloudwisp", ambientColor: "rgba(255,255,255,0.85)",
            structureColor: ["#8aa0d0", "#6a82b8", "#4a629a"],
            obstacleTypes: ["chasm", "swarm", "wall", "pendulum"],
            obstacleAccent: "#fff2c0", obstacleFlourish: "sparkle",
            wallEnabled: true, portalColor: "#dff0ff",
        },
        {
            id: "underground", label: "💎 Hang Động",
            sky: ["#050208", "#180a20", "#3a1030", "#6a1830"],
            roadTop: "#2e1e34", roadBottom: "#4a3450",
            groundColors: ["#160a1c", "#0c0510"],
            laneColor: "rgba(255,150,90,0.6)", edgeColor: "rgba(200,120,255,0.5)",
            orb: { color: "#d8b6ff", glow: "rgba(160,110,255,0.9)" },
            silhouette: "underground", silhouetteColor: "#12081a",
            groundStyle: "cave", roadStyle: "emberRock",
            curveAmp: 0, curveFreq: 0, bobAmp: 0, bobFreq: 0,
            propKinds: ["stalagmite", "crystal", "fungus"],
            propPalette: {
                stalagmite: { body: "#3a2a3e", body2: "#241622", vein: "rgba(255,140,60,0.6)" },
                crystal: { body: "#9a5fe0", body2: "#4a1e5a", glow: "rgba(180,110,255,0.65)" },
                fungus: { stem: "#2a1420", cap: "#c9a0ff", glow: "rgba(180,110,255,0.55)" },
            },
            ambient: "ember", ambientColor: "rgba(255,150,60,0.85)",
            structureColor: ["#5a2c3a", "#3a1c26", "#241016"],
            obstacleTypes: ["rock", "spike", "chasm", "wall", "pendulum"],
            obstacleAccent: "#c9a0ff", obstacleFlourish: "crystal",
            wallEnabled: true, portalColor: "#b088ff",
        },
    ],

    zoneAt(index) { return this.ZONES[((index % this.ZONES.length) + this.ZONES.length) % this.ZONES.length]; },

    // Hash giả-ngẫu-nhiên ỔN ĐỊNH theo seed (không dùng Math.random() để
    // tránh nhấp nháy giữa các khung hình — cùng seed luôn ra cùng 1 số).
    prand(seed) {
        const x = Math.sin(seed * 12.9898) * 43758.5453;
        return x - Math.floor(x);
    },

    // ═══════════════════════════════════════════════════════════
    // ĐỘ LỆCH HÌNH HỌC RIÊNG THEO KHU VỰC (Hướng A — chỉ lệch toạ độ VẼ,
    // áp dụng ĐỒNG NHẤT cho đường + vật trang trí, KHÔNG đụng vào lane).
    //   forest : đường lượn cong trái/phải như đường mòn thật (curveAmp)
    //   ocean  : cầu ván nhấp nhô lên xuống theo sóng (bobAmp)
    //   3 khu vực còn lại: giữ 0 -> đường thẳng/ổn định (an toàn, đúng đặc trưng)
    // ═══════════════════════════════════════════════════════════
    pathOffsetX(zone, t, distance) {
        if (!zone.curveAmp) return 0;
        const depthPhase = (1 - Math.max(0, Math.min(1, t))) * 2.4;
        return Math.sin(distance * 0.006 * (zone.curveFreq || 1) + depthPhase) * zone.curveAmp * (0.35 + 0.65 * (1 - t));
    },
    pathOffsetY(zone, t, distance) {
        if (!zone.bobAmp) return 0;
        return Math.sin(distance * (zone.bobFreq || 0.02) + (1 - t) * 2.6) * zone.bobAmp * (0.4 + 0.6 * (1 - t));
    },

    // Đọc độ lệch do KHÚC CUA (do pkm_race.js quản lý) một cách AN TOÀN —
    // nếu RaceGame chưa có hàm này (hoặc không đang cua) thì trả về 0, không
    // văng lỗi. Cộng thêm vào mọi chỗ tính pathOffsetX để đường/vật trang
    // trí bám đúng theo khúc cua giống hệt nhân vật/vàng/chướng ngại vật.
    _cornerX(t) {
        return (window.RaceGame && typeof window.RaceGame.cornerOffsetX === "function")
            ? window.RaceGame.cornerOffsetX(t) : 0;
    },

    // ═══════════════════════════════════════════════════════════
    // GRADIENT CACHE — dựng 1 lần khi resize()/đổi khu vực, KHÔNG dựng lại
    // mỗi khung hình (tốn hiệu năng trên máy yếu).
    // ═══════════════════════════════════════════════════════════
    _gradCache: null,

    rebuildGradients(ctx, state) {
        const zone = this.zoneAt(state.zoneIndex);
        const sky = ctx.createLinearGradient(0, 0, 0, state.HORIZON_Y + 60);
        sky.addColorStop(0, zone.sky[0]); sky.addColorStop(0.45, zone.sky[1]);
        sky.addColorStop(0.8, zone.sky[2]); sky.addColorStop(1, zone.sky[3]);

        const ground = ctx.createLinearGradient(0, state.HORIZON_Y - 4, 0, state.VH);
        ground.addColorStop(0, zone.groundColors[0]);
        ground.addColorStop(1, zone.groundColors[1]);

        const road = ctx.createLinearGradient(0, state.HORIZON_Y, 0, state.ROAD_BOTTOM_Y + 130);
        road.addColorStop(0, zone.roadTop); road.addColorStop(1, zone.roadBottom);

        const orbX = state.VW * 0.78, orbY = 150;
        const orbGlow = ctx.createRadialGradient(orbX, orbY, 4, orbX, orbY, 90);
        orbGlow.addColorStop(0, zone.orb.glow);
        orbGlow.addColorStop(1, zone.orb.glow.replace(/[\d.]+\)$/, "0)"));

        const vign = ctx.createRadialGradient(state.VW / 2, state.VH * 0.42, state.VH * 0.35, state.VW / 2, state.VH * 0.42, state.VH * 0.75);
        vign.addColorStop(0, "rgba(0,0,0,0)"); vign.addColorStop(1, "rgba(0,0,0,0.45)");

        const playerGlow = ctx.createRadialGradient(0, 20, 10, 0, 20, 90);
        playerGlow.addColorStop(0, "rgba(255,203,5,0.35)"); playerGlow.addColorStop(1, "rgba(255,203,5,0)");

        this._gradCache = { sky, ground, road, orbGlow, vign, playerGlow, zoneId: zone.id };
        return this._gradCache;
    },

    // ═══════════════════════════════════════════════════════════
    // BẦU TRỜI + VẦNG SÁNG + CẢNH XA/GẦN
    // ═══════════════════════════════════════════════════════════
    drawSky(ctx, state) {
        const zone = this.zoneAt(state.zoneIndex);
        const g = this._gradCache || this.rebuildGradients(ctx, state);
        ctx.fillStyle = g.sky;
        ctx.fillRect(0, 0, state.VW, state.HORIZON_Y + 40);

        const orbX = state.VW * 0.78, orbY = 150;
        ctx.fillStyle = g.orbGlow;
        ctx.beginPath(); ctx.arc(orbX, orbY, 90, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = zone.orb.color;
        ctx.beginPath(); ctx.arc(orbX, orbY, 34, 0, Math.PI * 2); ctx.fill();

        this._drawSilhouette(zone, ctx, state);
    },

    _drawSilhouette(zone, ctx, state) {
        const baseY = state.HORIZON_Y - 10;
        const t = state.distance;
        if (zone.silhouette === "forest") {
            ctx.fillStyle = zone.silhouetteColor;
            for (let i = 0; i < 8; i++) {
                const bx = (i * 100 - 60 + (t * 5) % 100) % (state.VW + 160) - 80;
                const r = 46 + (i % 3) * 18;
                ctx.beginPath(); ctx.arc(bx, baseY - r * 0.6, r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.strokeStyle = "rgba(20,60,30,0.65)"; ctx.lineWidth = 3;
            for (let i = 0; i < 4; i++) {
                const vx = ((i * 190 + (t * 14) % 190) % (state.VW + 100)) - 40;
                const vlen = 60 + (i % 3) * 30;
                ctx.beginPath(); ctx.moveTo(vx, -4); ctx.quadraticCurveTo(vx + 14, vlen * 0.5, vx - 6, vlen); ctx.stroke();
                ctx.fillStyle = "rgba(40,110,60,0.75)";
                ctx.beginPath(); ctx.ellipse(vx - 6, vlen, 9, 6, 0.4, 0, Math.PI * 2); ctx.fill();
            }
            ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = "#fff3c4";
            for (let i = 0; i < 3; i++) {
                const sx = ((i * 240 + (t * 3) % 240) % (state.VW + 200)) - 100;
                ctx.save(); ctx.translate(sx, 0); ctx.rotate(0.25); ctx.fillRect(-18, 0, 36, state.HORIZON_Y); ctx.restore();
            }
            ctx.restore();
        } else if (zone.silhouette === "ocean") {
            ctx.fillStyle = zone.silhouetteColor;
            ctx.beginPath(); ctx.moveTo(-10, baseY);
            for (let x = -10; x <= state.VW + 10; x += 26) {
                const wOff = (t * 8) % 52;
                ctx.lineTo(x, baseY - 10 - 8 * Math.sin((x + wOff) * 0.06));
            }
            ctx.lineTo(state.VW + 10, baseY + 40); ctx.lineTo(-10, baseY + 40); ctx.closePath(); ctx.fill();
            for (let i = 0; i < 3; i++) {
                const bx = (i * 220 - 40 + (t * 4) % 220) % (state.VW + 260) - 130;
                ctx.beginPath(); ctx.ellipse(bx, baseY - 6, 60, 16, 0, 0, Math.PI * 2); ctx.fill();
            }
            const boatX = (state.VW * 0.3 + (t * 2) % (state.VW + 300)) % (state.VW + 300) - 150;
            ctx.fillStyle = "rgba(10,20,30,0.6)";
            ctx.beginPath(); ctx.moveTo(boatX - 16, baseY - 8); ctx.lineTo(boatX + 16, baseY - 8); ctx.lineTo(boatX + 10, baseY); ctx.lineTo(boatX - 10, baseY); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(boatX, baseY - 8); ctx.lineTo(boatX, baseY - 30); ctx.lineTo(boatX + 14, baseY - 8); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = "rgba(20,20,30,0.7)"; ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const gx = ((i * 160 + (t * 22) % 160) % (state.VW + 120)) - 60;
                const gy = 80 + (i % 3) * 40 + Math.sin(t * 0.05 + i) * 6;
                ctx.beginPath(); ctx.moveTo(gx - 9, gy); ctx.quadraticCurveTo(gx, gy - 7, gx + 9, gy);
                ctx.moveTo(gx + 1, gy); ctx.quadraticCurveTo(gx + 10, gy - 7, gx + 19, gy); ctx.stroke();
            }
            ctx.save(); ctx.globalAlpha = 0.22 + 0.08 * Math.sin(t * 0.1); ctx.fillStyle = "#ffe9b0";
            ctx.beginPath(); ctx.moveTo(state.VW * 0.78, baseY - 20); ctx.lineTo(state.VW * 0.78 + 30, baseY - 20);
            ctx.lineTo(state.VW * 0.5, state.HORIZON_Y + 30); ctx.lineTo(state.VW * 0.44, state.HORIZON_Y + 30); ctx.closePath(); ctx.fill();
            ctx.restore();
        } else if (zone.silhouette === "sky") {
            ctx.fillStyle = zone.silhouetteColor; ctx.globalAlpha = 0.85;
            for (let i = 0; i < 7; i++) {
                const bx = (i * 130 - 60 + (t * 5) % 130) % (state.VW + 200) - 100;
                const cy = baseY - 30 - (i % 3) * 20;
                ctx.beginPath();
                ctx.ellipse(bx, cy, 46, 20, 0, 0, Math.PI * 2);
                ctx.ellipse(bx + 30, cy + 6, 32, 15, 0, 0, Math.PI * 2);
                ctx.ellipse(bx - 28, cy + 8, 30, 14, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.save(); ctx.globalAlpha = 0.32;
            ["#ff6b6b", "#ffd166", "#7ee6a0", "#7ee6ff", "#a78bfa"].forEach((c, i) => {
                ctx.strokeStyle = c; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.arc(state.VW * 0.18, state.HORIZON_Y + 40, 130 - i * 7, Math.PI, Math.PI * 1.5); ctx.stroke();
            });
            ctx.restore();
            for (let i = 0; i < 2; i++) {
                const ix = ((i * 260 + (t * 6) % 260) % (state.VW + 200)) - 100;
                const iy = baseY - 50 + i * 20;
                ctx.fillStyle = "#e9f2ff"; ctx.beginPath(); ctx.ellipse(ix, iy, 42, 14, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "#7ee6a0"; ctx.beginPath(); ctx.ellipse(ix, iy - 8, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = "rgba(255,255,255,0.65)"; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(ix - 10, iy + 8); ctx.lineTo(ix - 12, iy + 40); ctx.stroke();
            }
        } else if (zone.silhouette === "underground") {
            ctx.fillStyle = zone.silhouetteColor;
            for (let i = 0; i < 9; i++) {
                const bx = (i * 90 - 40 + (t * 6) % 90) % (state.VW + 140) - 70;
                const h = 40 + (i % 4) * 22;
                ctx.beginPath(); ctx.moveTo(bx - 16, 0); ctx.lineTo(bx + 16, 0); ctx.lineTo(bx, h); ctx.closePath(); ctx.fill();
                const dripPhase = (t * 0.6 + i * 37) % 60;
                if (dripPhase < 40) {
                    ctx.fillStyle = "rgba(200,170,255,0.7)";
                    ctx.beginPath(); ctx.arc(bx, h + dripPhase, 2.4, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = zone.silhouetteColor;
                }
            }
            ctx.fillStyle = "rgba(200,150,255,0.5)";
            for (let i = 0; i < 5; i++) {
                const bx = (i * 160 - 30 + (t * 4) % 160) % (state.VW + 200) - 100;
                ctx.beginPath(); ctx.arc(bx, baseY - 10, 6, 0, Math.PI * 2); ctx.fill();
            }
            // vách hang ép sát 2 bên -> cảm giác đường hầm chật hẹp
            ctx.fillStyle = "#0c0510";
            [-1, 1].forEach((side) => {
                ctx.beginPath();
                ctx.moveTo(state.VW / 2 + side * (state.VW * 0.5), state.HORIZON_Y + 80);
                ctx.lineTo(state.VW / 2 + side * (state.VW * 0.58), state.HORIZON_Y - 90);
                ctx.lineTo(state.VW / 2 + side * (state.VW * 0.66), state.HORIZON_Y + 80);
                ctx.closePath(); ctx.fill();
            });
        } else {
            for (let i = 0; i < 6; i++) {
                const bx = (i * 140 - 60 + (t * 6) % 140) % (state.VW + 200) - 100;
                const bh = 60 + (i % 3) * 30;
                ctx.fillStyle = zone.silhouetteColor;
                ctx.fillRect(bx, baseY - bh, 46, bh);
                ctx.beginPath(); ctx.moveTo(bx - 6, baseY - bh); ctx.lineTo(bx + 23, baseY - bh - 26); ctx.lineTo(bx + 52, baseY - bh); ctx.closePath(); ctx.fill();
                ctx.fillStyle = "rgba(255,203,5,0.55)"; ctx.fillRect(bx + 16, baseY - bh + 14, 10, 12);
            }
            [-1, 1].forEach((side) => {
                for (let i = 0; i < 2; i++) {
                    const px = state.VW / 2 + side * (state.VW * 0.42 + i * state.VW * 0.1);
                    const py = baseY + 26;
                    ctx.fillStyle = "#3a3160"; ctx.fillRect(px - 7, py - 46, 14, 46);
                    const flick = 0.6 + 0.4 * Math.abs(Math.sin(t * 0.2 + i + side));
                    const glow = ctx.createRadialGradient(px, py - 52, 2, px, py - 52, 22);
                    glow.addColorStop(0, `rgba(255,180,60,${0.7 * flick})`); glow.addColorStop(1, "rgba(255,140,40,0)");
                    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py - 52, 22, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = `rgba(255,203,5,${0.85 * flick})`;
                    ctx.beginPath(); ctx.arc(px, py - 52, 5, 0, Math.PI * 2); ctx.fill();
                }
            });
        }
    },

    // ═══════════════════════════════════════════════════════════
    // NỀN LẤP ĐẦY 2 BÊN ĐƯỜNG (MỚI) — sửa lỗi "2 bên màu đen trống".
    // Vẽ TOÀN BỘ mặt đất từ chân trời xuống đáy màn hình bằng màu/kết cấu
    // riêng của khu vực TRƯỚC KHI vẽ đường lên trên — không còn khoảng
    // trống nào lộ ra ngoài nữa.
    // ═══════════════════════════════════════════════════════════
    drawGroundFill(ctx, state) {
        const zone = this.zoneAt(state.zoneIndex);
        const g = this._gradCache || this.rebuildGradients(ctx, state);
        ctx.fillStyle = g.ground;
        ctx.fillRect(0, state.HORIZON_Y - 4, state.VW, state.VH - state.HORIZON_Y + 4);

        switch (zone.groundStyle) {
            case "undergrowth": this._groundForest(ctx, state); break;
            case "water": this._groundOcean(ctx, state); break;
            case "cloudsea": this._groundSky(ctx, state); break;
            case "cave": this._groundCave(ctx, state); break;
            case "tile":
            default: this._groundTemple(ctx, state); break;
        }
    },

    // Rải N vật trang trí nền theo phối cảnh (xa nhỏ mờ -> gần to rõ), scroll
    // ỔN ĐỊNH theo quãng đường (dùng prand nên không nhấp nháy giữa các khung hình).
    _scatterField(ctx, state, count, seedBase, itemFn) {
        const { VW, HORIZON_Y, ROAD_BOTTOM_Y, distance } = state;
        for (let i = 0; i < count; i++) {
            const seed = seedBase + i * 131.7;
            const speed = 0.4 + this.prand(seed + 5) * 0.6;
            const f = (this.prand(seed + 1) + distance * 0.00075 * speed) % 1;
            const y = HORIZON_Y + (ROAD_BOTTOM_Y + 170 - HORIZON_Y) * f;
            const side = this.prand(seed) < 0.5 ? -1 : 1;
            const edgeBias = 0.15 + this.prand(seed + 2) * 0.85;
            const x = VW / 2 + side * (VW * 0.5) * edgeBias * (0.15 + f * 0.9);
            const scale = 0.2 + f * 1.3;
            itemFn(x, y, scale, seed, f);
        }
    },

    _groundTemple(ctx, state) {
        this._scatterField(ctx, state, 22, 11, (x, y, s, seed, f) => {
            ctx.globalAlpha = 0.45 + f * 0.4;
            ctx.fillStyle = this.prand(seed + 3) > 0.72 ? "rgba(90,160,100,0.35)" : "rgba(255,255,255,0.06)";
            ctx.fillRect(x - 10 * s, y - 7 * s, 20 * s, 14 * s);
        });
        ctx.globalAlpha = 1;
    },
    _groundForest(ctx, state) {
        this._scatterField(ctx, state, 30, 21, (x, y, s, seed, f) => {
            ctx.globalAlpha = 0.55 + f * 0.35;
            ctx.fillStyle = this.prand(seed + 4) > 0.5 ? "rgba(6,30,15,0.55)" : "rgba(90,170,60,0.4)";
            ctx.beginPath(); ctx.ellipse(x, y, 17 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
    },
    _groundOcean(ctx, state) {
        const { VW, HORIZON_Y, ROAD_BOTTOM_Y, distance } = state;
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        for (let i = 0; i < 10; i++) {
            const f = ((i / 10) + distance * 0.0006) % 1;
            const y = HORIZON_Y + (ROAD_BOTTOM_Y + 170 - HORIZON_Y) * f;
            ctx.globalAlpha = 0.15 + f * 0.3; ctx.lineWidth = 1.5 + f * 2;
            ctx.beginPath(); ctx.moveTo(0, y);
            for (let x = 0; x <= VW; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.05 + distance * 0.02) * 3 * f);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        this._scatterField(ctx, state, 16, 33, (x, y, s, seed, f) => {
            ctx.globalAlpha = 0.4 * f; ctx.fillStyle = "rgba(255,255,255,0.75)";
            ctx.beginPath(); ctx.ellipse(x, y, 11 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
    },
    _groundSky(ctx, state) {
        this._scatterField(ctx, state, 22, 44, (x, y, s, seed, f) => {
            ctx.globalAlpha = 0.55 + f * 0.4;
            ctx.fillStyle = this.prand(seed + 2) > 0.5 ? "#ffffff" : "#e4ecff";
            ctx.beginPath();
            ctx.ellipse(x, y, 22 * s, 10 * s, 0, 0, Math.PI * 2);
            ctx.ellipse(x - 14 * s, y + 3 * s, 14 * s, 7 * s, 0, 0, Math.PI * 2);
            ctx.ellipse(x + 14 * s, y + 3 * s, 14 * s, 7 * s, 0, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    },
    _groundCave(ctx, state) {
        this._scatterField(ctx, state, 20, 55, (x, y, s, seed, f) => {
            ctx.globalAlpha = 0.6 + f * 0.35;
            ctx.fillStyle = this.prand(seed) > 0.78 ? "rgba(190,130,255,0.55)" : "rgba(46,30,52,0.75)";
            ctx.beginPath(); ctx.ellipse(x, y, 15 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();
        });
        ctx.strokeStyle = "rgba(255,120,40,0.5)"; ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(255,120,40,0.6)"; ctx.shadowBlur = 5;
        this._scatterField(ctx, state, 7, 66, (x, y, s, seed, f) => {
            ctx.globalAlpha = 0.4 + f * 0.4;
            ctx.beginPath(); ctx.moveTo(x - 14 * s, y); ctx.lineTo(x + 10 * s, y - 6 * s); ctx.lineTo(x + 2 * s, y + 8 * s); ctx.stroke();
        });
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    },

    // ═══════════════════════════════════════════════════════════
    // MẶT ĐƯỜNG — hình học RIÊNG (thẳng/cong/nhấp nhô) + kết cấu RIÊNG
    // ═══════════════════════════════════════════════════════════
    roadPointAt(state, t, frac) {
        const zone = this.zoneAt(state.zoneIndex);
        const f = Math.max(0, Math.min(1, t)) ** 1.6;
        const off = state.LANE_OFFSET_BOTTOM + (state.LANE_OFFSET_TOP - state.LANE_OFFSET_BOTTOM) * f;
        const x = state.VW / 2 + frac * off * 1.5 + this.pathOffsetX(zone, t, state.distance) + this._cornerX(t);
        const y = state.ROAD_BOTTOM_Y + (state.HORIZON_Y - state.ROAD_BOTTOM_Y) * f + this.pathOffsetY(zone, t, state.distance);
        return { x, y, f };
    },

    drawRoad(ctx, state) {
        const zone = this.zoneAt(state.zoneIndex);
        const g = this._gradCache || this.rebuildGradients(ctx, state);

        // Xây polygon đường bằng NHIỀU điểm dọc theo t (thay vì 4 góc cố định)
        // để có thể uốn cong (forest) / nhấp nhô (ocean) thật sự về hình học.
        const leftPts = [], rightPts = [];
        for (let t = 1; t >= -0.05; t -= 0.05) {
            const f = Math.max(0, Math.min(1, t)) ** 1.6;
            const off = state.LANE_OFFSET_BOTTOM + (state.LANE_OFFSET_TOP - state.LANE_OFFSET_BOTTOM) * f;
            const half = off * 1.5 + (40 - 30 * f);
            const cx = state.VW / 2 + this.pathOffsetX(zone, t, state.distance) + this._cornerX(t);
            const cy = state.ROAD_BOTTOM_Y + (state.HORIZON_Y - state.ROAD_BOTTOM_Y) * f + this.pathOffsetY(zone, t, state.distance);
            leftPts.push({ x: cx - half, y: cy });
            rightPts.push({ x: cx + half, y: cy });
        }
        ctx.beginPath();
        leftPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        for (let i = rightPts.length - 1; i >= 0; i--) ctx.lineTo(rightPts[i].x, rightPts[i].y);
        ctx.closePath();
        ctx.fillStyle = g.road;
        ctx.fill();

        ctx.save();
        ctx.clip();
        switch (zone.roadStyle) {
            case "wovenDirt": this._roadForest(ctx, state); break;
            case "pierPlanks": this._roadOcean(ctx, state); break;
            case "floatTiles": this._roadSky(ctx, state); break;
            case "emberRock": this._roadCave(ctx, state); break;
            case "stoneSlab":
            default: this._roadTemple(ctx, state); break;
        }
        ctx.restore();

        ctx.strokeStyle = zone.edgeColor;
        ctx.lineWidth = 3;
        ctx.stroke();

        // vạch chia lane — CŨNG đi theo đúng đường cong/rung của khu vực
        const scrollOffset = (state.distance * 3.2) % 60;
        ctx.strokeStyle = zone.laneColor;
        [-0.5, 0.5].forEach((laneEdge) => {
            ctx.beginPath();
            for (let t = 1; t >= 0; t -= 0.02) {
                const f = t ** 1.6;
                const off = state.LANE_OFFSET_BOTTOM + (state.LANE_OFFSET_TOP - state.LANE_OFFSET_BOTTOM) * f;
                const x = state.VW / 2 + laneEdge * off * 2 + this.pathOffsetX(zone, t, state.distance) + this._cornerX(t);
                const y = state.ROAD_BOTTOM_Y + (state.HORIZON_Y - state.ROAD_BOTTOM_Y) * f + this.pathOffsetY(zone, t, state.distance);
                const dashPhase = Math.floor((t * 400 + scrollOffset) / 30) % 2;
                if (dashPhase === 0) ctx.lineTo(x, y); else ctx.moveTo(x, y);
            }
            ctx.lineWidth = 4;
            ctx.stroke();
        });
    },

    // ── stoneSlab (temple): gạch lát đá cổ + mạch vữa + rêu phong ──
    _roadTemple(ctx, state) {
        const N = 16, scroll = (state.distance * 0.09) % 1;
        ctx.strokeStyle = "rgba(20,14,30,0.4)"; ctx.lineWidth = 2;
        for (let i = 0; i < N; i++) {
            const tt = (i / N + scroll / N) % 1;
            const L = this.roadPointAt(state, tt, -1.05), R = this.roadPointAt(state, tt, 1.05);
            ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(R.x, R.y); ctx.stroke();
        }
        ctx.fillStyle = "rgba(90,170,100,0.28)";
        [[0.68, -0.5], [0.35, 0.55], [0.12, -0.3]].forEach(([tt, side]) => {
            const p = this.roadPointAt(state, tt, side);
            const r = 14 * Math.max(0.25, p.f);
            ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.5, 0.3, 0, Math.PI * 2); ctx.fill();
        });
        // viền vàng kim dọc tâm đường — nét đặc trưng "đền cổ"
        ctx.strokeStyle = "rgba(255,203,5,0.22)"; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let t = 1; t >= 0; t -= 0.04) { const p = this.roadPointAt(state, t, 0); t === 1 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); }
        ctx.stroke();
    },

    // ── wovenDirt (forest): đất mòn + rễ cây bò ngang + lá rụng ──
    _roadForest(ctx, state) {
        const scroll = (state.distance * 0.07) % 1;
        ctx.strokeStyle = "rgba(50,32,16,0.55)";
        for (let i = 0; i < 5; i++) {
            const tt = (i / 5 + scroll) % 1;
            const base = this.roadPointAt(state, tt, i % 2 === 0 ? -0.3 : 0.35);
            const mid = this.roadPointAt(state, Math.max(0, tt - 0.06), i % 2 === 0 ? 0.05 : -0.1);
            const end = this.roadPointAt(state, Math.max(0, tt - 0.12), i % 2 === 0 ? 0.3 : 0.4);
            ctx.lineWidth = 3 * Math.max(0.3, base.f);
            ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.quadraticCurveTo(mid.x, mid.y, end.x, end.y); ctx.stroke();
        }
        ctx.fillStyle = "rgba(220,140,60,0.55)";
        for (let i = 0; i < 10; i++) {
            const tt = (i / 10 + scroll * 1.3) % 1;
            const side = ((i * 37) % 100) / 100 * 1.6 - 0.8;
            const p = this.roadPointAt(state, tt, side);
            const r = 5 * Math.max(0.3, p.f);
            ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.6, i, 0, Math.PI * 2); ctx.fill();
        }
    },

    // ── pierPlanks (ocean): ván gỗ cầu tàu, hở khe lộ nước lấp lánh dưới ──
    _roadOcean(ctx, state) {
        const N = 13, scroll = (state.distance * 0.11) % 1;
        for (let i = 0; i < N; i++) {
            const tt = (i / N + scroll / N) % 1;
            const L = this.roadPointAt(state, tt, -1.05), R = this.roadPointAt(state, tt, 1.05);
            const tt2 = (i / N + 0.035 + scroll / N) % 1;
            const L2 = this.roadPointAt(state, tt2, -1.05), R2 = this.roadPointAt(state, tt2, 1.05);
            ctx.fillStyle = i % 2 === 0 ? "rgba(120,80,30,0.35)" : "rgba(150,105,45,0.3)";
            ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(R.x, R.y); ctx.lineTo(R2.x, R2.y); ctx.lineTo(L2.x, L2.y); ctx.closePath(); ctx.fill();
            // khe hở lộ nước lấp lánh
            ctx.strokeStyle = "rgba(120,220,255,0.4)"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(R.x, R.y); ctx.stroke();
        }
    },

    // ── floatTiles (sky): phiến đá-mây nổi tách rời, khe hở phát sáng ──
    _roadSky(ctx, state) {
        const N = 11, scroll = (state.distance * 0.08) % 1;
        for (let i = 0; i < N; i++) {
            const tt0 = (i / N + scroll / N) % 1;
            const tt1 = Math.min(1, tt0 + 0.052);
            const L0 = this.roadPointAt(state, tt0, -1.05), R0 = this.roadPointAt(state, tt0, 1.05);
            const L1 = this.roadPointAt(state, tt1, -1.05), R1 = this.roadPointAt(state, tt1, 1.05);
            ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.9)" : "rgba(216,232,255,0.85)";
            ctx.beginPath(); ctx.moveTo(L0.x, L0.y); ctx.lineTo(R0.x, R0.y); ctx.lineTo(R1.x, R1.y); ctx.lineTo(L1.x, L1.y); ctx.closePath(); ctx.fill();
            // khe hở phát sáng giữa các phiến
            ctx.strokeStyle = "rgba(255,240,180,0.7)"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(L1.x, L1.y); ctx.lineTo(R1.x, R1.y); ctx.stroke();
        }
        this._scatterField(ctx, state, 8, 77, (x, y, s) => {
            ctx.globalAlpha = 0.7; ctx.fillStyle = "#fff";
            ctx.beginPath(); ctx.arc(x, y, 2 * s, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
    },

    // ── emberRock (underground): nền đá hang + khe dung nham phát sáng ──
    _roadCave(ctx, state) {
        const scroll = (state.distance * 0.08) % 1;
        ctx.strokeStyle = "rgba(255,120,40,0.7)"; ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(255,120,40,0.7)"; ctx.shadowBlur = 7;
        for (let i = 0; i < 4; i++) {
            const tt = (i / 4 + scroll) % 1;
            ctx.beginPath();
            for (let k = 0; k <= 4; k++) {
                const localT = Math.max(0, tt - k * 0.03);
                const side = (i % 2 === 0 ? -0.4 : 0.3) + Math.sin(k + i) * 0.15;
                const p = this.roadPointAt(state, localT, side);
                k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(200,150,255,0.75)";
        for (let i = 0; i < 6; i++) {
            const tt = (i / 6 + scroll * 1.4) % 1;
            const side = ((i * 61) % 100) / 100 * 1.7 - 0.85;
            const p = this.roadPointAt(state, tt, side);
            const r = 3.4 * Math.max(0.3, p.f);
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        }
    },

    // ═══════════════════════════════════════════════════════════
    // VẬT TRANG TRÍ VEN ĐƯỜNG — 15 dạng (3 dạng riêng × 5 khu vực), tự tính
    // toạ độ có áp dụng pathOffsetX/Y để "bám" theo đường cong/nhấp nhô.
    // ═══════════════════════════════════════════════════════════
    drawSideProp(ctx, sp, state) {
        const zone = this.zoneAt(state.zoneIndex);
        const f = Math.max(0, Math.min(1, sp.t)) ** 1.6;
        const off = state.LANE_OFFSET_BOTTOM + (state.LANE_OFFSET_TOP - state.LANE_OFFSET_BOTTOM) * f;
        const scale = 1 + (0.12 - 1) * f;
        const y = state.ROAD_BOTTOM_Y + (state.HORIZON_Y - state.ROAD_BOTTOM_Y) * f + this.pathOffsetY(zone, sp.t, state.distance);
        const x = state.VW / 2 + sp.lane * off + this.pathOffsetX(zone, sp.t, state.distance) + this._cornerX(sp.t) + sp.jitter * scale;
        const s = scale;
        const pal = (zone.propPalette && zone.propPalette[sp.kind]) || {};

        ctx.save();
        ctx.globalAlpha = Math.min(1, f * 3 + 0.15);

        switch (sp.kind) {
            case "pillar": {
                const w = 34 * s, h = 150 * s;
                ctx.fillStyle = pal.body2 || "#3a3160"; ctx.fillRect(x - w * 0.55, y - h, w * 1.1, h);
                ctx.fillStyle = pal.body || "#6a5a94"; ctx.fillRect(x - w * 0.5, y - h, w, h * 0.9);
                ctx.fillRect(x - w * 0.7, y - h - 10 * s, w * 1.4, 10 * s);
                ctx.fillStyle = pal.gem || "#ffcb05"; ctx.globalAlpha *= 0.6;
                ctx.fillRect(x - w * 0.15, y - h * 0.55, w * 0.3, w * 0.3);
                break;
            }
            case "statue": {
                const w = 40 * s, h = 130 * s;
                ctx.fillStyle = pal.body || "#7c72a0";
                ctx.beginPath(); ctx.ellipse(x, y - h * 0.94, w * 0.22, w * 0.24, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x - w * 0.3, y); ctx.lineTo(x - w * 0.34, y - h * 0.6); ctx.lineTo(x, y - h * 0.85);
                ctx.lineTo(x + w * 0.34, y - h * 0.6); ctx.lineTo(x + w * 0.3, y); ctx.closePath(); ctx.fill();
                ctx.fillStyle = pal.eye || "#ffcb05"; ctx.globalAlpha *= 0.8;
                ctx.beginPath(); ctx.arc(x - 6 * s, y - h * 0.95, 2.4 * s, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + 6 * s, y - h * 0.95, 2.4 * s, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case "lantern": {
                const h = 90 * s;
                ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1.5 * s;
                ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x, y - h * 0.55); ctx.stroke();
                const glow = ctx.createRadialGradient(x, y - h * 0.5, 2, x, y - h * 0.5, 26 * s);
                glow.addColorStop(0, pal.glow || "rgba(255,203,5,0.5)"); glow.addColorStop(1, "rgba(255,203,5,0)");
                ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y - h * 0.5, 26 * s, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = pal.body || "#3a3160"; ctx.fillRect(x - 10 * s, y - h * 0.62, 20 * s, 20 * s);
                ctx.fillStyle = pal.flame || "#ffcb05"; ctx.beginPath(); ctx.arc(x, y - h * 0.5, 6 * s, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case "bigtree": {
                const w = 60 * s, h = 130 * s;
                ctx.fillStyle = pal.trunk || "#3a2612";
                ctx.beginPath(); ctx.moveTo(x - w * 0.1, y); ctx.lineTo(x - w * 0.16, y - h * 0.32); ctx.lineTo(x + w * 0.16, y - h * 0.32); ctx.lineTo(x + w * 0.1, y); ctx.closePath(); ctx.fill();
                ctx.fillStyle = pal.fill || "#0f4a24";
                ctx.beginPath(); ctx.ellipse(x, y - h * 0.65, w * 0.6, h * 0.42, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = pal.fill2 || "#1d7038";
                ctx.beginPath(); ctx.ellipse(x - w * 0.2, y - h * 0.78, w * 0.36, h * 0.26, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(x + w * 0.24, y - h * 0.7, w * 0.3, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case "vine": {
                const h = 110 * s;
                ctx.strokeStyle = pal.body || "#2e7d4f"; ctx.lineWidth = 3 * s;
                ctx.beginPath(); ctx.moveTo(x, y - h); ctx.quadraticCurveTo(x + 14 * s, y - h * 0.5, x - 8 * s, y); ctx.stroke();
                ctx.fillStyle = pal.leaf || "#c8f08a";
                for (let i = 0; i < 4; i++) {
                    const lt = i / 3;
                    const lx = x + Math.sin(lt * Math.PI) * 10 * s - 4 * s * lt;
                    const ly = y - h + h * lt;
                    ctx.beginPath(); ctx.ellipse(lx, ly, 7 * s, 4 * s, lt, 0, Math.PI * 2); ctx.fill();
                }
                break;
            }
            case "mushroom": {
                const h = 40 * s;
                ctx.fillStyle = pal.stem || "#e8dcc0"; ctx.fillRect(x - 5 * s, y - h, 10 * s, h);
                ctx.fillStyle = pal.glow || "rgba(200,255,140,0.5)";
                ctx.beginPath(); ctx.ellipse(x, y - h, 26 * s, 12 * s, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = pal.cap || "#e0524f";
                ctx.beginPath(); ctx.ellipse(x, y - h, 20 * s, 14 * s, 0, Math.PI, Math.PI * 2); ctx.fill();
                ctx.fillStyle = pal.spot || "#fff6e0";
                [[-8, -2], [8, -3], [0, -8]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(x + dx * s, y - h + dy * s, 2.4 * s, 0, Math.PI * 2); ctx.fill(); });
                break;
            }
            case "palm": {
                const h = 120 * s;
                ctx.strokeStyle = pal.trunk || "#7a5a3a"; ctx.lineWidth = 8 * s; ctx.lineCap = "round";
                ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 16 * s, y - h * 0.55, x, y - h); ctx.stroke();
                ctx.fillStyle = pal.frond || "#1f8a5a";
                for (let i = 0; i < 5; i++) {
                    const ang = -Math.PI / 2 + (i - 2) * 0.5;
                    ctx.save(); ctx.translate(x, y - h); ctx.rotate(ang);
                    ctx.beginPath(); ctx.ellipse(24 * s, 0, 26 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                }
                break;
            }
            case "coral": {
                const h = 55 * s;
                ctx.fillStyle = pal.glow || "rgba(255,180,200,0.4)";
                ctx.beginPath(); ctx.ellipse(x, y, 30 * s, 12 * s, 0, 0, Math.PI * 2); ctx.fill();
                [[-1, 0.9], [0, 1], [1, 0.85]].forEach(([dir, len], i) => {
                    ctx.strokeStyle = i % 2 === 0 ? (pal.body || "#ff7f6b") : (pal.body2 || "#ff4f81");
                    ctx.lineWidth = 6 * s; ctx.lineCap = "round";
                    ctx.beginPath(); ctx.moveTo(x + dir * 6 * s, y); ctx.quadraticCurveTo(x + dir * 18 * s, y - h * 0.6, x + dir * 10 * s, y - h * len); ctx.stroke();
                });
                break;
            }
            case "driftwood": {
                const w = 70 * s;
                ctx.fillStyle = pal.body || "#8a6a48";
                ctx.save(); ctx.translate(x, y); ctx.rotate(-0.18); ctx.fillRect(-w / 2, -8 * s, w, 14 * s); ctx.restore();
                ctx.fillStyle = pal.moss || "rgba(160,240,255,0.5)";
                ctx.beginPath(); ctx.arc(x - w * 0.2, y - 4 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(x + w * 0.15, y - 8 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case "cloudpuff": {
                ctx.fillStyle = pal.fill || "#ffffff";
                [[0, 0, 24], [-16, 6, 16], [16, 6, 16], [0, -10, 14]].forEach(([dx, dy, r]) => {
                    ctx.beginPath(); ctx.ellipse(x + dx * s, y + dy * s, r * s, r * 0.7 * s, 0, 0, Math.PI * 2); ctx.fill();
                });
                ctx.fillStyle = pal.shade || "#c9def8"; ctx.globalAlpha *= 0.5;
                ctx.beginPath(); ctx.ellipse(x, y + 10 * s, 26 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case "floatisle": {
                const w = 60 * s;
                ctx.fillStyle = pal.body || "#8aa0d0";
                ctx.beginPath(); ctx.ellipse(x, y, w * 0.5, 14 * s, 0, 0, Math.PI); ctx.fill();
                ctx.fillStyle = pal.grass || "#7ee6a0";
                ctx.beginPath(); ctx.ellipse(x, y - 6 * s, w * 0.46, 9 * s, 0, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case "starcluster": {
                ctx.fillStyle = pal.glow || "rgba(255,255,200,0.5)";
                ctx.beginPath(); ctx.arc(x, y - 30 * s, 26 * s, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = pal.body || "#fffde0";
                [[0, -40, 5], [-14, -20, 3], [12, -26, 3.4]].forEach(([dx, dy, r]) => this.drawStarShape(ctx, x + dx * s, y + dy * s, r * s));
                break;
            }
            case "stalagmite": {
                const w = 34 * s, h = 100 * s;
                const grad = ctx.createLinearGradient(x, y - h, x, y);
                grad.addColorStop(0, pal.body2 || "#241622"); grad.addColorStop(1, pal.body || "#3a2a3e");
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w * 0.1, y - h); ctx.lineTo(x + w * 0.14, y - h * 0.8); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = pal.vein || "rgba(255,140,60,0.6)"; ctx.lineWidth = 1.6 * s;
                ctx.beginPath(); ctx.moveTo(x - 4 * s, y); ctx.lineTo(x + 2 * s, y - h * 0.5); ctx.lineTo(x - 2 * s, y - h * 0.8); ctx.stroke();
                break;
            }
            case "crystal": {
                const h = 60 * s;
                ctx.fillStyle = pal.glow || "rgba(180,110,255,0.45)";
                ctx.beginPath(); ctx.ellipse(x, y - h * 0.4, 26 * s, 30 * s, 0, 0, Math.PI * 2); ctx.fill();
                [[-1, 0.7], [0, 1], [1, 0.75]].forEach(([dir, len]) => {
                    const grad = ctx.createLinearGradient(x, y - h * len, x, y);
                    grad.addColorStop(0, pal.body || "#9a5fe0"); grad.addColorStop(1, pal.body2 || "#4a1e5a");
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.moveTo(x + dir * 4 * s, y); ctx.lineTo(x + dir * 16 * s, y - h * len * 0.5);
                    ctx.lineTo(x + dir * 6 * s, y - h * len); ctx.lineTo(x + dir * -2 * s, y - h * len * 0.5);
                    ctx.closePath(); ctx.fill();
                });
                break;
            }
            case "fungus": {
                const h = 34 * s;
                ctx.fillStyle = pal.stem || "#2a1420"; ctx.fillRect(x - 4 * s, y - h, 8 * s, h);
                ctx.fillStyle = pal.glow || "rgba(180,110,255,0.55)"; ctx.beginPath(); ctx.arc(x, y - h, 20 * s, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = pal.cap || "#c9a0ff"; ctx.beginPath(); ctx.arc(x, y - h, 12 * s, 0, Math.PI * 2); ctx.fill();
                break;
            }
            default: {
                ctx.fillStyle = "#3a2560"; ctx.beginPath(); ctx.arc(x, y - 40 * s, 16 * s, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    },

    drawStarShape(ctx, cx, cy, r) {
        ctx.save(); ctx.translate(cx, cy);
        ctx.beginPath();
        ctx.moveTo(0, -r); ctx.lineTo(r * 0.28, -r * 0.28); ctx.lineTo(r, 0);
        ctx.lineTo(r * 0.28, r * 0.28); ctx.lineTo(0, r); ctx.lineTo(-r * 0.28, r * 0.28);
        ctx.lineTo(-r, 0); ctx.lineTo(-r * 0.28, -r * 0.28);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    },

    // ═══════════════════════════════════════════════════════════
    // CHƯỚNG NGẠI VẬT — dùng chung cơ chế né (nhảy/trượt/đổi làn) nhưng mỗi
    // khu vực khoác "áo" (màu nhấn + hoạ tiết flourish + hiệu ứng riêng)
    // ═══════════════════════════════════════════════════════════
    drawGroundShadow(ctx, rx, ry, offsetY, alpha = 0.4) {
        ctx.save(); ctx.scale(1, 0.28);
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.beginPath(); ctx.ellipse(0, offsetY / 0.28, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    },

    // Nhãn chữ dạng "viên thuốc" (pill) có nền tương phản — dễ đọc hơn hẳn so
    // với chữ trần chỉ có đổ bóng, đặc biệt khi chạy tốc độ cao.
    drawActionLabel(ctx, text, x, y, scale, color) {
        ctx.save();
        ctx.font = `bold ${14 * scale}px Baloo 2, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const padX = 10 * scale, padY = 5 * scale;
        const w = ctx.measureText(text).width + padX * 2;
        const h = 14 * scale + padY * 2;
        const r = h / 2;
        ctx.fillStyle = "rgba(10,8,18,0.72)";
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + r, y - h / 2);
        ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
        ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
        ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
        ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1.6 * scale; ctx.globalAlpha = 0.9; ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 3 * scale;
        ctx.fillText(text, x, y + 1 * scale);
        ctx.restore();
    },

    // HUY HIỆU LỚN + MŨI TÊN — dấu hiệu CHÍNH để người chơi nhận biết ngay
    // lập tức phải NHẢY / TRƯỢT / ĐỔI LÀN, kể cả khi chạy rất nhanh. To, viền
    // phát sáng, tự nhấp nháy nhịp nhàng để "hút mắt" — đặt phía trên mỗi
    // chướng ngại vật, cùng với nhãn chữ nhỏ bên dưới cho rõ nghĩa.
    drawCueIcon(ctx, action, x, y, scale, color) {
        const pulse = 0.72 + 0.28 * Math.abs(Math.sin(Date.now() * 0.005));
        const r = 27 * scale;
        ctx.save();
        ctx.translate(x, y);

        // nền tròn tối để mũi tên nổi bật trên MỌI phông nền
        const bg = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
        bg.addColorStop(0, "rgba(10,8,18,0.85)");
        bg.addColorStop(1, "rgba(10,8,18,0.45)");
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

        // viền phát sáng nhấp nháy
        ctx.lineWidth = 3.6 * scale;
        ctx.strokeStyle = color;
        ctx.globalAlpha = pulse;
        ctx.shadowColor = color; ctx.shadowBlur = 16 * scale;
        ctx.beginPath(); ctx.arc(0, 0, r - 2 * scale, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;

        // mũi tên lớn, đậm
        ctx.fillStyle = color;
        ctx.beginPath();
        const a = 13 * scale, b = 5 * scale, c = 15 * scale;
        if (action === "jump") {
            ctx.moveTo(0, -c); ctx.lineTo(a, b); ctx.lineTo(b, b);
            ctx.lineTo(b, c); ctx.lineTo(-b, c); ctx.lineTo(-b, b); ctx.lineTo(-a, b);
        } else if (action === "slide") {
            ctx.moveTo(0, c); ctx.lineTo(a, -b); ctx.lineTo(b, -b);
            ctx.lineTo(b, -c); ctx.lineTo(-b, -c); ctx.lineTo(-b, -b); ctx.lineTo(-a, -b);
        } else {
            ctx.moveTo(-c, 0); ctx.lineTo(-b, -a); ctx.lineTo(-b, -b);
            ctx.lineTo(b, -b); ctx.lineTo(b, -a); ctx.lineTo(c, 0);
            ctx.lineTo(b, a); ctx.lineTo(b, b); ctx.lineTo(-b, b); ctx.lineTo(-b, a);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1 * scale; ctx.stroke();
        ctx.restore();
    },

    drawObstacleFlourish(ctx, kind, x, y, scale, color) {
        ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.globalAlpha = 0.9;
        switch (kind) {
            case "glyph":
                ctx.lineWidth = 1.6 * scale;
                ctx.beginPath(); ctx.arc(0, 0, 9 * scale, 0, Math.PI * 1.5); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-5 * scale, -5 * scale); ctx.lineTo(5 * scale, 5 * scale); ctx.stroke();
                break;
            case "vine":
                ctx.lineWidth = 2 * scale;
                ctx.beginPath(); ctx.moveTo(-8 * scale, 6 * scale); ctx.quadraticCurveTo(0, -8 * scale, 8 * scale, 6 * scale); ctx.stroke();
                ctx.beginPath(); ctx.ellipse(-6 * scale, 4 * scale, 3 * scale, 2 * scale, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(6 * scale, 4 * scale, 3 * scale, 2 * scale, 0, 0, Math.PI * 2); ctx.fill();
                break;
            case "barnacle":
                [[-6, -2], [0, 3], [6, -1]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx * scale, dy * scale, 2.4 * scale, 0, Math.PI * 2); ctx.fill(); });
                break;
            case "sparkle":
                this.drawStarShape(ctx, 0, 0, 6 * scale);
                this.drawStarShape(ctx, 10 * scale, -6 * scale, 3 * scale);
                break;
            case "crystal":
                ctx.beginPath(); ctx.moveTo(0, -8 * scale); ctx.lineTo(5 * scale, 0); ctx.lineTo(0, 8 * scale); ctx.lineTo(-5 * scale, 0); ctx.closePath(); ctx.fill();
                break;
            default: break;
        }
        ctx.restore();
    },

    // proj = {x,y,scale} đã tính sẵn từ pkm_race.js (project()/renderProjFor())
    drawObstacle(ctx, proj, obj, state) {
        const zone = this.zoneAt(state.zoneIndex);
        switch (obj.type) {
            case "spike": return this._obsSpike(ctx, proj, obj, zone);
            case "chasm": return this._obsChasm(ctx, proj, obj, zone);
            case "swarm": return this._obsSwarm(ctx, proj, obj, zone);
            case "branch": return this._obsBranch(ctx, proj, obj, zone);
            case "pendulum": return this._obsPendulum(ctx, proj, obj, zone);
            case "rock":
            default: return this._obsRock(ctx, proj, obj, zone);
        }
    },

    _obsRock(ctx, proj, obj, zone) {
        const spanW = obj.spanAll ? (300 * proj.scale) : (96 * proj.scale);
        const h = 84 * proj.scale;
        ctx.save(); ctx.translate(proj.x, proj.y);
        this.drawGroundShadow(ctx, spanW * 0.55, 30 * proj.scale, 24 * proj.scale);
        const grad = ctx.createLinearGradient(-spanW / 2, -h, spanW / 2, 0);
        grad.addColorStop(0, "#9d9cae"); grad.addColorStop(0.5, "#666578"); grad.addColorStop(1, "#403f4e");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-spanW * 0.5, 4); ctx.lineTo(-spanW * 0.38, -h * 0.65); ctx.lineTo(-spanW * 0.12, -h);
        ctx.lineTo(spanW * 0.2, -h * 0.82); ctx.lineTo(spanW * 0.48, -h * 0.25); ctx.lineTo(spanW * 0.5, 6);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = zone.obstacleAccent; ctx.globalAlpha = 0.55; ctx.lineWidth = 2.4 * proj.scale; ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1.6; ctx.stroke();
        this.drawObstacleFlourish(ctx, zone.obstacleFlourish, 0, -h * 0.55, proj.scale * 1.15, zone.obstacleAccent);
        this.drawCueIcon(ctx, "jump", 0, -h - 44 * proj.scale, proj.scale, zone.obstacleAccent);
        this.drawActionLabel(ctx, "⤒ NHẢY", 0, -h - 10 * proj.scale, proj.scale, zone.obstacleAccent);
        ctx.restore();
    },

    _obsSpike(ctx, proj, obj, zone) {
        const spanW = obj.spanAll ? (300 * proj.scale) : (90 * proj.scale);
        const h = 76 * proj.scale;
        const spikeCount = obj.spanAll ? 7 : 3;
        const spikeW = spanW / spikeCount;
        ctx.save(); ctx.translate(proj.x, proj.y);
        this.drawGroundShadow(ctx, spanW * 0.55, 26 * proj.scale, 14 * proj.scale);
        ctx.fillStyle = "#2c2a38"; ctx.fillRect(-spanW / 2, -12 * proj.scale, spanW, 16 * proj.scale);
        for (let i = 0; i < spikeCount; i++) {
            const cx = -spanW / 2 + spikeW * (i + 0.5);
            const grad = ctx.createLinearGradient(cx, -h, cx, 0);
            grad.addColorStop(0, "#ffffff"); grad.addColorStop(0.5, "#aeaebc"); grad.addColorStop(1, "#4a4a58");
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.moveTo(cx - spikeW * 0.34, 0); ctx.lineTo(cx, -h); ctx.lineTo(cx + spikeW * 0.34, 0); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1; ctx.stroke();
        }
        const pulse = 0.5 + 0.5 * Math.sin((obj.spin || 0) * 3);
        ctx.fillStyle = `rgba(255,60,60,${0.35 + pulse * 0.5})`;
        ctx.beginPath(); ctx.arc(0, -8 * proj.scale, 6 * proj.scale, 0, Math.PI * 2); ctx.fill();
        this.drawObstacleFlourish(ctx, zone.obstacleFlourish, 0, -h * 0.5, proj.scale * 1.15, zone.obstacleAccent);
        this.drawCueIcon(ctx, "jump", 0, -h - 46 * proj.scale, proj.scale, zone.obstacleAccent);
        this.drawActionLabel(ctx, "⤒ NHẢY", 0, -h - 12 * proj.scale, proj.scale, zone.obstacleAccent);
        ctx.restore();
    },

    _obsChasm(ctx, proj, obj, zone) {
        const spanW = obj.spanAll ? (300 * proj.scale) : (108 * proj.scale);
        const depth = 38 * proj.scale;
        ctx.save(); ctx.translate(proj.x, proj.y);
        ctx.fillStyle = "#0c0814";
        ctx.beginPath(); ctx.ellipse(0, 8 * proj.scale, spanW * 0.55, depth, 0, 0, Math.PI * 2); ctx.fill();
        const grad = ctx.createRadialGradient(0, 8 * proj.scale, 4, 0, 8 * proj.scale, spanW * 0.5);
        grad.addColorStop(0, zone.obstacleAccent); grad.addColorStop(0.55, "rgba(255,80,20,0.4)"); grad.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(0, 8 * proj.scale, spanW * 0.46, depth * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = zone.obstacleAccent; ctx.lineWidth = 2.6 * proj.scale; ctx.globalAlpha = 0.75;
        ctx.shadowColor = zone.obstacleAccent; ctx.shadowBlur = 10 * proj.scale;
        ctx.beginPath(); ctx.ellipse(0, 8 * proj.scale, spanW * 0.55, depth, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        this.drawCueIcon(ctx, "jump", 0, -56 * proj.scale, proj.scale, zone.obstacleAccent);
        this.drawActionLabel(ctx, "⤒ NHẢY", 0, -20 * proj.scale, proj.scale, zone.obstacleAccent);
        ctx.restore();
    },

    _obsBranch(ctx, proj, obj, zone) {
        const spanW = obj.spanAll ? (300 * proj.scale) : (96 * proj.scale);
        const h = 40 * proj.scale, yTop = -128 * proj.scale;
        ctx.save(); ctx.translate(proj.x, proj.y);
        this.drawGroundShadow(ctx, spanW * 0.55, 30 * proj.scale, 24 * proj.scale);
        const grad = ctx.createLinearGradient(0, yTop, 0, yTop + h);
        grad.addColorStop(0, "#c48a3f"); grad.addColorStop(1, "#7a4e1e");
        ctx.fillStyle = grad; ctx.fillRect(-spanW / 2, yTop, spanW, h);
        ctx.strokeStyle = zone.obstacleAccent; ctx.globalAlpha = 0.5; ctx.lineWidth = 2.2; ctx.strokeRect(-spanW / 2, yTop, spanW, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1.6; ctx.strokeRect(-spanW / 2, yTop, spanW, h);
        ctx.fillStyle = "#4aa85a";
        ctx.beginPath(); ctx.ellipse(-spanW / 2 + 10, yTop, 18 * proj.scale, 11 * proj.scale, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(spanW / 2 - 10, yTop + h, 18 * proj.scale, 11 * proj.scale, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#4a2f12";
        ctx.fillRect(-spanW / 2 + 4, yTop + h, 10 * proj.scale, 130 * proj.scale);
        ctx.fillRect(spanW / 2 - 14, yTop + h, 10 * proj.scale, 130 * proj.scale);
        this.drawObstacleFlourish(ctx, zone.obstacleFlourish, 0, yTop + h * 0.5, proj.scale * 1.15, zone.obstacleAccent);
        this.drawCueIcon(ctx, "slide", 0, yTop - 42 * proj.scale, proj.scale, zone.obstacleAccent);
        this.drawActionLabel(ctx, "⤓ TRƯỢT", 0, yTop - 10 * proj.scale, proj.scale, zone.obstacleAccent);
        ctx.restore();
    },

    _obsSwarm(ctx, proj, obj, zone) {
        const spanW = obj.spanAll ? (300 * proj.scale) : (100 * proj.scale);
        const yTop = -148 * proj.scale;
        const spin = obj.spin || 0, flap = Math.sin(spin * 3);
        ctx.save(); ctx.translate(proj.x, proj.y);
        this.drawGroundShadow(ctx, spanW * 0.42, 18 * proj.scale, 10 * proj.scale, 0.26);
        const count = obj.spanAll ? 5 : 3;
        for (let i = 0; i < count; i++) {
            const cx = -spanW / 2 + (spanW / Math.max(1, count - 1)) * i;
            const cy = yTop + Math.sin(spin + i * 1.7) * 10 * proj.scale;
            ctx.save(); ctx.translate(cx, cy); ctx.scale(1.25, 1.25);
            ctx.fillStyle = "#6a4a95";
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-16 * proj.scale, -6 * proj.scale - flap * 9 * proj.scale); ctx.lineTo(-4 * proj.scale, 3 * proj.scale); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16 * proj.scale, -6 * proj.scale - flap * 9 * proj.scale); ctx.lineTo(4 * proj.scale, 3 * proj.scale); ctx.closePath(); ctx.fill();
            ctx.fillStyle = "#3a2a55"; ctx.beginPath(); ctx.ellipse(0, 0, 9 * proj.scale, 7 * proj.scale, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = zone.obstacleAccent;
            ctx.beginPath(); ctx.arc(-2.4 * proj.scale, -1 * proj.scale, 1.8 * proj.scale, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(2.4 * proj.scale, -1 * proj.scale, 1.8 * proj.scale, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
        this.drawCueIcon(ctx, "slide", 0, yTop - 44 * proj.scale, proj.scale, zone.obstacleAccent);
        this.drawActionLabel(ctx, "⤓ TRƯỢT", 0, yTop - 10 * proj.scale, proj.scale, zone.obstacleAccent);
        ctx.restore();
    },

    _obsPendulum(ctx, proj, obj, zone) {
        const spanW = obj.spanAll ? (300 * proj.scale) : (110 * proj.scale);
        const swing = Math.sin((obj.spin || 0) * 1.4) * 0.55;
        ctx.save(); ctx.translate(proj.x, proj.y);
        this.drawGroundShadow(ctx, spanW * 0.4, 22 * proj.scale, 12 * proj.scale, 0.32);
        const beamY = -190 * proj.scale;
        ctx.fillStyle = "#3a2c20"; ctx.fillRect(-spanW / 2, beamY - 9 * proj.scale, spanW, 11 * proj.scale);
        ctx.strokeStyle = zone.obstacleAccent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.6;
        ctx.strokeRect(-spanW / 2, beamY - 9 * proj.scale, spanW, 11 * proj.scale);
        ctx.globalAlpha = 1;
        const armLen = 148 * proj.scale;
        const bladeX = Math.sin(swing) * armLen, bladeY = beamY + Math.cos(swing) * armLen;
        ctx.strokeStyle = "#9a9aa4"; ctx.lineWidth = 3.4 * proj.scale;
        ctx.beginPath(); ctx.moveTo(0, beamY); ctx.lineTo(bladeX, bladeY); ctx.stroke();
        ctx.save(); ctx.translate(bladeX, bladeY); ctx.rotate(swing);
        const grad = ctx.createLinearGradient(-40 * proj.scale, 0, 40 * proj.scale, 0);
        grad.addColorStop(0, "#ffffff"); grad.addColorStop(0.5, "#bcc2d0"); grad.addColorStop(1, "#666e80");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(-40 * proj.scale, -7 * proj.scale); ctx.lineTo(40 * proj.scale, -7 * proj.scale); ctx.lineTo(0, 36 * proj.scale); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = zone.obstacleAccent; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        this.drawCueIcon(ctx, "jump", 0, beamY - 44 * proj.scale, proj.scale, zone.obstacleAccent);
        this.drawActionLabel(ctx, "⤒ NHẢY", 0, beamY - 12 * proj.scale, proj.scale, zone.obstacleAccent);
        ctx.restore();
    },

    // proj cho wall/portal cần chiếu RIÊNG từng làn -> pkm_race.js phải
    // truyền hàm renderProjFor(lane,t) đã có sẵn qua state.renderProjFor.
    drawWallGap(ctx, obj, state) {
        const zone = this.zoneAt(state.zoneIndex);
        const sc = zone.structureColor || ["#5a4a7a", "#3a2c58", "#241a3d"];
        (obj.blockedLanes || []).forEach((lane) => {
            const proj = state.renderProjFor(lane, obj.t);
            const w = 165 * proj.scale, h = 178 * proj.scale;
            ctx.save(); ctx.translate(proj.x, proj.y);
            this.drawGroundShadow(ctx, w * 0.5, 26 * proj.scale, 24 * proj.scale);
            const grad = ctx.createLinearGradient(-w / 2, -h, w / 2, 0);
            grad.addColorStop(0, sc[0]); grad.addColorStop(0.5, sc[1]); grad.addColorStop(1, sc[2]);
            ctx.fillStyle = grad; ctx.fillRect(-w / 2, -h, w, h);
            ctx.strokeStyle = zone.obstacleAccent; ctx.globalAlpha = 0.6; ctx.lineWidth = 2.4; ctx.strokeRect(-w / 2, -h, w, h);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1.5;
            for (let row = 1; row < 4; row++) { ctx.beginPath(); ctx.moveTo(-w / 2, -h + (h / 4) * row); ctx.lineTo(w / 2, -h + (h / 4) * row); ctx.stroke(); }
            this.drawObstacleFlourish(ctx, zone.obstacleFlourish, 0, -h * 0.5, proj.scale * 1.15, zone.obstacleAccent);
            ctx.restore();
        });
        const freeLane = [-1, 0, 1].find((l) => !(obj.blockedLanes || []).includes(l));
        const lp = state.renderProjFor(freeLane != null ? freeLane : 0, obj.t);
        this.drawCueIcon(ctx, "dodge", lp.x, lp.y - 200 * lp.scale, lp.scale, zone.obstacleAccent);
        this.drawActionLabel(ctx, "↔ ĐỔI LÀN", lp.x, lp.y - 168 * lp.scale, lp.scale, zone.obstacleAccent);
    },

    drawPortal(ctx, obj, state) {
        const nextZone = this.zoneAt(obj.nextIndex);
        const proj = state.renderProjFor(0, obj.t);
        const halfW = (state.LANE_OFFSET_BOTTOM * 1.6 + 60) * proj.scale;
        const archH = 260 * proj.scale;
        ctx.save(); ctx.translate(proj.x, proj.y);
        ctx.fillStyle = "rgba(20,16,32,0.9)";
        ctx.fillRect(-halfW, -archH, 22 * proj.scale, archH);
        ctx.fillRect(halfW - 22 * proj.scale, -archH, 22 * proj.scale, archH);
        const glowAlpha = 0.55 + 0.25 * Math.sin(obj.spin || 0);
        ctx.strokeStyle = nextZone.portalColor; ctx.lineWidth = 10 * proj.scale; ctx.globalAlpha = glowAlpha;
        ctx.beginPath();
        ctx.moveTo(-halfW, 0); ctx.lineTo(-halfW, -archH);
        ctx.quadraticCurveTo(0, -archH - 70 * proj.scale, halfW, -archH);
        ctx.lineTo(halfW, 0); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(-halfW + 22 * proj.scale, 0); ctx.lineTo(-halfW + 22 * proj.scale, -archH);
        ctx.quadraticCurveTo(0, -archH - 60 * proj.scale, halfW - 22 * proj.scale, -archH);
        ctx.lineTo(halfW - 22 * proj.scale, 0); ctx.closePath(); ctx.clip();
        const swirl = ctx.createRadialGradient(0, -archH * 0.5, 4, 0, -archH * 0.5, halfW);
        swirl.addColorStop(0, nextZone.portalColor); swirl.addColorStop(0.6, "rgba(255,255,255,0.15)"); swirl.addColorStop(1, "rgba(0,0,0,0.35)");
        ctx.globalAlpha = 0.5; ctx.fillStyle = swirl;
        ctx.fillRect(-halfW, -archH - 70 * proj.scale, halfW * 2, archH + 70 * proj.scale);
        ctx.restore();
        this.drawActionLabel(ctx, `➜ ${nextZone.label}`, 0, -archH - 84 * proj.scale, proj.scale, nextZone.portalColor);
        ctx.restore();
    },
};

/**
 * ============================================================================
 * GHI CHÚ TÍCH HỢP VÀO pkm_race.js (không bắt buộc làm ngay):
 * 1. Thêm <script src="pkm_race_background.js"></script> TRƯỚC <script src="pkm_race.js">.
 * 2. Trong resize()/changeZone(): gọi RaceBackground.rebuildGradients(ctx, state)
 *    thay cho buildCachedGradients() cũ.
 * 3. Trong drawScene(): gọi RaceBackground.drawSky(ctx,state) rồi
 *    RaceBackground.drawGroundFill(ctx,state) rồi RaceBackground.drawRoad(ctx,state)
 *    (thứ tự này QUAN TRỌNG để nền lấp đầy trước, đường đè lên sau).
 * 4. project(lane,t): sau khi tính x theo lane như cũ, cộng thêm
 *    RaceBackground.pathOffsetX(RaceBackground.zoneAt(zoneIndex), t, distance)
 *    và cộng offsetY tương tự vào y — để nhân vật/obstacle bám đúng đường cong.
 * 5. state truyền vào mọi hàm = {VW,VH,HORIZON_Y,ROAD_BOTTOM_Y,
 *    LANE_OFFSET_BOTTOM,LANE_OFFSET_TOP,distance,zoneIndex,renderProjFor}.
 * ============================================================================
 */