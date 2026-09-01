"""apps/api/tests/test_uploads.py"""


async def test_upload_valid_image_returns_url(client, make_user, auth_headers, tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))

    writer = await make_user("writer-upload@example.com", role="WRITER")

    response = await client.post(
        "/api/admin/uploads",
        headers=auth_headers(writer),
        files={"file": ("cover.png", b"\x89PNG\r\n\x1a\n" + b"0" * 100, "image/png")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["url"].endswith(".png")
    assert len(list(tmp_path.iterdir())) == 1


async def test_upload_with_focal_point_encodes_it_in_the_returned_url(
    client, make_user, auth_headers, tmp_path, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))

    writer = await make_user("writer-upload-focal@example.com", role="WRITER")

    response = await client.post(
        "/api/admin/uploads",
        headers=auth_headers(writer),
        data={"focalX": "0.5", "focalY": "0.2"},
        files={"file": ("bg.jpg", b"\xff\xd8\xff" + b"0" * 100, "image/jpeg")},
    )

    assert response.status_code == 201
    assert "fx=0.5" in response.json()["url"]
    assert "fy=0.2" in response.json()["url"]


async def test_upload_rejects_unsupported_content_type(
    client, make_user, auth_headers, tmp_path, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))

    writer = await make_user("writer-upload2@example.com", role="WRITER")

    response = await client.post(
        "/api/admin/uploads",
        headers=auth_headers(writer),
        files={"file": ("script.exe", b"not an image", "application/octet-stream")},
    )

    assert response.status_code == 400


async def test_upload_requires_writer_role(client, make_user, auth_headers):
    player = await make_user("player-upload@example.com", role="PLAYER")

    response = await client.post(
        "/api/admin/uploads",
        headers=auth_headers(player),
        files={"file": ("cover.png", b"fake", "image/png")},
    )

    assert response.status_code == 403


async def test_upload_requires_auth(client):
    response = await client.post(
        "/api/admin/uploads",
        files={"file": ("cover.png", b"fake", "image/png")},
    )

    assert response.status_code == 401
