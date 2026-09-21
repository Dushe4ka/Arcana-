from app.models.content import ChoiceOption, SceneNode, VariableDefinition
from app.models.enums import SceneNodeType

NONEXISTENT_STORY_ID = "00000000-0000-0000-0000-000000000000"


async def test_variable_usage_across_seasons(client, make_user, auth_headers, make_story, db_session):
    writer = await make_user("writer-varusage@example.com", role="WRITER")
    story = await make_story()

    definition = VariableDefinition(
        story_id=story.id,
        key="spared_villain",
        label={"ru": "Пощадил злодея"},
        type="BOOLEAN",
        default_value=False,
        character_id=None,
    )
    db_session.add(definition)
    await db_session.flush()

    # Season 1 / chapter 5: an EFFECT node that SETs the variable.
    from app.models.content import Chapter, Season

    season1 = Season(story_id=story.id, index=1, title={"ru": "Сезон 1"})
    db_session.add(season1)
    await db_session.flush()
    chapter5 = Chapter(season_id=season1.id, index=5, title={"ru": "Серия 5"})
    db_session.add(chapter5)
    await db_session.flush()
    effect_node = SceneNode(
        chapter_id=chapter5.id,
        type=SceneNodeType.EFFECT,
        order=0,
        data={
            "effects": [{"variableKey": "spared_villain", "characterId": None, "op": "SET", "value": True}]
        },
    )
    db_session.add(effect_node)

    # Season 2 / chapter 4: a CONDITION node that reads it, plus a CHOICE option that also reads
    # it via visibleWhen, and one that sets a *different* effect (should not appear as a usage
    # for THIS definition).
    season2 = Season(story_id=story.id, index=2, title={"ru": "Сезон 2"})
    db_session.add(season2)
    await db_session.flush()
    chapter4 = Chapter(season_id=season2.id, index=4, title={"ru": "Серия 4"})
    db_session.add(chapter4)
    await db_session.flush()
    condition_node = SceneNode(
        chapter_id=chapter4.id,
        type=SceneNodeType.CONDITION,
        order=0,
        data={
            "when": [
                {"variableKey": "spared_villain", "characterId": None, "operator": "EQUALS", "value": True}
            ],
            "thenNodeId": None,
            "elseNodeId": None,
        },
    )
    db_session.add(condition_node)
    choice_node = SceneNode(chapter_id=chapter4.id, type=SceneNodeType.CHOICE, order=1, data={})
    db_session.add(choice_node)
    await db_session.flush()
    reading_option = ChoiceOption(
        node_id=choice_node.id,
        order=0,
        text={"ru": "..."},
        visible_when=[
            {"variableKey": "spared_villain", "characterId": None, "operator": "EQUALS", "value": True}
        ],
        effects=[],
        next_node_id=None,
    )
    unrelated_option = ChoiceOption(
        node_id=choice_node.id,
        order=1,
        text={"ru": "..."},
        visible_when=[],
        effects=[{"variableKey": "other_var", "characterId": None, "op": "SET", "value": 1}],
        next_node_id=None,
    )
    db_session.add_all([reading_option, unrelated_option])
    await db_session.commit()

    response = await client.get(
        f"/api/admin/stories/{story.id}/variable-usages", headers=auth_headers(writer)
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    entry = body[0]
    assert entry["definition"]["key"] == "spared_villain"

    usages = entry["usages"]
    assert len(usages) == 3  # EFFECT sets it, CONDITION reads it, one CHOICE option reads it
    by_role = {"sets": 0, "reads": 0}
    for usage in usages:
        by_role[usage["role"]] += 1
    assert by_role == {"sets": 1, "reads": 2}

    sets_entry = next(u for u in usages if u["role"] == "sets")
    assert sets_entry["seasonIndex"] == 1
    assert sets_entry["chapterIndex"] == 5
    assert sets_entry["nodeId"] == str(effect_node.id)
    assert sets_entry["nodeType"] == "EFFECT"

    reads_entries = [u for u in usages if u["role"] == "reads"]
    assert {u["seasonIndex"] for u in reads_entries} == {2}
    assert {u["chapterIndex"] for u in reads_entries} == {4}
    assert {u["nodeType"] for u in reads_entries} == {"CONDITION", "CHOICE"}


async def test_variable_usage_empty_story_returns_empty_list(client, make_user, auth_headers, make_story):
    writer = await make_user("writer-varusage-empty@example.com", role="WRITER")
    story = await make_story()

    response = await client.get(
        f"/api/admin/stories/{story.id}/variable-usages", headers=auth_headers(writer)
    )
    assert response.status_code == 200
    assert response.json() == []


async def test_variable_usage_definition_with_zero_usages_still_listed(
    client, make_user, auth_headers, make_story, db_session
):
    writer = await make_user("writer-varusage-unused@example.com", role="WRITER")
    story = await make_story()
    definition = VariableDefinition(
        story_id=story.id,
        key="never_used",
        label={"ru": "Пока нигде не используется"},
        type="NUMBER",
        default_value=0,
        character_id=None,
    )
    db_session.add(definition)
    await db_session.commit()

    response = await client.get(
        f"/api/admin/stories/{story.id}/variable-usages", headers=auth_headers(writer)
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["definition"]["key"] == "never_used"
    assert body[0]["usages"] == []


async def test_variable_usage_nonexistent_story_returns_404(client, make_user, auth_headers):
    writer = await make_user("writer-varusage-404@example.com", role="WRITER")

    response = await client.get(
        f"/api/admin/stories/{NONEXISTENT_STORY_ID}/variable-usages", headers=auth_headers(writer)
    )
    assert response.status_code == 404
    body = response.json()
    assert body["message"] == "История не найдена"
    assert body["statusCode"] == 404


async def test_variable_usage_character_scoped_normalization(
    client, make_user, auth_headers, make_story, make_character, db_session
):
    """Regression test: VariableDefinition.character_id is a uuid.UUID | None column, while
    Effect.character_id / Condition.character_id are plain strings inside JSONB. The service
    must normalize the UUID to str before comparing (key, character_id) pairs - getting this
    wrong (comparing a UUID object against a str) makes every character-scoped variable's
    usage list silently empty, and this is exactly what this test would catch.
    """
    writer = await make_user("writer-varusage-charscope@example.com", role="WRITER")
    story = await make_story()
    character = await make_character(story, name={"ru": "Алекс"})
    other_character = await make_character(story, name={"ru": "Джордан"})

    definition = VariableDefinition(
        story_id=story.id,
        key="charm",
        label={"ru": "Обаяние"},
        type="NUMBER",
        default_value=0,
        character_id=character.id,
    )
    other_definition = VariableDefinition(
        story_id=story.id,
        key="charm",
        label={"ru": "Обаяние"},
        type="NUMBER",
        default_value=0,
        character_id=other_character.id,
    )
    db_session.add_all([definition, other_definition])
    await db_session.flush()

    from app.models.content import Chapter, Season

    season = Season(story_id=story.id, index=1, title={"ru": "Сезон 1"})
    db_session.add(season)
    await db_session.flush()
    chapter = Chapter(season_id=season.id, index=1, title={"ru": "Серия 1"})
    db_session.add(chapter)
    await db_session.flush()
    effect_node = SceneNode(
        chapter_id=chapter.id,
        type=SceneNodeType.EFFECT,
        order=0,
        data={
            "effects": [{"variableKey": "charm", "characterId": str(character.id), "op": "SET", "value": 5}]
        },
    )
    db_session.add(effect_node)
    await db_session.commit()

    response = await client.get(
        f"/api/admin/stories/{story.id}/variable-usages", headers=auth_headers(writer)
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2

    matched_entry = next(e for e in body if e["definition"]["characterId"] == str(character.id))
    assert len(matched_entry["usages"]) == 1
    assert matched_entry["usages"][0]["role"] == "sets"
    assert matched_entry["usages"][0]["nodeId"] == str(effect_node.id)

    unmatched_entry = next(e for e in body if e["definition"]["characterId"] == str(other_character.id))
    assert unmatched_entry["usages"] == []
