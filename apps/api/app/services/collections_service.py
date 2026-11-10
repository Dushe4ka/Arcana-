"""What a player has collected: endings reached and illustrations seen, per story.
Locked entries are listed (so the player sees how much is left) but never reveal their
title or image."""

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Chapter, SceneNode, Season, Story
from app.models.enums import ContentStatus, SceneNodeType
from app.models.player import PlayerCgUnlock, PlayerChapterCompletion, PlayerEndingUnlock, SaveSlot


def _cg_url(data: dict) -> str | None:
    return (data or {}).get("cgImageUrl") or (data or {}).get("cg_image_url") or None


async def get_collections(db: AsyncSession, user_id: str) -> list[dict]:
    story_ids = set(await db.scalars(select(SaveSlot.story_id).where(SaveSlot.user_id == user_id)))
    story_ids |= set(
        await db.scalars(select(PlayerEndingUnlock.story_id).where(PlayerEndingUnlock.user_id == user_id))
    )
    if not story_ids:
        return []

    stories = list(await db.scalars(select(Story).where(Story.id.in_(story_ids)).order_by(Story.created_at)))
    reached = {
        str(node_id)
        for node_id in await db.scalars(
            select(PlayerEndingUnlock.node_id).where(PlayerEndingUnlock.user_id == user_id)
        )
    }
    seen_cgs: dict[str, list[str]] = {}
    for unlock in await db.scalars(
        select(PlayerCgUnlock).where(PlayerCgUnlock.user_id == user_id).order_by(PlayerCgUnlock.unlocked_at)
    ):
        seen_cgs.setdefault(str(unlock.story_id), []).append(unlock.image_url)
    completed_chapters = set(
        await db.scalars(
            select(PlayerChapterCompletion.chapter_id).where(PlayerChapterCompletion.user_id == user_id)
        )
    )

    result = []
    for story in stories:
        published = (
            select(SceneNode, Chapter.index, Season.index, Chapter.id)
            .join(Chapter, SceneNode.chapter_id == Chapter.id)
            .join(Season, Chapter.season_id == Season.id)
            .where(Season.story_id == story.id, Chapter.status == ContentStatus.PUBLISHED)
        )
        ending_rows = (await db.execute(published.where(SceneNode.type == SceneNodeType.END))).all()
        endings = []
        for node, chapter_index, season_index, _ in sorted(ending_rows, key=lambda r: (r[2], r[1])):
            data = node.data or {}
            title = data.get("endingTitle") or data.get("ending_title")
            if not title:
                continue  # an untitled END is just "the chapter is over", not a collectible
            unlocked = str(node.id) in reached
            endings.append(
                {
                    "nodeId": str(node.id),
                    "seasonIndex": season_index,
                    "chapterIndex": chapter_index,
                    "unlocked": unlocked,
                    "title": title if unlocked else None,
                }
            )

        cg_filter = or_(
            SceneNode.data["cgImageUrl"].astext != "", SceneNode.data["cg_image_url"].astext != ""
        )
        cg_nodes = (
            await db.execute(published.where(SceneNode.type == SceneNodeType.DIALOGUE, cg_filter))
        ).all()
        all_cgs = {url for node, *_ in cg_nodes if (url := _cg_url(node.data))}
        unlocked_cgs = [url for url in seen_cgs.get(str(story.id), []) if url in all_cgs]

        chapter_total = await db.scalar(
            select(func.count())
            .select_from(Chapter)
            .join(Season, Chapter.season_id == Season.id)
            .where(Season.story_id == story.id, Chapter.status == ContentStatus.PUBLISHED)
        )
        chapter_ids = set(
            await db.scalars(
                select(Chapter.id)
                .join(Season, Chapter.season_id == Season.id)
                .where(Season.story_id == story.id)
            )
        )
        result.append(
            {
                "storyId": str(story.id),
                "storyTitle": story.title,
                "coverImageUrl": story.cover_image_url,
                "chaptersCompleted": len(chapter_ids & completed_chapters),
                "chaptersTotal": chapter_total or 0,
                "endings": endings,
                "illustrations": {"unlocked": unlocked_cgs, "total": len(all_cgs)},
            }
        )
    return result
