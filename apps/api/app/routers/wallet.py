from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AuthenticatedUser, get_current_user
from app.database import get_db
from app.schemas.responses import WalletOut
from app.services import wallet_service

router = APIRouter(prefix="/wallet", tags=["wallet"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=WalletOut)
async def get_wallet(
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await wallet_service.get_wallet(db, user.user_id)


@router.post("/daily-reward/claim")
async def claim_daily_reward(
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await wallet_service.claim_daily_reward(db, user.user_id)


@router.get("/transactions")
async def list_transactions(
    user: AuthenticatedUser = Depends(get_current_user),
    limit: int = Query(default=30, ge=1, le=100),
    before: datetime | None = Query(default=None, description="Вернуть операции старше этого момента"),
    db: AsyncSession = Depends(get_db),
):
    """The player's own spending/earning history, newest first."""
    return await wallet_service.list_transactions(db, user.user_id, limit=limit, before=before)
