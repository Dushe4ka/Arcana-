from fastapi import HTTPException, status
from sqlalchemy import select
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

# --- Stories ---------------------------------------------------------------------------


async def list_all(db: AsyncSession) -> list[Story]:
    result = await db.scalars(select(Story).order_by(Story.created_at.desc()))
    return list(result)


async def list_published(db: AsyncSession) -> list[Story]:
    result = await db.scalars(
        select(Story)
        .where(Story.status == ContentStatus.PUBLISHED)
        .order_by(Story.created_at.desc())
    )
    return list(result)


async def get_published_detail(db: AsyncSession, story_id: str) -> Story:
    story = await db.scalar(
        select(Story)
        .where(Story.id == story_id, Story.status == ContentStatus.PUBLISHED)
        .options(
            selectinload(Story.seasons).selectinload(Season.chapters),
            selectinload(Story.characters),
        )
    )
    if not story:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "История не найдена")
    # Only expose published chapters to players, even within a published season.
    for season in story.seasons:
        season.chapters = [
            c for c in season.chapters if c.status == ContentStatus.PUBLISHED
        ]
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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(story, field, value)
    await db.commit()
    await db.refresh(story)
    return story


async def set_status(
    db: AsyncSession, story_id: str, new_status: ContentStatus
) -> Story:
    story = await _require_story(db, story_id)
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
    await db.refresh(season)
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


async def update_chapter(
    db: AsyncSession, chapter_id: str, data: ChapterUpdateInput
) -> Chapter:
    chapter = await _require_chapter(db, chapter_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(chapter, field, value)
    await db.commit()
    await db.refresh(chapter)
    return chapter


async def set_chapter_status(
    db: AsyncSession, chapter_id: str, new_status: ContentStatus
) -> Chapter:
    chapter = await _require_chapter(db, chapter_id)
    if new_status == ContentStatus.PUBLISHED and not chapter.entry_node_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "У главы нет начальной сцены (entryNodeId) — нечего публиковать",
        )
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
