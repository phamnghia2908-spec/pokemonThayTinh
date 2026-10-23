// PokéGym – Dữ liệu luyện âm Units 1–6 (Nguyên âm)

export const phonicsBank = [
  // 🔰 groupA: Tổ hợp bắt đầu bằng A
  { unit: "groupA", key: "a", ipa: "/æ/", word: "apple" },
  { unit: "groupA", key: "ai", ipa: "/eɪ/", word: "rain" },
  { unit: "groupA", key: "ay", ipa: "/eɪ/", word: "day" },
  { unit: "groupA", key: "a-e", ipa: "/eɪ/", word: "cake" },
  { unit: "groupA", key: "ar", ipa: "/ɑː/", word: "car" },
  { unit: "groupA", key: "are", ipa: "/eə/", word: "care" },
  { unit: "groupA", key: "air", ipa: "/eə/", word: "chair" },
  { unit: "groupA", key: "al", ipa: "/ɔː/", word: "talk" },
  { unit: "groupA", key: "au", ipa: "/ɔː/", word: "sauce" },
  { unit: "groupA", key: "aw", ipa: "/ɔː/", word: "saw" },

  // 🔰 groupE: Tổ hợp bắt đầu bằng E
  { unit: "groupE", key: "e", ipa: "/ɛ/", word: "elbow" },
  { unit: "groupE", key: "ee", ipa: "/iː/", word: "tree" },
  { unit: "groupE", key: "ea", ipa: "/iː/", word: "eat" },
  { unit: "groupE", key: "e-e", ipa: "/iː/", word: "these" },
  { unit: "groupE", key: "ey", ipa: "/iː/", word: "key" },
  { unit: "groupE", key: "ear", ipa: "/ɪə/", word: "hear" },
  { unit: "groupE", key: "eer", ipa: "/ɪə/", word: "cheer" },
  { unit: "groupE", key: "ere", ipa: "/ɪə/", word: "here" },
  { unit: "groupE", key: "ew", ipa: "/juː/", word: "new" },
  { unit: "groupE", key: "er", ipa: "/ə/", word: "sister" },

  // 🔰 groupI: Tổ hợp bắt đầu bằng I (bao gồm Y)
  { unit: "groupI", key: "i", ipa: "/ɪ/", word: "insect" },
  { unit: "groupI", key: "i-e", ipa: "/aɪ/", word: "bike" },
  { unit: "groupI", key: "ie", ipa: "/aɪ/", word: "pie" },
  { unit: "groupI", key: "igh", ipa: "/aɪ/", word: "light" },
  { unit: "groupI", key: "y", ipa: "/aɪ/", word: "fly" },
  { unit: "groupI", key: "ir", ipa: "/ɜː/", word: "bird" },
  { unit: "groupI", key: "ire", ipa: "/aɪə/", word: "fire" },
  

  // 🔰 groupO: Tổ hợp bắt đầu bằng O
  { unit: "groupO", key: "o", ipa: "/ɒ/", word: "ostrich" },
  { unit: "groupO", key: "oa", ipa: "/oʊ/", word: "boat" },
  { unit: "groupO", key: "o-e", ipa: "/oʊ/", word: "home" },
  { unit: "groupO", key: "ou", ipa: "/aʊ/", word: "out" },
  { unit: "groupO", key: "ow", ipa: "/oʊ/", word: "snow" },
  { unit: "groupO", key: "oo", ipa: "/uː/", word: "moon" },
  { unit: "groupO", key: "our", ipa: "/ʊə/", word: "tour" },
  { unit: "groupO", key: "oi", ipa: "/ɔɪ/", word: "coin" },
  { unit: "groupO", key: "oy", ipa: "/ɔɪ/", word: "boy" },

  // 🔰 groupU: Tổ hợp bắt đầu bằng U
  { unit: "groupU", key: "u", ipa: "/ʌ/", word: "uncle" },
  { unit: "groupU", key: "u-e", ipa: "/juː/", word: "cube" },
  { unit: "groupU", key: "ue", ipa: "/uː/", word: "blue" },
  { unit: "groupU", key: "ui", ipa: "/uː/", word: "fruit" },
  { unit: "groupU", key: "ure", ipa: "/ʊə/", word: "sure" },
  { unit: "groupU", key: "ur", ipa: "/ɜː/", word: "nurse" },

  // 🔴 Unit 1: Nguyên âm ngắn
  { unit: "unit1", key: "a", ipa: "/æ/", word: "at" },
  { unit: "unit1", key: "e", ipa: "/ɛ/", word: "bed" },
  { unit: "unit1", key: "i", ipa: "/ɪ/", word: "sit" },
  { unit: "unit1", key: "o", ipa: "/ɒ/", word: "hot" },
  { unit: "unit1", key: "u", ipa: "/ʌ/", word: "cup" },

  // 🟠 Unit 2: Nguyên âm + r
  { unit: "unit2", key: "ar", ipa: "/ɑː/", word: "car" },
  { unit: "unit2", key: "or", ipa: "/ɔː/", word: "horse" },
  { unit: "unit2", key: "ir", ipa: "/ɜː/", word: "girl" },
  { unit: "unit2", key: "ur", ipa: "/ɜː/", word: "nurse" },
  { unit: "unit2", key: "er", ipa: "/ə/", word: "her" },

  // 🟡 Unit 3: Nguyên âm đôi dài I
  { unit: "unit3", key: "ai", ipa: "/eɪ/", word: "rain" },
  { unit: "unit3", key: "a-e", ipa: "/eɪ/", word: "cake" },
  { unit: "unit3", key: "ay", ipa: "/eɪ/", word: "play" },
  { unit: "unit3", key: "ee", ipa: "/iː/", word: "green" },
  { unit: "unit3", key: "ea", ipa: "/iː/", word: "leaf" },
  { unit: "unit3", key: "e-e", ipa: "/iː/", word: "these" },
  { unit: "unit3", key: "ey", ipa: "/iː/", word: "key" },
  { unit: "unit3", key: "i-e", ipa: "/aɪ/", word: "bike" },
  { unit: "unit3", key: "ie", ipa: "/aɪ/", word: "pie" },
  { unit: "unit3", key: "igh", ipa: "/aɪ/", word: "light" },
  { unit: "unit3", key: "y", ipa: "/aɪ/", word: "fly" },

  // 🟢 Unit 4: Nguyên âm đôi dài II
  { unit: "unit4", key: "o-e", ipa: "/oʊ/", word: "home" },
  { unit: "unit4", key: "oa", ipa: "/oʊ/", word: "boat" },
  { unit: "unit4", key: "ow", ipa: "/oʊ/", word: "snow" },
  { unit: "unit4", key: "u-e", ipa: "/juː/", word: "cube" },
  { unit: "unit4", key: "ew", ipa: "/juː/", word: "new" },
  { unit: "unit4", key: "ue", ipa: "/uː/", word: "blue" },
  { unit: "unit4", key: "ui", ipa: "/uː/", word: "fruit" },
  { unit: "unit4", key: "oo", ipa: "/uː/", word: "moon" },

  // 🔵 Unit 5: Nguyên âm mở rộng I
  { unit: "unit5", key: "oi", ipa: "/ɔɪ/", word: "coin" },
  { unit: "unit5", key: "oy", ipa: "/ɔɪ/", word: "boy" },
  { unit: "unit5", key: "ou", ipa: "/aʊ/", word: "house" },
  { unit: "unit5", key: "aw", ipa: "/ɔː/", word: "saw" },
  { unit: "unit5", key: "au", ipa: "/ɔː/", word: "author" },
  { unit: "unit5", key: "al", ipa: "/ɔː/", word: "walk" },

  // 🟣 Unit 6: Nguyên âm mở rộng II
  { unit: "unit6", key: "ear", ipa: "/ɪə/", word: "dear" },
  { unit: "unit6", key: "eer", ipa: "/ɪə/", word: "cheer" },
  { unit: "unit6", key: "ere", ipa: "/ɪə/", word: "here" },
  { unit: "unit6", key: "air", ipa: "/eə/", word: "hair" },
  { unit: "unit6", key: "are", ipa: "/eə/", word: "care" },
  { unit: "unit6", key: "ure", ipa: "/ʊə/", word: "pure" },
  { unit: "unit6", key: "our", ipa: "/ʊə/", word: "tour" },
  { unit: "unit6", key: "ire", ipa: "/aɪə/", word: "hire" },
  
];
// PokéGym – Dữ liệu luyện âm Units 7–11 (Phụ âm + Đuôi từ)

phonicsBank.push(
  // 🔴 Unit 7: Phụ âm vô thanh
  { unit: "unit7", key: "p", ipa: "/p/", word: "pen" },
  { unit: "unit7", key: "t", ipa: "/t/", word: "top" },
  { unit: "unit7", key: "k", ipa: "/k/", word: "kick" },
  { unit: "unit7", key: "c", ipa: "/k/", word: "cat" },
  { unit: "unit7", key: "f", ipa: "/f/", word: "fish" },
  { unit: "unit7", key: "th", ipa: "/θ/", word: "thin" },
  { unit: "unit7", key: "s", ipa: "/s/", word: "sun" },
  { unit: "unit7", key: "h", ipa: "/h/", word: "hat" },
  { unit: "unit7", key: "sh", ipa: "/ʃ/", word: "shop" },
  { unit: "unit7", key: "ch", ipa: "/ʧ/", word: "chin" },

  // 🟠 Unit 8: Phụ âm hữu thanh I
  { unit: "unit8", key: "b", ipa: "/b/", word: "bat" },
  { unit: "unit8", key: "d", ipa: "/d/", word: "dog" },
  { unit: "unit8", key: "g", ipa: "/g/", word: "go" },
  { unit: "unit8", key: "v", ipa: "/v/", word: "van" },
  { unit: "unit8", key: "TH", ipa: "/ð/", word: "this" },
  { unit: "unit8", key: "z", ipa: "/z/", word: "zoo" },
  { unit: "unit8", key: "zh", ipa: "/ʒ/", word: "vision" },
  { unit: "unit8", key: "j", ipa: "/ʤ/", word: "jam" },
  { unit: "unit8", key: "ge", ipa: "/ʤ/", word: "orange" },

  // 🟡 Unit 9: Phụ âm hữu thanh II
  { unit: "unit9", key: "m", ipa: "/m/", word: "man" },
  { unit: "unit9", key: "n", ipa: "/n/", word: "net" },
  { unit: "unit9", key: "ng", ipa: "/ŋ/", word: "ring" },
  { unit: "unit9", key: "l", ipa: "/l/", word: "leg" },
  { unit: "unit9", key: "r", ipa: "/r/", word: "red" },
  { unit: "unit9", key: "w", ipa: "/w/", word: "win" },
  { unit: "unit9", key: "y", ipa: "/j/", word: "yes" },

  // 🟢 Unit 10: Phụ âm ghép đặc biệt
  { unit: "unit10", key: "ph", ipa: "/f/", word: "phone" },
  { unit: "unit10", key: "wh", ipa: "/w/", word: "wheel" },
  { unit: "unit10", key: "ck", ipa: "/k/", word: "duck" },
  { unit: "unit10", key: "gn", ipa: "/n/", word: "gnome" },
  { unit: "unit10", key: "kn", ipa: "/n/", word: "knee" },
  { unit: "unit10", key: "wr", ipa: "/r/", word: "write" },
  { unit: "unit10", key: "mb", ipa: "/m/", word: "lamb" },
  { unit: "unit10", key: "ce", ipa: "/s/", word: "nice" },

  // 🔵 Unit 11: Đuôi từ đặc biệt
  { unit: "unit11", key: "-tion", ipa: "/ʃn/", word: "station" },
  { unit: "unit11", key: "-sion", ipa: "/ʒn/", word: "television" },
  { unit: "unit11", key: "-cian", ipa: "/ʃn/", word: "musician" },
  { unit: "unit11", key: "-ture", ipa: "/ʧə/", word: "picture" },
  { unit: "unit11", key: "-sure", ipa: "/ʒə/", word: "measure" },
  { unit: "unit11", key: "-cial", ipa: "/ʃl/", word: "social" },
  { unit: "unit11", key: "-tial", ipa: "/ʃl/", word: "initial" },
  { unit: "unit11", key: "-ous", ipa: "/əs/", word: "famous" },
  { unit: "unit11", key: "-age", ipa: "/ɪʤ/", word: "village" }
);


