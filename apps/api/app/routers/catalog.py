from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.responses import StoryOut, StoryPublicDetailOut
from app.services import stories_service

# Public, read-only story catalog consumed by the mobile app. No auth required to browse.
router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/stories", response_model=list[StoryOut])
async def list_stories(db: AsyncSession = Depends(get_db)):
    return await stories_service.list_published(db)


@router.get("/stories/{story_id}", response_model=StoryPublicDetailOut)
async def get_story(story_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.get_published_detail(db, story_id)
