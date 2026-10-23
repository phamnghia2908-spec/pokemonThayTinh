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
const QUESTIONS_PER_SIDE = 10;
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

// Sheets
const SHEET_BAI_HOC = "https://docs.google.com/spreadsheets/d/1xdGIaXekYFQqm1K6ZZyX5pcrmrmjFdSgTJeW27yZJmQ/gviz/tq?tqx=out:json";
const SHEET_TU_VUNG = "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";

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
  // Chuẩn hóa lớp chọn: "2" -> "Lớp 2" để khớp sheet Bài học
  const chosenLevelNum = parseInt(String(selectedLevel), 10);
  const classLabel = `Lớp ${chosenLevelNum}`;

  // 1) Lấy bài lớn nhất (maxLessonCode) của lớp đã chọn từ sheet Bài học
  const resBaiHoc = await fetch(SHEET_BAI_HOC);
  const textBaiHoc = await resBaiHoc.text();
  const jsonBaiHoc = JSON.parse(textBaiHoc.substring(47).slice(0, -2));
  const rowsBaiHoc = jsonBaiHoc.table.rows || [];

  // Ưu tiên so sánh "Lớp 2" đúng chuỗi; fallback: so sánh số (2 == 2)
  const baiList = rowsBaiHoc
    .map(r => {
      const lopRaw = r.c?.[0]?.v != null ? String(r.c[0].v).trim() : null; // "Lớp 2" hoặc "2"
      const baiRaw = r.c?.[2]?.v != null ? String(r.c[2].v).trim() : null; // số bài
      if (!baiRaw) return null;

      const lopNum = lopRaw ? parseInt(lopRaw.replace(/\D/g, ""), 10) : NaN;
      const baiNum = parseInt(baiRaw, 10);

      const classMatchByLabel = (lopRaw === classLabel);
      const classMatchByNum = Number.isFinite(lopNum) && lopNum === chosenLevelNum;

      return (classMatchByLabel || classMatchByNum) && Number.isFinite(baiNum) ? baiNum : null;
    })
    .filter(v => Number.isFinite(v));

  if (baiList.length === 0) {
    console.warn(`⚠️ Không tìm thấy bài học cho lớp ${classLabel}`);
    return { p1: [], p2: [] };
  }

  const maxLessonCode = Math.max(...baiList);

  // 2) Lọc sheet Từ vựng theo maxLessonCode, gom theo "bài" (code)
  const resTuVung = await fetch(SHEET_TU_VUNG);
  const textTuVung = await resTuVung.text();
  const jsonTuVung = JSON.parse(textTuVung.substring(47).slice(0, -2));
  const rows = (jsonTuVung.table.rows || []).slice(1); // bỏ header

  // Map: code -> danh sách cặp {q, a} của bài đó
  const byCode = new Map();
  const poolAllPairs = [];

  rows.forEach(r => {
    const rawCode = r.c?.[1]?.v != null ? String(r.c[1].v).trim() : null;  // Mã bài
    const qJ = r.c?.[9]?.v != null ? String(r.c[9].v).trim() : "";        // Cột J
    const aL = r.c?.[11]?.v != null ? String(r.c[11].v).trim() : "";       // Cột L

    const codeNum = rawCode ? parseInt(rawCode.replace(/\D/g, ""), 10) : NaN;
    if (!Number.isFinite(codeNum) || codeNum <= 0) return;
    if (codeNum > maxLessonCode) return;
    if (!qJ || !aL) return;

    const pair = { q: qJ, a: aL };

    if (!byCode.has(codeNum)) byCode.set(codeNum, []);
    byCode.get(codeNum).push(pair);
    poolAllPairs.push({ code: codeNum, ...pair });
  });

  // Danh sách các mã bài hợp lệ (có ít nhất 1 cặp J-L)
  const availableCodes = Array.from(byCode.keys());
  if (availableCodes.length === 0) {
    console.warn(`⚠️ Không có từ vựng phù hợp ≤ bài ${maxLessonCode} cho ${classLabel}`);
    return { p1: [], p2: [] };
  }

  const pickCount = QUESTIONS_PER_SIDE; // 10 bài
  const chosenCodes = [];

  if (availableCodes.length >= pickCount) {
    // Chọn 10 bài khác nhau
    const shuffled = [...availableCodes].sort(() => Math.random() - 0.5);
    chosenCodes.push(...shuffled.slice(0, pickCount));
  } else {
    // Lặp bài để đủ 10
    while (chosenCodes.length < pickCount) {
      const code = availableCodes[Math.floor(Math.random() * availableCodes.length)];
      chosenCodes.push(code);
    }
  }

  // Với mỗi bài đã chọn, lấy 1 cặp J-L ngẫu nhiên từ bài đó
  let pairs = chosenCodes.map(code => {
    const items = byCode.get(code) || [];
    if (items.length === 0) return null;
    return items[Math.floor(Math.random() * items.length)];
  }).filter(Boolean);

  // Fallback: nếu vì lý do dữ liệu mà pairs < 10, bù bằng pool chung
  while (pairs.length < pickCount && poolAllPairs.length > 0) {
    const p = poolAllPairs[Math.floor(Math.random() * poolAllPairs.length)];
    pairs.push({ q: p.q, a: p.a });
  }

  // Cắt đúng số lượng (đề phòng dư)
  pairs = pairs.slice(0, pickCount);

  return {
    p1: pairs.map(p => p.q), // P1 nói J
    p2: pairs.map(p => p.a)  // P2 nói L
  };
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
    if (!data.player1) {
      await updateDoc(ref, {
        player1: playerName,
        started: false,
        pendingStart: false,
        status: null,
        winner: null,
        startTimestamp: null,
        questions: null,
        // Cho 2 phút chờ P2, nếu không sẽ bị dọn
        cleanupAt: Date.now() + 120000,
        lastUpdated: Date.now()
      });
      await attachRoom(level, roomId);
      return { level, roomId };
    }

    // Slot P2 trống -> mình vào làm P2, NHƯNG không start ngay
    if (!data.player2 && data.player1 !== playerName) {
      // P2 vào → gửi yêu cầu xác nhận, chưa start
      await updateDoc(ref, {
        player2: playerName,
        pendingStart: true,
        requestFrom: playerName,
        requestTime: Date.now(),
        cleanupAt: Date.now() + 15000, // 15s chờ P1 bấm OK
        status: null,
        winner: null,
        lastUpdated: Date.now()
      });
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
    if (data.status === "player_left" || data.status === "finished") {
      statusDiv.textContent = data.winner
        ? `🏆 ${data.winner} thắng!`
        : "🏆 Đối thủ đã thoát. Bạn thắng!";
      if (typeof confirmBtn !== "undefined") confirmBtn.style.display = "none";
      setTimeout(async () => {
        try { await deleteDoc(roomDocRef(currentLevel, currentRoomId)); } catch {}
        await leaveRoom();
      }, 6000);
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
    if (state.startedVisually && state.turnIndex >= TOTAL_TURNS && lastRenderedTurn === TOTAL_TURNS - 1) {
      await finishMatch();
      return;
    }

    renderRoom(lastRoomData);
  }, 500);
}



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
  // Tránh gọi nhiều lần
  if (statusDiv.dataset.finished === "1") return;
  statusDiv.dataset.finished = "1";

  let winner = null;
  if (scoreP1 > scoreP2) winner = lastRoomData.player1;
  else if (scoreP2 > scoreP1) winner = lastRoomData.player2;
  else winner = "Hòa";

  // Thông báo điểm của cả hai
  statusDiv.innerHTML = `
    📊 Điểm cuối:<br>
    ${lastRoomData.player1}: ${scoreP1} điểm<br>
    ${lastRoomData.player2}: ${scoreP2} điểm<br>
    ${winner === "Hòa" ? "🤝 Hòa!" : `🏆 ${winner} thắng!`}
  `;

  // Gửi điểm cuối trận lên Firebase 1 lần duy nhất
  try {
    const ref = roomDocRef(currentLevel, currentRoomId);
    await updateDoc(ref, {
      status: "finished",
      winner: (winner === "Hòa") ? null : winner,
      finalScores: { p1: scoreP1, p2: scoreP2 },
      lastUpdated: Date.now(),
      finishedAt: Date.now()
    });
  } catch (e) {
    console.warn("finishMatch update error", e);
  }

  // Đợi 5 giây rồi thoát (không xóa doc ở đây; để dọn đúng lịch 260s)
  setTimeout(async () => {
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
  try {
    const level = levelSelect.value;
    if (currentRoomId) {
      alert("Bạn đã ở trong phòng. Hãy thoát trước khi tham gia phòng khác.");
      return;
    }
    statusDiv.textContent = "Đang tìm phòng trống...";
    const { roomId } = await tryJoinFirstAvailableRoom(level);
    statusDiv.textContent = `Đã tham gia phòng ${roomId}.`;
    gameArea.style.display = "block";
  } catch (e) {
    console.error(e);
    statusDiv.textContent = e.message || "Lỗi tham gia phòng.";
    alert(e.message || "Lỗi tham gia phòng.");
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
