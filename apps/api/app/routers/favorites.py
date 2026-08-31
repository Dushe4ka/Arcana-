from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AuthenticatedUser, get_current_user
from app.database import get_db
from app.schemas.responses import StoryOut
from app.services import favorites_service

router = APIRouter(prefix="/favorites", tags=["favorites"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[StoryOut])
async def list_favorites(
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await favorites_service.list_favorite_stories(db, user.user_id)


@router.post("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_favorite(
    story_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await favorites_service.add(db, user.user_id, story_id)


@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(
    story_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await favorites_service.remove(db, user.user_id, story_id)
