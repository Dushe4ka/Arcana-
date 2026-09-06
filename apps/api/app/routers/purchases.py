from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AuthenticatedUser, get_current_user
from app.database import get_db
from app.schemas.payments import CreatePurchaseInput, CreatePurchaseOut, PackageOut
from app.services import payments_service

router = APIRouter(prefix="/me", tags=["me:purchases"], dependencies=[Depends(get_current_user)])


@router.get("/purchases/packages", response_model=list[PackageOut])
async def list_packages():
    return payments_service.list_packages()


@router.post("/purchases", response_model=CreatePurchaseOut)
async def create_purchase(
    body: CreatePurchaseInput,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url = await payments_service.create_purchase(db, user.user_id, body.package_id)
    return CreatePurchaseOut(confirmation_url=url)
