import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Repository, addTopic, decodeContent } from '../web/repository.mjs';

const original = JSON.parse(readFileSync(new URL('../config/interests.json', import.meta.url)));
const fields = { name: '新研究兴趣', description: '研究具体的方法、问题和评价机制。', keywords: 'causal representation learning, causal abstraction', groups: 'causal, counterfactual\nrepresentation learning, abstraction', categories: 'cs.AI, cs.LG' };
const response = (value, status = 200) => new Response(status === 204 ? null : JSON.stringify(value), { status });
const encoded = (config) => Buffer.from(JSON.stringify(config)).toString('base64');

test('append a validated interest while preserving the seven existing interests and conference sources', () => {
  const result = addTopic(original, fields);
  assert.equal(result.topics.length, 8);
  assert.deepEqual(result.topics.slice(0, 7), original.topics);
  assert.deepEqual(result.conference_sources, original.conference_sources);
  assert.deepEqual(result.topics.at(-1).required_keyword_groups, [['causal', 'counterfactual'], ['representation learning', 'abstraction']]);
  assert.equal(original.topics.length, 7);
});

test('reject duplicate names, non-English keywords, malformed categories and topic overflow', () => {
  assert.throws(() => addTopic(original, { ...fields, name: original.topics[0].name }), /已有/);
  assert.throws(() => addTopic(original, { ...fields, keywords: '因果强化学习' }), /英文/);
  assert.throws(() => addTopic(original, { ...fields, groups: 'causal\n中文' }), /英文/);
  assert.throws(() => addTopic(original, { ...fields, categories: 'not valid' }), /分类/);
  assert.throws(() => addTopic({ ...original, topics: Array(10).fill(original.topics[0]) }, fields), /10/);
  assert.throws(() => addTopic(original, { ...fields, description: '' }), /描述/);
});

test('decode the GitHub UTF-8 configuration including Chinese topic descriptions', () => {
  assert.deepEqual(decodeContent(encoded(original)), original);
});

test('save uses SHA concurrency protection and never puts credentials in committed content', async () => {
  let saved;
  const repo = new Repository('test-token', async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/cathyliucx/paper-daily/contents/config/interests.json');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    saved = JSON.parse(options.body);
    return response({ commit: { sha: 'new-commit' }, content: { sha: 'new-blob' } });
  });
  const config = addTopic(original, fields);
  assert.equal(await repo.saveConfig(config, 'previous-blob'), 'new-commit');
  assert.equal(saved.sha, 'previous-blob');
  assert.deepEqual(decodeContent(saved.content), config);
  assert.ok(!saved.content.includes('test-token'));
  assert.match(saved.message, /\[skip ci\]/);
});

test('reject stale writes with a specific conflict message', async () => {
  const repo = new Repository('token', async () => response({}, 409));
  await assert.rejects(repo.saveConfig(original, 'old'), /已被修改/);
});

test('cache rebuild dispatches the existing workflow with the explicit clear flag', async () => {
  const repo = new Repository('token', async (url, options) => {
    if (url.endsWith('/commits/main')) return response({ sha: 'head' });
    if (url.includes('/runs?')) return response({ workflow_runs: [{ id: 40 }] });
    assert.ok(url.endsWith('/actions/workflows/paper-daily.yml/dispatches'));
    assert.deepEqual(JSON.parse(options.body), { ref: 'main', inputs: { lookback_days: '7', clear_cache: 'true' } });
    return response(null, 204);
  });
  assert.deepEqual(await repo.dispatch(true), { afterId: 40, sha: 'head' });
});

test('ordinary update keeps the paper cache and verifies the saved config is still branch HEAD', async () => {
  const repo = new Repository('token', async (url, options) => {
    if (url.endsWith('/commits/main')) return response({ sha: 'saved' });
    if (url.includes('/runs?')) return response({ workflow_runs: [] });
    assert.equal(JSON.parse(options.body).inputs.clear_cache, 'false');
    return response(null, 204);
  });
  assert.equal((await repo.dispatch(false, 'saved')).sha, 'saved');
  await assert.rejects(repo.dispatch(false, 'stale'), /已更新/);
});

test('run tracking ignores old, scheduled and different-commit runs', async () => {
  const repo = new Repository('token', async () => response({ workflow_runs: [
    { id: 41, event: 'schedule', head_sha: 'head' },
    { id: 42, event: 'workflow_dispatch', head_sha: 'other' },
    { id: 39, event: 'workflow_dispatch', head_sha: 'head' },
    { id: 43, event: 'workflow_dispatch', head_sha: 'head', status: 'in_progress' },
  ] }));
  assert.equal((await repo.findRun({ afterId: 40, sha: 'head' })).id, 43);
});

test('permission failures and rate limits cannot be reported as success or expose the token', async () => {
  for (const status of [401, 403, 404, 429]) {
    const repo = new Repository('test-token', async () => response({}, status));
    await assert.rejects(repo.dispatch(true), (error) => /HTTP/.test(error.message) && !error.message.includes('test-token'));
  }
});

test('disconnect prevents further requests and public-only tokens cannot connect as editors', async () => {
  const repo = new Repository('token', async () => response({ permissions: { push: false } }));
  await assert.rejects(repo.connect(), /写入权限/);
  repo.disconnect();
  await assert.rejects(repo.loadConfig(), /先连接/);
});

test('concurrent dispatches are reported as ambiguous instead of claiming another task succeeded', async () => {
  const repo = new Repository('token', async () => response({ workflow_runs: [
    { id: 41, event: 'workflow_dispatch', head_sha: 'head' },
    { id: 42, event: 'workflow_dispatch', head_sha: 'head' },
  ] }));
  await assert.rejects(repo.findRun({ afterId: 40, sha: 'head' }), /多个/);
});

test('invoke fetch as a standalone function, compatible with browser Window brand checks', async () => {
  const repo = new Repository('fixture-token', function (url) {
    assert.equal(this, undefined, 'Browser native fetch must not receive Repository as its receiver');
    return Promise.resolve(response({sha: 'blob',content: encoded(original)}));
  });
  const result = await repo.loadConfig();
  assert.deepEqual(result.config, original);
});

test('a failed read does not falsely warn that a write may have occurred', async () => {
  const repo = new Repository('fixture-token', () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(repo.loadConfig(), error => /读取/.test(error.message) && !/写入结果/.test(error.message));
});
