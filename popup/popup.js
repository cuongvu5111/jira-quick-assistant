/**
 * Ngày tạo: 13/10/2026
 * Mục đích: Điều phối toàn bộ sự kiện giao diện, lưu trữ cấu hình người dùng,
 *           quản lý luồng kiểm tra issue và thực thi batch logwork hàng tháng.
 */

// State quản lý trong phiên popup
const AppState = {
  settings: {
    jiraBaseUrl: '',
    authType: 'cookie',
    personalAccessToken: '',
    defaultTimeSpent: '8h',
    defaultStartTime: '09:00',
    defaultComment: 'Làm việc theo kế hoạch tháng',
    excludedHolidays: '',
    recentIssues: [],
    lastProjectKey: ''
  },
  currentUser: null,
  currentIssue: null,
  alreadyLoggedDates: new Set(),
  workingDays: [],
  isRunningLogwork: false
};

// ============================================================================
// KHỞI TẠO VÀ LOAD CẤU HÌNH BAN ĐẦU
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initDateSelectors();
  initTabNavigation();
  initEventHandlers();
  await loadSettingsFromStorage();
  checkInitialConnection();
  calculateAndRenderWorkingDays();
});

/**
 * Khởi tạo danh sách Tháng và Năm trong dropdown (mặc định tháng và năm hiện tại).
 */
function initDateSelectors() {
  const monthSelect = document.getElementById('log-month');
  const yearSelect = document.getElementById('log-year');

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1 - 12
  const currentYear = now.getFullYear();

  // Điền 12 tháng
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `Tháng ${m}`;
    if (m === currentMonth) opt.selected = true;
    monthSelect.appendChild(opt);
  }

  // Điền các năm (từ năm ngoái đến năm sau)
  for (let y = currentYear - 1; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = `Năm ${y}`;
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }
}

/**
 * Quản lý chuyển đổi giữa các Tab giao diện.
 */
function initTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');

      tabButtons.forEach((b) => b.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetTabId);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

/**
 * Đọc cấu hình đã lưu từ chrome.storage.local.
 */
async function loadSettingsFromStorage() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['jira_settings'], (result) => {
        if (result && result.jira_settings) {
          AppState.settings = { ...AppState.settings, ...result.jira_settings };
          applySettingsToUI();
        }
        resolve();
      });
    } else {
      // Fallback nếu test ngoài trình duyệt
      resolve();
    }
  });
}

/**
 * Điền các giá trị cấu hình vào form cài đặt và form logwork.
 */
function applySettingsToUI() {
  const { jiraBaseUrl, authType, personalAccessToken, defaultTimeSpent, defaultStartTime, defaultComment, excludedHolidays, recentIssues, lastProjectKey } = AppState.settings;

  // Tab Cài đặt
  const baseUrlInput = document.getElementById('jira-base-url');
  if (baseUrlInput) baseUrlInput.value = jiraBaseUrl || '';

  const authRadios = document.querySelectorAll('input[name="auth-type"]');
  authRadios.forEach((r) => {
    if (r.value === authType) r.checked = true;
  });
  togglePatInputVisibility(authType);

  const patInput = document.getElementById('personal-access-token');
  if (patInput) patInput.value = personalAccessToken || '';

  const holidaysInput = document.getElementById('excluded-holidays');
  if (holidaysInput) holidaysInput.value = excludedHolidays || '';

  // Tab Logwork
  const timeSpentInput = document.getElementById('log-time-spent');
  if (timeSpentInput && defaultTimeSpent) timeSpentInput.value = defaultTimeSpent;

  const startTimeInput = document.getElementById('log-start-time');
  if (startTimeInput && defaultStartTime) startTimeInput.value = defaultStartTime;

  const commentInput = document.getElementById('log-comment');
  if (commentInput && defaultComment) commentInput.value = defaultComment;

  // Tab Tạo Task
  const projectKeyInput = document.getElementById('task-project-key');
  if (projectKeyInput && lastProjectKey) projectKeyInput.value = lastProjectKey;

  // Lịch sử Issue gần đây
  renderRecentIssuesDropdown(recentIssues);

  // Kiểm tra cảnh báo URL
  const warningBanner = document.getElementById('url-warning-banner');
  if (warningBanner) {
    if (!jiraBaseUrl) {
      warningBanner.classList.remove('hidden');
    } else {
      warningBanner.classList.add('hidden');
    }
  }
}

/**
 * Hiển thị dropdown các issue key đã dùng gần đây.
 */
function renderRecentIssuesDropdown(recentIssues) {
  const select = document.getElementById('history-issue-select');
  if (!select) return;

  if (Array.isArray(recentIssues) && recentIssues.length > 0) {
    select.innerHTML = '<option value="">-- Issue gần đây --</option>';
    recentIssues.forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      select.appendChild(opt);
    });
    select.classList.remove('hidden');
  } else {
    select.classList.add('hidden');
  }
}

/**
 * Kiểm tra kết nối nhẹ ban đầu để cập nhật trạng thái trên header.
 */
async function checkInitialConnection() {
  if (!AppState.settings.jiraBaseUrl) return;

  const statusPill = document.getElementById('user-status-pill');
  const statusText = document.getElementById('user-status-text');

  const res = await JiraApi.testConnection(AppState.settings.jiraBaseUrl, {
    authType: AppState.settings.authType,
    personalAccessToken: AppState.settings.personalAccessToken
  });

  if (res.success && res.user) {
    AppState.currentUser = res.user;
    statusPill.className = 'status-pill status-connected';
    statusText.textContent = res.user.displayName || res.user.name;
    statusPill.title = `Đã kết nối với Jira với tài khoản: ${res.user.displayName} (${res.user.name})`;
  } else {
    statusPill.className = 'status-pill status-disconnected';
    statusText.textContent = 'Chưa đăng nhập';
    statusPill.title = 'Chưa đăng nhập Jira trên trình duyệt hoặc URL chưa đúng';
  }
}

// ============================================================================
// ĐĂNG KÝ CÁC SỰ KIỆN TƯƠNG TÁC (EVENT HANDLERS)
// ============================================================================
function initEventHandlers() {
  // Thay đổi tháng hoặc năm -> tính lại ngày công
  document.getElementById('log-month').addEventListener('change', () => {
    calculateAndRenderWorkingDays();
    refreshWorklogStatusForIssue();
  });
  document.getElementById('log-year').addEventListener('change', () => {
    calculateAndRenderWorkingDays();
    refreshWorklogStatusForIssue();
  });

  // Checkbox bỏ qua ngày đã log
  document.getElementById('skip-logged-days').addEventListener('change', () => {
    updateSummaryStats();
  });

  // Chọn từ dropdown issue gần đây
  const historySelect = document.getElementById('history-issue-select');
  if (historySelect) {
    historySelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        document.getElementById('log-issue-key').value = val;
        verifyAndFetchIssue(val);
      }
    });
  }

  // Nút kiểm tra issue
  document.getElementById('btn-verify-issue').addEventListener('click', () => {
    const key = document.getElementById('log-issue-key').value.trim();
    if (key) verifyAndFetchIssue(key);
  });

  // Rời khỏi ô nhập issue key -> tự động verify nhẹ
  document.getElementById('log-issue-key').addEventListener('blur', (e) => {
    const key = e.target.value.trim();
    if (key && (!AppState.currentIssue || AppState.currentIssue.key !== key.toUpperCase())) {
      verifyAndFetchIssue(key);
    }
  });

  // Ẩn/Hiện danh sách chi tiết ngày
  document.getElementById('btn-toggle-days-preview').addEventListener('click', () => {
    const container = document.getElementById('days-preview-container');
    const btn = document.getElementById('btn-toggle-days-preview');
    const isHidden = container.classList.contains('hidden');
    if (isHidden) {
      container.classList.remove('hidden');
      btn.textContent = 'Thu gọn ▲';
    } else {
      container.classList.add('hidden');
      btn.textContent = 'Chi tiết ▼';
    }
  });

  // Nút Bắt đầu Logwork
  document.getElementById('btn-start-logwork').addEventListener('click', handleStartLogwork);

  // Tab Tạo Task: Thay đổi placeholder khi chuyển tháng/năm
  document.getElementById('btn-create-task').addEventListener('click', handleCreateTask);

  // Tab Cài đặt: Đổi Auth Type
  const authRadios = document.querySelectorAll('input[name="auth-type"]');
  authRadios.forEach((r) => {
    r.addEventListener('change', (e) => {
      togglePatInputVisibility(e.target.value);
    });
  });

  // Nút Test Ping kết nối
  document.getElementById('btn-test-connection').addEventListener('click', handleTestConnection);

  // Nút Lưu Cài đặt
  document.getElementById('btn-save-settings').addEventListener('click', handleSaveSettings);
}

function togglePatInputVisibility(authType) {
  const patGroup = document.getElementById('pat-input-group');
  if (patGroup) {
    if (authType === 'token') {
      patGroup.classList.remove('hidden');
    } else {
      patGroup.classList.add('hidden');
    }
  }
}

// ============================================================================
// XỬ LÝ TÍNH TOÁN NGÀY CÔNG & KIỂM TRA TRÙNG LẶP
// ============================================================================

/**
 * Tính toán danh sách ngày làm việc trong tháng được chọn (bỏ T7, CN và ngày nghỉ).
 */
function calculateAndRenderWorkingDays() {
  const month = parseInt(document.getElementById('log-month').value, 10);
  const year = parseInt(document.getElementById('log-year').value, 10);

  const excludedSet = DateUtils.parseExcludedDates(AppState.settings.excludedHolidays);
  AppState.workingDays = DateUtils.getWorkingDaysOfMonth(year, month, excludedSet);

  updateSummaryStats();
  renderDaysPreviewList();
}

/**
 * Cập nhật số liệu trên thẻ thống kê tóm tắt.
 */
function updateSummaryStats() {
  const skipLogged = document.getElementById('skip-logged-days').checked;
  const timeSpentVal = document.getElementById('log-time-spent').value.trim() || '8h';

  // Chuyển đổi định dạng giờ (vd: '8h' -> 8, '7.5h' -> 7.5)
  const hoursPerDay = parseFloat(timeSpentVal.replace(/[^\d.]/g, '')) || 8;

  const totalWorkingDays = AppState.workingDays.length;

  let alreadyLoggedCount = 0;
  for (const day of AppState.workingDays) {
    if (AppState.alreadyLoggedDates.has(day.dateString)) {
      alreadyLoggedCount++;
    }
  }

  const toLogCount = skipLogged
    ? Math.max(0, totalWorkingDays - alreadyLoggedCount)
    : totalWorkingDays;

  const totalHours = Math.round(toLogCount * hoursPerDay * 10) / 10;

  document.getElementById('stat-total-working-days').textContent = totalWorkingDays;
  document.getElementById('stat-already-logged-days').textContent = alreadyLoggedCount;
  document.getElementById('stat-to-log-days').textContent = toLogCount;
  document.getElementById('stat-total-hours').textContent = `${totalHours}h`;
}

/**
 * Hiển thị danh sách chi tiết các ngày làm việc trong modal xem trước.
 */
function renderDaysPreviewList() {
  const listElem = document.getElementById('days-preview-list');
  listElem.innerHTML = '';

  const skipLogged = document.getElementById('skip-logged-days').checked;

  AppState.workingDays.forEach((day) => {
    const isLogged = AppState.alreadyLoggedDates.has(day.dateString);

    const li = document.createElement('li');
    li.className = 'day-preview-item';

    let tagHtml = '';
    if (isLogged) {
      tagHtml = skipLogged
        ? '<span class="day-status-tag tag-skipped">Đã log (Bỏ qua)</span>'
        : '<span class="day-status-tag tag-logged">Đã log (Sẽ ghi đè)</span>';
    } else {
      tagHtml = '<span class="day-status-tag tag-ready">Chưa log</span>';
    }

    li.innerHTML = `
      <span><strong>${day.displayDate}</strong> (${day.dayOfWeek})</span>
      ${tagHtml}
    `;
    listElem.appendChild(li);
  });
}

/**
 * Kiểm tra Issue Key và lấy danh sách worklog hiện có của issue đó.
 */
async function verifyAndFetchIssue(issueKey) {
  const badge = document.getElementById('issue-info-badge');
  badge.classList.remove('hidden');
  badge.innerHTML = '<em>Đang kiểm tra Issue trên Jira...</em>';

  if (!AppState.settings.jiraBaseUrl) {
    badge.innerHTML = '<span style="color:var(--danger-color)">⚠️ Chưa cài đặt Jira Base URL. Vui lòng vào Tab Cài đặt.</span>';
    return;
  }

  const authConfig = {
    authType: AppState.settings.authType,
    personalAccessToken: AppState.settings.personalAccessToken
  };

  const issueRes = await JiraApi.getIssue(AppState.settings.jiraBaseUrl, issueKey, authConfig);
  if (!issueRes.success) {
    badge.innerHTML = `<span style="color:var(--danger-color)">❌ ${issueRes.error}</span>`;
    AppState.currentIssue = null;
    AppState.alreadyLoggedDates.clear();
    updateSummaryStats();
    renderDaysPreviewList();
    return;
  }

  AppState.currentIssue = issueRes.issue;
  badge.innerHTML = `
    <strong>[${issueRes.issue.key}]</strong>: ${issueRes.issue.summary}
    <span style="color:var(--text-sub)">(${issueRes.issue.status})</span>
  `;

  // Lấy các worklog đã có trên issue này
  const worklogRes = await JiraApi.getWorklogs(AppState.settings.jiraBaseUrl, issueKey, authConfig);
  if (worklogRes.success) {
    AppState.alreadyLoggedDates = worklogRes.loggedDates;
  } else {
    AppState.alreadyLoggedDates.clear();
  }

  updateSummaryStats();
  renderDaysPreviewList();
}

/**
 * Làm mới trạng thái worklog khi đổi tháng/năm
 */
async function refreshWorklogStatusForIssue() {
  const key = document.getElementById('log-issue-key').value.trim();
  if (key && AppState.currentIssue) {
    await verifyAndFetchIssue(key);
  }
}

// ============================================================================
// THỰC THI LOGWORK HÀNG LOẠT (BATCH LOGWORK EXECUTION)
// ============================================================================

async function handleStartLogwork() {
  if (AppState.isRunningLogwork) return;

  const jiraBaseUrl = AppState.settings.jiraBaseUrl;
  if (!jiraBaseUrl) {
    alert('Vui lòng vào tab Cài đặt để nhập địa chỉ Jira Base URL trước!');
    return;
  }

  const issueKey = document.getElementById('log-issue-key').value.trim().toUpperCase();
  if (!issueKey) {
    alert('Vui lòng nhập Issue Key cần logwork!');
    document.getElementById('log-issue-key').focus();
    return;
  }

  const timeSpent = document.getElementById('log-time-spent').value.trim() || '8h';
  const startTime = document.getElementById('log-start-time').value.trim() || '09:00';
  const comment = document.getElementById('log-comment').value.trim() || 'Làm việc theo kế hoạch tháng';
  const skipLogged = document.getElementById('skip-logged-days').checked;

  // Lọc ra danh sách ngày thực tế sẽ gửi worklog
  const daysToProcess = AppState.workingDays.filter((day) => {
    if (skipLogged && AppState.alreadyLoggedDates.has(day.dateString)) {
      return false;
    }
    return true;
  });

  if (daysToProcess.length === 0) {
    alert('Không có ngày nào cần logwork! Tất cả các ngày công trong tháng đã được log hoặc không có ngày làm việc.');
    return;
  }

  const confirmMsg = `Xác nhận bắt đầu logwork:\n- Issue: ${issueKey}\n- Số ngày sẽ log: ${daysToProcess.length} ngày\n- Số giờ/ngày: ${timeSpent}\n- Nội dung: "${comment}"\n\nBạn có muốn tiếp tục?`;
  if (!confirm(confirmMsg)) {
    return;
  }

  // Bắt đầu tiến trình
  AppState.isRunningLogwork = true;
  const startBtn = document.getElementById('btn-start-logwork');
  startBtn.disabled = true;
  startBtn.textContent = '⏳ Đang logwork, vui lòng chờ...';

  const progressContainer = document.getElementById('progress-container');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressText = document.getElementById('progress-text');
  const progressPercent = document.getElementById('progress-percent');
  const logConsole = document.getElementById('log-console');

  progressContainer.classList.remove('hidden');
  logConsole.innerHTML = '';
  progressBarFill.style.width = '0%';

  const appendConsole = (msg, isError = false) => {
    const time = new Date().toLocaleTimeString('vi-VN');
    const line = document.createElement('div');
    if (isError) line.style.color = '#ff8f73';
    line.textContent = `[${time}] ${msg}`;
    logConsole.appendChild(line);
    logConsole.scrollTop = logConsole.scrollHeight;
  };

  appendConsole(`Bắt đầu tiến trình logwork cho issue ${issueKey} (${daysToProcess.length} ngày)...`);

  const authConfig = {
    authType: AppState.settings.authType,
    personalAccessToken: AppState.settings.personalAccessToken
  };

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < daysToProcess.length; i++) {
    const day = daysToProcess[i];
    const currentIndex = i + 1;
    const percent = Math.round((currentIndex / daysToProcess.length) * 100);

    progressText.textContent = `Đang log ngày ${day.displayDate} (${currentIndex}/${daysToProcess.length})...`;
    progressPercent.textContent = `${percent}%`;
    progressBarFill.style.width = `${percent}%`;

    const isoStarted = DateUtils.formatJiraStartedDateTime(day.dateString, startTime);

    const payload = {
      started: isoStarted,
      timeSpent: timeSpent,
      comment: comment
    };

    const res = await JiraApi.addWorklog(jiraBaseUrl, issueKey, payload, authConfig);
    if (res.success) {
      successCount++;
      AppState.alreadyLoggedDates.add(day.dateString);
      appendConsole(`✅ ${day.displayDate} (${day.dayOfWeek}): Log thành công (${timeSpent})`);
    } else {
      failCount++;
      appendConsole(`❌ ${day.displayDate}: Thất bại - ${res.error}`, true);
    }

    // Nghỉ nhẹ 150ms để tránh rate limit hoặc nghẽn server Jira
    await new Promise((r) => setTimeout(r, 150));
  }

  // Kết thúc tiến trình
  AppState.isRunningLogwork = false;
  startBtn.disabled = false;
  startBtn.textContent = '⚡ Bắt đầu Logwork Tự Động';

  progressText.textContent = `Hoàn tất! Thành công: ${successCount}, Thất bại: ${failCount}`;
  appendConsole(`🏁 Tổng kết: Đã log thành công ${successCount}/${daysToProcess.length} ngày.`);

  // Lưu issue vào danh sách gần đây
  saveRecentIssue(issueKey);

  // Cập nhật lại UI thống kê
  updateSummaryStats();
  renderDaysPreviewList();
}

/**
 * Lưu issue vừa log thành công vào danh sách Recent Issues trong storage.
 */
function saveRecentIssue(issueKey) {
  let list = AppState.settings.recentIssues || [];
  list = list.filter((k) => k !== issueKey);
  list.unshift(issueKey);
  if (list.length > 5) list = list.slice(0, 5);

  AppState.settings.recentIssues = list;
  saveSettingsToStorage();
  renderRecentIssuesDropdown(list);
}

// ============================================================================
// TAB TẠO TASK MẪU HÀNG THÁNG
// ============================================================================

async function handleCreateTask() {
  const jiraBaseUrl = AppState.settings.jiraBaseUrl;
  if (!jiraBaseUrl) {
    alert('Vui lòng vào tab Cài đặt để nhập địa chỉ Jira Base URL trước!');
    return;
  }

  const projectKey = document.getElementById('task-project-key').value.trim().toUpperCase();
  if (!projectKey) {
    alert('Vui lòng nhập Mã Project (ví dụ: PROJ)!');
    document.getElementById('task-project-key').focus();
    return;
  }

  const issueType = document.getElementById('task-issue-type').value;
  const rawSummary = document.getElementById('task-summary').value.trim();
  const rawDesc = document.getElementById('task-description').value.trim();

  // Lấy tháng và năm đang chọn ở tab Logwork
  const month = document.getElementById('log-month').value;
  const year = document.getElementById('log-year').value;

  // Thay thế các biến placeholder {month} và {year}
  const summary = rawSummary.replace(/{month}/gi, month).replace(/{year}/gi, year);
  const description = rawDesc.replace(/{month}/gi, month).replace(/{year}/gi, year);

  const btn = document.getElementById('btn-create-task');
  const resultBox = document.getElementById('create-task-result');

  btn.disabled = true;
  btn.textContent = '⏳ Đang tạo task...';
  resultBox.className = 'alert-box hidden';

  const authConfig = {
    authType: AppState.settings.authType,
    personalAccessToken: AppState.settings.personalAccessToken
  };

  const res = await JiraApi.createIssue(jiraBaseUrl, {
    projectKey,
    summary,
    description,
    issueType
  }, authConfig);

  btn.disabled = false;
  btn.textContent = '🚀 Tạo Task Mới Ngay';

  if (res.success && res.createdKey) {
    const createdKey = res.createdKey;
    resultBox.className = 'alert-box alert-success';
    resultBox.innerHTML = `
      🎉 Tạo task thành công: <strong>${createdKey}</strong>!<br>
      <div style="margin-top:6px;">
        <button id="btn-use-new-task" class="btn btn-primary" style="padding:4px 8px; font-size:11px;">
          👉 Chuyển sang Logwork ngay cho task này
        </button>
      </div>
    `;
    resultBox.classList.remove('hidden');

    // Lưu project key để gợi ý lần sau
    AppState.settings.lastProjectKey = projectKey;
    saveRecentIssue(createdKey);

    // Bắt sự kiện click để nhảy sang tab logwork
    document.getElementById('btn-use-new-task').addEventListener('click', () => {
      document.getElementById('log-issue-key').value = createdKey;
      document.querySelector('.tab-btn[data-tab="tab-logwork"]').click();
      verifyAndFetchIssue(createdKey);
    });
  } else {
    resultBox.className = 'alert-box alert-danger';
    resultBox.innerHTML = `❌ Lỗi tạo task: ${res.error}`;
    resultBox.classList.remove('hidden');
  }
}

// ============================================================================
// TAB CÀI ĐẶT & KIỂM TRA KẾT NỐI
// ============================================================================

async function handleTestConnection() {
  const url = document.getElementById('jira-base-url').value.trim();
  const authType = document.querySelector('input[name="auth-type"]:checked').value;
  const pat = document.getElementById('personal-access-token').value.trim();

  const resultBox = document.getElementById('connection-test-result');
  const btn = document.getElementById('btn-test-connection');

  btn.disabled = true;
  btn.textContent = '⏳ Đang kiểm tra...';
  resultBox.className = 'alert-box hidden';

  const res = await JiraApi.testConnection(url, {
    authType,
    personalAccessToken: pat
  });

  btn.disabled = false;
  btn.textContent = '🔌 Kiểm Tra Kết Nối (Ping)';

  if (res.success && res.user) {
    resultBox.className = 'alert-box alert-success';
    resultBox.innerHTML = `
      ✅ Kết nối thành công tới Jira!<br>
      Tài khoản: <strong>${res.user.displayName}</strong> (${res.user.name})<br>
      ${res.user.emailAddress ? `Email: ${res.user.emailAddress}` : ''}
    `;
    resultBox.classList.remove('hidden');

    // Cập nhật header status pill
    const statusPill = document.getElementById('user-status-pill');
    const statusText = document.getElementById('user-status-text');
    statusPill.className = 'status-pill status-connected';
    statusText.textContent = res.user.displayName || res.user.name;
  } else {
    resultBox.className = 'alert-box alert-danger';
    resultBox.innerHTML = `❌ Kết nối thất bại: ${res.error}`;
    resultBox.classList.remove('hidden');
  }
}

function handleSaveSettings() {
  const url = document.getElementById('jira-base-url').value.trim();
  const authType = document.querySelector('input[name="auth-type"]:checked').value;
  const pat = document.getElementById('personal-access-token').value.trim();
  const holidays = document.getElementById('excluded-holidays').value.trim();

  AppState.settings.jiraBaseUrl = url;
  AppState.settings.authType = authType;
  AppState.settings.personalAccessToken = pat;
  AppState.settings.excludedHolidays = holidays;

  saveSettingsToStorage();

  const resultBox = document.getElementById('connection-test-result');
  resultBox.className = 'alert-box alert-success';
  resultBox.textContent = '💾 Đã lưu cấu hình thành công!';
  resultBox.classList.remove('hidden');

  // Cập nhật lại tính toán ngày công
  calculateAndRenderWorkingDays();

  // Cập nhật banner cảnh báo
  const warningBanner = document.getElementById('url-warning-banner');
  if (warningBanner) {
    if (url) warningBanner.classList.add('hidden');
    else warningBanner.classList.remove('hidden');
  }
}

function saveSettingsToStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ jira_settings: AppState.settings });
  }
}
