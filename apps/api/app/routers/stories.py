from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.database import get_db
from app.models.enums import ContentStatus
from app.schemas.content import (
    ChapterCreateInput,
    ChapterUpdateInput,
    SeasonCreateInput,
    StoryCreateInput,
    StoryUpdateInput,
)
from app.schemas.responses import (
    ChapterDetailOut,
    ChapterOut,
    SeasonOut,
    StoryDetailOut,
    StoryOut,
)
from app.services import stories_service

# Content-authoring endpoints for the admin panel. Every route here requires a
# WRITER/EDITOR/ADMIN account - players never touch this router.
router = APIRouter(
    prefix="/admin",
    tags=["admin:stories"],
    dependencies=[Depends(require_roles("WRITER", "EDITOR", "ADMIN"))],
)


@router.get("/stories", response_model=list[StoryOut])
async def list_stories(db: AsyncSession = Depends(get_db)):
    return await stories_service.list_all(db)


@router.get("/stories/{story_id}", response_model=StoryDetailOut)
async def get_story(story_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.get_by_id(db, story_id)


@router.post("/stories", status_code=status.HTTP_201_CREATED, response_model=StoryOut)
async def create_story(body: StoryCreateInput, db: AsyncSession = Depends(get_db)):
    return await stories_service.create(db, body)


@router.patch("/stories/{story_id}", response_model=StoryOut)
async def update_story(
    story_id: str, body: StoryUpdateInput, db: AsyncSession = Depends(get_db)
):
    return await stories_service.update(db, story_id, body)


@router.post("/stories/{story_id}/publish", response_model=StoryOut)
async def publish_story(story_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.set_status(db, story_id, ContentStatus.PUBLISHED)


@router.post("/stories/{story_id}/unpublish", response_model=StoryOut)
async def unpublish_story(story_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.set_status(db, story_id, ContentStatus.DRAFT)


@router.delete("/stories/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_story(story_id: str, db: AsyncSession = Depends(get_db)):
    await stories_service.remove(db, story_id)


@router.post("/seasons", status_code=status.HTTP_201_CREATED, response_model=SeasonOut)
async def create_season(body: SeasonCreateInput, db: AsyncSession = Depends(get_db)):
    return await stories_service.create_season(db, body)


@router.delete("/seasons/{season_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_season(season_id: str, db: AsyncSession = Depends(get_db)):
    await stories_service.remove_season(db, season_id)


@router.get("/chapters/{chapter_id}", response_model=ChapterDetailOut)
async def get_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.get_chapter(db, chapter_id)


@router.post(
    "/chapters", status_code=status.HTTP_201_CREATED, response_model=ChapterOut
)
async def create_chapter(body: ChapterCreateInput, db: AsyncSession = Depends(get_db)):
    return await stories_service.create_chapter(db, body)


@router.patch("/chapters/{chapter_id}", response_model=ChapterOut)
async def update_chapter(
    chapter_id: str, body: ChapterUpdateInput, db: AsyncSession = Depends(get_db)
):
    return await stories_service.update_chapter(db, chapter_id, body)


@router.post("/chapters/{chapter_id}/publish", response_model=ChapterOut)
async def publish_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.set_chapter_status(
        db, chapter_id, ContentStatus.PUBLISHED
    )


@router.post("/chapters/{chapter_id}/unpublish", response_model=ChapterOut)
async def unpublish_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    return await stories_service.set_chapter_status(db, chapter_id, ContentStatus.DRAFT)


@router.delete("/chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    await stories_service.remove_chapter(db, chapter_id)
