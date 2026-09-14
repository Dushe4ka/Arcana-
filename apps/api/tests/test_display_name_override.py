from app.models.content import Character, SceneNode, VariableDefinition
from app.models.player import PlayerVariableValue


async def test_speaker_name_falls_back_to_character_name_with_no_override(
    client, make_user, auth_headers, make_chapter, db_session
):
    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(story_id=story_id, name={"ru": "Виктор"}, name_color="#FFFFFF")
    db_session.add(character)
    await db_session.flush()

    node = SceneNode(
        chapter_id=chapter.id,
        type="DIALOGUE",
        order=0,
        data={"text": {"ru": "Привет!"}, "speaker_character_id": str(character.id)},
    )
    db_session.add(node)
    await db_session.flush()
    await db_session.refresh(node)
    chapter.entry_node_id = node.id
    await db_session.flush()

    player = await make_user("reader-no-override@example.com", role="PLAYER")

    response = await client.post(
        f"/api/play/chapters/{chapter.id}/start",
        headers=auth_headers(player),
        json={"slotIndex": 1},
    )

    assert response.status_code == 200
    view = response.json()
    assert view["speaker"]["name"]["ru"] == "Виктор"


async def test_speaker_name_uses_display_name_override_when_set(
    client, make_user, auth_headers, make_chapter, db_session
):
    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(story_id=story_id, name={"ru": "Виктор"}, name_color="#FFFFFF")
    db_session.add(character)
    await db_session.flush()

    node = SceneNode(
        chapter_id=chapter.id,
        type="DIALOGUE",
        order=0,
        data={"text": {"ru": "Привет!"}, "speaker_character_id": str(character.id)},
    )
    db_session.add(node)
    await db_session.flush()
    await db_session.refresh(node)
    chapter.entry_node_id = node.id
    await db_session.flush()

    player = await make_user("reader-override@example.com", role="PLAYER")

    variable_def = VariableDefinition(
        story_id=story_id,
        key="display_name_override",
        label={"ru": "Отображаемое имя"},
        type="STRING",
        default_value="Виктор",
        character_id=character.id,
    )
    db_session.add(variable_def)
    await db_session.flush()

    db_session.add(
        PlayerVariableValue(user_id=player.id, variable_definition_id=variable_def.id, value="Витя")
    )
    await db_session.commit()

    response = await client.post(
        f"/api/play/chapters/{chapter.id}/start",
        headers=auth_headers(player),
        json={"slotIndex": 1},
    )

    assert response.status_code == 200
    view = response.json()
    assert view["speaker"]["name"]["ru"] == "Витя"


async def test_preview_speaker_name_uses_display_name_override_when_set(
    client, make_user, auth_headers, make_chapter, db_session
):
    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(story_id=story_id, name={"ru": "Виктор"}, name_color="#FFFFFF")
    db_session.add(character)
    await db_session.flush()

    node = SceneNode(
        chapter_id=chapter.id,
        type="DIALOGUE",
        order=0,
        data={"text": {"ru": "Привет!"}, "speaker_character_id": str(character.id)},
    )
    db_session.add(node)
    await db_session.flush()
    await db_session.refresh(node)
    chapter.entry_node_id = node.id
    await db_session.flush()

    writer = await make_user("writer-override@example.com", role="WRITER")

    variable_def = VariableDefinition(
        story_id=story_id,
        key="display_name_override",
        label={"ru": "Отображаемое имя"},
        type="STRING",
        default_value="Витенька",
        character_id=character.id,
    )
    db_session.add(variable_def)
    await db_session.flush()

    response = await client.post(
        f"/api/admin/preview/chapters/{chapter.id}",
        headers=auth_headers(writer),
        json={"values": {}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["view"]["speaker"]["name"]["ru"] == "Витенька"
