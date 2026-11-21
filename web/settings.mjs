import { Repository, addTopic, ACTIONS_URL } from './repository.mjs';

const byId = (id) => document.getElementById(id);
const dialog = byId('settingsDialog');
let repository = null;
let snapshot = null;
let busy = false;
let pendingDispatch = null;
let watched = null;
let pollTimer = null;
let pollDeadline = 0;

function message(text, notice = false) {
  byId('settingsStatus').textContent = text;
  if (notice) {
    const link = document.createElement('a');
    link.href = byId('settingsRunLink').href;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = '查看任务 ↗';
    byId('taskNotice').replaceChildren(document.createTextNode(text), link);
    byId('taskNotice').hidden = false;
  }
}

function controls() {
  byId('interestFields').disabled = !repository || busy || Boolean(watched) || Boolean(pendingDispatch) || (snapshot?.config.topics.length || 0) >= 10;
  byId('cacheFields').disabled = !repository || busy || Boolean(watched) || Boolean(pendingDispatch);
  byId('connectionForm').querySelector('button').disabled = busy;
  byId('disconnectRepository').disabled = busy;
  byId('retryDispatch').hidden = !pendingDispatch || Boolean(watched);
  byId('retryDispatch').disabled = busy || !repository;
  byId('checkTask').hidden = !watched || Boolean(pollTimer) || busy;
}

async function operation(action) {
  if (busy) return;
  busy = true;
  controls();
  try { await action(); }
  catch (error) { message(error.message); }
  finally { busy = false; controls(); }
}

function showInterests(topics) {
  byId('interestCount').textContent = `${topics.length} / 10`;
  byId('interestList').replaceChildren(...topics.map((topic) => {
    const item = document.createElement('li');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const description = document.createElement('p');
    const keywords = document.createElement('small');
    summary.textContent = topic.name;
    description.textContent = topic.description;
    keywords.textContent = (topic.keywords || []).join(', ');
    details.append(summary, description, keywords);
    item.append(details);
    return item;
  }));
}

async function showSettings(pane) {
  byId('interestsPane').hidden = pane !== 'interests';
  byId('cachePane').hidden = pane !== 'cache';
  byId('settingsTitle').textContent = pane === 'cache' ? '清理缓存' : '研究兴趣';
  for (const button of document.querySelectorAll('[data-settings-pane]')) {
    button.setAttribute('aria-pressed', String(button.dataset.settingsPane === pane));
  }
  if (!dialog.open) dialog.showModal();
  if (snapshot) return;
  try {
    const response = await fetch('./data/papers.json', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const data = await response.json();
    // A connection made during this public fetch takes precedence.
    if (!snapshot) {
      showInterests(data.topics || []);
      message('以上为已发布的兴趣。连接后读取仓库最新配置，新增兴趣在保存后生效。');
    }
  } catch {
    if (!snapshot) message('暂时无法读取已发布兴趣。请连接仓库读取最新配置。');
  }
}

async function pollTask() {
  pollTimer = null;
  if (!repository || !watched) return;
  const client = repository;
  const ticket = watched;
  try {
    const run = ticket.id ? await client.run(ticket.id) : await client.findRun(ticket);
    if (client !== repository || ticket !== watched) return;
    if (run) {
      ticket.id = run.id;
      byId('settingsRunLink').href = `https://github.com/cathyliucx/paper-daily/actions/runs/${run.id}`;
      if (run.status === 'completed') {
        watched = null;
        if (run.conclusion === 'success') {
          message('采集与发布成功。点击“刷新论文”查看新结果。', true);
          byId('refreshPapers').hidden = false;
        } else {
          message(`任务未成功（${run.conclusion || '未知结果'}）。请查看任务日志，论文未确认更新。`, true);
        }
        controls();
        return;
      }
      message(`已提交 · ${run.status === 'in_progress' ? '正在采集与发布' : '等待运行'}。完成前保留现有论文。`, true);
    } else {
      message('GitHub 已接受请求，正在等待任务记录。', true);
    }
    if (Date.now() >= pollDeadline) {
      message('任务尚未确认完成，已暂停自动检查。可继续检查任务或前往任务记录查看。', true);
    } else {
      pollTimer = setTimeout(pollTask, 15000);
    }
  } catch (error) {
    if (client === repository && ticket === watched) message(`状态检查暂停：${error.message}`, true);
  }
  controls();
}

async function dispatchPending() {
  const request = pendingDispatch;
  message('正在向 GitHub 提交采集任务…');
  try {
    watched = await repository.dispatch(request.clearCache, request.expectedSha);
  } catch (error) {
    message(`${request.expectedSha ? '兴趣已保存到仓库；' : ''}任务尚未确认启动。${error.message}`, true);
    return;
  }
  pendingDispatch = null;
  byId('refreshPapers').hidden = true;
  byId('settingsRunLink').href = ACTIONS_URL;
  pollDeadline = Date.now() + 15 * 60 * 1000;
  await pollTask();
}

byId('connectionForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const token = byId('repositoryToken').value.trim();
  byId('repositoryToken').value = '';
  operation(async () => {
    message('正在验证仓库授权并读取配置…');
    const client = new Repository(token);
    try { snapshot = await client.connect(); }
    catch (error) { client.disconnect(); throw error; }
    repository = client;
    showInterests(snapshot.config.topics);
    byId('connectionForm').hidden = true;
    byId('disconnectRepository').hidden = false;
    byId('connectionStatus').textContent = '已连接 cathyliucx/paper-daily · 当前页面有效';
    message('已读取仓库最新兴趣。可以新增兴趣或清理论文缓存。');
  });
});

byId('disconnectRepository').addEventListener('click', () => {
  repository?.disconnect();
  repository = null;
  snapshot = null;
  watched = null;
  pendingDispatch = null;
  clearTimeout(pollTimer);
  pollTimer = null;
  byId('connectionForm').hidden = false;
  byId('disconnectRepository').hidden = true;
  byId('connectionStatus').textContent = '已断开连接，授权令牌已从页面内存清除。';
  message('已断开连接。已提交到 GitHub 的任务会继续运行，可在任务记录中查看。');
  controls();
});

byId('interestForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  operation(async () => {
    snapshot = await repository.loadConfig();
    const updated = addTopic(snapshot.config, fields);
    message('正在将新兴趣保存到仓库…');
    const commit = await repository.saveConfig(updated, snapshot.sha);
    snapshot.config = updated;
    showInterests(updated.topics);
    byId('interestForm').reset();
    pendingDispatch = { clearCache: false, expectedSha: commit };
    await dispatchPending();
  });
});

byId('cacheForm').addEventListener('submit', (event) => {
  event.preventDefault();
  operation(async () => {
    pendingDispatch = { clearCache: true };
    await dispatchPending();
  });
});

byId('retryDispatch').addEventListener('click', () => operation(dispatchPending));
byId('checkTask').addEventListener('click', () => operation(async () => {
  pollDeadline = Date.now() + 15 * 60 * 1000;
  await pollTask();
}));
byId('refreshPapers').addEventListener('click', () => location.reload());
byId('closeSettings').addEventListener('click', () => dialog.close());
for (const button of document.querySelectorAll('[data-settings-open], [data-settings-pane]')) {
  button.addEventListener('click', () => showSettings(button.dataset.settingsOpen || button.dataset.settingsPane));
}
controls();
