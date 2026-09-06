from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services import payments_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/yookassa", status_code=status.HTTP_204_NO_CONTENT)
async def yookassa_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    event = body.get("event")
    payment_id = body.get("object", {}).get("id")
    if event == "payment.succeeded" and payment_id:
        await payments_service.handle_webhook(db, payment_id)
    # Always 204 regardless of what handle_webhook did - YooKassa only needs acknowledgement
    # that we received the notification; it retries on anything other than a 2xx.
