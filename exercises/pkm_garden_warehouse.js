/**
 * ==========================================
 * PKM GARDEN — KHO (WAREHOUSE) + DANH MỤC GIÁ (CATALOG)
 * ==========================================
 * File nhỏ dùng CHUNG giữa pkm_garden.js (nơi cho nguyên liệu thô vào Kho
 * lúc thu hoạch + khung Kho xem/bán nhanh) và pkm_garden_store.js (nơi
 * chế biến + bán). Phải nạp file này TRƯỚC cả 2 file kia.
 *
 * window.WarehouseAPI   -> đọc/ghi tồn kho trong localStorage
 * window.WarehouseCatalog -> tên/emoji/giá bán của từng nguyên liệu & sản
 *                            phẩm (dữ liệu TĨNH, không đổi lúc chạy) — để
 *                            cả Garden lẫn Store hiển thị giống hệt nhau,
 *                            tránh 2 nơi tự định nghĩa rồi lệch giá.
 *
 * Cấu trúc lưu trong localStorage (key "pkm_garden_warehouse"):
 *   {
 *     raw:       { "<rawId>": số lượng, ... },       // nguyên liệu thô
 *     processed: { "<recipeId>": số lượng, ... },    // sản phẩm đã chế biến
 *   }
 * ==========================================
 */
window.WarehouseAPI = (function () {
    const KEY = "pkm_garden_warehouse";
    function round1(n) { return Math.round(n * 10) / 10; }

    function load() {
        let s;
        try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { s = null; }
        if (!s || typeof s !== "object") s = {};
        if (!s.raw || typeof s.raw !== "object") s.raw = {};
        if (!s.processed || typeof s.processed !== "object") s.processed = {};
        return s;
    }
    function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

    function addRaw(id, qty) {
        const s = load();
        s.raw[id] = round1((s.raw[id] || 0) + qty);
        save(s);
        return s;
    }
    function addProcessed(id, qty) {
        const s = load();
        s.processed[id] = round1((s.processed[id] || 0) + qty);
        save(s);
        return s;
    }
    function removeRaw(id, qty) {
        const s = load();
        if ((s.raw[id] || 0) < qty) return false;
        s.raw[id] = round1(s.raw[id] - qty);
        if (s.raw[id] <= 0) delete s.raw[id];
        save(s);
        return true;
    }
    function removeProcessed(id, qty) {
        const s = load();
        if ((s.processed[id] || 0) < qty) return false;
        s.processed[id] = round1(s.processed[id] - qty);
        if (s.processed[id] <= 0) delete s.processed[id];
        save(s);
        return true;
    }

    return { load, save, addRaw, addProcessed, removeRaw, removeProcessed };
})();

// ── DANH MỤC GIÁ: 15 nguyên liệu thô (id trùng tier.id bên PLANT_TIERS/
// ANIMAL_TIERS/FISH_TIERS của Garden) × 2 công thức chế biến mỗi loại. ──
window.WarehouseCatalog = (function () {
    const round1 = (n) => Math.round(n * 10) / 10;

    const SOURCE = [
        // ---- Cây (khu Field/Ruộng) ----
        { id: "p1", kind: "plant", days: 1, tierDV: 1.5,  tierEXP: 1.5,  raw: ["Grass", "Cỏ Tươi", "🌾"], recipes: [["Hay", "Rơm Khô", "🌾"], ["Rice", "Gạo", "🍚"]] },
        { id: "p2", kind: "plant", days: 2, tierDV: 3.1,  tierEXP: 3.1,  raw: ["Oran Petal", "Cánh Hoa Oran", "🌸"], recipes: [["Flower Tea", "Trà Hoa", "🍵"], ["Perfume", "Nước Hoa", "🧴"]] },
        { id: "p3", kind: "plant", days: 3, tierDV: 4.8,  tierEXP: 4.8,  raw: ["Strawberry", "Dâu Tây", "🍓"], recipes: [["Strawberry Juice", "Nước Ép Dâu Tây", "🥤"], ["Canned Strawberry", "Dâu Tây Đóng Hộp", "🥫"]] },
        { id: "p4", kind: "plant", days: 4, tierDV: 6.6,  tierEXP: 6.6,  raw: ["Mushroom", "Nấm Tươi", "🍄"], recipes: [["Dried Mushroom", "Nấm Khô", "🍄"], ["Mushroom Soup", "Súp Nấm", "🍲"]] },
        { id: "p5", kind: "plant", days: 5, tierDV: 8.5,  tierEXP: 8.5,  raw: ["Magic Wood", "Gỗ Thần Kỳ", "🪵"], recipes: [["Charcoal", "Than Củi", "⚫"], ["Magic Furniture", "Đồ Gỗ Thần Kỳ", "🪑"]] },
        // ---- Thú (khu Farm/Chuồng) ----
        { id: "a1", kind: "animal", days: 2,  tierDV: 3.2,  tierEXP: 3.2,  raw: ["Chicken Meat", "Thịt Gà", "🍗"], recipes: [["Grilled Chicken", "Gà Nướng", "🍖"], ["Chicken Soup", "Súp Gà", "🍲"]] },
        { id: "a2", kind: "animal", days: 4,  tierDV: 6.6,  tierEXP: 6.6,  raw: ["Wool", "Lông Cừu", "🧶"], recipes: [["Wool Yarn", "Len Sợi", "🧵"], ["Wool Sweater", "Áo Len", "🧥"]] },
        { id: "a3", kind: "animal", days: 6,  tierDV: 10.2, tierEXP: 10.2, raw: ["Milk", "Sữa Bò", "🥛"], recipes: [["Butter", "Bơ", "🧈"], ["Cheese", "Phô Mai", "🧀"]] },
        { id: "a4", kind: "animal", days: 8,  tierDV: 14,   tierEXP: 14,   raw: ["Zebra Hide", "Da Ngựa Vằn", "🦓"], recipes: [["Leather", "Da Thuộc", "🟫"], ["Leather Boots", "Giày Da", "👢"]] },
        { id: "a5", kind: "animal", days: 10, tierDV: 18,   tierEXP: 18,   raw: ["Dragon Scale", "Vảy Rồng", "🐉"], recipes: [["Magic Powder", "Bột Phép", "✨"], ["Scale Armor", "Áo Giáp Vảy", "🛡️"]] },
        // ---- Cá (khu Water/Ao) ----
        { id: "f1", kind: "fish", days: 1, tierDV: 1.5,  tierEXP: 1.5,  raw: ["Magikarp Meat", "Thịt Cá Chép", "🐟"], recipes: [["Fish Sushi", "Sushi Cá", "🍣"], ["Fish Sauce", "Nước Mắm", "🧂"]] },
        { id: "f2", kind: "fish", days: 3, tierDV: 4.6,  tierEXP: 4.6,  raw: ["Goldeen Meat", "Thịt Cá Vàng", "🐠"], recipes: [["Grilled Fish", "Cá Nướng", "🍢"], ["Fish Cake", "Chả Cá", "🍥"]] },
        { id: "f3", kind: "fish", days: 5, tierDV: 7.7,  tierEXP: 7.7,  raw: ["Chinchou Meat", "Thịt Cá Đèn Lồng", "🏮"], recipes: [["Fish Soup", "Súp Cá", "🍲"], ["Smoked Fish", "Cá Hun Khói", "🐟"]] },
        { id: "f4", kind: "fish", days: 7, tierDV: 10.9, tierEXP: 10.9, raw: ["Feebas Meat", "Thịt Cá Xấu Xí", "🐡"], recipes: [["Fish Stew", "Cá Hầm", "🍲"], ["Canned Fish", "Cá Đóng Hộp", "🥫"]] },
        { id: "f5", kind: "fish", days: 9, tierDV: 14.2, tierEXP: 14.2, raw: ["Milotic Meat", "Thịt Cá Kiều Diễm", "🐬"], recipes: [["Deluxe Sushi", "Sushi Cao Cấp", "🍣"], ["Fish Extract", "Tinh Chất Cá", "🧴"]] },
    ];

    const RAW_MATERIALS = {}; // rawId -> {id, kind, name, nameVN, emoji, sellDV, days}
    const RECIPES = {};       // rawId -> [ {id, rawId, name, nameVN, emoji, days, costDV, costEXP, sellDV, sellEXP} ]

    SOURCE.forEach((tier) => {
        const [rName, rNameVN, rEmoji] = tier.raw;
        RAW_MATERIALS[tier.id] = {
            id: tier.id, kind: tier.kind, days: tier.days,
            name: rName, nameVN: rNameVN, emoji: rEmoji,
            sellDV: round1(tier.tierDV * 0.6), // bán thô: rẻ
        };
        RECIPES[tier.id] = tier.recipes.map(([pName, pNameVN, pEmoji], i) => {
            const mult = i === 0 ? 1 : 2; // công thức 2 lâu gấp đôi & lãi cao hơn công thức 1
            return {
                id: `${tier.id}_r${i + 1}`,
                rawId: tier.id,
                name: pName, nameVN: pNameVN, emoji: pEmoji,
                days: tier.days * mult,
                costDV: round1(tier.tierDV * 0.2 * mult),
                costEXP: round1(tier.tierEXP * 0.2 * mult),
                sellDV: round1(tier.tierDV * (1.6 + mult)),
                sellEXP: round1(tier.tierEXP * (1.6 + mult)),
            };
        });
    });

    return { RAW_MATERIALS, RECIPES };
})();
