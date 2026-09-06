"""apps/api/app/services/payments_service.py

Buying HARD currency with real money via YooKassa. Two entry points: `create_purchase`
(player picks a package on the cabinet site) and `handle_webhook` (YooKassa notifies us a
payment succeeded).

The webhook NEVER credits currency based on its own request body - it re-fetches the payment
from YooKassa's API by id first (see yookassa_client.get_payment), so a forged or replayed
webhook can, at worst, make us re-check a real payment's real status - it cannot fabricate a
"succeeded" status for a payment it doesn't control. This is a standard integration pattern
for payment webhooks generally, not specific to YooKassa.
"""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.economy import Purchase
from app.models.enums import CurrencyCode, PurchaseStatus
from app.services import wallet_service, yookassa_client

# Illustrative package sizes/prices - the business will tune these numbers before launch,
# this is not a pricing engine, just a fixed lookup list.
CURRENCY_PACKAGES = [
    {"id": "hard_100", "currency": "HARD", "amount": 100, "price_rub_kopecks": 14900},
    {"id": "hard_550", "currency": "HARD", "amount": 550, "price_rub_kopecks": 74900},
    {"id": "hard_1200", "currency": "HARD", "amount": 1200, "price_rub_kopecks": 149000},
]

_PACKAGES_BY_ID = {p["id"]: p for p in CURRENCY_PACKAGES}


def list_packages() -> list[dict]:
    return CURRENCY_PACKAGES


async def create_purchase(db: AsyncSession, user_id: str, package_id: str) -> str:
    package = _PACKAGES_BY_ID.get(package_id)
    if not package:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Такого пакета не существует")

    purchase = Purchase(
        user_id=user_id,
        currency=CurrencyCode(package["currency"]),
        amount=package["amount"],
        price_rub_kopecks=package["price_rub_kopecks"],
        provider="yookassa",
        # Placeholder, replaced below once YooKassa responds - must be non-empty and unique
        # immediately since the column has a unique constraint and this row is flushed first.
        provider_payment_id=f"pending-{uuid.uuid4().hex}",
        status=PurchaseStatus.PENDING,
    )
    db.add(purchase)
    await db.flush()

    return_url = f"{settings.cabinet_base_url}/wallet?purchase={purchase.id}"
    try:
        payment = await yookassa_client.create_payment(
            amount_rub_kopecks=package["price_rub_kopecks"],
            description=f"Arcana: {package['amount']} {package['currency']}",
            return_url=return_url,
            idempotence_key=str(purchase.id),
        )
    except Exception as exc:
        purchase.status = PurchaseStatus.FAILED
        await db.commit()
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Не удалось начать оплату, попробуйте позже"
        ) from exc

    purchase.provider_payment_id = payment["id"]
    await db.commit()

    return payment["confirmation"]["confirmation_url"]


async def handle_webhook(db: AsyncSession, payment_id: str) -> None:
    purchase = await db.scalar(select(Purchase).where(Purchase.provider_payment_id == payment_id))
    if not purchase:
        # Unknown payment id - could be a replayed/stray webhook, or one from a different
        # environment. Nothing to do; the caller (the router) is responsible for still
        # returning 200 to YooKassa so it stops retrying.
        return

    if purchase.status == PurchaseStatus.COMPLETED:
        return  # Already processed - webhooks can be delivered more than once.

    real_payment = await yookassa_client.get_payment(payment_id)
    if real_payment.get("status") != "succeeded":
        return

    purchase.status = PurchaseStatus.COMPLETED
    purchase.completed_at = datetime.now(UTC)
    await wallet_service.grant_currency(
        db, str(purchase.user_id), purchase.currency, purchase.amount, reason=f"yookassa:{payment_id}"
    )
