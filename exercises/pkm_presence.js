/**
 * ==========================================================
 * PKM PRESENCE v2 — hiện diện + Online + Bạn bè + Nhắn tin
 * ==========================================================
 * Thêm 1 dòng <script src="pkm_presence.js"></script> vào bất kỳ trang
 * nào là trang đó tự có: nút nổi, panel "Đấu Online" (2 tab: Online / Bạn
 * bè), popup nhận thách đấu, và cửa sổ chat mini với bạn bè.
 *
 * DỮ LIỆU:
 *   - "Ai đang online, ai đang bận" -> server (RAM), qua socket.io
 *   - "Ai là bạn bè, lời mời kết bạn" -> Firestore, doc friends/{playerId}
 *   - "Tin nhắn" -> KHÔNG lưu, chỉ chuyển tiếp qua socket, tối đa 3 tin
 *     GỬI cho mỗi người bạn/phiên (mở lại trang = phiên mới, làm mới đếm).
 *   - Server KHÔNG kiểm tra 2 người có thật là bạn bè không (không biết
 *     dữ liệu Firestore) — chỉ tin client. Đã có: giới hạn 3 tin + lọc từ.
 *
 * CẦN CÓ TRƯỚC (thêm trước dòng include file này):
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js"></script>
 * ==========================================================
 */

window.PkmPresence = (() => {
  const SERVER_URL = "https://server-battle.onrender.com";

  const trainerName = localStorage.getItem("trainerName") || "Ẩn danh";
  const className = localStorage.getItem("trainerClass") || null;
  const playerId = `${className || "?"}|${trainerName}`;

  let socket = null;
  let busy = false;

  const listeners = {};
  function on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); }
  function emitLocal(ev, data) { (listeners[ev] || []).forEach(cb => cb(data)); }

  function ownedCount() {
    try {
      const inv = JSON.parse(localStorage.getItem("pkm_inventory")) || [];
      return Math.min(3, Math.max(1, inv.length || 1));
    } catch (e) { return 1; }
  }

  function connect(initialBusy = false) {
    if (socket) return socket;
    busy = !!initialBusy;
    socket = io(SERVER_URL, { transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      socket.emit("presence:hello", { playerId, name: trainerName, className, ownedCount: ownedCount(), busy });
      const savedRoom = sessionStorage.getItem("pkm_net_room_id");
      if (savedRoom) socket.emit("room:rejoin", { roomId: savedRoom, playerId });
    });

    socket.on("presence:replaced", () => emitLocal("replaced"));
    socket.on("presence:delta", d => emitLocal("presenceDelta", d));

    socket.on("challenge:incoming", d => emitLocal("challengeIncoming", d));
    socket.on("challenge:sent", d => emitLocal("challengeSent", d));
    socket.on("challenge:declined", d => emitLocal("challengeDeclined", d));
    socket.on("challenge:queued", d => emitLocal("challengeQueued", d));
    socket.on("challenge:forced", d => emitLocal("challengeForced", d));
    socket.on("challenge:expired", d => emitLocal("challengeExpired", d));
    socket.on("challenge:cancelled", d => emitLocal("challengeCancelled", d));
    socket.on("challenge:error", d => emitLocal("challengeError", d));
    socket.on("friend:notify", d => emitLocal("friendNotify", d));
    socket.on("chat:message", d => emitLocal("chatMessage", d));
    socket.on("chat:sent", d => emitLocal("chatSent", d));
    socket.on("chat:error", d => emitLocal("chatError", d));
    socket.on("queue:timeout", () => emitLocal("queueTimeout"));

    socket.on("match:found", d => { sessionStorage.setItem("pkm_net_room_id", d.roomId); emitLocal("matchFound", d); });
    socket.on("match:cancelled", d => emitLocal("matchCancelled", d));

    ["battle:start", "state:update", "battle:end", "room:rejoin_ok", "room:rejoin_failed",
      "opponent:disconnected", "opponent:reconnected"].forEach(ev => socket.on(ev, d => emitLocal(ev, d)));

    return socket;
  }

  function getSocket() { return socket; }
  function setBusy(v) { busy = !!v; if (socket && socket.connected) socket.emit("presence:status", { busy }); }
  function openPanel() { connect(); if (socket) socket.emit("panel:open"); }
  function closePanel() { if (socket) socket.emit("panel:close"); }
  function listOnline(scope, cb) {
    connect();
    if (!socket.connected) return socket.once("connect", () => listOnline(scope, cb));
    socket.emit("presence:list", { scope, className }, d => cb && cb(d || { users: [] }));
  }
  function queryFriends(ids, cb) { connect(); socket.emit("presence:query", { ids }, d => cb && cb(d || { users: [] })); }
  function joinRandomQueue() { connect(); socket.emit("queue:join"); }
  function cancelQueue() { if (socket) socket.emit("queue:cancel"); }
  function sendChallenge(toPlayerId, message) { connect(); socket.emit("challenge:send", { toPlayerId, message }); }
  function acceptChallenge(fromPlayerId) { if (socket) socket.emit("challenge:accept", { fromPlayerId }); }
  function declineChallenge() { if (socket) socket.emit("challenge:decline"); }
  function notifyFriend(toPlayerId, kind) { connect(); socket.emit("friend:notify", { toPlayerId, kind }); }
  function sendChat(toPlayerId, text) { connect(); socket.emit("chat:send", { toPlayerId, text }); }

  function sayBye() { if (socket && socket.connected) socket.emit("presence:bye"); }
  window.addEventListener("pagehide", sayBye);
  window.addEventListener("beforeunload", sayBye);

  return {
    connect, getSocket, getPlayerId: () => playerId, getName: () => trainerName, getClassName: () => className,
    setBusy, openPanel, closePanel, listOnline, queryFriends,
    joinRandomQueue, cancelQueue, sendChallenge, acceptChallenge, declineChallenge,
    notifyFriend, sendChat, on,
  };
})();

/* ================= FIRESTORE: BẠN BÈ (list/incoming/outgoing) ================= */
window.PkmFriends = (() => {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
    authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
    projectId: "lop-hoc-thay-tinh",
    storageBucket: "lop-hoc-thay-tinh.firebasestorage.app",
    messagingSenderId: "391812475288",
    appId: "1:391812475288:web:ca4c275ac776d69deb23ed",
  };

  let _refs = null;
  async function getRefs() {
    if (_refs) return _refs;
    const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js");
    const { getFirestore, doc, getDoc, setDoc, updateDoc, deleteField } =
      await import("https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js");
    const app = getApps().find(a => a.name === "pkmPresenceApp") || initializeApp(FIREBASE_CONFIG, "pkmPresenceApp");
    _refs = { db: getFirestore(app), doc, getDoc, setDoc, updateDoc, deleteField };
    return _refs;
  }
  function myId() { return window.PkmPresence.getPlayerId(); }
  function docRef(refs, id) { return refs.doc(refs.db, "friends", id); }

  async function ensureDoc(refs, id) {
    await refs.setDoc(docRef(refs, id), { list: {}, incoming: {}, outgoing: {} }, { merge: true });
  }

  async function load() {
    const refs = await getRefs();
    const snap = await refs.getDoc(docRef(refs, myId()));
    const d = snap.exists() ? snap.data() : {};
    return { list: d.list || {}, incoming: d.incoming || {}, outgoing: d.outgoing || {} };
  }

  async function sendRequest(toId, toName, toClass) {
    const refs = await getRefs();
    await ensureDoc(refs, myId()); await ensureDoc(refs, toId);
    await refs.updateDoc(docRef(refs, myId()), { [`outgoing.${toId}`]: { name: toName, className: toClass || null } });
    await refs.updateDoc(docRef(refs, toId), { [`incoming.${myId()}`]: { name: window.PkmPresence.getName(), className: window.PkmPresence.getClassName() } });
    window.PkmPresence.notifyFriend(toId, "request");
  }

  async function accept(fromId, fromName, fromClass) {
    const refs = await getRefs();
    const me = myId();
    await refs.updateDoc(docRef(refs, me), {
      [`incoming.${fromId}`]: refs.deleteField(),
      [`list.${fromId}`]: { name: fromName, className: fromClass || null },
    });
    await refs.updateDoc(docRef(refs, fromId), {
      [`outgoing.${me}`]: refs.deleteField(),
      [`list.${me}`]: { name: window.PkmPresence.getName(), className: window.PkmPresence.getClassName() },
    });
    window.PkmPresence.notifyFriend(fromId, "accepted");
  }

  async function decline(fromId) {
    const refs = await getRefs();
    const me = myId();
    await refs.updateDoc(docRef(refs, me), { [`incoming.${fromId}`]: refs.deleteField() });
    try { await refs.updateDoc(docRef(refs, fromId), { [`outgoing.${me}`]: refs.deleteField() }); } catch (e) { /* bạn kia có thể chưa từng có doc, bỏ qua */ }
  }

  return { load, sendRequest, accept, decline };
})();

/* ================= GIAO DIỆN: nút nổi + panel (2 tab) + chat + popup ================= */
(() => {
  const PAGE_SIZE = 10;

  const css = `
    #pkmp-btn { position:fixed; right:16px; bottom:16px; z-index:99000; width:56px; height:56px;
        border-radius:50%; border:none; cursor:pointer; background:linear-gradient(135deg,#ffcb05,#ff9500);
        box-shadow:0 6px 18px rgba(0,0,0,.35); font-size:26px; display:flex; align-items:center; justify-content:center; }
    #pkmp-btn .dot { position:absolute; top:2px; right:2px; width:12px; height:12px; border-radius:50%;
        background:#2ecc71; border:2px solid #111; display:none; }
    #pkmp-btn .dot.show { display:block; }
    #pkmp-panel { position:fixed; right:16px; bottom:82px; z-index:99000; width:310px; max-width:90vw;
        max-height:74vh; background:#161a2e; border:2px solid #ffcb05; border-radius:16px;
        box-shadow:0 10px 30px rgba(0,0,0,.5); display:none; flex-direction:column; overflow:hidden;
        font-family:'Be Vietnam Pro',sans-serif; color:#fff; }
    #pkmp-panel.open { display:flex; }
    #pkmp-tabs { display:flex; border-bottom:1px solid rgba(255,203,5,.25); }
    .pkmp-tab { flex:1; text-align:center; padding:10px 0; font-size:12.5px; font-weight:800; color:#888; cursor:pointer; background:rgba(255,255,255,.03); }
    .pkmp-tab.active { color:#ffcb05; background:rgba(255,203,5,.08); }
    #pkmp-head { padding:10px 14px; background:rgba(255,203,5,.05); display:flex; align-items:center; justify-content:space-between; }
    #pkmp-head b { color:#ffcb05; font-size:13px; }
    #pkmp-random { background:#333; border:1px solid #555; color:#fff; border-radius:16px; padding:5px 12px; font-size:11px; cursor:pointer; }
    #pkmp-list, #pkmp-friend-list { flex:1; overflow-y:auto; padding:8px 10px; }
    .pkmp-row { display:flex; align-items:center; justify-content:space-between; gap:6px;
        background:rgba(255,255,255,.05); border-radius:10px; padding:8px 10px; margin-bottom:6px; font-size:12px; }
    .pkmp-row .nm { font-weight:700; }
    .pkmp-row .cl { color:#888; font-size:10px; }
    .pkmp-badge { font-size:9.5px; font-weight:800; padding:2px 7px; border-radius:9px; white-space:nowrap; }
    .pkmp-badge.idle { background:rgba(46,204,113,.18); color:#2ecc71; }
    .pkmp-badge.busy, .pkmp-badge.in_match { background:rgba(231,76,60,.18); color:#e74c3c; }
    .pkmp-badge.searching { background:rgba(255,203,5,.18); color:#ffcb05; }
    .pkmp-badge.offline { background:rgba(255,255,255,.08); color:#777; }
    .pkmp-btnrow { display:flex; gap:4px; flex-shrink:0; }
    .pkmp-chal, .pkmp-addfriend, .pkmp-chatbtn { border:none; padding:4px 9px; border-radius:12px; font-weight:800; font-size:10px; cursor:pointer; white-space:nowrap; }
    .pkmp-chal { background:linear-gradient(135deg,#ffcb05,#ff9500); color:#000; }
    .pkmp-addfriend { background:#3a6dd8; color:#fff; }
    .pkmp-chatbtn { background:#2ecc71; color:#fff; }
    .pkmp-chal:disabled, .pkmp-addfriend:disabled { background:#333; color:#777; }
    #pkmp-empty, #pkmp-empty-f { text-align:center; color:#666; font-size:12px; padding:16px 0; }
    .pkmp-group { color:#888; font-size:10px; font-weight:700; text-transform:uppercase; margin:8px 2px 3px; }
    #pkmp-pager { display:flex; align-items:center; justify-content:center; gap:10px; padding:6px 0 2px; font-size:11px; color:#aaa; }
    #pkmp-pager button { background:#2a2a45; border:1px solid #444; color:#fff; border-radius:8px; padding:3px 10px; cursor:pointer; font-size:11px; }
    #pkmp-pager button:disabled { opacity:.35; cursor:default; }
    .pkmp-reqrow { border:1px solid rgba(255,203,5,.4); }
    .pkmp-req-actions button { border:none; border-radius:10px; padding:4px 8px; font-size:10px; font-weight:800; cursor:pointer; margin-left:3px; }
    .pkmp-req-ok { background:#2ecc71; color:#fff; }
    .pkmp-req-no { background:#e74c3c; color:#fff; }

    #pkmp-msgpick, #pkmp-incoming, #pkmp-chatwin { position:fixed; z-index:99500; }
    #pkmp-msgpick, #pkmp-incoming { inset:0; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.6); }
    #pkmp-msgpick .box, #pkmp-incoming .box { background:#161a2e; border:2px solid #ffcb05; border-radius:16px; padding:20px;
        width:90%; max-width:320px; text-align:center; color:#fff; font-family:'Be Vietnam Pro',sans-serif; }
    #pkmp-msgpick h3 { color:#ffcb05; font-size:15px; margin:0 0 12px; }
    .pkmp-msgopt { display:block; width:100%; background:rgba(255,255,255,.06); border:1px solid #444; color:#fff;
        padding:10px; border-radius:10px; margin-bottom:8px; font-size:13px; cursor:pointer; text-align:left; }
    #pkmp-msgcancel { color:#888; font-size:12px; background:none; border:none; cursor:pointer; margin-top:4px; }
    #pkmp-incoming .from { color:#ffcb05; font-weight:900; font-size:16px; margin-bottom:6px; }
    #pkmp-incoming .msg { color:#ddd; font-size:13px; margin-bottom:6px; font-style:italic; }
    #pkmp-incoming .cd { color:#ff6b6b; font-weight:900; font-size:13px; margin-bottom:16px; }
    #pkmp-incoming .actions { display:flex; gap:10px; }
    #pkmp-incoming button.act { flex:1; border:none; border-radius:20px; padding:11px; font-weight:900; font-size:13px; cursor:pointer; }
    #pkmp-accept { background:#2ecc71; color:#fff; }
    #pkmp-decline { background:#e74c3c; color:#fff; }
    #pkmp-toast { position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:99600;
        background:rgba(20,20,35,.95); border:1px solid #ffcb05; color:#fff; font-size:13px;
        padding:10px 20px; border-radius:20px; display:none; max-width:90%; text-align:center; font-family:'Be Vietnam Pro',sans-serif; }

    #pkmp-chatwin { right:16px; bottom:82px; width:280px; max-width:88vw; height:360px; display:none;
        background:#161a2e; border:2px solid #2ecc71; border-radius:16px; flex-direction:column; overflow:hidden;
        font-family:'Be Vietnam Pro',sans-serif; color:#fff; box-shadow:0 10px 30px rgba(0,0,0,.5); }
    #pkmp-chatwin.open { display:flex; }
    #pkmp-chat-head { padding:9px 12px; background:rgba(46,204,113,.1); display:flex; align-items:center; justify-content:space-between; }
    #pkmp-chat-head b { color:#2ecc71; font-size:13px; }
    #pkmp-chat-close { background:none; border:none; color:#aaa; font-size:16px; cursor:pointer; }
    #pkmp-chat-msgs { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:6px; }
    .pkmp-msg { max-width:80%; padding:7px 10px; border-radius:12px; font-size:12.5px; line-height:1.3; }
    .pkmp-msg.me { align-self:flex-end; background:#2ecc71; color:#04240f; }
    .pkmp-msg.them { align-self:flex-start; background:rgba(255,255,255,.08); color:#fff; }
    #pkmp-chat-input-row { display:flex; gap:6px; padding:8px; border-top:1px solid rgba(255,255,255,.08); }
    #pkmp-chat-input { flex:1; background:rgba(255,255,255,.06); border:1px solid #444; color:#fff; border-radius:16px; padding:7px 12px; font-size:12.5px; }
    #pkmp-chat-send { background:#2ecc71; border:none; color:#04240f; border-radius:16px; padding:7px 14px; font-weight:800; font-size:12px; cursor:pointer; }
    #pkmp-chat-send:disabled { background:#333; color:#777; cursor:default; }
    #pkmp-chat-remain { text-align:center; font-size:10.5px; color:#888; padding:2px 0 6px; }
  `;
  const styleTag = document.createElement("style");
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  document.body.insertAdjacentHTML("beforeend", `
    <button id="pkmp-btn" title="Đấu Online">⚔️<span class="dot"></span></button>
    <div id="pkmp-panel">
      <div id="pkmp-tabs">
        <div class="pkmp-tab active" data-tab="online">🌐 Online</div>
        <div class="pkmp-tab" data-tab="friends">👥 Bạn bè</div>
      </div>
      <div id="pkmp-head"><b>Đang mở: Online</b><button id="pkmp-random">Ghép ngẫu nhiên</button></div>
      <div id="pkmp-list"><div id="pkmp-empty">Đang tải...</div></div>
      <div id="pkmp-friend-list" style="display:none;"><div id="pkmp-empty-f">Đang tải...</div></div>
      <div id="pkmp-pager" style="display:none;">
        <button id="pkmp-prev">◀ Trước</button><span id="pkmp-pageinfo">1/1</span><button id="pkmp-next">Sau ▶</button>
      </div>
    </div>
    <div id="pkmp-msgpick">
      <div class="box">
        <h3>Gửi lời thách đấu tới <span id="pkmp-msg-target"></span></h3>
        <button class="pkmp-msgopt" data-msg="Sao không làm 1 trận cọ xát nhỉ?">Sao không làm 1 trận cọ xát nhỉ?</button>
        <button class="pkmp-msgopt" data-msg="Cùng thi đấu Pokémon nhé?">Cùng thi đấu Pokémon nhé?</button>
        <button class="pkmp-msgopt" data-msg="Mời bạn thi đấu với t...">Mời bạn thi đấu với t...</button>
        <button id="pkmp-msgcancel">Huỷ</button>
      </div>
    </div>
    <div id="pkmp-incoming">
      <div class="box">
        <div class="from" id="pkmp-inc-name"></div>
        <div class="msg" id="pkmp-inc-msg"></div>
        <div class="cd">Tự động từ chối sau <span id="pkmp-inc-cd">10</span>s</div>
        <div class="actions">
          <button class="act" id="pkmp-decline">Từ chối</button>
          <button class="act" id="pkmp-accept">Nhận đấu!</button>
        </div>
      </div>
    </div>
    <div id="pkmp-chatwin">
      <div id="pkmp-chat-head"><b id="pkmp-chat-name"></b><button id="pkmp-chat-close">✕</button></div>
      <div id="pkmp-chat-msgs"></div>
      <div id="pkmp-chat-remain"></div>
      <div id="pkmp-chat-input-row">
        <input id="pkmp-chat-input" maxlength="200" placeholder="Nhắn gì đó...">
        <button id="pkmp-chat-send">Gửi</button>
      </div>
    </div>
    <div id="pkmp-toast"></div>
  `);

  const P = window.PkmPresence;
  const myId = P.getPlayerId();
  const myClass = P.getClassName();

  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById("pkmp-toast");
    el.textContent = msg; el.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = "none"; }, 3500);
  }

  const btn = document.getElementById("pkmp-btn");
  const panel = document.getElementById("pkmp-panel");
  let panelOpen = false;
  let activeTab = "online";
  let onlinePage = 0;
  let userMap = new Map();     // playerId -> user (từ presence:delta)
  let friendsData = { list: {}, incoming: {}, outgoing: {} };
  let friendsLoaded = false;

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll(".pkmp-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    document.getElementById("pkmp-list").style.display = tab === "online" ? "block" : "none";
    document.getElementById("pkmp-friend-list").style.display = tab === "friends" ? "block" : "none";
    document.getElementById("pkmp-pager").style.display = tab === "online" ? "flex" : "none";
    document.getElementById("pkmp-head").querySelector("b").textContent = tab === "online" ? "Đang mở: Online" : "Đang mở: Bạn bè";
    document.getElementById("pkmp-random").style.display = tab === "online" ? "inline-block" : "none";
    if (tab === "friends") loadFriendsAndRender();
    else doRenderOnline();
  }
  document.querySelectorAll(".pkmp-tab").forEach(t => t.onclick = () => switchTab(t.dataset.tab));

  btn.onclick = () => {
    panelOpen = !panelOpen;
    panel.classList.toggle("open", panelOpen);
    if (panelOpen) { P.openPanel(); refreshOnlineList(); if (activeTab === "friends") loadFriendsAndRender(); }
    else P.closePanel();
  };

  function refreshOnlineList() { P.listOnline("all", data => { userMap = new Map(data.users.map(u => [u.playerId, u])); onlinePage = 0; doRenderOnline(); }); }

  function statusLabel(status) {
    if (status === "idle") return { text: "Rảnh", cls: "idle" };
    if (status === "searching") return { text: "Đang tìm trận", cls: "searching" };
    if (status === "busy") return { text: "Đang bận", cls: "busy" };
    if (status === "in_match") return { text: "Đang đấu", cls: "in_match" };
    return { text: "Offline", cls: "offline" };
  }

  /* ---------- TAB ONLINE: sắp bạn bè > cùng lớp > khác, phân trang 10/trang ---------- */
  function doRenderOnline() {
    const others = [...userMap.values()].filter(u => u.playerId !== myId && u.status === "idle");
    const listEl = document.getElementById("pkmp-list");
    const pagerEl = document.getElementById("pkmp-pager");
    if (others.length === 0) { listEl.innerHTML = '<div id="pkmp-empty">Chưa có ai khác online.</div>'; pagerEl.style.display = "none"; return; }

    const isFriend = id => !!friendsData.list[id];
    others.sort((a, b) => {
      const fa = isFriend(a.playerId) ? 0 : 1, fb = isFriend(b.playerId) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      const sa = a.className === myClass ? 0 : 1, sb = b.className === myClass ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const order = { idle: 0, searching: 1, busy: 2, in_match: 3 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return (a.name || "").localeCompare(b.name || "");
    });

    const totalPages = Math.max(1, Math.ceil(others.length / PAGE_SIZE));
    onlinePage = Math.min(onlinePage, totalPages - 1);
    const pageItems = others.slice(onlinePage * PAGE_SIZE, onlinePage * PAGE_SIZE + PAGE_SIZE);

    let html = ""; let lastGroup = null;
    pageItems.forEach(u => {
      const group = isFriend(u.playerId) ? "⭐ Bạn bè" : (u.className === myClass ? "👥 Cùng lớp" : (u.className ? `Lớp ${u.className}` : "Chưa rõ lớp"));
      if (group !== lastGroup) { html += `<div class="pkmp-group">${group}</div>`; lastGroup = group; }
      const st = statusLabel(u.status);
      const already = isFriend(u.playerId) || friendsData.outgoing[u.playerId] || friendsData.incoming[u.playerId];
      html += `
        <div class="pkmp-row">
          <div><div class="nm">${u.name}</div><div class="cl">${u.className ? "Lớp " + u.className : ""}</div></div>
          <span class="pkmp-badge ${st.cls}">${st.text}</span>
          <div class="pkmp-btnrow">
            ${u.status === "idle" ? `<button class="pkmp-chal" data-id="${u.playerId}" data-name="${u.name}">Thách đấu</button>` : `<button class="pkmp-chal" disabled>Thách đấu</button>`}
            ${!already ? `<button class="pkmp-addfriend" data-id="${u.playerId}" data-name="${u.name}" data-cl="${u.className || ""}">+Bạn</button>` : ""}
          </div>
        </div>`;
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll(".pkmp-chal[data-id]").forEach(b => b.onclick = () => openMsgPicker(b.dataset.id, b.dataset.name));
    listEl.querySelectorAll(".pkmp-addfriend").forEach(b => b.onclick = async () => {
      b.disabled = true;
      await window.PkmFriends.sendRequest(b.dataset.id, b.dataset.name, b.dataset.cl || null);
      toast(`Đã gửi lời mời kết bạn tới ${b.dataset.name}`);
      friendsData.outgoing[b.dataset.id] = { name: b.dataset.name, className: b.dataset.cl || null };
    });

    pagerEl.style.display = "flex";
    document.getElementById("pkmp-pageinfo").textContent = `${onlinePage + 1}/${totalPages}`;
    document.getElementById("pkmp-prev").disabled = onlinePage === 0;
    document.getElementById("pkmp-next").disabled = onlinePage >= totalPages - 1;
  }
  document.getElementById("pkmp-prev").onclick = () => { onlinePage--; doRenderOnline(); };
  document.getElementById("pkmp-next").onclick = () => { onlinePage++; doRenderOnline(); };

  P.on("presenceDelta", d => {
    if (d.removed) userMap.delete(d.playerId); else userMap.set(d.playerId, d);
    const dot = document.querySelector("#pkmp-btn .dot");
    dot.classList.toggle("show", [...userMap.values()].some(u => u.playerId !== myId && u.status === "idle"));
    if (panelOpen && activeTab === "online") doRenderOnline();
  });

  /* ---------- TAB BẠN BÈ ---------- */
  async function loadFriendsAndRender() {
    const listEl = document.getElementById("pkmp-friend-list");
    listEl.innerHTML = '<div id="pkmp-empty-f">Đang tải...</div>';
    try {
      friendsData = await window.PkmFriends.load();
      friendsLoaded = true;
    } catch (e) {
      listEl.innerHTML = '<div id="pkmp-empty-f">Không tải được danh sách bạn bè.</div>';
      return;
    }
    renderFriendsTab();
  }

  function renderFriendsTab() {
    const listEl = document.getElementById("pkmp-friend-list");
    const incoming = Object.entries(friendsData.incoming || {});
    const friends = Object.entries(friendsData.list || {});

    if (incoming.length === 0 && friends.length === 0) {
      listEl.innerHTML = '<div id="pkmp-empty-f">Chưa có bạn bè nào — sang tab Online để kết bạn nhé!</div>';
      return;
    }

    let html = "";
    if (incoming.length) {
      html += `<div class="pkmp-group">📩 Lời mời kết bạn</div>`;
      incoming.forEach(([id, info]) => {
        html += `
          <div class="pkmp-row pkmp-reqrow">
            <div><div class="nm">${info.name}</div><div class="cl">${info.className ? "Lớp " + info.className : ""}</div></div>
            <div class="pkmp-req-actions">
              <button class="pkmp-req-ok" data-id="${id}" data-name="${info.name}" data-cl="${info.className || ""}">Đồng ý</button>
              <button class="pkmp-req-no" data-id="${id}">Từ chối</button>
            </div>
          </div>`;
      });
    }
    if (friends.length) {
      html += `<div class="pkmp-group">⭐ Bạn bè (${friends.length})</div>`;
      friends.forEach(([id, info]) => {
        const online = userMap.get(id);
        const st = statusLabel(online ? online.status : "offline");
        html += `
          <div class="pkmp-row">
            <div><div class="nm">${info.name}</div><div class="cl">${info.className ? "Lớp " + info.className : ""}</div></div>
            <span class="pkmp-badge ${st.cls}">${st.text}</span>
            <button class="pkmp-chatbtn" data-id="${id}" data-name="${info.name}" ${online ? "" : "disabled"}>Nhắn tin</button>
          </div>`;
      });
    }
    listEl.innerHTML = html;

    listEl.querySelectorAll(".pkmp-req-ok").forEach(b => b.onclick = async () => {
      await window.PkmFriends.accept(b.dataset.id, b.dataset.name, b.dataset.cl || null);
      toast(`Bạn và ${b.dataset.name} đã là bạn bè!`);
      loadFriendsAndRender();
    });
    listEl.querySelectorAll(".pkmp-req-no").forEach(b => b.onclick = async () => {
      await window.PkmFriends.decline(b.dataset.id);
      loadFriendsAndRender();
    });
    listEl.querySelectorAll(".pkmp-chatbtn:not(:disabled)").forEach(b => b.onclick = () => openChat(b.dataset.id, b.dataset.name));
  }

  P.on("friendNotify", d => {
    toast(d.kind === "accepted" ? `🎉 ${d.fromName} đã đồng ý kết bạn!` : `📩 ${d.fromName} vừa gửi lời mời kết bạn!`);
    if (panelOpen && activeTab === "friends") loadFriendsAndRender();
    friendsLoaded = false; // để lần mở tab tiếp theo tải lại cho chắc
  });

  /* ---------- NGẪU NHIÊN + THÁCH ĐẤU (giữ nguyên như trước) ---------- */
  document.getElementById("pkmp-random").onclick = () => { P.joinRandomQueue(); toast("⏳ Đang tìm đối thủ ngẫu nhiên..."); };
  P.on("queueTimeout", () => toast("Không tìm được đối thủ ngẫu nhiên trong 2 phút, thử lại nhé!"));

  let pickerTarget = null;
  function openMsgPicker(id, name) {
    pickerTarget = id;
    document.getElementById("pkmp-msg-target").textContent = name;
    document.getElementById("pkmp-msgpick").style.display = "flex";
  }
  document.querySelectorAll(".pkmp-msgopt").forEach(b => b.onclick = () => {
    P.sendChallenge(pickerTarget, b.dataset.msg);
    document.getElementById("pkmp-msgpick").style.display = "none";
  });
  document.getElementById("pkmp-msgcancel").onclick = () => { document.getElementById("pkmp-msgpick").style.display = "none"; };

  P.on("challengeSent", () => toast("📨 Đã gửi lời thách đấu, đang chờ phản hồi..."));
  P.on("challengeQueued", () => toast("📨 Bạn ấy đang bận — lời mời sẽ tự vào trận ngay khi rảnh!"));
  P.on("challengeDeclined", () => toast("😕 Lời mời của bạn không được phản hồi/bị từ chối."));
  P.on("challengeExpired", () => toast("Lời mời đã hết hạn giữ chỗ."));
  P.on("challengeCancelled", () => toast("Người mời đã rời đi."));
  P.on("challengeError", d => {
    const map = { busy: "Người này vừa bận mất rồi!", offline: "Người này không còn online.",
      already_pending: "Người này đang có 1 lời mời khác.", self_busy: "Bạn đang trong trận, không thể mời người khác.", too_fast: "Gửi lời mời quá nhanh, thử lại sau." };
    toast(map[d.reason] || "Không gửi được lời mời.");
  });
  P.on("challengeForced", d => toast(`✅ ${d.fromName} từng bị lỡ 1 lời mời nên tự động vào trận với bạn!`));

  let incCd = null;
  P.on("challengeIncoming", d => {
    document.getElementById("pkmp-inc-name").textContent = d.fromName;
    document.getElementById("pkmp-inc-msg").textContent = d.message ? `"${d.message}"` : "";
    document.getElementById("pkmp-incoming").style.display = "flex";
    let cd = 10;
    document.getElementById("pkmp-inc-cd").textContent = cd;
    clearInterval(incCd);
    incCd = setInterval(() => {
      cd--; document.getElementById("pkmp-inc-cd").textContent = Math.max(0, cd);
      if (cd <= 0) { clearInterval(incCd); document.getElementById("pkmp-incoming").style.display = "none"; }
    }, 1000);
    document.getElementById("pkmp-accept").onclick = () => { clearInterval(incCd); document.getElementById("pkmp-incoming").style.display = "none"; P.acceptChallenge(d.fromPlayerId); };
    document.getElementById("pkmp-decline").onclick = () => { clearInterval(incCd); document.getElementById("pkmp-incoming").style.display = "none"; P.declineChallenge(); };
  });

  P.on("matchFound", () => { if (!/pkm_battle_online\.html/.test(location.pathname)) window.location.href = "pkm_battle_online.html"; });
  P.on("matchCancelled", d => toast("Trận vừa bị huỷ: " + (d.reason === "team_select_timeout" ? "đối thủ chọn đội hình quá lâu" : "đối thủ đã rời đi")));
  P.on("replaced", () => toast("Tài khoản này vừa được mở ở một thiết bị/tab khác."));

  /* ---------- CHAT MINI-WINDOW (chỉ với bạn bè, tối đa 3 tin gửi/phiên) ---------- */
  const CHAT_LIMIT = 3;
  let currentChatId = null;
  const chatSentCount = {}; // playerId -> số tin ĐÃ GỬI phiên này (mirror để cập nhật UI ngay, server vẫn là nguồn thật)

  function openChat(id, name) {
    currentChatId = id;
    document.getElementById("pkmp-chat-name").textContent = name;
    document.getElementById("pkmp-chat-msgs").innerHTML = "";
    document.getElementById("pkmp-chatwin").classList.add("open");
    updateChatRemain();
  }
  document.getElementById("pkmp-chat-close").onclick = () => { document.getElementById("pkmp-chatwin").classList.remove("open"); currentChatId = null; };

  function appendChatMsg(text, mine) {
    const el = document.createElement("div");
    el.className = "pkmp-msg " + (mine ? "me" : "them");
    el.textContent = text;
    const box = document.getElementById("pkmp-chat-msgs");
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }
  function updateChatRemain() {
    const used = chatSentCount[currentChatId] || 0;
    const remain = Math.max(0, CHAT_LIMIT - used);
    document.getElementById("pkmp-chat-remain").textContent = `Còn ${remain}/${CHAT_LIMIT} tin gửi (phiên này)`;
    document.getElementById("pkmp-chat-send").disabled = remain <= 0;
    document.getElementById("pkmp-chat-input").disabled = remain <= 0;
  }

  document.getElementById("pkmp-chat-send").onclick = sendChatNow;
  document.getElementById("pkmp-chat-input").addEventListener("keydown", e => { if (e.key === "Enter") sendChatNow(); });
  function sendChatNow() {
    const input = document.getElementById("pkmp-chat-input");
    const text = input.value.trim();
    if (!text || !currentChatId) return;
    const used = chatSentCount[currentChatId] || 0;
    if (used >= CHAT_LIMIT) return;
    P.sendChat(currentChatId, text);
    appendChatMsg(text, true);
    input.value = "";
    chatSentCount[currentChatId] = used + 1;
    updateChatRemain();
  }

  P.on("chatMessage", d => {
    if (d.fromPlayerId !== currentChatId) {
      toast(`💬 ${d.fromName}: ${d.text}`);
      // Nếu chưa mở đúng cửa sổ chat với người này, mở luôn cho tiện (đã là bạn bè mới nhắn được)
      const info = friendsData.list[d.fromPlayerId];
      openChat(d.fromPlayerId, info ? info.name : d.fromName);
    }
    appendChatMsg(d.text, false);
  });
  P.on("chatSent", d => { /* đã tự cập nhật UI ngay khi bấm gửi, không cần làm gì thêm */ });
  P.on("chatError", d => {
    if (d.reason === "limit") toast("Bạn đã dùng hết 3 tin nhắn cho người này trong phiên này rồi.");
    else if (d.reason === "offline") toast("Bạn ấy vừa offline mất rồi.");
    else toast("Không gửi được tin nhắn.");
  });

  if (!P.getSocket()) P.connect(false);
})();