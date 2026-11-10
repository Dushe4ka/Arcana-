"""Narrative QA: each test builds a small chapter with one specific defect and checks that
the analysis names it (and that a healthy chapter is clean)."""

from app.engine import narrative_qa, runtime
from app.engine.runtime import NodeSpec, OptionSpec, StoryGraph, VariableSpec
from app.schemas.common import Condition, Effect

CH = "ch"


def node(node_id, node_type, data=None, options=()):
    return NodeSpec(node_id, CH, node_type, runtime.parse_node_data(node_type, data or {}), tuple(options))


def say(node_id, next_id=None, **data):
    return node(node_id, "DIALOGUE", {"text": {"ru": node_id}, "nextNodeId": next_id, **data})


def option(option_id, next_id, *, effects=(), when=(), cost=0):
    return OptionSpec(
        id=option_id,
        order=0,
        text={"ru": option_id},
        cost_currency="HARD" if cost else None,
        cost_amount=cost,
        visible_when=tuple(Condition.model_validate(c) for c in when),
        effects=tuple(Effect.model_validate(e) for e in effects),
        next_node_id=next_id,
    )


def var(key, default=0, var_type="NUMBER"):
    return VariableSpec(lookup_key=f"{key}::", key=key, character_id=None, type=var_type, default=default)


def analyze(nodes, entry="start", variables=(), characters=None, **kwargs):
    graph = StoryGraph(nodes={n.id: n for n in nodes}, variables={v.lookup_key: v for v in variables})
    return narrative_qa.analyze_chapter(graph, CH, entry, characters or {}, **kwargs)


def codes(report, severity=None):
    return sorted({i.code for i in report.issues if severity is None or i.severity == severity})


def test_healthy_branching_chapter_is_publishable_and_fully_covered():
    report = analyze(
        [
            say("start", "pick"),
            node(
                "pick",
                "CHOICE",
                options=[
                    option("warm", "gate", effects=[{"variableKey": "trust", "op": "INCREMENT", "value": 2}]),
                    option("cold", "gate"),
                ],
            ),
            node("gate", "CONDITION", {"when": [{"variableKey": "trust", "operator": "GTE", "value": 2}], "thenNodeId": "good", "elseNodeId": "bad"}),
            node("good", "END"),
            node("bad", "END"),
        ],
        variables=[var("trust")],
    )
    assert report.issues == []
    assert report.publishable
    assert report.stats["coveragePercent"] == 100
    assert report.stats["reachableEndings"] == 2
    assert report.stats["explorationComplete"] is True


def test_missing_entry_and_empty_chapter():
    assert codes(analyze([], entry=None)) == ["EMPTY_CHAPTER"]
    assert "NO_ENTRY" in codes(analyze([node("a", "END")], entry=None))
    assert "NO_ENTRY" in codes(analyze([node("a", "END")], entry="ghost"))


def test_dead_end_dialogue_and_dangling_links_block_publication():
    report = analyze(
        [
            say("start", "pick"),
            node("pick", "CHOICE", options=[option("a", "stops"), option("b", "nowhere"), option("c", None)]),
            say("stops"),
        ]
    )
    assert not report.publishable
    assert {"DEAD_END", "MISSING_TARGET", "NO_ENDING"} <= set(codes(report, "error"))
    dead = [i for i in report.issues if i.code == "DEAD_END"]
    assert {(i.node_id, i.option_id) for i in dead} == {("stops", None), ("pick", "c")}


def test_link_into_another_chapter_is_not_a_broken_link():
    report = analyze([say("start", "elsewhere")], external_node_ids={"elsewhere"})
    assert report.publishable, [i.to_json() for i in report.issues]


def test_unreachable_scene_is_a_warning_not_a_blocker():
    report = analyze([say("start", "end"), node("end", "END"), say("orphan", "end")])
    assert report.publishable
    assert [(i.code, i.node_id) for i in report.issues] == [("UNREACHABLE", "orphan")]


def test_choice_without_options_and_trap_loop():
    report = analyze([say("start", "empty"), node("empty", "CHOICE")])
    assert "NO_OPTIONS" in codes(report, "error")

    trap = analyze(
        [
            say("start", "pick"),
            node("pick", "CHOICE", options=[option("out", "end"), option("in", "loop_a")]),
            say("loop_a", "loop_b"),
            say("loop_b", "loop_a"),
            node("end", "END"),
        ]
    )
    assert sorted(i.node_id for i in trap.issues if i.code == "TRAP") == ["loop_a", "loop_b"]


def test_cycle_of_automatic_nodes():
    report = analyze(
        [
            say("start", "fx"),
            node("fx", "EFFECT", {"effects": [{"variableKey": "n", "op": "INCREMENT", "value": 1}], "nextNodeId": "if"}),
            node("if", "CONDITION", {"when": [{"variableKey": "n", "operator": "GTE", "value": 0}], "thenNodeId": "fx", "elseNodeId": "end"}),
            node("end", "END"),
        ],
        variables=[var("n")],
    )
    assert "AUTO_LOOP" in codes(report, "error")


def test_undefined_and_mistyped_variables():
    report = analyze(
        [
            say("start", "fx"),
            node("fx", "EFFECT", {"effects": [{"variableKey": "ghost", "op": "SET", "value": 1}, {"variableKey": "name", "op": "INCREMENT", "value": 1}], "nextNodeId": "if"}),
            node("if", "CONDITION", {"when": [{"variableKey": "name", "operator": "GT", "value": 1}, {"variableKey": "phantom", "operator": "EQ", "value": 1}], "thenNodeId": "end", "elseNodeId": "end"}),
            node("end", "END"),
        ],
        variables=[var("name", "Лия", "STRING")],
    )
    found = [(i.code, i.node_id) for i in report.errors]
    assert found.count(("UNDEFINED_VARIABLE", "fx")) == 1 and found.count(("UNDEFINED_VARIABLE", "if")) == 1
    assert found.count(("TYPE_MISMATCH", "fx")) == 1 and found.count(("TYPE_MISMATCH", "if")) == 1


def test_contradictory_conditions():
    def gate(when):
        return analyze(
            [say("start", "if"), node("if", "CONDITION", {"when": when, "thenNodeId": "end", "elseNodeId": "end"}), node("end", "END")],
            variables=[var("x")],
        )

    impossible = [
        [{"variableKey": "x", "operator": "EQ", "value": 1}, {"variableKey": "x", "operator": "EQ", "value": 2}],
        [{"variableKey": "x", "operator": "GT", "value": 5}, {"variableKey": "x", "operator": "LT", "value": 3}],
        [{"variableKey": "x", "operator": "GT", "value": 5}, {"variableKey": "x", "operator": "LTE", "value": 5}],
        [{"variableKey": "x", "operator": "EQ", "value": 1}, {"variableKey": "x", "operator": "NEQ", "value": 1}],
        [{"variableKey": "x", "operator": "EQ", "value": 1}, {"variableKey": "x", "operator": "GT", "value": 4}],
    ]
    for when in impossible:
        assert "IMPOSSIBLE_CONDITION" in codes(gate(when)), when
    satisfiable = [{"variableKey": "x", "operator": "GTE", "value": 3}, {"variableKey": "x", "operator": "LTE", "value": 3}]
    assert "IMPOSSIBLE_CONDITION" not in codes(gate(satisfiable))


def test_soft_lock_found_only_by_playing_the_branches():
    """Every option is conditional; one particular earlier choice hides all of them."""
    report = analyze(
        [
            say("start", "first"),
            node(
                "first",
                "CHOICE",
                options=[
                    option("brave", "second", effects=[{"variableKey": "courage", "op": "SET", "value": 1}]),
                    option("shy", "second"),
                ],
            ),
            node(
                "second",
                "CHOICE",
                options=[option("fight", "end", when=[{"variableKey": "courage", "operator": "EQ", "value": 1}])],
            ),
            node("end", "END"),
        ],
        variables=[var("courage")],
    )
    assert [(i.code, i.node_id) for i in report.errors] == [("SOFT_LOCK", "second")]


def test_ending_and_option_no_playthrough_reaches():
    report = analyze(
        [
            say("start", "pick"),
            node(
                "pick",
                "CHOICE",
                options=[option("go", "gate"), option("secret", "gate", when=[{"variableKey": "love", "operator": "GTE", "value": 5}])],
            ),
            node("gate", "CONDITION", {"when": [{"variableKey": "love", "operator": "GTE", "value": 5}], "thenNodeId": "true_end", "elseNodeId": "normal_end"}),
            node("true_end", "END"),
            node("normal_end", "END"),
        ],
        variables=[var("love")],
    )
    assert report.publishable
    assert ("UNREACHABLE_ENDING", "true_end") in {(i.code, i.node_id) for i in report.issues}
    assert ("OPTION_NEVER_VISIBLE", "secret") in {(i.code, i.option_id) for i in report.issues}
    assert report.stats["reachableEndings"] == 1


def test_cast_problems():
    characters = {"iris": {"id": "iris", "name": {"ru": "Ирис"}, "nameColor": "#fff", "sprites": {"neutral": "u", "dress_smile": "u"}}}
    report = analyze(
        [
            say(
                "start",
                "end",
                speakerCharacterId="nobody",
                staged=[
                    {"characterId": "iris", "sprite": "smile", "position": "left"},
                    {"characterId": "iris", "sprite": "angry", "position": "left"},
                    {"characterId": "ghost", "sprite": "neutral", "position": "right"},
                ],
            ),
            node("end", "END"),
        ],
        characters=characters,
    )
    assert sorted(i.code for i in report.errors) == ["UNKNOWN_CHARACTER", "UNKNOWN_CHARACTER"]
    warnings = [i for i in report.issues if i.severity == "warning"]
    assert sorted(i.code for i in warnings) == ["MISSING_SPRITE", "STAGE_OVERLAP"]
    assert "angry" in next(i.message for i in warnings if i.code == "MISSING_SPRITE")


def test_paywall_and_timer_rules():
    paywall = analyze([say("start", "pick"), node("pick", "CHOICE", options=[option("a", "end", cost=10)]), node("end", "END")])
    assert "PAYWALL" in codes(paywall, "warning")

    def timed(timeout_id, opts):
        return analyze(
            [say("start", "pick"), node("pick", "CHOICE", {"timerSeconds": 10, "timeoutOptionId": timeout_id}, opts), node("end", "END")]
        )

    assert "TIMER_WITHOUT_DEFAULT" in codes(timed(None, [option("a", "end")]))
    assert "BAD_TIMEOUT_OPTION" in codes(timed("zzz", [option("a", "end")]))
    assert "BAD_TIMEOUT_OPTION" in codes(timed("a", [option("a", "end", cost=5), option("b", "end")]))
    assert timed("a", [option("a", "end"), option("b", "end")]).publishable


def test_exploration_is_bounded_and_says_so():
    """A counter loop the player can spin forever must not hang the analysis."""
    report = analyze(
        [
            say("start", "pick"),
            node(
                "pick",
                "CHOICE",
                options=[option("more", "start", effects=[{"variableKey": "n", "op": "INCREMENT", "value": 1}]), option("stop", "end")],
            ),
            node("end", "END"),
        ],
        variables=[var("n")],
        max_states=50,
    )
    assert report.publishable
    assert report.stats["explorationComplete"] is False
    assert "EXPLORATION_TRUNCATED" in codes(report, "info")


async def test_publishing_is_blocked_by_qa_errors_and_cannot_be_bypassed_with_patch(
    client, make_user, auth_headers, make_chapter, db_session
):
    from app.models.content import SceneNode

    chapter = await make_chapter(chapter_status="DRAFT")
    story_id = chapter.season.story_id
    dead_end = SceneNode(chapter_id=chapter.id, type="DIALOGUE", data={"text": {"ru": "И всё?"}})
    db_session.add(dead_end)
    await db_session.flush()
    chapter.entry_node_id = dead_end.id
    await db_session.flush()
    headers = auth_headers(await make_user("qa-editor@example.com", role="EDITOR"))

    qa = (await client.get(f"/api/admin/chapters/{chapter.id}/qa", headers=headers)).json()
    assert qa["publishable"] is False and qa["errorCount"] == 2

    blocked = await client.post(f"/api/admin/chapters/{chapter.id}/publish", headers=headers)
    assert blocked.status_code == 400
    assert blocked.json()["code"] == "QA_FAILED" and blocked.json()["qa"]["errorCount"] == 2
    bypass = await client.patch(f"/api/admin/chapters/{chapter.id}", headers=headers, json={"status": "PUBLISHED"})
    assert bypass.status_code == 400

    end = SceneNode(chapter_id=chapter.id, type="END", data={})
    db_session.add(end)
    await db_session.flush()
    dead_end.data = {**dead_end.data, "nextNodeId": str(end.id)}
    await db_session.flush()
    published = await client.post(f"/api/admin/chapters/{chapter.id}/publish", headers=headers)
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "PUBLISHED"

    story_qa = (await client.get(f"/api/admin/stories/{story_id}/qa", headers=headers)).json()
    assert [c["publishable"] for c in story_qa] == [True]


async def test_story_cannot_be_published_without_a_published_chapter(client, make_user, auth_headers, make_chapter):
    chapter = await make_chapter(chapter_status="DRAFT", story_status="DRAFT")
    headers = auth_headers(await make_user("qa-admin@example.com", role="ADMIN"))
    story_id = chapter.season.story_id
    assert (await client.post(f"/api/admin/stories/{story_id}/publish", headers=headers)).status_code == 400
    assert (await client.patch(f"/api/admin/stories/{story_id}", headers=headers, json={"status": "PUBLISHED"})).status_code == 400


async def test_entry_node_must_belong_to_the_chapter(client, make_user, auth_headers, make_chapter, db_session):
    from app.models.content import SceneNode

    mine = await make_chapter(chapter_status="DRAFT")
    other = await make_chapter(chapter_status="DRAFT")
    foreign = SceneNode(chapter_id=other.id, type="END", data={})
    db_session.add(foreign)
    await db_session.flush()
    headers = auth_headers(await make_user("qa-writer@example.com", role="WRITER"))
    response = await client.patch(f"/api/admin/chapters/{mine.id}", headers=headers, json={"entryNodeId": str(foreign.id)})
    assert response.status_code == 400
