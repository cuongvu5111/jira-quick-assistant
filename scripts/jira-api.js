/**
 * Ngày tạo: 13/10/2026
 * Mục đích: Đóng gói toàn bộ các hàm gọi Jira REST API (v2) tương thích với Jira Server và Data Center.
 *           Xử lý xác thực qua Session Cookie (trình duyệt) hoặc Personal Access Token (PAT),
 *           tự động gắn header chống XSRF (X-Atlassian-Token: no-check).
 */

const JiraApi = {
  /**
   * Chuẩn hóa URL gốc của Jira (loại bỏ dấu gạch chéo cuối nếu có).
   * @param {string} url
   * @returns {string}
   */
  normalizeBaseUrl(url) {
    if (!url) return '';
    return url.trim().replace(/\/+$/, '');
  },

  /**
   * Xây dựng headers chuẩn cho mọi request gửi tới Jira Server / Data Center.
   * Header 'X-Atlassian-Token: no-check' là bắt buộc đối với Jira Server để tránh lỗi 403 XSRF Check Failed.
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
   * Jira thường trả về JSON có cấu trúc { errorMessages: [], errors: {} }.
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
      // Nếu không parse được JSON, trả về statusText
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
        credentials: 'include' // Luôn đính kèm cookie của trình duyệt
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
   * Lấy thông tin cơ bản của một Issue để xác thực sự tồn tại và xem tên task.
   * Endpoint: GET /rest/api/2/issue/{issueKey}?fields=summary,status,issuetype
   * @param {string} baseUrl
   * @param {string} issueKey
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, issue?: Object, error?: string}>}
   */
  async getIssue(baseUrl, issueKey, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const key = (issueKey || '').trim().toUpperCase();

    if (!cleanUrl || !key) {
      return { success: false, error: 'Thiếu Jira URL hoặc Issue Key' };
    }

    const endpoint = `${cleanUrl}/rest/api/2/issue/${key}?fields=summary,status,issuetype`;

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
      return {
        success: true,
        issue: {
          key: data.key,
          summary: data.fields?.summary || '',
          status: data.fields?.status?.name || '',
          issueType: data.fields?.issuetype?.name || ''
        }
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Lấy toàn bộ worklog của issue để kiểm tra những ngày đã được log trước đó.
   * Giúp ngăn chặn việc logwork trùng lặp 2 lần cho cùng một ngày.
   * Endpoint: GET /rest/api/2/issue/{issueKey}/worklog
   * @param {string} baseUrl
   * @param {string} issueKey
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, loggedDates: Set<string>, worklogs: Array, error?: string}>}
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
        return { success: false, loggedDates: new Set(), worklogs: [], error: errorMsg };
      }

      const data = await response.json();
      const worklogs = data.worklogs || [];
      const loggedDates = new Set();

      for (const log of worklogs) {
        if (log.started) {
          // started có dạng '2026-10-01T09:00:00.000+0700' -> cắt lấy '2026-10-01'
          const dateOnly = log.started.slice(0, 10);
          loggedDates.add(dateOnly);
        }
      }

      return {
        success: true,
        loggedDates,
        worklogs
      };
    } catch (err) {
      return { success: false, loggedDates: new Set(), worklogs: [], error: err.message };
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
   * Tạo mới một Task hoặc Issue trên Jira.
   * Endpoint: POST /rest/api/2/issue
   * @param {string} baseUrl
   * @param {Object} params - { projectKey: string, summary: string, description?: string, issueType?: string }
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, createdKey?: string, data?: Object, error?: string}>}
   */
  async createIssue(baseUrl, params, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const endpoint = `${cleanUrl}/rest/api/2/issue`;

    const body = {
      fields: {
        project: {
          key: (params.projectKey || '').trim().toUpperCase()
        },
        summary: (params.summary || '').trim(),
        description: params.description || 'Task tự động khởi tạo hàng tháng để logwork',
        issuetype: {
          name: params.issueType || 'Task'
        }
      }
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
   * Lấy danh sách các Project mà người dùng có quyền xem (dùng để gợi ý project key).
   * Endpoint: GET /rest/api/2/project
   * @param {string} baseUrl
   * @param {Object} authConfig
   * @returns {Promise<{success: boolean, projects: Array, error?: string}>}
   */
  async getProjects(baseUrl, authConfig = {}) {
    const cleanUrl = this.normalizeBaseUrl(baseUrl);
    const endpoint = `${cleanUrl}/rest/api/2/project`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: this.buildHeaders(authConfig),
        credentials: 'include'
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response);
        return { success: false, projects: [], error: errorMsg };
      }

      const projects = await response.json();
      return {
        success: true,
        projects: projects.map((p) => ({ key: p.key, name: p.name }))
      };
    } catch (err) {
      return { success: false, projects: [], error: err.message };
    }
  }
};

// Hỗ trợ cả môi trường Node.js (dành cho Unit Test) và Browser Extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JiraApi;
}
