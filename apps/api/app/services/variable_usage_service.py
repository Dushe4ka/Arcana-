"""Read-only: walks a story's existing scene-node data to answer "where is this variable
defined, set, and checked" - across every season/chapter, not just the one currently open in
the admin panel. Does not touch the reading engine; this is authoring-time narration of data
that already drives `condition_engine.py` at play time.

Deliberately walks in Python rather than a JSONB SQL query: `Effect`/`Condition` appear in
different shapes on different node types (EFFECT.effects, CONDITION.when, ChoiceOption.
visible_when/effects) and a single JSONB path query covering all of them would be more fragile
than reading the small number of nodes a typical story has (hundreds, not millions) directly.
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import Chapter, SceneNode, Season, Story


async def list_usages(db: AsyncSession, story_id: str) -> list[dict]:
    story = await db.scalar(
        select(Story)
        .where(Story.id == story_id)
        .options(
            selectinload(Story.variable_definitions),
            selectinload(Story.seasons)
            .selectinload(Season.chapters)
            .selectinload(Chapter.nodes)
            .selectinload(SceneNode.choice_options),
        )
    )
    if not story:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "История не найдена")

    # (variable_key, character_id) -> list of usage dicts, built once by a single pass over
    # every node/option in the story, then grouped per-definition below.
    usages_by_key: dict[tuple[str, str | None], list[dict]] = {}

    def record(
        variable_key: str,
        character_id: str | None,
        role: str,
        chapter: Chapter,
        season: Season,
        node: SceneNode,
    ) -> None:
        key = (variable_key, character_id)
        usages_by_key.setdefault(key, []).append(
            {
                "chapter_id": chapter.id,
                "chapter_title": chapter.title,
                "season_index": season.index,
                "chapter_index": chapter.index,
                "node_id": node.id,
                "node_type": node.type.value,
                "role": role,
            }
        )

    for season in story.seasons:
        for chapter in season.chapters:
            for node in chapter.nodes:
                data = node.data or {}
                if node.type.value == "EFFECT":
                    for effect in data.get("effects", []):
                        record(
                            effect["variableKey"],
                            effect.get("characterId"),
                            "sets",
                            chapter,
                            season,
                            node,
                        )
                elif node.type.value == "CONDITION":
                    for condition in data.get("when", []):
                        record(
                            condition["variableKey"],
                            condition.get("characterId"),
                            "reads",
                            chapter,
                            season,
                            node,
                        )
                elif node.type.value == "CHOICE":
                    for option in node.choice_options:
                        for condition in option.visible_when or []:
                            record(
                                condition["variableKey"],
                                condition.get("characterId"),
                                "reads",
                                chapter,
                                season,
                                node,
                            )
                        for effect in option.effects or []:
                            record(
                                effect["variableKey"],
                                effect.get("characterId"),
                                "sets",
                                chapter,
                                season,
                                node,
                            )

    result = []
    for definition in story.variable_definitions:
        key = (definition.key, str(definition.character_id) if definition.character_id else None)
        result.append({"definition": definition, "usages": usages_by_key.get(key, [])})
    return result
