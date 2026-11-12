"""Turns a runtime `RestPoint` into the JSON view the reader clients render. Pure - the
caller supplies everything that depends on the player (wallet balances, owned options)."""

from app.engine.condition_engine import variable_lookup_key
from app.engine.runtime import EngineState, RestPoint, StoryGraph, effective_values, visible_options


def resolve_staged(characters: dict[str, dict], staged: list, values: dict) -> list[dict]:
    result = []
    for s in staged:
        character = characters.get(s.character_id)
        sprites = character["sprites"] if character else {}
        # Wardrobe: a character-scoped "outfit" variable turns the sprite key into
        # "{outfit}_{expression}", so an earlier wardrobe choice shows up in every later
        # scene without re-picking a sprite per node. Falls back to the plain expression key.
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
                "animation": s.animation,
            }
        )
    return result


def _successors(node) -> list[str]:
    data = node.data
    if node.type == "CHOICE":
        return [o.next_node_id for o in node.options if o.next_node_id]
    if node.type == "CONDITION":
        return [i for i in (data.then_node_id, data.else_node_id) if i]
    return [data.next_node_id] if getattr(data, "next_node_id", None) else []


def upcoming_images(
    graph: StoryGraph, node, characters: dict[str, dict], values: dict, depth: int = 3
) -> list[str]:
    """Pictures of the next few beats that are already in memory (the play loader brings
    in each node's direct continuations): sprites, backgrounds and illustrations. The
    reader downloads them while the current line is being read, so a character does not
    appear late on their line."""
    urls: list[str] = []
    seen_nodes = {node.id}
    frontier = _successors(node)
    for _ in range(depth):
        following: list[str] = []
        for node_id in frontier:
            if node_id in seen_nodes or node_id not in graph.nodes:
                continue
            seen_nodes.add(node_id)
            upcoming = graph.nodes[node_id]
            if upcoming.type == "DIALOGUE":
                data = upcoming.data
                urls += [
                    s["spriteUrl"] for s in resolve_staged(characters, data.staged, values) if s["spriteUrl"]
                ]
                urls += [u for u in (data.background_image_url, data.cg_image_url) if u]
            following += _successors(upcoming)
        frontier = following
    return list(dict.fromkeys(urls))


def _stage_view(state: EngineState, cues: dict) -> dict:
    return {**state.stage, **{k: v for k, v in cues.items()}}


def build_view(
    graph: StoryGraph,
    rest: RestPoint,
    characters: dict[str, dict],
    *,
    balances: dict[str, int] | None = None,
    owned_option_ids: set[str] | None = None,
) -> dict:
    """`balances=None` means "no wallet" (author preview): every option reads as affordable."""
    node, state = rest.node, rest.state
    values = effective_values(graph, state)
    stage = _stage_view(state, rest.cues)

    if node.type == "END":
        return {
            "type": "END",
            "nodeId": node.id,
            "endingKey": node.data.ending_key,
            "endingTitle": node.data.ending_title.model_dump() if node.data.ending_title else None,
            "stage": stage,
        }

    if node.type == "DIALOGUE":
        data = node.data
        speaker = characters.get(data.speaker_character_id) if data.speaker_character_id else None
        speaker_view = None
        if speaker:
            name = speaker["name"]
            override = values.get(variable_lookup_key("display_name_override", data.speaker_character_id))
            if isinstance(override, str) and override:
                name = {"ru": override}
            speaker_view = {"id": speaker["id"], "name": name, "nameColor": speaker["nameColor"]}
        return {
            "type": "DIALOGUE",
            "nodeId": node.id,
            "speaker": speaker_view,
            "text": data.text.model_dump(),
            "isThought": data.is_thought,
            "backgroundImageUrl": state.stage.get("backgroundUrl"),
            "staged": resolve_staged(characters, data.staged, values),
            "canAdvance": bool(data.next_node_id),
            "nextNodeId": data.next_node_id,
            "stage": stage,
            "preload": upcoming_images(graph, node, characters, values),
        }

    owned = owned_option_ids or set()
    options = []
    for option in visible_options(graph, state, node):
        is_owned = option.id in owned
        if balances is None or not option.is_paid or is_owned:
            affordable = True
        else:
            affordable = balances.get(option.cost_currency, 0) >= option.cost_amount
        options.append(
            {
                "id": option.id,
                "text": option.text,
                "costCurrency": option.cost_currency if option.is_paid else None,
                "costAmount": option.cost_amount if option.is_paid else 0,
                "affordable": affordable,
                # Already paid for on an earlier playthrough/rollback - choosing it again is free.
                "owned": is_owned,
            }
        )
    return {
        "type": "CHOICE",
        "nodeId": node.id,
        "prompt": node.data.prompt.model_dump() if node.data.prompt else None,
        "options": options,
        "timerSeconds": node.data.timer_seconds,
        "timeoutOptionId": node.data.timeout_option_id,
        "backgroundImageUrl": state.stage.get("backgroundUrl"),
        "stage": stage,
        "preload": upcoming_images(graph, node, characters, values),
    }
