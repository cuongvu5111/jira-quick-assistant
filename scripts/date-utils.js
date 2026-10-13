/**
 * Ngày tạo: 13/10/2026 (Cập nhật phiên bản 2.0: Bổ sung chia tuần và trích xuất URL)
 * Mục đích: Cung cấp các tiện ích xử lý ngày tháng, tính toán ngày làm việc trong tháng,
 *           chia tuần làm việc, loại trừ cuối tuần, ngày lễ và format chuẩn Jira REST API.
 */

const DateUtils = {
  /**
   * Lấy số ngày trong một tháng cụ thể (xử lý chính xác cả năm nhuận).
   * @param {number} year - Năm (vd: 2026)
   * @param {number} month - Tháng từ 1 đến 12
   * @returns {number} Số ngày trong tháng (28 - 31)
   */
  getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  },

  /**
   * Kiểm tra một ngày cụ thể có phải là ngày cuối tuần (Thứ 7 hoặc Chủ Nhật) hay không.
   * @param {Date} date
   * @returns {boolean}
   */
  isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  },

  /**
   * Lấy tên thứ trong tuần bằng tiếng Việt hiển thị trên giao diện.
   * @param {Date} date
   * @returns {string}
   */
  getDayNameVi(date) {
    const dayNames = [
      'Chủ Nhật',
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy'
    ];
    return dayNames[date.getDay()];
  },

  /**
   * Định dạng đối tượng Date thành chuỗi 'YYYY-MM-DD'.
   * @param {Date} date
   * @returns {string}
   */
  formatDateYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Định dạng chuỗi ngày hoặc Date thành 'DD/MM/YYYY' để hiển thị thân thiện với người dùng.
   * @param {Date|string} date
   * @returns {string}
   */
  formatDateDMY(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  },

  /**
   * Định dạng ngày thành 'DD/MM' ngắn gọn cho nhãn tuần.
   * @param {Date} date
   * @returns {string}
   */
  formatDateDM(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  },

  /**
   * Phân tích chuỗi danh sách ngày nghỉ (người dùng nhập cách nhau bởi dấu phẩy hoặc xuống dòng).
   * @param {string} text - Chuỗi chứa các ngày (hỗ trợ YYYY-MM-DD hoặc DD/MM/YYYY)
   * @returns {Set<string>}
   */
  parseExcludedDates(text) {
    const result = new Set();
    if (!text || typeof text !== 'string') return result;

    const parts = text.split(/[\n,;]+/);
    for (const part of parts) {
      const clean = part.trim();
      if (!clean) continue;

      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        result.add(clean);
        continue;
      }

      const dmyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        const year = dmyMatch[3];
        result.add(`${year}-${month}-${day}`);
      }
    }
    return result;
  },

  /**
   * Lấy danh sách toàn bộ các ngày làm việc (working days) trong tháng đã chọn:
   * - Loại bỏ Thứ Bảy và Chủ Nhật
   * - Loại bỏ các ngày có trong danh sách ngày nghỉ/lễ (excludedDates)
   *
   * @param {number} year - Năm (vd: 2026)
   * @param {number} month - Tháng từ 1 đến 12
   * @param {Set<string>|Array<string>} excludedDates
   * @returns {Array<{dateObj: Date, dateString: string, displayDate: string, dayOfWeek: string}>}
   */
  getWorkingDaysOfMonth(year, month, excludedDates = new Set()) {
    const excludedSet = excludedDates instanceof Set ? excludedDates : new Set(excludedDates);
    const totalDays = this.getDaysInMonth(year, month);
    const workingDays = [];

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month - 1, day);
      const ymd = this.formatDateYMD(date);

      if (this.isWeekend(date)) continue;
      if (excludedSet.has(ymd)) continue;

      workingDays.push({
        dateObj: date,
        dateString: ymd,
        displayDate: this.formatDateDMY(date),
        dayOfWeek: this.getDayNameVi(date)
      });
    }

    return workingDays;
  },

  /**
   * Phân chia các ngày làm việc trong tháng thành các tuần làm việc thực tế (Tuần 1, 2, 3, 4, 5).
   * Mỗi tuần kết thúc vào Chủ Nhật (hoặc Thứ 6 đối với ngày làm việc).
   *
   * @param {number} year - Năm (vd: 2026)
   * @param {number} month - Tháng từ 1 đến 12
   * @param {Set<string>|Array<string>} excludedDates
   * @returns {Array<{weekNumber: number, label: string, days: Array}>}
   */
  getWeeksOfMonth(year, month, excludedDates = new Set()) {
    const totalDays = this.getDaysInMonth(year, month);
    const excludedSet = excludedDates instanceof Set ? excludedDates : new Set(excludedDates);
    const weeks = [];

    let currentWeekDays = [];
    let weekIndex = 1;

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay(); // 0 là Chủ Nhật, 1..6 là T2..T7
      const ymd = this.formatDateYMD(date);

      // Nếu là ngày làm việc (không phải T7, CN và không phải ngày nghỉ lễ)
      if (!this.isWeekend(date) && !excludedSet.has(ymd)) {
        currentWeekDays.push({
          dateObj: date,
          dateString: ymd,
          displayDate: this.formatDateDMY(date),
          dayOfWeek: this.getDayNameVi(date)
        });
      }

      // Khi kết thúc tuần (Chủ Nhật, dayOfWeek === 0) hoặc là ngày cuối cùng của tháng
      if (dayOfWeek === 0 || day === totalDays) {
        if (currentWeekDays.length > 0) {
          const firstDay = currentWeekDays[0];
          const lastDay = currentWeekDays[currentWeekDays.length - 1];
          const startLabel = this.formatDateDM(firstDay.dateObj);
          const endLabel = this.formatDateDM(lastDay.dateObj);

          weeks.push({
            weekNumber: weekIndex,
            label: `Tuần ${weekIndex} (${startLabel} - ${endLabel}) [${currentWeekDays.length} ngày]`,
            days: [...currentWeekDays]
          });

          weekIndex++;
          currentWeekDays = [];
        }
      }
    }

    return weeks;
  },

  /**
   * Chuyển đổi ngày và giờ bắt đầu thành chuỗi thời gian chuẩn ISO 8601 kèm múi giờ của Jira REST API.
   * Cấu trúc mong đợi: YYYY-MM-DDTHH:mm:ss.sss+ZZZZ (ví dụ: '2026-10-01T09:00:00.000+0700')
   *
   * @param {string} dateYmd - Chuỗi ngày 'YYYY-MM-DD'
   * @param {string} startTime - Giờ bắt đầu 'HH:mm' (vd: '09:00')
   * @returns {string} Chuỗi format chuẩn Jira Server
   */
  formatJiraStartedDateTime(dateYmd, startTime = '09:00') {
    const [year, month, day] = dateYmd.split('-').map(Number);
    const [hours, minutes] = startTime.split(':').map(Number);

    const d = new Date(year, month - 1, day, hours, minutes, 0, 0);

    const offsetMinutes = -d.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const tzHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const tzMins = String(absOffset % 60).padStart(2, '0');
    const tzString = `${sign}${tzHours}${tzMins}`;

    const pad = (n) => String(n).padStart(2, '0');
    const isoDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const isoTime = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000`;

    return `${isoDate}T${isoTime}${tzString}`;
  },

  /**
   * Tiện ích bóc tách mã Issue Key từ input của người dùng.
   * Hỗ trợ tự động trích xuất nếu người dùng dán nguyên đường dẫn web Jira:
   * Ví dụ: 'https://cntt.vnpt.vn/browse/DOFFICE-3880' -> 'DOFFICE-3880'
   * @param {string} input
   * @returns {string} Mã Issue Key in hoa chuẩn
   */
  extractIssueKey(input) {
    if (!input || typeof input !== 'string') return '';
    const trimmed = input.trim();

    // Tìm mẫu /browse/KEY-123 hoặc tiền tố KEY-123
    const match = trimmed.match(/(?:browse\/|^)([A-Za-z0-9_]+-\d+)/i);
    if (match) {
      return match[1].toUpperCase();
    }
    return trimmed.toUpperCase();
  },

  /**
   * Tiện ích bóc tách Jira Base URL từ input của người dùng.
   * Ví dụ: 'https://cntt.vnpt.vn/browse/DOFFICE-3880' -> 'https://cntt.vnpt.vn'
   * @param {string} input
   * @returns {string}
   */
  extractBaseUrl(input) {
    if (!input || typeof input !== 'string') return '';
    const trimmed = input.trim();

    const match = trimmed.match(/^(https?:\/\/[^\/]+)/i);
    if (match) {
      return match[1];
    }
    return trimmed.replace(/\/+$/, '');
  }
};

// Hỗ trợ cả môi trường Node.js (dành cho Unit Test) và Browser Extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DateUtils;
}
