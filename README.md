# 🚀 Jira Quick Assistant - Tiện ích Tự động hóa Task & Logwork Hàng Tháng

Tiện ích mở rộng (**Chrome Extension Manifest V3**) hỗ trợ nhân viên giải phóng thời gian khỏi các thao tác thủ công nhàm chán lặp đi lặp lại hàng tháng trên hệ thống **Jira Server / Data Center** nội bộ của doanh nghiệp:
1. **Tạo Task định kỳ hàng tháng**: Hỗ trợ template tự động thay thế `{month}`, `{year}`.
2. **Logwork hàng loạt 1-Click**: Tự động tính toán các ngày làm việc (Thứ 2 đến Thứ 6), loại trừ ngày nghỉ lễ / phép, kiểm tra chống log trùng ngày và ghi toàn bộ số giờ trong tháng chỉ với 1 thao tác.
3. **Không cần cài đặt phức tạp**: Tận dụng trực tiếp phiên đăng nhập (Cookie SSO) đang có trên trình duyệt của bạn.

---

## 📂 Cấu trúc dự án
```
lucid-planck/
├── manifest.json            # File cấu hình Chrome Extension Manifest V3
├── popup/
│   ├── popup.html          # Giao diện Popup 3 Tab (Logwork, Tạo Task, Cài đặt)
│   ├── popup.css           # Định dạng CSS hiện đại theo chuẩn Atlassian UI
│   └── popup.js            # Xử lý logic giao diện, lưu trữ và điều phối batch request
├── scripts/
│   ├── jira-api.js         # Module giao tiếp Jira REST API (v2)
│   └── date-utils.js       # Module tính toán ngày công và format ngày giờ chuẩn Jira
├── assets/
│   └── icons/              # Bộ icon 16x16, 48x48, 128x128
└── README.md               # Hướng dẫn cài đặt và sử dụng
```

---

## 🛠️ Hướng dẫn cài đặt vào Google Chrome

Bạn chỉ mất khoảng **30 giây** để cài đặt extension này vào Chrome mà không cần build phức tạp:

1. **Mở trang quản lý tiện ích**:
   - Trên Google Chrome, truy cập vào đường dẫn: `chrome://extensions/` (hoặc bấm vào biểu tượng Mảnh ghép ở góc trên bên phải → chọn **Quản lý tiện ích**).
2. **Bật Chế độ dành cho nhà phát triển (Developer mode)**:
   - Gạt công tắc **Chế độ dành cho nhà phát triển** (góc trên bên phải màn hình) sang trạng thái **BẬT (ON)**.
3. **Nạp tiện ích vào Chrome**:
   - Nhấn vào nút **Tải tiện ích đã giải nén** (**Load unpacked**) ở góc trên bên trái.
   - Trỏ tới thư mục dự án này:
     ```
     c:\Users\cuong\Documents\antigravity\lucid-planck
     ```
   - Nhấn **Select Folder**.
4. **Ghim tiện ích để sử dụng nhanh**:
   - Bấm vào biểu tượng Mảnh ghép trên thanh công cụ của Chrome và bấm vào chiếc **Ghim (Pin)** cạnh `Jira Quick Assistant`.

---

## 📖 Hướng dẫn sử dụng từng bước

### Bước 1: Cấu hình lần đầu (Tab "Cài đặt")
1. Mở popup tiện ích bằng cách click vào icon Jira trên thanh công cụ Chrome.
2. Chuyển sang tab **⚙️ Cài đặt**:
   - **Jira Base URL**: Nhập địa chỉ web Jira của công ty bạn (Ví dụ: `https://jira.company.com` hoặc `http://jira.internal:8080`).
   - **Phương thức xác thực**:
     - *Mặc định*: Chọn **Session Cookie (Đăng nhập sẵn trên trình duyệt)**. Tiện ích sẽ tự động dùng phiên đăng nhập Jira hiện có của bạn trên Chrome mà không cần nhập mật khẩu.
     - *Nâng cao*: Nếu công ty bạn yêu cầu dùng Token, chọn **Personal Access Token (PAT)** và dán mã token vào.
   - **Danh sách ngày nghỉ lễ / ngày phép**: Nhập các ngày nghỉ cần loại trừ (ví dụ: `2026-10-20, 2026-09-02`).
3. Bấm **🔌 Kiểm Tra Kết Nối (Ping)**: Nếu kết nối thành công, hệ thống sẽ hiển thị tên và avatar tài khoản Jira của bạn.
4. Bấm **💾 Lưu Cài Đặt**.

---

### Bước 2: Tạo Task định kỳ hàng tháng (Tab "Tạo Task Mẫu")
*Nếu bạn đã có sẵn mã Issue Key do quản lý giao, bạn có thể bỏ qua bước này và sang luôn Bước 3.*

1. Chuyển sang tab **📝 Tạo Task Mẫu**.
2. Nhập **Mã Project** (ví dụ: `PROJ`).
3. Tiêu đề task đã được cài sẵn mẫu:
   ```
   [Tháng {month}/{year}] Công việc thường nhật & Vận hành
   ```
   *(Biến `{month}` và `{year}` sẽ tự động được thay bằng tháng và năm tương ứng)*.
4. Bấm **🚀 Tạo Task Mới Ngay**.
5. Sau khi tạo xong, bấm vào nút **👉 Chuyển sang Logwork ngay cho task này** để tự động điền mã task sang tab Logwork.

---

### Bước 3: Tự động Logwork cả tháng (Tab "Logwork Tháng")
1. Chọn **Tháng** và **Năm** cần log.
2. Nhập hoặc chọn **Mã Issue Key** (tiện ích tự động lưu lại 5 issue bạn dùng gần nhất để chọn nhanh).
3. Bấm **🔍 Kiểm tra**: Tiện ích sẽ truy vấn Jira để:
   - Hiển thị tên task và trạng thái.
   - Quét xem những ngày nào trong tháng này bạn **đã từng logwork** trước đó.
4. Điều chỉnh số giờ mỗi ngày (mặc định: `8h`), giờ bắt đầu (`09:00`) và ghi chú worklog.
5. Xem bảng **Tóm tắt ngày công**:
   - Tổng ngày công trong tháng (đã tự động bỏ Thứ 7, Chủ Nhật và ngày nghỉ lễ).
   - Số ngày đã logwork trước đó.
   - Số ngày sẽ được log mới và tổng số giờ dự kiến.
   - *(Tùy chọn: Bấm **Chi tiết ▼** để xem trạng thái từng ngày)*.
6. Bấm **⚡ Bắt đầu Logwork Tự Động**:
   - Hệ thống sẽ hiển thị thanh tiến trình và gửi logwork lần lượt cho từng ngày.
   - Có cơ chế nghỉ nhẹ giữa các lượt request để tránh gây nghẽn máy chủ Jira.

---

## 🛡️ Tính năng nổi bật & Xử lý sự cố (Troubleshooting)

### 1. Cơ chế chống trùng lặp (Duplicate Protection)
Khi bật tùy chọn *"Bỏ qua những ngày đã có worklog"*, tiện ích sẽ tự động đối chiếu toàn bộ các worklog hiện có trên issue đó. Nếu ngày đó đã được log từ trước, tiện ích sẽ bỏ qua và chỉ log những ngày còn thiếu, giúp bạn không bao giờ bị log thừa giờ.

### 2. Lỗi 403 XSRF Check Failed trên Jira Server
Jira Server / Data Center có cơ chế bảo mật chống tấn công giả mạo yêu cầu (XSRF). Tiện ích đã tự động tích hợp header:
```http
X-Atlassian-Token: no-check
```
giúp toàn bộ các request POST (tạo task, logwork) hoạt động trơn tru.

### 3. Lỗi 401 Unauthorized hoặc chưa đăng nhập
- Hãy đảm bảo bạn đã mở một tab trình duyệt và đăng nhập thành công vào trang web Jira của công ty.
- Nếu công ty sử dụng mạng nội bộ, hãy chắc chắn bạn đã bật **VPN** công ty trước khi bấm kiểm tra kết nối.
