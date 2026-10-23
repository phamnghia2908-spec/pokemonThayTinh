// // File: global-config.js

// 1. Link các Script
window.SHEET_URL =
  "https://script.google.com/macros/s/AKfycbxzedXjLuoot-1WVNBegypFaEv4IAPtI_2Vyjb1Ie9wr7B7rMcxt0n2s77E-vwyCjVM9Q/exec";
window.SHEET_BAI_HOC =
  "https://script.google.com/macros/s/AKfycbwGc5T0Ei1CA3-LnxSv9JxqqnkL5WeyZFTbgEu0vZTq25E8gypYbP-FRJApNa5oJr12tQ/exec";
window.SHEET_HOC_SINH =
  "https://script.google.com/macros/s/AKfycbwLVEo6tPI1zXQrLQzBJKm9qcBSvwKZbYwzWouPKQH4itTts492opetA4tSB1iSt5qzOg/exec";

// 2. Cấu trúc riêng cho Sheet Học Sinh
window.COLS_STUDENT = {
  NAME: 0, // Cột A
  CLASS: 1, // Cột B
};

// 3. Cấu trúc riêng cho Sheet Từ Vựng (VOCAB)
window.COLS_VOCAB = {
  LESSON_NAME: 1, // Cột B
  DRILL_PHRASE: 3, // Cột D
  DRILL_ANSWER: 4, // Cột E
  SUB_TOPIC: 5, // Cột F
  MAIN_TOPIC: 6, // Cột G
  WORD: 2, // Cột C
  MEANING: 24, // Cột Y
  PRESENT_SENT: 8, // Cột I
  QUESTION: 9, // Cột J
  SUGGEST_ANS: 10, // Cột K
  FINAL_ANS: 11, // Cột L
  SOUND_PUN: 33, // Cột AH
  PUN_SENTENCE: 34, // Cột AI
};

// 4. Cấu hình Firebase phamthetinh26071994@gmail.com
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCCVdzWiiFvcWiHVJN-x33YKarsjyziS8E",
  authDomain: "pokemon-capture-10d03.firebaseapp.com",
  projectId: "pokemon-capture-10d03",
  storageBucket: "pokemon-capture-10d03.firebasestorage.app",
  messagingSenderId: "1068125543917",
  appId: "1:1068125543917:web:57de4365ee56729ea8dbe4",
};
