/**
 * ==========================================
 * POKEMON MAP LOGIC — WORLD SELECT + REGION PATH MAP
 * ==========================================
 * Cấu trúc file:
 *   1. Cấu hình 6 vùng (Kanto..Kalos) + hạ tầng Firebase/Sheet dùng chung
 *   2. DẢI 3 NGÀY (Quest Board) — luôn theo đúng lớp thật của học sinh,
 *      không đổi theo vùng đang xem. Dùng lại đúng cách khớp mã bài của
 *      choice1.js (extractCodeFromTitle) để không lặp lại lỗi lệch bài.
 *   3. SCREEN 1 — Chọn vùng (world select): lưới 6 thẻ vùng.
 *   4. SCREEN 2 — Bản đồ trong vùng: giữ nguyên cách dựng path/node/boss
 *      cũ, chỉ bọc thêm theo từng "chương" (5 bài + boss) có ranh giới.
 *   5. Modal từ vựng dùng chung cho mọi loại click (quest/node/boss).
 * ==========================================
 */

// ===== 1. CẤU HÌNH VÙNG + HẠ TẦNG DÙNG CHUNG =====

const MAP_IMG_BASE = "https://cdn.jsdelivr.net/gh/ninjavanxuantruong/mp3vietnam2@main/";

const REGIONS = [
  { classNum: "1", id: "kanto",  name: "KANTO",  subtitle: "Vùng đất khởi đầu",      accent: "#e3350d", accent2: "#2a75bb", img: "map1.png" },
  { classNum: "2", id: "johto",  name: "JOHTO",  subtitle: "Cổ kính & truyền thống", accent: "#c9a227", accent2: "#8b6914", img: "map2.png" },
  { classNum: "3", id: "hoenn",  name: "HOENN",  subtitle: "Biển đảo nhiệt đới",     accent: "#00a99d", accent2: "#ff7f50", img: "map3.png" },
  { classNum: "4", id: "sinnoh", name: "SINNOH", subtitle: "Núi tuyết phương bắc",   accent: "#4a90d9", accent2: "#e8f4f8", img: "map4.png" },
  { classNum: "5", id: "unova",  name: "UNOVA",  subtitle: "Đô thị hiện đại",        accent: "#00d9ff", accent2: "#1a1a2e", img: "map5.png" },
  { classNum: "6", id: "kalos",  name: "KALOS",  subtitle: "Thanh lịch & nghệ thuật",accent: "#ff6b9d", accent2: "#4a90e2", img: "map6.png" },
];

const trainerName = localStorage.getItem("trainerName") || "Trainer";
// Lớp THẬT của học sinh — dùng riêng cho dải 3 ngày, KHÔNG đổi theo vùng đang xem
const realTrainerClass = localStorage.getItem("trainerClass") || "1";

let _firebaseRefs = null;
async function getFirebaseRefs() {
  if (_firebaseRefs) return _firebaseRefs;
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js");
  const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
  const firebaseConfig = {
    apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
    authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
    projectId: "lop-hoc-thay-tinh",
    storageBucket: "lop-hoc-thay-tinh.firebasestorage.app",
    messagingSenderId: "391812475288",
    appId: "1:391812475288:web:ca4c275ac776d69deb23ed"
  };
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  _firebaseRefs = { db, doc, getDoc };
  return _firebaseRefs;
}

// Mã bài kiểu "3-04-1 Colors" -> "3041" — LẤY NGUYÊN của choice1.js, không
// tự chế cách khớp khác (đây chính là nguồn gây lệch bài ở bản trước).
function extractCodeFromTitle(title) {
  if (!title || typeof title !== "string") return "";
  const parts = title.trim().split(/[-\s.]+/);
  if (parts.length >= 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
    return parts[0] + parts[1] + parts[2];
  }
  return "";
}

function normalizeId(idStr) {
  if (!idStr || typeof idStr !== "string") return 0;
  const parts = idStr.split("-");
  if (parts.length < 2) return 0;
  const cls = parseInt(parts[0], 10) || 0;
  const lesson = parseInt(parts[1], 10) || 0;
  const part = parseInt(parts[2], 10) || 0;
  return (cls * 1000) + (lesson * 10) + part;
}

// Tải + cache dữ liệu sheet từ vựng — dùng chung cho quest board lẫn bản đồ vùng
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
  const colID = (window.COLS_URL?.ID !== undefined) ? window.COLS_URL.ID : 1;
  const colWord = (window.COLS_URL?.WORD !== undefined) ? window.COLS_URL.WORD : 2;
  _vocabCache = { rows, colID, colWord };
  return _vocabCache;
}

function rowsToArr(r) { return Array.isArray(r) ? r : Object.values(r); }

// ===== 2. DẢI 3 NGÀY (QUEST BOARD) =====

const QUEST_TYPE_META = {
  new:     { label: "Bài mới",   color: "#ff4757" },
  review:  { label: "Ôn tập",    color: "#4a90d9" },
  related: { label: "Liên quan", color: "#9b59b6" },
  old:     { label: "Bài cũ",    color: "#7f8c8d" },
};

function isoDateWithOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

function formatDateVN(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Tìm bài trong sheet từ vựng khớp với 1 mã code (đã chuẩn hóa) — trả về
// tên bài đầy đủ (để hiện & để dùng làm current_mission.id) + danh sách từ vựng
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
// Tính "mã bài lớn nhất" theo ĐÚNG cách schedule.js đang định nghĩa: lớn nhất
// trong các bài loại "new" đã từng được lên lịch cho lớp này — không dùng
// nguồn khác để tránh lệch với các nơi khác trong hệ thống.
function getMaxNewLessonCode(lichData) {
  let max = 0;
  Object.values(lichData || {}).forEach(entry => {
    if (entry && entry.type === "new" && entry.code) {
      const n = parseInt(entry.code, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return max;
}

// Đề xuất CÁ NHÂN HOÁ cho 1 ngày trống: chọn ngẫu nhiên 1 bài học sinh này
// CHƯA hoàn thành (không có trong pkm_passed_maps) và nhỏ hơn mã bài mới nhất
// — mỗi học sinh nhận bài khác nhau tuỳ lực học, không random chung cả lớp
// như cách cũ (đã bỏ khỏi schedule.js).
function pickPersonalizedFillLesson(rows, colID, colWord, lichData, passedMaps) {
  const maxCode = getMaxNewLessonCode(lichData);
  if (!maxCode) return null;

  const uniqueIds = [...new Set(
    rows.map(r => rowsToArr(r)[colID]?.toString().trim())
        .filter(id => id && id.startsWith(realTrainerClass + "-"))
  )];

  const candidates = uniqueIds.filter(id => {
    const code = extractCodeFromTitle(id);
    const n = parseInt(code, 10);
    return code && !isNaN(n) && n < maxCode && !passedMaps.includes(id);
  });

  const pool = candidates.length > 0 ? candidates : uniqueIds.filter(id => !passedMaps.includes(id));
  if (pool.length === 0) return null;

  const pickedId = pool[Math.floor(Math.random() * pool.length)];
  const namePart = pickedId.includes(" ") ? pickedId.substring(pickedId.indexOf(" ") + 1) : "";
  const words = rows.filter(r => rowsToArr(r)[colID]?.toString().trim() === pickedId)
                     .map(r => rowsToArr(r)[colWord]).filter(Boolean);
  return { fullId: pickedId, lessonName: namePart.trim() || pickedId, words };
}
async function loadQuestBoard() {
  const questRow = document.getElementById("questRow");
  if (!questRow) return;

  const { rows, colID, colWord } = await ensureVocabRows();

  const slots = [
    { offset: -1, label: "Hôm qua" },
    { offset: 0,  label: "Hôm nay" },
    { offset: 1,  label: "Ngày mai" },
  ];

  let lichData = {};
  try {
    const { db, doc, getDoc } = await getFirebaseRefs();
    const snap = await getDoc(doc(db, "lich", realTrainerClass));
    if (snap.exists()) lichData = snap.data();
  } catch (e) {
    console.warn("⚠️ Không tải được lịch học cho dải 3 ngày:", e);
  }

  const passedMaps = JSON.parse(localStorage.getItem("pkm_passed_maps")) || [];

  questRow.innerHTML = "";
  slots.forEach(slot => {
    const iso = isoDateWithOffset(slot.offset);
    const entry = lichData[iso];
    const card = document.createElement("div");
    card.className = "quest-card" + (slot.offset === 0 ? " quest-today" : "");

    // mới
    if (!entry || !entry.code) {
      const fillPreview = pickPersonalizedFillLesson(rows, colID, colWord, lichData, passedMaps);

      if (!fillPreview) {
        card.classList.add("quest-empty");
        card.innerHTML = `
          <div class="quest-daylabel">${slot.label} · ${formatDateVN(iso)}</div>
          <div class="quest-emptytext">Chưa có lịch</div>`;
        questRow.appendChild(card);
        return;
      }

      card.innerHTML = `
        <div class="quest-ribbon" style="background:#7f8c8d;">Ôn tự do</div>
        <div class="quest-daylabel">${slot.label} · ${formatDateVN(iso)}</div>
        <div class="quest-title">${fillPreview.lessonName}</div>
        <div class="quest-words">${fillPreview.words.length} từ${fillPreview.words.length ? ": " + fillPreview.words.slice(0, 3).join(", ") + (fillPreview.words.length > 3 ? "..." : "") : ""}</div>
      `;
      card.onclick = () => {
        localStorage.setItem("selected_lesson_name", fillPreview.lessonName);
        localStorage.setItem("current_mission", JSON.stringify({
          id: fillPreview.fullId, type: "quest_fill", class: realTrainerClass
        }));
        window.handleNodeClick(fillPreview.lessonName, fillPreview.words, "pkm_mode_select.html");
      };
      questRow.appendChild(card);
      return;
    }

    const preview = buildLessonPreviewByCode(rows, colID, colWord, entry.code);
    const typeMeta = QUEST_TYPE_META[entry.type] || { label: entry.type || "", color: "#888" };
    const isDone = preview && passedMaps.includes(preview.fullId);
    const wordSample = preview ? preview.words.slice(0, 3).join(", ") : "";

    card.innerHTML = `
      <div class="quest-ribbon" style="background:${typeMeta.color};">${typeMeta.label}</div>
      <div class="quest-daylabel">${slot.label} · ${formatDateVN(iso)}</div>
      <div class="quest-title">${preview ? preview.lessonName : "(Không rõ bài)"}</div>
      ${preview ? `<div class="quest-words">${preview.words.length} từ${wordSample ? ": " + wordSample + (preview.words.length > 3 ? "..." : "") : ""}</div>` : ""}
      ${isDone ? `<div class="quest-done">✓ Đã học</div>` : ""}
    `;

    if (preview) {
      card.onclick = () => {
        localStorage.setItem("selected_lesson_name", preview.lessonName);
        localStorage.setItem("current_mission", JSON.stringify({
          id: preview.fullId, type: "quest", class: realTrainerClass
        }));
        window.handleNodeClick(preview.lessonName, preview.words, "pkm_mode_select.html");
      };
    } else {
      card.classList.add("quest-empty");
    }

    questRow.appendChild(card);
  });
}

// ===== 3. SCREEN 1 — CHỌN VÙNG =====

function renderRegionGrid() {
  const grid = document.getElementById("regionGrid");
  if (!grid) return;
  grid.innerHTML = "";
  REGIONS.forEach(region => {
    const card = document.createElement("div");
    card.className = "region-card";
    card.style.setProperty("--rc-accent", region.accent);
    card.style.setProperty("--rc-accent2", region.accent2);
    card.style.backgroundImage = `linear-gradient(180deg, rgba(5,7,13,0.15) 0%, rgba(5,7,13,0.75) 100%), url('${MAP_IMG_BASE}${region.img}')`;
    card.innerHTML = `
      <div class="region-classtag">LỚP ${region.classNum}</div>
      <div class="region-name">${region.name}</div>
      <div class="region-subtitle">${region.subtitle}</div>
    `;
    card.onclick = () => enterRegion(region);
    grid.appendChild(card);
  });
}

function showScreen(name) {
  document.getElementById("screenRegionSelect").classList.toggle("active", name === "select");
  document.getElementById("screenRegionMap").classList.toggle("active", name === "map");
}

// ===== 4. SCREEN 2 — BẢN ĐỒ TRONG VÙNG =====

let currentRegion = null;

function enterRegion(region) {
  currentRegion = region;
  showScreen("map");
  document.getElementById("regionMapTitle").textContent = `${region.name} · Lớp ${region.classNum}`;
  document.documentElement.style.setProperty("--region-accent", region.accent);
  document.documentElement.style.setProperty("--region-accent2", region.accent2);
  loadRegionMap(region);
}

function backToRegionSelect() {
  showScreen("select");
  currentRegion = null;
}

// Gom danh sách bài+boss (đã theo thứ tự hiển thị, bài 1 trước) thành từng
// CHƯƠNG: mỗi chương gồm tối đa 5 bài + 1 boss ở cuối. Chương cuối có thể
// chưa đủ 5 bài (chưa tới boss) — vẫn hiển thị bình thường, không lỗi.
function groupIntoChapters(pathData) {
  const chapters = [];
  let current = { items: [], hasBoss: false };
  pathData.forEach(node => {
    current.items.push(node);
    if (node.type === "boss") {
      current.hasBoss = true;
      chapters.push(current);
      current = { items: [], hasBoss: false };
    }
  });
  if (current.items.length > 0) chapters.push(current);
  return chapters;
}
// Cắt ảnh nguồn (lưới 3 cột x 2 hàng: Mảnh1..6 theo đúng bảng bố trí) thành
// 6 dải, XẾP LẠI THÀNH 1 CỘT DỌC LIÊN TỤC bên trong #map-canvas — vì đây
// là phần tử absolute NẰM TRONG khu vực cuộn (không phải fixed), nó tự
// động "chạy" theo đúng 1:1 khi vuốt danh sách bài học, không cần JS lắng
// nghe scroll. Thứ tự ghép: Mảnh1→2 (cột trái), Mảnh3→4 (cột giữa),
// Mảnh5→6 (cột phải) — nếu bố trí ảnh gốc của bạn khác, chỉ cần đổi lại
// thứ tự mảng piecePositions bên dưới.
// Cache kích thước thật (naturalWidth/naturalHeight) của từng ảnh vùng —
// chỉ đo 1 lần mỗi ảnh, các lần vào lại vùng đó sau này dùng lại luôn.
const _bgImageDimsCache = {};
function getImageDims(url) {
  if (_bgImageDimsCache[url]) return Promise.resolve(_bgImageDimsCache[url]);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const dims = { w: img.naturalWidth, h: img.naturalHeight };
      _bgImageDimsCache[url] = dims;
      resolve(dims);
    };
    img.onerror = () => resolve({ w: 1536, h: 1024 }); // fallback nếu tải lỗi
    img.src = url;
  });
}

// Phủ nền bằng lưới 3 cột x 2 hàng (6 mảnh, đúng thứ tự Mảnh1..6 theo bảng:
// cột trái = Mảnh1(trên)/Mảnh2(dưới), cột giữa = Mảnh3/Mảnh4, cột phải =
// Mảnh5/Mảnh6). MỖI MẢNH được gán chiều cao PIXEL THẬT tính theo đúng tỉ lệ
// khung hình gốc so với chiều rộng màn hình — KHÔNG BAO GIỜ bị kéo dãn méo,
// bất kể lớp có ít hay nhiều bài. Nếu danh sách bài dài hơn 1 vòng 6 mảnh,
// tự động LẶP LẠI vòng 1→6 thêm nhiều lần cho tới khi phủ hết chiều cao.
async function renderSixPieceBackground(mapCanvas, region) {
  const cols = 3, rows = 2; // lưới nguồn: 3 cột x 2 hàng = 6 mảnh
  const imgUrl = `${MAP_IMG_BASE}${region.img}`;
  const dims = await getImageDims(imgUrl);

  const containerW = mapCanvas.clientWidth || mapCanvas.offsetWidth || 1;
  const pieceHeightPx = containerW * (dims.h / rows) / (dims.w / cols);
  const contentHeight = mapCanvas.scrollHeight || containerW;
  const totalPieces = Math.max(cols * rows, Math.ceil(contentHeight / pieceHeightPx));

  const wrap = document.createElement("div");
  wrap.id = "regionBgLayer";

  const piecePositions = ["0% 0%", "0% 100%", "50% 0%", "50% 100%", "100% 0%", "100% 100%"];
  // Bài 1 nằm DƯỚI CÙNG trang (xem comment "bài 1 hiển thị trước (dưới cùng
  // khi cuộn)" ở loadRegionMap) — nên Mảnh 1 phải neo vào ĐÁY canvas, các
  // mảnh sau nối dần LÊN TRÊN (không phải từ đỉnh đi xuống như trước).
  let cursorBottom = contentHeight;
  for (let i = 0; i < totalPieces; i++) {
    const pieceNum = i % piecePositions.length;
    const pos = piecePositions[pieceNum];
    const bandTop = cursorBottom - pieceHeightPx;
    const band = document.createElement("div");
    band.className = "region-bg-band";
    band.style.top = `${bandTop}px`;
    band.style.height = `${pieceHeightPx}px`;
    band.style.backgroundImage = `url('${imgUrl}')`;
    band.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
    band.style.backgroundPosition = pos;
    wrap.appendChild(band);
    cursorBottom -= pieceHeightPx;
  }

  mapCanvas.appendChild(wrap);
}
async function loadRegionMap(region) {
  const mapCanvas = document.getElementById("map-canvas");
  const scrollWrapper = document.getElementById("region-scroll-wrapper");
  if (!mapCanvas) return;
  mapCanvas.innerHTML = `<div style="text-align:center;padding:60px 0;color:#ccd6f0;">Đang tải bản đồ ${region.name}...</div>`;

  try {
    const { rows, colID, colWord } = await ensureVocabRows();
    const selectedClass = region.classNum;

    let uniqueIds = [...new Set(
      rows.map(r => rowsToArr(r)[colID]?.toString().trim()).filter(id => id && id.startsWith(selectedClass + "-"))
    )].sort((a, b) => normalizeId(a) - normalizeId(b));

    if (uniqueIds.length === 0) {
      mapCanvas.innerHTML = `<div style="text-align:center;padding:60px 0;color:#ccd6f0;">📭 Chưa có bài học nào cho ${region.name}.</div>`;
      return;
    }

    let finalPath = [];
    uniqueIds.forEach((id, index) => {
      finalPath.push({ id, type: "island", class: selectedClass });
      const parts = id.split(" ")[0].split("-");
      const currentLessonGroup = parseInt(parts[1], 10);
      const nextId = uniqueIds[index + 1];
      const isLastOfGroup = !nextId || nextId.split("-")[1] !== parts[1];
      if (currentLessonGroup % 5 === 0 && isLastOfGroup) {
        finalPath.push({ id: `BOSS-${selectedClass}-${currentLessonGroup}`, type: "boss", class: selectedClass, range: `${currentLessonGroup - 4}-${currentLessonGroup}` });
      }
    });

    const pathData = [...finalPath].reverse(); // bài 1 hiển thị trước (dưới cùng khi cuộn)
    const chapters = groupIntoChapters(pathData);

    mapCanvas.innerHTML = "";
    let globalIndex = 0;
    let lessonCounter = 0;

    chapters.forEach((chapter, chapterIdx) => {
      const chapterBlock = document.createElement("div");
      chapterBlock.className = "chapter-block";

      const lessonCountInChapter = chapter.items.filter(n => n.type === "island").length;
      const startNum = lessonCounter + 1;
      const endNum = lessonCounter + lessonCountInChapter;
      lessonCounter = endNum;

      const header = document.createElement("div");
      header.className = "chapter-header";
      header.innerHTML = `
        <span class="chapter-num">Chương ${chapterIdx + 1}</span>
        <span class="chapter-range">${lessonCountInChapter > 0 ? `Bài ${startNum}–${endNum}` : ""}${chapter.hasBoss ? " · 👑 Boss" : ""}</span>`;
      chapterBlock.appendChild(header);

      const rowsWrap = document.createElement("div");
      rowsWrap.className = "chapter-rows";

      let idx = 0;
      while (idx < chapter.items.length) {
        const node = chapter.items[idx];
        // Boss luôn đứng riêng 1 hàng, to hơn
        const nodesInRow = node.type === "boss" ? 1 : Math.min(Math.floor(Math.random() * 3) + 1, chapter.items.length - idx);

        const rowEl = document.createElement("div");
        rowEl.className = "map-row";

        for (let j = 0; j < nodesInRow && idx < chapter.items.length; j++) {
          const n = chapter.items[idx];
          const el = document.createElement("div");
          el.className = n.type === "boss" ? "node boss" : "node";
          el.id = "pkm-node-" + globalIndex;

          const offsetH = Math.floor(Math.random() * 41) - 20;
          el.style.margin = `0 ${offsetH}px`;

          const connector = document.createElement("div");
          connector.className = "connector";
          const hue = Math.floor(Math.random() * 360);
          connector.style.backgroundColor = `hsla(${hue}, 70%, 50%, 0.5)`;
          el.appendChild(connector);

          const fullId = n.id;
          const namePart = fullId.includes(" ") ? fullId.substring(fullId.indexOf(" ") + 1) : "";
          renderNodeContent(el, n, fullId, namePart);
          attachNodeClick(el, n, namePart, rows, colID, colWord, uniqueIds, selectedClass);

          rowEl.appendChild(el);
          idx++; globalIndex++;
        }
        rowsWrap.appendChild(rowEl);
      }

      chapterBlock.appendChild(rowsWrap);
      mapCanvas.appendChild(chapterBlock);

      // Cổng ngăn cách giữa các chương (trừ chương cuối cùng)
      if (chapterIdx < chapters.length - 1) {
        const gate = document.createElement("div");
        gate.className = "chapter-gate";
        gate.innerHTML = `<div class="gate-line"></div><div class="gate-icon">⛩️</div><div class="gate-line"></div>`;
        mapCanvas.appendChild(gate);
      }
    });

    renderSixPieceBackground(mapCanvas, region); // gọi SAU khi mọi bài/chương đã render, để đo đúng chiều cao thật
    setTimeout(() => drawLines(), 200);
    if (scrollWrapper) setTimeout(() => { scrollWrapper.scrollTop = scrollWrapper.scrollHeight; }, 150);
  } catch (e) {
    console.error("❌ Lỗi Map:", e);
    mapCanvas.innerHTML = `<div style="text-align:center;padding:60px 0;color:#ff8b96;">❌ Lỗi khi tải bản đồ.</div>`;
  }
}

function attachNodeClick(el, node, namePart, rows, colID, colWord, uniqueIds, selectedClass) {
  el.onmousedown = () => {
    if (node.type === "boss") {
      const { wordList, bossItems } = buildBossVocab(rows, colID, colWord, uniqueIds, selectedClass, node.range);
      const bossName = `👑 TRÙM CUỐI (Ôn tập bài ${node.range})`;
      localStorage.setItem("selected_lesson_name", bossName);
      localStorage.setItem("current_mission", JSON.stringify({ ...node, isBoss: true, bossItems }));
      window.handleNodeClick(bossName, wordList, "pkm_mode_select.html");
      return;
    }
    const fullId = node.id;
    const lessonName = namePart.trim() || fullId.trim();
    const vList = rows.filter(r => rowsToArr(r)[colID]?.toString().trim() === fullId.trim())
      .map(r => rowsToArr(r)[colWord]);
    localStorage.setItem("selected_lesson_name", lessonName);
    localStorage.setItem("current_mission", JSON.stringify(node));
    window.handleNodeClick(lessonName, vList, "pkm_mode_select.html");
  };
}

function buildBossVocab(rows, colID, colWord, uniqueIds, selectedClass, range) {
  const [startLesson, endLesson] = range.split("-").map(n => parseInt(n, 10));
  const wordList = [];
  const bossItems = [];
  const lessonTitles = [];

  for (let lessonNum = startLesson; lessonNum <= endLesson; lessonNum++) {
    const idsOfLesson = uniqueIds.filter(id => {
      const parts = id.split(" ")[0].split("-");
      return parts[0] === selectedClass && parseInt(parts[1], 10) === lessonNum;
    });
    if (idsOfLesson.length === 0) continue;

    let wordsOfLesson = [];
    idsOfLesson.forEach(fullId => {
      rows.forEach(r => {
        const d = rowsToArr(r);
        if (d[colID]?.toString().trim() === fullId.trim()) {
          const w = d[colWord];
          if (w) wordsOfLesson.push({ lessonId: fullId, word: w });
        }
      });
    });
    if (wordsOfLesson.length === 0) continue;

    const picked = wordsOfLesson[Math.floor(Math.random() * wordsOfLesson.length)];
    wordList.push(picked.word);
    bossItems.push(picked);

    const sampleId = idsOfLesson[0];
    const namePart = sampleId.includes(" ") ? sampleId.substring(sampleId.indexOf(" ") + 1) : sampleId;
    lessonTitles.push(namePart.trim() || sampleId);
  }
  return { wordList, bossItems, lessonTitles };
}

function drawLines() {
  const nodes = document.querySelectorAll(".node");
  nodes.forEach((node, i) => {
    const connector = node.querySelector(".connector");
    const nextNode = document.getElementById("pkm-node-" + (i + 1));
    // Không nối dây nếu node kế tiếp thuộc chương khác (đã có cổng ngăn cách riêng)
    const crossesChapter = nextNode && node.closest(".chapter-block") !== nextNode.closest(".chapter-block");

    if (connector && nextNode && !crossesChapter) {
      const r1 = node.getBoundingClientRect();
      const r2 = nextNode.getBoundingClientRect();
      const x1 = r1.left + r1.width / 2, y1 = r1.top + r1.height / 2;
      const x2 = r2.left + r2.width / 2, y2 = r2.top + r2.height / 2;
      const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      connector.style.width = length + "px";
      connector.style.transform = `rotate(${angle}deg)`;
      connector.style.display = "block";
      connector.style.position = "absolute";
      connector.style.zIndex = "-1";
    } else if (connector) {
      connector.style.display = "none";
    }
  });
}
window.addEventListener("resize", () => { if (currentRegion) drawLines(); });

function renderNodeContent(el, node, fullId, namePart) {
  const subParts = fullId.split(" ")[0].split("-");
  const clsNum = parseInt(node.class) || 0;
  const lessonNum = parseInt(subParts[1], 10) || 0;
  const lessonPart = parseInt(subParts[2], 10) || 0;
  let pokeID = (clsNum * 100) + (lessonNum * 10) + lessonPart;

  const passedMaps = JSON.parse(localStorage.getItem("pkm_passed_maps")) || [];
  const isPassed = passedMaps.includes(fullId);
  const lockHTML = !isPassed ? '<div class="lock-badge">🔒</div>' : '<div class="done-badge">✓</div>';

  if (node.type === "boss") {
    el.innerHTML = `
      <div class="poke-circle boss-circle">
        <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/149.png">
        ${lockHTML}
      </div>
      <div class="node-info">
        <div class="node-name">TRÙM CUỐI</div>
        <div class="node-class-label">Bài ${node.range}</div>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="poke-circle">
        <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokeID}.png">
        <div class="lesson-badge">${lessonNum}-${lessonPart}</div>
        ${lockHTML}
      </div>
      <div class="node-info">
        <div class="node-name">${namePart}</div>
        <div class="node-class-label">Lớp ${node.class}</div>
      </div>`;
  }
}

// ===== 5. MODAL TỪ VỰNG DÙNG CHUNG =====

window.handleNodeClick = function (title, vocabs, targetUrl) {
  const modal = document.getElementById("vocabModal");
  const titleEl = document.getElementById("modalTitle");
  const listContainer = document.getElementById("vocabList");
  const startBtn = document.getElementById("startLessonBtn");
  if (!modal || !listContainer) return;

  titleEl.innerText = title;
  listContainer.innerHTML = "";
  if (vocabs.length > 0) {
    vocabs.forEach(word => {
      const item = document.createElement("div");
      item.className = "vocab-item";
      item.innerHTML = `<span>${word}</span> <span style="color:#3c5aa6">★</span>`;
      listContainer.appendChild(item);
    });
  } else {
    listContainer.innerHTML = "<div style='text-align:center; color:#999;'>Không có từ vựng cho bài này.</div>";
  }

  startBtn.onclick = () => {
    localStorage.setItem("wordBank", JSON.stringify(vocabs));
    window.location.href = targetUrl;
  };
  modal.style.display = "flex";
};

window.closeModal = function () {
  document.getElementById("vocabModal").style.display = "none";
};

// ===== KHỞI ĐỘNG =====

async function initWorldMap() {
  document.getElementById("trainerNameTag").textContent = trainerName.toUpperCase();
  renderRegionGrid();
  loadQuestBoard();
  showScreen("select");
}

initWorldMap();