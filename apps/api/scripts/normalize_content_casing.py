"""One-time normalization for the by_alias fix (see final-review-fix-report.md, Finding 1):
re-validates every SceneNode.data and ChoiceOption.effects/visible_when already stored in the
database and re-dumps them by_alias=True so their keys are camelCase, matching what the admin
frontend reads. Safe to delete once no dev database still holds pre-fix snake_case rows.

Run with: python scripts/normalize_content_casing.py
"""

import asyncio

from sqlalchemy import select

from app.database import SessionLocal
from app.models.content import ChoiceOption, SceneNode
from app.schemas.common import Condition, Effect
from app.schemas.content import SCENE_NODE_DATA_SCHEMA_BY_TYPE


async def normalize_nodes(db) -> int:
    nodes = list(await db.scalars(select(SceneNode)))
    touched = 0
    for node in nodes:
        schema = SCENE_NODE_DATA_SCHEMA_BY_TYPE[node.type.value]
        validated = schema.model_validate(node.data)
        new_data = validated.model_dump(by_alias=True)
        if new_data != node.data:
            node.data = new_data
            touched += 1
    return touched


async def normalize_choice_options(db) -> int:
    options = list(await db.scalars(select(ChoiceOption)))
    touched = 0
    for option in options:
        new_effects = [Effect.model_validate(e).model_dump(by_alias=True) for e in option.effects]
        new_visible_when = [
            Condition.model_validate(c).model_dump(by_alias=True) for c in option.visible_when
        ]
        changed = new_effects != option.effects or new_visible_when != option.visible_when
        if changed:
            option.effects = new_effects
            option.visible_when = new_visible_when
            touched += 1
    return touched


async def main() -> None:
    async with SessionLocal() as db:
        nodes_touched = await normalize_nodes(db)
        options_touched = await normalize_choice_options(db)
        await db.commit()
    print(f"Normalized casing: {nodes_touched} scene node(s), {options_touched} choice option(s) updated.")


if __name__ == "__main__":
    asyncio.run(main())
