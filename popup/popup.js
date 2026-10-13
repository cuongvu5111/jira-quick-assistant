/**
 * Ngày tạo: 13/10/2026 (Cập nhật phiên bản 2.0)
 * Mục đích: Điều phối toàn bộ sự kiện giao diện phiên bản 2.0:
 *           - Hỗ trợ logwork theo Tuần / Tháng linh hoạt
 *           - Tải và phân bổ danh sách Sub-tasks từ Parent Issue hoặc danh sách Keys
 *           - Kiểm soát nghiêm ngặt quy định công ty: Tối đa 8 giờ/task
 *           - Tạo hàng loạt Sub-task mẫu theo tuần/tháng cho Parent Issue
 *           - Tự động bóc tách URL Jira khi người dùng dán link trực tiếp.
 */

// State quản lý phiên làm việc của Extension
const AppState = {
  settings: {
    jiraBaseUrl: '',
    authType: 'cookie',
    personalAccessToken: '',
    defaultTimeSpent: '8h',
    defaultStartTime: '09:00',
    defaultComment: 'Làm việc theo kế hoạch',
    excludedHolidays: '',
    recentIssues: [],
    lastProjectKey: '',
    lastParentKey: '',
    autoResolveTask: true
  },
  timeMode: 'week', // 'week' | 'month'
  targetMode: 'parent-subtasks', // 'parent-subtasks' | 'single' | 'multi-keys'
  currentUser: null,
  currentWeeks: [],
  selectedWeekIndex: 0,
  activeWorkingDays: [],
  loadedSubtasks: [], // Array<{ key, summary, status, totalSeconds, totalHours, isAt8hCap, loggedDates }>
  taskMapping: [], // Array<{ day, issueKey, issueSummary, status, hoursToLog, skip }>
  isRunningBatch: false
};

// ============================================================================
// KHỞI TẠO & LOAD CẤU HÌNH BAN ĐẦU
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initDateSelectors();
  initTabNavigation();
  initModeSwitchers();
  initEventHandlers();
  await loadSettingsFromStorage();
  checkInitialConnection();
  refreshCalendarData();
});

/**
 * Khởi tạo danh sách Tháng và Năm trong dropdown (mặc định tháng và năm hiện tại).
 */
function initDateSelectors() {
  const monthSelect = document.getElementById('log-month');
  const yearSelect = document.getElementById('log-year');

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `Tháng ${m}`;
    if (m === currentMonth) opt.selected = true;
    monthSelect.appendChild(opt);
  }

  for (let y = currentYear - 1; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = `Năm ${y}`;
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }
}

/**
 * Quản lý chuyển đổi giữa các Tab giao diện chính.
 */
function initTabNavigation() {
  const tabButtons = document.querySelectorAll('.nav-tabs .tab-btn');
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
 * Quản lý các bộ chuyển đổi phân đoạn (Segmented Controls)
 */
function initModeSwitchers() {
  // Switcher: Theo Tuần vs Theo Tháng
  const btnWeek = document.getElementById('btn-mode-week');
  const btnMonth = document.getElementById('btn-mode-month');
  const weekGroup = document.getElementById('week-selector-group');

  btnWeek.addEventListener('click', () => {
    btnWeek.classList.add('active');
    btnMonth.classList.remove('active');
    weekGroup.classList.remove('hidden');
    AppState.timeMode = 'week';
    refreshCalendarData();
  });

  btnMonth.addEventListener('click', () => {
    btnMonth.classList.add('active');
    btnWeek.classList.remove('active');
    weekGroup.classList.add('hidden');
    AppState.timeMode = 'month';
    refreshCalendarData();
  });

  // Switcher: Tạo Sub-tasks vs Tạo Task Độc lập (Tab 2)
  const btnCreateSubtasks = document.getElementById('btn-create-subtasks-mode');
  const btnCreateSingle = document.getElementById('btn-create-single-mode');
  const formSubtasks = document.getElementById('form-create-subtasks');
  const formSingle = document.getElementById('form-create-single');

  btnCreateSubtasks.addEventListener('click', () => {
    btnCreateSubtasks.classList.add('active');
    btnCreateSingle.classList.remove('active');
    formSubtasks.classList.remove('hidden');
    formSingle.classList.add('hidden');
  });

  btnCreateSingle.addEventListener('click', () => {
    btnCreateSingle.classList.add('active');
    btnCreateSubtasks.classList.remove('active');
    formSingle.classList.remove('hidden');
    formSubtasks.classList.add('hidden');
  });

  // Chế độ chọn Task (Target Mode: Parent Subtasks, Single, Multi-keys)
  const targetRadios = document.querySelectorAll('input[name="target-mode"]');
  targetRadios.forEach((r) => {
    r.addEventListener('change', (e) => {
      AppState.targetMode = e.target.value;
      updateTargetModeUI();
      buildTaskMappingAndSummary();
    });
  });
}

function updateTargetModeUI() {
  const parentGroup = document.getElementById('target-parent-group');
  const singleGroup = document.getElementById('target-single-group');
  const multiGroup = document.getElementById('target-multi-group');

  parentGroup.classList.add('hidden');
  singleGroup.classList.add('hidden');
  multiGroup.classList.add('hidden');

  if (AppState.targetMode === 'parent-subtasks') {
    parentGroup.classList.remove('hidden');
  } else if (AppState.targetMode === 'single') {
    singleGroup.classList.remove('hidden');
  } else if (AppState.targetMode === 'multi-keys') {
    multiGroup.classList.remove('hidden');
  }
}

/**
 * Đọc cấu hình từ chrome.storage.local
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
      resolve();
    }
  });
}

function applySettingsToUI() {
  const { jiraBaseUrl, authType, personalAccessToken, defaultTimeSpent, defaultStartTime, defaultComment, excludedHolidays, recentIssues, lastProjectKey, lastParentKey } = AppState.settings;

  // Settings tab
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

  // Logwork tab
  const timeSpentInput = document.getElementById('log-time-spent');
  if (timeSpentInput && defaultTimeSpent) timeSpentInput.value = defaultTimeSpent;

  const startTimeInput = document.getElementById('log-start-time');
  if (startTimeInput && defaultStartTime) startTimeInput.value = defaultStartTime;

  const commentInput = document.getElementById('log-comment');
  if (commentInput && defaultComment) commentInput.value = defaultComment;

  const autoResolveInput = document.getElementById('auto-resolve-task');
  if (autoResolveInput && typeof AppState.settings.autoResolveTask === 'boolean') {
    autoResolveInput.checked = AppState.settings.autoResolveTask;
  }

  // Điền parent key nếu có lưu
  if (lastParentKey) {
    const parentInput = document.getElementById('parent-issue-key');
    if (parentInput) parentInput.value = lastParentKey;
    const createParentInput = document.getElementById('create-parent-key');
    if (createParentInput) createParentInput.value = lastParentKey;
  }

  // Task tab
  const projectKeyInput = document.getElementById('task-project-key');
  if (projectKeyInput && lastProjectKey) projectKeyInput.value = lastProjectKey;

  renderRecentIssuesDropdown(recentIssues);

  // Check URL warning
  const warningBanner = document.getElementById('url-warning-banner');
  if (warningBanner) {
    if (!jiraBaseUrl) warningBanner.classList.remove('hidden');
    else warningBanner.classList.add('hidden');
  }
}

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
    statusPill.title = `Đã kết nối với Jira: ${res.user.displayName} (${res.user.name})`;

    const subtaskAssigneeLabel = document.getElementById('subtask-assignee-label');
    if (subtaskAssigneeLabel) subtaskAssigneeLabel.textContent = `Gán Người thực hiện (Assignee) là tôi (${res.user.displayName || res.user.name})`;
    const taskAssigneeLabel = document.getElementById('task-assignee-label');
    if (taskAssigneeLabel) taskAssigneeLabel.textContent = `Gán Assignee là tôi (${res.user.displayName || res.user.name})`;
  } else {
    statusPill.className = 'status-pill status-disconnected';
    statusText.textContent = 'Chưa đăng nhập';
  }
}

// ============================================================================
// ĐĂNG KÝ SỰ KIỆN TƯƠNG TÁC
// ============================================================================
function initEventHandlers() {
  // Thay đổi Tháng / Năm
  document.getElementById('log-month').addEventListener('change', refreshCalendarData);
  document.getElementById('log-year').addEventListener('change', refreshCalendarData);

  // Thay đổi Tuần
  document.getElementById('log-week-select').addEventListener('change', (e) => {
    AppState.selectedWeekIndex = parseInt(e.target.value, 10);
    updateActiveDaysFromSelection();
    buildTaskMappingAndSummary();
  });

  // Tự động bóc tách URL khi paste vào parent-issue-key
  const parentInput = document.getElementById('parent-issue-key');
  parentInput.addEventListener('input', (e) => {
    const raw = e.target.value;
    const cleanKey = DateUtils.extractIssueKey(raw);
    const extractedUrl = DateUtils.extractBaseUrl(raw);

    // Nếu người dùng dán URL và chưa cấu hình Base URL, tự động lưu Base URL
    if (extractedUrl && extractedUrl.startsWith('http') && !AppState.settings.jiraBaseUrl) {
      AppState.settings.jiraBaseUrl = extractedUrl;
      saveSettingsToStorage();
      document.getElementById('jira-base-url').value = extractedUrl;
    }

    if (cleanKey !== raw) {
      e.target.value = cleanKey;
    }
  });

  // Bấm Tải Sub-tasks
  document.getElementById('btn-fetch-subtasks').addEventListener('click', handleFetchParentSubtasks);
  parentInput.addEventListener('blur', (e) => {
    const key = e.target.value.trim();
    if (key && AppState.loadedSubtasks.length === 0) {
      handleFetchParentSubtasks();
    }
  });

  // Chế độ 1 task duy nhất: Kiểm tra issue
  document.getElementById('btn-verify-single-issue').addEventListener('click', () => {
    const key = DateUtils.extractIssueKey(document.getElementById('log-issue-key').value);
    document.getElementById('log-issue-key').value = key;
    if (key) verifySingleIssue(key);
  });

  // Chế độ multi-keys textarea
  document.getElementById('multi-issue-keys').addEventListener('blur', () => {
    buildTaskMappingAndSummary();
  });

  // Checkbox bỏ qua ngày đã log / đủ 8h
  document.getElementById('skip-logged-days').addEventListener('change', () => {
    buildTaskMappingAndSummary();
  });

  // Checkbox tự động resolve task
  const autoResolveCheck = document.getElementById('auto-resolve-task');
  if (autoResolveCheck) {
    autoResolveCheck.addEventListener('change', (e) => {
      AppState.settings.autoResolveTask = e.target.checked;
      saveSettingsToStorage();
    });
  }

  // Ẩn/Hiện bảng chi tiết phân bổ
  document.getElementById('btn-toggle-days-preview').addEventListener('click', () => {
    const container = document.getElementById('days-preview-container');
    const btn = document.getElementById('btn-toggle-days-preview');
    const isHidden = container.classList.contains('hidden');
    if (isHidden) {
      container.classList.remove('hidden');
      btn.textContent = 'Thu gọn ▲';
    } else {
      container.classList.add('hidden');
      btn.textContent = 'Chi tiết phân bổ ▼';
    }
  });

  // Nút bắt đầu Logwork
  document.getElementById('btn-start-logwork').addEventListener('click', handleStartLogwork);

  // Tab 2: Tự động bóc tách URL ở ô Create Parent Key
  const createParentInput = document.getElementById('create-parent-key');
  createParentInput.addEventListener('input', (e) => {
    const cleanKey = DateUtils.extractIssueKey(e.target.value);
    if (cleanKey !== e.target.value) e.target.value = cleanKey;
  });
  createParentInput.addEventListener('blur', async (e) => {
    const key = e.target.value.trim();
    if (key && AppState.settings.jiraBaseUrl) {
      const authConfig = {
        authType: AppState.settings.authType,
        personalAccessToken: AppState.settings.personalAccessToken
      };
      const detected = await JiraApi.detectCustomFieldsFromIssue(AppState.settings.jiraBaseUrl, key, authConfig);
      if (detected.success) {
        if (detected.spda?.value?.value) {
          document.getElementById('subtask-spda-parent').value = detected.spda.value.value;
        }
        if (detected.spda?.value?.child?.value) {
          document.getElementById('subtask-spda-child').value = detected.spda.value.child.value;
        }
        if (detected.congDoan?.value?.value) {
          document.getElementById('subtask-cong-doan').value = detected.congDoan.value.value;
        }
      }
    }
  });

  // Tab 2: Chuyển đổi loại Due Date của Sub-tasks
  const dueDateTypeSelect = document.getElementById('subtask-due-date-type');
  if (dueDateTypeSelect) {
    dueDateTypeSelect.addEventListener('change', (e) => {
      const customGroup = document.getElementById('subtask-custom-due-date-group');
      if (customGroup) {
        if (e.target.value === 'custom') customGroup.classList.remove('hidden');
        else customGroup.classList.add('hidden');
      }
    });
  }

  // Tab 2: Nút sinh mẫu 5 Sub-tasks theo tuần
  document.getElementById('btn-gen-week-subtasks').addEventListener('click', generateWeekSubtasksTemplate);
  document.getElementById('btn-gen-month-subtasks').addEventListener('click', generateMonthSubtasksTemplate);

  // Tab 2: Nút bắt đầu tạo nhiều sub-task
  document.getElementById('btn-batch-create-subtasks').addEventListener('click', handleBatchCreateSubtasks);

  // Tab 2: Nút tạo task độc lập
  document.getElementById('btn-create-single-task').addEventListener('click', handleCreateSingleTask);

  // Tab 3: Cài đặt
  const authRadios = document.querySelectorAll('input[name="auth-type"]');
  authRadios.forEach((r) => {
    r.addEventListener('change', (e) => togglePatInputVisibility(e.target.value));
  });
  document.getElementById('btn-test-connection').addEventListener('click', handleTestConnection);
  document.getElementById('btn-save-settings').addEventListener('click', handleSaveSettings);
}

function togglePatInputVisibility(authType) {
  const patGroup = document.getElementById('pat-input-group');
  if (patGroup) {
    if (authType === 'token') patGroup.classList.remove('hidden');
    else patGroup.classList.add('hidden');
  }
}

// ============================================================================
// XỬ LÝ LỊCH, TUẦN LÀM VIỆC & MAPPING 1-1
// ============================================================================

/**
 * Tính toán lại danh sách tuần và ngày làm việc khi đổi Tháng/Năm hoặc chế độ.
 */
function refreshCalendarData() {
  const month = parseInt(document.getElementById('log-month').value, 10);
  const year = parseInt(document.getElementById('log-year').value, 10);
  const excludedSet = DateUtils.parseExcludedDates(AppState.settings.excludedHolidays);

  // Tính toàn bộ các tuần trong tháng
  AppState.currentWeeks = DateUtils.getWeeksOfMonth(year, month, excludedSet);

  // Cập nhật dropdown tuần
  const weekSelect = document.getElementById('log-week-select');
  weekSelect.innerHTML = '';

  AppState.currentWeeks.forEach((w, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = w.label;
    weekSelect.appendChild(opt);
  });

  // Mặc định chọn tuần đầu tiên hoặc tuần hiện tại
  if (AppState.currentWeeks.length > 0) {
    AppState.selectedWeekIndex = 0;
    weekSelect.value = 0;
  }

  updateActiveDaysFromSelection();
  buildTaskMappingAndSummary();
}

/**
 * Lấy danh sách ngày làm việc cụ thể đang được kích hoạt (theo tuần hoặc theo tháng).
 */
function updateActiveDaysFromSelection() {
  const month = parseInt(document.getElementById('log-month').value, 10);
  const year = parseInt(document.getElementById('log-year').value, 10);
  const excludedSet = DateUtils.parseExcludedDates(AppState.settings.excludedHolidays);

  if (AppState.timeMode === 'week') {
    if (AppState.currentWeeks.length > 0 && AppState.currentWeeks[AppState.selectedWeekIndex]) {
      AppState.activeWorkingDays = AppState.currentWeeks[AppState.selectedWeekIndex].days;
    } else {
      AppState.activeWorkingDays = [];
    }
  } else {
    // Chế độ cả tháng
    AppState.activeWorkingDays = DateUtils.getWorkingDaysOfMonth(year, month, excludedSet);
  }
}

/**
 * Tải danh sách sub-tasks từ Jira đối với Parent Issue Key.
 */
async function handleFetchParentSubtasks() {
  const rawKey = document.getElementById('parent-issue-key').value;
  const parentKey = DateUtils.extractIssueKey(rawKey);
  document.getElementById('parent-issue-key').value = parentKey;

  const badge = document.getElementById('parent-info-badge');
  badge.classList.remove('hidden');
  badge.innerHTML = '<em>Đang tải danh sách Sub-tasks từ Jira...</em>';

  if (!AppState.settings.jiraBaseUrl) {
    badge.innerHTML = '<span style="color:var(--danger-color)">⚠️ Chưa cấu hình Jira Base URL. Vui lòng vào Tab Cài đặt.</span>';
    return;
  }

  const authConfig = {
    authType: AppState.settings.authType,
    personalAccessToken: AppState.settings.personalAccessToken
  };

  const res = await JiraApi.getIssueWithSubtasks(AppState.settings.jiraBaseUrl, parentKey, authConfig);
  if (!res.success) {
    badge.innerHTML = `<span style="color:var(--danger-color)">❌ ${res.error}</span>`;
    AppState.loadedSubtasks = [];
    buildTaskMappingAndSummary();
    return;
  }

  const subtasks = res.subtasks || [];
  badge.innerHTML = `
    <strong>[${res.issue.key}]</strong>: ${res.issue.summary}<br>
    <em>Tìm thấy <strong>${subtasks.length} Sub-task(s)</strong>. Đang kiểm tra giờ đã log trên từng task...</em>
  `;

  // Lưu parent key
  AppState.settings.lastParentKey = parentKey;
  saveSettingsToStorage();

  // Kiểm tra tổng giờ và worklog trên từng sub-task
  const loadedList = [];
  for (const st of subtasks) {
    const wlRes = await JiraApi.getWorklogs(AppState.settings.jiraBaseUrl, st.key, authConfig);
    loadedList.push({
      key: st.key,
      summary: st.summary,
      status: st.status,
      totalSeconds: wlRes.totalSeconds || 0,
      totalHours: wlRes.totalHours || 0,
      isAt8hCap: wlRes.isAt8hCap || false,
      loggedDates: wlRes.loggedDates || new Set()
    });
  }

  AppState.loadedSubtasks = loadedList;

  const cappedCount = loadedList.filter((t) => t.isAt8hCap).length;
  badge.innerHTML = `
    <strong>[${res.issue.key}]</strong>: ${res.issue.summary}<br>
    ✅ Đã tải <strong>${subtasks.length} Sub-task(s)</strong> (${cappedCount} task đã đủ 8h).
  `;

  buildTaskMappingAndSummary();
}

/**
 * Xây dựng bảng Mapping 1-1 giữa Ngày làm việc ↔ Task tương ứng
 * Thuật toán thông minh (Smart Sub-task Allocation):
 * - Bước 1: Quét các ngày đã từng có worklog trên Jira để gán đúng task và đánh dấu Đã log.
 * - Bước 2: Với các ngày chưa log, tự động tìm sub-task còn trống (< 8h và chưa gán) để gán vào.
 * - Bước 3: Tuân thủ quy định công ty: Không gán sub-task đã đủ 8h cho ngày mới.
 */
function buildTaskMappingAndSummary() {
  const skipLogged = document.getElementById('skip-logged-days').checked;
  const timeSpentVal = document.getElementById('log-time-spent').value.trim() || '8h';
  const hoursPerDay = Math.min(8, parseFloat(timeSpentVal.replace(/[^\d.]/g, '')) || 8); // Giới hạn tối đa 8h

  AppState.taskMapping = [];
  const tbody = document.getElementById('mapping-table-body');
  tbody.innerHTML = '';

  const days = AppState.activeWorkingDays;
  let toLogDaysCount = 0;
  let alreadyLoggedDaysCount = 0;

  if (AppState.targetMode === 'parent-subtasks') {
    // -------------------------------------------------------------
    // CHẾ ĐỘ PHÂN BỔ SUB-TASKS CỦA PARENT ISSUE (THUẬT TOÁN THÔNG MINH)
    // -------------------------------------------------------------
    const subtasks = AppState.loadedSubtasks;
    const usedSubtaskKeys = new Set();
    const dayAllocations = new Array(days.length).fill(null);

    // BƯỚC 1: Quét các ngày đã từng có worklog trên bất kỳ sub-task nào
    days.forEach((day, dayIndex) => {
      const matchedLoggedTask = subtasks.find((st) => st.loggedDates && st.loggedDates.has(day.dateString));
      if (matchedLoggedTask) {
        dayAllocations[dayIndex] = {
          task: matchedLoggedTask,
          isAlreadyLoggedOnDate: true
        };
        usedSubtaskKeys.add(matchedLoggedTask.key);
      }
    });

    // BƯỚC 2: Với các ngày còn lại chưa có logwork, tìm sub-task còn trống (< 8h và chưa dùng)
    days.forEach((day, dayIndex) => {
      if (!dayAllocations[dayIndex]) {
        const candidate = subtasks.find((st) => !usedSubtaskKeys.has(st.key) && !st.isAt8hCap && st.totalHours < 8);
        if (candidate) {
          dayAllocations[dayIndex] = {
            task: candidate,
            isAlreadyLoggedOnDate: false
          };
          usedSubtaskKeys.add(candidate.key);
        } else {
          dayAllocations[dayIndex] = {
            task: null,
            isAlreadyLoggedOnDate: false
          };
        }
      }
    });

    // BƯỚC 3: Dựng Mapping và Render UI cho từng ngày
    days.forEach((day, dayIndex) => {
      const allocation = dayAllocations[dayIndex];
      const task = allocation ? allocation.task : null;
      const isAlreadyLoggedOnDate = allocation ? allocation.isAlreadyLoggedOnDate : false;

      let assignedKey = task ? task.key : '';
      let assignedSummary = task ? task.summary : '';
      let existingHours = task ? task.totalHours : 0;
      let statusText = '';
      let badgeClass = '';
      let shouldSkip = false;

      if (isAlreadyLoggedOnDate) {
        statusText = `Đã log ngày này (${existingHours}h)`;
        badgeClass = 'badge-logged';
        if (skipLogged) shouldSkip = true;
        alreadyLoggedDaysCount++;
      } else if (task) {
        statusText = `Sẵn sàng (${hoursPerDay}h)`;
        badgeClass = 'badge-ready';
        toLogDaysCount++;
      } else {
        assignedKey = '(Hết Sub-task trống)';
        assignedSummary = 'Tất cả sub-task đã đủ 8h hoặc chưa tạo thêm sub-task';
        statusText = 'Thiếu Sub-task < 8h';
        badgeClass = 'badge-capped';
        shouldSkip = true;
      }

      AppState.taskMapping.push({
        day,
        issueKey: assignedKey,
        issueSummary: assignedSummary,
        status: statusText,
        hoursToLog: `${hoursPerDay}h`,
        skip: shouldSkip
      });

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${day.displayDate}</strong> (${day.dayOfWeek})</td>
        <td><code>${assignedKey}</code></td>
        <td>${existingHours > 0 ? existingHours + 'h' : '0h'}</td>
        <td><span class="badge-status ${badgeClass}">${statusText}</span></td>
      `;
      tbody.appendChild(tr);
    });

  } else {
    // -------------------------------------------------------------
    // CHẾ ĐỘ SINGLE TASK HOẶC MULTI-KEYS
    // -------------------------------------------------------------
    const multiKeysList = AppState.targetMode === 'multi-keys'
      ? document.getElementById('multi-issue-keys').value.split('\n').map((l) => l.trim()).filter(Boolean)
      : [];

    days.forEach((day, index) => {
      let assignedKey = '';
      let assignedSummary = '';
      let existingHours = 0;
      let isAlreadyLoggedOnDate = false;

      if (AppState.targetMode === 'single') {
        assignedKey = document.getElementById('log-issue-key').value.trim().toUpperCase() || '(Chưa nhập)';
        assignedSummary = 'Task duy nhất';
        if (AppState.currentIssue && AppState.alreadyLoggedDates) {
          isAlreadyLoggedOnDate = AppState.alreadyLoggedDates.has(day.dateString);
        }
      } else if (AppState.targetMode === 'multi-keys') {
        if (index < multiKeysList.length) {
          assignedKey = DateUtils.extractIssueKey(multiKeysList[index]);
          assignedSummary = `Task dòng ${index + 1}`;
        } else {
          assignedKey = '(Thiếu Key)';
          assignedSummary = 'Chưa nhập mã task cho ngày này';
        }
      }

      let statusText = '';
      let badgeClass = '';
      let shouldSkip = false;

      if (!assignedKey || assignedKey.startsWith('(')) {
        statusText = 'Chưa gán task';
        badgeClass = 'badge-skipped';
        shouldSkip = true;
      } else if (isAlreadyLoggedOnDate) {
        statusText = `Đã log ngày này (${existingHours}h)`;
        badgeClass = 'badge-logged';
        if (skipLogged) shouldSkip = true;
        alreadyLoggedDaysCount++;
      } else {
        statusText = `Sẵn sàng (${hoursPerDay}h)`;
        badgeClass = 'badge-ready';
        toLogDaysCount++;
      }

      AppState.taskMapping.push({
        day,
        issueKey: assignedKey,
        issueSummary: assignedSummary,
        status: statusText,
        hoursToLog: `${hoursPerDay}h`,
        skip: shouldSkip
      });

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${day.displayDate}</strong> (${day.dayOfWeek})</td>
        <td><code>${assignedKey}</code></td>
        <td>${existingHours > 0 ? existingHours + 'h' : '0h'}</td>
        <td><span class="badge-status ${badgeClass}">${statusText}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Cập nhật thống kê
  const totalDays = days.length;
  const totalHours = Math.round(toLogDaysCount * hoursPerDay * 10) / 10;

  document.getElementById('stat-total-working-days').textContent = totalDays;
  document.getElementById('stat-already-logged-days').textContent = alreadyLoggedDaysCount;
  document.getElementById('stat-to-log-days').textContent = toLogDaysCount;
  document.getElementById('stat-total-hours').textContent = `${totalHours}h`;

  const titleMode = AppState.timeMode === 'week' ? 'trong tuần' : 'trong tháng';
  document.getElementById('summary-card-title').textContent = `📊 Tóm tắt ngày công ${titleMode}:`;
}

/**
 * Kiểm tra issue đơn lẻ (Chế độ Single Task)
 */
async function verifySingleIssue(issueKey) {
  const badge = document.getElementById('single-issue-info-badge');
  badge.classList.remove('hidden');
  badge.innerHTML = '<em>Đang kiểm tra Issue trên Jira...</em>';

  const authConfig = {
    authType: AppState.settings.authType,
    personalAccessToken: AppState.settings.personalAccessToken
  };

  const res = await JiraApi.getIssueWithSubtasks(AppState.settings.jiraBaseUrl, issueKey, authConfig);
  if (!res.success) {
    badge.innerHTML = `<span style="color:var(--danger-color)">❌ ${res.error}</span>`;
    return;
  }

  badge.innerHTML = `<strong>[${res.issue.key}]</strong>: ${res.issue.summary} (${res.issue.status})`;
  buildTaskMappingAndSummary();
}

// ============================================================================
// THỰC THI LOGWORK THEO PHÂN BỔ 1-1 (BATCH LOGWORK)
// ============================================================================

async function handleStartLogwork() {
  if (AppState.isRunningBatch) return;

  const jiraBaseUrl = AppState.settings.jiraBaseUrl;
  if (!jiraBaseUrl) {
    alert('Vui lòng vào tab Cài đặt để nhập địa chỉ Jira Base URL trước!');
    return;
  }

  // Lọc ra các ngày thực tế sẽ gửi worklog
  const itemsToLog = AppState.taskMapping.filter((item) => !item.skip && item.issueKey && !item.issueKey.startsWith('('));

  if (itemsToLog.length === 0) {
    alert('Không có task nào cần logwork! Tất cả các ngày công đã được log đủ 8h hoặc chưa gán task.');
    return;
  }

  const modeText = AppState.timeMode === 'week' ? 'tuần này' : 'tháng này';
  const confirmMsg = `Xác nhận bắt đầu logwork (${modeText}):\n- Số ngày sẽ log: ${itemsToLog.length} ngày\n- Số giờ mỗi task: 8h (Tuân thủ quy định tối đa 8h/task)\n- Phân bổ theo từng task tương ứng.\n\nBạn có muốn tiếp tục?`;
  if (!confirm(confirmMsg)) return;

  AppState.isRunningBatch = true;
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

  appendConsole(`Bắt đầu tiến trình logwork (${itemsToLog.length} ngày)...`);

  const startTime = document.getElementById('log-start-time').value.trim() || '09:00';
  const comment = document.getElementById('log-comment').value.trim() || 'Làm việc theo kế hoạch';
  const authConfig = {
    authType: AppState.settings.authType,
    personalAccessToken: AppState.settings.personalAccessToken
  };

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < itemsToLog.length; i++) {
    const item = itemsToLog[i];
    const currentIndex = i + 1;
    const percent = Math.round((currentIndex / itemsToLog.length) * 100);

    progressText.textContent = `Đang log: ${item.day.displayDate} -> ${item.issueKey} (${currentIndex}/${itemsToLog.length})...`;
    progressPercent.textContent = `${percent}%`;
    progressBarFill.style.width = `${percent}%`;

    const isoStarted = DateUtils.formatJiraStartedDateTime(item.day.dateString, startTime);

    const payload = {
      started: isoStarted,
      timeSpent: item.hoursToLog,
      comment: `${comment} (${item.day.dayOfWeek} ${item.day.displayDate})`
    };

    const res = await JiraApi.addWorklog(jiraBaseUrl, item.issueKey, payload, authConfig);
    if (res.success) {
      successCount++;
      appendConsole(`✅ [${item.day.displayDate}] ${item.issueKey}: Log thành công (${item.hoursToLog})`);

      // Tự động Resolve Task nếu checkbox được bật
      const shouldResolve = document.getElementById('auto-resolve-task')?.checked;
      if (shouldResolve) {
        const resolveRes = await JiraApi.resolveIssue(jiraBaseUrl, item.issueKey, authConfig);
        if (resolveRes.success) {
          appendConsole(`✨ [${item.issueKey}] Đã chuyển trạng thái: ${resolveRes.transitionName} (${resolveRes.toStatus})`);
        } else if (resolveRes.skipped) {
          appendConsole(`ℹ️ [${item.issueKey}] ${resolveRes.reason}`);
        } else if (resolveRes.error) {
          appendConsole(`⚠️ [${item.issueKey}] Không thể resolve: ${resolveRes.error}`);
        }
      }
    } else {
      failCount++;
      appendConsole(`❌ [${item.day.displayDate}] ${item.issueKey}: Thất bại - ${res.error}`, true);
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  AppState.isRunningBatch = false;
  startBtn.disabled = false;
  startBtn.textContent = '⚡ Bắt đầu Phân Bổ & Logwork';

  progressText.textContent = `Hoàn tất! Thành công: ${successCount}, Thất bại: ${failCount}`;
  appendConsole(`🏁 Tổng kết: Đã log thành công ${successCount}/${itemsToLog.length} task.`);

  // Làm mới lại dữ liệu subtasks nếu ở chế độ parent
  if (AppState.targetMode === 'parent-subtasks') {
    handleFetchParentSubtasks();
  } else {
    buildTaskMappingAndSummary();
  }
}

// ============================================================================
// TAB 2: TẠO HÀNG LOẠT SUB-TASK THEO TUẦN / THÁNG
// ============================================================================

/**
 * Sinh mẫu 5 Sub-task tương ứng với 5 ngày trong tuần đang chọn.
 */
function generateWeekSubtasksTemplate() {
  const days = AppState.activeWorkingDays;
  const textarea = document.getElementById('create-subtask-list');

  const defaultTasks = [
    'Phân tích yêu cầu và thiết kế giải pháp',
    'Lập trình và phát triển chức năng',
    'Kiểm thử, fix bug và hoàn thiện module',
    'Cấu hình môi trường và triển khai hệ thống',
    'Họp giao ban, báo cáo tiến độ và tổng kết tuần'
  ];

  const lines = days.map((day, idx) => {
    const taskName = defaultTasks[idx % defaultTasks.length];
    return `[${day.dayOfWeek} ${day.displayDate}] ${taskName}`;
  });

  textarea.value = lines.join('\n');
}

/**
 * Sinh mẫu Sub-task cho tất cả các ngày làm việc trong tháng.
 */
function generateMonthSubtasksTemplate() {
  const month = parseInt(document.getElementById('log-month').value, 10);
  const year = parseInt(document.getElementById('log-year').value, 10);
  const excludedSet = DateUtils.parseExcludedDates(AppState.settings.excludedHolidays);
  const allDays = DateUtils.getWorkingDaysOfMonth(year, month, excludedSet);

  const textarea = document.getElementById('create-subtask-list');
  const lines = allDays.map((day) => `[${day.dayOfWeek} ${day.displayDate}] Thực hiện công việc vận hành & phát triển`);
  textarea.value = lines.join('\n');
}

/**
 * Thực thi tạo hàng loạt Sub-task cho Parent Issue
 */
async function handleBatchCreateSubtasks() {
  const jiraBaseUrl = AppState.settings.jiraBaseUrl;
  if (!jiraBaseUrl) {
    alert('Vui lòng vào tab Cài đặt để nhập địa chỉ Jira Base URL trước!');
    return;
  }

  const rawParentKey = document.getElementById('create-parent-key').value;
  const parentKey = DateUtils.extractIssueKey(rawParentKey);
  document.getElementById('create-parent-key').value = parentKey;

  if (!parentKey) {
    alert('Vui lòng nhập Mã Task Cha (Parent Issue Key)!');
    document.getElementById('create-parent-key').focus();
    return;
  }

  const textLines = document.getElementById('create-subtask-list').value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (textLines.length === 0) {
    alert('Vui lòng nhập ít nhất 1 tiêu đề sub-task!');
    return;
  }

  const confirmMsg = `Xác nhận tạo hàng loạt ${textLines.length} Sub-task(s) gắn vào ${parentKey}?\nBạn có muốn tiếp tục?`;
  if (!confirm(confirmMsg)) return;

  const btn = document.getElementById('btn-batch-create-subtasks');
  const progressContainer = document.getElementById('create-subtasks-progress');
  const progressFill = document.getElementById('subtasks-progress-fill');
  const progressText = document.getElementById('subtasks-progress-text');
  const resultBox = document.getElementById('create-subtasks-result');

  btn.disabled = true;
  btn.textContent = '⏳ Đang tạo danh sách sub-tasks...';
  progressContainer.classList.remove('hidden');
  resultBox.className = 'alert-box hidden';

  const authConfig = {
    authType: AppState.settings.authType,
    personalAccessToken: AppState.settings.personalAccessToken
  };

  const projectKey = parentKey.split('-')[0];
  const createdKeys = [];
  const errors = [];

  // Lấy thông tin bổ sung: SPDA, Công đoạn, Due Date, Assignee
  const spdaParent = document.getElementById('subtask-spda-parent')?.value.trim() || 'SI';
  const spdaChild = document.getElementById('subtask-spda-child')?.value.trim() || 'Chung/CPCSI';
  const congDoan = document.getElementById('subtask-cong-doan')?.value.trim() || 'Nghiên cứu, phát triển, nâng cấp';
  const dueDateType = document.getElementById('subtask-due-date-type')?.value || 'auto-day';
  const customDueDate = document.getElementById('subtask-custom-due-date')?.value || '';
  const assignMe = document.getElementById('subtask-assignee-me')?.checked;
  const assigneeName = (assignMe && AppState.currentUser?.name) ? AppState.currentUser.name : undefined;

  // Dò tìm customfield IDs và Sub-task Issue Type từ parent task hoặc createmeta
  let customFieldsPayload = {};
  let subtaskTypeId = null;
  let subtaskTypeName = null;

  const detected = await JiraApi.detectCustomFieldsFromIssue(jiraBaseUrl, parentKey, authConfig);
  if (detected.success) {
    if (detected.spda?.key) {
      customFieldsPayload[detected.spda.key] = { value: spdaParent, child: { value: spdaChild } };
    }
    if (detected.congDoan?.key) {
      customFieldsPayload[detected.congDoan.key] = { value: congDoan };
    }
    if (detected.subtaskTypeId) {
      subtaskTypeId = detected.subtaskTypeId;
      subtaskTypeName = detected.subtaskTypeName;
    }
  }

  // Nếu chưa dò được qua issue, thử qua createmeta
  if (Object.keys(customFieldsPayload).length === 0) {
    const meta = await JiraApi.getCreateMeta(jiraBaseUrl, projectKey, authConfig);
    if (meta.success) {
      if (meta.spdaField?.key) {
        customFieldsPayload[meta.spdaField.key] = { value: spdaParent, child: { value: spdaChild } };
      }
      if (meta.congDoanField?.key) {
        customFieldsPayload[meta.congDoanField.key] = { value: congDoan };
      }
    }
  }

  // Nếu chưa có subtaskTypeId từ parent issue, truy vấn Sub-task type qua getSubtaskIssueType
  if (!subtaskTypeId) {
    const typeInfo = await JiraApi.getSubtaskIssueType(jiraBaseUrl, projectKey, authConfig);
    if (typeInfo.success && typeInfo.id) {
      subtaskTypeId = typeInfo.id;
      subtaskTypeName = typeInfo.name;
    }
  }

  // Lấy danh sách ngày công đang active (để gán due date tự động theo ngày)
  const workingDays = AppState.activeWorkingDays || [];

  for (let i = 0; i < textLines.length; i++) {
    const summary = textLines[i];
    const currentIndex = i + 1;
    const percent = Math.round((currentIndex / textLines.length) * 100);

    progressText.textContent = `Đang tạo: "${summary}" (${currentIndex}/${textLines.length})...`;
    progressFill.style.width = `${percent}%`;

    // Tính due date cho sub-task này
    let taskDueDate = undefined;
    if (dueDateType === 'auto-day') {
      if (i < workingDays.length) {
        taskDueDate = workingDays[i].dateString; // YYYY-MM-DD
      }
    } else if (customDueDate) {
      taskDueDate = customDueDate;
    }

    const res = await JiraApi.createSubtask(jiraBaseUrl, {
      parentKey,
      projectKey,
      summary,
      description: `Sub-task tự động tạo cho ngày làm việc (mỗi task log tối đa 8h)`,
      dueDate: taskDueDate,
      assignee: assigneeName,
      customFields: customFieldsPayload,
      issueTypeId: subtaskTypeId,
      issueTypeName: subtaskTypeName
    }, authConfig);

    if (res.success && res.createdKey) {
      createdKeys.push(res.createdKey);
    } else {
      errors.push(`${summary}: ${res.error}`);
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  btn.disabled = false;
  btn.textContent = '🚀 Bắt Đầu Tạo Danh Sách Sub-task';
  progressContainer.classList.add('hidden');

  if (createdKeys.length > 0) {
    resultBox.className = 'alert-box alert-success';
    resultBox.innerHTML = `
      🎉 Đã tạo thành công <strong>${createdKeys.length}/${textLines.length} Sub-task(s)</strong>!<br>
      Các mã vừa tạo: <code>${createdKeys.join(', ')}</code><br>
      <div style="margin-top:8px;">
        <button id="btn-use-created-subtasks" class="btn btn-primary" style="padding:4px 8px; font-size:11px;">
          👉 Chuyển sang Tab Logwork cho Task Cha này ngay
        </button>
      </div>
    `;
    resultBox.classList.remove('hidden');

    // Nút chuyển ngay sang Tab Logwork
    document.getElementById('btn-use-created-subtasks').addEventListener('click', () => {
      document.getElementById('parent-issue-key').value = parentKey;
      document.querySelector('input[name="target-mode"][value="parent-subtasks"]').checked = true;
      AppState.targetMode = 'parent-subtasks';
      updateTargetModeUI();
      document.querySelector('.tab-btn[data-tab="tab-logwork"]').click();
      handleFetchParentSubtasks();
    });
  } else {
    resultBox.className = 'alert-box alert-danger';
    resultBox.innerHTML = `❌ Thất bại: ${errors.join('<br>')}`;
    resultBox.classList.remove('hidden');
  }
}

/**
 * Xử lý tạo Task độc lập (Single Task)
 */
async function handleCreateSingleTask() {
  const jiraBaseUrl = AppState.settings.jiraBaseUrl;
  if (!jiraBaseUrl) {
    alert('Vui lòng vào tab Cài đặt để nhập địa chỉ Jira Base URL trước!');
    return;
  }

  const projectKey = document.getElementById('task-project-key').value.trim().toUpperCase();
  if (!projectKey) {
    alert('Vui lòng nhập Mã Project (ví dụ: DOFFICE)!');
    return;
  }

  const issueType = document.getElementById('task-issue-type').value;
  const rawSummary = document.getElementById('task-summary').value.trim();
  const rawDesc = document.getElementById('task-description').value.trim();
  const month = document.getElementById('log-month').value;
  const year = document.getElementById('log-year').value;

  const summary = rawSummary.replace(/{month}/gi, month).replace(/{year}/gi, year);
  const description = rawDesc.replace(/{month}/gi, month).replace(/{year}/gi, year);

  // Lấy thêm Due Date, Assignee, SPDA, Công đoạn
  const dueDate = document.getElementById('task-due-date')?.value || undefined;
  const assignMe = document.getElementById('task-assignee-me')?.checked;
  const assigneeName = (assignMe && AppState.currentUser?.name) ? AppState.currentUser.name : undefined;
  const spdaParent = document.getElementById('task-spda-parent')?.value.trim() || 'SI';
  const spdaChild = document.getElementById('task-spda-child')?.value.trim() || 'Chung/CPCSI';
  const congDoan = document.getElementById('task-cong-doan')?.value.trim() || 'Nghiên cứu, phát triển, nâng cấp';

  const btn = document.getElementById('btn-create-single-task');
  const resultBox = document.getElementById('create-task-result');

  btn.disabled = true;
  btn.textContent = '⏳ Đang tạo task...';
  resultBox.className = 'alert-box hidden';

  const authConfig = {
    authType: AppState.settings.authType,
    personalAccessToken: AppState.settings.personalAccessToken
  };

  let customFieldsPayload = {};
  const meta = await JiraApi.getCreateMeta(jiraBaseUrl, projectKey, authConfig);
  if (meta.success) {
    if (meta.spdaField?.key) {
      customFieldsPayload[meta.spdaField.key] = { value: spdaParent, child: { value: spdaChild } };
    }
    if (meta.congDoanField?.key) {
      customFieldsPayload[meta.congDoanField.key] = { value: congDoan };
    }
  }

  const res = await JiraApi.createIssue(jiraBaseUrl, {
    projectKey,
    summary,
    description,
    issueType,
    dueDate,
    assignee: assigneeName,
    customFields: customFieldsPayload
  }, authConfig);

  btn.disabled = false;
  btn.textContent = '🚀 Tạo Task Mới Ngay';

  if (res.success && res.createdKey) {
    resultBox.className = 'alert-box alert-success';
    resultBox.innerHTML = `
      🎉 Tạo task thành công: <strong>${res.createdKey}</strong>!<br>
      <button id="btn-use-single-task" class="btn btn-primary" style="margin-top:6px; padding:4px 8px; font-size:11px;">
        👉 Dùng làm Task Cha để tạo Sub-tasks
      </button>
    `;
    resultBox.classList.remove('hidden');

    document.getElementById('btn-use-single-task').addEventListener('click', () => {
      document.getElementById('create-parent-key').value = res.createdKey;
      document.getElementById('btn-create-subtasks-mode').click();
    });
  } else {
    resultBox.className = 'alert-box alert-danger';
    resultBox.innerHTML = `❌ Lỗi: ${res.error}`;
    resultBox.classList.remove('hidden');
  }
}

// ============================================================================
// TAB 3: CÀI ĐẶT & TEST CONNECTION
// ============================================================================

async function handleTestConnection() {
  const rawUrl = document.getElementById('jira-base-url').value;
  const url = DateUtils.extractBaseUrl(rawUrl);
  document.getElementById('jira-base-url').value = url;

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
      Tài khoản: <strong>${res.user.displayName}</strong> (${res.user.name})
    `;
    resultBox.classList.remove('hidden');

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
  const rawUrl = document.getElementById('jira-base-url').value;
  const url = DateUtils.extractBaseUrl(rawUrl);
  document.getElementById('jira-base-url').value = url;

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

  refreshCalendarData();

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
