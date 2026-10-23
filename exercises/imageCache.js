// imageCache.js
const PROXY_BASE = "https://pexel-proxy-43p3.onrender.com";

// Key lưu cache trong localStorage
const IMAGE_MAP_CACHE_KEY = "pexels_image_map";
const IMAGE_MAP_CACHE_TIME = "pexels_image_map_time";

// TTL cho cache (6 giờ)
const TTL_MS = 6 * 60 * 60 * 1000;

let imageMap = {};

// ===== Load cache từ localStorage =====
function loadImageMapCache() {
  const cached = localStorage.getItem(IMAGE_MAP_CACHE_KEY);
  const cachedTime = parseInt(localStorage.getItem(IMAGE_MAP_CACHE_TIME) || "0");

  if (!cached || Date.now() - cachedTime > TTL_MS) return;

  try {
    const parsed = JSON.parse(cached);
    if (parsed && typeof parsed === "object") {
      imageMap = parsed;
    }
  } catch {
    console.warn("❌ Lỗi khi parse cache ảnh");
  }
}

// ===== Lưu cache vào localStorage =====
function saveImageMapCache() {
  try {
    localStorage.setItem(IMAGE_MAP_CACHE_KEY, JSON.stringify(imageMap));
    localStorage.setItem(IMAGE_MAP_CACHE_TIME, Date.now().toString());
  } catch {
    console.warn("❌ Không thể lưu cache ảnh");
  }
}

// ===== Prefetch ảnh cho các từ khóa còn thiếu =====
async function prefetchImagesBatch(keywords) {
  loadImageMapCache();

  const missing = keywords.filter(k => !imageMap[k]);
  if (missing.length === 0) return;

  const CHUNK_SIZE = 150;
  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    const chunk = missing.slice(i, i + CHUNK_SIZE);
    const qs = encodeURIComponent(chunk.join(","));
    const url = `${PROXY_BASE}/api/pexels/batch?keywords=${qs}`;

    try {
      const resp = await fetch(url);
      const data = await resp.json();
      if (data?.images && typeof data.images === "object") {
        imageMap = { ...imageMap, ...data.images };
        saveImageMapCache();
      }
    } catch (e) {
      console.warn("⚠️ Batch fetch failed:", e);
      // Nếu batch Pexels fail → thử từng keyword với Pixabay
      for (const kw of chunk) {
        await fetchImageForKeyword(kw);
      }
    }
  }
}

// ===== Lấy ảnh từ cache =====
function getImageFromMap(keyword) {
  const k = (keyword || "").toLowerCase();
  return imageMap[k] || "https://via.placeholder.com/400x300?text=No+Image";
}

// ===== Lấy ảnh cho 1 từ khóa, ưu tiên Pexels, fallback sang Pixabay =====
async function fetchImageForKeyword(keyword) {
  loadImageMapCache();

  const k = (keyword || "").toLowerCase();
  if (imageMap[k]) return imageMap[k];

  // 1. Thử Pexels proxy
  try {
    const url = `${PROXY_BASE}/api/pexels?keyword=${encodeURIComponent(keyword)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data?.image) {
      imageMap[k] = data.image;
      saveImageMapCache();
      return data.image;
    }
  } catch (e) {
    console.warn("⚠️ Pexels fetch failed:", e);
  }

  // 2. Fallback sang Pixabay
  try {
    const apiKey = "51268254-554135d72f1d226beca834413"; // 🔑 key của Anh
    const searchTerm = keyword;

    const apiUrl = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(keyword)}&image_type=photo&safesearch=true&per_page=5`;


    console.log("👉 Fetching image from Pixabay:", apiUrl);
    const resp = await fetch(apiUrl);
    const data = await resp.json();
    if (data?.hits?.length > 0) {
      const imgUrl = data.hits[0].webformatURL;
      imageMap[k] = imgUrl;
      saveImageMapCache();
      return imgUrl;
    }
  } catch (e) {
    console.warn("⚠️ Pixabay fetch failed:", e);
  }

  // 3. Nếu cả hai đều fail → placeholder
  return "https://via.placeholder.com/400x300?text=No+Image";
}

export { prefetchImagesBatch, getImageFromMap, fetchImageForKeyword };
