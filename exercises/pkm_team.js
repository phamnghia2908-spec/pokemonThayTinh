/**
 * PKM_TEAM.JS
 * Cơ chế: Bấm chọn Pokemon → bấm vào slot để đặt vào
 * Hoạt động tốt trên cả mobile lẫn desktop
 */

let inventory = JSON.parse(localStorage.getItem('pkm_inventory')) || [];
let selectedUid = null; // UID của Pokemon đang được chọn

// 🔧 TỰ ĐỘNG DỌN DỮ LIỆU CŨ: đội hình tối đa giờ chỉ còn 3,
// Pokemon nào đang ở vị trí 4 hoặc 5 (từ thời còn 5 con) sẽ bị đẩy ra khỏi đội tự động
(function migrateOldFormation() {
    let changed = false;
    inventory.forEach(p => {
        if (p.inTeam && p.position > 3) {
            p.inTeam = false;
            p.position = null;
            changed = true;
        }
    });
    if (changed) {
        localStorage.setItem('pkm_inventory', JSON.stringify(inventory));
        console.log("🔧 Đã tự động dọn đội hình cũ (vị trí 4,5) do đội hình mới chỉ còn 3 chỗ.");
    }
})();
// Số ô đội hình HIỆN TẠI: bằng số Pokémon đang có trong kho, tối đa 3.
// 1 con -> 1 ô, 2 con -> 2 ô, từ 3 con trở lên -> 3 ô.
function getMaxTeamSlots() {
    return Math.min(3, Math.max(1, inventory.length));
}

// Dọn đội hình nếu có con đang xếp ở vị trí vượt quá số ô cho phép hiện
// tại (VD kho bị giảm số lượng sau khi đã xếp đội hình trước đó).
function enforceTeamSlotLimit() {
    const maxSlots = getMaxTeamSlots();
    let changed = false;
    inventory.forEach(p => {
        if (p.inTeam && p.position > maxSlots) {
            p.inTeam = false;
            p.position = null;
            changed = true;
        }
    });
    if (changed) localStorage.setItem('pkm_inventory', JSON.stringify(inventory));
}

// Thêm hàm tính CP chuẩn hóa đồng bộ hệ thống để hiển thị chiến lực
function calculateCP(pkm) {
    if (!pkm || !pkm.baseStats) return 0;
    const hp = pkm.baseStats.hp || 0;
    const atk = pkm.baseStats.atk || 0;
    const def = pkm.baseStats.def || 0;
    const sAtk = pkm.baseStats.sAtk || 0; 

    // Áp dụng công thức chuẩn từ hệ thống egg.js / pkm_list.js
    const baseCP = (hp * 15) + (def * 17.6) + (atk * 20) + (sAtk * 28.8);
    const levelBonus = 1 + (pkm.lv - 1) * 0.1; 

    return Math.floor(baseCP * levelBonus);
}

function init() {
    enforceTeamSlotLimit();
    // Đưa updateBuffs lên đầu để xác định xem đội hình có Buff hay không trước khi tính CP tổng
    updateBuffs();
    renderFormation();
    renderInventory();
}

// =============================================
// 1. VẼ SƠ ĐỒ ĐỘI HÌNH (Hiển thị Hệ, Sao & CP cộng thêm từ Buff)
// =============================================
            function renderFormation() {
                const slots = document.querySelectorAll('.slot');
                const maxSlots = getMaxTeamSlots();
                let totalTeamCP = 0;

                slots.forEach(slot => {
                    const pos = parseInt(slot.dataset.pos);

                    if (pos > maxSlots) {
                        slot.style.display = 'none';
                        slot.onclick = null;
                        return;
                    }
                    slot.style.display = '';

                    const pkm = inventory.find(p => p.inTeam && p.position === pos);

                    if (pkm) {
            const cp = calculateCP(pkm);
            totalTeamCP += cp;

            const isSelected = pkm.uid === selectedUid;
            slot.className = `slot filled ${isSelected ? 'selected' : ''}`;

            // Đọc thuộc tính sao và hệ (chuyển chữ thường thành chữ hoa)
            const pkmStar = pkm.star || pkm.rank || 1;
            const pkmType = (pkm.type || 'normal').toUpperCase();

            slot.innerHTML = `
                <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pkm.id}.png">
                <div class="slot-name">${pkm.name} (${pkmType})</div>
                <div class="slot-lv">Lv.${pkm.lv} | ${pkmStar}★</div>
                <div class="slot-cp" style="font-size:10px; color:#ffbc00; font-weight:bold;">CP: ${cp.toLocaleString()}</div>
                <button class="remove-btn" onclick="removeFromTeam(event, '${pkm.uid}')">×</button>
            `;
            slot.onclick = (e) => {
                if (e.target.classList.contains('remove-btn')) return;
                selectPkm(pkm.uid);
            };
        } else {
            const isHighlight = selectedUid !== null;
            slot.className = `slot empty ${isHighlight ? 'highlight' : ''}`;
            slot.innerHTML = `
                <div class="slot-plus">${isHighlight ? '✓' : '+'}</div>
                <div class="pos-label">Vị trí ${pos}</div>
            `;
            slot.onclick = () => {
                if (selectedUid) dropToTeam(selectedUid, pos);
            };
        }
    });

    // Hiển thị Tổng chiến lực + Chỉ số CP cộng thêm từ Buff
    const totalCPEl = document.getElementById('total-team-cp');
    if (totalCPEl) {
        const team = inventory.filter(p => p.inTeam);
        const buffResult = checkTeamBuffBonus(team);

        if (buffResult.active) {
            // Tính toán lượng chiến lực tăng thêm 5% từ Buff
            const bonusCP = Math.floor(totalTeamCP * 0.05);
            const finalCP = totalTeamCP + bonusCP;

            totalCPEl.innerHTML = `⚔️ TỔNG CHIẾN LỰC ĐỘI HÌNH: <b style="color:#ffbc00; font-size:1.2em;">${finalCP.toLocaleString()}</b> <span style="color:#2ecc71; font-size:11px; font-weight:normal;">(+${bonusCP.toLocaleString()} CP từ Buff)</span>`;
        } else {
            // Không kích hoạt buff, chỉ hiển thị CP gốc
            totalCPEl.innerHTML = `⚔️ TỔNG CHIẾN LỰC ĐỘI HÌNH: <b style="color:#ff4757; font-size:1.2em;">${totalTeamCP.toLocaleString()}</b>`;
        }
    }
}

// =============================================
// 2. VẼ KHO POKEMON (Hiển thị Hệ & Sao)
// =============================================
function renderInventory() {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (inventory.length === 0) {
        grid.innerHTML = `<div style="color:#666; grid-column:1/-1; text-align:center; padding:20px;">
            Túi trống! Hãy ấp trứng để có Pokémon.
        </div>`;
        return;
    }

    inventory.forEach(pkm => {
        const div = document.createElement('div');
        const isSelected = pkm.uid === selectedUid;
        const isInTeam   = pkm.inTeam;
        const cp = calculateCP(pkm);

        // Đọc thuộc tính sao và hệ tương tự
        const pkmStar = pkm.star || pkm.rank || 1;
        const pkmType = (pkm.type || 'normal').toUpperCase();

        div.className = `pkm-item 
            ${isInTeam   ? 'is-in-team' : ''} 
            ${isSelected ? 'is-selected' : ''}`;

        div.innerHTML = `
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pkm.id}.png">
            <div class="pkm-name">${pkm.name} (${pkmType})</div>
            <div class="pkm-lv">Lv.${pkm.lv} [${pkmStar}★]</div>
            <div style="font-size:10px; color:#ffbc00;">CP: ${cp.toLocaleString()}</div>
            ${isInTeam ? '<div class="in-team-tag">TRONG ĐỘI</div>' : ''}
        `;

        div.onclick = () => {
            selectPkm(pkm.uid);
        };

        grid.appendChild(div);
    });
}

// =============================================
// 3. LOGIC CHỌN POKEMON
// =============================================
function selectPkm(uid) {
    if (selectedUid === uid) {
        selectedUid = null;
    } else {
        selectedUid = uid;
    }
    renderFormation();
    renderInventory();
    updateHint();
}

function updateHint() {
    const hintEl = document.getElementById('selection-hint');
    if (!hintEl) return;
    if (selectedUid) {
        const pkm = inventory.find(p => p.uid === selectedUid);
        hintEl.style.display = 'block';
        hintEl.innerHTML = `✅ Đã chọn <b style="color:#deff9a">${pkm?.name || ''}</b> — Bấm vào ô trống để đặt vào đội`;
    } else {
        hintEl.style.display = 'none';
    }
}

// =============================================
// 4. ĐẶT POKEMON VÀO Ô
// =============================================
function dropToTeam(uid, pos) {
    inventory.forEach(p => {
        if (p.position === pos && p.inTeam) {
            p.inTeam    = false;
            p.position  = null;
        }
    });

    const pkm = inventory.find(p => p.uid === uid);
    if (!pkm) return;

    pkm.inTeam   = true;
    pkm.position = pos;

    selectedUid = null;
    saveAndRefresh();
}

// =============================================
// 5. XÓA KHỎI ĐỘI
// =============================================
function removeFromTeam(event, uid) {
    event.stopPropagation();
    const pkm = inventory.find(p => p.uid === uid);
    if (!pkm) return;
    pkm.inTeam   = false;
    pkm.position = null;
    if (selectedUid === uid) selectedUid = null;
    saveAndRefresh();
}

// =============================================
// 6. HỆ THỐNG XỬ LÝ BUFF ĐỘI HÌNH
// =============================================

// Hàm lõi 1: Chỉ chịu trách nhiệm tính toán điều kiện logic (Dễ nâng cấp thêm buff sau này)
// Hàm lõi 1: Đã sửa để tính Buff linh hoạt dựa theo số lượng con thực tế trên sân
function checkTeamBuffBonus(team) {
    // Nếu trên sân chưa có đủ ít nhất 3 con thì chắc chắn không bao giờ đủ điều kiện kích Buff
    if (team.length < 3) return { active: false, type: 'none', text: '⚠️ Xếp ít nhất <b>3 Pokémon</b> vào đội hình để bắt đầu kích hoạt Buff.' };

    const types = team.map(p => p.type || 'normal');
    const typeCounts = {};
    types.forEach(t => typeCounts[t] = (typeCounts[t] || 0) + 1);

    const maxSame = Math.max(...Object.values(typeCounts));
    const uniqueTypes = [...new Set(types)].length;

    // Bỏ điều kiện check tổng 5 con, giờ cứ thỏa mãn số lượng hệ là kích hoạt ngay
    if (maxSame >= 3) {
        return { active: true, type: 'same_type', text: '🔥 <b>BUFF ĐỒNG NHẤT:</b> +5% Chỉ số toàn đội (3 con cùng hệ)' };
    } else if (uniqueTypes >= 3) {
        return { active: true, type: 'diverse_type', text: '🌈 <b>BUFF ĐA DẠNG:</b> +5% Chỉ số toàn đội (3 hệ khác nhau)' };
    }

    return { active: false, type: 'none', text: '❄️ Đội hình hiện tại không có Buff nào được kích hoạt.' };
}

// Hàm bổ trợ 2: Đồng bộ giao diện UI và đẩy trạng thái sang LocalStorage
function updateBuffs() {
    const team = inventory.filter(p => p.inTeam);
    const buffDiv = document.getElementById('buff-info');
    if (!buffDiv) return;

    // Gọi hàm tính toán độc lập
    const buffResult = checkTeamBuffBonus(team);

    // Cập nhật giao diện và đổi màu khung Buff động theo trạng thái
    buffDiv.innerHTML = buffResult.text;
    if (buffResult.active) {
        buffDiv.style.borderLeftColor = 'var(--accent)'; // Đổi sang màu xanh khi được kích hoạt
        buffDiv.style.background = 'rgba(46, 204, 113, 0.1)';
        localStorage.setItem('pkm_team_buff', 'active'); // Báo cho Battle.js biết để cộng chỉ số
    } else {
        buffDiv.style.borderLeftColor = 'var(--primary)'; // Màu mặc định
        buffDiv.style.background = '#1e1e2e';
        localStorage.setItem('pkm_team_buff', 'none');
    }
}

// =============================================
// 7. LƯU
// =============================================
function saveAndRefresh() {
    localStorage.setItem('pkm_inventory', JSON.stringify(inventory));
    inventory = JSON.parse(localStorage.getItem('pkm_inventory')) || [];
    init();
    updateHint();
}

// Khởi chạy
init();