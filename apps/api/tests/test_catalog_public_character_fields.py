"""Regression test: the public, unauthenticated catalog endpoint must never leak admin-only
character fields.

`CharacterOut` (app/schemas/responses.py) carries `first_name`/`last_name` for the admin panel,
but was previously reused directly by `StoryPublicDetailOut`, which backs
`GET /api/catalog/stories/{id}` - a route with no auth dependency at all, fetched by the mobile
app. The design spec is explicit these fields are admin-only, never player-visible. This test
locks down the narrower `CharacterPublicOut` shape that route must now use.
"""

import uuid

from app.models.content import Character, ContentStatus, Story


async def test_catalog_story_detail_omits_character_first_last_name(client, db_session):
    story = Story(
        slug=f"test-story-{uuid.uuid4().hex[:8]}",
        title={"ru": "Публичная история"},
        genre="ROMANCE",
        status=ContentStatus.PUBLISHED,
    )
    db_session.add(story)
    await db_session.flush()

    character = Character(
        story_id=story.id,
        name={"ru": "Алиса"},
        first_name="Алиса",
        last_name="Иванова",
        name_color="#E8B4BC",
        sprites={"neutral": "https://example.com/alice_neutral.png"},
        is_protagonist=True,
    )
    db_session.add(character)
    await db_session.commit()

    response = await client.get(f"/api/catalog/stories/{story.id}")

    assert response.status_code == 200
    body = response.json()
    assert len(body["characters"]) == 1
    character_out = body["characters"][0]

    assert "firstName" not in character_out
    assert "lastName" not in character_out
    # Sanity check the fields that *should* still be there weren't accidentally dropped too.
    assert character_out["name"]["ru"] == "Алиса"
    assert character_out["isProtagonist"] is True
