/**
 * ==========================================================
 * PKM BATTLE NET v3 — chỉ lo phần TRONG TRẬN
 * ==========================================================
 * Dùng chung 1 socket với window.PkmPresence (include file đó TRƯỚC).
 *
 * SỬA LỖI QUAN TRỌNG so với bản trước: "trả lời đúng mà không ra chưởng"
 * — nguyên nhân là lúc trả lời, code lấy turnCounter từ `latestState`
 * (đã có thể bị ghi đè sang lượt MỚI nếu người chơi trả lời chậm, lượt cũ
 * tự hết hạn), nên câu trả lời bị GẮN NHẦM sang lượt mới. Giờ turnCounter
 * được CHỐT NGAY LÚC HỎI (`askedForTurn`), không đọc lại lúc trả lời.
 * Nếu lúc trả lời phát hiện lượt đã trôi qua (so với lúc hỏi) -> coi câu
 * trả lời đó đã LỖI THỜI, không gửi lên server nữa (server cũng sẽ tự từ
 * chối vì turnCounter không khớp, nhưng mình chủ động bỏ qua cho sạch).
 *
 * THAY ĐỔI THỨ 2: KHÔNG tự động hỏi câu mới ngay khi có state:update nữa.
 * Việc hỏi câu mới giờ do pkm_battle_online.js CHỦ ĐỘNG gọi
 * `readyForNextQuestion()` sau khi đã hiện xong thông báo kết quả lượt
 * (round:result) VÀ phát xong animation ra chưởng — tránh tình trạng vừa
 * làm quiz câu mới vừa thấy chưởng của lượt cũ bay ra.
 * ==========================================================
 */

window.PkmBattleNet = (() => {
  let roomId = sessionStorage.getItem("pkm_net_room_id") || null;
  let unitsAllowed = 0;
  let opponentId = null;
  let latestState = null;
  let lastRoundResult = null;
  let myTeamFinal = null;
  let oppTeamFinal = null;
  let stopped = false;
  let questionActive = false;
  let askedForTurn = null; // turnCounter đã CHỐT lúc hỏi câu hiện tại (không đọc lại latestState khi trả lời)

  const listeners = {
    matchFound: [], battleStart: [], stateUpdate: [], battleEnd: [], roundResult: [],
    opponentDisconnected: [], opponentReconnected: [], answered: [], needTeamSelect: [],
  };
  function on(ev, cb) { if (listeners[ev]) listeners[ev].push(cb); }
  function emit(ev, data) { (listeners[ev] || []).forEach(cb => cb(data)); }

  function socket() { return window.PkmPresence && window.PkmPresence.getSocket(); }

  function wire() {
    const s = socket();
    if (!s || s._pkmBattleWired) return;
    s._pkmBattleWired = true;

    s.on("match:found", d => { roomId = d.roomId; unitsAllowed = d.unitsAllowed; opponentId = d.opponentId; emit("matchFound", d); });
    s.on("battle:start", d => { myTeamFinal = d.myTeam; oppTeamFinal = d.oppTeam; emit("battleStart", d); });
    s.on("round:result", d => { lastRoundResult = d; emit("roundResult", d); });

    // KHÔNG tự hỏi câu mới ở đây nữa — pkm_battle_online.js gọi readyForNextQuestion()
    // sau khi hiện thông báo + phát xong animation.
    s.on("state:update", d => { latestState = d; emit("stateUpdate", d); });

    s.on("battle:end", d => { stopped = true; sessionStorage.removeItem("pkm_net_room_id"); emit("battleEnd", d); });

    s.on("room:rejoin_ok", d => {
      unitsAllowed = d.unitsAllowed;
      if (d.phase === "select") {
        opponentId = d.opponentId;
        emit("needTeamSelect", d);
        return;
      }
      latestState = d; stopped = false;
      emit("stateUpdate", d); // pkm_battle_online.js tự gọi readyForNextQuestion() sau khi vẽ xong
    });
    s.on("room:rejoin_failed", () => { sessionStorage.removeItem("pkm_net_room_id"); roomId = null; });
    s.on("opponent:disconnected", () => emit("opponentDisconnected"));
    s.on("opponent:reconnected", () => emit("opponentReconnected"));
  }

  function connect() {
    if (!window.PkmPresence) { console.error("Thiếu pkm_presence.js!"); return null; }
    const s = window.PkmPresence.connect();
    wire();
    if (s.connected) tryRejoinIfNeeded();
    else s.once("connect", tryRejoinIfNeeded);
    return s;
  }
  function tryRejoinIfNeeded() {
    const s = socket();
    const savedRoom = sessionStorage.getItem("pkm_net_room_id");
    if (s && savedRoom) s.emit("room:rejoin", { roomId: savedRoom, playerId: window.PkmPresence.getPlayerId() });
  }

  function submitTeam(team) {
    const s = socket();
    if (!s || !roomId) return;
    s.emit("team:submit", { roomId, team });
  }

  // turnCounter LUÔN là giá trị đã chốt lúc hỏi (askedForTurn khi gọi từ
  // askNextRoundQuestion), KHÔNG đọc lại latestState.turnCounter ở đây.
  function submitAnswer(correct, turnCounter) {
    const s = socket();
    if (!s || !roomId) return;
    s.emit("answer:submit", { roomId, correct, turnCounter });
  }

  function isMyTurnPrimary() {
    return !!(latestState && window.PkmPresence && latestState.primaryId === window.PkmPresence.getPlayerId());
  }
  function getMyPlayerId() { return window.PkmPresence ? window.PkmPresence.getPlayerId() : null; }
  function getState() { return latestState; }
  function getLastRoundResult() { return lastRoundResult; }
  function getTeams() { return { myTeam: myTeamFinal, oppTeam: oppTeamFinal }; }
  function getRoomInfo() { return { roomId, unitsAllowed, opponentId }; }

  // Rời trận chủ động (khác rớt mạng) — gọi xong thì tự dọn session, không
  // tự trừ điểm ở đây (trừ KN/DV là việc của pkm_battle_online.js, vì điểm
  // số nằm ở PkmScore phía client, server không giữ điểm).
  function leaveBattle() {
    const s = socket();
    if (s && roomId) s.emit("battle:leave");
    stopped = true;
    sessionStorage.removeItem("pkm_net_room_id");
  }

  // Gọi hàm này mỗi khi THỰC SỰ sẵn sàng hỏi câu tiếp theo (sau khi đã hiện
  // xong thông báo kết quả lượt trước + phát xong animation ra chưởng).
  function readyForNextQuestion() {
    if (stopped || questionActive || !latestState) return;
    if (!window.QuizManager) return;

    const primary = isMyTurnPrimary();
    const myTurn = latestState.turnCounter; // CHỐT NGAY BÂY GIỜ — không đọc lại khi trả lời
    const labelEl = document.getElementById("quiz-role-label");
    if (labelEl) {
      labelEl.textContent = primary
        ? "⚔️ Câu hỏi CHÍNH — trả lời đúng để ra chưởng!"
        : "📖 Câu hỏi PHỤ — luyện tập, tính KN/DV, không ảnh hưởng đòn đánh lượt này";
      labelEl.className = primary ? "quiz-role-primary" : "quiz-role-secondary";
    }

    questionActive = true;
    askedForTurn = myTurn;

    window.QuizManager.ask((isCorrect) => {
      // Lượt đã trôi qua trong lúc đang trả lời (bị 30s cắt ngang) ->
      // câu trả lời này LỖI THỜI, không gửi lên nữa (server cũng sẽ từ
      // chối vì turnCounter lệch, nhưng chủ động bỏ qua cho sạch).
      const stillValid = questionActive && askedForTurn === myTurn && latestState && latestState.turnCounter === myTurn;
      questionActive = false;

      if (window.PkmScore) window.PkmScore.recordAnswer(isCorrect); // vẫn tính KN/DV dù trễ hay không

      if (stillValid && primary) submitAnswer(isCorrect, myTurn);
      emit("answered", { correct: isCorrect, wasPrimary: primary, stale: !stillValid });
    });
  }

  // Giữ tên cũ để không phải sửa chỗ khác lỡ còn gọi — giờ chỉ là alias.
  function askNextRoundQuestion() { readyForNextQuestion(); }

  return {
    connect, submitTeam, submitAnswer, isMyTurnPrimary, leaveBattle,
    getMyPlayerId, getState, getLastRoundResult, getTeams, getRoomInfo,
    readyForNextQuestion, askNextRoundQuestion, on,
  };
})();