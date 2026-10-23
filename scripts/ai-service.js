/**
 * Ngày tạo: 23/10/2026
 * Mục đích: Module dịch vụ AI tích hợp Groq Cloud API (api.groq.com)
 *           Hỗ trợ sinh tự động danh sách Sub-task theo tiêu đề Task cha và kiểm tra kết nối API Key.
 *           Tương thích với cả môi trường Chrome Extension và Node.js (Unit Test).
 */

const AiService = {
  DEFAULT_ENDPOINT: 'https://api.groq.com/openai/v1/chat/completions',
  DEFAULT_MODEL: 'openai/gpt-oss-120b',

  AVAILABLE_MODELS: [
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B (Khuyên dùng - Cực thông minh)' },
    { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (Tối ưu Tiếng Việt)' },
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B (Phản hồi siêu tốc)' },
    { id: 'allam-2-7b', name: 'Allam 2 7B' }
  ],

  /**
   * Tải danh sách model khả dụng từ Groq API (/openai/v1/models)
   * @param {string} apiKey
   * @param {string} [apiUrl]
   * @returns {Promise<{success: boolean, models?: Array<{id: string, name: string}>, error?: string}>}
   */
  async fetchAvailableModels(apiKey, apiUrl) {
    const key = (apiKey || '').trim();
    if (!key) {
      return { success: false, error: 'Vui lòng nhập Groq API Key trước khi tải model!' };
    }

    let modelsEndpoint = this.normalizeEndpoint(apiUrl);
    // Chuyển từ /openai/v1/chat/completions -> /openai/v1/models
    modelsEndpoint = modelsEndpoint.replace(/\/chat\/completions\/?$/, '/models');

    try {
      const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`
        }
      });

      if (!response.ok) {
        const errorText = await this.parseErrorMessage(response);
        return { success: false, error: errorText };
      }

      const data = await response.json();
      const rawList = Array.isArray(data.data) ? data.data : [];

      // Lọc các model thích hợp cho chat / sinh subtask (loại bỏ whisper, prompt-guard, embeddings, etc.)
      const ignoredKeywords = /(whisper|prompt-guard|guard|embedding|tts|stt|audio)/i;
      const chatModels = rawList
        .filter((m) => m && m.id && !ignoredKeywords.test(m.id))
        .map((m) => {
          let displayName = m.id;
          if (m.id === 'openai/gpt-oss-120b') displayName = 'GPT OSS 120B (Khuyên dùng - Cực thông minh)';
          else if (m.id === 'qwen/qwen3.8-27b') displayName = 'Qwen 3.8 27B (Tối ưu Tiếng Việt)';
          else if (m.id === 'openai/gpt-oss-20b') displayName = 'GPT OSS 20B (Phản hồi siêu tốc)';
          else if (m.id === 'allam-2-7b') displayName = 'Allam 2 7B';
          return { id: m.id, name: displayName };
        });

      // Đưa gpt-oss-120b và qwen lên đầu nếu có
      chatModels.sort((a, b) => {
        if (a.id.includes('120b')) return -1;
        if (b.id.includes('120b')) return 1;
        if (a.id.includes('qwen')) return -1;
        if (b.id.includes('qwen')) return 1;
        return a.id.localeCompare(b.id);
      });

      return {
        success: true,
        models: chatModels.length > 0 ? chatModels : this.AVAILABLE_MODELS
      };
    } catch (err) {
      return { success: false, error: `Lỗi tải danh sách model: ${err.message}` };
    }
  },

  /**
   * Chuẩn hóa URL API của Groq
   * @param {string} url
   * @returns {string}
   */
  normalizeEndpoint(url) {
    if (!url || typeof url !== 'string') return this.DEFAULT_ENDPOINT;
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    // Nếu người dùng chỉ nhập domain như http://api.groq.com hoặc https://api.groq.com
    clean = clean.replace(/\/+$/, '');
    if (!clean.includes('/openai/v1/chat/completions')) {
      clean += '/openai/v1/chat/completions';
    }
    return clean;
  },

  /**
   * Kiểm tra tính hợp lệ của Groq API Key
   * @param {string} apiKey
   * @param {string} [model]
   * @param {string} [apiUrl]
   * @returns {Promise<{success: boolean, error?: string, modelUsed?: string}>}
   */
  async testConnection(apiKey, model, apiUrl) {
    const key = (apiKey || '').trim();
    if (!key) {
      return { success: false, error: 'Vui lòng nhập Groq API Key trước khi kiểm tra!' };
    }

    const endpoint = this.normalizeEndpoint(apiUrl);
    const targetModel = (model || '').trim() || this.DEFAULT_MODEL;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [
            { role: 'user', content: 'Ping. Trả về đúng 1 từ "OK".' }
          ],
          max_tokens: 5,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errorText = await this.parseErrorMessage(response);
        return { success: false, error: errorText };
      }

      return { success: true, modelUsed: targetModel };
    } catch (err) {
      return { success: false, error: `Lỗi kết nối tới Groq: ${err.message}` };
    }
  },

  /**
   * Sinh danh sách Sub-task theo tiêu đề Task cha bằng AI
   * @param {Object} options
   * @param {string} options.apiKey
   * @param {string} [options.model]
   * @param {string} options.parentTitle
   * @param {number} [options.count=5]
   * @param {string} [options.role]
   * @param {string} [options.customInstruction]
   * @param {string} [options.apiUrl]
   * @returns {Promise<{success: boolean, subtasks?: string[], error?: string}>}
   */
  async generateSubtasks(options = {}) {
    const {
      apiKey,
      model,
      parentTitle,
      count = 5,
      role = 'all',
      customInstruction = '',
      apiUrl
    } = options;

    const key = (apiKey || '').trim();
    if (!key) {
      return {
        success: false,
        error: 'Chưa cấu hình Groq API Key. Vui lòng vào tab Cài đặt để nhập Key!'
      };
    }

    const title = (parentTitle || '').trim();
    if (!title) {
      return {
        success: false,
        error: 'Vui lòng nhập hoặc chọn tiêu đề Task Cha (Parent Task)!'
      };
    }

    const targetCount = Math.max(1, Math.min(20, parseInt(count, 10) || 5));
    const endpoint = this.normalizeEndpoint(apiUrl);
    const targetModel = (model || '').trim() || this.DEFAULT_MODEL;

    // Định hướng vai trò / quy trình
    let rolePrompt = '';
    switch (role) {
      case 'dev':
        rolePrompt = 'Tập trung chủ yếu vào phần Lập trình, thiết kế kiến trúc, phát triển API/giao diện và unit test.';
        break;
      case 'test':
        rolePrompt = 'Tập trung vào khâu Viết test case, kiểm thử chức năng, kiểm thử hiệu năng, log bug và nghiệm thu.';
        break;
      case 'analysis':
        rolePrompt = 'Tập trung vào Khảo sát yêu cầu, tài liệu đặc tả (SRS), thiết kế mockup, luồng nghiệp vụ và họp với stakeholder.';
        break;
      case 'fullflow':
      case 'all':
      default:
        rolePrompt = 'Phân bổ đều theo vòng đời chuẩn: Phân tích -> Thiết kế/Lập trình -> Kiểm thử -> Triển khai/Đóng gói.';
        break;
    }

    const systemPrompt = `Bạn là chuyên gia Quản lý Dự án Phần mềm và Jira Scrum Master.
Nhiệm vụ của bạn là phân rã một công việc lớn (Parent Task) thành đúng ${targetCount} Sub-task nhỏ, độc lập, thực tế, rõ ràng.

QUY TẮC BẮT BUỘC:
1. Trả về ĐÚNG ${targetCount} dòng, mỗi dòng là một tiêu đề Sub-task.
2. TUYỆT ĐỐI KHÔNG đánh số đầu dòng (không ghi 1., 2., -, *, •).
3. TUYỆT ĐỐI KHÔNG thêm bất kỳ câu chào, dẫn dắt hay ghi chú giải thích nào.
4. Tiêu đề viết bằng Tiếng Việt chuyên nghiệp, súc tích (bắt đầu bằng động từ hành động: Phân tích, Thiết kế, Xây dựng, Phát triển, Kiểm thử, Cấu hình, Hoàn thiện...).
5. Chiều dài mỗi tiêu đề khoảng 8 đến 20 từ, vừa vặn làm Summary của Jira Issue.`;

    let userPrompt = `Tiêu đề Task Cha: "${title}"\nSố lượng Sub-task cần tạo: ${targetCount}\nĐịnh hướng công việc: ${rolePrompt}`;
    if (customInstruction && customInstruction.trim()) {
      userPrompt += `\nYêu cầu bổ sung từ người dùng: ${customInstruction.trim()}`;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.6,
          max_tokens: 1024
        })
      });

      if (!response.ok) {
        const errorText = await this.parseErrorMessage(response);
        return { success: false, error: errorText };
      }

      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || '';

      const subtasks = this.parseSubtaskLines(rawContent, targetCount);

      if (subtasks.length === 0) {
        return {
          success: false,
          error: 'AI không trả về danh sách sub-task hợp lệ. Vui lòng thử lại!'
        };
      }

      return {
        success: true,
        subtasks,
        modelUsed: targetModel
      };
    } catch (err) {
      return { success: false, error: `Lỗi gọi Groq AI: ${err.message}` };
    }
  },

  /**
   * Tách và làm sạch từng dòng tiêu đề từ văn bản trả về của AI
   * @param {string} text
   * @param {number} targetCount
   * @returns {string[]}
   */
  parseSubtaskLines(text, targetCount) {
    if (!text || typeof text !== 'string') return [];

    const lines = text.split('\n');
    const cleaned = [];

    for (const rawLine of lines) {
      let line = rawLine.trim();

      // Bỏ qua dòng trống hoặc dòng markdown block
      if (!line || line.startsWith('```') || line.startsWith('---')) continue;

      // Xóa các số thứ tự, gạch đầu dòng, bullet points: ví dụ "1. ", "1) ", "- ", "* ", "• "
      line = line.replace(/^(\d+[\.\)\-:]|\*|\-|•)\s*/, '').trim();

      // Xóa dấu nháy bao quanh nếu có: "Tiêu đề" -> Tiêu đề
      line = line.replace(/^["'“”](.*)["'“”]$/, '$1').trim();

      // Bỏ qua nếu dòng sau khi làm sạch vẫn rỗng hoặc là tiêu đề chào hỏi
      if (!line || line.toLowerCase().startsWith('dưới đây là') || line.toLowerCase().startsWith('danh sách sub-task')) {
        continue;
      }

      cleaned.push(line);
      if (cleaned.length >= targetCount) break;
    }

    return cleaned;
  },

  /**
   * Xử lý và trích xuất thông báo lỗi từ phản hồi HTTP của Groq
   * @param {Response} response
   * @returns {Promise<string>}
   */
  async parseErrorMessage(response) {
    const status = response.status;
    let detail = '';

    try {
      const data = await response.json();
      detail = data.error?.message || data.message || '';
    } catch (_) {
      try {
        detail = await response.text();
      } catch (_) {}
    }

    if (status === 401) {
      return `Mã lỗi 401: Groq API Key không hợp lệ hoặc đã bị thu hồi. Vui lòng kiểm tra lại Key trong tab Cài đặt.${detail ? ` (${detail})` : ''}`;
    }
    if (status === 429) {
      return `Mã lỗi 429: Đã chạm giới hạn hạn mức (Rate limit/Quota) của Groq API. Vui lòng chờ ít phút rồi thử lại.${detail ? ` (${detail})` : ''}`;
    }
    if (status === 404) {
      return `Mã lỗi 404: Endpoint hoặc Model không tồn tại (${detail || 'Not Found'}).`;
    }

    return `Groq API báo lỗi (HTTP ${status}): ${detail || response.statusText || 'Lỗi không xác định'}`;
  }
};

// Hỗ trợ cả môi trường Node.js (dành cho Unit Test) và Browser Extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AiService;
}
