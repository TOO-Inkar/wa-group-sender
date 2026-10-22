# Админка wa-group-sender

React 19 + Vite + TypeScript (strict). Собирается в Docker-образ сервиса: Vite кладёт `dist/` в статику Spring Boot —
один образ, один адрес, вход через HttpOnly-cookie без CORS. Отдельно не деплоится.

## Технологии

| Задача | Чем |
| --- | --- |
| Данные с сервера, кэш, автообновление | TanStack Query |
| Типы API | `openapi-typescript` из OpenAPI бэкенда (springdoc) → `src/shared/api/schema.d.ts`, клиент `openapi-fetch` |
| Маршруты | React Router 7 (`/campaigns/12` — ссылкой можно поделиться) |
| UI | Tailwind 4 (токены цветов в `src/styles/index.css`, светлая/тёмная тема), Radix (модальные окна) |
| Формы | react-hook-form + zod |
| Тесты | Vitest (логика), Playwright (e2e против бэкенда в профиле `fake`) |

## Структура

```
src/
├── app/        точка входа приложения: провайдеры, роутер, меню, вход
├── pages/      экраны — собирают фичи, своей логики почти нет
├── features/   разделы по смыслу: campaigns, groups, settings, telegram, connection, reports, auth, health
│   └── <фича>/ api.ts (запросы и ключи кэша), model.ts / form.ts (чистая логика + тесты), компоненты
├── shared/
│   ├── api/    клиент, сгенерированные типы, алиасы типов
│   ├── lib/    форматирование дат и чисел, разметка WhatsApp, скачивание
│   └── ui/     кнопки, поля, модальные окна, подтверждения
└── styles/
```

Правило зависимостей: `pages → features → shared`. Фича может брать хуки другой фичи (форма заявки — списки групп),
но не её внутренние компоненты.

## Команды

На сервере Node нет — всё через обёртку `scripts/pnpm.sh` (Node 22 в контейнере):

```bash
scripts/pnpm.sh install
scripts/pnpm.sh typecheck | lint | test | build
BACKEND_URL=http://127.0.0.1:18080 scripts/pnpm.sh dev --host   # http://127.0.0.1:5173, /api проксируется
```

### Типы API

Поменяли контроллер или record на бэкенде — обновите типы, иначе CI не соберётся:

```bash
# бэкенд в профиле fake на 127.0.0.1:18080, ADMIN_TOKEN=devtoken
curl -s -H 'X-Admin-Token: devtoken' 127.0.0.1:18080/api/admin/openapi | python3 -m json.tool > openapi.json
scripts/pnpm.sh api:types
```

Поля record-ов, которые бывают null, помечаются на бэкенде `@Nullable` (JSpecify) — тогда в TypeScript они `T | null`.

### E2E

Только против бэкенда в профиле `fake` — никогда против прода (тест создаёт заявки):

```bash
docker run --rm --network host -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.49.0-noble npx playwright test
```
