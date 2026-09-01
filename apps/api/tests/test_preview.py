from sqlalchemy import select

from app.models.content import Character, ChoiceOption, SceneNode, VariableDefinition
from app.models.player import PlayerVariableValue, SaveSlot


async def test_resolve_preview_returns_entry_dialogue_without_creating_save_slot(
    client, make_user, auth_headers, make_chapter, db_session
):
    chapter = await make_chapter()
    node = SceneNode(chapter_id=chapter.id, type="DIALOGUE", order=0, data={"text": {"ru": "Привет!"}})
    db_session.add(node)
    await db_session.flush()
    await db_session.refresh(node)
    chapter.entry_node_id = node.id
    await db_session.flush()

    writer = await make_user("writer-preview@example.com", role="WRITER")

    response = await client.post(
        f"/api/admin/preview/chapters/{chapter.id}",
        headers=auth_headers(writer),
        json={"values": {}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["view"]["type"] == "DIALOGUE"
    assert body["view"]["text"]["ru"] == "Привет!"

    slots = list(await db_session.scalars(select(SaveSlot)))
    assert slots == []


async def test_choose_preview_applies_effect_only_in_memory(
    client, make_user, auth_headers, make_chapter, db_session
):
    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(story_id=story_id, name={"ru": "Ирис"})
    db_session.add(character)
    await db_session.flush()

    variable_def = VariableDefinition(
        story_id=story_id,
        key="affection",
        label={"ru": "Симпатия"},
        type="NUMBER",
        default_value=0,
        character_id=character.id,
    )
    db_session.add(variable_def)

    choice_node = SceneNode(chapter_id=chapter.id, type="CHOICE", order=0, data={})
    db_session.add(choice_node)
    await db_session.flush()
    await db_session.refresh(choice_node)

    end_node = SceneNode(chapter_id=chapter.id, type="END", order=1, data={})
    db_session.add(end_node)
    await db_session.flush()
    await db_session.refresh(end_node)

    option = ChoiceOption(
        node_id=choice_node.id,
        order=0,
        text={"ru": "Улыбнуться"},
        effects=[
            {"variable_key": "affection", "character_id": str(character.id), "op": "INCREMENT", "value": 1}
        ],
        next_node_id=end_node.id,
    )
    db_session.add(option)
    await db_session.flush()

    writer = await make_user("writer-preview2@example.com", role="WRITER")

    response = await client.post(
        f"/api/admin/preview/chapters/{chapter.id}/choose",
        headers=auth_headers(writer),
        json={"nodeId": str(choice_node.id), "choiceOptionId": str(option.id), "values": {}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["view"]["type"] == "END"
    assert body["values"][f"affection::{character.id}"] == 1

    values_in_db = list(await db_session.scalars(select(PlayerVariableValue)))
    assert values_in_db == []


async def test_preview_background_persists_from_previous_dialogue_node_when_unset(
    client, make_user, auth_headers, make_chapter, db_session
):
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

    writer = await make_user("writer-preview-bg@example.com", role="WRITER")

    first_response = await client.post(
        f"/api/admin/preview/chapters/{chapter.id}",
        headers=auth_headers(writer),
        json={"values": {}},
    )
    assert first_response.status_code == 200
    first_body = first_response.json()
    assert first_body["view"]["backgroundImageUrl"] == "https://example.test/hall.jpg"
    assert first_body["backgroundUrl"] == "https://example.test/hall.jpg"

    second_response = await client.post(
        f"/api/admin/preview/chapters/{chapter.id}",
        headers=auth_headers(writer),
        json={
            "nodeId": str(second_node.id),
            "backgroundUrl": first_body["backgroundUrl"],
            "values": {},
        },
    )
    assert second_response.status_code == 200
    second_body = second_response.json()
    assert second_body["view"]["backgroundImageUrl"] == "https://example.test/hall.jpg"
    assert second_body["backgroundUrl"] == "https://example.test/hall.jpg"
