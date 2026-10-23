const SHEET_URL = "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";
const COLUMN_WORD = 2;    // Cột C: từ vựng
const COLUMN_VIDEO = 44;  // Cột AS: video minh họa
const COLUMN_SONG = 45;   // Cột AT: bài hát
const COLUMN_EXTRA = 46;  // Cột AU: video khác

console.log("🚀 Bắt đầu chạy document.js");

const wordBank = JSON.parse(localStorage.getItem("wordBank")) || [];
const uniqueWords = [...new Set(wordBank.map(w => w.trim().toLowerCase()))];

console.log("📦 Từ vựng lấy từ localStorage:", uniqueWords);

function convertToEmbed(link) {
  try {
    const url = new URL(link);
    const videoId = url.searchParams.get("v");
    const listId = url.searchParams.get("list");

    if (!videoId) return null;

    let embedURL = `https://www.youtube.com/embed/${videoId}`;
    if (listId) {
      embedURL += `?list=${listId}`;
    }

    return embedURL;
  } catch (err) {
    console.error("❌ Lỗi khi phân tích link:", err);
    return null;
  }
}

async function fetchSheetAndShowMedia() {
  try {
    console.log("🌐 Đang fetch dữ liệu từ Google Sheet...");
    const res = await fetch(SHEET_URL);
    const text = await res.text();
    console.log("✅ Đã nhận dữ liệu từ Sheet");

    const json = JSON.parse(text.substring(47).slice(0, -2));
    const rows = json.table.rows;
    console.log(`📊 Tổng số dòng trong Sheet: ${rows.length}`);

    const videoLinks = [];
    const songLinks = [];
    const extraLinks = [];

    rows.forEach((row, index) => {
      const word = row.c[COLUMN_WORD]?.v?.trim().toLowerCase();
      const video = row.c[COLUMN_VIDEO]?.v?.trim();
      const song = row.c[COLUMN_SONG]?.v?.trim();
      const extra = row.c[COLUMN_EXTRA]?.v?.trim();

      if (word && uniqueWords.includes(word)) {
        if (video && video.includes("youtube")) videoLinks.push(video);
        if (song && song.includes("youtube")) songLinks.push(song);
        if (extra && extra.includes("youtube")) extraLinks.push(extra);
      }
    });

    console.log("🎯 Video links:", videoLinks);
    console.log("🎵 Song links:", songLinks);
    console.log("🎥 Video khác:", extraLinks);

    const mostVideo = getMostFrequent(videoLinks);
    const mostSong = getMostFrequent(songLinks);
    const mostExtra = getMostFrequent(extraLinks);

    if (mostVideo) {
      const embedVideo = convertToEmbed(mostVideo);
      document.getElementById("videoBox").innerHTML = `
        <h2>🎬 Video minh họa chủ đề</h2>
        <iframe width="560" height="315" src="${embedVideo}" frameborder="0" allowfullscreen></iframe>
        <p style="margin-top:10px; color:#555;">Video từ playlist: <code>${mostVideo}</code></p>
      `;
    } else {
      document.getElementById("videoBox").innerHTML = `<p>❌ Không tìm thấy video phù hợp.</p>`;
    }

    if (mostSong) {
      const embedSong = convertToEmbed(mostSong);
      document.getElementById("songBox").innerHTML = `
        <h2>🎵 Bài hát chủ đề</h2>
        <iframe width="560" height="315" src="${embedSong}" frameborder="0" allowfullscreen></iframe>
        <p style="margin-top:10px; color:#555;">Bài hát từ playlist: <code>${mostSong}</code></p>
      `;
    } else {
      document.getElementById("songBox").innerHTML = `<p>❌ Không tìm thấy bài hát phù hợp.</p>`;
    }

    if (mostExtra) {
      const embedExtra = convertToEmbed(mostExtra);
      document.getElementById("extraBox").innerHTML = `
        <h2>🎥 Video khác</h2>
        <iframe width="560" height="315" src="${embedExtra}" frameborder="0" allowfullscreen></iframe>
        <p style="margin-top:10px; color:#555;">Video khác từ playlist: <code>${mostExtra}</code></p>
      `;
    } else {
      document.getElementById("extraBox").innerHTML = `<p>❌ Không tìm thấy video khác phù hợp.</p>`;
    }

  } catch (err) {
    console.error("❌ Lỗi khi xử lý dữ liệu:", err);
    document.getElementById("videoBox").innerHTML = `<p>Không thể tải video. Vui lòng thử lại sau.</p>`;
    document.getElementById("songBox").innerHTML = `<p>Không thể tải bài hát. Vui lòng thử lại sau.</p>`;
    document.getElementById("extraBox").innerHTML = `<p>Không thể tải video khác. Vui lòng thử lại sau.</p>`;
  }
}

function getMostFrequent(arr) {
  const countMap = {};
  arr.forEach(link => {
    countMap[link] = (countMap[link] || 0) + 1;
  });

  let best = null;
  let max = 0;
  for (const link in countMap) {
    if (countMap[link] > max) {
      best = link;
      max = countMap[link];
    }
  }
  return best;
}

fetchSheetAndShowMedia();
