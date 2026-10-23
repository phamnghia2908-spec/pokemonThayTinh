// backgroundgame.js

// Danh sách 10 ảnh nền từ repo GitHub của bạn
const backgrounds = [
  'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(1).jpg',
  'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(2).jpg',
  'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(3).jpg',
  'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(4).jpg',
  'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(5).jpg',
  'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(6).jpg',
  'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(7).jpg',
  'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(8).jpg',
  'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(9).jpg',
  'https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/b%20(10).jpg',
];

// Chọn ngẫu nhiên một ảnh nền
const randomBackground = backgrounds[Math.floor(Math.random() * backgrounds.length)];

// Gán ảnh nền vào body, đảm bảo phủ kín màn hình
document.documentElement.style.height = "100%";
document.body.style.height = "100%";
document.body.style.margin = "0";
document.body.style.backgroundImage = `url('${randomBackground}')`;
document.body.style.backgroundSize = "cover";       // phủ kín toàn bộ
document.body.style.backgroundPosition = "center";  // căn giữa
document.body.style.backgroundRepeat = "no-repeat"; // không lặp lại
