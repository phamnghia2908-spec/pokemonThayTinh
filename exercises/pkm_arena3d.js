/**
 * =============================================
 * PKM ARENA BACKGROUND — chỉ lo 1 việc:
 * Random 1 ảnh nền GitHub cho mỗi trận, PRELOAD
 * xong xuôi rồi mới set vào #battle-arena, đảm
 * bảo trận đấu không bắt đầu trước khi ảnh sẵn sàng.
 * =============================================
 * CÁCH DÙNG: thêm <script src="pkm_arena3d.js"></script>
 * vào pkm_battle.html, TRƯỚC pkm_battle.js.
 * Trong pkm_battle.js, ở đầu init(), thêm:
 *     if (window.ArenaReady) await window.ArenaReady;
 * để chờ nền load xong mới render/bắt đầu trận.
 * =============================================
 */

window.ArenaBuilder = (function () {

    // ── DANH SÁCH ẢNH NỀN THẬT ──
    const BG_IMAGES = Array.from({ length: 8 }, (_, i) =>
        `https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/pm%20(${i + 1}).jpg`
    );

    // Preload 1 ảnh, resolve khi load xong HOẶC lỗi (không treo trận đấu)
    function preloadImage(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        });
    }

    // ── MAIN: random 1 ảnh MỚI mỗi lần gọi (mỗi trận), preload rồi mới set ──
    async function build() {
        const arena = document.getElementById('battle-arena');
        if (!arena) return;

        // Random mới hoàn toàn mỗi lần — KHÔNG lưu sessionStorage,
        // để mỗi trận là 1 background khác nhau.
        const bgIdx = Math.floor(Math.random() * BG_IMAGES.length);
        const bgUrl = BG_IMAGES[bgIdx];

        const ok = await preloadImage(bgUrl);

        arena.style.backgroundImage = `url('${ok ? bgUrl : BG_IMAGES[0]}')`;
        arena.style.backgroundSize = 'cover';
        arena.style.backgroundPosition = 'center';
        document.body.style.background = '#000';

        window.ArenaBgUrl = ok ? bgUrl : BG_IMAGES[0];
    }

    // Expose 1 Promise DUY NHẤT cho pkm_battle.js await trước khi vào trận
    window.ArenaReady = (document.readyState === 'loading')
        ? new Promise(resolve => document.addEventListener('DOMContentLoaded', () => build().then(resolve)))
        : build();

    return { build, BG_IMAGES };
})();