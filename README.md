# wa-group-sender

Сервис берёт новые заявки на грузоперевозки из Google Sheets и публикует их в WhatsApp-группы из папки «Архив» **отдельного тестового номера**. Подключение через WhatsApp Web (Linked Devices) без браузера, библиотека Cobalt. Отправка идёт в один поток, с волнами, случайными паузами, «печатает…», рабочим окном, прогревом и мониторингом риска.

> Способ неофициальный. Номер может быть заблокирован WhatsApp в любой момент. Сервис снижает вероятность блокировки, но не исключает её. Подключайте только отдельный номер.

Техническое задание — `docs/TZ.md`, план — `docs/PLAN.md`, отчёт спайка — `docs/spike-report.md`, принятые дефолты — `docs/open-questions.md`.

## Содержание

1. [Требования к VPS](#1-требования-к-vps)
2. [Установка Docker](#2-установка-docker)
3. [Получение кода](#3-получение-кода)
4. [Заполнение .env](#4-заполнение-env)
5. [Google Sheets: сервисный аккаунт и доступ к таблице](#5-google-sheets-сервисный-аккаунт-и-доступ-к-таблице)
6. [Telegram-алерты](#6-telegram-алерты)
7. [Первый запуск и сканирование QR](#7-первый-запуск-и-сканирование-qr)
8. [Проверка после запуска](#8-проверка-после-запуска)
9. [Логи](#9-логи)
10. [Изменение лимитов, окна, прогрева и шаблона без пересборки](#10-изменение-лимитов-окна-прогрева-и-шаблона-без-пересборки)
11. [Остановка по риску и возобновление](#11-остановка-по-риску-и-возобновление)
12. [Что делать при разлогине](#12-что-делать-при-разлогине)
13. [HTTP API](#13-http-api)
14. [Тестовый прогон без номера (профиль fake)](#14-тестовый-прогон-без-номера-профиль-fake)
15. [Обновление, бэкап, разработка](#15-обновление-бэкап-разработка)

## 1. Требования к VPS

| Параметр | Значение |
| --- | --- |
| ОС | Ubuntu 24.04 LTS (или любая Linux с Docker) |
| CPU / RAM / диск | 2 vCPU, 4 ГБ RAM, 40–50 ГБ SSD (сервис использует ~300–500 МБ RAM) |
| Сеть | Исходящий HTTPS/WSS (443) к `web.whatsapp.com`, `*.whatsapp.net`, `sheets.googleapis.com`, `oauth2.googleapis.com`, `api.telegram.org` |
| Входящие порты | Не нужны. HTTP-порт сервиса по умолчанию слушает только `127.0.0.1` |
| Часовой пояс | Не важен: сервис сам работает в `Asia/Almaty` |

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

Перелогиньтесь по SSH и проверьте: `docker compose version`.

Docker запускается при загрузке VPS, а контейнер поднимается сам благодаря `restart: unless-stopped`. После ребута VPS ничего делать не нужно.

## 3. Получение кода

```bash
git clone <адрес репозитория> wa-group-sender
cd wa-group-sender
cp .env.example .env
mkdir -p secrets
```

Структура на сервере:

| Путь | Что это |
| --- | --- |
| `.env` | настройки и секреты (не коммитится) |
| `secrets/google-service-account.json` | JSON-ключ сервисного аккаунта Google (не коммитится) |
| `templates/message.txt` | шаблон сообщения, меняется без пересборки |
| Docker volumes `wa-session`, `wa-db`, `wa-logs`, `wa-qr` | сессия WhatsApp, база H2, логи, PNG с QR |

## 4. Заполнение .env

Откройте `.env` (`nano .env`) и заполните как минимум:

| Переменная | Что указать |
| --- | --- |
| `ADMIN_TOKEN` | длинная случайная строка: `openssl rand -hex 32`. Нужна для `/api/admin/*`, `/api/qr`, `/api/groups` |
| `SHEETS_SPREADSHEET_ID` | ID таблицы из адреса `https://docs.google.com/spreadsheets/d/<ID>/edit` |
| `SHEETS_SHEET_NAME` | имя листа с заявками (по умолчанию `Заявки`) |
| `GOOGLE_CREDENTIALS_PATH` | путь к ключу **внутри контейнера**: `/run/secrets/google-service-account.json` (папка `./secrets` монтируется в `/run/secrets`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | бот и чат для алертов (раздел 6) |

Остальные переменные имеют безопасные дефолты и описаны в `.env.example`. Полный список с пояснениями — `docs/PLAN.md`, раздел «Конфиг-параметры».

## 5. Google Sheets: сервисный аккаунт и доступ к таблице

1. Откройте [Google Cloud Console](https://console.cloud.google.com/), создайте проект (или выберите существующий).
2. «APIs & Services» → «Library» → найдите **Google Sheets API** → «Enable».
3. «APIs & Services» → «Credentials» → «Create credentials» → «Service account». Имя любое, роли не нужны.
4. Откройте созданный аккаунт → вкладка «Keys» → «Add key» → «Create new key» → JSON. Скачается файл.
5. Загрузите файл на VPS в `secrets/google-service-account.json`:
   ```bash
   scp ./key.json user@vps:~/wa-group-sender/secrets/google-service-account.json
   chmod 644 ~/wa-group-sender/secrets/google-service-account.json
   ```
6. Скопируйте email сервисного аккаунта (вида `name@project.iam.gserviceaccount.com`, есть в JSON в поле `client_email`).
7. Откройте таблицу → «Настройки доступа» → добавьте этот email с ролью **«Редактор»**. Без роли «Редактор» сервис не сможет писать статусы.

Формат листа по умолчанию (строка 1 — заголовки, заявки со строки 2):

| A | B | C | D | E | F | G | H | I |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ID | Маршрут | Тоннаж | Груз | Дата | Фрахт | Статус | Отправлено / всего | Завершено |

- Менеджер заполняет B–F и оставляет «Статус» пустым. ID можно не заполнять — сервис сгенерирует.
- Новая строка подхватывается за время `SHEETS_POLL_INTERVAL` (30 с). Статусы: `В очереди` → `Отправляется` → `Отправлено` (или `Ошибка: …`).
- Пустое обязательное поле → статус `Ошибка: не заполнено Тоннаж, Фрахт`, строка не отправляется. Исправьте поле и **очистите статус** — строка уйдёт в очередь.
- Если порядок колонок другой — поменяйте буквы в `SHEETS_COL_*` в `.env`.
- Не копируйте строки вместе с ID: копия получит статус `Ошибка: дубликат ID …`.

## 6. Telegram-алерты

1. В Telegram напишите [@BotFather](https://t.me/BotFather) → `/newbot` → получите токен → `TELEGRAM_BOT_TOKEN`.
2. Напишите своему боту любое сообщение (или добавьте бота в группу администраторов и напишите там).
3. Узнайте chat_id: откройте `https://api.telegram.org/bot<ТОКЕН>/getUpdates`, найдите `"chat":{"id": ...}` → `TELEGRAM_CHAT_ID` (для группы число отрицательное).
4. После запуска проверьте канал: `curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" localhost:8080/api/admin/test-alert`.

Алерты приходят при: ожидании QR, разлогине, исчерпании попыток переподключения, пороге предупреждения риска, остановке по риску, блокировке номера, долгой недоступности Google Sheets.

Email вместо (или вместе с) Telegram: `NOTIFY_CHANNEL=email` (или `telegram,email`), заполните `NOTIFY_EMAIL_FROM`, `NOTIFY_EMAIL_TO` и раскомментируйте `SPRING_MAIL_*` в `.env`.

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

Через ~10 секунд в логе появится QR-код из символов `█▀▄`. На телефоне: WhatsApp → Настройки → **Связанные устройства** → **Привязка устройства** → наведите камеру на QR в терминале. QR обновляется примерно раз в 20 секунд, в лог выводится каждый новый.

Если QR в терминале не сканируется, возьмите PNG:

```bash
curl -H "X-Admin-Token: $(grep ^ADMIN_TOKEN .env | cut -d= -f2)" localhost:8080/api/qr -o qr.png
```

и скачайте его на свой компьютер (`scp user@vps:~/wa-group-sender/qr.png .`). Второй вариант — SSH-туннель: `ssh -L 8080:127.0.0.1:8080 user@vps` и открыть `http://localhost:8080/api/qr` с заголовком токена (например, через расширение ModHeader). Тот же PNG лежит в volume: `docker compose cp wa-group-sender:/data/qr/qr.png .`

После привязки в логе будет `SESSION state WAITING_QR -> CONNECTED`. Сессия хранится в volume `wa-session` и переживает `docker compose restart`, `docker compose down/up` и ребут VPS — повторный QR не нужен, пока WhatsApp сам не разлогинит устройство.

Через `GROUPS_INITIAL_SYNC_DELAY` (60 с) после подключения сервис синхронизирует группы и начинает рассылку.

## 8. Проверка после запуска

```bash
TOKEN=$(grep ^ADMIN_TOKEN .env | cut -d= -f2)
curl -s localhost:8080/api/health
curl -s -H "X-Admin-Token: $TOKEN" localhost:8080/api/groups?activeOnly=true
```

`/api/health`:

| Поле | Значение |
| --- | --- |
| `session` | `CONNECTED`, `WAITING_QR`, `RECONNECTING`, `DISCONNECTED`, `LOGGED_OUT`, `BANNED` |
| `queueLength` | заявок в очереди и в процессе |
| `sentToday` | отправок в группы за текущие сутки (Алматы) |
| `warmupLimitToday`, `warmupDay` | лимит прогрева на сегодня (`null` — без лимита) и день прогрева |
| `dispatcher` | `running`, `idle`, `paused`, `outside-window`, `daily-limit`, `waiting-session`, `no-active-groups`, `stopped-by-risk` |
| `stoppedByRisk`, `riskEventsInWindow`, `pauseMultiplier` | состояние мониторинга риска |
| `activeGroups` | сколько групп участвует в рассылке |

Сверьте `/api/groups` с папкой «Архив» на телефоне: активны только архивные группы, где номер участник и может писать. Поля `member`/`canSend` проверяются только для архивных групп.

## 9. Логи

- Поток: `docker compose logs -f` (или `docker compose logs --since 1h`).
- Файл в volume с ротацией по размеру и дням (`LOG_MAX_FILE_SIZE`, `LOG_MAX_HISTORY_DAYS`, `LOG_TOTAL_SIZE_CAP`):
  ```bash
  docker compose exec wa-group-sender tail -f /data/logs/wa-group-sender.log
  docker compose exec wa-group-sender ls /data/logs
  ```

Ключевые строки (одна строка — одно событие, время по Алматы):

| Префикс | Что означает |
| --- | --- |
| `QUEUED request_id=…` | строка из таблицы поставлена в очередь |
| `PLAN request_id=… order=[…]` | перемешанный порядок групп для заявки |
| `PAUSE request_id=… pause_ms=…` | случайная пауза между группами / волнами |
| `SEND request_id=… group_jid=… status=SENT/FAILED/SKIPPED …` | каждая отправка |
| `DONE request_id=…` | заявка завершена |
| `RISK type=… request_id=… group_jid=…` | сигнал риска |
| `RECOVERED_AS_SENT request_id=… group_jid=…` | после рестарта прерванная отправка засчитана как отправленная |
| `GROUP added/activated/deactivated/removed …` | изменения списка групп |
| `ALERT key=…` | отправленный алерт |
| `DISPATCHER state …` | смена состояния диспетчера |

Примеры: `docker compose logs | grep "SEND request_id=R260928-ABCDE"`, `docker compose logs | grep RISK`.

## 10. Изменение лимитов, окна, прогрева и шаблона без пересборки

**Настройки** (`.env`) — правите файл и пересоздаёте контейнер, образ не пересобирается, сессия и прогресс сохраняются:

```bash
nano .env
docker compose up -d
```

| Что | Переменные |
| --- | --- |
| Рабочее окно | `DISPATCH_WINDOW_START=08:00`, `DISPATCH_WINDOW_END=21:00`, `DISPATCH_WEEKENDS_ENABLED=true` |
| Прогрев | `WARMUP_DAILY_LIMITS=50,100,150,250` (лимит на 1-й, 2-й… день от первой отправки; дальше без лимита), `WARMUP_ENABLED` |
| Волны | `DISPATCH_WAVE_SIZE`, `DISPATCH_WAVE_PAUSE_MIN/MAX` |
| Паузы между группами | `DISPATCH_GROUP_PAUSE_MIN/MAX` |
| «Печатает» | `DISPATCH_TYPING_MIN/MAX` |
| Пороги риска | `RISK_WINDOW`, `RISK_WARN_THRESHOLD`, `RISK_CRITICAL_THRESHOLD`, `RISK_PAUSE_MULTIPLIER` |
| Опрос таблицы | `SHEETS_POLL_INTERVAL`, `SHEETS_PROGRESS_FLUSH_INTERVAL` |
| Синхронизация групп | `GROUPS_SYNC_INTERVAL` |

Длительности пишутся как `30s`, `10m`, `1h`, `500ms`.

Ориентир по скорости с дефолтами: одна заявка на 250 групп — 10 волн, ~9 пауз по 10–20 мин + ~240 пауз по 20–60 с + «печатает» — около 5 часов. Что не влезло в окно или суточный лимит, продолжится со следующей группы в следующее окно/сутки.

**Шаблон** — правите `templates/message.txt` на хосте. Перезапуск не нужен: файл читается заново для каждой новой заявки (заявки, уже стоящие в очереди, отправляются с текстом на момент постановки). Плейсхолдеры: `{{id}}`, `{{route}}`, `{{tonnage}}`, `{{cargo}}`, `{{date}}`, `{{freight}}` или русские `{{маршрут}}`, `{{тоннаж}}`, `{{груз}}`, `{{дата}}`, `{{фрахт}}`. Файл — UTF-8, эмодзи и `*жирный*` WhatsApp поддерживаются.

Внеплановая синхронизация групп (например, после переноса групп в архив): `curl -X POST -H "X-Admin-Token: $TOKEN" localhost:8080/api/admin/groups/sync`.

## 11. Остановка по риску и возобновление

Каждое удаление номера из группы, ошибка отправки, разрыв сессии, разлогин записываются в `risk_event`. В скользящем окне `RISK_WINDOW`:

- `RISK_WARN_THRESHOLD` сигналов → паузы умножаются на `RISK_PAUSE_MULTIPLIER`, приходит алерт;
- `RISK_CRITICAL_THRESHOLD` сигналов → рассылка останавливается (`dispatcher: stopped-by-risk`), приходит алерт. Остановка переживает рестарт.

Что делать: проверьте телефон (не заблокирован ли номер, нет ли предупреждений WhatsApp), посмотрите `docker compose logs | grep RISK`. Если всё в порядке, возобновите:

```bash
curl -X POST -H "X-Admin-Token: $TOKEN" localhost:8080/api/admin/resume
```

После возобновления счётчик окна обнуляется, рассылка продолжается с места остановки. Ручная пауза без риска: `POST /api/admin/pause`, снятие — тот же `/api/admin/resume`.

## 12. Что делать при разлогине

Если WhatsApp разлогинил устройство (или его удалили в «Связанных устройствах» на телефоне), придёт алерт «WhatsApp разлогинил устройство». Сервис сам удалит старую сессию и перейдёт в ожидание QR.

1. `docker compose logs -f` — дождитесь нового QR (или скачайте PNG через `/api/qr`, раздел 7).
2. На телефоне: Связанные устройства → Привязка устройства → отсканируйте.
3. Проверьте `/api/health` → `session: CONNECTED`. Очередь и прогресс сохранены в БД, рассылка продолжится с места остановки.

Если в логе `BANNED` — номер заблокирован, рассылка остановлена. Восстановление после бана в объём работ не входит.

При обрыве связи сервис сам переподключается (до `WATCHDOG_MAX_ATTEMPTS` попыток с растущей задержкой до `WATCHDOG_MAX_DELAY`), затем шлёт алерт и продолжает пробовать раз в `WATCHDOG_MAX_DELAY`.

## 13. HTTP API

| Метод | Путь | Токен | Назначение |
| --- | --- | --- | --- |
| GET | `/api/health` | нет | состояние сервиса (используется healthcheck Docker) |
| GET | `/api/qr` | да | PNG текущего QR (404, если QR не нужен) |
| GET | `/api/groups[?activeOnly=true]` | да | список групп: JID, название, архив, участник, может писать, активна, последняя синхронизация |
| POST | `/api/admin/resume` | да | снять остановку по риску и ручную паузу |
| POST | `/api/admin/pause` | да | ручная пауза рассылки |
| POST | `/api/admin/groups/sync` | да | синхронизировать группы сейчас |
| POST | `/api/admin/test-alert` | да | отправить тестовый алерт |
| GET | `/api/admin/requests` | да | заявки в локальной БД |

Токен передаётся заголовком `X-Admin-Token` (имя меняется через `ADMIN_TOKEN_HEADER`).

## 14. Тестовый прогон без номера (профиль fake)

Профиль `fake` подменяет WhatsApp и Google Sheets на фейки: 30 групп (3 не в архиве, 2 «только админы»), таблица в памяти с одной заявкой, короткие паузы, круглосуточное окно.

```bash
cp .env.example .env
sed -i 's/^SPRING_PROFILES_ACTIVE=.*/SPRING_PROFILES_ACTIVE=fake/; s/^ADMIN_TOKEN=.*/ADMIN_TOKEN=fake/' .env
docker compose up -d --build
curl -s localhost:8080/api/health
curl -s -X POST -H "X-Admin-Token: fake" -H "Content-Type: application/json" \
  -d '{"route":"Алматы — Астана","tonnage":"20 т","cargo":"Цемент","date":"01.10.2026","freight":"500 000 ₸"}' \
  localhost:8080/api/admin/fake/requests
curl -s -H "X-Admin-Token: fake" localhost:8080/api/admin/fake/sheet
curl -s -H "X-Admin-Token: fake" localhost:8080/api/admin/fake/sent
docker compose down -v
```

`down -v` удаляет volumes фейкового прогона — перед боевым запуском обязательно, чтобы счётчики прогрева начались с нуля.

## 15. Обновление, бэкап, разработка

Обновление кода: `git pull && docker compose up -d --build` (сессия и БД в volumes сохраняются).

Бэкап сессии и БД:

```bash
docker run --rm -v wa-group-sender_wa-session:/s -v wa-group-sender_wa-db:/d -v "$PWD":/b alpine \
  tar czf /b/backup-$(date +%F).tgz -C / s d
```

Разработка (нужен только JDK 17+ для запуска Gradle, JDK 25 скачается автоматически):

```bash
./gradlew build        # сборка и все тесты
./gradlew spike        # живая проверка Cobalt: handshake с WhatsApp Web и получение QR
./gradlew bootRun --args='--spring.profiles.active=fake --app.logging.dir=build/logs --spring.datasource.url=jdbc:h2:mem:dev --app.security.admin-token=dev'
```

Стек: Java 25, Spring Boot 4.1.1, Gradle 9.8.0, Cobalt 0.0.10, H2 2.5.252 + Flyway 13.8.0, Google Sheets API v4.
