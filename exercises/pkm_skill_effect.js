/**
 * ==========================================================
 * PKM SKILL EFFECT — HIỆU ỨNG PHỤ TRỢ QUANH TỪNG POKEMON (v3)
 * ==========================================================
 * window.PkmUnitFX — object ĐỘC LẬP, không đụng SkillManager.
 *
 * FILE ĐƯỢC CHIA THÀNH CÁC KHU VỰC RÕ RỆT — SỬA PHẦN NÀO CHỈ
 * CẦN TÌM ĐÚNG KHU VỰC ĐÓ (cả CSS lẫn JS dựng DOM nằm sát nhau):
 *
 * [0] DÙNG CHUNG      — registry, keyframes chung, hàm tiện ích
 * [1] VÒNG TRÒN 1     — vòng nền tĩnh (elip trắng-vàng) = SẮP TẤN CÔNG (cả 2 phe)
 * [2] VÒNG TRÒN 2     — dải sáng xoay = SẮP TUNG SKILL AOE (cả 2 phe, tách rời Vòng 1)
 * [3] VÒNG TRÒN 3     — vòng đỏ = SẮP BỊ TẤN CÔNG / là mục tiêu (cả 2 phe)
 * [4] BÓNG ĐỔ         — bóng dưới chân, lệch hướng theo phe
 * [5] NGÔI SAO         — 2 sao xoay = SẮP ĐƯỢC BUFF (đã lãnh đủ 2 đòn, chờ đòn thứ 3)
 * [6] TÊN CHIÊU        — chữ nổi lên đầu khi tung chiêu
 * [7] BUFF BURST       — hiệu ứng bùng nổ khi buff (hồi máu) thực sự kích hoạt
 *
 * KỸ THUẬT VÒNG 2 / VÒNG 3 (quan trọng, đừng phá khi sửa):
 * Ellipse (vòng chân đế) là hình bẹt theo phối cảnh, nhưng dải
 * sáng/vòng đỏ cần XOAY quanh nó mà KHÔNG được méo hình. Cách làm:
 * dựng 1 khung vuông chứa HÌNH TRÒN, bóp dẹt khung đó 1 LẦN DUY
 * NHẤT bằng scaleY() (tĩnh, không animate), rồi chỉ xoay rotate()
 * hình tròn NẰM BÊN TRONG khung đã bóp. Nhờ vậy dải sáng luôn chạy
 * đúng theo viền elip mà không bị lệch dạng khi quay.
 *
 * TẤT CẢ hiệu ứng bên dưới đều là TOGGLE ẩn/hiện theo trạng thái
 * (mặc định ẩn), KHÔNG có gì tự động bật — pkm_battle.js quyết định
 * khi nào bật/tắt để dự báo (telegraph) trước 1 lượt cho người chơi thấy.
 *
 * API công khai:
 * PkmUnitFX.attachBaseRings(side, index)              — dựng khung FX ẩn cho 1 unit (cả 2 phe)
 * PkmUnitFX.setAttacking(side, index, bool)            — Vòng 1: sắp tấn công
 * PkmUnitFX.setAOECasting(side, index, bool)           — Vòng 2: sắp tung AOE
 * PkmUnitFX.setTargeted(side, index, bool)             — Vòng 3: sắp bị tấn công
 * PkmUnitFX.setBuffing(side, index, bool)              — Sao: sắp được buff
 * PkmUnitFX.showHealBurst(side, index)                 — hiệu ứng nổ khi buff (hồi máu) kích hoạt thật
 * PkmUnitFX.showSkillName(side, index, text)
 * PkmUnitFX.removeUnit(side, index)
 * ==========================================================
 */

window.PkmUnitFX = (() => {

    // ══════════════════════════════════════════════════════
    // [0] DÙNG CHUNG — registry, kích thước gốc, keyframes chung
    //     Sửa kích thước tổng thể của mọi vòng → sửa BASE_RING_W/H
    // ══════════════════════════════════════════════════════
    const registry = new Map();

    const BASE_RING_W = 100;   // bề rộng gốc vòng chân đế (trước khi nhân theo scale)
    const BASE_RING_H = 40;   // bề cao gốc (độ bẹt của elip)
    const TARGET_RING_EXTRA = 14; // vòng đỏ to hơn vòng trắng bao nhiêu px mỗi chiều

    const CSS_COMMON = `
        @keyframes pkmfx-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
        }
        @keyframes pkmfx-spin-reverse {
            from { transform: rotate(360deg); }
            to   { transform: rotate(0deg); }
        }
        .pkm-fx-ground-group {
            position: absolute;
            left: 50%;
            pointer-events: none;
            z-index: 0; /* luôn ở DƯỚI sprite Pokémon */
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .pkm-fx-head-group {
            position: absolute;
            left: 50%;
            pointer-events: none;
            z-index: 5; /* luôn ở TRÊN sprite Pokémon */
        }
    `;

    // Đọc scale/flip trực tiếp từ dataset của .pkm-unit — không phụ
    // thuộc transform runtime của imgWrapper, tránh bug phóng to.
    function getUnitMeta(unit) {
        const scale = parseFloat(unit.dataset.scale) || 1;
        const damped = 0.55 + 0.45 * Math.min(1.6, Math.max(0.6, scale));
        return { scale, damped };
    }

    function cleanupKey(key) {
        const st = registry.get(key);
        if (!st) return;
        if (st._skillNameTimeout) clearTimeout(st._skillNameTimeout);
        registry.delete(key);
    }

    function injectStyles() {
        if (document.getElementById('pkm-unitfx-style')) return;

        // Thêm bộ lọc tạo hạt lấp lánh cho đuôi ngôi sao đúng như ảnh mẫu
        if (!document.getElementById('pkm-star-filter-svg')) {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.id = "pkm-star-filter-svg";
            svg.style.position = "absolute";
            svg.style.width = "0";
            svg.style.height = "0";
            svg.style.pointerEvents = "none";
            svg.innerHTML = `
                <defs>
                    <filter id="pkm-star-sparkle-filter">
                        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="2" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                        <feGaussianBlur in="displaced" stdDeviation="0.8" />
                    </filter>
                </defs>
            `;
            document.body.appendChild(svg);
        }

        const style = document.createElement('style');
        style.id = 'pkm-unitfx-style';
        style.textContent = [
            CSS_COMMON,
            CSS_RING1,
            CSS_RING2,
            CSS_RING3,
            CSS_SHADOW,
            CSS_STARS,
            CSS_SKILLNAME,
            CSS_BUFF
        ].join('\n');
        document.head.appendChild(style);
    }


    // ══════════════════════════════════════════════════════
    // [1] VÒNG TRÒN 1 — Vòng nền tĩnh (elip trắng-vàng, 2 lớp dày)
    //     Sửa hình dạng / độ dày / màu vòng chân đế → CHỈ khu vực này
    // ══════════════════════════════════════════════════════
    const CSS_RING1 = `
        .pkm-fx-ring1 {
            position: absolute;
            border-radius: 50%;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        .pkm-fx-ring1.active { opacity: 1; }

        .pkm-fx-ring1-outer {
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 3px solid rgba(255,248,220,0.82);
            box-shadow:
                0 0 6px rgba(255,248,220,0.45),
                inset 0 0 3px rgba(255,255,255,0.15);
            background: none;
        }
    `;

    function buildRing1(ringW, ringH) {
        const el = document.createElement('div');
        el.className = 'pkm-fx-ring1';
        el.style.width = `${ringW}px`;
        el.style.height = `${ringH}px`;
        el.innerHTML = `<div class="pkm-fx-ring1-outer"></div>`;
        return el;
    }


    // ══════════════════════════════════════════════════════
    // [2] VÒNG TRÒN 2 — Dải sáng xoay quanh Vòng 1 (chỉ phe mình)
    //     Sửa tốc độ xoay / số vệt / độ đậm → CHỈ khu vực này
    // ══════════════════════════════════════════════════════
    const CSS_RING2 = `
        .pkm-fx-ring2-wrap {
            position: absolute;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        .pkm-fx-ring2-wrap.active { opacity: 1; }
        .pkm-fx-ring2-spin {
            position: absolute;
            left: 0; top: 0;
            border-radius: 50%;
            animation: pkmfx-spin 2.6s linear infinite; /* ← chỉnh tốc độ xoay ở đây */
            animation-play-state: paused; /* chỉ chạy khi .active để đỡ tốn tài nguyên */
            background: repeating-conic-gradient(
                from 0deg,
                rgba(255,255,255,0) 0deg,    /* Đầu dải sáng: Mờ hoàn toàn */
                rgba(255,255,255,0.7) 90deg, /* Thân dải sáng: Rõ dần lên */
                #fff 140deg,                 /* Cuối dải sáng: Đạt độ trắng đậm nhất tại góc 140deg */
                transparent 140deg,          /* Cắt đứt góc này ngay lập tức để không bị lem màu */
                transparent 180deg           /* Khoảng trống trống trước khi lặp lại dải thứ 2 */
            );
            /* Thu hẹp bán kính mask xuống 40%-55% để ôm khít BÊN TRONG Vòng 1 */
            -webkit-mask-image: radial-gradient(circle, transparent 40%, #000 41%, #000 62%, transparent 63%);
        mask-image: radial-gradient(circle, transparent 40%, #000 41%, #000 62%, transparent 63%);
            filter: drop-shadow(0 0 4px rgba(255,255,255,0.7));
        }
        .pkm-fx-ring2-wrap.active .pkm-fx-ring2-spin {
            animation-play-state: running;
        }
    `;

    function buildRing2(ringW, ringH) {
        const wrap = document.createElement('div');
        wrap.className = 'pkm-fx-ring2-wrap';
        const squash = ringH / ringW; // tỉ lệ bóp dẹt để khớp elip Vòng 1
        wrap.style.width = `${ringW}px`;
        wrap.style.height = `${ringW}px`;
        wrap.style.transform = `scaleY(${squash})`;
        wrap.style.transformOrigin = 'center center';

        const spin = document.createElement('div');
        spin.className = 'pkm-fx-ring2-spin';
        spin.style.width = `${ringW}px`;
        spin.style.height = `${ringW}px`;
        wrap.appendChild(spin);
        return wrap;
    }


    // ══════════════════════════════════════════════════════
    // [3] VÒNG TRÒN 3 — Vòng đỏ mục tiêu (4 cung, xoay ngược chiều)
    //     Cả 2 phe, chỉ hiện khi bị nhắm.
    //     Sửa số cung / màu / tốc độ → CHỈ khu vực này
    // ══════════════════════════════════════════════════════
    const CSS_RING3 = `
        .pkm-fx-ring3 {
            position: absolute;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .pkm-fx-ring3.active { opacity: 1; }
        .pkm-fx-ring3-wrap {
            position: absolute;
            pointer-events: none;
        }
        .pkm-fx-ring3-spin {
    position: absolute;
    left: 0; top: 0;
    border-radius: 50%;
    animation: pkmfx-spin-reverse 2.2s linear infinite; /* ← chỉnh tốc độ xoay ở đây */
    animation-play-state: paused; /* chỉ chạy khi .active để đỡ tốn tài nguyên */
    background: repeating-conic-gradient(
        from 0deg,
        transparent 0deg 65deg,
        rgba(255,50,50,0.95) 65deg 90deg
    ); /* 4 cung 25deg, cách đều 90deg — đổi số 90/65 để đổi số cung/độ rộng */
    /* Mở rộng bán kính mask lên 78%-90% để đẩy dải sáng ra BÊN NGOÀI Vòng 1
       — dùng closest-side để % tính theo cạnh hộp, tránh bị farthest-corner
       kéo dãn ra ngoài khiến toàn bộ dải màu đỏ bị cắt mất (mask vô hình) */
    -webkit-mask-image: radial-gradient(circle closest-side, transparent 78%, #000 79%, #000 90%, transparent 91%);
            mask-image: radial-gradient(circle closest-side, transparent 78%, #000 79%, #000 90%, transparent 91%);
    filter: drop-shadow(0 0 6px rgba(255,40,40,0.8));
}
        .pkm-fx-ring3.active .pkm-fx-ring3-spin {
            animation-play-state: running;
        }
    `;

    function buildRing3(ringW, ringH) {
        const root = document.createElement('div');
        root.className = 'pkm-fx-ring3';

        const size = ringW + TARGET_RING_EXTRA * 2;
        // ◄ FIX: root trước đây không có width/height nên bị co về 0×0,
        // khiến flex-center của groundGroup canh sai tâm (lệch nửa size).
        root.style.width = `${size}px`;
        root.style.height = `${size}px`;

        const wrap = document.createElement('div');
        wrap.className = 'pkm-fx-ring3-wrap';

        // Tỷ lệ bóp dẹt dựa theo kích thước mới của vòng 3 để giữ đồng tâm hoàn hảo với elip nền
        const squash = (ringH + TARGET_RING_EXTRA * 2 * (ringH / ringW)) / size;

        wrap.style.width = `${size}px`;
        wrap.style.height = `${size}px`;
        wrap.style.transform = `scaleY(${squash})`;
        wrap.style.transformOrigin = 'center center';

        const spin = document.createElement('div');
        spin.className = 'pkm-fx-ring3-spin';
        spin.style.width = `${size}px`;
        spin.style.height = `${size}px`;
        wrap.appendChild(spin);
        root.appendChild(wrap);
        return root;
    }


    // ══════════════════════════════════════════════════════
    // [4] BÓNG ĐỔ — Bóng dưới chân, lệch hướng theo phe
    //     player: đổ xuống (mặt hướng vào sân) — enemy: đổ lên
    //     Sửa độ mờ / kích thước / hướng đổ → CHỈ khu vực này
    // ══════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════
    // [4] CÁI BÓNG — Nâng cấp: Bóng đổ Silhouette thực tế theo dáng Pokemon
    // ══════════════════════════════════════════════════════
    const CSS_SHADOW = `
        .pkm-fx-shadow-wrap {
            position: absolute;
            pointer-events: none;
            z-index: 1; /* Nằm dưới chân Pokémon */
        }

        /* Bóng đổ clone khớp 100% hình dáng nhân vật như trong ảnh mẫu */
        .pkm-fx-real-shadow {
            display: block;
            width: auto;
            height: auto;
            max-width: 100%;
            transform-origin: center bottom;

            /* Phối cảnh bóp bẹt chiều cao + nghiêng theo hướng nắng */
            transform: scaleY(0.25) skewX(-20deg);

            /* Biến toàn bộ ảnh thành đen tinh khiết, chỉnh trong suốt và làm mượt rìa */
            filter: brightness(0) opacity(0.38) blur(1.2px);
            mix-blend-mode: multiply;
        }

        /* Khối elip dự phòng nếu không tìm thấy thẻ ảnh */
        .pkm-fx-shadow-fallback {
            border-radius: 50%;
            filter: blur(1px);
        }
    `;

    function buildShadow(side, ringW, ringH) {
        const shadowWrap = document.createElement('div');
        shadowWrap.className = 'pkm-fx-shadow-wrap';

        const shadowDirDown = side === 'player';
        const shadowOffset = shadowDirDown ? 10 : -10;

        // Gộp chung căn tâm ngang (-50%) và dịch chuyển dọc (shadowOffset) của bạn
        shadowWrap.style.transform = `translate(-50%, ${shadowOffset}px)`;

        // Dùng requestAnimationFrame để đợi thẻ mount vào DOM rồi mới quét tìm ảnh Pokémon
        requestAnimationFrame(() => {
            const parent = shadowWrap.parentElement;
            if (!parent) return;

            const pkmImg = parent.querySelector('img');
            if (pkmImg) {
                const realShadow = document.createElement('img');
                realShadow.className = 'pkm-fx-real-shadow';
                realShadow.src = pkmImg.src;

                // Nếu Pokémon gốc đang bị lật hình (scaleX(-1)), bóng cũng tự lật theo
                if (pkmImg.style.transform && pkmImg.style.transform.includes('scaleX(-1)')) {
                    realShadow.style.transform += ' scaleX(-1)';
                }

                shadowWrap.appendChild(realShadow);

                // Bộ theo dõi (MutationObserver): Nếu Pokémon đổi tư thế (đổi src) hoặc lật hướng, bóng tự cập nhật ngay lập tức
                const observer = new MutationObserver(() => {
                    realShadow.src = pkmImg.src;
                    if (pkmImg.style.transform && pkmImg.style.transform.includes('scaleX(-1)')) {
                        if (!realShadow.style.transform.includes('scaleX(-1)')) {
                            realShadow.style.transform += ' scaleX(-1)';
                        }
                    } else {
                        realShadow.style.transform = 'scaleY(0.25) skewX(-20deg)';
                    }
                });
                observer.observe(pkmImg, { attributes: true, attributeFilter: ['src', 'style'] });

            } else {
                // PHƯƠNG ÁN DỰ PHÒNG: Vẽ lại hình elip cũ của bạn nếu không phát hiện thẻ ảnh
                const fallback = document.createElement('div');
                fallback.className = 'pkm-fx-shadow-fallback';
                const shadowW = ringW * 0.95;
                const shadowH = ringH * 0.8;
                fallback.style.width = `${shadowW}px`;
                fallback.style.height = `${shadowH}px`;

                const nearPct = shadowDirDown ? '30%' : '70%';
                fallback.style.background = `radial-gradient(ellipse at 50% ${nearPct}, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0) 80%)`;
                shadowWrap.appendChild(fallback);
            }
        });

        return shadowWrap;
    }


    // ══════════════════════════════════════════════════════
    // [5] NGÔI SAO — 2 sao xoay quanh khi Pokémon chuẩn bị ra chiêu
    // ══════════════════════════════════════════════════════
    // [5] NGÔI SAO — 2 sao hình thoi xoay đối xứng, đuôi dài mờ dần mượt
    // ══════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════
    // [5] NGÔI SAO — Sửa đổi theo ảnh mẫu: Đuôi nhòe lấp lánh hạt mịn
    // ══════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════
    // [5] NGÔI SAO — Cải tiến: Sao to rõ, quầng hạt lấp lánh mịn như ảnh mẫu
    // ══════════════════════════════════════════════════════
    const CSS_STARS = `
        .pkm-fx-cast-stars {
            position: absolute;
            left: 50%; top: 50%;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s ease;
        }
        .pkm-fx-cast-stars.active { opacity: 1; }

        /* Khung chứa quỹ đạo elip bẹt đồng tâm mặt đất */
        .pkm-fx-cast-orbit-wrap {
            position: absolute;
            left: 50%; top: 50%;
            transform: translate(-50%, -50%) scaleY(0.52);
            transform-origin: center center;
        }

        /* Trục xoay tròn tuyệt đối bên trong chứa các ngôi sao */
        .pkm-fx-cast-spin {
            position: absolute;
            left: 0; top: 0;
            width: 100%; height: 100%;
            animation: pkmfx-spin 2.4s linear infinite;
        }

        .pkm-fx-star-cluster {
            position: absolute;
            left: 50%; top: 50%;
            width: 0; height: 0;
        }
        /* Tạo góc xoay đối xứng tuyệt đối 180 độ cho 2 ngôi sao */
        .pkm-fx-star-cluster.c1 { transform: rotate(0deg); }
        .pkm-fx-star-cluster.c2 { transform: rotate(180deg); }

        /* Đuôi sáng nhòe hạt lấp lánh mịn như ảnh mẫu */
        .pkm-fx-star-tail {
            position: absolute;
            top: 0; left: 0;
            width: 60px;  /* Kéo đuôi dài lướt mượt */
            height: 20px;  /* Độ dày đuôi */

            /* Dải màu chuyển tiếp vuốt mềm */
            background: linear-gradient(to left, 
                #fff 0%, 
                rgba(255, 255, 255, 0.8) 20%, 
                rgba(255, 255, 255, 0.35) 60%, 
                rgba(255, 255, 255, 0) 100%
            );

            transform-origin: right center;
            transform: translate(-100%, -50%) skewX(-12deg);

            /* Dùng mask elip làm mịn hai rìa cạnh */
            -webkit-mask-image: radial-gradient(ellipse at right, #000 15%, transparent 85%);
                    mask-image: radial-gradient(ellipse at right, #000 15%, transparent 85%);

            /* Bộ lọc tạo hạt lấp lánh xé mịn đuôi khói + glow sáng */
            filter: url(#pkm-star-sparkle-filter) drop-shadow(0 0 4px rgba(255,255,255,0.8));
        }

        /* Đầu ngôi sao hình thoi nhọn giống hệt hình bạn gửi */
        .pkm-fx-star-head {
            position: absolute;
            left: 0; top: 0;
            width: 15px; /* Kích thước lớn rõ rệt */
            height: 25px;
            background: #fff;

            /* Bóp tỉ lẹ tạo độ nhọn hình thoi + xoay nghiêng góc 45 độ */
            transform: translate(-50%, -50%) scale(1.15, 0.75) rotate(45deg);

            /* Quầng sáng mịn tỏa rộng bao quanh */
            filter: drop-shadow(0 0 3px #fff) 
                    drop-shadow(0 0 8px rgba(255,255,255,0.9)) 
                    drop-shadow(0 0 14px rgba(255,255,255,0.4));
        }
    `;

    function buildCastStars(ringW) {
        // Quỹ đạo mở rộng vòng xoay ngôi sao bao ngoài Vòng 1 dưới chân
        const orbitSize = Math.round((ringW || 96) * 1.18); 
        const radius = orbitSize / 2;

        const castStars = document.createElement('div');
        castStars.className = 'pkm-fx-cast-stars';
        castStars.style.width = `${orbitSize}px`;
        castStars.style.height = `${orbitSize}px`;
        castStars.style.marginLeft = `${-radius}px`;
        castStars.style.marginTop = `${-radius}px`;

        const orbitWrap = document.createElement('div');
        orbitWrap.className = 'pkm-fx-cast-orbit-wrap';
        orbitWrap.style.width = `${orbitSize}px`;
        orbitWrap.style.height = `${orbitSize}px`;

        const spin = document.createElement('div');
        spin.className = 'pkm-fx-cast-spin';

        // Tạo đúng 2 cụm sao đối xứng 180 độ
        ['c1', 'c2'].forEach(cName => {
            const cluster = document.createElement('div');
            cluster.className = `pkm-fx-star-cluster ${cName}`;

            const starWrapper = document.createElement('div');
            starWrapper.style.position = 'absolute';
            starWrapper.style.left = '0';
            starWrapper.style.top = `${-radius}px`; // Đẩy sao ra mép elip rộng

            const tail = document.createElement('div');
            tail.className = 'pkm-fx-star-tail';

            const head = document.createElement('div');
            head.className = 'pkm-fx-star-head';

            starWrapper.appendChild(tail);
            starWrapper.appendChild(head);
            cluster.appendChild(starWrapper);
            spin.appendChild(cluster);
        });

        orbitWrap.appendChild(spin);
        castStars.appendChild(orbitWrap);
        return castStars;
    }


    // ══════════════════════════════════════════════════════
    // [6] TÊN CHIÊU — Chữ nổi lên đầu khi tung chiêu
    // ══════════════════════════════════════════════════════
    const CSS_SKILLNAME = `
        @keyframes pkmfx-namefloat {
            0%   { opacity: 0; transform: translate(-50%, 0)     scale(0.7);  }
            15%  { opacity: 1; transform: translate(-50%, -6px)  scale(1.05); }
            80%  { opacity: 1; transform: translate(-50%, -10px) scale(1);    }
            100% { opacity: 0; transform: translate(-50%, -26px) scale(0.9);  }
        }
        .pkm-fx-skill-name {
            position: absolute;
            left: 50%; top: -6px;
            white-space: nowrap;
            color: #fff;
            font-weight: 900;
            font-size: 12px;
            text-shadow: 1px 1px 2px #000, 0 0 6px rgba(255,255,255,0.5);
            opacity: 0;
        }
        .pkm-fx-skill-name.playing {
            animation: pkmfx-namefloat 1.5s ease-out forwards;
        }
    `;

    function buildSkillNameEl() {
        const el = document.createElement('div');
        el.className = 'pkm-fx-skill-name';
        return el;
    }


    // ══════════════════════════════════════════════════════
    // [7] BUFF TICKER — Icon buff trồi lên định kỳ
    // ══════════════════════════════════════════════════════
    const CSS_BUFF = `
        @keyframes pkmfx-healnum-float {
            0%   { opacity: 0; transform: translate(-50%, 0)     scale(0.6); }
            20%  { opacity: 1; transform: translate(-50%, -8px)  scale(1.1); }
            80%  { opacity: 1; transform: translate(-50%, -20px) scale(1);   }
            100% { opacity: 0; transform: translate(-50%, -34px) scale(0.9); }
        }
        /* ── Gốc của bạn: Giữ nguyên hiệu ứng icon bay lên ── */
        @keyframes pkmfx-buffpop {
            0%   { opacity: 0; transform: translate(-50%, 0)     scale(0.5);  }
            20%  { opacity: 1; transform: translate(-50%, -10px) scale(1.15); }
            75%  { opacity: 1; transform: translate(-50%, -22px) scale(1);    }
            100% { opacity: 0; transform: translate(-50%, -36px) scale(0.8);  }
        }
        .pkm-fx-buff-icon {
            position: absolute;
            left: 50%; top: 15%;
            font-size: 14px;
            pointer-events: none;
            z-index: 6;
            animation: pkmfx-buffpop 1.3s ease-out forwards;
        }

        /* ── Bổ sung: Khung chứa cột sáng Aura dưới chân bùng lên ── */
        .pkm-fx-buff-container {
            position: absolute;
            left: 50%; top: 50%;
            width: 140px; height: 200px;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 5; /* Nằm ôm quanh nhân vật */
            opacity: 0;
            transition: opacity 0.3s ease;

            --buff-core: #ffffff;
            --buff-main: #ff6a00;
        }
        .pkm-fx-buff-container.active { opacity: 1; }

        /* Vòng nền sáng bùng khuếch tán dưới đất */
        .pkm-fx-buff-base {
            position: absolute;
            bottom: 10px; left: 50%;
            width: 160px; height: 160px;
            transform: translateX(-50%) scaleY(0.35);
            background: radial-gradient(circle, var(--buff-core) 0%, var(--buff-main) 30%, transparent 70%);
            filter: drop-shadow(0 0 12px var(--buff-main)) blur(4px);
            animation: pkmfx-buff-pulse 1.2s infinite alternate;
            mix-blend-mode: screen;
        }

        /* Cột Plasma cuộn mượt từ dưới lên */
        .pkm-fx-buff-plasma {
            position: absolute;
            bottom: 25px; left: 50%;
            width: 120px; height: 220px;
            transform: translateX(-50%);
            background: linear-gradient(0deg, transparent 0%, var(--buff-main) 20%, var(--buff-core) 50%, var(--buff-main) 80%, transparent 100%);
            background-size: 100% 200%;
            animation: pkmfx-buff-scroll 0.8s linear infinite;
            filter: url(#pkm-buff-plasma-filter) drop-shadow(0 0 8px var(--buff-main));
            -webkit-mask-image: radial-gradient(ellipse at center bottom, #000 10%, transparent 75%);
            mask-image: radial-gradient(ellipse at center bottom, #000 10%, transparent 75%);
            mix-blend-mode: screen;
        }

        /* Vòng nhẫn năng lượng cắt ngang thân */
        .pkm-fx-buff-ring {
            position: absolute;
            left: 50%; bottom: 50px;
            width: 130px; height: 130px;
            border: 2px solid var(--buff-core);
            border-radius: 50%;
            box-shadow: 0 0 6px var(--buff-core), inset 0 0 10px var(--buff-main);
            transform: translateX(-50%) scaleY(0.3) scale(0.3);
            opacity: 0;
            animation: pkmfx-buff-ring-expand 1.2s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
        }
        .pkm-fx-buff-ring:nth-child(2) {
            animation-delay: 0.6s;
            bottom: 80px;
        }

        @keyframes pkmfx-buff-scroll {
            0% { background-position: 0 100%; }
            100% { background-position: 0 0%; }
        }
        @keyframes pkmfx-buff-ring-expand {
            0% { transform: translateX(-50%) scaleY(0.3) scale(0.3); opacity: 0; }
            30% { opacity: 0.8; }
            100% { transform: translateX(-50%) scaleY(0.3) scale(1.6); opacity: 0; }
        }
        @keyframes pkmfx-buff-pulse {
            0% { transform: translateX(-50%) scaleY(0.35) scale(0.8); opacity: 0.7; }
            100% { transform: translateX(-50%) scaleY(0.35) scale(1.1); opacity: 1; }
        }
    `;
    // Hàm tạo bộ lọc sóng mềm cho cột sáng Plasma
    function injectBuffSVGFilter() {
        if (document.getElementById('pkm-buff-filter-svg')) return;
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "pkm-buff-filter-svg";
        svg.style.position = "absolute";
        svg.style.width = "0"; svg.style.height = "0";
        svg.style.pointerEvents = "none";
        svg.innerHTML = `
            <defs>
                <filter id="pkm-buff-plasma-filter">
                    <feTurbulence type="fractalNoise" baseFrequency="0.08 0.015" numOctaves="2" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="25" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                    <feGaussianBlur in="displaced" stdDeviation="1.5" />
                </filter>
            </defs>
        `;
        document.body.appendChild(svg);
    }

    /**
     * Hàm gọi bùng nổ Aura theo hệ màu Pokémon
     * Cú pháp: pkmFxShowBuff(khung_chứa_pokemon, '#Màu_Lõi', '#Màu_Hệ')
     */
    window.pkmFxShowBuff = function(unitElement, colorCore = '#ffffff', colorMain = '#ff6a00') {
        if (!unitElement) return;
        injectBuffSVGFilter();

        const buffWrap = document.createElement('div');
        buffWrap.className = 'pkm-fx-buff-container';
        buffWrap.style.setProperty('--buff-core', colorCore);
        buffWrap.style.setProperty('--buff-main', colorMain);

        const baseLayer = document.createElement('div');
        baseLayer.className = 'pkm-fx-buff-base';

        const plasmaLayer = document.createElement('div');
        plasmaLayer.className = 'pkm-fx-buff-plasma';

        const ring1 = document.createElement('div');
        ring1.className = 'pkm-fx-buff-ring';
        const ring2 = document.createElement('div');
        ring2.className = 'pkm-fx-buff-ring';

        buffWrap.appendChild(baseLayer);
        buffWrap.appendChild(plasmaLayer);
        buffWrap.appendChild(ring1);
        buffWrap.appendChild(ring2);
        unitElement.appendChild(buffWrap);

        requestAnimationFrame(() => { buffWrap.classList.add('active'); });

        setTimeout(() => {
            buffWrap.classList.remove('active');
            setTimeout(() => buffWrap.remove(), 300);
        }, 2500); // Hiệu ứng diễn ra trong 2.5 giây rồi tự dọn dẹp
    };


    // ══════════════════════════════════════════════════════
    // PUBLIC API — lắp ráp các khu vực trên vào từng Pokémon
    // ══════════════════════════════════════════════════════
    return {

        attachBaseRings(side, index) {
            injectStyles();
            const key = `${side}-${index}`;
            cleanupKey(key);

            const unit = document.getElementById(`${side}-unit-${index}`);
            if (!unit) return;

            const { scale, damped } = getUnitMeta(unit);
            const ringW = Math.round(BASE_RING_W * damped);
            const ringH = Math.round(BASE_RING_H * damped);
            // ◄ FIX VỊ TRÍ: đáy sprite Pokémon LUÔN cố định ở đúng UNIT_SIZE
            // (80px) tính từ đỉnh .pkm-unit, vì imgWrapper dùng
            // transform-origin:center bottom — nghĩa là khi scale() to/nhỏ,
            // điểm đáy KHÔNG di chuyển, chỉ phần thân phía trên nó co giãn.
            // Trước đây feetY = 72 * scale khiến ring bị kéo LỆCH THEO scale:
            // Pokémon càng to (scale lớn) → ring trôi xuống dưới xa chân;
            // Pokémon càng nhỏ (scale bé) → ring trôi lên cao, nổi giữa thân.
            // Nay dùng hằng số cố định, đồng nhất với UNIT_SIZE ở pkm_styles.js
            // để ring luôn bám đúng chân bất kể kích cỡ loài.
            const UNIT_SIZE = (window.PkmStyles && window.PkmStyles.UNIT_SIZE) || 80;
            const feetY = UNIT_SIZE - 2; // trừ nhẹ 2px cho khít viền dưới ảnh

            const state = {
                groundGroup: null, shadow: null,
                attackRing: null, aoeRing: null, targetRing: null,
                headGroup: null, buffStars: null, skillNameEl: null,
                _skillNameTimeout: null
            };

            // ── Nhóm chân đế: [1] + [2] + [3] + [4] ──
            const groundGroup = document.createElement('div');
            groundGroup.className = 'pkm-fx-ground-group';
            groundGroup.style.top = `${feetY}px`;
            groundGroup.style.transform = 'translateX(-50%)'; // Căn giữa chuẩn xác theo trục X

            // ◄ FIX LỚP: tìm ảnh Pokémon TRƯỚC, để chèn groundGroup/shadow vào TRƯỚC nó
            // trong DOM — nếu không, appendChild() sẽ đặt chúng SAU ảnh và vẽ ĐÈ LÊN
            // Pokémon bất kể z-index:0 (thứ tự DOM thắng khi cùng tầng stacking).
            const pkmImgRef = unit.querySelector('img');
            // Ảnh có thể nằm lồng trong 1 lớp bọc, không phải con trực tiếp của `unit`
            // → phải leo ngược lên tìm đúng con trực tiếp thì insertBefore mới hợp lệ
            let insertRef = pkmImgRef;
            while (insertRef && insertRef.parentElement !== unit) {
                insertRef = insertRef.parentElement;
            }
            unit.insertBefore(groundGroup, insertRef);

            // ══════════════════════════════════════════════════════
            // [4] BÓNG ĐỔ DƯỚI CHÂN — gắn bóng làm CON của khung
            // scale/flip đang bọc ảnh Pokémon (giống cách trainer làm),
            // để bóng tự động thừa hưởng đúng scale + flip + kích thước
            // hiển thị thật của từng loài, không còn lệch theo sprite gốc.
            // ══════════════════════════════════════════════════════
            const shadowWrap = document.createElement('div');
            shadowWrap.className = 'pkm-fx-shadow-wrap';

            const pkmImg = pkmImgRef;
            const sizeBox = pkmImg ? pkmImg.parentElement : null;           // box size×size chứa ảnh
            const scaleFlipWrapper = sizeBox ? sizeBox.parentElement : null; // khung scale(...) scaleX(flip)

            const pkmType = unit.dataset.type || 'normal';
            const airborneTypes = ['flying'];
            const isAirborne = airborneTypes.includes(pkmType);
            const shadowBottomOffset = isAirborne ? -10 : 0; // âm = đẩy bóng ra xa xuống dưới (bay)

            if (pkmImg && scaleFlipWrapper) {
                scaleFlipWrapper.style.position = 'relative'; // làm mốc absolute cho bóng bên trong

                shadowWrap.style.cssText = `
                    position: absolute;
                    left: 50%; bottom: ${shadowBottomOffset}px;
                    width: ${UNIT_SIZE}px; height: ${UNIT_SIZE}px;
                    transform: translateX(-50%);
                    z-index: -1;
                    pointer-events: none;
                `;

                const realShadow = document.createElement('img');
                realShadow.className = 'pkm-fx-real-shadow';
                realShadow.src = pkmImg.src;
                realShadow.style.cssText = `
                    display: block; width: 100%; height: 100%;
                    object-fit: contain;
                    transform: scaleY(0.25) skewX(-20deg);
                    transform-origin: center bottom;
                    filter: brightness(0) opacity(0.38) blur(1.2px);
                    mix-blend-mode: multiply;
                `;
                shadowWrap.appendChild(realShadow);
                scaleFlipWrapper.insertBefore(shadowWrap, sizeBox);

                // Đồng bộ hóa: Nếu sau này Pokémon đổi tư thế hoặc đổi ảnh, bóng tự đổi theo
                const observer = new MutationObserver(() => {
                    realShadow.src = pkmImg.src;
                });
                observer.observe(pkmImg, { attributes: true, attributeFilter: ['src'] });

            } else {
                // Phương án dự phòng nếu không tìm thấy ảnh
                shadowWrap.style.cssText = `
                    position: absolute; left: 50%; top: ${feetY}px;
                    transform: translateX(-50%);
                    width: ${ringW}px; height: ${Math.round(ringW * 0.35)}px;
                    background: rgba(0, 0, 0, 0.35);
                    border-radius: 50%;
                    filter: blur(2px);
                `;
                unit.insertBefore(shadowWrap, insertRef);
            }

            state.shadow = shadowWrap;

            // [1] Vòng "sắp tấn công" — CẢ 2 PHE, ẩn mặc định, bật bằng setAttacking()
            const ring1 = buildRing1(ringW, ringH);
            groundGroup.appendChild(ring1);
            state.attackRing = ring1;

            // [2] Vòng "sắp tung AOE" — CẢ 2 PHE, tách rời khỏi Vòng 1, ẩn mặc định
            const ring2 = buildRing2(ringW, ringH);
            groundGroup.appendChild(ring2);
            state.aoeRing = ring2;

            // [3] Vòng đỏ "sắp bị tấn công" (mục tiêu) — cả 2 phe
            const ring3 = buildRing3(ringW, ringH);
            groundGroup.appendChild(ring3);
            state.targetRing = ring3;
            state.groundGroup = groundGroup;

            // ── Nhóm đầu: [5] + [6] ──
            const headGroup = document.createElement('div');
            headGroup.className = 'pkm-fx-head-group';
            headGroup.style.top = `50%`; // Chuyển tâm ngôi sao về tâm vòng tròn đất phối cảnh
            unit.appendChild(headGroup);

            // [5] 2 ngôi sao xoay = "sắp được buff" — cả 2 phe, ẩn mặc định, bật bằng setBuffing()
            const buffStars = buildCastStars(ringW);
            headGroup.appendChild(buffStars);
            state.buffStars = buffStars;

            // [6] Tên chiêu
            const skillNameEl = buildSkillNameEl();
            headGroup.appendChild(skillNameEl);
            state.skillNameEl = skillNameEl;
            state.headGroup = headGroup;

            registry.set(key, state);
        },

        // [1] Vòng trắng-vàng: đơn vị này SẮP TẤN CÔNG (dự báo trước, cả 2 phe)
        setAttacking(side, index, bool) {
            const st = registry.get(`${side}-${index}`);
            if (!st || !st.attackRing) return;
            st.attackRing.classList.toggle('active', !!bool);
        },

        // [2] Dải sáng xoay: đơn vị này SẮP TUNG SKILL AOE (cả 2 phe)
        setAOECasting(side, index, bool) {
            const st = registry.get(`${side}-${index}`);
            if (!st || !st.aoeRing) return;
            st.aoeRing.classList.toggle('active', !!bool);
        },

        // [3] Vòng đỏ: đơn vị này SẮP BỊ TẤN CÔNG / là mục tiêu (cả 2 phe)
        setTargeted(side, index, bool) {
            const st = registry.get(`${side}-${index}`);
            if (!st || !st.targetRing) return;
            st.targetRing.classList.toggle('active', !!bool);
        },

        // [5] 2 ngôi sao xoay: đơn vị này SẮP ĐƯỢC BUFF (đã lãnh đủ 2 đòn, chờ đòn thứ 3)
        setBuffing(side, index, bool) {
            const st = registry.get(`${side}-${index}`);
            if (!st || !st.buffStars) return;
            st.buffStars.classList.toggle('active', !!bool);
        },

        // Hiệu ứng bùng nổ khi buff (hồi máu) THỰC SỰ kích hoạt (đòn thứ 3 vừa lãnh xong)
        showHealBurst(side, index) {
            const unit = document.getElementById(`${side}-unit-${index}`);
            if (!unit) return;
            injectBuffSVGFilter();

            const icon = document.createElement('div');
            icon.className = 'pkm-fx-buff-icon';
            icon.textContent = '💚';
            unit.appendChild(icon);
            icon.addEventListener('animationend', () => icon.remove());

            if (window.pkmFxShowBuff) {
                window.pkmFxShowBuff(unit, '#e8fff0', '#22c55e'); // sắc xanh lá = hồi máu
            }
        },

        // PHA 1 (buff đội hình) — cột ánh sáng giáng từ trên trời xuống đúng
        // con vừa kích hoạt buff, như "ban phép". Trả về Promise khi xong.
        // PHA 1 — cột sáng nhiều lớp giáng từ trời: glow ngoài rộng mờ +
        // lõi sáng chói + hạt tàn lửa bay lên dọc thân cột + quầng sáng
        // bệt dưới chân (giống ảnh tham khảo kiểu Mega Evolution).
        async playDescendBeam(side, index, color = '#ffd700') {
            const unit = document.getElementById(`${side}-unit-${index}`);
            if (!unit) return;
            const rect = unit.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const groundY = rect.bottom;
            const beamH = 380;
            const skyY = groundY - beamH;
            const allEls = [];

            // Quầng sáng bệt dưới chân — xuất hiện TRƯỚC để "đón" cột sáng rơi xuống
            const groundGlow = document.createElement('div');
            groundGlow.style.cssText = `
                position: fixed; left:${cx}px; top:${groundY}px;
                width: 220px; height: 70px;
                transform: translate(-50%,-50%) scale(0.3);
                border-radius: 50%;
                background: radial-gradient(ellipse, #fff 0%, ${color}cc 35%, ${color}55 60%, transparent 80%);
                filter: blur(6px);
                opacity: 0; z-index: 10001; pointer-events: none;
            `;
            document.body.appendChild(groundGlow);
            allEls.push(groundGlow);
            groundGlow.animate([
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.9, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 0.7 }
            ], { duration: 650, fill: 'forwards', easing: 'ease-out' });

            // Lớp glow ngoài — RẤT RỘNG, mờ, tạo cảm giác cột ánh sáng dày
            const outerGlow = document.createElement('div');
            outerGlow.style.cssText = `
                position: fixed; left:${cx}px; top:${skyY}px;
                width: 150px; height: ${beamH}px;
                transform: translate(-50%,0) scaleY(0);
                transform-origin: top center;
                background: linear-gradient(to bottom, transparent 0%, ${color}33 20%, ${color}66 55%, ${color}33 85%, transparent 100%);
                filter: blur(14px);
                opacity: 0; z-index: 10001; pointer-events: none;
            `;
            document.body.appendChild(outerGlow);
            allEls.push(outerGlow);

            // Lớp glow giữa — hẹp hơn, sáng hơn
            const midGlow = document.createElement('div');
            midGlow.style.cssText = `
                position: fixed; left:${cx}px; top:${skyY}px;
                width: 70px; height: ${beamH}px;
                transform: translate(-50%,0) scaleY(0);
                transform-origin: top center;
                background: linear-gradient(to bottom, transparent 0%, #fff9 15%, ${color} 50%, #fff9 85%, transparent 100%);
                filter: blur(4px);
                opacity: 0; z-index: 10002; pointer-events: none;
            `;
            document.body.appendChild(midGlow);
            allEls.push(midGlow);

            // Lõi sáng — mảnh, trắng chói ở tâm
            const coreBeam = document.createElement('div');
            coreBeam.style.cssText = `
                position: fixed; left:${cx}px; top:${skyY}px;
                width: 20px; height: ${beamH}px;
                transform: translate(-50%,0) scaleY(0);
                transform-origin: top center;
                background: linear-gradient(to bottom, transparent 0%, #fff 25%, #fff 75%, transparent 100%);
                filter: blur(1px) drop-shadow(0 0 18px #fff) drop-shadow(0 0 30px ${color});
                opacity: 0; z-index: 10003; pointer-events: none;
            `;
            document.body.appendChild(coreBeam);
            allEls.push(coreBeam);

            // Bùng sáng trên trời tại điểm xuất phát
            const skyBurst = document.createElement('div');
            skyBurst.style.cssText = `
                position: fixed; left:${cx}px; top:${skyY}px;
                width: 14px; height: 14px; border-radius: 50%;
                background: radial-gradient(circle, #fff 0%, ${color} 70%, transparent 100%);
                transform: translate(-50%,-50%) scale(0);
                opacity: 0; z-index: 10003; pointer-events: none;
            `;
            document.body.appendChild(skyBurst);
            allEls.push(skyBurst);
            skyBurst.animate([
                { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(5)', opacity: 1, offset: 0.25 },
                { transform: 'translate(-50%,-50%) scale(2.5)', opacity: 0 }
            ], { duration: 380, easing: 'ease-out' });

            const dropIn = (el, delay) => el.animate([
                { transform: 'translate(-50%,0) scaleY(0)', opacity: 0 },
                { transform: 'translate(-50%,0) scaleY(1)', opacity: 1, offset: 0.42 },
                { transform: 'translate(-50%,0) scaleY(1)', opacity: 0.9, offset: 0.82 },
                { transform: 'translate(-50%,0) scaleY(1.02)', opacity: 0 }
            ], { duration: 650, delay, easing: 'ease-in' }).finished;

            await Promise.all([
                dropIn(outerGlow, 0),
                dropIn(midGlow, 50),
                dropIn(coreBeam, 90)
            ]);

            // Hạt tàn lửa bay dọc thân cột lên trời — rải suốt thời gian cột tồn tại
            const emberCount = 9;
            for (let i = 0; i < emberCount; i++) {
                const ember = document.createElement('div');
                const ex = cx + (Math.random() - 0.5) * 60;
                const size = 3 + Math.random() * 4;
                const emberDelay = Math.random() * 300;
                ember.style.cssText = `
                    position: fixed; left:${ex}px; top:${groundY}px;
                    width:${size}px; height:${size}px; border-radius:50%;
                    background:#fff; box-shadow:0 0 8px ${color}, 0 0 4px #fff;
                    transform: translate(-50%,-50%) scale(0);
                    opacity: 0; z-index: 10003; pointer-events: none;
                `;
                document.body.appendChild(ember);
                allEls.push(ember);
                ember.animate([
                    { transform: 'translate(-50%,-50%) translateY(0) scale(0.3)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) translateY(-90px) scale(1)', opacity: 1, offset: 0.3 },
                    { transform: `translate(-50%,-50%) translateY(-${beamH * 0.85}px) scale(0.4)`, opacity: 0 }
                ], { duration: 700, delay: emberDelay, fill: 'forwards', easing: 'ease-out' });
            }

            // Bùng nổ dưới chân khi cột chạm đất
            const flare = document.createElement('div');
            flare.style.cssText = `
                position: fixed; left:${cx}px; top:${groundY}px;
                width: 16px; height: 16px; border-radius: 50%;
                background: radial-gradient(circle, #fff 0%, ${color} 60%, transparent 100%);
                transform: translate(-50%,-50%) scale(0);
                opacity: 0; z-index: 10003; pointer-events: none;
            `;
            document.body.appendChild(flare);
            allEls.push(flare);
            flare.animate([
                { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(5)', opacity: 0.9, offset: 0.3 },
                { transform: 'translate(-50%,-50%) scale(7.5)', opacity: 0 }
            ], { duration: 420, easing: 'ease-out' });

            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * 360 + Math.random() * 15;
                const ray = document.createElement('div');
                ray.style.cssText = `
                    position: fixed; left:${cx}px; top:${groundY}px;
                    width: 4px; height: 55px;
                    background: linear-gradient(to top, ${color}, transparent);
                    transform: translate(-50%,-100%) rotate(${ang}deg);
                    transform-origin: 50% 100%;
                    opacity: 0; z-index: 10002; pointer-events: none;
                `;
                document.body.appendChild(ray);
                allEls.push(ray);
                ray.animate([
                    { opacity: 0, transform: `translate(-50%,-100%) rotate(${ang}deg) scaleY(0.4)` },
                    { opacity: 1, transform: `translate(-50%,-100%) rotate(${ang}deg) scaleY(1)`, offset: 0.3 },
                    { opacity: 0, transform: `translate(-50%,-100%) rotate(${ang}deg) scaleY(1.4)` }
                ], { duration: 400, easing: 'ease-out' });
            }

            await new Promise(r => setTimeout(r, 340));
            allEls.forEach(el => el.remove());
        },

        // PHA 2 — vùng sáng lan RỘNG khắp cả sân phe mình: 1 lớp phủ toàn
        // bộ khu vực đội (to gấp 2-3 lần bản cũ) + từng mảng sáng lớn dưới
        // chân mỗi con, đốm lấp lánh xuất hiện thưa rồi dày dần.
        async playGroundSpread(side, sourceIndex, targetIndices, color = '#2ecc71') {
            const container = document.getElementById(`${side}-team-container`);
            const containerRect = container ? container.getBoundingClientRect() : null;
            const allEls = [];

            if (containerRect) {
                // Lớp phủ toàn bộ khu vực đội — to bằng cả sân phe mình, không
                // chỉ 1 vùng nhỏ quanh nguồn nữa.
                const pad = 60;
                const fieldWash = document.createElement('div');
                fieldWash.style.cssText = `
                    position: fixed;
                    left:${containerRect.left - pad}px; top:${containerRect.top - pad}px;
                    width:${containerRect.width + pad * 2}px; height:${containerRect.height + pad * 2}px;
                    background: radial-gradient(ellipse at 50% 65%, ${color}55 0%, ${color}30 40%, ${color}12 65%, transparent 85%);
                    transform: scale(0.4);
                    z-index: 9988; pointer-events:none; opacity:0;
                `;
                document.body.appendChild(fieldWash);
                allEls.push(fieldWash);
                fieldWash.animate([
                    { transform: 'scale(0.4)', opacity: 0 },
                    { transform: 'scale(1)', opacity: 1, offset: 0.5 },
                    { transform: 'scale(1.03)', opacity: 0.75, offset: 0.85 },
                    { transform: 'scale(1.05)', opacity: 0 }
                ], { duration: 950, easing: 'ease-in-out' });
            }

            const ordered = targetIndices.slice().sort((a, b) => Math.abs(a - sourceIndex) - Math.abs(b - sourceIndex));

            const perUnitTasks = ordered.map((idx, order) => {
                const unit = document.getElementById(`${side}-unit-${idx}`);
                if (!unit) return Promise.resolve();

                const { damped } = getUnitMeta(unit);
                // TO GẤP ~3 LẦN bản cũ để phủ rộng khắp khu vực từng con,
                // không còn là 1 quầng nhỏ bó sát chân nữa.
                const patchW = Math.round(BASE_RING_W * damped * 3.2);
                const patchH = Math.round(BASE_RING_H * damped * 3.2);
                const uRect = unit.getBoundingClientRect();
                const cx = uRect.left + uRect.width / 2;
                const cy = uRect.bottom - patchH * 0.22;
                const rippleDelay = order * 100;

                return new Promise((resolve) => {
                    setTimeout(() => {
                        const patch = document.createElement('div');
                        patch.style.cssText = `
                            position: fixed; left:${cx}px; top:${cy}px;
                            width:${patchW}px; height:${patchH}px;
                            transform: translate(-50%,-50%) scale(0.3);
                            border-radius: 50%;
                            background: radial-gradient(ellipse, ${color}dd 0%, ${color}88 40%, ${color}33 65%, transparent 82%);
                            filter: blur(3px);
                            opacity: 0; z-index: 9990; pointer-events:none;
                        `;
                        document.body.appendChild(patch);
                        allEls.push(patch);
                        patch.animate([
                            { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                            { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.95, offset: 0.6 },
                            { transform: 'translate(-50%,-50%) scale(1.08)', opacity: 0.85 }
                        ], { duration: 520, fill: 'forwards', easing: 'ease-out' });

                        // Đốm lấp lánh — nhiều hơn, rải rộng khắp mảng sáng lớn,
                        // xuất hiện thưa dần dày lên theo thời gian.
                        const sparkleCount = 16;
                        for (let i = 0; i < sparkleCount; i++) {
                            const ox = (Math.random() - 0.5) * patchW * 0.85;
                            const oy = (Math.random() - 0.5) * patchH * 0.85;
                            const size = 3 + Math.random() * 5;
                            const appearAt = (i / sparkleCount) * 480;
                            const spark = document.createElement('div');
                            spark.style.cssText = `
                                position: fixed; left:${cx + ox}px; top:${cy + oy}px;
                                width:${size}px; height:${size}px; border-radius:50%;
                                background:#fff; box-shadow:0 0 7px ${color}, 0 0 3px #fff;
                                transform: translate(-50%,-50%) scale(0);
                                opacity:0; z-index:9991; pointer-events:none;
                            `;
                            document.body.appendChild(spark);
                            allEls.push(spark);
                            spark.animate([
                                { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 },
                                { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 1, offset: 0.4 },
                                { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0.85 }
                            ], { duration: 280, delay: appearAt, fill: 'forwards', easing: 'ease-out' });
                        }

                        setTimeout(resolve, 560);
                    }, rippleDelay);
                });
            });

            await Promise.all(perUnitTasks);
            await new Promise(r => setTimeout(r, 180));
            allEls.forEach(el => el.remove());
        },

        // Số "+X" hồi máu nổi lên đầu 1 con — dùng cho Pha 3
        showHealNumber(side, index, amount) {
            const unit = document.getElementById(`${side}-unit-${index}`);
            if (!unit) return;
            const div = document.createElement('div');
            div.textContent = `+${amount}`;
            div.style.cssText = `
                position:absolute; left:50%; top:10%;
                transform:translate(-50%,0);
                color:#4cd964; font-weight:900; font-size:16px;
                text-shadow:1px 1px 2px #000, 0 0 6px rgba(76,217,100,0.8);
                z-index:7; pointer-events:none;
                animation: pkmfx-healnum-float 1.1s ease-out forwards;
            `;
            unit.appendChild(div);
            div.addEventListener('animationend', () => div.remove());
        },


        showSkillName(side, index, text) {
            const st = registry.get(`${side}-${index}`);
            if (!st || !st.skillNameEl) return;

            const el = st.skillNameEl;
            el.textContent = text || '';

            el.classList.remove('playing');
            void el.offsetWidth;
            el.classList.add('playing');

            clearTimeout(st._skillNameTimeout);
            st._skillNameTimeout = setTimeout(() => {
                el.classList.remove('playing');
            }, 1500);
        },

        removeUnit(side, index) {
            const key = `${side}-${index}`;
            const st = registry.get(key);
            if (!st) return;

            if (st._skillNameTimeout) clearTimeout(st._skillNameTimeout);

            [st.groundGroup, st.headGroup].forEach(el => {
                if (el) el.style.display = 'none';
            });

            registry.delete(key);
        }
    };
})();