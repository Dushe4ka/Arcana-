from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services import payments_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/yookassa", status_code=status.HTTP_204_NO_CONTENT)
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        body = await request.json()
    except Exception:
        return  # Malformed body - can't do anything with it, but must still ack so YooKassa
        # doesn't retry forever. Genuine YooKassa notifications are always valid JSON.

    if not isinstance(body, dict):
        return

    event = body.get("event")
    obj = body.get("object")
    payment_id = obj.get("id") if isinstance(obj, dict) else None
    if event == "payment.succeeded" and payment_id:
        await payments_service.handle_webhook(db, payment_id)
    # Always 204 regardless of what handle_webhook did - YooKassa only needs acknowledgement
    # that we received the notification; it retries on anything other than a 2xx.
