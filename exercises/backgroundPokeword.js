// backgroundPokeword.js

function displayBackground() {
  const backgrounds = [
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/20993.jpg",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/2979584.gif",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/301512.png",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/3551099.jpg",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/3551100.png",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/3551108.jpg",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/3551109.jpg",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/3551239.jpg",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/desktop-wallpaper-pokemon-forest-backgrounds-%C2%B7%E2%91%A0-pokemon-anime-forest-background.jpg",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/heresy-games-eternity-forest-02.jpg",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/pokemon-inside-an-enchanted-forest-9cxmmzhqfrt3301l%20(1).jpg",
    "https://raw.githubusercontent.com/ninjavanxuantruong/mp3vietnam2/main/wp2690555-mudkip-hd-wallpapers.jpg"
  ];

  const selected = backgrounds[Math.floor(Math.random() * backgrounds.length)];

  document.body.style.backgroundImage = `url('${selected}')`;
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundRepeat = "no-repeat";
  document.body.style.backgroundPosition = "center center";

  console.log("PokéWord background loaded:", selected);
}

export { displayBackground };
