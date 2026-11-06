# wa-group-sender

Сервис рассылает заявки на грузоперевозки в WhatsApp-группы. Менеджер создаёт заявку в веб-админке, выбирает группы и время, сервис отправляет её в один поток с паузами, лимитами, рабочим окном и прогревом номера. Подключение — через WhatsApp Web («Связанные устройства») без браузера: клиент на Go-библиотеке [whatsmeow](https://github.com/tulir/whatsmeow) работает отдельным контейнером `wa-bridge` (`bridge/`), Java-сервис обращается к нему по HTTP внутри compose-сети.

Платформа многокабинетная: у каждого кабинета свой номер, свои группы, заявки, настройки и база; номер кабинета может выходить в интернет через свой прокси. Кабинетами управляет суперадмин на отдельном адресе.

> Способ неофициальный. Номер может быть заблокирован WhatsApp в любой момент. Сервис снижает вероятность блокировки, но не исключает её. Подключайте только отдельный номер.

Бой: **https://wa-group-sender.bid** (кабинеты), **https://admin.wa-group-sender.bid** (суперадмин, за Cloudflare Access).

Документы: устройство кода — `docs/PLAN.md`, решённые и открытые вопросы — `docs/open-questions.md`, исходное ТЗ — `docs/TZ.md`, спайк — `docs/spike-report.md`, админка — `frontend/README.md`, `frontend/DESIGN.md`.

## Содержание

1. [Устройство](#1-устройство)
2. [Работа в админке](#2-работа-в-админке)
3. [Как идёт рассылка](#3-как-идёт-рассылка)
4. [Настройки: админка и .env](#4-настройки-админка-и-env)
5. [Вход, кабинеты, суперадмин](#5-вход-кабинеты-суперадмин)
6. [Боевой сервер](#6-боевой-сервер)
7. [Установка с нуля](#7-установка-с-нуля)
8. [Telegram-уведомления](#8-telegram-уведомления)
9. [Проверка и логи](#9-проверка-и-логи)
10. [Шаблон сообщения](#10-шаблон-сообщения)
11. [Риск, разлогин, бан](#11-риск-разлогин-бан)
12. [Google Sheets (необязательно)](#12-google-sheets-необязательно)
13. [HTTP API](#13-http-api)
14. [Профиль fake, разработка, CI](#14-профиль-fake-разработка-ci)

## 1. Устройство

| Часть | Что делает |
| --- | --- |
| `wa-group-sender` (Java 25, Spring Boot) | API, диспетчер рассылки, расписание заявок, отчёты, автоответчик, Telegram-бот. Отдаёт админку |
| `frontend/` (React, Vite) | админка; собирается в том же Docker-образе и кладётся в статику Spring Boot |
| `wa-bridge` (Go, whatsmeow) | сессии WhatsApp всех кабинетов в одном контейнере, у каждой свой прокси. Наружу не публикуется, авторизации у него нет |
| H2 + Flyway | `platform` — кабинеты, пользователи, журнал; у каждого кабинета своя база (`wasender` у основного, `t<id>` у остальных) |

## 2. Работа в админке

Разделы кабинета: **Заявки**, **Группы**, **Подключение**, **Настройки**.

**Подключение.** Пока номер не привязан, на странице QR. На телефоне: WhatsApp → Настройки → Связанные устройства → Привязка устройства → наведите камеру. QR обновляется примерно раз в 20 секунд, страница подхватывает новый сама. До привязки включите на телефоне «Оставлять чаты в архиве» и уберите в «Архив» группы для рассылки.

**Группы.** В рассылке только группы из «Архива», где номер участник и может писать (не «пишут только админы», не сообщество, не больше `GROUPS_MAX_PARTICIPANTS`). «Обновить» — синхронизация сейчас (сама она идёт раз в час). Отметьте группы галочками → «Заявка в отмеченные» или «Новый список». Списки групп («Китай», «Россия»…) создаются и правятся здесь. Группу, куда WhatsApp трижды подряд не пропустил сообщение, сервис исключает; «Сбросить» возвращает её в рассылку.

**Новая заявка** («Заявки» → «+ Заявка»):

1. Сообщение: «По полям» (Маршрут, Дата / срочность, Машины и тоннаж, Груз, Фрахт — обязательные, Доп. условия) или «Готовый текст». «+ ещё заявка в это же сообщение» — несколько заявок одним сообщением. «Контакт в конце» — своя строка контакта. Справа предпросмотр «Как увидят в WhatsApp».
2. **Куда**: «Все группы» (все в рассылке), «Список» или «Выбрать» конкретные группы.
3. **Когда**: «Сейчас», «Один раз» в заданное время, «Ежедневно» в заданное время, «Повтор» каждые N минут с … до …. У повторяющейся заявки можно добавить до 3 доп. времён в день и отметить «первую рассылку — сразу». «Слать и вне рабочего окна» снимает рабочее окно для этой заявки.
4. «Отправить» / «Запланировать».

**Карточка заявки**: текст, кому, когда, следующий запуск; кнопки «Изменить», «Отправить сейчас», «Выключить» (останавливает идущую рассылку и повторы), «Включить расписание», «Удалить» (история остаётся в отчётах). Ниже результаты: выбор запуска, итоги (всего, отправлено, ждёт, ошибки, пропущено), список групп со статусом, поиск, постраничный вывод (10/25/50/100 на странице). Если рассылка не идёт, сверху написано почему: рабочее окно, лимит, пауза, нет подключения, группы отложены до HH:MM. «Повторить ошибки» отправляет завершённый запуск заново только туда, где была ошибка.

**Отчёт** («Заявки» → «Отчёт»): за сегодня, 7 или 30 дней или свой период (до 366 дней), Excel (листы Сводка, Заявки, Отправки, Группы) или PDF. Отчёт по одной заявке — из её карточки.

**Настройки**: цифры дня (отправлено сегодня, за час, рассылок в работе, групп в рассылке, сигналы риска), пауза / возобновление рассылки, «Рабочее окно и лимиты» (раздел 4), автоответчик, уведомления в Telegram, смена пароля.

## 3. Как идёт рассылка

- **Один поток на кабинет.** Идущие заявки обслуживаются по кругу: одна отправка из заявки, следующая — из другой. Порядок групп внутри заявки перемешивается при первом запуске.
- **Паузы** между группами — случайно в диапазоне «от–до» (дробные секунды), отсчёт от **начала** предыдущей отправки, так что время самой отправки входит в паузу. После каждой волны (`размер волны` групп) — длинная пауза. При предупреждении риска паузы умножаются на `RISK_PAUSE_MULTIPLIER`.
- **Интервал для группы** («не чаще раза в N мин», по умолчанию 60): тот же текст в ту же группу не уходит повторно раньше чем через 75–100 % интервала (для 60 мин — 45–60 мин). Разные тексты друг друга не задерживают. Отложенная группа ждёт, остальные идут дальше.
- **Ждать ответа** («только если после нашего сообщения в группе кто-то написал»): если последнее сообщение в группе — наше с тем же текстом, отправка откладывается и проверяется каждые 10 минут. Если до конца рабочего окна (или до следующего дня) никто не написал — группа пропускается.
- **Отказ WhatsApp** (сервер отклонил отправку в группу): до 2 повторов через 20–30 минут, потом ошибка; это не сигнал риска. После 3 таких ошибок подряд (успешная отправка сбрасывает счёт) группа исключается из рассылки.
- **Ворота** перед каждой отправкой: остановка по риску, ручная пауза, подключение, дневной лимит (прогрев или постоянный), лимит в час (считаются все попытки за последние 60 минут), рабочее окно заявки.
- **Расписание.** Проверка каждые 30 секунд. Запуск по расписанию сдвигается на случайные 1–5 минут (`CAMPAIGN_START_JITTER_*`). Если к следующему запуску предыдущий ещё не закончился, его остаток закрывается («перенесено в следующий запуск»). Окно запуска — с первого времени заявки до её конца или конца общего окна; «Сейчас» шлёт в общем окне.
- **Прогрев**: лимиты на 1-й, 2-й… день от первой отправки (`WARMUP_DAILY_LIMITS=45,80,120,170,220`), дальше — постоянный дневной лимит или без лимита.
- **Рестарт** посреди отправки: доставка в статусе «отправляется» засчитывается как отправленная (дубль хуже пропуска), в логе `RECOVERED_AS_SENT`.
- Заявка «Отправлено», если ушла хотя бы в одну группу; иначе «Ошибка: не отправлено ни в одну группу».

Пропускная способность: замер на проде — около **1500 сообщений в час** при паузе между группами 1,5–2,5 с. Реальную скорость ограничивают лимит в час, дневной лимит, волны и правило интервала для группы.

## 4. Настройки: админка и .env

Переменные `.env` — значения по умолчанию. Всё из таблицы ниже меняется в админке («Настройки» → «Рабочее окно и лимиты», «Автоответчик»), хранится в базе кабинета (`app_setting`) и действует сразу, без рестарта. Изменённое в админке значение важнее `.env`.

| В админке | Переменная по умолчанию | Дефолт |
| --- | --- | --- |
| Рабочее окно с / до, рассылать в выходные | `DISPATCH_WINDOW_START`, `DISPATCH_WINDOW_END`, `DISPATCH_WEEKENDS_ENABLED` | 08:00–20:00, нет |
| Лимит в час / в день (0 — без лимита) | `HOURLY_SEND_LIMIT`, `DAILY_SEND_LIMIT` | 120 / 0 |
| Прогрев нового номера (вкл/выкл) | `WARMUP_ENABLED` | да |
| Группе не чаще раза в, мин | `GROUP_SEND_INTERVAL` | 60m |
| Только если после нашего сообщения кто-то написал | `WAIT_FOR_REPLY` | да |
| Пауза между группами от / до, с | `DISPATCH_GROUP_PAUSE_MIN/MAX` | 20s / 60s |
| Волна, групп; пауза между волнами от / до, мин | `DISPATCH_WAVE_SIZE`, `DISPATCH_WAVE_PAUSE_MIN/MAX` | 25; 10m / 20m |
| Автоответчик: вкл, отклонять звонки, не чаще раза в N ч, текст | `AUTOREPLY_ENABLED`, `AUTOREPLY_REJECT_CALLS`, `AUTOREPLY_COOLDOWN`, `AUTOREPLY_TEXT` | да, да, 12h, стандартный текст |

Только в `.env` (правка → `docker compose up -d`, на бою `scripts/wa.sh up -d`):

| Что | Переменные |
| --- | --- |
| Секреты и вход | `ADMIN_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_TTL` (раздел 5) |
| Суперадмин и Cloudflare Access | `PLATFORM_HOST`, `PLATFORM_APP_URL`, `PLATFORM_ADMIN_USERNAME`, `PLATFORM_ADMIN_PASSWORD_HASH`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` |
| Прокси обязателен для новых кабинетов | `APP_TENANCY_REQUIRE_PROXY` (по умолчанию `true`) |
| Схема прогрева | `WARMUP_DAILY_LIMITS` |
| Пороги риска | `RISK_WINDOW`, `RISK_WARN_THRESHOLD`, `RISK_CRITICAL_THRESHOLD`, `RISK_PAUSE_MULTIPLIER` |
| Контакт по умолчанию, нумерация, шаблон | `MESSAGE_CONTACT`, `MESSAGE_NUMBERING`, `MESSAGE_TEMPLATE_PATH` |
| Группы | `GROUPS_SYNC_INTERVAL`, `GROUPS_MAX_PARTICIPANTS` (0 — без предела; большие группы WhatsApp отклоняет с ошибкой 479), `GROUPS_INITIAL_SYNC_DELAY` |
| Сдвиг старта по расписанию | `CAMPAIGN_START_JITTER_MIN/MAX` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`, `NOTIFY_COOLDOWN` |
| Переподключение | `WATCHDOG_*` |
| Логи | `LOG_MAX_FILE_SIZE`, `LOG_MAX_HISTORY_DAYS`, `LOG_TOTAL_SIZE_CAP` |

Полный список с безопасными значениями — `.env.example`. Длительности пишутся как `500ms`, `30s`, `10m`, `1h`.

## 5. Вход, кабинеты, суперадмин

- Вход по логину и паролю, сессия — HttpOnly-cookie, подписанная `ADMIN_TOKEN` (без него вход не работает), живёт `ADMIN_SESSION_TTL` (30 дней). 10 неудачных попыток за 10 минут с одного IP или на один логин — пауза 10 минут.
- При первом старте создаётся основной кабинет «Кабинет 1» и пользователь `ADMIN_USERNAME` с паролем по хэшу `ADMIN_PASSWORD_HASH` (bcrypt: `htpasswd -nbBC 12 admin 'пароль' | cut -d: -f2`, в `.env` — в одинарных кавычках).
- Если заданы `PLATFORM_ADMIN_USERNAME` и `PLATFORM_ADMIN_PASSWORD_HASH`, суперадмин — отдельная учётная запись, а `ADMIN_USERNAME` становится обычным пользователем основного кабинета. С `PLATFORM_HOST` суперадмин входит только на этом адресе, пользователи кабинетов — только на основном.
- Платформа (`/platform`, API `/api/platform`) доступна только суперадмину, только на `PLATFORM_HOST` и, если заданы `CF_ACCESS_TEAM_DOMAIN` и `CF_ACCESS_AUD`, только с валидным JWT Cloudflare Access (`Cf-Access-Jwt-Assertion`). На бою nginx пускает на admin-адрес только IP Cloudflare.
- Суперадмин: «Кабинеты» — создать кабинет (название, первый логин и пароль, прокси), переименовать, заблокировать / разблокировать (номер отключается), удалить (кроме основного, с подтверждением названием), пользователи кабинета, проверка прокси, «Войти в кабинет» одноразовой ссылкой (`PLATFORM_APP_URL/api/auth/enter?code=…`). «Журнал» — входы и действия.
- **Прокси на номер**: `socks5://логин:пароль@хост:порт` (также `http`, `https`). При `APP_TENANCY_REQUIRE_PROXY=true` номер нового кабинета без прокси не подключается; основной кабинет подключается напрямую. Смена прокси переподключает номер. В интерфейсе и журнале прокси показывается без логина и пароля.
- `X-Admin-Token: <ADMIN_TOKEN>` в заголовке — доступ суперадмина для скриптов; кабинет выбирается заголовком `X-Tenant: <id>` (без него — основной).

## 6. Боевой сервер

Домен https://wa-group-sender.bid, всё в `/home/ubuntu/wa-bot`:

| Путь | Что это |
| --- | --- |
| `app/` | выкаченный код (клон `main`), меняет только `autodeploy.sh`. Руками не править: автодеплой увидит изменения и остановится |
| `.env` | настройки и секреты (0600) |
| `compose.override.yml` | bind-mount в `data/`, лимиты памяти, `cap_drop`, DNS |
| `data/db`, `data/bridge`, `data/qr`, `data/pictures`, `logs/` | базы H2, сессии WhatsApp, QR, аватары групп, логи |
| `templates/message.txt` | шаблон сообщения |
| `secrets/` | ключ Google (если включены таблицы) |
| `backups/` | архивы и `backup.log` |
| `nginx/` | конфиги nginx (подключены из системного nginx) |
| `systemd/` | `wa-autodeploy.timer` (раз в минуту), `wa-cloudflare-ips.timer` (раз в неделю) |

**`scripts/wa.sh`** — единственный способ звать compose на бою (проект `wa-group-sender`, `app/docker-compose.yml` + `compose.override.yml` + `.env`):

```bash
scripts/wa.sh ps | logs -f --tail 100 | up -d | restart wa-group-sender   # любые аргументы docker compose
scripts/wa.sh health    # /api/health с сервера
scripts/wa.sh qr        # PNG с QR в /home/ubuntu/wa-bot/qr.png
scripts/wa.sh update [--no-ci]   # выкатить main сейчас (то же, что autodeploy.sh)
```

**`scripts/autodeploy.sh`** (systemd-таймер раз в минуту, журнал `journalctl -u wa-autodeploy`):

1. Если `app/` изменён руками, не на `main` или не на выкаченном коммите — алерт и ожидание.
2. `git fetch`; новый коммит должен продолжать выкаченный, иначе алерт и ожидание.
3. Ждёт зелёный CI GitHub для коммита (джобы build, frontend, e2e); красный — алерт, не выкатывает; CI дольше 2 часов — алерт.
4. Ставит теги `:rollback` на текущие образы, собирает новые (старая версия работает), при новых миграциях — останавливает контейнеры и делает бэкап, `up -d`, ждёт healthy обоих контейнеров и `"status":"UP"` (до 5 минут).
5. Успех — алерт «выкачено». Сбой — откат образов и кода, при миграциях — база из бэкапа, коммит помечается и больше не выкатывается.

Каждый этап пишется в GitHub Deployments (environment `production`); джоба CI «Deploy to production» показывает их как свой лог. `autodeploy.sh`, `backup.sh` и ручной `update` берут одну блокировку `.ops.lock`.

**`scripts/backup.sh`** (cron 03:30): останавливает контейнеры ради целостных H2 и SQLite, архивирует `data/` (без аватаров), `.env`, `templates`, `secrets`, `nginx` в `backups/wa-<дата>.tgz` (0600, 14 последних), проверяет архив, поднимает контейнеры, выгружает копию в зашифрованный rclone-remote `gdrive-crypt:` (60 дней). Сбой — алерт. Восстановление: `scripts/wa.sh down`, под root распаковать архив поверх `/home/ubuntu/wa-bot`, `scripts/wa.sh up -d` (старая сессия WhatsApp может попросить новый QR).

**nginx**: TLS Let's Encrypt, `wa-group-sender.bid` и `admin.wa-group-sender.bid` (только с IP Cloudflare, список обновляет `scripts/cloudflare-ips.sh`), лимиты запросов (вход — 10 в минуту), кэш статики, страница обслуживания на время рестарта. `/api/health` снаружи закрыт (404). `wa-bridge` наружу не проксируется никогда.

## 7. Установка с нуля

Сервер: Ubuntu 24.04, от 2 vCPU / 4 ГБ / 40 ГБ SSD. Нужен исходящий HTTPS/WSS (443) к `web.whatsapp.com`, `*.whatsapp.net`, `api.telegram.org` (и `sheets.googleapis.com`, `oauth2.googleapis.com`, если включены таблицы). HTTP-порт сервиса слушает только `127.0.0.1`, наружу — через nginx с TLS. Часовой пояс сервера не важен, сервис работает по `Asia/Almaty`.

Docker:

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER   # перелогиньтесь
```

Код и запуск:

```bash
git clone <адрес репозитория> wa-group-sender && cd wa-group-sender
cp .env.example .env && mkdir -p secrets
nano .env    # минимум: ADMIN_TOKEN (openssl rand -hex 32), ADMIN_PASSWORD_HASH, TELEGRAM_BOT_TOKEN
docker compose up -d --build
docker compose logs -f
```

Контейнеры поднимаются сами после ребута (`restart: unless-stopped`). Данные — в volumes `wa-bridge`, `wa-db`, `wa-logs`, `wa-qr`, `wa-pictures`. Откройте админку, войдите и привяжите номер на странице «Подключение» (QR также в логе и в `GET /api/qr`). После привязки в логе `SESSION state WAITING_QR -> CONNECTED`; через `GROUPS_INITIAL_SYNC_DELAY` (60 с) группы синхронизируются. Сессия переживает рестарты, повторный QR нужен только после разлогина.

## 8. Telegram-уведомления

1. [@BotFather](https://t.me/BotFather) → `/newbot` → токен в `TELEGRAM_BOT_TOKEN`.
2. Получатели подписываются сами: «Настройки» → «Уведомления в Telegram» → ссылка на бота (своя у каждого кабинета) → «Старт». Запрос появляется в той же карточке, его одобряет пользователь кабинета («Одобрить» / «Отклонить» / «Удалить»). `/stop` в боте — отписаться.
3. `TELEGRAM_CHAT_IDS` (через запятую) — чаты, которые получают уведомления всех кабинетов без подписки. Запрос на подписку приходит всем, кто уже получает уведомления кабинета.
4. «Отправить тестовое уведомление» в карточке или `POST /api/admin/test-alert`.

Поводы: ожидание QR, разлогин, исчерпание попыток переподключения и восстановление связи, предупреждение и остановка по риску, ошибки таблицы; со стороны сервера — выкатка, откат, сбой бэкапа. Одинаковое уведомление — не чаще `NOTIFY_COOLDOWN` (15 мин). Если один чат недоступен, остальные всё равно получат сообщение.

## 9. Проверка и логи

`GET /api/health` (без входа, только с сервера; для кабинета — `/api/admin/health`):

| Поле | Значение |
| --- | --- |
| `session` | `CONNECTED`, `WAITING_QR`, `RECONNECTING`, `DISCONNECTED`, `LOGGED_OUT`, `BANNED` |
| `dispatcher` | `running`, `idle`, `paused`, `outside-window`, `daily-limit-reached`, `hourly-limit-reached`, `waiting-groups`, `waiting-session`, `no-active-groups`, `stopped-by-risk` |
| `queueLength` | рассылок идёт или ждёт |
| `sentToday`, `sentLastHour`, `hourlyLimit` | отправки за сутки (сброс в полночь по Алматы) и за последний час |
| `warmupLimitToday`, `warmupDay` | дневной лимит (`null` — без лимита) и день прогрева |
| `stoppedByRisk`, `riskEventsInWindow`, `pauseMultiplier` | риск |
| `activeGroups`, `tenants` | групп в рассылке, запущенных кабинетов |

Логи: `docker compose logs -f` (бой — `scripts/wa.sh logs -f`) и файл `wa-group-sender.log` с ротацией (`/data/logs` в контейнере, на бою `/home/ubuntu/wa-bot/logs`). В каждой строке — ключ кабинета `[t1]`, `[t2]`…

| Префикс | Что означает |
| --- | --- |
| `CAMPAIGN created/updated/tick/rollover/enabled/disabled/deleted` | заявка и её расписание |
| `QUEUED request_id=… source=campaign campaign_id=… window=…` | запуск рассылки поставлен в очередь |
| `PLAN request_id=… groups=… waves=… order=[…]` | перемешанный порядок групп |
| `SENDING request_id=… started` | рассылка началась |
| `PAUSE request_id=… pause_ms=… wave_boundary=…` | пауза перед отправкой |
| `SEND … status=SENT/FAILED/SKIPPED` | одна строка на отправку |
| `SEND … status=RETRY_LATER … reason=rejected-by-whatsapp` | WhatsApp отклонил, повтор через 20–30 мин |
| `POSTPONE … reason=group-interval until=…` | группе писали этот текст недавно |
| `POSTPONE … reason=no-reply-after-our-message` | ждём чужого сообщения после нашего |
| `SKIP … reason=no-reply-until-window-end` | до конца окна никто не написал |
| `CLOSE request_id=… reason=…` | рассылку остановили, удалили или перенесли в следующий запуск |
| `DONE request_id=… status=… sent=… failed=… skipped=…` | рассылка завершена |
| `RECOVERED_AS_SENT` | после рестарта прерванная отправка засчитана как отправленная |
| `RISK type=…`, `RISK dispatch stopped/resumed` | сигнал риска, остановка и снятие |
| `GROUP added/activated/deactivated/excluded/removed/renamed`, `GROUPS sync done` | группы |
| `SESSION state …`, `WATCHDOG …` | состояние сессии и переподключение |
| `DISPATCHER state …` | смена состояния диспетчера |
| `SETTINGS updated […]` | изменены настройки в админке |
| `AUTOREPLY …`, `TELEGRAM …`, `ALERT key=…` | автоответчик, бот, уведомление |
| `LOGIN …`, `ENTER …`, `PLATFORM …`, `ENGINE …` | входы, действия суперадмина, запуск кабинетов |
| `SHEETS …` | Google Sheets |

Пример: `scripts/wa.sh logs --since 1h | grep -E "SEND|POSTPONE" | grep "request_id=17 "`.

## 10. Шаблон сообщения

Заявка «по полям» собирается по `templates/message.txt` (UTF-8; нет файла — встроенный). Файл читается на каждую новую заявку, перезапуск не нужен. Готовый текст уходит как есть.

- Плейсхолдеры `{Маршрут}`, `{Дата / срочность}`, `{Машины и тоннаж}`, `{Груз}`, `{Фрахт}`, `{Доп. условия}`, `{ID}`, `{Контакт}`.
- Строка с пустым полем удаляется целиком, двух пустых строк подряд не бывает.
- Многострочное поле даёт несколько строк, текст вокруг плейсхолдера повторяется (`🚛 {Машины и тоннаж}` → `🚛` перед каждой машиной).
- Несколько заявок в одном сообщении разделяются линией `━━━`, контакт — один раз в конце.
- `{Контакт}` — из поля «Контакт в конце», пусто — `MESSAGE_CONTACT`. `MESSAGE_NUMBERING=true` — keycap-цифры ID в начале (`1️⃣7️⃣`).
- `*жирный*`, `_курсив_`, `~зачёркнутый~` и эмодзи передаются в WhatsApp как есть.

```
📍*{Маршрут}*

📅 *{Дата / срочность}*✅

🚛 {Машины и тоннаж}

📦 {Груз}
{Доп. условия}
💰 Фрахт {Фрахт}

📞 *{Контакт}*
```

## 11. Риск, разлогин, бан

Удаление номера из группы, ошибки отправки, разлогин и бан пишутся в `risk_event` (обрыв сети и отказы WhatsApp по группе не считаются). В скользящем окне `RISK_WINDOW` (1 ч):

- `RISK_WARN_THRESHOLD` (5) сигналов → паузы × `RISK_PAUSE_MULTIPLIER` (2), уведомление;
- `RISK_CRITICAL_THRESHOLD` (10) → рассылка останавливается (`stopped-by-risk`), уведомление. Остановка переживает рестарт.

Проверьте телефон (нет ли блокировки или предупреждений), логи `grep RISK`. Если всё в порядке — «Настройки» → «Рассылка» → возобновить (или `POST /api/admin/resume`). Счётчик окна обнуляется, рассылка продолжается с места остановки. Ручная пауза — там же (`POST /api/admin/pause`).

**Разлогин** (или устройство удалили в «Связанных устройствах»): уведомление, сервис удаляет старую сессию и ждёт QR. Отсканируйте его на «Подключении» — очередь и прогресс сохранены. При обрыве связи сервис переподключается сам (до `WATCHDOG_MAX_ATTEMPTS` попыток с задержкой до `WATCHDOG_MAX_DELAY`, затем уведомление и попытки раз в `WATCHDOG_MAX_DELAY`).

**`BANNED`** — номер заблокирован, рассылка стоит. Восстановление после бана сервис не делает.

## 12. Google Sheets (необязательно)

Выключено по умолчанию (`SHEETS_ENABLED=false`), заявки создаются в админке. Если включить, сервис раз в `SHEETS_POLL_INTERVAL` читает лист основного кабинета и рассылает новые строки во все группы рассылки, статусы пишет обратно.

1. Google Cloud: проект → включить Google Sheets API → сервисный аккаунт → JSON-ключ в `secrets/google-service-account.json`, `GOOGLE_CREDENTIALS_PATH=/run/secrets/google-service-account.json`.
2. Таблице дать email аккаунта (`client_email`) с ролью «Редактор». Образец листа — `docs/test-sheet.csv`.
3. `.env`: `SHEETS_ENABLED=true`, `SHEETS_SPREADSHEET_ID`, `SHEETS_SHEET_NAME`, `SHEETS_HEADER_ROW`, при своих заголовках — `SHEETS_COL_*` (регистр и лишние пробелы не важны).
4. После старта в логе `SHEETS layout ok`. Нет колонки — `SHEETS sheet "…" has no columns […]` и уведомление, строки не читаются, сервис не падает.

Строки: обязательные Маршрут, Дата / срочность, Машины и тоннаж, Груз, Фрахт; «Статус» пустой. Пустой ID — сервис проставит следующий номер. Статусы `В очереди` → `Отправляется` → `Отправлено` / `Ошибка: …`, «Отправлено / всего», «Завершено». Исправили ошибку — очистите статус. Тот же ID повторно не рассылается.

## 13. HTTP API

Описание OpenAPI: `GET /api/admin/openapi`. Ошибки — `{"message": "…"}` по-русски.

**Без входа**

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/health` | состояние (healthcheck Docker; снаружи закрыт nginx) |
| POST | `/api/auth/login`, `/api/auth/logout` | вход `{"username","password"}` → cookie; выход |
| GET | `/api/auth/me` | кто вошёл, роль, кабинет |
| POST | `/api/auth/password` | смена пароля `{"current","next"}` |
| GET | `/api/auth/enter?code=` | вход суперадмина в кабинет по одноразовой ссылке |

**Кабинет** (cookie или `X-Admin-Token` + `X-Tenant`)

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET / POST | `/api/admin/campaigns` | заявки (с 5 последними запусками) / создать `{"title","content","groups","targetLabel","repeat","sendNow","anyTime"}` |
| GET / PUT / DELETE | `/api/admin/campaigns/{id}` | заявка со всеми запусками / изменить / удалить |
| POST | `/api/admin/campaigns/{id}/run`, `/enable`, `/disable` | отправить сейчас, включить расписание, выключить |
| GET / POST | `/api/admin/requests` | все запуски с прогрессом / разовая заявка сразу (`route`, `date`, `vehicles`, `cargo`, `freight`, `conditions` или `items[]`, или `text`; `contact`, `groups`) |
| GET | `/api/admin/requests/{id}/deliveries` | статус по каждой группе |
| POST | `/api/admin/requests/{id}/retry` | повторить завершённый запуск в группы с ошибкой |
| POST | `/api/admin/requests/preview`, `/api/admin/preview` | текст без отправки: по полям заявки / по `{"id"}` строки таблицы или `{"fields"}` |
| GET / PUT | `/api/admin/group-lists` | списки групп / создать или заменить по названию `{"name","groups"}` |
| PUT / DELETE | `/api/admin/group-lists/{id}` | изменить (заявки на этот список получат новый состав) / удалить |
| GET | `/api/groups[?activeOnly=true]`, `/api/groups/{jid}/picture` | группы, аватар |
| POST | `/api/admin/groups/sync` | синхронизировать группы сейчас |
| POST | `/api/admin/groups/reset-rejections?jid=` | вернуть исключённую группу |
| GET | `/api/qr` | PNG текущего QR (404, если не нужен) |
| GET / PUT | `/api/admin/settings` | настройки раздела 4 (PUT — только изменённые поля) |
| GET | `/api/admin/schedule` | общее окно, выходные, лимит в час, контакт по умолчанию |
| POST | `/api/admin/pause`, `/api/admin/resume` | ручная пауза / снять паузу и остановку по риску |
| GET | `/api/admin/reports/period?from=&to=&format=xlsx\|pdf` | отчёт за период (до 366 дней) |
| GET | `/api/admin/reports/requests/{id}?format=xlsx\|pdf` | отчёт по одному запуску |
| GET | `/api/admin/telegram` | бот, ссылка-приглашение, подписчики |
| POST / DELETE | `/api/admin/telegram/subscribers/{chatId}/approve`, `/reject`, `/api/admin/telegram/subscribers/{chatId}` | одобрить / отклонить / удалить подписчика |
| POST | `/api/admin/test-alert` | тестовое уведомление |
| GET | `/api/admin/health` | состояние этого кабинета |

**Платформа** (суперадмин, `PLATFORM_HOST`, Cloudflare Access)

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET / POST | `/api/platform/tenants` | кабинеты со статистикой / создать `{"name","login","password","proxy"}` |
| PATCH | `/api/platform/tenants/{id}` | название, статус `ACTIVE`/`BLOCKED`, прокси |
| POST | `/api/platform/tenants/{id}/delete` | удалить `{"confirmName"}` |
| POST | `/api/platform/tenants/{id}/proxy-check` | проверить прокси |
| POST | `/api/platform/tenants/{id}/enter` | одноразовая ссылка входа в кабинет |
| GET / POST | `/api/platform/tenants/{id}/users` | пользователи кабинета / добавить |
| PATCH / DELETE | `/api/platform/users/{id}` | включить/отключить, новый пароль / удалить |
| GET | `/api/platform/audit[?tenantId=&limit=]` | журнал (100, максимум 500) |

## 14. Профиль fake, разработка, CI

**fake** подменяет WhatsApp (30 групп, 3 не в архиве, 2 «пишут только админы») и таблицу (`docs/test-sheet.csv`, читается при `SHEETS_ENABLED=true`), паузы короткие, окно круглосуточное, прокси не обязателен. Ничего не уходит в настоящий WhatsApp.

```bash
cp .env.example .env
sed -i 's/^SPRING_PROFILES_ACTIVE=.*/SPRING_PROFILES_ACTIVE=fake/; s/^ADMIN_TOKEN=.*/ADMIN_TOKEN=fake/' .env
docker compose up -d --build
curl -s -H "X-Admin-Token: fake" localhost:8080/api/admin/fake/sheet   # таблица
curl -s -H "X-Admin-Token: fake" localhost:8080/api/admin/fake/sent    # что «отправлено»
docker compose down -v
```

`POST /api/admin/fake/requests` — добавить строку в фейковую таблицу. `down -v` удаляет volumes; перед боевым запуском это обязательно, чтобы прогрев и ID начались с нуля.

Разработка (JDK 17+ для Gradle, JDK 25 скачается сам; `wa-bridge` собирается только в Docker; на боевом сервере — `scripts/gradle.sh` и `scripts/pnpm.sh` в контейнерах, рабочая копия `dev/`):

```bash
./gradlew build
./gradlew bootRun --args='--spring.profiles.active=fake --app.logging.dir=build/logs --spring.datasource.url=jdbc:h2:mem:dev --app.tenancy.db-url=jdbc:h2:mem:dev-{name} --app.fake.sheet-state= --app.security.admin-token=dev'
```

Админка — `frontend/README.md`.

**CI** (`.github/workflows/ci.yml`, GitHub-раннеры) на push в `main`, PR и вручную: `build` (`./gradlew build`), `frontend` (typecheck, lint, vitest, build), `e2e` (Playwright против образа в профиле fake). На push в `main` джоба «Deploy to production» ничего не выкатывает сама: сервер забирает `main` и после зелёных проверок выкатывает (`scripts/autodeploy.sh`, раздел 6), джоба показывает этапы и падает, если выкатка не удалась или не закончилась за 30 минут.

Стек: Java 25, Spring Boot 4.1.1, Gradle 9.8.0, whatsmeow (Go 1.26, версия закреплена в `bridge/go.mod`, патч `bridge/whatsmeow-sender-key-recipients.patch`), H2 2.5.252 + Flyway 13.8.0, React 19 + Vite, Google Sheets API v4.
