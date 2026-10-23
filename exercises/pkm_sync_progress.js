/**
 * Đồng bộ dữ liệu "cứu game" (EXP, Danh vọng, Pokémon sở hữu, trang bị, chuỗi
 * ngày chơi...) lên Firebase "pokemon-capture-10d03".
 *
 * Logic lưu giống HỆT saveToFirestore() trong pkm_results.html — chỉ tách ra
 * file riêng để pkm.html cũng gọi được lúc bấm Thoát, không còn phải đợi học
 * sinh tự vào pkm_results.html bấm nút mới lưu.
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCCVdzWiiFvcWiHVJN-x33YKarsjyziS8E",
    authDomain: "pokemon-capture-10d03.firebaseapp.com",
    projectId: "pokemon-capture-10d03",
    storageBucket: "pokemon-capture-10d03.firebasestorage.app",
    messagingSenderId: "1068125543917",
    appId: "1:1068125543917:web:57de4365ee56729ea8dbe4"
};
// getApps().find/getApp() — tránh lỗi "app already exists" nếu trang nào đó
// (ví dụ pkm.html) đã tự khởi tạo sẵn cùng 1 Firebase app này ở nơi khác.
const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);
// ✅ PHẢI giống hệt danh sách SAVE_KEYS trong pkm_results.html
const SAVE_KEYS = [
    'pkm_inventory', 'pkm_global_exp', 'pkm_global_dv',
    'pkm_passed_maps', 'pkm_equipped', 'pkm_owned_ids',
    'pkm_streak_days', 'pkm_last_play_date',
    'result_battle', 'pkm_skill_scores', 'pkm_garden_state',
];
window.savePkmProgressToFirebase = async function () {
    const name = localStorage.getItem('trainerName') || 'trainer';
    const cls  = localStorage.getItem('trainerClass') || '0';
    const docId = `${name.toLowerCase().trim()}-${cls}`;
    try {
        const dataToSave = {
            trainerName: name,
            trainerClass: cls,
            savedAt: new Date().toISOString(),
        };
        SAVE_KEYS.forEach(key => {
            const raw = localStorage.getItem(key);
            if (raw) {
                try { dataToSave[key] = JSON.parse(raw); }
                catch { dataToSave[key] = raw; }
            }
        });
        // { merge: true } — chỉ ghi đè đúng các field trong SAVE_KEYS, không
        // xoá field nào khác đang có sẵn trên Firestore (kể cả field do
        // pkm_results.html hoặc file nào khác ghi mà danh sách này chưa biết
        // tới) — tránh lặp lại đúng lỗi "1 nơi lưu, 1 nơi lại xoá mất".
        await setDoc(doc(db, 'pokemonsuper', docId), dataToSave, { merge: true });
        console.log("✅ [SyncProgress] Đã lưu EXP/DV/kho đồ lên Firebase:", docId);
        return true;
    } catch (err) {
        console.error("❌ [SyncProgress] Lỗi lưu tiến trình:", err.message);
        return false;
    }
};