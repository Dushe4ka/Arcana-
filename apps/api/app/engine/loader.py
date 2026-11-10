"""Builds the in-memory `StoryGraph` the runtime interprets from ORM rows."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine.condition_engine import variable_lookup_key
from app.engine.runtime import NodeSpec, OptionSpec, StoryGraph, VariableSpec, parse_node_data
from app.models.content import Character, ChoiceOption, SceneNode, VariableDefinition
from app.schemas.common import Condition, Effect


def option_spec(option: ChoiceOption) -> OptionSpec:
    return OptionSpec(
        id=str(option.id),
        order=option.order,
        text=option.text,
        cost_currency=getattr(option.cost_currency, "value", option.cost_currency) or None,
        cost_amount=option.cost_amount or 0,
        visible_when=tuple(Condition.model_validate(c) for c in (option.visible_when or [])),
        effects=tuple(Effect.model_validate(e) for e in (option.effects or [])),
        next_node_id=str(option.next_node_id) if option.next_node_id else None,
    )


def add_nodes(graph: StoryGraph, nodes: list[SceneNode]) -> None:
    for node in nodes:
        node_id = str(node.id)
        node_type = getattr(node.type, "value", node.type)
        try:
            data = parse_node_data(node_type, node.data)
            options = tuple(sorted((option_spec(o) for o in node.choice_options), key=lambda o: o.order))
        except Exception as exc:  # noqa: BLE001 - any malformed stored payload is a content error
            graph.broken[node_id] = str(exc)
            continue
        graph.nodes[node_id] = NodeSpec(
            id=node_id, chapter_id=str(node.chapter_id), type=node_type, data=data, options=options
        )


def variable_specs(defs: list[VariableDefinition]) -> dict[str, VariableSpec]:
    specs = {}
    for d in defs:
        character_id = str(d.character_id) if d.character_id else None
        key = variable_lookup_key(d.key, character_id)
        specs[key] = VariableSpec(
            lookup_key=key,
            key=d.key,
            character_id=character_id,
            type=d.type.value if hasattr(d.type, "value") else str(d.type),
            default=d.default_value,
            min_value=d.min_value,
            max_value=d.max_value,
        )
    return specs


async def load_variables(db: AsyncSession, story_id) -> dict[str, VariableSpec]:
    defs = list(await db.scalars(select(VariableDefinition).where(VariableDefinition.story_id == story_id)))
    return variable_specs(defs)


async def load_chapter_nodes(db: AsyncSession, chapter_id) -> list[SceneNode]:
    return list(
        await db.scalars(
            select(SceneNode)
            .where(SceneNode.chapter_id == chapter_id)
            .options(selectinload(SceneNode.choice_options))
        )
    )


async def load_chapter_graph(db: AsyncSession, story_id, chapter_id) -> StoryGraph:
    graph = StoryGraph(nodes={}, variables=await load_variables(db, story_id))
    add_nodes(graph, await load_chapter_nodes(db, chapter_id))
    return graph


async def extend_with_node_chapter(db: AsyncSession, graph: StoryGraph, node_id: str) -> bool:
    """Loads the whole chapter that owns `node_id` into `graph` (author preview jumping
    across chapters). Returns False if that node does not exist at all."""
    try:
        chapter_id = await db.scalar(select(SceneNode.chapter_id).where(SceneNode.id == node_id))
    except Exception:  # noqa: BLE001 - e.g. a malformed uuid stored in node data
        return False
    if chapter_id is None:
        return False
    add_nodes(graph, await load_chapter_nodes(db, chapter_id))
    return True


async def extend_with_nodes(db: AsyncSession, graph: StoryGraph, node_ids: list[str]) -> bool:
    """Loads just the given nodes (with their choice options). The live reader uses this
    instead of loading a whole chapter: one tap touches two or three nodes, and a chapter
    can hold thousands. Returns False if none of them exist."""
    wanted = [n for n in node_ids if n and n not in graph.nodes and n not in graph.broken]
    if not wanted:
        return True
    try:
        nodes = list(
            await db.scalars(
                select(SceneNode)
                .where(SceneNode.id.in_(wanted))
                .options(selectinload(SceneNode.choice_options))
            )
        )
    except Exception:  # noqa: BLE001 - a malformed uuid stored as a jump target
        return False
    add_nodes(graph, nodes)
    return bool(nodes)


def successors(graph: StoryGraph, node_id: str) -> list[str]:
    """Direct jump targets of an already loaded node - what the reader will need next."""
    node = graph.nodes.get(node_id)
    if node is None:
        return []
    data = node.data
    if node.type in ("DIALOGUE", "EFFECT"):
        targets = [data.next_node_id]
    elif node.type == "CONDITION":
        targets = [data.then_node_id, data.else_node_id]
    elif node.type == "CHOICE":
        targets = [o.next_node_id for o in node.options]
    else:
        targets = []
    return [str(t) for t in targets if t]


async def load_characters(db: AsyncSession, story_id) -> dict[str, dict]:
    characters = list(await db.scalars(select(Character).where(Character.story_id == story_id)))
    return {
        str(c.id): {"id": str(c.id), "name": c.name, "nameColor": c.name_color, "sprites": c.sprites or {}}
        for c in characters
    }
