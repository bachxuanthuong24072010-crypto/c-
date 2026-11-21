# Console update

- Replaced separate OUTPUT and ERROR tabs with one OUTPUT + ERROR console.
- Added a framed console header, run state, copy, clear, collapse and footer controls.
- Preserved input text when switching between INPUT and CONSOLE.
- Fixed the previous stdout-loss bug: stderr and exit information no longer overwrite stdout.
- Shows process return code and execution/compile time in the console.
- Copies `.OUT` and `.out` files created by `freopen` back into `workspace`.
- Updated Service Worker cache version so the new UI can replace the old cached version.
- `npm start` now rebuilds the frontend automatically before launching the server.


## Bản sửa Console tiếp theo
- Bỏ hoàn toàn tab ERROR; chỉ còn INPUT và OUTPUT.
- stdout, stderr, exit code và thời gian chạy được ghép theo thứ tự terminal trong một vùng OUTPUT, không còn ghi đè stdout bằng thông tin trạng thái.
- Lấy stdin trước khi đổi tab để dữ liệu cin không bị xóa khi nhấn RUN.
- Giữ nguyên nội dung OUTPUT khi chuyển qua lại INPUT / OUTPUT.
- Thêm cơ chế vô hiệu hóa cache cũ của Service Worker và trang reset-cache.html để buộc trình duyệt nạp đúng phiên bản.
- Kiểm thử backend với Clang: nhập 5, chương trình in 10, exit code 0.
