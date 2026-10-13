# 🚀 Release Notes - Jira Quick Assistant v2.0.0

> **Phiên bản**: `v2.0.0`  
> **Ngày phát hành**: 13/10/2026  
> **Tác giả**: Vũ Mạnh Cường (`cuongvmit4`)  
> **Repository**: [https://github.com/cuongvu5111/jira-quick-assistant](https://github.com/cuongvu5111/jira-quick-assistant)  
> **Môi trường mục tiêu**: Jira Server / Data Center VNPT (`https://cntt.vnpt.vn`), Google Chrome Manifest V3  

---

## 🌟 Tổng Quan Phiên Bản

Phiên bản **v2.0.0** là bước nâng cấp toàn diện của tiện ích **Jira Quick Assistant**, tập trung tối đa vào việc tự động hóa các thao tác thủ công thường ngày của lập trình viên và kỹ sư phần mềm tại VNPT:
- Tự động nạp sẵn dữ liệu từ Jira để điền nhanh chỉ với 1 cú click chuột.
- Phân bổ thông minh danh sách Sub-task theo tuần/tháng tuân thủ nghiêm ngặt quy định công ty (tối đa 8 giờ/task).
- Sinh hàng loạt sub-task chuẩn nghiệp vụ VNPT (Mã SPDA, Công đoạn, Due Date từng ngày, Assignee).
- Tự động đóng task (Resolve/Done) sau khi ghi giờ để không bao giờ bị trễ hạn due date.
- Giao diện Atlassian UI tinh gọn, ghim nút cố định và loại bỏ hoàn toàn thanh cuộn kép.

---

## ✨ Tính Năng Mới Nổi Bật (New Features)

### 1. ⚡ Chọn nhanh dữ liệu có sẵn (Quick Select)
- **Tự động tải My Open Issues**: Truy vấn danh sách các task được gán cho chính bạn qua JQL API.
- **Bộ lọc thông minh 3 chế độ**:
  - `Chưa Resolve` (Mặc định): Các task đang mở cần hoàn thành.
  - `Chưa Logwork`: Các task chưa từng ghi logwork (`timespent = 0`).
  - `Gần đây`: Các task cập nhật mới nhất.
- **Tự động nạp danh sách Dự án (Projects)**: Lấy toàn bộ danh sách dự án mà tài khoản có quyền truy cập (như `DOFFICE`, `SI`,...).
- **Tính năng Auto-fill**: Khi chọn từ dropdown, mã Task hoặc Project tự động được điền vào ô input và kích hoạt ngay quá trình kiểm tra / tải dữ liệu mà không cần thao tác thêm.

### 2. 📋 Khởi tạo hàng loạt Sub-task cho Parent Issue
- **Mẫu tự động**: Sinh nhanh 5 sub-tasks cho Thứ 2 → Thứ 6 trong tuần hoặc cả tháng.
- **Hỗ trợ đầy đủ các trường đặc thù của Jira VNPT**:
  - **Mã SPDA**: Tự động nhận diện cấu trúc phân cấp (ví dụ `SI` - `Chung/CPCSI`) từ task cha.
  - **Công đoạn**: Mặc định `Nghiên cứu, phát triển, nâng cấp`.
  - **Due Date từng ngày**: Tự động gán hạn hoàn thành khớp với từng ngày làm việc (Thứ 2 hạn Thứ 2, Thứ 3 hạn Thứ 3,...).
  - **Assignee**: Tự động gán người thực hiện là chính tài khoản đang đăng nhập.

### 3. ⏱️ Phân bổ Sub-task thông minh & Kiểm soát trần 8h/task
- **Mô hình 1-1**: Ghép cặp 1 ngày làm việc tương ứng với 1 sub-task (tối đa 8 giờ/ngày).
- **Kiểm soát chặt chẽ**: Quét toàn bộ worklog hiện có của từng sub-task. Nếu task đã tích lũy đủ 8h (28.800s), hệ thống tự động gắn nhãn `⚠️ Đã đủ 8h (Bỏ qua)` và loại trừ để không bao giờ vi phạm quy định công ty.
- **Tự động nhận diện ngày nghỉ/lễ**: Bỏ qua Thứ 7, Chủ Nhật và danh sách ngày nghỉ lễ tùy chỉnh.

### 4. 🎯 Tự động chuyển trạng thái hoàn thành (Auto-Resolve Task)
- Bổ sung tùy chọn checkbox: *Tự động chuyển trạng thái Resolve / Done sau khi logwork*.
- Sau khi ghi giờ thành công, tiện ích tự động truy vấn danh sách workflow transitions của task và kích hoạt chuyển sang `Resolve`, `Done` hoặc `Closed`, giúp bạn không bao giờ bị quên đóng task trễ due date.

---

## 🎨 Cải Tiến Giao Diện & Trải Nghiệm (UI/UX)

- **Ghim nút hành động cố định (Sticky Action Button)**: Nút `⚡ Bắt đầu Phân Bổ & Logwork` luôn nổi cố định ở mép dưới popup, giúp người dùng bấm được ngay mà không cần cuộn trang.
- **Loại bỏ thanh cuộn kép (Zero Nested Scrollbars)**: Tối ưu chiều cao popup chuẩn Chrome Extension (580px), thanh cuộn ngoài cùng được triệt tiêu, chỉ giữ duy nhất một thanh cuộn mượt mà bên trong nội dung.
- **Tự động chọn Tuần hiện tại (Current Week Default)**: Khi mở tiện ích, dropdown tuần làm việc tự động phát hiện ngày hôm nay và chọn ngay tuần tương ứng.
- **Mặc định sẵn Jira Base URL**: Tự động điền `https://cntt.vnpt.vn` trong cấu hình khởi tạo và fallback khi cài mới.
- **Tự động bóc tách URL Jira**: Hỗ trợ dán nguyên đường dẫn web (ví dụ `https://cntt.vnpt.vn/browse/DOFFICE-3880`), hệ thống tự động trích xuất mã Issue Key và Domain gốc.

---

## 🐛 Sửa Lỗi & Ổn Định Hệ Thống (Bug Fixes)

- **Khắc phục lỗi Jira 400 `issuetype: issue type is required`**: Xây dựng cơ chế dò tìm đa tầng (Multi-tier resolution) lấy chính xác `id` của loại Sub-task từ Parent issue, Createmeta và Global Issuetypes trước khi gửi payload lên Jira Server.
- **Khắc phục lỗi nhận diện nhầm Thứ 6 đã logwork**: Tách biệt hoàn toàn trạng thái "ngày đã được ghi giờ" với "task đã đủ 8h", đảm bảo các ngày công trong tuần được phân bổ chính xác 100%.
- **Tối ưu hóa tải dữ liệu**: Lưu cache tạm cho danh sách Projects và My Issues trong phiên làm việc để giảm thiểu số lượng request gửi lên Jira Server.

---

## 📦 Hướng Dẫn Cài Đặt & Nâng Cấp

1. Truy cập `chrome://extensions/` trên Google Chrome.
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển).
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục:
   ```bash
   D:\www\jira-quick-assistant
   ```
4. Nếu đang dùng phiên bản trước, chỉ cần bấm nút **⟳ Reload (Tải lại)**.
