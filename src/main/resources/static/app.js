'use strict';

// Админка wa-group-sender: страница поверх HTTP API сервиса, без сборки.
// Токен хранится в localStorage этого браузера и уходит в заголовке X-Admin-Token.

const TOKEN_KEY = 'wa-admin-token';
const ZONE = 'Asia/Almaty';

const SESSION_TEXT = {
  STARTING: 'запуск', CONNECTING: 'подключение', WAITING_QR: 'ждёт QR', CONNECTED: 'подключено',
  RECONNECTING: 'переподключение', DISCONNECTED: 'отключено', LOGGED_OUT: 'разлогинено', BANNED: 'заблокирован',
};
const DISPATCHER_TEXT = {
  starting: 'запуск', idle: 'ждёт заявок', running: 'рассылает', paused: 'на паузе', 'outside-window': 'вне рабочего окна',
  'daily-limit-reached': 'дневной лимит исчерпан', 'waiting-session': 'ждёт сессию', 'no-active-groups': 'нет активных групп',
  'stopped-by-risk': 'остановлено по риску', stopped: 'остановлено',
};
const REQUEST_TEXT = { QUEUED: 'В очереди', SENDING: 'Отправляется', DONE: 'Отправлено', FAILED: 'Ошибка' };

const $ = (id) => document.getElementById(id);

let token = readToken();
let currentTab = 'status';
let health = null;
let groups = [];
let lists = [];
let shownJids = [];
const selected = new Set();
let requests = [];
let openRequest = null;
let qrUrl = null;
let timers = [];

// --- API ---------------------------------------------------------------------

class Unauthorized extends Error {}

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = { 'X-Admin-Token': token || '' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401) throw new Unauthorized();
  if (raw) return response;
  const type = response.headers.get('Content-Type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof data === 'object' && data && data.message ? data.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function handleError(error) {
  if (error instanceof Unauthorized) {
    logout('Токен не подошёл, войдите заново');
    return;
  }
  toast(error.message || String(error));
}

// --- вход --------------------------------------------------------------------

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // без localStorage токен живёт до перезагрузки страницы
  }
}

async function login(event) {
  event.preventDefault();
  token = $('token').value.trim();
  $('login-error').hidden = true;
  try {
    await api('/api/admin/requests');
    saveToken(token);
    start();
  } catch (error) {
    token = null;
    $('login-error').textContent = error instanceof Unauthorized ? 'Неверный токен' : error.message;
    $('login-error').hidden = false;
  }
}

function logout(message) {
  timers.forEach(clearInterval);
  timers = [];
  token = null;
  saveToken(null);
  $('app').hidden = true;
  $('login').hidden = false;
  $('token').value = '';
  if (message) {
    $('login-error').textContent = message;
    $('login-error').hidden = false;
  }
}

function start() {
  $('login').hidden = true;
  $('app').hidden = false;
  showTab(currentTab);
  refreshHealth();
  timers.push(setInterval(refreshHealth, 5000));
  timers.push(setInterval(() => { if (currentTab === 'pairing') refreshQr(); }, 3000));
  timers.push(setInterval(() => { if (currentTab === 'requests') refreshRequests(); }, 15000));
}

// --- вкладки -----------------------------------------------------------------

function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== `tab-${tab}`; });
  if (tab === 'new') { renderTargets(); refreshLists(); }
  if (tab === 'pairing') refreshQr();
  if (tab === 'groups') { refreshGroups(); refreshLists(); }
  if (tab === 'requests') refreshRequests();
}

// --- состояние ---------------------------------------------------------------

async function refreshHealth() {
  try {
    const response = await fetch('/api/health');
    health = await response.json();
    renderHealth();
  } catch (error) {
    $('session-pill').textContent = 'нет связи';
    $('session-pill').className = 'pill bad';
  }
}

function sessionTone(session) {
  if (session === 'CONNECTED') return 'ok';
  if (session === 'LOGGED_OUT' || session === 'BANNED' || session === 'DISCONNECTED') return 'bad';
  return 'warn';
}

function renderHealth() {
  const h = health;
  $('session-pill').textContent = SESSION_TEXT[h.session] || h.session;
  $('session-pill').className = `pill ${sessionTone(h.session)}`;

  const dispatcherTone = h.dispatcher === 'running' || h.dispatcher === 'idle' ? 'ok'
    : h.dispatcher === 'stopped-by-risk' ? 'bad' : 'warn';
  const limit = h.warmupLimitToday == null ? 'весь список' : h.warmupLimitToday;
  const cards = [
    card('Сессия WhatsApp', pill(SESSION_TEXT[h.session] || h.session, sessionTone(h.session)), h.session),
    card('Диспетчер', pill(DISPATCHER_TEXT[h.dispatcher] || h.dispatcher, dispatcherTone), h.dispatcher),
    card('Очередь', esc(h.queueLength), 'заявок в очереди и в работе'),
    card('Отправлено сегодня', esc(h.sentToday), `лимит: ${esc(limit)}`),
    card('День прогрева', esc(h.warmupDay), 'от первой отправки'),
    card('Активных групп', esc(h.activeGroups), 'в архиве, участник, может писать'),
    card('Сигналы риска', esc(h.riskEventsInWindow), h.stoppedByRisk ? 'рассылка остановлена по риску' : `паузы ×${esc(h.pauseMultiplier)}`),
  ];
  $('status-cards').innerHTML = cards.join('');
  $('status-time').textContent = `Время сервиса: ${formatTime(h.time)}`;
  if (currentTab === 'pairing') renderQrState();
  if (currentTab === 'new') renderTargets();
}

function card(label, value, note) {
  return `<div class="card"><div class="stat-label">${esc(label)}</div><div class="stat-value">${value}</div>`
    + `<div class="stat-note">${esc(note)}</div></div>`;
}

function pill(text, tone) {
  return `<span class="pill ${tone}">${esc(text)}</span>`;
}

// --- привязка ----------------------------------------------------------------

async function refreshQr() {
  try {
    const response = await api('/api/qr', { raw: true });
    if (response.ok) {
      const blob = await response.blob();
      if (qrUrl) URL.revokeObjectURL(qrUrl);
      qrUrl = URL.createObjectURL(blob);
      $('qr-box').innerHTML = `<img alt="QR для привязки" src="${qrUrl}">`;
    } else {
      if (qrUrl) URL.revokeObjectURL(qrUrl);
      qrUrl = null;
      const session = health ? health.session : '';
      $('qr-box').textContent = session === 'CONNECTED' ? 'Номер привязан, QR не нужен' : 'QR пока нет, ждём от WhatsApp…';
    }
    renderQrState();
  } catch (error) {
    handleError(error);
  }
}

function renderQrState() {
  if (!health) return;
  $('qr-state').textContent = `Сессия: ${SESSION_TEXT[health.session] || health.session}`;
}

// --- группы ------------------------------------------------------------------

async function refreshGroups() {
  try {
    groups = await api('/api/groups');
    renderGroups();
  } catch (error) {
    handleError(error);
  }
}

function renderGroups() {
  const query = $('group-search').value.trim().toLowerCase();
  const onlyActive = $('group-active').checked;
  const onlyArchived = $('group-archived').checked;
  const shown = groups
    .filter((g) => !onlyActive || g.active)
    .filter((g) => !onlyArchived || g.archived)
    .filter((g) => !query || (g.name || '').toLowerCase().includes(query) || g.jid.toLowerCase().includes(query))
    .sort((a, b) => Number(b.active) - Number(a.active) || (a.name || a.jid).localeCompare(b.name || b.jid, 'ru'));

  const archived = groups.filter((g) => g.archived).length;
  const active = groups.filter((g) => g.active).length;
  $('group-summary').textContent = `Всего ${groups.length}, в архиве ${archived}, активных ${active}. Показано ${shown.length}.`;
  shownJids = shown.filter(sendable).map((g) => g.jid);
  $('group-selected').textContent = `Отмечено: ${selected.size}`;
  $('group-rows').innerHTML = shown.map((g) => `<tr>
      <td><input type="checkbox" data-jid="${esc(g.jid)}" ${selected.has(g.jid) ? 'checked' : ''} ${sendable(g) ? '' : 'disabled'}></td>
      <td>${esc(g.name || '—')}<span class="jid">${esc(g.jid)}</span></td>
      <td>${yesNo(g.archived)}</td>
      <td>${yesNo(g.member)}</td>
      <td>${yesNo(g.canSend)}</td>
      <td>${g.active ? pill('да', 'ok') : pill('нет', 'neutral')}</td>
      <td class="muted">${esc(formatTime(g.lastSync))}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted">Групп нет</td></tr>';
}

// Отметить можно только группу, куда номер может писать; архив для этого не обязателен.
function sendable(group) {
  return group.member === true && group.canSend === true;
}

async function refreshLists() {
  try {
    lists = await api('/api/admin/group-lists');
    renderLists();
    renderTargets();
  } catch (error) {
    handleError(error);
  }
}

function renderLists() {
  $('list-chips').innerHTML = lists.map((list) => `<span class="chip">
      <button data-list="${esc(list.id)}" title="Отметить группы этого списка">${esc(list.name)} (${list.groups.length})</button>
      <button class="del" data-del="${esc(list.id)}" title="Удалить список">×</button>
    </span>`).join('') || '<span class="muted small">Сохранённых списков пока нет: отметьте группы и нажмите «Сохранить список».</span>';
}

async function saveList() {
  const name = $('list-name').value.trim();
  if (!name) { toast('Введите название списка'); return; }
  if (!selected.size) { toast('Отметьте хотя бы одну группу'); return; }
  const existing = lists.find((list) => list.name === name);
  if (existing && !confirm(`Список «${name}» уже есть. Заменить его группы на отмеченные (${selected.size})?`)) return;
  try {
    await api('/api/admin/group-lists', { method: 'PUT', body: { name, groups: [...selected] } });
    toast(`Список «${name}» сохранён: ${selected.size} групп`);
    await refreshLists();
  } catch (error) {
    handleError(error);
  }
}

async function onListClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.del) {
    const list = lists.find((item) => String(item.id) === button.dataset.del);
    if (!list || !confirm(`Удалить список «${list.name}»?`)) return;
    try {
      await api(`/api/admin/group-lists/${list.id}`, { method: 'DELETE' });
      await refreshLists();
    } catch (error) {
      handleError(error);
    }
    return;
  }
  const list = lists.find((item) => String(item.id) === button.dataset.list);
  if (!list) return;
  selected.clear();
  list.groups.forEach((jid) => selected.add(jid));
  $('list-name').value = list.name;
  renderGroups();
}

async function syncGroups() {
  const button = $('group-sync');
  button.disabled = true;
  button.textContent = 'Синхронизация…';
  try {
    const result = await api('/api/admin/groups/sync', { method: 'POST' });
    toast(result.done ? `Готово: всего ${result.total}, в архиве ${result.archived}, активных ${result.active}`
      : 'Синхронизация не выполнена: сессия не подключена');
    await refreshGroups();
  } catch (error) {
    handleError(error);
  } finally {
    button.disabled = false;
    button.textContent = 'Синхронизировать';
  }
}

// --- заявки ------------------------------------------------------------------

async function refreshRequests() {
  try {
    requests = await api('/api/admin/requests');
    renderRequests();
  } catch (error) {
    handleError(error);
  }
}

function renderRequests() {
  const status = $('request-status').value;
  const shown = requests
    .filter((r) => !status || r.status === status)
    .sort((a, b) => timeValue(b.queuedAt) - timeValue(a.queuedAt));
  const rows = [];
  for (const r of shown) {
    const p = r.progress || { total: 0, sent: 0, failed: 0, skipped: 0 };
    const percent = p.total ? Math.round((p.sent / p.total) * 100) : 0;
    const tone = r.status === 'DONE' ? 'ok' : r.status === 'FAILED' ? 'bad' : r.status === 'SENDING' ? 'warn' : 'neutral';
    rows.push(`<tr class="clickable" data-id="${esc(r.id)}">
        <td><b>${esc(r.id)}</b>${r.sheetRow ? `<span class="jid">строка ${esc(r.sheetRow)}</span>` : ''}
          <span class="jid">${r.targetGroups == null ? 'все активные' : `выбрано групп: ${esc(r.targetGroups)}`}</span></td>
        <td>${pill(REQUEST_TEXT[r.status] || r.status, tone)}</td>
        <td>${esc(p.sent)} / ${esc(p.total)}${p.failed ? ` <span class="error">ошибок ${esc(p.failed)}</span>` : ''}
          <div class="bar"><span style="width:${percent}%"></span></div></td>
        <td class="muted">${esc(formatTime(r.queuedAt))}</td>
        <td class="muted">${esc(formatTime(r.completedAt))}</td>
        <td class="error">${esc(r.error || '')}</td>
      </tr>`);
    if (openRequest === r.id) {
      rows.push(`<tr class="detail"><td colspan="6"><pre class="preview">${esc(r.message || '')}</pre></td></tr>`);
    }
  }
  $('request-rows').innerHTML = rows.join('') || '<tr><td colspan="6" class="muted">Заявок нет</td></tr>';
}

// --- новая заявка ------------------------------------------------------------

function newRequestBody() {
  const data = new FormData($('new-form'));
  const body = {};
  for (const name of ['route', 'date', 'vehicles', 'cargo', 'freight', 'conditions']) {
    body[name] = String(data.get(name) || '').trim();
  }
  return body;
}

// Куда уйдёт заявка: null — во все активные группы, иначе список JID.
function currentTarget() {
  const value = $('new-target').value || 'all';
  if (value === 'selected') return { label: `отмеченные группы (${selected.size})`, groups: [...selected] };
  if (value.startsWith('list:')) {
    const list = lists.find((item) => `list:${item.id}` === value);
    if (list) return { label: `список «${list.name}» (${list.groups.length})`, groups: list.groups };
  }
  const active = health ? health.activeGroups : 0;
  return { label: `все активные группы (${active})`, groups: null, count: active };
}

function renderTargets() {
  const select = $('new-target');
  const previous = select.value || 'all';
  const active = health ? health.activeGroups : 0;
  const options = [`<option value="all">Все активные группы (${active})</option>`];
  options.push(`<option value="selected" ${selected.size ? '' : 'disabled'}>Отмеченные на вкладке «Группы» (${selected.size})</option>`);
  for (const list of lists) {
    options.push(`<option value="list:${esc(list.id)}">Список «${esc(list.name)}» (${list.groups.length})</option>`);
  }
  const html = options.join('');
  // Состояние обновляется каждые 5 секунд: список пересобирается, только если изменился, иначе он закрывался бы в руках.
  if (select.dataset.html !== html) {
    select.dataset.html = html;
    select.innerHTML = html;
    select.value = [...select.options].some((o) => o.value === previous && !o.disabled) ? previous : 'all';
  }
  renderNewNote();
}

function renderNewNote() {
  if (!health) return;
  const target = currentTarget();
  const state = DISPATCHER_TEXT[health.dispatcher] || health.dispatcher;
  const where = target.groups ? `в ${target.label}` : `во ${target.label}`;
  $('new-note').textContent = `Заявка встанет в очередь и уйдёт ${where} с паузами, в рабочее окно и в пределах дневного лимита. `
    + `Диспетчер сейчас: ${state}.`;
}

function showNewError(message) {
  $('new-error').textContent = message;
  $('new-error').hidden = !message;
}

async function previewNew() {
  showNewError('');
  try {
    $('new-preview-text').textContent = await api('/api/admin/requests/preview', { method: 'POST', body: newRequestBody() })
      || 'Форма пустая.';
  } catch (error) {
    if (error instanceof Unauthorized) handleError(error);
    else showNewError(error.message);
  }
}

async function submitNew(event) {
  event.preventDefault();
  showNewError('');
  const target = currentTarget();
  if (target.groups && !target.groups.length) { showNewError('В выбранном списке нет групп.'); return; }
  const question = target.groups || target.count > 0
    ? `Отправить заявку: ${target.label}?`
    : 'Активных групп сейчас нет. Поставить заявку в очередь?';
  if (!confirm(question)) return;
  const button = $('new-submit');
  button.disabled = true;
  try {
    const body = newRequestBody();
    if (target.groups) body.groups = target.groups;
    const created = await api('/api/admin/requests', { method: 'POST', body });
    $('new-form').reset();
    $('new-preview-text').textContent = created.message;
    toast(`Заявка ${created.id} поставлена в очередь`);
    openRequest = created.id;
    showTab('requests');
    refreshHealth();
  } catch (error) {
    if (error instanceof Unauthorized) handleError(error);
    else showNewError(error.message);
  } finally {
    button.disabled = false;
  }
}

// --- управление --------------------------------------------------------------

async function pause() {
  try {
    await api('/api/admin/pause', { method: 'POST' });
    $('dispatch-result').textContent = 'Рассылка поставлена на паузу.';
    refreshHealth();
  } catch (error) {
    handleError(error);
  }
}

async function resume() {
  try {
    const result = await api('/api/admin/resume', { method: 'POST' });
    const parts = [];
    if (result.resumedFromRisk) parts.push('снята остановка по риску');
    if (result.resumedFromPause) parts.push('снята пауза');
    $('dispatch-result').textContent = parts.length ? `Готово: ${parts.join(', ')}.` : 'Рассылка и так не была остановлена.';
    refreshHealth();
  } catch (error) {
    handleError(error);
  }
}

async function testAlert() {
  try {
    const result = await api('/api/admin/test-alert', { method: 'POST' });
    $('alert-result').textContent = `Доставлено в чатов: ${result.deliveredChats}.`;
  } catch (error) {
    handleError(error);
  }
}

async function preview(event) {
  event.preventDefault();
  $('preview-error').hidden = true;
  $('preview-text').hidden = true;
  try {
    const text = await api('/api/admin/preview', { method: 'POST', body: { id: $('preview-id').value.trim() } });
    $('preview-text').textContent = text;
    $('preview-text').hidden = false;
  } catch (error) {
    if (error instanceof Unauthorized) {
      handleError(error);
      return;
    }
    $('preview-error').textContent = error.message;
    $('preview-error').hidden = false;
  }
}

// --- мелочи ------------------------------------------------------------------

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function yesNo(value) {
  if (value === true) return pill('да', 'ok');
  if (value === false) return pill('нет', 'neutral');
  return '<span class="muted">?</span>';
}

function timeValue(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatTime(value) {
  const ms = timeValue(value);
  if (!ms) return '';
  return new Date(ms).toLocaleString('ru-RU', { timeZone: ZONE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

let toastTimer = null;
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}

// --- события -----------------------------------------------------------------

$('login-form').addEventListener('submit', login);
$('logout').addEventListener('click', () => logout());
$('tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('button')?.dataset.tab;
  if (tab) showTab(tab);
});
['group-search', 'group-active', 'group-archived'].forEach((id) => $(id).addEventListener('input', renderGroups));
$('group-sync').addEventListener('click', syncGroups);
$('group-rows').addEventListener('change', (event) => {
  const jid = event.target.dataset.jid;
  if (!jid) return;
  if (event.target.checked) selected.add(jid);
  else selected.delete(jid);
  $('group-selected').textContent = `Отмечено: ${selected.size}`;
});
$('group-select-shown').addEventListener('click', () => { shownJids.forEach((jid) => selected.add(jid)); renderGroups(); });
$('group-clear').addEventListener('click', () => { selected.clear(); renderGroups(); });
$('list-save').addEventListener('click', saveList);
$('list-chips').addEventListener('click', onListClick);
$('new-target').addEventListener('change', renderNewNote);
$('request-status').addEventListener('change', renderRequests);
$('request-refresh').addEventListener('click', refreshRequests);
$('request-rows').addEventListener('click', (event) => {
  const row = event.target.closest('tr.clickable');
  if (!row) return;
  openRequest = openRequest === row.dataset.id ? null : row.dataset.id;
  renderRequests();
});
$('new-form').addEventListener('submit', submitNew);
$('new-preview').addEventListener('click', previewNew);
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-alert').addEventListener('click', testAlert);
$('preview-form').addEventListener('submit', preview);

if (token) {
  // Админка показывается, только когда сервер принял сохранённый токен.
  api('/api/admin/requests').then(start).catch((error) => {
    logout(error instanceof Unauthorized ? null : `Сервис недоступен: ${error.message}`);
  });
} else {
  $('login').hidden = false;
}
