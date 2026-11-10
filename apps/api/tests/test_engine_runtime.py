"""Pure unit tests for the narrative runtime - no database, no HTTP."""

import pytest

from app.engine import runtime
from app.engine.runtime import EngineError, EngineState, NodeSpec, OptionSpec, StoryGraph, VariableSpec
from app.schemas.common import Condition, Effect


def _node(node_id, node_type, data, options=()):
    return NodeSpec(
        id=node_id, chapter_id="ch", type=node_type, data=runtime.parse_node_data(node_type, data), options=tuple(options)
    )


def _option(option_id, next_node_id, *, effects=(), visible_when=(), cost=None):
    return OptionSpec(
        id=option_id,
        order=0,
        text={"ru": option_id},
        cost_currency=cost[0] if cost else None,
        cost_amount=cost[1] if cost else 0,
        visible_when=tuple(Condition.model_validate(c) for c in visible_when),
        effects=tuple(Effect.model_validate(e) for e in effects),
        next_node_id=next_node_id,
    )


def _graph(*nodes, variables=()):
    return StoryGraph(nodes={n.id: n for n in nodes}, variables={v.lookup_key: v for v in variables})


TRUST = VariableSpec(lookup_key="trust::", key="trust", character_id=None, type="NUMBER", default=0, min_value=0, max_value=5)


def test_auto_traversal_applies_effects_then_branches_on_them():
    graph = _graph(
        _node("fx", "EFFECT", {"effects": [{"variableKey": "trust", "op": "INCREMENT", "value": 3}], "nextNodeId": "if"}),
        _node("if", "CONDITION", {"when": [{"variableKey": "trust", "operator": "GTE", "value": 3}], "thenNodeId": "yes", "elseNodeId": "no"}),
        _node("yes", "DIALOGUE", {"text": {"ru": "да"}}),
        _node("no", "DIALOGUE", {"text": {"ru": "нет"}}),
        variables=[TRUST],
    )
    rest = runtime.run_until_rest(graph, EngineState(), "fx")
    assert rest.node.id == "yes"
    assert rest.trail == ["fx", "if", "yes"]
    assert rest.state.values == {"trust::": 3}


def test_runtime_is_deterministic_and_never_mutates_its_input():
    graph = _graph(
        _node("fx", "EFFECT", {"effects": [{"variableKey": "trust", "op": "INCREMENT", "value": 1}], "nextNodeId": "d"}),
        _node("d", "DIALOGUE", {"text": {"ru": "..."}}),
        variables=[TRUST],
    )
    start = EngineState(values={"trust::": 1})
    first = runtime.run_until_rest(graph, start, "fx")
    second = runtime.run_until_rest(graph, start, "fx")
    assert start.values == {"trust::": 1}
    assert first.state.to_json() == second.state.to_json() == {"values": {"trust::": 2}, "stage": runtime.empty_stage()}


def test_effects_are_clamped_to_variable_bounds():
    graph = _graph(variables=[TRUST])
    state = runtime.apply_effects(graph, EngineState(), [Effect(variable_key="trust", op="INCREMENT", value=99)])
    assert state.values["trust::"] == 5
    state = runtime.apply_effects(graph, state, [Effect(variable_key="trust", op="DECREMENT", value=99)])
    assert state.values["trust::"] == 0


def test_effect_on_undefined_variable_is_ignored():
    state = runtime.apply_effects(_graph(), EngineState(), [Effect(variable_key="ghost", op="SET", value=1)])
    assert state.values == {}


def test_changed_default_reaches_saves_that_never_touched_the_variable():
    graph = _graph(variables=[TRUST])
    assert runtime.effective_values(graph, EngineState())["trust::"] == 0
    graph.variables["trust::"] = VariableSpec(lookup_key="trust::", key="trust", character_id=None, type="NUMBER", default=2)
    assert runtime.effective_values(graph, EngineState())["trust::"] == 2


def test_cycle_of_automatic_nodes_is_reported_not_spun_forever():
    graph = _graph(
        _node("a", "EFFECT", {"effects": [], "nextNodeId": "b"}),
        _node("b", "EFFECT", {"effects": [], "nextNodeId": "a"}),
    )
    with pytest.raises(EngineError) as excinfo:
        runtime.run_until_rest(graph, EngineState(), "a")
    assert excinfo.value.code == "AUTO_LOOP"


def test_missing_and_absent_targets_have_distinct_codes():
    graph = _graph(_node("fx", "EFFECT", {"effects": [], "nextNodeId": "nowhere"}), _node("if", "CONDITION", {}))
    with pytest.raises(EngineError) as missing:
        runtime.run_until_rest(graph, EngineState(), "fx")
    assert (missing.value.code, missing.value.node_id) == ("MISSING_NODE", "nowhere")
    with pytest.raises(EngineError) as dangling:
        runtime.run_until_rest(graph, EngineState(), "if")
    assert dangling.value.code == "NO_TARGET"


def test_hidden_option_cannot_be_taken_and_is_not_listed():
    choice = _node(
        "c",
        "CHOICE",
        {},
        [
            _option("open", "d"),
            _option("secret", "d", visible_when=[{"variableKey": "trust", "operator": "GTE", "value": 4}]),
        ],
    )
    graph = _graph(choice, _node("d", "DIALOGUE", {"text": {"ru": "."}}), variables=[TRUST])
    assert [o.id for o in runtime.visible_options(graph, EngineState(), choice)] == ["open"]
    with pytest.raises(EngineError) as excinfo:
        runtime.take_option(graph, EngineState(), choice, "secret")
    assert excinfo.value.code == "OPTION_HIDDEN"
    trusted = EngineState(values={"trust::": 4})
    assert [o.id for o in runtime.visible_options(graph, trusted, choice)] == ["open", "secret"]


def test_option_without_continuation_is_rejected_before_any_effect():
    choice = _node("c", "CHOICE", {}, [_option("dead", None, effects=[{"variableKey": "trust", "op": "SET", "value": 5}])])
    with pytest.raises(EngineError) as excinfo:
        runtime.take_option(_graph(choice, variables=[TRUST]), EngineState(), choice, "dead")
    assert excinfo.value.code == "NO_TARGET"


def test_stage_directions_persist_until_changed_and_cues_are_one_shot():
    graph = _graph(
        _node(
            "a",
            "DIALOGUE",
            {
                "text": {"ru": "1"},
                "backgroundImageUrl": "bg1",
                "music": {"action": "play", "url": "theme.mp3"},
                "atmosphere": "rain",
                "sfxUrl": "door.mp3",
                "screenEffect": "shake",
                "nextNodeId": "b",
            },
        ),
        _node("b", "DIALOGUE", {"text": {"ru": "2"}, "nextNodeId": "c"}),
        _node("c", "DIALOGUE", {"text": {"ru": "3"}, "music": {"action": "stop"}, "atmosphere": "none", "cgImageUrl": "cg1"}),
    )
    a = runtime.run_until_rest(graph, EngineState(), "a")
    assert a.state.stage["music"] == {"url": "theme.mp3", "loop": True, "volume": 1.0}
    assert a.cues == {"musicFadeMs": 800, "sfxUrl": "door.mp3", "screenEffect": "shake"}

    b = runtime.run_until_rest(graph, a.state, "b")
    assert b.state.stage["backgroundUrl"] == "bg1"
    assert b.state.stage["music"]["url"] == "theme.mp3"
    assert b.state.stage["atmosphere"] == "rain"
    assert b.cues == {}

    c = runtime.run_until_rest(graph, b.state, "c")
    assert c.state.stage["music"] is None
    assert c.state.stage["atmosphere"] is None
    assert c.state.stage["cgUrl"] == "cg1"


def test_music_play_cue_requires_a_track():
    with pytest.raises(Exception):  # noqa: B017, PT011 - pydantic ValidationError
        runtime.parse_node_data("DIALOGUE", {"text": {"ru": "."}, "music": {"action": "play"}})
