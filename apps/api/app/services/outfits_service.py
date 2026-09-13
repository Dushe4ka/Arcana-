from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Outfit
from app.schemas.content import OutfitCreateInput, OutfitUpdateInput


async def list_for_character(db: AsyncSession, character_id: str) -> list[Outfit]:
    result = await db.scalars(select(Outfit).where(Outfit.character_id == character_id))
    return list(result)


async def create(db: AsyncSession, character_id: str, data: OutfitCreateInput) -> Outfit:
    outfit = Outfit(character_id=character_id, **data.model_dump())
    db.add(outfit)
    await db.commit()
    await db.refresh(outfit)
    return outfit


async def update(db: AsyncSession, outfit_id: str, data: OutfitUpdateInput) -> Outfit:
    outfit = await db.get(Outfit, outfit_id)
    if not outfit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Наряд не найден")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(outfit, field, value)
    await db.commit()
    await db.refresh(outfit)
    return outfit


async def remove(db: AsyncSession, outfit_id: str) -> None:
    outfit = await db.get(Outfit, outfit_id)
    if not outfit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Наряд не найден")
    await db.delete(outfit)
    await db.commit()
