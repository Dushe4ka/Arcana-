from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.player import SaveSlot


async def list_for_story(
    db: AsyncSession, user_id: str, story_id: str
) -> list[SaveSlot]:
    result = await db.scalars(
        select(SaveSlot)
        .where(SaveSlot.user_id == user_id, SaveSlot.story_id == story_id)
        .options(selectinload(SaveSlot.chapter))
        .order_by(SaveSlot.slot_index)
    )
    return list(result)


async def list_all_for_user(db: AsyncSession, user_id: str) -> list[SaveSlot]:
    """All in-progress saves across every story, for a "continue reading" list on the home screen."""
    result = await db.scalars(
        select(SaveSlot)
        .where(SaveSlot.user_id == user_id)
        .options(selectinload(SaveSlot.chapter), selectinload(SaveSlot.story))
        .order_by(SaveSlot.updated_at.desc())
    )
    return list(result)


async def remove(db: AsyncSession, user_id: str, save_slot_id: str) -> None:
    slot = await db.get(SaveSlot, save_slot_id)
    if not slot or str(slot.user_id) != str(user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сохранение не найдено")
    await db.delete(slot)
    await db.commit()
