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
                graph.characters_by_id.get(data.speaker_character_id) if data.speaker_character_id else None
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


async def resolve(db: AsyncSession, chapter_id: str, node_id: str | None, values: dict) -> tuple[dict, dict]:
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
