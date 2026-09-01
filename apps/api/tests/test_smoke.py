async def test_me_endpoint_returns_authenticated_user(client, make_user, auth_headers):
    user = await make_user("writer@example.com", role="WRITER")

    response = await client.get("/api/auth/me", headers=auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "writer@example.com"
    assert body["role"] == "WRITER"


async def test_me_endpoint_requires_auth(client):
    response = await client.get("/api/auth/me")

    assert response.status_code == 401
