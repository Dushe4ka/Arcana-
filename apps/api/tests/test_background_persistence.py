async def test_background_persists_from_previous_dialogue_node_when_unset(
    client, make_user, auth_headers, make_chapter, db_session
):
    from app.models.content import SceneNode

    chapter = await make_chapter()

    second_node = SceneNode(
        chapter_id=chapter.id,
        type="DIALOGUE",
        order=1,
        data={"text": {"ru": "Второй момент"}},
    )
    db_session.add(second_node)
    await db_session.flush()
    await db_session.refresh(second_node)

    first_node = SceneNode(
        chapter_id=chapter.id,
        type="DIALOGUE",
        order=0,
        data={
            "text": {"ru": "Первый момент"},
            "background_image_url": "https://example.test/hall.jpg",
            "next_node_id": str(second_node.id),
        },
    )
    db_session.add(first_node)
    await db_session.flush()
    await db_session.refresh(first_node)

    chapter.entry_node_id = first_node.id
    await db_session.flush()

    player = await make_user("reader-bg@example.com", role="PLAYER")

    start_response = await client.post(
        f"/api/play/chapters/{chapter.id}/start",
        headers=auth_headers(player),
        json={"slotIndex": 1},
    )
    assert start_response.status_code == 200
    first_view = start_response.json()
    assert first_view["backgroundImageUrl"] == "https://example.test/hall.jpg"
    save_slot_id = first_view["saveSlot"]["id"]

    advance_response = await client.post(
        f"/api/play/save-slots/{save_slot_id}/advance",
        headers=auth_headers(player),
    )
    assert advance_response.status_code == 200
    second_view = advance_response.json()
    assert second_view["backgroundImageUrl"] == "https://example.test/hall.jpg"
