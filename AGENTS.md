# Engineering Rules (Agents)

English is the primary language of this file.
RU notes are included in each rule for quick clarification.

## Normative Keywords (RU: Сила требований)
- **MUST:** Mandatory and non-negotiable. (RU: Обязательно.)
- **SHOULD:** Strong default; deviations require clear justification. (RU: Рекомендуется, отклонение нужно объяснить.)
- **MUST NOT:** Prohibited. (RU: Запрещено.)

## How to Run (RU: Как запускать)
- **MUST:** Install dependencies via `pnpm install`. (RU: Устанавливай зависимости через `pnpm install`.)
- **MUST:** Generate Prisma Client with `pnpm prisma generate` after schema changes. (RU: После изменений схемы обязательно генерируй Prisma Client.)
- **MUST:** Use `pnpm prisma migrate dev --name "<msg>"` for local dev migrations. (RU: Для dev-миграций используй эту команду.)
- **SHOULD:** Run the app locally with `pnpm dev`. (RU: Локальный запуск через `pnpm dev`.)
- **SHOULD:** Run tests with `pnpm test`. (RU: Тесты запускать через `pnpm test`.)

## Quality Gate (Definition of Done) (RU: Контроль качества)
- **MUST:** After completing a task, run `pnpm exec tsc --noEmit`. (RU: После задачи обязательно прогоняй проверку TypeScript.)
- **MUST:** After completing a task, run `pnpm lint`. (RU: После задачи обязательно прогоняй линтер.)
- **SHOULD:** Run `pnpm build` when changing RSC boundaries, Server Actions, or page/client architecture. (RU: Особенно важно при изменениях RSC, Server Actions и архитектуры страниц/клиентских компонентов.)

## UI / Design System
- **SHOULD:** Use `shadcn/ui` for new UI elements. (RU: Для новых UI-элементов предпочитай `shadcn/ui`.)
- **MUST:** Use `Tailwind` together with `shadcn/ui`. (RU: Используй `Tailwind` совместно с `shadcn/ui`.)
- **MUST NOT:** Change global theme tokens without a dedicated task. (RU: Не меняй глобальные токены темы без отдельной задачи.)

## Code Rules (RU: Правила кода)
- **MUST:** Use TypeScript with `strict` and ESM. (RU: TypeScript в режиме `strict`, формат модулей ESM.)
- **MUST:** Implement forms with `React + RHF + Zod`. (RU: Формы реализуются через `React + RHF + Zod`.)
- **MUST:** Keep validation in Zod schemas. (RU: Валидацию держим в `Zod`-схемах.)
- **SHOULD:** Move heavy business logic from components into hooks/services. (RU: Тяжелую бизнес-логику выносить из компонентов в хуки/сервисы.)
- **MUST NOT:** Duplicate business logic across UI layers without a shared source. (RU: Не дублировать бизнес-логику в разных UI-слоях без общего источника.)

## Server Actions
- **MUST:** Keep server actions only in `app/actions/*.ts`. (RU: Server actions храним только в `app/actions/*.ts`.)
- **MUST:** Put `'use server'` at file level in `app/actions/*`. (RU: Директива `'use server'` должна быть на уровне файла.)
- **MUST NOT:** Declare client-used server actions in `page.tsx` or UI components. (RU: Не объявляй server actions в `page.tsx`/UI-компонентах, если их вызывает клиент.)
- **SHOULD:** Follow composition: `page.tsx` (Server) -> `*Client.tsx` (Client UI) -> `app/actions/*` (Server Actions). (RU: Следуй этой композиции слоев.)

## Server/Client Boundaries (RSC) (RU: Границы Server/Client)
- **MUST:** Pass only serializable data and server actions to Client Components via props. (RU: В Client Components через props передавать только сериализуемые данные и server actions.)
- **MUST NOT:** Pass regular functions/helpers to Client Components via props. (RU: Не передавать обычные функции/хелперы в props клиентских компонентов.)
- **MUST:** Keep auth checks, DB access, and session logic on the server. (RU: Проверки прав, доступ к БД и сессию обрабатывать на сервере.)
- **MUST:** Pass computed results to the client, not computation functions. (RU: На клиент передавать результат вычислений, а не функции вычислений.)
- **MUST NOT:** Import server modules (`auth/db/prisma/role-check`) into `'use client'` files. (RU: Не импортировать серверные модули в файлы с `'use client'`.)

## i18n
- **MUST:** Use `next-intl` (App Router). (RU: Используй `next-intl` в App Router.)
- **MUST:** Support `ru` (default), `uk`, and `en`. (RU: Поддерживаем `ru` (по умолчанию), `uk`, `en`.)
- **MUST:** Render all user-facing strings via `t()`. (RU: Все пользовательские строки выводить только через `t()`.)
- **MUST NOT:** Hardcode user-facing strings. (RU: Не хардкодить пользовательские строки.)
- **SHOULD:** Format dates/currency via `useFormatter()`. (RU: Даты и валюты форматировать через `useFormatter()`.)
- **MUST:** Source Zod/RHF validation messages from i18n. (RU: Сообщения валидации брать из i18n.)
- **MUST:** Keep `messages/en/*.json` as source of truth, then sync `uk` and `ru`. (RU: Источник правды `messages/en/*.json`, затем синхронизировать `uk/ru`.)

## State Management: Zustand
- **MUST:** Organize stores by domain slices in `src/stores/*`. (RU: Организовывать сторы по доменным слайсам в `src/stores/*`.)
- **MUST:** Update state only through actions (`set()`/immer). (RU: Обновлять состояние только через экшены `set()`/immer.)
- **MUST NOT:** Mutate state outside `set()`/immer. (RU: Не мутировать состояние вне `set()`/immer.)
- **SHOULD:** Keep complex business logic in services/helpers. (RU: Сложную бизнес-логику держать в сервисах/хелперах.)
- **MUST:** Use `persist` only for serializable data. (RU: `persist` использовать только для сериализуемых данных.)
- **MUST NOT:** Store functions/classes/`Date` in `persist` without explicit serialization. (RU: Не сохранять функции/классы/`Date` в `persist` без явной сериализации.)
- **SHOULD:** Use selectors and `shallow` in components. (RU: В компонентах использовать селекторы и `shallow`.)
- **MUST:** Every store must expose `reset()`. (RU: У каждого стора должен быть `reset()`.)

## Prisma / DB
- **MUST:** After `schema.prisma` changes, update migrations, update seed when needed, and verify dependent forms/validations. (RU: После изменений `schema.prisma` обновить миграции, при необходимости `seed`, и проверить зависимые формы/валидации.)
- **SHOULD:** Keep calculation business rules in one server-side place (service/helper). (RU: Бизнес-правила расчётов держать в одном серверном месте.)

## Security (RU: Безопасность)
- **MUST NOT:** Commit `.env*` files. (RU: Не коммитить `.env*`.)
- **MUST:** Keep secrets only in environment configuration. (RU: Секреты хранить только в настройках окружения.)
- **MUST:** When changing NextAuth, verify schema, seed, roles, and access logic. (RU: При изменениях NextAuth проверять схему, seed, роли и доступы.)
- **MUST NOT:** Change providers/strategies without corresponding updates. (RU: Не менять провайдеры/стратегии без связанных обновлений.)

## Anti-Patterns (RU: Антипаттерны)
- **MUST NOT:** Declare client-invoked server actions inside `page.tsx`. (RU: Не объявлять server actions в `page.tsx`, если их вызывает клиент.)
- **MUST NOT:** Use `'use server'` inside individual functions instead of file-level directive. (RU: Не использовать `'use server'` внутри функций вместо директивы на уровне файла.)
- **MUST NOT:** Pass regular functions to Client Components. (RU: Не передавать обычные функции в Client Components.)
- **MUST NOT:** Import `auth/db/prisma` into `'use client'` files. (RU: Не импортировать `auth/db/prisma` в `'use client'` файлы.)
- **MUST NOT:** Hardcode user-facing strings and validation error texts. (RU: Не хардкодить пользовательские строки и тексты ошибок валидации.)
- **MUST NOT:** Store non-serializable data in Zustand `persist`. (RU: Не хранить несериализуемые данные в Zustand `persist`.)

## Proposed Improvements (RU: Предложения по улучшению)
- **SHOULD:** Add CI checks that fail on missing i18n keys across `en/ru/uk`. (RU: Добавить CI-проверку на отсутствующие ключи локализации.)
- **SHOULD:** Add lint boundaries to forbid server imports inside `'use client'` modules automatically. (RU: Добавить lint-ограничения, чтобы автоматически блокировать серверные импорты в клиентских файлах.)

