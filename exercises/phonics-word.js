// ====== Hàm phát âm từ file mp3 trên GitHub (chuẩn tham khảo) ======
function playIPAFromText(text) {
  const match = text.match(/\/([^/]+)\//); // lấy phần giữa dấu gạch chéo
  const ipa = match?.[1];
  if (ipa) {
    const url = `https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/${encodeURIComponent(ipa)}.mp3`;
    const audio = new Audio(url);
    audio.play();
  } else {
    console.warn("Không tìm thấy IPA trong nút:", text);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("📦 Khởi động Phonics Word Builder");

  // ====== Danh sách âm ======
  const CONSONANTS_SINGLE = ['', 'b','c','d','f','g','h','j','k','l','m','n','p','q','r','s','t','v','w','x','y','z'];
  const VOWELS_SINGLE    = ['', 'a','e','i','o','u','y'];
  const MAGIC_E          = ['', 'e'];

  // ====== Ánh xạ chữ cái → IPA ======
  const ipaMap = {
    // ===== Nguyên âm ngắn =====
    'a':'æ','e':'ɛ','i':'ɪ','o':'ɒ','u':'ʌ',

    // ===== Nguyên âm + r =====
    'ar':'ɑː','or':'ɔː','ir':'ɜː','ur':'ɜː','er':'ə',

    // ===== Nguyên âm đôi dài =====
    'ai':'eɪ','a-e':'eɪ','ay':'eɪ',
    'ee':'iː','ea':'iː','e-e':'iː','ey':'iː',
    'i-e':'aɪ','ie':'aɪ','igh':'aɪ','y':'aɪ',
    'o-e':'oʊ','oa':'oʊ','ow':'oʊ',
    'u-e':'juː','ew':'juː','ue':'uː','ui':'uː','oo':'uː',

    // ===== Nguyên âm mở rộng =====
    'oi':'ɔɪ','oy':'ɔɪ','ou':'aʊ',
    'air':'eə','are':'eə',
    'ear':'ɪə','eer':'ɪə','ere':'ɪə',
    'ure':'ʊə','our':'ʊə',
    'aw':'ɔː','au':'ɔː','al':'ɔː',
    'ire':'aɪə',

    // ===== Phụ âm vô thanh =====
    'p':'p','t':'t','k':'k','c':'k','f':'f','th':'θ','s':'s','h':'h','sh':'ʃ','ch':'ʧ',

    // ===== Phụ âm hữu thanh =====
    'b':'b','d':'d','g':'g','v':'v','th_voiced':'ð','z':'z','zh':'ʒ','j':'ʤ','ge':'ʤ',
    'm':'m','n':'n','ng':'ŋ','l':'l','r':'r','w':'w','y':'j',

    // ===== Phụ âm ghép đặc biệt =====
    'ph':'f','wh':'w','ck':'k','gn':'n','kn':'n','wr':'r','mb':'m','ce':'s',

    // ===== Đuôi từ đặc biệt =====
    'tion':'ʃn','sion':'ʒn','cian':'ʃn',
    'ture':'ʧə','sure':'ʒə',
    'cial':'ʃl','tial':'ʃl',
    'ous':'əs','age':'ɪʤ'
  };


  // ====== Helpers ======
  function withEmptySlots(items) { return [''].concat(items, ['', '']); }
  function createWheel(el, items) {
    el.innerHTML = '';
    const top = document.createElement('div'); top.className = 'spacer'; el.appendChild(top);
    withEmptySlots(items).forEach(txt => {
      const div = document.createElement('div');
      const isEmpty = (txt === '');
      div.className = 'item' + (isEmpty ? ' empty' : '');
      div.textContent = isEmpty ? '(trống)' : txt;
      el.appendChild(div);
    });
    const bottom = document.createElement('div'); bottom.className = 'spacer'; el.appendChild(bottom);
  }
  function getSelected(wheel) {
    const rect = wheel.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    let nearest = null, dist = 1e9;
    wheel.querySelectorAll('.item').forEach(it => {
      const r = it.getBoundingClientRect();
      const c = r.top + r.height / 2;
      const d = Math.abs(c - centerY);
      if (d < dist) { dist = d; nearest = it; }
    });
    if (!nearest) return '';
    const val = nearest.textContent.trim();
    return val === '(trống)' ? '' : val;
  }

  function getVowelConsonantKey() {
    const v1 = normalize(part3.textContent.trim());
    const v2 = normalize(part4.textContent.trim());
    const c5 = normalize(part5.textContent.trim());
    const c6 = normalize(part6.textContent.trim());

    const v = v1 || v2;      // ưu tiên nguyên âm đang hiển thị
    const c = c5 || c6;      // phụ âm liền sau

    if (!v || !c) return '';

    const combo = v + c;     // ví dụ: a+w -> "aw", o+w -> "ow", a+l -> "al"
    if (ipaMap[combo]) return combo;

    return '';
  }


  // ====== Wheel elements ======
  const w1 = document.getElementById('w1');
  const w2 = document.getElementById('w2');
  const w3 = document.getElementById('w3');
  const w4 = document.getElementById('w4');
  const w5 = document.getElementById('w5');
  const w6 = document.getElementById('w6');
  const w7 = document.getElementById('w7');

  // Tạo nội dung cho từng wheel
  createWheel(w1, CONSONANTS_SINGLE);
  createWheel(w2, CONSONANTS_SINGLE);
  createWheel(w3, VOWELS_SINGLE);
  createWheel(w4, VOWELS_SINGLE);
  createWheel(w5, CONSONANTS_SINGLE);
  createWheel(w6, CONSONANTS_SINGLE);
  createWheel(w7, MAGIC_E);

  // ====== 7 ô hiển thị ======
  const part1 = document.getElementById('part1');
  const part2 = document.getElementById('part2');
  const part3 = document.getElementById('part3');
  const part4 = document.getElementById('part4');
  const part5 = document.getElementById('part5');
  const part6 = document.getElementById('part6');
  const part7 = document.getElementById('part7');

  // ====== Cập nhật hiển thị chữ và log ======
  function updateWord() {
    const v1 = getSelected(w1) || '—';
    const v2 = getSelected(w2) || '—';
    const v3 = getSelected(w3) || '—';
    const v4 = getSelected(w4) || '—';
    const v5 = getSelected(w5) || '—';
    const v6 = getSelected(w6) || '—';
    const v7 = getSelected(w7) || '—';

    part1.textContent = v1;
    part2.textContent = v2;
    part3.textContent = v3;
    part4.textContent = v4;
    part5.textContent = v5;
    part6.textContent = v6;
    part7.textContent = v7;

    console.log(`🔁 updateWord -> part1:${v1} | part2:${v2} | part3:${v3} | part4:${v4} | part5:${v5} | part6:${v6} | part7:${v7}`);
  }

  // Cập nhật khi cuộn
  [w1, w2, w3, w4, w5, w6, w7].forEach((wheel, idx) => {
    let t;
    wheel.addEventListener('scroll', () => {
      console.log(`🌀 scroll wheel ${idx+1} (${wheel.getAttribute('aria-label')})`);
      if (t) clearTimeout(t);
      t = setTimeout(updateWord, 120);
    }, { passive: true });
  });

  // Khởi động lần đầu
  updateWord();

  // ====== Gộp cặp: onset (1–2), vowel (3–4), coda (5–6) ======
  function normalize(val) {
    return (val && val !== '—') ? val.toLowerCase() : '';
  }

  function getOnsetKey() {
    const p1 = normalize(part1.textContent.trim());
    const p2 = normalize(part2.textContent.trim());
    if (p1 && p2) {
      const combo = p1 + p2;
      if (ipaMap[combo]) return combo;
    }
    return p1 || p2 || '';
  }

  function getVowelKey() {
    const v1 = normalize(part3.textContent.trim());
    const v2 = normalize(part4.textContent.trim());
    const mE = normalize(part7.textContent.trim()); // magic-e

    // Ưu tiên magic-e khi ô 4 trống và ô 7 là e
    if (v1 && !v2 && mE === 'e') {
      const comboME = `${v1}-e`;
      if (ipaMap[comboME]) return comboME;
    }

    // Hai nguyên âm liền nhau (ai, ea, ou, ie…)
    if (v1 && v2) {
      const comboVV = v1 + v2;
      if (ipaMap[comboVV]) return comboVV;
    }

    // Fallback: đọc nguyên âm đơn nếu có
    return v1 || v2 || '';
  }


  function getCodaKey() {
    const c1 = normalize(part5.textContent.trim());
    const c2 = normalize(part6.textContent.trim());
    if (c1 && c2) {
      const combo = c1 + c2;
      if (ipaMap[combo]) return combo;
    }
    return c1 || c2 || '';
  }

  function getRControlledKey() {
    const v = normalize(part3.textContent.trim());
    const v2 = normalize(part4.textContent.trim());
    const c5 = normalize(part5.textContent.trim());
    const c6 = normalize(part6.textContent.trim());
    const mE = normalize(part7.textContent.trim());

    // phụ âm r ở ô 5 hoặc 6
    const c = (c5 === 'r' ? c5 : (c6 === 'r' ? c6 : ''));

    if (!v && !v2) return '';

    // ===== Ưu tiên cụm 3 chữ cái =====
    if (v && v2 && c) {
      const combo3 = v + v2 + c; // ear, eer
      if (ipaMap[combo3]) return combo3;
    }

    // ===== Ưu tiên cụm có magic-e =====
    if ((v || v2) && c && mE === 'e') {
      const comboME = (v || v2) + c + 'e'; // are, ure, ere
      if (ipaMap[comboME]) return comboME;
    }

    // ===== Fallback: nguyên âm + r =====
    if ((v || v2) && c) {
      const combo2 = (v || v2) + c; // ar, or, ur, er
      if (ipaMap[combo2]) return combo2;
    }

    return '';
  }



  // ====== Phát âm theo key ======
  function speakKey(key, label) {
    if (!key) {
      console.warn(`⚠️ ${label}: trống, không đọc`);
      return;
    }
    const ipa = ipaMap[key];
    if (!ipa) {
      console.warn(`❓ ${label}: không có IPA cho "${key}"`);
      return;
    }
    const fakeText = `${key} - /${ipa}/`;
    console.log(`🔊 ${label}: ${fakeText} -> /${ipa}.mp3`);
    playIPAFromText(fakeText);
  }

  // ====== Gắn click: dùng cặp tương ứng ======
  part1.addEventListener('click', () => speakKey(getOnsetKey(), 'Onset (1–2)'));
  part2.addEventListener('click', () => speakKey(getOnsetKey(), 'Onset (1–2)'));

  // ====== Gắn click: dùng cặp tương ứng ======
  part3.addEventListener('click', () => {
    const key = getRControlledKey() || getVowelConsonantKey() || getVowelKey();
    speakKey(key, 'Vowel (R/VC/V/Magic-e)');
  });

  part4.addEventListener('click', () => {
    const key = getRControlledKey() || getVowelConsonantKey() || getVowelKey();
    speakKey(key, 'Vowel (R/VC/V/Magic-e)');
  });

  part5.addEventListener('click', () => {
    const key = getRControlledKey() || getVowelConsonantKey() || getCodaKey();
    speakKey(key, 'Coda (R/VC/C)');
  });

  part6.addEventListener('click', () => {
    const key = getRControlledKey() || getVowelConsonantKey() || getCodaKey();
    speakKey(key, 'Coda (R/VC/C)');
  });

  part7.addEventListener('click', () => {
    const key = getRControlledKey() || getVowelConsonantKey() || getVowelKey();
    speakKey(key, 'Magic-e (R/VC/V)');
  });




  // (Giữ UX chặn double-tap zoom nếu cần)
  [part1, part2, part3, part4, part5, part6, part7].forEach(el => {
    el.addEventListener('touchend', e => { e.preventDefault(); }, { passive: false });
  });
});
// ====== Đọc toàn bộ từ ======
// ====== Helper: Lấy text từ phần (bỏ dấu —) ======
function getPartText(el) {
  const t = el.textContent.trim();
  return (t && t !== '—') ? t : '';
}

// ====== Ghép từ từ 7 ô ======
function buildWordString() {
  const s1 = getPartText(part1);
  const s2 = getPartText(part2);
  const s3 = getPartText(part3);
  const s4 = getPartText(part4);
  const s5 = getPartText(part5);
  const s6 = getPartText(part6);
  const s7 = getPartText(part7);

  // Ghép đơn giản theo thứ tự 1–7
  const raw = [s1, s2, s3, s4, s5, s6, s7].join('');
  // Nếu trống hết, trả về chuỗi rỗng
  return raw || '';
}

// ====== Đọc bằng TTS (SpeechSynthesis) ======
function speakTextTTS(text, lang = 'en-US', rate = 0.95, pitch = 1.0) {
  if (!text) {
    console.warn('⚠️ Không có từ để đọc.');
    return;
  }
  if (!('speechSynthesis' in window)) {
    console.warn('⚠️ Trình duyệt không hỗ trợ SpeechSynthesis.');
    alert('Trình duyệt của bạn chưa hỗ trợ đọc giọng nói (SpeechSynthesis).');
    return;
  }

  // Hủy các phát hiện đang chờ
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;   // có thể đổi 'en-GB', 'en-US', 'vi-VN' tùy ý
  utter.rate = rate;   // tốc độ đọc
  utter.pitch = pitch; // cao độ

  console.log(`🔊 TTS đọc: "${text}" (${lang}, rate=${rate}, pitch=${pitch})`);
  window.speechSynthesis.speak(utter);
}

// ====== Nút đọc toàn bộ từ ======
document.getElementById('readWordBtn').addEventListener('click', () => {
  const word = buildWordString();
  if (!word) {
    console.warn('⚠️ Từ trống, hãy chọn ký tự trên các wheel.');
    return;
  }
  // Đọc thẳng chuỗi ký tự ghép thành từ bằng TTS
  speakTextTTS(word, 'en-US', 0.95, 1.0);
});
