/**
 * ==========================================
 * PKM GARDEN v2 — BẢNG THÔNG SỐ
 * ==========================================
 * File này CHỈ chứa số liệu / cấu hình, không có logic game.
 *
 * QUY ƯỚC:
 *   - DV  = Danh Vọng  -> MUA HẠT GIỐNG / CON GIỐNG / CÁ GIỐNG
 *   - EXP = Kinh Nghiệm -> MUA CÔNG CỤ (9 loại, ~0.1 EXP/cái)
 *   - Mỗi tier có "name" (tiếng Anh, hiển thị chính + TTS đọc) và "nameVN"
 *     (chỉ dùng trong khung thông tin song ngữ khi bấm vào 1 ô).
 * ==========================================
 */

window.GardenConfig = {
    LESSON_FIREBASE_CONFIG: {
        apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
        authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
        projectId: "lop-hoc-thay-tinh",
        storageBucket: "lop-hoc-thay-tinh.firebasestorage.app",
        messagingSenderId: "391812475288",
        appId: "1:391812475288:web:ca4c275ac776d69deb23ed",
    },

    POKEMON_ANI_URL: (name) =>
        `https://play.pokemonshowdown.com/sprites/ani/${name}.gif`,

    // ── THỜI GIAN (mọi loại: cây / vật nuôi / cá đều dùng chung mốc này) ──
    CARE_INTERVAL_MS: 24 * 60 * 60 * 1000, // phải chăm lại sau mỗi 24h
    DEATH_MS: 48 * 60 * 60 * 1000,         // 48h không chăm liên tục -> chết
    HARVEST_GRACE_MS: 24 * 60 * 60 * 1000, // chín xong, để quá 24h không hái -> chết
    MAX_HEALTH: 100,

    // ── 9 CÔNG CỤ (mua bằng EXP, dùng dần) ──
    // "care" (nước/phân bón/thức ăn/chà tắm/cám/thuốc): cần ĐỦ CẢ 2 loại
    // cùng nhóm mới tính là 1 lần chăm sóc hợp lệ trong ngày.
    // "harvest" (liềm/bao/giỏ): chỉ dùng đúng 1 lần lúc thu hoạch.
    TOOLS: {
        water:      { id: "water",      name: "Water",      nameVN: "Nước",        emoji: "💧", costEXP: 0.1, group: "plant",  role: "care" },
        fertilizer: { id: "fertilizer", name: "Fertilizer", nameVN: "Phân bón",    emoji: "🌿", costEXP: 0.1, group: "plant",  role: "care" },
        food:       { id: "food",       name: "Food",       nameVN: "Thức ăn",     emoji: "🍖", costEXP: 0.1, group: "animal", role: "care" },
        brush:      { id: "brush",      name: "Brush",      nameVN: "Chà tắm",     emoji: "🧽", costEXP: 0.1, group: "animal", role: "care" },
        bran:       { id: "bran",       name: "Bran",       nameVN: "Cám",         emoji: "🌾", costEXP: 0.1, group: "fish",   role: "care" },
        medicine:   { id: "medicine",   name: "Medicine",   nameVN: "Thuốc",       emoji: "💊", costEXP: 0.1, group: "fish",   role: "care" },
        sickle:     { id: "sickle",     name: "Sickle",     nameVN: "Liềm",        emoji: "🔪", costEXP: 0.1, group: "plant",  role: "harvest" },
        sack:       { id: "sack",       name: "Sack",       nameVN: "Bao tải",     emoji: "🛍️", costEXP: 0.1, group: "animal", role: "harvest" },
        basket:     { id: "basket",     name: "Basket",     nameVN: "Giỏ",         emoji: "🧺", costEXP: 0.1, group: "fish",   role: "harvest" },
    },

    // ── Mốc mở khoá đất / chuồng / ao theo SỐ BÀI ĐÃ HỌC ──
    // index 0 = mảnh/chuồng/ao số 1, LUÔN mở sẵn miễn phí (threshold 0).
    UNLOCK_THRESHOLDS: [0, 10, 25, 40, 55, 70, 85, 100, 115, 130],

    // ── 5 LOẠI CÂY (chín theo NGÀY THỰC = days × 24h) ──
    PLANT_TIERS: [
        { id: "p1", name: "Basic Grass",   nameVN: "Cỏ Cơ Bản",     emoji: "🌱", growEmoji: "🌾", days: 1, seedCostDV: 1, harvestDV: 1.5, harvestEXP: 1.5 },
        { id: "p2", name: "Oran Flower",   nameVN: "Hoa Oran",      emoji: "🌸", growEmoji: "🌷", days: 2, seedCostDV: 2, harvestDV: 3.1, harvestEXP: 3.1 },
        { id: "p3", name: "Chesto Berry",  nameVN: "Berry Chesto",  emoji: "🍒", growEmoji: "🍓", days: 3, seedCostDV: 3, harvestDV: 4.8, harvestEXP: 4.8 },
        { id: "p4", name: "Fairy Mushroom",nameVN: "Nấm Tinh Linh", emoji: "🍄", growEmoji: "🍄", days: 4, seedCostDV: 4, harvestDV: 6.6, harvestEXP: 6.6 },
        { id: "p5", name: "Magic Tree",    nameVN: "Cây Thần Kỳ",   emoji: "🌳", growEmoji: "🌳", days: 5, seedCostDV: 5, harvestDV: 8.5, harvestEXP: 8.5 },
    ],

    // ── 5 LOẠI POKÉMON NUÔI (nuôi lâu hơn cây, lãi cao hơn) ──
    ANIMAL_TIERS: [
        { id: "a1", name: "Chicken",  nameVN: "Gà Con",  pokemon: "torchic", days: 2,  priceDV: 2,  harvestDV: 3.2,  harvestEXP: 3.2 },
        { id: "a2", name: "Lamb",     nameVN: "Cừu Non", pokemon: "mareep",  days: 4,  priceDV: 4,  harvestDV: 6.6,  harvestEXP: 6.6 },
        { id: "a3", name: "Cow",      nameVN: "Bò Sữa",  pokemon: "miltank", days: 6,  priceDV: 6,  harvestDV: 10.2, harvestEXP: 10.2 },
        { id: "a4", name: "Zebra",    nameVN: "Ngựa Vằn",pokemon: "ponyta",  days: 8,  priceDV: 8,  harvestDV: 14,   harvestEXP: 14 },
        { id: "a5", name: "Dragon",   nameVN: "Rồng Con",pokemon: "dratini", days: 10, priceDV: 10, harvestDV: 18,   harvestEXP: 18 },
    ],

    // ── 5 LOẠI CÁ (ao nuôi mở, 1/3/5/7/9 ngày) ──
    FISH_TIERS: [
        { id: "f1", name: "Magikarp",  nameVN: "Cá Chép",    pokemon: "magikarp", days: 1, priceDV: 1, harvestDV: 1.5,  harvestEXP: 1.5 },
        { id: "f2", name: "Goldeen",   nameVN: "Cá Vàng",    pokemon: "goldeen",  days: 3, priceDV: 3, harvestDV: 4.6,  harvestEXP: 4.6 },
        { id: "f3", name: "Chinchou",  nameVN: "Cá Đèn Lồng",pokemon: "chinchou", days: 5, priceDV: 5, harvestDV: 7.7,  harvestEXP: 7.7 },
        { id: "f4", name: "Feebas",    nameVN: "Cá Xấu Xí",  pokemon: "feebas",   days: 7, priceDV: 7, harvestDV: 10.9, harvestEXP: 10.9 },
        { id: "f5", name: "Milotic",   nameVN: "Cá Kiều Diễm",pokemon:"milotic",  days: 9, priceDV: 9, harvestDV: 14.2, harvestEXP: 14.2 },
    ],
};

/**
 * GHI CHÚ THIẾT KẾ (đọc nếu muốn chỉnh luật chơi):
 *
 * VÒNG ĐỜI (áp dụng chung cây / vật nuôi / cá):
 *  1) Mua/gieo -> chưa chạy đồng hồ, chưa có sinh mệnh (status "seed").
 *  2) Chăm sóc lần đầu (đủ CẢ 2 công cụ nhóm "care") -> kích hoạt: sinh mệnh
 *     = MAX_HEALTH (100), đồng hồ bắt đầu chạy (status "growing").
 *  3) Cứ mỗi CARE_INTERVAL_MS (24h) phải chăm lại (đủ cả 2). Trễ hạn:
 *     đồng hồ TẠM DỪNG (không lớn thêm), sinh mệnh giảm tuyến tính về 0
 *     trong DEATH_MS - CARE_INTERVAL_MS (24h) tiếp theo. Sinh mệnh = 0 ->
 *     chết (status "dead", vẫn chiếm ô, phải dọn mới trồng lại được).
 *  4) Sống tới khi đủ "days" thời gian CHĂM SÓC ĐẦY ĐỦ (không tính thời
 *     gian bị dừng lúc bỏ bê) -> "ready", cần dùng đúng công cụ "harvest"
 *     (liềm/bao/giỏ, 1 lần) trong HARVEST_GRACE_MS (24h) kế, trễ -> chết.
 *
 * 3 THANH HIỂN THỊ (mỗi ô):
 *  - Progress: % thời gian đã trôi tới lúc chín.
 *  - Health: sinh mệnh 0-100, quyết định sống/chết.
 *  - Quality: CHỈ để hiển thị cho sinh động (ăn theo % Health hiện tại),
 *    KHÔNG ảnh hưởng phần thưởng thu hoạch — tránh bịa thêm 1 hệ số phần
 *    thưởng ẩn khó hiểu cho học sinh.
 *
 * ÂM THANH + TTS (tối đa hoá tiếp xúc tiếng Anh):
 *  - Mọi nút bấm: phát 1 tiếng "click" ngắn tự tạo bằng Web Audio API
 *    (không cần file mp3) + đọc tiếng Anh tên/nhãn tương ứng qua
 *    speechSynthesis (y hệt cách pkm.html đang đọc thoại NPC).
 *  - Khung hướng dẫn / thông tin (bấm vào 1 ô) hiển thị SONG NGỮ, nhưng
 *    CHỈ đọc TTS phần tiếng Anh, không đọc phần tiếng Việt.
 */