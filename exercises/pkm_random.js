/**
 * ==========================================
 * PKM RANDOM — CHƠI NGẪU NHIÊN TỪ SẢNH CHÍNH
 * ==========================================
 * Dùng khi học sinh bấm nút "Chơi ngẫu nhiên" trên pkm.html:
 *   1. Chọn 1 bài học cho học sinh (ưu tiên bài chưa học, giống "Ôn tự do")
 *   2. Ghi current_mission / selected_lesson_name / wordBank như khi bấm bài trên bản đồ
 *   3. Gieo số ngẫu nhiên và chuyển thẳng sang 1 chế độ chơi:
 *        - 40%  -> Học theo kỹ năng (all-shared.html)
 *        - 60%  -> 1 trong 6 game, mỗi game 10% (Bài tập khác bị loại)
 *
 * File này TỰ ĐỦ, không sửa pkm_map.js.
 * Cần: global-config.js (window.SHEET_URL) đã được load trước.
 * ==========================================
 */

(function () {
  // ===== CẤU HÌNH =====
  const RANDOM_SKILL_RATE = 0.4; // 40% học theo kỹ năng

  // Các game chia đều phần 60% còn lại
  const RANDOM_GAME_PAGES = [
    "pkm_battle.html",
    "pkm_block.html",
    "pkm_tower.html",
    "pkm_race.html",
    "pkm_chess.html",
    "pkm_birdshoot.html",
  ];
  const SKILL_PAGE = "all-shared.html";

  // Firebase (cùng project với pkm_map.js — nơi có collection "lich")
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
    authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
    projectId: "lop-hoc-thay-tinh",
    storageBucket: "lop-hoc-thay-tinh.firebasestorage.app",
    messagingSenderId: "391812475288",
    appId: "1:391812475288:web:ca4c275ac776d69deb23ed",
  };

  const trainerClass = () => localStorage.getItem("trainerClass") || "1";

  // ===== HÀM TIỆN ÍCH (giống pkm_map.js) =====
  let _firebaseRefs = null;
  async function getFirebaseRefs() {
    if (_firebaseRefs) return _firebaseRefs;
    const { initializeApp, getApps } = await import(
      "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js"
    );
    const { getFirestore, doc, getDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js"
    );
    // Dùng app đặt tên riêng: pkm.html đã có app mặc định trỏ tới project khác
    const app = getApps().find(a => a.name === "pkmRandomApp")
      || initializeApp(FIREBASE_CONFIG, "pkmRandomApp");
    _firebaseRefs = { db: getFirestore(app), doc, getDoc };
    return _firebaseRefs;
  }

  function extractCodeFromTitle(title) {
    if (!title || typeof title !== "string") return "";
    const parts = title.trim().split(/[-\s.]+/);
    if (parts.length >= 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
      return parts[0] + parts[1] + parts[2];
    }
    return "";
  }

  function rowsToArr(r) {
    return Array.isArray(r) ? r : Object.values(r);
  }

  async function loadVocabRows() {
    let rows = [];
    const cached = sessionStorage.getItem("allVocabData");
    if (cached) {
      rows = JSON.parse(cached);
    } else {
      const res = await fetch(window.SHEET_URL);
      const json = await res.json();
      rows = json.data || json;
      sessionStorage.setItem("allVocabData", JSON.stringify(rows));
    }
    const colID = window.COLS_URL?.ID !== undefined ? window.COLS_URL.ID : 1;
    const colWord = window.COLS_URL?.WORD !== undefined ? window.COLS_URL.WORD : 2;
    return { rows, colID, colWord };
  }

  // Map: mã bài đầy đủ ("3-04-1 Colors") -> danh sách từ vựng của bài đó
  function buildWordsByLesson(rows, colID, colWord, cls) {
    const map = new Map();
    for (const r of rows) {
      const d = rowsToArr(r);
      const id = d[colID]?.toString().trim();
      if (!id || !id.startsWith(cls + "-")) continue;
      const w = d[colWord];
      if (!map.has(id)) map.set(id, []);
      if (w) map.get(id).push(w);
    }
    return map;
  }

  // Lấy mã bài lớn nhất đã được lên lịch (giống pkm_map.js). Không có lịch -> 0.
  async function getMaxScheduledCode(cls) {
    try {
      const { db, doc, getDoc } = await getFirebaseRefs();
      const snap = await getDoc(doc(db, "lich", cls));
      if (!snap.exists()) return 0;
      let max = 0;
      Object.values(snap.data() || {}).forEach(entry => {
        if (entry && entry.type === "new" && entry.code) {
          const n = parseInt(entry.code, 10);
          if (!isNaN(n) && n > max) max = n;
        }
      });
      return max;
    } catch (e) {
      console.warn("pkm_random: không đọc được lịch:", e);
      return 0;
    }
  }

  // ===== CHỌN BÀI =====
  // Ưu tiên bài CHƯA học và nhỏ hơn bài mới nhất đã lên lịch;
  // nếu không có thì lấy mọi bài chưa học; nếu vẫn không có thì lấy bài bất kỳ.
  async function pickLesson() {
    const cls = trainerClass();
    const { rows, colID, colWord } = await loadVocabRows();
    const wordsByLesson = buildWordsByLesson(rows, colID, colWord, cls);
    const passed = JSON.parse(localStorage.getItem("pkm_passed_maps")) || [];
    const maxCode = await getMaxScheduledCode(cls);

    const allIds = [...wordsByLesson.keys()].filter(id => wordsByLesson.get(id).length > 0);
    const notPassed = allIds.filter(id => !passed.includes(id));

    const preferred = notPassed.filter(id => {
      const n = parseInt(extractCodeFromTitle(id), 10);
      return maxCode && !isNaN(n) && n < maxCode;
    });

    const pool = preferred.length ? preferred
               : notPassed.length ? notPassed
               : allIds;
    if (!pool.length) return null;

    const fullId = pool[Math.floor(Math.random() * pool.length)];
    const namePart = fullId.includes(" ") ? fullId.substring(fullId.indexOf(" ") + 1) : "";
    return {
      fullId,
      lessonName: namePart.trim() || fullId,
      words: wordsByLesson.get(fullId),
    };
  }

  // ===== GIEO CHẾ ĐỘ =====
  // ===== GIEO CHẾ ĐỘ =====
function rollDestination() {
  return "pkm_simple.html";
}

  // ===== HIỂN THỊ TRẠNG THÁI =====
  function setStatus(msg, show = true) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = msg;
    toast.style.display = show ? "block" : "none";
  }

  // ===== HÀM CHÍNH — gọi khi bấm nút "Chơi ngẫu nhiên" =====
  let _busy = false;
  window.pkmRandomPlay = async function () {
    if (_busy) return;
    _busy = true;
    setStatus("🎲 Đang chọn bài học...");

    try {
      const lesson = await pickLesson();

      if (lesson) {
        localStorage.setItem("selected_lesson_name", lesson.lessonName);
        localStorage.setItem("current_mission", JSON.stringify({
          id: lesson.fullId,
          type: "random",
          class: trainerClass(),
        }));
        localStorage.setItem("wordBank", JSON.stringify(lesson.words));
      } else {
        // Không chọn được bài mới -> dùng lại bài cũ nếu còn
        const oldMission = localStorage.getItem("current_mission");
        const oldWords = localStorage.getItem("wordBank");
        if (!oldMission || !oldWords) {
          setStatus("⚠️ Chưa có bài học nào để chơi. Hãy thử vào Bản Đồ.", true);
          setTimeout(() => setStatus("", false), 2500);
          return;
        }
      }

      window.location.href = rollDestination();
    } catch (e) {
      console.error("pkm_random lỗi:", e);
      setStatus("⚠️ Không tải được bài học. Kiểm tra mạng rồi thử lại.", true);
      setTimeout(() => setStatus("", false), 2500);
    } finally {
      _busy = false;
    }
  };

  // Xuất thêm để kiểm thử nếu cần (ví dụ xem thử lần gieo)
  window.pkmRollDestination = rollDestination;

  // Xuất pickLesson() để nơi khác (ví dụ pkm_battle_online.js) tái dùng
  // đúng logic "chọn bài chưa học, nhỏ hơn bài max" mà không cần viết lại.
  window.PkmLessonPicker = { pickLesson };
})();