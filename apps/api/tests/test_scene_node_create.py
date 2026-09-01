async def test_create_dialogue_node_returns_201_with_empty_choice_options(
    client, make_user, auth_headers, make_chapter
):
    chapter = await make_chapter()
    writer = await make_user("writer-create-node@example.com", role="WRITER")

    response = await client.post(
        "/api/admin/scene-nodes",
        headers=auth_headers(writer),
        json={
            "type": "DIALOGUE",
            "chapterId": str(chapter.id),
            "order": 0,
            "data": {"text": {"ru": "Привет"}},
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "DIALOGUE"
    assert body["choiceOptions"] == []
