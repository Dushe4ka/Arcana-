from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import STAFF_ROLES, AuthenticatedUser, get_optional_user
from app.database import get_db
from app.schemas.responses import StoryOut, StoryPublicDetailOut
from app.services import stories_service

# Public, read-only story catalog consumed by the mobile app. No auth required to browse.
router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/stories", response_model=list[StoryOut])
async def list_stories(
    user: AuthenticatedUser | None = Depends(get_optional_user), db: AsyncSession = Depends(get_db)
):
    return await stories_service.list_published(db, include_test=_is_staff(user))


@router.get("/stories/{story_id}", response_model=StoryPublicDetailOut)
async def get_story(
    story_id: str,
    user: AuthenticatedUser | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    return await stories_service.get_published_detail(db, story_id, include_test=_is_staff(user))


def _is_staff(user: AuthenticatedUser | None) -> bool:
    # Technical test stories (Story.is_test) are visible only to the team.
    return user is not None and user.role in STAFF_ROLES
