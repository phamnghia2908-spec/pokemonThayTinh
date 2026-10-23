/**
 * =========================================================================
 * POKEMON VOCABULARY LEARNING MODULE - FIXED PHONICS & SPRITES
 * =========================================================================
 */

/**
 * ─────────────────────────────────────────────────────────────────────────
 * MOBILE AUDIO ENGINE  
 * Dùng Web Audio API (AudioContext) thay cho new Audio() để tránh bị
 * trình duyệt mobile chặn autoplay sau lần tương tác đầu tiên.
 * - Một AudioContext duy nhất, unlock từ gesture người dùng
 * - Cache ArrayBuffer để không fetch lại file đã tải
 * - playIpa() trả về Promise resolve đúng khi âm kết thúc thật sự
 * ─────────────────────────────────────────────────────────────────────────
 */
window.MobileAudioEngine = (() => {
    let ctx = null;
    const cache = new Map(); // ipaName → ArrayBuffer

    // Khởi tạo / resume AudioContext (phải gọi từ trong user gesture)
    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
    }

    // Unlock sớm khi người dùng chạm màn hình lần đầu
    function unlock() {
        if (ctx && ctx.state !== "suspended") return;
        const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
        tempCtx.resume().then(() => { tempCtx.close(); });
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("mousedown",  unlock, { once: true });

    // Fetch và cache ArrayBuffer cho 1 file IPA
    async function fetchBuffer(ipaName) {
        if (cache.has(ipaName)) return cache.get(ipaName);
        const url = `https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/${ipaName}.mp3`;
        try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const buf = await res.arrayBuffer();
            cache.set(ipaName, buf);
            return buf;
        } catch {
            return null;
        }
    }

    // Preload danh sách IPA trước khi đọc (gọi không bắt buộc, giúp tăng tốc)
    async function preload(ipaList) {
        await Promise.all(ipaList.map(ipa => fetchBuffer(ipa)));
    }

    /**
     * Phát 1 âm IPA, trả về Promise resolve khi âm kết thúc thật sự.
     * Timeout an toàn 3s phòng file lỗi / mạng quá chậm.
     */
    async function playIpa(ipaName) {
        const buf = await fetchBuffer(ipaName);
        if (!buf) return; // file không tồn tại → bỏ qua

        return new Promise(async (resolve) => {
            try {
                const audioCtx = getCtx();
                // Decode phải clone vì decodeAudioData "tiêu thụ" buffer
                const decoded = await audioCtx.decodeAudioData(buf.slice(0));
                const source  = audioCtx.createBufferSource();
                source.buffer = decoded;
                source.connect(audioCtx.destination);
                source.onended = () => resolve();
                setTimeout(() => resolve(), (decoded.duration * 1000) + 500); // cầu chì
                source.start(0);
            } catch (err) {
                console.warn("AudioEngine lỗi:", ipaName, err);
                resolve();
            }
        });
    }

    return { playIpa, preload, unlock };
})();

window.VocabularyModule = {
    currentLessonData: [],
    currentIndex: 0,
    currentRound: 1, // Vòng 1 (Học), Vòng 2 (Ôn tập), Vòng 2.5 (Tách âm), Vòng 3 (Hội thoại)
    turnPhase: "ask", 

    voiceMale: null,
    voiceFemale: null,

    COLS: {
        LESSON_NAME: 1, WORD: 2, PHRASE_EN: 3, PHRASE_VI: 4,
        PRESENT_SENT: 8, QUESTION: 9, KEYWORD_FIX: 10, FINAL_ANS: 11,
        MEANING: 24, SOUND_PUN: 25, PUN_SENTENCE: 26,
    },

    initVoices() {
        return new Promise((resolve) => {
            const list = window.speechSynthesis.getVoices();
            const filterVoices = (vList) => {
                this.voiceMale = vList.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("david")) ||
                                 vList.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("alex")) ||
                                 vList.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("male")) ||
                                 vList.find(v => v.lang === "en-US");

                this.voiceFemale = vList.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("zira")) ||
                                   vList.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("samantha")) ||
                                   vList.find(v => v.lang === "en-US" && v.name.toLowerCase().includes("female")) ||
                                   vList.find(v => v.lang === "en-US");
                resolve();
            };
            if (list.length) return filterVoices(list);
            window.speechSynthesis.onvoiceschanged = () => filterVoices(window.speechSynthesis.getVoices());
        });
    },

    speak(text, isFemale = true) {
        if (!text) return;
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "en-US";
        utter.voice = isFemale ? this.voiceFemale : this.voiceMale;
        utter.rate = 0.9; 
        window.speechSynthesis.speak(utter);
    },

    typeText(element, fullText, vocabWord, onDone = () => {}) {
        element.textContent = "";
        let i = 0;
        const speed = 40; 

        function step() {
            if (i < fullText.length) {
                element.textContent += fullText.charAt(i);
                i++;
                setTimeout(step, speed);
            } else {
                if (vocabWord) {
                    const regex = new RegExp(`\\b(${vocabWord})\\b`, "gi");
                    element.innerHTML = fullText.replace(regex, `<span style="color: #ffcb05; font-weight: bold; text-shadow: 0 0 5px rgba(255,203,5,0.4);">$1</span>`);
                }
                onDone();
            }
        }
        step();
    },

    async fetchAllVocabData() {
        const storedData = sessionStorage.getItem("allVocabData");
        const missionData = localStorage.getItem("current_mission");
        if (!storedData || !missionData) return [];

        const allRows = JSON.parse(storedData);
        const currentLessonId = JSON.parse(missionData).id;
        const listVocabs = [];

        allRows.forEach((row) => {
            const r = Array.isArray(row) ? row : Object.values(row);
            const lessonId = (r[this.COLS.LESSON_NAME] || "").toString().trim();

            if (lessonId === currentLessonId && r[this.COLS.WORD]) {
                listVocabs.push({
                    word: (r[this.COLS.WORD] || "").toString().trim(),
                    meaning: (r[this.COLS.MEANING] || "").toString().trim(),
                    enChunk: (r[this.COLS.PHRASE_EN] || "").toString().trim(),
                    viChunk: (r[this.COLS.PHRASE_VI] || "").toString().trim(),
                    question: (r[this.COLS.QUESTION] || "").toString().trim(),
                    answer: (r[this.COLS.FINAL_ANS] || "").toString().trim(),
                });
            }
        });
        this.currentLessonData = listVocabs;
        return listVocabs;
    },

    async start() {
        await this.initVoices();
        const data = await this.fetchAllVocabData();

        if (!data || data.length === 0) {
            this.endLearning();
            return;
        }

        this.currentIndex = 0;
        this.currentRound = 1;
        this.turnPhase = "ask";

        let mainCard = document.getElementById("mainCard");
        if (!mainCard) {
            mainCard = document.createElement("div");
            mainCard.id = "mainCard";
            document.body.appendChild(mainCard);
        }

        mainCard.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100dvh !important;
            background: radial-gradient(circle, #1a1c28 0%, #0a0c16 100%) !important;
            padding: 20px !important;
            color: white !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            z-index: 99999 !important;
            box-shadow: none !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            align-items: center !important;
            box-sizing: border-box !important;
            overflow-y: hidden !important;
        `;

        this.render();
    },

    render() {
        if (this.currentIndex >= this.currentLessonData.length) {
            if (this.currentRound === 1) {
                this.currentRound = 2;
                this.currentIndex = 0;
                alert("🌟 Đã xong Vòng 1! Bắt đầu Vòng 2 ôn tập nhanh.");
            } else if (this.currentRound === 2) {
                this.currentRound = 2.5;
                this.currentIndex = 0;
                alert("🗣️ Chuẩn bị sang phần: PHÁT ÂM CHUYÊN SÂU (Tách & Blend âm)!");
            } else if (this.currentRound === 2.5) {
                this.currentRound = 3; 
                this.currentIndex = 0;
                this.turnPhase = "ask";
                alert("💬 Tuyệt vời! Hãy cùng xem cuộc đối thoại thực tế giữa 2 Trainer Pokémon!");
            } else {
                this.endLearning();
                return;
            }
        }

        if (this.currentRound === 1 || this.currentRound === 2) {
            this.renderVocabCard();
        } else if (this.currentRound === 2.5) {
            this.renderPhonicsCard(); 
        } else {
            this.renderConversationCard();
        }
    },

    renderVocabCard() {
        const currentItem = this.currentLessonData[this.currentIndex];
        const mainCard = document.getElementById("mainCard");

        mainCard.innerHTML = `
            <div style="width: 100%; max-width: 500px; background: rgba(20, 24, 40, 0.7); padding: 30px; border-radius: 24px; border: 3px solid #ffcb05; box-shadow: 0 12px 40px rgba(0,0,0,0.5); box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #ffcb05; margin-bottom: 15px; font-weight: bold;">
                    <span>📖 HỌC TỪ VỰNG: <span style="background:#ffcb05; color:#000; padding:2px 8px; border-radius:10px;">VÒNG ${this.currentRound}/2</span></span>
                    <span>TỪ: ${this.currentIndex + 1}/${this.currentLessonData.length}</span>
                </div>
                <div style="width: 100%; height: 180px; border-radius: 12px; overflow: hidden; margin-bottom: 15px; border: 2px solid #333; background: #000;">
                    <img src="https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=500&q=80" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <h1 style="font-size: 2.8rem; margin: 5px 0; letter-spacing: 1px; color: #fff;">${currentItem.word}</h1>
                <p style="font-size: 1.3rem; color: #f1c40f; font-weight: bold; margin-bottom: 20px;">🎯 ${currentItem.meaning}</p>

                ${currentItem.enChunk ? `
                <div style="background: rgba(52, 152, 219, 0.12); border-left: 4px solid #3498db; padding: 12px; border-radius: 6px; margin-bottom: 15px; text-align: left;">
                    <div style="color: #3498db; font-size: 1.1rem; font-weight: bold; line-height: 1.4;">${currentItem.enChunk}</div>
                    <div style="color: #ccc; font-size: 0.9rem; font-style: italic; margin-top: 4px;">(${currentItem.viChunk || ''})</div>
                </div>` : ''}

                <div style="display: flex; gap: 12px; margin-top: 20px;">
                    <button id="v1PlayBtn" style="flex: 1; padding: 14px; background: #3498db; color: white; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 1rem; transition: 0.2s;">🔊 PHÁT ÂM</button>
                    <button id="v1NextBtn" style="flex: 1; padding: 14px; background: #2ecc71; color: white; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 1rem; transition: 0.2s;">TIẾP THEO ⏩</button>
                </div>
            </div>
        `;

        const playBtn = document.getElementById("v1PlayBtn");
        playBtn.onclick = () => this.speak(currentItem.word, true);
        setTimeout(() => { if(document.getElementById("v1PlayBtn")) playBtn.click(); }, 300);

        document.getElementById("v1NextBtn").onclick = () => {
            this.currentIndex++;
            this.render();
        };
    },

    // ✅ ĐÃ SỬA CÚ PHÁP: Xóa chữ 'function' để đưa về Method chuẩn của Object JS
    // ✅ ĐÃ SỬA CÚ PHÁP: Xóa chữ 'function' để đưa về Method chuẩn của Object JS
    async renderPhonicsCard() {
        const currentItem = this.currentLessonData[this.currentIndex];
        const mainCard = document.getElementById("mainCard");
        const cleanWord = currentItem.word.trim().toLowerCase();

        // ─── DỰNG GIAO DIỆN ─────────────────────────────────────────────────────
        mainCard.innerHTML = `
            <div style="
                width: 100%; max-width: 600px;
                max-height: 90dvh; /* Thêm dòng này: Giới hạn chiều cao hộp bằng 90% màn hình thực tế */
                overflow-y: auto;  /* Thêm dòng này: Tự động cuộn nội dung bên trong nếu thiếu đất */
                background: rgba(18, 22, 40, 0.95);
                padding: 20px 22px 40px; /* Sửa padding đáy lên 40px để tạo khoảng cách an toàn với thanh điều hướng Chrome */
                border-radius: 26px;
                border: 3px solid #e74c3c;
                box-shadow: 0 0 40px rgba(231,76,60,0.2), 0 12px 40px rgba(0,0,0,0.6);
                box-sizing: border-box;
                text-align: center;
                font-family: system-ui, sans-serif;
            ">
                <div style="display:flex; justify-content:space-between; font-size:0.82rem;
                            color:#ff7675; margin-bottom:18px; font-weight:bold;">
                    <span>🗣️ PHONICS: <span style="background:#e74c3c; color:#fff;
                        padding:2px 8px; border-radius:10px;">TÁCH ÂM</span></span>
                    <span>TỪ: ${this.currentIndex + 1}/${this.currentLessonData.length}</span>
                </div>

                <h2 style="font-size:2.6rem; color:#fff; margin:0 0 4px;
                           text-transform:uppercase; letter-spacing:3px;
                           text-shadow:0 0 20px rgba(255,203,5,0.3);">
                    ${currentItem.word.trim()}
                </h2>
                <p style="color:#a0aec0; font-size:1rem; margin-bottom:20px;">
                    "${currentItem.meaning}"
                </p>

                <div id="phonicsLoading" style="color:#ffd54f; font-size:13px; margin-bottom:8px;">
                    ⏳ Đang chờ từ điển âm vị...
                </div>

                <style>
                    #v1PhonicsContainer {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        gap: 8px !important;
                        justify-content: center !important;
                        margin-bottom: 20px !important;
                        min-height: 60px;
                    }
                    /* tacham.js tạo .word-block > div > .syllable-wrapper */
                    #v1PhonicsContainer .word-block {
                        background: rgba(255,255,255,0.04) !important;
                        border-color: rgba(255,255,255,0.1) !important;
                    }
                    #v1PhonicsContainer .syllable-wrapper {
                        flex: 0 0 auto !important;
                        min-width: 75px !important;
                        margin: 4px !important;
                        cursor: pointer !important;
                        transition: transform 0.15s ease !important;
                        display: inline-flex !important;
                        flex-direction: column !important;
                        align-items: center !important;
                    }
                    #v1PhonicsContainer .sound-unit {
                        width: 100% !important;
                        padding: 10px 8px !important;
                        border-radius: 12px !important;
                        text-align: center !important;
                        box-sizing: border-box !important;
                        border: 2px solid transparent !important;
                        transition: all 0.2s ease !important;
                        cursor: pointer !important;
                    }
                    /* Đang đọc → viền đỏ, phóng to */
                    .ph-active .sound-unit {
                        border-color: #e74c3c !important;
                        background: rgba(231,76,60,0.3) !important;
                        box-shadow: 0 0 18px rgba(231,76,60,0.8) !important;
                        transform: scale(1.2) !important;
                    }
                    .ph-active .sound-unit span {
                        color: #ff4444 !important;
                    }
                    /* Đã đọc xong → mờ */
                    .ph-done .sound-unit {
                        opacity: 0.38 !important;
                    }
                </style>
                <div id="v1PhonicsContainer"></div>

                <div style="background:rgba(255,255,255,0.08); border-radius:4px;
                            overflow:hidden; margin-bottom:20px; height:5px;">
                    <div id="phonicsBar" style="width:0%; height:100%;
                        background:linear-gradient(90deg,#e74c3c,#f39c12);
                        border-radius:4px; transition:width 0.3s ease;"></div>
                </div>

                <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                    <button id="phonicsAutoBtn" disabled style="
                        padding:12px 20px; background:#e74c3c; color:#fff;
                        border:none; border-radius:12px; font-weight:bold;
                        cursor:pointer; font-size:0.9rem; opacity:0.5;
                        box-shadow:0 4px 12px rgba(231,76,60,0.4); transition:all 0.2s;">
                        ▶️ Đọc từng âm</button>

                    <button id="phonicsFullBtn" style="
                        padding:12px 20px; background:#f1c40f; color:#1a1a2e;
                        border:none; border-radius:12px; font-weight:bold;
                        cursor:pointer; font-size:0.9rem;
                        box-shadow:0 4px 12px rgba(241,196,15,0.3); transition:all 0.2s;">
                        🔊 Cả từ</button>

                    <button id="phonicsNextBtn" style="
                        padding:12px 20px; background:rgba(255,255,255,0.08); color:#ccc;
                        border:2px solid rgba(255,255,255,0.2); border-radius:12px;
                        font-weight:bold; cursor:pointer; font-size:0.9rem; transition:all 0.2s;">
                        TỪ TIẾP ⏭️</button>
                </div>
            </div>
        `;

        const pContainer  = document.getElementById("v1PhonicsContainer");
        const loadingEl   = document.getElementById("phonicsLoading");
        const autoBtn     = document.getElementById("phonicsAutoBtn");
        const progressBar = document.getElementById("phonicsBar");

        // ─── ĐỢI DICTMAP CÓ DỮ LIỆU (poll mỗi 300ms, tối đa 10s) ───────────────
        await new Promise((resolve) => {
            let waited = 0;
            const check = () => {
                if (window.dictMap && window.dictMap.size > 0) {
                    resolve();
                } else if (waited >= 10000) {
                    resolve(); 
                } else {
                    waited += 300;
                    setTimeout(check, 300);
                }
            };
            check();
        });

        if (loadingEl) loadingEl.style.display = "none";

        // ─── GỌI HANDLESPLIT (ĐÃ BỌC TRY...CATCH ĐỂ CHỐNG SẬP GIAO DIỆN) ───────
        if (pContainer && window.handleSplit) {
            try {
                await window.handleSplit(cleanWord, pContainer, null);
            } catch (error) {
                console.error("Lỗi tách âm từ này:", error);
                if (pContainer) {
                    pContainer.innerHTML = `
                        <p style="color:#ff7675; font-size:14px; margin: 10px 0;">
                            ⚠️ Lỗi xử lý âm vị cho từ "${cleanWord}".
                        </p>
                    `;
                }
            }
        }

        // Kiểm tra có render được không
        const hasContent = pContainer && pContainer.querySelector("[data-index]");
        if (!hasContent) {
            if (pContainer) pContainer.innerHTML =
                `<p style="color:#ff7675;font-size:14px;">
                 ⚠️ Không tìm thấy "${cleanWord}" trong từ điển âm vị.</p>`;
            autoBtn.disabled = true;
        } else {
            autoBtn.disabled = false;
            autoBtn.style.opacity = "1";
        }

        // ─── LẤY TẤT CẢ .syllable-wrapper ──────────────────────────────────────
        const getAllUnits = () => Array.from(pContainer.querySelectorAll("[data-index]"));

        // ─── CLICK THỦ CÔNG TỪNG Ô ──────────────────────────────────────────────
        getAllUnits().forEach((wrapper, i, arr) => {
            wrapper.addEventListener("click", async (e) => {
                e.stopPropagation();
                window.MobileAudioEngine.unlock();
                arr.forEach(u => u.classList.remove("ph-active", "ph-done"));
                wrapper.classList.add("ph-active");

                // Đọc lần lượt từng âm nhỏ trong cụm khi bấm
                const units = Array.from(wrapper.querySelectorAll(".sound-unit:not(.silent)"));
                for (const unit of units) {
                    const ipa = unit.querySelector("small")?.innerText.replace(/\//g, "").trim() || "";
                    if (ipa) await window.MobileAudioEngine.playIpa(ipa);
                }
                wrapper.classList.remove("ph-active");

                if (progressBar) progressBar.style.width = `${((i+1)/arr.length)*100}%`;
            });
        });

        // ─── AUTO READ: DÙNG WEB AUDIO API (FIX MOBILE) ───────────────────────
        let isReading = false;
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Hàm trích IPA từ 1 sound-unit element
        const getIpaFromUnit = (unit) => {
            const smallEl = unit.querySelector("small");
            if (!smallEl) return "";
            return smallEl.innerText.replace(/\//g, "").trim();
        };

        // Highlight 1 unit
        const highlightUnit = (unit, on) => {
            if (on) {
                unit.style.setProperty("border",            "3px solid #e74c3c", "important");
                unit.style.setProperty("background-color",  "rgba(231,76,60,0.25)", "important");
                unit.style.setProperty("box-shadow",        "0 0 15px #e74c3c", "important");
                unit.style.transform   = "scale(1.15)";
                unit.style.transition  = "all 0.2s ease";
            } else {
                unit.style.border           = "2px solid transparent";
                unit.style.backgroundColor  = "transparent";
                unit.style.boxShadow        = "none";
                unit.style.transform        = "none";
            }
        };

        const doAutoRead = async () => {
            const wrappers = getAllUnits();
            if (!wrappers.length) return;

            window.MobileAudioEngine.unlock();
            isReading = true;
            autoBtn.innerHTML = "⏹️ Dừng";

            // Reset giao diện
            wrappers.forEach(w => {
                w.classList.remove("ph-active", "ph-done");
                w.querySelectorAll(".sound-unit").forEach(u => highlightUnit(u, false));
            });
            if (progressBar) progressBar.style.width = "0%";

            // ── PRELOAD BLOCKING: fetch hết tất cả file MP3 TRƯỚC khi bắt đầu đọc ──
            // Điều này tránh tình trạng mạng chậm làm delay giữa các âm trên mobile
            const allIpaList = [];
            wrappers.forEach(w => {
                w.querySelectorAll(".sound-unit:not(.silent)").forEach(u => {
                    const ipa = getIpaFromUnit(u);
                    if (ipa) allIpaList.push(ipa);
                });
            });

            // Hiện thông báo đang tải để user biết (quan trọng cho mobile mạng chậm)
            if (allIpaList.length > 0) {
                autoBtn.innerHTML = "⏳ Đang tải âm...";
                await window.MobileAudioEngine.preload(allIpaList); // blocking await
                if (!isReading) { autoBtn.innerHTML = "▶️ Đọc từng âm"; return; }
                autoBtn.innerHTML = "⏹️ Dừng";
            }

            // VÒNG LẶP CHÍNH — lúc này tất cả file đã có trong cache, không còn lag mạng
            for (let i = 0; i < wrappers.length; i++) {
                if (!isReading) break;

                const wrapper = wrappers[i];
                wrapper.scrollIntoView({ behavior: "smooth", block: "nearest" });

                const soundUnits = Array.from(wrapper.querySelectorAll(".sound-unit:not(.silent)"));

                for (let j = 0; j < soundUnits.length; j++) {
                    if (!isReading) break;

                    const unit = soundUnits[j];
                    const ipa  = getIpaFromUnit(unit);

                    highlightUnit(unit, true);

                    if (ipa) {
                        await window.MobileAudioEngine.playIpa(ipa);
                        await sleep(150); // khoảng nghỉ tự nhiên giữa các âm
                    } else {
                        await sleep(350); // chữ câm
                    }

                    highlightUnit(unit, false);
                }

                if (!isReading) break;

                // Flash cả cụm → đánh dấu done
                wrappers.forEach(u => u.classList.remove("ph-active"));
                wrapper.classList.add("ph-active");
                if (progressBar) progressBar.style.width = `${((i + 1) / wrappers.length) * 100}%`;
                await sleep(500);
                wrapper.classList.remove("ph-active");
                wrapper.classList.add("ph-done");
            }

            // Đọc cả từ TTS khi kết thúc
            if (isReading) {
                wrappers.forEach(w => w.classList.remove("ph-done"));
                if (progressBar) progressBar.style.width = "100%";
                const phonicsFullBtn = document.getElementById("phonicsFullBtn");
                if (phonicsFullBtn) phonicsFullBtn.click();
            }

            isReading = false;
            autoBtn.innerHTML = "▶️ Đọc từng âm";
        };

        autoBtn.onclick = () => {
            if (isReading) {
                isReading = false;
                window.speechSynthesis.cancel();
                getAllUnits().forEach(u => u.classList.remove("ph-active", "ph-done"));
                if (progressBar) progressBar.style.width = "0%";
                autoBtn.innerHTML = "▶️ Đọc từng âm";
            } else {
                doAutoRead();
            }
        };

        document.getElementById("phonicsFullBtn").onclick = () => {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(currentItem.word.trim());
            u.lang = "en-US";
            u.rate = 0.85;
            window.speechSynthesis.speak(u);
        };

        document.getElementById("phonicsNextBtn").onclick = () => {
            isReading = false;
            window.speechSynthesis.cancel();
            this.currentIndex++;
            this.render();
        };

        // Auto-trigger khi load xong (hoạt động trên PC, mobile cũng ok vì
        // AudioContext đã được unlock từ gesture bấm "Từ tiếp" trước đó)
        if (hasContent) setTimeout(() => doAutoRead(), 400);
    },

    async renderConversationCard() {
        if (this.currentLessonData.length > 6) {
            this.currentLessonData = this.currentLessonData.slice(0, 6);
        }

        if (this.currentIndex >= this.currentLessonData.length) {
            this.endLearning();
            return;
        }

        const currentItem = this.currentLessonData[this.currentIndex];
        const mainCard = document.getElementById("mainCard");
        const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

        // 🎯 1. DANH SÁCH 20 TRAINER CHUẨN ĐỂ RANDOM (FIX LỖI ẢNH TĨNH/CHẾT LINK)
        const trainerList = [
            { id: "blue", name: "Rival Blue" }, { id: "brock", name: "Brock" }, 
            { id: "misty", name: "Misty" }, { id: "ltsurge", name: "Lt. Surge" }, 
            { id: "erika", name: "Erika" }, { id: "koga", name: "Koga" }, 
            { id: "sabrina", name: "Sabrina" }, { id: "blaine", name: "Blaine" }, 
            { id: "giovanni", name: "Giovanni" }, { id: "lance", name: "Lance" },
            { id: "steven", name: "Steven" }, { id: "wallace", name: "Wallace" }, 
            { id: "cynthia", name: "Cynthia" }, { id: "alder", name: "Alder" }, 
            { id: "iris", name: "Iris" }, { id: "diantha", name: "Diantha" }, 
            { id: "green", name: "Green" }, { id: "ethan", name: "Ethan" }, 
            { id: "lyra", name: "Lyra" }, { id: "lucas", name: "Lucas" }
        ];
        const randomTrainer = trainerList[randInt(0, trainerList.length - 1)];

        mainCard.innerHTML = `
            <div style="width: 100%; max-width: 700px; display: flex; flex-direction: column; box-sizing: border-box;">
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: #ffcb05; margin-bottom: 10px; font-weight: bold; padding: 0 4px;">
                    <span>💬 HỘI THOẠI LUYỆN PHẢN XẠ (VÒNG 3/3)</span>
                    <span>HIỆP: ${this.currentIndex + 1}/${this.currentLessonData.length}</span>
                </div>

                <div id="battle-layer" style="position: relative; width: 100%; height: 420px; background: #2c3e50; border: 3px solid #ffcb05; border-radius: 16px; overflow: hidden; margin-bottom: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">

                    <div id="pokeA" style="position: absolute; transform: translate(-50%, -50%); display: flex; align-items: flex-end; gap: 4px; pointer-events: auto; cursor: pointer; transition: all 0.3s; z-index: 1010;">
                        <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/25.gif" alt="Pikachu" style="height: 60px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));" />
                        <img src="https://play.pokemonshowdown.com/sprites/trainers/red.png" alt="Satoshi" style="height: 95px; object-fit: contain;" />
                    </div>

                    <div id="pokeB" style="position: absolute; transform: translate(-50%, -50%); display: flex; align-items: flex-end; gap: 4px; pointer-events: auto; cursor: pointer; transition: all 0.3s; z-index: 1010;">
                        <img src="https://play.pokemonshowdown.com/sprites/trainers/${randomTrainer.id}.png" onerror="this.src='https://play.pokemonshowdown.com/sprites/trainers/blue.png'" alt="${randomTrainer.name}" style="height: 95px; object-fit: contain;" />
                        <img id="enemyPkmGif" src="" alt="Enemy Pokémon" style="height: 60px; display: none; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));" />
                    </div>

                    <div id="wild-container"></div>
                    <div id="bubble-text-A" class="speech-bubble" style="display:none; position: absolute; max-width: 160px; background: #fff; color: #111; border: 2px solid #222; border-radius: 12px; padding: 8px; box-shadow: 0 6px 14px rgba(0,0,0,0.25); z-index: 1020; font-size: 14px; font-weight: 500; word-wrap: break-word;"></div>
                    <div id="bubble-text-B" class="speech-bubble" style="display:none; position: absolute; max-width: 160px; background: #fff; color: #111; border: 2px solid #222; border-radius: 12px; padding: 8px; box-shadow: 0 6px 14px rgba(0,0,0,0.25); z-index: 1020; font-size: 14px; font-weight: 500; word-wrap: break-word;"></div>
                    <div id="bubble-image-B" class="image-bubble" style="display:none; position: absolute; background: #fff; border: 2px solid #222; border-radius: 12px; padding: 6px; box-shadow: 0 6px 14px rgba(0,0,0,0.25); z-index: 1200;"></div>
                </div>

                <div id="battle-status-bar" style="background: #141622; border: 2px solid #ffcb05; padding: 14px; border-radius: 12px; text-align: center; font-weight: bold; color: #ffcb05; font-size: 0.95rem; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                    ${this.turnPhase === "ask" ? "👉 ẤN VÀO SATOSHI & PIKACHU (TRÁI) ĐỂ HỎI" : "👉 ẤN VÀO TRAINER ĐỐI THỦ (PHẢI) ĐỂ TRẢ LỜI"}
                </div>
            </div>
        `;

        const placeSpriteRandom = (el) => {
            el.style.left = randInt(22, 38) + "%";
            if (el.id === "pokeB") el.style.left = randInt(62, 78) + "%"; 
            el.style.top = randInt(58, 72) + "%"; 
        };

        const positionBubbleAbove = (bubble, sprite, offsetY = 90) => {
            bubble.style.left = `${sprite.offsetLeft}px`;
            bubble.style.top = `${sprite.offsetTop - offsetY}px`;
            bubble.style.transform = "translateX(-50%)";
        };

        const hideAllBubbles = () => {
            if(document.getElementById("bubble-text-A")) document.getElementById("bubble-text-A").style.display = "none";
            if(document.getElementById("bubble-text-B")) document.getElementById("bubble-text-B").style.display = "none";
            if(document.getElementById("bubble-image-B")) document.getElementById("bubble-image-B").style.display = "none";
        };

        // 🎯 2. HÀM LẤY HÌNH ẢNH GIF ĐỘNG TỪ POKEAPI
        const getLivePokemonGifUrl = async () => {
            try {
                const randomId = randInt(1, 151); // Giới hạn Gen 1 để tải nhanh và ổn định
                const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${randomId}`);
                const data = await response.json();
                // Truy cập sâu vào kho sprite để lấy ảnh .gif Black/White hoạt họa
                return data.sprites?.versions?.["generation-v"]?.["black-white"]?.animated?.front_default || data.sprites?.front_default || "";
            } catch (err) {
                // Dự phòng nếu lỗi mạng hoặc không có GIF: Trả về ảnh tĩnh Pikachu hoặc Bulbasaur
                return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png`;
            }
        };

        const A = document.getElementById("pokeA");
        const B = document.getElementById("pokeB");
        const enemyPkmGif = document.getElementById("enemyPkmGif");

        // Triệu hồi GIF Pokémon cho đối thủ
        const enemyPkmSrc = await getLivePokemonGifUrl();
        if (enemyPkmSrc && enemyPkmGif) {
            enemyPkmGif.src = enemyPkmSrc;
            enemyPkmGif.style.display = "block";
        }

        placeSpriteRandom(A);
        placeSpriteRandom(B);

        // Tạo các Pokémon hoang dã (Ảnh động GIF) bay nhảy xung quanh nền map
        const wildContainer = document.getElementById("wild-container");
        if (wildContainer) {
            wildContainer.innerHTML = "";
            for (let i = 0; i < 3; i++) {
                getLivePokemonGifUrl().then(src => {
                    if (!src || !document.getElementById("wild-container")) return;
                    const wildImg = document.createElement("img");
                    wildImg.src = src;
                    wildImg.style.cssText = `position: absolute; height: 40px; opacity: 0.65; transform: translate(-50%, -50%);`;
                    const side = randInt(0, 3);
                    if (side === 0) { wildImg.style.top = "10%"; wildImg.style.left = `${randInt(15, 85)}%`; }
                    else if (side === 1) { wildImg.style.top = "90%"; wildImg.style.left = `${randInt(15, 85)}%`; }
                    else if (side === 2) { wildImg.style.left = "10%"; wildImg.style.top = `${randInt(15, 85)}%`; }
                    else { wildImg.style.left = "90%"; wildImg.style.top = `${randInt(15, 85)}%`; }
                    document.getElementById("wild-container").appendChild(wildImg);
                });
            }
        }

        // Sự kiện click nhân vật A (Hỏi)
        A.onclick = async () => {
            if (this.turnPhase !== "ask") return;
            hideAllBubbles();

            const bubbleTextA = document.getElementById("bubble-text-A");
            positionBubbleAbove(bubbleTextA, A);
            bubbleTextA.style.display = "block";

            A.style.transform = "translate(-50%, -50%) scale(1.1)";
            setTimeout(() => A.style.transform = "translate(-50%, -50%) scale(1)", 200);

            this.speak(currentItem.question, true);
            this.typeText(bubbleTextA, currentItem.question, currentItem.word, () => {
                this.turnPhase = "answer";
                const statusBar = document.getElementById("battle-status-bar");
                if(statusBar) {
                    statusBar.innerText = `👉 ĐẾN LƯỢT! ẤN VÀO ${randomTrainer.name.toUpperCase()} ĐỂ TRẢ LỜI`;
                    statusBar.style.color = "#3498db";
                    statusBar.style.borderColor = "#3498db";
                }
            });
        };

        // Sự kiện click nhân vật B (Trả lời)
        B.onclick = async () => {
            if (this.turnPhase !== "answer") return;
            hideAllBubbles();

            const bubbleTextB = document.getElementById("bubble-text-B");
            const bubbleImageB = document.getElementById("bubble-image-B");

            positionBubbleAbove(bubbleTextB, B);
            bubbleTextB.style.display = "block";

            B.style.transform = "translate(-50%, -50%) scale(1.1)";
            setTimeout(() => B.style.transform = "translate(-50%, -50%) scale(1)", 200);

            this.speak(currentItem.answer, false);
            this.typeText(bubbleTextB, currentItem.answer, currentItem.word, () => {
                let imgUrl = "";
                if (typeof window.getImageFromMap === "function") {
                    imgUrl = window.getImageFromMap(currentItem.word);
                }

                if (imgUrl && bubbleImageB) {
                    bubbleImageB.innerHTML = `<img src="${imgUrl}" style="width: 50px; height: 50px; object-fit: contain; border-radius: 6px; display: block;" />`;
                    bubbleImageB.style.left = `${B.offsetLeft + 40}px`;
                    bubbleImageB.style.top = `${B.offsetTop - 40}px`;
                    bubbleImageB.style.display = "block";
                }

                setTimeout(() => {
                    hideAllBubbles();
                    this.currentIndex++;
                    this.turnPhase = "ask";
                    this.render();
                }, 2200);
            });
        };
    },

    endLearning() {
        const mainCard = document.getElementById("mainCard");
        if (mainCard) mainCard.style.display = "none";

        if (typeof window.startPokemonBattle === "function") {
            window.startPokemonBattle();
        } else {
            const quizOverlay = document.getElementById("quiz-overlay");
            if (quizOverlay) quizOverlay.style.display = "flex";
            if (window.QuizManager && typeof window.QuizManager.ask === "function") {
                window.QuizManager.ask(() => {});
            }
        }
    }
};