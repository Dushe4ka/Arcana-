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
