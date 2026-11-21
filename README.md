# Coding C++

Ứng dụng soạn thảo và chạy C++ cá nhân bằng PWA + Node.js localhost + Clang. Giao diện dùng CodeMirror 6.

## Chạy trên Windows với MSYS2 CLANG64

1. Cài Node.js LTS.
2. Cài MSYS2 CLANG64 và Clang:

```bash
pacman -Syu
pacman -S --needed mingw-w64-clang-x86_64-clang
```

3. Thêm thư mục MSYS2 CLANG64 vào User `Path` của Windows. Ví dụ:

```text
D:\msys64\clang64\bin
```

4. Đóng CMD cũ, mở CMD mới và kiểm tra:

```cmd
clang++ --version
```

5. Mở CMD tại thư mục project và chạy:

```cmd
npm install
npm start
```

`npm start` tự chạy build trước khi mở server. Truy cập `http://127.0.0.1:8787`. Không tắt cửa sổ CMD khi đang dùng app.

## Chạy trên Android bằng Termux

Cài Node.js và Clang trong Termux:

```bash
pkg update && pkg upgrade
pkg install nodejs clang
```

Giải nén project vào thư mục trong Termux, chạy `npm install`, sau đó `npm start`. Mở Chrome trên Android tại `http://127.0.0.1:8787` và chọn thêm vào màn hình chính.

## Chức năng

- CodeMirror 6, đánh số dòng, tô màu cú pháp C++.
- C++17 mặc định, Clang native và header tiện dụng `include/bits/stdc++.h`. Header này tập hợp các header chuẩn phổ biến, không mô phỏng toàn bộ extension riêng của GCC.
- Input và Console riêng. Console gộp stdout, compiler/runtime stderr, mã thoát và thời gian chạy trong cùng một khung.
- RUN/STOP, giới hạn biên dịch 30 giây, chạy 5 giây, đầu ra tối đa khoảng 1 MiB.
- Quản lý tệp `.cpp`, `.h`, `.hpp`, `.txt`, `.INP`, `.OUT`, `.in`, `.out`.
- File `.OUT`/`.out` được đưa trở lại thư mục `workspace` sau khi chương trình chạy xong.
- PWA có Service Worker cache phần vỏ giao diện. Chạy C++ vẫn cần server và Clang đang hoạt động.

## File I/O

Tạo file input, ví dụ `BAI1.INP`, trong `workspace`, sau đó dùng:

```cpp
freopen("BAI1.INP", "r", stdin);
freopen("BAI1.OUT", "w", stdout);
```

Sau khi chạy xong, `BAI1.OUT` được sao chép về `workspace`.

## Ghi chú

- Server chỉ lắng nghe `127.0.0.1`, không mở ra mạng LAN.
- C++ được thực thi với quyền của tài khoản đang chạy Node.js/Termux. Chỉ chạy code bạn tin tưởng.
- Lần đầu `npm install` cần Internet.
- Trên Windows, sau khi thêm Clang vào PATH phải mở CMD mới rồi mới chạy `npm start` để Node.js nhận PATH mới.


## Làm mới phiên bản giao diện sau khi cập nhật

Nếu Chrome vẫn hiện giao diện cũ, mở `http://127.0.0.1:8787/reset-cache.html` một lần. Trang này hủy Service Worker cũ và xóa cache giao diện cũ, sau đó quay lại app. Sau đó tải lại trang bằng Ctrl+Shift+R.

Console chỉ còn hai tab INPUT và OUTPUT. Không còn tab ERROR. stdout, stderr (nếu có), mã thoát và thời gian chạy được hiển thị nối tiếp trong cùng một khung OUTPUT. Dữ liệu INPUT được lấy trước khi đổi tab nên không bị xóa khi nhấn RUN.
