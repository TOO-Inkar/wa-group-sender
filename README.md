# wa-group-sender

Сервис берёт новые заявки на грузоперевозки из Google Sheets и публикует их в WhatsApp-группы из папки «Архив» **отдельного тестового номера**. Подключение через WhatsApp Web («Связанные устройства») без браузера: клиент на Go-библиотеке [whatsmeow](https://github.com/tulir/whatsmeow) работает отдельным контейнером `wa-bridge` (`bridge/`), Java-сервис обращается к нему по HTTP внутри compose-сети. Отправка идёт в один поток: волны, случайные паузы, «печатает…», рабочее окно, прогрев, мониторинг риска.

> Способ неофициальный. Номер может быть заблокирован WhatsApp в любой момент. Сервис снижает вероятность блокировки, но не исключает её. Подключайте только отдельный номер.

Документы: ТЗ — `docs/TZ.md`, план — `docs/PLAN.md`, отчёт спайка — `docs/spike-report.md`, вопросы к запуску — `docs/open-questions.md`, тестовая таблица — `docs/test-sheet.csv`.

## Содержание

1. [Требования к серверу](#1-требования-к-серверу)
2. [Установка Docker](#2-установка-docker)
3. [Получение кода](#3-получение-кода)
4. [Заполнение .env](#4-заполнение-env)
5. [Ключ Google и тестовая таблица](#5-ключ-google-и-тестовая-таблица)
6. [Telegram-алерты](#6-telegram-алерты)
7. [Первый запуск и сканирование QR](#7-первый-запуск-и-сканирование-qr)
8. [Проверка после запуска](#8-проверка-после-запуска)
9. [Логи](#9-логи)
10. [Изменение лимитов, окна, прогрева, шаблона и контакта без пересборки](#10-изменение-лимитов-окна-прогрева-шаблона-и-контакта-без-пересборки)
11. [Переключение на таблицу клиента](#11-переключение-на-таблицу-клиента)
12. [Остановка по риску и возобновление](#12-остановка-по-риску-и-возобновление)
13. [Что делать при разлогине](#13-что-делать-при-разлогине)
14. [HTTP API](#14-http-api)
15. [Тестовый прогон без номера (профиль fake)](#15-тестовый-прогон-без-номера-профиль-fake)
16. [Обновление, бэкап, разработка](#16-обновление-бэкап-разработка)
17. [CI/CD и стенд inkbpadev](#17-cicd-и-стенд-inkbpadev)

## 1. Требования к серверу

| | Тест | Бой |
| --- | --- | --- |
| Где | Временный сервер разработчика | KZ VPS клиента (PS.kz или Hoster.kz) |
| CPU / RAM / диск | от 1 vCPU / 2 ГБ / 20 ГБ | 2 vCPU / 4 ГБ / 40–50 ГБ SSD |
| ОС | Ubuntu 24.04 LTS (или любая Linux с Docker) | Ubuntu 24.04 LTS |

Сервис использует ~300–500 МБ RAM. Нужен исходящий HTTPS/WSS (443) к `web.whatsapp.com`, `*.whatsapp.net`, `sheets.googleapis.com`, `oauth2.googleapis.com`, `api.telegram.org`. Входящие порты не нужны: HTTP-порт сервиса по умолчанию слушает только `127.0.0.1`. Часовой пояс сервера не важен, сервис сам работает по `Asia/Almaty`.

## 2. Установка Docker

На свежей Ubuntu под пользователем с `sudo`:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Перелогиньтесь по SSH и проверьте: `docker compose version`. Docker стартует при загрузке сервера, контейнер поднимается сам (`restart: unless-stopped`), после ребута ничего делать не нужно.

## 3. Получение кода

```bash
git clone <адрес репозитория> wa-group-sender
cd wa-group-sender
cp .env.example .env
mkdir -p secrets
```

| Путь | Что это |
| --- | --- |
| `.env` | настройки и секреты (не коммитится) |
| `secrets/google-service-account.json` | JSON-ключ сервисного аккаунта Google (не коммитится) |
| `templates/message.txt` | шаблон сообщения, меняется без пересборки |
| volumes `wa-bridge`, `wa-db`, `wa-logs`, `wa-qr` | сессия WhatsApp (whatsmeow, sqlite), база H2, логи, PNG с QR |

## 4. Заполнение .env

`nano .env`, минимум:

| Переменная | Что указать |
| --- | --- |
| `ADMIN_TOKEN` | длинная случайная строка: `openssl rand -hex 32`. Нужна для `/api/admin/*`, `/api/qr`, `/api/groups` |
| `MESSAGE_CONTACT` | контакт в конце каждого сообщения, например `Иван +7 7xx xxx xx xx`. Пусто — строка контакта не выводится |
| `SHEETS_SPREADSHEET_ID` | ID таблицы из адреса `https://docs.google.com/spreadsheets/d/<ID>/edit` |
| `SHEETS_SHEET_NAME` | имя листа с заявками (по умолчанию `Заявки`) |
| `GOOGLE_CREDENTIALS_PATH` | путь к ключу **внутри контейнера**: `/run/secrets/google-service-account.json` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS` | бот и chat_id получателей через запятую (раздел 6) |

Остальные переменные с безопасными дефолтами описаны в `.env.example`, полный список — `docs/PLAN.md`.

## 5. Ключ Google и тестовая таблица

**Сервисный аккаунт и ключ**

1. [Google Cloud Console](https://console.cloud.google.com/) → создайте проект (или выберите существующий).
2. «APIs & Services» → «Library» → **Google Sheets API** → «Enable».
3. «APIs & Services» → «Credentials» → «Create credentials» → «Service account». Имя любое, роли не нужны.
4. Откройте аккаунт → «Keys» → «Add key» → «Create new key» → JSON. Скачается файл.
5. Загрузите его на сервер:
   ```bash
   scp ./key.json user@server:~/wa-group-sender/secrets/google-service-account.json
   chmod 644 ~/wa-group-sender/secrets/google-service-account.json
   ```
6. Скопируйте email аккаунта: поле `client_email` в JSON, вида `name@project.iam.gserviceaccount.com`.

**Тестовая таблица из CSV**

1. [Google Таблицы](https://sheets.google.com) → «Пустая таблица». Переименуйте лист внизу в `Заявки` (или укажите своё имя в `SHEETS_SHEET_NAME`).
2. «Файл» → «Импортировать» → «Загрузка» → выберите `docs/test-sheet.csv` из репозитория.
3. «Место импорта»: **«Заменить текущий лист»**, «Тип разделителя»: «Запятая», снимите галочку «Преобразовать текст в числа, даты и формулы» → «Импортировать данные».
4. Проверьте: строка 1 — заголовки `ID, Маршрут, Дата / срочность, Машины и тоннаж, Груз, Фрахт, Доп. условия, Статус, Отправлено / всего, Завершено`, ниже три заявки (Калжат → Баку, Хоргос → Баку, Хоргос → Москва). Многострочные ячейки сохранились с переносами.
5. «Настройки доступа» → добавьте email сервисного аккаунта с ролью **«Редактор»** (без неё сервис не сможет писать статусы) → снимите «Уведомить».
6. ID таблицы из адреса → `SHEETS_SPREADSHEET_ID` в `.env`.

**Как менеджер работает с таблицей**

- Заполняет Маршрут, Дата / срочность, Машины и тоннаж, Груз, Фрахт (обязательные) и при желании Доп. условия. «Статус» оставляет пустым. ID можно не заполнять — сервис проставит следующий номер.
- В «Машины и тоннаж» и «Доп. условия» каждая строка ячейки (Alt+Enter / Ctrl+Enter) — отдельная строка сообщения. Пустые строки внутри ячейки отбрасываются.
- Дата и фрахт — свободный текст (`Срочно, груз готов`, `🔥🔥`, `450 000 ₸`), формат не проверяется.
- Новая строка подхватывается за `SHEETS_POLL_INTERVAL` (30 с). Статусы: `В очереди` → `Отправляется` → `Отправлено` (или `Ошибка: …`), «Отправлено / всего» вида `248 / 250`, «Завершено» вида `2026-10-05 14:20`.
- Пустое обязательное поле → `Ошибка: не заполнено Машины и тоннаж`, строка не отправляется. Исправьте поле и **очистите статус** — строка уйдёт в очередь.
- Одна заявка уходит в каждую группу один раз. Повторно та же строка (тот же ID) не рассылается. Скопированная строка с тем же ID получит `Ошибка: дубликат ID …`.

При старте сервис проверяет заголовки листа. Если какой-то колонки нет, в логе будет `SHEETS sheet "…" has no columns […]`, придёт алерт, а заявки не читаются, пока заголовки не исправлены. Сервис при этом не падает.

## 6. Telegram-алерты

1. В Telegram напишите [@BotFather](https://t.me/BotFather) → `/newbot` → токен → `TELEGRAM_BOT_TOKEN`.
2. Каждый получатель пишет боту любое сообщение (или добавьте бота в группу и напишите там).
3. chat_id: откройте `https://api.telegram.org/bot<ТОКЕН>/getUpdates`, найдите `"chat":{"id": ...}`. Для группы число отрицательное.
4. Все chat_id через запятую: `TELEGRAM_CHAT_IDS=111111111,222222222`. На тесте — заказчик ТЗ и разработчик. Клиентский чат добавляется к запуску дописыванием в этот список.
5. После запуска проверьте: `curl -X POST -H "X-Admin-Token: $TOKEN" localhost:8080/api/admin/test-alert` → `{"deliveredChats":2}`.

Алерт уходит каждому chat_id отдельно; если один чат недоступен, остальные всё равно получат сообщение. Поводы: ожидание QR, разлогин, исчерпание попыток переподключения, порог предупреждения риска, остановка по риску, блокировка номера, неверные заголовки или недоступность таблицы. Один и тот же алерт повторяется не чаще `NOTIFY_COOLDOWN` (15 мин).

## 7. Первый запуск и сканирование QR

Подготовьте телефон с **тестовым** номером:

- WhatsApp → Настройки → Чаты → включите **«Оставлять чаты в архиве»**. Иначе архивная группа разархивируется при новом сообщении и выпадет из рассылки.
- Переместите в архив все группы, в которые нужно рассылать.

Запуск:

```bash
cd ~/wa-group-sender
docker compose up -d --build
docker compose logs -f
```

Через ~10 секунд в логе появится QR-код из символов `█▀▄`. На телефоне: WhatsApp → Настройки → **Связанные устройства** → **Привязка устройства** → наведите камеру на QR в терминале. QR обновляется примерно раз в 20 секунд.

Если QR в терминале не сканируется, возьмите PNG:

```bash
TOKEN=$(grep ^ADMIN_TOKEN .env | cut -d= -f2)
curl -H "X-Admin-Token: $TOKEN" localhost:8080/api/qr -o qr.png
```

и скачайте его (`scp user@server:~/wa-group-sender/qr.png .`). Тот же PNG лежит в volume: `docker compose cp wa-group-sender:/data/qr/qr.png .`

После привязки в логе будет `SESSION state WAITING_QR -> CONNECTED`. Сессия хранится в volume `wa-bridge` и переживает `docker compose restart`, `down/up` и ребут сервера. Повторный QR не нужен, пока WhatsApp сам не разлогинит устройство. Через `GROUPS_INITIAL_SYNC_DELAY` (60 с) сервис синхронизирует группы и начинает рассылку.

## 8. Проверка после запуска

```bash
TOKEN=$(grep ^ADMIN_TOKEN .env | cut -d= -f2)
curl -s localhost:8080/api/health
curl -s -H "X-Admin-Token: $TOKEN" "localhost:8080/api/groups?activeOnly=true"
curl -s -X POST -H "X-Admin-Token: $TOKEN" -H "Content-Type: application/json" -d '{"id":"2"}' localhost:8080/api/admin/preview
```

`/api/health`:

| Поле | Значение |
| --- | --- |
| `session` | `CONNECTED`, `WAITING_QR`, `RECONNECTING`, `DISCONNECTED`, `LOGGED_OUT`, `BANNED` |
| `queueLength` | заявок в очереди и в процессе |
| `sentToday` | отправок в группы за текущие сутки (сброс в полночь по Алматы) |
| `warmupLimitToday`, `warmupDay` | лимит прогрева на сегодня (`null` — весь список) и день прогрева |
| `dispatcher` | `running`, `idle`, `paused`, `outside-window`, `daily-limit-reached`, `waiting-session`, `no-active-groups`, `stopped-by-risk` |
| `stoppedByRisk`, `riskEventsInWindow`, `pauseMultiplier` | мониторинг риска |
| `activeGroups` | сколько групп участвует в рассылке |

Сверьте `/api/groups` с папкой «Архив» на телефоне: активны только архивные группы, где номер участник и может писать.

`/api/admin/preview` возвращает готовый текст без отправки: по ID строки таблицы (`{"id":"2"}`) или по полям (`{"fields":{"Маршрут":"ХОРГОС → БАКУ","Дата / срочность":"Срочно, груз готов", ...}}`).

## 9. Логи

- Поток: `docker compose logs -f` (или `--since 1h`).
- Файл в volume с ротацией по размеру и дням (`LOG_MAX_FILE_SIZE`, `LOG_MAX_HISTORY_DAYS`, `LOG_TOTAL_SIZE_CAP`):
  ```bash
  docker compose exec wa-group-sender tail -f /data/logs/wa-group-sender.log
  ```

| Префикс | Что означает |
| --- | --- |
| `QUEUED request_id=…` | строка из таблицы поставлена в очередь |
| `PLAN request_id=… order=[…]` | перемешанный порядок групп для заявки |
| `PAUSE request_id=… pause_ms=…` | случайная пауза между группами / волнами |
| `SEND request_id=… group_jid=… status=SENT/FAILED/SKIPPED …` | каждая отправка — одна строка |
| `DONE request_id=…` | заявка завершена |
| `RISK type=… request_id=… group_jid=…` | каждый сигнал риска — одна строка |
| `RECOVERED_AS_SENT request_id=… group_jid=…` | после рестарта прерванная отправка засчитана как отправленная |
| `GROUP added/activated/deactivated/removed …` | изменения списка групп |
| `SHEETS …` | чтение таблицы, ошибки заголовков, отклонённые строки |
| `ALERT key=…` | отправленный алерт |
| `DISPATCHER state …` | смена состояния диспетчера |

Примеры: `docker compose logs | grep "SEND request_id=17 "`, `docker compose logs | grep RISK`.

## 10. Изменение лимитов, окна, прогрева, шаблона и контакта без пересборки

**Настройки** (`.env`): правите файл и пересоздаёте контейнер. Образ не пересобирается, сессия и прогресс сохраняются.

```bash
nano .env
docker compose up -d
```

| Что | Переменные |
| --- | --- |
| Контакт в сообщении | `MESSAGE_CONTACT` |
| Нумерация `1️⃣7️⃣` по ID | `MESSAGE_NUMBERING=true` |
| Рабочее окно | `DISPATCH_WINDOW_START=08:00`, `DISPATCH_WINDOW_END=20:00`, `DISPATCH_WEEKENDS_ENABLED=false` |
| Прогрев | `WARMUP_DAILY_LIMITS=45,80,120,170,220` (лимит на 1-й, 2-й… день от первой отправки; дальше весь список), `WARMUP_ENABLED` |
| Волны | `DISPATCH_WAVE_SIZE`, `DISPATCH_WAVE_PAUSE_MIN/MAX` |
| Паузы между группами | `DISPATCH_GROUP_PAUSE_MIN/MAX` |
| «Печатает» | `DISPATCH_TYPING_MIN/MAX` |
| Пороги риска | `RISK_WINDOW`, `RISK_WARN_THRESHOLD`, `RISK_CRITICAL_THRESHOLD`, `RISK_PAUSE_MULTIPLIER` |
| Опрос таблицы | `SHEETS_POLL_INTERVAL`, `SHEETS_PROGRESS_FLUSH_INTERVAL` |
| Синхронизация групп | `GROUPS_SYNC_INTERVAL` |
| Получатели алертов | `TELEGRAM_CHAT_IDS` |

Длительности пишутся как `30s`, `10m`, `1h`, `500ms`. Что не влезло в окно или суточный лимит, продолжится со следующей группы в следующее окно / сутки. Ориентир с дефолтами: одна заявка на 250 групп — около 5 часов.

**Шаблон**: правьте `templates/message.txt` на сервере (UTF-8). Перезапуск не нужен: файл читается для каждой новой заявки. Уже стоящие в очереди заявки уходят с текстом на момент постановки. Проверить результат — `POST /api/admin/preview`. Правила:

- `{Маршрут}`, `{Дата / срочность}`, `{Машины и тоннаж}`, `{Груз}`, `{Фрахт}`, `{Доп. условия}`, `{ID}`, `{Контакт}` (по названиям колонок; работают и заголовки из `SHEETS_COL_*`);
- строка шаблона с пустым полем удаляется целиком, двух пустых строк подряд не бывает;
- многострочная ячейка даёт несколько строк; текст строки шаблона вокруг плейсхолдера повторяется (`🚛 {Машины и тоннаж}` → `🚛` перед каждой машиной, `{Доп. условия}` без префикса — строки как ввёл менеджер);
- `*жирный*` и эмодзи передаются в WhatsApp как есть.

Дефолтный шаблон по образцу заказчика:

```
📍*{Маршрут}*

📅 *{Дата / срочность}*✅

🚛 {Машины и тоннаж}

📦 {Груз}
{Доп. условия}
💰 Фрахт {Фрахт}

📞 *{Контакт}*
```

Внеплановая синхронизация групп (например, после переноса групп в архив): `curl -X POST -H "X-Admin-Token: $TOKEN" localhost:8080/api/admin/groups/sync`.

## 11. Переключение на таблицу клиента

1. Выдайте email сервисного аккаунта доступ **«Редактор»** к таблице клиента.
2. В `.env`:
   - `SHEETS_SPREADSHEET_ID` — ID таблицы клиента, `SHEETS_SHEET_NAME` — имя листа;
   - `SHEETS_HEADER_ROW` — номер строки с заголовками;
   - `SHEETS_COL_*` — точный текст заголовка каждой колонки (регистр и лишние пробелы не важны). Например, если у клиента «Направление» вместо «Маршрут»: `SHEETS_COL_ROUTE=Направление`.
3. Если колонок «ID», «Статус», «Отправлено / всего», «Завершено» у клиента нет — добавьте их в лист (любое место, порядок колонок не важен).
4. `docker compose up -d` и `docker compose logs | grep SHEETS` → `SHEETS layout ok`.

ID заявок уникальны в пределах локальной БД. Если в таблице клиента нумерация начинается заново (1, 2, 3…), перед переключением очистите БД: `docker compose down && docker volume rm wa-group-sender_wa-db && docker compose up -d`. Сессия WhatsApp при этом сохраняется, но прогрев начнётся заново.

## 12. Остановка по риску и возобновление

Удаления номера из группы, ошибки отправки, разрывы сессии и разлогин пишутся в `risk_event`. В скользящем окне `RISK_WINDOW`:

- `RISK_WARN_THRESHOLD` сигналов → паузы умножаются на `RISK_PAUSE_MULTIPLIER`, приходит алерт;
- `RISK_CRITICAL_THRESHOLD` сигналов → рассылка останавливается (`dispatcher: stopped-by-risk`), приходит алерт. Остановка переживает рестарт.

Что делать: проверьте телефон (нет ли блокировки или предупреждений WhatsApp), посмотрите `docker compose logs | grep RISK`. Если всё в порядке:

```bash
curl -X POST -H "X-Admin-Token: $TOKEN" localhost:8080/api/admin/resume
```

После возобновления счётчик окна обнуляется, рассылка продолжается с места остановки. Ручная пауза: `POST /api/admin/pause`, снятие — тот же `/api/admin/resume`.

## 13. Что делать при разлогине

Если WhatsApp разлогинил устройство (или его удалили в «Связанных устройствах»), придёт алерт «WhatsApp разлогинил устройство». Сервис сам удалит старую сессию и перейдёт в ожидание QR.

1. `docker compose logs -f` — дождитесь нового QR (или скачайте PNG через `/api/qr`, раздел 7).
2. На телефоне: Связанные устройства → Привязка устройства → отсканируйте.
3. `/api/health` → `session: CONNECTED`. Очередь и прогресс сохранены в БД, рассылка продолжится с места остановки.

`BANNED` в логе — номер заблокирован, рассылка остановлена. Восстановление после бана в объём работ не входит.

При обрыве связи сервис переподключается сам (до `WATCHDOG_MAX_ATTEMPTS` попыток с растущей задержкой до `WATCHDOG_MAX_DELAY`), затем шлёт алерт и продолжает пробовать раз в `WATCHDOG_MAX_DELAY`.

## 14. HTTP API

| Метод | Путь | Токен | Назначение |
| --- | --- | --- | --- |
| GET | `/api/health` | нет | состояние сервиса (используется healthcheck Docker) |
| GET | `/api/qr` | да | PNG текущего QR (404, если QR не нужен) |
| GET | `/api/groups[?activeOnly=true]` | да | группы: JID, название, архив, участник, может писать, активна, последняя синхронизация |
| POST | `/api/admin/preview` | да | текст сообщения без отправки: `{"id":"17"}` или `{"fields":{...}}` |
| POST | `/api/admin/resume` | да | снять остановку по риску и ручную паузу |
| POST | `/api/admin/pause` | да | ручная пауза рассылки |
| POST | `/api/admin/groups/sync` | да | синхронизировать группы сейчас |
| POST | `/api/admin/test-alert` | да | тестовый алерт во все чаты |
| GET | `/api/admin/requests` | да | заявки в локальной БД |

Токен — заголовок `X-Admin-Token` (имя меняется через `ADMIN_TOKEN_HEADER`).

## 15. Тестовый прогон без номера (профиль fake)

Профиль `fake` подменяет WhatsApp и Google Sheets: 30 групп (3 не в архиве, 2 «пишут только админы»), таблица — три заявки из `docs/test-sheet.csv` (состояние сохраняется в volume), короткие паузы, круглосуточное окно.

```bash
cp .env.example .env
sed -i 's/^SPRING_PROFILES_ACTIVE=.*/SPRING_PROFILES_ACTIVE=fake/; s/^ADMIN_TOKEN=.*/ADMIN_TOKEN=fake/; s/^MESSAGE_CONTACT=.*/MESSAGE_CONTACT=Диспетчер (тест)/' .env
docker compose up -d --build
curl -s localhost:8080/api/health
curl -s -X POST -H "X-Admin-Token: fake" -H "Content-Type: application/json" -d '{"id":"2"}' localhost:8080/api/admin/preview
curl -s -H "X-Admin-Token: fake" localhost:8080/api/admin/fake/sheet
curl -s -H "X-Admin-Token: fake" localhost:8080/api/admin/fake/sent
curl -s -X POST -H "X-Admin-Token: fake" -H "Content-Type: application/json" \
  -d '{"Маршрут":"АЛМАТЫ → АСТАНА","Дата / срочность":"Завтра","Машины и тоннаж":"Тент 20 т","Груз":"Мука","Фрахт":"🔥"}' \
  localhost:8080/api/admin/fake/requests
docker compose down -v
```

`down -v` удаляет volumes фейкового прогона. Перед боевым запуском это обязательно, чтобы прогрев и ID начались с нуля.

## 16. Обновление, бэкап, разработка

Обновление: `git pull && docker compose up -d --build` (сессия и БД в volumes сохраняются).

Бэкап сессии и БД:

```bash
docker run --rm -v wa-group-sender_wa-bridge:/s -v wa-group-sender_wa-db:/d -v "$PWD":/b alpine \
  tar czf /b/backup-$(date +%F).tgz -C / s d
```

Разработка (нужен JDK 17+ для запуска Gradle, JDK 25 скачается автоматически; `wa-bridge` собирается только в Docker):

```bash
./gradlew build        # сборка и все тесты
./gradlew bootRun --args='--spring.profiles.active=fake --app.logging.dir=build/logs --spring.datasource.url=jdbc:h2:mem:dev --app.fake.sheet-state= --app.security.admin-token=dev'
```

Стек: Java 25, Spring Boot 4.1.1, Gradle 9.8.0, whatsmeow (Go 1.26, коммит закреплён в `bridge/Dockerfile`), H2 2.5.252 + Flyway 13.8.0, Google Sheets API v4.

## 17. CI/CD и стенд inkbpadev

Работаем только в `main`. `.github/workflows/ci.yml` на org-раннерах TOO-Inkar (`self-hosted, linux, x64`):

- `build` — `./gradlew build` (все тесты) на каждый push в `main`, PR и ручной запуск;
- `deploy` — только push в `main` (и ручной запуск на `main`) после зелёного `build`: проверенный коммит кладётся в `/srv/stands/wa-group-sender` (`git archive` + `rsync --delete`), дальше `deploy/inkbpadev/deploy.sh`.

`deploy.sh`: теги `wa-group-sender-<сервис>:rollback-<коммит>` на текущие образы `wa-group-sender` и `wa-bridge` → сборка → остановка → копия базы H2 в `/var/backups/wa-group-sender` (10 последних) → запуск → ожидание `"status":"UP"` от `/api/health`. Если стенд не поднялся, возвращаются прежние образы; если в коммите появились новые миграции — ещё и база из копии. Сессия WhatsApp (`wa-bridge`) не копируется и не откатывается; `wa-bridge` пересоздаётся, только если изменился его образ.

| Что | Где |
| --- | --- |
| Настройки и секреты | `/etc/wa-group-sender/.env` (root:gha-runner, 0640) |
| Ключ Google | `/etc/wa-group-sender/secrets/google-service-account.json` (`sudo install -m 0440 -o root -g 10001 key.json …`) |
| Стенд | `/srv/stands/wa-group-sender`, compose-проект `wa-group-sender` |
| HTTP | `http://10.10.1.132:8097` — системный nginx (`deploy/inkbpadev/nginx-wa-group-sender.conf`) → контейнер `127.0.0.1:8098` |

Подготовка сервера один раз: `sudo bash deploy/inkbpadev/setup-host.sh` из клона. Стенд стартует в профиле `fake`. Для боевого: в `/etc/wa-group-sender/.env` — `SPRING_PROFILES_ACTIVE=prod`, таблица, Telegram, ключ Google; затем перезапуск workflow или руками:

```bash
cd /srv/stands/wa-group-sender
docker compose -p wa-group-sender --env-file /etc/wa-group-sender/.env \
  -f docker-compose.yml -f deploy/inkbpadev/docker-compose.override.yml up -d
```

Шаблон `templates/message.txt` на стенде берётся из репозитория: правки прямо на сервере затрёт следующая выкладка.
