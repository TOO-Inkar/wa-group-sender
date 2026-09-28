# План реализации wa-group-sender

Сервис читает заявки из Google Sheets и рассылает их в архивные WhatsApp-группы тестового номера с антибан-логикой. Один номер, один поток отправки. ТЗ — `docs/TZ.md`.

## Стек

| Компонент | Версия |
| --- | --- |
| JDK | 25 (LTS), образы `eclipse-temurin:25.0.4.1_1-jdk-noble` / `-jre-alpine` |
| Spring Boot | 4.1.1 |
| Gradle | 9.8.0 (Kotlin DSL, wrapper), foojay-resolver 1.0.0 |
| WhatsApp Web | Cobalt `com.github.auties00:cobalt:0.0.10` (см. `spike-report.md`) |
| БД | H2 2.5.252 (file), Flyway 13.8.0 |
| Google Sheets | google-api-services-sheets v4-rev20260610-2.0.0, google-api-client 2.9.1, google-auth-library 1.53.0 |
| QR | ZXing 3.5.4 |

## Пакеты (`kz.wasender`)

| Пакет | Содержимое |
| --- | --- |
| `config` | records `@ConfigurationProperties` (`AppProperties`, `WhatsAppProperties`, `WatchdogProperties`, `SheetsProperties`, `MessageProperties`, `GroupsProperties`, `DispatchProperties`, `WarmupProperties`, `RiskProperties`, `NotifyProperties`, `SecurityProperties`, `FakeProperties`), бины `Clock`, `RandomGenerator`, `Sleeper`, планировщик, `StartupTasks` |
| `time` | `Sleeper`, `ThreadSleeper` |
| `whatsapp` | `WhatsAppGateway`, `GatewayEvent`, `GroupInfo`, `SessionState`, `SendException`, `QrService`, `SessionWatchdog` |
| `whatsapp.cobalt` | `CobaltWhatsAppGateway` — единственное место с классами Cobalt |
| `whatsapp.fake` | `FakeWhatsAppGateway` (профиль `fake`) |
| `sheets` | `RequestSource`, `GoogleSheetsRequestSource`, `ColumnLayout` (поиск колонок по заголовкам), `SheetRow`, `SheetField`, `CsvParser`, `SheetPoller`, `SheetUpdateBuffer`, `SheetsRetry` |
| `sheets.fake` | `FakeRequestSource` — таблица из `docs/test-sheet.csv`, состояние в volume |
| `request` | `RequestRepository`, `RequestRecord`, `RequestStatus`, `RequestValidator`, `RequestIdGenerator` |
| `template` | `TemplateRenderer`, `PreviewService` |
| `group` | `GroupRepository`, `GroupSyncService` |
| `dispatch` | `Dispatcher`, `DeliveryRepository`, `PauseRandomizer`, `WorkWindow`, `WarmupService`, `DailyCounterRepository`, `DispatcherState` |
| `risk` | `RiskMonitor`, `RiskEventRepository`, `RiskType` |
| `notify` | `Notifier`, `TelegramNotifier` (список chat_id), `AlertService` (cooldown) |
| `web` | `HealthController`, `AdminController`, `QrController`, `GroupController`, `FakeAdminController`, `AdminTokenFilter` |

## Поток заявки

1. При старте `SheetPoller.checkLayout` проверяет заголовки листа. Нет нужных — ошибка в лог и алерт, сервис работает дальше.
2. Раз в `poll-interval` `SheetPoller` читает лист, колонки ищет по заголовкам из конфига.
3. Строка с пустым «Статус»: пустые обязательные поля → «Ошибка: не заполнено …». Пустой ID → следующий номер (max + 1), пишется в строку до постановки в очередь. ID уже в БД → повторно не ставится.
4. Текст рендерится по шаблону (`templates/message.txt`) и сохраняется в `request`, в таблицу «В очереди».
5. `Dispatcher` (один поток) берёт самую старую заявку. При первом взятии перемешивает активные группы и пишет план в `delivery` (PENDING, позиция).
6. На каждую позицию: ворота (риск, пауза, сессия, окно, лимит прогрева) → пауза между группами или волнами × множитель риска → «печатает» → счётчик суток → `SENDING` → отправка → `SENT`/`FAILED`.
7. Прогресс «отправлено / всего» копится в `SheetUpdateBuffer`, пишется пакетно: на границе волны, раз в `progress-flush-interval` и при смене статуса.
8. Нет PENDING → «Отправлено» и время завершения `yyyy-MM-dd HH:mm`.

## Шаблон сообщения

- Плейсхолдеры `{Имя колонки}` (по стандартным названиям и по заголовкам из конфига), `{ID}`, `{Контакт}` (из конфига).
- Строка шаблона, у которой пуст хотя бы один плейсхолдер, удаляется целиком.
- Многострочная ячейка даёт по строке сообщения на каждую непустую строку ячейки, текст строки шаблона вокруг плейсхолдера повторяется.
- Две пустые строки подряд схлопываются, пустые строки в начале и конце убираются.
- `MESSAGE_NUMBERING=true` → первая строка получает префикс из keycap-цифр ID (`1️⃣7️⃣ `), если ID числовой.

## Схема БД (Flyway `V1__init.sql`)

```
request(id varchar pk, sheet_row int, message clob, status varchar, error varchar,
        queued_at, started_at, completed_at timestamptz)
wa_group(jid varchar pk, name varchar, archived bool, member bool, can_send bool,
         active bool, last_sync timestamptz)
delivery(id bigint pk, request_id fk, group_jid varchar, position int, status varchar,
         error varchar, updated_at timestamptz, unique(request_id, group_jid))
risk_event(id bigint pk, type varchar, group_jid varchar, request_id varchar,
           detail varchar, created_at timestamptz)
daily_counter(counter_date date pk, sent int, limit_value int)
```

Статусы `delivery`: PENDING, SENDING, SENT, FAILED, SKIPPED. Статусы `request`: QUEUED, SENDING, DONE, FAILED.
Остановка по риску — события `RISK_STOP` / `RESUMED` в `risk_event`, переживает рестарт.

## Конфиг-параметры (application.yml ← env)

| Параметр | Env | Дефолт |
| --- | --- | --- |
| app.zone | APP_ZONE | Asia/Almaty |
| app.message.template-path | MESSAGE_TEMPLATE_PATH | /data/templates/message.txt |
| app.message.contact | MESSAGE_CONTACT | пусто (строка контакта не выводится) |
| app.message.numbering | MESSAGE_NUMBERING | false |
| app.whatsapp.session-dir | WA_SESSION_DIR | /data/session |
| app.whatsapp.qr-png-path | WA_QR_PNG_PATH | /data/qr/qr.png |
| app.whatsapp.device-name | WA_DEVICE_NAME | wa-group-sender |
| app.whatsapp.send-timeout | WA_SEND_TIMEOUT | 60s |
| app.whatsapp.metadata-query-delay | WA_METADATA_QUERY_DELAY | 700ms |
| app.whatsapp.metadata-ttl | WA_METADATA_TTL | 6h |
| app.watchdog.check-interval | WATCHDOG_CHECK_INTERVAL | 15s |
| app.watchdog.max-attempts | WATCHDOG_MAX_ATTEMPTS | 8 |
| app.watchdog.initial-delay / max-delay | WATCHDOG_INITIAL_DELAY / MAX_DELAY | 10s / 15m |
| app.watchdog.connect-timeout | WATCHDOG_CONNECT_TIMEOUT | 3m |
| app.sheets.enabled | SHEETS_ENABLED | true |
| app.sheets.spreadsheet-id | SHEETS_SPREADSHEET_ID | — |
| app.sheets.sheet-name | SHEETS_SHEET_NAME | Заявки |
| app.sheets.credentials-path | GOOGLE_CREDENTIALS_PATH | /run/secrets/google.json |
| app.sheets.poll-interval | SHEETS_POLL_INTERVAL | 30s |
| app.sheets.header-row | SHEETS_HEADER_ROW | 1 |
| app.sheets.columns.* | SHEETS_COL_ID, _ROUTE, _DATE, _VEHICLES, _CARGO, _FREIGHT, _CONDITIONS, _STATUS, _PROGRESS, _COMPLETED | заголовки из раздела 5.1 ТЗ |
| app.sheets.progress-flush-interval | SHEETS_PROGRESS_FLUSH_INTERVAL | 60s |
| app.sheets.retry.* | SHEETS_RETRY_MAX_ATTEMPTS / INITIAL_BACKOFF / MAX_BACKOFF | 5 / 2s / 60s |
| app.sheets.alert-after-failures | SHEETS_ALERT_AFTER_FAILURES | 10 |
| app.sheets.completed-format | SHEETS_COMPLETED_FORMAT | yyyy-MM-dd HH:mm |
| app.groups.sync-interval | GROUPS_SYNC_INTERVAL | 1h |
| app.groups.initial-sync-delay | GROUPS_INITIAL_SYNC_DELAY | 60s |
| app.dispatch.autostart | DISPATCH_AUTOSTART | true |
| app.dispatch.wave-size | DISPATCH_WAVE_SIZE | 25 |
| app.dispatch.wave-pause-min / max | DISPATCH_WAVE_PAUSE_MIN / MAX | 10m / 20m |
| app.dispatch.group-pause-min / max | DISPATCH_GROUP_PAUSE_MIN / MAX | 20s / 60s |
| app.dispatch.typing-min / max | DISPATCH_TYPING_MIN / MAX | 2s / 6s |
| app.dispatch.idle-poll | DISPATCH_IDLE_POLL | 5s |
| app.dispatch.window-start / end | DISPATCH_WINDOW_START / END | 08:00 / 20:00 |
| app.dispatch.weekends-enabled | DISPATCH_WEEKENDS_ENABLED | false |
| app.warmup.enabled | WARMUP_ENABLED | true |
| app.warmup.daily-limits | WARMUP_DAILY_LIMITS | 45,80,120,170,220 (с 6-го дня — весь список) |
| app.risk.window | RISK_WINDOW | 1h |
| app.risk.warn-threshold / critical-threshold | RISK_WARN_THRESHOLD / RISK_CRITICAL_THRESHOLD | 5 / 10 |
| app.risk.pause-multiplier | RISK_PAUSE_MULTIPLIER | 2.0 |
| app.notify.cooldown | NOTIFY_COOLDOWN | 15m |
| app.notify.telegram.bot-token | TELEGRAM_BOT_TOKEN | — |
| app.notify.telegram.chat-ids | TELEGRAM_CHAT_IDS | — (через запятую) |
| app.security.admin-token / header | ADMIN_TOKEN / ADMIN_TOKEN_HEADER | — / X-Admin-Token |
| app.logging.* | LOG_DIR, LOG_MAX_FILE_SIZE, LOG_MAX_HISTORY_DAYS, LOG_TOTAL_SIZE_CAP | /data/logs, 20MB, 30, 2GB |
| app.fake.* | FAKE_GROUPS, FAKE_UNARCHIVED_GROUPS, FAKE_ADMIN_ONLY_GROUPS, FAKE_FAILURE_RATE, FAKE_SHEET_CSV, FAKE_SHEET_STATE | 30, 3, 2, 0.0, classpath CSV, /data/db/fake-sheet.csv |

## Эндпоинты

| Метод | Путь | Доступ |
| --- | --- | --- |
| GET | /api/health | открыт |
| GET | /api/qr | токен |
| GET | /api/groups | токен |
| POST | /api/admin/preview | токен |
| POST | /api/admin/resume, /api/admin/pause | токен |
| POST | /api/admin/groups/sync | токен |
| POST | /api/admin/test-alert | токен |
| GET | /api/admin/requests | токен |
| POST/GET | /api/admin/fake/requests, /sheet, /sent | токен, только профиль `fake` |

## Тесты (JUnit 5, `Clock` и `Sleeper` инжектируются, реальных sleep нет)

| Тест | Что проверяет |
| --- | --- |
| `TemplateRendererTest` | три заявки из `test-sheet.csv` побайтно равны `src/test/resources/golden/*`; удаление строк с пустыми полями; многострочные ячейки; флаг нумерации; перечитывание шаблона |
| `CsvFullCycleTest` | полный цикл fake: CSV → очередь → 25 групп × 3 заявки ровно по эталонам, без повторов; preview по ID и по полям |
| `SheetPollerTest` | пустые обязательные поля, числовой ID, идемпотентность, дубликат ID, нет заголовков → алерт без падения |
| `ColumnLayoutTest` | колонки по заголовкам в любом порядке, CSV с многострочными ячейками |
| `WarmupTest`, `WarmupMidnightTest` | суточный лимит, перенос остатка с той же позиции, сброс в полночь по Алматы, 45→220→весь список |
| `WorkWindowTest`, `WorkWindowDispatchTest`, `WeekendFlagTest` | границы окна, флаг выходных, заявки ждут |
| `PauseRandomizerTest`, `ShuffleTest`, `DispatcherFlowTest` | паузы в диапазоне, волны, перемешивание, FIFO, пакетная запись прогресса |
| `RestartRecoveryTest` | SENDING после рестарта → отправлено, повторов нет |
| `RiskMonitorTest`, `SessionWatchdogTest` | порог предупреждения → множитель, критический → стоп + алерт; backoff и алерты watchdog |
| `TelegramNotifierTest` | рассылка всем chat_id, сбой одного не мешает остальным |
| `AdminTokenFilterTest`, `ApplicationContextTest` | защита админ-эндпоинтов, подъём контекста |
| `CobaltSpikeTest` (`./gradlew spike`) | живой handshake с WhatsApp Web, QR, передача разметки и эмодзи без изменений |
