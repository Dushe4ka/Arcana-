from app.config import settings
from app.devtools.engine_test_story import _id, seed_engine_test_story


async def test_story_graph_separates_direct_transitions_from_deferred_consequences(
    client, make_user, auth_headers, db_session, tmp_path, monkeypatch
):
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    story = await seed_engine_test_story(db_session)
    headers = auth_headers(await make_user("graph@example.com", role="WRITER"))
    graph = (await client.get(f"/api/admin/stories/{story.id}/graph", headers=headers)).json()

    assert [(c["seasonIndex"], c["index"], c["order"]) for c in graph["chapters"]] == [(1, 1, 0), (1, 2, 1)]
    nodes = {n["id"]: n for n in graph["nodes"]}
    ch1, ch2 = str(_id("ch1")), str(_id("ch2"))

    # Every option is a node of its own, hanging off its choice.
    warm = nodes[str(_id("ch1:option:warm"))]
    assert warm["kind"] == "OPTION" and warm["parentId"] == str(_id("ch1:first_choice"))
    assert warm["effects"] == ["Доверие (Тест-герой) + 10", "Симпатия (Тест-герой) + 1"]
    premium = nodes[str(_id("ch1:option:premium"))]
    assert premium["cost"] == "5 карт"
    bold = nodes[str(_id("ch1:option:bold"))]
    assert bold["conditions"] == ["Смелость ≥ 1"]
    gate = nodes[str(_id("ch1:trust_gate"))]
    assert gate["kind"] == "CONDITION" and gate["label"] == "Доверие (Тест-герой) ≥ 10"
    assert nodes[str(_id("ch1:intro"))]["isEntry"] is True
    assert nodes[str(_id("ch1:end_dawn"))]["label"] == "Финал: рассвет вдвоём"

    flow = {(e["from"], e["to"]): e for e in graph["flow"]}
    assert flow[(str(_id("ch1:first_choice")), warm["id"])]["kind"] == "option"
    assert flow[(warm["id"], gate["id"])]["kind"] == "next"
    assert flow[(gate["id"], str(_id("ch1:trusted")))]["label"] == "да"
    assert not any(e["broken"] or e["crossChapter"] for e in graph["flow"])

    influences = {(i["from"], i["to"]): i for i in graph["influences"]}
    # Same chapter: the warm answer raises trust, which the gate right after it checks.
    assert influences[(warm["id"], gate["id"])] == {
        "from": warm["id"], "to": gate["id"], "variable": "Доверие (Тест-герой)", "crossChapter": False,
    }
    # Across chapters: romance earned in chapter 1 decides the opening of chapter 2.
    carry = influences[(warm["id"], str(_id("ch2:carry_gate")))]
    assert carry["crossChapter"] is True and carry["variable"] == "Симпатия (Тест-герой)"
    assert (str(_id("ch1:option:speak")), str(_id("ch2:option:stay"))) in influences
    # "Отшутиться" raises courage, which unlocks the bold option later in the same chapter.
    assert (str(_id("ch1:option:ironic")), bold["id"]) in influences
    # Nothing flows backwards: a chapter-2 decision never "influences" chapter 1.
    assert all(nodes[i["from"]]["chapterId"] != ch2 or nodes[i["to"]]["chapterId"] != ch1 for i in graph["influences"])
    # ...and within a chapter, never to a check that comes before the decision.
    assert (str(_id("ch1:option:speak")), gate["id"]) not in influences


async def test_graph_marks_broken_and_cross_chapter_links(client, make_user, auth_headers, make_chapter, db_session):
    import uuid

    from app.models.content import SceneNode, Story

    first = await make_chapter(chapter_status="DRAFT")
    story = await db_session.get(Story, first.season.story_id)
    second = await make_chapter(story=story, index=2, chapter_status="DRAFT")
    target = SceneNode(chapter_id=second.id, type="END", data={})
    db_session.add(target)
    await db_session.flush()
    db_session.add_all(
        [
            SceneNode(chapter_id=first.id, type="DIALOGUE", data={"text": {"ru": "Прыжок"}, "nextNodeId": str(target.id)}),
            SceneNode(chapter_id=first.id, type="DIALOGUE", data={"text": {"ru": "В никуда"}, "nextNodeId": str(uuid.uuid4())}),
        ]
    )
    await db_session.flush()
    db_session.expunge_all()
    headers = auth_headers(await make_user("graph2@example.com", role="WRITER"))
    graph = (await client.get(f"/api/admin/stories/{story.id}/graph", headers=headers)).json()
    kinds = sorted((e["crossChapter"], e["broken"]) for e in graph["flow"])
    assert kinds == [(False, True), (True, False)]


async def test_option_position_can_be_saved(client, make_user, auth_headers, db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    story = await seed_engine_test_story(db_session)
    headers = auth_headers(await make_user("graph3@example.com", role="WRITER"))
    option_id = _id("ch1:option:warm")
    moved = await client.patch(f"/api/admin/choice-options/{option_id}", headers=headers, json={"canvasX": 420, "canvasY": -80})
    assert moved.status_code == 200 and (moved.json()["canvasX"], moved.json()["canvasY"]) == (420, -80)
    assert moved.json()["text"]["ru"] == "Тепло улыбнуться"  # nothing else was touched
    graph = (await client.get(f"/api/admin/stories/{story.id}/graph", headers=headers)).json()
    node = next(n for n in graph["nodes"] if n["id"] == str(option_id))
    assert (node["x"], node["y"]) == (420, -80)
