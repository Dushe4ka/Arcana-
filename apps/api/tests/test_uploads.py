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


async def _upload(client, headers, name, content, content_type):
    return await client.post("/api/admin/uploads", headers=headers, files={"file": (name, content, content_type)})


async def test_upload_trusts_file_contents_not_the_declared_type(client, make_user, auth_headers, tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    headers = auth_headers(await make_user("writer-sniff@example.com", role="WRITER"))

    disguised = await _upload(client, headers, "cover.png", b"<script>alert(1)</script>", "image/png")
    assert disguised.status_code == 400
    assert list(tmp_path.iterdir()) == []

    # A real JPEG mislabelled as PNG is stored under its true extension.
    mislabelled = await _upload(client, headers, "x.png", b"\xff\xd8\xff" + b"0" * 50, "image/png")
    assert mislabelled.status_code == 201 and mislabelled.json()["url"].endswith(".jpg")


async def test_upload_accepts_audio_and_gif(client, make_user, auth_headers, tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    headers = auth_headers(await make_user("writer-audio@example.com", role="WRITER"))
    samples = {
        ".mp3": (b"ID3\x03" + b"0" * 50, "audio/mpeg"),
        ".ogg": (b"OggS" + b"0" * 50, "audio/ogg"),
        ".wav": (b"RIFF\x00\x00\x00\x00WAVE" + b"0" * 50, "audio/wav"),
        ".gif": (b"GIF89a" + b"0" * 50, "image/gif"),
    }
    for extension, (content, content_type) in samples.items():
        response = await _upload(client, headers, f"file{extension}", content, content_type)
        assert response.status_code == 201, response.text
        assert response.json()["url"].endswith(extension)


async def test_upload_enforces_image_size_limit(client, make_user, auth_headers, tmp_path, monkeypatch):
    from app.config import settings
    from app.services import uploads_service

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    monkeypatch.setitem(uploads_service._KINDS, "image/png", (".png", 100))
    headers = auth_headers(await make_user("writer-big@example.com", role="WRITER"))
    response = await _upload(client, headers, "big.png", b"\x89PNG\r\n\x1a\n" + b"0" * 200, "image/png")
    assert response.status_code == 400
