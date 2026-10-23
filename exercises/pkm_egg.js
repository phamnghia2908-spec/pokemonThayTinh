// 1. Cập nhật giao diện khi vào trang
function updateEggUI() {
    const dv = parseInt(localStorage.getItem('pkm_global_dv')) || 0;
    const inventory = JSON.parse(localStorage.getItem('pkm_inventory')) || [];

    const dvDisplay = document.getElementById('current-dv');
    const countDisplay = document.getElementById('bag-count');
    const buyBtn = document.getElementById('buy-btn');

    if (dvDisplay) dvDisplay.innerText = dv;
    if (countDisplay) countDisplay.innerText = `${inventory.length}/10`;

    // Vô hiệu hóa nút nếu không đủ tiền hoặc túi đầy
    if (buyBtn) {
        buyBtn.disabled = (dv < 50 || inventory.length >= 10);
    }
}

// 2. Hàm lấy dữ liệu Pokémon từ PokeAPI (để lấy tên và type chính xác)
async function getPkmSpeciesData(id) {
    try {
        const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
        const speciesData = await speciesRes.json();

        if (speciesData.evolves_from_species !== null) {
            return { isValid: false };
        }

        const pkmRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        const pkmData = await pkmRes.json();

        // PokeAPI: stats[0]=hp, [1]=atk, [2]=def, [3]=special-attack
        return {
            isValid: true,
            id: pkmData.id,
            name: pkmData.name,
            type: pkmData.types[0].type.name,
            evolution_url: speciesData.evolution_chain.url,
            height: pkmData.height, // đơn vị decimet (PokeAPI) — dùng để tính bodyScale hiển thị trong trận
            baseStats: {
                hp: pkmData.stats[0].base_stat,
                atk: pkmData.stats[1].base_stat,
                def: pkmData.stats[2].base_stat,
                sAtk: pkmData.stats[3].base_stat // THÊM DÒNG NÀY ĐỂ HẾT UNDEFINED
            }
        };
    } catch (error) {
        console.error("Lỗi API:", error);
        return { isValid: false };
    }
}

// 3. Logic Ấp trứng
// Thêm hàm lấy thông tin con tiến hóa tiếp theo từ Evolution Chain
async function getNextEvolutionName(url) {
    try {
        const res = await fetch(url);
        const data = await res.json();
        // Tìm loài cơ bản trong chuỗi và xem nó có con tiến hóa tiếp theo không
        if (data.chain.evolves_to.length > 0) {
            return data.chain.evolves_to[0].species.name;
        }
        return "Tối thượng (Không thể tiến hóa)";
    } catch { return "Chưa xác định"; }
}
function rollStarTier() {
    const r = Math.random() * 100;
    if (r <= 2) return 5;      // 2%
    if (r <= 10) return 4;     // 8%
    if (r <= 25) return 3;     // 15%
    if (r <= 50) return 2;     // 25%
    return 1;                  // 50%
}

async function hatchEgg() {
    let dv = parseInt(localStorage.getItem('pkm_global_dv')) || 0;
    let inventory = JSON.parse(localStorage.getItem('pkm_inventory')) || [];

    if (dv < 50) return alert("Bạn không đủ danh vọng!");
    if (inventory.length >= 10) return alert("Túi đã đầy 10 con!");

    const buyBtn = document.getElementById('buy-btn');
    const eggImg = document.getElementById('egg-img');

    if (buyBtn) {
        buyBtn.disabled = true;
        buyBtn.innerText = "Đang ấp..."; 
    }
    if (eggImg) eggImg.classList.add('egg-shaking'); 

    // --- BƯỚC 1: CHỐT CHỈ TIÊU SAO ---
    const targetStar = rollStarTier(); 
    console.log("%c >>> ROUND MỚI <<<", "color: white; background: #3c5aa6; font-weight: bold; padding: 2px 5px;");
    console.log(`%c CHỈ TIÊU LƯỢT NÀY: ${targetStar} SAO `, "color: #ff4757; font-weight: bold; border: 1px solid #ff4757;");

    let rolledPkm = null;
    let attempts = 0;

    // --- BƯỚC 2: VÒNG LẶP TÌM PKM KHỚP CHỈ TIÊU ---
    // --- BƯỚC 2: VÒNG LẶP TÌM PKM KHỚP CHỈ TIÊU ---
    while (!rolledPkm && attempts < 100) { 
        attempts++;
        let rolledId = Math.floor(Math.random() * 649) + 1;
        const result = await getPkmSpeciesData(rolledId);

        if (result.isValid) {
            const base = result.baseStats;

            // CÔNG THỨC CP THEO VAI TRÒ 16 HIỆP ĐÃ THỐNG NHẤT
            const CP = (base.hp * 15) + (base.def * 17.6) + (base.atk * 20) + (base.sAtk * 28.8);

            // PHÂN MỐC SAO DỰA TRÊN CP
            let currentPkmStars = 1;
            if (CP >= 10000) currentPkmStars = 5;
            else if (CP >= 7500) currentPkmStars = 4;
            else if (CP >= 5000) currentPkmStars = 3;
            else if (CP >= 3000) currentPkmStars = 2;

            console.log(`Lần thử ${attempts}: ID ${rolledId} (${result.name}) có CP: ${Math.round(CP)} -> ${currentPkmStars} sao`);

            if (currentPkmStars === targetStar) {
                // Kiểm tra trùng dòng họ (Chain duplicate)
                const isChainDuplicate = inventory.some(p => p.evolution_url === result.evolution_url);
                if (!isChainDuplicate) {
                    rolledPkm = result;
                    rolledPkm.stars = currentPkmStars;
                    rolledPkm.cp = Math.round(CP); // Lưu lại CP để hiển thị nếu cần
                    console.log(`%c => THÀNH CÔNG! Đã tìm thấy ${rolledPkm.name}`, "color: #2ed573; font-weight: bold;");
                }
            }
        }
    }

    if (!rolledPkm) {
        if (buyBtn) {
            buyBtn.disabled = false;
            buyBtn.innerText = "ẤP TRỨNG (-50 DV)";
        }
        if (eggImg) eggImg.classList.remove('egg-shaking');
        console.warn("Không tìm được Pokemon phù hợp sau 100 lần thử.");
        return alert("Vùng đất này đang yên tĩnh quá, hãy thử lại sau!");
    }

    const nextEvoName = await getNextEvolutionName(rolledPkm.evolution_url);

    setTimeout(() => {
        if (eggImg) {
            eggImg.classList.remove('egg-shaking');
            eggImg.classList.add('egg-explode');
        }

        const newPkm = {
            uid: rolledPkm.name + "_" + Date.now(),
            id: rolledPkm.id,
            name: rolledPkm.name.charAt(0).toUpperCase() + rolledPkm.name.slice(1),
            lv: 1,
            exp: 0,
            inTeam: false,
            position: null,
            type: rolledPkm.type,
            baseStats: rolledPkm.baseStats,
            evolution_url: rolledPkm.evolution_url,
            height: rolledPkm.height, // decimet — dùng cho bodyScale khi vào trận
            gen: 1,
            stars: rolledPkm.stars,
            nextEvo: nextEvoName 
        };

        dv -= 50;
        inventory.push(newPkm);
        localStorage.setItem('pkm_global_dv', dv);
        localStorage.setItem('pkm_inventory', JSON.stringify(inventory));

        if (typeof updateEggUI === "function") updateEggUI();
        showResult(newPkm);

        if (buyBtn) {
            buyBtn.disabled = false;
            buyBtn.innerText = "ẤP TRỨNG (-50 DV)";
        }

        setTimeout(() => { if (eggImg) eggImg.classList.remove('egg-explode'); }, 500);
    }, 1500); 
}

function showResult(pkm) {
    const resultArea = document.getElementById('pkm-result-info');
    const eggImg = document.getElementById('egg-img');

    // Đổi ảnh sang ảnh chính thức
    eggImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pkm.id}.png`;

    let starHTML = "⭐".repeat(pkm.stars);

    // Đảm bảo lấy đúng giá trị, nếu thiếu thì mặc định là 0
    const b = pkm.baseStats;
    const hp = b.hp || 0;
    const atk = b.atk || 0;
    const def = b.def || 0;
    const satk = b.sAtk || 0;

    // Tính CP để hiển thị số đẹp (có dấu phẩy phân cách)
    const displayCP = Math.round((hp * 15) + (def * 17.6) + (atk * 20) + (satk * 28.8));

    resultArea.innerHTML = `
        <div class="pkm-card-result animate-pop">
            <div class="stars-container" style="font-size: 20px; margin-bottom: 5px;">${starHTML}</div>
            <h2 class="pkm-title" style="margin: 0 0 10px 0; color: #ffcb05; text-shadow: 2px 2px #3c5aa6;">
                ${pkm.name.toUpperCase()}
            </h2>

            <div style="background: rgba(0,0,0,0.3); padding: 8px; border-radius: 10px; margin-bottom: 15px;">
                <span style="color: #00d2ff; font-size: 0.9em;">LỰC CHIẾN TỔNG</span>
                <div style="color: #ff9f43; font-size: 1.8em; font-weight: bold;">${displayCP.toLocaleString()}</div>
            </div>

            <div class="pkm-stats-detail" style="text-align: left; padding: 0 10px;">
                <div class="stat-row" style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #eee;">
                        <span>Máu (HP)</span>
                        <span>${hp}</span>
                    </div>
                    <div style="height: 6px; background: #444; border-radius: 3px; margin-top: 4px;">
                        <div style="width: ${Math.min(hp, 100)}%; height: 100%; background: #ff4757; border-radius: 3px;"></div>
                    </div>
                </div>

                <div class="stat-row" style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #eee;">
                        <span>Công (ATK)</span>
                        <span>${atk}</span>
                    </div>
                    <div style="height: 6px; background: #444; border-radius: 3px; margin-top: 4px;">
                        <div style="width: ${Math.min(atk, 100)}%; height: 100%; background: #ffa502; border-radius: 3px;"></div>
                    </div>
                </div>

                <div class="stat-row" style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #eee;">
                        <span>Thủ (DEF)</span>
                        <span>${def}</span>
                    </div>
                    <div style="height: 6px; background: #444; border-radius: 3px; margin-top: 4px;">
                        <div style="width: ${Math.min(def, 100)}%; height: 100%; background: #2ed573; border-radius: 3px;"></div>
                    </div>
                </div>

                <div class="stat-row" style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #eee;">
                        <span>Kỹ năng (sATK)</span>
                        <span>${satk}</span>
                    </div>
                    <div style="height: 6px; background: #444; border-radius: 3px; margin-top: 4px;">
                        <div style="width: ${Math.min(satk, 100)}%; height: 100%; background: #a29bfe; border-radius: 3px;"></div>
                    </div>
                </div>
            </div>

            <div class="pkm-footer" style="margin-top: 15px; font-size: 12px; border-top: 1px solid #444; padding-top: 10px; color: #aaa;">
                <p style="margin: 3px 0;">🧬 Tiến hóa: <span style="color: #fff;">${pkm.nextEvo}</span></p>
                <p style="margin: 3px 0;">Hệ: <span style="color: #fff;">${pkm.type.toUpperCase()}</span> | Gen: ${pkm.gen}</p>
            </div>
        </div>
    `;
}

// Chạy khởi tạo
updateEggUI();