"""Players read a frozen publication of a chapter. Editing the draft must never reach them
until it is published again, a bad release can be rolled back, and a save whose current
beat disappears in a new version is recovered instead of breaking."""

from sqlalchemy import func, select

from app.models.content import ChoiceOption, SceneNode
from app.models.player import PlayerChoiceUnlock


async def _chapter(client, headers, db_session, make_chapter):
    """first -> second -> third -> END, published through the real endpoint (with QA)."""
    chapter = await make_chapter(chapter_status="DRAFT")
    end = SceneNode(chapter_id=chapter.id, type="END", data={})
    db_session.add(end)
    await db_session.flush()
    previous = end
    nodes = {}
    for name in ("third", "second", "first"):
        node = SceneNode(
            chapter_id=chapter.id, type="DIALOGUE", data={"text": {"ru": name}, "nextNodeId": str(previous.id)}
        )
        db_session.add(node)
        await db_session.flush()
        await db_session.refresh(node)
        nodes[name], previous = node, node
    chapter.entry_node_id = nodes["first"].id
    await db_session.flush()
    assert (await client.post(f"/api/admin/chapters/{chapter.id}/publish", headers=headers)).status_code == 200
    return chapter, nodes


async def _start(client, headers, chapter, **body):
    response = await client.post(
        f"/api/play/chapters/{chapter.id}/start", headers=headers, json={"slotIndex": 1, **body}
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_draft_edits_reach_players_only_after_republishing_and_can_be_rolled_back(
    client, make_user, auth_headers, make_chapter, db_session
):
    headers = auth_headers(await make_user("pub-editor@example.com", role="EDITOR"))
    chapter, nodes = await _chapter(client, headers, db_session, make_chapter)
    base = f"/api/admin/chapters/{chapter.id}"

    overview = (await client.get(f"{base}/publications", headers=headers)).json()
    assert (overview["liveVersion"], overview["hasUnpublishedChanges"]) == (1, False)

    edit = await client.patch(
        f"/api/admin/scene-nodes/{nodes['first'].id}",
        headers=headers,
        json={"data": {"text": {"ru": "first, rewritten"}, "nextNodeId": str(nodes["second"].id)}},
    )
    assert edit.status_code == 200
    assert (await _start(client, headers, chapter))["text"]["ru"] == "first"  # players still on v1
    assert (await client.get(f"{base}/publications", headers=headers)).json()["hasUnpublishedChanges"] is True

    assert (await client.post(f"{base}/publish", headers=headers)).status_code == 200
    assert (await _start(client, headers, chapter))["text"]["ru"] == "first, rewritten"
    overview = (await client.get(f"{base}/publications", headers=headers)).json()
    assert overview["liveVersion"] == 2 and overview["hasUnpublishedChanges"] is False
    assert [(v["version"], v["isLive"]) for v in overview["versions"]] == [(2, True), (1, False)]

    rolled_back = await client.post(f"{base}/publications/1/activate", headers=headers)
    assert rolled_back.status_code == 200 and rolled_back.json()["liveVersion"] == 1
    assert (await _start(client, headers, chapter))["text"]["ru"] == "first"
    assert (await client.post(f"{base}/publications/9/activate", headers=headers)).status_code == 404

    writer = auth_headers(await make_user("pub-writer@example.com", role="WRITER"))
    assert (await client.post(f"{base}/publications/2/activate", headers=writer)).status_code == 403


async def test_deleting_a_draft_node_does_not_break_a_player_standing_on_it(
    client, make_user, auth_headers, make_chapter, db_session
):
    headers = auth_headers(await make_user("pub-editor2@example.com", role="EDITOR"))
    chapter, nodes = await _chapter(client, headers, db_session, make_chapter)
    view = await _start(client, headers, chapter)
    slot = view["saveSlot"]["id"]
    view = (await client.post(f"/api/play/save-slots/{slot}/advance", headers=headers)).json()
    assert view["text"]["ru"] == "second"

    deleted = await client.delete(f"/api/admin/scene-nodes/{nodes['second'].id}", headers=headers)
    assert deleted.status_code == 204
    # The draft is now broken, but nothing was republished: the player carries on untouched.
    assert (await client.get(f"/api/play/save-slots/{slot}", headers=headers)).json()["text"]["ru"] == "second"
    assert (await client.post(f"/api/play/save-slots/{slot}/advance", headers=headers)).json()["text"]["ru"] == "third"
    # ...and the broken draft cannot be published over the working version.
    assert (await client.post(f"/api/admin/chapters/{chapter.id}/publish", headers=headers)).status_code == 400
    assert (await client.get(f"/api/admin/chapters/{chapter.id}/publications", headers=headers)).json()["liveVersion"] == 1


async def test_save_recovers_when_its_beat_is_removed_by_a_new_version(
    client, make_user, auth_headers, make_chapter, db_session
):
    headers = auth_headers(await make_user("pub-editor3@example.com", role="EDITOR"))
    chapter, nodes = await _chapter(client, headers, db_session, make_chapter)
    view = await _start(client, headers, chapter)
    slot = view["saveSlot"]["id"]
    for _ in range(2):
        view = (await client.post(f"/api/play/save-slots/{slot}/advance", headers=headers)).json()
    assert view["text"]["ru"] == "third"

    # New version: «third» is cut, «second» now leads straight to the end.
    end_id = nodes["third"].data["nextNodeId"]
    await client.delete(f"/api/admin/scene-nodes/{nodes['third'].id}", headers=headers)
    await client.patch(
        f"/api/admin/scene-nodes/{nodes['second'].id}",
        headers=headers,
        json={"data": {"text": {"ru": "second"}, "nextNodeId": end_id}},
    )
    assert (await client.post(f"/api/admin/chapters/{chapter.id}/publish", headers=headers)).status_code == 200

    recovered = await client.get(f"/api/play/save-slots/{slot}", headers=headers)
    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["text"]["ru"] == "second"  # the latest beat of their history that still exists
    end = (await client.post(f"/api/play/save-slots/{slot}/advance", headers=headers)).json()
    assert end["type"] == "END"


async def test_save_with_no_surviving_history_restarts_the_chapter(
    client, make_user, auth_headers, make_chapter, db_session
):
    headers = auth_headers(await make_user("pub-editor4@example.com", role="EDITOR"))
    chapter, nodes = await _chapter(client, headers, db_session, make_chapter)
    await _start(client, headers, chapter)  # standing on «first», no history yet

    replacement = SceneNode(
        chapter_id=chapter.id, type="DIALOGUE", data={"text": {"ru": "new opening"}, "nextNodeId": str(nodes["second"].id)}
    )
    db_session.add(replacement)
    await db_session.flush()
    await client.patch(f"/api/admin/chapters/{chapter.id}", headers=headers, json={"entryNodeId": str(replacement.id)})
    await client.delete(f"/api/admin/scene-nodes/{nodes['first'].id}", headers=headers)
    assert (await client.post(f"/api/admin/chapters/{chapter.id}/publish", headers=headers)).status_code == 200

    assert (await _start(client, headers, chapter))["text"]["ru"] == "new opening"


async def test_purchase_survives_deleting_the_option_from_the_draft(
    client, make_user, auth_headers, make_chapter, db_session
):
    from app.services import publications_service

    chapter = await make_chapter()
    end = SceneNode(chapter_id=chapter.id, type="END", data={})
    choice = SceneNode(chapter_id=chapter.id, type="CHOICE", data={})
    db_session.add_all([end, choice])
    await db_session.flush()
    paid = ChoiceOption(node_id=choice.id, text={"ru": "Платно"}, cost_currency="SOFT", cost_amount=10, next_node_id=end.id)
    db_session.add(paid)
    chapter.entry_node_id = choice.id
    await db_session.flush()
    await publications_service.snapshot(db_session, chapter)
    paid_id = str(paid.id)

    player = await make_user("pub-buyer@example.com")
    headers = auth_headers(player)
    view = await _start(client, headers, chapter)
    bought = await client.post(
        f"/api/play/save-slots/{view['saveSlot']['id']}/choice", headers=headers, json={"choiceOptionId": paid_id}
    )
    assert bought.status_code == 200

    await db_session.delete(paid)  # a writer removes the option from the draft
    await db_session.flush()
    assert await db_session.scalar(select(func.count()).select_from(PlayerChoiceUnlock)) == 1
    # Still live in the published version, and still owned.
    replay = await _start(client, headers, chapter, restart=True)
    assert replay["options"][0]["owned"] is True
