from app.models.content import Character, SceneNode, VariableDefinition
from app.models.player import PlayerVariableValue


async def test_rename_does_not_bleed_into_dialogue_before_the_effect_node(
    client, make_user, auth_headers, make_chapter, db_session
):
    """Regression test for the admin "Переименовать" quick action's forward-only semantics.

    The bug: the admin editor used to seed the `display_name_override` VariableDefinition's
    `default_value` with the character's CURRENT name at the moment of the first rename. Since
    the read side falls back to `default_value` for any player with no stored
    `PlayerVariableValue` yet, that pre-rename name would bleed retroactively into every dialogue
    node before the EFFECT node that actually sets the override - including this test's FIRST
    dialogue node. The fix seeds `default_value` as `""` instead, which the read side already
    treats as "no override active, use `Character.name`".

    Walks a chapter with two DIALOGUE nodes from the same speaker with an EFFECT node (SET
    `display_name_override`) in between, and asserts the first dialogue node's speaker name is
    unaffected by the not-yet-applied rename while the second shows the new name.
    """
    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(story_id=story_id, name={"ru": "Виктор"}, name_color="#FFFFFF")
    db_session.add(character)
    await db_session.flush()

    # Mirrors the admin editor's fixed behavior: `default_value=""`, not the character's name.
    variable_def = VariableDefinition(
        story_id=story_id,
        key="display_name_override",
        label={"ru": "Отображаемое имя"},
        type="STRING",
        default_value="",
        character_id=character.id,
    )
    db_session.add(variable_def)
    await db_session.flush()

    # Build back-to-front so each node's `next_node_id` can point at an already-flushed id.
    second_dialogue = SceneNode(
        chapter_id=chapter.id,
        type="DIALOGUE",
        order=2,
        data={"text": {"ru": "Реплика после переименования"}, "speaker_character_id": str(character.id)},
    )
    db_session.add(second_dialogue)
    await db_session.flush()
    await db_session.refresh(second_dialogue)

    effect_node = SceneNode(
        chapter_id=chapter.id,
        type="EFFECT",
        order=1,
        data={
            "effects": [
                {
                    "variable_key": "display_name_override",
                    "character_id": str(character.id),
                    "op": "SET",
                    "value": "Витя",
                }
            ],
            "next_node_id": str(second_dialogue.id),
        },
    )
    db_session.add(effect_node)
    await db_session.flush()
    await db_session.refresh(effect_node)

    first_dialogue = SceneNode(
        chapter_id=chapter.id,
        type="DIALOGUE",
        order=0,
        data={
            "text": {"ru": "Реплика до переименования"},
            "speaker_character_id": str(character.id),
            "next_node_id": str(effect_node.id),
        },
    )
    db_session.add(first_dialogue)
    await db_session.flush()
    await db_session.refresh(first_dialogue)
    chapter.entry_node_id = first_dialogue.id
    await db_session.commit()

    player = await make_user("reader-rename-bleed@example.com", role="PLAYER")

    start_response = await client.post(
        f"/api/play/chapters/{chapter.id}/start",
        headers=auth_headers(player),
        json={"slotIndex": 1},
    )
    assert start_response.status_code == 200
    first_view = start_response.json()
    assert first_view["type"] == "DIALOGUE"
    # The rename hasn't happened yet from this player's perspective (they haven't reached the
    # EFFECT node) - the speaker must still show the character's own name, not "Витя".
    assert first_view["speaker"]["name"]["ru"] == "Виктор"

    save_slot_id = first_view["saveSlot"]["id"]
    advance_response = await client.post(
        f"/api/play/save-slots/{save_slot_id}/advance",
        headers=auth_headers(player),
    )
    assert advance_response.status_code == 200
    second_view = advance_response.json()
    assert second_view["type"] == "DIALOGUE"
    # Auto-traversal ran through the EFFECT node, so the override is now active.
    assert second_view["speaker"]["name"]["ru"] == "Витя"


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
