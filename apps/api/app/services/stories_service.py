from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import Chapter, SceneNode, Season, Story
from app.models.enums import ContentStatus
from app.schemas.content import (
    ChapterCreateInput,
    ChapterUpdateInput,
    SeasonCreateInput,
    StoryCreateInput,
    StoryUpdateInput,
)
from app.services import qa_service

# --- Stories ---------------------------------------------------------------------------


async def list_all(db: AsyncSession) -> list[Story]:
    result = await db.scalars(select(Story).order_by(Story.created_at.desc()))
    return list(result)


async def list_published(db: AsyncSession, *, include_test: bool = False) -> list[Story]:
    query = select(Story).where(Story.status == ContentStatus.PUBLISHED)
    if not include_test:
        query = query.where(Story.is_test.is_(False))
    return list(await db.scalars(query.order_by(Story.created_at.desc())))


async def get_published_detail(db: AsyncSession, story_id: str, *, include_test: bool = False) -> Story:
    story = await db.scalar(
        select(Story)
        .where(Story.id == story_id, Story.status == ContentStatus.PUBLISHED)
        .options(
            selectinload(Story.seasons).selectinload(Season.chapters),
            selectinload(Story.characters),
        )
    )
    if not story or (story.is_test and not include_test):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "История не найдена")
    # Only expose published chapters to players, even within a published season.
    for season in story.seasons:
        season.chapters = [c for c in season.chapters if c.status == ContentStatus.PUBLISHED]
    return story


async def get_by_id(db: AsyncSession, story_id: str) -> Story:
    story = await db.scalar(
        select(Story)
        .where(Story.id == story_id)
        .options(
            selectinload(Story.seasons).selectinload(Season.chapters),
            selectinload(Story.characters),
            selectinload(Story.variable_definitions),
        )
    )
    if not story:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "История не найдена")
    return story


async def create(db: AsyncSession, data: StoryCreateInput) -> Story:
    story = Story(**data.model_dump())
    db.add(story)
    await db.commit()
    await db.refresh(story)
    return story


async def update(db: AsyncSession, story_id: str, data: StoryUpdateInput) -> Story:
    story = await _require_story(db, story_id)
    changes = data.model_dump(exclude_unset=True)
    # Status changes always go through set_status so the publication checks cannot be
    # skipped by sending `status` in a plain PATCH.
    new_status = changes.pop("status", None)
    for field, value in changes.items():
        setattr(story, field, value)
    await db.commit()
    if new_status is not None and new_status != story.status.value:
        return await set_status(db, story_id, ContentStatus(new_status))
    await db.refresh(story)
    return story


async def set_status(db: AsyncSession, story_id: str, new_status: ContentStatus) -> Story:
    story = await _require_story(db, story_id)
    if new_status == ContentStatus.PUBLISHED:
        published_chapters = await db.scalar(
            select(func.count())
            .select_from(Chapter)
            .join(Season, Chapter.season_id == Season.id)
            .where(Season.story_id == story.id, Chapter.status == ContentStatus.PUBLISHED)
        )
        if not published_chapters:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "В истории нет ни одной опубликованной главы — игрокам нечего будет читать",
            )
    story.status = new_status
    await db.commit()
    await db.refresh(story)
    return story


async def remove(db: AsyncSession, story_id: str) -> None:
    story = await _require_story(db, story_id)
    await db.delete(story)
    await db.commit()


# --- Seasons -----------------------------------------------------------------------------


async def create_season(db: AsyncSession, data: SeasonCreateInput) -> Season:
    season = Season(**data.model_dump())
    db.add(season)
    await db.commit()
    await db.refresh(season, ["chapters"])
    return season


async def remove_season(db: AsyncSession, season_id: str) -> None:
    season = await db.get(Season, season_id)
    if not season:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сезон не найден")
    await db.delete(season)
    await db.commit()


# --- Chapters ----------------------------------------------------------------------------


async def create_chapter(db: AsyncSession, data: ChapterCreateInput) -> Chapter:
    chapter = Chapter(**data.model_dump())
    db.add(chapter)
    await db.commit()
    await db.refresh(chapter)
    return chapter


async def get_chapter(db: AsyncSession, chapter_id: str) -> Chapter:
    chapter = await db.scalar(
        select(Chapter)
        .where(Chapter.id == chapter_id)
        .options(selectinload(Chapter.nodes).selectinload(SceneNode.choice_options))
    )
    if not chapter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Глава не найдена")
    chapter.nodes.sort(key=lambda n: n.order)
    for node in chapter.nodes:
        node.choice_options.sort(key=lambda o: o.order)
    return chapter


async def update_chapter(db: AsyncSession, chapter_id: str, data: ChapterUpdateInput) -> Chapter:
    chapter = await _require_chapter(db, chapter_id)
    changes = data.model_dump(exclude_unset=True)
    new_status = changes.pop("status", None)
    if changes.get("entry_node_id"):
        entry = await db.get(SceneNode, changes["entry_node_id"])
        if entry is None or entry.chapter_id != chapter.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Начальная сцена должна принадлежать этой главе")
    for field, value in changes.items():
        setattr(chapter, field, value)
    await db.commit()
    if new_status is not None and new_status != chapter.status.value:
        return await set_chapter_status(db, chapter_id, ContentStatus(new_status))
    await db.refresh(chapter)
    return chapter


async def set_chapter_status(db: AsyncSession, chapter_id: str, new_status: ContentStatus) -> Chapter:
    chapter = await _require_chapter(db, chapter_id)
    if new_status == ContentStatus.PUBLISHED:
        if not chapter.entry_node_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "У главы нет начальной сцены (entryNodeId) — нечего публиковать",
            )
        # Narrative QA gate: a chapter with broken links, dead ends or soft locks never
        # reaches players.
        await qa_service.require_publishable(db, chapter_id)
    chapter.status = new_status
    await db.commit()
    await db.refresh(chapter)
    return chapter


async def remove_chapter(db: AsyncSession, chapter_id: str) -> None:
    chapter = await _require_chapter(db, chapter_id)
    await db.delete(chapter)
    await db.commit()


# --- helpers -----------------------------------------------------------------------------


async def _require_story(db: AsyncSession, story_id: str) -> Story:
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "История не найдена")
    return story


async def _require_chapter(db: AsyncSession, chapter_id: str) -> Chapter:
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Глава не найдена")
    return chapter
