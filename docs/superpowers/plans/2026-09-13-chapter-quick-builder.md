# Chapter Quick Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the admin panel's chapter editor from "create a node, hunt for the right UUID in
a dropdown" into a fast, button-driven scene builder for scenarists — plus give the reading
engine two new authoring primitives (a character's on-screen position, and a character's
display name changing mid-story) it doesn't have today.

**Architecture:** Almost everything here is additive to `apps/admin` and small, surgical reads
in `apps/api`'s reading engine (`play_service`/`preview_service`) — no new `SceneNodeType`, no
`condition_engine.py` changes. "Переименовать" and "Смена наряда" are EFFECT/CHOICE nodes the
admin panel builds for the author, not new engine concepts. The screen-position work
(protagonist left / others right / narrator centered) reuses a wire field
(`staged[].position`) the backend already sends — it's a rendering change in `apps/mobile` and
`apps/admin`'s `PreviewPlayer`, not a new API shape.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Alembic (backend, unchanged stack); Next.js
16 admin panel (unchanged stack, no test runner — verified by typecheck/lint/build + `orca`);
Expo/React Native for the one mobile change.

**Spec:** `docs/superpowers/specs/2026-09-13-chapter-quick-builder.md` — read it first for the
full rationale and the worked examples (Рассказчик/Маша/Иваша/Выбор-на-статы/дисклеймер;
Одри/Давид position) this plan implements against.

## Global Constraints

- **No new `SceneNodeType`, no `condition_engine.py` changes.** "Переименовать" produces a
  plain EFFECT node; "Смена наряда" produces a plain CHOICE node + `ChoiceOption`s. Both go
  through the exact same `POST /admin/scene-nodes` / `POST /admin/choice-options` endpoints
  every other node already uses.
- **`DialogueNodeData` already has `background_image_url` and `staged` on the backend**
  (`apps/api/app/schemas/content.py`) — confirmed by reading the schema, not assumed. Tasks
  that add background/staged fields to the admin UI touch **only** `apps/admin`; do not add
  backend fields that already exist.
- **Effects only apply if a matching `VariableDefinition` exists** — `variables_service.apply_effects`
  and `preview_service._apply_effects_in_memory` both silently skip (log + `continue`) an
  effect whose `(variable_key, character_id)` has no `VariableDefinition` row. This is why the
  existing "outfit" wardrobe feature auto-creates a `VariableDefinition` the first time a
  second outfit is added (`apps/admin/components/WardrobeMatrix.tsx`'s `onAddOutfit`) — the
  new "Переименовать" quick action **must follow the identical pattern** for `__display_name`,
  or the rename will silently do nothing. Follow `onAddOutfit`'s de-dup guard
  (`locallyCreatedOutfitVariable`) shape exactly to avoid a duplicate-POST 409 on rapid re-use.
- **`VARIABLE_KEY_RE` (`^[a-z][a-z0-9_]*$`) only gates `POST /admin/variables`'s `key` field**
  (`apps/api/app/schemas/content.py`), not `Effect.variable_key` / `Condition.variable_key`
  (`apps/api/app/schemas/common.py`, no pattern). `__display_name` is a valid `key` for
  `POST /admin/variables` too, since it starts with `_`, not `^[a-z]` — wait, it does NOT match
  that regex (leading underscore). **`POST /admin/variables` for `__display_name` must go
  through as-is with this key** — confirm this in Task 10 before relying on it; if the regex
  rejects it, the fix is changing the key to something regex-legal (e.g. `display_name`, still
  effectively hidden by convention/UI filtering rather than by leading underscore) rather than
  loosening the regex for everyone. Task 10 verifies this first (see its Step 1).
- **Money/currency:** `price_hard` and `costAmount` are always integers (crystals), never floats.
- **All new Pydantic schemas use `CamelModel`** (snake_case Python, camelCase JSON) — see any
  existing schema in `apps/api/app/schemas/` for the pattern. All new Zod schemas go in
  `packages/shared/src/schemas/content.ts` mirroring the Pydantic shape by value, same
  camelCase convention (see `characterCreateSchema` for the pattern).
- **`apps/admin` and `apps/mobile` have no test runner** — verification is
  `pnpm --filter <pkg> typecheck && lint && build`, plus a live `orca` walkthrough. `apps/api`
  uses `pytest` (TDD) exactly as in every other task in this repo's history.
- **Design skills (repo CLAUDE.md):** every visual `apps/admin`/`apps/mobile` task in this plan
  runs `Skill critique` then `Skill polish` before being marked done, and follows
  `apps/admin`'s existing plain-neutral utility style (this is the same panel documented in
  `docs/superpowers/specs/2026-08-31-admin-panel-design.md` — not the cabinet's dark/gold
  aesthetic). Name in the task notes what each skill flagged and what you changed. Frontend-design
  exploration is not needed for new visual direction here — this plan extends an existing,
  already-styled screen, not a new one.
- **Commit convention:** every task ends with a commit `feat(api): ...` / `feat(admin): ...` /
  `feat(mobile): ...` as appropriate, trailer lines:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV`.

---

### Task 1: Backend — Character identity fields (`firstName`/`lastName`/`isProtagonist`)

**Files:**
- Modify: `apps/api/app/models/content.py` (`Character`)
- Modify: `apps/api/app/schemas/content.py` (`CharacterCreateInput`, `CharacterUpdateInput`)
- Modify: `apps/api/app/schemas/responses.py` (`CharacterOut`)
- Modify: `apps/api/app/services/characters_service.py` (`create`, `update`)
- Modify: `packages/shared/src/schemas/content.ts` (`characterCreateSchema`)
- Create: `apps/api/tests/test_character_identity.py`
- Create: one Alembic migration (autogenerate)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Character.first_name: str | None`, `Character.last_name: str | None`,
  `Character.is_protagonist: bool` (default `False`). `characters_service.update` enforces
  "at most one protagonist per story" — setting `is_protagonist=True` on one character clears
  it on every other character in the same story, in the same transaction. Later tasks (5, 8)
  read `isProtagonist` to pick left/right defaults.

- [ ] **Step 1: Write the failing tests**

Look at `apps/api/tests/conftest.py` and an existing content test
(`apps/api/tests/test_scene_node_create.py` or similar) for the exact `client`/`make_user`/
`auth_headers` fixture usage before writing these.

```python
# apps/api/tests/test_character_identity.py
from sqlalchemy import select

from app.models.content import Character


async def test_create_character_with_identity_fields(client, make_user, auth_headers, make_story):
    writer = await make_user("writer-identity@example.com", role="WRITER")
    story = await make_story()
    response = await client.post(
        "/api/admin/characters",
        json={
            "storyId": str(story.id),
            "name": {"ru": "Негодяй"},
            "firstName": "Виктор",
            "lastName": "Соколов",
        },
        headers=auth_headers(writer),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["firstName"] == "Виктор"
    assert body["lastName"] == "Соколов"
    assert body["isProtagonist"] is False


async def test_setting_protagonist_clears_previous_one_in_same_story(
    client, make_user, auth_headers, make_story, make_character
):
    writer = await make_user("writer-protagonist@example.com", role="WRITER")
    story = await make_story()
    first = await make_character(story, name={"ru": "Одри"})
    second = await make_character(story, name={"ru": "Давид"})

    r1 = await client.patch(
        f"/api/admin/characters/{first.id}", json={"isProtagonist": True}, headers=auth_headers(writer)
    )
    assert r1.status_code == 200
    assert r1.json()["isProtagonist"] is True

    r2 = await client.patch(
        f"/api/admin/characters/{second.id}", json={"isProtagonist": True}, headers=auth_headers(writer)
    )
    assert r2.status_code == 200
    assert r2.json()["isProtagonist"] is True

    r1_again = await client.get(f"/api/admin/characters?storyId={story.id}", headers=auth_headers(writer))
    by_id = {c["id"]: c for c in r1_again.json()}
    assert by_id[str(first.id)]["isProtagonist"] is False
    assert by_id[str(second.id)]["isProtagonist"] is True


async def test_protagonist_flag_is_scoped_per_story(
    client, make_user, auth_headers, make_story, make_character
):
    writer = await make_user("writer-protagonist-2@example.com", role="WRITER")
    story_a = await make_story()
    story_b = await make_story()
    hero_a = await make_character(story_a, name={"ru": "Герой А"}, is_protagonist=True)
    hero_b = await make_character(story_b, name={"ru": "Герой Б"})

    response = await client.patch(
        f"/api/admin/characters/{hero_b.id}", json={"isProtagonist": True}, headers=auth_headers(writer)
    )
    assert response.status_code == 200

    refreshed = await client.get(f"/api/admin/characters?storyId={story_a.id}", headers=auth_headers(writer))
    assert refreshed.json()[0]["id"] == str(hero_a.id)
    assert refreshed.json()[0]["isProtagonist"] is True  # untouched by story_b's change
```

If `make_story`/`make_character` fixtures don't already exist in `conftest.py`, add them
(small factory fixtures following the exact shape of `make_user` — create via direct
`db_session.add`/`flush`, not via the API, matching how other content tests set up fixtures;
check `test_season_create.py`/`test_scene_node_create.py` for the established pattern before
inventing a new one).

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
cd apps/api && source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest tests/test_character_identity.py -v
```
Expected: fails on the new fields not existing (schema validation error or `KeyError` on
`firstName`/`isProtagonist` in the response body).

- [ ] **Step 3: Add the model columns**

In `apps/api/app/models/content.py`, `class Character`:
```python
first_name: Mapped[str | None] = mapped_column(String, nullable=True)
last_name: Mapped[str | None] = mapped_column(String, nullable=True)
is_protagonist: Mapped[bool] = mapped_column(Boolean, default=False)
```
Add `Boolean` to the `sqlalchemy` import at the top of the file if not already imported.

- [ ] **Step 4: Generate and apply the migration**

```bash
alembic revision --autogenerate -m "add character identity fields"
```
Inspect the generated file (three `add_column` calls, `is_protagonist` with
`server_default=sa.false()` so existing rows get `False`, not `NULL`) before applying:
```bash
alembic upgrade head
```

- [ ] **Step 5: Update schemas**

`apps/api/app/schemas/content.py`:
```python
class CharacterCreateInput(CamelModel):
    story_id: str
    name: LocalizedText
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    name_color: str = Field(default="#E8B4BC", pattern=r"^#[0-9a-fA-F]{6}$")
    sprites: dict[str, str] = Field(default_factory=dict)


class CharacterUpdateInput(CamelModel):
    name: LocalizedText | None = None
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    name_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    sprites: dict[str, str] | None = None
    is_protagonist: bool | None = None
```
`apps/api/app/schemas/responses.py`, `CharacterOut`: add `first_name: str | None`,
`last_name: str | None`, `is_protagonist: bool`.

- [ ] **Step 6: Enforce "at most one protagonist per story" in the service**

`apps/api/app/services/characters_service.py`:
```python
async def update(db: AsyncSession, character_id: str, data: CharacterUpdateInput) -> Character:
    character = await db.get(Character, character_id)
    if not character:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Персонаж не найден")

    payload = data.model_dump(exclude_unset=True)
    if payload.get("is_protagonist") is True:
        # At most one protagonist per story - clear it from anyone else first, same transaction.
        await db.execute(
            update(Character)
            .where(Character.story_id == character.story_id, Character.id != character.id)
            .values(is_protagonist=False)
        )

    for field, value in payload.items():
        setattr(character, field, value)
    await db.commit()
    await db.refresh(character)
    return character
```
Add `update` (SQLAlchemy's, aliased if `update` the function name collides — e.g.
`from sqlalchemy import update as sa_update`) to the imports at the top of the file.

- [ ] **Step 7: Run the tests, confirm green, then the full suite**

```bash
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest tests/test_character_identity.py -v
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest
ruff check app seed.py tests && ruff format app seed.py tests
```

- [ ] **Step 8: Mirror the shared Zod schema**

`packages/shared/src/schemas/content.ts`:
```ts
export const characterCreateSchema = z.object({
  storyId: z.string().uuid(),
  name: localizedTextSchema,
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  nameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#E8B4BC"),
  sprites: z.record(z.string(), z.string()).default({}),
});
```
(`characterUpdateSchema` is already derived via `.partial().omit({storyId: true})` — no change
needed there beyond what the base schema now includes; `isProtagonist` is admin-only-mutated
via a dedicated action in Task 8/10, not through this create-time schema, so it does not need
to appear in `characterCreateSchema` — only in the Pydantic `CharacterUpdateInput` from Step 5.)

- [ ] **Step 9: Commit**

```bash
git add apps/api/app/models/content.py apps/api/app/schemas/content.py apps/api/app/schemas/responses.py apps/api/app/services/characters_service.py apps/api/alembic/versions/ apps/api/tests/test_character_identity.py apps/api/tests/conftest.py packages/shared/src/schemas/content.ts
git commit -m "feat(api): character first/last name + single-protagonist-per-story flag

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 2: Backend — Outfit catalog (price + stat effects)

**Files:**
- Create: `apps/api/app/models/content.py` (`Outfit` class, same file as `Character`)
- Create: `apps/api/app/schemas/content.py` (`OutfitCreateInput`, `OutfitUpdateInput`)
- Create: `apps/api/app/schemas/responses.py` (`OutfitOut`)
- Create: `apps/api/app/routers/outfits.py`
- Create: `apps/api/app/services/outfits_service.py`
- Modify: `apps/api/app/main.py` (register the router)
- Modify: `apps/api/app/models/__init__.py` (register `Outfit` for Alembic, same pattern as
  every other model)
- Modify: `packages/shared/src/schemas/content.ts` (`outfitCreateSchema`)
- Create: `apps/api/tests/test_outfits.py`
- Create: one Alembic migration

**Interfaces:**
- Consumes: `Character` (Task 1, for the `character_id` FK), the existing `Effect`/`EffectList`
  schema from `apps/api/app/schemas/common.py` for `stat_effects` (reuse verbatim, do not
  redefine).
- Produces: `GET /admin/characters/{character_id}/outfits` (list),
  `POST /admin/characters/{character_id}/outfits` (create),
  `PATCH /admin/outfits/{outfit_id}` (update price/label/stat_effects),
  `DELETE /admin/outfits/{outfit_id}`. Task 6 (admin UI) and Task 10 (Смена наряда quick
  action) both call these.

- [ ] **Step 1: Write the failing tests**

```python
# apps/api/tests/test_outfits.py
async def test_create_outfit_with_price_and_stat_effects(client, make_user, auth_headers, make_story, make_character):
    writer = await make_user("writer-outfit@example.com", role="WRITER")
    story = await make_story()
    character = await make_character(story, name={"ru": "Маша"})

    response = await client.post(
        f"/api/admin/characters/{character.id}/outfits",
        json={
            "key": "dress",
            "label": {"ru": "Вечернее платье"},
            "priceHard": 150,
            "statEffects": [{"variableKey": "charm", "characterId": None, "op": "INCREMENT", "value": 5}],
        },
        headers=auth_headers(writer),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["priceHard"] == 150
    assert body["statEffects"][0]["variableKey"] == "charm"


async def test_free_outfit_defaults_price_to_zero(client, make_user, auth_headers, make_story, make_character):
    writer = await make_user("writer-outfit-free@example.com", role="WRITER")
    story = await make_story()
    character = await make_character(story, name={"ru": "Маша"})

    response = await client.post(
        f"/api/admin/characters/{character.id}/outfits",
        json={"key": "jeans", "label": {"ru": "Джинсы"}},
        headers=auth_headers(writer),
    )
    assert response.status_code == 201
    assert response.json()["priceHard"] == 0
    assert response.json()["statEffects"] == []


async def test_list_outfits_for_character(client, make_user, auth_headers, make_story, make_character):
    writer = await make_user("writer-outfit-list@example.com", role="WRITER")
    story = await make_story()
    character = await make_character(story, name={"ru": "Маша"})
    await client.post(
        f"/api/admin/characters/{character.id}/outfits",
        json={"key": "jeans", "label": {"ru": "Джинсы"}},
        headers=auth_headers(writer),
    )

    response = await client.get(f"/api/admin/characters/{character.id}/outfits", headers=auth_headers(writer))
    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_update_and_delete_outfit(client, make_user, auth_headers, make_story, make_character):
    writer = await make_user("writer-outfit-update@example.com", role="WRITER")
    story = await make_story()
    character = await make_character(story, name={"ru": "Маша"})
    created = await client.post(
        f"/api/admin/characters/{character.id}/outfits",
        json={"key": "jeans", "label": {"ru": "Джинсы"}},
        headers=auth_headers(writer),
    )
    outfit_id = created.json()["id"]

    updated = await client.patch(
        f"/api/admin/outfits/{outfit_id}", json={"priceHard": 50}, headers=auth_headers(writer)
    )
    assert updated.status_code == 200
    assert updated.json()["priceHard"] == 50

    deleted = await client.delete(f"/api/admin/outfits/{outfit_id}", headers=auth_headers(writer))
    assert deleted.status_code == 204
```

- [ ] **Step 2: Run, confirm failure (404 - route doesn't exist)**

```bash
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest tests/test_outfits.py -v
```

- [ ] **Step 3: Add the `Outfit` model**

In `apps/api/app/models/content.py`, right after `Character`:
```python
class Outfit(Base, UUIDPKMixin, TimestampMixin):
    """A purchasable/selectable outfit for one character - `key` matches the outfit column
    name already used in `Character.sprites` (e.g. "dress" -> sprite key "dress_smile"). Price
    and stat_effects are what the player-facing "Смена наряда" choice is built from; the
    sprite images themselves stay in Character.sprites, untouched by this table."""

    __tablename__ = "outfits"

    character_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("characters.id", ondelete="CASCADE")
    )
    key: Mapped[str] = mapped_column(String)
    label: Mapped[dict] = mapped_column(JSONB)
    price_hard: Mapped[int] = mapped_column(Integer, default=0)
    stat_effects: Mapped[list] = mapped_column(JSONB, default=list)

    character: Mapped[Character] = relationship()
```
Confirm `Integer`/`JSONB`/`relationship` are already imported in this file (they are, used by
sibling classes) — do not re-import if present.

Register in `apps/api/app/models/__init__.py` next to `Character`.

- [ ] **Step 4: Generate and apply the migration**

```bash
alembic revision --autogenerate -m "add outfits table"
alembic upgrade head
```

- [ ] **Step 5: Add schemas**

`apps/api/app/schemas/content.py`:
```python
class OutfitCreateInput(CamelModel):
    key: str = Field(min_length=1, max_length=40)
    label: LocalizedText
    price_hard: int = Field(default=0, ge=0)
    stat_effects: EffectList = Field(default_factory=list)


class OutfitUpdateInput(CamelModel):
    label: LocalizedText | None = None
    price_hard: int | None = Field(default=None, ge=0)
    stat_effects: EffectList | None = None
```
`apps/api/app/schemas/responses.py`:
```python
class OutfitOut(ORMModel):
    id: uuid.UUID
    character_id: uuid.UUID
    key: str
    label: LocalizedText
    price_hard: int
    stat_effects: EffectList
```
(`EffectList`/`LocalizedText` already imported in both files for other schemas - reuse, don't
redefine.)

- [ ] **Step 6: Write the service**

`apps/api/app/services/outfits_service.py`:
```python
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Outfit
from app.schemas.content import OutfitCreateInput, OutfitUpdateInput


async def list_for_character(db: AsyncSession, character_id: str) -> list[Outfit]:
    result = await db.scalars(select(Outfit).where(Outfit.character_id == character_id))
    return list(result)


async def create(db: AsyncSession, character_id: str, data: OutfitCreateInput) -> Outfit:
    outfit = Outfit(character_id=character_id, **data.model_dump())
    db.add(outfit)
    await db.commit()
    await db.refresh(outfit)
    return outfit


async def update(db: AsyncSession, outfit_id: str, data: OutfitUpdateInput) -> Outfit:
    outfit = await db.get(Outfit, outfit_id)
    if not outfit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Наряд не найден")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(outfit, field, value)
    await db.commit()
    await db.refresh(outfit)
    return outfit


async def remove(db: AsyncSession, outfit_id: str) -> None:
    outfit = await db.get(Outfit, outfit_id)
    if not outfit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Наряд не найден")
    await db.delete(outfit)
    await db.commit()
```

- [ ] **Step 7: Write the router**

`apps/api/app/routers/outfits.py` — mirror `apps/api/app/routers/characters.py`'s
`require_roles("WRITER", "EDITOR", "ADMIN")` + `/admin` prefix pattern exactly:
```python
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.database import get_db
from app.schemas.content import OutfitCreateInput, OutfitUpdateInput
from app.schemas.responses import OutfitOut
from app.services import outfits_service

router = APIRouter(prefix="/admin", tags=["admin:outfits"], dependencies=[Depends(require_roles("WRITER", "EDITOR", "ADMIN"))])


@router.get("/characters/{character_id}/outfits", response_model=list[OutfitOut])
async def list_outfits(character_id: str, db: AsyncSession = Depends(get_db)):
    return await outfits_service.list_for_character(db, character_id)


@router.post("/characters/{character_id}/outfits", status_code=status.HTTP_201_CREATED, response_model=OutfitOut)
async def create_outfit(character_id: str, body: OutfitCreateInput, db: AsyncSession = Depends(get_db)):
    return await outfits_service.create(db, character_id, body)


@router.patch("/outfits/{outfit_id}", response_model=OutfitOut)
async def update_outfit(outfit_id: str, body: OutfitUpdateInput, db: AsyncSession = Depends(get_db)):
    return await outfits_service.update(db, outfit_id, body)


@router.delete("/outfits/{outfit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_outfit(outfit_id: str, db: AsyncSession = Depends(get_db)):
    await outfits_service.remove(db, outfit_id)
```
Register in `apps/api/app/main.py`: add `outfits` to the `from app.routers import (...)` list
(alphabetical, next to `characters`) and `app.include_router(outfits.router, prefix="/api")`
next to `characters.router`.

- [ ] **Step 8: Run tests, full suite, lint**

```bash
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest tests/test_outfits.py -v
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest
ruff check app seed.py tests && ruff format app seed.py tests
```

- [ ] **Step 9: Mirror the shared Zod schema**

`packages/shared/src/schemas/content.ts`:
```ts
export const outfitCreateSchema = z.object({
  key: z.string().min(1).max(40),
  label: localizedTextSchema,
  priceHard: z.number().int().min(0).default(0),
  statEffects: z.array(effectSchema).default([]),  // reuse the existing effect schema - check
                                                     // its exact export name in this file first
});
export type OutfitCreateInput = z.infer<typeof outfitCreateSchema>;
export const outfitUpdateSchema = outfitCreateSchema.partial().omit({ key: true });
```
(Find the existing effect Zod schema's exact name in `packages/shared/src/schemas/common.ts`
before writing this — reuse it, don't redefine.)

- [ ] **Step 10: Commit**

```bash
git add apps/api/app/models/content.py apps/api/app/models/__init__.py apps/api/app/schemas/content.py apps/api/app/schemas/responses.py apps/api/app/routers/outfits.py apps/api/app/services/outfits_service.py apps/api/app/main.py apps/api/alembic/versions/ apps/api/tests/test_outfits.py packages/shared/src/schemas/content.ts
git commit -m "feat(api): outfit catalog per character - price in crystals + stat effects

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 3: Backend — `__display_name` override in the reading engine

**Files:**
- Modify: `apps/api/app/services/play_service.py` (`_build_dialogue_view`)
- Modify: `apps/api/app/services/preview_service.py` (dialogue-view construction)
- Create: `apps/api/tests/test_display_name_override.py`

**Interfaces:**
- Consumes: `VariableContext.as_value_map()` (`play_service`, already loaded per-request),
  `graph.find_def` / `values` dict (`preview_service`, already in scope) — both existing,
  no new plumbing. `variable_lookup_key("__display_name", character_id)` from
  `app.engine.condition_engine` (already imported in both files).
- Produces: wherever a `DIALOGUE` node's speaker name is built, it now reads a
  `__display_name` override first, falling back to `Character.name`. **This task only makes
  the read side work.** Nothing writes a `__display_name` value yet — that's the "Переименовать"
  admin action in Task 10, which must also auto-create the `VariableDefinition` (see the Global
  Constraints note on why an effect with no matching definition is silently ignored). Write
  this task's tests by inserting a `VariableDefinition`+`PlayerVariableValue` row directly
  (or via `make_user`-style fixtures), not by exercising a "rename" endpoint that doesn't
  exist yet.

- [ ] **Step 1: Write the failing tests**

Read `apps/api/tests/test_stats.py` or an existing `play_service`-exercising test first for the
exact fixtures this needs (a story with a chapter/dialogue node, a save slot, auth headers).

```python
# apps/api/tests/test_display_name_override.py
from app.models.content import VariableDefinition
from app.models.player import PlayerVariableValue

async def test_speaker_name_falls_back_to_character_name_with_no_override(
    client, make_user, auth_headers, make_story_with_dialogue_chapter  # or the equivalent
    # fixture already used by play_service tests - check test_stats.py / test_payments.py's
    # story-with-progress setup pattern, or apps/api/seed.py's seed_demo_story, for how a
    # full playable story is normally built in a test
):
    ...  # start the chapter, assert the DIALOGUE view's speaker.name.ru == the character's
    # original name.ru

async def test_speaker_name_uses_display_name_override_when_set(
    client, make_user, auth_headers, db_session, ...
):
    # Insert a VariableDefinition(key="__display_name", character_id=<speaker>, type="STRING",
    # default_value=<original name>) and a PlayerVariableValue(user_id=<player>,
    # variable_definition_id=<that def>, value="Виктор") directly via db_session, commit, then
    # start/advance to that DIALOGUE node and assert speaker.name.ru == "Виктор".

async def test_preview_speaker_name_uses_display_name_override_when_set(
    client, make_user, auth_headers, db_session, ...
):
    # Same VariableDefinition insert (preview has no PlayerVariableValue - it takes the
    # definition's default_value as the starting value, matching how every other preview
    # variable behaves), then POST /admin/preview/chapters/{id} and assert the returned
    # view's speaker.name.ru == the override.
```

Write these against whatever fixture pattern this repo's existing `play_service`/`preview_service`
tests already use for "a story with a playable dialogue chapter" — do not invent a new one if
`test_stats.py`/`test_preview.py` already has a reusable shape.

- [ ] **Step 2: Run, confirm failure**

```bash
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest tests/test_display_name_override.py -v
```
Expected: speaker name comes back as the original `Character.name`, not the override, in both
"override set" tests.

- [ ] **Step 3: `play_service.py` — read the override**

In `_build_dialogue_view` (`apps/api/app/services/play_service.py`), after `speaker = characters.get(...)`:
```python
speaker_view = None
if speaker:
    name = speaker["name"]
    override_key = variable_lookup_key("__display_name", data.speaker_character_id)
    override = context.as_value_map().get(override_key)
    if isinstance(override, str) and override:
        name = {"ru": override}
    speaker_view = {"id": speaker["id"], "name": name, "nameColor": speaker["nameColor"]}
```
and use `speaker_view` in the returned dict instead of the inline conditional currently there.
`variable_lookup_key` is already imported at the top of this file (used elsewhere) — confirm,
don't re-import if present.

- [ ] **Step 4: `preview_service.py` — read the override**

Same shape, in the `DIALOGUE` branch (~line 171-179):
```python
speaker = (
    graph.characters_by_id.get(data.speaker_character_id) if data.speaker_character_id else None
)
speaker_view = None
if speaker:
    name = speaker.name
    override_key = variable_lookup_key("__display_name", data.speaker_character_id)
    override = values.get(override_key)
    if isinstance(override, str) and override:
        name = {"ru": override}
    speaker_view = {"id": str(speaker.id), "name": name, "nameColor": speaker.name_color}
```
`variable_lookup_key` already imported at the top of this file — confirm.

- [ ] **Step 5: Run the tests, then the full suite**

```bash
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest tests/test_display_name_override.py -v
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest
ruff check app seed.py tests && ruff format app seed.py tests
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/services/play_service.py apps/api/app/services/preview_service.py apps/api/tests/test_display_name_override.py
git commit -m "feat(api): reading engine honors a __display_name override for the speaker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 4: Screen position — protagonist left, others right, narrator centered

**Files:**
- Modify: `apps/mobile/app/read/[slotId].tsx` (`DialogueBox`, its styles, and the component
  that renders it)
- Modify: `apps/admin/components/PreviewPlayer.tsx` (`DialogueBox`, its styles)

**Interfaces:**
- Consumes: `view.speaker` (has `id`) and `view.staged` (`StagedCharacterView[]`, each with
  `characterId`/`position`) — both already present in `PlayView`/`PreviewStepOut` on both
  apps, no backend change. `apps/mobile`'s `PlayView`/`StagedCharacterView` types live in
  `apps/mobile/lib/types.ts`; `apps/admin`'s equivalents in `apps/admin/lib/types.ts`.
- Produces: the dialogue box itself (not just the character sprite) renders left-anchored,
  right-anchored, or centered, based on the CURRENT speaker's own `staged` entry — with NO
  new wire data. Both apps implement the identical rule; keep the two implementations
  side-by-side comparable (same variable names/logic shape) since a future refactor may want
  to share it, even though this plan does not create a shared package for it (YAGNI - it's two
  short, independent React/React Native components today).

- [ ] **Step 1: Read both current implementations before changing anything**

`apps/mobile/app/read/[slotId].tsx`'s `DialogueBox` and its caller, and
`apps/admin/components/PreviewPlayer.tsx`'s `DialogueBox` and its caller — both currently
render the box in a fixed bottom-center/bottom-full-width position regardless of speaker.
Confirm this by reading the full file in each app (not just the `DialogueBox` function) so the
surrounding layout (where the staged sprites render relative to the box) is understood before
changing it.

- [ ] **Step 2: Add the position-resolution helper (same shape in both apps)**

In each file, add a small helper next to `DialogueBox`:
```ts
function resolveBoxPosition(
  speaker: { id: string } | null,
  staged: { characterId: string; position: "left" | "center" | "right" }[],
): "left" | "center" | "right" {
  if (!speaker) return "center"; // narrator
  const own = staged.find((s) => s.characterId === speaker.id);
  return own?.position ?? "right"; // speaking but not staged - default to "right" (see spec:
  // the quick-add toolbar in Task 8 always stages the speaker, so this default is a rare
  // defensive fallback, not the common path)
}
```
(Adjust field names to match each app's actual `speaker`/`staged` type shape exactly - they
may differ slightly between `apps/mobile/lib/types.ts` and `apps/admin/lib/types.ts`; read both
before writing this, don't assume identical field names.)

- [ ] **Step 3: Apply the position to the dialogue box's layout**

`apps/mobile`: give `styles.dialogueBox` three variants (`dialogueBoxLeft`/`dialogueBoxCenter`/
`dialogueBoxRight` or an inline computed style) — narrower width anchored to one side for
left/right, full-width for center, matching the general shape already established by
`StagedSprite`'s own `spriteLeft`/`spriteCenter`/`spriteRight` styles a few lines above in the
same file (reuse that file's existing spacing/width conventions, don't invent new ones).
Narrator (`center`) keeps no name plate, exactly as today (`view.speaker ? <Text>...` already
guards this - do not change that condition).

`apps/admin`'s `PreviewPlayer.tsx`: same treatment, matching that file's existing Tailwind
class conventions (e.g. `absolute inset-x-0 bottom-0` today - add `left-0 right-auto` /
`right-0 left-auto` /full-width variants keyed off `resolveBoxPosition`).

- [ ] **Step 4: Verify**

```bash
pnpm --filter @arcana/mobile typecheck && pnpm --filter @arcana/mobile lint
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check: in `apps/admin`, open the demo story's chapter preview (`mask-and-word`'s chapter
one, already seeded) - its existing dialogue nodes have Данте/Лия as speakers with no
`is_protagonist` set yet (Task 1 just shipped the column, defaulting `False` for everyone), so
today's live check is: every speaker's box renders in whatever `staged[].position` their nodes
already carry (check via the "Список" view what that is - likely "center", since no story used
this before), and confirm the box faithfully matches that value, not that it's necessarily
"right" yet (that needs Task 8's defaults). Once Task 8 ships, redo this check with the
Одри/Давид example from the spec.

Run `Skill critique` then `Skill polish` on the changed preview screen in `apps/admin` (mobile
change: apply the same review by inspecting the rendered layout via `orca` on web, since a
full native critique pass isn't practical here - note this in the report).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/read/[slotId].tsx apps/admin/components/PreviewPlayer.tsx
git commit -m "feat(mobile): dialogue box follows the speaker's own staged position

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 5: Character card — identity fields + protagonist toggle

**Files:**
- Modify: `apps/admin/app/(app)/stories/[id]/page.tsx` (`CharactersSection`)
- Modify: `apps/admin/lib/types.ts` (`CharacterOut`)

**Interfaces:**
- Consumes: Task 1's `POST /admin/characters` (`firstName`/`lastName`) and
  `PATCH /admin/characters/{id}` (`isProtagonist`, plus the existing `name`/`sprites` fields).
- Produces: the existing per-character block (name + `WardrobeMatrix`, already rendered inline
  under each character on the story page - this plan does NOT move it to a separate route,
  keeping "редактируется в одном месте" true with the smallest change) gains: first/last name
  fields, a display-name field (defaults to `name.ru`, this task only adds the field - the
  rename-over-time mechanism is Task 10), and an "is_protagonist" radio-like checkbox.

- [ ] **Step 1: Add `firstName`/`lastName`/`isProtagonist` to `CharacterOut`**

`apps/admin/lib/types.ts`:
```ts
export type CharacterOut = {
  id: string;
  storyId: string;
  name: LocalizedText;
  firstName: string | null;
  lastName: string | null;
  isProtagonist: boolean;
  nameColor: string;
  sprites: Record<string, string>;
};
```

- [ ] **Step 2: Extend the character creation form**

In `CharactersSection`'s create form (currently just "Имя"), add "Фамилия (необязательно)" as
a second text input, submitted as `firstName`/`lastName` alongside the existing `name: {ru:
nameRu}` — clarify in a short label/hint that "Имя" here is what's shown to players by default
(the existing `name` field), while "Фамилия" is admin-only (matches the spec's framing:
`name` stays the default display name, `first_name`/`last_name` are purely for the admin's own
reference — do not wire firstName/lastName into what's shown to players anywhere).

- [ ] **Step 3: Add the protagonist toggle to each existing character block**

Next to each character's name heading (where `WardrobeMatrix` already renders), add a checkbox
"Главная героиня" bound to `character.isProtagonist`, calling
`PATCH /admin/characters/{id}` with `{isProtagonist: true}` on check (the backend already
clears any other protagonist in the same story - Task 1). Show a one-line hint under it:
"Не больше одной на историю — включение здесь снимет её у другого персонажа." Reflect the
current protagonist visually (e.g. a small badge/highlight on that character's block) so it's
obvious which one is currently marked, without needing to open anything.

- [ ] **Step 4: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`: create two characters, mark one protagonist, confirm the other's
checkbox visually un-checks after a reload (`load()` refetch). Run `Skill critique` +
`Skill polish`, apply, record findings.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/\(app\)/stories/\[id\]/page.tsx apps/admin/lib/types.ts
git commit -m "feat(admin): character first/last name and single-protagonist toggle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 6: Outfit pricing + stat effects in the wardrobe UI

**Files:**
- Modify: `apps/admin/components/WardrobeMatrix.tsx` (`onAddOutfit`, outfit column header)
- Modify: `apps/admin/lib/types.ts` (add `OutfitOut`)

**Interfaces:**
- Consumes: Task 2's `GET/POST/PATCH/DELETE /admin/characters/{id}/outfits`.
- Produces: each outfit column in the wardrobe grid gets a small "цена/статы" edit affordance
  (e.g. a tiny "✎" next to the column header opening an inline price+stat-effects form) backed
  by the new `Outfit` row for that `(character, key)` pair. The sprite grid itself (rows =
  expressions, columns = outfits, per-cell upload) is unchanged — this task only adds
  price/stat metadata alongside the already-existing outfit *column* concept.

- [ ] **Step 1: Add `OutfitOut` to `apps/admin/lib/types.ts`**

```ts
export type OutfitOut = {
  id: string;
  characterId: string;
  key: string;
  label: LocalizedText;
  priceHard: number;
  statEffects: { variableKey: string; characterId: string | null; op: string; value: number | boolean | string }[];
};
```

- [ ] **Step 2: Load and create outfits alongside the wardrobe grid**

`WardrobeMatrix` currently derives its outfit *columns* purely from `Character.sprites` key
prefixes (`deriveAxes`). Add a `GET /admin/characters/{character.id}/outfits` fetch alongside
the existing sprite-derived columns; when `onAddOutfit` creates a new outfit column today (it
already POSTs to `/admin/variables` for the "outfit" variable definition - untouched), also
`POST /admin/characters/{character.id}/outfits` with `{key: name, label: {ru: name}}` (price 0,
no stat effects by default - editable via Step 3) so every outfit column has a matching
`Outfit` row from the moment it's created. Keep the two POSTs sequential in `onAddOutfit`,
guarding against a duplicate the same way `hasOutfitVariable`/`locallyCreatedOutfitVariable`
already guards the variable-definition POST (mirror that pattern for "has this outfit row
already been created").

- [ ] **Step 3: Inline price/stat-effects editor per outfit column**

Under each outfit column header (skip the "Без наряда" column - it's not a real
purchasable/selectable outfit, it's the sprite fallback), a small "✎ Цена и бонусы" toggle
opens: a "Название для игрока" text field (`label.ru`, defaults to the outfit key), a "Цена в
кристаллах" number input (0 = «Бесплатно»), and the existing `EffectRowsEditor` component
(`apps/admin/components/EffectRowsEditor.tsx`, already used by choice options and effect
nodes - reuse it verbatim, don't build a new rows editor) bound to `statEffects`. Saves via
`PATCH /admin/outfits/{id}`.

- [ ] **Step 4: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`: add an outfit "dress", set price 150 + a `charm +5` stat effect, reload,
confirm it persisted. Run `Skill critique` + `Skill polish`, apply, record.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/WardrobeMatrix.tsx apps/admin/lib/types.ts
git commit -m "feat(admin): outfit price + stat effects in the wardrobe grid

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 7: Dialogue node form — background, staged characters, expression, position

**Files:**
- Modify: `apps/admin/components/NodeEditorPanel.tsx` (`DialogueForm`)

**Interfaces:**
- Consumes: `apps/admin/components/ImageUpload.tsx` (reuse verbatim for the background
  picker), the existing `POST /admin/uploads` flow. Backend `DialogueNodeData` already accepts
  `backgroundImageUrl`/`staged` (confirmed in Global Constraints) - **no backend change in
  this task.**
- Produces: `DialogueForm` saves `backgroundImageUrl: string | null` and
  `staged: {characterId, sprite, position}[]` alongside its existing fields. This is the
  **manual** editing surface Task 8's quick-add toolbar will pre-fill defaults into - build
  this task so it works standing alone (open any existing Диалог node, the new fields appear
  and save correctly) before Task 8 wires automatic defaults on top of it.

- [ ] **Step 1: Add the background field**

In `DialogueForm`, add an `ImageUpload` (reuse the component, label "Фон (необязательно —
наследуется от предыдущей реплики)") bound to `data.backgroundImageUrl`. `null`/unset means
"don't change the inherited background" - do not default it to any value, and make sure saving
with no background picked sends `backgroundImageUrl: null` explicitly only if the author
clears a previously-set one (not simply omitting the field - check how `SceneNodeUpdateInput`'s
"omitted = don't touch" rule from its own docstring applies here: since the whole `data` object
is re-sent on every save in this form already, `backgroundImageUrl: null` in the saved object
IS how "no background here" is expressed - there's no partial-field omission within `data`,
only at the `SceneNodeUpdateInput` level. Confirm this against `EffectForm`'s existing full-object save pattern before writing).

- [ ] **Step 2: Add the "кто на экране" (staged) editor**

A small repeatable list (similar shape to `EffectRowsEditor`'s rows, but simpler — no separate
component needed, inline `useState<StagedRow[]>` is fine given this form has no other
dependents): each row = a character select (from the chapter's `characters` prop already
passed into `NodeEditorPanel`), an expression select (populated from that specific character's
`sprites` keys - reuse the pose-deriving logic from `WardrobeMatrix`'s `deriveAxes`, or a
simpler inline version scoped to just poses since outfit isn't chosen here), and a position
select (слева/по центру/справа). "+ Добавить" appends a row; each row has "Удалить".

- [ ] **Step 3: Default the staged list to the speaker when one is picked**

When `speakerCharacterId` changes (in this form) and the staged list is still empty, add one
row for that speaker automatically (expression: first available for that character, position:
`"center"` — Task 8's quick-buttons will override this default to left/right based on
`is_protagonist` when creating nodes via the toolbar; this manual form's own default stays
simple/center since it has no "who is this action for" context the toolbar has). Do not
auto-add on every speaker change if the author already customized the staged list - only seed
it once when both are empty, to avoid clobbering manual edits.

- [ ] **Step 4: Save**

Extend the existing `onSave({...node.data, speakerCharacterId, text, isThought, nextNodeId})`
call to include `backgroundImageUrl` and `staged: rows.map(...)`.

- [ ] **Step 5: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`: open an existing Диалог node in the seeded demo story, set a background
and a staged character+expression+position, save, reopen, confirm it round-trips; check via
"Превью" (Task 4's position rendering) that this now visibly moves the box. Run
`Skill critique` + `Skill polish`, apply, record.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/components/NodeEditorPanel.tsx
git commit -m "feat(admin): background and staged-character fields on the Dialogue node form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 8: Sticky quick-add toolbar — one-click chained dialogue

**Files:**
- Modify: `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx`
- Create: `apps/admin/components/QuickAddToolbar.tsx`

**Interfaces:**
- Consumes: `characters` (already loaded on this page), Task 5's `isProtagonist` field, the
  existing `POST /admin/scene-nodes` (create) and `PATCH /admin/scene-nodes/{id}` (to set the
  *previous* last node's `nextNodeId` once the new one exists - or set it as part of a single
  create call if the API allows specifying `nextNodeId` on the newly-created node instead and
  chaining the OTHER direction; check `DialogueNodeCreate`'s exact shape - `next_node_id` lives
  on the **new** node's own `data`, not on the previous one, so "auto-chain" here actually
  means: after creating the new node, `PATCH` the *previous* last node's `data.nextNodeId` to
  point at it. Confirm this against `DialogueNodeData`'s fields before implementing - do not
  assume the wrong direction.).
- Produces: `QuickAddToolbar` component, rendered `sticky top-0` (or the app shell's existing
  sticky-header offset - check `apps/admin/app/(app)/layout.tsx`'s nav `sticky top-0 z-10` and
  stack this toolbar directly under it with its own `sticky` + a `top` offset equal to the
  nav's height, so both stay visible while scrolling) above the existing node list/graph
  toggle. One button per character (label = `character.name.ru`) + "Рассказчик" + "+ Новый
  персонаж". Clicking a character/Рассказчик button:
  1. Determines the current last node in the visible order (`nodes.slice().sort((a,b) =>
     a.order - b.order)`, last element) - if none exists yet, this is the chapter's first node.
  2. `POST /admin/scene-nodes` a new `DIALOGUE` node: `speakerCharacterId` = clicked character
     (or `null` for Рассказчик), `order` = `nodes.length`, `staged` = `[]` for Рассказчик, or
     one row for the clicked character (`sprite`: first available expression or `"neutral"`,
     `position`: `"left"` if `character.isProtagonist` else `"right"`).
  3. If there was a previous last node, `PATCH` it to set its `data.nextNodeId` to the new
     node's id (re-send its full existing `data` object with only `nextNodeId` changed -
     matches every other save-path's full-object convention in this codebase).
  4. Refetch (`load()`) and auto-select/open the new node so its text field is immediately
     focused for typing (reuse the existing `selectedNodeId` state already on this page).

- [ ] **Step 1: Build `QuickAddToolbar`**

New component, props: `characters: CharacterOut[]`, `onAddDialogue: (characterId: string | null) => void`,
`onNewCharacter: () => void`. Renders the sticky button row described above. Keep it a pure
presentational component - the chaining/creation logic (Steps 2-3) lives in the page, passed
down as `onAddDialogue`.

- [ ] **Step 2: Wire auto-chained creation into the chapter editor page**

Add the `onAddDialogue`/`onNewCharacter` handlers described in Interfaces above to
`SceneEditorPage`. Reuse the page's existing `load()`/`nodes`/`setSelectedNodeId`.

- [ ] **Step 3: "+ Новый персонаж" inline creation**

Clicking it opens a compact version of Task 5's character creation form (just "Имя" required,
"Фамилия" optional) in a small popover/inline panel anchored to the toolbar, without
navigating away from the chapter editor. On save, refetch `characters` (this page already
fetches them in `load()` - extend it if `onNewCharacter`'s save doesn't already trigger the
same `load()`) so the new character's button appears in the toolbar immediately.

- [ ] **Step 4: Make the toolbar actually sticky through a long chapter**

Verify by creating (via the toolbar) at least 15 dialogue nodes in a test chapter and
confirming the toolbar stays pinned at the top while scrolling through the list below it -
this is the whole point of the feature ("не пришлось листать миллион лет вверх").

- [ ] **Step 5: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`: reproduce the spec's worked example end-to-end using ONLY the toolbar
(no manual "next node" selection) - Рассказчик → Маша ("а ты меня любишь?") → Иваша ("нет") →
(leave the "Выбор" step for Task 9) → Рассказчик disclaimer - confirm every node auto-chains
correctly in "Список" view, and that Маша/Иваша (whichever is marked protagonist, or neither)
render on the expected side once viewed through Task 4's position rendering. Run
`Skill critique` + `Skill polish`, apply, record.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/\(app\)/stories/\[id\]/chapters/\[chapterId\]/page.tsx apps/admin/components/QuickAddToolbar.tsx
git commit -m "feat(admin): sticky quick-add toolbar with auto-chained dialogue creation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 9: Mini «Выбор» builder — compact stat/price rows

**Files:**
- Modify: `apps/admin/components/NodeEditorPanel.tsx` (`ChoiceForm`, `ChoiceOptionForm`)

**Interfaces:**
- Consumes: existing `POST/PATCH/DELETE /admin/choice-options` (unchanged shape).
- Produces: `ChoiceForm` renders all of a CHOICE node's options as compact single-row entries
  (text input + stat key + stat amount + price radio/amount) instead of each option being its
  own expandable nested card as today. Saves the exact same `ChoiceOptionCreateInput`/
  `ChoiceOptionUpdateInput` shape - this is a presentation change to `ChoiceOptionForm`'s
  layout, not a new endpoint or data shape.

- [ ] **Step 1: Redesign `ChoiceOptionForm`'s layout to a single row**

Keep all the existing state/fields (`textRu`, `costCurrency`, `costAmount`, `nextNodeId`,
`rows` via `EffectRowsEditor`) and the existing save/remove logic entirely as-is - only change
the JSX layout from a multi-line card to a single flex row: text input (flex-1) · one stat-key
input + one amount input (covers the common single-stat-effect case from the spec's example -
"я расстроена → drama +1"; if `rows.length > 1` already, show the full `EffectRowsEditor`
instead of the simplified single pair, so multi-effect options still work, just without the
inline shortcut) · a price toggle (Бесплатно / Кристаллы + amount) · remove button. Collapse
`nextNodeId`'s `NextNodeSelect` into a smaller inline control at the row's end, or an
"advanced" disclosure if it doesn't fit visually - do not remove it, every option still needs
somewhere to go.

- [ ] **Step 2: Verify the simplified single-stat path still writes a correct `effects` array**

Confirm the single stat-key+amount inputs (when used instead of the full `EffectRowsEditor`)
still produce exactly one entry in the saved `effects: [{variableKey, characterId: null, op:
"INCREMENT", value}]` - matching what `EffectRowsEditor`'s own row would have produced for the
same input, so there's no behavioral difference between the shortcut and the full editor for
the single-effect case.

- [ ] **Step 3: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`: reproduce the spec's four-option stat choice ("я расстроена" +1 drama,
"я разочарована" +2 drama, "я зла" +1 evil, "я негативно отношусь..." +2 evil, all free) in
one screen without opening/closing four separate nested cards. Run `Skill critique` +
`Skill polish`, apply, record.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/NodeEditorPanel.tsx
git commit -m "feat(admin): compact single-row choice-option builder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 10: «Переименовать» и «Смена наряда» quick actions

**Files:**
- Modify: `apps/admin/components/QuickAddToolbar.tsx` (two new buttons)
- Modify: `apps/admin/app/(app)/stories/[id]/chapters/[chapterId]/page.tsx` (handlers)

**Interfaces:**
- Consumes: `POST /admin/variables` (existing, for the one-time `__display_name` definition -
  same call shape `WardrobeMatrix.onAddOutfit` already makes for `"outfit"`), Task 2's
  `GET /admin/characters/{id}/outfits`, `POST /admin/scene-nodes` (EFFECT / CHOICE),
  `POST /admin/choice-options`.
- Produces: "Переименовать" button → picks a character + new name → auto-chains (same
  mechanism as Task 8) an EFFECT node with one effect
  `{variableKey: "__display_name", characterId: <char>, op: "SET", value: <new name>}`.
  "Смена наряда" button → picks a character (must already have at least one `Outfit`) →
  auto-chains a CHOICE node whose options are built one-per-outfit from that character's
  catalog (`text: outfit.label.ru`, `costCurrency: outfit.priceHard > 0 ? "HARD" : null`,
  `costAmount: outfit.priceHard`, `effects: [{variableKey: "outfit", characterId: <char>,
  op: "SET", value: outfit.key}, ...outfit.statEffects]`).

- [ ] **Step 1: Confirm `__display_name` is accepted by `POST /admin/variables`'s key validation**

Read `VARIABLE_KEY_RE` (`apps/api/app/schemas/content.py`, `^[a-z][a-z0-9_]*$`) again and
confirm `__display_name` does NOT match it (leading underscores). Before writing any admin
code for this step, pick ONE of:
  (a) change the key this feature uses to something that matches the existing regex - e.g.
      `display_name` (no leading underscore) - and rely on the admin UI simply never listing
      it as a pickable "stat" (client-side filtering, e.g. hide any variable definition whose
      key is exactly `display_name` from anywhere a scenarist picks a stat by hand), or
  (b) special-case `POST /admin/variables` server-side to also accept keys matching
      `^__[a-z][a-z0-9_]*$` for this one reserved family.
  (a) is simpler and touches no backend validation code — **prefer (a) unless it proves
  awkward once you're implementing the filtering**, and record which you picked and why in
  this task's report. Whichever key you land on, use it consistently everywhere this plan
  otherwise says `__display_name` (this step may require re-reading Task 3's code and
  adjusting its literal string if you pick a different final key - reconcile before proceeding).

- [ ] **Step 2: "Переименовать" button + handler**

Add to `QuickAddToolbar`: a "Переименовать" button opening a small inline form (character
select, defaulting to the current chapter's most-recently-used speaker if easily available;
text input for the new name). On submit, in the page's handler:
1. Check whether a `VariableDefinition` for (the key chosen in Step 1) + this character
   already exists - `GET /admin/variables?storyId=...` (existing endpoint) and filter
   client-side, mirroring `WardrobeMatrix`'s `hasOutfitVariable` check.
2. If not, `POST /admin/variables` `{storyId, key: <chosen key>, label: {ru: "Отображаемое имя"},
   type: "STRING", defaultValue: <character's current name.ru>, characterId: <char>}` - guard
   against a double-POST race the same way `WardrobeMatrix.onAddOutfit` does
   (`addingOutfit`/`locallyCreatedOutfitVariable`-equivalent local state).
3. Auto-chain (Task 8's same last-node-lookup + `PATCH` mechanism) an EFFECT node:
   `data: {effects: [{variableKey: <chosen key>, characterId: <char>, op: "SET", value: newName}],
   nextNodeId: null}` (its own `nextNodeId` gets filled in by the *next* quick-add click,
   exactly like a dialogue node does today).

- [ ] **Step 3: "Смена наряда" button + handler**

Add a "Смена наряда" button: character select (only characters with ≥1 outfit - fetch via
Task 2's list endpoint, disable/hide characters with none, with a hint "у этого персонажа пока
нет нарядов — добавьте в «Гардеробе»"). On submit:
1. Auto-chain a CHOICE node (empty `prompt`).
2. For each of that character's outfits, `POST /admin/choice-options` with the shape from
   Interfaces above, `order` = index, `nextNodeId: null` (author fills this in via the normal
   node editor afterward, or via another quick-add click on the CHOICE node's own next step -
   same as any other CHOICE node built manually today).

- [ ] **Step 4: Verify + critique + polish**

```bash
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
```
Live check via `orca`, both flows end-to-end:
- Переименовать: rename a character mid-chapter, then open "Превью" and confirm the character's
  displayed name changes from that point on, matching the spec's «Негодяй» → «Виктор» example.
- Смена наряда: give a character two outfits (one free, one priced+stat-bonus) via Task 6,
  build a "Смена наряда" node, open "Превью", confirm both options appear with the right
  price/labels and that choosing one is a normal CHOICE interaction.

Run `Skill critique` + `Skill polish` on both new toolbar flows, apply, record.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/QuickAddToolbar.tsx apps/admin/app/\(app\)/stories/\[id\]/chapters/\[chapterId\]/page.tsx
git commit -m "feat(admin): Переименовать and Смена наряда quick actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FDwhSQoxG53oAxvDmsNmYV"
```

---

### Task 11: Integration pass — full worked example + docs

**Files:**
- Verify only: everything above.
- Modify (if anything is stale): `apps/admin/README.md` if one exists with a features list;
  no other doc changes anticipated.

**Interfaces:**
- Consumes: every task above.
- Produces: a fully green repo and a recorded, real run of both worked examples from the spec.

- [ ] **Step 1: Full workspace verification**

```bash
cd /Users/pavelgolubinec/Desktop/MyProjects/Startaps/Arcana-
pnpm install
pnpm --filter @arcana/shared build
pnpm --filter @arcana/admin typecheck && pnpm --filter @arcana/admin lint && pnpm --filter @arcana/admin build
pnpm --filter @arcana/mobile typecheck && pnpm --filter @arcana/mobile lint
cd apps/api && source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://localhost/arcana_test" pytest
ruff check app seed.py tests
```

- [ ] **Step 2: End-to-end walkthrough of the spec's worked example, via `orca`**

Using only the quick-add toolbar (Tasks 8-10), on a fresh test story:
1. Create characters Маша, Иваша, mark neither/one as protagonist (per the spec, the example
   didn't specify - use this run to also verify the Одри/Давид left/right rule: mark one
   protagonist, confirm it visually renders left, the other right, in "Превью").
2. Рассказчик → «тратата трутуту».
3. Маша → «а ты меня любишь?».
4. Иваша → «нет».
5. Выбор (Task 9's compact builder) with the four options exactly as in the spec.
6. Рассказчик → the disclaimer line.
7. Set the chapter's entry node, open "Превью" top to bottom, confirm every line, position,
   and the choice's four options with their stat effects all appear correctly.
8. Separately: rename a character mid-chapter and confirm the name change shows in preview
   from that point forward (Task 10); build one "Смена наряда" node and confirm both a free
   and a priced+stat-bonus outfit option render correctly.

- [ ] **Step 3: Report follow-ups**

Note any deferred rough edges found during the walkthrough (e.g. UI polish items surfaced by
`critique`/`polish` in individual tasks that were parked as minor) in the final report so they
reach the user - do not silently drop them.

- [ ] **Step 4: Commit**

Only if Step 1 or 2 surfaced a fix - commit it with a description of what broke and why.
If everything was already green, this task produces no commit; say so plainly in the report
rather than inventing a change to commit.

---

## Self-Review

**Spec coverage:**
- Карточка персонажа (имя/фамилия/отображаемое имя/эмоции/протагонист) → Tasks 1, 5. ✓
- Положение на экране (протагонист слева/остальные справа/рассказчик по центру, затрагивает
  и рамку, и спрайт) → Tasks 1 (данные), 4 (рендер в обеих читалках), 8 (авто-подстановка при
  быстром добавлении). ✓
- Фон с наследованием, кто на экране/выражение/позиция в форме узла → Task 7 (backend уже
  готов, подтверждено чтением `DialogueNodeData`). ✓
- Липкая панель быстрых кнопок, автосцепление реплик, создание персонажа не выходя из
  конструктора → Task 8. ✓
- Мини-конструктор «Выбор» → Task 9. ✓
- «Переименовать» (наследование вперёд, скрытая переменная, авто-создание определения) →
  Tasks 3 (чтение), 10 (запись + авто-создание). ✓
- Наряды с ценой/статами, «Смена наряда» собирает CHOICE автоматически → Tasks 2, 6, 10. ✓
- Явно не входит (движок условий не меняется, «Список»/«Граф» остаются) → соблюдено во всех
  задачах, ни одна не трогает `condition_engine.py` или `SceneNodeType`. ✓

**Placeholder scan:** No "TBD"/"handle appropriately" left. The one open decision explicitly
deferred to implementation time (Task 10 Step 1's `__display_name` vs `display_name` key
choice) is deferred with a concrete default recommendation and an explicit instruction to
record which was chosen and reconcile Task 3 — not a placeholder, a scoped decision with a
fallback.

**Type consistency:** `CharacterOut`/`OutfitOut` (backend Task 1/2, frontend Task 5/6) share
field names throughout (`firstName`, `lastName`, `isProtagonist`, `priceHard`, `statEffects`).
`variable_lookup_key`/`EffectList`/`Effect` reused verbatim from `condition_engine.py`/
`schemas/common.py` everywhere a new effect-shaped value is produced (Outfit.stat_effects,
the rename EFFECT, the Смена-наряда CHOICE options) rather than redefined. `QuickAddToolbar`'s
props (Task 8) are extended, not replaced, by Task 10's two new buttons.
