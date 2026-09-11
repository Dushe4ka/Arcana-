import asyncio
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import hash_password
from app.database import Base
from app.models.economy import Purchase, Wallet
from app.models.enums import CurrencyCode, PurchaseStatus
from app.models.user import User
from app.services import payments_service


@pytest.fixture
def mock_yookassa(monkeypatch):
    create_payment = AsyncMock(
        return_value={
            "id": "yk-payment-123",
            "confirmation": {"confirmation_url": "https://yookassa.ru/pay/123"},
        }
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
    client, make_user, auth_headers, mock_yookassa, db_session
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

    # The second delivery must short-circuit on the already-COMPLETED status BEFORE ever
    # calling YooKassa again - not merely happen to leave the balance correct.
    mock_yookassa["get_payment"].assert_awaited_once()

    purchase = await db_session.scalar(
        select(Purchase).where(Purchase.provider_payment_id == "yk-payment-123")
    )
    assert purchase.status == PurchaseStatus.COMPLETED


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


async def test_get_purchase_status_reflects_pending_then_completed(
    client, make_user, auth_headers, mock_yookassa, db_session
):
    """The player cabinet's /wallet return page polls this endpoint (instead of the wallet
    balance delta) so it can tell "still processing" apart from "done" even when the webhook
    beats the page's first balance read."""
    user = await make_user("status-poll@example.com")
    create_response = await client.post(
        "/api/me/purchases", json={"packageId": "hard_100"}, headers=auth_headers(user)
    )
    assert create_response.status_code == 200
    purchase = await db_session.scalar(
        select(Purchase).where(Purchase.user_id == user.id).order_by(Purchase.created_at.desc())
    )
    purchase_id = str(purchase.id)

    pending_response = await client.get(f"/api/me/purchases/{purchase_id}", headers=auth_headers(user))
    assert pending_response.status_code == 200
    assert pending_response.json() == {
        "id": purchase_id,
        "status": "PENDING",
        "amount": 100,
        "currency": "HARD",
    }

    await client.post(
        "/api/webhooks/yookassa",
        json={"event": "payment.succeeded", "object": {"id": "yk-payment-123"}},
    )

    completed_response = await client.get(f"/api/me/purchases/{purchase_id}", headers=auth_headers(user))
    assert completed_response.json()["status"] == "COMPLETED"


async def test_get_purchase_status_404_for_someone_elses_purchase(
    client, make_user, auth_headers, mock_yookassa, db_session
):
    owner = await make_user("purchase-owner@example.com")
    stranger = await make_user("purchase-stranger@example.com")
    await client.post("/api/me/purchases", json={"packageId": "hard_100"}, headers=auth_headers(owner))
    purchase = await db_session.scalar(
        select(Purchase).where(Purchase.user_id == owner.id).order_by(Purchase.created_at.desc())
    )
    purchase_id = str(purchase.id)

    response = await client.get(f"/api/me/purchases/{purchase_id}", headers=auth_headers(stranger))
    assert response.status_code == 404


async def test_get_purchase_status_404_for_unknown_id(client, make_user, auth_headers):
    user = await make_user("purchase-unknown@example.com")
    response = await client.get(
        "/api/me/purchases/00000000-0000-0000-0000-000000000000",
        headers=auth_headers(user),
    )
    assert response.status_code == 404


async def test_webhook_does_not_credit_when_real_status_is_not_succeeded(
    client, make_user, auth_headers, mock_yookassa, db_session
):
    """A webhook body claiming success must not be trusted on its own - handle_webhook always
    re-checks the payment's real status with YooKassa (see payments_service's docstring). If
    that re-check comes back anything other than "succeeded" (here: "pending"), nothing should
    be credited and the purchase must stay PENDING."""
    user = await make_user("still-pending@example.com")
    await client.post("/api/me/purchases", json={"packageId": "hard_100"}, headers=auth_headers(user))

    mock_yookassa["get_payment"].return_value = {"status": "pending"}

    webhook_response = await client.post(
        "/api/webhooks/yookassa",
        json={"event": "payment.succeeded", "object": {"id": "yk-payment-123"}},
    )
    assert webhook_response.status_code == 204

    wallet_response = await client.get("/api/wallet", headers=auth_headers(user))
    assert wallet_response.json()["hard"] == 0

    purchase = await db_session.scalar(
        select(Purchase).where(Purchase.provider_payment_id == "yk-payment-123")
    )
    assert purchase.status == PurchaseStatus.PENDING


async def test_grant_currency_locks_wallet_row_under_concurrent_webhooks(monkeypatch):
    """Regression test for the `.with_for_update()` fix in wallet_service._get_wallet_by_user
    / grant_currency: two DIFFERENT purchases for the SAME user, credited concurrently, must
    not lose a credit to an unlocked read-modify-write race on the shared Wallet row.

    This deliberately does NOT use the `client`/`db_session` fixtures: db_session wraps the
    whole test in one outer transaction with savepoints (see conftest.py's docstring), and a
    single SQLAlchemy AsyncSession/connection isn't safe to drive from two coroutines running
    concurrently. Proving the row lock actually works requires two genuinely independent
    sessions committing at the same time, so this test opens its own engine/sessions against
    the same test database instead, and cleans up after itself explicitly since nothing here
    is wrapped in a rolled-back transaction.
    """
    db_url = settings.database_url
    db_name = db_url.rsplit("/", 1)[-1].split("?")[0]
    if not db_name.endswith("_test"):
        pytest.exit(f"Refusing to run tests against {db_name!r} - point DATABASE_URL at a *_test database.")

    # A 2-party barrier gates both coroutines right before the wallet read-modify-write, so
    # they enter it at the same instant instead of merely "concurrently" in name - on a fast
    # local Postgres, a plain asyncio.sleep()-based delay resolves too cleanly (one coroutine
    # finishes its whole read-commit cycle before the other wakes) to reliably reproduce the
    # race; the barrier reproduced it 20/20 in manual trials, a bare sleep 0/8.
    barrier = asyncio.Barrier(2)

    async def _gated_get_payment(payment_id: str) -> dict:
        await barrier.wait()
        return {"status": "succeeded"}

    monkeypatch.setattr(payments_service.yookassa_client, "get_payment", _gated_get_payment)

    engine = create_async_engine(db_url, echo=False)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

    user_id = None
    try:
        async with engine.begin() as conn:
            # checkfirst=True (the default) - this only fills in tables that don't already
            # exist, it never drops data other tests in this run may have committed.
            await conn.run_sync(Base.metadata.create_all)

        setup_session = session_factory()
        try:
            user = User(
                email="concurrent-wallet-buyer@example.com",
                password_hash=hash_password("TestPass123!"),
            )
            setup_session.add(user)
            await setup_session.flush()
            user_id = user.id

            setup_session.add(Wallet(user_id=user.id, soft=0, hard=0, energy=0))
            setup_session.add(
                Purchase(
                    user_id=user.id,
                    currency=CurrencyCode.HARD,
                    amount=100,
                    price_rub_kopecks=14900,
                    provider="yookassa",
                    provider_payment_id="yk-concurrent-a",
                    status=PurchaseStatus.PENDING,
                )
            )
            setup_session.add(
                Purchase(
                    user_id=user.id,
                    currency=CurrencyCode.HARD,
                    amount=550,
                    price_rub_kopecks=74900,
                    provider="yookassa",
                    provider_payment_id="yk-concurrent-b",
                    status=PurchaseStatus.PENDING,
                )
            )
            await setup_session.commit()
        finally:
            await setup_session.close()

        session_a = session_factory()
        session_b = session_factory()
        try:
            await asyncio.gather(
                payments_service.handle_webhook(session_a, "yk-concurrent-a"),
                payments_service.handle_webhook(session_b, "yk-concurrent-b"),
            )
        finally:
            await session_a.close()
            await session_b.close()

        verify_session = session_factory()
        try:
            wallet = await verify_session.scalar(select(Wallet).where(Wallet.user_id == user_id))
            # Both credits (100 + 550) must land - neither concurrent commit may clobber the
            # other's. Without the row lock this flakes to 100 or 550 under load.
            assert wallet.hard == 650
        finally:
            await verify_session.close()
    finally:
        if user_id is not None:
            cleanup_session = session_factory()
            try:
                await cleanup_session.execute(delete(Purchase).where(Purchase.user_id == user_id))
                await cleanup_session.execute(delete(Wallet).where(Wallet.user_id == user_id))
                await cleanup_session.execute(delete(User).where(User.id == user_id))
                await cleanup_session.commit()
            finally:
                await cleanup_session.close()
        await engine.dispose()
