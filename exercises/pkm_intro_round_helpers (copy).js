/**
 * ==========================================
 * pkm_intro_round_helpers.js — LOGIC DÙNG CHUNG cho mọi game nhóm "introPresent"
 * ==========================================
 * Bất kỳ game nào thể hiện Stage A của Module 1 (flipbook, maze, sau này
 * game khác) đều cần y hệt 3 việc: đọc phần giới thiệu ("present"), tách âm
 * + bắt nói theo ("phonicsSpeak"). Tách ra đây 1 lần, mọi game import dùng
 * chung — KHÔNG chép lại logic mỗi khi thêm game mới.
 *
 * Game nào cũng phải tự chuẩn bị sẵn các phần tử DOM cần thiết rồi truyền
 * vào (xem chữ ký từng hàm) — file này không tự tạo DOM, chỉ thao tác trên
 * DOM được đưa vào, để mỗi game tự do bố trí giao diện theo ý riêng.
 *
 * SỬA LỖI ĐƠ TRÊN MOBILE: getSharedAudioCtx() giờ là ASYNC và THẬT SỰ chờ
 * audioCtx.resume() xong (bản cũ gọi resume() nhưng không await, nên trên
 * nhiều trình duyệt mobile lệnh phát âm ngay sau đó rơi vào khoảng
 * AudioContext còn "suspended" -> im lặng hoặc treo). Mọi hàm phát âm trong
 * file này (playIpa, playSwishSound, playPopSound) đều await đúng theo.
 */

import {
  speakEN, speakVI, startRecording, transcribeAudio, randomPick,
  POSITIVE_FEEDBACK, ENCOURAGE_RETRY,
} from "./all-shared.js";

export const INTRO_WORD_LINES = [
  (ord, w) => `The ${ord} word is... ${w}.`,
  (ord, w) => `Next up, number ${ord}: ${w}.`,
  (ord, w) => `Word number ${ord} is ${w}. Remember this one!`,
  (ord, w) => `Let's look at the ${ord} word — ${w}.`,
  (ord, w) => `Our ${ord} word today is ${w}.`,
  (ord, w) => `Here comes the ${ord} word: ${w}!`,
];

export function checkPercentMatchLocal(heard, target, threshold = 70) {
  const clean = s => (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const h = clean(heard), t = clean(target);
  if (!t.length) return false;
  const correct = t.filter(w => h.includes(w)).length;
  return Math.round((correct / t.length) * 100) >= threshold;
}

// ─── Đọc từng âm IPA (dùng cho tách âm) ───
let audioCtx = null;
const audioCache = new Map();

/** Trả về (và tạo nếu chưa có) AudioContext dùng chung — THẬT SỰ chờ resume()
 *  xong trước khi trả về, để tránh phát âm vào lúc context còn "suspended". */
export async function getSharedAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") {
    try { await audioCtx.resume(); } catch (e) { /* bỏ qua — vẫn trả về ctx, gọi nơi dùng tự chịu im lặng nếu có */ }
  }
  return audioCtx;
}

export async function preloadIpa(ipa) {
  const key = "ipa|" + ipa;
  if (audioCache.has(key)) return audioCache.get(key);
  try {
    const url = `https://cdn.jsdelivr.net/gh/ninjavanxuantruong/mp3vietnam2@main/${ipa}.mp3`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    let res;
    try { res = await fetch(url, { signal: controller.signal }); }
    finally { clearTimeout(timeoutId); }
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const ctx = await getSharedAudioCtx();
    const buf = await ctx.decodeAudioData(ab.slice(0));
    audioCache.set(key, buf);
    return buf;
  } catch (e) { return null; }
}

export async function playIpa(ipa) {
  const buf = await preloadIpa(ipa);
  if (!buf) return;
  const ac = await getSharedAudioCtx();
  return new Promise(resolve => {
    const src = ac.createBufferSource();
    src.buffer = buf; src.connect(ac.destination);
    src.onended = resolve;
    setTimeout(resolve, buf.duration * 1000 + 400);
    src.start();
  });
}

export async function autoReadPhonics(container) {
  const units = Array.from(container.querySelectorAll("[data-index]"));
  if (!units.length) return;
  const getIpa = u => u.querySelector("small")?.innerText.replace(/\//g, "").trim() || "";
  const allIpa = [];
  units.forEach(u => u.querySelectorAll(".sound-unit:not(.silent)").forEach(su => {
    const ipa = getIpa(su); if (ipa) allIpa.push(ipa);
  }));
  await Promise.all(allIpa.map(preloadIpa));
  for (const unit of units) {
    unit.classList.add("ph-unit-active");
    const sus = Array.from(unit.querySelectorAll(".sound-unit:not(.silent)"));
    for (const su of sus) {
      const ipa = getIpa(su);
      su.style.cssText += `border:2px solid #e74c3c!important;background:rgba(231,76,60,.3)!important;box-shadow:0 0 12px rgba(231,76,60,.8)!important;transform:scale(1.2);transition:all .15s;`;
      if (ipa) await playIpa(ipa); else await new Promise(r => setTimeout(r, 300));
      su.style.cssText = su.style.cssText
        .replace(/border:[^;]+;/, "").replace(/background:[^;]+;/, "")
        .replace(/box-shadow:[^;]+;/, "").replace(/transform:[^;]+;/, "");
      await new Promise(r => setTimeout(r, 80));
    }
    unit.classList.remove("ph-unit-active");
    await new Promise(r => setTimeout(r, 300));
  }
}

/** Đọc phần "giới thiệu từ" — không đụng DOM (chỉ phát âm thanh). */
// Cờ TEST: từ đầu tiên trong ván chơi (mỗi lần vào trang là 1 module mới,
// nên biến này tự đúng cho "lượt bắt/đọc đầu tiên") sẽ CHỈ đọc tiếng Anh,
// bỏ qua toàn bộ speakVI() -- để kiểm tra xem có phải TTS tiếng Việt gây đơ.
let _firstPresentCall = true;

/** Đọc phần "giới thiệu từ" — không đụng DOM (chỉ phát âm thanh). */
export async function readPresentSequence(round) {
  const skipVi = _firstPresentCall;
  _firstPresentCall = false;

  await speakEN(randomPick(INTRO_WORD_LINES)(round.ord, round.word), round.rate);
  await speakEN(round.word, round.rate);
  if (!skipVi) await speakVI(round.meaning, 0.9);
  if (round.ah) {
    if (round.ah.en) await speakEN(round.ah.en, round.rate);
    if (round.ah.vi && !skipVi) await speakVI(round.ah.vi, 0.9);
  }
  if (round.ai && !skipVi) await speakVI(round.ai, 0.9);
}

/** Tách âm — vẽ vào `boxEl` (phần tử DOM rỗng do game truyền vào). */
export async function readPhonicsSequence(round, boxEl) {
  boxEl.innerHTML = "";
  if (window.handleSplit) {
    try {
      await Promise.resolve(window.handleSplit(round.word.trim().toLowerCase(), boxEl, null));
      await autoReadPhonics(boxEl);
    } catch (e) {
      console.error("Lỗi tách âm:", e);
      boxEl.innerHTML = `<p style="color:#999;font-size:13px;">(không tách âm được cho "${round.word}")</p>`;
    }
  } else {
    boxEl.innerHTML = `<p style="color:#999;font-size:13px;">(chưa nạp được công cụ tách âm)</p>`;
  }
  await speakEN(round.word, round.rate);
}

/**
 * Bắt học sinh nói theo — tối đa 2 lần, luôn kết thúc (không kẹt mãi).
 * `elRefs`: { statusEl, micEl, finishBtnEl, resultEl } — game tự chuẩn bị
 * sẵn 4 phần tử DOM này (statusEl: dòng chữ trạng thái, micEl: nút mic tròn
 * — game tự thêm/bỏ class "listening"/"locked" theo ý muốn, finishBtnEl: nút
 * "Xong" để tự dừng ghi âm sớm, resultEl: hiện lại câu nhận dạng được).
 * Trả về attemptsUsed: 1 = đúng ngay lần đầu, 2 = lần 2 hoặc không đạt.
 */
export function runMicRepeat(round, elRefs) {
  const { statusEl, micEl, finishBtnEl, resultEl } = elRefs;
  const { modelText, matchText, veryLenient, rate } = round.repeat;

  return new Promise(resolve => {
    let attemptNum = 0;
    let finished = false;
    let resolved = false;

    const lockMic = value => {
      micEl.classList.toggle("locked", value);
    };

    const finish = (attempts = 2) => {
      if (resolved) return;

      resolved = true;
      finished = true;

      micEl.classList.remove("listening");
      micEl.classList.add("locked");
      finishBtnEl.style.display = "none";
      finishBtnEl.onclick = null;

      // Hiện nút/ trạng thái cho người dùng biết có thể đi tiếp
      statusEl.textContent = "✅ Đã hoàn tất. Bạn có thể bấm Tiếp theo.";

      // Quan trọng: resolve ngay, không chờ TTS
      resolve(attempts);
    };

    const safeSpeak = async text => {
      try {
        await Promise.race([
          Promise.resolve(speakEN(text, rate)),
          new Promise(resolveTimeout => setTimeout(resolveTimeout, 7000)),
        ]);
      } catch (e) {
        console.warn("Lỗi đọc TTS:", e);
      }
    };

    const recordOneAttempt = async () => {
      if (finished || resolved || attemptNum >= 2) return;

      attemptNum++;
      lockMic(true);
      micEl.classList.add("listening");
      statusEl.textContent = "🎙️ Đang ghi âm...";
      finishBtnEl.style.display = "inline-block";

      try {
        const session = await Promise.race([
          startRecording(10000),
          new Promise(resolveTimeout =>
            setTimeout(() => resolveTimeout(null), 12000)
          ),
        ]);

        if (!session) {
          resultEl.innerHTML = "🗣️ Không thể sử dụng microphone.";
          finish();
          return;
        }

        finishBtnEl.onclick = () => {
          try {
            session.stop?.();
          } catch (e) {
            console.warn("Không dừng được ghi âm:", e);
          }
        };

        const blob = await Promise.race([
          Promise.resolve(session.blob),
          new Promise(resolveTimeout =>
            setTimeout(() => resolveTimeout(null), 15000)
          ),
        ]);

        if (!blob) {
          resultEl.innerHTML = "🗣️ Không lấy được bản ghi âm.";
          finish();
          return;
        }

        finishBtnEl.style.display = "none";
        finishBtnEl.onclick = null;
        micEl.classList.remove("listening");
        statusEl.textContent = "⏳ Đang kiểm tra...";

        const transcript = await Promise.race([
          Promise.resolve(transcribeAudio(blob)),
          new Promise(resolveTimeout =>
            setTimeout(() => resolveTimeout(null), 15000)
          ),
        ]);

        const isCorrect = transcript === null
          ? false
          : veryLenient
            ? Boolean(transcript.trim())
            : checkPercentMatchLocal(transcript, matchText, 70);

        resultEl.innerHTML = transcript
          ? `🗣️ "<b>${transcript}</b>"`
          : "🗣️ Chưa nghe rõ hoặc không nhận dạng được.";

        if (isCorrect) {
          statusEl.textContent = "🎉 Chính xác! Bạn có thể bấm Tiếp theo.";

          // Mở khóa ngay, không chờ đọc lời khen
          finish(attemptNum);

          // Đọc lời khen ở nền, có lỗi cũng không ảnh hưởng
          safeSpeak(randomPick(POSITIVE_FEEDBACK));
          return;
        }

        if (attemptNum < 2) {
          statusEl.textContent =
            "💡 Chưa nghe rõ. Hãy nói lại hoặc bấm Tiếp theo.";
          lockMic(false);

          // Cho phép nói lần 2 nếu mic vẫn dùng được
          return;
        }

        statusEl.textContent =
          "👍 Đã đủ lượt thử. Bạn có thể bấm Tiếp theo.";
        finish(2);

      } catch (e) {
        console.error("Lỗi microphone:", e);

        resultEl.innerHTML =
          "🗣️ Không thể ghi âm hoặc nhận dạng giọng nói.";

        statusEl.textContent =
          "⚠️ Mic gặp lỗi. Bạn vẫn có thể bấm Tiếp theo.";

        finish(2);
      }
    };

    micEl.onclick = () => {
      if (
        finished ||
        resolved ||
        attemptNum >= 2 ||
        micEl.classList.contains("listening")
      ) {
        return;
      }

      recordOneAttempt();
    };

    (async () => {
      statusEl.textContent = "🔊 Nghe mẫu...";

      if (veryLenient) {
        await safeSpeak(`${matchText}. ${matchText}.`);
      } else {
        await safeSpeak(modelText);
      }

      if (finished || resolved) return;

      statusEl.textContent = "🎤 Đến lượt bạn nói!";
      lockMic(false);

      // Tự động ghi âm
      recordOneAttempt();
    })().catch(e => {
      console.error("Lỗi khởi tạo phần nói:", e);
      resultEl.innerHTML = "🗣️ Không thể khởi động phần ghi âm.";
      statusEl.textContent =
        "⚠️ Không thể dùng mic. Bạn vẫn có thể bấm Tiếp theo.";
      finish(2);
    });
  });
}


/** Tiếng "xoẹt" ngắn — dùng cho lật trang (flipbook) hoặc bất kỳ hiệu ứng
 *  chuyển cảnh nhanh nào cần 1 tiếng động nhẹ, không cần file mp3 riêng. */
export async function playSwishSound() {
  try {
    const ctx = await getSharedAudioCtx();
    const now = ctx.currentTime;
    const bufSize = ctx.sampleRate * 0.25;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(3000, now + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    noise.start(now);
  } catch (e) { /* im lặng bỏ qua nếu trình duyệt không hỗ trợ */ }
}

/** Tiếng "boong/pop" ngắn — dùng khi ăn được 1 ảnh trong maze. */
export async function playPopSound() {
  try {
    const ctx = await getSharedAudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1040, now + 0.12);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.22);
  } catch (e) { /* im lặng bỏ qua */ }
}