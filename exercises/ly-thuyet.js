// Cấu hình: URL sheet 3 (gviz JSON)
const sheetUrl =
  "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?sheet=3&tqx=out:json";

/* ========= Helpers ========= */

// Chuỗi là số “thuần” (chỉ số, dấu ., ,, dấu âm)
function isNumericString(str) {
  if (typeof str !== "string") return false;
  const s = str.trim();
  if (!s) return false;
  return /^-?\d[\d\s.,]*$/.test(s);
}

// Lấy giá trị cell: luôn trả về chuỗi
function getCellValue(cell) {
  if (!cell) return "";
  if (typeof cell?.v === "number") return String(cell.v); // số → chuỗi số
  const raw = cell.f ?? cell.v;
  return raw == null ? "" : String(raw).trim();
}

// Nhận diện URL
function looksLikeUrl(str) {
  return typeof str === "string" && /^https?:\/\//i.test(str.trim());
}

// Nhận diện URL ảnh
function isImageUrl(str) {
  if (!looksLikeUrl(str)) return false;
  const s = str.trim();
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(s) ||
    /drive\.google\.com\/|googleusercontent\.com\//i.test(s);
}

// Chuẩn hóa URL ảnh Google Drive
function normalizeImageUrl(url) {
  if (!url) return url;
  let u = String(url).trim();

  // Nếu là công thức HYPERLINK("URL","Text")
  const hyperlinkMatch = u.match(/HYPERLINK\(\s*"([^"]+)"\s*,\s*"[^"]*"\s*\)/i);
  if (hyperlinkMatch) {
    u = hyperlinkMatch[1].trim();
  }

  // /file/d/{ID}/view
  const fileMatch = u.match(/drive\.google\.com\/file\/d\/([^/]+)\/view/i);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
  }

  // open?id={ID}
  const idMatch = u.match(/drive\.google\.com\/.*[?&]id=([^&]+)/i);
  if (idMatch) {
    return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
  }

  // uc?export=download&id={ID}
  const downloadMatch = u.match(/drive\.google\.com\/uc\?export=download&id=([^&]+)/i);
  if (downloadMatch) {
    return `https://drive.google.com/uc?export=view&id=${downloadMatch[1]}`;
  }

  return u;
}

function makeDrivePreviewIframe(url) {
  const fileMatch = String(url).trim().match(/drive\.google\.com\/file\/d\/([^/]+)\/view/i);
  const idMatch = String(url).trim().match(/drive\.google\.com\/.*[?&]id=([^&]+)/i);
  const id = fileMatch?.[1] || idMatch?.[1] || "";
  if (!id) return null;

  const iframe = document.createElement("iframe");
  iframe.src = `https://drive.google.com/file/d/${id}/preview`;
  iframe.style.width = "100%";
  iframe.style.height = "360px";
  iframe.style.border = "none";
  iframe.allow = "autoplay";
  return iframe;
}

// Tách URL trong text
function extractUrlsAndText(cellValue) {
  const val = typeof cellValue === "string" ? cellValue.trim() : "";
  if (!val || !val.includes("http")) {
    return { text: val, urls: [] };
  }
  const urlRegex = /https?:\/\/[^\s)]+/gi;
  const urls = (val.match(urlRegex) || []).map(u => u.trim());
  const text = val.replace(urlRegex, "").replace(/\s+/g, " ").trim();
  return { text, urls };
}

// Fetch + parse gviz JSON
async function fetchRows(url) {
  const res = await fetch(url);
  const txt = await res.text();
  const json = JSON.parse(txt.substr(47).slice(0, -2));
  return json.table.rows || [];
}

/* ========= State ========= */
let topics = []; // { name, items: [] }

/* ========= Render ========= */
function renderSidebar(listEl, topics, onSelect) {
  listEl.innerHTML = "";
  topics.forEach((t, idx) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "topic";
    btn.dataset.index = String(idx);

    const nameEl = document.createElement("span");
    nameEl.className = "name";
    nameEl.textContent = t.name;

    const countEl = document.createElement("span");
    countEl.className = "count";
    countEl.textContent = `${t.items.length} mục`;

    btn.appendChild(nameEl);
    btn.appendChild(countEl);
    li.appendChild(btn);
    listEl.appendChild(li);

    btn.addEventListener("click", () => onSelect(idx));
  });
}

function renderSection(titleEl, countEl, bodyEl, topic) {
  titleEl.textContent = topic.name;
  countEl.textContent = `${topic.items.length} mục`;
  bodyEl.innerHTML = "";

  if (!topic.items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Chưa có nội dung.";
    bodyEl.appendChild(empty);
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "items";

  topic.items.forEach((rawVal) => {
    const val = String(rawVal);
    const li = document.createElement("li");
    li.className = "item";

    // 1) Số → luôn hiển thị như text
    if (isNumericString(val)) {
      const p = document.createElement("div");
      p.className = "text";
      p.textContent = val;
      li.appendChild(p);
    }

    // 2) Link ảnh (kể cả Drive) → img, có fallback iframe preview nếu lỗi
    else if (isImageUrl(val)) {
      const img = document.createElement("img");
      img.loading = "lazy";
      const normalized = normalizeImageUrl(val);
      img.src = normalized;
      img.alt = `Ảnh minh họa: ${topic.name}`;

      img.onerror = () => {
        const iframe = makeDrivePreviewIframe(val) || makeDrivePreviewIframe(normalized);
        if (iframe) img.replaceWith(iframe);
      };

      li.appendChild(img);
    }

    // 3) Link thường → thẻ a
    else if (looksLikeUrl(val)) {
      const a = document.createElement("a");
      a.href = val;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = val;
      li.appendChild(a);
    }

    // 4) Text thường, có thể lẫn URL → tách và hiển thị cả text, ảnh, link
    else {
      const { text, urls } = extractUrlsAndText(val);

      if (text) {
        const p = document.createElement("div");
        p.className = "text";
        p.textContent = text;
        li.appendChild(p);
      }

      urls.forEach((u) => {
        if (isImageUrl(u)) {
          const img = document.createElement("img");
          img.loading = "lazy";
          const normalized = normalizeImageUrl(u);
          img.src = normalized;
          img.alt = `Ảnh minh họa: ${topic.name}`;
          img.onerror = () => {
            const iframe = makeDrivePreviewIframe(u) || makeDrivePreviewIframe(normalized);
            if (iframe) img.replaceWith(iframe);
          };
          li.appendChild(img);
        } else {
          const a = document.createElement("a");
          a.href = u;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = u;
          li.appendChild(a);
        }
      });

      if (!text && urls.length === 0) {
        const p = document.createElement("div");
        p.className = "text";
        p.textContent = val;
        li.appendChild(p);
      }
    }

    ul.appendChild(li);
  });

  bodyEl.appendChild(ul);
}


/* ========= Filter ========= */
function applyHeaderFilter(listEl, query) {
  const q = query.trim().toLowerCase();
  const buttons = Array.from(listEl.querySelectorAll(".topic"));
  buttons.forEach((btn) => {
    const name = btn.querySelector(".name")?.textContent?.toLowerCase() || "";
    const match = !q || name.includes(q);
    btn.parentElement.classList.toggle("hidden", !match);
  });
}

/* ========= Main ========= */
async function main() {
  const statusEl = document.getElementById("status");
  const topicListEl = document.getElementById("topicList");
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearBtn");

  const sectionTitleEl = document.getElementById("sectionTitle");
  const sectionCountEl = document.getElementById("sectionCount");
  const sectionBodyEl = document.getElementById("sectionBody");

  try {
    statusEl.textContent = "Đang tải dữ liệu…";
    const rows = await fetchRows(sheetUrl);

    if (!rows.length) {
      statusEl.textContent = "Không có dữ liệu.";
      return;
    }

    // Hàng 1: tiêu đề
    const headers = (rows[0]?.c || []).map(getCellValue);

    // Các hàng bên dưới: chi tiết
    topics = headers
      .map((header, colIndex) => {
        if (!header) return null;
        const items = [];
        for (let r = 1; r < rows.length; r++) {
          const val = getCellValue(rows[r]?.c?.[colIndex]);
          // Chỉ bỏ qua ô rỗng thật sự
          if (val !== "") items.push(val);
        }
        return { name: header, items };
      })
      .filter(Boolean);

    // Hàm chọn chủ đề
    const onSelect = (idx) => {
      const topic = topics[idx];
      renderSection(sectionTitleEl, sectionCountEl, sectionBodyEl, topic);
      Array.from(topicListEl.querySelectorAll(".topic")).forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.index === String(idx));
      });
    };

    // Render sidebar
    renderSidebar(topicListEl, topics, onSelect);
    statusEl.textContent = `Đã tải ${topics.length} chủ đề.`;

    // Mặc định chọn chủ đề đầu tiên
    if (topics.length > 0) onSelect(0);

    // Tìm kiếm
    searchInput.addEventListener("input", (e) => {
      applyHeaderFilter(topicListEl, e.target.value);
    });
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      applyHeaderFilter(topicListEl, "");
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Lỗi tải dữ liệu.";
  }
}

main();
