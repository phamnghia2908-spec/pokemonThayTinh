// file: test.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

import { phonicsBank } from "./phonics-bank.js";

const firebaseConfig = {
  apiKey: "AIzaSyBQ1pPmSdBV8M8YdVbpKhw_DOetmzIMwXU",
  authDomain: "lop-hoc-thay-tinh.firebaseapp.com",
  projectId: "lop-hoc-thay-tinh",
  storageBucket: "lop-hoc-thay-tinh.firebasestorage.app",
  messagingSenderId: "391812475288",
  appId: "1:391812475288:web:ca4c275ac776d69deb23ed"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Sheets
const SHEET_BAI_HOC =
  "https://docs.google.com/spreadsheets/d/1xdGIaXekYFQqm1K6ZZyX5pcrmrmjFdSgTJeW27yZJmQ/gviz/tq?tqx=out:json";
const SHEET_TU_VUNG =
  "https://docs.google.com/spreadsheets/d/1KaYYyvkjFxVVobRHNs9tDxW7S79-c5Q4mWEKch6oqks/gviz/tq?tqx=out:json";

/* Cột trong sheet Từ vựng:
   B(1)=mã bài dạng "lop-bai-phan" (dùng để nhóm theo bài & tính độ liền kề)
   C(2)=word  D(3)=vi_chunks  E(4)=en_chunks  F(5)=topic nhỏ  G(6)=topic lớn (chủ đề)
   I(8)=câu thuyết trình  J(9)=câu hỏi  L(11)=câu trả lời  Y(24)=nghĩa            */

/* ================= Utils ================= */
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function esc(s) {
  return (s || "").toString().replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function pickDistractors(pool, preferPredicate, n) {
  const unique = [...new Set(pool)].filter(Boolean);
  const preferred = shuffle(unique.filter(preferPredicate));
  let chosen = preferred.slice(0, n);
  if (chosen.length < n) {
    const rest = shuffle(unique.filter(x => !chosen.includes(x))).slice(0, n - chosen.length);
    chosen = chosen.concat(rest);
  }
  return chosen;
}
function rowLessonRaw(r) { return r.c[1]?.v?.toString().trim() || ""; }
function rowLessonKey(r) {
  const raw = rowLessonRaw(r);
  const parts = raw.split("-");
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : raw || null;
}

/* ================= Helpers: sheets ================= */
async function fetchGviz(url) {
  const res = await fetch(url);
  const txt = await res.text();
  return JSON.parse(txt.substring(47).slice(0, -2));
}

async function fetchAllClassIds() {
  const json = await fetchGviz(SHEET_BAI_HOC);
  const rows = json.table.rows;
  const set = new Set();
  rows.forEach(r => {
    const lop = r.c[0]?.v?.toString().trim();
    if (lop) set.add(lop);
  });
  return [...set].sort();
}

async function fetchMaxLessonCode(classId) {
  const json = await fetchGviz(SHEET_BAI_HOC);
  const rows = json.table.rows;
  const baiList = rows
    .map(r => {
      const lop = r.c[0]?.v?.toString().trim();
      const bai = r.c[2]?.v?.toString().trim();
      return lop === classId ? parseInt(bai, 10) : null;
    })
    .filter(n => Number.isFinite(n));
  if (baiList.length === 0) return 0;
  return Math.max(...baiList);
}

/* ---- Từ vựng: hàm dùng chung để xây byWord / wordInfo từ 1 tập rows đã lọc sẵn ---- */
function buildVocabStructures(filtered) {
  const byWord = new Map();
  filtered.forEach(r => {
    const word = r.c[2]?.v?.toString().trim();
    if (!word) return;
    const question = r.c[9]?.v?.toString().trim() || "";
    const answer   = r.c[11]?.v?.toString().trim() || "";
    const meaning  = r.c[24]?.v?.toString().trim() || "";
    byWord.set(word, { question, answer, meaning });
  });

  const wordInfo = new Map();
  filtered.forEach(r => {
    const w = r.c[2]?.v?.toString().trim();
    if (!w || wordInfo.has(w)) return;
    wordInfo.set(w, {
      lessonKey: rowLessonKey(r),
      presentation: r.c[8]?.v?.toString().trim() || "",
      question: r.c[9]?.v?.toString().trim() || "",
      answer: r.c[11]?.v?.toString().trim() || "",
      meaning: r.c[24]?.v?.toString().trim() || "",
      viChunks: tokenizeChunks(r.c[3]?.v?.toString().trim()),
      enChunks: tokenizeChunks(r.c[4]?.v?.toString().trim()),
      topicSmall: r.c[5]?.v?.toString().trim() || "",
      topicBig: r.c[6]?.v?.toString().trim() || ""
    });
  });

  return { filteredRows: filtered, byWord, wordInfo };
}

async function fetchVocabJson() {
  const json = await fetchGviz(SHEET_TU_VUNG);
  return json.table.rows.slice(1);
}

/* Chế độ 1: THEO LỚP — lấy toàn bộ từ vựng có mã bài <= bài mới nhất của lớp */
async function fetchVocabRowsByLessonCode(maxLessonCode) {
  const rows = await fetchVocabJson();
  const filtered = rows.filter(r => {
    const rawCode = r.c[1]?.v?.toString().trim();
    const word = r.c[2]?.v?.toString().trim();
    const meaning = r.c[24]?.v?.toString().trim();
    const normalizedCode = parseInt(rawCode?.replace(/\D/g, ""), 10);
    return normalizedCode && normalizedCode <= maxLessonCode && !!word && !!meaning;
  });
  return buildVocabStructures(filtered);
}

/* Chế độ 2: THEO DÃY BÀI — lọc theo lớp + số bài (cột B) nằm trong khoảng [from, to] */
async function fetchVocabRowsByLessonRange(fromUnit, toUnit) {
  const rows = await fetchVocabJson();
  const filtered = rows.filter(r => {
    const raw = rowLessonRaw(r);
    const word = r.c[2]?.v?.toString().trim();
    const meaning = r.c[24]?.v?.toString().trim();
    if (!raw || !word || !meaning) return false;
    const unitNum = normalizeUnitId(raw);
    if (!unitNum) return false;
    return unitNum >= fromUnit && unitNum <= toUnit;
  });
  return buildVocabStructures(filtered);
}

/* Chế độ 3: THEO CHỦ ĐỀ — lọc theo cột G (topic lớn), không giới hạn lớp */
async function fetchVocabRowsByTopics(topics) {
  const rows = await fetchVocabJson();
  const topicSet = new Set(topics);
  const filtered = rows.filter(r => {
    const word = r.c[2]?.v?.toString().trim();
    const meaning = r.c[24]?.v?.toString().trim();
    const topicBig = r.c[6]?.v?.toString().trim();
    if (!word || !meaning || !topicBig) return false;
    return topicSet.has(topicBig);
  });
  return buildVocabStructures(filtered);
}

async function fetchAllTopics() {
  const rows = await fetchVocabJson();
  const set = new Set();
  rows.forEach(r => {
    const t = r.c[6]?.v?.toString().trim();
    if (t) set.add(t);
  });
  return [...set].sort();
}

/* Danh sách các số bài (cột B) có trong 1 lớp, dùng để đổ vào 2 dropdown "Từ bài" / "Đến bài" */
async function fetchAllLessonEntries() {
  const rows = await fetchVocabJson();
  const seen = new Map(); // unitNum -> tên bài đầy đủ (vd "3-11-2")
  rows.forEach(r => {
    const raw = rowLessonRaw(r);
    if (!raw) return;
    const unitNum = normalizeUnitId(raw);
    if (!unitNum) return;
    if (!seen.has(unitNum)) seen.set(unitNum, raw);
  });
  return [...seen.entries()].sort((a, b) => a[0] - b[0]); // [[unitNum, tenBai], ...]
}

/* ================= Builders: MCQ (3 biến thể) ================= */
function pickUniqueWords(filteredRows, count) {
  const uniqueWords = [];
  const seen = new Set();
  const shuffled = shuffle(filteredRows);
  for (const r of shuffled) {
    const w = r.c[2]?.v?.toString().trim();
    if (w && !seen.has(w)) {
      seen.add(w);
      uniqueWords.push(w);
      if (uniqueWords.length >= count) break;
    }
  }
  return uniqueWords;
}

function buildMcq(filteredRows, pickedWords, byWord, wordInfo) {
  const allMeanings = filteredRows.map(r => r.c[24]?.v?.toString().trim()).filter(Boolean);
  const allWords = filteredRows.map(r => r.c[2]?.v?.toString().trim()).filter(Boolean);

  return pickedWords.map((word, idx) => {
    const meaning = byWord.get(word)?.meaning || "";
    const info = wordInfo.get(word) || {};
    const candidates = ["en2vi", "vi2en"];
    if (info.presentation && info.presentation.toLowerCase().includes(word.toLowerCase())) candidates.push("fillblank");
    const variant = candidates[Math.floor(Math.random() * candidates.length)];

    if (variant === "vi2en") {
      const pool = allWords.filter(w => w !== word);
      const distractors = pickDistractors(pool, w2 => wordInfo.get(w2)?.lessonKey !== info.lessonKey, 3);
      const choices = shuffle([...distractors, word]);
      return { id: `q${idx + 1}`, variant, word, prompt: `Từ nào có nghĩa là "${meaning}"?`, choices, correctIndex: choices.indexOf(word) };
    }

    if (variant === "fillblank") {
      const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const blanked = info.presentation.replace(re, "ـــــ");
      const pool = allWords.filter(w => w !== word);
      const distractors = pickDistractors(pool, w2 => wordInfo.get(w2)?.lessonKey !== info.lessonKey, 3);
      const choices = shuffle([...distractors, word]);
      return { id: `q${idx + 1}`, variant, word, prompt: `Điền từ còn thiếu: "${blanked}"`, choices, correctIndex: choices.indexOf(word) };
    }

    const pool = allMeanings.filter(m => m && m !== meaning);
    const distractors = pickDistractors(pool, () => true, 3);
    const choices = shuffle([...distractors, meaning]);
    return { id: `q${idx + 1}`, variant: "en2vi", word, prompt: `Nghĩa của "${word}" là gì?`, choices, correctIndex: choices.indexOf(meaning) };
  }).filter(q => q.choices?.length === 4 && q.correctIndex >= 0);
}

/* ================= Builders: Listening (4 mức) ================= */
function buildListening(filteredRows, pickedWords, byWord, wordInfo) {
  const allWords = filteredRows.map(r => r.c[2]?.v?.toString().trim()).filter(Boolean);

  return pickedWords.map((word, idx) => {
    const info = wordInfo.get(word) || {};
    const options = ["word"];
    if (info.presentation) options.push("presentation");
    if (info.question && info.answer) { options.push("qa"); options.push("dialogue"); }
    const variant = options[Math.floor(Math.random() * options.length)];
    const pool = allWords.filter(w => w !== word);

    if (variant === "presentation") {
      const distractors = pickDistractors(pool, w2 => wordInfo.get(w2)?.lessonKey !== info.lessonKey, 3);
      const choices = shuffle([...distractors, word]);
      return { id: `lq${idx + 1}`, variant, prompt: "Nghe đoạn và cho biết từ chính vừa nhắc tới là gì?", audioText: info.presentation, choices, correctIndex: choices.indexOf(word) };
    }

    if (variant === "qa") {
      const distractors = pickDistractors(pool, w2 => wordInfo.get(w2)?.lessonKey !== info.lessonKey, 3);
      const choices = shuffle([...distractors, word]);
      return { id: `lq${idx + 1}`, variant, prompt: "Nghe đoạn hội thoại và cho biết đang nói về từ nào?", audioText: `${info.question}. ${info.answer}.`, choices, correctIndex: choices.indexOf(word) };
    }

    if (variant === "dialogue") {
      const distractorPool = allWords.filter(w => {
        const wi = wordInfo.get(w);
        return w !== word && wi?.question && wi?.answer && wi.lessonKey !== info.lessonKey;
      });
      if (distractorPool.length) {
        const distractorWord = distractorPool[Math.floor(Math.random() * distractorPool.length)];
        const dInfo = wordInfo.get(distractorWord);
        const order = shuffle([
          { w: word, text: `${info.question}. ${info.answer}.` },
          { w: distractorWord, text: `${dInfo.question}. ${dInfo.answer}.` }
        ]);
        const audioText = order.map(x => x.text).join(" ");
        const firstWord = order[0].w;
        const others = allWords.filter(w => w !== word && w !== distractorWord);
        const extra = pickDistractors(others, () => true, 2);
        const choices = shuffle([...new Set([word, distractorWord, ...extra])]).slice(0, 4);
        if (!choices.includes(firstWord)) choices[0] = firstWord;
        return {
          id: `lq${idx + 1}`, variant, prompt: "Nghe đoạn hội thoại, từ nào được nhắc đến ĐẦU TIÊN?",
          audioText, choices, correctIndex: choices.indexOf(firstWord)
        };
      }
      // không đủ dữ liệu -> rơi về "qa"
      const distractors = pickDistractors(pool, w2 => wordInfo.get(w2)?.lessonKey !== info.lessonKey, 3);
      const choices = shuffle([...distractors, word]);
      return { id: `lq${idx + 1}`, variant: "qa", prompt: "Nghe đoạn hội thoại và cho biết đang nói về từ nào?", audioText: `${info.question}. ${info.answer}.`, choices, correctIndex: choices.indexOf(word) };
    }

    const distractors = pickDistractors(pool, w2 => wordInfo.get(w2)?.lessonKey !== info.lessonKey, 3);
    const choices = shuffle([...distractors, word]);
    return { id: `lq${idx + 1}`, variant: "word", prompt: "Nghe và chọn từ đúng", audioText: word, choices, correctIndex: choices.indexOf(word) };
  });
}

/* ================= Builders: Ghép câu (J/L theo từ) ================= */
function normSentence(s) {
  return (s || "").toLowerCase().replace(/[.,;'\)\(]/g, "").replace(/\s+/g, " ").trim();
}
function tokenizeWords(answer) { return normSentence(answer).split(" ").filter(Boolean); }
function buildSentence(filteredRows, count) {
  const items = [];
  const seen = new Set();
  filteredRows.forEach(r => {
    const qRaw = r.c[9]?.v?.toString().trim();
    const aRaw = r.c[11]?.v?.toString().trim();
    if (!qRaw || !aRaw) return;
    const aNorm = normSentence(aRaw);
    if (seen.has(aNorm)) return;
    seen.add(aNorm);
    const tokens = tokenizeWords(aRaw);
    if (tokens.length > 1) items.push({ question: qRaw, answer: aRaw, tokens });
  });
  const picked = shuffle(items).slice(0, count);
  return picked.map((it, idx) => ({ id: `s${idx + 1}`, question: it.question, answer: it.answer, tokens: it.tokens }));
}

/* ================= Builders: Dịch theo cụm (D/E) ================= */
function tokenizeChunks(raw) {
  return (raw || "").split("/").map(s => s.trim()).filter(Boolean);
}
function buildChunkTranslation(wordInfo, count) {
  const rows = [...wordInfo.values()].filter(v => v.viChunks.length > 1 && v.viChunks.length === v.enChunks.length);
  const picked = shuffle(rows).slice(0, count);
  return picked.map((it, idx) => {
    const variant = Math.random() < 0.5 ? "order" : "match";
    if (variant === "order") {
      return { id: `c${idx + 1}`, variant, viChunks: it.viChunks, enChunks: it.enChunks };
    }
    return {
      id: `c${idx + 1}`, variant,
      pairs: it.enChunks.map((en, i) => ({ left: en, right: it.viChunks[i] }))
    };
  });
}

/* ================= Builders: Nối câu hỏi – câu trả lời ================= */
function buildMatching(filteredRows, count) {
  const pool = filteredRows.filter(r => r.c[9]?.v && r.c[11]?.v);
  const shuffled = shuffle(pool);
  const seen = new Set();
  const pairs = [];
  for (const r of shuffled) {
    const q = r.c[9].v.toString().trim();
    const a = r.c[11].v.toString().trim();
    if (!q || !a || seen.has(q)) continue;
    seen.add(q);
    pairs.push({ left: q, right: a });
    if (pairs.length >= count) break;
  }
  return pairs.length >= 2 ? { pairs } : null;
}

/* ================= Builders: Đọc hiểu ================= */
function buildReading(wordInfo, count) {
  const eligible = [...wordInfo.entries()].filter(([, info]) => info.presentation && info.question && info.answer);
  const picked = shuffle(eligible).slice(0, count);
  if (!picked.length) return null;

  const paragraph = picked.map(([, info]) => info.presentation).join(" ");
  const allAnswers = [...wordInfo.values()].map(v => v.answer).filter(Boolean);

  const questions = picked.map(([word, info], idx) => {
    const pool = allAnswers.filter(a => a && a !== info.answer);
    const distractors = pickDistractors(pool, () => true, 3);
    const choices = shuffle([...distractors, info.answer]);
    return { id: `r${idx + 1}`, word, prompt: info.question, choices, correctIndex: choices.indexOf(info.answer) };
  }).filter(q => q.correctIndex >= 0);

  return { paragraph, questions };
}

/* ================= Builders: Tìm từ khác chủ đề ================= */
function buildOddOneOut(filteredRows, count) {
  const items = filteredRows.map(r => {
    const word = r.c[2]?.v?.toString().trim();
    const raw = rowLessonRaw(r);
    const parts = raw.split("-");
    const topicSmall = r.c[5]?.v?.toString().trim();
    const topicBig = r.c[6]?.v?.toString().trim();
    if (!word || parts.length < 2 || !topicSmall || !topicBig) return null;
    return { word, cls: parts[0], lessonNum: parseInt(parts[1], 10) || 0, lessonKey: `${parts[0]}-${parts[1]}`, topicSmall, topicBig };
  }).filter(Boolean);

  const byLesson = {};
  items.forEach(it => { (byLesson[it.lessonKey] ||= []).push(it); });

  const candidateGroups = [];
  Object.values(byLesson).forEach(words => {
    const byTopic = {};
    words.forEach(w => { (byTopic[w.topicSmall] ||= []).push(w); });
    Object.values(byTopic).forEach(arr => {
      const uniqueWords = [...new Map(arr.map(w => [w.word, w])).values()];
      if (uniqueWords.length >= 3) candidateGroups.push(uniqueWords);
    });
  });

  const questions = [];
  for (const group of shuffle(candidateGroups)) {
    if (questions.length >= count) break;
    const main = shuffle(group).slice(0, 3);
    const ref = main[0];
    const distractorPool = items.filter(it =>
      it.cls === ref.cls &&
      Math.abs(it.lessonNum - ref.lessonNum) >= 2 &&
      it.topicSmall !== ref.topicSmall &&
      it.topicBig !== ref.topicBig
    );
    if (!distractorPool.length) continue;
    const distractor = distractorPool[Math.floor(Math.random() * distractorPool.length)];
    const choices = shuffle([...main.map(w => w.word), distractor.word]);
    questions.push({
      id: `o${questions.length + 1}`,
      prompt: "Từ nào KHÔNG cùng chủ đề với 3 từ còn lại?",
      choices, correctIndex: choices.indexOf(distractor.word)
    });
  }
  return questions;
}

/* ================= Builder: Speaking (paragraph) ================= */
function normalizeUnitId(unitStr) {
  if (!unitStr) return 0;
  const parts = unitStr.split("-");
  if (parts.length < 3) return 0;
  const [cls, lesson, part] = parts;
  return parseInt(cls) * 1000 + parseInt(lesson) * 10 + parseInt(part);
}
function buildSpeaking(filteredRows, count) {
  const allItems = filteredRows.map(r => {
    const lessonName = r.c[1]?.v?.toString().trim() || "";
    const presentation = r.c[8]?.v?.toString().trim() || "";
    const unitNum = normalizeUnitId(lessonName);
    return { lessonName, unitNum, presentation };
  }).filter(it => it.lessonName && it.presentation);

  const unitMap = {};
  allItems.forEach(it => { (unitMap[it.lessonName] ||= []).push(it); });

  const pickedUnits = shuffle(Object.keys(unitMap)).slice(0, count);
  const selectedItems = pickedUnits.map(u => {
    const rows = unitMap[u];
    return rows[Math.floor(Math.random() * rows.length)];
  });
  selectedItems.sort((a, b) => a.unitNum - b.unitNum);

  const paragraph = selectedItems.map(it => it.presentation).join(". ").replace(/\s+\./g, ".").trim();
  const finalParagraph = paragraph ? (paragraph.endsWith(".") ? paragraph : paragraph + ".") : "";
  return { paragraph: finalParagraph, count: selectedItems.length };
}

/* ================= Builder: Phonics (IPA) ================= */
function buildPhonics(bank, count) {
  const filtered = bank.filter(it => !["unit7", "unit8", "unit9", "unit10", "unit11"].includes(it.unit));
  const allIpa = [...new Set(filtered.map(it => it.ipa).filter(Boolean))];
  const picked = shuffle(filtered).slice(0, count);
  return picked.map((item, idx) => {
    const correct = item.ipa;
    const wrongChoices = shuffle(allIpa.filter(ipa => ipa !== correct)).slice(0, 3);
    const choices = shuffle([...wrongChoices, correct]);
    return { id: `p${idx + 1}`, word: item.word, prompt: `IPA của từ "${item.word}" là gì?`, choices, correctIndex: choices.indexOf(correct) };
  });
}

function makeDocId(classId) {
  return `test-${classId}`;
}
function formatTodayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

/* ================= Text-to-speech ================= */
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.92;
  window.speechSynthesis.speak(u);
}

/* ================= Word-match scoring (speaking) ================= */
function wordMatch(targetText, spokenText) {
  const t = normSentence(targetText).split(" ").filter(Boolean);
  const s = normSentence(spokenText).split(" ").filter(Boolean);
  const pool = {};
  s.forEach(w => { pool[w] = (pool[w] || 0) + 1; });
  let matched = 0;
  const matchArr = t.map(w => {
    if (pool[w] > 0) { pool[w]--; matched++; return true; }
    return false;
  });
  return { fraction: t.length ? matched / t.length : 0, matchArr, targetWords: t };
}

/* ================= Tabs ================= */
const tabs = document.querySelectorAll(".tab");
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
    btn.classList.add("active"); btn.setAttribute("aria-selected", "true");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(btn.dataset.view).classList.add("active");
  });
});

/* ================= Class picker ================= */
const classSelect = document.getElementById("classSelect");
(async function initClasses() {
  try {
    const ids = await fetchAllClassIds();
    classSelect.innerHTML = ids.length
      ? ids.map(id => `<option value="${esc(id)}">${esc(id)}</option>`).join("")
      : `<option value="">— không có lớp —</option>`;
  } catch (e) {
    console.error(e);
    classSelect.innerHTML = `<option value="">— lỗi tải lớp —</option>`;
  }
})();

/* ================= Compose mode switch (theo lớp / dãy bài / chủ đề) ================= */
let composeMode = "class";
const modeButtons = document.querySelectorAll(".mode-btn");
modeButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    modeButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    composeMode = btn.dataset.mode;
    document.querySelectorAll(".mode-panel").forEach(p => {
      p.classList.toggle("hidden", p.dataset.modePanel !== composeMode);
    });
  });
});

/* ---- Theo chủ đề: đổ danh sách chủ đề (cột G) vào topicSelect ---- */
const topicSelect = document.getElementById("topicSelect");
(async function initTopics() {
  try {
    const topics = await fetchAllTopics();
    topicSelect.innerHTML = topics.length
      ? topics.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")
      : `<option value="">— không có chủ đề —</option>`;
  } catch (e) {
    console.error(e);
    topicSelect.innerHTML = `<option value="">— lỗi tải chủ đề —</option>`;
  }
})();
function getSelectedTopics() {
  return [...topicSelect.selectedOptions].map(o => o.value).filter(Boolean);
}

/* ---- Theo dãy bài: 2 dropdown "Từ bài" / "Đến bài", đổ theo lớp đang chọn ---- */
const rangeFromSelect = document.getElementById("rangeFromSelect");
const rangeToSelect = document.getElementById("rangeToSelect");

async function loadLessonRangeOptions() {
  const loadingHtml = `<option value="">— đang tải —</option>`;
  rangeFromSelect.innerHTML = loadingHtml;
  rangeToSelect.innerHTML = loadingHtml;
  try {
    const entries = await fetchAllLessonEntries(); // [[unitNum, tenBai], ...]
    const optionsHtml = entries.length
      ? entries.map(([unitNum, name]) => `<option value="${unitNum}">${esc(name)}</option>`).join("")
      : `<option value="">— chưa có bài —</option>`;
    rangeFromSelect.innerHTML = optionsHtml;
    rangeToSelect.innerHTML = optionsHtml;
    if (entries.length) {
      rangeFromSelect.value = String(entries[0][0]);
      rangeToSelect.value = String(entries[entries.length - 1][0]);
    }
  } catch (e) {
    console.error(e);
    const errHtml = `<option value="">— lỗi tải danh sách bài —</option>`;
    rangeFromSelect.innerHTML = errHtml;
    rangeToSelect.innerHTML = errHtml;
  }
}
loadLessonRangeOptions();

/* ================= COMPOSE: generate / preview / save ================= */
let currentDraft = null;

const generateBtn = document.getElementById("generateBtn");
const saveBtn = document.getElementById("saveBtn");
const composeStatus = document.getElementById("composeStatus");
const draftPreview = document.getElementById("draftPreview");

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}
function numVal(id) { return parseInt(document.getElementById(id).value, 10) || 0; }

generateBtn.addEventListener("click", async () => {
  const classId = classSelect.value;
  if (!classId) { setStatus(composeStatus, "⚠️ Hãy chọn lớp trước.", "err"); return; }

  const counts = {
    mcq: numVal("mcqCount"),
    listening: numVal("listeningCount"),
    pronunciation: numVal("pronunciationCount"),
    sentence: numVal("sentenceCount"),
    speaking: numVal("speakingCount"),
    reading: numVal("readingCount"),
    chunk: numVal("chunkCount"),
    matching: numVal("matchingCount"),
    oddOneOut: numVal("oddOneOutCount")
  };

  generateBtn.disabled = true;
  saveBtn.disabled = true;
  setStatus(composeStatus, "⏳ Đang tạo đề...", "");
  draftPreview.classList.add("hidden");

  try {
    let vocabData;

    if (composeMode === "range") {
      const from = parseInt(rangeFromSelect.value, 10);
      const to = parseInt(rangeToSelect.value, 10);
      if (!Number.isFinite(from) || !Number.isFinite(to)) {
        setStatus(composeStatus, "⚠️ Hãy chọn \"Từ bài\" và \"Đến bài\".", "err");
        return;
      }
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      vocabData = await fetchVocabRowsByLessonRange(lo, hi);
    } else if (composeMode === "topic") {
      const topics = getSelectedTopics();
      if (!topics.length) {
        setStatus(composeStatus, "⚠️ Hãy chọn ít nhất 1 chủ đề.", "err");
        return;
      }
      vocabData = await fetchVocabRowsByTopics(topics);
    } else {
      const maxLesson = await fetchMaxLessonCode(classId);
      if (!maxLesson) {
        setStatus(composeStatus, "⚠️ Không tìm thấy bài học hợp lệ cho lớp đã chọn.", "err");
        return;
      }
      vocabData = await fetchVocabRowsByLessonCode(maxLesson);
    }

    const { filteredRows, byWord, wordInfo } = vocabData;
    if (!filteredRows.length) {
      setStatus(composeStatus, "⚠️ Không tìm thấy từ vựng phù hợp với lựa chọn này.", "err");
      return;
    }

    const pickedForMcq = pickUniqueWords(filteredRows, counts.mcq);
    const pickedForListening = pickUniqueWords(filteredRows, counts.listening);

    currentDraft = {
      classId,
      mcq: buildMcq(filteredRows, pickedForMcq, byWord, wordInfo),
      listening: buildListening(filteredRows, pickedForListening, byWord, wordInfo),
      sentence: buildSentence(filteredRows, counts.sentence),
      speaking: buildSpeaking(filteredRows, counts.speaking),
      pronunciation: buildPhonics(phonicsBank, counts.pronunciation),
      reading: buildReading(wordInfo, counts.reading),
      chunk: buildChunkTranslation(wordInfo, counts.chunk),
      matching: buildMatching(filteredRows, counts.matching),
      oddOneOut: buildOddOneOut(filteredRows, counts.oddOneOut)
    };

    renderDraftPreview(currentDraft);
    saveBtn.disabled = false;
    setStatus(composeStatus, "✅ Đã tạo đề — xem thử bên dưới. Không ưng thì Tạo đề lại.", "ok");
  } catch (e) {
    console.error(e);
    setStatus(composeStatus, "❌ Lỗi khi tạo đề.", "err");
  } finally {
    generateBtn.disabled = false;
  }
});

function renderDraftPreview(draft) {
  let html = `<div class="paper-head">
      <h2>📘 Đề thử — Lớp ${esc(draft.classId)}</h2>
      <div class="paper-meta">Bản xem trước (chưa lưu) — hiển thị kèm đáp án để giáo viên kiểm tra</div>
    </div>`;

  html += previewMcqLike("📝 Trắc nghiệm nghĩa từ", draft.mcq);
  html += previewListening(draft.listening);
  html += previewSentence(draft.sentence);
  html += previewChunk(draft.chunk);
  html += previewMatching(draft.matching);
  html += previewOddOneOut(draft.oddOneOut);
  html += previewSpeaking(draft.speaking);
  html += previewMcqLike("🔊 Phát âm (IPA)", draft.pronunciation);
  html += previewReading(draft.reading); // đọc hiểu để cuối cùng

  draftPreview.innerHTML = html;
  draftPreview.classList.remove("hidden");
}

function previewMcqLike(title, items) {
  if (!items?.length) return "";
  let html = `<div class="section-block"><div class="section-title">${title} <span class="eyebrow">${items.length} câu</span></div>`;
  items.forEach((q, i) => {
    html += `<div class="q"><div class="q-prompt">${i + 1}. ${esc(q.prompt)} ${q.variant ? `<span class="topic-tag">[${q.variant}]</span>` : ""}</div>
      <div class="key-choices">${q.choices.map((c, ci) => `<span class="${ci === q.correctIndex ? "right" : ""}">${String.fromCharCode(65 + ci)}. ${esc(c)}</span>`).join(" &nbsp;·&nbsp; ")}</div></div>`;
  });
  return html + `</div>`;
}
function previewListening(items) {
  if (!items?.length) return "";
  let html = `<div class="section-block"><div class="section-title">🎧 Nghe <span class="eyebrow">${items.length} câu</span></div>`;
  items.forEach((q, i) => {
    html += `<div class="q"><div class="q-prompt">${i + 1}. [${q.variant}] ${esc(q.prompt)}</div>
      <div class="key-answer">Nội dung đọc: "${esc(q.audioText)}"</div>
      <div class="key-choices">${q.choices.map((c, ci) => `<span class="${ci === q.correctIndex ? "right" : ""}">${String.fromCharCode(65 + ci)}. ${esc(c)}</span>`).join(" &nbsp;·&nbsp; ")}</div></div>`;
  });
  return html + `</div>`;
}
function previewSentence(items) {
  if (!items?.length) return "";
  let html = `<div class="section-block"><div class="section-title">🧩 Ghép câu <span class="eyebrow">${items.length} câu</span></div>`;
  items.forEach((q, i) => {
    html += `<div class="q"><div class="q-prompt">${i + 1}. ${esc(q.question)}</div><div class="key-answer">Đáp án: ${esc(q.answer)}</div></div>`;
  });
  return html + `</div>`;
}
function previewChunk(items) {
  if (!items?.length) return "";
  let html = `<div class="section-block"><div class="section-title">🔗 Dịch theo cụm <span class="eyebrow">${items.length} câu</span></div>`;
  items.forEach((q, i) => {
    if (q.variant === "order") {
      html += `<div class="q"><div class="q-prompt">${i + 1}. [sắp xếp] ${esc(q.viChunks.join(" / "))}</div>
        <div class="key-answer">Đáp án: ${esc(q.enChunks.join(" / "))}</div></div>`;
    } else {
      html += `<div class="q"><div class="q-prompt">${i + 1}. [ghép cặp]</div>
        <div class="key-answer">${q.pairs.map(p => `${esc(p.left)} = ${esc(p.right)}`).join(" &nbsp;|&nbsp; ")}</div></div>`;
    }
  });
  return html + `</div>`;
}
function previewMatching(m) {
  if (!m?.pairs?.length) return "";
  return `<div class="section-block"><div class="section-title">➖ Nối câu hỏi – câu trả lời <span class="eyebrow">${m.pairs.length} cặp</span></div>
    <div class="q">${m.pairs.map(p => `<div class="key-answer">${esc(p.left)}  →  ${esc(p.right)}</div>`).join("")}</div></div>`;
}
function previewOddOneOut(items) {
  if (!items?.length) return "";
  let html = `<div class="section-block"><div class="section-title">🧭 Tìm từ khác chủ đề <span class="eyebrow">${items.length} câu</span></div>`;
  items.forEach((q, i) => {
    html += `<div class="q"><div class="q-prompt">${i + 1}. ${q.choices.map((c, ci) => ci === q.correctIndex ? `<strong class="topic-tag">[${esc(c)}]</strong>` : esc(c)).join(" / ")}</div></div>`;
  });
  return html + `</div>`;
}
function previewReading(r) {
  if (!r?.paragraph) return "";
  let html = `<div class="section-block"><div class="section-title">📖 Đọc hiểu <span class="eyebrow">${r.questions.length} câu hỏi</span></div>
    <div class="q"><div class="q-prompt">${esc(r.paragraph)}</div></div>`;
  r.questions.forEach((q, i) => {
    html += `<div class="q"><div class="q-prompt">${i + 1}. ${esc(q.prompt)}</div>
      <div class="key-choices">${q.choices.map((c, ci) => `<span class="${ci === q.correctIndex ? "right" : ""}">${String.fromCharCode(65 + ci)}. ${esc(c)}</span>`).join(" &nbsp;·&nbsp; ")}</div></div>`;
  });
  return html + `</div>`;
}
function previewSpeaking(sp) {
  if (!sp?.paragraph) return "";
  return `<div class="section-block"><div class="section-title">🗣 Đoạn nói <span class="eyebrow">ghép từ ${sp.count} câu</span></div>
    <div class="q"><div class="q-prompt">${esc(sp.paragraph)}</div></div></div>`;
}

saveBtn.addEventListener("click", async () => {
  if (!currentDraft) return;
  saveBtn.disabled = true;
  setStatus(composeStatus, "⏳ Đang lưu...", "");
  try {
    const docId = makeDocId(currentDraft.classId);
    const todayStr = formatTodayDDMMYYYY();
    await setDoc(doc(db, "test", docId), {
      meta: { class: currentDraft.classId, date: todayStr, createdAt: serverTimestamp() },
      mcq: currentDraft.mcq,
      listening: currentDraft.listening,
      sentence: currentDraft.sentence,
      speaking: currentDraft.speaking,
      pronunciation: currentDraft.pronunciation,
      reading: currentDraft.reading,
      chunk: currentDraft.chunk,
      matching: currentDraft.matching,
      oddOneOut: currentDraft.oddOneOut
    });
    setStatus(composeStatus, `✅ Đã lưu đề: ${docId} (ngày ${todayStr}) — đề cũ đã bị ghi đè`, "ok");
  } catch (e) {
    console.error(e);
    setStatus(composeStatus, "❌ Lỗi khi lưu đề.", "err");
    saveBtn.disabled = false;
  }
});

/* ================= TAKE TEST: load / render / answer / grade ================= */
const loadTestBtn = document.getElementById("loadTestBtn");
const loadStatus = document.getElementById("loadStatus");
const examPaperEl = document.getElementById("examPaper");
const resultPanelEl = document.getElementById("resultPanel");

let examData = null;
let examMeta = null;
let answers = {};
function resetAnswers() {
  answers = { mcq: {}, listening: {}, pronunciation: {}, sentence: {}, reading: {}, oddOneOut: {}, chunkOrder: {}, chunkMatch: {}, matching: {}, speaking: { transcript: "" } };
}

loadTestBtn.addEventListener("click", async () => {
  const classId = classSelect.value;
  if (!classId) { setStatus(loadStatus, "⚠️ Hãy chọn lớp trước.", "err"); return; }
  loadTestBtn.disabled = true;
  setStatus(loadStatus, "⏳ Đang tải đề...", "");
  resultPanelEl.classList.add("hidden");
  examPaperEl.classList.add("hidden");
  try {
    const docId = makeDocId(classId);
    const snap = await getDoc(doc(db, "test", docId));
    if (!snap.exists()) {
      setStatus(loadStatus, "❌ Chưa có đề hôm nay cho lớp này.", "err");
      return;
    }
    examData = snap.data();
    examMeta = { docId };
    resetAnswers();
    renderExamPaper(examData, docId);
    setStatus(loadStatus, "✅ Đã tải đề, chúc làm bài tốt!", "ok");
  } catch (e) {
    console.error(e);
    setStatus(loadStatus, "❌ Lỗi khi tải đề.", "err");
  } finally {
    loadTestBtn.disabled = false;
  }
});

function renderExamPaper(data, docId) {
  let html = `<div class="paper-head">
      <h2>📘 Bài kiểm tra — Lớp ${esc(data.meta?.class)}</h2>
      <div class="paper-meta">Ngày ${esc(data.meta?.date)} · Mã đề ${esc(docId)}</div>
    </div>`;

  if (data.mcq?.length) html += renderMcqBlock("📝 Trắc nghiệm nghĩa từ", "mcq", data.mcq);
  if (data.listening?.length) html += renderListeningBlock(data.listening);
  if (data.sentence?.length) html += renderSentenceBlock(data.sentence);
  if (data.chunk?.length) html += renderChunkBlock(data.chunk);
  if (data.matching?.pairs?.length) html += renderMatchingBlock(data.matching);
  if (data.oddOneOut?.length) html += renderMcqBlock("🧭 Tìm từ khác chủ đề", "oddOneOut", data.oddOneOut);
  if (data.speaking?.paragraph) html += renderSpeakingBlock(data.speaking);
  if (data.pronunciation?.length) html += renderMcqBlock("🔊 Phát âm (IPA)", "pronunciation", data.pronunciation);
  if (data.reading?.paragraph) html += renderReadingBlock(data.reading); // đọc hiểu để cuối cùng, khung bài đọc dính khi cuộn

  html += `<div class="submit-row"><button type="submit" class="btn btn-pen">✅ Nộp bài</button></div>`;

  examPaperEl.innerHTML = html;
  examPaperEl.classList.remove("hidden");
  wireMcqChoices(examPaperEl);
  wireSentenceBlocks(examPaperEl);
  wireChunkBlocks(examPaperEl);
  wireGenericMatchBlocks(examPaperEl);
  wireSpeakingBlock(examPaperEl);

  examPaperEl.onsubmit = (e) => { e.preventDefault(); gradeAndShowResults(); };
}

function renderMcqBlock(title, sectionKey, items) {
  let html = `<div class="section-block"><div class="section-title">${title} <span class="eyebrow">${items.length} câu</span></div>`;
  items.forEach((q, i) => {
    html += `<div class="q" data-section="${sectionKey}" data-id="${q.id}">
      <div class="q-prompt">${i + 1}. ${esc(q.prompt)}</div>
      <div class="choices">${q.choices.map((c, ci) => `<button type="button" class="choice" data-index="${ci}">${String.fromCharCode(65 + ci)}. ${esc(c)}</button>`).join("")}</div>
    </div>`;
  });
  return html + `</div>`;
}

function renderListeningBlock(items) {
  let html = `<div class="section-block"><div class="section-title">🎧 Nghe <span class="eyebrow">${items.length} câu</span></div>`;
  items.forEach((q, i) => {
    html += `<div class="q" data-section="listening" data-id="${q.id}">
      <div class="q-prompt">${i + 1}. ${esc(q.prompt)}</div>
      <button type="button" class="play-btn" data-audio="${esc(q.audioText)}">🔊 Nghe</button>
      <div class="choices">${q.choices.map((c, ci) => `<button type="button" class="choice" data-index="${ci}">${String.fromCharCode(65 + ci)}. ${esc(c)}</button>`).join("")}</div>
    </div>`;
  });
  return html + `</div>`;
}

function renderSentenceBlock(items) {
  let html = `<div class="section-block"><div class="section-title">🧩 Ghép câu <span class="eyebrow">${items.length} câu</span></div>`;
  items.forEach((q, i) => {
    const shuffled = shuffle(q.tokens);
    html += `<div class="q sentence-q" data-section="sentence" data-id="${q.id}">
      <div class="q-prompt">${i + 1}. ${esc(q.question)}</div>
      <div class="sentence-answer" data-role="answer"></div>
      <div class="sentence-bank" data-role="bank">${shuffled.map(t => `<button type="button" class="token">${esc(t)}</button>`).join("")}</div>
      <button type="button" class="mini-reset">↺ làm lại câu này</button>
    </div>`;
  });
  return html + `</div>`;
}

function renderChunkBlock(items) {
  let html = `<div class="section-block"><div class="section-title">🔗 Dịch theo cụm <span class="eyebrow">${items.length} câu</span></div>`;
  items.forEach((q, i) => {
    if (q.variant === "order") {
      const shuffled = shuffle(q.enChunks);
      html += `<div class="q sentence-q" data-section="chunkOrder" data-id="${q.id}">
        <div class="q-prompt">${i + 1}. Sắp xếp các cụm tiếng Anh đúng với nghĩa: <em>${esc(q.viChunks.join(" / "))}</em></div>
        <div class="sentence-answer" data-role="answer"></div>
        <div class="sentence-bank" data-role="bank">${shuffled.map(t => `<button type="button" class="token">${esc(t)}</button>`).join("")}</div>
        <button type="button" class="mini-reset">↺ làm lại câu này</button>
      </div>`;
    } else {
      html += `<div class="q" data-section="chunkMatch" data-id="${q.id}">
        <div class="q-prompt">${i + 1}. Nối cụm tiếng Anh với nghĩa tiếng Việt tương ứng</div>
        ${matchGridHtml(q.pairs)}
      </div>`;
    }
  });
  return html + `</div>`;
}

function renderMatchingBlock(m) {
  return `<div class="section-block" data-section="matching" data-id="main">
    <div class="section-title">➖ Nối câu hỏi – câu trả lời <span class="eyebrow">${m.pairs.length} cặp</span></div>
    <div class="match-note">Bấm 1 câu hỏi rồi bấm câu trả lời tương ứng để nối. Bấm lại vào ô đã nối để gỡ.</div>
    ${matchGridHtml(m.pairs)}
  </div>`;
}

function matchGridHtml(pairs) {
  const left = shuffle(pairs.map((p, i) => ({ text: p.left, idx: i })));
  const right = shuffle(pairs.map((p, i) => ({ text: p.right, idx: i })));
  return `<div class="match-grid" data-role="match-widget">
    <div class="match-col" data-role="match-left">
      ${left.map(x => `<button type="button" class="match-item" data-idx="${x.idx}">${esc(x.text)}</button>`).join("")}
    </div>
    <div class="match-col" data-role="match-right">
      ${right.map(x => `<button type="button" class="match-item" data-idx="${x.idx}">${esc(x.text)}</button>`).join("")}
    </div>
  </div>`;
}

/* Đọc hiểu: khung bài đọc "dính" phía trên (sticky) trong khi phần câu hỏi/đáp án trượt xuống bên dưới */
function renderReadingBlock(r) {
  let html = `<div class="section-block reading-block">
    <div class="section-title">📖 Đọc hiểu <span class="eyebrow">${r.questions.length} câu hỏi</span></div>
    <div class="reading-flex">
      <div class="reading-passage-sticky">
        <div class="reading-passage">${esc(r.paragraph)}</div>
      </div>
      <div class="reading-questions">`;
  r.questions.forEach((q, i) => {
    html += `<div class="q" data-section="reading" data-id="${q.id}">
      <div class="q-prompt">${i + 1}. ${esc(q.prompt)}</div>
      <div class="choices">${q.choices.map((c, ci) => `<button type="button" class="choice" data-index="${ci}">${String.fromCharCode(65 + ci)}. ${esc(c)}</button>`).join("")}</div>
    </div>`;
  });
  html += `</div></div></div>`;
  return html;
}

function renderSpeakingBlock(sp) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return `<div class="section-block speaking-block" data-section="speaking">
    <div class="section-title">🗣 Nói theo đoạn văn <span class="eyebrow">ghép từ ${sp.count} câu</span></div>
    <div class="q-prompt">Đọc to đoạn văn dưới đây, sau đó bấm micro để chấm điểm phát âm:</div>
    <div class="paragraph-text" data-role="paragraph-display">${sp.paragraph.split(" ").map(w => `<span class="w">${esc(w)}</span>`).join(" ")}</div>
    ${SR ? `
      <div class="rec-controls">
        <button type="button" class="rec-btn" data-role="rec-toggle">🎙️ Bắt đầu ghi âm</button>
        <span class="transcript" data-role="transcript">Chưa ghi âm.</span>
      </div>` : `<div class="no-support">Trình duyệt này không hỗ trợ nhận diện giọng nói (hãy dùng Chrome trên máy tính/điện thoại).</div>`}
  </div>`;
}

/* ---- wiring ---- */
function wireMcqChoices(root) {
  root.querySelectorAll(".q[data-section]").forEach(qEl => {
    const section = qEl.dataset.section;
    if (["sentence", "speaking", "chunkOrder", "chunkMatch"].includes(section)) return;
    qEl.querySelectorAll(".choice").forEach(btn => {
      btn.addEventListener("click", () => {
        qEl.querySelectorAll(".choice").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        answers[section][qEl.dataset.id] = parseInt(btn.dataset.index, 10);
      });
    });
  });
  root.querySelectorAll(".play-btn").forEach(btn => {
    btn.addEventListener("click", () => speak(btn.dataset.audio));
  });
}

function wireSentenceBlocks(root) {
  root.querySelectorAll('.sentence-q[data-section="sentence"]').forEach(qEl => wireOneTokenBuilder(qEl, "sentence"));
}

function wireChunkBlocks(root) {
  root.querySelectorAll('.sentence-q[data-section="chunkOrder"]').forEach(qEl => wireOneTokenBuilder(qEl, "chunkOrder"));
  root.querySelectorAll('.q[data-section="chunkMatch"]').forEach(qEl => {
    wireOneMatchWidget(qEl, answers.chunkMatch, qEl.dataset.id);
  });
}

function wireOneTokenBuilder(qEl, sectionKey) {
  const id = qEl.dataset.id;
  const answerEl = qEl.querySelector('[data-role="answer"]');
  const bankEl = qEl.querySelector('[data-role="bank"]');
  answers[sectionKey][id] = [];

  function rebuildFromDom() {
    answers[sectionKey][id] = [...answerEl.querySelectorAll(".token")].map(b => b.textContent);
  }
  function placeToken(tokenBtn, word) {
    tokenBtn.disabled = true;
    const placed = document.createElement("button");
    placed.type = "button";
    placed.className = "token placed";
    placed.textContent = word;
    placed.addEventListener("click", () => {
      placed.remove();
      tokenBtn.disabled = false;
      rebuildFromDom();
    });
    answerEl.appendChild(placed);
    rebuildFromDom();
  }
  bankEl.querySelectorAll(".token").forEach(tokenBtn => {
    tokenBtn.addEventListener("click", () => placeToken(tokenBtn, tokenBtn.textContent));
  });
  qEl.querySelector(".mini-reset").addEventListener("click", () => {
    answerEl.innerHTML = "";
    bankEl.querySelectorAll(".token").forEach(b => b.disabled = false);
    answers[sectionKey][id] = [];
  });
}

function wireGenericMatchBlocks(root) {
  const mainMatch = root.querySelector('.section-block[data-section="matching"]');
  if (mainMatch) wireOneMatchWidget(mainMatch, answers.matching, "main");
}

function wireOneMatchWidget(container, storageObj, key) {
  storageObj[key] = {};
  const leftBtns = [...container.querySelectorAll('[data-role="match-left"] .match-item')];
  const rightBtns = [...container.querySelectorAll('[data-role="match-right"] .match-item')];
  let selectedLeft = null;

  function colorFor(i) { return `hsl(${(i * 67) % 360},55%,85%)`; }

  function unpairLeft(btn) {
    const rightIdx = btn.dataset.pairedWith;
    const rBtn = rightBtns.find(b => b.dataset.idx === rightIdx);
    btn.classList.remove("paired"); btn.style.background = ""; delete btn.dataset.pairedWith;
    if (rBtn) { rBtn.classList.remove("paired"); rBtn.style.background = ""; delete rBtn.dataset.pairedWith; }
    delete storageObj[key][btn.dataset.idx];
  }
  function unpairRight(btn) {
    const leftIdx = btn.dataset.pairedWith;
    const lBtn = leftBtns.find(b => b.dataset.idx === leftIdx);
    btn.classList.remove("paired"); btn.style.background = ""; delete btn.dataset.pairedWith;
    if (lBtn) { lBtn.classList.remove("paired"); lBtn.style.background = ""; delete lBtn.dataset.pairedWith; }
    if (leftIdx != null) delete storageObj[key][leftIdx];
  }

  leftBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("paired")) { unpairLeft(btn); return; }
      leftBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedLeft = btn;
    });
  });
  rightBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("paired")) { unpairRight(btn); return; }
      if (!selectedLeft) return;
      const leftIdx = selectedLeft.dataset.idx;
      const rightIdx = btn.dataset.idx;
      storageObj[key][leftIdx] = parseInt(rightIdx, 10);
      const color = colorFor(parseInt(leftIdx, 10));
      selectedLeft.classList.add("paired"); selectedLeft.classList.remove("active");
      selectedLeft.style.background = color;
      selectedLeft.dataset.pairedWith = rightIdx;
      btn.classList.add("paired");
      btn.style.background = color;
      btn.dataset.pairedWith = leftIdx;
      selectedLeft = null;
    });
  });
}

function wireSpeakingBlock(root) {
  const block = root.querySelector('.speaking-block');
  if (!block) return;
  const toggleBtn = block.querySelector('[data-role="rec-toggle"]');
  if (!toggleBtn) return;
  const transcriptEl = block.querySelector('[data-role="transcript"]');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognizer = new SR();
  recognizer.lang = "en-US";
  recognizer.continuous = true;
  recognizer.interimResults = true;

  let finalTranscript = "";
  let recording = false;

  recognizer.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += chunk + " ";
      else interim += chunk;
    }
    answers.speaking.transcript = finalTranscript.trim();
    transcriptEl.textContent = (finalTranscript + interim).trim() || "Đang nghe...";
  };
  recognizer.onend = () => {
    recording = false;
    toggleBtn.textContent = "🎙️ Ghi âm lại";
    toggleBtn.classList.remove("recording");
  };
  recognizer.onerror = () => {
    recording = false;
    toggleBtn.textContent = "🎙️ Ghi âm lại";
    toggleBtn.classList.remove("recording");
  };

  toggleBtn.addEventListener("click", () => {
    if (recording) {
      recognizer.stop();
    } else {
      finalTranscript = "";
      answers.speaking.transcript = "";
      transcriptEl.textContent = "Đang nghe...";
      recording = true;
      toggleBtn.textContent = "⏹️ Dừng ghi âm";
      toggleBtn.classList.add("recording");
      recognizer.start();
    }
  });
}

/* ================= Grading ================= */
function gradeAndShowResults() {
  let earned = 0, total = 0;
  const reviewHtml = [];

  if (examData.mcq?.length) {
    const r = gradeMcqLike(examData.mcq, answers.mcq, "📝 Trắc nghiệm nghĩa từ");
    reviewHtml.push(r.html); earned += r.correct; total += examData.mcq.length;
  }
  if (examData.listening?.length) {
    const r = gradeMcqLike(examData.listening, answers.listening, "🎧 Nghe");
    reviewHtml.push(r.html); earned += r.correct; total += examData.listening.length;
  }
  if (examData.sentence?.length) {
    const r = gradeTokenSection(examData.sentence, answers.sentence, "🧩 Ghép câu", it => it.tokens, it => it.answer, it => it.question);
    reviewHtml.push(r.html); earned += r.score; total += examData.sentence.length;
  }
  if (examData.chunk?.length) {
    const r = gradeChunkSection(examData.chunk);
    reviewHtml.push(r.html); earned += r.score; total += examData.chunk.length;
  }
  if (examData.matching?.pairs?.length) {
    const r = gradeMatchSection(examData.matching.pairs, answers.matching.main || {}, "➖ Nối câu hỏi – câu trả lời");
    reviewHtml.push(r.html); earned += r.fraction; total += 1;
  }
  if (examData.oddOneOut?.length) {
    const r = gradeMcqLike(examData.oddOneOut, answers.oddOneOut, "🧭 Tìm từ khác chủ đề");
    reviewHtml.push(r.html); earned += r.correct; total += examData.oddOneOut.length;
  }
  if (examData.speaking?.paragraph) {
    const transcript = answers.speaking.transcript || "";
    const { fraction, matchArr, targetWords } = wordMatch(examData.speaking.paragraph, transcript);
    earned += fraction; total += 1;
    const highlighted = targetWords.map((w, i) => `<span class="w ${matchArr[i] ? "matched" : "missed"}">${esc(w)}</span>`).join(" ");
    reviewHtml.push(`<div class="section-block"><div class="section-title">🗣 Nói theo đoạn văn</div>
      <div class="review-note">Bạn đã nói: <em>${esc(transcript) || "(không ghi nhận được)"}</em></div>
      <div class="paragraph-text">${highlighted}</div>
      <div class="key-answer">Khớp: ${Math.round(fraction * 100)}%</div>
    </div>`);
  }
  if (examData.pronunciation?.length) {
    const r = gradeMcqLike(examData.pronunciation, answers.pronunciation, "🔊 Phát âm (IPA)");
    reviewHtml.push(r.html); earned += r.correct; total += examData.pronunciation.length;
  }
  if (examData.reading?.paragraph) {
    const r = gradeMcqLike(examData.reading.questions, answers.reading, "📖 Đọc hiểu");
    reviewHtml.push(`<div class="section-block"><div class="reading-passage">${esc(examData.reading.paragraph)}</div></div>` + r.html);
    earned += r.correct; total += examData.reading.questions.length;
  }

  const scoreOn10 = total ? Math.round((earned / total) * 100) / 10 : 0;
  renderResults(scoreOn10, reviewHtml.join(""));
}

function gradeMcqLike(items, given, title) {
  let correct = 0;
  let html = `<div class="section-block"><div class="section-title">${title}</div>`;
  items.forEach((q, i) => {
    const chosen = given[q.id];
    const isCorrect = chosen === q.correctIndex;
    if (isCorrect) correct++;
    html += `<div class="review-item">
      <span class="mark ${isCorrect ? "ok" : "no"}">${isCorrect ? "✓" : "✗"}</span>
      <strong>${i + 1}. ${esc(q.prompt)}</strong>
      <div class="choices">${q.choices.map((c, ci) => {
        let cls = "choice";
        if (ci === q.correctIndex) cls += " correct-answer";
        else if (ci === chosen) cls += " wrong-answer";
        return `<span class="${cls}">${String.fromCharCode(65 + ci)}. ${esc(c)}</span>`;
      }).join("")}</div>
    </div>`;
  });
  return { html: html + `</div>`, correct };
}

function gradeTokenSection(items, given, title, getTokens, getAnswerText, getQuestionText) {
  let score = 0;
  let html = `<div class="section-block"><div class="section-title">${title}</div>`;
  items.forEach((q, i) => {
    const studentTokens = given[q.id] || [];
    const correctTokens = getTokens(q);
    let matches = 0;
    correctTokens.forEach((w, idx) => { if (studentTokens[idx] === w) matches++; });
    const frac = correctTokens.length ? matches / correctTokens.length : 0;
    score += frac;
    const isFull = frac === 1;
    html += `<div class="review-item">
      <span class="mark ${isFull ? "ok" : "no"}">${isFull ? "✓" : "✗"}</span>
      <strong>${i + 1}. ${esc(getQuestionText(q))}</strong>
      <div class="review-note">Bạn ghép: ${esc(studentTokens.join(" ") || "(bỏ trống)")}</div>
      <div class="key-answer">Đáp án đúng: ${esc(getAnswerText(q))} — ${Math.round(frac * 100)}%</div>
    </div>`;
  });
  return { html: html + `</div>`, score };
}

function gradeChunkSection(items) {
  let score = 0;
  let html = `<div class="section-block"><div class="section-title">🔗 Dịch theo cụm</div>`;
  items.forEach((q, i) => {
    if (q.variant === "order") {
      const studentTokens = answers.chunkOrder[q.id] || [];
      let matches = 0;
      q.enChunks.forEach((w, idx) => { if (studentTokens[idx] === w) matches++; });
      const frac = q.enChunks.length ? matches / q.enChunks.length : 0;
      score += frac;
      html += `<div class="review-item">
        <span class="mark ${frac === 1 ? "ok" : "no"}">${frac === 1 ? "✓" : "✗"}</span>
        <strong>${i + 1}. ${esc(q.viChunks.join(" / "))}</strong>
        <div class="review-note">Bạn ghép: ${esc(studentTokens.join(" / ") || "(bỏ trống)")}</div>
        <div class="key-answer">Đáp án đúng: ${esc(q.enChunks.join(" / "))} — ${Math.round(frac * 100)}%</div>
      </div>`;
    } else {
      const given = answers.chunkMatch[q.id] || {};
      let matches = 0;
      q.pairs.forEach((p, idx) => { if (given[idx] === idx) matches++; });
      const frac = q.pairs.length ? matches / q.pairs.length : 0;
      score += frac;
      html += `<div class="review-item">
        <span class="mark ${frac === 1 ? "ok" : "no"}">${frac === 1 ? "✓" : "✗"}</span>
        <strong>${i + 1}. Ghép cặp cụm từ</strong>
        <div class="key-answer">${q.pairs.map(p => `${esc(p.left)} = ${esc(p.right)}`).join(" &nbsp;|&nbsp; ")} — ${Math.round(frac * 100)}%</div>
      </div>`;
    }
  });
  return { html: html + `</div>`, score };
}

function gradeMatchSection(pairs, given, title) {
  let matches = 0;
  pairs.forEach((p, idx) => { if (given[idx] === idx) matches++; });
  const fraction = pairs.length ? matches / pairs.length : 0;
  const html = `<div class="section-block"><div class="section-title">${title}</div>
    <div class="review-item">
      <span class="mark ${fraction === 1 ? "ok" : "no"}">${fraction === 1 ? "✓" : "✗"}</span>
      <strong>Kết quả nối: ${matches}/${pairs.length} cặp đúng (${Math.round(fraction * 100)}%)</strong>
      <div class="key-answer">${pairs.map(p => `${esc(p.left)} → ${esc(p.right)}`).join(" &nbsp;|&nbsp; ")}</div>
    </div></div>`;
  return { html, fraction };
}

function renderResults(scoreOn10, reviewHtml) {
  examPaperEl.classList.add("hidden");
  resultPanelEl.innerHTML = `
    <div class="score-stamp"><span class="num">${scoreOn10}</span><span class="lbl">/ 10</span></div>
    <div class="paper-head"><h2>Kết quả bài làm</h2><div class="paper-meta">Chấm tự động — xem chi tiết từng câu bên dưới</div></div>
    ${reviewHtml}
    <div class="submit-row"><button type="button" class="btn btn-ghost" id="retakeBtn">↺ Làm lại đề này</button></div>
  `;
  resultPanelEl.classList.remove("hidden");
  document.getElementById("retakeBtn").addEventListener("click", () => {
    resetAnswers();
    resultPanelEl.classList.add("hidden");
    renderExamPaper(examData, examMeta.docId);
  });
  resultPanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
}