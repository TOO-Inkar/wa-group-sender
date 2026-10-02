'use strict';

// Админка wa-group-sender: страница поверх HTTP API сервиса, без сборки.
// Токен хранится в localStorage этого браузера и уходит в заголовке X-Admin-Token.

const TOKEN_KEY = 'wa-admin-token';
const DRAFT_KEY = 'wa-request-draft';
const ZONE = 'Asia/Almaty';
const FIELDS = ['route', 'date', 'vehicles', 'cargo', 'freight', 'conditions'];
const REQUIRED = { route: 'Маршрут', date: 'Дата / срочность', vehicles: 'Машины и тоннаж', cargo: 'Груз', freight: 'Фрахт' };

const SESSION_TEXT = {
  STARTING: 'запуск', CONNECTING: 'подключение…', WAITING_QR: 'номер не привязан', CONNECTED: 'подключено',
  RECONNECTING: 'переподключение…', DISCONNECTED: 'нет связи', LOGGED_OUT: 'номер не привязан', BANNED: 'номер заблокирован',
};
const DISPATCHER_TEXT = {
  starting: 'запускается', idle: 'ждёт заявок', running: 'идёт рассылка', paused: 'на паузе', 'outside-window': 'вне рабочего окна',
  'daily-limit-reached': 'дневной лимит исчерпан', 'waiting-session': 'ждёт подключения', 'no-active-groups': 'нет групп для рассылки',
  'stopped-by-risk': 'остановлена по риску', stopped: 'остановлена',
};
const REQUEST_TEXT = { QUEUED: 'В очереди', SENDING: 'Отправляется', DONE: 'Отправлено', FAILED: 'Ошибка' };
const REQUEST_TONE = { QUEUED: '', SENDING: 'info', DONE: 'ok', FAILED: 'bad' };
const DELIVERY_TEXT = { PENDING: 'ждёт', SENDING: 'отправляется', SENT: 'отправлено', FAILED: 'ошибка', SKIPPED: 'пропущено' };
const DELIVERY_TONE = { PENDING: '', SENDING: 'info', SENT: 'ok', FAILED: 'bad', SKIPPED: 'warn' };

const $ = (id) => document.getElementById(id);

let token = readStore(TOKEN_KEY);
let view = 'compose';
let health = null;
let schedule = null;
let groups = [];
let lists = [];
let requests = [];
let requestStatus = '';
let groupFilter = 'all';
let openRequest = null;
let deliveries = {};
let shownJids = [];
let qrUrl = null;
let timers = [];
let previewTimer = null;
let previewSeq = 0;
const selected = new Set();

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
    const message = typeof data === 'object' && data && data.message ? data.message : `Ошибка сервера (HTTP ${response.status})`;
    throw new Error(message);
  }
  return data;
}

function handleError(error) {
  if (error instanceof Unauthorized) {
    logout('Токен не подошёл, войдите заново');
    return;
  }
  toast(error.message || String(error), true);
}

// --- хранилище браузера ------------------------------------------------------

function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // без localStorage значение живёт до перезагрузки страницы
  }
}

// --- вход --------------------------------------------------------------------

async function login(event) {
  event.preventDefault();
  token = $('token').value.trim();
  $('login-error').hidden = true;
  try {
    await api('/api/admin/schedule');
    writeStore(TOKEN_KEY, token);
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
  writeStore(TOKEN_KEY, null);
  $('app').hidden = true;
  $('login').hidden = false;
  $('token').value = '';
  $('login-error').textContent = message || '';
  $('login-error').hidden = !message;
}

async function start() {
  $('login').hidden = true;
  $('app').hidden = false;
  restoreDraft();
  showView(view);
  await refreshHealth();
  loadSchedule();
  refreshGroups();
  refreshLists();
  timers.forEach(clearInterval);
  timers = [
    setInterval(refreshHealth, 5000),
    setInterval(() => { if (view === 'connection') refreshQr(); }, 3000),
    setInterval(() => { if (view === 'requests') refreshRequests(); }, 8000),
  ];
}

async function loadSchedule() {
  try {
    schedule = await api('/api/admin/schedule');
    renderBanner();
    renderComposeNote();
  } catch (error) {
    handleError(error);
  }
}

// --- навигация ---------------------------------------------------------------

function showView(name) {
  view = name;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== `view-${name}`; });
  renderSelectionBar();
  renderBanner();
  if (name === 'compose') { renderTargets(); schedulePreview(0); }
  if (name === 'requests') refreshRequests();
  if (name === 'groups') { refreshGroups(); refreshLists(); }
  if (name === 'connection') { renderConnection(); refreshQr(); }
  if (name === 'control') renderControl();
  window.scrollTo(0, 0);
}

// --- состояние ---------------------------------------------------------------

async function refreshHealth() {
  try {
    const response = await fetch('/api/health');
    health = await response.json();
  } catch {
    health = null;
  }
  renderHealth();
}

function sessionTone(session) {
  if (session === 'CONNECTED') return 'ok';
  if (session === 'WAITING_QR' || session === 'LOGGED_OUT' || session === 'BANNED') return 'bad';
  return 'warn';
}

function renderHealth() {
  const side = $('side-session');
  if (!health) {
    side.textContent = 'сервис недоступен';
    side.className = 'side-status bad';
    $('nav-conn').className = 'dot bad';
    renderBanner();
    return;
  }
  const tone = sessionTone(health.session);
  side.textContent = SESSION_TEXT[health.session] || health.session;
  side.className = `side-status ${tone}`;
  $('nav-conn').className = `dot ${tone}`;
  $('nav-queue').textContent = health.queueLength;
  $('nav-queue').hidden = !health.queueLength;
  renderBanner();
  if (view === 'compose') renderTargets();
  if (view === 'connection') renderConnection();
  if (view === 'control') renderControl();
}

function windowText() {
  if (!schedule) return 'в рабочее окно';
  const days = schedule.weekendsEnabled ? 'ежедневно' : 'по будням';
  return `${schedule.windowStart}–${schedule.windowEnd} ${days}`;
}

// Одна строка наверху: что сейчас мешает рассылке и что с этим сделать.
function renderBanner() {
  const banner = $('banner');
  const action = $('banner-action');
  let tone = '';
  let text = '';
  let button = null;
  if (!health) {
    tone = 'bad';
    text = '<b>Сервис не отвечает.</b> Страница попробует ещё раз через несколько секунд.';
  } else if (health.session === 'BANNED') {
    tone = 'bad';
    text = '<b>Номер заблокирован WhatsApp.</b> Рассылка остановлена.';
  } else if (health.session === 'WAITING_QR' || health.session === 'LOGGED_OUT') {
    tone = 'bad';
    text = '<b>Номер не привязан.</b> Заявки можно создавать, но они не уйдут, пока не отсканирован QR.';
    button = { label: 'Привязать номер', view: 'connection' };
  } else if (health.session !== 'CONNECTED') {
    tone = 'warn';
    text = '<b>Подключаемся к WhatsApp…</b> Обычно это занимает до минуты.';
  } else if (health.stoppedByRisk) {
    tone = 'bad';
    text = `<b>Рассылка остановлена по риску:</b> сигналов за час — ${esc(health.riskEventsInWindow)}. Проверьте телефон и возобновите.`;
    button = { label: 'Открыть управление', view: 'control' };
  } else if (health.dispatcher === 'paused') {
    tone = 'warn';
    text = '<b>Рассылка на паузе.</b> Заявки ждут в очереди.';
    button = { label: 'Открыть управление', view: 'control' };
  } else if (health.dispatcher === 'outside-window') {
    tone = 'info';
    text = `<b>Сейчас вне рабочего окна.</b> Заявки уйдут, когда оно откроется (${esc(windowText())}).`;
  } else if (health.dispatcher === 'daily-limit-reached') {
    tone = 'info';
    text = `<b>Дневной лимит исчерпан:</b> отправлено ${esc(health.sentToday)} из ${esc(health.warmupLimitToday)}. Остальное уйдёт завтра.`;
  } else if (health.dispatcher === 'running') {
    tone = 'ok';
    text = `<b>Идёт рассылка.</b> Заявок в работе: ${esc(health.queueLength)}, отправлено сегодня: ${esc(health.sentToday)}.`;
    button = { label: 'Смотреть заявки', view: 'requests' };
  }
  banner.hidden = !text;
  if (!text) return;
  banner.className = `banner ${tone}`;
  $('banner-text').innerHTML = text;
  action.hidden = !button || button.view === view;
  if (button) {
    action.textContent = button.label;
    action.dataset.view = button.view;
  }
}

// --- новая заявка ------------------------------------------------------------

function formBody() {
  const data = new FormData($('new-form'));
  const body = {};
  for (const name of FIELDS) body[name] = String(data.get(name) || '').trim();
  return body;
}

function targetMode() {
  return new FormData($('new-form')).get('target') || 'all';
}

function setTargetMode(mode) {
  const radio = document.querySelector(`#new-form input[name=target][value=${mode}]`);
  if (radio) radio.checked = true;
}

// Куда уйдёт заявка: groups === null — во все активные группы, иначе список JID.
function currentTarget() {
  const mode = targetMode();
  if (mode === 'pick') {
    return { groups: [...selected], count: selected.size, label: `${plural(selected.size, 'выбранную группу', 'выбранные группы', 'выбранных групп')}` };
  }
  if (mode === 'list') {
    const list = lists.find((item) => String(item.id) === $('target-list').value);
    if (list) {
      return { groups: list.groups, count: list.groups.length, label: `список «${list.name}» (${plural(list.groups.length, 'группа', 'группы', 'групп')})` };
    }
    return { groups: [], count: 0, label: 'список не выбран' };
  }
  const active = health ? health.activeGroups : 0;
  return { groups: null, count: active, label: `все активные группы (${active})` };
}

function renderTargets() {
  const active = health ? health.activeGroups : 0;
  $('target-all-note').textContent = active
    ? `${plural(active, 'группа', 'группы', 'групп')} из «Архива», где номер может писать`
    : 'сейчас таких групп нет — заявка подождёт в очереди';

  const select = $('target-list');
  const html = lists.length
    ? lists.map((list) => `<option value="${esc(list.id)}">${esc(list.name)} — ${plural(list.groups.length, 'группа', 'группы', 'групп')}</option>`).join('')
    : '<option value="">Списков пока нет — создайте на вкладке «Группы»</option>';
  // Состояние обновляется каждые 5 секунд: список пересобирается, только если изменился, иначе он закрывался бы в руках.
  if (select.dataset.html !== html) {
    const previous = select.value;
    select.dataset.html = html;
    select.innerHTML = html;
    if ([...select.options].some((o) => o.value === previous)) select.value = previous;
  }
  select.disabled = !lists.length;

  $('target-pick-note').textContent = selected.size
    ? `выбрано: ${plural(selected.size, 'группа', 'группы', 'групп')}`
    : 'можно выбрать любые группы, куда номер может писать, — например одну тестовую';

  const target = currentTarget();
  $('new-submit').textContent = target.count
    ? `Отправить в ${plural(target.count, 'группу', 'группы', 'групп')}`
    : (target.groups === null ? 'Поставить в очередь' : 'Отправить');
  renderComposeNote();
}

function renderComposeNote() {
  const limit = health && health.warmupLimitToday != null
    ? ` Сегодня можно отправить ещё ${Math.max(0, health.warmupLimitToday - health.sentToday)} из ${health.warmupLimitToday}.`
    : '';
  $('new-note').textContent = `Сообщения уходят не сразу, а по одному с паузами, ${windowText()}.${limit}`;
}

function showFormError(message) {
  $('new-error').textContent = message || '';
  $('new-error').hidden = !message;
}

function saveDraft() {
  const body = formBody();
  writeStore(DRAFT_KEY, FIELDS.some((name) => body[name]) ? JSON.stringify(body) : null);
}

function restoreDraft() {
  try {
    const draft = JSON.parse(readStore(DRAFT_KEY) || 'null');
    if (!draft) return;
    for (const name of FIELDS) {
      const field = $('new-form').elements[name];
      if (field && typeof draft[name] === 'string') field.value = draft[name];
    }
  } catch {
    writeStore(DRAFT_KEY, null);
  }
}

function clearForm() {
  for (const name of FIELDS) {
    const field = $('new-form').elements[name];
    field.value = '';
    field.classList.remove('invalid');
  }
  writeStore(DRAFT_KEY, null);
  showFormError('');
  schedulePreview(0);
}

function schedulePreview(delay = 350) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, delay);
}

async function renderPreview() {
  const body = formBody();
  const box = $('new-preview');
  if (!FIELDS.some((name) => body[name])) {
    box.className = 'bubble empty';
    box.textContent = 'Начните заполнять форму — здесь появится сообщение.';
    return;
  }
  const seq = ++previewSeq;
  try {
    const text = await api('/api/admin/requests/preview', { method: 'POST', body });
    if (seq !== previewSeq) return;
    box.className = 'bubble';
    box.innerHTML = waFormat(text);
  } catch (error) {
    if (error instanceof Unauthorized) handleError(error);
  }
}

// WhatsApp показывает *текст* жирным; остальная разметка остаётся как есть.
function waFormat(text) {
  return esc(text).replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
}

async function submitRequest(event) {
  event.preventDefault();
  showFormError('');
  const body = formBody();
  const missing = [];
  for (const [name, title] of Object.entries(REQUIRED)) {
    const empty = !body[name];
    $('new-form').elements[name].classList.toggle('invalid', empty);
    if (empty) missing.push(title);
  }
  if (missing.length) {
    showFormError(`Заполните: ${missing.join(', ')}.`);
    return;
  }
  const target = currentTarget();
  if (target.groups && !target.groups.length) {
    showFormError(targetMode() === 'pick' ? 'Выберите хотя бы одну группу.' : 'Выберите список групп.');
    return;
  }
  let text = '';
  try {
    text = await api('/api/admin/requests/preview', { method: 'POST', body });
  } catch (error) {
    handleError(error);
    return;
  }
  const ok = await ask({
    title: target.count ? `Отправить в ${plural(target.count, 'группу', 'группы', 'групп')}?` : 'Поставить заявку в очередь?',
    html: `<p>Куда: ${esc(target.label)}.</p><div class="chat"><div class="bubble">${waFormat(text)}</div></div>`
      + (target.count ? '' : '<p>Активных групп сейчас нет: заявка уйдёт, когда они появятся.</p>'),
    ok: target.count ? 'Отправить' : 'Поставить в очередь',
  });
  if (!ok) return;

  const button = $('new-submit');
  button.disabled = true;
  try {
    if (target.groups) body.groups = target.groups;
    const created = await api('/api/admin/requests', { method: 'POST', body });
    clearForm();
    toast(`Заявка №${created.id} принята`);
    openRequest = created.id;
    showView('requests');
    refreshHealth();
  } catch (error) {
    if (error instanceof Unauthorized) handleError(error);
    else showFormError(error.message);
  } finally {
    button.disabled = false;
    renderTargets();
  }
}

// --- выбор групп в окне ------------------------------------------------------

function openPicker() {
  setTargetMode('pick');
  $('picker-search').value = '';
  renderPicker();
  $('picker').showModal();
}

function renderPicker() {
  const query = $('picker-search').value.trim().toLowerCase();
  const onlyActive = $('picker-active').checked;
  const shown = sortGroups(groups
    .filter((g) => !onlyActive || g.active)
    .filter((g) => matches(g, query)));
  $('picker-list').innerHTML = shown.map((g) => `<label class="picker-item ${sendable(g) ? '' : 'disabled'}">
      <input type="checkbox" data-jid="${esc(g.jid)}" ${selected.has(g.jid) ? 'checked' : ''} ${sendable(g) ? '' : 'disabled'}>
      <span>${groupLabel(g)}</span>
      <span class="tags">${groupTags(g)}</span>
    </label>`).join('') || '<div class="empty-state">Ничего не найдено</div>';
  $('picker-count').textContent = `Выбрано: ${selected.size}`;
}

// --- заявки ------------------------------------------------------------------

async function refreshRequests() {
  try {
    requests = await api('/api/admin/requests');
    if (openRequest) await loadDeliveries(openRequest);
    renderRequests();
  } catch (error) {
    handleError(error);
  }
}

async function loadDeliveries(id) {
  try {
    deliveries[id] = await api(`/api/admin/requests/${encodeURIComponent(id)}/deliveries`);
  } catch (error) {
    if (error instanceof Unauthorized) throw error;
    deliveries[id] = [];
  }
}

function requestTitle(request) {
  const first = String(request.message || '').split('\n').find((line) => line.trim()) || '';
  return first.replace(/[*_~]/g, '').trim() || `Заявка №${request.id}`;
}

function renderRequests() {
  const shown = requests
    .filter((r) => !requestStatus || r.status === requestStatus)
    .sort((a, b) => timeValue(b.queuedAt) - timeValue(a.queuedAt));
  if (!shown.length) {
    $('request-list').innerHTML = `<div class="card empty-state">
        <div>${requests.length ? 'С таким статусом заявок нет.' : 'Заявок пока нет.'}</div>
        ${requests.length ? '' : '<button class="primary" data-go="compose">Создать первую заявку</button>'}
      </div>`;
    return;
  }
  $('request-list').innerHTML = shown.map((r) => {
    const p = r.progress || { total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 };
    const percent = p.total ? Math.round(((p.sent + p.failed + p.skipped) / p.total) * 100) : 0;
    const where = r.targetGroups == null ? 'все активные группы' : plural(r.targetGroups, 'выбранная группа', 'выбранные группы', 'выбранных групп');
    const counts = p.total
      ? `отправлено ${p.sent} из ${p.total}${p.failed ? `, ошибок ${p.failed}` : ''}${p.skipped ? `, пропущено ${p.skipped}` : ''}`
      : 'ещё не начата';
    const body = openRequest === r.id ? `<div class="request-body">
        <div class="chat"><div class="bubble">${waFormat(r.message || '')}</div></div>
        <div class="deliveries">${renderDeliveries(r.id)}</div>
      </div>` : '';
    return `<div class="card request">
        <button class="request-head" data-id="${esc(r.id)}">
          <div class="request-top">
            <span class="pill ${REQUEST_TONE[r.status] || ''}">${esc(REQUEST_TEXT[r.status] || r.status)}</span>
            <span class="request-title">№${esc(r.id)} · ${esc(requestTitle(r))}</span>
          </div>
          <div class="bar"><span style="width:${percent}%"></span></div>
          <div class="request-meta">${esc(counts)} · ${esc(where)} · создана ${esc(formatTime(r.queuedAt))}`
          + `${r.completedAt ? ` · завершена ${esc(formatTime(r.completedAt))}` : ''}`
          + `${r.error ? ` · <span class="error">${esc(r.error)}</span>` : ''}</div>
        </button>${body}
      </div>`;
  }).join('');
}

function renderDeliveries(id) {
  const items = deliveries[id];
  if (!items) return '<span class="muted">Загрузка…</span>';
  if (!items.length) return '<span class="muted">Группы ещё не распределены: рассылка этой заявки не начиналась.</span>';
  return items.map((d) => `<div class="delivery">
      <span class="delivery-name">${esc(d.groupName || d.groupJid)}${d.error ? `<span class="jid">${esc(d.error)}</span>` : ''}</span>
      <span class="pill ${DELIVERY_TONE[d.status] || ''}">${esc(DELIVERY_TEXT[d.status] || d.status)}</span>
    </div>`).join('');
}

async function toggleRequest(id) {
  openRequest = openRequest === id ? null : id;
  renderRequests();
  if (openRequest) {
    try {
      await loadDeliveries(id);
      renderRequests();
    } catch (error) {
      handleError(error);
    }
  }
}

// --- группы ------------------------------------------------------------------

// Отметить можно только группу, куда номер может писать; архив для этого не обязателен.
function sendable(group) {
  return group.member === true && group.canSend === true;
}

function matches(group, query) {
  return !query || (group.name || '').toLowerCase().includes(query) || group.jid.toLowerCase().includes(query);
}

function sortGroups(list) {
  return list.sort((a, b) => Number(!a.name) - Number(!b.name) || (a.name || a.jid).localeCompare(b.name || b.jid, 'ru'));
}

function groupLabel(group) {
  return group.name
    ? `<span class="group-name">${esc(group.name)}</span>`
    : `<span class="group-name noname">Без названия</span><span class="jid">${esc(group.jid)}</span>`;
}

function groupTags(group) {
  const tags = [];
  if (group.active) tags.push('<span class="pill ok">в рассылке</span>');
  else if (!group.archived) tags.push('<span class="pill">не в архиве</span>');
  if (group.member === false) tags.push('<span class="pill bad">номер не в группе</span>');
  else if (group.canSend === false) tags.push('<span class="pill warn">пишут только админы</span>');
  else if (group.member == null || group.canSend == null) tags.push('<span class="pill">не проверена</span>');
  return tags.join('');
}

async function refreshGroups() {
  try {
    groups = await api('/api/groups');
    renderGroups();
    if (view === 'compose') renderTargets();
  } catch (error) {
    handleError(error);
  }
}

function renderGroups() {
  const query = $('group-search').value.trim().toLowerCase();
  const filters = {
    all: () => true,
    active: (g) => g.active,
    writable: (g) => sendable(g),
    unarchived: (g) => !g.archived,
    noname: (g) => !g.name,
    selected: (g) => selected.has(g.jid),
  };
  const shown = sortGroups(groups.filter(filters[groupFilter] || filters.all).filter((g) => matches(g, query)));
  shownJids = shown.filter(sendable).map((g) => g.jid);

  const active = groups.filter((g) => g.active).length;
  const lastSync = groups.reduce((max, g) => Math.max(max, timeValue(g.lastSync)), 0);
  $('group-summary').textContent = groups.length
    ? `Всего ${groups.length}, в рассылке ${active}. Обновлено ${formatTime(lastSync)}.`
    : 'Групп пока нет: привяжите номер и нажмите «Обновить из WhatsApp».';

  $('group-rows').innerHTML = shown.map((g) => `<tr>
      <td class="check"><input type="checkbox" data-jid="${esc(g.jid)}" ${selected.has(g.jid) ? 'checked' : ''} ${sendable(g) ? '' : 'disabled'}></td>
      <td>${groupLabel(g)}</td>
      <td><span class="tags">${groupTags(g)}</span></td>
    </tr>`).join('') || '<tr><td colspan="3" class="muted">Ничего не найдено</td></tr>';
  $('group-all').checked = shownJids.length > 0 && shownJids.every((jid) => selected.has(jid));
  renderSelectionBar();
}

function renderSelectionBar() {
  $('selection-bar').hidden = view !== 'groups' || !selected.size;
  $('selection-text').textContent = `Отмечено: ${plural(selected.size, 'группа', 'группы', 'групп')}`;
}

async function syncGroups() {
  const button = $('group-sync');
  button.disabled = true;
  button.textContent = 'Обновляем… до пары минут';
  try {
    const result = await api('/api/admin/groups/sync', { method: 'POST' });
    toast(result.done
      ? `Готово: всего ${result.total}, в архиве ${result.archived}, в рассылке ${result.active}`
      : 'Не получилось: WhatsApp не подключён', !result.done);
    await refreshGroups();
    refreshHealth();
  } catch (error) {
    handleError(error);
  } finally {
    button.disabled = false;
    button.textContent = 'Обновить из WhatsApp';
  }
}

// --- списки ------------------------------------------------------------------

async function refreshLists() {
  try {
    lists = await api('/api/admin/group-lists');
    renderLists();
    if (view === 'compose') renderTargets();
  } catch (error) {
    handleError(error);
  }
}

function renderLists() {
  $('list-items').innerHTML = lists.map((list) => `<div class="list-item">
      <div class="list-item-head">
        <span class="list-item-name">${esc(list.name)}</span>
        <span class="muted small">${plural(list.groups.length, 'группа', 'группы', 'групп')}</span>
      </div>
      <div class="row">
        <button class="primary small" data-send="${esc(list.id)}">Отправить заявку</button>
        <button class="secondary small" data-load="${esc(list.id)}">Показать</button>
        <button class="link small danger" data-del="${esc(list.id)}">Удалить</button>
      </div>
    </div>`).join('') || '<p class="muted small">Списков пока нет.</p>';
}

async function saveSelectionAsList() {
  const name = await ask({
    title: 'Сохранить список',
    html: `<p>${plural(selected.size, 'группа', 'группы', 'групп')}. Если список с таким названием уже есть, его группы заменятся.</p>`,
    input: 'Название, например Тест',
    ok: 'Сохранить',
  });
  if (!name) return;
  try {
    await api('/api/admin/group-lists', { method: 'PUT', body: { name, groups: [...selected] } });
    toast(`Список «${name}» сохранён`);
    await refreshLists();
  } catch (error) {
    handleError(error);
  }
}

async function onListClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const id = button.dataset.send || button.dataset.load || button.dataset.del;
  const list = lists.find((item) => String(item.id) === id);
  if (!list) return;
  if (button.dataset.send) {
    setTargetMode('list');
    showView('compose');
    $('target-list').value = String(list.id);
    renderTargets();
  } else if (button.dataset.load) {
    selected.clear();
    list.groups.forEach((jid) => selected.add(jid));
    groupFilter = 'selected';
    setChip('group-filters', 'filter', groupFilter);
    renderGroups();
  } else if (await ask({ title: `Удалить список «${list.name}»?`, html: '<p>Сами группы и уже созданные заявки не изменятся.</p>', ok: 'Удалить' })) {
    try {
      await api(`/api/admin/group-lists/${list.id}`, { method: 'DELETE' });
      await refreshLists();
    } catch (error) {
      handleError(error);
    }
  }
}

// --- подключение -------------------------------------------------------------

async function refreshQr() {
  if (health && health.session === 'CONNECTED') {
    renderConnection();
    return;
  }
  try {
    const response = await api('/api/qr', { raw: true });
    if (qrUrl) URL.revokeObjectURL(qrUrl);
    qrUrl = response.ok ? URL.createObjectURL(await response.blob()) : null;
    renderConnection();
  } catch (error) {
    handleError(error);
  }
}

function renderConnection() {
  const box = $('qr-box');
  const session = health ? health.session : '';
  if (session === 'CONNECTED') {
    box.className = 'qr-box done';
    box.textContent = 'Номер привязан';
    $('conn-lead').textContent = 'WhatsApp подключён, сканировать ничего не нужно.';
    $('conn-body').innerHTML = `<p>Групп в рассылке: <b>${esc(health.activeGroups)}</b>.</p>
      <p class="muted">Если на телефоне поменялся состав «Архива», обновите список групп.</p>
      <div class="row"><button class="secondary" data-go="groups">Открыть группы</button></div>`;
    return;
  }
  box.className = 'qr-box';
  if (qrUrl) box.innerHTML = `<img alt="QR для привязки" src="${qrUrl}">`;
  else box.textContent = session === 'BANNED' ? 'Номер заблокирован' : 'Ждём QR от WhatsApp…';
  $('conn-lead').textContent = `Состояние: ${SESSION_TEXT[session] || session || 'неизвестно'}.`;
  $('conn-body').innerHTML = `<ol>
      <li>На телефоне с <b>тестовым</b> номером: WhatsApp → Настройки → Связанные устройства.</li>
      <li>«Привязка устройства» → наведите камеру на QR.</li>
      <li>QR меняется примерно раз в 20 секунд, страница подхватит новый сама.</li>
    </ol>
    <p class="muted">Перед привязкой включите «Оставлять чаты в архиве» и положите нужные группы в «Архив».</p>`;
}

// --- управление --------------------------------------------------------------

function stat(label, value, note) {
  return `<div class="card"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div>`
    + `<div class="stat-note">${esc(note)}</div></div>`;
}

function renderControl() {
  if (!health) return;
  const limit = health.warmupLimitToday == null ? 'без лимита' : `лимит ${health.warmupLimitToday}`;
  $('stats').innerHTML = [
    stat('Отправлено сегодня', health.sentToday, `${limit}, день прогрева ${health.warmupDay}`),
    stat('В очереди', health.queueLength, 'заявок ждут или отправляются'),
    stat('Групп в рассылке', health.activeGroups, 'в архиве и можно писать'),
    stat('Сигналы риска', health.riskEventsInWindow, health.stoppedByRisk ? 'рассылка остановлена' : `паузы ×${health.pauseMultiplier}`),
  ].join('');
  $('dispatch-state').textContent = `Сейчас: ${DISPATCHER_TEXT[health.dispatcher] || health.dispatcher}. Рабочее окно: ${windowText()}.`;
}

async function pause() {
  try {
    await api('/api/admin/pause', { method: 'POST' });
    toast('Рассылка поставлена на паузу');
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
    toast(parts.length ? `Готово: ${parts.join(', ')}` : 'Рассылка и так не была остановлена');
    refreshHealth();
  } catch (error) {
    handleError(error);
  }
}

async function testAlert() {
  try {
    const result = await api('/api/admin/test-alert', { method: 'POST' });
    $('alert-result').textContent = result.deliveredChats
      ? `Доставлено в ${plural(result.deliveredChats, 'чат', 'чата', 'чатов')}.`
      : 'Не доставлено ни в один чат: проверьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_IDS.';
  } catch (error) {
    handleError(error);
  }
}

// --- окно подтверждения и ввода ----------------------------------------------

let askResolve = null;

function ask({ title, html = '', ok = 'ОК', input = null }) {
  $('ask-title').textContent = title;
  $('ask-text').innerHTML = html;
  $('ask-ok').textContent = ok;
  $('ask-input').hidden = input === null;
  $('ask-input').value = '';
  $('ask-input').placeholder = input || '';
  $('ask-input').required = input !== null;
  $('ask').returnValue = '';
  $('ask').showModal();
  if (input !== null) $('ask-input').focus();
  return new Promise((resolve) => { askResolve = resolve; });
}

function finishAsk(accepted) {
  const resolve = askResolve;
  askResolve = null;
  if (!resolve) return;
  const withInput = !$('ask-input').hidden;
  resolve(accepted ? (withInput ? $('ask-input').value.trim() : true) : (withInput ? '' : false));
}

// --- мелочи ------------------------------------------------------------------

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many);
  return `${n} ${word}`;
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

function setChip(containerId, key, value) {
  document.querySelectorAll(`#${containerId} .chip`).forEach((chip) => chip.classList.toggle('active', chip.dataset[key] === value));
}

let toastTimer = null;
function toast(message, bad = false) {
  $('toast').textContent = message;
  $('toast').className = bad ? 'toast bad' : 'toast';
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, bad ? 6000 : 3500);
}

function toggleSelected(jid, on) {
  if (on) selected.add(jid);
  else selected.delete(jid);
}

// --- события -----------------------------------------------------------------

$('login-form').addEventListener('submit', login);
$('logout').addEventListener('click', () => logout());
$('nav').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button && button.dataset.view) showView(button.dataset.view);
});
$('banner-action').addEventListener('click', () => showView($('banner-action').dataset.view));
document.querySelector('main').addEventListener('click', (event) => {
  const go = event.target.closest('[data-go]');
  if (go) showView(go.dataset.go);
});

$('new-form').addEventListener('submit', submitRequest);
$('new-form').addEventListener('input', (event) => {
  if (event.target.name === 'target') { renderTargets(); return; }
  if (event.target.id === 'target-list') { setTargetMode('list'); renderTargets(); return; }
  event.target.classList.remove('invalid');
  saveDraft();
  schedulePreview();
});
$('new-form').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) $('new-form').requestSubmit();
});
$('new-clear').addEventListener('click', clearForm);
$('target-pick-open').addEventListener('click', openPicker);

$('picker-search').addEventListener('input', renderPicker);
$('picker-active').addEventListener('change', renderPicker);
$('picker-list').addEventListener('change', (event) => {
  if (!event.target.dataset.jid) return;
  toggleSelected(event.target.dataset.jid, event.target.checked);
  $('picker-count').textContent = `Выбрано: ${selected.size}`;
});
$('picker-clear').addEventListener('click', () => { selected.clear(); renderPicker(); });
$('picker').addEventListener('close', () => { renderTargets(); renderGroups(); });

$('request-new').addEventListener('click', () => showView('compose'));
$('request-filters').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  requestStatus = chip.dataset.status;
  setChip('request-filters', 'status', requestStatus);
  renderRequests();
});
$('request-list').addEventListener('click', (event) => {
  const head = event.target.closest('.request-head');
  if (head) toggleRequest(head.dataset.id);
});

$('group-search').addEventListener('input', renderGroups);
$('group-filters').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  groupFilter = chip.dataset.filter;
  setChip('group-filters', 'filter', groupFilter);
  renderGroups();
});
$('group-rows').addEventListener('change', (event) => {
  if (!event.target.dataset.jid) return;
  toggleSelected(event.target.dataset.jid, event.target.checked);
  $('group-all').checked = shownJids.length > 0 && shownJids.every((jid) => selected.has(jid));
  renderSelectionBar();
});
$('group-all').addEventListener('change', (event) => {
  shownJids.forEach((jid) => toggleSelected(jid, event.target.checked));
  renderGroups();
});
$('group-sync').addEventListener('click', syncGroups);
$('list-items').addEventListener('click', onListClick);
$('selection-send').addEventListener('click', () => { setTargetMode('pick'); showView('compose'); });
$('selection-save').addEventListener('click', saveSelectionAsList);
$('selection-clear').addEventListener('click', () => { selected.clear(); renderGroups(); });

$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-alert').addEventListener('click', testAlert);

$('ask-form').addEventListener('submit', () => finishAsk(true));
$('ask-cancel').addEventListener('click', () => { finishAsk(false); $('ask').close(); });
$('ask').addEventListener('close', () => finishAsk(false));

if (token) {
  // Админка показывается, только когда сервер принял сохранённый токен.
  api('/api/admin/schedule').then(start).catch((error) => {
    logout(error instanceof Unauthorized ? null : `Сервис недоступен: ${error.message}`);
  });
} else {
  $('login').hidden = false;
}
