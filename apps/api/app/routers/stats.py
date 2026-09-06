from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AuthenticatedUser, get_current_user
from app.database import get_db
from app.schemas.stats import StoryStatsOut
from app.services import stats_service

router = APIRouter(prefix="/me", tags=["me:stats"], dependencies=[Depends(get_current_user)])


@router.get("/stats", response_model=list[StoryStatsOut])
async def get_my_stats(
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await stats_service.get_my_stats(db, user.user_id)
