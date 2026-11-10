"""Content analytics for the team: how far players get and what they choose.

Everything here is aggregate and derived from facts the game already records to work at all
(chapter unlocks, completions, one "has picked" row per player per option). No per-event
tracking, no device data, nothing a player would need to consent to separately."""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import Chapter, PublishedNode, Season, Story
from app.models.player import PlayerChapterCompletion, PlayerChapterUnlock, PlayerChoicePick


async def _counts(db: AsyncSession, model, column, ids) -> dict:
    if not ids:
        return {}
    rows = await db.execute(select(column, func.count()).where(column.in_(ids)).group_by(column))
    return {key: count for key, count in rows.all()}


async def story_analytics(db: AsyncSession, story_id: str) -> dict:
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "История не найдена")
    chapters = list(
        await db.scalars(
            select(Chapter)
            .join(Season, Chapter.season_id == Season.id)
            .where(Season.story_id == story.id)
            .options(selectinload(Chapter.season))
        )
    )
    chapters.sort(key=lambda c: (c.season.index, c.index))
    chapter_ids = [c.id for c in chapters]
    started = await _counts(db, PlayerChapterUnlock, PlayerChapterUnlock.chapter_id, chapter_ids)
    completed = await _counts(db, PlayerChapterCompletion, PlayerChapterCompletion.chapter_id, chapter_ids)

    choice_nodes = (
        list(
            await db.scalars(
                select(PublishedNode)
                .join(Chapter, Chapter.id == PublishedNode.chapter_id)
                .where(
                    PublishedNode.chapter_id.in_(chapter_ids),
                    PublishedNode.version == Chapter.published_version,
                    PublishedNode.type == "CHOICE",
                )
            )
        )
        if chapter_ids
        else []
    )
    option_ids = [o["id"] for node in choice_nodes for o in node.options or []]
    picks = await _counts(db, PlayerChoicePick, PlayerChoicePick.choice_option_id, option_ids)
    picks = {str(key): count for key, count in picks.items()}

    choices_by_chapter: dict = {}
    for node in choice_nodes:
        options = node.options or []
        total = sum(picks.get(o["id"], 0) for o in options)
        choices_by_chapter.setdefault(node.chapter_id, []).append(
            {
                "nodeId": str(node.node_id),
                "prompt": (node.data or {}).get("prompt"),
                "players": total,
                "options": [
                    {
                        "optionId": o["id"],
                        "text": o["text"],
                        "paid": bool(o.get("costCurrency")) and (o.get("costAmount") or 0) > 0,
                        "players": picks.get(o["id"], 0),
                        "percent": round(100 * picks.get(o["id"], 0) / total) if total else 0,
                    }
                    for o in options
                ],
            }
        )

    first_started = started.get(chapter_ids[0], 0) if chapter_ids else 0
    return {
        "storyId": str(story.id),
        "chapters": [
            {
                "chapterId": str(c.id),
                "seasonIndex": c.season.index,
                "chapterIndex": c.index,
                "title": c.title,
                "status": c.status.value,
                "started": started.get(c.id, 0),
                "completed": completed.get(c.id, 0),
                "completionPercent": round(100 * completed.get(c.id, 0) / started[c.id])
                if started.get(c.id)
                else 0,
                # Share of the story's first-chapter audience that reached this chapter.
                "reachPercent": round(100 * started.get(c.id, 0) / first_started) if first_started else 0,
                "choices": choices_by_chapter.get(c.id, []),
            }
            for c in chapters
        ],
    }
