"""Regression test for DELETE /api/admin/stories/{id}.

`Chapter.entry_node_id` is a self-referential FK into `scene_nodes` while `scene_nodes.chapter_id`
points back at `chapters`. Without `post_update=True` on the `Chapter.entry_node` relationship
(app/models/content.py), SQLAlchemy can't order the DELETEs for a chapter that has an entry node
and raises `CircularDependencyError` - which also broke this endpoint, not just the narrower
Chapter/SceneNode delete. This test locks the whole-story delete path down.
"""

import uuid

from sqlalchemy import select

from app.models.content import Chapter, SceneNode, Season, Story


async def test_delete_story_with_chapter_entry_node_returns_204(client, make_user, auth_headers, db_session):
    story = Story(
        slug=f"test-story-{uuid.uuid4().hex[:8]}",
        title={"ru": "История на удаление"},
        genre="ROMANCE",
    )
    db_session.add(story)
    await db_session.flush()

    season = Season(story_id=story.id, index=1, title={"ru": "Сезон 1"})
    db_session.add(season)
    await db_session.flush()

    chapter = Chapter(
        season_id=season.id,
        index=1,
        title={"ru": "Глава 1"},
        status="DRAFT",
        unlock_cost=0,
    )
    db_session.add(chapter)
    await db_session.flush()

    node = SceneNode(
        chapter_id=chapter.id,
        type="DIALOGUE",
        order=0,
        data={"text": {"ru": "Привет"}},
    )
    db_session.add(node)
    await db_session.flush()

    chapter.entry_node_id = node.id
    await db_session.commit()

    story_id = story.id
    writer = await make_user("writer-delete-story@example.com", role="WRITER")

    response = await client.delete(
        f"/api/admin/stories/{story_id}",
        headers=auth_headers(writer),
    )

    assert response.status_code == 204

    db_session.expire_all()
    assert (await db_session.get(Story, story_id)) is None
    assert (
        await db_session.execute(select(Season).where(Season.story_id == story_id))
    ).scalars().first() is None
    assert (
        await db_session.execute(select(Chapter).where(Chapter.id == chapter.id))
    ).scalars().first() is None
    assert (
        await db_session.execute(select(SceneNode).where(SceneNode.id == node.id))
    ).scalars().first() is None
