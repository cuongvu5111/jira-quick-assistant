# 🚀 Jira Quick Assistant v2.0 - Tự Động Hóa Task & Logwork Hàng Tuần/Tháng

Tiện ích mở rộng (**Chrome Extension Manifest V3**) được tối ưu riêng cho quy trình doanh nghiệp (VNPT / CNTT) trên hệ thống **Jira Server / Data Center**:
- **Logwork theo Tuần & Tháng**: Linh hoạt chọn khoảng thời gian làm việc (Tuần 1..5 hoặc cả tháng).
- **Tạo hàng loạt Sub-task cho Parent Issue**: Tự động sinh mẫu 5 Sub-task theo từng ngày trong tuần gắn trực tiếp vào task cha (ví dụ `DOFFICE-3880`).
- **Phân bổ nhiều Task & Tuân thủ quy định tối đa 8h/task**: Ghép cặp 1-1 (1 ngày làm việc = 1 sub-task = tối đa 8 giờ), tự động kiểm tra và bỏ qua task đã đạt ngưỡng 8h để tránh vi phạm quy định công ty.
- **Tự động nhận diện URL**: Người dùng chỉ cần dán nguyên đường dẫn Jira (ví dụ: `https://cntt.vnpt.vn/browse/DOFFICE-3880`), hệ thống sẽ tự động bóc tách Domain gốc và mã Issue Key.

---

## 📂 Cấu trúc dự án
```
lucid-planck/
├── manifest.json            # File cấu hình Chrome Extension Manifest V3
├── popup/
│   ├── popup.html          # Giao diện Popup 3 Tab nâng cấp v2.0
│   ├── popup.css           # Định dạng CSS Atlassian UI với bảng mapping ngày công
│   └── popup.js            # Điều phối chia tuần, tải sub-tasks và kiểm soát 8h/task
├── scripts/
│   ├── jira-api.js         # Giao tiếp Jira REST API (sub-tasks, worklog, XSRF token)
│   └── date-utils.js       # Phân chia tuần làm việc, bóc tách URL, tính ngày công
├── assets/
│   └── icons/              # Bộ icon 16x16, 48x48, 128x128
└── README.md               # Hướng dẫn chi tiết
```

---

## 🛠️ Hướng dẫn cài đặt / Cập nhật vào Google Chrome

1. Truy cập `chrome://extensions/` trên Google Chrome.
2. Bật **Chế độ dành cho nhà phát triển** (**Developer mode**).
3. Bấm **Tải tiện ích đã giải nén** (**Load unpacked**) và chọn thư mục:
   ```
   c:\Users\cuong\Documents\antigravity\lucid-planck
   ```
*(Nếu bạn đã cài bản v1 trước đó, chỉ cần bấm vào biểu tượng **Nạp lại (Reload / 🔄)** trên thẻ của tiện ích).*

---

## 📖 Hướng dẫn sử dụng các tính năng mới (v2.0)

### 1. Tạo hàng loạt Sub-task cho Task Cha (Tab "Tạo Task / Sub-task")
1. Mở tab **📝 Tạo Task / Sub-task**.
2. Tại ô **Mã Task Cha**, nhập hoặc dán link task cha:
   ```
   https://cntt.vnpt.vn/browse/DOFFICE-3880
   ```
   *(Extension sẽ tự động lấy mã `DOFFICE-3880`)*.
3. Bấm nút **⚡ Sinh 5 Sub-task theo tuần**: Hệ thống sẽ tự động điền danh sách 5 sub-tasks tương ứng với Thứ 2 đến Thứ 6 trong tuần (bạn có thể chỉnh sửa lại tiêu đề tùy ý).
4. Bấm **🚀 Bắt Đầu Tạo Danh Sách Sub-task**: Các sub-tasks sẽ được khởi tạo tuần tự trên Jira.
5. Sau khi tạo xong, bấm nút **👉 Chuyển sang Tab Logwork cho Task Cha này ngay**.

---

### 2. Logwork theo Tuần & Phân bổ nhiều Sub-task (Tab "Logwork")
1. Mở tab **⏱️ Logwork**.
2. Chọn phạm vi: Bấm chọn **📅 Theo Tuần** → Chọn tuần làm việc muốn log (ví dụ: `Tuần 3 (12/10 - 16/10)`).
3. Chọn chế độ phân bổ: Chọn **Phân bổ Sub-tasks của Task Cha**.
4. Bấm nút **🔄 Tải Sub-tasks**:
   - Extension sẽ tự động lấy toàn bộ sub-tasks của `DOFFICE-3880`.
   - Quét số giờ đã log hiện có của từng sub-task.
5. Bảng **Chi tiết phân bổ** sẽ tự động ghép cặp 1-1:
   - **Thứ 2 (12/10)** ↔ `DOFFICE-3881` *(Sẵn sàng 8h)*
   - **Thứ 3 (13/10)** ↔ `DOFFICE-3882` *(Sẵn sàng 8h)*
   - Nếu bất kỳ task nào đã có đủ 8h trước đó, hệ thống sẽ gắn nhãn `⚠️ Đã đủ 8h (Bỏ qua)` và tự động loại trừ để **tuân thủ nghiêm ngặt quy định công ty**.
6. Bấm **⚡ Bắt đầu Phân Bổ & Logwork**: Hệ thống sẽ ghi giờ tuần tự cho từng task và cập nhật thanh tiến trình theo thời gian thực.

---

### 3. Cấu hình Jira VNPT (Tab "Cài đặt")
- **Jira Base URL**: Dán `https://cntt.vnpt.vn` (hoặc dán cả link task, hệ thống tự lọc domain).
- **Phương thức xác thực**: Chọn **Session Cookie (Đăng nhập sẵn trên trình duyệt / VPN)**.
- Bấm **🔌 Kiểm Tra Kết Nối (Ping)** để xác nhận trạng thái đăng nhập.
