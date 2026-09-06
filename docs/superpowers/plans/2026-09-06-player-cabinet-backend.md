# Player Cabinet Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend support for the player cabinet site (`apps/cabinet`, a separate plan/task):
a one-time-code handoff so the mobile app can hand a player a session on the cabinet site
without a second login form, a read-only stats endpoint (relationship lines + general story
variables), and a HARD-currency purchase flow through YooKassa (create payment, webhook,
idempotent crediting).

**Architecture:** All three pieces are independent additions to the existing modular monolith
(`apps/api`) - no new service, no new process. Cabinet link tokens follow the exact storage
pattern already used for refresh tokens (hash stored, not the raw token). Stats reuses the
existing `VariableDefinition`/`PlayerVariableValue` tables, read-only, with no interaction with
the condition/effect engine. Purchases add one new table (`purchases`) and a thin YooKassa
REST client; the webhook never trusts its own request body for payment status - it always
re-fetches the payment from YooKassa's API by id first.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Alembic + PostgreSQL, same as the rest of
`apps/api`. New dependency: `httpx` (already pinned at `0.27.2` in `requirements-dev.txt` for
the test client - this plan promotes it to `requirements.txt` since production code now uses
it too, at the same pinned version for consistency).

**Spec:** `docs/superpowers/specs/2026-09-06-player-cabinet-design.md` - read it for the full
rationale (why a separate site, why deep-link-only auth, why the webhook re-fetches rather
than trusts). This plan implements exactly its "Поток входа", "Данные: вкладка статов", and
"Покупка валюты" sections; subscriptions, mini-series, and site-native login are explicitly
out of scope per that spec.

## Global Constraints

- **Money is always integer kopecks, never a float.** `price_rub_kopecks` on `Purchase` and in
  `CURRENCY_PACKAGES` is an `int`; only converted to a decimal string (`f"{kopecks / 100:.2f}"`)
  at the one point YooKassa's API requires a decimal-string amount. Never store or compare
  money as a float anywhere in this plan's code.
- **The webhook never credits currency based on its own request body.** `payments_service.handle_webhook`
  takes only a payment id from the webhook body, then calls `yookassa_client.get_payment(id)`
  to fetch the real status from YooKassa's API before crediting anything - this is what makes a
  forged/replayed webhook harmless (see spec's "Покупка валюты" section, point 4).
- **Every new settings field needs a safe default** so existing `.env` files (dev machines,
  CI, the existing `arcana_test` database) keep working without modification -
  `yookassa_shop_id`/`yookassa_secret_key` default to `""` (a real purchase attempt fails
  cleanly with a YooKassa 401 until the business supplies real/sandbox keys; this is expected
  and acceptable, not something to work around), `cabinet_base_url` defaults to
  `http://localhost:3100` (the player cabinet site's planned local dev port, distinct from the
  admin panel's `3000`).
- New tokens/secrets follow the existing hash-then-store pattern (`auth_service._hash_token`,
  reused as-is, not duplicated) - never store a raw bearer/session credential in the database.
- Every new endpoint's error paths return the existing envelope (`HTTPException` with a plain
  string `detail` - the global handler in `app/core/errors.py` already wraps it correctly, no
  new error-handling code needed).
- Follow existing conventions exactly: `CamelModel` for all request/response schemas,
  `ORMModel`/plain `CamelModel` as appropriate (see existing `app/schemas/preview.py` for the
  pattern of a feature with its own small schema file), `ruff check`/`ruff format` clean,
  `alembic revision --autogenerate` (never hand-write a migration file) followed by inspecting
  the generated file before applying it.

---

### Task 1: Cabinet link-token handoff

**Files:**
- Modify: `apps/api/app/models/user.py` (add `CabinetLinkToken`)
- Modify: `apps/api/app/models/__init__.py` (register it for Alembic)
- Modify: `apps/api/app/schemas/auth.py` (add `CabinetExchangeInput`, `CabinetLinkTokenOut`)
- Modify: `apps/api/app/services/auth_service.py` (add `create_cabinet_link_token`,
  `exchange_cabinet_link_token`)
- Modify: `apps/api/app/routers/auth.py` (add the two new routes)
- Create: `apps/api/tests/test_cabinet_link_token.py`
- Create: one new Alembic migration (via autogenerate, not hand-written)

**Interfaces:**
- Consumes: `auth_service._hash_token` (already exists, reused verbatim), `User`, existing
  `_issue_token_pair`/`_to_public_user`/`_get_display_name` helpers in `auth_service.py`.
- Produces: `POST /auth/cabinet-link-token` (authenticated - any logged-in mobile user) ->
  `{code, expiresInSeconds}`. `POST /auth/cabinet-exchange` (no auth - the code itself is the
  credential) -> full `AuthResponse` (same shape `login`/`register` return). Nothing else in
  this plan depends on this task.

- [ ] **Step 1: Add the `CabinetLinkToken` model**

In `apps/api/app/models/user.py`, add (all needed imports - `DateTime`, `ForeignKey`, `String`,
`UUID`, `Mapped`, `mapped_column`, `uuid`, `datetime`, `_utcnow` - are already imported in this
file, no new imports needed):

```python
class CabinetLinkToken(Base, UUIDPKMixin):
    """A one-time, 60-second-lived code that lets the mobile app hand a logged-in user a
    session on the player cabinet site without a second login form - see the design spec's
    "Поток входа" section. Stored hashed, exactly like RefreshToken above."""

    __tablename__ = "cabinet_link_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

In `apps/api/app/models/__init__.py`, change:

```python
from app.models.user import PlayerProfile, RefreshToken, User  # noqa: F401
```

to:

```python
from app.models.user import CabinetLinkToken, PlayerProfile, RefreshToken, User  # noqa: F401
```

- [ ] **Step 2: Generate and apply the migration**

```bash
cd apps/api
source .venv/bin/activate
alembic revision --autogenerate -m "add cabinet link tokens"
```

Open the generated file in `alembic/versions/` and confirm it ONLY creates the
`cabinet_link_tokens` table (one `op.create_table(...)` call, columns matching the model
above) - no unrelated changes. Then:

```bash
alembic upgrade head
```

- [ ] **Step 3: Add schemas**

In `apps/api/app/schemas/auth.py`, add (after the existing `RefreshTokenInput` class):

```python
class CabinetExchangeInput(CamelModel):
    code: str = Field(min_length=1)


class CabinetLinkTokenOut(CamelModel):
    code: str
    expires_in_seconds: int
```

This needs `Field` imported - change the top of the file from:

```python
from pydantic import EmailStr, Field
```

(check first - if `Field` is already imported, as it appears to be from the existing
`RegisterInput`/`LoginInput`/`RefreshTokenInput` classes, no change needed here at all.)

- [ ] **Step 4: Add the service functions**

In `apps/api/app/services/auth_service.py`, add the import (extend the existing
`from app.models.user import PlayerProfile, RefreshToken, User` line):

```python
from app.models.user import CabinetLinkToken, PlayerProfile, RefreshToken, User
```

Add a module-level constant near the top (alongside `STARTING_ENERGY`/`STARTING_SOFT_CURRENCY`):

```python
CABINET_LINK_TOKEN_TTL_SECONDS = 60
```

Add `secrets` and `timedelta` to the existing `datetime` import line - change:

```python
from datetime import UTC, datetime
```

to:

```python
import secrets
from datetime import UTC, datetime, timedelta
```

Add these two functions (anywhere after `_issue_token_pair`, e.g. right before `register`):

```python
async def create_cabinet_link_token(db: AsyncSession, user_id: str) -> str:
    code = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(seconds=CABINET_LINK_TOKEN_TTL_SECONDS)
    db.add(
        CabinetLinkToken(
            user_id=user_id,
            token_hash=_hash_token(code),
            expires_at=expires_at,
        )
    )
    await db.commit()
    return code


async def exchange_cabinet_link_token(db: AsyncSession, code: str) -> AuthResponse:
    token_hash = _hash_token(code)
    stored = await db.scalar(
        select(CabinetLinkToken).where(CabinetLinkToken.token_hash == token_hash)
    )
    now = datetime.now(UTC)
    if not stored or stored.used_at is not None or stored.expires_at < now:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Ссылка недействительна или уже использована"
        )

    stored.used_at = now
    await db.commit()

    user = await db.get(User, stored.user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")

    display_name = await _get_display_name(db, user.id)
    tokens = await _issue_token_pair(db, user)
    return AuthResponse(user=_to_public_user(user, display_name), **tokens.model_dump())
```

- [ ] **Step 5: Add the routes**

In `apps/api/app/routers/auth.py`, extend the schema import:

```python
from app.schemas.auth import (
    AuthResponse,
    CabinetExchangeInput,
    CabinetLinkTokenOut,
    LoginInput,
    PublicUser,
    RefreshTokenInput,
    RegisterInput,
    TokenPair,
)
```

Add at the end of the file:

```python
@router.post("/cabinet-link-token", response_model=CabinetLinkTokenOut)
async def cabinet_link_token(
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    code = await auth_service.create_cabinet_link_token(db, user.user_id)
    return CabinetLinkTokenOut(
        code=code, expires_in_seconds=auth_service.CABINET_LINK_TOKEN_TTL_SECONDS
    )


@router.post("/cabinet-exchange", response_model=AuthResponse)
async def cabinet_exchange(body: CabinetExchangeInput, db: AsyncSession = Depends(get_db)):
    return await auth_service.exchange_cabinet_link_token(db, body.code)
```

- [ ] **Step 6: Write the tests**

Create `apps/api/tests/test_cabinet_link_token.py`:

```python
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.user import CabinetLinkToken


async def test_cabinet_link_token_exchange_succeeds(client, make_user, auth_headers):
    user = await make_user("cabinet-ok@example.com")
    headers = auth_headers(user)

    create_response = await client.post("/api/auth/cabinet-link-token", headers=headers)
    assert create_response.status_code == 200
    code = create_response.json()["code"]

    exchange_response = await client.post("/api/auth/cabinet-exchange", json={"code": code})
    assert exchange_response.status_code == 200
    body = exchange_response.json()
    assert body["user"]["id"] == str(user.id)
    assert body["accessToken"]
    assert body["refreshToken"]


async def test_cabinet_link_token_rejects_reuse(client, make_user, auth_headers):
    user = await make_user("cabinet-reuse@example.com")
    headers = auth_headers(user)

    code = (await client.post("/api/auth/cabinet-link-token", headers=headers)).json()["code"]

    first = await client.post("/api/auth/cabinet-exchange", json={"code": code})
    assert first.status_code == 200

    second = await client.post("/api/auth/cabinet-exchange", json={"code": code})
    assert second.status_code == 401


async def test_cabinet_link_token_rejects_expired(client, make_user, auth_headers, db_session):
    user = await make_user("cabinet-expired@example.com")
    headers = auth_headers(user)

    code = (await client.post("/api/auth/cabinet-link-token", headers=headers)).json()["code"]

    stored = await db_session.scalar(
        select(CabinetLinkToken).where(CabinetLinkToken.user_id == user.id)
    )
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()

    response = await client.post("/api/auth/cabinet-exchange", json={"code": code})
    assert response.status_code == 401


async def test_cabinet_link_token_rejects_garbage_code(client):
    response = await client.post("/api/auth/cabinet-exchange", json={"code": "not-a-real-code"})
    assert response.status_code == 401
```

- [ ] **Step 7: Run the tests and static checks**

```bash
cd apps/api
source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://arcana:arcana_dev_password@localhost:5432/arcana_test" \
  pytest tests/test_cabinet_link_token.py -v
ruff check app
ruff format --check app
```

Expected: all 4 new tests pass, ruff clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/app/models/user.py apps/api/app/models/__init__.py \
  apps/api/app/schemas/auth.py apps/api/app/services/auth_service.py \
  apps/api/app/routers/auth.py apps/api/tests/test_cabinet_link_token.py \
  apps/api/alembic/versions/
git commit -m "feat(api): one-time-code handoff to the player cabinet site"
```

---

### Task 2: Player stats endpoint (`GET /me/stats`)

**Files:**
- Create: `apps/api/app/schemas/stats.py`
- Create: `apps/api/app/services/stats_service.py`
- Create: `apps/api/app/routers/stats.py`
- Modify: `apps/api/app/main.py` (register the router)
- Create: `apps/api/tests/test_stats.py`

**Interfaces:**
- Consumes: existing `VariableDefinition`, `PlayerVariableValue`, `SaveSlot`, `Character`,
  `Story` models - no changes to any of them.
- Produces: `GET /me/stats` -> `list[StoryStatsOut]`. Nothing else in this plan depends on this
  task (independent of Task 1 and Task 3).

- [ ] **Step 1: Add the response schemas**

Create `apps/api/app/schemas/stats.py`:

```python
"""apps/api/app/schemas/stats.py

Response shapes for the player cabinet's stats tab - a read-only view over
VariableDefinition/PlayerVariableValue, unrelated to the condition/effect engine's own
internal representation (see app/services/variables_service.py for that one).
"""

from app.schemas.base import CamelModel
from app.schemas.common import LocalizedText, VariableScalar


class RelationshipStatOut(CamelModel):
    character_id: str
    character_name: LocalizedText
    character_name_color: str
    variable_key: str
    label: LocalizedText
    value: VariableScalar
    min_value: float | None
    max_value: float | None


class GeneralStatOut(CamelModel):
    variable_key: str
    label: LocalizedText
    value: VariableScalar


class StoryStatsOut(CamelModel):
    story_id: str
    story_title: LocalizedText
    relationships: list[RelationshipStatOut]
    general: list[GeneralStatOut]
```

- [ ] **Step 2: Write the aggregation service**

Create `apps/api/app/services/stats_service.py`:

```python
"""apps/api/app/services/stats_service.py

Aggregates one player's own progress (relationship variables, general story variables) for
display in the player cabinet. Read-only and independent of the condition/effect engine -
see app/services/variables_service.py for the engine-facing equivalent, which this
deliberately does not share code with (different shape, different purpose: this is for
display, that one is for evaluating conditions during play).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Character, Story, VariableDefinition
from app.models.player import PlayerVariableValue, SaveSlot
from app.schemas.stats import GeneralStatOut, RelationshipStatOut, StoryStatsOut


async def get_my_stats(db: AsyncSession, user_id: str) -> list[StoryStatsOut]:
    story_ids = list(
        await db.scalars(select(SaveSlot.story_id).where(SaveSlot.user_id == user_id).distinct())
    )
    if not story_ids:
        return []

    stories = list(await db.scalars(select(Story).where(Story.id.in_(story_ids))))
    stories_by_id = {story.id: story for story in stories}

    result: list[StoryStatsOut] = []
    for story_id in story_ids:
        story = stories_by_id.get(story_id)
        if not story:
            continue

        defs = list(
            await db.scalars(select(VariableDefinition).where(VariableDefinition.story_id == story_id))
        )
        if not defs:
            result.append(
                StoryStatsOut(story_id=str(story_id), story_title=story.title, relationships=[], general=[])
            )
            continue

        def_ids = [d.id for d in defs]
        values = list(
            await db.scalars(
                select(PlayerVariableValue).where(
                    PlayerVariableValue.user_id == user_id,
                    PlayerVariableValue.variable_definition_id.in_(def_ids),
                )
            )
        )
        values_by_def_id = {v.variable_definition_id: v.value for v in values}

        character_ids = {d.character_id for d in defs if d.character_id}
        characters = (
            list(await db.scalars(select(Character).where(Character.id.in_(character_ids))))
            if character_ids
            else []
        )
        characters_by_id = {c.id: c for c in characters}

        relationships: list[RelationshipStatOut] = []
        general: list[GeneralStatOut] = []
        for d in defs:
            value = values_by_def_id.get(d.id, d.default_value)
            if d.character_id:
                character = characters_by_id.get(d.character_id)
                if not character:
                    continue
                relationships.append(
                    RelationshipStatOut(
                        character_id=str(character.id),
                        character_name=character.name,
                        character_name_color=character.name_color,
                        variable_key=d.key,
                        label=d.label,
                        value=value,
                        min_value=d.min_value,
                        max_value=d.max_value,
                    )
                )
            else:
                general.append(GeneralStatOut(variable_key=d.key, label=d.label, value=value))

        result.append(
            StoryStatsOut(
                story_id=str(story_id), story_title=story.title, relationships=relationships, general=general
            )
        )

    return result
```

- [ ] **Step 3: Add the router**

Create `apps/api/app/routers/stats.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AuthenticatedUser, get_current_user
from app.database import get_db
from app.schemas.stats import StoryStatsOut
from app.services import stats_service

router = APIRouter(prefix="/me", tags=["me:stats"], dependencies=[Depends(get_current_user)])


@router.get("/stats", response_model=list[StoryStatsOut])
async def get_my_stats(
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await stats_service.get_my_stats(db, user.user_id)
```

In `apps/api/app/main.py`, extend the router import:

```python
from app.routers import auth, catalog, characters, favorites, play, preview, scenes, stats, stories, uploads, wallet
```

and add, alongside the other `app.include_router(...)` calls:

```python
app.include_router(stats.router, prefix="/api")
```

- [ ] **Step 4: Write the tests**

Create `apps/api/tests/test_stats.py`:

```python
from app.models.content import Character, VariableDefinition
from app.models.player import PlayerVariableValue, SaveSlot


async def test_my_stats_splits_relationships_and_general(client, make_user, auth_headers, make_chapter, db_session):
    user = await make_user("stats-player@example.com")
    headers = auth_headers(user)
    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(story_id=story_id, name={"ru": "Ирис"}, name_color="#FF00FF")
    db_session.add(character)
    await db_session.flush()

    relationship_def = VariableDefinition(
        story_id=story_id,
        key="affection",
        label={"ru": "Привязанность"},
        type="NUMBER",
        default_value=0,
        character_id=character.id,
        min_value=0,
        max_value=100,
    )
    general_def = VariableDefinition(
        story_id=story_id,
        key="chapter_visited_library",
        label={"ru": "Посетил библиотеку"},
        type="BOOLEAN",
        default_value=False,
    )
    db_session.add_all([relationship_def, general_def])
    await db_session.flush()

    db_session.add(
        PlayerVariableValue(user_id=user.id, variable_definition_id=relationship_def.id, value=42)
    )
    db_session.add(SaveSlot(user_id=user.id, story_id=story_id, slot_index=0, chapter_id=chapter.id))
    await db_session.commit()

    response = await client.get("/api/me/stats", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    story_stats = body[0]
    assert story_stats["storyId"] == str(story_id)

    assert len(story_stats["relationships"]) == 1
    relationship = story_stats["relationships"][0]
    assert relationship["characterId"] == str(character.id)
    assert relationship["value"] == 42
    assert relationship["maxValue"] == 100

    assert len(story_stats["general"]) == 1
    general = story_stats["general"][0]
    assert general["variableKey"] == "chapter_visited_library"
    assert general["value"] is False  # untouched PlayerVariableValue -> falls back to default_value


async def test_my_stats_excludes_stories_with_no_progress(client, make_user, auth_headers, make_chapter):
    user = await make_user("stats-no-progress@example.com")
    headers = auth_headers(user)
    await make_chapter()  # a story exists, but this user has no SaveSlot for it

    response = await client.get("/api/me/stats", headers=headers)
    assert response.status_code == 200
    assert response.json() == []
```

- [ ] **Step 5: Run the tests and static checks**

```bash
cd apps/api
source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://arcana:arcana_dev_password@localhost:5432/arcana_test" \
  pytest tests/test_stats.py -v
ruff check app
ruff format --check app
```

Expected: both new tests pass, ruff clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/schemas/stats.py apps/api/app/services/stats_service.py \
  apps/api/app/routers/stats.py apps/api/app/main.py apps/api/tests/test_stats.py
git commit -m "feat(api): player-facing stats endpoint (relationships + general variables)"
```

---

### Task 3: HARD-currency purchases via YooKassa

**Files:**
- Modify: `apps/api/app/config.py` (YooKassa + cabinet base URL settings)
- Modify: `apps/api/.env.example` (document the new settings)
- Modify: `apps/api/requirements.txt` (promote `httpx` from dev-only to production)
- Modify: `apps/api/app/models/enums.py` (add `PurchaseStatus`)
- Modify: `apps/api/app/models/economy.py` (add `Purchase`)
- Create: `apps/api/app/services/yookassa_client.py`
- Create: `apps/api/app/schemas/payments.py`
- Create: `apps/api/app/services/payments_service.py`
- Create: `apps/api/app/routers/purchases.py`
- Create: `apps/api/app/routers/webhooks.py`
- Modify: `apps/api/app/main.py` (register both new routers)
- Create: `apps/api/tests/test_payments.py`
- Create: one new Alembic migration (via autogenerate)

**Interfaces:**
- Consumes: `wallet_service.grant_currency` (already exists, called as-is on webhook success).
- Produces: `GET /me/purchases/packages`, `POST /me/purchases`, `POST /webhooks/yookassa`.
  Nothing else in this plan depends on this task (independent of Task 1 and Task 2).

- [ ] **Step 1: Add settings**

In `apps/api/app/config.py`, add these fields to the `Settings` class (after `public_base_url`):

```python
    # YooKassa merchant credentials - empty by default so existing .env files keep working;
    # a real purchase attempt fails cleanly with a YooKassa 401 until these are set to real
    # (or sandbox) values. See https://yookassa.ru/developers/api
    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""
    # Base URL of the player cabinet site (apps/cabinet, a separate plan) - used to build the
    # `return_url` YooKassa redirects back to after a payment completes.
    cabinet_base_url: str = "http://localhost:3100"
```

In `apps/api/.env.example`, add at the end:

```
# YooKassa merchant credentials for HARD-currency purchases from the player cabinet site.
# Leave blank in local dev unless you have sandbox credentials - purchases will fail cleanly
# with a YooKassa 401 rather than crash the app. See https://yookassa.ru/developers/api
YOOKASSA_SHOP_ID=""
YOOKASSA_SECRET_KEY=""

# Base URL of the player cabinet site (a separate app from this API and from apps/admin).
CABINET_BASE_URL="http://localhost:3100"
```

- [ ] **Step 2: Promote `httpx` to production dependencies**

In `apps/api/requirements.txt`, add (matching the version already pinned in
`requirements-dev.txt`):

```
httpx==0.27.2
```

- [ ] **Step 3: Add `PurchaseStatus` enum**

In `apps/api/app/models/enums.py`, add at the end:

```python
class PurchaseStatus(str, enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"
```

- [ ] **Step 4: Add the `Purchase` model**

In `apps/api/app/models/economy.py`, change the imports at the top from:

```python
from app.models.enums import CurrencyCode, TransactionType
from app.models.mixins import UUIDPKMixin, _utcnow
```

to:

```python
from app.models.enums import CurrencyCode, PurchaseStatus, TransactionType
from app.models.mixins import TimestampMixin, UUIDPKMixin, _utcnow
```

Add at the end of the file:

```python
class Purchase(Base, UUIDPKMixin, TimestampMixin):
    """One HARD-currency purchase attempt via YooKassa. `provider_payment_id` is unique so a
    webhook can look up the purchase it's about; `status` starts PENDING and is only ever
    flipped to COMPLETED by payments_service.handle_webhook after re-confirming the payment's
    real status with YooKassa's own API (never from the webhook body directly)."""

    __tablename__ = "purchases"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    currency: Mapped[CurrencyCode] = mapped_column()
    amount: Mapped[int] = mapped_column(Integer)
    price_rub_kopecks: Mapped[int] = mapped_column(Integer)
    provider: Mapped[str] = mapped_column(String, default="yookassa")
    provider_payment_id: Mapped[str] = mapped_column(String, unique=True)
    status: Mapped[PurchaseStatus] = mapped_column(default=PurchaseStatus.PENDING)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 5: Register the model and generate the migration**

In `apps/api/app/models/__init__.py`, change:

```python
from app.models.economy import CurrencyTransaction, DailyRewardState, Wallet  # noqa: F401
```

to:

```python
from app.models.economy import CurrencyTransaction, DailyRewardState, Purchase, Wallet  # noqa: F401
```

```bash
cd apps/api
source .venv/bin/activate
alembic revision --autogenerate -m "add purchases table"
```

Open the generated file and confirm it ONLY creates the `purchases` table (including the new
`PurchaseStatus` enum type Alembic/SQLAlchemy will create alongside it) - no unrelated changes.
Then:

```bash
alembic upgrade head
```

- [ ] **Step 6: Write the YooKassa REST client**

Create `apps/api/app/services/yookassa_client.py`:

```python
"""apps/api/app/services/yookassa_client.py

Thin wrapper around the two YooKassa REST API calls this backend needs
(https://yookassa.ru/developers/api): create a payment (returns a hosted-checkout URL) and
fetch a payment's current status by id. The status fetch exists specifically so
payments_service can verify a webhook against the real source of truth instead of trusting
the webhook's own request body - see that module's docstring.
"""

import uuid

import httpx

from app.config import settings

BASE_URL = "https://api.yookassa.ru/v3"


async def create_payment(
    *, amount_rub_kopecks: int, description: str, return_url: str, idempotence_key: str
) -> dict:
    async with httpx.AsyncClient(auth=(settings.yookassa_shop_id, settings.yookassa_secret_key)) as client:
        response = await client.post(
            f"{BASE_URL}/payments",
            headers={"Idempotence-Key": idempotence_key},
            json={
                "amount": {"value": f"{amount_rub_kopecks / 100:.2f}", "currency": "RUB"},
                "confirmation": {"type": "redirect", "return_url": return_url},
                "capture": True,
                "description": description,
            },
        )
        response.raise_for_status()
        return response.json()


async def get_payment(payment_id: str) -> dict:
    async with httpx.AsyncClient(auth=(settings.yookassa_shop_id, settings.yookassa_secret_key)) as client:
        response = await client.get(f"{BASE_URL}/payments/{payment_id}")
        response.raise_for_status()
        return response.json()


def new_idempotence_key() -> str:
    return str(uuid.uuid4())
```

- [ ] **Step 7: Add schemas**

Create `apps/api/app/schemas/payments.py`:

```python
from pydantic import Field

from app.schemas.base import CamelModel


class PackageOut(CamelModel):
    id: str
    currency: str
    amount: int
    price_rub_kopecks: int


class CreatePurchaseInput(CamelModel):
    package_id: str = Field(min_length=1)


class CreatePurchaseOut(CamelModel):
    confirmation_url: str
```

- [ ] **Step 8: Write the payments service**

Create `apps/api/app/services/payments_service.py`:

```python
"""apps/api/app/services/payments_service.py

Buying HARD currency with real money via YooKassa. Two entry points: `create_purchase`
(player picks a package on the cabinet site) and `handle_webhook` (YooKassa notifies us a
payment succeeded).

The webhook NEVER credits currency based on its own request body - it re-fetches the payment
from YooKassa's API by id first (see yookassa_client.get_payment), so a forged or replayed
webhook can, at worst, make us re-check a real payment's real status - it cannot fabricate a
"succeeded" status for a payment it doesn't control. This is a standard integration pattern
for payment webhooks generally, not specific to YooKassa.
"""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.economy import Purchase
from app.models.enums import CurrencyCode, PurchaseStatus
from app.services import wallet_service, yookassa_client

# Illustrative package sizes/prices - the business will tune these numbers before launch,
# this is not a pricing engine, just a fixed lookup list.
CURRENCY_PACKAGES = [
    {"id": "hard_100", "currency": "HARD", "amount": 100, "price_rub_kopecks": 14900},
    {"id": "hard_550", "currency": "HARD", "amount": 550, "price_rub_kopecks": 74900},
    {"id": "hard_1200", "currency": "HARD", "amount": 1200, "price_rub_kopecks": 149000},
]

_PACKAGES_BY_ID = {p["id"]: p for p in CURRENCY_PACKAGES}


def list_packages() -> list[dict]:
    return CURRENCY_PACKAGES


async def create_purchase(db: AsyncSession, user_id: str, package_id: str) -> str:
    package = _PACKAGES_BY_ID.get(package_id)
    if not package:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Такого пакета не существует")

    purchase = Purchase(
        user_id=user_id,
        currency=CurrencyCode(package["currency"]),
        amount=package["amount"],
        price_rub_kopecks=package["price_rub_kopecks"],
        provider="yookassa",
        # Placeholder, replaced below once YooKassa responds - must be non-empty and unique
        # immediately since the column has a unique constraint and this row is flushed first.
        provider_payment_id=f"pending-{uuid.uuid4().hex}",
        status=PurchaseStatus.PENDING,
    )
    db.add(purchase)
    await db.flush()

    return_url = f"{settings.cabinet_base_url}/wallet?purchase={purchase.id}"
    try:
        payment = await yookassa_client.create_payment(
            amount_rub_kopecks=package["price_rub_kopecks"],
            description=f"Arcana: {package['amount']} {package['currency']}",
            return_url=return_url,
            idempotence_key=str(purchase.id),
        )
    except Exception as exc:
        purchase.status = PurchaseStatus.FAILED
        await db.commit()
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Не удалось начать оплату, попробуйте позже"
        ) from exc

    purchase.provider_payment_id = payment["id"]
    await db.commit()

    return payment["confirmation"]["confirmation_url"]


async def handle_webhook(db: AsyncSession, payment_id: str) -> None:
    purchase = await db.scalar(select(Purchase).where(Purchase.provider_payment_id == payment_id))
    if not purchase:
        # Unknown payment id - could be a replayed/stray webhook, or one from a different
        # environment. Nothing to do; the caller (the router) is responsible for still
        # returning 200 to YooKassa so it stops retrying.
        return

    if purchase.status == PurchaseStatus.COMPLETED:
        return  # Already processed - webhooks can be delivered more than once.

    real_payment = await yookassa_client.get_payment(payment_id)
    if real_payment.get("status") != "succeeded":
        return

    purchase.status = PurchaseStatus.COMPLETED
    purchase.completed_at = datetime.now(UTC)
    await wallet_service.grant_currency(
        db, str(purchase.user_id), purchase.currency, purchase.amount, reason=f"yookassa:{payment_id}"
    )
```

- [ ] **Step 9: Add the purchases router**

Create `apps/api/app/routers/purchases.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AuthenticatedUser, get_current_user
from app.database import get_db
from app.schemas.payments import CreatePurchaseInput, CreatePurchaseOut, PackageOut
from app.services import payments_service

router = APIRouter(prefix="/me", tags=["me:purchases"], dependencies=[Depends(get_current_user)])


@router.get("/purchases/packages", response_model=list[PackageOut])
async def list_packages():
    return payments_service.list_packages()


@router.post("/purchases", response_model=CreatePurchaseOut)
async def create_purchase(
    body: CreatePurchaseInput,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url = await payments_service.create_purchase(db, user.user_id, body.package_id)
    return CreatePurchaseOut(confirmation_url=url)
```

- [ ] **Step 10: Add the webhook router**

Create `apps/api/app/routers/webhooks.py`:

```python
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services import payments_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/yookassa", status_code=status.HTTP_204_NO_CONTENT)
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    event = body.get("event")
    payment_id = body.get("object", {}).get("id")
    if event == "payment.succeeded" and payment_id:
        await payments_service.handle_webhook(db, payment_id)
    # Always 204 regardless of what handle_webhook did - YooKassa only needs acknowledgement
    # that we received the notification; it retries on anything other than a 2xx.
```

Note: this router intentionally has NO `Depends(get_current_user)` - YooKassa calls it
directly with no user session, exactly like the public `catalog` router has no auth either.

- [ ] **Step 11: Register both routers**

In `apps/api/app/main.py`, change:

```python
from app.routers import auth, catalog, characters, favorites, play, preview, scenes, stats, stories, uploads, wallet
```

to:

```python
from app.routers import (
    auth,
    catalog,
    characters,
    favorites,
    play,
    preview,
    purchases,
    scenes,
    stats,
    stories,
    uploads,
    wallet,
    webhooks,
)
```

(This assumes Task 2's `stats` import already landed - if this task is implemented before
Task 2 for any reason, just add `purchases` and `webhooks` to whatever the current import
line looks like instead.)

Add, alongside the other `app.include_router(...)` calls:

```python
app.include_router(purchases.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
```

- [ ] **Step 12: Write the tests**

Create `apps/api/tests/test_payments.py`. These tests mock `yookassa_client` entirely (via
`monkeypatch`) - no real network calls, no real YooKassa credentials needed:

```python
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.models.economy import Purchase
from app.models.enums import PurchaseStatus
from app.services import payments_service


@pytest.fixture
def mock_yookassa(monkeypatch):
    create_payment = AsyncMock(
        return_value={"id": "yk-payment-123", "confirmation": {"confirmation_url": "https://yookassa.ru/pay/123"}}
    )
    get_payment = AsyncMock(return_value={"status": "succeeded"})
    monkeypatch.setattr(payments_service.yookassa_client, "create_payment", create_payment)
    monkeypatch.setattr(payments_service.yookassa_client, "get_payment", get_payment)
    return {"create_payment": create_payment, "get_payment": get_payment}


async def test_list_packages_endpoint(client, make_user, auth_headers):
    user = await make_user("packages@example.com")
    response = await client.get("/api/me/purchases/packages", headers=auth_headers(user))
    assert response.status_code == 200
    body = response.json()
    assert len(body) == len(payments_service.CURRENCY_PACKAGES)
    assert body[0]["id"] == payments_service.CURRENCY_PACKAGES[0]["id"]


async def test_create_purchase_returns_confirmation_url(client, make_user, auth_headers, mock_yookassa):
    user = await make_user("buyer@example.com")
    response = await client.post(
        "/api/me/purchases", json={"packageId": "hard_100"}, headers=auth_headers(user)
    )
    assert response.status_code == 200
    assert response.json()["confirmationUrl"] == "https://yookassa.ru/pay/123"
    mock_yookassa["create_payment"].assert_awaited_once()


async def test_create_purchase_rejects_unknown_package(client, make_user, auth_headers, mock_yookassa):
    user = await make_user("bad-package@example.com")
    response = await client.post(
        "/api/me/purchases", json={"packageId": "does-not-exist"}, headers=auth_headers(user)
    )
    assert response.status_code == 400
    mock_yookassa["create_payment"].assert_not_awaited()


async def test_webhook_credits_currency_on_succeeded_payment(
    client, make_user, auth_headers, mock_yookassa, db_session
):
    user = await make_user("webhook-buyer@example.com")
    purchase_response = await client.post(
        "/api/me/purchases", json={"packageId": "hard_100"}, headers=auth_headers(user)
    )
    assert purchase_response.status_code == 200

    webhook_response = await client.post(
        "/api/webhooks/yookassa",
        json={"event": "payment.succeeded", "object": {"id": "yk-payment-123"}},
    )
    assert webhook_response.status_code == 204

    wallet_response = await client.get("/api/wallet", headers=auth_headers(user))
    assert wallet_response.json()["hard"] == 100

    purchase = await db_session.scalar(
        select(Purchase).where(Purchase.provider_payment_id == "yk-payment-123")
    )
    assert purchase.status == PurchaseStatus.COMPLETED


async def test_webhook_is_idempotent_on_duplicate_delivery(
    client, make_user, auth_headers, mock_yookassa
):
    user = await make_user("webhook-twice@example.com")
    await client.post("/api/me/purchases", json={"packageId": "hard_100"}, headers=auth_headers(user))

    webhook_body = {"event": "payment.succeeded", "object": {"id": "yk-payment-123"}}
    first = await client.post("/api/webhooks/yookassa", json=webhook_body)
    second = await client.post("/api/webhooks/yookassa", json=webhook_body)
    assert first.status_code == 204
    assert second.status_code == 204

    wallet_response = await client.get("/api/wallet", headers=auth_headers(user))
    assert wallet_response.json()["hard"] == 100  # not 200 - the second delivery must not double-credit


async def test_webhook_ignores_unknown_payment_id(client):
    response = await client.post(
        "/api/webhooks/yookassa",
        json={"event": "payment.succeeded", "object": {"id": "never-created"}},
    )
    assert response.status_code == 204  # must still ack, not 500, so YooKassa stops retrying
```

- [ ] **Step 13: Run the tests and static checks**

```bash
cd apps/api
source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://arcana:arcana_dev_password@localhost:5432/arcana_test" \
  pytest tests/test_payments.py -v
ruff check app
ruff format --check app
```

Expected: all 6 new tests pass, ruff clean.

- [ ] **Step 14: Full regression run**

```bash
DATABASE_URL="postgresql+asyncpg://arcana:arcana_dev_password@localhost:5432/arcana_test" pytest -v
```

Expected: every test in the suite passes (this task adds new tables/enums - confirm nothing
existing broke).

- [ ] **Step 15: Commit**

```bash
git add apps/api/app/config.py apps/api/.env.example apps/api/requirements.txt \
  apps/api/app/models/enums.py apps/api/app/models/economy.py apps/api/app/models/__init__.py \
  apps/api/app/services/yookassa_client.py apps/api/app/schemas/payments.py \
  apps/api/app/services/payments_service.py apps/api/app/routers/purchases.py \
  apps/api/app/routers/webhooks.py apps/api/app/main.py apps/api/tests/test_payments.py \
  apps/api/alembic/versions/
git commit -m "feat(api): HARD-currency purchases via YooKassa (create + webhook)"
```
