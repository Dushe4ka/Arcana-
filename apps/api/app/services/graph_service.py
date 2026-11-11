"""The story graph for the admin panel: every node of every chapter, how they connect, and
which decisions influence which later events.

Two kinds of links, deliberately kept apart:

* `flow` - a direct transition: this beat is followed by that one (next / option / then / else);
* `influences` - a deferred consequence: a decision changes a variable (a characteristic, a
  relationship, a flag) that a later event checks. No line of the script jumps from one to the
  other, yet the first decides whether the second happens.

Options are returned as nodes of their own, so each choice visibly fans out. Built from the
editable draft, i.e. exactly what the author is working on."""

from collections import deque

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine.condition_engine import variable_lookup_key
from app.models.content import Chapter, SceneNode, Season, Story

MAX_INFLUENCES = 6000
_OPERATORS = {"EQ": "=", "NEQ": "≠", "GT": ">", "GTE": "≥", "LT": "<", "LTE": "≤"}
_EFFECT_OPS = {"SET": "=", "INCREMENT": "+", "DECREMENT": "−"}


def _get(data: dict, camel: str, snake: str):
    return data.get(camel) if data.get(camel) is not None else data.get(snake)


def _short(text: str | None, limit: int = 64) -> str:
    text = (text or "").strip().replace("\n", " ")
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _value(value) -> str:
    if value is True:
        return "да"
    if value is False:
        return "нет"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return f"«{value}»" if isinstance(value, str) else str(value)


class _Names:
    def __init__(self, story: Story):
        self.characters = {str(c.id): (c.name or {}).get("ru", "?") for c in story.characters}
        self.labels = {
            variable_lookup_key(d.key, str(d.character_id) if d.character_id else None): (d.label or {}).get(
                "ru", d.key
            )
            for d in story.variable_definitions
        }

    def variable(self, key: str, character_id: str | None) -> str:
        label = self.labels.get(variable_lookup_key(key, character_id), key)
        who = self.characters.get(character_id or "")
        return f"{label} ({who})" if who else label

    def condition(self, c: dict) -> str:
        key, who = _get(c, "variableKey", "variable_key"), _get(c, "characterId", "character_id")
        return f"{self.variable(key, who)} {_OPERATORS.get(c.get('operator'), '?')} {_value(c.get('value'))}"

    def effect(self, e: dict) -> str:
        key, who = _get(e, "variableKey", "variable_key"), _get(e, "characterId", "character_id")
        return f"{self.variable(key, who)} {_EFFECT_OPS.get(e.get('op'), '?')} {_value(e.get('value'))}"


def _keys(items: list[dict]) -> list[tuple[str, str]]:
    result = []
    for item in items or []:
        key, who = _get(item, "variableKey", "variable_key"), _get(item, "characterId", "character_id")
        if key:
            result.append((variable_lookup_key(key, who), key))
    return result


async def story_graph(db: AsyncSession, story_id: str) -> dict:
    story = await db.scalar(
        select(Story)
        .where(Story.id == story_id)
        .options(
            selectinload(Story.characters),
            selectinload(Story.variable_definitions),
            selectinload(Story.seasons)
            .selectinload(Season.chapters)
            .selectinload(Chapter.nodes)
            .selectinload(SceneNode.choice_options),
        )
    )
    if not story:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "История не найдена")
    names = _Names(story)

    seasons, chapters, nodes, flow = [], [], [], []
    setters: list[tuple[str, str, int, str]] = []  # (lookup key, source id, chapter order, chapter id)
    readers: list[tuple[str, str, int, str]] = []
    known: set[str] = set()
    order = 0

    for season in story.seasons:
        seasons.append({"id": str(season.id), "index": season.index, "title": season.title})
        for chapter in season.chapters:
            chapter_id = str(chapter.id)
            chapters.append(
                {
                    "id": chapter_id,
                    "seasonId": str(season.id),
                    "seasonIndex": season.index,
                    "index": chapter.index,
                    "order": order,
                    "title": chapter.title,
                    "status": chapter.status.value,
                    "entryNodeId": str(chapter.entry_node_id) if chapter.entry_node_id else None,
                    "nodeCount": len(chapter.nodes),
                }
            )
            for node in sorted(chapter.nodes, key=lambda n: n.order):
                node_id, data, kind = str(node.id), node.data or {}, node.type.value
                known.add(node_id)
                entry = {
                    "id": node_id,
                    "chapterId": chapter_id,
                    "kind": kind,
                    "x": node.canvas_x,
                    "y": node.canvas_y,
                    "conditions": [],
                    "effects": [],
                    "isEntry": chapter.entry_node_id == node.id,
                }
                if kind == "DIALOGUE":
                    speaker = names.characters.get(
                        str(_get(data, "speakerCharacterId", "speaker_character_id") or "")
                    )
                    text = (data.get("text") or {}).get("ru", "")
                    entry["label"] = _short(f"{speaker}: {text}" if speaker else text)
                    entry["speaker"] = speaker
                    nxt = _get(data, "nextNodeId", "next_node_id")
                    if nxt:
                        flow.append({"from": node_id, "to": str(nxt), "kind": "next"})
                elif kind == "CHOICE":
                    entry["label"] = _short((data.get("prompt") or {}).get("ru") or "Выбор")
                elif kind == "CONDITION":
                    when = data.get("when") or []
                    entry["conditions"] = [names.condition(c) for c in when]
                    entry["label"] = _short(" и ".join(entry["conditions"]) or "Условие (пустое)")
                    for lookup, _ in _keys(when):
                        readers.append((lookup, node_id, order, chapter_id))
                    for field, edge_kind, label in (
                        ("thenNodeId", "then", "да"),
                        ("elseNodeId", "else", "нет"),
                    ):
                        target = data.get(field) or data.get(
                            "then_node_id" if edge_kind == "then" else "else_node_id"
                        )
                        if target:
                            flow.append(
                                {"from": node_id, "to": str(target), "kind": edge_kind, "label": label}
                            )
                elif kind == "EFFECT":
                    effects = data.get("effects") or []
                    entry["effects"] = [names.effect(e) for e in effects]
                    entry["label"] = _short(", ".join(entry["effects"]) or "Эффект (пустой)")
                    for lookup, _ in _keys(effects):
                        setters.append((lookup, node_id, order, chapter_id))
                    nxt = _get(data, "nextNodeId", "next_node_id")
                    if nxt:
                        flow.append({"from": node_id, "to": str(nxt), "kind": "next"})
                else:
                    title = _get(data, "endingTitle", "ending_title") or {}
                    entry["label"] = _short(title.get("ru") or "Конец главы")
                nodes.append(entry)

                for option in sorted(node.choice_options, key=lambda o: o.order):
                    option_id = str(option.id)
                    known.add(option_id)
                    paid = bool(option.cost_currency) and (option.cost_amount or 0) > 0
                    nodes.append(
                        {
                            "id": option_id,
                            "chapterId": chapter_id,
                            "kind": "OPTION",
                            "parentId": node_id,
                            "label": _short((option.text or {}).get("ru", "")),
                            "x": option.canvas_x,
                            "y": option.canvas_y,
                            "conditions": [names.condition(c) for c in option.visible_when or []],
                            "effects": [names.effect(e) for e in option.effects or []],
                            "cost": f"{option.cost_amount} {'карт' if option.cost_currency.value == 'HARD' else 'зёрен'}"
                            if paid
                            else None,
                            "isEntry": False,
                        }
                    )
                    flow.append({"from": node_id, "to": option_id, "kind": "option"})
                    if option.next_node_id:
                        flow.append({"from": option_id, "to": str(option.next_node_id), "kind": "next"})
                    for lookup, _ in _keys(option.effects or []):
                        setters.append((lookup, option_id, order, chapter_id))
                    for lookup, _ in _keys(option.visible_when or []):
                        readers.append((lookup, option_id, order, chapter_id))
            order += 1

    chapter_of = {n["id"]: n["chapterId"] for n in nodes}
    for edge in flow:
        edge["broken"] = edge["to"] not in known
        edge["crossChapter"] = not edge["broken"] and chapter_of[edge["from"]] != chapter_of[edge["to"]]

    # Within one chapter a decision influences a check only if the check can still be reached
    # after it; in later chapters it always can.
    adjacency: dict[str, list[str]] = {}
    for edge in flow:
        if not edge["broken"]:
            adjacency.setdefault(edge["from"], []).append(edge["to"])
    reach_cache: dict[str, set[str]] = {}

    def reachable(start: str) -> set[str]:
        if start not in reach_cache:
            seen, queue = {start}, deque([start])
            while queue:
                for target in adjacency.get(queue.popleft(), []):
                    if target not in seen:
                        seen.add(target)
                        queue.append(target)
            reach_cache[start] = seen
        return reach_cache[start]

    readers_by_key: dict[str, list[tuple[str, int, str]]] = {}
    for lookup, target, chapter_order, chapter_id in readers:
        readers_by_key.setdefault(lookup, []).append((target, chapter_order, chapter_id))

    influences, seen_pairs, truncated = [], set(), False
    for lookup, source, source_order, _ in setters:
        key, _, character_id = lookup.partition("::")
        label = names.variable(key, character_id or None)
        for target, target_order, _ in readers_by_key.get(lookup, []):
            if target == source or (source, target, lookup) in seen_pairs:
                continue
            if target_order < source_order or (
                target_order == source_order and target not in reachable(source)
            ):
                continue
            if len(influences) >= MAX_INFLUENCES:
                truncated = True
                break
            seen_pairs.add((source, target, lookup))
            influences.append(
                {
                    "from": source,
                    "to": target,
                    "variable": label,
                    "crossChapter": target_order != source_order,
                }
            )

    return {
        "storyId": str(story.id),
        "title": story.title,
        "seasons": seasons,
        "chapters": chapters,
        "nodes": nodes,
        "flow": flow,
        "influences": influences,
        "truncated": truncated,
    }
