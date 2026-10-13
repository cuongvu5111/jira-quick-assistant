/**
 * Ngày tạo: 13/10/2026 (Cập nhật phiên bản 2.0)
 * Mục đích: Đóng gói các hàm gọi Jira REST API (v2) tương thích với Jira Server và Data Center.
 *           Bổ sung: Lấy danh sách sub-tasks, kiểm tra tổng giờ đã log của từng issue,
 *           tạo hàng loạt sub-task cho task cha và kiểm soát ràng buộc tối đa 8h/task.
 */

const JiraApi = {
  /**
   * Chuẩn hóa URL gốc của Jira.
   * @param {string} url
   * @returns {string}
   */
  normalizeBaseUrl(url) {
    if (!url) return '';
    return url.trim().replace(/\/+$/, '');
  },

  /**
   * Xây dựng headers chuẩn cho mọi request gửi tới Jira Server / Data Center.
   * Header 'X-Atlassian-Token: no-check' là bắt buộc đối với Jira Server để tránh lỗi 403 XSRF.
   * @param {Object} authConfig - { authType: 'cookie'|'token', personalAccessToken?: string }
   * @returns {HeadersInit}
   */
  buildHeaders(authConfig = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Atlassian-Token': 'no-check'
    };

    if (authConfig.authType === 'token' && authConfig.personalAccessToken) {
      headers['Authorization'] = `Bearer ${authConfig.personalAccessToken.trim()}`;
    }

    return headers;
  },

  /**
   * Trích xuất thông báo lỗi rõ ràng từ phản hồi lỗi của Jira REST API.
   * @param {Response} response
   * @returns {Promise<string>}
   */
  async parseErrorMessage(response) {
    const status = response.status;

    if (status === 401) {
      return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại Jira trên trình duyệt hoặc kiểm tra Token.';
    }
    if (status === 403) {
      return 'Không có quyền truy cập (403 Forbidden). Bạn có thể thiếu quyền hoặc cần kiểm tra XSRF Token.';
    }
    if (status === 404) {
      return 'Không tìm thấy tài nguyên (404 Not Found). Vui lòng kiểm tra lại Issue Key hoặc URL Jira.';
    }

    try {
      const data = await response.json();
      const messages = [];

      if (Array.isArray(data.errorMessages) && data.errorMessages.length > 0) {
        messages.push(...data.errorMessages);
      }

      if (data.errors && typeof data.errors === 'object') {
        for (const [field, msg] of Object.entries(data.errors)) {
          messages.push(`${field}: ${msg}`);
        }
      }

      if (messages.length > 0) {
        return messages.join(' | ');
      }
    } catch {
      // Bỏ qua lỗi parse
    }

    return `Lỗi HTTP ${status}: ${response.statusText || 'Không xác định'}`;
  },

  /**
   * Kiểm tra kết nối tới Jira và lấy thông tin tài khoản hiện tại.
   * Endpoint: GET /rest/api/2/myself
   * @param {string} baseUrl
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
   */
  async testConnection(baseUrl, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    if (!cleanUrl) {
      return { success: false, error: 'Chưa cấu hình Jira URL' };
    }

    const endpoint = `${cleanUrl}/rest/api/2/myself`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: this.buildHeaders(authConfig),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response);
        return { success: false, error: errorMsg };
      }

      const user = await response.json();
      return {
        success: true,
        user: {
          name: user.name,
          displayName: user.displayName,
          emailAddress: user.emailAddress || '',
          avatarUrl: user.avatarUrls ? user.avatarUrls['48x48'] || user.avatarUrls['24x24'] : ''
        }
      };
    } catch (err) {
      return {
        success: false,
        error: `Không thể kết nối tới Jira: ${err.message}. Hãy chắc chắn URL chính xác và bạn đang kết nối VPN công ty nếu cần.`
      };
    }
  },

  /**
   * Lấy thông tin cơ bản của một Issue và danh sách các Sub-tasks con của nó.
   * Endpoint: GET /rest/api/2/issue/{issueKey}?fields=summary,status,issuetype,subtasks,project
   * @param {string} baseUrl
   * @param {string} issueKey
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, issue?: Object, subtasks?: Array, error?: string}>}
   */
  async getIssueWithSubtasks(baseUrl, issueKey, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const key = (issueKey || '').trim().toUpperCase();

    if (!cleanUrl || !key) {
      return { success: false, error: 'Thiếu Jira URL hoặc Issue Key' };
    }

    const endpoint = `${cleanUrl}/rest/api/2/issue/${key}?fields=summary,status,issuetype,subtasks,project`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: this.buildHeaders(authConfig),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response);
        return { success: false, error: errorMsg };
      }

      const data = await response.json();
      const rawSubtasks = data.fields?.subtasks || [];
      const subtasks = rawSubtasks.map((st) => ({
        id: st.id,
        key: st.key,
        summary: st.fields?.summary || '',
        status: st.fields?.status?.name || '',
        issueType: st.fields?.issuetype?.name || ''
      }));

      return {
        success: true,
        issue: {
          id: data.id,
          key: data.key,
          summary: data.fields?.summary || '',
          status: data.fields?.status?.name || '',
          issueType: data.fields?.issuetype?.name || '',
          projectKey: data.fields?.project?.key || ''
        },
        subtasks
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Lấy toàn bộ worklog của issue và tính tổng số giờ đã log trên issue đó.
   * Giúp kiểm tra ràng buộc nghiệp vụ: "mỗi task/sub-task chỉ cho logwork tối đa 8 giờ".
   * Endpoint: GET /rest/api/2/issue/{issueKey}/worklog
   *
   * @param {string} baseUrl
   * @param {string} issueKey
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, loggedDates: Set<string>, totalSeconds: number, totalHours: number, isAt8hCap: boolean, worklogs: Array, error?: string}>}
   */
  async getWorklogs(baseUrl, issueKey, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const key = (issueKey || '').trim().toUpperCase();

    const endpoint = `${cleanUrl}/rest/api/2/issue/${key}/worklog`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: this.buildHeaders(authConfig),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response);
        return {
          success: false,
          loggedDates: new Set(),
          totalSeconds: 0,
          totalHours: 0,
          isAt8hCap: false,
          worklogs: [],
          error: errorMsg
        };
      }

      const data = await response.json();
      const worklogs = data.worklogs || [];
      const loggedDates = new Set();
      let totalSeconds = 0;

      for (const log of worklogs) {
        if (log.started) {
          const dateOnly = log.started.slice(0, 10);
          loggedDates.add(dateOnly);
        }
        if (typeof log.timeSpentSeconds === 'number') {
          totalSeconds += log.timeSpentSeconds;
        }
      }

      const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;
      // 8 giờ tương đương 28,800 giây
      const isAt8hCap = totalSeconds >= 28800;

      return {
        success: true,
        loggedDates,
        totalSeconds,
        totalHours,
        isAt8hCap,
        worklogs
      };
    } catch (err) {
      return {
        success: false,
        loggedDates: new Set(),
        totalSeconds: 0,
        totalHours: 0,
        isAt8hCap: false,
        worklogs: [],
        error: err.message
      };
    }
  },

  /**
   * Thêm một lượt logwork mới vào issue cho một ngày cụ thể.
   * Endpoint: POST /rest/api/2/issue/{issueKey}/worklog
   * @param {string} baseUrl
   * @param {string} issueKey
   * @param {Object} payload - { started: string, timeSpent: string, comment?: string }
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  async addWorklog(baseUrl, issueKey, payload, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const key = (issueKey || '').trim().toUpperCase();

    const endpoint = `${cleanUrl}/rest/api/2/issue/${key}/worklog`;

    const body = {
      started: payload.started,
      timeSpent: payload.timeSpent || '8h',
      comment: payload.comment || 'Làm việc theo kế hoạch'
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.buildHeaders(authConfig),
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response);
        return { success: false, error: errorMsg };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Tạo mới một Task hoặc Issue độc lập trên Jira.
   * Endpoint: POST /rest/api/2/issue
   * @param {string} baseUrl
   * @param {Object} params - { projectKey: string, summary: string, description?: string, issueType?: string }
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, createdKey?: string, data?: Object, error?: string}>}
   */
  /**
   * Tạo mới một Task hoặc Issue độc lập trên Jira.
   * Endpoint: POST /rest/api/2/issue
   * @param {string} baseUrl
   * @param {Object} params - { projectKey: string, summary: string, description?: string, issueType?: string, dueDate?: string, assignee?: string, customFields?: Object }
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, createdKey?: string, data?: Object, error?: string}>}
   */
  async createIssue(baseUrl, params, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const endpoint = `${cleanUrl}/rest/api/2/issue`;

    const fields = {
      project: {
        key: (params.projectKey || '').trim().toUpperCase()
      },
      summary: (params.summary || '').trim(),
      description: params.description || 'Task tự động khởi tạo để logwork',
      issuetype: {
        name: params.issueType || 'Task'
      }
    };

    if (params.dueDate) {
      fields.duedate = params.dueDate;
    }
    if (params.assignee) {
      fields.assignee = { name: params.assignee };
    }
    if (params.customFields && typeof params.customFields === 'object') {
      Object.assign(fields, params.customFields);
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.buildHeaders(authConfig),
        credentials: 'include',
        body: JSON.stringify({ fields })
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response);
        return { success: false, error: errorMsg };
      }

      const data = await response.json();
      return {
        success: true,
        createdKey: data.key,
        data
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Tạo mới một Sub-task gắn với một Task cha (Parent Issue).
   * Hỗ trợ đầy đủ due date, assignee, Mã SPDA và Công đoạn.
   *
   * @param {string} baseUrl
   * @param {Object} params - { parentKey: string, projectKey?: string, summary: string, description?: string, dueDate?: string, assignee?: string, customFields?: Object }
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, createdKey?: string, error?: string}>}
   */
  async createSubtask(baseUrl, params, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const endpoint = `${cleanUrl}/rest/api/2/issue`;

    const parentKey = (params.parentKey || '').trim().toUpperCase();
    const projectKey = (params.projectKey || parentKey.split('-')[0] || '').trim().toUpperCase();

    const makeBody = (typeName) => {
      const fields = {
        project: { key: projectKey },
        parent: { key: parentKey },
        summary: (params.summary || '').trim(),
        description: params.description || 'Sub-task thực hiện công việc',
        issuetype: { name: typeName }
      };

      if (params.dueDate) {
        fields.duedate = params.dueDate;
      }
      if (params.assignee) {
        fields.assignee = { name: params.assignee };
      }
      if (params.customFields && typeof params.customFields === 'object') {
        Object.assign(fields, params.customFields);
      }

      return { fields };
    };

    try {
      // Thử với tên chuẩn 'Sub-task'
      let response = await fetch(endpoint, {
        method: 'POST',
        headers: this.buildHeaders(authConfig),
        credentials: 'include',
        body: JSON.stringify(makeBody('Sub-task'))
      });

      // Nếu lỗi 400 có thể do Jira quy định tên là 'Subtask'
      if (!response.ok && response.status === 400) {
        const retryRes = await fetch(endpoint, {
          method: 'POST',
          headers: this.buildHeaders(authConfig),
          credentials: 'include',
          body: JSON.stringify(makeBody('Subtask'))
        });
        if (retryRes.ok) {
          const data = await retryRes.json();
          return { success: true, createdKey: data.key };
        }
      }

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response);
        return { success: false, error: errorMsg };
      }

      const data = await response.json();
      return { success: true, createdKey: data.key };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Tự động dò tìm các trường SPDA và Công đoạn từ một Issue cha hoặc Task đã tồn tại trên Jira.
   * Endpoint: GET /rest/api/2/issue/{issueKey}
   *
   * @param {string} baseUrl
   * @param {string} issueKey
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, spda?: Object, congDoan?: Object, customFields?: Object, error?: string}>}
   */
  async detectCustomFieldsFromIssue(baseUrl, issueKey, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const key = (issueKey || '').trim().toUpperCase();

    if (!cleanUrl || !key) {
      return { success: false, error: 'Thiếu Jira URL hoặc Issue Key' };
    }

    const endpoint = `${cleanUrl}/rest/api/2/issue/${key}`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: this.buildHeaders(authConfig),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response);
        return { success: false, error: errorMsg };
      }

      const data = await response.json();
      const fields = data.fields || {};
      let spda = null;
      let congDoan = null;
      const customFields = {};

      for (const [fKey, val] of Object.entries(fields)) {
        if (!fKey.startsWith('customfield_') || !val) continue;

        const valStr = JSON.stringify(val);

        // Nhận diện trường Mã SPDA (chứa SI hoặc CPCSI)
        if (!spda && (val.value === 'SI' || valStr.includes('CPCSI') || valStr.includes('Chung/CPCSI'))) {
          spda = { key: fKey, value: val };
          customFields[fKey] = val;
        }

        // Nhận diện trường Công đoạn (chứa Nghiên cứu, phát triển)
        if (!congDoan && (valStr.includes('Nghiên cứu') || valStr.includes('phát triển') || valStr.includes('nâng cấp'))) {
          congDoan = { key: fKey, value: val };
          customFields[fKey] = val;
        }
      }

      return {
        success: true,
        spda,
        congDoan,
        customFields
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Truy vấn CreateMeta để tự động dò tìm ID trường tùy biến (customfield_xxxxx)
   * cho "Mã SPDA" và "Công đoạn", cùng danh sách các giá trị hợp lệ.
   * Endpoint: GET /rest/api/2/issue/createmeta?projectKeys={projectKey}&expand=projects.issuetypes.fields
   *
   * @param {string} baseUrl
   * @param {string} projectKey
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, spdaField?: Object, congDoanField?: Object, error?: string}>}
   */
  async getCreateMeta(baseUrl, projectKey, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const pKey = (projectKey || '').trim().toUpperCase();

    if (!cleanUrl || !pKey) {
      return { success: false, error: 'Thiếu Jira URL hoặc Project Key' };
    }

    const endpoint = `${cleanUrl}/rest/api/2/issue/createmeta?projectKeys=${pKey}&expand=projects.issuetypes.fields`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: this.buildHeaders(authConfig),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response);
        return { success: false, error: errorMsg };
      }

      const data = await response.json();
      const project = (data.projects || []).find((p) => p.key === pKey) || data.projects?.[0];
      if (!project) {
        return { success: false, error: `Không tìm thấy dự án ${pKey}` };
      }

      const issueType = project.issuetypes?.find((it) => it.name === 'Task' || it.name === 'Sub-task') || project.issuetypes?.[0];
      const fields = issueType?.fields || {};

      let spdaField = null;
      let congDoanField = null;

      const spdaRegex = /(mã\s*spda|mã\s*spdv|spda|spdv)/i;
      const congDoanRegex = /(công\s*đoạn|stage)/i;

      for (const [key, field] of Object.entries(fields)) {
        if (!spdaField && spdaRegex.test(field.name)) {
          spdaField = { key, name: field.name, allowedValues: field.allowedValues || [] };
        }
        if (!congDoanField && congDoanRegex.test(field.name)) {
          congDoanField = { key, name: field.name, allowedValues: field.allowedValues || [] };
        }
      }

      return {
        success: true,
        spdaField,
        congDoanField
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Tự động chuyển trạng thái của một Issue sang Resolve / Done / Closed.
   * Truy vấn danh sách workflow transitions qua GET /rest/api/2/issue/{issueKey}/transitions
   * và kích hoạt transition có tên phù hợp.
   *
   * @param {string} baseUrl
   * @param {string} issueKey
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, transitionName?: string, toStatus?: string, skipped?: boolean, reason?: string, error?: string}>}
   */
  async resolveIssue(baseUrl, issueKey, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const key = (issueKey || '').trim().toUpperCase();

    if (!cleanUrl || !key) {
      return { success: false, error: 'Thiếu Jira URL hoặc Issue Key' };
    }

    const transitionsEndpoint = `${cleanUrl}/rest/api/2/issue/${key}/transitions`;

    try {
      // 1. Lấy danh sách các transition hợp lệ hiện tại của issue
      const getRes = await fetch(transitionsEndpoint, {
        method: 'GET',
        headers: this.buildHeaders(authConfig),
        credentials: 'include'
      });

      if (!getRes.ok) {
        const errorMsg = await this.parseErrorMessage(getRes);
        return { success: false, error: errorMsg };
      }

      const data = await getRes.json();
      const transitions = data.transitions || [];

      if (transitions.length === 0) {
        return {
          success: false,
          skipped: true,
          reason: 'Issue không có transition khả dụng (có thể đã ở trạng thái hoàn thành)'
        };
      }

      // 2. Tìm transition tương ứng với Resolve / Done / Closed / Hoàn thành
      const targetRegex = /(resolve|resolved|done|close|closed|hoàn thành|đóng|finish)/i;
      const targetTransition = transitions.find((t) => {
        const nameMatch = t.name && targetRegex.test(t.name);
        const toMatch = t.to && t.to.name && targetRegex.test(t.to.name);
        const categoryMatch = t.to && t.to.statusCategory && t.to.statusCategory.key === 'done';
        return nameMatch || toMatch || categoryMatch;
      });

      if (!targetTransition) {
        return {
          success: false,
          skipped: true,
          reason: `Không tìm thấy transition Resolve phù hợp (các transition hiện có: ${transitions.map((t) => t.name).join(', ')})`
        };
      }

      // 3. Thực hiện chuyển trạng thái (POST)
      const postBody = {
        transition: {
          id: targetTransition.id
        }
      };

      const postRes = await fetch(transitionsEndpoint, {
        method: 'POST',
        headers: this.buildHeaders(authConfig),
        credentials: 'include',
        body: JSON.stringify(postBody)
      });

      if (!postRes.ok && postRes.status !== 204) {
        const errorMsg = await this.parseErrorMessage(postRes);
        return { success: false, error: errorMsg };
      }

      return {
        success: true,
        transitionName: targetTransition.name,
        toStatus: targetTransition.to?.name || 'Resolved'
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

// Hỗ trợ cả môi trường Node.js (dành cho Unit Test) và Browser Extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JiraApi;
}
