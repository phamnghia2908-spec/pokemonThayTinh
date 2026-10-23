import {
  initializeApp as initExtraApp,
  getApp as getExtraApp
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";

import {
  getFirestore as getExtraFirestore,
  collection,
  getDocs,
  setDoc,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// ✅ Khởi tạo Firebase Pokémon riêng
const firebaseConfigPokemon = {
  apiKey: "AIzaSyCCVdzWiiFvcWiHVJN-x33YKarsjyziS8E",
  authDomain: "pokemon-capture-10d03.firebaseapp.com",
  projectId: "pokemon-capture-10d03",
  storageBucket: "pokemon-capture-10d03.appspot.com",
  messagingSenderId: "1068125543917",
  appId: "1:1068125543917:web:57de4365ee56729ea8dbe4"
};

let appPokemon;
try {
  appPokemon = initExtraApp(firebaseConfigPokemon, "pokemonApp");
} catch {
  appPokemon = getExtraApp("pokemonApp");
}
const dbPokemon = getExtraFirestore(appPokemon);

// ✅ Hiển thị bảng Pokémon có lọc lớp
function renderPokemonTable(summaryData) {
  const tbody = document.querySelector("#pokemonTable tbody");
  tbody.innerHTML = "";

  const selectedClass = document.getElementById("classFilter").value;

  const entries = Object.entries(summaryData).filter(([_, info]) => {
    return selectedClass === "all" || info.class === selectedClass;
  });

  entries.forEach(([id, info]) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${info.name}</td>
      <td>${info.class}</td>
      <td>${info.pokemons?.length || 0}</td>
      <td>${info.selected ? `#${info.selected}` : "—"}</td>
      <td>${info.stage || "—"}</td>
    `;
    tbody.appendChild(row);
  });
}

// ✅ Tải dữ liệu tổng hợp khi mở trang
async function loadSummaryFromFirebase() {
  try {
    const ref = doc(dbPokemon, "pokemon_summary", "all_students");
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn("⚠️ Chưa có dữ liệu tổng hợp. Đang tạo mới...");
      await refreshPokemonSummary();
      return;
    }

    const data = snap.data();
    console.log("📦 Dữ liệu tổng hợp đã có:", data);
    window.currentSummaryData = data.data;
    renderPokemonTable(data.data);
  } catch (error) {
    console.error("❌ Lỗi khi tải dữ liệu tổng hợp:", error.message);
  }
}

// ✅ Cập nhật dữ liệu tổng hợp từ bosuutap
async function refreshPokemonSummary() {
  console.log("🔄 Đang cập nhật dữ liệu tổng hợp từ bosuutap...");

  try {
    const snapshot = await getDocs(collection(dbPokemon, "bosuutap"));
    const summary = {};
    let added = 0;
    let skipped = 0;

    snapshot.forEach(docSnap => {
      const id = docSnap.id;
      const data = docSnap.data();

      if (!id.includes("-")) {
        console.warn(`⚠️ Document không hợp lệ (không có dấu -): ${id}`);
        skipped++;
        return;
      }

      const [name, className] = id.split("-");
      if (!name || !className) {
        console.warn(`⚠️ Thiếu tên hoặc lớp: ${id}`);
        skipped++;
        return;
      }

      const entry = { name, class: className };

      if (Array.isArray(data.pokemons)) entry.pokemons = data.pokemons;
      if (typeof data.selected === "number") entry.selected = data.selected;
      if (typeof data.stage === "number") entry.stage = data.stage;

      summary[id] = entry;
      added++;
    });

    await setDoc(doc(dbPokemon, "pokemon_summary", "all_students"), {
      updatedAt: Date.now(),
      data: summary
    });

    console.log(`✅ Đã ghi ${added} học sinh vào tổng hợp. Bỏ qua ${skipped} học sinh lỗi.`);
    document.getElementById("syncLog").innerHTML = `
      <p style="color:green;">✅ Đã cập nhật dữ liệu tổng hợp từ bosuutap.</p>
      <p>➕ Ghi mới: <strong>${added}</strong> học sinh</p>
      <p>⚠️ Bỏ qua: <strong>${skipped}</strong> học sinh lỗi</p>
    `;

    window.currentSummaryData = summary;
    renderPokemonTable(summary);
  } catch (error) {
    console.error("❌ Lỗi khi cập nhật dữ liệu:", error.message);
    document.getElementById("syncLog").innerHTML = `<p style="color:red;">❌ Lỗi: ${error.message}</p>`;
  }
}

// ✅ Bổ sung học sinh từ Google Sheet vào bosuutap
async function syncStudentsFromSheetToBosuutap() {
  console.log("📋 Đang đồng bộ học sinh từ Google Sheet vào bosuutap...");

  const SHEET_URL = "https://docs.google.com/spreadsheets/d/1XmiM7fIGqo3eq8QMuhvxj4G3LrGBzsbQHs_gk0KXdTc/gviz/tq?tqx=out:json";

  try {
    const res = await fetch(SHEET_URL);
    const text = await res.text();
    const json = JSON.parse(text.substring(47).slice(0, -2));
    const rows = json.table.rows;

    const sheetStudents = rows.map(r => {
      const name = r.c[0]?.v?.toString().trim().toLowerCase();
      const className = r.c[1]?.v?.toString().trim().toLowerCase();
      if (!name || !className) return null;
      return `${name}-${className}`;
    }).filter(Boolean);

    console.log("📋 Danh sách học sinh từ Sheet:", sheetStudents);

    const snapshot = await getDocs(collection(dbPokemon, "bosuutap"));
    const existingDocs = snapshot.docs.map(docSnap => docSnap.id.toLowerCase());

    let created = 0;

    for (const id of sheetStudents) {
      if (!existingDocs.includes(id)) {
        await setDoc(doc(dbPokemon, "bosuutap", id), {
          name: id.split("-")[0],
          class: id.split("-")[1],
          stars: 0,
          pokemons: [131],       // ✅ Khởi tạo với Lapras
          selected: 131,
          stage: 1,
          lastStarUpdate: null
        });
        console.log(`✅ Đã tạo mới học sinh: ${id}`);
        created++;
      }
    }

    document.getElementById("syncLog").innerHTML = `
      <p style="color:green;">✅ Đã bổ sung học sinh mới từ Google Sheet.</p>
      <p>➕ Số học sinh đã tạo: <strong>${created}</strong></p>
    `;
  } catch (error) {
    console.error("❌ Lỗi khi đồng bộ học sinh:", error.message);
    document.getElementById("syncLog").innerHTML = `<p style="color:red;">❌ Lỗi: ${error.message}</p>`;
  }
}

// ✅ Gắn sự kiện cho nút và bộ lọc lớp
document.getElementById("btnRefreshSummary").addEventListener("click", refreshPokemonSummary);
document.getElementById("btnSyncStudents").addEventListener("click", syncStudentsFromSheetToBosuutap);
document.getElementById("classFilter").addEventListener("change", () => {
  if (window.currentSummaryData) {
    renderPokemonTable(window.currentSummaryData);
  }
});

// ✅ Tự động tải khi mở trang
loadSummaryFromFirebase();
