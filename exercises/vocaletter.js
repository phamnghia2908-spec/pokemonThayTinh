// ===== VocaLetter – Full JS =====
import { startTalking, stopTalking } from "./pikachuTalk.js";

// ===== Config =====


const COL = {
  lessonName: 1,   // B
  vocab: 2,        // C
  topic: 5,        // G
  meaning: 24      // Y
};

// ===== State for review =====
let currentReviewList = [];
let reviewTimer = null;

// ===== Boot =====
document.addEventListener("DOMContentLoaded", () => {
  const runBtn = document.getElementById("runBtn");
  const reviewBtn = document.getElementById("reviewBtn");
  const reviewOnlyUnchecked = document.getElementById("reviewOnlyUnchecked"); // optional checkbox if present

  runBtn.onclick = runVocaLetter;
  if (reviewBtn) {
    reviewBtn.onclick = () => {
      // Bắt đầu ôn tập
      startReview(reviewOnlyUnchecked?.checked === true);

      // Gọi thử Pikachu nói câu mở đầu (đảm bảo TTS được kích hoạt bởi thao tác click)
      speakWithPikachu("reviewing!", "en-US");
    };
  }

});

// ===== Main flow =====
async function runVocaLetter() {
  const statusEl = document.getElementById("status");
  const resultEl = document.getElementById("vocaResult");
  const letterRaw = document.getElementById("letterInput").value.trim();

  resultEl.innerHTML = "";
  setStatus("Đang tải dữ liệu...", statusEl);

  // Validate letter
  if (!letterRaw || !/^[a-z]$/i.test(letterRaw)) {
    setStatus("Nhập một chữ cái A–Z.", statusEl);
    resultEl.innerHTML = `<p class="muted">Ví dụ: nhập B để xem các từ đã học bắt đầu bằng B.</p>`;
    return;
  }
  const letter = letterRaw.toUpperCase();

  try {
    const maxLessonCode = await getMaxLessonCode();
    const rows = await fetchGVizRows(SHEET_URL);
    const words = buildWords(rows, maxLessonCode);

    const filtered = words.filter(it => it.word.charAt(0).toUpperCase() === letter);

    // Lưu danh sách để ôn tập
    currentReviewList = filtered;

    renderTable(letter, filtered, resultEl);
    setStatus(`Sẵn sàng.`, statusEl);
  } catch (err) {
    console.error("❌ VocaLetter error:", err);
    setStatus("Không thể tải dữ liệu.", statusEl);
    resultEl.innerHTML = `<p class="muted">Kiểm tra kết nối mạng hoặc đường dẫn Google Sheet.</p>`;
  }
}

// ===== Data fetchers =====
async function fetchGVizRows(url) {
  const res = await fetch(url, { cache: "no-store" });
  return await res.json(); // Nhận trực tiếp mảng dữ liệu từ Exec
}

async function getMaxLessonCode() {
  const trainerClass = localStorage.getItem("trainerClass")?.trim() || "";
  try {
    const res = await fetch(SHEET_BAI_HOC, { cache: "no-store" });
    const rows = await res.json(); // Nhận mảng trực tiếp

    const baiList = rows
      .map(r => {
        const lop = r[0]?.toString().trim(); // Cột A
        const bai = r[2]?.toString().trim(); // Cột C
        return lop === trainerClass && bai ? parseInt(bai, 10) : null;
      })
      .filter(v => typeof v === "number");

    if (baiList.length === 0) return Number.MAX_SAFE_INTEGER;
    return Math.max(...baiList);
  } catch (e) {
    console.warn("⚠️ getMaxLessonCode failed, bypass limit.", e);
    return Number.MAX_SAFE_INTEGER;
  }
}

// ===== Builders =====
// GOM theo token đơn: meanings, phrases, lessons dạng Set; sort theo unitNum nhỏ nhất
function buildWords(rows, maxLessonCode) {
  const wordMap = new Map();

  for (const r of rows) {
    // Thay đổi ở đây: r[COL.index] thay vì r.c[COL.index].v
    const lessonName = safeStr(r[COL.lessonName]);
    const unitNum = normalizeUnitId(lessonName);
    const vocabRaw = safeStr(r[COL.vocab]);
    const meaning = safeStr(r[COL.meaning]);

    if (!lessonName || !vocabRaw || !meaning) continue;
    if (maxLessonCode && unitNum > maxLessonCode) continue;

    // ... phần logic tách tokens bên dưới giữ nguyên ...
    const tokens = vocabRaw.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
        const word = token.toLowerCase().trim();
        if (!word) continue;
        if (!wordMap.has(word)) {
          wordMap.set(word, { word, meanings: new Set(), phrases: new Set(), lessons: new Set(), unitNum });
        }
        const entry = wordMap.get(word);
        entry.meanings.add(meaning);
        entry.phrases.add(vocabRaw);
        entry.lessons.add(lessonName);
        entry.unitNum = Math.min(entry.unitNum, unitNum);
    }
  }
  // ... phần return giữ nguyên ...
  return [...wordMap.values()]
    .map(it => ({
      word: it.word,
      meanings: [...it.meanings],
      phrases: [...dedupeStringsCaseInsensitive([...it.phrases])],
      lessons: [...dedupeStringsCaseInsensitive([...it.lessons])],
      unitNum: it.unitNum
    }))
    .sort((a, b) => a.unitNum - b.unitNum);
}

// ===== Renderers =====
function renderTable(letter, list, container) {
  if (list.length === 0) {
    container.innerHTML = `<p>📭 Không có từ nào bắt đầu bằng chữ <b>${letter}</b>.</p>`;
    return;
  }

  let html = `<p class="count-line">📊 Có <b>${list.length}</b> từ bắt đầu bằng chữ <b>${letter}</b>.</p>`;
  html += `<table>
    <thead>
      <tr><th>Từ</th><th>Nghĩa</th><th>Cụm gốc</th><th>Bài học</th><th>Thuộc?</th></tr>
    </thead>
    <tbody>`;

  list.forEach(it => {
    const key = tickKey(it.word);
    const checked = localStorage.getItem(key) === "1" ? "checked" : "";
    // Hiển thị theo yêu cầu: token (phrase) — vẫn giữ nghĩa gốc
    const displayWord = `${escapeHTML(it.word)} ${it.phrases.length ? `(${escapeHTML(it.phrases[0])})` : ""}`;
    html += `<tr>
      <td>${displayWord}</td>
      <td>${escapeHTML(it.meanings.join("; "))}</td>
      <td>${escapeHTML(it.phrases.join(" | "))}</td>
      <td>${escapeHTML(it.lessons.join(" | "))}</td>
      <td><input type="checkbox" class="tickBox" data-word="${escapeAttr(it.word)}" ${checked}></td>
    </tr>`;
  });

  html += `</tbody></table>
  <div id="tickSummary" class="count-line"></div>
  <div style="margin-top:10px;" class="muted">Tip: Tick để lưu trạng thái đã thuộc/chưa thuộc (lưu trong trình duyệt).</div>`;
  container.innerHTML = html;

  // Sự kiện tick
  container.querySelectorAll(".tickBox").forEach(box => {
    box.addEventListener("change", () => {
      const word = box.dataset.word;
      localStorage.setItem(tickKey(word), box.checked ? "1" : "0");
      updateTickSummary(container);
    });
  });

  updateTickSummary(container);
}

function updateTickSummary(container) {
  const boxes = container.querySelectorAll(".tickBox");
  let learned = 0;
  let notLearned = 0;
  boxes.forEach(b => {
    if (b.checked) learned++;
    else notLearned++;
  });
  const summary = container.querySelector("#tickSummary");
  summary.textContent = `✅ Đã thuộc: ${learned} | ❌ Chưa thuộc: ${notLearned}`;
}

// ===== Review (Ôn tập 6s/từ, gợi ý + ảnh) =====
// Nói một câu đơn và gọi callback khi kết thúc


function speakWithPikachu(text, lang = "en-US") {
  if (!text) return;
  const sentences = text.split(/[.?!]/).map(s => s.trim()).filter(Boolean);
  let i = 0;

  function speakNext() {
    if (i >= sentences.length) return;
    const utter = new SpeechSynthesisUtterance(sentences[i]);
    utter.lang = lang;
    utter.onstart = startTalking; // bật hiệu ứng Pikachu
    utter.onend = () => {
      stopTalking();              // tắt hiệu ứng Pikachu
      i++;
      if (i < sentences.length) {
        setTimeout(speakNext, 500); // nghỉ 0.5s rồi đọc câu tiếp
      }
    };
    speechSynthesis.speak(utter);
  }

  speechSynthesis.cancel();
  speakNext();
}

function startReview(onlyUnchecked = false) {
  if (!currentReviewList || currentReviewList.length === 0) {
    alert("Hãy thống kê trước rồi mới ôn tập!");
    return;
  }

  const reviewList = onlyUnchecked
    ? currentReviewList.filter(it => localStorage.getItem(tickKey(it.word)) !== "1")
    : currentReviewList;

  if (reviewList.length === 0) {
    alert("Không có từ nào để ôn tập theo lựa chọn hiện tại.");
    return;
  }

  let idx = 0;
  const area = document.getElementById("reviewArea");
  if (!area) {
    console.warn("⚠️ reviewArea không tồn tại trong HTML.");
    return;
  }

  if (reviewTimer) clearTimeout(reviewTimer);

  async function showWord() {
    if (idx >= reviewList.length) {
      area.innerHTML = `<p class="count-line">🎉 Hoàn thành một vòng ôn tập!</p>`;
      return;
    }

    const item = reviewList[idx];

    // nếu chưa có ảnh thì fetch
    // nếu chưa có ảnh thì fetch từ imageCache2
    if (!item.imgUrl) {
      try {
        const imageData = await imageCache.getImage(item.word);
        item.imgUrl = imageData?.url || null;
        if (imageData) {
          console.log(`📸 Ảnh từ ${imageData.source} cho: ${item.word}`);
        }
      } catch (e) {
        console.warn(`⚠️ Không lấy được ảnh cho ${item.word}:`, e);
        item.imgUrl = null;
      }
    }

    const hint = buildHint(item.word);
    const imgUrl = item.imgUrl;

    area.innerHTML = `
      <div style="font-size:22px; margin-bottom:10px;">🔤 ${hint}</div>
      <div style="margin-bottom:10px;" class="muted">❓ What is it?</div>
      ${imgUrl ? `<img src="${imgUrl}" alt="${escapeAttr(item.word)}" style="width:300px;height:200px;object-fit:contain;border-radius:8px;">` : `<div class="muted">Không có minh hoạ</div>`}
    `;

    speakWithPikachu("What is it?", "en-US");

    // preload ảnh cho từ tiếp theo
    // preload ảnh cho từ tiếp theo
    if (idx + 1 < reviewList.length && !reviewList[idx + 1].imgUrl) {
      imageCache.getImage(reviewList[idx + 1].word).then(imageData => {
        if (imageData) {
          reviewList[idx + 1].imgUrl = imageData.url;
        }
      });
    }

    setTimeout(() => {
      area.innerHTML = `
        <div style="font-size:22px; margin-bottom:10px;">🔤 ${hint}</div>
        <div style="margin-bottom:10px;">✅ Answer: <b>${escapeHTML(item.word)}</b></div>
        ${imgUrl ? `<img src="${imgUrl}" alt="${escapeAttr(item.word)}" style="width:300px;height:200px;object-fit:contain;border-radius:8px;">` : `<div class="muted">Không có minh hoạ</div>`}
      `;
      speakWithPikachu(item.word, "en-US");

      idx++;
      reviewTimer = setTimeout(showWord, 2000);
    }, 6000);
  }


  showWord();
}





// ===== Image fetch (Pixabay) =====


// ===== Hint builder: "cat" → "c _ _"
function buildHint(word) {
  const tokens = word.split(/\s+/).filter(Boolean);
  return tokens.map(tok => {
    const first = tok.charAt(0);
    const rest = tok.slice(1).replace(/./g, "_");
    return `${first} ${rest.split("").join(" ")}`;
  }).join("   ");
}

// ===== Utils =====
function setStatus(msg, el) { if (el) el.textContent = msg || ""; }
function safeStr(v) { return v == null ? "" : String(v); }
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function dedupeStringsCaseInsensitive(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.toString().trim().split("-");
  if (parts.length < 3) return 0;
  const [clsStr, lessonStr, partStr] = parts;
  const cls = parseInt(clsStr, 10);
  const lesson = parseInt(lessonStr, 10);
  const part = parseInt(partStr, 10);
  if (Number.isNaN(cls) || Number.isNaN(lesson) || Number.isNaN(part)) return 0;
  return cls * 1000 + lesson * 10 + part;
}
function tickKey(word) {
  if (!word) return "voca_empty";
  return "voca_" + word.toLowerCase().trim();
}
// ===== Clear image cache =====
function clearImageCache() {
  if (window.imageCache) {
    imageCache.clearCache();
    alert("🧹 Đã xóa cache ảnh");
  }
}
