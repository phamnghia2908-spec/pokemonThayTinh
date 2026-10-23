/**
 * ==========================================
 * PKM GARDEN v2 — LOGIC (Đất / Chuồng / Ao)
 * ==========================================
 * DOM CONTRACT (các #id mà pkm_garden.html cần có sẵn):
 *   #gardenDV #gardenEXP #lessonsLearnedTag        -> thanh trên cùng
 *   #zoneLand                                       -> lưới mảnh ruộng
 *   #zoneBarn #addAnimalBtn                         -> khu chuồng mở
 *   #zonePond #addFishBtn                           -> khu ao mở
 *   #toolbar                                        -> 9 nút công cụ (data-tool="...")
 *   #toolBanner                                     -> banner "Đang cầm: ..."
 *   #shopSeedsModal #shopSeedsTitle #shopSeedsList  -> shop giống (DV)
 *   #shopToolsModal #shopToolsList                  -> shop công cụ (EXP)
 *   #infoModal #infoModalBody                       -> khung thông tin song ngữ
 *   #gardenToast #gardenToastEn #gardenToastVn      -> toast song ngữ
 *   #quiz-overlay #quiz-word #quiz-options          -> modal câu hỏi (pkm_quiz.js)
 * ==========================================
 */

const CFG = window.GardenConfig;
const STORAGE_KEY = "pkm_garden_state";
const PET_STORAGE_KEY = "pkm_garden_pets_state"; // trạng thái chăm sóc thú cưng, theo uid trong pkm_inventory
const PET_CARE_REWARD_DV = 0.5;
const PET_CARE_REWARD_EXP = 0.5;

// Cho phép chăm sóc SỚM hơn mốc 24h tối đa bấy nhiêu (vào sớm vài tiếng vẫn
// chăm được). QUAN TRỌNG: khi chăm sớm, mốc "lần chăm này" vẫn được LƯU
// THEO LỊCH CŨ (lastCareAt + 24h) chứ KHÔNG lưu theo giờ bấm thực tế — nhờ
// vậy lịch không bị trôi sớm dần qua từng ngày, đảm bảo tối đa đúng 2 lần
// chăm trong mọi khoảng 48h liên tục. Áp dụng chung cho cây/vật nuôi/cá VÀ
// khu thú cưng.
const CARE_EARLY_GRACE_MS = 5 * 60 * 60 * 1000; // 5 giờ

// Toạ độ 3 khu đã quy hoạch (khớp với biến CSS trong pkm_garden.html :root) —
// thú cưng KHÔNG được phép đi vào bên trong các vùng này.
// Toạ độ 3 khu đã quy hoạch (khớp với biến CSS trong pkm_garden.html :root) —
// thú cưng KHÔNG được phép đi vào bên trong các vùng này (kể cả ĐI NGANG QUA).
const PET_FORBIDDEN_ZONES = [
    { top: 20.6, left: 8.3,  width: 30,   height: 28.1 }, // Ao
    { top: 22.6, left: 52.1, width: 32.6, height: 28.2 }, // Chuồng
    { top: 64.6, left: 22.2, width: 56.8, height: 28.1 }, // Ruộng
];
// Nới rộng thêm mỗi phía để bù kích thước thật của sprite (58×64px) — tránh
// trường hợp tâm điểm né được nhưng rìa ảnh vẫn đè lên vùng cấm. Tăng số này
// nếu vẫn thấy chạm viền, giảm nếu thấy né quá xa.
const PET_ZONE_PAD_PCT = 4;

function isInForbiddenZone(xPct, yPct) {
    return PET_FORBIDDEN_ZONES.some((z) =>
        xPct >= z.left - PET_ZONE_PAD_PCT && xPct <= z.left + z.width + PET_ZONE_PAD_PCT &&
        yPct >= z.top - PET_ZONE_PAD_PCT && yPct <= z.top + z.height + PET_ZONE_PAD_PCT
    );
}

// Kiểm tra ĐOẠN ĐƯỜNG (x1,y1)->(x2,y2) có CẮT NGANG qua 1 hình chữ nhật hay
// không (thuật toán Liang–Barsky). Bắt buộc phải có bước này vì sprite di
// chuyển theo đường thẳng giữa 2 điểm — nếu chỉ kiểm tra điểm đến, nó vẫn có
// thể xuyên qua giữa 1 vùng cấm nằm chắn giữa đường đi.
function segmentIntersectsRect(x1, y1, x2, y2, rect) {
    const xmin = rect.left - PET_ZONE_PAD_PCT, xmax = rect.left + rect.width + PET_ZONE_PAD_PCT;
    const ymin = rect.top - PET_ZONE_PAD_PCT, ymax = rect.top + rect.height + PET_ZONE_PAD_PCT;
    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - xmin, xmax - x1, y1 - ymin, ymax - y1];
    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
            if (q[i] < 0) return false; // song song với cạnh và nằm ngoài -> không cắt
        } else {
            const r = q[i] / p[i];
            if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
            else { if (r < t0) return false; if (r < t1) t1 = r; }
        }
    }
    return true; // tồn tại đoạn [t0,t1] hợp lệ -> đường đi có cắt qua hình chữ nhật
}
function pathHitsForbiddenZone(x1, y1, x2, y2) {
    return PET_FORBIDDEN_ZONES.some((z) => segmentIntersectsRect(x1, y1, x2, y2, z));
}

// Random ra 1 điểm KHÔNG rơi vào vùng cấm, VÀ đường đi từ vị trí hiện tại
// (curX, curY) tới điểm đó cũng không cắt ngang vùng nào (thử tối đa 30 lần).
function pickPetWanderSpot(curX, curY) {
    for (let i = 0; i < 30; i++) {
        const nx = 4 + Math.random() * 90, ny = 8 + Math.random() * 84;
        if (isInForbiddenZone(nx, ny)) continue;
        if (curX != null && curY != null && pathHitsForbiddenZone(curX, curY, nx, ny)) continue;
        return { nx, ny };
    }
    // Không tìm được đường nào an toàn sau 30 lần thử -> đứng yên tại chỗ,
    // an toàn tuyệt đối, đợi lượt sau thử lại.
    return { nx: curX != null ? curX : 4, ny: curY != null ? curY : 8 };
}

// ===== 0. ÂM THANH + TTS (tối đa hoá tiếp xúc tiếng Anh) =====

let _audioCtx = null;
function playClick() {
    try {
        _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = _audioCtx.createOscillator();
        const g = _audioCtx.createGain();
        o.type = "square";
        o.frequency.value = 880;
        g.gain.value = 0.06;
        o.connect(g);
        g.connect(_audioCtx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.0001, _audioCtx.currentTime + 0.13);
        o.stop(_audioCtx.currentTime + 0.14);
    } catch (e) { /* im lặng nếu trình duyệt chặn AudioContext trước khi có tương tác */ }
}
function speakEnglish(text) {
    try {
        if (!window.speechSynthesis || !text) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
    } catch (e) { /* im lặng nếu không hỗ trợ TTS */ }
}
// Gọi hàm này ở MỌI hành động bấm để vừa có tiếng "tách" vừa đọc tiếng Anh.
function announce(text) {
    playClick();
    speakEnglish(text);
}

// ===== 1. HẠ TẦNG CHUNG (Firebase lịch học + sheet từ vựng) =====

let _firebaseRefs = null;
async function getFirebaseRefs() {
    if (_firebaseRefs) return _firebaseRefs;
    const { initializeApp } = await import(
        "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js"
    );
    const { getFirestore, doc, getDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js"
    );
    const app = initializeApp(CFG.LESSON_FIREBASE_CONFIG, "gardenLessonApp");
    const db = getFirestore(app);
    _firebaseRefs = { db, doc, getDoc };
    return _firebaseRefs;
}

const realTrainerClass = localStorage.getItem("trainerClass") || "1";

function extractCodeFromTitle(title) {
    if (!title || typeof title !== "string") return "";
    const parts = title.trim().split(/[-\s.]+/);
    if (
        parts.length >= 3 &&
        /^\d+$/.test(parts[0]) &&
        /^\d+$/.test(parts[1]) &&
        /^\d+$/.test(parts[2])
    ) {
        return parts[0] + parts[1] + parts[2];
    }
    return "";
}
function rowsToArr(r) {
    return Array.isArray(r) ? r : Object.values(r);
}

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
    const words = [];
    const seen = new Set();
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
        ...new Set(
            rows.map((r) => rowsToArr(r)[colID]?.toString().trim())
                .filter((id) => id && id.startsWith(realTrainerClass + "-")),
        ),
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
    const words = rows
        .filter((r) => rowsToArr(r)[colID]?.toString().trim() === pickedId)
        .map((r) => rowsToArr(r)[colWord])
        .filter(Boolean);
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
    } catch (e) {
        console.warn("⚠️ [Garden] Không tải được lịch học hôm nay:", e);
    }
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

// ===== 2. STATE =====

function emptyToolCounts() {
    return Object.fromEntries(Object.keys(CFG.TOOLS).map((k) => [k, 0]));
}
function loadState() {
    let state = { lands: [], barn: [], pond: [], tools: {} };
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (raw && Array.isArray(raw.lands)) state = raw;
    } catch (e) { /* dữ liệu hỏng -> tạo mới */ }
    if (!Array.isArray(state.barn)) state.barn = [];
    if (!Array.isArray(state.pond)) state.pond = [];
    state.tools = Object.assign(emptyToolCounts(), state.tools || {});
    return state;
}
function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
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
function round1(n) { return Math.round(n * 10) / 10; }
function getLessonsLearnedCount() {
    return (JSON.parse(localStorage.getItem("pkm_passed_maps")) || []).length;
}

// ===== 3. MỞ KHOÁ =====

function getUnlockedSlotCount(lessonsLearned) {
    let count = 0;
    for (const t of CFG.UNLOCK_THRESHOLDS) { if (lessonsLearned >= t) count++; else break; }
    return Math.max(1, count);
}
function lessonsNeededForNextSlot(lessonsLearned) {
    const next = CFG.UNLOCK_THRESHOLDS.find((t) => t > lessonsLearned);
    return next === undefined ? null : next - lessonsLearned;
}

// ===== 4. STATE MACHINE VÒNG ĐỜI (dùng chung cây / vật nuôi / cá) =====

function findTier(kind, id) {
    const list = kind === "plant" ? CFG.PLANT_TIERS : kind === "animal" ? CFG.ANIMAL_TIERS : CFG.FISH_TIERS;
    return list.find((t) => t.id === id) || null;
}
const DAY_MS = 24 * 60 * 60 * 1000;

// Trả {status, tier, health, progressPct, ...}. CÓ THỂ mutate entity (dead / readyAt)
// khi lần đầu tiên phát hiện chết / chín — gọi saveState() sau khi quét xong.
function getEntityInfo(entity, kind, now) {
    if (!entity || !entity.tierId) return { status: "empty" };
    const tier = findTier(kind, entity.tierId);
    if (!tier) return { status: "empty" };
    if (entity.dead) return { status: "dead", tier, health: 0, progressPct: 100 };

    if (entity.readyAt) {
        if (now - entity.readyAt > CFG.HARVEST_GRACE_MS) {
            entity.dead = true;
            return { status: "dead", tier, health: 0, progressPct: 100 };
        }
        return { status: "ready", tier, health: 100, progressPct: 100, harvestDeadline: entity.readyAt + CFG.HARVEST_GRACE_MS };
    }

    if (!entity.activatedAt) {
        return { status: "seed", tier, health: null, progressPct: 0 };
    }

    const sinceCare = now - entity.lastCareAt;
    if (sinceCare > CFG.DEATH_MS) {
        entity.dead = true;
        return { status: "dead", tier, health: 0, progressPct: 100 };
    }

    const requiredMs = tier.days * DAY_MS;
    const stalled = sinceCare > CFG.CARE_INTERVAL_MS;
    const elapsedMs = stalled
        ? (entity.lastCareAt + CFG.CARE_INTERVAL_MS - entity.activatedAt) - entity.pausedMs
        : (now - entity.activatedAt) - entity.pausedMs;

    if (elapsedMs >= requiredMs) {
        entity.readyAt = now;
        return { status: "ready", tier, health: 100, progressPct: 100, harvestDeadline: now + CFG.HARVEST_GRACE_MS };
    }

    let health = 100;
    if (stalled) {
        const overdue = sinceCare - CFG.CARE_INTERVAL_MS;
        const decayWindow = CFG.DEATH_MS - CFG.CARE_INTERVAL_MS;
        health = Math.max(0, Math.round(100 * (1 - Math.min(1, overdue / decayWindow))));
    }
    const progressPct = Math.min(99, Math.round((elapsedMs / requiredMs) * 100));
    return {
        status: stalled ? "stalled" : "growing",
        tier, health, progressPct,
        canCareAgainAt: entity.lastCareAt + CFG.CARE_INTERVAL_MS,
    };
}

function canCareNow(entity, now) {
    if (!entity.activatedAt) return true; // chưa từng chăm -> lần đầu luôn được phép
    return now - entity.lastCareAt >= CFG.CARE_INTERVAL_MS - CARE_EARLY_GRACE_MS;
}

const CARE_GROUPS = {
    plant: ["water", "fertilizer"],
    animal: ["food", "brush"],
    fish: ["bran", "medicine"],
};
const HARVEST_TOOL = { plant: "sickle", animal: "sack", fish: "basket" };

function buyAndPlant(state, key, idx, kind, tierId) {
    const tier = findTier(kind, tierId);
    if (!tier) return { ok: false, en: "Item not found.", vn: "Không tìm thấy loại này." };
    const cost = tier.seedCostDV ?? tier.priceDV;
    if (!spendCurrency(cost, 0)) return { ok: false, en: "Not enough Reputation.", vn: `Không đủ ${cost} Danh Vọng.` };
    state[key][idx] = {
        tierId, boughtAt: Date.now(), activatedAt: null, lastCareAt: null,
        pausedMs: 0, readyAt: null, dead: false,
    };
    saveState(state);
    return { ok: true, tier };
}

function clearDeadEntity(state, key, idx) {
    state[key][idx] = null;
    saveState(state);
}

// Dùng CÔNG CỤ CHĂM SÓC — cần đủ CẢ 2 loại trong nhóm, chỉ 1 lần/24h,
// luôn mở câu hỏi từ vựng trước (đúng/sai không ảnh hưởng).
async function careForEntity(state, key, idx, kind, onDone) {
    const entity = state[key][idx];
    const now = Date.now();
    if (!entity || !entity.tierId) return onDone(false, { en: "This spot is empty.", vn: "Ô này trống." });
    const info = getEntityInfo(entity, kind, now);
    if (info.status === "dead") { saveState(state); return onDone(false, { en: "It already died.", vn: "Đã chết mất rồi 😢" }); }
    if (info.status === "ready") return onDone(false, { en: "Fully grown — go harvest it!", vn: "Đã chín rồi, đi thu hoạch thôi!" });
    if (!canCareNow(entity, now)) {
        const mins = Math.ceil((entity.lastCareAt + CFG.CARE_INTERVAL_MS - CARE_EARLY_GRACE_MS - now) / 60000);
        return onDone(false, { en: `Already cared today. Come back in ${mins} min.`, vn: `Hôm nay đã chăm rồi, quay lại sau ${mins} phút.` });
    }
    const [toolA, toolB] = CARE_GROUPS[kind];
    if (state.tools[toolA] <= 0 || state.tools[toolB] <= 0) {
        const missing = state.tools[toolA] <= 0 ? CFG.TOOLS[toolA] : CFG.TOOLS[toolB];
        return onDone(false, { en: `You need ${missing.name}. Visit the shop!`, vn: `Bạn cần ${missing.nameVN}, ghé shop mua nhé.` });
    }

    setUiLocked(true);
    const finalize = () => {
        const now2 = Date.now();
        if (!entity.activatedAt) {
            entity.activatedAt = now2;
            entity.pausedMs = 0;
            entity.lastCareAt = now2; // lần chăm đầu tiên -> lấy đúng giờ thực tế làm mốc gốc
        } else {
            const sinceCare = now2 - entity.lastCareAt;
            if (sinceCare > CFG.CARE_INTERVAL_MS) entity.pausedMs += (sinceCare - CFG.CARE_INTERVAL_MS);
            // Chăm sớm (trong khoảng grace) -> "chốt" mốc coi như chăm ĐÚNG giờ hẹn
            // (lastCareAt cũ + 24h), KHÔNG lấy giờ bấm thực tế now2, để lịch không
            // bị lùi sớm dần qua từng ngày.
            const scheduledNext = entity.lastCareAt + CFG.CARE_INTERVAL_MS;
            entity.lastCareAt = now2 < scheduledNext ? scheduledNext : now2;
        }
        state.tools[toolA]--; state.tools[toolB]--;
        saveState(state);
        setUiLocked(false);
        onDone(true, { en: "Great job caring for it!", vn: "Chăm sóc thành công!" }, [toolA, toolB]);
    };

    try {
        const hasMission = await loadTodayMissionForQuiz();
        if (hasMission && window.QuizManager) {
            const ready = await window.QuizManager.prepareData();
            if (ready) { window.QuizManager.loadLevel(); window.QuizManager.initSkillPools(); }
        }
    } catch (e) { console.warn("⚠️ [Garden] Không chuẩn bị được câu hỏi hôm nay:", e); }

    let settled = false;
    const finish = () => { if (settled) return; settled = true; finalize(); };
    if (window.QuizManager) {
        setTimeout(finish, 90000); // an toàn nếu quiz không tải được, không khoá màn hình mãi
        window.QuizManager.ask(() => finish());
    } else {
        finish();
    }
}

// Thu hoạch — cần đúng công cụ thu hoạch (liềm/bao/giỏ), KHÔNG mở quiz.
function harvestEntity(state, key, idx, kind) {
    const entity = state[key][idx];
    const now = Date.now();
    if (!entity || !entity.tierId) return { ok: false, en: "This spot is empty.", vn: "Ô này trống." };
    const info = getEntityInfo(entity, kind, now);
    saveState(state);
    if (info.status === "dead") { state[key][idx] = null; saveState(state); return { ok: false, en: "It died before harvest 😢", vn: "Đã chết trước khi kịp thu hoạch 😢" }; }
    if (info.status !== "ready") return { ok: false, en: "Not ready yet.", vn: "Chưa chín, chờ thêm nhé." };
    const toolId = HARVEST_TOOL[kind];
    if (state.tools[toolId] <= 0) return { ok: false, en: `You need a ${CFG.TOOLS[toolId].name}.`, vn: `Bạn cần ${CFG.TOOLS[toolId].nameVN}, ghé shop mua nhé.` };
    state.tools[toolId]--;
    if (window.WarehouseAPI) window.WarehouseAPI.addRaw(info.tier.id, 1); // cho vào Kho thay vì ra thẳng DV/EXP
    state[key][idx] = null;
    saveState(state);
    return { ok: true, tier: info.tier };
}

// ===== 5. HIỆU ỨNG =====
const EFFECT_PARTICLES = {
    water: { cls: "fx-water", particle: "💧", count: 6 },
    fertilizer: { cls: "fx-sparkle", particle: "✨", count: 6 },
    food: { cls: "fx-sparkle", particle: "🍖", count: 4 },
    brush: { cls: "fx-bubble", particle: "🫧", count: 6 },
    bran: { cls: "fx-sparkle", particle: "🌾", count: 4 },
    medicine: { cls: "fx-bubble", particle: "💊", count: 4 },
    sickle: { cls: "fx-flash", particle: "💥", count: 1 },
    sack: { cls: "fx-flash", particle: "✅", count: 1 },
    basket: { cls: "fx-flash", particle: "✅", count: 1 },
};
function playEffect(targetEl, toolIds) {
    if (!targetEl) return;
    (Array.isArray(toolIds) ? toolIds : [toolIds]).forEach((toolId, i) => {
        const spec = EFFECT_PARTICLES[toolId];
        if (!spec) return;
        setTimeout(() => {
            const wrap = document.createElement("div");
            wrap.className = `fx-layer ${spec.cls}`;
            for (let p = 0; p < spec.count; p++) {
                const el = document.createElement("span");
                el.className = "fx-particle";
                el.textContent = spec.particle;
                el.style.left = 10 + Math.random() * 80 + "%";
                el.style.animationDelay = Math.random() * 0.25 + "s";
                wrap.appendChild(el);
            }
            targetEl.appendChild(wrap);
            setTimeout(() => wrap.remove(), 1100);
        }, i * 260);
    });
}

// ===== 6. KHOÁ THAO TÁC TOÀN CỤC LÚC QUIZ =====

let uiLocked = false;
function setUiLocked(v) {
    uiLocked = v;
    document.body.classList.toggle("ui-locked", v);
}
// Bọc mọi handler bấm để tự chặn khi đang khoá — tránh bấm dồn đè quiz.
function guard(fn) {
    return (...args) => { if (uiLocked) return; fn(...args); };
}

// ===== 7. RENDER UI =====

let gameState = loadState();
let selectedTool = null;

function fmtNum(n) { return Number.isInteger(n) ? n : n.toFixed(1); }

function updateTopBar() {
    document.getElementById("gardenDV").textContent = fmtNum(getDV());
    document.getElementById("gardenEXP").textContent = fmtNum(getEXP());
    const lessons = getLessonsLearnedCount();
    document.getElementById("lessonsLearnedTag").textContent = `📘 ${lessons} lessons`;
}

function updateToolbar() {
    Object.keys(CFG.TOOLS).forEach((toolId) => {
        const btn = document.querySelector(`#toolbar [data-tool="${toolId}"]`);
        if (!btn) return;
        btn.querySelector(".tool-count").textContent = fmtNum(gameState.tools[toolId]);
        btn.classList.toggle("selected", selectedTool === toolId);
    });
    const banner = document.getElementById("toolBanner");
    if (selectedTool) {
        const t = CFG.TOOLS[selectedTool];
        banner.style.display = "flex";
        banner.innerHTML = `Holding: ${t.emoji} <b>${t.name}</b> (${t.nameVN}) — tap a target to use <button id="cancelToolBtn">✕</button>`;
        document.getElementById("cancelToolBtn").onclick = guard(() => { selectedTool = null; updateToolbar(); });
    } else {
        banner.style.display = "none";
        banner.innerHTML = "";
    }
}
function selectTool(toolId) {
    const t = CFG.TOOLS[toolId];
    selectedTool = selectedTool === toolId ? null : toolId;
    announce(selectedTool ? t.name : "Cancel");
    updateToolbar();
}
window.selectTool = selectTool;

function timeLeftLabel(info) {
    if (info.status === "seed") return "Need first care";
    if (info.status === "ready") {
        const ms = info.harvestDeadline - Date.now();
        const h = Math.max(0, Math.floor(ms / 3600000));
        return `Ready! (spoils in ${h}h)`;
    }
    if (info.status === "stalled") return "⚠️ Needs care now!";
    return "Growing…";
}

// Tạo cảm giác "cả ô đầy cây" bằng cách rải nhiều emoji nhỏ khắp ô, thay vì
// 1 icon lẻ ở giữa — không cần tải thêm ảnh, vẫn nhẹ. Vị trí/góc xoay lấy
// giả-ngẫu-nhiên theo `seed` (chỉ số ô) nên KHÔNG nhảy lung tung mỗi lần
// render lại, luôn giữ nguyên hình dạng cho từng ô.
function pseudoRandom(seed) {
    const x = Math.sin(seed * 9973.1) * 43758.5453;
    return x - Math.floor(x);
}
function cropPatchHTML(emoji, seed, count = 40) {
    let items = "";
    for (let i = 0; i < count; i++) {
        const left = 6 + pseudoRandom(seed * 31 + i * 7 + 1) * 84;
        const top = 8 + pseudoRandom(seed * 17 + i * 13 + 2) * 74;
        const rot = Math.round(pseudoRandom(seed * 11 + i * 3 + 3) * 40 - 20);
        const scale = (0.75 + pseudoRandom(seed * 19 + i * 5 + 4) * 0.5).toFixed(2);
        items += `<span class="crop-patch-item" style="left:${left}%; top:${top}%; transform:translate(-50%,-50%) rotate(${rot}deg) scale(${scale});">${emoji}</span>`;
    }
    return `<div class="plot-sprite crop-patch">${items}</div>`;
}

// ===== Khu Ruộng (mảnh ruộng thật, luôn dư 1 mảnh khoá làm mồi) =====

function renderLandField() {
    const container = document.getElementById("zoneLand");
    if (!container) return;
    container.innerHTML = "";
    const lessons = getLessonsLearnedCount();
    const unlocked = getUnlockedSlotCount(lessons);
    const totalShown = Math.min(unlocked + 1, CFG.UNLOCK_THRESHOLDS.length); // luôn dư đúng 1 ô khoá làm mồi
    container.style.gridTemplateColumns = `repeat(${totalShown}, 1fr)`;
    const now = Date.now();

    for (let i = 0; i < totalShown; i++) {
        const cell = document.createElement("div");
        cell.className = "land-plot";

        if (i >= unlocked) {
            const needed = lessonsNeededForNextSlot(lessons);
            cell.classList.add("locked");
            cell.innerHTML = `<div class="plot-lock">🔒</div><div class="plot-lock-text">${needed ?? "?"} lessons to unlock</div>`;
            cell.onclick = guard(() => announce("Locked"));
            container.appendChild(cell);
            continue;
        }

        const entity = gameState.lands[i] || null;
        const info = getEntityInfo(entity, "plant", now);

        if (info.status === "empty") {
            cell.classList.add("empty");
            cell.innerHTML = `<div class="plot-plus">＋</div>`;
            cell.onclick = guard(() => { announce("Plant a seed"); openSeedShop("lands", i, "plant"); });
            container.appendChild(cell);
            continue;
        }
        if (info.status === "dead") {
            cell.classList.add("dead");
            cell.innerHTML = `<div class="plot-sprite">🥀</div><div class="plot-name">${info.tier.name}</div><div class="plot-status">Dead</div><button class="plot-clear-btn">Clear</button>`;
            cell.querySelector(".plot-clear-btn").onclick = guard((e) => {
                e.stopPropagation(); announce("Clear");
                clearDeadEntity(gameState, "lands", i); renderLandField();
            });
            container.appendChild(cell);
            continue;
        }

        cell.classList.add(info.status);
        // Luôn phủ kín cả ô bằng nhiều emoji rải rác (kể cả lúc vừa gieo hạt) —
        // tránh trông "trơ trụi" chỉ 1 icon lẻ. cropPatchHTML chỉ tạo vài span
        // CSS tĩnh, không animation/không tính lại liên tục nên không gây đơ máy.
        const spriteHTML = cropPatchHTML(info.status === "ready" ? info.tier.emoji : info.tier.growEmoji, i);
        cell.innerHTML = `
            ${spriteHTML}
            <div class="plot-info-overlay">
                <div class="plot-name">${info.tier.name}</div>
                <div class="plot-status">${timeLeftLabel(info)}</div>
                ${info.status !== "seed" ? `<div class="mini-bars"><div class="mini-bar hp"><div style="width:${info.health}%"></div></div><div class="mini-bar pg"><div style="width:${info.progressPct}%"></div></div></div>` : ""}
            </div>`;
        cell.onclick = guard(() => handlePlantTap(i, entity, info, cell.querySelector(".plot-sprite")));
        container.appendChild(cell);
    }
    saveState(gameState); // lưu lại nếu getEntityInfo vừa phát hiện dead/ready
}

function handlePlantTap(idx, entity, info, spriteEl) {
    announce(info.tier.name);
    if (!selectedTool) return openInfoModal("plant", info, entity, "lands", idx);

    const tool = CFG.TOOLS[selectedTool];
    if (tool.role === "harvest") {
        if (tool.group !== "plant") return showToast(`${tool.name} doesn't work on plants.`, `${tool.nameVN} không dùng cho cây được.`);
        const r = harvestEntity(gameState, "lands", idx, "plant");
        if (r.ok) { playEffect(spriteEl, "sickle"); showToast(`Harvested ${r.tier.name}! Added to your warehouse.`, `Đã thu hoạch ${r.tier.nameVN}! Đã cho vào Kho.`); }
        else showToast(r.en, r.vn);
        updateToolbar(); renderLandField();
        return;
    }
    if (tool.group !== "plant") return showToast(`${tool.name} doesn't work on plants.`, `${tool.nameVN} không dùng cho cây được.`);
    careForEntity(gameState, "lands", idx, "plant", (ok, msg, toolIds) => {
        if (ok) { playEffect(spriteEl, toolIds); announce(msg.en); }
        else showToast(msg.en, msg.vn);
        selectedTool = null;
        updateToolbar(); renderLandField();
    });
}

// ===== Khu Chuồng / Ao (open-roam, dùng chung logic) =====

const roamSpriteEls = { barn: {}, pond: {} };
const roamTimers = { barn: {}, pond: {} };

function makePenRenderer(zoneId, addBtnId, key, kind, tiers, wanderClass) {
    return function renderPen() {
        const pen = document.getElementById(zoneId);
        if (!pen) return;
        const lessons = getLessonsLearnedCount();
        const unlocked = getUnlockedSlotCount(lessons);
        const now = Date.now();
        const spriteEls = roamSpriteEls[key];
        const timers = roamTimers[key];

        // Sprite chỉ bị dọn khi Ô ĐÃ THỰC SỰ TRỐNG (đã bấm xoá / thu hoạch) —
        // KHÔNG dọn chỉ vì con vật chết, để người chơi còn thấy mà bấm xoá.
        Object.keys(spriteEls).forEach((k) => {
            const i = Number(k);
            const entity = gameState[key][i];
            const stillHasEntity = i < unlocked && entity && entity.tierId;
            if (!stillHasEntity) {
                clearInterval(timers[i]); delete timers[i];
                spriteEls[k].remove(); delete spriteEls[k];
            }
        });

        for (let i = 0; i < unlocked; i++) {
            const entity = gameState[key][i];
            if (!entity || !entity.tierId) continue;
            const info = getEntityInfo(entity, kind, now);
            let el = spriteEls[i];

            // ĐÃ CHẾT: đứng yên tại chỗ, hiện đầu lâu, bấm vào là dọn ô ngay
            // (không cần confirm vì đã chết, không mất gì thêm khi dọn).
            if (info.status === "dead") {
                if (el) {
                    clearInterval(timers[i]); delete timers[i];
                    el.style.transition = "none";
                } else {
                    el = document.createElement("div");
                    el.className = `roam-sprite ${wanderClass}`;
                    el.style.left = 10 + Math.random() * 70 + "%";
                    el.style.top = 15 + Math.random() * 60 + "%";
                    el.innerHTML = `<img src="${CFG.POKEMON_ANI_URL(info.tier.pokemon)}" alt="${info.tier.name}"><div class="roam-badge"></div><div class="roam-name"></div>`;
                    pen.appendChild(el);
                    spriteEls[i] = el;
                }
                el.classList.add("dead-sprite");
                el.querySelector(".roam-badge").textContent = "💀";
                el.querySelector(".roam-name").textContent = `${info.tier.name} (Dead)`;
                const bars = el.querySelector(".roam-bars");
                if (bars) bars.style.display = "none";
                el.onclick = guard(() => {
                    announce("Clear");
                    gameState[key][i] = null;
                    saveState(gameState);
                    clearInterval(timers[i]); delete timers[i];
                    el.remove(); delete spriteEls[i];
                    renderAll();
                });
                continue;
            }

            // CÒN SỐNG: giữ nguyên logic cũ
            if (!el) {
                el = document.createElement("div");
                el.className = `roam-sprite ${wanderClass}`;
                el.style.left = 10 + Math.random() * 70 + "%";
                el.style.top = 15 + Math.random() * 60 + "%";
                el.innerHTML = `<img src="${CFG.POKEMON_ANI_URL(info.tier.pokemon)}" alt="${info.tier.name}"><div class="roam-badge"></div><div class="roam-name"></div><div class="roam-bars"><div class="mini-bar hp"><div></div></div><div class="mini-bar pg"><div></div></div></div>`;
                pen.appendChild(el);
                spriteEls[i] = el;
                startWander(pen, el, key, i);
                el.onclick = guard(() => handleRoamTap(key, i, kind, el.querySelector("img")));
            }
            el.classList.remove("dead-sprite");
            el.querySelector(".roam-badge").textContent = info.status === "ready" ? "✨" : info.status === "stalled" ? "⚠️" : info.status === "seed" ? "🌰" : "💤";
            el.querySelector(".roam-name").textContent = info.tier.name;
            if (info.status !== "seed") {
                el.querySelector(".hp div").style.width = info.health + "%";
                el.querySelector(".pg div").style.width = info.progressPct + "%";
                el.querySelector(".roam-bars").style.display = "flex";
            } else {
                el.querySelector(".roam-bars").style.display = "none";
            }
        }
        updatePenHint(zoneId, key, unlocked);
        saveState(gameState);
    };
}
function startWander(pen, el, key, idx) {
    const move = () => {
        if (!pen.contains(el)) return;
        const nx = 6 + Math.random() * 80, ny = 12 + Math.random() * 68;
        const curX = parseFloat(el.style.left);
        const img = el.querySelector("img");
        if (img) img.style.transform = nx < curX ? "scaleX(-1)" : "scaleX(1)";
        el.style.transition = "left 2.6s ease-in-out, top 2.6s ease-in-out";
        el.style.left = nx + "%"; el.style.top = ny + "%";
    };
    move();
    roamTimers[key][idx] = setInterval(move, 3400);
}

function updatePenHint(zoneId, key, unlocked) {
    const pen = document.getElementById(zoneId);
    let hint = pen.querySelector(".pen-empty-hint");
    const hasAny = gameState[key].some((p, i) => i < unlocked && p && p.tierId);
    if (!hasAny) {
        if (!hint) {
            hint = document.createElement("div");
            hint.className = "pen-empty-hint";
            hint.textContent = "Empty — tap (+) to start!";
            pen.appendChild(hint);
        }
    } else if (hint) hint.remove();
}

function handleRoamTap(key, idx, kind, imgEl) {
    const entity = gameState[key][idx];
    const info = getEntityInfo(entity, kind, Date.now());
    announce(`${info.tier.name}${info.tier.pokemon ? ", " + capitalize(info.tier.pokemon) : ""}`);

    if (!selectedTool) return openInfoModal(kind, info, entity, key, idx);

    const tool = CFG.TOOLS[selectedTool];
    if (tool.group !== kind) return showToast(`${tool.name} doesn't work here.`, `${tool.nameVN} không dùng ở đây được.`);
    const spriteWrap = imgEl.closest(".roam-sprite");

        if (tool.role === "harvest") {
            const r = harvestEntity(gameState, key, idx, kind);
            if (r.ok) { playEffect(spriteWrap, tool.id); showToast(`Harvested ${r.tier.name}! Added to your warehouse.`, `Đã thu hoạch ${r.tier.nameVN}! Đã cho vào Kho.`); }
            else showToast(r.en, r.vn);
        updateToolbar(); renderAll();
        return;
    }
    careForEntity(gameState, key, idx, kind, (ok, msg, toolIds) => {
        if (ok) { playEffect(spriteWrap, toolIds); announce(msg.en); }
        else showToast(msg.en, msg.vn);
        selectedTool = null;
        updateToolbar(); renderAll();
    });
}
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function addToPenClicked(key, kind, addLabel) {
    const lessons = getLessonsLearnedCount();
    const unlocked = getUnlockedSlotCount(lessons);
    const freeIdx = gameState[key].findIndex((p, i) => i < unlocked && (!p || !p.tierId));
    announce(addLabel);
    if (freeIdx === -1) {
        const needed = lessonsNeededForNextSlot(lessons);
        return showToast(needed ? `Full! Learn ${needed} more lessons to expand.` : "Full!", needed ? `Đầy rồi! Học thêm ${needed} bài để mở rộng.` : "Đầy rồi!");
    }
    openSeedShop(key, freeIdx, kind);
}

const renderBarnPen = makePenRenderer("zoneBarn", "addAnimalBtn", "barn", "animal", CFG.ANIMAL_TIERS, "wander-barn");
const renderPondPen = makePenRenderer("zonePond", "addFishBtn", "pond", "fish", CFG.FISH_TIERS, "wander-pond");

// ===== Khu Thú Cưng (Pokémon ĐANG SỞ HỮU, đọc từ pkm_inventory) =====
// KHÁC hẳn logic cây/vật nuôi/cá ở trên:
//  - Không mua, không mất tiền — đây là chính những Pokémon người chơi đang có.
//  - Chạy tự do khắp bản đồ (không giới hạn trong 1 ô/1 khu).
//  - Chăm bằng BẤT KỲ công cụ nào TRỪ 3 dụng cụ thu hoạch (liềm/bao/giỏ),
//    không cần đủ cặp, không cần đúng nhóm plant/animal/fish.
//  - Mỗi ngày (24h) chăm 1 lần / 1 con -> +0.5 DV + 0.5 EXP.
//  - KHÔNG BAO GIỜ CHẾT nếu bị bỏ bê — chỉ chuyển sang trạng thái "Suy yếu"
//    (chỉ để hiển thị cảnh báo, không mất gì cả).

function loadPetState() {
    try {
        const raw = JSON.parse(localStorage.getItem(PET_STORAGE_KEY) || "{}");
        return raw && typeof raw === "object" ? raw : {};
    } catch (e) { return {}; }
}
function savePetState(petState) {
    localStorage.setItem(PET_STORAGE_KEY, JSON.stringify(petState));
}
function getOwnedPokemons() {
    try {
        const arr = JSON.parse(localStorage.getItem("pkm_inventory") || "[]");
        return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
}
// weakened = true nếu chưa từng chăm HOẶC đã quá 24h kể từ lần chăm gần nhất.
function getPetInfo(uid, petState, now) {
    const rec = petState[uid];
    const lastCareAt = rec && rec.lastCareAt ? rec.lastCareAt : null;
    const weakened = !lastCareAt || (now - lastCareAt > CFG.CARE_INTERVAL_MS);
    return { weakened, lastCareAt };
}
function canCarePetNow(uid, petState, now) {
    const rec = petState[uid];
    if (!rec || !rec.lastCareAt) return true;
    return now - rec.lastCareAt >= CFG.CARE_INTERVAL_MS - CARE_EARLY_GRACE_MS;
}

// Chăm 1 thú cưng bằng 1 công cụ bất kỳ (trừ công cụ thu hoạch).
async function careForPet(pkm, toolId, onDone) {
    const tool = CFG.TOOLS[toolId];
    if (!tool) return onDone(false, { en: "Unknown tool.", vn: "Không rõ công cụ." });
    if (tool.role === "harvest") {
        return onDone(false, { en: `${tool.name} can't be used to care for Pokémon.`, vn: `${tool.nameVN} không dùng để chăm sóc được.` });
    }
    if (gameState.tools[toolId] <= 0) {
        return onDone(false, { en: `You need ${tool.name}. Visit the shop!`, vn: `Bạn cần ${tool.nameVN}, ghé shop mua nhé.` });
    }
    const now = Date.now();
    const petState = loadPetState();
    if (!canCarePetNow(pkm.uid, petState, now)) {
        const rec = petState[pkm.uid];
        const mins = Math.ceil((rec.lastCareAt + CFG.CARE_INTERVAL_MS - CARE_EARLY_GRACE_MS - now) / 60000);
        return onDone(false, { en: `Already cared today. Come back in ${mins} min.`, vn: `Hôm nay đã chăm rồi, quay lại sau ${mins} phút.` });
    }

    setUiLocked(true);
    const finalize = () => {
        gameState.tools[toolId]--;
        saveState(gameState);
        const petState2 = loadPetState();
        const now2 = Date.now();
        const prevRec = petState2[pkm.uid];
        let newLastCareAt;
        if (!prevRec || !prevRec.lastCareAt) {
            newLastCareAt = now2; // lần chăm đầu tiên -> lấy đúng giờ thực tế
        } else {
            // Chăm sớm (trong khoảng grace) -> chốt mốc theo lịch cũ (+24h), không
            // lấy giờ bấm thực tế, tránh lịch trôi sớm dần qua từng ngày.
            const scheduledNext = prevRec.lastCareAt + CFG.CARE_INTERVAL_MS;
            newLastCareAt = now2 < scheduledNext ? scheduledNext : now2;
        }
        petState2[pkm.uid] = { lastCareAt: newLastCareAt };
        savePetState(petState2);
        addCurrency(PET_CARE_REWARD_DV, PET_CARE_REWARD_EXP);
        setUiLocked(false);
        onDone(true, {
            en: `Great job caring for ${pkm.name}! +${fmtNum(PET_CARE_REWARD_DV)} DV +${fmtNum(PET_CARE_REWARD_EXP)} EXP`,
            vn: `Chăm sóc ${pkm.name} thành công! +${fmtNum(PET_CARE_REWARD_DV)} Danh Vọng +${fmtNum(PET_CARE_REWARD_EXP)} Kinh Nghiệm`,
        }, [toolId]);
    };

    try {
        const hasMission = await loadTodayMissionForQuiz();
        if (hasMission && window.QuizManager) {
            const ready = await window.QuizManager.prepareData();
            if (ready) { window.QuizManager.loadLevel(); window.QuizManager.initSkillPools(); }
        }
    } catch (e) { console.warn("⚠️ [Garden] Không chuẩn bị được câu hỏi hôm nay:", e); }

    let settled = false;
    const finish = () => { if (settled) return; settled = true; finalize(); };
    if (window.QuizManager) {
        setTimeout(finish, 90000);
        window.QuizManager.ask(() => finish());
    } else {
        finish();
    }
}

// ── Render + đi lang thang tự do khắp toàn bộ bản đồ (không giới hạn ô) ──
const petSpriteEls = {};
const petTimers = {};

function startPetWander(zone, uid, el) {
    const move = () => {
        if (!zone.contains(el)) return;
        const curX = parseFloat(el.style.left), curY = parseFloat(el.style.top);
        const { nx, ny } = pickPetWanderSpot(curX, curY);
        const img = el.querySelector("img");
        if (img) img.style.transform = nx < curX ? "scaleX(-1)" : "scaleX(1)";
        el.style.transition = "left 7s linear, top 7s linear";
        el.style.left = nx + "%"; el.style.top = ny + "%";
    };
    move();
    petTimers[uid] = setInterval(move, 9000);
}

function openPetInfoModal(pkm, info) {
    const body = document.getElementById("infoModalBody");
    body.innerHTML = `
        <div class="info-title">${pkm.name} <span class="info-title-vn">(Thú cưng của bạn)</span></div>
        <div class="info-line">${info.weakened ? "⚠️ <b>Status / Trạng thái:</b> Weakened (Suy yếu)" : "💚 <b>Status / Trạng thái:</b> Healthy (Khoẻ mạnh)"}</div>
        <div class="info-line">🧴 <b>Care / Chăm sóc:</b> any tool except Sickle 🔪 / Sack 🛍️ / Basket 🧺 (dùng công cụ bất kỳ, trừ 3 dụng cụ thu hoạch), 1 lần/ngày</div>
        <div class="info-line">💰 <b>Reward / Phần thưởng:</b> +${fmtNum(PET_CARE_REWARD_DV)} DV + ${fmtNum(PET_CARE_REWARD_EXP)} EXP mỗi lần chăm</div>
        <div class="info-line">🛡️ Không chăm sẽ KHÔNG chết, chỉ bị Suy yếu.</div>`;
    document.getElementById("infoModal").style.display = "flex";
}

function handlePetTap(pkm, info) {
    announce(pkm.name);
    if (!selectedTool) return openPetInfoModal(pkm, info);
    const tool = CFG.TOOLS[selectedTool];
    if (tool.role === "harvest") {
        return showToast(`${tool.name} can't be used on your Pokémon.`, `${tool.nameVN} không dùng cho thú cưng được.`);
    }
    const spriteEl = petSpriteEls[pkm.uid];
    careForPet(pkm, selectedTool, (ok, msg, toolIds) => {
        if (ok) { playEffect(spriteEl, toolIds); announce(msg.en); }
        else showToast(msg.en, msg.vn);
        selectedTool = null;
        updateToolbar(); renderPetsZone(); updateTopBar();
    });
}

function renderPetsZone() {
    const zone = document.getElementById("zonePets");
    if (!zone) return;
    const owned = getOwnedPokemons();
    const petState = loadPetState();
    const now = Date.now();
    const ownedUids = new Set(owned.map((p) => p.uid));

    // dọn sprite của con đã bị thả (release) khỏi túi đồ
    Object.keys(petSpriteEls).forEach((uid) => {
        if (!ownedUids.has(uid)) {
            clearInterval(petTimers[uid]); delete petTimers[uid];
            petSpriteEls[uid].remove(); delete petSpriteEls[uid];
        }
    });

    owned.forEach((pkm) => {
        if (!pkm || !pkm.uid) return;
        const info = getPetInfo(pkm.uid, petState, now);
        let el = petSpriteEls[pkm.uid];
        if (!el) {
            el = document.createElement("div");
            el.className = "roam-sprite wander-pets";
            const spawn = pickPetWanderSpot();
            el.style.left = spawn.nx + "%";
            el.style.top = spawn.ny + "%";
            const spriteName = (pkm.name || "").toLowerCase().replace(/\s+/g, "-");
            el.innerHTML = `<img src="${CFG.POKEMON_ANI_URL(spriteName)}" alt="${pkm.name}"><div class="roam-badge"></div><div class="roam-name"></div>`;
            zone.appendChild(el);
            petSpriteEls[pkm.uid] = el;
            startPetWander(zone, pkm.uid, el);
            el.onclick = guard(() => handlePetTap(pkm, getPetInfo(pkm.uid, loadPetState(), Date.now())));
        }
        el.classList.toggle("weak", info.weakened);
        el.querySelector(".roam-badge").textContent = info.weakened ? "⚠️" : "💚";
        el.querySelector(".roam-name").textContent = pkm.name;
    });
}

// ===== Khung thông tin song ngữ (bấm vào 1 ô, không cầm công cụ) =====

// Huỷ bỏ 1 cây / con vật ĐANG SỐNG (seed/growing/stalled/ready) để trồng/nuôi
// cái mới — KHÔNG hoàn lại DV/EXP đã bỏ ra (nhắc rõ trong hộp xác nhận).
function removeEntity(key, idx, tierName) {
    const ok = confirm(`Remove ${tierName}? You will NOT get a refund.\n\nHuỷ bỏ ${tierName}? Sẽ KHÔNG được hoàn lại tiền.`);
    if (!ok) return;
    announce("Removed");
    gameState[key][idx] = null;
    saveState(gameState);
    closeInfoModal();
    renderAll();
}
window.removeEntity = guard(removeEntity);

function openInfoModal(kind, info, entity, key, idx) {
    const body = document.getElementById("infoModalBody");
    const tier = info.tier;
    const groupTools = CARE_GROUPS[kind].map((id) => CFG.TOOLS[id]);
    const harvestTool = CFG.TOOLS[HARVEST_TOOL[kind]];
    const timeText = info.status === "empty" ? "—" : timeLeftLabel(info);
    body.innerHTML = `
        <div class="info-title">${tier.name} <span class="info-title-vn">(${tier.nameVN})</span></div>
        ${info.status !== "seed" && info.status !== "empty" ? `
        <div class="info-row"><span>Health / Sinh mệnh</span><div class="mini-bar hp big"><div style="width:${info.health}%"></div></div></div>
        <div class="info-row"><span>Progress / Tiến độ</span><div class="mini-bar pg big"><div style="width:${info.progressPct}%"></div></div></div>` : ""}
        <div class="info-line">⏳ <b>Time / Thời gian:</b> ${timeText}</div>
        <div class="info-line">💰 <b>Harvest value / Giá trị thu hoạch:</b> ${fmtNum(tier.harvestDV)} DV + ${fmtNum(tier.harvestEXP)} EXP</div>
        <div class="info-line">🧴 <b>Daily care / Chăm sóc hàng ngày:</b> ${groupTools.map((t) => t.emoji + " " + t.name).join(" + ")} (${groupTools.map((t) => t.nameVN).join(" + ")})</div>
        <div class="info-line">🎒 <b>Harvest tool / Dụng cụ thu hoạch:</b> ${harvestTool.emoji} ${harvestTool.name} (${harvestTool.nameVN})</div>
        <button class="info-remove-btn" onclick="removeEntity('${key}', ${idx}, '${tier.name}')">🗑️ Remove (Xoá bỏ)</button>`;
    document.getElementById("infoModal").style.display = "flex";
}
function closeInfoModal() { document.getElementById("infoModal").style.display = "none"; }
window.closeInfoModal = guard(closeInfoModal);
// ===== Kho (Warehouse) — xem + bán trực tiếp nguyên liệu thô & sản phẩm =====
function renderWarehouseModal() {
    if (!window.WarehouseAPI || !window.WarehouseCatalog) return;
    const wh = window.WarehouseAPI.load();
    const cat = window.WarehouseCatalog;

    const rawList = document.getElementById("warehouseRawList");
    rawList.innerHTML = "";
    let anyRaw = false;
    Object.values(cat.RAW_MATERIALS).forEach((m) => {
        const qty = wh.raw[m.id] || 0;
        if (qty <= 0) return;
        anyRaw = true;
        const item = document.createElement("div");
        item.className = "shop-item";
        item.innerHTML = `
            <div class="shop-item-emoji">${m.emoji}</div>
            <div class="shop-item-info">
                <div class="shop-item-name">${m.name} <span class="shop-item-vn">(${m.nameVN})</span></div>
                <div class="shop-item-sub">Have: ${fmtNum(qty)} · ${fmtNum(m.sellDV)} DV each</div>
            </div>
            <button class="shop-buy-btn">Sell 1</button>`;
        item.querySelector(".shop-buy-btn").onclick = guard(() => {
            if (!window.WarehouseAPI.removeRaw(m.id, 1)) return showToast("Not enough to sell.", "Không đủ để bán.");
            addCurrency(m.sellDV, 0);
            announce("Sold");
            showToast(`Sold 1 ${m.name} for ${fmtNum(m.sellDV)} DV.`, `Đã bán 1 ${m.nameVN}.`);
            renderWarehouseModal(); updateTopBar();
        });
        rawList.appendChild(item);
    });
    document.getElementById("warehouseRawEmpty").style.display = anyRaw ? "none" : "block";

    const procList = document.getElementById("warehouseProcessedList");
    procList.innerHTML = "";
    let anyProc = false;
    Object.values(cat.RECIPES).flat().forEach((r) => {
        const qty = wh.processed[r.id] || 0;
        if (qty <= 0) return;
        anyProc = true;
        const item = document.createElement("div");
        item.className = "shop-item";
        item.innerHTML = `
            <div class="shop-item-emoji">${r.emoji}</div>
            <div class="shop-item-info">
                <div class="shop-item-name">${r.name} <span class="shop-item-vn">(${r.nameVN})</span></div>
                <div class="shop-item-sub">Have: ${fmtNum(qty)} · ${fmtNum(r.sellDV)} DV + ${fmtNum(r.sellEXP)} EXP each</div>
            </div>
            <button class="shop-buy-btn">Sell 1</button>`;
        item.querySelector(".shop-buy-btn").onclick = guard(() => {
            if (!window.WarehouseAPI.removeProcessed(r.id, 1)) return showToast("Not enough to sell.", "Không đủ để bán.");
            addCurrency(r.sellDV, r.sellEXP);
            announce("Sold");
            showToast(`Sold 1 ${r.name} for ${fmtNum(r.sellDV)} DV + ${fmtNum(r.sellEXP)} EXP.`, `Đã bán 1 ${r.nameVN}.`);
            renderWarehouseModal(); updateTopBar();
        });
        procList.appendChild(item);
    });
    document.getElementById("warehouseProcessedEmpty").style.display = anyProc ? "none" : "block";
}
function openWarehouseModal() {
    announce("Warehouse");
    renderWarehouseModal();
    document.getElementById("warehouseModal").style.display = "flex";
}
window.openWarehouseModal = guard(openWarehouseModal);
function closeWarehouseModal() { document.getElementById("warehouseModal").style.display = "none"; }
window.closeWarehouseModal = guard(closeWarehouseModal);

// ===== Shop giống (DV) =====

function openSeedShop(key, idx, kind) {
    announce("Shop");
    const tiers = kind === "plant" ? CFG.PLANT_TIERS : kind === "animal" ? CFG.ANIMAL_TIERS : CFG.FISH_TIERS;
    const modal = document.getElementById("shopSeedsModal");
    const list = document.getElementById("shopSeedsList");
    document.getElementById("shopSeedsTitle").textContent =
        kind === "plant" ? "🌱 Choose a Seed" : kind === "animal" ? "🐣 Choose a Pokémon" : "🐟 Choose a Fish";
    list.innerHTML = "";
    tiers.forEach((tier) => {
        const cost = tier.seedCostDV ?? tier.priceDV;
        const item = document.createElement("div");
        item.className = "shop-item";
        const thumb = kind === "plant"
            ? `<div class="shop-item-emoji">${tier.emoji}</div>`
            : `<img class="shop-item-emoji shop-item-img" src="${CFG.POKEMON_ANI_URL(tier.pokemon)}" alt="${tier.name}">`;
        item.innerHTML = `
            ${thumb}
            <div class="shop-item-info">
                <div class="shop-item-name">${tier.name} <span class="shop-item-vn">(${tier.nameVN})</span></div>
                <div class="shop-item-sub">${tier.days}d · ${fmtNum(tier.harvestDV)} DV + ${fmtNum(tier.harvestEXP)} EXP</div>
            </div>
            <button class="shop-buy-btn">${fmtNum(cost)} DV</button>`;
        item.querySelector(".shop-buy-btn").onclick = guard(() => {
            announce(tier.name);
            const r = buyAndPlant(gameState, key, idx, kind, tier.id);
            if (r.ok) { closeSeedShop(); renderAll(); }
            else showToast(r.en, r.vn);
        });
        list.appendChild(item);
    });
    modal.style.display = "flex";
}
function closeSeedShop() { document.getElementById("shopSeedsModal").style.display = "none"; }
window.closeSeedShop = guard(closeSeedShop);

// ===== Shop công cụ (EXP) =====

function renderToolShopList() {
    const list = document.getElementById("shopToolsList");
    list.innerHTML = "";
    Object.values(CFG.TOOLS).forEach((tool) => {
        const item = document.createElement("div");
        item.className = "shop-item";
        item.innerHTML = `
            <div class="shop-item-emoji">${tool.emoji}</div>
            <div class="shop-item-info">
                <div class="shop-item-name">${tool.name} <span class="shop-item-vn">(${tool.nameVN})</span></div>
                <div class="shop-item-sub">Have: ${fmtNum(gameState.tools[tool.id])} · ${tool.costEXP} EXP each</div>
            </div>
            <div class="qty-buy">
                <button class="qty-btn" data-d="-1">−</button>
                <span class="qty-val">1</span>
                <button class="qty-btn" data-d="1">+</button>
                <button class="shop-buy-btn">Buy</button>
            </div>`;
        const qtyEl = item.querySelector(".qty-val");
        let qty = 1;
        item.querySelectorAll(".qty-btn").forEach((btn) => {
            btn.onclick = guard(() => { qty = Math.max(1, qty + Number(btn.dataset.d)); qtyEl.textContent = qty; playClick(); });
        });
        item.querySelector(".shop-buy-btn").onclick = guard(() => {
            const totalCost = round1(tool.costEXP * qty);
            if (!spendCurrency(0, totalCost)) return showToast(`Not enough EXP (need ${totalCost}).`, `Không đủ ${totalCost} KN.`);
            gameState.tools[tool.id] = round1(gameState.tools[tool.id] + qty);
            saveState(gameState);
            showToast(`Bought ${qty} ${tool.name}!`, `Đã mua ${qty} ${tool.nameVN}!`);
            renderToolShopList(); updateTopBar(); updateToolbar();
        });
        list.appendChild(item);
    });
}
function openToolShop() {
    announce("Tool shop");
    renderToolShopList();
    document.getElementById("shopToolsModal").style.display = "flex";
}
window.openToolShop = guard(openToolShop);
function closeToolShop() { document.getElementById("shopToolsModal").style.display = "none"; }
window.closeToolShop = guard(closeToolShop);

// ===== Toast song ngữ =====

let _toastTimer = null;
function showToast(en, vn) {
    const toast = document.getElementById("gardenToast");
    if (!toast) return;
    document.getElementById("gardenToastEn").textContent = en;
    document.getElementById("gardenToastVn").textContent = vn || "";
    speakEnglish(en);
    toast.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderAll() {
    updateTopBar();
    updateToolbar();
    renderLandField();
    renderBarnPen();
    renderPondPen();
    renderPetsZone();
}

// ===== 8. KHỞI ĐỘNG =====

function initGarden() {
    const total = CFG.UNLOCK_THRESHOLDS.length;
    while (gameState.lands.length < total) gameState.lands.push(null);
    while (gameState.barn.length < total) gameState.barn.push(null);
    while (gameState.pond.length < total) gameState.pond.push(null);
    saveState(gameState);

    if (window.QuizManager) window.QuizManager.prepareData();

    Object.keys(CFG.TOOLS).forEach((toolId) => {
        const btn = document.querySelector(`#toolbar [data-tool="${toolId}"]`);
        if (btn) btn.onclick = guard(() => selectTool(toolId));
    });
    const addAnimalBtn = document.getElementById("addAnimalBtn");
    if (addAnimalBtn) addAnimalBtn.onclick = guard(() => addToPenClicked("barn", "animal", "Add Pokemon"));
    const addFishBtn = document.getElementById("addFishBtn");
    if (addFishBtn) addFishBtn.onclick = guard(() => addToPenClicked("pond", "fish", "Add fish"));

    renderAll();
    setInterval(renderAll, 60 * 1000); // cập nhật thanh tiến độ/sinh mệnh mỗi phút
}

document.addEventListener("DOMContentLoaded", initGarden);