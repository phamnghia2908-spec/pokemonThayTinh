/**
 * ============================================================================
 * POKÉMON BIRD SHOOT — BACKGROUND MODULE (hình ảnh: nền, chim, cối xay gió,
 * khinh khí cầu)
 * ============================================================================
 * File RIÊNG chỉ lo phần VẼ — pkm_birdshoot.js (KHÔNG sửa lại ở đây) gọi
 * đúng các hàm dưới đây theo API đã chốt sẵn trong comment đầu pkm_birdshoot.js:
 *
 *   BirdShootBackground.preload()
 *   BirdShootBackground.rebuildGradients(ctx, state)
 *   BirdShootBackground.drawBackground(ctx, state)
 *   BirdShootBackground.drawBird(ctx, obj, state)
 *   BirdShootBackground.drawWindmill(ctx, obj, state)
 *   BirdShootBackground.drawBalloon(ctx, obj, state)
 *   BirdShootBackground.drawScarecrow(ctx, obj, state)
 *   BirdShootBackground.drawGiftBag(ctx, obj, state)         // obj xem spawnGiftBag()
 *   BirdShootBackground.drawWeaponViewmodel(ctx, state)      // súng hiện tại, hiện đáy màn hình
 *   BirdShootBackground.drawScopeOverlay(ctx, state)         // chỉ vẽ khi state.aiming && state.requiresScope
 *
 * state (từ shootState() bên pkm_birdshoot.js) = { VW, VH, level, speedMul,
 * tNow, weaponId, weaponName, aimAngle, recoilAmt, aiming, requiresScope,
 * ammo, maxAmmo, reloading, pivot }.
 *
 * QUAN TRỌNG — ĐỒNG BỘ VIEWMODEL SÚNG: pkm_birdshoot.js tính tia lửa đầu
 * nòng (muzzleTipPos()) bằng CÔNG THỨC:
 *   pivot = state.pivot = {x: VW/2, y: VH*1.02}
 *   tip   = {x: pivot.x + sin(aimAngle)*barrelLen, y: pivot.y - cos(aimAngle)*barrelLen}
 * (barrelLen lấy từ WEAPON_DEFS[weaponId].barrelLen bên pkm_birdshoot.js).
 * drawWeaponViewmodel() bên dưới vẽ mỗi súng trong hệ toạ độ ĐÃ translate
 * tới pivot + rotate theo aimAngle — nghĩa là ĐIỂM ĐẦU NÒNG của mỗi hình vẽ
 * PHẢI nằm đúng tại local y = -barrelLen (trước khi transform) để tia lửa
 * hiện đúng chỗ đầu nòng chứ không lơ lửng giữa không khí. barrelLen của
 * từng súng (đơn vị ảo, khớp _gunXxx() bên dưới): pistol 120, rifle 200,
 * shotgun 170, sniper 210, smg 140, revolver 110, crossbow 150, grenade 160,
 * blunderbuss 180, silenced 150.
 *
 * QUAN TRỌNG — ĐỒNG BỘ VỊ TRÍ NÓN/THÂN BÙ NHÌN: pkm_birdshoot.js hit-test
 * bằng scarecrowHatPos(sc) = {x: sc.x, y: sc.y - 96*sc.scale} và
 * scarecrowBodyPos(sc) = {x: sc.x, y: sc.y - 30*sc.scale}. drawScarecrow()
 * bên dưới PHẢI vẽ nón/thân đúng 2 toạ độ này (tính từ obj.x/obj.y gốc ở
 * CHÂN bù nhìn) — lệch offset là vùng bắn trúng sẽ không khớp hình vẽ.
 *
 * QUAN TRỌNG — ĐỒNG BỘ VỊ TRÍ CÁNH CỐI XAY GIÓ: pkm_birdshoot.js hit-test
 * bắn trúng cánh bằng windmillBladeTipPos(w, index) với công thức:
 *   angle = w.rotAngle + index * (2π/5)
 *   r     = w.bladeLen * 0.66 * w.scale
 * Hàm _bladeCenter() bên dưới PHẢI dùng ĐÚNG công thức này (chỉ khác là vẽ
 * cả thân cánh từ trục ra tới r = bladeLen*scale, không chỉ điểm tâm) —
 * nếu đổi 1 trong 2 bên mà không đổi bên kia thì vùng bắn trúng sẽ bị lệch
 * khỏi hình vẽ.
 *
 * Chim KHÔNG dùng ảnh sprite rời — vẽ bằng canvas path (giống phong cách
 * pkm_race_background.js vẽ chướng ngại vật/vật trang trí), vừa nhẹ vừa dễ
 * đổi màu theo species mà không cần thêm ảnh.
 * ============================================================================
 */

window.BirdShootBackground = {
    // Ảnh nền đồng quê do người dùng cung cấp — tải 1 lần, cache lại, dùng
    // kiểu "cover" (phủ kín khung, cắt bớt dư ra) cho mọi tỉ lệ màn hình.
    IMG_URL: "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/banchim1.png",
    _bgImg: null,
    _bgLoaded: false,
    _bgFailed: false,

    preload() {
        if (this._bgImg) return;
        this._bgImg = new Image();
        this._bgImg.crossOrigin = "anonymous";
        this._bgImg.onload = () => { this._bgLoaded = true; };
        this._bgImg.onerror = () => {
            this._bgFailed = true;
            console.warn("⚠️ [BirdShootBackground] Không tải được ảnh nền, dùng gradient dự phòng:", this.IMG_URL);
        };
        this._bgImg.src = this.IMG_URL;
    },

    // ═══════════════════════════════════════════════════════════
    // GRADIENT DỰ PHÒNG (khi ảnh chưa tải xong / lỗi) + LỚP VIGNETTE
    // ═══════════════════════════════════════════════════════════
    _gradCache: null,

    rebuildGradients(ctx, state) {
        const sky = ctx.createLinearGradient(0, 0, 0, state.VH);
        sky.addColorStop(0, "#5fa8d8");
        sky.addColorStop(0.5, "#bfe0ae");
        sky.addColorStop(0.68, "#e8d998");
        sky.addColorStop(1, "#c7a955");

        const vign = ctx.createRadialGradient(state.VW / 2, state.VH * 0.4, state.VH * 0.32, state.VW / 2, state.VH * 0.4, state.VH * 0.82);
        vign.addColorStop(0, "rgba(0,0,0,0)");
        vign.addColorStop(1, "rgba(0,0,0,0.32)");

        this._gradCache = { sky, vign };
        return this._gradCache;
    },

    // ═══════════════════════════════════════════════════════════
    // NỀN — ảnh đồng quê phủ "cover" kín khung hình ảo
    // ═══════════════════════════════════════════════════════════
    drawBackground(ctx, state) {
        const g = this._gradCache || this.rebuildGradients(ctx, state);

        if (this._bgLoaded && this._bgImg && this._bgImg.naturalWidth > 0) {
            this._drawCover(ctx, this._bgImg, state.VW, state.VH);
        } else {
            ctx.fillStyle = g.sky;
            ctx.fillRect(0, 0, state.VW, state.VH);
        }

        ctx.fillStyle = g.vign;
        ctx.fillRect(0, 0, state.VW, state.VH);
    },

    // Vẽ ảnh phủ kín khung theo kiểu "background-size: cover" (giữ tỉ lệ,
    // scale theo cạnh lớn hơn, cắt bớt phần dư 2 bên/trên-dưới).
    _drawCover(ctx, img, vw, vh) {
        const iw = img.naturalWidth, ih = img.naturalHeight;
        const scale = Math.max(vw / iw, vh / ih);
        const dw = iw * scale, dh = ih * scale;
        const dx = (vw - dw) / 2, dy = (vh - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
    },

    // ═══════════════════════════════════════════════════════════
    // BẢNG MÀU 3 GIỐNG CHIM
    // ═══════════════════════════════════════════════════════════
    BIRD_PALETTE: {
        brown: { body: "#8a5a2e", body2: "#5e3a1a", belly: "#e8c98a", wing: "#6b451f", beak: "#ffb339", comb: "#c0392b" },
        red: { body: "#c0392b", body2: "#7a2015", belly: "#ffdca8", wing: "#8f2a1e", beak: "#ffb339", comb: "#7a2015" },
        white: { body: "#f2f2f2", body2: "#c7c7c7", belly: "#fff8e0", wing: "#d8d8d8", beak: "#ff9f1c", comb: "#e74c3c" },
    },

    // ═══════════════════════════════════════════════════════════
    // CHIM — vẽ bằng canvas path, quay đầu theo hướng bay, đập cánh theo
    // obj.flapPhase, độ nghiêng theo obj.rot (đã tính sẵn ở pkm_birdshoot.js)
    // ═══════════════════════════════════════════════════════════
    drawBird(ctx, obj, state) {
        const pal = this.BIRD_PALETTE[obj.species] || this.BIRD_PALETTE.brown;
        const s = obj.scale;
        const dir = obj.vx < 0 ? -1 : 1; // mặc định quay phải nếu chưa di chuyển
        const flap = Math.sin(obj.flapPhase); // -1..1

        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(obj.rot || 0);
        ctx.scale(dir * s, s);

        // bóng mờ phía dưới (giúp cảm nhận độ cao dù không có mặt đất ngay dưới)
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.ellipse(0, 34, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // cánh SAU (xa camera hơn) — vẽ trước để cánh trước đè lên
        ctx.fillStyle = pal.wing;
        ctx.save();
        ctx.translate(-4, 2);
        ctx.rotate(-0.4 + flap * 0.55);
        ctx.beginPath(); ctx.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // đuôi
        ctx.fillStyle = pal.body2;
        ctx.beginPath();
        ctx.moveTo(-20, -2); ctx.lineTo(-38, -14); ctx.lineTo(-30, 2); ctx.lineTo(-38, 10); ctx.lineTo(-18, 6);
        ctx.closePath(); ctx.fill();

        // thân
        const bodyGrad = ctx.createLinearGradient(-20, -18, 20, 18);
        bodyGrad.addColorStop(0, pal.body); bodyGrad.addColorStop(1, pal.body2);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath(); ctx.ellipse(0, 0, 24, 17, 0, 0, Math.PI * 2); ctx.fill();

        // bụng sáng màu
        ctx.fillStyle = pal.belly;
        ctx.beginPath(); ctx.ellipse(2, 6, 15, 9, 0, 0, Math.PI * 2); ctx.fill();

        // đầu
        ctx.fillStyle = pal.body;
        ctx.beginPath(); ctx.arc(20, -10, 11, 0, Math.PI * 2); ctx.fill();

        // mào đỏ
        ctx.fillStyle = pal.comb;
        ctx.beginPath();
        ctx.moveTo(16, -19); ctx.lineTo(19, -26); ctx.lineTo(22, -19);
        ctx.lineTo(25, -25); ctx.lineTo(27, -18); ctx.closePath(); ctx.fill();

        // mỏ
        ctx.fillStyle = pal.beak;
        ctx.beginPath(); ctx.moveTo(29, -10); ctx.lineTo(38, -7); ctx.lineTo(29, -4); ctx.closePath(); ctx.fill();

        // mắt
        ctx.fillStyle = "#1a1410";
        ctx.beginPath(); ctx.arc(24, -12, 2.2, 0, Math.PI * 2); ctx.fill();

        // cánh TRƯỚC (gần camera hơn) — đập theo nhịp bay
        ctx.fillStyle = pal.wing;
        ctx.save();
        ctx.translate(-2, -1);
        ctx.rotate(-0.2 - flap * 0.7);
        ctx.beginPath(); ctx.ellipse(0, 0, 24, 11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();

        // chân (chỉ lộ rõ khi bay ngang thong thả, không quá quan trọng)
        ctx.strokeStyle = pal.beak; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-2, 15); ctx.lineTo(-4, 26); ctx.moveTo(6, 15); ctx.lineTo(8, 26); ctx.stroke();

        ctx.restore();
    },

    // ═══════════════════════════════════════════════════════════
    // CỐI XAY GIÓ — 5 cánh, mỗi cánh check obj.blades[i].alive để vẽ hoặc
    // bỏ qua (đã bị bắn gãy). Công thức góc PHẢI khớp windmillBladeTipPos()
    // trong pkm_birdshoot.js (xem ghi chú đầu file).
    // ═══════════════════════════════════════════════════════════
    _bladeAngle(w, index) {
        return w.rotAngle + index * ((Math.PI * 2) / 5);
    },

    drawWindmill(ctx, obj, state) {
        const s = obj.scale;
        const fadeAlpha = obj.destroyed ? Math.max(0, 1 - obj.despawnT / 0.6) : 1;

        ctx.save();
        ctx.globalAlpha = fadeAlpha;
        ctx.translate(obj.x, obj.y);

        // tháp gỗ đỡ cối xay — neo xuống dưới để trông như gắn vào mặt đất/đồi
        const towerH = 210 * s, towerW = 46 * s;
        const towerGrad = ctx.createLinearGradient(-towerW / 2, 0, towerW / 2, towerH);
        towerGrad.addColorStop(0, "#8a6a48"); towerGrad.addColorStop(1, "#5a3f26");
        ctx.fillStyle = towerGrad;
        ctx.beginPath();
        ctx.moveTo(-towerW * 0.32, 0); ctx.lineTo(towerW * 0.32, 0);
        ctx.lineTo(towerW * 0.5, towerH); ctx.lineTo(-towerW * 0.5, towerH);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1.5; ctx.stroke();
        // thanh chống chéo trang trí
        ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo(-towerW * 0.4, towerH * 0.25); ctx.lineTo(towerW * 0.4, towerH * 0.7);
        ctx.moveTo(towerW * 0.4, towerH * 0.25); ctx.lineTo(-towerW * 0.4, towerH * 0.7);
        ctx.stroke();
        // mái nhỏ chỏm trên đỉnh tháp
        ctx.fillStyle = "#4a2f1c";
        ctx.beginPath(); ctx.moveTo(-14 * s, 0); ctx.lineTo(0, -16 * s); ctx.lineTo(14 * s, 0); ctx.closePath(); ctx.fill();

        // trục giữa (hub)
        const hubR = 13 * s;
        ctx.fillStyle = "#3a2a1c";
        ctx.beginPath(); ctx.arc(0, 0, hubR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,203,5,0.7)"; ctx.lineWidth = 2; ctx.stroke();

        // 5 cánh
        obj.blades.forEach((blade, i) => {
            const angle = this._bladeAngle(obj, i);
            if (!blade.alive) {
                // cánh đã bị bắn gãy — chỉ còn 1 mẩu cụt gần trục + vài mảnh vỡ bay quanh
                ctx.save();
                ctx.rotate(angle);
                ctx.fillStyle = "#5a4530";
                ctx.beginPath();
                ctx.moveTo(hubR, -6 * s); ctx.lineTo(hubR + 16 * s, -4 * s);
                ctx.lineTo(hubR + 16 * s, 4 * s); ctx.lineTo(hubR, 6 * s);
                ctx.closePath(); ctx.fill();
                ctx.restore();
                return;
            }
            ctx.save();
            ctx.rotate(angle);
            const bladeLen = obj.bladeLen * s;
            const grad = ctx.createLinearGradient(hubR, 0, bladeLen, 0);
            grad.addColorStop(0, "#e8dcc0"); grad.addColorStop(1, "#b89a68");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(hubR, -9 * s);
            ctx.lineTo(bladeLen, -16 * s);
            ctx.lineTo(bladeLen + 8 * s, 0);
            ctx.lineTo(bladeLen, 16 * s);
            ctx.lineTo(hubR, 9 * s);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "rgba(90,60,20,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
            // sọc vải trang trí trên cánh
            ctx.strokeStyle = "rgba(122,32,21,0.55)"; ctx.lineWidth = 2 * s;
            for (let k = 1; k <= 3; k++) {
                const lx = hubR + (bladeLen - hubR) * (k / 4);
                ctx.beginPath(); ctx.moveTo(lx, -12 * s * (1 - k / 5)); ctx.lineTo(lx, 12 * s * (1 - k / 5)); ctx.stroke();
            }
            ctx.restore();
        });

        // chốt trục nổi lên trên cùng
        ctx.fillStyle = "#ffcb05"; ctx.globalAlpha = fadeAlpha * 0.9;
        ctx.beginPath(); ctx.arc(0, 0, 4 * s, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    },

    // ═══════════════════════════════════════════════════════════
    // KHINH KHÍ CẦU — mục tiêu cần TRÁNH, tô màu cảnh báo sọc đỏ/trắng để
    // dễ phân biệt với chim ngay từ xa.
    // ═══════════════════════════════════════════════════════════
    WEAPON_ICONS: {
        pistol: "🔫", rifle: "🎯", shotgun: "💥", sniper: "🔭", smg: "⚡",
        revolver: "🎡", crossbow: "🏹", grenade: "💣", blunderbuss: "📯", silenced: "🔇",
    },
    drawBalloon(ctx, obj, state) {
        const s = obj.scale;
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.scale(s, s);

        // dây neo + giỏ
        ctx.strokeStyle = "rgba(60,40,20,0.7)"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-14, 46); ctx.lineTo(-9, 62); ctx.moveTo(14, 46); ctx.lineTo(9, 62); ctx.stroke();
        ctx.fillStyle = "#6b4a2c";
        ctx.fillRect(-12, 62, 24, 16);
        ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1; ctx.strokeRect(-12, 62, 24, 16);

        // thân khinh khí cầu — sọc đỏ trắng cảnh báo
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, 0, 42, 54, 0, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = "#f2f2f2"; ctx.fillRect(-50, -60, 100, 120);
        ctx.fillStyle = "#e74c3c";
        for (let i = -4; i <= 4; i += 2) ctx.fillRect(i * 10 - 5, -60, 10, 120);
        ctx.restore();
        ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 42, 54, 0, 0, Math.PI * 2); ctx.stroke();

        // ánh sáng nhẹ phía trên tạo khối tròn
        const shine = ctx.createRadialGradient(-14, -22, 4, -14, -22, 40);
        shine.addColorStop(0, "rgba(255,255,255,0.55)"); shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine;
        ctx.beginPath(); ctx.ellipse(0, 0, 42, 54, 0, 0, Math.PI * 2); ctx.fill();

        // dấu chấm than cảnh báo nhỏ trên thân
        // badge tròn vàng lộ icon súng đang mang
        const pulse = 0.85 + 0.15 * Math.sin((state.tNow || 0) * 3);
        ctx.save(); ctx.scale(pulse, pulse);
        ctx.fillStyle = "#ffcb05";
        ctx.beginPath(); ctx.arc(0, 8, 15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(this.WEAPON_ICONS[obj.carriedWeaponId] || "🔫", 0, 9);
        ctx.restore();

        ctx.restore();
    },

    // ═══════════════════════════════════════════════════════════
    // BÙ NHÌN ĐỘI NÓN — obj.x/obj.y là toạ độ CHÂN bù nhìn (đứng trên mặt
    // đất). Nón vẽ ở offset y=-96*scale, thân ở offset y=-30*scale — PHẢI
    // khớp scarecrowHatPos()/scarecrowBodyPos() trong pkm_birdshoot.js.
    // obj.hatAlive=false -> chỉ còn đầu trọc (đã mất "nhiệm vụ" -> đang fade).
    // ═══════════════════════════════════════════════════════════
    drawScarecrow(ctx, obj, state) {
        const s = obj.scale;
        const fadeAlpha = obj.destroyed ? Math.max(0, 1 - obj.despawnT / 0.6) : 1;
        const sway = Math.sin(obj.swayPhase * 1.4) * 0.06;

        ctx.save();
        ctx.globalAlpha = fadeAlpha;
        ctx.translate(obj.x, obj.y);

        // bóng đổ dưới chân
        ctx.save();
        ctx.globalAlpha = fadeAlpha * 0.22;
        ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.ellipse(0, 4, 34 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        ctx.rotate(sway);

        // cọc gỗ cắm đất
        ctx.strokeStyle = "#6b4a2c"; ctx.lineWidth = 8 * s;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -20 * s); ctx.stroke();

        // 2 chân quần vá
        ctx.fillStyle = "#5a4530";
        ctx.fillRect(-14 * s, -46 * s, 10 * s, 46 * s);
        ctx.fillRect(4 * s, -46 * s, 10 * s, 46 * s);

        // thân áo sơ mi ca-rô — VÙNG "THÂN" tính điểm phạt (quanh y=-30*s)
        const shirtGrad = ctx.createLinearGradient(-24 * s, -80 * s, 24 * s, -30 * s);
        shirtGrad.addColorStop(0, "#c0392b"); shirtGrad.addColorStop(1, "#8a2418");
        ctx.fillStyle = shirtGrad;
        ctx.beginPath();
        ctx.moveTo(-22 * s, -46 * s); ctx.lineTo(-26 * s, -78 * s); ctx.lineTo(26 * s, -78 * s);
        ctx.lineTo(22 * s, -46 * s); ctx.closePath(); ctx.fill();
        // sọc ca-rô
        ctx.strokeStyle = "rgba(255,220,150,0.4)"; ctx.lineWidth = 1.6 * s;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath(); ctx.moveTo(i * 14 * s, -46 * s); ctx.lineTo(i * 14 * s, -78 * s); ctx.stroke();
        }

        // 2 tay dang ngang (cột cây ngang kiểu bù nhìn cổ điển)
        ctx.strokeStyle = "#6b4a2c"; ctx.lineWidth = 7 * s;
        ctx.beginPath(); ctx.moveTo(-52 * s, -68 * s); ctx.lineTo(52 * s, -68 * s); ctx.stroke();
        ctx.fillStyle = "#c0392b";
        ctx.beginPath(); ctx.ellipse(-40 * s, -68 * s, 16 * s, 8 * s, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(40 * s, -68 * s, 16 * s, 8 * s, -0.3, 0, Math.PI * 2); ctx.fill();
        // găng tay rơm ở đầu cọc
        ctx.fillStyle = "#e8c96a";
        ctx.beginPath(); ctx.arc(-54 * s, -68 * s, 7 * s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(54 * s, -68 * s, 7 * s, 0, Math.PI * 2); ctx.fill();

        // đầu bao tải
        ctx.fillStyle = "#e8d9a8";
        ctx.beginPath(); ctx.ellipse(0, -92 * s, 17 * s, 19 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(120,95,50,0.4)"; ctx.lineWidth = 1.4 * s;
        ctx.beginPath(); ctx.moveTo(-14 * s, -84 * s); ctx.lineTo(14 * s, -80 * s); ctx.stroke();
        // mặt khâu chỉ X X
        ctx.strokeStyle = "#4a3a20"; ctx.lineWidth = 2 * s;
        [-7, 7].forEach((dx) => {
            ctx.beginPath();
            ctx.moveTo(dx * s - 3 * s, -96 * s); ctx.lineTo(dx * s + 3 * s, -90 * s);
            ctx.moveTo(dx * s + 3 * s, -96 * s); ctx.lineTo(dx * s - 3 * s, -90 * s);
            ctx.stroke();
        });
        ctx.beginPath(); ctx.moveTo(-5 * s, -84 * s); ctx.quadraticCurveTo(0, -80 * s, 5 * s, -84 * s); ctx.stroke();

        // NÓN — VÙNG "NÓN" tính điểm thưởng (quanh y=-96*s). Chỉ vẽ nếu hatAlive.
        if (obj.hatAlive) {
            const hatY = -108 * s; // đỉnh nón, gốc vành nón ~ -96*s khớp scarecrowHatPos
            ctx.fillStyle = "#7a4e1e";
            ctx.beginPath(); ctx.ellipse(0, -96 * s, 22 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
            const hatGrad = ctx.createLinearGradient(0, hatY, 0, -96 * s);
            hatGrad.addColorStop(0, "#8a5a2e"); hatGrad.addColorStop(1, "#5e3a1a");
            ctx.fillStyle = hatGrad;
            ctx.beginPath();
            ctx.moveTo(-13 * s, -96 * s); ctx.lineTo(-9 * s, hatY); ctx.lineTo(9 * s, hatY); ctx.lineTo(13 * s, -96 * s);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = "rgba(255,203,5,0.5)"; ctx.lineWidth = 2 * s;
            ctx.beginPath(); ctx.moveTo(-13 * s, -96 * s); ctx.lineTo(13 * s, -96 * s); ctx.stroke();
        } else {
            // đã mất nón — chỏm rơm lộ ra, dấu hiệu trực quan "đã hoàn thành nhiệm vụ"
            ctx.fillStyle = "#d8c060";
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.moveTo(i * 4 * s, -96 * s); ctx.lineTo(i * 4 * s - 1.5 * s, -108 * s - Math.abs(i) * 2 * s);
                ctx.lineTo(i * 4 * s + 1.5 * s, -108 * s - Math.abs(i) * 2 * s);
                ctx.closePath(); ctx.fill();
            }
        }

        ctx.restore();
    },

    // ═══════════════════════════════════════════════════════════
    // TÚI QUÀ RƠI TỪ KHINH KHÍ CẦU — có dù nhỏ phía trên cho cảm giác "đang
    // rơi", hộp quà tím-vàng xoay nhẹ theo obj.spin lúc rơi.
    // ═══════════════════════════════════════════════════════════
    drawGiftBag(ctx, obj, state) {
        const s = obj.scale;
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(Math.sin(obj.spin * 0.5) * 0.22);

        // dù nhỏ
        ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.4 * s;
        ctx.beginPath();
        ctx.moveTo(-14 * s, -20 * s); ctx.lineTo(-9 * s, -4 * s);
        ctx.moveTo(14 * s, -20 * s); ctx.lineTo(9 * s, -4 * s);
        ctx.moveTo(0, -24 * s); ctx.lineTo(0, -4 * s);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.beginPath(); ctx.ellipse(0, -24 * s, 20 * s, 9 * s, 0, Math.PI, 0); ctx.fill();

        // hộp quà
        const boxGrad = ctx.createLinearGradient(-18 * s, -4 * s, 18 * s, 22 * s);
        boxGrad.addColorStop(0, "#8a6cff"); boxGrad.addColorStop(1, "#4a2fb0");
        ctx.fillStyle = boxGrad;
        ctx.fillRect(-18 * s, -4 * s, 36 * s, 26 * s);
        ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1.4; ctx.strokeRect(-18 * s, -4 * s, 36 * s, 26 * s);

        // ruy băng vàng chữ thập
        ctx.fillStyle = "#ffcb05";
        ctx.fillRect(-4 * s, -4 * s, 8 * s, 26 * s);
        ctx.fillRect(-18 * s, 4 * s, 36 * s, 7 * s);

        // nơ
        ctx.beginPath(); ctx.ellipse(-7 * s, -6 * s, 7 * s, 5 * s, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(7 * s, -6 * s, 7 * s, 5 * s, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -6 * s, 3.4 * s, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    },

    // ═══════════════════════════════════════════════════════════
    // VIEWMODEL SÚNG — hiện đáy màn hình, xoay theo state.aimAngle quanh
    // state.pivot, giật lùi theo state.recoilAmt (0..1, giảm dần sau mỗi
    // phát). Mỗi khẩu vẽ trong hệ toạ độ CỤC BỘ: gốc (0,0) = pivot, hướng
    // "lên/về phía trước" = trục Y ÂM. Đầu nòng mỗi khẩu PHẢI ở đúng
    // y = -barrelLen (xem bảng trong header) để khớp muzzleTipPos().
    // ═══════════════════════════════════════════════════════════
    drawWeaponViewmodel(ctx, state) {
        const pivot = state.pivot || { x: state.VW / 2, y: state.VH * 1.02 };
        const recoilPx = 24 * (state.recoilAmt || 0); // lùi dọc theo nòng khi vừa bắn

        ctx.save();
        ctx.translate(pivot.x, pivot.y);
        ctx.rotate(state.aimAngle || 0);
        ctx.translate(0, recoilPx);

        switch (state.weaponId) {
            case "rifle": this._gunRifle(ctx); break;
            case "shotgun": this._gunShotgun(ctx); break;
            case "sniper": this._gunSniper(ctx); break;
            case "smg": this._gunSmg(ctx); break;
            case "revolver": this._gunRevolver(ctx); break;
            case "crossbow": this._gunCrossbow(ctx); break;
            case "grenade": this._gunGrenade(ctx); break;
            case "blunderbuss": this._gunBlunderbuss(ctx); break;
            case "silenced": this._gunSilenced(ctx); break;
            case "pistol":
            default: this._gunPistol(ctx); break;
        }

        ctx.restore();
    },

    // Nòng súng kim loại thẳng dùng chung — gradient sáng-giữa/tối-viền cho
    // cảm giác tròn trụ dù chỉ là hình chữ nhật 2D.
    _gunBarrel(ctx, len, width, light, dark) {
        const grad = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
        grad.addColorStop(0, dark); grad.addColorStop(0.5, light); grad.addColorStop(1, dark);
        ctx.fillStyle = grad;
        ctx.fillRect(-width / 2, -len, width, len);
        ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1.4;
        ctx.strokeRect(-width / 2, -len, width, len);
    },

    // 1) SÚNG LỤC — barrelLen 120. Nhỏ gọn, cân bằng, không đặc điểm cực đoan.
    _gunPistol(ctx) {
        ctx.fillStyle = "#3a2a1c";
        ctx.beginPath();
        ctx.moveTo(-13, 0); ctx.lineTo(-16, -46); ctx.lineTo(14, -46); ctx.lineTo(11, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#2a2a2e"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, -40, 10, 0, Math.PI * 2); ctx.stroke();
        this._gunBarrel(ctx, 120, 20, "#e2e4ea", "#4a4c54");
        ctx.fillStyle = "#2a2a2e"; ctx.fillRect(-2, -122, 4, 6);
    },

    // 2) SÚNG TRƯỜNG — barrelLen 200. Nòng dài, báng gỗ, hộp tiếp đạn nhỏ.
    _gunRifle(ctx) {
        ctx.fillStyle = "#6b4a2c";
        ctx.beginPath();
        ctx.moveTo(-10, 0); ctx.lineTo(-22, -16); ctx.lineTo(-14, -70); ctx.lineTo(14, -70);
        ctx.lineTo(20, -16); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#3a3a42";
        ctx.beginPath(); ctx.moveTo(-6, -78); ctx.lineTo(-10, -50); ctx.lineTo(6, -50); ctx.lineTo(4, -78); ctx.closePath(); ctx.fill();
        this._gunBarrel(ctx, 200, 14, "#dcdee4", "#4a4c54");
        ctx.fillStyle = "#2a2a2e";
        ctx.fillRect(-3, -196, 6, 14); // đầu ruồi
        ctx.fillRect(-9, -74, 18, 8); // thước ngắm
    },

    // 3) SÚNG 2 NÒNG (shotgun) — barrelLen 170. 2 ống song song + khớp bẻ nòng.
    _gunShotgun(ctx) {
        ctx.fillStyle = "#5a3a1e";
        ctx.beginPath();
        ctx.moveTo(-14, 0); ctx.lineTo(-18, -14); ctx.lineTo(-10, -56); ctx.lineTo(10, -56);
        ctx.lineTo(18, -14); ctx.lineTo(14, 0); ctx.closePath(); ctx.fill();
        [-6, 6].forEach((dx) => {
            ctx.save(); ctx.translate(dx, 0);
            this._gunBarrel(ctx, 170, 11, "#e8eaef", "#42444c");
            ctx.restore();
        });
        ctx.fillStyle = "#8a5a2e"; ctx.fillRect(-16, -54, 32, 10);
    },

    // 4) SÚNG NGẮM (sniper) — barrelLen 210. Ống ngắm to trên nòng + chân chống.
    _gunSniper(ctx) {
        ctx.fillStyle = "#2e2e34";
        ctx.beginPath();
        ctx.moveTo(-11, 0); ctx.lineTo(-20, -20); ctx.lineTo(-13, -80); ctx.lineTo(13, -80);
        ctx.lineTo(20, -20); ctx.lineTo(11, 0); ctx.closePath(); ctx.fill();
        this._gunBarrel(ctx, 210, 12, "#dfe1e6", "#43454d");
        ctx.fillStyle = "#1a1a1e";
        ctx.fillRect(-8, -170, 16, 60);
        ctx.beginPath(); ctx.arc(0, -170, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -110, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(120,255,160,0.85)";
        ctx.beginPath(); ctx.arc(0, -170, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#2a2a2e"; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-6, -190); ctx.lineTo(-22, -160);
        ctx.moveTo(6, -190); ctx.lineTo(22, -160);
        ctx.stroke();
    },

    // 5) SÚNG MÁY (SMG) — barrelLen 140. Băng đạn cong thò xuống + báng gấp.
    _gunSmg(ctx) {
        ctx.fillStyle = "#3a3a42"; ctx.fillRect(-15, -56, 30, 56);
        ctx.strokeStyle = "#2a2a2e"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-8, 18); ctx.lineTo(10, 18); ctx.stroke();
        this._gunBarrel(ctx, 140, 14, "#cfd2d8", "#4a4c54");
        ctx.fillStyle = "#2a2a2e";
        ctx.beginPath();
        ctx.moveTo(-6, -40); ctx.quadraticCurveTo(-16, -10, -10, 10);
        ctx.lineTo(2, 8); ctx.quadraticCurveTo(2, -20, 6, -40);
        ctx.closePath(); ctx.fill();
    },

    // 6) SÚNG Ổ QUAY (revolver) — barrelLen 110. Ổ đạn tròn lộ rõ + búa.
    _gunRevolver(ctx) {
        ctx.fillStyle = "#4a2f1c";
        ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-16, -44); ctx.lineTo(13, -44); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#5a5a62";
        ctx.beginPath(); ctx.arc(0, -52, 17, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#2a2a2e"; ctx.lineWidth = 1.4;
        for (let i = 0; i < 6; i++) {
            const a = i * (Math.PI * 2 / 6);
            ctx.beginPath(); ctx.arc(Math.cos(a) * 10, -52 + Math.sin(a) * 10, 3, 0, Math.PI * 2); ctx.stroke();
        }
        this._gunBarrel(ctx, 110, 13, "#dcdee4", "#4a4c54");
        ctx.fillStyle = "#2a2a2e"; ctx.fillRect(-4, -58, 8, 8);
    },

    // 7) NỎ (crossbow) — barrelLen 150. 2 cánh cong ngang + dây cung.
    _gunCrossbow(ctx) {
        ctx.fillStyle = "#5a3a1e"; ctx.fillRect(-6, -150, 12, 150);
        ctx.strokeStyle = "#3a2a16"; ctx.lineWidth = 6; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, -110); ctx.quadraticCurveTo(-50, -120, -46, -90);
        ctx.moveTo(0, -110); ctx.quadraticCurveTo(50, -120, 46, -90);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.6; ctx.lineCap = "butt";
        ctx.beginPath(); ctx.moveTo(-46, -90); ctx.lineTo(0, -58); ctx.lineTo(46, -90); ctx.stroke();
    },

    // 8) SÚNG CỐI (grenade launcher) — barrelLen 160. Nòng to ngắn, miệng loe, trống đạn.
    _gunGrenade(ctx) {
        ctx.fillStyle = "#3a3a2a";
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-16, -30); ctx.lineTo(14, -30); ctx.lineTo(12, 0); ctx.closePath(); ctx.fill();
        const grad = ctx.createLinearGradient(-22, 0, 22, 0);
        grad.addColorStop(0, "#2a2a1c"); grad.addColorStop(0.5, "#5a5a42"); grad.addColorStop(1, "#2a2a1c");
        ctx.fillStyle = grad; ctx.fillRect(-22, -160, 44, 130);
        ctx.fillStyle = "#2a2a1c";
        ctx.beginPath(); ctx.moveTo(-22, -160); ctx.lineTo(-27, -168); ctx.lineTo(27, -168); ctx.lineTo(22, -160); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#2a2a1c"; ctx.beginPath(); ctx.arc(0, -40, 20, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,160,60,0.4)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -40, 20, 0, Math.PI * 2); ctx.stroke();
    },

    // 9) HOẢ MAI CỔ (blunderbuss) — barrelLen 180. Miệng loe kèn cực rộng.
    _gunBlunderbuss(ctx) {
        ctx.fillStyle = "#6b4a2c";
        ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(-16, -50); ctx.lineTo(13, -50); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
        this._gunBarrel(ctx, 150, 15, "#c9a86a", "#5a4020");
        ctx.fillStyle = "#c9a86a";
        ctx.beginPath();
        ctx.moveTo(-9, -150); ctx.lineTo(-30, -180); ctx.lineTo(30, -180); ctx.lineTo(9, -150);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.strokeStyle = "#ffcb05"; ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-9, -150); ctx.lineTo(9, -150); ctx.stroke();
        ctx.globalAlpha = 1;
    },

    // 10) SÚNG GIẢM THANH — barrelLen 150. Ống giảm thanh nối dài phía đầu nòng.
    _gunSilenced(ctx) {
        ctx.fillStyle = "#3a2a1c";
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-15, -44); ctx.lineTo(13, -44); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
        this._gunBarrel(ctx, 88, 16, "#dcdee4", "#4a4c54");
        ctx.fillStyle = "#2a2a2e"; ctx.fillRect(-9, -150, 18, 64);
        ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const y = -96 - i * 18;
            ctx.beginPath(); ctx.moveTo(-9, y); ctx.lineTo(9, y); ctx.stroke();
        }
    },

    // ═══════════════════════════════════════════════════════════
    // ỐNG NGẮM SNIPER — pkm_birdshoot.js chỉ gọi hàm này khi
    // state.aiming && state.requiresScope === true. Che tối toàn màn hình
    // trừ 1 vòng tròn giữa (mô phỏng nhìn qua ống nhòm) + tâm ngắm mil-dot.
    // ═══════════════════════════════════════════════════════════
    drawScopeOverlay(ctx, state) {
        const cx = state.VW / 2, cy = state.VH * 0.42;
        const r = Math.min(state.VW, state.VH) * 0.34;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, state.VW, state.VH);
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
        ctx.fillStyle = "rgba(0,0,0,0.88)";
        ctx.fill("evenodd");

        ctx.strokeStyle = "#161616"; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.stroke();

        ctx.strokeStyle = "rgba(120,255,140,0.85)"; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.82, cy); ctx.lineTo(cx - r * 0.15, cy);
        ctx.moveTo(cx + r * 0.15, cy); ctx.lineTo(cx + r * 0.82, cy);
        ctx.moveTo(cx, cy - r * 0.82); ctx.lineTo(cx, cy - r * 0.15);
        ctx.moveTo(cx, cy + r * 0.15); ctx.lineTo(cx, cy + r * 0.82);
        ctx.stroke();
        for (let i = -3; i <= 3; i++) {
            if (i === 0) continue;
            const off = i * r * 0.14;
            ctx.beginPath(); ctx.moveTo(cx + off, cy - 6); ctx.lineTo(cx + off, cy + 6); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx - 6, cy + off); ctx.lineTo(cx + 6, cy + off); ctx.stroke();
        }
        ctx.fillStyle = "rgba(120,255,140,0.9)";
        ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    },
};
