from app.schemas.content import StagedCharacter
from app.services import variables_service
from app.services.play_service import _resolve_staged_characters


async def test_resolve_staged_characters_uses_outfit_variable_for_sprite_key(
    make_user, make_chapter, db_session
):
    from app.models.content import Character, VariableDefinition
    from app.models.player import PlayerVariableValue

    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(
        story_id=story_id,
        name={"ru": "Ирис"},
        sprites={
            "dress_neutral": "https://example.test/dress.png",
            "neutral": "https://example.test/plain.png",
        },
    )
    db_session.add(character)
    await db_session.flush()

    outfit_def = VariableDefinition(
        story_id=story_id,
        key="outfit",
        label={"ru": "Наряд"},
        type="STRING",
        default_value="dress",
        character_id=character.id,
    )
    db_session.add(outfit_def)
    await db_session.flush()

    user = await make_user("player-wardrobe@example.com", role="PLAYER")
    db_session.add(PlayerVariableValue(user_id=user.id, variable_definition_id=outfit_def.id, value="dress"))
    await db_session.flush()

    context = await variables_service.load_context(db_session, str(user.id), str(story_id))
    staged = [StagedCharacter(character_id=str(character.id), sprite="neutral", position="center")]

    result = await _resolve_staged_characters(db_session, str(story_id), staged, context)

    assert result[0]["spriteUrl"] == "https://example.test/dress.png"


async def test_resolve_staged_characters_falls_back_to_plain_sprite_without_outfit(
    make_user, make_chapter, db_session
):
    from app.models.content import Character

    chapter = await make_chapter()
    story_id = chapter.season.story_id

    character = Character(
        story_id=story_id, name={"ru": "Данте"}, sprites={"neutral": "https://example.test/dante.png"}
    )
    db_session.add(character)
    await db_session.flush()

    user = await make_user("player-no-wardrobe@example.com", role="PLAYER")
    context = await variables_service.load_context(db_session, str(user.id), str(story_id))
    staged = [StagedCharacter(character_id=str(character.id), sprite="neutral", position="center")]

    result = await _resolve_staged_characters(db_session, str(story_id), staged, context)

    assert result[0]["spriteUrl"] == "https://example.test/dante.png"
