"""ADMIN-only staff account management - lets an ADMIN create WRITER/EDITOR/ADMIN accounts
from the admin panel instead of hand-editing the database or seed.py. PLAYER accounts are
never created here - they go through the public POST /auth/register."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.database import get_db
from app.schemas.auth import CreateStaffUserInput, PublicUser
from app.services import auth_service

router = APIRouter(prefix="/admin", tags=["admin:staff"], dependencies=[Depends(require_roles("ADMIN"))])


@router.get("/users", response_model=list[PublicUser])
async def list_staff_users(db: AsyncSession = Depends(get_db)):
    return await auth_service.list_staff_users(db)


@router.post("/users", status_code=status.HTTP_201_CREATED, response_model=PublicUser)
async def create_staff_user(body: CreateStaffUserInput, db: AsyncSession = Depends(get_db)):
    return await auth_service.create_staff_user(db, body)
