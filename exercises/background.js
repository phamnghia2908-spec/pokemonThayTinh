// background.js

function updateBackground() {
  // Chọn một Pokémon ngẫu nhiên từ 1 đến 151
  const pokemonId = Math.floor(Math.random() * 151) + 1;
  // Sử dụng ảnh từ phiên bản Dream World của PokeAPI
  const bgUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/dream-world/${pokemonId}.svg`;

  // Cập nhật background cho trang
  document.body.style.backgroundImage = `url('${bgUrl}')`;
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundRepeat = "no-repeat";
  document.body.style.backgroundPosition = "center center";

  console.log(`Background updated with Pokemon id: ${pokemonId}`);
}

export { updateBackground };
