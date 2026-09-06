from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.user import CabinetLinkToken


async def test_cabinet_link_token_exchange_succeeds(client, make_user, auth_headers):
    user = await make_user("cabinet-ok@example.com")
    headers = auth_headers(user)

    create_response = await client.post("/api/auth/cabinet-link-token", headers=headers)
    assert create_response.status_code == 200
    code = create_response.json()["code"]

    exchange_response = await client.post("/api/auth/cabinet-exchange", json={"code": code})
    assert exchange_response.status_code == 200
    body = exchange_response.json()
    assert body["user"]["id"] == str(user.id)
    assert body["accessToken"]
    assert body["refreshToken"]


async def test_cabinet_link_token_rejects_reuse(client, make_user, auth_headers):
    user = await make_user("cabinet-reuse@example.com")
    headers = auth_headers(user)

    code = (await client.post("/api/auth/cabinet-link-token", headers=headers)).json()["code"]

    first = await client.post("/api/auth/cabinet-exchange", json={"code": code})
    assert first.status_code == 200

    second = await client.post("/api/auth/cabinet-exchange", json={"code": code})
    assert second.status_code == 401


async def test_cabinet_link_token_rejects_expired(client, make_user, auth_headers, db_session):
    user = await make_user("cabinet-expired@example.com")
    headers = auth_headers(user)

    code = (await client.post("/api/auth/cabinet-link-token", headers=headers)).json()["code"]

    stored = await db_session.scalar(
        select(CabinetLinkToken).where(CabinetLinkToken.user_id == user.id)
    )
    stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()

    response = await client.post("/api/auth/cabinet-exchange", json={"code": code})
    assert response.status_code == 401


async def test_cabinet_link_token_rejects_garbage_code(client):
    response = await client.post("/api/auth/cabinet-exchange", json={"code": "not-a-real-code"})
    assert response.status_code == 401
