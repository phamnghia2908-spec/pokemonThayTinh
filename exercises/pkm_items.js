/**
 * ==========================================
 * POKEMON RPG INVENTORY SYSTEM - TEAM BUFF LINKED
 * ==========================================
 */

const TYPES = [
    { id: 'helmet',  name: 'Giáp mũ' }, 
    { id: 'armor',   name: 'Giáp thân' },
    { id: 'belt',    name: 'Thắt lưng' },
    { id: 'shoes',   name: 'Giày' },
    { id: 'earring', name: 'Khuyên tai' }, 
    { id: 'cloak',   name: 'Áo choàng' },
    { id: 'gloves',  name: 'Găng tay' },
    { id: 'weapon',  name: 'Bóng' }
];

const RANKS = [
    { id: 'silver', n: 'Bạc', b: 0.02, c: '#bdc3c7', priceMult: 1 }, 
    { id: 'gold', n: 'Vàng', b: 0.03, c: '#f1c40f', priceMult: 2.5 }, 
    { id: 'red', n: 'Đỏ', b: 0.04, c: '#e74c3c', priceMult: 5 }, 
    { id: 'orange', n: 'Cam', b: 0.05, c: '#f39c12', priceMult: 10 }
];

const ALL_ITEMS = []; 
TYPES.forEach(t => {
    RANKS.forEach(r => {
        ALL_ITEMS.push({
            id: `${t.id}_${r.id}`, 
            name: `${t.name} ${r.n}`, 
            type: t.id, 
            rankId: r.id, 
            bonus: r.b, 
            color: r.c,
            buyPrice: Math.floor(100 * r.priceMult)
        });
    });
});

// Hàm tính CP nguyên bản từ hệ thống
function calculatePkmCP(pkm) {
    if (!pkm || !pkm.baseStats) return 0;
    const hp = pkm.baseStats.hp || 0;
    const atk = pkm.baseStats.atk || 0;
    const def = pkm.baseStats.def || 0;
    const sAtk = pkm.baseStats.sAtk || 0; 
    const baseCP = (hp * 15) + (def * 17.6) + (atk * 20) + (sAtk * 28.8);
    const levelBonus = 1 + (pkm.lv - 1) * 0.1; 
    return Math.floor(baseCP * levelBonus);
}

// Bê nguyên lõi kiểm tra Buff từ pkm_team.js sang để đồng bộ dữ liệu chuẩn xác
function checkTeamBuffBonus(team) {
    if (team.length < 3) return { active: false, bonusPercent: 0, text: 'Không kích hoạt' };

    const types = team.map(p => p.type || 'normal');
    const typeCounts = {};
    types.forEach(t => typeCounts[t] = (typeCounts[t] || 0) + 1);

    const maxSame = Math.max(...Object.values(typeCounts));
    const uniqueTypes = [...new Set(types)].length;

    if (maxSame >= 3) {
        return { active: true, bonusPercent: 0.05, text: '🌈 Buff Đồng Nhất (+5%)' };
    } else if (uniqueTypes >= 4) {
        return { active: true, bonusPercent: 0.05, text: '🔥 Buff Đa Dạng (+5%)' };
    }
    return { active: false, bonusPercent: 0, text: 'Không kích hoạt' };
}

/**
 * Hàm dựng và cập nhật toàn bộ giao diện kèm tính toán chiến lực gia trì nâng cao
 */
function renderInventory() {
    const dv = parseInt(localStorage.getItem('pkm_global_dv')) || 0;
    const ownedIds = JSON.parse(localStorage.getItem('pkm_owned_ids')) || [];
    const equipped = JSON.parse(localStorage.getItem('pkm_equipped')) || {}; 

    // Đọc túi sinh vật ra trận từ pkm_team.js
    const teamInventory = JSON.parse(localStorage.getItem('pkm_inventory')) || [];
    const activeTeam = teamInventory.filter(p => p.inTeam);

    const dvDisplay = document.getElementById('dv-display');
    if (dvDisplay) dvDisplay.innerText = dv.toLocaleString();

    let totalGearBuffPercent = 0;

    // ── RENDER CÁC Ô TRANG BỊ MẶC TRÊN NGƯỜI ──
    TYPES.forEach(t => {
        const slotEl = document.getElementById(`slot-${t.id}`);
        if (!slotEl) return;

        const itemId = equipped[t.id];
        const item = ALL_ITEMS.find(i => i.id === itemId);

        if (item) {
            slotEl.classList.add('active');
            slotEl.style.borderColor = item.color;
            slotEl.style.boxShadow = `0 0 14px ${item.color}, inset 0 2px 8px rgba(0,0,0,0.8)`;
            slotEl.innerHTML = `
                ${GearSystem.getIcon(item.type, item.rankId, 54)}
                <span class="remove-tag" onclick="unequip(event, '${t.id}')">✖</span>
                <div class="gear-tooltip" style="color:${item.color}">${item.name} (+${item.bonus * 100}%)</div>
            `;
            totalGearBuffPercent += item.bonus;
        } else {
            slotEl.classList.remove('active');
            slotEl.style.borderColor = '';
            slotEl.style.boxShadow = '';
            slotEl.innerHTML = '';
        }
    });

    // ── XỬ LÝ ĐỒNG BỘ CHIẾN LỰC GỐC + BUFF TEAM 5% + BUFF ĐỒ ──
    let baseTeamCP = 0;
    activeTeam.forEach(pkm => {
        baseTeamCP += calculatePkmCP(pkm);
    });

    // 1. Kiểm tra kích hoạt Buff đội hình từ pkm_team.js
    const teamBuffResult = checkTeamBuffBonus(activeTeam);
    const teamBuffCPBonus = Math.floor(baseTeamCP * teamBuffResult.bonusPercent);

    // 2. Tổng CP sau khi đã cộng Buff Đội hình (Đây là mốc để Đồ cộng thêm %)
    const cpAfterTeamBuff = baseTeamCP + teamBuffCPBonus;

    // 3. Tính lượng CP gia trì thêm từ Trang Bị đang mặc
    const gearBonusCP = Math.floor(cpAfterTeamBuff * totalGearBuffPercent);

    // 4. Lực chiến tổng cuối cùng hiển thị lên màn hình
    const finalTeamCP = cpAfterTeamBuff + gearBonusCP;

    const statPanel = document.getElementById('stat-panel');
    if (statPanel) {
        statPanel.innerHTML = `
            <div class="stat-row">
                <span>Số Pokémon ra trận:</span>
                <span class="stat-val">${activeTeam.length}/5 con</span>
            </div>
            <div class="stat-row">
                <span>Chiến lực Pokémon gốc:</span>
                <span class="stat-val">${baseTeamCP.toLocaleString()} CP</span>
            </div>
            <div class="stat-row">
                <span>Buff Đội Hình kích hoạt:</span>
                <span class="buff-val" style="color: ${teamBuffResult.active ? '#2ecc71' : '#64748b'}">
                    ${teamBuffResult.text} ${teamBuffResult.active ? `(+${teamBuffCPBonus.toLocaleString()} CP)` : ''}
                </span>
            </div>
            <div class="stat-row">
                <span>Gia trì từ Trang bị:</span>
                <span class="buff-val" style="color: #f1c40f">+${(totalGearBuffPercent * 100).toFixed(0)}% (+${gearBonusCP.toLocaleString()} CP)</span>
            </div>
            <div class="total-cp-box">
                ⚔️ TỔNG LỰC CHIẾN ĐỘI: <span style="color:#ffbc00; font-size: 1.2rem; text-shadow: 0 0 10px rgba(241,196,15,0.3);">${finalTeamCP.toLocaleString()}</span>
            </div>
        `;
    }

    // ── RENDER TÚI ĐỒ VẬT PHẨM DỰ TRỮ ──
    const bagContainer = document.getElementById('bag-grid');
    if (bagContainer) {
        const equippedIds = Object.values(equipped);

        if (ownedIds.length === 0) {
            bagContainer.innerHTML = `<div style="color: #64748b; grid-column: 1/-1; text-align: center; padding: 40px 0; font-size:0.9rem;">Hòm đồ dự trữ trống rỗng...</div>`;
            return;
        }

        bagContainer.innerHTML = ownedIds.map(id => {
            const item = ALL_ITEMS.find(i => i.id === id);
            if (!item) return ''; 

            const isEquipped = equippedIds.includes(id);
            const sellPrice = Math.floor(item.buyPrice / 2);

            return `
                <div class="item-box ${isEquipped ? 'equipped' : ''}" onclick="handleBoxClick(event, '${id}', ${isEquipped})">
                    ${GearSystem.getIcon(item.type, item.rankId, 48)}
                    <div class="item-title" style="color:${item.color}">${item.name}</div>
                    <button class="sell-btn" onclick="sellItem(event, '${id}')">
                        BÁN (+${sellPrice})
                    </button>
                </div>
            `;
        }).join('');
    }
}

window.handleBoxClick = function(event, id, isEquipped) {
    if (event.target.classList.contains('sell-btn')) return;
    if (!isEquipped) {
        const item = ALL_ITEMS.find(i => i.id === id);
        if (!item) return;

        let equipped = JSON.parse(localStorage.getItem('pkm_equipped')) || {};
        equipped[item.type] = id;
        localStorage.setItem('pkm_equipped', JSON.stringify(equipped));
        renderInventory();
    }
};

window.unequip = function(event, type) {
    if(event) event.stopPropagation(); 
    let equipped = JSON.parse(localStorage.getItem('pkm_equipped')) || {};
    if (equipped[type]) {
        delete equipped[type];
        localStorage.setItem('pkm_equipped', JSON.stringify(equipped));
        renderInventory();
    }
};

window.sellItem = function(event, id) {
    event.stopPropagation();

    const item = ALL_ITEMS.find(i => i.id === id);
    if (!item) return;

    const sellPrice = Math.floor(item.buyPrice / 2);
    const confirmSell = confirm(`Xác nhận bán [ ${item.name} ] để thu hồi +${sellPrice} Điểm Danh Vọng?`);
    if (!confirmSell) return;

    let dv = parseInt(localStorage.getItem('pkm_global_dv')) || 0;
    let ownedIds = JSON.parse(localStorage.getItem('pkm_owned_ids')) || [];
    let equipped = JSON.parse(localStorage.getItem('pkm_equipped')) || {};

    if (equipped[item.type] === id) {
        delete equipped[item.type];
    }

    ownedIds = ownedIds.filter(ownedId => ownedId !== id);
    dv += sellPrice;

    localStorage.setItem('pkm_global_dv', dv);
    localStorage.setItem('pkm_owned_ids', JSON.stringify(ownedIds));
    localStorage.setItem('pkm_equipped', JSON.stringify(equipped));

    renderInventory();
};

document.addEventListener("DOMContentLoaded", () => {
    renderInventory();
});