print("🔧 Chương trình bắt đầu chạy...")  # Kiểm tra xem chương trình có khởi động không

PASSWORD = "Phamtinh@2607"

def check_password():
    print("🔑 Vui lòng nhập mật khẩu:")  # Hiển thị thông báo
    user_input = input("Nhập mật khẩu: ")

    if user_input == PASSWORD:
        print("✅ Truy cập thành công!")
        start_data_entry()
    else:
        print("❌ Mật khẩu sai! Vui lòng thử lại.")
        check_password()

def start_data_entry():
    print("📋 Giao diện nhập liệu đã sẵn sàng!")

check_password()
