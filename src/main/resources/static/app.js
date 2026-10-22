'use strict';

// Админка wa-group-sender: страница поверх HTTP API сервиса, без сборки.
// Вход по логину и паролю: сервер ставит HttpOnly-cookie сессии, страница её не видит и не хранит.

const DRAFT_KEY = 'wa-request-draft';
const ZONE = 'Asia/Almaty';
// Порядок полей формы: Груз, Доп. условия и Фрахт последним.
const FIELDS = ['route', 'date', 'vehicles', 'cargo', 'conditions', 'freight'];
const REQUIRED = { route: 'Маршрут', date: 'Дата / срочность', vehicles: 'Машины и тоннаж', cargo: 'Груз', freight: 'Фрахт' };

const SESSION_TEXT = {
  STARTING: 'запуск', CONNECTING: 'подключение…', WAITING_QR: 'номер не привязан', CONNECTED: 'подключено',
  RECONNECTING: 'переподключение…', DISCONNECTED: 'нет связи', LOGGED_OUT: 'номер не привязан', BANNED: 'номер заблокирован',
};
const DISPATCHER_TEXT = {
  starting: 'запускается', idle: 'ждёт заявок', running: 'идёт рассылка', paused: 'на паузе', 'outside-window': 'вне рабочего окна',
  'daily-limit-reached': 'дневной лимит исчерпан', 'hourly-limit-reached': 'лимит в час исчерпан',
  'waiting-groups': 'ждёт: в оставшихся группах последнее сообщение наше', 'waiting-session': 'ждёт подключения',
  'no-active-groups': 'нет групп для рассылки', 'stopped-by-risk': 'остановлена по риску', stopped: 'остановлена',
};
const RUN_TEXT = { QUEUED: 'в очереди', SENDING: 'идёт', DONE: 'отправлена', FAILED: 'ошибка' };
const RUN_TONE = { QUEUED: '', SENDING: 'info', DONE: 'ok', FAILED: 'bad' };
const CAMPAIGN_STATE = {
  sending: { text: 'Рассылается', tone: 'info' },
  waiting: { text: 'В очереди', tone: '' },
  scheduled: { text: 'По расписанию', tone: 'ok' },
  done: { text: 'Завершена', tone: 'ok' },
  off: { text: 'Выключена', tone: 'warn' },
};
const DELIVERY_TEXT = { PENDING: 'ждёт', SENDING: 'отправляется', SENT: 'отправлено', FAILED: 'ошибка', SKIPPED: 'пропущено' };
const DELIVERY_TONE = { PENDING: '', SENDING: 'info', SENT: 'ok', FAILED: 'bad', SKIPPED: 'warn' };

const $ = (id) => document.getElementById(id);

let view = 'requests';
let health = null;
let schedule = null;
let groups = [];
let lists = [];
let campaigns = [];
let campaignFilter = '';
let openCampaign = null;
let openRun = null;
const details = {};
const deliveries = {};
let editing = null;
let groupFilter = 'all';
let shownJids = [];
let qrUrl = null;
let timers = [];
let previewTimer = null;
let previewSeq = 0;
let settings = null;
let telegram = null;
const selected = new Set();

// --- API ---------------------------------------------------------------------

class Unauthorized extends Error {}

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
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
    showLogin('Сессия закончилась, войдите снова');
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
    // без localStorage черновик живёт до перезагрузки страницы
  }
}

// --- вход --------------------------------------------------------------------

function showLogin(message) {
  timers.forEach(clearInterval);
  timers = [];
  $('app').hidden = true;
  $('login').hidden = false;
  $('login-password').value = '';
  $('login-error').textContent = message || '';
  $('login-error').hidden = !message;
  ($('login-username').value ? $('login-password') : $('login-username')).focus();
}

async function login(event) {
  event.preventDefault();
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  $('login-error').hidden = true;
  if (!username || !password) {
    $('login-error').textContent = 'Введите логин и пароль';
    $('login-error').hidden = false;
    return;
  }
  const button = $('login-submit');
  button.disabled = true;
  button.textContent = 'Входим…';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      let message = response.status === 401 ? 'Неверный логин или пароль' : `Ошибка сервера (HTTP ${response.status})`;
      try { message = (await response.json()).message || message; } catch { /* не JSON */ }
      throw new Error(message);
    }
    start();
  } catch (error) {
    $('login-error').textContent = error.message;
    $('login-error').hidden = false;
    $('login-password').select();
  } finally {
    button.disabled = false;
    button.textContent = 'Войти';
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // всё равно показываем вход
  }
  showLogin();
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
  refreshTelegram();
  timers.forEach(clearInterval);
  timers = [
    setInterval(refreshHealth, 5000),
    setInterval(() => { if (view === 'connection') refreshQr(); }, 3000),
    setInterval(() => { if (view === 'requests') refreshCampaigns(); }, 8000),
    setInterval(refreshTelegram, 60000),
  ];
}

async function loadSchedule() {
  try {
    schedule = await api('/api/admin/schedule');
    renderBanner();
    renderComposeNote();
    renderContactHint();
    renderRepeatNote();
  } catch (error) {
    handleError(error);
  }
}

// --- навигация ---------------------------------------------------------------

function showView(name) {
  if (name !== 'compose' && editing) stopEditing();
  view = name;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== `view-${name}`; });
  renderSelectionBar();
  renderBanner();
  if (name === 'compose') { renderTargets(); renderRepeat(); schedulePreview(0); }
  if (name === 'requests') refreshCampaigns();
  if (name === 'groups') { refreshGroups(); refreshLists(); }
  if (name === 'connection') { renderConnection(); refreshQr(); }
  if (name === 'settings') { renderStats(); loadSettings(); refreshTelegram(); }
  window.scrollTo(0, 0);
}

// --- состояние ---------------------------------------------------------------

async function refreshHealth() {
  try {
    health = await api('/api/admin/health');
  } catch (error) {
    if (error instanceof Unauthorized) { handleError(error); return; }
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
  if (view === 'settings') renderStats();
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
    button = { label: 'Открыть настройки', view: 'settings' };
  } else if (health.dispatcher === 'paused') {
    tone = 'warn';
    text = '<b>Рассылка на паузе.</b> Заявки ждут.';
    button = { label: 'Открыть настройки', view: 'settings' };
  } else if (health.dispatcher === 'outside-window') {
    tone = 'info';
    text = `<b>Сейчас вне рабочего окна.</b> Рассылка продолжится, когда оно откроется (${esc(windowText())}).`;
  } else if (health.dispatcher === 'daily-limit-reached') {
    tone = 'info';
    text = `<b>Дневной лимит исчерпан:</b> отправлено ${esc(health.sentToday)} из ${esc(health.warmupLimitToday)}. Остальное уйдёт завтра.`;
  } else if (health.dispatcher === 'hourly-limit-reached') {
    tone = 'info';
    text = `<b>Лимит в час исчерпан:</b> ${esc(health.sentLastHour)} из ${esc(health.hourlyLimit)} за последний час. Рассылка продолжится сама.`;
  } else if (health.dispatcher === 'waiting-groups') {
    tone = 'info';
    text = '<b>Ждём:</b> в оставшихся группах последнее сообщение наше. Рассылка продолжится, когда там кто-то напишет или пройдёт пауза.';
  } else if (health.dispatcher === 'running') {
    tone = 'ok';
    text = `<b>Идёт рассылка.</b> Рассылок в работе: ${esc(health.queueLength)}, отправлено сегодня: ${esc(health.sentToday)}.`;
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

// --- форма заявки -------------------------------------------------------------

const FIELD_VIEW = {
  route: { title: 'Маршрут', placeholder: 'ХОРГОС → БАКУ' },
  date: { title: 'Дата / срочность', placeholder: 'Срочно, груз готов' },
  vehicles: { title: 'Машины и тоннаж', placeholder: '120 м³ / 5 осей — 20 т', area: 3, hint: 'Каждая строка — отдельная строка сообщения (Shift+Enter).' },
  cargo: { title: 'Груз', placeholder: 'Цемент' },
  conditions: { title: 'Доп. условия', placeholder: 'Необязательно, можно несколько строк', area: 2 },
  freight: { title: 'Фрахт', placeholder: '450 000 ₸' },
};

let composeMode = 'fields';

function fieldHtml(name) {
  const field = FIELD_VIEW[name];
  const required = REQUIRED[name] ? ' <span class="req">*</span>' : '';
  const input = field.area
    ? `<textarea data-field="${name}" rows="${field.area}" placeholder="${esc(field.placeholder)}"></textarea>`
    : `<input data-field="${name}" placeholder="${esc(field.placeholder)}" autocomplete="off">`;
  const hint = field.hint ? `<span class="hint">${esc(field.hint)}</span>` : '';
  return `<label><span>${esc(field.title)}${required}</span>${input}${hint}</label>`;
}

function itemHtml() {
  return `<div class="item-head"><b class="item-title"></b>
      <button type="button" class="link small danger" data-remove>Убрать</button></div>`
    + FIELDS.map(fieldHtml).join('');
}

function addItem(values = {}) {
  const item = document.createElement('div');
  item.className = 'item';
  item.innerHTML = itemHtml();
  for (const name of FIELDS) {
    const field = item.querySelector(`[data-field=${name}]`);
    if (typeof values[name] === 'string') field.value = values[name];
  }
  $('items').appendChild(item);
  renumberItems();
  return item;
}

function renumberItems() {
  const items = [...document.querySelectorAll('#items .item')];
  items.forEach((item, i) => {
    item.querySelector('.item-title').textContent = items.length > 1 ? `Заявка ${i + 1}` : 'Заявка';
    item.querySelector('[data-remove]').hidden = items.length === 1;
  });
}

function itemValues(item) {
  const values = {};
  for (const name of FIELDS) values[name] = item.querySelector(`[data-field=${name}]`).value.trim();
  return values;
}

function filledItems() {
  return [...document.querySelectorAll('#items .item')]
    .map((item) => ({ item, values: itemValues(item) }))
    .filter(({ values }) => FIELDS.some((name) => values[name]));
}

function setComposeMode(mode) {
  composeMode = mode;
  document.querySelectorAll('#mode-switch button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('mode-fields').hidden = mode !== 'fields';
  $('mode-text').hidden = mode !== 'text';
  showFormError('');
  saveDraft();
  schedulePreview(0);
}

// Содержимое: готовый текст или заявки по полям (несколько уйдут одним сообщением).
function formContent() {
  if (composeMode === 'text') return { mode: 'text', text: $('ready-text').value };
  const content = { mode: 'fields', items: filledItems().map(({ values }) => values) };
  const contact = $('contact').value.trim();
  if (contact) content.contact = contact;
  return content;
}

// Тело для предпросмотра (старый формат API).
function previewBody() {
  const content = formContent();
  return content.mode === 'text' ? { text: content.text } : { items: content.items, contact: content.contact };
}

function formIsEmpty() {
  return composeMode === 'text' ? !$('ready-text').value.trim() : !filledItems().length;
}

function renderContactHint() {
  const contact = schedule && schedule.contact ? schedule.contact : '';
  $('contact-hint').textContent = contact
    ? `Пусто — возьмётся «${contact}». В сообщении из нескольких заявок контакт будет один раз, в конце.`
    : 'Пусто — строки с контактом в сообщении не будет.';
}

function targetMode() {
  return new FormData($('new-form')).get('target') || 'all';
}

function setTargetMode(mode) {
  const radio = document.querySelector(`#new-form input[name=target][value=${mode}]`);
  if (radio) radio.checked = true;
}

// Куда уйдёт заявка: groups === null — во все активные группы, иначе список JID; label — как показать в списке заявок.
function currentTarget() {
  const mode = targetMode();
  if (mode === 'pick') {
    return { groups: [...selected], count: selected.size, label: plural(selected.size, 'выбранную группу', 'выбранные группы', 'выбранных групп'), name: null };
  }
  if (mode === 'list') {
    const list = lists.find((item) => String(item.id) === $('target-list').value);
    if (list) {
      return { groups: list.groups, count: list.groups.length, label: `список «${list.name}» (${plural(list.groups.length, 'группа', 'группы', 'групп')})`, name: list.name };
    }
    return { groups: [], count: 0, label: 'список не выбран', name: null };
  }
  const active = health ? health.activeGroups : 0;
  return { groups: null, count: active, label: `все активные группы (${active})`, name: null };
}

function renderTargets() {
  const active = health ? health.activeGroups : 0;
  $('target-all-note').textContent = active
    ? `${plural(active, 'группа', 'группы', 'групп')} из «Архива», где номер может писать`
    : 'сейчас таких групп нет — заявка подождёт';

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
    : 'любые группы, куда номер может писать, — например одна тестовая';
  renderSubmitLabel();
  renderComposeNote();
}

function renderSubmitLabel() {
  if (editing) {
    $('new-submit').textContent = 'Сохранить изменения';
    return;
  }
  const repeat = repeatMode();
  if (repeat !== 'now') {
    $('new-submit').textContent = 'Сохранить и запланировать';
    return;
  }
  const target = currentTarget();
  $('new-submit').textContent = target.count
    ? `Отправить в ${plural(target.count, 'группу', 'группы', 'групп')}`
    : 'Поставить в очередь';
}

function renderComposeNote() {
  const limit = health && health.warmupLimitToday != null
    ? ` Сегодня можно ещё ${Math.max(0, health.warmupLimitToday - health.sentToday)} из ${health.warmupLimitToday}.`
    : '';
  $('new-note').textContent = `Сообщения уходят не сразу, а по одному с паузами, ${windowText()}.${limit}`;
}

// --- когда отправлять ---------------------------------------------------------

function repeatMode() {
  return new FormData($('new-form')).get('repeat') || 'now';
}

function setRepeatMode(mode) {
  const radio = document.querySelector(`#new-form input[name=repeat][value=${mode}]`);
  if (radio) radio.checked = true;
}

function repeatBody() {
  const mode = repeatMode();
  if (mode === 'at') return { repeat: { mode: 'ONCE', start: $('at-time').value }, sendNow: false };
  if (mode === 'daily') return { repeat: { mode: 'DAILY', start: $('daily-time').value }, sendNow: $('send-now').checked };
  if (mode === 'interval') {
    return {
      repeat: { mode: 'INTERVAL', start: $('interval-start').value, end: $('interval-end').value, intervalMinutes: Number($('interval-hours').value) },
      sendNow: $('send-now').checked,
    };
  }
  return { repeat: { mode: 'ONCE' }, sendNow: true };
}

function intervalText(minutes) {
  if (!minutes) return '';
  if (minutes % 60 === 0) return minutes === 60 ? 'каждый час' : `каждые ${plural(minutes / 60, 'час', 'часа', 'часов')}`;
  return `каждые ${String(minutes / 60).replace('.', ',')} часа`;
}

function renderRepeat() {
  const mode = repeatMode();
  $('send-now-row').hidden = mode !== 'daily' && mode !== 'interval';
  renderRepeatNote();
  renderSubmitLabel();
}

function renderRepeatNote() {
  const mode = repeatMode();
  const now = $('send-now').checked;
  let text = '';
  if (mode === 'now') text = `Заявка уйдёт один раз, ${windowText()}.`;
  if (mode === 'at') text = `Один раз: начнётся в ${$('at-time').value || '…'} (сегодня, если время ещё не прошло, иначе завтра).`;
  if (mode === 'daily') {
    text = `${now ? 'Первая рассылка — сразу, дальше' : 'Рассылка'} каждый день в ${$('daily-time').value || '…'}`
      + ` — своё время, даже если рабочее окно начинается позже. Шлёт до ${schedule ? schedule.windowEnd : 'конца окна'}.`;
  }
  if (mode === 'interval') {
    text = `${now ? 'Первая рассылка — сразу, дальше' : 'Рассылка'} ${intervalText(Number($('interval-hours').value))}`
      + ` с ${$('interval-start').value || '…'} до ${$('interval-end').value || '…'}, каждый день.`
      + ' Если прошлая рассылка ещё не закончилась, повтор пропускается.';
  }
  if (schedule && !schedule.weekendsEnabled && mode !== 'now') text += ' В выходные не рассылается.';
  $('repeat-note').textContent = text;
}

// --- черновик, предпросмотр ---------------------------------------------------

function showFormError(message) {
  $('new-error').textContent = message || '';
  $('new-error').hidden = !message;
}

function saveDraft() {
  if (editing) return;
  const items = [...document.querySelectorAll('#items .item')].map(itemValues);
  const draft = { mode: composeMode, items, text: $('ready-text').value, contact: $('contact').value, title: $('title').value };
  const empty = !draft.text.trim() && !draft.contact.trim() && !draft.title.trim() && items.every((v) => FIELDS.every((name) => !v[name]));
  writeStore(DRAFT_KEY, empty && composeMode === 'fields' ? null : JSON.stringify(draft));
}

function fillForm(draft) {
  $('items').innerHTML = '';
  const items = draft && Array.isArray(draft.items) && draft.items.length ? draft.items : [{}];
  items.forEach((values) => addItem(values || {}));
  $('ready-text').value = draft && typeof draft.text === 'string' ? draft.text : '';
  updateCount();
  $('contact').value = draft && typeof draft.contact === 'string' ? draft.contact : '';
  $('title').value = draft && typeof draft.title === 'string' ? draft.title : '';
  setComposeMode(draft && draft.mode === 'text' ? 'text' : 'fields');
}

function restoreDraft() {
  let draft = null;
  try {
    draft = JSON.parse(readStore(DRAFT_KEY) || 'null');
  } catch {
    writeStore(DRAFT_KEY, null);
  }
  fillForm(draft);
}

function clearForm() {
  writeStore(DRAFT_KEY, null);
  const mode = composeMode;
  fillForm(null);
  setComposeMode(mode);
  setRepeatMode('now');
  setTargetMode('all');
  renderRepeat();
  renderTargets();
}

function schedulePreview(delay = 350) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, delay);
}

async function renderPreview() {
  const box = $('new-preview');
  if (formIsEmpty()) {
    box.className = 'bubble empty';
    box.textContent = composeMode === 'text'
      ? 'Вставьте текст — здесь появится сообщение.'
      : 'Начните заполнять форму — здесь появится сообщение.';
    return;
  }
  const seq = ++previewSeq;
  try {
    const text = await api('/api/admin/requests/preview', { method: 'POST', body: previewBody() });
    if (seq !== previewSeq) return;
    box.className = 'bubble';
    box.innerHTML = waFormat(text);
  } catch (error) {
    if (error instanceof Unauthorized) handleError(error);
  }
}

// Разметка WhatsApp: ```моно```, *жирный*, _курсив_, ~зачёркнутый~. Как в самом WhatsApp, знак работает, если
// снаружи к нему не прилегает буква или цифра, а внутри он касается текста: «📍*ХОРГОС*» жирный, «3 * 4» и snake_case — нет.
function waFormat(text) {
  const inline = (source, mark, tag) => {
    const m = mark === '*' ? '\\*' : mark;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${m}(?=\\S)([^\\n]*?\\S)${m}(?![\\p{L}\\p{N}])`, 'gu');
    return source.replace(re, `<${tag}>$1</${tag}>`);
  };
  let html = esc(text).replace(/```([\s\S]+?)```/g, '<code>$1</code>');
  html = inline(html, '*', 'b');
  html = inline(html, '_', 'i');
  html = inline(html, '~', 's');
  return html;
}

// Enter — к следующему полю, Shift+Enter — новая строка в многострочных полях, Ctrl+Enter — отправить.
function onFieldKey(event) {
  if (event.key !== 'Enter' || event.isComposing) return;
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    $('new-form').requestSubmit();
    return;
  }
  const target = event.target;
  if (!target.matches('#items [data-field], #contact, #title')) return;
  if (event.shiftKey) {
    if (target.tagName !== 'TEXTAREA') event.preventDefault();
    return;
  }
  event.preventDefault();
  const order = [...document.querySelectorAll('#items [data-field]'), $('contact'), $('title')];
  const next = order[order.indexOf(target) + 1];
  if (next) next.focus();
  else $('new-submit').focus();
}

// --- редактор готового текста -------------------------------------------------

const EMOJI = {
  'Заявка': ['📍', '📅', '✅', '🚛', '🚚', '🚐', '📦', '💰', '💵', '📞', '☎️', '⛴️', '🚢', '🚂', '✈️', '🛃', '⚖️', '📐', '📏',
    '🔥', '⚡️', '⚠️', '❗️', '‼️', '⏰', '🗓️', '📋', '📝', '🧾', '➡️', '↔️', '🔁', '🌍', '🗺️', '🏭', '🧱', '🛢️', '❄️', '🌡️',
    '🔒', '📌', '⭐', '🌟', '✨', '💫', '🟢', '🔴', '🟡', '⚪'],
  'Флаги': ['🇨🇳', '🇰🇿', '🇷🇺', '🇺🇿', '🇰🇬', '🇹🇯', '🇹🇲', '🇦🇿', '🇬🇪', '🇦🇲', '🇧🇾', '🇺🇦', '🇹🇷', '🇮🇷', '🇦🇫', '🇲🇳', '🇪🇺',
    '🇩🇪', '🇵🇱', '🇱🇹', '🇱🇻', '🇪🇪', '🇳🇱', '🇧🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇨🇿', '🇬🇧', '🇦🇪', '🇮🇳', '🇵🇰', '🇰🇷', '🇯🇵', '🇺🇸'],
  'Цифры': ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '#️⃣', '🔢'],
  'Прочее': ['👍', '👌', '🙏', '🤝', '💪', '👉', '👈', '👇', '☝️', '✋', '😊', '🙂', '😉', '🔔', '📣', '📢', '💬', '✍️',
    '🎯', '🏁', '💯', '🆕', '🆓', '🔝', '⬆️', '⬇️'],
};
let emojiTab = 'Заявка';

function editor() {
  return $('ready-text');
}

function afterEdit() {
  updateCount();
  saveDraft();
  schedulePreview();
}

function updateCount() {
  const text = editor().value;
  const chars = [...text].length;
  const lines = text ? text.split('\n').length : 0;
  $('text-count').textContent = `${chars} ${plural(chars, 'символ', 'символа', 'символов').split(' ')[1]} · ${plural(lines, 'строка', 'строки', 'строк')}`;
}

function insertText(text) {
  const area = editor();
  area.focus();
  const { selectionStart: start, selectionEnd: end, value } = area;
  area.value = value.slice(0, start) + text + value.slice(end);
  area.selectionStart = area.selectionEnd = start + text.length;
  afterEdit();
}

// Оборачивает выделение в знаки форматирования. Пробелы по краям выделения остаются снаружи, иначе WhatsApp
// не распознает разметку; несколько строк оборачиваются построчно, кроме моноширинного блока.
function wrapSelection(mark) {
  const area = editor();
  area.focus();
  const { selectionStart: start, selectionEnd: end, value } = area;
  const picked = value.slice(start, end);
  if (!picked) {
    area.value = value.slice(0, start) + mark + mark + value.slice(end);
    area.selectionStart = area.selectionEnd = start + mark.length;
    afterEdit();
    return;
  }
  const wrapOne = (part) => {
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(part);
    if (!match[2]) return part;
    const inner = match[2];
    const already = inner.startsWith(mark) && inner.endsWith(mark) && inner.length > mark.length * 2;
    return match[1] + (already ? inner.slice(mark.length, -mark.length) : mark + inner + mark) + match[3];
  };
  const wrapped = mark === '```' ? wrapOne(picked) : picked.split('\n').map(wrapOne).join('\n');
  area.value = value.slice(0, start) + wrapped + value.slice(end);
  area.selectionStart = start;
  area.selectionEnd = start + wrapped.length;
  afterEdit();
}

async function insertSnippet(kind) {
  const area = editor();
  const before = area.value.slice(0, area.selectionStart);
  const lead = before && !before.endsWith('\n') ? '\n' : '';
  if (kind === 'separator') {
    insertText(`${lead}\n━━━━━━━━━━━━━━━━━━━━\n\n`);
  } else if (kind === 'skeleton') {
    insertText(`${lead}📍*МАРШРУТ*\n\n📅 *Дата / срочность*✅\n\n🚛 Машины и тоннаж\n\n📦 Груз\n💰 Фрахт \n`);
  } else if (kind === 'contact') {
    let contact = schedule && schedule.contact ? schedule.contact : '';
    if (!contact) {
      contact = await ask({ title: 'Контакт', html: '<p>Введите контакт для этого сообщения.</p>', input: 'Имя +7 7xx xxx xx xx', ok: 'Вставить' });
      if (!contact) return;
    }
    insertText(`${lead}\n📞 *${contact}*`);
  }
}

function renderEmoji() {
  $('emoji-tabs').innerHTML = Object.keys(EMOJI)
    .map((tab) => `<button type="button" data-tab="${esc(tab)}" class="${tab === emojiTab ? 'active' : ''}">${esc(tab)}</button>`).join('');
  $('emoji-grid').innerHTML = EMOJI[emojiTab].map((e) => `<button type="button" data-emoji="${esc(e)}" title="${esc(e)}">${e}</button>`).join('');
}

function toggleEmoji(open) {
  const show = open ?? $('emoji-panel').hidden;
  $('emoji-panel').hidden = !show;
  $('emoji-open').setAttribute('aria-expanded', String(show));
  if (show) renderEmoji();
}

// Сообщение, собранное из полей, переходит в редактор для ручной правки.
async function fieldsToText() {
  if (formIsEmpty()) { showFormError('Сначала заполните заявку.'); return; }
  try {
    const text = await api('/api/admin/requests/preview', { method: 'POST', body: previewBody() });
    if ($('ready-text').value.trim() && !(await ask({ title: 'Заменить текст в редакторе?',
      html: '<p>В режиме «Готовый текст» уже есть сообщение. Оно заменится собранным из полей.</p>', ok: 'Заменить' }))) return;
    $('ready-text').value = text;
    setComposeMode('text');
    updateCount();
  } catch (error) {
    handleError(error);
  }
}

// --- отправка и редактирование ------------------------------------------------

function validateFields() {
  if (composeMode !== 'fields') return true;
  const filled = filledItems();
  const problems = [];
  filled.forEach(({ item, values }, i) => {
    const missing = [];
    for (const [name, title] of Object.entries(REQUIRED)) {
      const empty = !values[name];
      item.querySelector(`[data-field=${name}]`).classList.toggle('invalid', empty);
      if (empty) missing.push(title);
    }
    if (missing.length) problems.push(filled.length > 1 ? `заявка ${i + 1}: ${missing.join(', ')}` : missing.join(', '));
  });
  if (problems.length) {
    showFormError(`Заполните: ${problems.join('; ')}.`);
    const first = document.querySelector('#items .invalid');
    if (first) first.focus();
    return false;
  }
  return true;
}

async function submitRequest(event) {
  event.preventDefault();
  showFormError('');
  if (formIsEmpty()) {
    showFormError(composeMode === 'text' ? 'Вставьте текст сообщения.' : 'Заполните заявку.');
    return;
  }
  if (!validateFields()) return;
  const target = currentTarget();
  if (target.groups && !target.groups.length) {
    showFormError(targetMode() === 'pick' ? 'Выберите хотя бы одну группу.' : 'Выберите список групп.');
    return;
  }
  const { repeat, sendNow } = repeatBody();
  if (repeat.start === '' || repeat.end === '') {
    showFormError('Укажите время.');
    return;
  }
  const body = {
    title: $('title').value.trim() || null,
    content: formContent(),
    groups: target.groups,
    targetLabel: target.name,
    repeat,
    sendNow,
  };

  let text = '';
  try {
    text = await api('/api/admin/requests/preview', { method: 'POST', body: previewBody() });
  } catch (error) {
    handleError(error);
    return;
  }
  const when = $('repeat-note').textContent;
  const ok = await ask({
    title: editing ? 'Сохранить изменения?' : (repeatMode() === 'now' && target.count
      ? `Отправить в ${plural(target.count, 'группу', 'группы', 'групп')}?` : 'Сохранить заявку?'),
    html: `<p>Куда: ${esc(target.label)}.<br>Когда: ${esc(when)}</p>`
      + `<div class="chat"><div class="bubble">${waFormat(text)}</div></div>`
      + (editing ? '<p>Рассылка, которая уже идёт, досылает прежний текст; новый уйдёт со следующей.</p>' : ''),
    ok: editing ? 'Сохранить' : (repeatMode() === 'now' ? 'Отправить' : 'Сохранить'),
  });
  if (!ok) return;

  const button = $('new-submit');
  button.disabled = true;
  try {
    const saved = editing
      ? await api(`/api/admin/campaigns/${encodeURIComponent(editing)}`, { method: 'PUT', body })
      : await api('/api/admin/campaigns', { method: 'POST', body });
    toast(editing ? `Заявка №${saved.id} сохранена` : `Заявка №${saved.id} создана`);
    if (editing) stopEditing();
    else clearForm();
    openCampaign = saved.id;
    openRun = null;
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

function startEditing(campaign) {
  editing = campaign.id;
  let form = null;
  try { form = campaign.form ? JSON.parse(campaign.form) : null; } catch { form = null; }
  if (!form || (!form.text && !(form.items && form.items.length))) form = { mode: 'text', text: campaign.message };
  fillForm({ mode: form.mode, items: form.items, text: form.text || '', contact: form.contact || '', title: campaign.title });

  selected.clear();
  const list = campaign.targeted && lists.find((l) => l.name === campaign.targetLabel
    && l.groups.length === campaign.targets.length && campaign.targets.every((t) => l.groups.includes(t.jid)));
  if (!campaign.targeted) setTargetMode('all');
  else if (list) { setTargetMode('list'); $('target-list').value = String(list.id); }
  else { campaign.targets.forEach((t) => selected.add(t.jid)); setTargetMode('pick'); }

  if (campaign.repeatMode === 'DAILY') { setRepeatMode('daily'); $('daily-time').value = campaign.startTime; }
  else if (campaign.repeatMode === 'INTERVAL') {
    setRepeatMode('interval');
    $('interval-start').value = campaign.startTime;
    $('interval-end').value = campaign.endTime || (schedule ? schedule.windowEnd : '23:00');
    const option = [...$('interval-hours').options].find((o) => Number(o.value) === campaign.intervalMinutes);
    if (!option) $('interval-hours').add(new Option(intervalText(campaign.intervalMinutes), campaign.intervalMinutes));
    $('interval-hours').value = String(campaign.intervalMinutes);
  } else if (campaign.startTime) { setRepeatMode('at'); $('at-time').value = campaign.startTime; }
  else setRepeatMode('now');
  $('send-now').checked = false;

  $('compose-title').textContent = `Заявка №${campaign.id}: изменение`;
  $('compose-lead').textContent = 'Поправьте текст, адресатов или расписание. Новый текст уйдёт со следующей рассылки.';
  $('edit-cancel').hidden = false;
  $('new-clear').hidden = true;
  showView('compose');
}

function stopEditing() {
  editing = null;
  $('compose-title').textContent = 'Новая заявка';
  $('compose-lead').textContent = 'Заполните поля — справа видно, как сообщение будет выглядеть в WhatsApp.';
  $('edit-cancel').hidden = true;
  $('new-clear').hidden = false;
  $('send-now').checked = true;
  setRepeatMode('now');
  setTargetMode('all');
  selected.clear();
  restoreDraft();
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

async function refreshCampaigns() {
  try {
    campaigns = await api('/api/admin/campaigns');
    if (openCampaign) {
      await loadDetails(openCampaign);
      // Только что созданная или изменённая заявка: сразу показываем её текущую рассылку.
      const c = details[openCampaign];
      const first = !openRun && c && (c.current || (c.runs && c.runs[0]));
      if (first) openRun = first.id;
    }
    if (openRun) await loadDeliveries(openRun);
    renderCampaigns();
  } catch (error) {
    handleError(error);
  }
}

async function loadDetails(id) {
  try {
    details[id] = await api(`/api/admin/campaigns/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof Unauthorized) throw error;
    delete details[id];
  }
}

async function loadDeliveries(runId) {
  try {
    deliveries[runId] = await api(`/api/admin/requests/${encodeURIComponent(runId)}/deliveries`);
  } catch (error) {
    if (error instanceof Unauthorized) throw error;
    deliveries[runId] = [];
  }
}

function campaignState(c) {
  if (c.current) return c.current.status === 'SENDING' ? 'sending' : 'waiting';
  if (!c.enabled) return c.repeatMode === 'ONCE' && c.lastRunAt ? 'done' : 'off';
  if (c.nextRunAt) return 'scheduled';
  return 'done';
}

function scheduleText(c) {
  const end = c.endTime || (schedule ? schedule.windowEnd : '');
  if (c.repeatMode === 'DAILY') return `каждый день в ${c.startTime}`;
  if (c.repeatMode === 'INTERVAL') return `${intervalText(c.intervalMinutes)} с ${c.startTime} до ${end}`;
  return c.startTime ? `один раз в ${c.startTime}` : 'один раз';
}

function whereText(c) {
  if (!c.targeted) return 'все активные группы';
  return c.targetLabel || plural(c.targets.length, 'группа', 'группы', 'групп');
}

function progressText(run) {
  if (!run) return 'ещё не начата';
  const p = run.progress || { total: 0, sent: 0, failed: 0, skipped: 0, pending: 0 };
  if (!p.total) return run.status === 'FAILED' ? (run.error || 'ошибка') : 'ещё не начата';
  return `отправлено ${p.sent} из ${p.total}${p.failed ? `, ошибок ${p.failed}` : ''}${p.skipped ? `, пропущено ${p.skipped}` : ''}`;
}

function percent(run) {
  const p = run && run.progress;
  return p && p.total ? Math.round(((p.sent + p.failed + p.skipped) / p.total) * 100) : 0;
}

function renderCampaigns() {
  const query = $('request-search').value.trim().toLowerCase();
  const shown = campaigns.filter((c) => {
    const state = campaignState(c);
    if (campaignFilter === 'sending' && state !== 'sending' && state !== 'waiting') return false;
    if (campaignFilter && campaignFilter !== 'sending' && state !== campaignFilter) return false;
    return !query || c.title.toLowerCase().includes(query) || (c.message || '').toLowerCase().includes(query);
  });
  if (!shown.length) {
    $('request-list').innerHTML = `<div class="card empty-state">
        <div>${campaigns.length ? 'Таких заявок нет.' : 'Заявок пока нет.'}</div>
        ${campaigns.length ? '' : '<button class="primary" data-go="compose">Создать первую заявку</button>'}
      </div>`;
    return;
  }
  $('request-list').innerHTML = shown.map((c) => {
    const state = CAMPAIGN_STATE[campaignState(c)];
    const run = c.current || (c.runs && c.runs[0]) || null;
    const next = c.enabled && c.nextRunAt && c.repeatMode !== 'ONCE' ? ` · следующая ${formatTime(c.nextRunAt)}` : '';
    const nextOnce = c.enabled && c.nextRunAt && c.repeatMode === 'ONCE' && !c.current ? ` · начнётся ${formatTime(c.nextRunAt)}` : '';
    const body = openCampaign === c.id ? renderCampaignBody(details[c.id] || c) : '';
    return `<div class="card request${openCampaign === c.id ? ' open' : ''}">
        <button class="request-head" data-id="${esc(c.id)}">
          <div class="request-top">
            <span class="pill ${state.tone}">${esc(state.text)}</span>
            <span class="request-title">№${esc(c.id)} · ${esc(c.title)}</span>
          </div>
          <div class="bar"><span style="width:${percent(run)}%"></span></div>
          <div class="request-meta">${esc(progressText(run))} · <b>${esc(whereText(c))}</b> · ${esc(scheduleText(c))}${esc(next)}${esc(nextOnce)}`
          + ` · создана ${esc(formatTime(c.createdAt))}</div>
        </button>${body}
      </div>`;
  }).join('');
}

function renderCampaignBody(c) {
  const state = campaignState(c);
  const actions = `<div class="request-actions">
      <button class="secondary small" data-edit="${esc(c.id)}">✏️ Изменить</button>
      <button class="secondary small" data-run="${esc(c.id)}" ${c.current ? 'disabled title="Рассылка ещё идёт"' : ''}>▶ Отправить сейчас</button>
      ${c.enabled || c.current
        ? `<button class="secondary small" data-disable="${esc(c.id)}">⏸ Выключить</button>`
        : (c.repeatMode !== 'ONCE' ? `<button class="secondary small" data-enable="${esc(c.id)}">⏵ Включить расписание</button>` : '')}
      <button class="link small danger" data-delete="${esc(c.id)}">Удалить</button>
    </div>`;
  const targets = c.targeted
    ? `<details class="targets"><summary>Группы: ${esc(whereText(c))} (${c.targets.length})</summary>
        <ul>${c.targets.map((t) => `<li>${esc(t.name || t.jid)}</li>`).join('')}</ul></details>`
    : '<p class="muted small">Группы: все активные группы на момент рассылки.</p>';
  const schedulePart = `<p class="muted small">Когда: ${esc(scheduleText(c))}${state === 'scheduled' || (c.enabled && c.nextRunAt)
    ? `, следующая — ${esc(formatTime(c.nextRunAt))}` : ''}${!c.enabled && c.repeatMode !== 'ONCE' ? ', расписание выключено' : ''}.</p>`;
  const runs = (c.runs || []);
  const runsHtml = runs.length
    ? runs.map((run) => renderRun(run)).join('')
    : '<p class="muted">Рассылок ещё не было.</p>';
  return `<div class="request-body">
      <div class="stack">
        <div class="chat"><div class="bubble">${waFormat(c.message || '')}</div></div>
        ${targets}
        ${schedulePart}
      </div>
      <div class="stack">
        ${actions}
        <h3 class="runs-title">Рассылки${c.runCount > runs.length ? ` (последние ${runs.length} из ${c.runCount})` : ''}</h3>
        <div class="runs">${runsHtml}</div>
      </div>
    </div>`;
}

function renderRun(run) {
  const open = openRun === run.id;
  const p = run.progress || {};
  const canRetry = (run.status === 'DONE' || run.status === 'FAILED') && p.failed > 0;
  return `<div class="run${open ? ' open' : ''}">
      <button class="run-head" data-open-run="${esc(run.id)}">
        <span class="pill ${RUN_TONE[run.status] || ''}">${esc(RUN_TEXT[run.status] || run.status)}</span>
        <span class="run-time">${esc(formatTime(run.queuedAt))}</span>
        <span class="muted small">${esc(progressText(run))}</span>
      </button>
      ${open ? `<div class="run-body">
        <div class="request-actions">
          <button class="secondary small" data-report="${esc(run.id)}" data-format="xlsx">Отчёт Excel</button>
          <button class="secondary small" data-report="${esc(run.id)}" data-format="pdf">Отчёт PDF</button>
          ${canRetry ? `<button class="secondary small" data-retry="${esc(run.id)}">Повторить в группы с ошибкой (${p.failed})</button>` : ''}
        </div>
        <div class="deliveries">${renderDeliveries(run.id)}</div>
      </div>` : ''}
    </div>`;
}

function renderDeliveries(id) {
  const items = deliveries[id];
  if (!items) return '<span class="muted">Загрузка…</span>';
  if (!items.length) return '<span class="muted">Группы ещё не распределены: рассылка не начиналась.</span>';
  return items.map((d) => {
    const waiting = d.status === 'PENDING' && d.error;
    const text = waiting ? 'ждёт' : (DELIVERY_TEXT[d.status] || d.status);
    const tone = waiting ? 'warn' : (DELIVERY_TONE[d.status] || '');
    return `<div class="delivery">
      <span class="delivery-name">${esc(d.groupName || d.groupJid)}${d.error ? `<span class="jid">${esc(deliveryReason(d.error))}</span>` : ''}</span>
      <span class="pill ${tone}">${esc(text)}</span>
    </div>`;
  }).join('');
}

// Технические причины — понятными словами.
function deliveryReason(error) {
  if (/group inactive/.test(error)) return 'группа вышла из рассылки';
  if (/error 479/.test(error)) return 'WhatsApp отклонил отправку в эту группу';
  if (/not connected/.test(error)) return 'не было связи с WhatsApp';
  return error;
}

async function toggleCampaign(id) {
  openCampaign = openCampaign === id ? null : id;
  openRun = null;
  renderCampaigns();
  if (!openCampaign) return;
  try {
    await loadDetails(id);
    const c = details[id];
    const first = c && (c.current || (c.runs && c.runs[0]));
    if (first) {
      openRun = first.id;
      renderCampaigns();
      await loadDeliveries(first.id);
    }
    renderCampaigns();
  } catch (error) {
    handleError(error);
  }
}

async function toggleRun(id) {
  openRun = openRun === id ? null : id;
  renderCampaigns();
  if (openRun) {
    try {
      await loadDeliveries(id);
      renderCampaigns();
    } catch (error) {
      handleError(error);
    }
  }
}

async function campaignAction(id, action) {
  const c = details[id] || campaigns.find((item) => item.id === id);
  if (!c) return;
  try {
    if (action === 'edit') {
      await loadDetails(id);
      startEditing(details[id] || c);
      return;
    }
    if (action === 'delete') {
      const ok = await ask({ title: `Удалить заявку №${c.id}?`,
        html: `<p>«${esc(c.title)}» пропадёт из списка${c.current ? ', её рассылка остановится' : ''}. История отправок останется в отчётах.</p>`, ok: 'Удалить' });
      if (!ok) return;
      await api(`/api/admin/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast(`Заявка №${c.id} удалена`);
      openCampaign = null;
    }
    if (action === 'disable') {
      const ok = await ask({ title: `Выключить заявку №${c.id}?`,
        html: `<p>${c.current ? 'Идущая рассылка остановится: в оставшиеся группы не уйдёт. ' : ''}${c.repeatMode !== 'ONCE' ? 'Повторы по расписанию прекратятся, пока не включите снова.' : ''}</p>`,
        ok: 'Выключить' });
      if (!ok) return;
      await api(`/api/admin/campaigns/${encodeURIComponent(id)}/disable`, { method: 'POST' });
      toast(`Заявка №${c.id} выключена`);
    }
    if (action === 'enable') {
      await api(`/api/admin/campaigns/${encodeURIComponent(id)}/enable`, { method: 'POST' });
      toast(`Расписание заявки №${c.id} включено`);
    }
    if (action === 'run') {
      const ok = await ask({ title: `Разослать заявку №${c.id} сейчас?`,
        html: `<p>Новая рассылка: ${esc(whereText(c))}. Пойдёт параллельно с другими заявками, с общими паузами и лимитами.</p>`, ok: 'Отправить' });
      if (!ok) return;
      await api(`/api/admin/campaigns/${encodeURIComponent(id)}/run`, { method: 'POST' });
      toast(`Заявка №${c.id}: новая рассылка в очереди`);
      openRun = null;
    }
    await refreshCampaigns();
    refreshHealth();
  } catch (error) {
    handleError(error);
  }
}

// --- отчёты ------------------------------------------------------------------

function isoDay(date) {
  // Дата в часовом поясе сервиса, в виде 2026-10-05.
  return date.toLocaleDateString('sv-SE', { timeZone: ZONE });
}

function setReportPreset(days) {
  const today = new Date();
  $('report-to').value = isoDay(today);
  $('report-from').value = isoDay(new Date(today.getTime() - days * 86400000));
  document.querySelectorAll('#report-presets .chip').forEach((chip) => chip.classList.toggle('active', Number(chip.dataset.days) === days));
}

function openReport() {
  setReportPreset(6);
  $('report').showModal();
}

function downloadPeriod(format, button) {
  const from = $('report-from').value;
  const to = $('report-to').value;
  if (!from || !to) { toast('Укажите обе даты', true); return; }
  if (to < from) { toast('Дата «по» раньше даты «с»', true); return; }
  download(`/api/admin/reports/period?from=${from}&to=${to}&format=${format}`, `wa-report-${from}_${to}.${format}`, button);
}

async function download(url, fallbackName, button) {
  const label = button ? button.textContent : '';
  if (button) { button.disabled = true; button.textContent = 'Готовим…'; }
  try {
    const response = await api(url, { raw: true });
    if (!response.ok) {
      let message = `Ошибка сервера (HTTP ${response.status})`;
      try { message = (await response.json()).message || message; } catch { /* не JSON */ }
      throw new Error(message);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition) || /filename="?([^";]+)"?/i.exec(disposition);
    const name = match ? decodeURIComponent(match[1]) : fallbackName;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  } catch (error) {
    handleError(error);
  } finally {
    if (button) { button.disabled = false; button.textContent = label; }
  }
}

async function retryFailed(runId) {
  const ok = await ask({
    title: 'Повторить в группы с ошибкой?',
    html: '<p>Рассылка снова встанет в очередь и уйдёт только в группы, где была ошибка. Где уже отправлено, повторно не придёт.</p>',
    ok: 'Повторить',
  });
  if (!ok) return;
  try {
    await api(`/api/admin/requests/${encodeURIComponent(runId)}/retry`, { method: 'POST' });
    toast('Рассылка снова в очереди');
    delete deliveries[runId];
    await refreshCampaigns();
    refreshHealth();
  } catch (error) {
    handleError(error);
  }
}

// --- группы ------------------------------------------------------------------

// Отметить можно только группу, куда номер может писать; архив для этого не обязателен.
function sendable(group) {
  return group.member === true && group.canSend === true && !group.community && !group.tooLarge && !group.rejected;
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
  if (group.community) tags.push('<span class="pill warn" title="В само сообщество писать нельзя, только в его группу объявлений">сообщество</span>');
  else if (group.member === false) tags.push('<span class="pill bad">номер не в группе</span>');
  else if (group.canSend === false) tags.push('<span class="pill warn">пишут только админы</span>');
  else if (group.member == null || group.canSend == null) tags.push('<span class="pill">не проверена</span>');
  if (group.rejected) {
    tags.push('<span class="pill bad" title="WhatsApp дважды подряд отклонил отправку в эту группу (ошибка 479)">WhatsApp отклоняет</span>');
    tags.push(`<button class="link small" data-reset="${esc(group.jid)}" title="Попробовать снова в следующей рассылке">вернуть в рассылку</button>`);
  } else if (group.rejectedCount > 0) {
    tags.push('<span class="pill warn" title="Последняя отправка отклонена WhatsApp (ошибка 479); после второго отказа подряд группа выйдет из рассылки">был отказ</span>');
  }
  if (group.tooLarge) {
    tags.push('<span class="pill bad" title="Больше участников, чем задано в GROUPS_MAX_PARTICIPANTS">больше лимита</span>');
  }
  if (group.participants != null) tags.push(`<span class="pill">${esc(plural(group.participants, 'участник', 'участника', 'участников'))}</span>`);
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
    blocked: (g) => g.community || g.tooLarge || g.rejected,
    selected: (g) => selected.has(g.jid),
  };
  const shown = sortGroups(groups.filter(filters[groupFilter] || filters.all).filter((g) => matches(g, query)));
  shownJids = shown.filter(sendable).map((g) => g.jid);

  const active = groups.filter((g) => g.active).length;
  const lastSync = groups.reduce((max, g) => Math.max(max, timeValue(g.lastSync)), 0);
  $('group-summary').textContent = groups.length
    ? `Групп номера: ${groups.length}, в рассылке ${active}. Обновлено ${formatTime(lastSync)}.`
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
        <button class="primary small" data-send="${esc(list.id)}">Заявка в этот список</button>
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
      <li>На телефоне с номером для рассылки: WhatsApp → Настройки → Связанные устройства.</li>
      <li>«Привязка устройства» → наведите камеру на QR.</li>
      <li>QR меняется примерно раз в 20 секунд, страница подхватит новый сама.</li>
    </ol>
    <p class="muted">Перед привязкой включите «Оставлять чаты в архиве» и положите нужные группы в «Архив». После привязки другого номера в списке останутся только его группы.</p>`;
}

// --- настройки ---------------------------------------------------------------

function stat(label, value, note) {
  return `<div class="card"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div>`
    + `<div class="stat-note">${esc(note)}</div></div>`;
}

function renderStats() {
  if (!health) return;
  const limit = health.warmupLimitToday == null ? 'без лимита' : `из ${health.warmupLimitToday}`;
  $('stats').innerHTML = [
    stat('Отправлено сегодня', health.sentToday, `${limit}, день прогрева ${health.warmupDay}`),
    stat('За последний час', health.sentLastHour, health.hourlyLimit ? `из ${health.hourlyLimit} в час` : 'без лимита в час'),
    stat('Рассылок в работе', health.queueLength, 'идут или ждут'),
    stat('Групп в рассылке', health.activeGroups, 'в архиве и можно писать'),
    stat('Сигналы риска', health.riskEventsInWindow, health.stoppedByRisk ? 'рассылка остановлена' : `паузы ×${health.pauseMultiplier}`),
  ].join('');
  $('dispatch-state').textContent = `Сейчас: ${DISPATCHER_TEXT[health.dispatcher] || health.dispatcher}. Рабочее окно: ${windowText()}.`;
}

async function loadSettings() {
  try {
    settings = await api('/api/admin/settings');
    fillSettings();
  } catch (error) {
    handleError(error);
  }
}

// Сводка на странице: что сейчас установлено; поменять — в окне по кнопке «Изменить».
function renderSettingsSummary() {
  const s = settings;
  if (!s) return;
  const hours = s.windowStart === s.windowEnd ? 'круглосуточно' : `${s.windowStart}–${s.windowEnd}`;
  $('sum-window').textContent = `${hours}, ${s.weekendsEnabled ? 'ежедневно' : 'по будням'}`;
  $('sum-limits').textContent = [
    s.hourlyLimit ? `${s.hourlyLimit} в час` : 'без лимита в час',
    s.dailyLimit ? `${s.dailyLimit} в день` : 'без лимита в день',
    s.warmupEnabled ? 'прогрев включён' : 'без прогрева',
  ].join(' · ');
  const parts = [];
  if (s.autoReplyEnabled) parts.push('отвечает на сообщения');
  if (s.autoReplyRejectCalls) parts.push('отклоняет звонки');
  $('sum-reply').textContent = parts.length
    ? `Включён: ${parts.join(', ')}. Одному человеку — не чаще раза в ${s.autoReplyCooldownHours} ч.`
    : 'Выключен: на сообщения и звонки номер не отвечает.';
  $('sum-reply-text').innerHTML = waFormat(s.autoReplyText || '');
}

function openSettingsDialog(id) {
  if (!settings) return;
  fillSettings();
  ['settings-window-error', 'settings-reply-error'].forEach((e) => { $(e).hidden = true; });
  $(id).showModal();
}

function fillSettings() {
  const s = settings;
  $('s-window-start').value = s.windowStart;
  $('s-window-end').value = s.windowEnd;
  $('s-weekends').checked = s.weekendsEnabled;
  $('s-hourly').value = s.hourlyLimit;
  $('s-daily').value = s.dailyLimit;
  $('s-warmup').checked = s.warmupEnabled;
  $('s-gpause-min').value = s.groupPauseMinSeconds;
  $('s-gpause-max').value = s.groupPauseMaxSeconds;
  $('s-wave').value = s.waveSize;
  $('s-wpause-min').value = s.wavePauseMinMinutes;
  $('s-wpause-max').value = s.wavePauseMaxMinutes;
  $('s-gap').value = s.ownMessageGapMinutes;
  $('r-enabled').checked = s.autoReplyEnabled;
  $('r-calls').checked = s.autoReplyRejectCalls;
  $('r-cooldown').value = s.autoReplyCooldownHours;
  $('r-text').value = s.autoReplyText;
  renderSettingsSummary();
}

async function saveSettings(event, which) {
  event.preventDefault();
  const number = (id) => ($(id).value === '' ? null : Number($(id).value));
  const body = which === 'window' ? {
    windowStart: $('s-window-start').value, windowEnd: $('s-window-end').value, weekendsEnabled: $('s-weekends').checked,
    hourlyLimit: number('s-hourly'), dailyLimit: number('s-daily'), warmupEnabled: $('s-warmup').checked,
    groupPauseMinSeconds: number('s-gpause-min'), groupPauseMaxSeconds: number('s-gpause-max'), waveSize: number('s-wave'),
    wavePauseMinMinutes: number('s-wpause-min'), wavePauseMaxMinutes: number('s-wpause-max'), ownMessageGapMinutes: number('s-gap'),
  } : {
    autoReplyEnabled: $('r-enabled').checked, autoReplyRejectCalls: $('r-calls').checked,
    autoReplyCooldownHours: number('r-cooldown'), autoReplyText: $('r-text').value,
  };
  const error = $(`settings-${which}-error`);
  error.hidden = true;
  try {
    settings = await api('/api/admin/settings', { method: 'PUT', body });
    fillSettings();
    $(`settings-${which}-dialog`).close();
    toast('Настройки сохранены');
    loadSchedule();
    refreshHealth();
  } catch (e) {
    if (e instanceof Unauthorized) { handleError(e); return; }
    error.textContent = e.message;
    error.hidden = false;
  }
}

async function refreshTelegram() {
  try {
    telegram = await api('/api/admin/telegram');
    const pending = telegram.subscribers.filter((s) => s.status === 'PENDING').length;
    $('nav-subs').textContent = pending;
    $('nav-subs').hidden = !pending;
    if (view === 'settings') renderTelegram();
  } catch (error) {
    if (error instanceof Unauthorized) handleError(error);
  }
}

function renderTelegram() {
  if (!telegram) return;
  $('tg-lead').innerHTML = !telegram.botConfigured
    ? 'Бот не настроен: нужен TELEGRAM_BOT_TOKEN в .env на сервере.'
    : `Чтобы получать уведомления, напишите боту ${telegram.botUsername ? `<b>@${esc(telegram.botUsername)}</b>` : ''} команду <code>/start</code>, затем одобрите запрос здесь. Отписаться — <code>/stop</code>.`;
  const status = { PENDING: ['ждёт одобрения', 'warn'], APPROVED: ['получает', 'ok'], REJECTED: ['отклонён', 'bad'] };
  const configured = telegram.configuredChats.map((c) => `<div class="subscriber">
      <span><b>${esc(c.name || `чат ${c.chatId}`)}</b>${c.username ? ` <span class="muted">@${esc(c.username)}</span>` : ''}
        <span class="jid">задан в настройках сервера (.env), удаляется только там</span></span>
      <span class="pill ok">получает</span>
    </div>`);
  const subs = telegram.subscribers.map((s) => `<div class="subscriber">
      <span><b>${esc(s.name || 'без имени')}</b>${s.username ? ` <span class="muted">@${esc(s.username)}</span>` : ''}
        <span class="jid">запрос ${esc(formatTime(s.requestedAt))}</span></span>
      <span class="row">
        <span class="pill ${status[s.status][1]}">${status[s.status][0]}</span>
        ${s.status !== 'APPROVED' ? `<button class="primary small" data-approve="${esc(s.chatId)}">Одобрить</button>` : ''}
        ${s.status === 'PENDING' ? `<button class="secondary small" data-reject="${esc(s.chatId)}">Отклонить</button>` : ''}
        <button class="link small danger" data-unsub="${esc(s.chatId)}">Удалить</button>
      </span>
    </div>`);
  $('tg-subscribers').innerHTML = [...configured, ...subs].join('') || '<p class="muted small">Пока никто не подписан.</p>';
}

async function onSubscriberClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const id = button.dataset.approve || button.dataset.reject || button.dataset.unsub;
  if (!id) return;
  try {
    if (button.dataset.approve) {
      await api(`/api/admin/telegram/subscribers/${encodeURIComponent(id)}/approve`, { method: 'POST' });
      toast('Подписка одобрена');
    } else if (button.dataset.reject) {
      await api(`/api/admin/telegram/subscribers/${encodeURIComponent(id)}/reject`, { method: 'POST' });
    } else if (await ask({ title: 'Удалить подписчика?', html: '<p>Уведомления перестанут приходить. Он сможет снова попросить подписку через /start.</p>', ok: 'Удалить' })) {
      await api(`/api/admin/telegram/subscribers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
    await refreshTelegram();
  } catch (error) {
    handleError(error);
  }
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
      : 'Не доставлено ни в один чат: нет подписчиков или бот не настроен.';
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
  else $('ask-ok').focus();
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
$('login-show').addEventListener('click', () => {
  const field = $('login-password');
  field.type = field.type === 'password' ? 'text' : 'password';
  $('login-show').textContent = field.type === 'password' ? 'показать' : 'скрыть';
  field.focus();
});
$('logout').addEventListener('click', logout);
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
$('new-form').addEventListener('keydown', onFieldKey);
$('new-form').addEventListener('input', (event) => {
  if (event.target.name === 'target') { renderTargets(); return; }
  if (event.target.id === 'target-list') { setTargetMode('list'); renderTargets(); return; }
  if (event.target.closest('#repeat-box')) {
    // Поменяли время или интервал — выбираем и сам вариант.
    const option = event.target.closest('label.option');
    const radio = option && option.querySelector('[name=repeat]');
    if (radio) radio.checked = true;
    renderRepeat();
    return;
  }
  event.target.classList.remove('invalid');
  saveDraft();
  schedulePreview();
});
$('new-form').addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    remove.closest('.item').remove();
    renumberItems();
    saveDraft();
    schedulePreview(0);
  }
});
$('editor-toolbar').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.wrap) wrapSelection(button.dataset.wrap);
  else if (button.dataset.insert) insertSnippet(button.dataset.insert);
  else if (button.id === 'emoji-open') toggleEmoji();
});
$('emoji-panel').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.tab) { emojiTab = button.dataset.tab; renderEmoji(); return; }
  if (button.dataset.emoji) insertText(button.dataset.emoji);
});
document.addEventListener('click', (event) => {
  if (!$('emoji-panel').hidden && !event.target.closest('#emoji-panel, #emoji-open')) toggleEmoji(false);
});
$('ready-text').addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) {
    if (event.key === 'Escape') toggleEmoji(false);
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 'b' || key === 'и') { event.preventDefault(); wrapSelection('*'); }
  if (key === 'i' || key === 'ш') { event.preventDefault(); wrapSelection('_'); }
});
$('ready-text').addEventListener('input', updateCount);
$('to-text').addEventListener('click', fieldsToText);
$('mode-switch').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button && button.dataset.mode) setComposeMode(button.dataset.mode);
});
$('item-add').addEventListener('click', () => {
  const item = addItem();
  saveDraft();
  item.querySelector('[data-field=route]').focus();
});
$('new-clear').addEventListener('click', clearForm);
$('edit-cancel').addEventListener('click', () => { stopEditing(); showView('requests'); });
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
$('report-open').addEventListener('click', openReport);
$('report-presets').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (chip) setReportPreset(Number(chip.dataset.days));
});
['report-from', 'report-to'].forEach((id) => $(id).addEventListener('input', () => {
  document.querySelectorAll('#report-presets .chip').forEach((chip) => chip.classList.remove('active'));
}));
$('report-xlsx').addEventListener('click', (event) => downloadPeriod('xlsx', event.currentTarget));
$('report-pdf').addEventListener('click', (event) => downloadPeriod('pdf', event.currentTarget));
$('report-cancel').addEventListener('click', () => $('report').close());
$('request-filters').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  campaignFilter = chip.dataset.filter;
  setChip('request-filters', 'filter', campaignFilter);
  renderCampaigns();
});
$('request-search').addEventListener('input', renderCampaigns);
$('request-list').addEventListener('click', (event) => {
  const report = event.target.closest('[data-report]');
  if (report) {
    download(`/api/admin/reports/requests/${encodeURIComponent(report.dataset.report)}?format=${report.dataset.format}`,
      `wa-report-${report.dataset.report}.${report.dataset.format}`, report);
    return;
  }
  const retry = event.target.closest('[data-retry]');
  if (retry) { retryFailed(retry.dataset.retry); return; }
  for (const action of ['edit', 'run', 'disable', 'enable', 'delete']) {
    const button = event.target.closest(`[data-${action}]`);
    if (button) { campaignAction(button.dataset[action], action); return; }
  }
  const run = event.target.closest('[data-open-run]');
  if (run) { toggleRun(run.dataset.openRun); return; }
  const head = event.target.closest('.request-head');
  if (head) toggleCampaign(head.dataset.id);
});

$('group-search').addEventListener('input', renderGroups);
$('group-filters').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  groupFilter = chip.dataset.filter;
  setChip('group-filters', 'filter', groupFilter);
  renderGroups();
});
$('group-rows').addEventListener('click', async (event) => {
  const reset = event.target.closest('[data-reset]');
  if (!reset) return;
  try {
    await api(`/api/admin/groups/reset-rejections?jid=${encodeURIComponent(reset.dataset.reset)}`, { method: 'POST' });
    toast('Группа вернётся в рассылку со следующей заявки');
    await refreshGroups();
    refreshHealth();
  } catch (error) {
    handleError(error);
  }
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
$('settings-window').addEventListener('submit', (event) => saveSettings(event, 'window'));
$('settings-reply').addEventListener('submit', (event) => saveSettings(event, 'reply'));
$('r-default').addEventListener('click', () => { if (settings) $('r-text').value = settings.defaultAutoReplyText; });
document.addEventListener('click', (event) => {
  const open = event.target.closest('[data-dialog]');
  if (open) { openSettingsDialog(open.dataset.dialog); return; }
  const close = event.target.closest('[data-close]');
  if (close) close.closest('dialog').close();
});
$('tg-subscribers').addEventListener('click', onSubscriberClick);

$('ask-form').addEventListener('submit', () => finishAsk(true));
$('ask-cancel').addEventListener('click', () => { finishAsk(false); $('ask').close(); });
$('ask').addEventListener('close', () => finishAsk(false));

// Старая версия хранила токен в браузере — больше не нужен.
writeStore('wa-admin-token', null);

fetch('/api/auth/me', { credentials: 'same-origin' })
  .then((response) => response.json())
  .then((me) => (me.authenticated ? start() : showLogin()))
  .catch(() => showLogin('Сервис недоступен, обновите страницу через минуту'));
