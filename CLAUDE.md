# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это за проект

Arcana — мобильное приложение интерактивных визуальных новелл (жанр «Клуб Романтики»).
Контент (истории, диалоги, выборы, ветвления) хранится в базе данных и публикуется через
админ-панель — без релиза новой версии приложения.

Репозиторий — гибридный монорепозиторий:

```
apps/
  api/      Backend на Python (FastAPI) — единый API для мобильного приложения и (будущей) админ-панели
  mobile/   React Native (Expo) приложение — iOS/Android/Web из одного кода
packages/
  shared/   Общие TypeScript-типы и Zod-схемы для admin/mobile (backend на Python использует
            свои Pydantic-схемы с той же формой данных — оба намеренно держатся в синхронизации)
```

`apps/api` — самостоятельный Python-проект (свой virtualenv, requirements.txt), **не входит**
в pnpm workspace. `apps/mobile` и `packages/shared` — pnpm workspace (Turborepo).

`apps/admin` (Next.js веб-панель для сценаристов) упоминается в README как часть архитектуры,
но ещё не создана в этом дереве — пока это только план.

Архитектура:

```
Mobile App  ─┐
             ├─▶ Backend API (Python/FastAPI) ─▶ PostgreSQL
Admin Panel ─┘  (пока не реализована)
```

Backend — на Python по требованию владельца продукта; мобильное приложение (и будущая
админ-панель) — на TypeScript/React, обращаются к Python-серверу через обычный HTTP API.

## Команды

### JS/TS workspace (корень репозитория, pnpm + Turborepo)

```bash
pnpm install                     # установить зависимости всего workspace
pnpm dev                         # turbo run dev по всем пакетам (persistent)
pnpm build                       # turbo run build (packages/shared должен собраться первым)
pnpm lint                        # turbo run lint
pnpm typecheck                   # turbo run typecheck
pnpm format                      # prettier --write по всему репо
```

Точечно по одному пакету: `pnpm --filter @arcana/mobile <script>` /
`pnpm --filter @arcana/shared <script>`.

`packages/shared` нужно собрать (`pnpm --filter @arcana/shared build`) перед тем, как
`apps/mobile` увидит свежие изменения типов/схем — `main`/`types` в его package.json указывают
на `./dist`, а не на `src`.

`.npmrc` намеренно включает `node-linker=hoisted` — Metro (бандлер Expo) не умеет резолвить
symlink-based `node_modules` от pnpm по умолчанию; это официальная рекомендация Expo для pnpm.
Не убирать эту настройку.

### Мобильное приложение (apps/mobile)

```bash
cd apps/mobile
cp .env.example .env             # укажите EXPO_PUBLIC_API_URL вашего backend
npx expo start                   # запуск в Expo Go — самый быстрый способ проверки без сборки APK
npm run android / ios / web      # то же самое с конкретной платформой
npm run lint                     # expo lint
npm run typecheck                # tsc --noEmit
```

Сборка `.apk` возможна только через облачный EAS Build (`eas build --platform android
--profile preview`), т.к. нужен доступ к серверам expo.dev. Перед сборкой указать реальный
публичный адрес backend в `eas.json` → `build.preview.env.EXPO_PUBLIC_API_URL` (после сборки
`localhost` на телефоне означает сам телефон, а не сервер разработчика).

CI (`.github/workflows/eas-update.yml`) автоматически публикует OTA-обновление на канал
`preview` через `eas-cli update` при пуше в `main`, если менялись `apps/mobile/**` или
`packages/shared/**` — требует секрет `EXPO_TOKEN`.

### Backend (apps/api)

Самостоятельный Python-проект, не управляется через pnpm/turbo.

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt   # включает requirements.txt + pytest/httpx/ruff

cp .env.example .env                  # DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ...
alembic upgrade head                  # применить миграции
python seed.py                        # создать admin-пользователя + играбельную демо-историю
uvicorn app.main:app --reload --port 4000
```

API: `http://localhost:4000/api`, автодокументация (Swagger): `http://localhost:4000/docs`.
После сидирования: `admin@arcana.app` / `ChangeMe123!` (обязательно сменить перед продакшном).

```bash
ruff check app seed.py            # линт (E, F, I, UP, B; line-length 110)
ruff format app seed.py
pytest                             # asyncio_mode=auto; каталог tests/ пока пуст — тестов ещё нет
alembic revision --autogenerate -m "..."   # новая миграция после изменения моделей
```

`Settings` (`app/config.py`, pydantic-settings) валидируется при старте процесса — приложение
падает сразу при отсутствующей/некорректной переменной окружения, а не посреди обработки запроса.

## Архитектура backend (apps/api)

Модульный монолит: FastAPI + SQLAlchemy 2.0 (async, asyncpg) + Alembic + PostgreSQL.
Слои: `routers/` (HTTP + auth-зависимости) → `services/` (бизнес-логика) → `models/`
(SQLAlchemy ORM) / `schemas/` (Pydantic — валидация входа и форма ответа).

- **auth** — регистрация/вход, JWT access+refresh с ротацией (refresh-токены хранятся
  хэшированными в `refresh_tokens`, отзываются при логауте/повторном использовании).
- **content** (routers: `stories`, `characters`, `scenes`) — CRUD историй/сезонов/глав/
  персонажей/переменных/сцен, доступен только ролям `WRITER`/`EDITOR`/`ADMIN`
  (`require_roles(...)` в `app/core/deps.py`).
- **catalog** — публичный read-only каталог опубликованных историй для мобильного приложения,
  без авторизации.
- **play** — «движок чтения» (`app/services/play_service.py` + `app/engine/condition_engine.py`).
- **wallet** — soft/hard валюта, энергия/билеты на открытие глав, ежедневные награды.

Модель контента: `Story → Season → Chapter → SceneNode` (типы: `DIALOGUE`/`CHOICE`/
`CONDITION`/`EFFECT`/`END`); узлы `CHOICE` имеют связанные `ChoiceOption`. Локализуемые
тексты хранятся как JSONB `{ru: "...", en: "..."}` — `ru` обязателен, остальные опциональны.

Переменные/отношения — `VariableDefinition` (опционально привязана к `Character`, задаёт
min/max) + `PlayerVariableValue` (значение конкретного игрока). `Condition`/`Effect`
(`app/schemas/common.py`, зеркалятся в `packages/shared/src/schemas/common.ts`) — JSON-структуры,
которые пишет сценарист; интерпретирует их движок чтения во время прохождения.

Движок чтения (`play_service._resolve_view`) в цикле автоматически проходит узлы `CONDITION`
(оценивает `evaluate_condition_group` и выбирает `then`/`else` ветку) и `EFFECT` (применяет
эффекты к переменным игрока), пока не дойдёт до `DIALOGUE`/`CHOICE`/`END` — узла, требующего
показа игроку или завершения. Ограничено `MAX_AUTO_TRAVERSAL_STEPS = 100` для защиты от
случайного цикла в графе сцен, написанном сценаристом.

Все Pydantic-схемы запроса/ответа наследуют `CamelModel` (`app/schemas/base.py`): поля в
Python — snake_case, JSON на входе/выходе — camelCase, ровно то, что ожидают мобильное
приложение и (будущая) админка на TypeScript.

Единый формат ошибок для всех ответов (см. `app/core/errors.py`): `{statusCode, path,
timestamp, message, issues?}` — регистрируется как глобальные exception-хендлеры в `main.py`,
а не проверяется вручную в каждом роутере.

## Архитектура mobile (apps/mobile)

Expo Router (файловая маршрутизация): `app/(auth)/*` — вход/регистрация, `app/(app)/*` —
основной стек за авторизацией (`(tabs)` — каталог + профиль, `story/[id]` — карточка истории),
`app/read/[slotId]` — экран чтения (фон, спрайты персонажей, диалоги/мысли, выбор с ценой).

Состояние — zustand-сторы в `lib/` (`auth-store.ts`, `wallet-store.ts`). `lib/api.ts` — единая
точка HTTP-запросов (`apiRequest`), которая не импортирует store напрямую (во избежание
циклической зависимости); вместо этого `auth-store.ts` при загрузке модуля сам вызывает
`configureApi({...})`, передавая геттер токена и обработчик 401. Благодаря этому `apiRequest`
прозрачно обновляет access-токен через refresh-токен и повторяет запрос ровно один раз — ни
один компонент не думает об истечении токена сам. Токены и профиль пользователя персистятся
через `expo-secure-store`.

`packages/shared` — источник истины для форм данных (enum-константы + Zod-схемы), которые
Python-схемы (`CamelModel`) обязаны зеркалить по значению и camelCase-форме, но не по коду —
общего рантайма между Python и TS нет, синхронизация ручная при изменении контракта.

## Заметки

- `README.md` в рабочей копии сейчас усечён до заголовка (незакоммиченное изменение) — более
  подробная версия с описанием структуры репозитория и статуса разработки лежит в
  `git show HEAD:README.md`, часть этого текста перенесена сюда.
