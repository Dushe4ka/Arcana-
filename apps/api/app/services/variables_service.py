import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.condition_engine import (
    VariableBounds,
    apply_effect,
    variable_lookup_key,
)
from app.models.content import VariableDefinition
from app.models.player import PlayerVariableValue
from app.schemas.common import EffectList, VariableScalar

logger = logging.getLogger("arcana.variables")


class VariableContext:
    """Snapshot of a player's characteristics/relationships for one story, ready for
    condition checks."""

    def __init__(
        self,
        defs_by_lookup_key: dict[str, VariableDefinition],
        values_by_def_id: dict[str, VariableScalar],
    ):
        self._defs_by_lookup_key = defs_by_lookup_key
        self._values_by_def_id = values_by_def_id

    def as_value_map(self) -> dict[str, VariableScalar]:
        result: dict[str, VariableScalar] = {}
        for lookup_key, definition in self._defs_by_lookup_key.items():
            result[lookup_key] = self._values_by_def_id.get(
                str(definition.id), definition.default_value
            )
        return result

    def find_def(
        self, variable_key: str, character_id: str | None = None
    ) -> VariableDefinition | None:
        return self._defs_by_lookup_key.get(
            variable_lookup_key(variable_key, character_id)
        )


async def load_context(
    db: AsyncSession, user_id: str, story_id: str
) -> VariableContext:
    defs = list(
        await db.scalars(
            select(VariableDefinition).where(VariableDefinition.story_id == story_id)
        )
    )
    defs_by_lookup_key = {
        variable_lookup_key(d.key, str(d.character_id) if d.character_id else None): d
        for d in defs
    }

    def_ids = [d.id for d in defs]
    values = (
        list(
            await db.scalars(
                select(PlayerVariableValue).where(
                    PlayerVariableValue.user_id == user_id,
                    PlayerVariableValue.variable_definition_id.in_(def_ids),
                )
            )
        )
        if def_ids
        else []
    )
    values_by_def_id = {str(v.variable_definition_id): v.value for v in values}

    return VariableContext(defs_by_lookup_key, values_by_def_id)


async def apply_effects(
    db: AsyncSession, user_id: str, story_id: str, effects: EffectList
) -> None:
    """Applies effects to a player's variables, upserting rows as needed. Unknown keys are
    logged and skipped."""
    if not effects:
        return

    context = await load_context(db, user_id, story_id)

    for effect in effects:
        definition = context.find_def(effect.variable_key, effect.character_id)
        if not definition:
            logger.warning(
                'Effect references unknown variable "%s" (character=%s) in story %s',
                effect.variable_key,
                effect.character_id or "none",
                story_id,
            )
            continue

        current = await db.scalar(
            select(PlayerVariableValue).where(
                PlayerVariableValue.user_id == user_id,
                PlayerVariableValue.variable_definition_id == definition.id,
            )
        )

        next_value = apply_effect(
            effect,
            current.value if current is not None else definition.default_value,
            VariableBounds(definition.min_value, definition.max_value),
        )

        if current is not None:
            current.value = next_value
        else:
            db.add(
                PlayerVariableValue(
                    user_id=user_id,
                    variable_definition_id=definition.id,
                    value=next_value,
                )
            )

    await db.commit()
