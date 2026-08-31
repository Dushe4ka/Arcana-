# Admin Panel Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the backend pieces the admin panel spec requires but don't exist yet - a pytest
test harness, scene-node canvas positions, cross-node background persistence, wardrobe/outfit
sprite resolution, file uploads, and side-effect-free chapter preview - so `apps/admin`
(a separate, later plan) has a complete, tested API to build against.

**Architecture:** `apps/api` is an existing FastAPI + SQLAlchemy 2.0 async + Alembic +
PostgreSQL modular monolith (routers → services → models/schemas). Every task in this plan
follows that existing layering; nothing here introduces a new architectural pattern.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async, asyncpg), Alembic, Pydantic v2,
pytest + pytest-asyncio + httpx (new test harness, see Task 1).

**Spec:** `docs/superpowers/specs/2026-08-31-admin-panel-design.md`

## Global Constraints

- Line length 110, ruff rules `E, F, I, UP, B` (`pyproject.toml`) - run `ruff check app tests`
  and `ruff format app tests` before every commit in this plan.
- `asyncio_mode = "auto"` is already set in `pyproject.toml` - async test functions need no
  `@pytest.mark.asyncio` decorator, but async **fixtures** still need `@pytest_asyncio.fixture`
  (plain `@pytest.fixture` silently returns a coroutine object instead of awaiting it).
- All request/response schemas extend `CamelModel`/`ORMModel` (`app/schemas/base.py`,
  `app/schemas/responses.py`): Python fields stay snake_case, JSON in/out is camelCase.
- Every new endpoint that touches content must depend on
  `require_roles("WRITER", "EDITOR", "ADMIN")` (`app/core/deps.py`), matching every existing
  content router (`stories.py`, `characters.py`, `scenes.py`).
- No placeholders, no TODOs - every task below is complete, runnable code.

## Out of scope for this plan

`apps/admin` (the Next.js frontend itself) is a separate, later plan - it depends on the
endpoints this plan adds and doesn't exist as a decomposable unit yet. This plan's tasks are
all independently testable via `pytest`/`curl` with no frontend involved, which is why it
ships first and alone.

---

## Task 1: Backend test infrastructure

`apps/api/tests/` currently only has an empty `__init__.py` - no test has ever run against
this codebase. Every later task in this plan needs a working pytest harness, so it comes
first.

**Files:**
- Create: `apps/api/tests/conftest.py`
- Create: `apps/api/tests/test_smoke.py`
- Modify: `apps/api/requirements-dev.txt` (add `pytest-asyncio`'s transitive need for nothing
  new - already present; no change needed here, listed for completeness of the check)

**Interfaces:**
- Produces (used verbatim by every later task's tests):
  - fixture `db_session: AsyncSession` - one test = one transaction, rolled back after
  - fixture `client: httpx.AsyncClient` - wired to the real FastAPI app via `ASGITransport`,
    `get_db` overridden to yield `db_session`
  - fixture `make_user` - `async def _make_user(email: str, role: str = "PLAYER", password: str = "TestPass123!") -> User`
  - fixture `auth_headers` - `def _auth_headers(user: User) -> dict[str, str]` (Bearer token)
  - fixture `make_chapter` - `async def _make_chapter(*, story_genre: str = "ROMANCE", chapter_status: str = "PUBLISHED") -> Chapter`,
    creates a full `Story -> Season -> Chapter` chain with sane defaults and returns the
    `Chapter` (with `.season` already loaded, so `chapter.season.story_id` works without an
    extra query)

- [ ] **Step 1: Point `DATABASE_URL` at a disposable test database**

Tests run against real PostgreSQL - the schema uses `JSONB` and native `UUID` columns
throughout, which SQLite can't represent. Create a database that is safe to wipe:

Run: `createdb arcana_test` (uses the same local Postgres role already set up for
`arcana_dev` per the project's dev setup)

This database's URL only needs to exist in the shell environment when running pytest - it
does not go in `.env` (that file stays pointed at `arcana_dev`, the manual-testing database).

- [ ] **Step 2: Write `apps/api/tests/conftest.py`**

```python
"""Shared pytest fixtures for the FastAPI test suite.

Tests run against a real Postgres database (SQLite can't represent the JSONB/native UUID
columns this schema uses everywhere) - point DATABASE_URL at a disposable database before
running pytest, e.g.:

    createdb arcana_test
    DATABASE_URL=postgresql+asyncpg://arcana:arcana@localhost/arcana_test pytest

Never point it at the arcana_dev database you use for manual testing - each test run creates
all tables fresh and drops them at the end of the session.
"""

import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import create_access_token, hash_password
from app.database import Base, get_db
from app.main import app
from app.models.content import Chapter, Season, Story
from app.models.user import User


@pytest_asyncio.fixture(scope="session")
async def _engine():
    engine = create_async_engine(settings.database_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(_engine) -> AsyncGenerator[AsyncSession, None]:
    """One test = one transaction, rolled back at the end - tests never see each other's
    data, and nothing that happens here (including explicit .commit() calls made by the
    code under test) survives past the test."""
    connection = await _engine.connect()
    outer_transaction = await connection.begin()
    session_factory = async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        class_=AsyncSession,
        join_transaction_mode="create_savepoint",
    )
    session = session_factory()

    yield session

    await session.close()
    await outer_transaction.rollback()
    await connection.close()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _get_db_override():
        yield db_session

    app.dependency_overrides[get_db] = _get_db_override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def make_user(db_session: AsyncSession):
    async def _make_user(email: str, role: str = "PLAYER", password: str = "TestPass123!") -> User:
        user = User(email=email, password_hash=hash_password(password), role=role)
        db_session.add(user)
        await db_session.flush()
        return user

    return _make_user


@pytest.fixture
def auth_headers():
    def _auth_headers(user: User) -> dict[str, str]:
        # user.role is whatever make_user assigned (a plain str, since the object is never
        # refreshed from the DB) - create_access_token takes a plain str role too, so this
        # works regardless of whether SQLAlchemy has coerced it to the UserRole enum yet.
        role = user.role.value if hasattr(user.role, "value") else user.role
        token = create_access_token(str(user.id), user.email, role)
        return {"Authorization": f"Bearer {token}"}

    return _auth_headers


@pytest_asyncio.fixture
async def make_chapter(db_session: AsyncSession):
    async def _make_chapter(*, story_genre: str = "ROMANCE", chapter_status: str = "PUBLISHED") -> Chapter:
        story = Story(
            slug=f"test-story-{uuid.uuid4().hex[:8]}",
            title={"ru": "Тестовая история"},
            genre=story_genre,
        )
        db_session.add(story)
        await db_session.flush()

        season = Season(story_id=story.id, index=1, title={"ru": "Сезон 1"})
        db_session.add(season)
        await db_session.flush()

        chapter = Chapter(
            season_id=season.id,
            index=1,
            title={"ru": "Глава 1"},
            status=chapter_status,
            unlock_cost=0,
        )
        db_session.add(chapter)
        await db_session.flush()
        chapter.season = season
        return chapter

    return _make_chapter
```

- [ ] **Step 3: Write `apps/api/tests/test_smoke.py`**

```python
async def test_me_endpoint_returns_authenticated_user(client, make_user, auth_headers):
    user = await make_user("writer@example.com", role="WRITER")

    response = await client.get("/api/auth/me", headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "writer@example.com"
    assert body["role"] == "WRITER"


async def test_me_endpoint_requires_auth(client):
    response = await client.get("/api/auth/me")

    assert response.status_code == 401
```

- [ ] **Step 4: Run the suite and verify it passes**

Run: `cd apps/api && source .venv/bin/activate && DATABASE_URL=postgresql+asyncpg://arcana:arcana@localhost/arcana_test pytest tests/test_smoke.py -v`
(adjust the `arcana:arcana@localhost` credentials to match whatever role/password your local
Postgres setup actually uses - same as `arcana_dev`)

Expected: both tests PASS. If `test_me_endpoint_requires_auth` fails with anything other than
401, the `dependency_overrides` wiring in the `client` fixture is wrong - check it before
moving on, every later task's tests depend on this fixture working correctly.

- [ ] **Step 5: Commit**

```bash
cd apps/api
ruff format tests && ruff check tests
git add tests/conftest.py tests/test_smoke.py
git commit -m "test(api): add pytest harness (transactional db_session, client, auth fixtures)"
```

---

## Task 2: Scene node canvas position

Adds `canvas_x`/`canvas_y` to `SceneNode` - the graph editor's node-position storage. Purely
additive, nullable, doesn't touch the reading engine.

**Files:**
- Create: `apps/api/alembic/versions/c3f18a9d2b41_add_scene_node_canvas_position.py`
- Modify: `apps/api/app/models/content.py` (`SceneNode` class, ~line 78-93)
- Modify: `apps/api/app/schemas/content.py` (`SceneNodeUpdateInput`, ~line 129-134)
- Modify: `apps/api/app/schemas/responses.py` (`SceneNodeOut`, ~line 32-38)
- Modify: `apps/api/app/services/scenes_service.py` (`update_node`, ~line 39-58)
- Test: `apps/api/tests/test_scene_node_canvas_position.py`

**Interfaces:**
- Consumes: `make_user`, `auth_headers`, `make_chapter`, `client`, `db_session` (Task 1)
- Produces: `SceneNodeOut.canvas_x: int | None`, `SceneNodeOut.canvas_y: int | None` - the
  admin panel's graph editor (future plan) reads these to place nodes, and
  `PATCH /admin/scene-nodes/{id}` with `canvasX`/`canvasY` in the body persists a drag.

- [ ] **Step 1: Write the migration**

```python
"""add scene node canvas position

Revision ID: c3f18a9d2b41
Revises: a16cac1fed69
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3f18a9d2b41'
down_revision: Union[str, None] = 'a16cac1fed69'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('scene_nodes', sa.Column('canvas_x', sa.Integer(), nullable=True))
    op.add_column('scene_nodes', sa.Column('canvas_y', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('scene_nodes', 'canvas_y')
    op.drop_column('scene_nodes', 'canvas_x')
```

- [ ] **Step 2: Apply it to both databases**

Run: `cd apps/api && source .venv/bin/activate && alembic upgrade head`
Run again with `DATABASE_URL=postgresql+asyncpg://arcana:arcana@localhost/arcana_test alembic upgrade head`
(Task 1's `db_session` fixture uses `Base.metadata.create_all`, not Alembic, so the test DB
schema comes from the model below either way - running this against it too just keeps both
databases consistent if you ever inspect the test DB by hand.)

Expected: both commands report the new revision applied, no errors.

- [ ] **Step 3: Add the columns to the `SceneNode` model**

In `apps/api/app/models/content.py`, inside the `SceneNode` class, after the `data` column:

```python
    # Type-specific payload, shape validated by Pydantic schemas (see app/schemas/content.py).
    data: Mapped[dict] = mapped_column(JSONB)
    # Graph editor node position (admin panel only) - null until an author drags the node at
    # least once. Never read by the reading engine.
    canvas_x: Mapped[int | None] = mapped_column(Integer, nullable=True)
    canvas_y: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

- [ ] **Step 4: Expose the fields in the response schema**

In `apps/api/app/schemas/responses.py`, `SceneNodeOut`:

```python
class SceneNodeOut(ORMModel):
    id: uuid.UUID
    chapter_id: uuid.UUID
    type: str
    order: int
    data: dict[str, Any]
    canvas_x: int | None
    canvas_y: int | None
    choice_options: list[ChoiceOptionOut] = []
```

- [ ] **Step 5: Accept the fields in the update schema**

In `apps/api/app/schemas/content.py`, `SceneNodeUpdateInput`:

```python
class SceneNodeUpdateInput(CamelModel):
    """Partial update: order can move, and `data` is re-validated server-side against the
    node's existing type. canvas_x/canvas_y follow the same "omitted = don't touch" rule as
    order/data - there's no way to distinguish "clear the position" from "didn't send it" in
    this scheme, which is fine here since a node's position is never meant to go back to
    unset once the author has placed it on the canvas."""

    order: int | None = Field(default=None, ge=0)
    data: dict | None = None
    canvas_x: int | None = None
    canvas_y: int | None = None
```

- [ ] **Step 6: Persist them in the service**

In `apps/api/app/services/scenes_service.py`, `update_node`:

```python
async def update_node(db: AsyncSession, node_id: str, data: SceneNodeUpdateInput) -> SceneNode:
    node = await _require_node(db, node_id)

    new_data = node.data
    if data.data is not None:
        schema = SCENE_NODE_DATA_SCHEMA_BY_TYPE[node.type.value]
        try:
            validated = schema.model_validate(data.data)
        except Exception as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                {
                    "message": f"Некорректные данные для узла типа {node.type.value}",
                    "issues": str(exc),
                },
            ) from exc
        new_data = validated.model_dump()

    if data.order is not None:
        node.order = data.order
    if data.canvas_x is not None:
        node.canvas_x = data.canvas_x
    if data.canvas_y is not None:
        node.canvas_y = data.canvas_y
    node.data = new_data
    await db.commit()
    await db.refresh(node)
    return node
```

- [ ] **Step 7: Write the failing test**

```python
async def test_patch_scene_node_persists_canvas_position(
    client, make_user, auth_headers, make_chapter, db_session
):
    from app.models.content import SceneNode

    chapter = await make_chapter()
    node = SceneNode(chapter_id=chapter.id, type="DIALOGUE", order=0, data={"text": {"ru": "Привет"}})
    db_session.add(node)
    await db_session.flush()

    writer = await make_user("writer-canvas@example.com", role="WRITER")

    response = await client.patch(
        f"/api/admin/scene-nodes/{node.id}",
        headers=auth_headers(writer),
        json={"canvasX": 240, "canvasY": -80},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["canvasX"] == 240
    assert body["canvasY"] == -80
```

- [ ] **Step 8: Run it, verify it passes**

Run: `pytest tests/test_scene_node_canvas_position.py -v`
Expected: PASS. (Written after the implementation here since Steps 3-6 are small,
mechanical, and shared across one schema/model/service triple - but run it for real, don't
assume.)

- [ ] **Step 9: Commit**

```bash
ruff format app tests && ruff check app tests
git add alembic/versions/c3f18a9d2b41_add_scene_node_canvas_position.py \
  app/models/content.py app/schemas/content.py app/schemas/responses.py \
  app/services/scenes_service.py tests/test_scene_node_canvas_position.py
git commit -m "feat(api): add canvas_x/canvas_y to scene nodes for the graph editor"
```

---

## Task 3: Background persists across dialogue nodes

Currently `background_image_url` is read straight from each node with no memory of the last
one shown - an author has to repeat it on every single node or the background silently drops
to a blank screen. This task makes it "stays until explicitly changed."

**Files:**
- Create: `apps/api/alembic/versions/f7b92e04a618_add_save_slot_background.py`
- Modify: `apps/api/app/models/player.py` (`SaveSlot` class)
- Modify: `apps/api/app/services/play_service.py` (`_resolve_view`, `_build_dialogue_view`)
- Test: `apps/api/tests/test_background_persistence.py`

**Interfaces:**
- Consumes: `make_user`, `auth_headers`, `make_chapter`, `client`, `db_session` (Task 1)
- Produces: `_build_dialogue_view(db, node_id, data, slot, context)` - new required 5th
  parameter `context: VariableContext`. Task 4 consumes this exact new signature.

- [ ] **Step 1: Write the migration**

```python
"""add save slot background

Revision ID: f7b92e04a618
Revises: c3f18a9d2b41
Create Date: 2026-09-01 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7b92e04a618'
down_revision: Union[str, None] = 'c3f18a9d2b41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('save_slots', sa.Column('current_background_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('save_slots', 'current_background_url')
```

- [ ] **Step 2: Apply it**

Run: `alembic upgrade head` (both the dev DB and, for consistency, with `DATABASE_URL`
pointed at `arcana_test` - same as Task 2 Step 2).
Expected: revision `f7b92e04a618` applied, no errors.

- [ ] **Step 3: Add the column to `SaveSlot`**

In `apps/api/app/models/player.py`, inside the `SaveSlot` class, after `current_node_id`:

```python
    current_node_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Last non-null background shown in this save slot - a dialogue node with no background
    # of its own inherits this instead of falling back to a blank screen, so authors only
    # need to set background_image_url on the node where it actually changes.
    current_background_url: Mapped[str | None] = mapped_column(String, nullable=True)
```

(`String` is already imported in this file via the existing `DateTime, ForeignKey, Integer,
String, UniqueConstraint` import line used elsewhere in `app/models/player.py` - if that's not
the case when you open the file, add `String` to the existing `sqlalchemy` import there.)

- [ ] **Step 4: Thread `context` into `_build_dialogue_view` and persist the background**

In `apps/api/app/services/play_service.py`:

First, the call site inside `_resolve_view` (the `while True:` loop's `DIALOGUE` branch):

```python
        if node.type.value == "DIALOGUE":
            data = DialogueNodeData.model_validate(node.data)
            return await _build_dialogue_view(db, node.id, data, slot, context)
```

Then `_build_dialogue_view` itself:

```python
async def _build_dialogue_view(
    db: AsyncSession, node_id, data: DialogueNodeData, slot: SaveSlot, context
) -> dict:
    story_id = str(slot.story_id)
    characters = await _get_character_summaries(db, story_id)

    speaker = characters.get(data.speaker_character_id) if data.speaker_character_id else None
    staged = await _resolve_staged_characters(db, story_id, data.staged)

    # A background persists across nodes until a node explicitly sets a new one - authors
    # only need to set it where it changes, not repeat it on every dialogue node.
    background_url = data.background_image_url
    if background_url:
        if slot.current_background_url != background_url:
            slot.current_background_url = background_url
            await db.commit()
    else:
        background_url = slot.current_background_url

    return {
        "type": "DIALOGUE",
        "nodeId": str(node_id),
        "speaker": {
            "id": speaker["id"],
            "name": speaker["name"],
            "nameColor": speaker["nameColor"],
        }
        if speaker
        else None,
        "text": data.text.model_dump(),
        "isThought": data.is_thought,
        "backgroundImageUrl": background_url,
        "staged": staged,
        "canAdvance": bool(data.next_node_id),
        "saveSlot": _to_save_slot_dto(slot),
    }
```

(`context` isn't used by this task's own logic yet - only the signature changes here, so
Task 4 has somewhere to plug in the outfit lookup without touching this call site again. Leave
the parameter as an untyped positional for now; Task 4 imports `VariableContext` and types it.)

- [ ] **Step 5: Write the failing test**

```python
async def test_background_persists_from_previous_dialogue_node_when_unset(
    client, make_user, auth_headers, make_chapter, db_session
):
    from app.models.content import SceneNode

    chapter = await make_chapter()

    second_node = SceneNode(
        chapter_id=chapter.id,
        type="DIALOGUE",
        order=1,
        data={"text": {"ru": "Второй момент"}},
    )
    db_session.add(second_node)
    await db_session.flush()

    first_node = SceneNode(
        chapter_id=chapter.id,
        type="DIALOGUE",
        order=0,
        data={
            "text": {"ru": "Первый момент"},
            "background_image_url": "https://example.test/hall.jpg",
            "next_node_id": str(second_node.id),
        },
    )
    db_session.add(first_node)
    await db_session.flush()

    chapter.entry_node_id = first_node.id
    await db_session.flush()

    player = await make_user("reader-bg@example.com", role="PLAYER")

    start_response = await client.post(
        f"/api/play/chapters/{chapter.id}/start",
        headers=auth_headers(player),
        json={"slotIndex": 1},
    )
    assert start_response.status_code == 200
    first_view = start_response.json()
    assert first_view["backgroundImageUrl"] == "https://example.test/hall.jpg"
    save_slot_id = first_view["saveSlot"]["id"]

    advance_response = await client.post(
        f"/api/play/save-slots/{save_slot_id}/advance",
        headers=auth_headers(player),
    )
    assert advance_response.status_code == 200
    second_view = advance_response.json()
    assert second_view["backgroundImageUrl"] == "https://example.test/hall.jpg"
```

- [ ] **Step 6: Run it, verify it passes**

Run: `pytest tests/test_background_persistence.py -v`
Expected: PASS. If `second_view["backgroundImageUrl"]` is `None`, the persistence branch in
Step 4 didn't run - check that `slot.current_background_url` is actually being read (not just
written) when `data.background_image_url` is falsy.

- [ ] **Step 7: Commit**

```bash
ruff format app tests && ruff check app tests
git add alembic/versions/f7b92e04a618_add_save_slot_background.py \
  app/models/player.py app/services/play_service.py tests/test_background_persistence.py
git commit -m "feat(api): backgrounds persist across dialogue nodes until explicitly changed"
```

---

## Task 4: Wardrobe - outfit-driven sprite resolution

A player's chosen outfit (already stored as an ordinary character-scoped variable via the
existing effects mechanism - no new persistence needed) now changes which sprite renders.

**Files:**
- Modify: `apps/api/app/services/play_service.py` (`_resolve_staged_characters`, imports)
- Test: `apps/api/tests/test_wardrobe_sprite_resolution.py`

**Interfaces:**
- Consumes: `_build_dialogue_view(db, node_id, data, slot, context)` (Task 3),
  `make_user`, `make_chapter`, `db_session` (Task 1), `variable_lookup_key` (existing,
  `app.engine.condition_engine`)
- Produces: `_resolve_staged_characters(db, story_id, staged, context)` - new required 4th
  parameter.

- [ ] **Step 1: Update imports and thread `context` through**

In `apps/api/app/services/play_service.py`, the top-level import already reads:

```python
from app.engine.condition_engine import evaluate_condition_group
```

Change it to also import `variable_lookup_key`, and add an import for `VariableContext` so
both `context` parameters can be properly typed instead of left bare:

```python
from app.engine.condition_engine import evaluate_condition_group, variable_lookup_key
from app.services.variables_service import VariableContext
```

Now type `_build_dialogue_view`'s `context` parameter (left untyped in Task 3):

```python
async def _build_dialogue_view(
    db: AsyncSession, node_id, data: DialogueNodeData, slot: SaveSlot, context: VariableContext
) -> dict:
```

Then update the call site inside `_build_dialogue_view` to pass `context` through to staged
character resolution:

```python
    staged = await _resolve_staged_characters(db, story_id, data.staged, context)
```

- [ ] **Step 2: Resolve the composite sprite key**

Replace `_resolve_staged_characters` with:

```python
async def _resolve_staged_characters(
    db: AsyncSession, story_id: str, staged: list, context: VariableContext
) -> list[dict]:
    if not staged:
        return []
    characters = await _get_character_summaries(db, story_id, with_sprites=True)
    values = context.as_value_map()

    result = []
    for s in staged:
        character = characters.get(s.character_id)
        sprites = character.get("sprites", {}) if character else {}

        # Outfit/wardrobe: if this story defines an "outfit" variable scoped to this
        # character, the sprite key becomes "{outfit}_{expression}" (e.g. "dress_smile") so
        # an earlier wardrobe choice is reflected automatically in every later scene, without
        # the author re-picking a sprite per node. Falls back to the plain expression key for
        # characters that don't use a wardrobe at all.
        outfit = values.get(variable_lookup_key("outfit", s.character_id))
        sprite_url = sprites.get(f"{outfit}_{s.sprite}") if outfit else None
        if sprite_url is None:
            sprite_url = sprites.get(s.sprite)

        result.append(
            {
                "characterId": s.character_id,
                "name": character["name"] if character else {"ru": "?"},
                "nameColor": character["nameColor"] if character else "#FFFFFF",
                "spriteUrl": sprite_url,
                "position": s.position,
            }
        )
    return result
```

- [ ] **Step 3: Write the failing tests**

```python
from app.schemas.content import StagedCharacter
from app.services import variables_service
from app.services.play_service import _resolve_staged_characters


async def test_resolve_staged_characters_uses_outfit_variable_for_sprite_key(
    make_user, make_chapter, db_session
):
    from app.models.content import Character, VariableDefinition
    from app.models.player import PlayerVariableValue

    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(
        story_id=story_id,
        name={"ru": "Ирис"},
        sprites={
            "dress_neutral": "https://example.test/dress.png",
            "neutral": "https://example.test/plain.png",
        },
    )
    db_session.add(character)
    await db_session.flush()

    outfit_def = VariableDefinition(
        story_id=story_id,
        key="outfit",
        label={"ru": "Наряд"},
        type="STRING",
        default_value="dress",
        character_id=character.id,
    )
    db_session.add(outfit_def)
    await db_session.flush()

    user = await make_user("player-wardrobe@example.com", role="PLAYER")
    db_session.add(
        PlayerVariableValue(user_id=user.id, variable_definition_id=outfit_def.id, value="dress")
    )
    await db_session.flush()

    context = await variables_service.load_context(db_session, str(user.id), str(story_id))
    staged = [StagedCharacter(character_id=str(character.id), sprite="neutral", position="center")]

    result = await _resolve_staged_characters(db_session, str(story_id), staged, context)

    assert result[0]["spriteUrl"] == "https://example.test/dress.png"


async def test_resolve_staged_characters_falls_back_to_plain_sprite_without_outfit(
    make_user, make_chapter, db_session
):
    from app.models.content import Character

    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(
        story_id=story_id, name={"ru": "Данте"}, sprites={"neutral": "https://example.test/dante.png"}
    )
    db_session.add(character)
    await db_session.flush()

    user = await make_user("player-no-wardrobe@example.com", role="PLAYER")
    context = await variables_service.load_context(db_session, str(user.id), str(story_id))
    staged = [StagedCharacter(character_id=str(character.id), sprite="neutral", position="center")]

    result = await _resolve_staged_characters(db_session, str(story_id), staged, context)

    assert result[0]["spriteUrl"] == "https://example.test/dante.png"
```

- [ ] **Step 4: Run them, verify they pass**

Run: `pytest tests/test_wardrobe_sprite_resolution.py -v`
Expected: both PASS.

- [ ] **Step 5: Run the full suite so far to check nothing regressed**

Run: `pytest -v`
Expected: every test from Tasks 1-4 PASSes, including
`test_background_persistence.py` (background resolution and staged-character resolution now
share the same `_build_dialogue_view` call site - this confirms Task 4 didn't break Task 3).

- [ ] **Step 6: Commit**

```bash
ruff format app tests && ruff check app tests
git add app/services/play_service.py tests/test_wardrobe_sprite_resolution.py
git commit -m "feat(api): resolve character sprites against an outfit variable when set"
```

---

## Task 5: File upload endpoint

Covers, backgrounds, and character sprites currently have nowhere to be uploaded to -
`settings.uploads_dir` exists in config but nothing writes to it yet.

This also carries the spec's focal-point requirement (background looks fine on a phone but
crops badly on a future tablet/web layout): the focal point is optional `focalX`/`focalY`
form fields on the upload itself, baked directly into the returned URL's query string
(`.../uploads/<id>.png?fx=0.5&fy=0.3`). No new database column, migration, or table is
needed for it - and because it travels as part of the URL string, it survives Task 3's
background-persistence carry-forward (`slot.current_background_url`) for free, since that
mechanism already stores and forwards the URL verbatim. Reading `fx`/`fy` back out
(`expo-image`'s `contentPosition`) and drawing the drag-to-place marker in the upload UI are
both frontend work for later plans (mobile adaptive phase, `apps/admin` respectively) - this
task's job is only to make sure the value has somewhere to live once those exist.

**Files:**
- Modify: `apps/api/app/config.py` (add `public_base_url`)
- Create: `apps/api/app/services/uploads_service.py`
- Create: `apps/api/app/routers/uploads.py`
- Modify: `apps/api/app/main.py` (mount static files, register router)
- Test: `apps/api/tests/test_uploads.py`

**Interfaces:**
- Consumes: `require_roles` (`app.core.deps`, existing), `make_user`, `auth_headers`,
  `client` (Task 1)
- Produces: `POST /api/admin/uploads` (multipart, field name `file`, optional form fields
  `focalX`/`focalY` as floats in `[0, 1]`) ->
  `{"url": "http://.../uploads/<uuid>.<ext>[?fx=..&fy=..]"}`. The future admin panel plan
  uses this exact endpoint/shape for cover/background/sprite uploads.

- [ ] **Step 1: Add `public_base_url` to settings**

In `apps/api/app/config.py`:

```python
    port: int = 4000
    environment: str = "development"
    uploads_dir: str = "./uploads"
    # Used to build absolute URLs for uploaded files (e.g. "{public_base_url}/uploads/x.png")
    # returned to the admin panel/mobile app - override in .env once deployed somewhere real.
    public_base_url: str = "http://localhost:4000"
```

- [ ] **Step 2: Write the upload service**

```python
"""apps/api/app/services/uploads_service.py"""

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.config import settings

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB - generous for a background/sprite PNG/JPEG.

_EXTENSION_BY_CONTENT_TYPE = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


async def save_upload(
    file: UploadFile, focal_x: float | None = None, focal_y: float | None = None
) -> str:
    """Validates and saves an uploaded image, returning its public URL. An optional focal
    point (each 0-1, fraction of width/height) is encoded straight into the URL's query
    string - see the "Focal point" note in the implementation plan for why nothing else
    needs to store it."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Неподдерживаемый тип файла: {file.content_type}. Разрешены: PNG, JPEG, WebP",
        )
    for name, value in (("focalX", focal_x), ("focalY", focal_y)):
        if value is not None and not (0 <= value <= 1):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{name} должен быть в диапазоне 0-1")

    contents = await file.read()
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Пустой файл")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Файл слишком большой (максимум 10 МБ)")

    uploads_dir = Path(settings.uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)

    extension = _EXTENSION_BY_CONTENT_TYPE[file.content_type]
    filename = f"{uuid.uuid4().hex}{extension}"
    (uploads_dir / filename).write_bytes(contents)

    url = f"{settings.public_base_url}/uploads/{filename}"
    if focal_x is not None and focal_y is not None:
        url += f"?fx={focal_x}&fy={focal_y}"
    return url
```

- [ ] **Step 3: Write the router**

```python
"""apps/api/app/routers/uploads.py"""

from fastapi import APIRouter, Depends, Form, UploadFile, status
from pydantic import BaseModel

from app.core.deps import require_roles
from app.services import uploads_service

router = APIRouter(
    prefix="/admin",
    tags=["admin:uploads"],
    dependencies=[Depends(require_roles("WRITER", "EDITOR", "ADMIN"))],
)


class UploadOut(BaseModel):
    url: str


@router.post("/uploads", status_code=status.HTTP_201_CREATED, response_model=UploadOut)
async def upload_file(
    file: UploadFile,
    focal_x: float | None = Form(default=None, alias="focalX"),
    focal_y: float | None = Form(default=None, alias="focalY"),
) -> UploadOut:
    url = await uploads_service.save_upload(file, focal_x, focal_y)
    return UploadOut(url=url)
```

- [ ] **Step 4: Mount static serving and register the router**

In `apps/api/app/main.py`, add these imports at the top (alongside the existing ones):

```python
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from app.config import settings
```

Change the router import line to include `uploads`:

```python
from app.routers import auth, catalog, characters, favorites, play, scenes, stories, uploads, wallet
```

After `register_exception_handlers(app)` and before the `@app.middleware("http")` block, add:

```python
Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")
```

And add the router registration alongside the other `app.include_router(...)` calls:

```python
app.include_router(uploads.router, prefix="/api")
```

- [ ] **Step 5: Write the failing tests**

```python
"""apps/api/tests/test_uploads.py"""


async def test_upload_valid_image_returns_url(client, make_user, auth_headers, tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))

    writer = await make_user("writer-upload@example.com", role="WRITER")

    response = await client.post(
        "/api/admin/uploads",
        headers=auth_headers(writer),
        files={"file": ("cover.png", b"\x89PNG\r\n\x1a\n" + b"0" * 100, "image/png")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["url"].endswith(".png")
    assert len(list(tmp_path.iterdir())) == 1


async def test_upload_with_focal_point_encodes_it_in_the_returned_url(
    client, make_user, auth_headers, tmp_path, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))

    writer = await make_user("writer-upload-focal@example.com", role="WRITER")

    response = await client.post(
        "/api/admin/uploads",
        headers=auth_headers(writer),
        data={"focalX": "0.5", "focalY": "0.2"},
        files={"file": ("bg.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")},
    )

    assert response.status_code == 201
    assert "fx=0.5" in response.json()["url"]
    assert "fy=0.2" in response.json()["url"]


async def test_upload_rejects_unsupported_content_type(client, make_user, auth_headers, tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))

    writer = await make_user("writer-upload2@example.com", role="WRITER")

    response = await client.post(
        "/api/admin/uploads",
        headers=auth_headers(writer),
        files={"file": ("script.exe", b"not an image", "application/octet-stream")},
    )

    assert response.status_code == 400


async def test_upload_requires_writer_role(client, make_user, auth_headers):
    player = await make_user("player-upload@example.com", role="PLAYER")

    response = await client.post(
        "/api/admin/uploads",
        headers=auth_headers(player),
        files={"file": ("cover.png", b"fake", "image/png")},
    )

    assert response.status_code == 403


async def test_upload_requires_auth(client):
    response = await client.post(
        "/api/admin/uploads",
        files={"file": ("cover.png", b"fake", "image/png")},
    )

    assert response.status_code == 401
```

- [ ] **Step 6: Run them, verify they pass**

Run: `pytest tests/test_uploads.py -v`
Expected: all 5 PASS.

- [ ] **Step 7: Manually verify a file is actually servable**

Run: `uvicorn app.main:app --reload --port 4000` (in one terminal), then in another:
```bash
curl -F "file=@/path/to/any.png;type=image/png" \
  -H "Authorization: Bearer $(python -c "from app.core.security import create_access_token; print(create_access_token('00000000-0000-0000-0000-000000000000','x@example.com','WRITER'))")" \
  http://localhost:4000/api/admin/uploads
```
Expected: JSON `{"url": "http://localhost:4000/uploads/<name>.png"}`. Then `curl` that URL
directly - expected: the same bytes back with a 200.

- [ ] **Step 8: Commit**

```bash
ruff format app tests && ruff check app tests
git add app/config.py app/services/uploads_service.py app/routers/uploads.py app/main.py \
  tests/test_uploads.py
git commit -m "feat(api): add POST /admin/uploads for covers/backgrounds/sprites"
```

---

## Task 6: Side-effect-free chapter preview

Lets an author replay a draft chapter through the real branching logic (conditions, effects,
choices) without ever touching a real `SaveSlot`, `Wallet`, or `PlayerVariableValue` row - the
caller (future admin panel) holds the simulated variable state and passes it back on each
request.

This is a deliberately **separate** implementation from `play_service`'s DB-backed traversal,
not a shared/refactored one - the two have different persistence semantics, and routing a
preview session through the same code path as real, paid gameplay would make "a preview
accidentally mutates real player data" a bug class worth keeping structurally impossible
rather than merely tested against.

**Files:**
- Create: `apps/api/app/schemas/preview.py`
- Create: `apps/api/app/services/preview_service.py`
- Create: `apps/api/app/routers/preview.py`
- Modify: `apps/api/app/main.py` (register router)
- Test: `apps/api/tests/test_preview.py`

**Interfaces:**
- Consumes: `make_user`, `auth_headers`, `make_chapter`, `client`, `db_session` (Task 1),
  `evaluate_condition_group`, `apply_effect`, `VariableBounds`, `variable_lookup_key`
  (existing, `app.engine.condition_engine`)
- Produces: `POST /api/admin/preview/chapters/{chapter_id}` and
  `POST /api/admin/preview/chapters/{chapter_id}/choose` - both return
  `{"view": {...}, "values": {...}}`, where `values` is opaque to the caller (pass whatever
  came back from the previous call straight into the next one's body).

- [ ] **Step 1: Write the request/response schemas**

```python
"""apps/api/app/schemas/preview.py"""

from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.common import VariableScalar


class PreviewResolveInput(CamelModel):
    node_id: str | None = None
    values: dict[str, VariableScalar] = Field(default_factory=dict)


class PreviewChooseInput(CamelModel):
    node_id: str
    choice_option_id: str
    values: dict[str, VariableScalar] = Field(default_factory=dict)


class PreviewViewOut(CamelModel):
    view: dict
    values: dict[str, VariableScalar]
```

- [ ] **Step 2: Write the preview service**

```python
"""apps/api/app/services/preview_service.py

Stateless chapter preview for authors - walks the same node-type branching logic as the real
reading engine (app/services/play_service.py), but never touches SaveSlot, Wallet, or
PlayerVariableValue. See the module docstring in the implementation plan task for why this is
a separate implementation rather than a shared one.
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine.condition_engine import (
    VariableBounds,
    apply_effect,
    evaluate_condition_group,
    variable_lookup_key,
)
from app.models.content import Chapter, Character, ChoiceOption, SceneNode, VariableDefinition
from app.schemas.common import Condition, Effect, VariableScalar
from app.schemas.content import ChoiceNodeData, ConditionNodeData, DialogueNodeData, EffectNodeData

MAX_PREVIEW_STEPS = 100


class _ChapterGraph:
    """Everything preview needs about one chapter, loaded once per request."""

    def __init__(
        self,
        nodes_by_id: dict[str, SceneNode],
        choices_by_node_id: dict[str, list[ChoiceOption]],
        characters_by_id: dict[str, Character],
        variable_defs: list[VariableDefinition],
    ):
        self.nodes_by_id = nodes_by_id
        self.choices_by_node_id = choices_by_node_id
        self.characters_by_id = characters_by_id
        self.variable_defs = variable_defs

    def default_values(self) -> dict[str, VariableScalar]:
        return {
            variable_lookup_key(d.key, str(d.character_id) if d.character_id else None): d.default_value
            for d in self.variable_defs
        }

    def find_def(self, variable_key: str, character_id: str | None) -> VariableDefinition | None:
        for d in self.variable_defs:
            def_character_id = str(d.character_id) if d.character_id else None
            if d.key == variable_key and def_character_id == character_id:
                return d
        return None


async def _load_graph(db: AsyncSession, chapter_id: str) -> tuple[Chapter, _ChapterGraph]:
    chapter = await db.scalar(
        select(Chapter).where(Chapter.id == chapter_id).options(selectinload(Chapter.season))
    )
    if not chapter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Глава не найдена")

    story_id = str(chapter.season.story_id)

    nodes = list(
        await db.scalars(
            select(SceneNode)
            .where(SceneNode.chapter_id == chapter_id)
            .options(selectinload(SceneNode.choice_options))
        )
    )
    nodes_by_id = {str(n.id): n for n in nodes}
    choices_by_node_id = {str(n.id): sorted(n.choice_options, key=lambda o: o.order) for n in nodes}

    characters = list(await db.scalars(select(Character).where(Character.story_id == story_id)))
    characters_by_id = {str(c.id): c for c in characters}

    variable_defs = list(
        await db.scalars(select(VariableDefinition).where(VariableDefinition.story_id == story_id))
    )

    return chapter, _ChapterGraph(nodes_by_id, choices_by_node_id, characters_by_id, variable_defs)


def _get_node(graph: _ChapterGraph, node_id: str) -> SceneNode:
    node = graph.nodes_by_id.get(node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сцена не найдена в этой главе")
    return node


def _apply_effects_in_memory(
    graph: _ChapterGraph, values: dict[str, VariableScalar], effects
) -> dict[str, VariableScalar]:
    next_values = dict(values)
    for effect in effects:
        definition = graph.find_def(effect.variable_key, effect.character_id)
        if not definition:
            continue
        key = variable_lookup_key(effect.variable_key, effect.character_id)
        current = next_values.get(key, definition.default_value)
        next_values[key] = apply_effect(
            effect, current, VariableBounds(definition.min_value, definition.max_value)
        )
    return next_values


def _resolve_staged(graph: _ChapterGraph, staged: list, values: dict[str, VariableScalar]) -> list[dict]:
    result = []
    for s in staged:
        character = graph.characters_by_id.get(s.character_id)
        sprites = character.sprites if character else {}
        outfit = values.get(variable_lookup_key("outfit", s.character_id))
        sprite_url = sprites.get(f"{outfit}_{s.sprite}") if outfit else None
        if sprite_url is None:
            sprite_url = sprites.get(s.sprite)
        result.append(
            {
                "characterId": s.character_id,
                "name": character.name if character else {"ru": "?"},
                "nameColor": character.name_color if character else "#FFFFFF",
                "spriteUrl": sprite_url,
                "position": s.position,
            }
        )
    return result


def _walk(
    graph: _ChapterGraph, start_node_id: str, values: dict[str, VariableScalar]
) -> tuple[dict, dict[str, VariableScalar]]:
    node_id = start_node_id
    steps = 0

    while True:
        if steps > MAX_PREVIEW_STEPS:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Обнаружен слишком длинный автоматический переход между сценами - возможен цикл в сюжете",
            )
        steps += 1
        node = _get_node(graph, node_id)

        if node.type.value == "CONDITION":
            data = ConditionNodeData.model_validate(node.data)
            passes = evaluate_condition_group(data.when, values)
            next_id = data.then_node_id if passes else data.else_node_id
            if not next_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Условный узел не ведёт никуда дальше")
            node_id = next_id
            continue

        if node.type.value == "EFFECT":
            data = EffectNodeData.model_validate(node.data)
            values = _apply_effects_in_memory(graph, values, data.effects)
            if not data.next_node_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Узел эффекта не ведёт никуда дальше")
            node_id = data.next_node_id
            continue

        if node.type.value == "END":
            return {"type": "END", "nodeId": str(node.id)}, values

        if node.type.value == "DIALOGUE":
            data = DialogueNodeData.model_validate(node.data)
            speaker = (
                graph.characters_by_id.get(data.speaker_character_id)
                if data.speaker_character_id
                else None
            )
            view = {
                "type": "DIALOGUE",
                "nodeId": str(node.id),
                "speaker": {"id": str(speaker.id), "name": speaker.name, "nameColor": speaker.name_color}
                if speaker
                else None,
                "text": data.text.model_dump(),
                "isThought": data.is_thought,
                "backgroundImageUrl": data.background_image_url,
                "staged": _resolve_staged(graph, data.staged, values),
                "canAdvance": bool(data.next_node_id),
                "nextNodeId": data.next_node_id,
            }
            return view, values

        # CHOICE
        data = ChoiceNodeData.model_validate(node.data)
        options = graph.choices_by_node_id.get(str(node.id), [])
        visible_options = []
        for option in options:
            visible_when = [Condition.model_validate(c) for c in option.visible_when]
            if not evaluate_condition_group(visible_when, values):
                continue
            visible_options.append(
                {
                    "id": str(option.id),
                    "text": option.text,
                    "costCurrency": option.cost_currency.value if option.cost_currency else None,
                    "costAmount": option.cost_amount,
                    # Preview has no wallet to check against - every visible option reads as
                    # affordable, same as an author previewing with unlimited currency.
                    "affordable": True,
                }
            )
        view = {
            "type": "CHOICE",
            "nodeId": str(node.id),
            "prompt": data.prompt.model_dump() if data.prompt else None,
            "options": visible_options,
        }
        return view, values


async def resolve(
    db: AsyncSession, chapter_id: str, node_id: str | None, values: dict
) -> tuple[dict, dict]:
    chapter, graph = await _load_graph(db, chapter_id)
    start_node_id = node_id or (str(chapter.entry_node_id) if chapter.entry_node_id else None)
    if not start_node_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "У главы не задана начальная сцена")

    merged_values = {**graph.default_values(), **values}
    return _walk(graph, start_node_id, merged_values)


async def choose(
    db: AsyncSession, chapter_id: str, node_id: str, choice_option_id: str, values: dict
) -> tuple[dict, dict]:
    chapter, graph = await _load_graph(db, chapter_id)
    node = _get_node(graph, node_id)
    if node.type.value != "CHOICE":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "В этом узле нет вариантов выбора")

    option = next(
        (o for o in graph.choices_by_node_id.get(node_id, []) if str(o.id) == choice_option_id), None
    )
    if not option:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Этот вариант недоступен в этом узле")

    merged_values = {**graph.default_values(), **values}
    next_values = _apply_effects_in_memory(
        graph, merged_values, [Effect.model_validate(e) for e in option.effects]
    )
    if not option.next_node_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "У этого варианта нет продолжения")

    return _walk(graph, str(option.next_node_id), next_values)
```

- [ ] **Step 3: Write the router**

```python
"""apps/api/app/routers/preview.py"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.database import get_db
from app.schemas.preview import PreviewChooseInput, PreviewResolveInput, PreviewViewOut
from app.services import preview_service

router = APIRouter(
    prefix="/admin/preview",
    tags=["admin:preview"],
    dependencies=[Depends(require_roles("WRITER", "EDITOR", "ADMIN"))],
)


@router.post("/chapters/{chapter_id}", response_model=PreviewViewOut)
async def resolve_preview(chapter_id: str, body: PreviewResolveInput, db: AsyncSession = Depends(get_db)):
    view, values = await preview_service.resolve(db, chapter_id, body.node_id, body.values)
    return PreviewViewOut(view=view, values=values)


@router.post("/chapters/{chapter_id}/choose", response_model=PreviewViewOut)
async def choose_preview(chapter_id: str, body: PreviewChooseInput, db: AsyncSession = Depends(get_db)):
    view, values = await preview_service.choose(
        db, chapter_id, body.node_id, body.choice_option_id, body.values
    )
    return PreviewViewOut(view=view, values=values)
```

- [ ] **Step 4: Register the router**

In `apps/api/app/main.py`, extend the router import line again:

```python
from app.routers import (
    auth,
    catalog,
    characters,
    favorites,
    play,
    preview,
    scenes,
    stories,
    uploads,
    wallet,
)
```

Add the registration next to the other `app.include_router(...)` calls:

```python
app.include_router(preview.router, prefix="/api")
```

- [ ] **Step 5: Write the failing tests**

```python
"""apps/api/tests/test_preview.py"""

from sqlalchemy import select

from app.models.content import Character, ChoiceOption, SceneNode, VariableDefinition
from app.models.player import PlayerVariableValue, SaveSlot


async def test_resolve_preview_returns_entry_dialogue_without_creating_save_slot(
    client, make_user, auth_headers, make_chapter, db_session
):
    chapter = await make_chapter()
    node = SceneNode(
        chapter_id=chapter.id, type="DIALOGUE", order=0, data={"text": {"ru": "Привет!"}}
    )
    db_session.add(node)
    await db_session.flush()
    chapter.entry_node_id = node.id
    await db_session.flush()

    writer = await make_user("writer-preview@example.com", role="WRITER")

    response = await client.post(
        f"/api/admin/preview/chapters/{chapter.id}",
        headers=auth_headers(writer),
        json={"values": {}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["view"]["type"] == "DIALOGUE"
    assert body["view"]["text"]["ru"] == "Привет!"

    slots = list(await db_session.scalars(select(SaveSlot)))
    assert slots == []


async def test_choose_preview_applies_effect_only_in_memory(
    client, make_user, auth_headers, make_chapter, db_session
):
    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(story_id=story_id, name={"ru": "Ирис"})
    db_session.add(character)
    await db_session.flush()

    variable_def = VariableDefinition(
        story_id=story_id,
        key="affection",
        label={"ru": "Симпатия"},
        type="NUMBER",
        default_value=0,
        character_id=character.id,
    )
    db_session.add(variable_def)

    choice_node = SceneNode(chapter_id=chapter.id, type="CHOICE", order=0, data={})
    db_session.add(choice_node)
    await db_session.flush()

    end_node = SceneNode(chapter_id=chapter.id, type="END", order=1, data={})
    db_session.add(end_node)
    await db_session.flush()

    option = ChoiceOption(
        node_id=choice_node.id,
        order=0,
        text={"ru": "Улыбнуться"},
        effects=[
            {"variable_key": "affection", "character_id": str(character.id), "op": "INCREMENT", "value": 1}
        ],
        next_node_id=end_node.id,
    )
    db_session.add(option)
    await db_session.flush()

    writer = await make_user("writer-preview2@example.com", role="WRITER")

    response = await client.post(
        f"/api/admin/preview/chapters/{chapter.id}/choose",
        headers=auth_headers(writer),
        json={"nodeId": str(choice_node.id), "choiceOptionId": str(option.id), "values": {}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["view"]["type"] == "END"
    assert body["values"][f"affection::{character.id}"] == 1

    values_in_db = list(await db_session.scalars(select(PlayerVariableValue)))
    assert values_in_db == []
```

- [ ] **Step 6: Run them, verify they pass**

Run: `pytest tests/test_preview.py -v`
Expected: both PASS.

- [ ] **Step 7: Run the full suite one more time**

Run: `pytest -v`
Expected: every test across all six tasks PASSes.

- [ ] **Step 8: Commit**

```bash
ruff format app tests && ruff check app tests
git add app/schemas/preview.py app/services/preview_service.py app/routers/preview.py \
  app/main.py tests/test_preview.py
git commit -m "feat(api): add side-effect-free chapter preview for the admin panel"
```
