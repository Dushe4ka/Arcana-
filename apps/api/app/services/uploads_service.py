"""Validates and stores uploaded media (images, GIF sprites, audio)."""

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.config import settings

MB = 1024 * 1024
MAX_IMAGE_BYTES = 10 * MB
MAX_AUDIO_BYTES = 20 * MB
MAX_UPLOAD_BYTES = MAX_AUDIO_BYTES


def _sniff(head: bytes) -> str | None:
    """Detects the real file type from its first bytes. The browser-declared content type
    is never trusted: a script renamed to .png must not be stored and served."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "audio/wav"
    if head[:4] == b"OggS":
        return "audio/ogg"
    if head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0):
        return "audio/mpeg"
    if head[4:8] == b"ftyp":
        return "audio/mp4"
    return None


_KINDS = {
    "image/png": (".png", MAX_IMAGE_BYTES),
    "image/jpeg": (".jpg", MAX_IMAGE_BYTES),
    "image/webp": (".webp", MAX_IMAGE_BYTES),
    "image/gif": (".gif", MAX_IMAGE_BYTES),
    "audio/mpeg": (".mp3", MAX_AUDIO_BYTES),
    "audio/ogg": (".ogg", MAX_AUDIO_BYTES),
    "audio/wav": (".wav", MAX_AUDIO_BYTES),
    "audio/mp4": (".m4a", MAX_AUDIO_BYTES),
}
ALLOWED_CONTENT_TYPES = set(_KINDS)
_ALLOWED_LABEL = "PNG, JPEG, WebP, GIF, MP3, OGG, WAV, M4A"


async def save_upload(file: UploadFile, focal_x: float | None = None, focal_y: float | None = None) -> str:
    """Validates and saves an uploaded file, returning its public URL. An optional focal
    point (each 0-1, fraction of width/height) is encoded straight into the URL's query
    string."""
    for name, value in (("focalX", focal_x), ("focalY", focal_y)):
        if value is not None and not (0 <= value <= 1):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{name} должен быть в диапазоне 0-1")

    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Файл слишком большой")

    # Read at most one byte past the largest limit, never an unbounded body.
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Пустой файл")

    kind = _sniff(contents[:16])
    if kind is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Неподдерживаемый тип файла: {file.content_type}. Разрешены: {_ALLOWED_LABEL}",
        )
    extension, limit = _KINDS[kind]
    if len(contents) > limit:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Файл слишком большой (максимум {limit // MB} МБ для этого типа)"
        )

    uploads_dir = Path(settings.uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    (uploads_dir / filename).write_bytes(contents)

    url = f"{settings.public_base_url}/uploads/{filename}"
    if focal_x is not None and focal_y is not None:
        url += f"?fx={focal_x}&fy={focal_y}"
    return url
