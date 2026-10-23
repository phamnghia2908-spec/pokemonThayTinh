/**
 * ==========================================================
 * PKM PRE-BATTLE — MÀN HÌNH XEM TRƯỚC ĐỘI ĐỊCH (LUÔN KHẮC HỆ)
 * ==========================================================
 * - Đọc đội hình gốc (pkm_inventory, inTeam=true) NGAY LÚC VÀO TRẬN.
 * - Với MỖI vị trí, chọn 1 Pokémon địch thuộc hệ KHẮC hệ của con
 *   tương ứng bên mình (đúng từng vị trí) — dùng window.PkmTypeChart.
 * - Hiển thị đội địch đã chốt (KHÔNG đổi nữa) + cho phép đổi thứ tự /
 *   đổi loài Pokémon trong đội mình (số ô GIỮ NGUYÊN bằng số con ban đầu).
 * - Bấm "BẮT ĐẦU TRẬN": lưu đội hình mới, gán enemy preview đã chốt,
 *   rồi gọi window.BattleGame.init().
 * ==========================================================
 */
window.PkmPreBattle = (() => {

    function injectStyles() {
        if (document.getElementById('pkm-prebattle-style')) return;
        const style = document.createElement('style');
        style.id = 'pkm-prebattle-style';
        style.textContent = `
            #pkmPrebattleOverlay {
                position: fixed; inset: 0; z-index: 200000;
                background: radial-gradient(circle, #1a1c28 0%, #0a0c16 100%);
                display: flex; flex-direction: column;
                align-items: center; justify-content: flex-start;
                padding: 16px; box-sizing: border-box;
                overflow-y: auto; font-family: system-ui, -apple-system, sans-serif;
                color: #fff;
            }
            .pkmpb-title {
                color: #ffcb05; font-weight: 900; font-size: 1.1rem;
                margin: 6px 0 14px; text-align: center; letter-spacing: 1px;
            }
            .pkmpb-section-label {
                width: 100%; max-width: 640px; color: #ffcb05; font-weight: bold;
                font-size: 0.85rem; margin: 10px 0 8px; text-transform: uppercase;
                border-bottom: 1px solid rgba(255,203,5,0.3); padding-bottom: 4px;
            }
            .pkmpb-row {
                width: 100%; max-width: 640px; display: flex; gap: 10px;
                justify-content: center; flex-wrap: wrap; margin-bottom: 10px;
            }
            .pkmpb-enemy-card {
                width: 100px; background: rgba(255,255,255,0.06);
                border: 2px solid #e74c3c; border-radius: 14px; padding: 8px;
                text-align: center;
            }
            .pkmpb-enemy-card img { width: 64px; height: 64px; object-fit: contain; }
            .pkmpb-enemy-name { font-size: 0.75rem; font-weight: bold; margin-top: 4px; color: #fff; }
            .pkmpb-enemy-type { font-size: 0.65rem; color: #ff8a80; text-transform: uppercase; }
            .pkmpb-enemy-counter { font-size: 0.6rem; color: #4cd964; margin-top: 2px; }

            .pkmpb-slot {
                width: 90px; height: 110px; background: rgba(255,255,255,0.05);
                border: 2px dashed rgba(255,203,5,0.5); border-radius: 14px;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                cursor: pointer; position: relative; text-align: center; padding: 4px; box-sizing: border-box;
            }
            .pkmpb-slot.filled { border-style: solid; border-color: #2ecc71; background: rgba(46,204,113,0.08); }
            .pkmpb-slot.highlight { border-color: #ffcb05; background: rgba(255,203,5,0.12); }
            .pkmpb-slot img { width: 54px; height: 54px; object-fit: contain; }
            .pkmpb-slot .pkmpb-slot-name { font-size: 0.7rem; font-weight: bold; margin-top: 2px; }
            .pkmpb-slot .pkmpb-slot-pos { font-size: 0.6rem; color: #aaa; }
            .pkmpb-slot .pkmpb-remove {
                position: absolute; top: 2px; right: 2px; width: 18px; height: 18px;
                background: #e74c3c; color: #fff; border: none; border-radius: 50%;
                font-size: 12px; line-height: 18px; cursor: pointer; padding: 0;
            }

            .pkmpb-inventory-grid {
                width: 100%; max-width: 640px; display: grid;
                grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
                gap: 8px; margin-bottom: 16px;
            }
            .pkmpb-inv-item {
                background: rgba(255,255,255,0.05); border: 2px solid #444; border-radius: 12px;
                padding: 6px; text-align: center; cursor: pointer; position: relative;
            }
            .pkmpb-inv-item.selected { border-color: #ffcb05; background: rgba(255,203,5,0.12); }
            .pkmpb-inv-item.in-team { opacity: 0.35; }
            .pkmpb-inv-item img { width: 44px; height: 44px; object-fit: contain; }
            .pkmpb-inv-item .pkmpb-inv-name { font-size: 0.65rem; font-weight: bold; margin-top: 2px; }
            .pkmpb-inv-item .pkmpb-inv-type { font-size: 0.55rem; color: #7ed6ff; text-transform: uppercase; }

            .pkmpb-slot-type { font-size: 0.6rem; color: #7ed6ff; text-transform: uppercase; margin-top: 1px; }
            .pkmpb-slot-counter { font-size: 0.55rem; color: #4cd964; margin-top: 1px; line-height: 1.2; }

            .pkmpb-bonus-note {
                width: 100%; max-width: 640px; text-align: center; color: #ffd54f;
                font-size: 0.72rem; margin: 2px 0 6px; opacity: 0.85;
            }

            .pkmpb-hint {
                width: 100%; max-width: 640px; text-align: center; color: #ffd54f;
                font-size: 0.8rem; min-height: 18px; margin-bottom: 10px;
            }

            #pkmpbStartBtn {
                padding: 14px 40px; background: #2ecc71; color: #fff; border: none;
                border-radius: 30px; font-weight: 900; font-size: 1rem; cursor: pointer;
                margin: 10px 0 30px; box-shadow: 0 6px 18px rgba(46,204,113,0.4);
            }
            #pkmpbStartBtn:disabled { background: #555; cursor: not-allowed; box-shadow: none; }
        `;
        document.head.appendChild(style);
    }

    function loadInventory() {
        return JSON.parse(localStorage.getItem('pkm_inventory')) || [];
    }
    function saveInventory(inv) {
        localStorage.setItem('pkm_inventory', JSON.stringify(inv));
    }
    function spriteUrl(id) {
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
    }

    let selectedUid = null;

    async function buildEnemyPreview(originalTeam) {
        if (window.PkmTypeChart?.ensureLoaded) {
            await window.PkmTypeChart.ensureLoaded();
        }

        const results = [];
        for (const p of originalTeam) {
            let counter = { id: Math.floor(Math.random() * 649) + 1, type: 'normal' };
            if (window.PkmTypeChart?.pickCounterId) {
                counter = await window.PkmTypeChart.pickCounterId(p.type || 'normal');
            }

            let name = 'Unknown', height = 10;
            try {
                const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${counter.id}`);
                const data = await res.json();
                name = data.name.charAt(0).toUpperCase() + data.name.slice(1);
                height = data.height;
            } catch (e) { /* giữ giá trị mặc định nếu lỗi mạng */ }

            results.push({
                id: counter.id,
                type: counter.type,           // hệ ép cứng để đảm bảo LUÔN khắc hệ
                counters: p.type || 'normal',  // hệ phe ta mà nó khắc (chỉ để hiển thị)
                name, height,
            });
        }
        return results;
    }

    function renderEnemyRow(container, enemyPreview) {
        container.innerHTML = '';
        enemyPreview.forEach((e) => {
            const allCounters = (window.PkmTypeChart?.getCounters(e.type) || []);
            const countersText = allCounters.length ? allCounters.join(', ') : '—';

            const card = document.createElement('div');
            card.className = 'pkmpb-enemy-card';
            card.innerHTML = `
                <img src="${spriteUrl(e.id)}" alt="${e.name}">
                <div class="pkmpb-enemy-name">${e.name}</div>
                <div class="pkmpb-enemy-type">${e.type}</div>
                <div class="pkmpb-enemy-counter">⚔️ khắc: ${countersText}</div>
            `;
            container.appendChild(card);
        });
    }

    function calcCP(pkm) {
        if (!pkm || !pkm.baseStats) return 0;
        const hp = pkm.baseStats.hp || 0, atk = pkm.baseStats.atk || 0,
              def = pkm.baseStats.def || 0, sAtk = pkm.baseStats.sAtk || 0;
        const baseCP = (hp * 15) + (def * 17.6) + (atk * 20) + (sAtk * 28.8);
        const levelBonus = 1 + ((pkm.lv || 1) - 1) * 0.1;
        return Math.floor(baseCP * levelBonus);
    }

    function renderTeamEditor(slotsContainer, invContainer, hintEl, startBtn, inventory, numSlots) {
        const team = inventory.filter(p => p.inTeam).sort((a, b) => a.position - b.position);

        slotsContainer.innerHTML = '';
        for (let pos = 1; pos <= numSlots; pos++) {
            const pkm = team.find(p => p.position === pos);
            const slot = document.createElement('div');
            slot.className = 'pkmpb-slot' + (pkm ? ' filled' : '') + (!pkm && selectedUid ? ' highlight' : '');

            if (pkm) {
                const pType = pkm.type || 'normal';
                const counters = (window.PkmTypeChart?.getCounters(pType) || []);
                const countersText = counters.length ? counters.join(', ') : '—';
                slot.innerHTML = `
                    <button class="pkmpb-remove" data-uid="${pkm.uid}">×</button>
                    <img src="${spriteUrl(pkm.id)}" alt="${pkm.name}">
                    <div class="pkmpb-slot-name">${pkm.name}</div>
                    <div class="pkmpb-slot-type">${pType}</div>
                    <div class="pkmpb-slot-pos">Vị trí ${pos} · CP ${calcCP(pkm).toLocaleString()}</div>
                    <div class="pkmpb-slot-counter">⚔️ khắc: ${countersText}</div>
                `;
            } else {
                slot.innerHTML = `<div class="pkmpb-slot-pos">Vị trí ${pos}<br>(trống)</div>`;
            }

            slot.onclick = (e) => {
                if (e.target.classList.contains('pkmpb-remove')) return;
                if (!selectedUid) return;
                const src = inventory.find(p => p.uid === selectedUid);
                if (!src) return;

                const occupied = team.find(p => p.position === pos);
                if (occupied) { occupied.inTeam = false; occupied.position = null; }

                src.inTeam = true;
                src.position = pos;
                selectedUid = null;
                saveInventory(inventory);
                renderTeamEditor(slotsContainer, invContainer, hintEl, startBtn, inventory, numSlots);
            };

            slotsContainer.appendChild(slot);
        }

        slotsContainer.querySelectorAll('.pkmpb-remove').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const uid = btn.dataset.uid;
                const pkm = inventory.find(p => p.uid === uid);
                if (pkm) { pkm.inTeam = false; pkm.position = null; }
                saveInventory(inventory);
                renderTeamEditor(slotsContainer, invContainer, hintEl, startBtn, inventory, numSlots);
            };
        });

            invContainer.innerHTML = '';
            inventory.forEach(pkm => {
                const item = document.createElement('div');
                item.className = 'pkmpb-inv-item' + (pkm.uid === selectedUid ? ' selected' : '') + (pkm.inTeam ? ' in-team' : '');
                item.innerHTML = `
                    <img src="${spriteUrl(pkm.id)}" alt="${pkm.name}">
                    <div class="pkmpb-inv-name">${pkm.name}</div>
                    <div class="pkmpb-inv-type">${pkm.type || 'normal'}</div>
                `;
            item.onclick = () => {
                selectedUid = (selectedUid === pkm.uid) ? null : pkm.uid;
                renderTeamEditor(slotsContainer, invContainer, hintEl, startBtn, inventory, numSlots);
            };
            invContainer.appendChild(item);
        });

        const currentFilled = inventory.filter(p => p.inTeam).length;
        hintEl.textContent = selectedUid
            ? '✅ Đã chọn — bấm vào 1 ô đội hình để đặt vào'
            : (currentFilled < numSlots ? `Cần xếp đủ ${numSlots} Pokémon vào đội` : '');
        startBtn.disabled = currentFilled < numSlots;
    }

    async function begin() {
        injectStyles();

        const inventory = loadInventory();

        if (inventory.length === 0) {
            // Không phụ thuộc window.BattleGame ở đây vì pkm_battle.js
            // (script load SAU pkm_prebattle.js) có thể chưa kịp nạp xong
            // tại thời điểm này (nhánh này chạy đồng bộ, không có await).
            alert("Đội hình trống!");
            window.location.href = 'pkm_team.html';
            return;
        }

        // SỐ SLOT BẮT BUỘC: đúng bằng số Pokémon đang có, tối đa 3.
        const numSlots = Math.min(3, inventory.length);

        // Dọn đội hình nếu có con đang xếp vượt quá numSlots hiện tại
        inventory.forEach(p => {
            if (p.inTeam && p.position > numSlots) { p.inTeam = false; p.position = null; }
        });

        // Tự động lấp đủ numSlots vị trí bằng Pokémon còn trống trong kho
        // (đảm bảo LUÔN đủ quân để tính đội địch khắc hệ) — người chơi
        // vẫn có thể đổi lại ở bước chỉnh sửa đội hình phía sau.
        let currentTeam = inventory.filter(p => p.inTeam).sort((a, b) => a.position - b.position);
        if (currentTeam.length < numSlots) {
            const usedPositions = new Set(currentTeam.map(p => p.position));
            const bench = inventory.filter(p => !p.inTeam);
            let benchIdx = 0;
            for (let pos = 1; pos <= numSlots; pos++) {
                if (usedPositions.has(pos)) continue;
                const filler = bench[benchIdx++];
                if (!filler) break;
                filler.inTeam = true;
                filler.position = pos;
            }
            saveInventory(inventory);
            currentTeam = inventory.filter(p => p.inTeam).sort((a, b) => a.position - b.position);
        }

        const originalTeam = currentTeam;

        const overlay = document.createElement('div');
        overlay.id = 'pkmPrebattleOverlay';
        overlay.innerHTML = `<div class="pkmpb-title">⏳ Đang chuẩn bị đối thủ...</div>`;
        document.body.appendChild(overlay);

        const enemyPreview = await buildEnemyPreview(originalTeam);

        overlay.innerHTML = `
            <div class="pkmpb-title">⚔️ ĐỘI HÌNH ĐỐI THỦ (LUÔN KHẮC HỆ ĐỘI BẠN)</div>
            <div class="pkmpb-row" id="pkmpbEnemyRow"></div>

            <div class="pkmpb-section-label">Đội hình của bạn — có thể đổi vị trí / đổi loài</div>
            <div class="pkmpb-bonus-note">💡 Nếu hệ của bạn khắc hệ đối thủ (hoặc ngược lại), bên khắc sẽ +10% sát thương khi ra đòn</div>
            <div class="pkmpb-row" id="pkmpbSlots"></div>

            <div class="pkmpb-section-label">Kho Pokémon — bấm chọn rồi bấm vào 1 ô đội hình</div>
            <div class="pkmpb-inventory-grid" id="pkmpbInventory"></div>

            <div class="pkmpb-hint" id="pkmpbHint"></div>
            <button id="pkmpbStartBtn">⚔️ BẮT ĐẦU TRẬN</button>
        `;

        const enemyRow = document.getElementById('pkmpbEnemyRow');
        const slotsEl = document.getElementById('pkmpbSlots');
        const invEl = document.getElementById('pkmpbInventory');
        const hintEl = document.getElementById('pkmpbHint');
        const startBtn = document.getElementById('pkmpbStartBtn');

        renderEnemyRow(enemyRow, enemyPreview);
        renderTeamEditor(slotsEl, invEl, hintEl, startBtn, inventory, numSlots);

        startBtn.onclick = () => {
            window.__pkmPrebattleEnemyPreview = enemyPreview;
            overlay.remove();
            window.BattleGame.init();
        };
    }

    return { begin };
})();

window.PkmPreBattle.begin();