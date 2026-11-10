"""ADMIN-only staff account management - lets an ADMIN create WRITER/EDITOR/ADMIN accounts
from the admin panel instead of hand-editing the database or seed.py. PLAYER accounts are
never created here - they go through the public POST /auth/register."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.database import get_db
from app.models.user import AdminAuditLog
from app.schemas.auth import CreateStaffUserInput, PublicUser, ResetPasswordInput
from app.services import auth_service

router = APIRouter(prefix="/admin", tags=["admin:staff"], dependencies=[Depends(require_roles("ADMIN"))])


@router.get("/users", response_model=list[PublicUser])
async def list_staff_users(db: AsyncSession = Depends(get_db)):
    return await auth_service.list_staff_users(db)


@router.post("/users", status_code=status.HTTP_201_CREATED, response_model=PublicUser)
async def create_staff_user(body: CreateStaffUserInput, db: AsyncSession = Depends(get_db)):
    return await auth_service.create_staff_user(db, body)


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_staff_password(user_id: str, body: ResetPasswordInput, db: AsyncSession = Depends(get_db)):
    await auth_service.admin_reset_password(db, user_id, body.new_password)


@router.get("/audit-log")
async def audit_log(limit: int = Query(default=100, ge=1, le=500), db: AsyncSession = Depends(get_db)):
    """Latest state-changing actions made in the admin panel, newest first."""
    rows = await db.scalars(select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit))
    return [
        {
            "id": str(r.id),
            "userEmail": r.user_email,
            "method": r.method,
            "path": r.path,
            "statusCode": r.status_code,
            "createdAt": r.created_at.isoformat(),
        }
        for r in rows
    ]
