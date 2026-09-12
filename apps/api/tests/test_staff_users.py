"""ADMIN-only staff account management - see app/routers/staff.py.

Before this, the only way to create a WRITER/EDITOR/ADMIN account was to hand-edit the
database or add a hardcoded entry to seed.py. This is the admin panel's "create employee"
screen's backend.
"""

import pytest


async def test_admin_can_create_writer_account(client, make_user, auth_headers):
    admin = await make_user("owner@example.com", role="ADMIN")
    response = await client.post(
        "/api/admin/users",
        json={
            "email": "new-writer@example.com",
            "password": "WriterPass123!",
            "displayName": "Новый Сценарист",
            "role": "WRITER",
        },
        headers=auth_headers(admin),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new-writer@example.com"
    assert body["displayName"] == "Новый Сценарист"
    assert body["role"] == "WRITER"
    assert "password" not in body and "passwordHash" not in body


async def test_new_staff_account_can_log_in(client, make_user, auth_headers):
    admin = await make_user("owner2@example.com", role="ADMIN")
    await client.post(
        "/api/admin/users",
        json={
            "email": "can-login@example.com",
            "password": "WriterPass123!",
            "displayName": "Проверка Логина",
            "role": "EDITOR",
        },
        headers=auth_headers(admin),
    )

    login = await client.post(
        "/api/auth/login",
        json={"email": "can-login@example.com", "password": "WriterPass123!"},
    )
    assert login.status_code == 200
    assert login.json()["user"]["role"] == "EDITOR"


@pytest.mark.parametrize("role", ["WRITER", "EDITOR"])
async def test_non_admin_cannot_create_staff_user(client, make_user, auth_headers, role):
    non_admin = await make_user(f"non-admin-{role}@example.com", role=role)
    response = await client.post(
        "/api/admin/users",
        json={
            "email": "should-not-exist@example.com",
            "password": "WriterPass123!",
            "displayName": "Не должен создаться",
            "role": "WRITER",
        },
        headers=auth_headers(non_admin),
    )
    assert response.status_code == 403


async def test_create_staff_user_rejects_duplicate_email(client, make_user, auth_headers):
    admin = await make_user("owner3@example.com", role="ADMIN")
    existing = await make_user("taken@example.com", role="WRITER")

    response = await client.post(
        "/api/admin/users",
        json={
            "email": existing.email,
            "password": "WriterPass123!",
            "displayName": "Дубликат",
            "role": "WRITER",
        },
        headers=auth_headers(admin),
    )
    assert response.status_code == 409


async def test_create_staff_user_rejects_player_role(client, make_user, auth_headers):
    admin = await make_user("owner4@example.com", role="ADMIN")
    response = await client.post(
        "/api/admin/users",
        json={
            "email": "would-be-player@example.com",
            "password": "WriterPass123!",
            "displayName": "Игрок",
            "role": "PLAYER",
        },
        headers=auth_headers(admin),
    )
    # PLAYER accounts go through /auth/register, not here - Pydantic's Literal rejects it.
    # This app's global RequestValidationError handler maps that to 400, not FastAPI's default 422.
    assert response.status_code == 400


async def test_list_staff_users_includes_created_staff_and_excludes_players(client, make_user, auth_headers):
    admin = await make_user("owner5@example.com", role="ADMIN")
    await client.post(
        "/api/admin/users",
        json={
            "email": "listed-writer@example.com",
            "password": "WriterPass123!",
            "displayName": "В списке",
            "role": "WRITER",
        },
        headers=auth_headers(admin),
    )
    await make_user("some-player@example.com", role="PLAYER")

    response = await client.get("/api/admin/users", headers=auth_headers(admin))
    assert response.status_code == 200
    emails = {u["email"] for u in response.json()}
    assert "listed-writer@example.com" in emails
    assert admin.email in emails  # the admin itself is staff too
    assert "some-player@example.com" not in emails
