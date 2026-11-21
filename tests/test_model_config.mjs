import test from 'node:test';
import assert from 'node:assert/strict';
import sodium from '../web/vendor/libsodium/libsodium-wrappers.mjs';
import { ModelSettings, validateModel, sealModel, TOKEN_URL } from '../web/model-config.mjs';

const values = { baseUrl: 'https://api.deepseek.com/v1/', model: 'deepseek-chat', apiKey: 'fixture-model-key' };
await sodium.ready;
const pair = sodium.crypto_box_keypair();
const publicKey = { key_id: 'test-key', key: sodium.to_base64(pair.publicKey, sodium.base64_variants.ORIGINAL) };
function fakeRepository(failPath = '') {
  const writes = [];
  return { writes, async request(path, method = 'GET', body) {
    if (path.includes(failPath) && failPath) throw new Error('HTTP 403 · 权限不足');
    if (method !== 'GET') { writes.push({path,method,body}); return null; }
    if (path.includes('/public-key')) return publicKey;
    if (path.includes('/secrets')) return { total_count: 1, secrets: [{ name:'LLM_API_KEY' }] };
    return { total_count: 0, variables: [] };
  } };
}

test('validate HTTPS model profile and reject unsafe or empty settings', () => {
  assert.equal(validateModel(values).base_url,'https://api.deepseek.com/v1');
  for (const baseUrl of ['http://example.com','https://user:pass@example.com','https://example.com/?key=abc','https://localhost/v1']) {
    assert.throws(() => validateModel({...values,baseUrl}), /接口/);
  }
  assert.throws(() => validateModel({...values, model: ''}), /模型/);
  assert.throws(() => validateModel({...values, apiKey: ''}), /密钥/);
});

test('encrypt complete profile with a real sealed box and decrypt only with test private key', async () => {
  const encrypted = await sealModel(validateModel(values),publicKey.key);
  assert.ok(!encrypted.includes(values.apiKey));
  const decrypted = sodium.crypto_box_seal_open(sodium.from_base64(encrypted,sodium.base64_variants.ORIGINAL),pair.publicKey,pair.privateKey,'text');
  const profile=JSON.parse(decrypted);
  assert.equal(profile.api_key,values.apiKey);
  assert.equal(profile.format,'paper-daily-model-v1');
  assert.equal(profile.model,'deepseek-chat');
});

test('save one encrypted runtime secret, then key-free display metadata', async () => {
  const repo=fakeRepository();
  const result=await new ModelSettings(repo).save(values);
  assert.equal(result.metadataSaved,true);
  assert.equal(repo.writes.length,2);
  const secret=repo.writes[0];
  assert.ok(secret.path.endsWith('/actions/secrets/LLM_API_KEY'));
  assert.equal(secret.body.key_id,'test-key');
  assert.ok(!JSON.stringify(repo.writes).includes(values.apiKey));
  const profile=JSON.parse(sodium.crypto_box_seal_open(sodium.from_base64(secret.body.encrypted_value,sodium.base64_variants.ORIGINAL),pair.publicKey,pair.privateKey,'text'));
  assert.equal(profile.api_key,values.apiKey);
  assert.equal(repo.writes[1].body.name,'LLM_PROFILE');
  assert.ok(!repo.writes[1].body.value.includes('api_key'));
});

test('blank keys and denied preflight cannot modify existing configuration', async () => {
  for (const [repo,input] of [[fakeRepository(),{...values,apiKey:''}],[fakeRepository('/secrets'),values]]) {
    await assert.rejects(new ModelSettings(repo).save(input));
    assert.equal(repo.writes.length,0);
  }
});

test('a metadata-write failure leaves the atomic runtime secret saved and reports a warning', async () => {
  const repo=fakeRepository();
  const request=repo.request.bind(repo);
  repo.request=async (path,method,body) => {
    if (method==='POST') throw new Error('HTTP 403');
    return request(path,method,body);
  };
  const result=await new ModelSettings(repo).save(values);
  assert.equal(result.metadataSaved,false);
  assert.equal(repo.writes.length,1);
});

test('metadata status does not return model or GitHub secret contents', async () => {
  const state=await new ModelSettings(fakeRepository()).load();
  assert.equal(state.configured,true);
  assert.equal(state.profile,null);
  assert.ok(!JSON.stringify(state).includes(values.apiKey));
});

test('token creation link requests only required repository permission types and a short expiry', () => {
  const url=new URL(TOKEN_URL);
  assert.equal(url.hostname,'github.com');
  assert.equal(url.searchParams.get('target_name'),'cathyliucx');
  assert.equal(url.searchParams.get('expires_in'),'30');
  for (const permission of ['contents','actions','secrets','actions_variables']) assert.equal(url.searchParams.get(permission),'write');
  assert.ok(!url.searchParams.has('administration'));
});
