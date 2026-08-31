from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Story
from app.models.enums import ContentStatus
from app.models.player import Favorite


async def list_favorite_stories(db: AsyncSession, user_id: str) -> list[Story]:
    """Favorited stories, most recently favorited first - drops any story that's since been
    unpublished, matching what the public catalog would show."""
    result = await db.scalars(
        select(Story)
        .join(Favorite, Favorite.story_id == Story.id)
        .where(Favorite.user_id == user_id, Story.status == ContentStatus.PUBLISHED)
        .order_by(Favorite.created_at.desc())
    )
    return list(result)


async def add(db: AsyncSession, user_id: str, story_id: str) -> None:
    existing = await db.scalar(
        select(Favorite).where(Favorite.user_id == user_id, Favorite.story_id == story_id)
    )
    if existing:
        return
    db.add(Favorite(user_id=user_id, story_id=story_id))
    await db.commit()


async def remove(db: AsyncSession, user_id: str, story_id: str) -> None:
    existing = await db.scalar(
        select(Favorite).where(Favorite.user_id == user_id, Favorite.story_id == story_id)
    )
    if not existing:
        return
    await db.delete(existing)
    await db.commit()
