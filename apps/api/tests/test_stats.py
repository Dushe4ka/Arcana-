from app.models.content import Character, VariableDefinition
from app.models.player import PlayerVariableValue, SaveSlot


async def test_my_stats_splits_relationships_and_general(client, make_user, auth_headers, make_chapter, db_session):
    user = await make_user("stats-player@example.com")
    headers = auth_headers(user)
    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(story_id=story_id, name={"ru": "Ирис"}, name_color="#FF00FF")
    db_session.add(character)
    await db_session.flush()

    relationship_def = VariableDefinition(
        story_id=story_id,
        key="affection",
        label={"ru": "Привязанность"},
        type="NUMBER",
        default_value=0,
        character_id=character.id,
        min_value=0,
        max_value=100,
    )
    general_def = VariableDefinition(
        story_id=story_id,
        key="chapter_visited_library",
        label={"ru": "Посетил библиотеку"},
        type="BOOLEAN",
        default_value=False,
    )
    db_session.add_all([relationship_def, general_def])
    await db_session.flush()

    db_session.add(
        PlayerVariableValue(user_id=user.id, variable_definition_id=relationship_def.id, value=42)
    )
    db_session.add(SaveSlot(user_id=user.id, story_id=story_id, slot_index=0, chapter_id=chapter.id))
    await db_session.commit()

    response = await client.get("/api/me/stats", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    story_stats = body[0]
    assert story_stats["storyId"] == str(story_id)

    assert len(story_stats["relationships"]) == 1
    relationship = story_stats["relationships"][0]
    assert relationship["characterId"] == str(character.id)
    assert relationship["value"] == 42
    assert relationship["maxValue"] == 100

    assert len(story_stats["general"]) == 1
    general = story_stats["general"][0]
    assert general["variableKey"] == "chapter_visited_library"
    assert general["value"] is False  # untouched PlayerVariableValue -> falls back to default_value


async def test_my_stats_excludes_stories_with_no_progress(client, make_user, auth_headers, make_chapter):
    user = await make_user("stats-no-progress@example.com")
    headers = auth_headers(user)
    await make_chapter()  # a story exists, but this user has no SaveSlot for it

    response = await client.get("/api/me/stats", headers=headers)
    assert response.status_code == 200
    assert response.json() == []
