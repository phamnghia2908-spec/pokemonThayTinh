// googleSheetLinks.js
const SHEET_URL = "https://script.google.com/macros/s/AKfycbxzedXjLuoot-1WVNBegypFaEv4IAPtI_2Vyjb1Ie9wr7B7rMcxt0n2s77E-vwyCjVM9Q/exec";
const SHEET_BAI_HOC = "https://script.google.com/macros/s/AKfycbwGc5T0Ei1CA3-LnxSv9JxqqnkL5WeyZFTbgEu0vZTq25E8gypYbP-FRJApNa5oJr12tQ/exec";
const SHEET_HỌC_SINH = "https://script.google.com/macros/s/AKfycbwLVEo6tPI1zXQrLQzBJKm9qcBSvwKZbYwzWouPKQH4itTts492opetA4tSB1iSt5qzOg/exec";
// Export cho cả browser và Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SHEET_URL, SHEET_BAI_HOC };
} else {
    window.SHEET_URL = SHEET_URL;
    window.SHEET_BAI_HOC = SHEET_BAI_HOC;
}
// Thêm vào cuối file googleSheetLinks.js
const script = document.createElement('script');
script.src = './linhthu.js';
script.type = 'module'; // BẮT BUỘC phải có dòng này
document.head.appendChild(script);