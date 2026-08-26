from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AuthenticatedUser, get_current_user
from app.database import get_db
from app.schemas.auth import (
    AuthResponse,
    LoginInput,
    PublicUser,
    RefreshTokenInput,
    RegisterInput,
    TokenPair,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED
)
async def register(body: RegisterInput, db: AsyncSession = Depends(get_db)):
    return await auth_service.register(db, body)


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginInput, db: AsyncSession = Depends(get_db)):
    return await auth_service.login(db, body)


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshTokenInput, db: AsyncSession = Depends(get_db)):
    return await auth_service.refresh(db, body.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshTokenInput, db: AsyncSession = Depends(get_db)):
    await auth_service.logout(db, body.refresh_token)


@router.get("/me", response_model=PublicUser)
async def me(
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await auth_service.me(db, user.user_id)
