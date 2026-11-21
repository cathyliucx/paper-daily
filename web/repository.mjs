const REPO_PATH = '/repos/cathyliucx/paper-daily';
export const ACTIONS_URL = 'https://github.com/cathyliucx/paper-daily/actions/workflows/paper-daily.yml';
const WORKFLOW = `${REPO_PATH}/actions/workflows/paper-daily.yml`;
const CONFIG = `${REPO_PATH}/contents/config/interests.json`;

function terms(value) {
  return [...new Set(String(value || '').split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))];
}

function englishTerms(values) {
  if (!values.length || values.length > 30 || values.some((item) => !/^[\x20-\x7e]{1,160}$/.test(item))) {
    throw new Error('请填写1–30个英文关键词，每个不超过160字符。');
  }
}

export function addTopic(config, fields) {
  if (!Array.isArray(config.topics)) throw new Error('仓库兴趣配置格式不正确。');
  if (config.topics.length >= 10) throw new Error('最多支持10个研究兴趣。');
  const name = fields.name.trim();
  const description = fields.description.trim();
  if (!name || name.length > 100) throw new Error('兴趣名称必填，且不超过100字符。');
  if (!description || description.length > 10000) throw new Error('研究描述必填，且不超过10000字符。');
  if (config.topics.some((topic) => topic.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error('已有同名兴趣，请勿重复添加。');
  }
  const keywords = terms(fields.keywords);
  englishTerms(keywords);
  const groups = String(fields.groups || '').split('\n').map(terms).filter((group) => group.length);
  if (groups.length > 6) throw new Error('必要概念组最多6组。');
  groups.forEach(englishTerms);
  const categories = terms(fields.categories);
  if (categories.length > 10 || categories.some((item) => !/^[a-zA-Z-]+(?:\.[a-zA-Z0-9-]+)?$/.test(item))) {
    throw new Error('请填写有效的 arXiv 分类，例如 cs.AI, cs.LG。');
  }
  const topic = {
    id: `topic_${crypto.randomUUID()}`,
    name, description, keywords,
    arxiv_categories: categories,
    required_keyword_groups: groups,
  };
  return { ...config, topics: [...config.topics, topic] };
}

export function decodeContent(content) {
  const bytes = Uint8Array.from(atob(content.replace(/\s/g, '')), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function encodeContent(config) {
  const bytes = new TextEncoder().encode(`${JSON.stringify(config, null, 2)}\n`);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

export class Repository {
  #token;
  #fetch;

  constructor(token, fetcher = fetch) {
    this.#token = token;
    this.#fetch = fetcher;
  }

  disconnect() { this.#token = ''; }

  async request(path, method = 'GET', body) {
    if (!this.#token) throw new Error('请先连接 GitHub 仓库。');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await this.#fetch(`https://api.github.com${path}`, {
        method, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.#token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const messages = {
          401: '授权令牌无效或已过期，请重新连接。',
          403: '请求被拒绝：请检查当前操作所需的 Contents / Actions / Secrets / Variables 权限，或等待限流解除。',
          404: '无法访问仓库或工作流，请检查令牌选中的仓库及权限。',
          409: '配置已被修改。请重新连接读取最新配置后重试。',
          422: 'GitHub 未接受请求，请检查配置或工作流状态。',
          429: 'GitHub 限流，请稍后重试，不会自动重复提交。',
        };
        throw new Error(`HTTP ${response.status} · ${messages[response.status] || 'GitHub 请求失败，请稍后重试。'}`);
      }
      return response.status === 204 ? null : response.json();
    } catch (error) {
      if (error instanceof TypeError || error.name === 'AbortError') {
        throw new Error('GitHub 网络连接失败或超时。写入结果可能尚未返回，请先查看仓库或任务记录，再重试。');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async connect() {
    const repository = await this.request(REPO_PATH);
    if (!repository.permissions?.push) throw new Error('当前授权没有仓库写入权限，请使用仓库所有者的授权。');
    return this.loadConfig();
  }

  async loadConfig() {
    const data = await this.request(CONFIG);
    const config = decodeContent(data.content);
    if (!Array.isArray(config.topics)) throw new Error('仓库中缺少有效的研究兴趣配置。');
    return { config, sha: data.sha };
  }

  async saveConfig(config, sha) {
    const result = await this.request(CONFIG, 'PUT', {
      branch: 'main', sha, content: encodeContent(config),
      message: 'feat: add research interest from website [skip ci]',
    });
    return result.commit.sha;
  }

  async runs() {
    const result = await this.request(`${WORKFLOW}/runs?branch=main&event=workflow_dispatch&per_page=20`);
    return result.workflow_runs;
  }

  async dispatch(clearCache, expectedSha) {
    const head = await this.request(`${REPO_PATH}/commits/main`);
    if (expectedSha && head.sha !== expectedSha) throw new Error('仓库已更新，请重新连接核对兴趣配置，再运行采集。');
    const runs = await this.runs();
    const afterId = Math.max(0, ...runs.map((run) => run.id));
    await this.request(`${WORKFLOW}/dispatches`, 'POST', {
      ref: 'main', inputs: { lookback_days: '7', clear_cache: String(clearCache) },
    });
    return { afterId, sha: head.sha };
  }

  async findRun(ticket) {
    const runs = (await this.runs()).filter((run) =>
      run.id > ticket.afterId && run.head_sha === ticket.sha && run.event === 'workflow_dispatch');
    if (runs.length > 1) throw new Error('检测到多个同时启动的任务，请前往任务记录确认各自结果。');
    return runs[0] || null;
  }

  run(id) { return this.request(`${REPO_PATH}/actions/runs/${id}`); }
}
