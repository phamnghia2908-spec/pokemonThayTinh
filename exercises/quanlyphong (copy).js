// ================== Cấu hình nguồn dữ liệu & Firestore ==================
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";

const firebaseConfig = {
  apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
  authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
  projectId: "lop-hoc-thay-tinh",
  storageBucket: "lop-hoc-thay-tinh.firebasestorage.app",
  messagingSenderId: "391812475288",
  appId: "1:391812475288:web:ca4c275ac776d69deb23ed"
};

const COLLECTION = "rooms_hotspots";

// ================== Firebase init ==================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================== DOM refs ==================
const roomSelect = document.getElementById("roomSelect");
const loadRoomsBtn = document.getElementById("loadRoomsBtn");
const loadRoomDataBtn = document.getElementById("loadRoomDataBtn");
const createHotspotBtn = document.getElementById("createHotspotBtn");
const saveBtn = document.getElementById("saveBtn");

const wrapper = document.getElementById("canvasWrapper");
const bgImage = document.getElementById("bgImage");
const layer = document.getElementById("layer");

// ================== State ==================
const state = {
  currentRoom: null,
  hotspots: [], // [{ id, label, x, y, linkedRoom }]
  allRooms: []  // Danh sách tất cả phòng từ Google Sheet
};

// ================== Helpers ==================
function driveViewToDirect(url) {
  const driveMatch = url.match(/\/d\/([^/]+)\//);
  if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  const githubMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)/);
  if (githubMatch) {
    return `https://raw.githubusercontent.com/${githubMatch[1]}/${githubMatch[2]}/${githubMatch[3]}`;
  }
  return url;
}

async function fetchGvizRows() {
  const res = await fetch(SHEET_URL);
  const text = await res.text();
  const json = JSON.parse(text.substring(47).slice(0, -2));
  return json.table.rows;
}

function extractRoomsFromRows(rows) {
  const idxAK = 36, idxAL = 37;
  const rooms = [];
  for (const row of rows) {
    const name = row.c[idxAK]?.v?.trim() || "";
    const imageUrl = row.c[idxAL]?.v?.trim() || "";
    if (name && imageUrl) rooms.push({ name, imageUrl });
  }
  const seen = new Set();
  const uniqueRooms = rooms.filter(r => {
    const ok = !seen.has(r.name);
    if (ok) seen.add(r.name);
    return ok;
  });

  // Lưu danh sách phòng vào state
  state.allRooms = uniqueRooms;
  return uniqueRooms;
}

function makeId(prefix = "hs") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Tạo dropdown chọn phòng liên kết
function createLinkedRoomMenu(currentHotspot) {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";

  // Nút bấm hiển thị phòng đã chọn hoặc mặc định
  const btn = document.createElement("button");
  btn.textContent = currentHotspot.linkedRoom || "Chọn phòng liên kết";
  btn.style.fontSize = "12px";
  btn.style.padding = "4px 8px";
  btn.style.cursor = "pointer";

  // Menu popup
  const menu = document.createElement("div");
  menu.style.position = "absolute";
  menu.style.top = "100%";
  menu.style.left = "0";
  menu.style.background = "#fff";
  menu.style.border = "1px solid #ccc";
  menu.style.borderRadius = "4px";
  menu.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
  menu.style.display = "none";
  menu.style.zIndex = "9999";
  menu.style.minWidth = "150px";

  // Tạo danh sách phòng
  if (state.allRooms && state.allRooms.length > 0) {
    state.allRooms.forEach(room => {
      const item = document.createElement("div");
      item.textContent = room.name;
      item.style.padding = "6px 10px";
      item.style.cursor = "pointer";
      item.style.color = "#000";
      item.style.background = "#fff";

      // Hover
      item.addEventListener("mouseover", () => {
        item.style.background = "#f0f0f0";
      });
      item.addEventListener("mouseout", () => {
        item.style.background = "#fff";
      });

      // Click chọn phòng
      item.addEventListener("click", () => {
        currentHotspot.linkedRoom = room.name;
        btn.textContent = room.name;
        menu.style.display = "none";
      });

      menu.appendChild(item);
    });
  } else {
    const empty = document.createElement("div");
    empty.textContent = "Chưa có danh sách phòng";
    empty.style.padding = "6px 10px";
    empty.style.color = "red";
    menu.appendChild(empty);
  }

  // Toggle menu khi bấm nút
  btn.addEventListener("click", () => {
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(menu);
  return wrapper;
}




// Đồng bộ layer khít ảnh
function syncLayerToImage() {
  const imgRect = bgImage.getBoundingClientRect();
  const wrapRect = wrapper.getBoundingClientRect();
  layer.style.left   = (imgRect.left - wrapRect.left) + "px";
  layer.style.top    = (imgRect.top  - wrapRect.top)  + "px";
  layer.style.width  = imgRect.width + "px";
  layer.style.height = imgRect.height + "px";
}
bgImage.onload = () => { syncLayerToImage(); renderHotspots(); };
window.addEventListener("resize", () => { syncLayerToImage(); renderHotspots(); });


// ================== Render & Interaction ==================
function renderHotspots() {
  layer.innerHTML = "";
  state.hotspots.forEach(h => {
    const el = document.createElement("div");
    el.className = "hotspot";
    el.dataset.id = h.id;

    const input = document.createElement("input");
    input.value = h.label || "";
    input.placeholder = "Nhãn";
    input.addEventListener("input", () => {
      const idx = state.hotspots.findIndex(x => x.id === h.id);
      if (idx >= 0) state.hotspots[idx].label = input.value.trim();
    });

    // Thêm mũi tên và dropdown liên kết
    const linkLabel = document.createElement("span");
    linkLabel.textContent = " → ";
    linkLabel.style.marginLeft = "4px";
    linkLabel.style.color = "#666";
    linkLabel.style.fontSize = "12px";

    const linkedMenu = createLinkedRoomMenu(h);


    const btnEdit = document.createElement("button");
    btnEdit.textContent = "Sửa";
    btnEdit.addEventListener("click", () => {
      const newLabel = prompt("Nhập nội dung mới:", h.label || "");
      if (newLabel !== null) {
        h.label = newLabel.trim();
        input.value = h.label;
      }
    });

    const btnDel = document.createElement("button");
    btnDel.textContent = "Xoá";
    btnDel.addEventListener("click", () => {
      state.hotspots = state.hotspots.filter(x => x.id !== h.id);
      renderHotspots();
    });

    const dot = document.createElement("div");
    dot.className = "hotspot-dot";

    el.appendChild(dot);
    el.appendChild(input);
    el.appendChild(linkLabel);
    el.appendChild(linkedMenu);

    el.appendChild(btnEdit);
    el.appendChild(btnDel);

    // render theo tỷ lệ đã lưu
    el.style.left = (h.x * 100) + "%";
    el.style.top  = (h.y * 100) + "%";

    // Drag logic
    let dragging = false;
    function onMouseDown(ev) {
      dragging = true;
      el.style.cursor = "grabbing";
      ev.preventDefault();
    }
    function onMouseMove(ev) {
      if (!dragging) return;
      const rect = bgImage.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const nx = Math.max(0, Math.min(x / rect.width, 1));
      const ny = Math.max(0, Math.min(y / rect.height, 1));
      el.style.left = (nx * 100) + "%";
      el.style.top  = (ny * 100) + "%";
      const idx = state.hotspots.findIndex(x => x.id === h.id);
      if (idx >= 0) {
        state.hotspots[idx].x = nx;
        state.hotspots[idx].y = ny;
      }
    }
    function onMouseUp() {
      dragging = false;
      el.style.cursor = "grab";
    }

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    layer.appendChild(el);
  });
}

// ================== Khởi tạo tự động tải danh sách phòng ==================
async function loadRoomsOnStartup() {
  try {
    // Tải dữ liệu từ Google Sheet
    const rows = await fetchGvizRows();
    const rooms = extractRoomsFromRows(rows);

    // Cập nhật state và cache
    state.allRooms = rooms;
    localStorage.setItem('cached_rooms', JSON.stringify(rooms));

    // Cập nhật dropdown chọn phòng chính
    roomSelect.innerHTML = `<option value="">-- Chọn phòng --</option>`;
    rooms.forEach(r => {
      const opt = document.createElement("option");
      opt.value = JSON.stringify(r);
      opt.textContent = r.name;
      roomSelect.appendChild(opt);
    });

    // QUAN TRỌNG: render lại hotspots để dropdown liên kết có dữ liệu
    if (state.hotspots.length > 0) {
      renderHotspots();
    }

    console.log(`✅ Đã tải ${rooms.length} phòng từ Google Sheet`);
  } catch (e) {
    console.error("❌ Lỗi tải Google Sheet:", e);
    alert("⚠️ Không thể tải danh sách phòng. Kiểm tra kết nối internet.");
  }
}


// Gọi hàm khởi tạo khi trang load
loadRoomsOnStartup();

// ================== Events ==================
loadRoomsBtn.addEventListener("click", async () => {
  try {
    await loadRoomsOnStartup();
    alert("✅ Đã làm mới danh sách phòng.");

    // Render lại hotspots để dropdown liên kết cập nhật
    if (state.currentRoom) {
      renderHotspots();
    }
  } catch (e) {
    console.error("Sheet load error:", e);
    alert("❌ Lỗi tải Google Sheet.");
  }
});

roomSelect.addEventListener("change", (e) => {
  const val = e.target.value;
  if (!val) {
    state.currentRoom = null;
    bgImage.src = "";
    layer.innerHTML = "";
    state.hotspots = [];
    return;
  }
  const room = JSON.parse(val);
  state.currentRoom = room;
  bgImage.src = driveViewToDirect(room.imageUrl);
  bgImage.onload = () => {
    syncLayerToImage();
    renderHotspots();
  };
  bgImage.onerror = () => {
    console.error("❌ Lỗi load ảnh:", bgImage.src);
  };
  layer.innerHTML = "";
  state.hotspots = [];
});

// Tải dữ liệu hotspot đã lưu trên Firestore
loadRoomDataBtn.addEventListener("click", async () => {
  if (!state.currentRoom?.name) {
    alert("Chọn phòng trước đã.");
    return;
  }
  try {
    const ref = doc(db, COLLECTION, state.currentRoom.name);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      alert("⚠️ Phòng này chưa có dữ liệu hotspot.");
      return;
    }

    const data = snap.data();
    // lấy link ảnh trực tiếp
    const direct = driveViewToDirect(data.imageUrl || state.currentRoom.imageUrl);
    bgImage.src = direct;

    bgImage.onload = () => {
      console.log("✅ Ảnh đã load thành công:", bgImage.src);
      // đồng bộ layer khít ảnh
      syncLayerToImage();
      // gán hotspots từ Firestore (bao gồm linkedRoom nếu có)
      state.hotspots = Array.isArray(data.hotspots) ? data.hotspots : [];
      // render lại
      renderHotspots();
    };

    bgImage.onerror = () => {
      console.error("❌ Lỗi load ảnh:", bgImage.src);
    };

    alert("✅ Đã tải hotspot từ Firestore.");
  } catch (e) {
    console.error("Firestore load error:", e);
    alert("❌ Lỗi tải Firestore.");
  }
});

// Tạo ô mới
createHotspotBtn.addEventListener("click", () => {
  if (!state.currentRoom?.name) return alert("Chọn phòng trước đã.");
  const id = makeId();
  const label = prompt("Nhập nhãn ô (số AJ hoặc từ vựng):") || "";
  const hs = { 
    id, 
    label: label.trim(), 
    x: 0.5, 
    y: 0.5,
    linkedRoom: ""  // Thêm field liên kết, mặc định rỗng
  };
  state.hotspots.push(hs);
  renderHotspots();
});

// Lưu hotspots lên Firestore
saveBtn.addEventListener("click", async () => {
  if (!state.currentRoom?.name) return alert("Chọn phòng trước đã.");

  const cleaned = state.hotspots.map(h => ({
    id: h.id,
    label: (h.label || "").trim(),
    x: Math.max(0, Math.min(h.x, 1)),
    y: Math.max(0, Math.min(h.y, 1)),
    linkedRoom: h.linkedRoom || ""  // Lưu cả linkedRoom
  }));

  const payload = {
    imageUrl: state.currentRoom.imageUrl,
    hotspots: cleaned,
    updatedAt: Date.now()
  };

  try {
    const ref = doc(db, COLLECTION, state.currentRoom.name);
    await setDoc(ref, payload);
    alert("✅ Đã lưu hotspots lên Firestore.");
  } catch (e) {
    console.error("Firestore save error:", e);
    alert("❌ Lỗi lưu Firestore.");
  }
});
// ... các hàm và events ở trên ...

// ================== Thêm event cho nút làm mới ==================
document.getElementById('refreshLinkedBtn').addEventListener('click', function() {
  if (state.currentRoom) {
    renderHotspots();
    alert("✅ Đã làm mới danh sách phòng liên kết");
  } else {
    alert("⚠️ Chọn phòng trước đã");
  }
});
// ================== TEST: Tạo hotspot với dropdown rõ ràng ==================

// ================== Đồng bộ layer khi resize ==================
window.addEventListener("resize", () => {
  syncLayerToImage();
  renderHotspots();
});