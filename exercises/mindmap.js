// mindmap.js
let rawRows = []; 
let mm = null;    

// 1. Khởi tạo Speech Synthesis với kiểm tra danh sách giọng đọc
const synth = window.speechSynthesis;
let voices = [];

function loadVoices() {
    voices = synth.getVoices();
}
// Đợi danh sách giọng đọc sẵn sàng
loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

async function initMindmap() {
    try {
        const loading = document.getElementById('loading');
        const response = await fetch(window.SHEET_URL);
        const data = await response.json();
        rawRows = data.rows || data;

        buildDropdown(rawRows);

        document.getElementById('bigTopicFilter').addEventListener('change', (e) => {
            renderMindmap(e.target.value);
        });

        loading.style.display = 'none';
        renderMindmap("ALL");

    } catch (error) {
        console.error("❌ Lỗi:", error);
        document.getElementById('loading').innerText = "❌ Lỗi tải dữ liệu!";
    }
}

function buildDropdown(rows) {
    const filter = document.getElementById('bigTopicFilter');
    const getVal = (r, idx) => (r.c && r.c[idx]) ? r.c[idx].v : r[idx];
    const bigTopics = [...new Set(rows.map(r => getVal(r, 6)).filter(Boolean))];
    bigTopics.sort().forEach(topic => {
        const opt = document.createElement('option');
        opt.value = topic;
        opt.textContent = topic;
        filter.appendChild(opt);
    });
}

function renderMindmap(selectedTopic) {
    const getVal = (r, idx) => (r.c && r.c[idx]) ? r.c[idx].v : r[idx];
    const mapData = {};

    rawRows.forEach(r => {
        const bigTopic = getVal(r, 6) || "Khác";
        const smallTopic = getVal(r, 5) || "Chung";
        const vocab = getVal(r, 2);
        const meaning = getVal(r, 24) || "";

        if (!vocab) return;
        if (selectedTopic !== "ALL" && bigTopic !== selectedTopic) return;

        if (!mapData[bigTopic]) mapData[bigTopic] = {};
        if (!mapData[bigTopic][smallTopic]) mapData[bigTopic][smallTopic] = new Set();
        mapData[bigTopic][smallTopic].add(`${vocab.trim()} *(${meaning.trim()})*`);
    });

    let markdownText = selectedTopic === "ALL" 
        ? "# 🚩 HÃY CHỌN MỘT CHỦ ĐỀ LỚN" 
        : `# 🚩 ${selectedTopic}\n`;

    for (const big in mapData) {
        if (selectedTopic === "ALL") {
            markdownText += `## ${big} (Chọn menu trên)\n`;
        } else {
            for (const small in mapData[big]) {
                markdownText += `## ${small}\n`;
                Array.from(mapData[big][small]).sort().forEach(item => {
                    markdownText += `- ${item}\n`;
                });
            }
        }
    }

    const svgEl = document.querySelector('#markmap');
    const { markmap } = window;
    const transformer = new markmap.Transformer();
    const { root } = transformer.transform(markdownText);

    if (mm) { svgEl.innerHTML = ""; }

    mm = markmap.Markmap.create(svgEl, {
        autoFit: true,
        initialExpandLevel: 1,
        duration: 400
    }, root);

    // Xử lý sự kiện Click chính xác hơn
    const handleNodeClick = (e) => {
        // Tìm node cha gần nhất có class của markmap
        const node = e.target.closest('.markmap-node');
        if (!node) return;

        // Lấy text ẩn bên trong (tránh các thẻ SVG phụ)
        let rawText = node.textContent || "";

        // Tách từ vựng: "Apple (Quả táo)" -> "Apple"
        let cleanText = rawText.split('(')[0].split('*')[0].trim();

        // Bỏ qua nếu là tiêu đề hướng dẫn hoặc tiêu đề rỗng
        if (cleanText.includes("HÃY CHỌN") || cleanText === "") return;

        console.log("Đang đọc:", cleanText); // Kiểm tra trong Console F12
        speak(cleanText);
    };

    svgEl.onclick = handleNodeClick;
}

function speak(text) {
    // 1. Dừng âm thanh cũ và đánh thức trình duyệt
    synth.cancel();
    if (synth.paused) synth.resume();

    const utter = new SpeechSynthesisUtterance(text);

    // 2. Lấy danh sách giọng đọc mới nhất
    const voices = synth.getVoices();

    // 3. Tìm giọng theo thứ tự ưu tiên
    // Tìm Zira (Giọng nữ chuẩn)
    let selectedVoice = voices.find(v => v.name.includes('Zira'));

    // Nếu không có Zira, tìm David (Giọng nam)
    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.name.includes('David'));
    }

    // Nếu vẫn không có, tìm bất kỳ giọng Google US English hoặc giọng Anh-Mỹ nào
    if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) 
                        || voices.find(v => v.lang.startsWith('en-US'))
                        || voices.find(v => v.lang.startsWith('en'));
    }

    // Gán giọng đã tìm được
    if (selectedVoice) {
        utter.voice = selectedVoice;
        console.log("Đang dùng giọng:", selectedVoice.name); // Để ông kiểm tra trong Console
    }

    utter.lang = 'en-US';
    utter.rate = 0.5; 
    utter.pitch = 1;

    // 4. Phát âm
    synth.speak(utter);
}

document.addEventListener('DOMContentLoaded', initMindmap);