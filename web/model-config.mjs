const ACTIONS = '/repos/cathyliucx/paper-daily/actions';
const FORMAT = 'paper-daily-model-v1';
export const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new?' + new URLSearchParams({
  name: 'Paper Daily management', target_name: 'cathyliucx', expires_in: '30',
  description: 'Manage paper-daily interests, model secrets and collection tasks',
  contents: 'write', actions: 'write', secrets: 'write', actions_variables: 'write',
});

export function validateModel({ baseUrl, model, apiKey }) {
  let endpoint;
  try { endpoint = new URL(baseUrl.trim()); } catch { throw new Error('请填写有效的 HTTPS 模型接口地址。'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(endpoint.hostname) || endpoint.hostname.endsWith('.local')) {
    throw new Error('模型接口须使用公开 HTTPS 地址，不得包含账号、密码或查询参数。');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:-]{0,127}$/.test(model.trim())) throw new Error('请填写有效的模型 ID。');
  const key = apiKey.trim();
  if (!key || key.length > 4096 || /[\x00-\x20\x7f]/.test(key)) throw new Error('请重新输入模型 API 密钥；已保存的密钥不会回读，留空不会修改。');
  return { format: FORMAT, base_url: endpoint.href.replace(/\/+$/, ''), model: model.trim(), api_key: key };
}

export async function sealModel(profile, publicKey) {
  // Loaded only while saving; both official upstream builds are served locally.
  const { default: sodium } = await import('./vendor/libsodium/libsodium-wrappers.mjs');
  await sodium.ready;
  const bytes = sodium.from_string(JSON.stringify(profile));
  try {
    const sealed = sodium.crypto_box_seal(bytes, sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL));
    return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
  } finally { sodium.memzero(bytes); }
}

function safeMetadata(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed.format === FORMAT && typeof parsed.base_url === 'string' && typeof parsed.model === 'string'
      ? { base_url: parsed.base_url, model: parsed.model, updated_at: parsed.updated_at } : null;
  } catch { return null; }
}

export class ModelSettings {
  constructor(repository) { this.repository = repository; }

  async list(kind, key) {
    const items = [];
    for (let page = 1; page <= 20; page++) {
      const result = await this.repository.request(`${ACTIONS}/${kind}?per_page=100&page=${page}`);
      items.push(...result[key]);
      if (items.length >= result.total_count) return items;
    }
    throw new Error('模型配置列表过大，未能完整读取，请在 GitHub 中检查。');
  }

  async load() {
    const [secrets, variables] = await Promise.all([this.list('secrets', 'secrets'), this.list('variables', 'variables')]);
    const profileVariable = variables.find((item) => item.name === 'LLM_PROFILE');
    return {
      configured: secrets.some((item) => ['LLM_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY'].includes(item.name)),
      profile: safeMetadata(profileVariable?.value),
      hasMetadata: Boolean(profileVariable),
    };
  }

  async save(values) {
    let profile = validateModel(values);
    const [state, publicKey] = await Promise.all([this.load(), this.repository.request(`${ACTIONS}/secrets/public-key`)]);
    const metadata = { format: FORMAT, base_url: profile.base_url, model: profile.model, updated_at: new Date().toISOString() };
    let encrypted;
    try { encrypted = await sealModel(profile, publicKey.key); }
    finally { profile.api_key = ''; profile = null; }
    await this.repository.request(`${ACTIONS}/secrets/LLM_API_KEY`, 'PUT', { key_id: publicKey.key_id, encrypted_value: encrypted });
    // Runtime configuration is committed in ONE secret. Display metadata cannot redirect its key.
    try {
      await this.repository.request(`${ACTIONS}/variables${state.hasMetadata ? '/LLM_PROFILE' : ''}`, state.hasMetadata ? 'PATCH' : 'POST', {
        name: 'LLM_PROFILE', value: JSON.stringify(metadata),
      });
      return { metadataSaved: true, profile: metadata };
    } catch {
      return { metadataSaved: false, profile: metadata };
    }
  }
}
