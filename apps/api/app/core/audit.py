"""Audit trail for the admin panel: one row per state-changing /api/admin request."""

import logging

from fastapi import Request

from app.core.security import decode_access_token
from app.database import SessionLocal
from app.models.user import AdminAuditLog

logger = logging.getLogger("arcana.audit")
# Switched off by the test suite's shared-transaction fixtures (rows written here go through
# a separate connection and would reference users that were never committed).
enabled = True
_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
# Read-only helpers that happen to use POST.
_NOT_A_CHANGE = ("/api/admin/preview/", "/import/preview", "/import/extract-text")


def should_audit(request: Request) -> bool:
    path = request.url.path
    return (
        enabled
        and request.method in _MUTATING
        and path.startswith("/api/admin/")
        and not any(marker in path for marker in _NOT_A_CHANGE)
    )


async def record(request: Request, status_code: int, session_factory=None) -> None:
    """Never raises: a failure to write the audit row must not fail the request it describes."""
    try:
        header = request.headers.get("authorization", "")
        payload = decode_access_token(header[7:]) if header.lower().startswith("bearer ") else None
        if payload is None:
            return  # unauthenticated attempts are rejected upstream and are not "admin actions"
        async with (session_factory or SessionLocal)() as db:
            db.add(
                AdminAuditLog(
                    user_id=payload["sub"],
                    user_email=payload.get("email", ""),
                    method=request.method,
                    path=request.url.path[:500],
                    status_code=status_code,
                )
            )
            await db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("Could not write admin audit log entry")
