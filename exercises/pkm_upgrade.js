/**
 * POKEMON UPGRADE & EVOLUTION SYSTEM
 * Logic: 
 * - 20 EXP mỗi lần nâng cấp.
 * - Mỗi level tăng 5% chỉ số gốc (hp, atk, def, sAtk).
 * - Hệ thống tính tổng chiến lực CP đồng bộ chuẩn 100% theo egg.js
 * - Max Lv.10: Nâng cấp tiếp theo sẽ Tiến hóa (nếu có) và Reset về Lv.1.
 * - Tiến hóa ngẫu nhiên nếu có nhiều nhánh.
 */

const UPGRADE_COST = 20;
const GROWTH_RATE = 0.05; // 5% mỗi cấp cho chỉ số thực tế

// 1. Khai báo biến toàn cục trước
let selectedUid = null;

/**
 * Hàm tính chỉ số thực tế dựa trên chỉ số gốc và level
 * Công thức: Chỉ số = Gốc * (1.05 ^ (Level - 1))
 */
function getStat(base, level) {
    if (!base) return 0;
    return Math.round(base * Math.pow(1 + GROWTH_RATE, level - 1));
}

/**
 * Hàm tính Tổng chiến lực CP chuẩn hóa từ hệ thống egg.js / pkm_list.js
 */
function calculateCP(pkm) {
    if (!pkm || !pkm.baseStats) return 0;

    // Đảm bảo lấy đúng key và dự phòng nếu chỉ số trống
    const hp = pkm.baseStats.hp || 0;
    const atk = pkm.baseStats.atk || 0;
    const def = pkm.baseStats.def || 0;
    const sAtk = pkm.baseStats.sAtk || 0; 

    // Áp dụng công thức chuẩn từ hệ thống egg.js
    const baseCP = (hp * 15) + (def * 17.6) + (atk * 20) + (sAtk * 28.8);

    // Tỉ lệ tăng tiến sức mạnh theo Level (mỗi level tăng thêm 10%)
    const levelBonus = 1 + (pkm.lv - 1) * 0.1; 

    return Math.floor(baseCP * levelBonus);
}

/**
 * Hàm dự báo CP dựa trên thông số Pokemon và một Level giả định
 */
function calculateFutureCP(baseStats, futureLv) {
    if (!baseStats) return 0;
    const hp = baseStats.hp || 0;
    const atk = baseStats.atk || 0;
    const def = baseStats.def || 0;
    const sAtk = baseStats.sAtk || 0; 

    const baseCP = (hp * 15) + (def * 17.6) + (atk * 20) + (sAtk * 28.8);
    const levelBonus = 1 + (futureLv - 1) * 0.1; 

    return Math.floor(baseCP * levelBonus);
}

/**
 * Hàm chính xử lý nâng cấp Pokemon
 * @param {string} uid - ID duy nhất của Pokemon trong kho (pkm_inventory)
 */
async function handleUpgrade(uid) {
    // 1. Tải dữ liệu từ LocalStorage
    let inventory = JSON.parse(localStorage.getItem('pkm_inventory')) || [];
    let globalExp = parseInt(localStorage.getItem('pkm_global_exp')) || 0;

    // Tìm Pokemon cần nâng cấp trong danh sách
    let pkmIndex = inventory.findIndex(p => p.uid === uid);
    if (pkmIndex === -1) return alert("Không tìm thấy Pokemon!");

    let pkm = inventory[pkmIndex];

    // 2. Kiểm tra điều kiện EXP
    if (globalExp < UPGRADE_COST) {
        alert(`Bạn cần ${UPGRADE_COST} EXP để nâng cấp. Hiện có: ${globalExp}`);
        return;
    }

    // 3. Xử lý Logic Nâng cấp
    if (pkm.lv < 10) {
        globalExp -= UPGRADE_COST;
        pkm.lv += 1; // Tăng cấp độ
        console.log(`Nâng cấp thành công: ${pkm.name} lên Lv.${pkm.lv}`);
    } else {
        // --- TRƯỜNG HỢP TIẾN HÓA (KHI ĐANG Ở LV.10) ---
        console.log(`Đang kiểm tra tiến hóa cho ${pkm.name}...`);
        const nextForm = await getNextEvolution(pkm.id);

        if (nextForm) {
            globalExp -= UPGRADE_COST;

            // Cập nhật thông tin loài mới
            const oldName = pkm.name;
            pkm.id = nextForm.id;
            pkm.name = nextForm.name;
            pkm.lv = 1; // Reset về Level 1 theo logic quy định

            // Lấy chỉ số gốc của loài mới từ API để đảm bảo sức mạnh vượt trội
            const newStats = await fetchBaseStats(nextForm.id);
            pkm.baseStats = newStats;

            alert(`TUYỆT VỜI! ${oldName.toUpperCase()} đã tiến hóa thành ${pkm.name.toUpperCase()} Lv.1!`);
        } else {
            alert(`${pkm.name} đã đạt hình thái cuối cùng, không thể nâng cấp thêm!`);
            return; // Thoát hàm, không trừ tiền
        }
    }

    // 4. Lưu dữ liệu mới vào LocalStorage
    localStorage.setItem('pkm_global_exp', globalExp);
    localStorage.setItem('pkm_inventory', JSON.stringify(inventory));

    // 5. Cập nhật giao diện
    if (typeof updateUI === "function") {
        updateUI();
    } else {
        location.reload(); 
    }
}

/**
 * Truy xuất cây tiến hóa từ PokeAPI và chọn ngẫu nhiên hình thái tiếp theo
 */
async function getNextEvolution(currentId) {
    try {
        // Bước 1: Lấy thông tin loài (species) để lấy URL evolution_chain
        const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${currentId}/`);
        const speciesData = await speciesRes.json();

        // Bước 2: Lấy dữ liệu chuỗi tiến hóa
        const evoRes = await fetch(speciesData.evolution_chain.url);
        const evoData = await evoRes.json();

        // Bước 3: Tìm nút hiện tại trong cây tiến hóa
        let currentNode = findNodeInEvoChain(evoData.chain, speciesData.name);

        // Bước 4: Kiểm tra nếu có hình thái tiếp theo
        if (currentNode && currentNode.evolves_to.length > 0) {
            // Ngẫu nhiên chọn một nhánh tiến hóa (Dành cho Eevee, Gloom, v.v.)
            const randomIndex = Math.floor(Math.random() * currentNode.evolves_to.length);
            const nextSpecies = currentNode.evolves_to[randomIndex].species;

            // Lấy ID từ URL (đoạn cuối của URL species)
            const nextId = nextSpecies.url.split('/').filter(Boolean).pop();
            return { id: nextId, name: nextSpecies.name };
        }
        return null; // Không có tiến hóa tiếp theo
    } catch (error) {
        console.error("Lỗi khi tìm tiến hóa:", error);
        return null;
    }
}

/**
 * Hàm đệ quy để tìm Pokemon hiện tại trong cây tiến hóa
 */
function findNodeInEvoChain(node, targetName) {
    if (node.species.name === targetName) {
        return node;
    }
    for (let i = 0; i < node.evolves_to.length; i++) {
        let found = findNodeInEvoChain(node.evolves_to[i], targetName);
        if (found) return found;
    }
    return null;
}

/**
 * Lấy chỉ số cơ bản (HP, ATK, DEF, sAtk) từ PokeAPI
 */
async function fetchBaseStats(id) {
    try {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        const data = await response.json();

        // Lấy các chỉ số gốc từ API
        const hp = data.stats.find(s => s.stat.name === 'hp').base_stat;
        const atk = data.stats.find(s => s.stat.name === 'attack').base_stat;
        const def = data.stats.find(s => s.stat.name === 'defense').base_stat;

        // Lấy Special Attack (sAtk) Map chuẩn với cấu trúc của egg.js
        const sAtkObj = data.stats.find(s => s.stat.name === 'special-attack');
        const sAtk = sAtkObj ? sAtkObj.base_stat : atk;

        return { hp, atk, def, sAtk };
    } catch (error) {
        console.error("Lỗi khi lấy chỉ số gốc:", error);
        return { hp: 50, atk: 50, def: 50, sAtk: 50 }; 
    }
}

/**
 * Hàm bổ trợ để kiểm tra và hiển thị EXP hiện tại
 */
function updateExpDisplay() {
    const globalExp = localStorage.getItem('pkm_global_exp') || 0;
    const expElement = document.getElementById('global-exp-display');
    if (expElement) expElement.innerText = parseInt(globalExp).toLocaleString();
}

/**
 * Tự động kiểm tra và sửa lỗi sAtk cho Pokemon cũ trong kho nếu có trường hợp undefined
 */
async function autoFixMissingSAtk() {
    let inventory = JSON.parse(localStorage.getItem('pkm_inventory')) || [];
    let needsFix = inventory.some(p => p.baseStats && p.baseStats.sAtk === undefined);

    if (needsFix) {
        console.log("Phát hiện Pokemon thiếu sAtk, đang tiến hành sửa lỗi...");
        for (let p of inventory) {
            if (p.baseStats && p.baseStats.sAtk === undefined) {
                try {
                    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${p.id}`);
                    const data = await res.json();
                    p.baseStats.sAtk = data.stats.find(s => s.stat.name === 'special-attack').base_stat;
                    console.log(`✅ Đã sửa sAtk cho ${p.name}`);
                } catch (e) {
                    p.baseStats.sAtk = p.baseStats.atk || 20; // Fallback nếu lỗi mạng
                }
            }
        }
        localStorage.setItem('pkm_inventory', JSON.stringify(inventory));
        if (typeof updateUI === "function") updateUI();
    }
}

/**
 * Hàm cập nhật giao diện (Đồng bộ hoàn toàn từ script HTML gốc sang)
 */
function updateUI() {
    // Cập nhật EXP hiển thị
    updateExpDisplay();

    const inventory = JSON.parse(localStorage.getItem('pkm_inventory')) || [];
    const listContainer = document.getElementById('inventory-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    inventory.forEach(p => {
        const item = document.createElement('div');
        item.className = `pkm-item ${selectedUid === p.uid ? 'active' : ''}`;
        item.onclick = () => selectPkm(p.uid);

        // Tính toán CP thực tế bằng hàm chuẩn của bạn
        const cp = calculateCP(p);

        item.innerHTML = `
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png">
            <div class="pkm-info">
                <b>${p.name}</b>
                <span>Cấp ${p.lv} | CP: ${cp.toLocaleString()}</span>
            </div>
        `;
        listContainer.appendChild(item);
    });

    if (selectedUid) {
        renderDetail(selectedUid);
    }
}

/**
 * Hàm chọn Pokemon 
 */
function selectPkm(uid) {
    selectedUid = uid;
    const emptyState = document.getElementById('empty-state');
    const pkmDetail = document.getElementById('pkm-detail');
    if (emptyState) emptyState.style.display = 'none';
    if (pkmDetail) pkmDetail.style.display = 'block';
    updateUI();
}

/**
 * Hàm hiển thị chi tiết chỉ số và tính toán dự báo tăng trưởng CP chuẩn xác
 */
function renderDetail(uid) {
    const inventory = JSON.parse(localStorage.getItem('pkm_inventory')) || [];
    const p = inventory.find(i => i.uid === uid);
    if (!p) return;

    const globalExp = parseInt(localStorage.getItem('pkm_global_exp')) || 0;

    document.getElementById('main-img').src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.id}.png`;
    document.getElementById('pkm-name').innerText = p.name;

    // Tính toán CP thực tế hiện tại
    const currentCP = calculateCP(p);
    document.getElementById('pkm-lv-tag').innerText = `LEVEL ${p.lv} — TỔNG CHIẾN LỰC: ${currentCP.toLocaleString()}`;

    // Tính chỉ số thuộc tính hiển thị (Hàm lũy tiến 5% mỗi cấp độ)
    const curHP = getStat(p.baseStats.hp, p.lv);
    const curAtk = getStat(p.baseStats.atk, p.lv);
    const curDef = getStat(p.baseStats.def, p.lv);
    const baseSAtk = p.baseStats.sAtk || p.baseStats.atk || 20;
    const curSAtk = getStat(baseSAtk, p.lv);

    document.getElementById('stat-hp').innerText = curHP;
    document.getElementById('stat-atk').innerText = curAtk;
    document.getElementById('stat-def').innerText = curDef;
    document.getElementById('stat-satk').innerText = curSAtk;

    const btn = document.getElementById('upgrade-btn');
    const notice = document.getElementById('evo-notice');

    if (p.lv >= 10) {
        btn.innerText = "TIẾN HÓA NGAY";
        notice.innerText = "Sẵn sàng tiến hóa thành hình thái mới!";
        document.querySelectorAll('.next-val').forEach(el => el.style.visibility = 'hidden');
    } else {
        btn.innerText = "NÂNG CẤP (20 EXP)";
        document.querySelectorAll('.next-val').forEach(el => el.style.visibility = 'visible');

        // Dự báo chỉ số thuộc tính sau nâng cấp (+1 Lv)
        const nxtHP = getStat(p.baseStats.hp, p.lv + 1);
        const nxtAtk = getStat(p.baseStats.atk, p.lv + 1);
        const nxtDef = getStat(p.baseStats.def, p.lv + 1);
        const nxtSAtk = getStat(baseSAtk, p.lv + 1);

        document.getElementById('next-hp').innerText = `+${nxtHP - curHP}`;
        document.getElementById('next-atk').innerText = `+${nxtAtk - curAtk}`;
        document.getElementById('next-def').innerText = `+${nxtDef - curDef}`;
        document.getElementById('next-satk').innerText = `+${nxtSAtk - curSAtk}`;

        // Dự báo tăng trưởng CP chuẩn (Dựa theo công thức levelBonus tăng cấp độ của bạn)
        const futureCP = calculateFutureCP(p.baseStats, p.lv + 1);
        const cpDiff = futureCP - currentCP;
        notice.innerText = `Nâng cấp tiếp theo tăng: +${cpDiff.toLocaleString()} CP`;
    }

    btn.disabled = globalExp < UPGRADE_COST;
    btn.onclick = async () => {
        btn.disabled = true;
        if (p.lv === 10) {
            const mainImg = document.getElementById('main-img');
            if (mainImg) mainImg.classList.add('evo-flash');
        }

        // Thực thi hàm nâng cấp xử lý logic LocalStorage
        await handleUpgrade(uid); 

        setTimeout(() => {
            const mainImg = document.getElementById('main-img');
            if (mainImg) mainImg.classList.remove('evo-flash');
            updateUI(); 
        }, 500);
    };
}

// 6. Khởi chạy hệ thống đồng bộ
window.onload = () => {
    updateUI();
    autoFixMissingSAtk();
};