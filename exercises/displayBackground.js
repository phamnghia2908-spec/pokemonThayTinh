// displayBackground.js

import { updateBackground } from './background.js';

// Lắng nghe sự kiện toàn cục để cập nhật background
window.addEventListener("updateBackgroundRequested", () => {
  updateBackground();
});

// Nếu cần, bạn cũng có thể tự cập nhật background theo khoảng thời gian định sẵn,
// ví dụ mỗi 30 giây cập nhật background:
setInterval(() => {
  updateBackground();
}, 30000);
