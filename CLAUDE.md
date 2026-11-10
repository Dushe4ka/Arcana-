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
  cabinet/  Личный кабинет игрока (Next.js) — баланс, статистика, покупка кристаллов через
            ЮKassa; вход только по одноразовому коду из мобильного приложения
packages/
  shared/   Общие TypeScript-типы и Zod-схемы для admin/mobile (backend на Python использует
            свои Pydantic-схемы с той же формой данных — оба намеренно держатся в синхронизации)
```

`apps/api` — самостоятельный Python-проект (свой virtualenv, requirements.txt), **не входит**
в pnpm workspace. `apps/mobile`, `apps/cabinet`, `apps/admin` и `packages/shared` — pnpm
workspace (Turborepo).

`apps/cabinet` (личный кабинет игрока) и `apps/admin` (Next.js веб-панель для сценаристов)
оба существуют в дереве; `apps/admin` ещё в работе.

Архитектура:

```
Mobile App     ─┐
Player Cabinet  ├─▶ Backend API (Python/FastAPI) ─▶ PostgreSQL
Admin Panel    ─┘  (admin ещё в работе)
```

Backend — на Python по требованию владельца продукта; мобильное приложение, личный кабинет
игрока (`apps/cabinet`) и админ-панель (`apps/admin`, ещё в работе) — на TypeScript/React,
обращаются к Python-серверу через обычный HTTP API.

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

### Личный кабинет игрока (apps/cabinet)

```bash
cd apps/cabinet
cp .env.local.example .env.local     # API_BASE_URL (backend, с /api); COOKIE_SECURE
pnpm --filter @arcana/cabinet dev    # Next.js dev на порту 3100
pnpm --filter @arcana/cabinet typecheck
pnpm --filter @arcana/cabinet lint
pnpm --filter @arcana/cabinet build
```

`API_BASE_URL` — server-only адрес backend (браузер напрямую в backend не ходит); в проде
обязателен. `COOKIE_SECURE` в проде включён по умолчанию (`"false"` — только для явного
переопределения), локальный dev его игнорирует. Тест-раннера у `apps/cabinet` нет.

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
uvicorn app.main:asgi_app --reload --port 4000
```

API: `http://localhost:4000/api`, автодокументация (Swagger): `http://localhost:4000/docs`.

`app.main` экспортирует два ASGI-объекта: `app` — сам `FastAPI()`-инстанс (нужен тестам,
`tests/conftest.py` использует `app.dependency_overrides`), и `asgi_app` — `app`, обёрнутый
снаружи в `CORSMiddleware`. Обслуживать (`uvicorn`, деплой) нужно именно `asgi_app`: только
внешняя обёртка гарантирует заголовок `Access-Control-Allow-Origin` даже на ответах, которые
падают на уровне `ServerErrorMiddleware` (структурно всегда самый внешний слой, выше любого
`app.add_middleware(...)`) — например, при ошибке сериализации `response_model`, минуя даже
catch-all хендлер в `app/core/errors.py`.
После сидирования: `admin@arcana.app` / `ChangeMe123!` (обязательно сменить перед продакшном).

```bash
ruff check app seed.py            # линт (E, F, I, UP, B; line-length 110)
ruff format app seed.py
pytest                             # asyncio_mode=auto; нужна БД с именем на *_test (conftest.py)
alembic revision --autogenerate -m "..."   # новая миграция после изменения моделей
python -m app.devtools.engine_test_story   # (пере)создать техническую историю для проверки движка
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
- **play** — живое прохождение (`app/services/play_service.py`) поверх ядра `app/engine/` —
  см. «Движок чтения» ниже. Старт/продолжение/выбор/откат/перезапуск/журнал реплик.
- **qa / publications / import / localization / analytics** (`app/services/*_service.py`) —
  проверка сюжета, версии публикаций, импорт сценария из текста/DOCX, экспорт-импорт
  переводов, воронка глав и статистика выборов. Все доступны только сотрудникам.
- **wallet** — soft/hard валюта, энергия/билеты на открытие глав, ежедневные награды.

Модель контента: `Story → Season → Chapter → SceneNode` (типы: `DIALOGUE`/`CHOICE`/
`CONDITION`/`EFFECT`/`END`); узлы `CHOICE` имеют связанные `ChoiceOption`. Локализуемые
тексты хранятся как JSONB `{ru: "...", en: "..."}` — `ru` обязателен, остальные опциональны.

Переменные/отношения — `VariableDefinition` (опционально привязана к `Character`, задаёт
min/max); значения игрока живут в состоянии слота (см. ниже). `Condition`/`Effect`
(`app/schemas/common.py`, зеркалятся в `packages/shared/src/schemas/common.ts`) — JSON-структуры,
которые пишет сценарист; интерпретирует их движок чтения во время прохождения.

### Движок чтения (app/engine)

Одно чистое детерминированное ядро — `app/engine/runtime.py` — без БД, сети и кошелька:
получает граф (`StoryGraph`) и состояние (`EngineState`), возвращает новое состояние. На нём
работают и живая игра (`play_service`), и авторское превью (`preview_service`), и проверка
сюжета (`narrative_qa`) — логика переходов существует в одном экземпляре, не дублировать её.

- `runtime.run_until_rest` автоматически проходит `CONDITION`/`EFFECT` до узла, который нужно
  показать (`DIALOGUE`/`CHOICE`/`END`); ограничено `MAX_AUTO_TRAVERSAL_STEPS = 100`.
- `loader.py` строит граф из БД. Игра подгружает узлы лениво (только те, что нужны действию,
  плюс их прямые продолжения) — не загружать главу целиком в `play_service`.
- `views.py` превращает точку остановки в JSON для клиента (включая блок `stage`).

**Состояние прохождения хранится в слоте** — `save_slots.state` (JSONB): явно изменённые
переменные, сцена (`stage`: фон, музыка, атмосфера, камера, CG), история для отката, путь
для журнала реплик, снимки на старт каждой главы. Каждый слот — независимое прохождение.
Таблица `player_variable_values` осталась как исторические данные и движком не используется.

**Одно действие игрока = одна транзакция** (`play_service`): блокировка строки слота →
запуск ядра в памяти → запись состояния, кошелька, прав и наград → один `commit`. Функции
`wallet_service` принимают `commit=False`, чтобы войти в чужую транзакцию, и всегда берут
`SELECT ... FOR UPDATE` на кошелёк. Идемпотентность: платный выбор — право аккаунта
(`player_choice_unlocks`), награда за главу — один раз (`player_chapter_completions`),
повтор запроса с устаревшим `nodeId` ничего не делает.

**Игроки читают публикацию, а не редактируемые узлы.** «Опубликовать» прогоняет проверку
сюжета и замораживает граф главы в `chapter_publications` + `published_nodes`;
`Chapter.published_version` указывает на живую версию. Правки в `scene_nodes` игрокам не
видны до следующей публикации; прежнюю версию можно вернуть. В тестах вместо эндпоинта
публикации используйте фикстуру `publish` / `publications_service.snapshot`.

**Проверка сюжета** (`app/engine/narrative_qa.py`): структурный проход + реальный обход всех
веток; ошибки блокируют публикацию главы (в т.ч. через `PATCH {status}`). Главы
анализируются по порядку, каждая стартует с состояний, которыми можно закончить предыдущую.

Техническая история «ARCANA ENGINE TEST» (`app/devtools/engine_test_story.py`, `is_test`):
видна только сотрудникам, использует все возможности движка, ассеты генерируются кодом.
Это НЕ каноническая история — не превращать её в пользовательский контент.

Все Pydantic-схемы запроса/ответа наследуют `CamelModel` (`app/schemas/base.py`): поля в
Python — snake_case, JSON на входе/выходе — camelCase, ровно то, что ожидают мобильное
приложение и (будущая) админка на TypeScript.

Единый формат ошибок для всех ответов (см. `app/core/errors.py`): `{statusCode, path,
timestamp, message, issues?}` — регистрируется как глобальные exception-хендлеры в `main.py`,
а не проверяется вручную в каждом роутере.

## Архитектура mobile (apps/mobile)

Expo Router (файловая маршрутизация): `app/(auth)/*` — вход/регистрация, `app/(app)/*` —
основной стек за авторизацией (`(tabs)` — каталог + профиль, `story/[id]` — карточка истории),
`app/read/[slotId]` — экран чтения. Он полностью управляется блоком `stage` из ответа сервера
(фон, музыка, CG, атмосфера, камера, разовые эффекты) — клиент не хранит собственного состояния
сцены, поэтому возобновление сохранения восстанавливает всё само. Компоненты — в
`components/reader/`, настройки чтения — `lib/reader-settings.ts` (хранятся на устройстве),
звук — `lib/audio.ts` (`expo-audio` подключается через защищённый `require`: OTA-обновление не
должно ронять сборку, собранную без этого нативного модуля).

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

- `pytest` в `apps/api` требует одноразовую БД, имя которой оканчивается на `_test` (см.
  `tests/conftest.py`) — например `DATABASE_URL=postgresql+asyncpg://localhost/arcana_test`.
