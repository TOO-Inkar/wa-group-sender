# Спайк библиотеки WhatsApp Web

Дата: 28.09.2026.

## Итог

**Выбрана Cobalt** — `com.github.auties00:cobalt:0.0.10` (Maven Central, MIT). Запасной вариант Baileys не понадобился.

Библиотека спрятана за интерфейсом `WhatsAppGateway`. Классы Cobalt используются только в `whatsapp/cobalt/CobaltWhatsAppGateway`. Замена на sidecar Baileys сводится к новой реализации интерфейса.

## Проверка актуальности

| Что | Результат |
| --- | --- |
| Последний релиз на Maven Central | 0.0.10, опубликован 20.07.2025. Более новых артефактов нет |
| Репозиторий GitHub | Auties00/Cobalt: не в архиве, ~930 звёзд, последний push 15.07.2026 (переход на новую модульную структуру) |
| GitHub Releases | не публикуются, релизы идут только в Maven Central |
| Baileys для сравнения | npm `latest` = 7.0.0-rc14 (release candidate), стабильная ветка 6.7.24 помечена `legacy` |
| Совместимость с JDK 25 | собрано под Java 21, на JDK 25 работает без флагов `--add-opens` |
| Зависимости | `aspose-words` отсутствует в Maven Central (нужен только для превью документов) — исключён. `slf4j-nop` исключён, чтобы не глушить logback |

## Живая проверка

Тест `src/test/java/kz/wasender/spike/CobaltSpikeTest.java` (запуск `./gradlew spike`) подключается к настоящему `wss://web.whatsapp.com/ws/chat` без браузера и ждёт QR:

```
SPIKE text bytes equal=true
SPIKE QR payload length=239 commas=4
SPIKE session files=1
BUILD SUCCESSFUL
```

То есть Noise-handshake с текущей версией протокола проходит, сервер выдаёт QR для multi-device привязки (формат `ref,noiseKey,identityKey,advSecret,platform`), auth state записывается на диск. Версия веб-клиента берётся динамически с `web.whatsapp.com` (`AppMetadata`, `client_revision`), поэтому устаревание зашитой версии не грозит.

Скан QR и отправка на реальный номер в спайке не выполнялись — это требует телефона заказчика (раздел «Когда остановиться»).

## Критерии

| Критерий | Статус | Как подтверждено |
| --- | --- | --- |
| Работает без браузера | Подтверждено | Чистый WebSocket + Noise + Signal на Java, живой тест получил QR |
| Multi-device | Подтверждено | `Whatsapp.webBuilder()` = companion-устройство MD, QR формата MD, привязка через «Связанные устройства» |
| Признак «в архиве» у чатов | Подтверждено по исходникам | `Chat.archived()`; выставляется из app-state sync (`AppStateHandler`: `ArchiveChatAction -> chat.setArchived`) |
| Список групп и право на запись | Подтверждено по исходникам | `store().chats()` + `Chat.isGroup()`; при первом логине Cobalt сам делает запрос `w:g2 participating`. `queryGroupMetadata()` отдаёт участников с ролями и `getPolicy(GroupSetting.SEND_MESSAGES)` (ANYONE/ADMINS) |
| Отправка текста в группу | Подтверждено по исходникам | `sendChatMessage(Jid, MessageContainer.of(text), false)` |
| *Жирный* и эмодзи передаются как есть | Подтверждено тестом и по исходникам | `MessageContainer.of(text)` кладёт строку в `TextMessage` без изменений (тест `textWithMarkupAndEmojiIsWrappedUnchanged` сравнивает UTF-8 байты). Разметку `*...*` рендерит клиент WhatsApp. Превью ссылок (`TextPreviewSetting.ENABLED_WITH_INFERENCE`) может переписать текст, поэтому в шлюзе оно выключено: `TextPreviewSetting.DISABLED` |
| Presence «печатает» | Подтверждено по исходникам | `changePresence(jid, ContactStatus.COMPOSING)` шлёт `chatstate/composing` в чат |
| Сохранение auth state на диск | Подтверждено живым тестом | `ControllerSerializer.toProtobuf(dir)` пишет сессию в volume, `lastConnection()` поднимает её после рестарта |
| Выдача QR | Подтверждено живым тестом | `QrHandler.toPlainString(consumer)` отдаёт сырую строку, PNG и ASCII рисуем сами через ZXing |
| Событие разлогина | Подтверждено по исходникам | `addDisconnectedListener`: `DisconnectReason.LOGGED_OUT` / `BANNED` / `RECONNECTING` / `DISCONNECTED` |
| Событие удаления из группы | Подтверждено по исходникам | системное сообщение `ChatMessageInfo.stubType() == GROUP_PARTICIPANT_REMOVE` / `GROUP_PARTICIPANT_LEAVE`, в `stubParameters()` JID удалённого |

## Риски и что проверить на реальном номере

1. Артефакт 0.0.10 старше года, а протокол WhatsApp меняется. Handshake и QR работают сегодня, но отправку, архивные флаги и LID-адресацию нужно подтвердить на тестовом номере. Если что-то сломается, перейти на Baileys sidecar за тем же интерфейсом.
2. Архивный флаг приходит через app-state sync после привязки. Если чат ещё не появился в store, флаг применится при следующей синхронизации. Поэтому первая синхронизация групп идёт через `GROUPS_INITIAL_SYNC_DELAY` (60 с), затем раз в час. Список нужно сверить с телефоном через `GET /api/groups`.
3. Cobalt снимает архив с чата при новом входящем сообщении, если на телефоне выключено «Оставлять чаты в архиве». На тестовом телефоне эту настройку нужно **включить** (WhatsApp → Настройки → Чаты → «Оставлять чаты в архиве»), иначе группы будут выпадать из рассылки.
4. `queryGroupMetadata` по каждой архивной группе — сетевой запрос. Результат кешируется на `WA_METADATA_TTL` (6 ч), между запросами пауза `WA_METADATA_QUERY_DELAY`.
