# Админка wa-group-sender

React 19 + Vite + TypeScript (strict). Собирается в Docker-образ сервиса: Vite кладёт `dist/` в статику Spring Boot —
один образ, один адрес, вход через HttpOnly-cookie без CORS. Отдельно не деплоится.

## Технологии

| Задача | Чем |
| --- | --- |
| Данные с сервера, кэш, автообновление | TanStack Query |
| Типы API | `openapi-typescript` из OpenAPI бэкенда (springdoc) → `src/shared/api/schema.d.ts`, клиент `openapi-fetch` |
| Маршруты | React Router 7: `/login`, `/campaigns[/new\|/:id\|/:id/edit]`, `/groups`, `/connection`, `/settings`; суперадмин — `/platform`, `/platform/tenants/:id`, `/platform/audit` (`/campaigns/12` — ссылкой можно поделиться) |
| UI | Tailwind 4 (токены в `src/styles/index.css`, светлая/тёмная тема по системе), Radix (окна, меню, поповеры), иконки `lucide-react`. Правила — `DESIGN.md` |
| Формы | react-hook-form + zod |
| Тесты | Vitest (`src/**/*.test.ts(x)`, логика), Playwright (`e2e/`, против бэкенда в профиле `fake`) |

## Структура

```
src/
├── app/        точка входа приложения: провайдеры, роутер, меню, вход
├── pages/      экраны — собирают фичи, своей логики почти нет
├── features/   разделы по смыслу: campaigns, groups, settings, telegram, connection, reports, auth, health, platform
│   └── <фича>/ api.ts (запросы и ключи кэша), model.ts / form.ts (чистая логика + тесты), компоненты
├── shared/
│   ├── api/    клиент, сгенерированные типы, алиасы типов
│   ├── lib/    форматирование дат и чисел, разметка WhatsApp, скачивание, постраничность (paging.ts)
│   └── ui/     кнопки, поля, select времени, сегменты, меню, окна и шторки, подтверждения, pager, пузырь WhatsApp
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

### Постраничный вывод

Длинные списки (группы, результаты рассылки, получатели) — через `usePaging` из `shared/lib/paging.ts` и `Pager` из
`shared/ui/pager.tsx`: размеры страницы 10 / 25 / 50 / 100, выбранный размер запоминается в `localStorage` для каждого
списка (`wa.pageSize.<ключ>`), при смене фильтра или поиска — снова первая страница. Список до 10 строк — без pager.

### E2E

Только против бэкенда в профиле `fake` — никогда против прода (тесты создают заявки). Как в CI: образ в профиле fake на
`127.0.0.1:18080`, вход `admin` с паролем `E2E_PASSWORD` (по умолчанию `demo-pass`):

```bash
docker build -t wa-group-sender:e2e ..   # из frontend/: образ всего сервиса
hash=$(docker run --rm httpd:2.4-alpine htpasswd -nbBC 10 x demo-pass | cut -d: -f2)
docker run -d --name wa-e2e -p 127.0.0.1:18080:8080 -e SPRING_PROFILES_ACTIVE=fake -e SHEETS_ENABLED=false \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD_HASH="$hash" -e ADMIN_TOKEN=e2e \
  -e SPRING_DATASOURCE_URL="jdbc:h2:mem:e2e;DB_CLOSE_DELAY=-1" -e APP_TENANCY_DB_URL="jdbc:h2:mem:e2e-{name};DB_CLOSE_DELAY=-1" \
  wa-group-sender:e2e
docker run --rm --network host -e E2E_PASSWORD=demo-pass -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.49.0-noble npx playwright test
```

Проекты: `desktop` (все тесты) и `phone` (Pixel 7, только `@phone`). Анимации выключены (`reducedMotion: 'reduce'`).
Трейсы и скриншоты — `test-results/`, `e2e-results/` (в CI — артефакт `e2e-results`).

| Файлы | Что проверяют |
| --- | --- |
| `admin`, `ui`, `campaign-card`, `groups`, `settings-pause`, `platform`, `tenants` | сценарии: вход, заявки, карточка и результаты, группы и списки, настройки, кабинеты |
| `pagination`, `large-lists`, `list-shots` | pager и длинные списки |
| `layout`, `layout-fixes`, `select-width` | вёрстка на 360 / 390 / 768 / 1024 / 1440 px, светлая и тёмная тема (`e2e/support/layout.ts`) |

`expectLayout` в `e2e/support/layout.ts` проверяет каждый экран: нет горизонтального скролла страницы, ничто не
выходит за карточку (`[data-card]`), шеврон select внутри поля, иконки по центру, сегменты одинаковые и в одну линию,
контраст текста ≥ 4.5:1, высота контролов 32–36px при `pointer: fine` и ≥ 44px при `pointer: coarse`. Скриншоты —
`e2e-results/layout/`. Данные для вёрстки подставляются моками (`e2e/support/layout-data.ts`, `platform.ts`).

CI (`frontend` в `.github/workflows/ci.yml`): `pnpm typecheck`, `lint`, `test`, `build`; джоба `e2e` собирает образ и
гоняет Playwright.
