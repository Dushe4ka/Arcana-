"""Regression tests for the by_alias fix (final review Finding 1): SceneNode.data and
ChoiceOption.effects/visible_when must be persisted (and returned) with camelCase keys,
matching what the admin frontend reads - not the snake_case that a bare `.model_dump()`
would have produced.
"""


async def test_create_dialogue_node_stores_data_camel_case(client, make_user, auth_headers, make_chapter):
    chapter = await make_chapter()
    writer = await make_user("writer-casing-create@example.com", role="WRITER")

    create_response = await client.post(
        "/api/admin/scene-nodes",
        headers=auth_headers(writer),
        json={
            "type": "DIALOGUE",
            "chapterId": str(chapter.id),
            "order": 0,
            "data": {"text": {"ru": "Привет"}, "isThought": True},
        },
    )
    assert create_response.status_code == 201
    body = create_response.json()
    assert "isThought" in body["data"]
    assert "is_thought" not in body["data"]
    assert body["data"]["isThought"] is True


async def test_update_dialogue_node_stores_next_node_id_camel_case(
    client, make_user, auth_headers, make_chapter
):
    chapter = await make_chapter()
    writer = await make_user("writer-casing-update@example.com", role="WRITER")

    first = await client.post(
        "/api/admin/scene-nodes",
        headers=auth_headers(writer),
        json={
            "type": "DIALOGUE",
            "chapterId": str(chapter.id),
            "order": 0,
            "data": {"text": {"ru": "Первый узел"}},
        },
    )
    second = await client.post(
        "/api/admin/scene-nodes",
        headers=auth_headers(writer),
        json={
            "type": "DIALOGUE",
            "chapterId": str(chapter.id),
            "order": 1,
            "data": {"text": {"ru": "Второй узел"}},
        },
    )
    first_id = first.json()["id"]
    second_id = second.json()["id"]

    update_response = await client.patch(
        f"/api/admin/scene-nodes/{first_id}",
        headers=auth_headers(writer),
        json={
            "data": {
                "text": {"ru": "Первый узел"},
                "isThought": False,
                "nextNodeId": second_id,
            }
        },
    )
    assert update_response.status_code == 200
    body = update_response.json()
    assert body["data"]["nextNodeId"] == second_id
    assert "next_node_id" not in body["data"]

    # Re-fetch to confirm the value actually persisted, not just echoed back.
    reread = await client.get(f"/api/admin/scene-nodes?chapterId={chapter.id}", headers=auth_headers(writer))
    reread_first = next(n for n in reread.json() if n["id"] == first_id)
    assert reread_first["data"]["nextNodeId"] == second_id


async def test_create_choice_option_stores_effects_camel_case(client, make_user, auth_headers, make_chapter):
    chapter = await make_chapter()
    writer = await make_user("writer-casing-choice@example.com", role="WRITER")

    node = await client.post(
        "/api/admin/scene-nodes",
        headers=auth_headers(writer),
        json={"type": "CHOICE", "chapterId": str(chapter.id), "order": 0, "data": {}},
    )
    node_id = node.json()["id"]

    option_response = await client.post(
        "/api/admin/choice-options",
        headers=auth_headers(writer),
        json={
            "nodeId": node_id,
            "text": {"ru": "Вариант"},
            "order": 0,
            "visibleWhen": [{"variableKey": "trust", "characterId": None, "operator": "GTE", "value": 1}],
            "effects": [{"variableKey": "trust", "characterId": None, "op": "INCREMENT", "value": 1}],
        },
    )
    assert option_response.status_code == 201
    body = option_response.json()
    assert body["effects"][0]["variableKey"] == "trust"
    assert "variable_key" not in body["effects"][0]
    assert body["visibleWhen"][0]["operator"] == "GTE"
    assert "variable_key" not in body["visibleWhen"][0]


async def test_update_choice_option_stores_effects_camel_case(client, make_user, auth_headers, make_chapter):
    chapter = await make_chapter()
    writer = await make_user("writer-casing-choice-update@example.com", role="WRITER")

    node = await client.post(
        "/api/admin/scene-nodes",
        headers=auth_headers(writer),
        json={"type": "CHOICE", "chapterId": str(chapter.id), "order": 0, "data": {}},
    )
    node_id = node.json()["id"]

    created = await client.post(
        "/api/admin/choice-options",
        headers=auth_headers(writer),
        json={
            "nodeId": node_id,
            "text": {"ru": "Вариант"},
            "order": 0,
            "visibleWhen": [],
            "effects": [],
        },
    )
    option_id = created.json()["id"]

    update_response = await client.patch(
        f"/api/admin/choice-options/{option_id}",
        headers=auth_headers(writer),
        json={
            "effects": [{"variableKey": "affection", "characterId": None, "op": "SET", "value": 5}],
        },
    )
    assert update_response.status_code == 200
    body = update_response.json()
    assert body["effects"][0]["variableKey"] == "affection"
    assert "variable_key" not in body["effects"][0]
