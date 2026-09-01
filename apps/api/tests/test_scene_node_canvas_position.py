async def test_patch_scene_node_persists_canvas_position(
    client, make_user, auth_headers, make_chapter, db_session
):
    from app.models.content import SceneNode

    chapter = await make_chapter()
    node = SceneNode(chapter_id=chapter.id, type="DIALOGUE", order=0, data={"text": {"ru": "Привет"}})
    db_session.add(node)
    await db_session.flush()

    writer = await make_user("writer-canvas@example.com", role="WRITER")

    response = await client.patch(
        f"/api/admin/scene-nodes/{node.id}",
        headers=auth_headers(writer),
        json={"canvasX": 240, "canvasY": -80},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["canvasX"] == 240
    assert body["canvasY"] == -80
