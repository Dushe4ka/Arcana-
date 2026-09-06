"""apps/api/app/services/yookassa_client.py

Thin wrapper around the two YooKassa REST API calls this backend needs
(https://yookassa.ru/developers/api): create a payment (returns a hosted-checkout URL) and
fetch a payment's current status by id. The status fetch exists specifically so
payments_service can verify a webhook against the real source of truth instead of trusting
the webhook's own request body - see that module's docstring.
"""

import httpx

from app.config import settings

BASE_URL = "https://api.yookassa.ru/v3"


async def create_payment(
    *, amount_rub_kopecks: int, description: str, return_url: str, idempotence_key: str
) -> dict:
    async with httpx.AsyncClient(auth=(settings.yookassa_shop_id, settings.yookassa_secret_key)) as client:
        response = await client.post(
            f"{BASE_URL}/payments",
            headers={"Idempotence-Key": idempotence_key},
            json={
                "amount": {"value": f"{amount_rub_kopecks / 100:.2f}", "currency": "RUB"},
                "confirmation": {"type": "redirect", "return_url": return_url},
                "capture": True,
                "description": description,
            },
        )
        response.raise_for_status()
        return response.json()


async def get_payment(payment_id: str) -> dict:
    async with httpx.AsyncClient(auth=(settings.yookassa_shop_id, settings.yookassa_secret_key)) as client:
        response = await client.get(f"{BASE_URL}/payments/{payment_id}")
        response.raise_for_status()
        return response.json()
