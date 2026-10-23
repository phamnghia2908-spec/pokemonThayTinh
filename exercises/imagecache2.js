// ===== imagecache2.js - Hệ thống 5 lớp ảnh thực tế + Proxy Pexels & LocalStorage =====

const PROXY_BASE = "https://pexel-proxy-43p3.onrender.com";
const IMAGE_MAP_CACHE_KEY = "pexels_image_map";
const IMAGE_MAP_CACHE_TIME = "pexels_image_map_time";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 giờ

class ImageCacheManager {
  constructor() {
    this.imageMap = {};
    this.pendingPromises = new Map();
    this.loadImageMapCache();
  }

  // ===== Load cache từ localStorage =====
  loadImageMapCache() {
    const cached = localStorage.getItem(IMAGE_MAP_CACHE_KEY);
    const cachedTime = parseInt(localStorage.getItem(IMAGE_MAP_CACHE_TIME) || "0");

    if (!cached || Date.now() - cachedTime > TTL_MS) return;

    try {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object") {
        this.imageMap = parsed;
      }
    } catch {
      console.warn("❌ Lỗi khi parse cache ảnh");
    }
  }

  // ===== Lưu cache vào localStorage =====
  saveImageMapCache() {
    try {
      localStorage.setItem(IMAGE_MAP_CACHE_KEY, JSON.stringify(this.imageMap));
      localStorage.setItem(IMAGE_MAP_CACHE_TIME, Date.now().toString());
    } catch {
      console.warn("❌ Không thể lưu cache ảnh");
    }
  }

  // ===== Hàm chính: Lấy ảnh với 5 bước ưu tiên sát thực tế =====
  async getImage(keyword) {
    if (!keyword) return null;
    const k = keyword.toLowerCase().trim();

    // Kiểm tra cache LocalStorage trước
    if (this.imageMap[k]) {
      return { url: this.imageMap[k], source: 'Cache', keyword: k };
    }

    // Tránh fetch trùng lặp nếu đang đợi
    if (this.pendingPromises.has(k)) return this.pendingPromises.get(k);

    const promise = this.fetchWith5Steps(k);
    this.pendingPromises.set(k, promise);

    try {
      const result = await promise;
      this.pendingPromises.delete(k);
      if (result && result.url) {
        this.imageMap[k] = result.url;
        this.saveImageMapCache();
      }
      return result;
    } catch (e) {
      this.pendingPromises.delete(k);
      return null;
    }
  }

  async fetchWith5Steps(keyword) {
    console.log(`🔍 Tìm ảnh thực tế cho: ${keyword}`);

    // --- BƯỚC 1: Unsplash (Ảnh nghệ thuật thực tế) ---
    try {
      const unsplashKey = 'HGRWhYHSw1G8VOEEEYlknJC-yOkANe3I3eS3NSt_SSg'; 
      const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=1&orientation=squarish&client_id=${unsplashKey}`);
      const data = await res.json();
      if (data.results?.length > 0) return { url: data.results[0].urls.regular, source: 'Unsplash' };
    } catch (e) { console.warn("⚠️ Unsplash failed"); }

    // --- BƯỚC 2: Pexels (Dùng PROXY RENDER của bạn) ---
    try {
      const res = await fetch(`${PROXY_BASE}/api/pexels?keyword=${encodeURIComponent(keyword)}`);
      const data = await res.json();
      if (data?.image) return { url: data.image, source: 'Pexels Proxy' };
    } catch (e) { console.warn("⚠️ Pexels Proxy failed"); }

    // --- BƯỚC 3: Pixabay (Key của Anh) ---
    try {
      const pixabayKey = "51268254-554135d72f1d226beca834413";
      const res = await fetch(`https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(keyword)}&image_type=photo&safesearch=true&per_page=3`);
      const data = await res.json();
      if (data.hits?.length > 0) return { url: data.hits[0].webformatURL, source: 'Pixabay' };
    } catch (e) { console.warn("⚠️ Pixabay failed"); }

    // --- BƯỚC 4: Openverse ---
    try {
      const res = await fetch(`https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(keyword)}&page_size=1`);
      const data = await res.json();
      if (data.results?.length > 0) return { url: data.results[0].url, source: 'Openverse' };
    } catch (e) { console.warn("⚠️ Openverse failed"); }

    // --- BƯỚC 5: Lorem Picsum (Ảnh thật ngẫu nhiên - Fallback cuối) ---
    try {
      const seed = keyword.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) & a, 0);
      const id = Math.abs(seed) % 500 + 1;
      return { url: `https://picsum.photos/id/${id}/400/400`, source: 'Picsum' };
    } catch (e) {
      return { url: "https://via.placeholder.com/400x300?text=No+Image", source: 'Placeholder' };
    }
  }

  // ===== Prefetch hàng loạt (Dùng API Batch của bạn) =====
  async prefetchImagesBatch(keywords) {
    const missing = keywords.filter(k => !this.imageMap[k.toLowerCase()]);
    if (missing.length === 0) return;

    const CHUNK_SIZE = 150;
    for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
      const chunk = missing.slice(i, i + CHUNK_SIZE);
      const qs = encodeURIComponent(chunk.join(","));
      const url = `${PROXY_BASE}/api/pexels/batch?keywords=${qs}`;

      try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (data?.images) {
          this.imageMap = { ...this.imageMap, ...data.images };
          this.saveImageMapCache();
        }
      } catch (e) {
        console.warn("⚠️ Batch fetch failed, switching to single fetch");
        for (const kw of chunk) await this.getImage(kw);
      }
    }
  }
}

// Khởi tạo instance global
const imageCache = new ImageCacheManager();

// Gắn vào window để dùng được ở mọi script thường
window.imageCache = imageCache;