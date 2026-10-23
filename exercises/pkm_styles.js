(function injectTrainerIdleStyle() {
    if (document.getElementById('pkm-trainer-idle-style')) return;
    const style = document.createElement('style');
    style.id = 'pkm-trainer-idle-style';
    style.textContent = `
        @keyframes pkmTrainerIdleBob {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50%      { transform: translateY(-3px) rotate(0.6deg); }
        }
        @keyframes pkmTrainerHop {
            0%   { transform: translateY(0); }
            40%  { transform: translateY(-14px); }
            100% { transform: translateY(0); }
        }
        .pkm-trainer-idle {
            animation-name: pkmTrainerIdleBob;
            animation-timing-function: ease-in-out;
            animation-iteration-count: infinite;
        }
        .pkm-trainer-hopwrap {
            transform-origin: center bottom;
        }
        .pkm-trainer-hopwrap.pkm-trainer-hop {
            animation: pkmTrainerHop 0.5s ease-in-out;
        }
        .pkm-trainer-flipwrap {
            display: inline-block;
            position: relative;
            transform-origin: center bottom;
        }
        .pkm-trainer-shadow-wrap {
            position: absolute;
            left: 50%;
            bottom: -6px;
            transform: translateX(-50%);
            pointer-events: none;
            z-index: -1;
        }
        .pkm-trainer-shadow {
            display: block;
            transform: scaleY(0.25) skewX(-20deg);
            transform-origin: center bottom;
            filter: brightness(0) opacity(0.38) blur(1.2px);
            mix-blend-mode: multiply;
        }
    `;
    document.head.appendChild(style);
})();

window.PkmStyles = {
    // 3 bộ vị trí tuỳ theo SỐ LƯỢNG Pokémon còn lại trong đội
    positionSets: {
        // ========== 1 CON — đứng CHÍNH GIỮA, cả 2 phe ==========
        solo: {
            ta_1:   { left: 50, top: 80, scale: 1.2, flip: 1 },
            dich_1: { left: 50, top: 32, scale: 1.2, flip: -1 },
        },

        // ========== 2 CON — CHIA ĐỀU 2 BÊN, đối xứng qua tâm ==========
        duo: {
            ta_1:   { left: 32, top: 78, scale: 1.05, flip: 1 },
            ta_2:   { left: 68, top: 78, scale: 1.05, flip: -1 },

            dich_1: { left: 32, top: 32, scale: 1.0,  flip: -1 },
            dich_2: { left: 68, top: 32, scale: 1.0,  flip: 1 },
        },

        // ========== 3 CON — bố cục gốc, giữ nguyên như cũ ==========
        full: {
            // ========== QUÂN TA (dưới - gần) ==========
            ta_1: { left: 18, top: 76, scale: 1.0,  flip: 1 },
            ta_2: { left: 50, top: 84, scale: 1.08, flip: -0.7 },
            ta_3: { left: 82, top: 76, scale: 1.0,  flip: -1 },

            // ========== QUÂN ĐỊCH (trên - xa) ==========
            dich_1: { left: 18, top: 32, scale: 0.95, flip: -1 },
            dich_2: { left: 50, top: 28, scale: 1.0,  flip: -0.7 },
            dich_3: { left: 82, top: 32, scale: 0.95, flip: 1 },
        },
    },

    // Kích thước hiển thị CỐ ĐỊNH cho mọi Pokemon (không phụ thuộc size ảnh gốc)
    UNIT_SIZE: 80, // px

    // ══════════════════════════════════════════════════════
    // HUẤN LUYỆN VIÊN
    // - Phe TA (player): KHÔNG hiển thị trainer đứng trên sân — chỉ dùng
    //   Red trong banner tên chiêu (pkm_skill_aoe.js gọi getTrainerUrl).
    // - Phe ĐỊCH (enemy): random 1 trainer KHÁC Red cho mỗi vị trí (0,1,2)
    //   NGAY KHI TRẬN BẮT ĐẦU, giữ CỐ ĐỊNH suốt trận, và đứng ở 1 phần tử
    //   HOÀN TOÀN TÁCH RỜI khỏi .pkm-unit — không bị ảnh hưởng bởi mọi
    //   animation đánh/trúng chiêu/AOE của Pokémon.
    // ══════════════════════════════════════════════════════
    trainerList: [
        'blue','brock','misty','ltsurge','erika','koga','sabrina','blaine',
        'giovanni','lance','steven','wallace','cynthia','alder','iris',
        'diantha','green','ethan','lyra','lucas'
    ],

    enemyTrainerAssignment: {}, // { 0: 'brock', 1: 'misty', 2: 'lance', ... }
    _trainerJumpTimers: {},     // { 'enemy-0': timeoutId, ... } — dọn khi bắt đầu trận mới

    // Gọi 1 LẦN khi bắt đầu trận để chốt cố định trainer cho từng vị trí
    // quân địch suốt trận, đồng thời dọn sạch timer nhảy trái/phải của
    // trận trước (tránh rò rỉ interval chạy ngầm mãi qua nhiều trận).
    assignEnemyTrainers(teamSize) {
        Object.values(this._trainerJumpTimers).forEach(t => clearTimeout(t));
        this._trainerJumpTimers = {};

        this.enemyTrainerAssignment = {};
        const pool = [...this.trainerList];
        for (let i = 0; i < teamSize; i++) {
            const randIdx = Math.floor(Math.random() * pool.length);
            this.enemyTrainerAssignment[i] = pool[randIdx];
            pool.splice(randIdx, 1);
            if (pool.length === 0) pool.push(...this.trainerList);
        }
    },

    // Lấy URL ảnh trainer theo side + index — dùng cho cả trainer đứng
    // trên sân (enemy) và banner tên chiêu (player luôn là Red).
    getTrainerUrl(side, index) {
        if (side === 'player') {
            return `https://play.pokemonshowdown.com/sprites/trainers/red.png`;
        }
        const name = this.enemyTrainerAssignment[index] || this.trainerList[0];
        return `https://play.pokemonshowdown.com/sprites/trainers/${name}.png`;
    },

    // Chọn đúng bộ vị trí (solo/duo/full) dựa theo số lượng Pokémon trong đội
    getPosition(side, index, teamSize) {
        const setKey = teamSize === 1 ? 'solo' : teamSize === 2 ? 'duo' : 'full';
        const key = side === 'player' ? `ta_${index + 1}` : `dich_${index + 1}`;
        const set = this.positionSets[setKey];
        return set[key] || this.positionSets.full[key] || this.positionSets.full[side === 'player' ? 'ta_1' : 'dich_1'];
    },

    // Lấy đường dẫn ảnh GIF Pokémon
    getImageUrl(pkm, side) {
        const folder = side === 'player' ? 'ani-back' : 'ani';
        const cleanName = pkm.name.toLowerCase().replace(/\s+/g, '');
        return `https://play.pokemonshowdown.com/sprites/${folder}/${cleanName}.gif`;
    },

    getBodyScale(heightDecimeter) {
        const heightM = (heightDecimeter || 10) / 10;
        const baseline = 1.0;
        const raw = Math.sqrt(heightM / baseline);
        return Math.min(1.3, Math.max(0.85, raw));
    },

    // ══════════════════════════════════════════════════════
    // TRAINER NHẢY TRÁI/PHẢI ĐỊNH KỲ + LẬT MẶT ĐÚNG HƯỚNG
    // Quy tắc lật: ảnh gốc (chưa flip) mặc định quay MẶT SANG TRÁI.
    // - Trainer đứng bên PHẢI Pokémon (dir=1)  -> cần quay mặt sang TRÁI
    //   (vào Pokémon) -> giữ nguyên, KHÔNG mirror -> scaleX(1).
    // - Trainer đứng bên TRÁI Pokémon (dir=-1) -> cần quay mặt sang PHẢI
    //   (vào Pokémon) -> mirror -> scaleX(-1).
    // => flip luôn ĐÚNG BẰNG dir hiện tại (dir=1 -> scaleX(1), dir=-1 -> scaleX(-1)).
    // Khi nhảy sang bên kia, dir đảo dấu -> flip tự đảo theo, không cần
    // tính riêng.
    // ══════════════════════════════════════════════════════
    _scheduleTrainerJump(side, index) {
        const key = `${side}-${index}`;
        const delay = 15000 + Math.random() * 15000; // 4-8s giữa mỗi lần nhảy
        this._trainerJumpTimers[key] = setTimeout(() => {
            this._doTrainerJump(side, index);
            this._scheduleTrainerJump(side, index); // hẹn lần nhảy tiếp theo
        }, delay);
    },

    _doTrainerJump(side, index) {
        const root = document.getElementById(`${side}-trainer-${index}`);
        if (!root) return; // unit đã bị xoá (đổi màn hình / trận đấu kết thúc)

        const hopWrap = root.querySelector('.pkm-trainer-hopwrap');
        const flipWrap = root.querySelector('.pkm-trainer-flipwrap');
        if (!hopWrap || !flipWrap) return;

        const baseLeft = parseFloat(root.dataset.baseLeft);
        const offsetMag = parseFloat(root.dataset.offset);
        const curDir = parseFloat(root.dataset.dir) || 1;
        const newDir = -curDir;
        root.dataset.dir = newDir;

        root.style.transition = 'left 0.5s ease-in-out';
        root.style.left = `${baseLeft + newDir * offsetMag}%`;
        flipWrap.style.transform = `scaleX(${newDir})`;

        hopWrap.classList.remove('pkm-trainer-hop');
        void hopWrap.offsetWidth; // ép reflow để animation chạy lại từ đầu
        hopWrap.classList.add('pkm-trainer-hop');
    },

    // ══════════════════════════════════════════════════════
    // RENDER TRAINER — phần tử HOÀN TOÀN TÁCH RỜI khỏi .pkm-unit,
    // id riêng (${side}-trainer-${index}), không bị bất kỳ code hiệu
    // ứng nào của Pokémon (skill/AOE/knockback/shake) chạm tới.
    // Có bóng đổ riêng, độ nhấp nhô (thở) random mỗi con, và tự nhảy
    // trái/phải định kỳ (kèm lật mặt đúng hướng).
    // CHỈ áp dụng cho phe địch — phe ta không hiển thị trainer trên sân.
    // ══════════════════════════════════════════════════════
    renderTrainer(side, index, teamSize) {
        if (side !== 'enemy') return ''; // phe ta không có trainer đứng trên sân

        const pos = this.getPosition(side, index, teamSize || 3);
        const trainerUrl = this.getTrainerUrl(side, index);

        // Random đứng bên TRÁI hoặc PHẢI Pokémon ngay từ đầu
        const sideRand = Math.random() < 0.5 ? -1 : 1;
        const horizOffset = sideRand * 10;

        const topOffset = -3;
        const trainerLeft = pos.left + horizOffset;
        const trainerTop = pos.top + topOffset;
        const trainerScale = 1.01;

        // Độ nhấp nhô hô hấp RIÊNG từng con — random duration/delay
        const idleDur = (1.8 + Math.random() * 1.6).toFixed(2);
        const idleDelay = (Math.random() * 2).toFixed(2);

        // Hẹn giờ nhảy trái/phải cho trainer này ngay sau khi DOM có mặt
        setTimeout(() => this._scheduleTrainerJump(side, index), 50);

        return `
            <div id="${side}-trainer-${index}"
                 data-base-left="${pos.left}"
                 data-offset="${Math.abs(horizOffset)}"
                 data-dir="${sideRand}"
                 style="position:absolute;
                        left:${trainerLeft}%;
                        top:${trainerTop}%;
                        transform:translate(-50%,-50%) scale(${trainerScale});
                        transform-origin:center bottom;
                        z-index:0;
                        pointer-events:none;">
                <div class="pkm-trainer-hopwrap">
                    <div class="pkm-trainer-flipwrap" style="transform:scaleX(${sideRand});">
                        <div class="pkm-trainer-shadow-wrap">
                            <img class="pkm-trainer-shadow" src="${trainerUrl}" alt="">
                        </div>
                        <img src="${trainerUrl}" class="pkm-trainer-idle"
                             style="display:block; animation-duration:${idleDur}s; animation-delay:${idleDelay}s;
                                    filter:drop-shadow(0 4px 6px rgba(0,0,0,0.5));"
                             alt="trainer">
                    </div>
                </div>
            </div>
        `;
    },

    // Render từng Pokemon — nhận thêm teamSize để biết dùng bộ vị trí nào
    renderUnit(pkm, index, side, teamSize) {
        const hpPct = Math.max(0, (pkm.currentHp / pkm.maxHp) * 100);
        const hpColor = hpPct > 50 ? '#2ecc71' : hpPct > 25 ? '#f1c40f' : '#e74c3c';

        const pos = this.getPosition(side, index, teamSize || 3);
        const bodyScale = this.getBodyScale(pkm.height);
        const finalScale = pos.scale * bodyScale;
        const imgUrl = this.getImageUrl(pkm, side);
        const fallbackUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pkm.id}.png`;
        const zIndex = side === 'player' ? 2 : 1;
        const size = this.UNIT_SIZE;

        // data-type: dùng cho pkm_skill_effect.js để quyết định vị trí bóng
        // (đứng đất bám sát chân, hệ Bay giữ khoảng cách xa hơn).
        return `
            <div class="pkm-unit"
                 id="${side}-unit-${index}"
                 data-left="${pos.left}"
                 data-top="${pos.top}"
                 data-scale="${finalScale}"
                 data-flip="${pos.flip}"
                 data-type="${pkm.type || 'normal'}"
                 style="position:absolute;
                        left:${pos.left}%;
                        top:${pos.top}%;
                        transform:translate(-50%,-50%);
                        z-index:${zIndex};
                        display:flex;
                        flex-direction:column;
                        align-items:center;">

                <div style="transform:scale(${finalScale}) scaleX(${pos.flip}); transform-origin:center bottom;">
                    <div style="width:${size}px; height:${size}px; display:flex; align-items:center; justify-content:center;">
                        <img src="${imgUrl}"
                             style="max-width:${size}px; max-height:${size}px; width:auto; height:auto;
                                    object-fit:contain; filter:drop-shadow(0 5px 10px black); display:block;"
                             onerror="this.src='${fallbackUrl}'"
                             alt="${pkm.name}">
                    </div>
                </div>

                <div style="margin-top:4px; width:70px;">
                    <div style="height:5px; background:#333; border-radius:3px; overflow:hidden;">
                        <div id="${side}-hp-fill-${index}"
                             style="width:${hpPct}%; height:100%; background:${hpColor}; transition:width 0.3s;">
                        </div>
                    </div>
                    <div id="${side}-hp-text-${index}"
                         style="font-size:9px; text-align:center; margin-top:2px; color:rgba(255,255,255,0.85);">
                        ${Math.max(0, pkm.currentHp)}/${pkm.maxHp}
                    </div>
                </div>
            </div>
        `;
    }
};