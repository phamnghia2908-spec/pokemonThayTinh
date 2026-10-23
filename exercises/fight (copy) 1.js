// ===== Part 1/3 =====

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getFirestore, doc, collection, query, where, getDocs, getDoc, 
  updateDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCCVdzWiiFvcWiHVJN-x33YKarsjyziS8E",
  authDomain: "pokemon-capture-10d03.firebaseapp.com",
  projectId: "pokemon-capture-10d03",
  storageBucket: "pokemon-capture-10d03.firebasestorage.app",
  messagingSenderId: "1068125543917",
  appId: "1:1068125543917:web:57de4365ee56729ea8dbe4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Identity
const trainerName = localStorage.getItem("trainerName") || "player";
const trainerClass = localStorage.getItem("trainerClass") || "X";
const playerName = `${trainerName}-${trainerClass}`;

// UI
const meName = document.getElementById("meName");
const chatBox = document.getElementById("chatBox");

function appendChatBubble(text, isP1) {
  if (!text) return;
  const div = document.createElement("div");
  div.textContent = text;
  div.style.maxWidth = "70%";
  div.style.padding = "8px 12px";
  div.style.borderRadius = "12px";
  div.style.background = isP1 ? "#e0ffe8" : "#e0f0ff";
  div.style.alignSelf = isP1 ? "flex-start" : "flex-end";
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

const levelSelect = document.getElementById("levelSelect");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const statusDiv = document.getElementById("status");
const gameArea = document.getElementById("gameArea");
const roomIdSpan = document.getElementById("roomId");
const roomLevelSpan = document.getElementById("roomLevel");
const turnIndexSpan = document.getElementById("turnIndex");
const p1Span = document.getElementById("p1");
const p2Span = document.getElementById("p2");
const currentTurnSpan = document.getElementById("currentTurn");
const recordBtn = document.getElementById("recordBtn");
const speechResultDiv = document.getElementById("speechResult");
const confirmBtn = document.getElementById("confirmBtn");

// Điểm
let scoreP1El = document.getElementById("scoreP1");
let scoreP2El = document.getElementById("scoreP2");

// Speech
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
}

// State
let currentLevel = null;
let currentRoomId = null;
let unsubRoom = null;

let turnStartTime = null; // lưu thời điểm bắt đầu lượt hiện tại

// Thông số trận
const TURN_MS = 10000;        // 10 giây mỗi lượt
const START_DELAY_MS = 3000;  // trễ 3 giây để 2 máy kịp đồng bộ
const QUESTIONS_PER_SIDE = 1;
const TOTAL_TURNS = QUESTIONS_PER_SIDE * 2;
const SCORE_THRESHOLD = 60;   // % từ đúng tối thiểu tính là đúng
const CLEANUP_TOTAL_MS = 260000; // 260s theo yêu cầu

let serverStartMs = null;     // startTimestamp (ms) từ server
let uiTick = null;
let lastComputedTurn = -1;    // phát hiện biên lượt (logic mic)
let lastWasMyTurn = false;
let answeredThisTurn = false; // đã trả lời trong lượt hiện tại chưa

// Chống lặp chat
let lastRenderedTurn = -1;    // lượt cuối đã append câu hỏi
let lastAnsweredTurn = -1;    // lượt cuối đã append câu trả lời

let scoreP1 = 0;
let scoreP2 = 0;

const isMobile = /Mobi|Android/i.test(navigator.userAgent);



let questionsP1 = []; // Player1: câu hỏi (J)
let questionsP2 = []; // Player2: câu trả lời (L)
let lastRoomData = null; // snapshot mới nhất

meName.textContent = playerName;

// Helpers
function roomDocRef(level, roomId) {
  return doc(db, String(level), roomId);
}

async function ensureRoomExists(level, roomId) {
  const ref = roomDocRef(level, roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      player1: null,
      player2: null,
      started: false,
      status: null,     // "player_left" | "finished" | null
      winner: null,
      startTimestamp: null,
      questions: null,
      lastUpdated: Date.now(),
      cleanupAt: null
    });
  }
  return ref;
}

// Lấy đúng cặp J-L theo trình độ đã chọn; luôn trả về đúng QUESTIONS_PER_SIDE phần tử
async function getQuestionsFromSheet(selectedLevel) {
  try {
    // 1) Fetch cả 2 sheet cùng lúc
    const [resBaiHoc, resTuVung] = await Promise.all([
      fetch(window.SHEET_BAI_HOC, { cache: "no-store" }),
      fetch(window.SHEET_URL, { cache: "no-store" })
    ]);

    const rowsBaiHoc = await resBaiHoc.json();
    const rowsTuVung = await resTuVung.json();

    let pool = [];

    // 2) LOGIC LỌC
    if (selectedLevel === "ALL") {
      // CHẾ ĐỘ ALL: Lấy tất cả hàng có đủ J (index 9) và L (index 11)
      pool = rowsTuVung
        .filter(r => r[9] && r[11])
        .map(r => ({ q: String(r[9]).trim(), a: String(r[11]).trim() }));

      console.log("🔥 Mode ALL: Đã lấy toàn bộ từ vựng.");
    } else {
      // CHẾ ĐỘ CHỌN LỚP: Lọc theo max bài như cũ
      const chosenLevelNum = parseInt(String(selectedLevel), 10);
      const baiList = rowsBaiHoc
        .map(r => {
          const lopNum = parseInt(String(r[0]).replace(/\D/g, ""), 10);
          const baiNum = parseInt(r[2], 10);
          return (lopNum === chosenLevelNum && !isNaN(baiNum)) ? baiNum : null;
        })
        .filter(v => v !== null);

      if (baiList.length === 0) return { p1: [], p2: [] };
      const maxLessonCode = Math.max(...baiList);

      pool = rowsTuVung
        .filter(r => {
          const codeNum = parseInt(String(r[1]).replace(/\D/g, ""), 10);
          return !isNaN(codeNum) && codeNum > 0 && codeNum <= maxLessonCode && r[9] && r[11];
        })
        .map(r => ({ q: String(r[9]).trim(), a: String(r[11]).trim() }));
    }

    if (pool.length === 0) return { p1: [], p2: [] };

    // 3) Bốc ngẫu nhiên 10 câu (Hoặc QUESTIONS_PER_SIDE)
    const chosen = pool.sort(() => Math.random() - 0.5).slice(0, QUESTIONS_PER_SIDE);

    return {
      p1: chosen.map(p => p.q),
      p2: chosen.map(p => p.a)
    };
  } catch (err) {
    console.error("❌ Lỗi load Sheet:", err);
    return { p1: [], p2: [] };
  }
}


// Tính trạng thái theo thời gian server (đã hiệu chỉnh)
function computeTurnState() {
  if (!lastRoomData || !serverStartMs) return null;

  const startWithDelay = serverStartMs + START_DELAY_MS;
  const elapsed = Date.now() - startWithDelay;

  if (elapsed < 0) {
    return {
      startedVisually: false,
      turnIndex: 0,
      currentPlayer: lastRoomData.player1
    };
  }

  let turnIndex = Math.floor(elapsed / TURN_MS);
  if (turnIndex < 0) turnIndex = 0;
  if (turnIndex > TOTAL_TURNS) turnIndex = TOTAL_TURNS;

  // Lượt chẵn: player1, lẻ: player2
  const currentPlayer = (turnIndex % 2 === 0) ? lastRoomData.player1 : lastRoomData.player2;

  return {
    startedVisually: true,
    turnIndex,
    currentPlayer
  };
}
// ===== Part 2/3 =====

// Hiển thị UI theo state (giữ nguyên)
function renderRoom(data) {
  if (statusDiv.dataset.finished === "1") return;
  p1Span.textContent = data.player1 || "—";
  p2Span.textContent = data.player2 || "—";

  const state = computeTurnState();
  if (!state) return;

  const isP1Turn = state.currentPlayer === data.player1;
  const isP2Turn = state.currentPlayer === data.player2;

  p1Span.className = "badge " + (isP1Turn ? "red" : (data.player1 ? "green" : ""));
  p2Span.className = "badge " + (isP2Turn ? "red" : (data.player2 ? "green" : ""));

  currentTurnSpan.textContent = state.currentPlayer || "—";

  // Câu hiển thị theo lượt
  const idx = Math.floor(state.turnIndex / 2); // mỗi bên 1 câu/2 lượt
  let displayText = "";

  if (!state.startedVisually) {
    displayText = ""; // không append
  } else if (state.turnIndex >= TOTAL_TURNS) {
    displayText = ""; // không append
  } else {
    displayText = (state.turnIndex % 2 === 0)
      ? (questionsP1[idx] || "")
      : (questionsP2[idx] || "");
  }

  // Append QUESTION vào chat chỉ 1 lần khi sang lượt mới
  if (
    displayText &&
    state.startedVisually &&
    state.turnIndex < TOTAL_TURNS &&
    state.turnIndex !== lastRenderedTurn
  ) {
    appendChatBubble(displayText, state.currentPlayer === data.player1);
    lastRenderedTurn = state.turnIndex;
  }

  // Mic: chỉ bật cho người đang có lượt và còn trong phạm vi câu hỏi
  const myTurn = state.startedVisually && state.turnIndex < TOTAL_TURNS && (state.currentPlayer === playerName);
  recordBtn.disabled = !myTurn || (idx >= QUESTIONS_PER_SIDE);

  // Điểm hiển thị
  scoreP1El.textContent = String(scoreP1);
  scoreP2El.textContent = String(scoreP2);

  // Lượt và chỉ số để người chơi nắm được tiến độ
  turnIndexSpan.textContent = String(state.turnIndex);
}


// ========== Cleanup: dọn phòng ma ==========
// - Xoá phòng cleanupAt < now (hết hạn)
// - Xoá phòng pendingStart quá 10s (P1 không xác nhận)
async function cleanupExpiredRooms(level) {
  try {
    const now = Date.now();
    const roomsRef = collection(db, String(level));

    // cleanupAt quá hạn
    const q1 = query(roomsRef, where("cleanupAt", "<", now));
    const snap1 = await getDocs(q1);
    for (const docSnap of snap1.docs) {
      try { await deleteDoc(docSnap.ref); } catch {}
    }

    // pendingStart quá 10s
    const q2 = query(roomsRef, where("pendingStart", "==", true));
    const snap2 = await getDocs(q2);
    for (const docSnap of snap2.docs) {
      const d = docSnap.data();
      if (d.requestTime && now - d.requestTime > 10000) {
        try { await deleteDoc(docSnap.ref); } catch {}
      }
    }
  } catch (err) {
    console.error("Lỗi cleanupExpiredRooms:", err);
  }
}


// ========== Join phòng ==========
// Giữ luồng cũ: P1/P2 ghi tên bình thường
// Chỉ thêm: P2 vào thì set pendingStart + requestFrom + requestTime (chưa start)
async function tryJoinFirstAvailableRoom(level) {
  await cleanupExpiredRooms(level);

  for (let i = 1; i <= 30; i++) {
    const roomId = `room-${i}`;
    const ref = await ensureRoomExists(level, roomId);
    const snap = await getDoc(ref);
    const data = snap.data();

    // Bỏ qua phòng đã kết thúc
    if (data.status === "player_left" || data.status === "finished") continue;

    // Nếu mình đã ở phòng này
    if (data.player1 === playerName || data.player2 === playerName) {
      await attachRoom(level, roomId);
      return { level, roomId };
    }

    // Slot P1 trống -> mình vào làm P1
    // Slot P1 trống -> mình vào làm P1
    if (!data.player1) {
      await setDoc(ref, { // Đổi thành setDoc để đảm bảo luôn tạo được document
        player1: playerName,
        started: false,
        pendingStart: false,
        status: null,
        winner: null,
        startTimestamp: null,
        questions: null,
        cleanupAt: Date.now() + 120000,
        lastUpdated: Date.now()
      }, { merge: true }); // Thêm merge để không ghi đè mất dữ liệu khác nếu có

      await attachRoom(level, roomId);
      return { level, roomId };
    }

    // Slot P2 trống -> mình vào làm P2, NHƯNG không start ngay
    // Slot P2 trống -> mình vào làm P2
    if (!data.player2 && data.player1 !== playerName) {
      await setDoc(ref, { // Đổi thành setDoc
        player2: playerName,
        pendingStart: true,
        requestFrom: playerName,
        requestTime: Date.now(),
        cleanupAt: Date.now() + 15000,
        status: null,
        winner: null,
        lastUpdated: Date.now()
      }, { merge: true });

      await attachRoom(level, roomId);
      return { level, roomId };
    }

  }
  throw new Error("Không còn phòng trống trong trình độ này.");
}


// ========== P1 bấm OK để start ==========
async function confirmStart(level, roomId) {
  const ref = roomDocRef(level, roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();

  // Chỉ P1 mới được xác nhận & phải còn trong trạng thái chờ
  if (data.player1 !== playerName) return;
  if (!data.pendingStart || !data.player2) return;

  // Quá 10s không xác nhận -> xoá phòng
  if (!data.requestTime || Date.now() - data.requestTime > 10000) {
    try { await deleteDoc(ref); } catch {}
    return;
  }

  // Tạo câu hỏi tại thời điểm bắt đầu
  const { p1, p2 } = await getQuestionsFromSheet(level);
  const questions = p1.map((q, idx) => ({ q, a: p2[idx] }));

  // Bắt đầu trận
  await updateDoc(ref, {
    started: true,
    pendingStart: false,
    questions,
    startTimestamp: serverTimestamp(),
    cleanupAt: Date.now() + CLEANUP_TOTAL_MS, // ví dụ 260000 ms
    lastUpdated: Date.now()
  });
}


// ========== Attach snapshot ==========
async function attachRoom(level, roomId) {
  if (unsubRoom) { unsubRoom(); unsubRoom = null; }
  currentLevel = String(level);
  currentRoomId = roomId;

  roomIdSpan.textContent = currentRoomId;
  roomLevelSpan.textContent = currentLevel;

  const ref = roomDocRef(level, roomId);

  unsubRoom = onSnapshot(ref, async (snap) => {
    if (!snap.exists()) {
      statusDiv.textContent = "⚠️ Phòng đã bị xoá.";
      if (typeof confirmBtn !== "undefined") confirmBtn.style.display = "none";
      await leaveRoom();
      return;
    }

    const data = snap.data();
    lastRoomData = data;
    const now = Date.now();

    // Hết hạn -> xoá phòng và rời
    if (data.cleanupAt && now > data.cleanupAt) {
      try { await deleteDoc(ref); } catch {}
      if (typeof confirmBtn !== "undefined") confirmBtn.style.display = "none";
      await leaveRoom();
      return;
    }

    // Đang chờ P1 xác nhận
    if (!data.started && data.pendingStart) {
      if (data.player2 === playerName) {
        if (data.requestTime && now - data.requestTime > 10000) {
          try { await deleteDoc(ref); } catch {}
          if (typeof confirmBtn !== "undefined") confirmBtn.style.display = "none";
          await leaveRoom();
          return;
        }
        statusDiv.textContent = "Đang chờ P1 xác nhận…";
        if (typeof confirmBtn !== "undefined") confirmBtn.style.display = "none";
        return;
      }

      if (data.player1 === playerName) {
        if (data.requestTime && now - data.requestTime > 10000) {
          try { await deleteDoc(ref); } catch {}
          if (typeof confirmBtn !== "undefined") confirmBtn.style.display = "none";
          await leaveRoom();
          return;
        }
        statusDiv.textContent = `${data.requestFrom} muốn vào trận`;
        if (typeof confirmBtn !== "undefined") {
          confirmBtn.style.display = "inline-block";
          confirmBtn.onclick = async () => {
            confirmBtn.style.display = "none";
            await confirmStart(level, roomId);
          };
        }
        return;
      }
    } else {
      if (typeof confirmBtn !== "undefined") confirmBtn.style.display = "none";
    }

    // Kết thúc hoặc ai rời
    // Kết thúc hoặc ai rời
    // Kết thúc hoặc ai rời
    // Kết thúc hoặc ai rời (Online)
    if (data.status === "player_left" || data.status === "finished") {
      if (unsubRoom) { unsubRoom(); unsubRoom = null; } 
      statusDiv.dataset.finished = "1"; 

      let title = "🎮 KẾT THÚC TRẬN";
      let msg = data.winner ? `🏆 ${data.winner} đã chiến thắng!` : "🤝 Trận đấu Hòa!";

      if (data.status === "player_left") {
          title = "<span style='color: #dc2626;'>⚠️ ĐỐI THỦ RỜI TRẬN</span>";
          msg = "Đối thủ đã thoát. Bạn được tính là người chiến thắng!";
      }

      if (typeof confirmBtn !== "undefined") confirmBtn.style.display = "none";

      // HIỆN POP-UP NGAY ĐÂY
      showResultModal(title, msg);
      return;
    }

    // Đồng bộ câu hỏi
    if (data.questions && Array.isArray(data.questions)) {
      questionsP1 = data.questions.map(p => p.q);
      questionsP2 = data.questions.map(p => p.a);
    }

    // Đồng bộ startTimestamp
    if (data.startTimestamp) {
      serverStartMs = data.startTimestamp.toMillis();
    }

    renderRoom(data);
  });

  // Tick UI
  clearInterval(uiTick);
  let lastSec = -1;
  uiTick = setInterval(async () => {
    if (!lastRoomData) return;

    // Dọn khi tới hạn
    if (lastRoomData.cleanupAt && Date.now() > lastRoomData.cleanupAt) {
      try { await deleteDoc(roomDocRef(currentLevel, currentRoomId)); } catch {}
      if (typeof confirmBtn !== "undefined") confirmBtn.style.display = "none";
      await leaveRoom();
      return;
    }

    if (!serverStartMs) {
      renderRoom(lastRoomData);
      return;
    }

    const state = computeTurnState();
    if (!state) return;

    // Nếu sang lượt mới → lưu thời điểm bắt đầu
    if (state.startedVisually && state.turnIndex !== lastComputedTurn) {
      answeredThisTurn = false;
      lastComputedTurn = state.turnIndex;
      lastWasMyTurn = (state.currentPlayer === playerName);
      turnStartTime = Date.now(); // 🆕 lưu thời điểm bắt đầu lượt
    }

    // Cập nhật đồng hồ 10s
    if (state.startedVisually && state.turnIndex < TOTAL_TURNS && turnStartTime) {
      const sec = Math.floor((Date.now() - turnStartTime) / 1000);
      if (sec !== lastSec) {
        document.getElementById("turnSeconds").textContent = sec;
        lastSec = sec;
      }
    } else {
      document.getElementById("turnSeconds").textContent = 0;
      lastSec = -1;
    }

    // Kết thúc trận
    // Chỉ gọi finishMatch nết chưa được đánh dấu là finished
    // Kết thúc trận
    // Kết thúc trận
    if (state.startedVisually && state.turnIndex >= TOTAL_TURNS && statusDiv.dataset.finished !== "1") {
      // 🆕 Ngắt Firebase trước khi báo kết thúc
      if (unsubRoom) { unsubRoom(); unsubRoom = null; } 
      await finishMatch();
      return; 
    }

    // Chỉ vẽ lại UI nếu chưa kết thúc
    if (statusDiv.dataset.finished !== "1") {
      renderRoom(lastRoomData);
    }
  }, 500);
}

// ... (Các hàm leaveRoom, resetUiAfterLeave cũ của ông)

// ==========================================
// OFFLINE MODE LOGIC (Đấu với Máy)
// ==========================================

async function startOfflineGame(botLevel) {
  // 1. Lấy dữ liệu (Mặc định lấy ALL)
  const { p1, p2 } = await getQuestionsFromSheet("ALL");
  if (!p1.length) {
    statusDiv.textContent = "Lỗi: Không lấy được dữ liệu từ Sheet.";
    return;
  }
  questionsP1 = p1;
  questionsP2 = p2;

  // 2. Giả lập Room Data để các hàm Render cũ không bị lỗi
  lastRoomData = {
    player1: playerName,
    player2: `Máy (${botLevel})`,
    started: true,
    startTimestamp: { toMillis: () => Date.now() } 
  };

  serverStartMs = Date.now();
  currentRoomId = "OFFLINE_MODE"; // Đánh dấu để không gọi Firebase
  gameArea.style.display = "block";
  statusDiv.textContent = `Đang đấu với Máy (${botLevel})`;

  // 3. Chạy vòng lặp UI riêng cho Offline
  startOfflineTick(botLevel);
}

function startOfflineTick(botLevel) {
  clearInterval(uiTick);

  uiTick = setInterval(() => {
    if (currentRoomId !== "OFFLINE_MODE") {
      clearInterval(uiTick);
      return;
    }

    const state = computeTurnState();
    if (!state) return;

    // Reset trạng thái khi sang lượt mới
    if (state.turnIndex !== lastComputedTurn) {
      answeredThisTurn = false;
      lastComputedTurn = state.turnIndex;
      turnStartTime = Date.now();
    }

    // --- LOGIC MÁY TỰ TRẢ LỜI ---
    // Kiểm tra nếu hiện tại là lượt của Máy (Player 2)
    // --- LOGIC MÁY TỰ TRẢ LỜI SIÊU TỐC ---
    const isBotTurn = (state.currentPlayer === lastRoomData.player2);

    if (isBotTurn && !answeredThisTurn && state.turnIndex < TOTAL_TURNS) {
      answeredThisTurn = true; 

      // Trả lời gần như ngay lập tức (0.5s để tránh bị giật lag UI)
      setTimeout(() => {
        if (currentRoomId !== "OFFLINE_MODE") return;

        const idx = Math.floor(state.turnIndex / 2);
        const fullText = (state.turnIndex % 2 === 0) ? questionsP1[idx] : questionsP2[idx];

        if (fullText) {
          // 1. Tính toán tỉ lệ đúng/sai theo độ khó
          const rate = botLevel === "Easy" ? 0.4 : (botLevel === "Normal" ? 0.7 : 0.9);
          const isCorrect = Math.random() < rate;

          let botSpeech = "";

          if (isCorrect) {
            // TRƯỜNG HỢP ĐÚNG: Nói cả câu + cộng điểm
            botSpeech = fullText;
            scoreP2++;
            scoreP2El.textContent = String(scoreP2);
            flashScore(scoreP2El);
          } else {
            // TRƯỜNG HỢP SAI: Lược bớt 50% số từ
            const words = fullText.split(" ");
            const halfLength = Math.ceil(words.length / 2);
            botSpeech = words.slice(0, halfLength).join(" ") + "...";
            // Không cộng điểm ở đây
          }

          // 2. Hiện câu nói vào chatbox
          appendChatBubble(`🤖: ${botSpeech}`, false);
        }
      }, 500); 
    }

    // Kết thúc trận
    // Kết thúc trận
    if (state.turnIndex >= TOTAL_TURNS) {
      clearInterval(uiTick);
      finishOfflineMatch();
      return; // Dừng ngay vòng lặp này
    }

    // Chỉ vẽ lại UI nếu chưa kết thúc
    if (statusDiv.dataset.finished !== "1") {
      renderRoom(lastRoomData);
    }
  }, 500);
}

function finishOfflineMatch() {
  if (statusDiv.dataset.finished === "1") return;
  statusDiv.dataset.finished = "1";

  let title = (scoreP1 > scoreP2) ? "🎉 CHIẾN THẮNG!" : (scoreP1 < scoreP2 ? "🤖 THẤT BẠI!" : "🤝 HÒA NHAU!");

  // Hiện Pop-up
  showResultModal(title, `Bạn: ${scoreP1} | Máy: ${scoreP2}<br>Trận đấu đã kết thúc.`);

  // Đợi 5 giây rồi mới dọn dẹp UI
  setTimeout(() => {
    resetUiAfterLeave();
    gameArea.style.display = "none";
    statusDiv.textContent = "Trận đấu đã kết thúc.";
    delete statusDiv.dataset.finished;
  }, 5000);
}

// ===== Part 3/3 =====
// recordBtn.addEventListener("click", ...

// ===== Part 3/3 =====

// Bắt mic khi nhấn nút (chỉ có tác dụng khi tới lượt mình và không hết câu)
recordBtn.addEventListener("click", () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert("Thiết bị của bạn không hỗ trợ nhận giọng nói.");
    return;
  }
  const state = computeTurnState();
  if (!state || !state.startedVisually || state.turnIndex >= TOTAL_TURNS) return;
  if (state.currentPlayer !== playerName) return;

  const idx = Math.floor(state.turnIndex / 2);
  if (idx >= QUESTIONS_PER_SIDE) return;

  const recognitionLocal = new SR();
  recognitionLocal.lang = "en-US";
  recognitionLocal.interimResults = false;
  recognitionLocal.maxAlternatives = 1;

  speechResultDiv.textContent = "🎙️ Đang nghe...";
  recognitionLocal.start();

  recognitionLocal.onresult = (event) => {
    try { recognitionLocal.stop(); } catch {}
    const transcript = event.results[0][0].transcript.toLowerCase().trim();

    // Đọc lại state tại thời điểm nhận kết quả (tránh lệch)
    const curState = computeTurnState();
    if (!curState || !curState.startedVisually || curState.turnIndex >= TOTAL_TURNS) return;

    const curIdx = Math.floor(curState.turnIndex / 2);

    // Văn bản tham chiếu đúng cho lượt hiện tại
    const referenceText = (curState.turnIndex % 2 === 0)
      ? (questionsP1[curIdx] || "")
      : (questionsP2[curIdx] || "");

    const { percent, isCorrect } = gradeSpeech(transcript, referenceText);
    speechResultDiv.innerHTML =
      `✅ Bạn nói: "<i>${transcript}</i>"<br>🎯 Đúng ${percent}%`;

    // Append câu trả lời vào chat CHỈ 1 LẦN/LƯỢT
    if (curState.turnIndex !== lastAnsweredTurn) {
      appendChatBubble(`💬 ${transcript}`, (curState.turnIndex % 2 === 0));
      lastAnsweredTurn = curState.turnIndex;
    }

    // Chấm điểm CHỈ 1 LẦN/LƯỢT
    if (!answeredThisTurn && isCorrect) {
      if (curState.turnIndex % 2 === 0) {
        scoreP1++;
        scoreP1El.textContent = String(scoreP1);
        flashScore(scoreP1El);
      } else {
        scoreP2++;
        scoreP2El.textContent = String(scoreP2);
        flashScore(scoreP2El);
      }
    }

    answeredThisTurn = true;
  };

  recognitionLocal.onerror = (event) => {
    speechResultDiv.innerText = `❌ Lỗi: ${event.error}`;
  };
});

// So khớp lời nói
function gradeSpeech(userText, referenceText) {
  const cleanRef = referenceText.toLowerCase().replace(/[^a-z0-9'\s]/g, "");
  const user = userText.toLowerCase().replace(/[^a-z0-9'\s]/g, "");
  const refWords = cleanRef.split(/\s+/).filter(Boolean);
  const userWords = user.split(/\s+/).filter(Boolean);

  let correct = 0;
  for (let w of refWords) if (userWords.includes(w)) correct++;
  const percent = refWords.length ? Math.round((correct / refWords.length) * 100) : 0;
  const isCorrect = percent >= SCORE_THRESHOLD;
  return { percent, isCorrect };
}

// Hiệu ứng điểm
function flashScore(el) {
  el.style.transition = "transform 0.2s ease, color 0.2s ease";
  const oldColor = el.style.color;
  el.style.transform = "scale(1.2)";
  el.style.color = "#16a34a";
  setTimeout(() => {
    el.style.transform = "scale(1)";
    el.style.color = oldColor || "";
  }, 220);
}

// Kết thúc trận
async function finishMatch() {
  if (!currentLevel || !currentRoomId || !lastRoomData) return;
  if (statusDiv.dataset.finished === "1") return;

  // 🆕 Thêm dòng này để dập tắt lắng nghe Firebase ngay lập tức
  if (unsubRoom) { unsubRoom(); unsubRoom = null; }

  statusDiv.dataset.finished = "1";
  // ... (phần còn lại giữ nguyên)

  // Dừng mọi hoạt động record
  if (recognition) try { recognition.stop(); } catch {}

  let winner = null;
  if (scoreP1 > scoreP2) winner = lastRoomData.player1;
  else if (scoreP2 > scoreP1) winner = lastRoomData.player2;
  else winner = "Hòa";

  const winMsg = (winner === "Hòa") ? "🤝 KẾT QUẢ HÒA" : `🏆 ${winner.toUpperCase()} CHIẾN THẮNG!`;

  // Gọi Pop-up thay vì ghi vào statusDiv
  showResultModal(winMsg, `Tỉ số cuối cùng là <b>${scoreP1} - ${scoreP2}</b>`);

  // Pop-up thông báo (Dùng alert để chặn luồng hoặc hiện thông báo êm hơn)
  console.log("Kết thúc trận:", winMsg);

  // 2. Gửi trạng thái lên Firebase
  try {
    const ref = roomDocRef(currentLevel, currentRoomId);
    await updateDoc(ref, {
      status: "finished",
      winner: (winner === "Hòa") ? null : winner,
      finalScores: { p1: scoreP1, p2: scoreP2 },
      lastUpdated: Date.now()
    });
  } catch (e) { console.warn(e); }

  // 3. ĐỢI ĐÚNG 5 GIÂY RỒI MỚI THOÁT
  setTimeout(async () => {
    // Chỉ xoá phòng nếu mình là Player 1 (để tránh 2 máy cùng xoá gây lỗi)
    if (lastRoomData && lastRoomData.player1 === playerName) {
      try { await deleteDoc(roomDocRef(currentLevel, currentRoomId)); } catch {}
    }
    await leaveRoom(); 
  }, 5000);
}

// Thoát phòng chuẩn
async function leaveRoom() {
  if (recognition) try { recognition.stop(); } catch {}
  clearInterval(uiTick);
  if (!currentLevel || !currentRoomId) {
    resetUiAfterLeave();
    return;
  }

  const ref = roomDocRef(currentLevel, currentRoomId);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const updates = {
        lastUpdated: Date.now(),
        // không thay started ở đây; trận có thể vẫn đang chạy cho người còn lại
      };

      if (data.player1 === playerName) updates.player1 = null;
      if (data.player2 === playerName) updates.player2 = null;

      await updateDoc(ref, updates);
      // Không xóa doc ở đây; để dọn theo cleanupAt
    }
  } catch (e) {
    console.warn("leaveRoom update error", e);
  }

  if (unsubRoom) { unsubRoom(); unsubRoom = null; }
  resetUiAfterLeave();
}

// Thoát nhanh cho mobile (đánh dấu trạng thái)
async function leaveRoomFast() {
  try {
    if (!currentLevel || !currentRoomId) return;
    const ref = roomDocRef(currentLevel, currentRoomId);
    await updateDoc(ref, {
      status: "player_left",
      lastUpdated: Date.now()
    });
  } catch (e) {
    console.warn("leaveRoomFast error", e);
  }
}

// Reset UI/State sau khi thoát
function resetUiAfterLeave() {
  currentLevel = null;
  currentRoomId = null;
  lastRoomData = null;
  serverStartMs = null;
  uiTick = null;
  lastComputedTurn = -1;
  lastWasMyTurn = false;
  answeredThisTurn = false;
  lastRenderedTurn = -1;
  lastAnsweredTurn = -1;
  scoreP1 = 0; scoreP2 = 0;

  scoreP1El.textContent = "0";
  scoreP2El.textContent = "0";
  roomIdSpan.textContent = "—";
  roomLevelSpan.textContent = "—";
  p1Span.textContent = "—"; p1Span.className = "badge";
  p2Span.textContent = "—"; p2Span.className = "badge";
  currentTurnSpan.textContent = "—";
  turnIndexSpan.textContent = "0";

  if (chatBox) chatBox.innerHTML = "";

  gameArea.style.display = "none";
  statusDiv.textContent = "Đã thoát phòng.";
  delete statusDiv.dataset.finished;
}

// Nút join
joinBtn.addEventListener("click", async () => {
  const level = levelSelect.value;

  // Kiểm tra nếu là chế độ Đấu với Máy
  const isBot = ["Easy", "Normal", "Hard"].includes(level);

  if (isBot) {
    statusDiv.textContent = "Đang khởi tạo trận đấu với Máy...";
    await startOfflineGame(level); // Hàm offline riêng
  } else {
    // Logic Online cũ của ông
    try {
      if (currentRoomId) {
        alert("Bạn đã ở trong phòng...");
        return;
      }
      statusDiv.textContent = "Đang tìm phòng trống...";
      const { roomId } = await tryJoinFirstAvailableRoom(level);
      statusDiv.textContent = `Đã tham gia phòng ${roomId}.`;
      gameArea.style.display = "block";
    } catch (e) {
      statusDiv.textContent = e.message;
    }
  }
});

// Nút leave
leaveBtn.addEventListener("click", async () => {
  await leaveRoom();
});

// PC: đóng tab/reload → thoát chuẩn
if (!isMobile) {
  window.addEventListener("beforeunload", () => {
    leaveRoom();
  });
}

// Mobile: ẩn tab/app → ân hạn 10s rồi đánh dấu rời
let leaveGraceTimeout = null;
if (isMobile) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearTimeout(leaveGraceTimeout);
      leaveGraceTimeout = setTimeout(() => {
        leaveRoomFast();
      }, 10000);
    } else {
      clearTimeout(leaveGraceTimeout);
    }
  });

  window.addEventListener("pagehide", () => {
    leaveRoomFast();
  });
}
// Hàm bật Pop-up lên màn hình
// 1. Hàm bật Pop-up lên màn hình
window.showResultModal = function(title, message) {
    const modal = document.getElementById("resultModal");
    if (!modal) return; 
    document.getElementById("modalTitle").innerHTML = title;
    document.getElementById("modalBody").innerHTML = message;
    modal.style.display = "flex"; 
};

// 2. Hàm đóng Pop-up và thoát (Đây là hàm đang bị báo lỗi)
window.closeResultModal = async function() {
    const modal = document.getElementById("resultModal");
    if (modal) modal.style.display = "none";

    // Gọi hàm thoát phòng có sẵn trong code của ông
    if (typeof leaveRoom === "function") {
        await leaveRoom();
    } else {
        // Nếu không tìm thấy hàm leaveRoom thì tải lại trang cho chắc
        window.location.reload();
    }
};