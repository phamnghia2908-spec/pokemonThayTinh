/**
 * ==========================================
 * PKM GARDEN STORE — LOGIC
 * ==========================================
 * Dùng CHUNG với Garden (qua pkm_garden_warehouse.js, PHẢI nạp trước file
 * này):
 *   - window.WarehouseCatalog  -> tên/emoji/giá của nguyên liệu & sản phẩm
 *   - window.WarehouseAPI      -> đọc/ghi tồn kho
 *   - localStorage "pkm_global_dv" / "pkm_global_exp" -> tiền DV/EXP
 * Store chỉ tự giữ riêng: mốc mở khoá bếp + hạn hỏng sau chế biến (STORE_META)
 * và trạng thái các trạm chế biến (localStorage "pkm_garden_store_stations").
 *
 * DOM CONTRACT (xem pkm_garden_store.html):
 *   #storeDV #storeEXP                         -> thanh trên cùng
 *   #zoneTabs                                  -> 3 tab bếp: Field / Farm / Water
 *   #rawBag #rawBagEmpty                       -> Pantry (kho nguyên liệu thô)
 *   #stationGrid                               -> Kitchen Stations (bếp chế biến)
 *   #processedBag #processedBagEmpty           -> Display Case (sản phẩm đã chế biến)
 *   #recipeModal #recipeModalBody              -> modal chọn nguyên liệu/công thức
 *   #storeToast #storeToastEn #storeToastVn    -> toast song ngữ
 *   #quiz-overlay #quiz-word #quiz-options     -> modal câu hỏi (pkm_quiz.js)
 * Cần nạp TRƯỚC file này: pkm_quiz.js, pkm_garden_warehouse.js
 * ==========================================
 */

const CATALOG = window.WarehouseCatalog; // {RAW_MATERIALS, RECIPES} — dùng chung với Garden
const STORE_META = {
    PROCESS_SPOIL_GRACE_MS: 48 * 60 * 60 * 1000, // quá 48h sau khi xong mà không lấy -> hỏng, phải vứt
    UNLOCK_THRESHOLDS: [0, 10, 25, 40, 55, 70, 85, 100, 115, 130], // mốc mở khoá trạm chế biến, giống Garden
};

const ZONES = [
    { kind: "plant", label: "🌾 Field", labelVN: "Ruộng" },
    { kind: "animal", label: "🐄 Farm", labelVN: "Chuồng" },
    { kind: "fish", label: "🐟 Water", labelVN: "Ao" },
];
let activeZone = "plant";

// ===== 1. Âm thanh + TTS (tối đa hoá tiếp xúc tiếng Anh, giống Garden) =====
let _audioCtx = null;
function playClick() {
    try {
        _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = _audioCtx.createOscillator();
        const g = _audioCtx.createGain();
        o.type = "square"; o.frequency.value = 880; g.gain.value = 0.06;
        o.connect(g); g.connect(_audioCtx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.0001, _audioCtx.currentTime + 0.13);
        o.stop(_audioCtx.currentTime + 0.14);
    } catch (e) { /* im lặng nếu trình duyệt chặn AudioContext */ }
}
function speakEnglish(text) {
    try {
        if (!window.speechSynthesis || !text) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US"; u.rate = 0.95;
        window.speechSynthesis.speak(u);
    } catch (e) { /* im lặng nếu không hỗ trợ TTS */ }
}
function announce(text) { playClick(); speakEnglish(text); }

// ===== 2. Hạ tầng quiz (bản sao gọn của pkm_garden.js, để store.js chạy độc lập) =====
let _firebaseRefs = null;
async function getFirebaseRefs() {
    if (_firebaseRefs) return _firebaseRefs;
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js");
    const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const app = initializeApp(window.LESSON_FIREBASE_CONFIG || {
        apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
        authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
        projectId: "lop-hoc-thay-tinh",
        storageBucket: "lop-hoc-thay-tinh.firebasestorage.app",
        messagingSenderId: "391812475288",
        appId: "1:391812475288:web:ca4c275ac776d69deb23ed",
    }, "storeLessonApp");
    const db = getFirestore(app);
    _firebaseRefs = { db, doc, getDoc };
    return _firebaseRefs;
}
const realTrainerClass = localStorage.getItem("trainerClass") || "1";
function extractCodeFromTitle(title) {
    if (!title || typeof title !== "string") return "";
    const parts = title.trim().split(/[-\s.]+/);
    if (parts.length >= 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
        return parts[0] + parts[1] + parts[2];
    }
    return "";
}
function rowsToArr(r) { return Array.isArray(r) ? r : Object.values(r); }
let _vocabCache = null;
async function ensureVocabRows() {
    if (_vocabCache) return _vocabCache;
    let rows = [];
    const cachedData = sessionStorage.getItem("allVocabData");
    if (cachedData) {
        rows = JSON.parse(cachedData);
    } else {
        const response = await fetch(window.SHEET_URL);
        const json = await response.json();
        rows = json.data || json;
        sessionStorage.setItem("allVocabData", JSON.stringify(rows));
    }
    const colID = window.COLS_URL?.ID !== undefined ? window.COLS_URL.ID : 1;
    const colWord = window.COLS_URL?.WORD !== undefined ? window.COLS_URL.WORD : 2;
    _vocabCache = { rows, colID, colWord };
    return _vocabCache;
}
function buildLessonPreviewByCode(rows, colID, colWord, code) {
    if (!code) return null;
    let fullId = null;
    const words = []; const seen = new Set();
    for (const r of rows) {
        const d = rowsToArr(r);
        const unitRaw = d[colID]?.toString().trim();
        if (!unitRaw) continue;
        if (extractCodeFromTitle(unitRaw) !== code) continue;
        if (!fullId) fullId = unitRaw;
        const w = d[colWord];
        if (w && !seen.has(w)) { seen.add(w); words.push(w); }
    }
    if (!fullId) return null;
    const namePart = fullId.includes(" ") ? fullId.substring(fullId.indexOf(" ") + 1) : "";
    return { fullId, lessonName: namePart.trim() || fullId, words };
}
function getMaxNewLessonCode(lichData) {
    let max = 0;
    Object.values(lichData || {}).forEach((entry) => {
        if (entry && entry.type === "new" && entry.code) {
            const n = parseInt(entry.code, 10);
            if (!isNaN(n) && n > max) max = n;
        }
    });
    return max;
}
function pickPersonalizedFillLesson(rows, colID, colWord, lichData, passedMaps) {
    const maxCode = getMaxNewLessonCode(lichData);
    if (!maxCode) return null;
    const uniqueIds = [
        ...new Set(rows.map((r) => rowsToArr(r)[colID]?.toString().trim()).filter((id) => id && id.startsWith(realTrainerClass + "-"))),
    ];
    const candidates = uniqueIds.filter((id) => {
        const code = extractCodeFromTitle(id);
        const n = parseInt(code, 10);
        return code && !isNaN(n) && n < maxCode && !passedMaps.includes(id);
    });
    const pool = candidates.length > 0 ? candidates : uniqueIds.filter((id) => !passedMaps.includes(id));
    if (pool.length === 0) return null;
    const pickedId = pool[Math.floor(Math.random() * pool.length)];
    const namePart = pickedId.includes(" ") ? pickedId.substring(pickedId.indexOf(" ") + 1) : "";
    const words = rows.filter((r) => rowsToArr(r)[colID]?.toString().trim() === pickedId).map((r) => rowsToArr(r)[colWord]).filter(Boolean);
    return { fullId: pickedId, lessonName: namePart.trim() || pickedId, words };
}
async function loadTodayMissionForQuiz() {
    const { rows, colID, colWord } = await ensureVocabRows();
    const iso = new Date().toISOString().split("T")[0];
    const passedMaps = JSON.parse(localStorage.getItem("pkm_passed_maps")) || [];
    let lichData = {};
    try {
        const { db, doc, getDoc } = await getFirebaseRefs();
        const snap = await getDoc(doc(db, "lich", realTrainerClass));
        if (snap.exists()) lichData = snap.data();
    } catch (e) { console.warn("⚠️ [Store] Không tải được lịch học hôm nay:", e); }
    const entry = lichData[iso];
    let mission = null;
    if (entry && entry.code) {
        const preview = buildLessonPreviewByCode(rows, colID, colWord, entry.code);
        if (preview) {
            mission = { id: preview.fullId, type: "quest", class: realTrainerClass };
            localStorage.setItem("selected_lesson_name", preview.lessonName);
        }
    }
    if (!mission) {
        const fill = pickPersonalizedFillLesson(rows, colID, colWord, lichData, passedMaps);
        if (fill) {
            mission = { id: fill.fullId, type: "quest_fill", class: realTrainerClass };
            localStorage.setItem("selected_lesson_name", fill.lessonName);
        }
    }
    if (mission) localStorage.setItem("current_mission", JSON.stringify(mission));
    return !!mission;
}

// ===== 3. Khoá thao tác lúc quiz =====
let uiLocked = false;
function setUiLocked(v) { uiLocked = v; document.body.classList.toggle("ui-locked", v); }
function guard(fn) { return (...args) => { if (uiLocked) return; fn(...args); }; }

// ===== 4. Helpers chung (tiền DV/EXP dùng CHUNG key với Garden) =====
function round1(n) { return Math.round(n * 10) / 10; }
function fmtNum(n) { return Number.isInteger(n) ? n : n.toFixed(1); }
function getDV() { return parseFloat(localStorage.getItem("pkm_global_dv")) || 0; }
function getEXP() { return parseFloat(localStorage.getItem("pkm_global_exp")) || 0; }
function addCurrency(dv, exp) {
    if (dv) localStorage.setItem("pkm_global_dv", round1(getDV() + dv));
    if (exp) localStorage.setItem("pkm_global_exp", round1(getEXP() + exp));
}
function spendCurrency(dv, exp) {
    if (getDV() < dv || getEXP() < exp) return false;
    addCurrency(-dv, -exp);
    return true;
}
function getLessonsLearnedCount() { return (JSON.parse(localStorage.getItem("pkm_passed_maps")) || []).length; }
function getUnlockedSlotCount(lessonsLearned) {
    let count = 0;
    for (const t of STORE_META.UNLOCK_THRESHOLDS) { if (lessonsLearned >= t) count++; else break; }
    return Math.max(1, count);
}
function lessonsNeededForNextSlot(lessonsLearned) {
    const next = STORE_META.UNLOCK_THRESHOLDS.find((t) => t > lessonsLearned);
    return next === undefined ? null : next - lessonsLearned;
}

// ===== 5. State trạm chế biến (workshop stations) — lưu riêng cho Store =====
const STATION_KEY = "pkm_garden_store_stations";
function loadStations() {
    let s;
    try { s = JSON.parse(localStorage.getItem(STATION_KEY) || "null"); } catch (e) { s = null; }
    if (!s || typeof s !== "object") s = {};
    ["plant", "animal", "fish"].forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
    return s;
}
function saveStations(s) { localStorage.setItem(STATION_KEY, JSON.stringify(s)); }
let stations = loadStations();
function ensureStationsLength() {
    const total = STORE_META.UNLOCK_THRESHOLDS.length;
    ["plant", "animal", "fish"].forEach((k) => { while (stations[k].length < total) stations[k].push(null); });
    saveStations(stations);
}
function getStationInfo(job, now) {
    if (!job) return { status: "empty" };
    if (now < job.readyAt) {
        const pct = Math.round(((now - job.startedAt) / (job.readyAt - job.startedAt)) * 100);
        return { status: "processing", progressPct: Math.max(0, Math.min(99, pct)) };
    }
    if (now - job.readyAt > STORE_META.PROCESS_SPOIL_GRACE_MS) return { status: "spoiled" };
    return { status: "ready" };
}

// ===== 6. Toast song ngữ =====
let _toastTimer = null;
function showToast(en, vn) {
    const toast = document.getElementById("storeToast");
    if (!toast) return;
    document.getElementById("storeToastEn").textContent = en;
    document.getElementById("storeToastVn").textContent = vn || "";
    speakEnglish(en);
    toast.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// ===== 7. Top bar =====
function updateTopBar() {
    document.getElementById("storeDV").textContent = fmtNum(getDV());
    document.getElementById("storeEXP").textContent = fmtNum(getEXP());
}

// ===== 8. Render =====
function materialsForKind(kind) {
    return Object.values(CATALOG.RAW_MATERIALS).filter((m) => m.kind === kind);
}
function recipesForKind(kind) {
    return Object.values(CATALOG.RECIPES).flat().filter((r) => CATALOG.RAW_MATERIALS[r.rawId].kind === kind);
}

function renderTabs() {
    const bar = document.getElementById("zoneTabs");
    bar.innerHTML = "";
    ZONES.forEach((z) => {
        const btn = document.createElement("button");
        btn.className = "zone-tab" + (activeZone === z.kind ? " active" : "");
        btn.textContent = z.label;
        btn.onclick = guard(() => {
            if (activeZone === z.kind) return;
            activeZone = z.kind;
            announce(z.labelVN);
            renderZone();
        });
        bar.appendChild(btn);
    });
}

function renderRawBag() {
    const wh = window.WarehouseAPI.load();
    const wrap = document.getElementById("rawBag");
    wrap.innerHTML = "";
    let any = false;
    materialsForKind(activeZone).forEach((m) => {
        const qty = wh.raw[m.id] || 0;
        if (qty <= 0) return;
        any = true;
        const card = document.createElement("div");
        card.className = "goods-card";
        card.innerHTML = `
            <div class="goods-emoji">${m.emoji}</div>
            <div class="goods-info">
                <div class="goods-name">${m.name} <span class="goods-name-vn">(${m.nameVN})</span></div>
                <div class="goods-sub">Have: ${fmtNum(qty)} · Sell 1 for ${fmtNum(m.sellDV)} DV</div>
            </div>
            <div class="goods-actions">
                <button class="mini-btn sell-btn">Sell 1</button>
                <button class="mini-btn process-btn">Process</button>
            </div>`;
        card.querySelector(".sell-btn").onclick = guard(() => {
            if (!window.WarehouseAPI.removeRaw(m.id, 1)) return showToast("Not enough to sell.", "Không đủ để bán.");
            addCurrency(m.sellDV, 0);
            announce("Sold");
            showToast(`Sold 1 ${m.name} for ${fmtNum(m.sellDV)} DV.`, `Đã bán 1 ${m.nameVN} với giá ${fmtNum(m.sellDV)} DV.`);
            renderZone(); updateTopBar();
        });
        card.querySelector(".process-btn").onclick = guard(() => openRecipeModal(m, null));
        wrap.appendChild(card);
    });
    document.getElementById("rawBagEmpty").style.display = any ? "none" : "block";
}

function renderProcessedBag() {
    const wh = window.WarehouseAPI.load();
    const wrap = document.getElementById("processedBag");
    wrap.innerHTML = "";
    let any = false;
    recipesForKind(activeZone).forEach((r) => {
        const qty = wh.processed[r.id] || 0;
        if (qty <= 0) return;
        any = true;
        const card = document.createElement("div");
        card.className = "goods-card";
        card.innerHTML = `
            <div class="goods-emoji">${r.emoji}</div>
            <div class="goods-info">
                <div class="goods-name">${r.name} <span class="goods-name-vn">(${r.nameVN})</span></div>
                <div class="goods-sub">Have: ${fmtNum(qty)} · Sell 1 for ${fmtNum(r.sellDV)} DV + ${fmtNum(r.sellEXP)} EXP</div>
            </div>
            <div class="goods-actions"><button class="mini-btn sell-btn">Sell 1</button></div>`;
        card.querySelector(".sell-btn").onclick = guard(() => {
            if (!window.WarehouseAPI.removeProcessed(r.id, 1)) return showToast("Not enough to sell.", "Không đủ để bán.");
            addCurrency(r.sellDV, r.sellEXP);
            announce("Sold");
            showToast(`Sold 1 ${r.name} for ${fmtNum(r.sellDV)} DV + ${fmtNum(r.sellEXP)} EXP.`, `Đã bán 1 ${r.nameVN}.`);
            renderZone(); updateTopBar();
        });
        wrap.appendChild(card);
    });
    document.getElementById("processedBagEmpty").style.display = any ? "none" : "block";
}

function renderStations() {
    ensureStationsLength();
    const container = document.getElementById("stationGrid");
    container.innerHTML = "";
    const lessons = getLessonsLearnedCount();
    const unlocked = getUnlockedSlotCount(lessons);
    const totalShown = Math.min(unlocked + 1, STORE_META.UNLOCK_THRESHOLDS.length);
    const now = Date.now();
    const arr = stations[activeZone];

    for (let i = 0; i < totalShown; i++) {
        const cell = document.createElement("div");
        cell.className = "station";

        if (i >= unlocked) {
            const needed = lessonsNeededForNextSlot(lessons);
            cell.classList.add("locked");
            cell.innerHTML = `<div class="station-lock">🔒</div><div class="station-lock-text">${needed ?? "?"} lessons</div>`;
            cell.onclick = guard(() => announce("Locked"));
            container.appendChild(cell);
            continue;
        }

        const job = arr[i];
        const info = getStationInfo(job, now);

        if (info.status === "empty") {
            cell.classList.add("empty");
            cell.innerHTML = `<div class="station-plus">＋</div><div class="station-hint">Process here</div>`;
            cell.onclick = guard(() => openRecipeModal(null, i));
            container.appendChild(cell);
            continue;
        }

        const recipe = CATALOG.RECIPES[job.rawId].find((r) => r.id === job.recipeId);

        if (info.status === "spoiled") {
            cell.classList.add("spoiled");
            cell.innerHTML = `<div class="station-emoji">🥴</div><div class="station-name">${recipe.name}</div><div class="station-status">Spoiled! (Hỏng rồi)</div><button class="mini-btn discard-btn">Discard</button>`;
            cell.querySelector(".discard-btn").onclick = guard((e) => {
                e.stopPropagation();
                announce("Discard");
                arr[i] = null; saveStations(stations);
                showToast("Discarded the spoiled batch.", "Đã vứt bỏ mẻ hàng bị hỏng.");
                renderZone();
            });
            container.appendChild(cell);
            continue;
        }

        if (info.status === "ready") {
            cell.classList.add("ready");
            cell.innerHTML = `<div class="station-emoji">${recipe.emoji}</div><div class="station-name">${recipe.name}</div><div class="station-status">Ready! Collect within 48h</div><button class="mini-btn collect-btn">Collect</button>`;
            cell.querySelector(".collect-btn").onclick = guard((e) => {
                e.stopPropagation();
                window.WarehouseAPI.addProcessed(recipe.id, 1);
                arr[i] = null; saveStations(stations);
                announce(`Collected ${recipe.name}`);
                showToast(`Collected ${recipe.name}!`, `Đã lấy ${recipe.nameVN}!`);
                renderZone();
            });
            container.appendChild(cell);
            continue;
        }

        // processing
        cell.classList.add("processing");
        cell.innerHTML = `
            <div class="station-emoji">${recipe.emoji}</div>
            <div class="station-name">${recipe.name}</div>
            <div class="station-status">Processing… ${info.progressPct}%</div>
            <div class="mini-bar"><div style="width:${info.progressPct}%"></div></div>`;
        cell.onclick = guard(() => announce("Still processing"));
        container.appendChild(cell);
    }
}

function renderZone() {
    renderTabs();
    renderRawBag();
    renderStations();
    renderProcessedBag();
}

// ===== 9. Modal chọn nguyên liệu -> chọn công thức =====
let modalStationIdx = null;

function openRecipeModal(material, stationIdx) {
    modalStationIdx = stationIdx ?? null;
    const wh = window.WarehouseAPI.load();
    const modal = document.getElementById("recipeModal");
    const body = document.getElementById("recipeModalBody");
    announce("Choose");

    if (!material) {
        const mats = materialsForKind(activeZone).filter((m) => (wh.raw[m.id] || 0) > 0);
        body.innerHTML = `<div class="modal-title">Pick a raw material</div><div class="modal-title-vn">Chọn nguyên liệu</div>`;
        if (mats.length === 0) {
            body.innerHTML += `<div class="modal-empty">No raw materials yet — go harvest some first!<br>Chưa có nguyên liệu, hãy quay lại vườn thu hoạch trước nhé.</div>`;
        }
        mats.forEach((m) => {
            const row = document.createElement("div");
            row.className = "shop-item";
            row.innerHTML = `
                <div class="shop-item-emoji">${m.emoji}</div>
                <div class="shop-item-info">
                    <div class="shop-item-name">${m.name} <span class="shop-item-vn">(${m.nameVN})</span></div>
                    <div class="shop-item-sub">Have: ${fmtNum(wh.raw[m.id] || 0)}</div>
                </div>
                <button class="shop-buy-btn">Choose</button>`;
            row.querySelector(".shop-buy-btn").onclick = guard(() => openRecipeModal(m, modalStationIdx));
            body.appendChild(row);
        });
        modal.style.display = "flex";
        return;
    }

    body.innerHTML = `<div class="modal-title">${material.name}</div><div class="modal-title-vn">${material.nameVN}</div>`;
    (CATALOG.RECIPES[material.id] || []).forEach((r) => {
        const row = document.createElement("div");
        row.className = "shop-item";
        row.innerHTML = `
            <div class="shop-item-emoji">${r.emoji}</div>
            <div class="shop-item-info">
                <div class="shop-item-name">${r.name} <span class="shop-item-vn">(${r.nameVN})</span></div>
                <div class="shop-item-sub">${r.days}d · cost ${fmtNum(r.costDV)} DV + ${fmtNum(r.costEXP)} EXP · sell ${fmtNum(r.sellDV)} DV + ${fmtNum(r.sellEXP)} EXP</div>
            </div>
            <button class="shop-buy-btn">Make</button>`;
        row.querySelector(".shop-buy-btn").onclick = guard(() => startProcessing(material, r));
        body.appendChild(row);
    });
    modal.style.display = "flex";
}
function closeRecipeModal() { document.getElementById("recipeModal").style.display = "none"; }
window.closeRecipeModal = guard(closeRecipeModal);

// ===== 10. Bắt đầu chế biến (tốn nguyên liệu + DV/EXP + phải qua 1 câu hỏi) =====
async function startProcessing(material, recipe) {
    const wh = window.WarehouseAPI.load();
    if ((wh.raw[material.id] || 0) < 1) return showToast("Not enough raw material.", "Không đủ nguyên liệu.");
    if (getDV() < recipe.costDV || getEXP() < recipe.costEXP) {
        return showToast(`Need ${fmtNum(recipe.costDV)} DV + ${fmtNum(recipe.costEXP)} EXP.`, `Cần ${fmtNum(recipe.costDV)} DV + ${fmtNum(recipe.costEXP)} EXP.`);
    }

    ensureStationsLength();
    const arr = stations[activeZone];
    let idx = modalStationIdx;
    if (idx == null || arr[idx]) {
        const lessons = getLessonsLearnedCount();
        const unlocked = getUnlockedSlotCount(lessons);
        idx = arr.findIndex((s, i) => i < unlocked && !s);
        if (idx === -1) return showToast("All kitchen stations are busy!", "Bếp đang bận hết, chờ 1 bếp xong nhé!");
    }

    if (!window.WarehouseAPI.removeRaw(material.id, 1)) return showToast("Not enough raw material.", "Không đủ nguyên liệu.");
    if (!spendCurrency(recipe.costDV, recipe.costEXP)) {
        window.WarehouseAPI.addRaw(material.id, 1); // hoàn lại nguyên liệu nếu thiếu tiền
        return showToast("Not enough currency.", "Không đủ DV/EXP.");
    }

    closeRecipeModal();
    setUiLocked(true);
    const finalize = () => {
        const now = Date.now();
        arr[idx] = { rawId: material.id, recipeId: recipe.id, startedAt: now, readyAt: now + recipe.days * 24 * 60 * 60 * 1000 };
        saveStations(stations);
        setUiLocked(false);
        announce(`Making ${recipe.name}`);
        showToast(`Started making ${recipe.name}! Ready in ${recipe.days}d.`, `Bắt đầu làm ${recipe.nameVN}! Xong sau ${recipe.days} ngày.`);
        renderZone(); updateTopBar();
    };

    try {
        const hasMission = await loadTodayMissionForQuiz();
        if (hasMission && window.QuizManager) {
            const ready = await window.QuizManager.prepareData();
            if (ready) { window.QuizManager.loadLevel(); window.QuizManager.initSkillPools(); }
        }
    } catch (e) { console.warn("⚠️ [Store] Không chuẩn bị được câu hỏi hôm nay:", e); }

    let settled = false;
    const finish = () => { if (settled) return; settled = true; finalize(); };
    if (window.QuizManager) {
        setTimeout(finish, 90000); // an toàn nếu quiz không tải được
        window.QuizManager.ask(() => finish());
    } else {
        finish();
    }
}

// ===== 11. Khởi động =====
function initStore() {
    if (!window.WarehouseAPI || !window.WarehouseCatalog) {
        console.error("❌ [Store] Thiếu pkm_garden_warehouse.js — hãy nạp file này TRƯỚC pkm_garden_store.js.");
        return;
    }
    ensureStationsLength();
    updateTopBar();
    if (window.QuizManager) window.QuizManager.prepareData();
    renderZone();
    setInterval(renderZone, 60 * 1000); // cập nhật tiến độ chế biến mỗi phút
}
document.addEventListener("DOMContentLoaded", initStore);
