# План реализации wa-group-sender

Сервис читает заявки из Google Sheets и рассылает их в архивные WhatsApp-группы тестового номера с антибан-логикой. Один номер, один поток отправки.

## Стек

| Компонент | Версия |
| --- | --- |
| JDK | 25 (LTS), образ `eclipse-temurin:25.0.4.1_1` |
| Spring Boot | 4.1.1 |
| Gradle | 9.8.0 (Kotlin DSL, wrapper) |
| WhatsApp Web | Cobalt `com.github.auties00:cobalt:0.0.10` (см. spike-report.md) |
| БД | H2 2.5.252 (file), Flyway 13.8.0 |
| Google Sheets | google-api-services-sheets v4-rev20260610-2.0.0, google-auth-library 1.53.0 |
| QR | ZXing 3.5.4 |

## Структура пакетов (`kz.inkar.wasender`)

| Пакет | Содержимое |
| --- | --- |
| `config` | `AppProperties` и вложенные records (`@ConfigurationProperties`), бины `Clock`, `RandomGenerator`, `Sleeper`, планировщик |
| `whatsapp` | `WhatsAppGateway`, `GatewayEvent`, `GroupInfo`, `SessionState`, `QrService`, `SessionWatchdog` |
| `whatsapp.cobalt` | `CobaltWhatsAppGateway` — единственное место, где есть классы Cobalt |
| `whatsapp.fake` | `FakeWhatsAppGateway` (профиль `fake`) |
| `sheets` | `RequestSource`, `GoogleSheetsRequestSource`, `SheetRow`, `ColumnLayout`, `SheetPoller`, `SheetUpdateBuffer`, `Retry` |
| `sheets.fake` | `FakeRequestSource` (профиль `fake`) |
| `request` | `RequestRepository`, `RequestRecord`, `RequestStatus`, `RequestValidator` |
| `template` | `TemplateRenderer` |
| `group` | `GroupRepository`, `GroupSyncService` |
| `dispatch` | `Dispatcher`, `DeliveryRepository`, `PauseRandomizer`, `WorkWindow`, `WarmupService`, `DailyCounterRepository`, `DispatcherState` |
| `risk` | `RiskMonitor`, `RiskEventRepository`, `RiskType` |
| `notify` | `Notifier`, `AlertService`, `TelegramChannel`, `EmailChannel` |
| `web` | `HealthController`, `AdminController`, `QrController`, `GroupController`, `AdminTokenFilter` |

## Поток заявки

1. `SheetPoller` раз в `poll-interval` читает лист, валидирует строки с пустым статусом.
2. Пустой ID → генерируется и пишется в строку. Невалидная строка → «Ошибка: не заполнено …».
3. ID уже есть в БД → повторно не ставится. Иначе текст рендерится по шаблону, `request` = QUEUED, в таблицу «В очереди».
4. `Dispatcher` (один поток) берёт самую старую заявку, при первом взятии строит план: активные группы перемешиваются, пишутся в `delivery` c позицией (PENDING).
5. Для каждой позиции: проверка ворот (сессия, риск, пауза, окно, лимит) → пауза (между группами или волнами) × множитель риска → «печатает» → `SENDING` + счётчик суток → отправка → `SENT`/`FAILED`.
6. Прогресс «отправлено/всего» копится в `SheetUpdateBuffer` и сбрасывается пакетно раз в `progress-flush-interval` или на границе волны.
7. Нет PENDING → заявка DONE, в таблицу «Отправлено», время завершения.

## Схема БД

```
request(id varchar pk, sheet_row int, message text, status varchar, error varchar,
        queued_at timestamp, started_at timestamp, completed_at timestamp)
wa_group(jid varchar pk, name varchar, archived bool, can_send bool, member bool,
         active bool, last_sync timestamp)
delivery(id bigint pk, request_id fk, group_jid, position int, status varchar,
         error varchar, updated_at timestamp, unique(request_id, group_jid))
risk_event(id bigint pk, type varchar, group_jid varchar, request_id varchar,
           detail varchar, created_at timestamp)
daily_counter(day date pk, sent int, limit_value int)
```

Статусы `delivery`: PENDING, SENDING, SENT, FAILED, SKIPPED. Статусы `request`: QUEUED, SENDING, DONE, FAILED.
Остановка по риску хранится событиями `RISK_STOP` / `RESUMED` в `risk_event`, поэтому переживает рестарт.

## Конфиг-параметры (application.yml ← env)

| Параметр | Env | Дефолт |
| --- | --- | --- |
| app.zone | APP_ZONE | Asia/Almaty |
| app.whatsapp.session-dir | WA_SESSION_DIR | /data/session |
| app.whatsapp.qr-png-path | WA_QR_PNG_PATH | /data/qr/qr.png |
| app.whatsapp.device-name | WA_DEVICE_NAME | wa-group-sender |
| app.whatsapp.send-timeout | WA_SEND_TIMEOUT | 60s |
| app.whatsapp.metadata-query-delay | WA_METADATA_QUERY_DELAY | 700ms |
| app.watchdog.check-interval | WATCHDOG_CHECK_INTERVAL | 30s |
| app.watchdog.max-attempts | WATCHDOG_MAX_ATTEMPTS | 8 |
| app.watchdog.initial-delay | WATCHDOG_INITIAL_DELAY | 10s |
| app.watchdog.max-delay | WATCHDOG_MAX_DELAY | 15m |
| app.sheets.enabled | SHEETS_ENABLED | true |
| app.sheets.spreadsheet-id | SHEETS_SPREADSHEET_ID | — |
| app.sheets.sheet-name | SHEETS_SHEET_NAME | Заявки |
| app.sheets.credentials-path | GOOGLE_CREDENTIALS_PATH | /run/secrets/google.json |
| app.sheets.poll-interval | SHEETS_POLL_INTERVAL | 30s |
| app.sheets.first-data-row | SHEETS_FIRST_DATA_ROW | 2 |
| app.sheets.columns.* | SHEETS_COL_* | A..I |
| app.sheets.progress-flush-interval | SHEETS_PROGRESS_FLUSH_INTERVAL | 60s |
| app.sheets.retry.* | SHEETS_RETRY_* | 5 попыток, 2s…60s |
| app.sheets.alert-after-failures | SHEETS_ALERT_AFTER_FAILURES | 10 |
| app.template.path | TEMPLATE_PATH | /data/templates/message.txt |
| app.groups.sync-interval | GROUPS_SYNC_INTERVAL | 1h |
| app.dispatch.wave-size | DISPATCH_WAVE_SIZE | 25 |
| app.dispatch.wave-pause-min/max | DISPATCH_WAVE_PAUSE_MIN/MAX | 10m / 20m |
| app.dispatch.group-pause-min/max | DISPATCH_GROUP_PAUSE_MIN/MAX | 20s / 60s |
| app.dispatch.typing-min/max | DISPATCH_TYPING_MIN/MAX | 2s / 6s |
| app.dispatch.idle-poll | DISPATCH_IDLE_POLL | 5s |
| app.dispatch.window-start/end | DISPATCH_WINDOW_START/END | 08:00 / 21:00 |
| app.dispatch.weekends-enabled | DISPATCH_WEEKENDS_ENABLED | true |
| app.warmup.enabled | WARMUP_ENABLED | true |
| app.warmup.daily-limits | WARMUP_DAILY_LIMITS | 50,100,150,250 |
| app.risk.window | RISK_WINDOW | 1h |
| app.risk.warn-threshold | RISK_WARN_THRESHOLD | 5 |
| app.risk.critical-threshold | RISK_CRITICAL_THRESHOLD | 10 |
| app.risk.pause-multiplier | RISK_PAUSE_MULTIPLIER | 2.0 |
| app.notify.channel | NOTIFY_CHANNEL | telegram |
| app.notify.cooldown | NOTIFY_COOLDOWN | 15m |
| app.notify.telegram.* | TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID | — |
| app.notify.email.* | NOTIFY_EMAIL_FROM/TO, SPRING_MAIL_* | — |
| app.security.admin-token | ADMIN_TOKEN | — |

## Эндпоинты

| Метод | Путь | Доступ |
| --- | --- | --- |
| GET | /api/health | открыт |
| GET | /api/qr | токен |
| GET | /api/groups | токен |
| POST | /api/admin/resume | токен |
| POST | /api/admin/pause | токен |
| POST | /api/admin/groups/sync | токен |
| POST | /api/admin/fake/requests | токен, только профиль `fake` |

Токен передаётся в заголовке `X-Admin-Token`.

## План тестов (JUnit 5, Clock и Sleeper инжектируются, реальных sleep нет)

| Тест | Что проверяет |
| --- | --- |
| `WarmupTest` | лимиты по дням от первой отправки, остаток переносится на следующие сутки с той же позиции |
| `WorkWindowTest` | окно, граница, выходные; диспетчер не шлёт вне окна |
| `PauseRandomizerTest` | значения в диапазоне, разброс, множитель риска |
| `ShuffleTest` | порядок групп различается между заявками, план содержит все активные группы |
| `RestartRecoveryTest` | SENDING после рестарта считается отправленной, повторов нет, продолжение с места |
| `RiskMonitorTest` | предупреждение → множитель, критический порог → стоп + алерт, resume |
| `SheetPollerTest` | пустые поля → «Ошибка: не заполнено …», генерация ID, идемпотентность по ID |
| `TemplateRendererTest` | подстановка плейсхолдеров, перечитывание файла |
| `DispatcherFlowTest` | полный цикл на fake-профиле: волны, typing, статусы в таблице |
