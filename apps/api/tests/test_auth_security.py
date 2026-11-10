"""Account security: brute-force throttling, password change/reset, refresh-token theft
detection, sign-out everywhere, e-mail normalisation."""

import pytest

from app.core import rate_limit


@pytest.fixture(autouse=True)
def _fresh_limiters():
    rate_limit.login_by_email.reset()
    rate_limit.login_by_ip.reset()
    yield
    rate_limit.login_by_email.reset()
    rate_limit.login_by_ip.reset()


async def _register(client, email="reader@example.com", password="StartPass123!"):
    response = await client.post(
        "/api/auth/register", json={"email": email, "password": password, "displayName": "Читатель"}
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _login(client, email, password):
    return await client.post("/api/auth/login", json={"email": email, "password": password})


def _bearer(tokens):
    return {"Authorization": f"Bearer {tokens['accessToken']}"}


async def test_email_is_case_insensitive_and_cannot_be_registered_twice(client):
    await _register(client, "Mixed.Case@Example.com")
    assert (await _login(client, "mixed.case@example.com", "StartPass123!")).status_code == 200
    assert (await _login(client, "MIXED.CASE@EXAMPLE.COM", "StartPass123!")).status_code == 200
    duplicate = await client.post(
        "/api/auth/register",
        json={"email": "mixed.case@example.com", "password": "Another123!", "displayName": "Двойник"},
    )
    assert duplicate.status_code == 409


async def test_repeated_wrong_passwords_lock_the_account_out_temporarily(client):
    await _register(client, "target@example.com")
    for _ in range(8):
        assert (await _login(client, "target@example.com", "wrong-password")).status_code == 401
    blocked = await _login(client, "target@example.com", "StartPass123!")
    assert blocked.status_code == 429
    assert blocked.json()["retryAfterSeconds"] > 0
    # Other accounts are unaffected.
    await _register(client, "bystander@example.com")
    assert (await _login(client, "bystander@example.com", "StartPass123!")).status_code == 200


async def test_successful_login_clears_the_failure_counter(client):
    await _register(client, "forgetful@example.com")
    for _ in range(7):
        await _login(client, "forgetful@example.com", "wrong-password")
    assert (await _login(client, "forgetful@example.com", "StartPass123!")).status_code == 200
    for _ in range(7):
        assert (await _login(client, "forgetful@example.com", "wrong-password")).status_code == 401


async def test_change_password_requires_current_and_signs_out_other_devices(client):
    phone = await _register(client, "owner@example.com")
    tablet = (await _login(client, "owner@example.com", "StartPass123!")).json()

    wrong = await client.post(
        "/api/auth/change-password",
        headers=_bearer(phone),
        json={"currentPassword": "not-it", "newPassword": "BrandNew456!"},
    )
    assert wrong.status_code == 400
    same = await client.post(
        "/api/auth/change-password",
        headers=_bearer(phone),
        json={"currentPassword": "StartPass123!", "newPassword": "StartPass123!"},
    )
    assert same.status_code == 400

    changed = await client.post(
        "/api/auth/change-password",
        headers=_bearer(phone),
        json={"currentPassword": "StartPass123!", "newPassword": "BrandNew456!"},
    )
    assert changed.status_code == 200
    fresh = changed.json()

    assert (await _login(client, "owner@example.com", "StartPass123!")).status_code == 401
    assert (await _login(client, "owner@example.com", "BrandNew456!")).status_code == 200
    stale = await client.post("/api/auth/refresh", json={"refreshToken": tablet["refreshToken"]})
    assert stale.status_code == 401
    assert (await client.post("/api/auth/refresh", json={"refreshToken": fresh["refreshToken"]})).status_code == 200


async def test_replayed_refresh_token_ends_every_session(client):
    first = await _register(client, "victim@example.com")
    rotated = await client.post("/api/auth/refresh", json={"refreshToken": first["refreshToken"]})
    assert rotated.status_code == 200
    # The already-used token shows up again: someone has a copy.
    replay = await client.post("/api/auth/refresh", json={"refreshToken": first["refreshToken"]})
    assert replay.status_code == 401
    # ...so even the legitimately rotated token stops working.
    after = await client.post("/api/auth/refresh", json={"refreshToken": rotated.json()["refreshToken"]})
    assert after.status_code == 401


async def test_logout_all_revokes_every_refresh_token(client):
    phone = await _register(client, "everywhere@example.com")
    tablet = (await _login(client, "everywhere@example.com", "StartPass123!")).json()
    assert (await client.post("/api/auth/logout-all", headers=_bearer(phone))).status_code == 204
    for tokens in (phone, tablet):
        response = await client.post("/api/auth/refresh", json={"refreshToken": tokens["refreshToken"]})
        assert response.status_code == 401


async def test_admin_can_reset_staff_password_but_not_a_players(client, make_user, auth_headers):
    admin = await make_user("boss@example.com", role="ADMIN")
    writer = await make_user("writer-lost@example.com", role="WRITER", password="Forgotten1!")
    player = await make_user("some-player@example.com", role="PLAYER", password="PlayerPass1!")
    headers = auth_headers(admin)

    reset = await client.post(
        f"/api/admin/users/{writer.id}/reset-password", headers=headers, json={"newPassword": "Restored789!"}
    )
    assert reset.status_code == 204
    assert (await _login(client, "writer-lost@example.com", "Forgotten1!")).status_code == 401
    assert (await _login(client, "writer-lost@example.com", "Restored789!")).status_code == 200

    forbidden = await client.post(
        f"/api/admin/users/{player.id}/reset-password", headers=headers, json={"newPassword": "Hijacked789!"}
    )
    assert forbidden.status_code == 404
    assert (await _login(client, "some-player@example.com", "PlayerPass1!")).status_code == 200

    not_admin = await client.post(
        f"/api/admin/users/{writer.id}/reset-password", headers=auth_headers(writer), json={"newPassword": "Sneaky789!"}
    )
    assert not_admin.status_code == 403


def test_production_refuses_weak_or_shared_jwt_secrets():
    from pydantic import ValidationError

    from app.config import Settings

    base = {"database_url": "postgresql+asyncpg://x/y", "environment": "production"}
    with pytest.raises(ValidationError):
        Settings(**base, jwt_access_secret="short", jwt_refresh_secret="b" * 40, _env_file=None)
    with pytest.raises(ValidationError):
        Settings(**base, jwt_access_secret="a" * 40, jwt_refresh_secret="a" * 40, _env_file=None)
    Settings(**base, jwt_access_secret="a" * 40, jwt_refresh_secret="b" * 40, _env_file=None)
