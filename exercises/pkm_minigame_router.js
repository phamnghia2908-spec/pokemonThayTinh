/**
 * ==========================================
 * PKM MINIGAME ROUTER — pkm_minigame_router.js
 * ==========================================
 * Điều phối các "minigame trả lời trắc nghiệm" (đua xe, bắn bóng, câu cá...)
 * dùng thay cho nút bấm A/B/C/D thường trong askMCQ() (all-shared.js) và
 * trong các dạng bài trắc nghiệm của pkm_quiz.js (Battle/Block).
 *
 * NẠP FILE NÀY (và các file game, vd pkm_minigame_race.js) TRƯỚC mọi script
 * dùng tới nó — tức trước all-orchestrator.js / pkm_battle.js / pkm_block.js.
 *
 * ------------------------------------------------------------------
 * CÁCH 1 GAME TỰ ĐĂNG KÝ (viết trong chính file game đó):
 *
 *   window.PkmMinigameRouter.register("race", runRaceGame, {
 *       minOptions: 2,      // số đáp án tối thiểu game này chơi được
 *       maxOptions: 5,      // số đáp án tối đa
 *       requiresImage: false, // true nếu game CHỈ chơi được khi đáp án có ảnh
 *   });
 *
 * ------------------------------------------------------------------
 * HỢP ĐỒNG (contract) MÀ MỌI GAME PHẢI TUÂN THỦ — hàm run(cfg):
 *
 *   run({ stage, options, correctValue, reveal, hasImages, onAnswer })
 *
 *     - stage        : phần tử DOM RỖNG, game tự innerHTML/vẽ vào đây.
 *     - options      : [{ value, label, imageUrl? }, ...] — 2 tới N đáp án.
 *     - correctValue : giá trị đúng, so khớp với options[i].value.
 *     - reveal       : true nếu học sinh đã sai đủ 2 lần (attempt >= 3) ->
 *                      game PHẢI làm nổi bật rõ ràng đáp án đúng (không bắt
 *                      buộc animation kiểu gì, miễn nhận ra được).
 *     - hasImages    : true nếu options có ảnh — game có thể tận dụng.
 *     - onAnswer(value, domEl?) : GỌI ĐÚNG 1 LẦN khi học sinh đã chọn xong
 *                      1 đáp án. domEl (tuỳ chọn) là phần tử đại diện cho lựa
 *                      chọn đó (để nơi gọi có thể gắn hiệu ứng đúng/sai lên).
 *                      Game KHÔNG tự chấm đúng/sai, KHÔNG tự hiện lời khen/
 *                      lỗi, KHÔNG tự gọi lại resolve gì thêm — toàn bộ phần
 *                      chấm + feedback + attempt/retry do nơi gọi (askMCQ)
 *                      xử lý y hệt như khi dùng nút bấm thường.
 * ------------------------------------------------------------------
 */

window.PkmMinigameRouter = {
  games: [], // [{ id, run, minOptions, maxOptions, requiresImage }]

  register(id, runFn, meta = {}) {
    this.games.push({
      id,
      run: runFn,
      minOptions: meta.minOptions ?? 2,
      maxOptions: meta.maxOptions ?? 4,
      requiresImage: meta.requiresImage ?? false,
    });
  },

  // Lọc ra các game CHƠI ĐƯỢC với đúng số lượng/đặc điểm của bộ options này
  _eligibleGames(options) {
    const n = options.length;
    const hasImage = options.some((o) => o.imageUrl);
    return this.games.filter(
      (g) =>
        n >= g.minOptions &&
        n <= g.maxOptions &&
        (!g.requiresImage || hasImage),
    );
  },

  // Cho nơi gọi (askMCQ, pkm_quiz.js) biết TRƯỚC có nên dùng minigame hay
  // fallback về nút bấm thường — không tốn công build DOM thử.
  hasSupportedGame(options) {
    return this._eligibleGames(options).length > 0;
  },

  // Chọn 1 game phù hợp rồi CHẠY LUÔN (vẽ vào cfg.stage). Trả về true nếu đã
  // có game chạy, false nếu không có game nào hợp — nơi gọi tự fallback.
  //
  // Luân phiên có random: KHÔNG cho ra đúng 1 game 2 lần liên tiếp (nếu có
  // >1 lựa chọn hợp lệ) để tránh lặp gây nhàm — nhưng vẫn ngẫu nhiên trong
  // số còn lại, không phải xoay vòng cứng nhắc theo thứ tự cố định.
  play(cfg) {
    const eligible = this._eligibleGames(cfg.options);
    if (eligible.length === 0) return false;

    const lastId = sessionStorage.getItem("pkl_last_minigame");
    const candidates =
      eligible.length > 1 ? eligible.filter((g) => g.id !== lastId) : eligible;
    const pool = candidates.length > 0 ? candidates : eligible;

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    sessionStorage.setItem("pkl_last_minigame", chosen.id);

    chosen.run(cfg);
    return true;
  },
};
