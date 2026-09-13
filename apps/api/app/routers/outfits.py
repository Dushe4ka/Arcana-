from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.database import get_db
from app.schemas.content import OutfitCreateInput, OutfitUpdateInput
from app.schemas.responses import OutfitOut
from app.services import outfits_service

router = APIRouter(
    prefix="/admin",
    tags=["admin:outfits"],
    dependencies=[Depends(require_roles("WRITER", "EDITOR", "ADMIN"))],
)


@router.get("/characters/{character_id}/outfits", response_model=list[OutfitOut])
async def list_outfits(character_id: str, db: AsyncSession = Depends(get_db)):
    return await outfits_service.list_for_character(db, character_id)


@router.post(
    "/characters/{character_id}/outfits", status_code=status.HTTP_201_CREATED, response_model=OutfitOut
)
async def create_outfit(character_id: str, body: OutfitCreateInput, db: AsyncSession = Depends(get_db)):
    return await outfits_service.create(db, character_id, body)


@router.patch("/outfits/{outfit_id}", response_model=OutfitOut)
async def update_outfit(outfit_id: str, body: OutfitUpdateInput, db: AsyncSession = Depends(get_db)):
    return await outfits_service.update(db, outfit_id, body)


@router.delete("/outfits/{outfit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_outfit(outfit_id: str, db: AsyncSession = Depends(get_db)):
    await outfits_service.remove(db, outfit_id)
