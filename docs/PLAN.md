# Устройство wa-group-sender

Многокабинетный сервис рассылки заявок в WhatsApp-группы. У каждого кабинета свой номер, группы, заявки, настройки и база; один поток отправки на кабинет. Эксплуатация и поведение — `README.md`, исходное ТЗ — `docs/TZ.md`.

## Стек

| Компонент | Версия |
| --- | --- |
| JDK | 25, образы `eclipse-temurin:25.0.4.1_1-jdk-noble` / `-jre-alpine` |
| Spring Boot | 4.1.1 (webmvc, jdbc, flyway, spring-security-crypto для bcrypt) |
| Gradle | 9.8.0 (Kotlin DSL, wrapper) |
| WhatsApp Web | whatsmeow (Go 1.26) в контейнере `wa-bridge`, версия в `bridge/go.mod`, патч `bridge/whatsmeow-sender-key-recipients.patch` |
| БД | H2 2.5.252 (file), Flyway 13.8.0 |
| API-описание | springdoc-openapi 3.1.1 (`/api/admin/openapi`), из него типы фронтенда |
| Отчёты | Apache POI 5.4.1 (xlsx), OpenPDF 2.0.3, шрифт PT Sans |
| QR | ZXing 3.5.4 |
| Google Sheets | google-api-services-sheets v4-rev20260610-2.0.0 (выключено по умолчанию) |
| Админка | React 19, Vite, TypeScript, TanStack Query, Tailwind 4 — `frontend/README.md` |

## Кабинеты (`engine`, `platform`)

- База `platform` (`db/platform`): `tenant` (название, статус `ACTIVE`/`BLOCKED`, `legacy`, код приглашения Telegram, прокси), `app_user` (логин, bcrypt, роль `SUPERADMIN`/`MEMBER`, кабинет), `audit_log`.
- На каждый активный кабинет `EngineRegistry` поднимает свой `Engine` — набор бинов (`EngineComponents`: диспетчер, репозитории, шлюз WhatsApp, Telegram, планировщик) со своей базой `app.tenancy.db-url` (`{name}` → `wasender` у основного, `t<id>` у остальных) и миграциями `db/migration`.
- Бины кабинета снаружи видны через прокси `TenantProxies`: вызов уходит в движок текущего кабинета (`CurrentTenant`, берётся из сессии или `X-Tenant`).
- `PlatformBootstrap` при старте создаёт основной кабинет «Кабинет 1» и первого пользователя из `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` (и отдельного суперадмина из `PLATFORM_ADMIN_*`, если задан).
- `wa-bridge` держит сессии всех кабинетов (ключ `t<id>`, основная — `t1`), у каждой свой прокси (`ProxyPolicy`: без прокси номер нового кабинета не подключается при `APP_TENANCY_REQUIRE_PROXY=true`).

## Пакеты (`kz.wasender`)

| Пакет | Содержимое |
| --- | --- |
| `config` | `@ConfigurationProperties` records, `CoreConfig` (`Clock`, `RandomGenerator`, `Sleeper`) |
| `engine` | `EngineRegistry`, `Engine`, `TenantEngines`, `TenantProxies`, `CurrentTenant`, `TenantInfo` |
| `platform` | кабинеты, пользователи, пароли, журнал, одноразовые коды входа, коды приглашения, проверка прокси |
| `tenant` | `StartupTasks` — задачи кабинета: синхронизация групп, тик расписания (30 с), опрос таблицы |
| `whatsapp` | `WhatsAppGateway`, `SessionWatchdog`, `QrService`, `GroupPictureService`, `ProxyPolicy`; `bridge.BridgeWhatsAppGateway` (HTTP к `wa-bridge`), `fake.FakeWhatsAppGateway` |
| `campaign` | заявка с расписанием: `CampaignService`, `Schedule` (`ONCE`/`DAILY`/`INTERVAL`, доп. время, «вне окна»), `StartJitter`, `CampaignRecipients` |
| `request` | запуск рассылки (`request`): `RequestIntake` (проверка и сборка текста), `RequestRepository`, `RequestValidator`, `RequestIdGenerator` |
| `dispatch` | `Dispatcher`, `DeliveryRepository`, `PauseRandomizer`, `WorkWindow`, `WarmupService`, `DailyCounterRepository` |
| `group` | `GroupRepository`, `GroupSyncService`, `GroupListRepository`, `GroupBlock` (почему группа не в рассылке) |
| `settings` | `SettingsService` — настройки из админки поверх `.env` (`app_setting`) |
| `template` | `TemplateRenderer`, `PreviewService` |
| `report` | `ReportService`, `ExcelReportWriter`, `PdfReportWriter` |
| `risk` | `RiskMonitor`, `RiskEventRepository`, `RiskType` |
| `notify` | `AlertService` (cooldown), `TelegramNotifier`, `TelegramBot` (подписка по ссылке, `/start`, `/stop`), `TelegramSubscriberRepository` |
| `autoreply` | `AutoReplyService` — ответ на личные сообщения и звонки |
| `sheets` | Google Sheets (`SheetPoller`, `ColumnLayout`, `SheetUpdateBuffer`, `SheetsRetry`), `fake.FakeRequestSource` |
| `web` | контроллеры, `AdminTokenFilter`, `Authenticator`, `SessionTokens` (HMAC-cookie), `CloudflareAccess`, `FailureThrottle`, `SpaController` |

## Поток заявки

1. `CampaignService.create` проверяет текст и группы (`RequestIntake`), сохраняет `campaign` и следующий запуск (`next_run_at`, со сдвигом 1–5 мин для расписания).
2. Тик раз в 30 с: для каждой заявки с наступившим запуском закрывает недоделанный предыдущий запуск, создаёт `request` с окном заявки и считает следующий запуск.
3. `Dispatcher` (поток кабинета): ворота (риск, пауза, сессия, дневной и часовой лимит) → заявки в своём окне → по кругу между заявками. При первом взятии — план: перемешанные группы в `delivery` (PENDING).
4. На позицию: группа ещё доступна → правило «ждать ответа» и интервал для группы (иначе `not_before` и переход к другим) → пауза от начала прошлой отправки (волна или группа, × множитель риска) → `SENDING` → отправка → `SENT` / `FAILED` / повтор при отказе сервера.
5. Нет ожидающих доставок → `DONE` (хотя бы одна отправлена) или `FAILED`.

## Схема БД кабинета (`db/migration` V1–V8)

```
campaign(id, title, draft, message, targeted, target_label, repeat_mode, start_time, end_time,
         interval_minutes, extra_times, any_time, enabled, deleted, created_at, updated_at,
         next_run_at, last_run_at)                 campaign_target(campaign_id, group_jid)
request(id, sheet_row, message, status, error, queued_at, started_at, completed_at,
        targeted, campaign_id, window_start, window_end)   request_target(request_id, group_jid)
delivery(id, request_id, group_jid, position, status, error, updated_at, attempts,
         not_before, waiting_reply)
wa_group(jid, name, archived, member, can_send, active, last_sync, participants, community,
         too_large, rejected_count, rejected, present)
group_list(id, name, created_at)                    group_list_member(list_id, group_jid)
app_setting(name, setting_value, updated_at)
telegram_subscriber(chat_id, name, username, status, requested_at, decided_at)
autoreply_log(contact_jid, kind, replied_at)
risk_event(id, type, group_jid, request_id, detail, created_at)
daily_counter(counter_date, sent, limit_value)
```

Статусы `delivery`: PENDING, SENDING, SENT, FAILED, SKIPPED. Статусы `request`: QUEUED, SENDING, DONE, FAILED. Остановка по риску — события `RISK_STOP` / `RESUMED` в `risk_event`, переживает рестарт.

## Конфигурация

Все переменные и значения по умолчанию — `src/main/resources/application.yml` и `.env.example`; какие из них редактируются в админке — README, раздел 4. Профиль `fake` (`application-fake.yml`): фейковый WhatsApp и таблица, короткие паузы, окно круглосуточно, прокси не обязателен.

## Тесты

JUnit 5, `Clock` и `Sleeper` инжектируются, реальных sleep нет; общая база API-тестов — `ApiTest`; фронтенд — Vitest и Playwright (`frontend/README.md`).

| Тест | Что проверяет |
| --- | --- |
| `TemplateRendererTest` | эталоны `src/test/resources/golden/*`, удаление пустых строк, многострочные поля, нумерация |
| `CsvFullCycleTest`, `SheetPollerTest`, `ColumnLayoutTest` | Google Sheets: полный цикл fake, проверки строк, поиск колонок |
| `DispatcherFlowTest`, `ShuffleTest`, `PauseRandomizerTest`, `GroupPauseSettingTest` | круговой обход заявок, паузы и волны (время отправки входит в паузу), дробные секунды паузы, перемешивание |
| `CampaignFlowTest`, `ScheduleTest`, `StartJitterTest`, `AdminRequestsTest` | заявки, расписание, сдвиг старта, разовые заявки, списки групп, несколько заявок в сообщении, повтор при отказе WhatsApp |
| `WarmupTest`, `WarmupMidnightTest`, `DailyCapTest`, `WorkWindowTest`, `WorkWindowDispatchTest`, `WeekendFlagTest` | лимиты, прогрев, окно, выходные |
| `RestartRecoveryTest`, `RiskMonitorTest`, `SessionWatchdogTest` | восстановление после рестарта, риск, переподключение |
| `GroupBlockReasonTest`, `GroupsOfPreviousNumberTest`, `GroupPictureServiceTest` | правила групп, смена номера, аватары |
| `TelegramNotifierTest`, `TelegramBotTest`, `AutoReplyTest`, `ReportTest` | уведомления, подписка, автоответчик, отчёты |
| `AuthTest`, `AdminTokenFilterTest`, `SeparateAdminTest`, `CloudflareAccessTest` | вход, защита API, отдельный суперадмин, Cloudflare Access |
| `PlatformApiTest`, `TenantIsolationTest`, `ProxyRequirementTest`, `ProxyUrlsTest` | кабинеты, изоляция данных, прокси |
| `BridgeWhatsAppGatewayTest`, `ApplicationContextTest` | клиент `wa-bridge`, подъём контекста |

Go-тесты `wa-bridge` (`bridge/*_test.go`) запускаются при сборке его образа.
