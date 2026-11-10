"""The narrative runtime: a pure, deterministic interpreter for chapter scene graphs.

Nothing in this module touches the database, the wallet or the network. It takes an immutable
description of the story (`StoryGraph`) plus a plain-data `EngineState` and returns a new
state - so the same state and the same inputs always produce the same result. The live reader
(play_service), the author preview (preview_service) and narrative QA (narrative_qa) all run
on this single implementation; they differ only in where state is kept and whether money is
involved.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from app.engine.condition_engine import (
    VariableBounds,
    apply_effect,
    evaluate_condition_group,
    variable_lookup_key,
)
from app.schemas.common import Condition, Effect, VariableScalar
from app.schemas.content import (
    ChoiceNodeData,
    ConditionNodeData,
    DialogueNodeData,
    EffectNodeData,
    EndNodeData,
)

MAX_AUTO_TRAVERSAL_STEPS = 100
STATE_VERSION = 1

_DATA_SCHEMA = {
    "DIALOGUE": DialogueNodeData,
    "CHOICE": ChoiceNodeData,
    "CONDITION": ConditionNodeData,
    "EFFECT": EffectNodeData,
    "END": EndNodeData,
}


class EngineError(Exception):
    """A story-content problem hit while running the graph (missing target, loop, ...).
    `code` is stable and machine-readable; `message` is shown to players/authors."""

    def __init__(self, code: str, message: str, node_id: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.node_id = node_id


@dataclass(frozen=True)
class OptionSpec:
    id: str
    order: int
    text: dict
    cost_currency: str | None
    cost_amount: int
    visible_when: tuple[Condition, ...]
    effects: tuple[Effect, ...]
    next_node_id: str | None

    @property
    def is_paid(self) -> bool:
        return bool(self.cost_currency) and self.cost_amount > 0


@dataclass(frozen=True)
class NodeSpec:
    id: str
    chapter_id: str
    type: str
    data: Any
    options: tuple[OptionSpec, ...] = ()


@dataclass(frozen=True)
class VariableSpec:
    lookup_key: str
    key: str
    character_id: str | None
    type: str
    default: VariableScalar
    min_value: float | None = None
    max_value: float | None = None


@dataclass
class StoryGraph:
    nodes: dict[str, NodeSpec]
    variables: dict[str, VariableSpec]
    # Nodes whose stored payload no longer validates: node id -> human-readable reason.
    broken: dict[str, str] = field(default_factory=dict)

    def node(self, node_id: str | None) -> NodeSpec:
        if not node_id:
            raise EngineError("NO_TARGET", "Сюжет обрывается: у сцены нет продолжения")
        node = self.nodes.get(str(node_id))
        if node is None:
            if str(node_id) in self.broken:
                raise EngineError("BAD_NODE_DATA", "Сцена содержит некорректные данные", str(node_id))
            raise EngineError("MISSING_NODE", "Сцена не найдена", str(node_id))
        return node


def empty_stage() -> dict:
    return {"backgroundUrl": None, "music": None, "atmosphere": None, "camera": None, "cgUrl": None}


@dataclass
class EngineState:
    """Everything that defines "where the player is" besides the node pointer itself.
    `values` holds only variables that were explicitly changed - defaults come from the
    variable definitions, so editing a default later still reaches existing saves."""

    values: dict[str, VariableScalar] = field(default_factory=dict)
    stage: dict = field(default_factory=empty_stage)

    def clone(self) -> EngineState:
        return EngineState(values=dict(self.values), stage=copy.deepcopy(self.stage))

    def to_json(self) -> dict:
        return {"values": dict(self.values), "stage": copy.deepcopy(self.stage)}

    @classmethod
    def from_json(cls, raw: dict | None) -> EngineState:
        raw = raw or {}
        stage = empty_stage()
        stage.update(raw.get("stage") or {})
        return cls(values=dict(raw.get("values") or {}), stage=stage)


@dataclass
class RestPoint:
    """Where auto-traversal stopped: a node that needs the player (or ends the chapter)."""

    node: NodeSpec
    state: EngineState
    # Every node id walked through to get here, in order, including the resting node.
    trail: list[str]
    # One-shot presentation cues of the resting dialogue beat (never persisted).
    cues: dict = field(default_factory=dict)


def parse_node_data(node_type: str, raw: dict) -> Any:
    return _DATA_SCHEMA[node_type].model_validate(raw or {})


def effective_values(graph: StoryGraph, state: EngineState) -> dict[str, VariableScalar]:
    """Definition defaults overlaid with this playthrough's explicit values."""
    values = {key: spec.default for key, spec in graph.variables.items()}
    for key, value in state.values.items():
        if key in graph.variables:
            values[key] = value
    return values


def apply_effects(graph: StoryGraph, state: EngineState, effects) -> EngineState:
    """Returns a new state with `effects` applied in order. Effects on undefined variables
    are ignored (narrative QA reports them before publication)."""
    next_state = state.clone()
    for effect in effects:
        key = variable_lookup_key(effect.variable_key, effect.character_id)
        spec = graph.variables.get(key)
        if spec is None:
            continue
        current = next_state.values.get(key, spec.default)
        next_state.values[key] = apply_effect(effect, current, VariableBounds(spec.min_value, spec.max_value))
    return next_state


def _apply_stage_directions(state: EngineState, data: DialogueNodeData) -> tuple[EngineState, dict]:
    next_state = state.clone()
    stage = next_state.stage
    cues: dict = {}

    if data.background_image_url:
        stage["backgroundUrl"] = data.background_image_url
    if data.cg_image_url is not None:
        stage["cgUrl"] = data.cg_image_url or None
    if data.atmosphere is not None:
        stage["atmosphere"] = None if data.atmosphere == "none" else data.atmosphere
    if data.camera is not None:
        neutral = data.camera.zoom == 1.0 and data.camera.focus == "center"
        stage["camera"] = None if neutral else {"zoom": data.camera.zoom, "focus": data.camera.focus}
        cues["cameraDurationMs"] = data.camera.duration_ms
    if data.music is not None:
        if data.music.action == "stop":
            stage["music"] = None
        else:
            stage["music"] = {"url": data.music.url, "loop": data.music.loop, "volume": data.music.volume}
        cues["musicFadeMs"] = data.music.fade_ms
    if data.sfx_url:
        cues["sfxUrl"] = data.sfx_url
    if data.screen_effect:
        cues["screenEffect"] = data.screen_effect
    if data.transition:
        cues["transition"] = data.transition
    return next_state, cues


def run_until_rest(graph: StoryGraph, state: EngineState, node_id: str | None) -> RestPoint:
    """Walks CONDITION and EFFECT nodes automatically until reaching a DIALOGUE, CHOICE or
    END node. Stage directions of the resting dialogue beat are folded into the state."""
    trail: list[str] = []
    current_id = node_id
    while True:
        if len(trail) >= MAX_AUTO_TRAVERSAL_STEPS:
            raise EngineError(
                "AUTO_LOOP",
                "Обнаружен слишком длинный автоматический переход между сценами - возможен цикл в сюжете",
                str(current_id),
            )
        node = graph.node(current_id)
        trail.append(node.id)

        if node.type == "CONDITION":
            passes = evaluate_condition_group(list(node.data.when), effective_values(graph, state))
            current_id = node.data.then_node_id if passes else node.data.else_node_id
            if not current_id:
                raise EngineError("NO_TARGET", "Условный узел не ведёт никуда дальше", node.id)
            continue

        if node.type == "EFFECT":
            state = apply_effects(graph, state, node.data.effects)
            current_id = node.data.next_node_id
            if not current_id:
                raise EngineError("NO_TARGET", "Узел эффекта не ведёт никуда дальше", node.id)
            continue

        cues: dict = {}
        if node.type == "DIALOGUE":
            state, cues = _apply_stage_directions(state, node.data)
        return RestPoint(node=node, state=state, trail=trail, cues=cues)


def visible_options(graph: StoryGraph, state: EngineState, node: NodeSpec) -> list[OptionSpec]:
    values = effective_values(graph, state)
    return [o for o in node.options if evaluate_condition_group(list(o.visible_when), values)]


def find_option(node: NodeSpec, option_id: str) -> OptionSpec:
    for option in node.options:
        if option.id == str(option_id):
            return option
    raise EngineError("OPTION_NOT_HERE", "Этот вариант недоступен в текущей сцене", node.id)


def take_option(
    graph: StoryGraph, state: EngineState, node: NodeSpec, option_id: str
) -> tuple[OptionSpec, EngineState]:
    """Validates and applies a player's choice. Returns the option (so the caller can charge
    for it) and the state after its effects; the caller then runs `run_until_rest` from
    `option.next_node_id`."""
    if node.type != "CHOICE":
        raise EngineError("NOT_A_CHOICE", "В текущей сцене нет вариантов выбора", node.id)
    option = find_option(node, option_id)
    if not evaluate_condition_group(list(option.visible_when), effective_values(graph, state)):
        raise EngineError("OPTION_HIDDEN", "Этот вариант выбора сейчас недоступен", node.id)
    if not option.next_node_id:
        raise EngineError("NO_TARGET", "У этого варианта не задано продолжение сюжета", node.id)
    return option, apply_effects(graph, state, option.effects)
