function goToMode(mode) {
  let url = "";

  switch (mode) {
    case "chunks":
      url = "speaking-chunks.html";
      break;
    case "sentence":
      url = "speaking-sentence.html";
      break;
    case "paragraph":
      url = "speaking3.html";
      break;
    default:
      console.warn("❌ Không xác định được chế độ:", mode);
      return;
  }

  window.location.href = url;
}
