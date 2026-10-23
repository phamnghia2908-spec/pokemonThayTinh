// ✅ Link Google Sheet đã chia sẻ công khai
const sheetURL = "https://docs.google.com/spreadsheets/d/1XmiM7fIGqo3eq8QMuhvxj4G3LrGBzsbQHs_gk0KXdTc/gviz/tq?tqx=out:json";

// ✅ Hàm lấy danh sách học sinh từ Google Sheet
export async function fetchStudentList() {
  try {
    const res = await fetch(sheetURL);
    const text = await res.text();

    // ✅ Xử lý JSON trả về từ Google
    const json = JSON.parse(text.substr(47).slice(0, -2));
    const rows = json.table.rows.slice(1); // ✅ bỏ dòng tiêu đề

    // ✅ Chuyển thành mảng học sinh
    const studentList = rows
      .map(row => ({
        name: row.c[0]?.v ? row.c[0].v.toString().trim() : "",
        class: row.c[1]?.v ? row.c[1].v.toString().trim() : "",
        password: row.c[2]?.v ? row.c[2].v.toString().trim() : ""
      }))
      .filter(s => s.name && s.class); // ✅ bỏ dòng trống

    console.log("📋 Danh sách học sinh:", studentList);
    return studentList;
  } catch (error) {
    console.error("❌ Lỗi khi lấy danh sách học sinh:", error);
    return [];
  }
}
