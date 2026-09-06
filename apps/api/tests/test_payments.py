from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.models.economy import Purchase
from app.models.enums import PurchaseStatus
from app.services import payments_service


@pytest.fixture
def mock_yookassa(monkeypatch):
    create_payment = AsyncMock(
        return_value={"id": "yk-payment-123", "confirmation": {"confirmation_url": "https://yookassa.ru/pay/123"}}
    )
    get_payment = AsyncMock(return_value={"status": "succeeded"})
    monkeypatch.setattr(payments_service.yookassa_client, "create_payment", create_payment)
    monkeypatch.setattr(payments_service.yookassa_client, "get_payment", get_payment)
    return {"create_payment": create_payment, "get_payment": get_payment}


async def test_list_packages_endpoint(client, make_user, auth_headers):
    user = await make_user("packages@example.com")
    response = await client.get("/api/me/purchases/packages", headers=auth_headers(user))
    assert response.status_code == 200
    body = response.json()
    assert len(body) == len(payments_service.CURRENCY_PACKAGES)
    assert body[0]["id"] == payments_service.CURRENCY_PACKAGES[0]["id"]


async def test_create_purchase_returns_confirmation_url(client, make_user, auth_headers, mock_yookassa):
    user = await make_user("buyer@example.com")
    response = await client.post(
        "/api/me/purchases", json={"packageId": "hard_100"}, headers=auth_headers(user)
    )
    assert response.status_code == 200
    assert response.json()["confirmationUrl"] == "https://yookassa.ru/pay/123"
    mock_yookassa["create_payment"].assert_awaited_once()


async def test_create_purchase_rejects_unknown_package(client, make_user, auth_headers, mock_yookassa):
    user = await make_user("bad-package@example.com")
    response = await client.post(
        "/api/me/purchases", json={"packageId": "does-not-exist"}, headers=auth_headers(user)
    )
    assert response.status_code == 400
    mock_yookassa["create_payment"].assert_not_awaited()


async def test_webhook_credits_currency_on_succeeded_payment(
    client, make_user, auth_headers, mock_yookassa, db_session
):
    user = await make_user("webhook-buyer@example.com")
    purchase_response = await client.post(
        "/api/me/purchases", json={"packageId": "hard_100"}, headers=auth_headers(user)
    )
    assert purchase_response.status_code == 200

    webhook_response = await client.post(
        "/api/webhooks/yookassa",
        json={"event": "payment.succeeded", "object": {"id": "yk-payment-123"}},
    )
    assert webhook_response.status_code == 204

    wallet_response = await client.get("/api/wallet", headers=auth_headers(user))
    assert wallet_response.json()["hard"] == 100

    purchase = await db_session.scalar(
        select(Purchase).where(Purchase.provider_payment_id == "yk-payment-123")
    )
    assert purchase.status == PurchaseStatus.COMPLETED


async def test_webhook_is_idempotent_on_duplicate_delivery(
    client, make_user, auth_headers, mock_yookassa
):
    user = await make_user("webhook-twice@example.com")
    await client.post("/api/me/purchases", json={"packageId": "hard_100"}, headers=auth_headers(user))

    webhook_body = {"event": "payment.succeeded", "object": {"id": "yk-payment-123"}}
    first = await client.post("/api/webhooks/yookassa", json=webhook_body)
    second = await client.post("/api/webhooks/yookassa", json=webhook_body)
    assert first.status_code == 204
    assert second.status_code == 204

    wallet_response = await client.get("/api/wallet", headers=auth_headers(user))
    assert wallet_response.json()["hard"] == 100  # not 200 - the second delivery must not double-credit


async def test_webhook_ignores_unknown_payment_id(client):
    response = await client.post(
        "/api/webhooks/yookassa",
        json={"event": "payment.succeeded", "object": {"id": "never-created"}},
    )
    assert response.status_code == 204  # must still ack, not 500, so YooKassa stops retrying


async def test_create_purchase_returns_502_on_malformed_yookassa_response(
    client, make_user, auth_headers, monkeypatch, db_session
):
    # Missing the "confirmation" key entirely - a malformed-but-200 response from YooKassa.
    create_payment = AsyncMock(return_value={"id": "yk-malformed"})
    monkeypatch.setattr(payments_service.yookassa_client, "create_payment", create_payment)

    user = await make_user("malformed-response@example.com")
    response = await client.post(
        "/api/me/purchases", json={"packageId": "hard_100"}, headers=auth_headers(user)
    )
    assert response.status_code == 502

    purchase = await db_session.scalar(
        select(Purchase).where(Purchase.user_id == user.id).order_by(Purchase.created_at.desc())
    )
    assert purchase.status == PurchaseStatus.FAILED
