"""apps/api/app/services/uploads_service.py"""

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.config import settings

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB - generous for a background/sprite PNG/JPEG.

_EXTENSION_BY_CONTENT_TYPE = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


async def save_upload(file: UploadFile, focal_x: float | None = None, focal_y: float | None = None) -> str:
    """Validates and saves an uploaded image, returning its public URL. An optional focal
    point (each 0-1, fraction of width/height) is encoded straight into the URL's query
    string - see the "Focal point" note in the implementation plan for why nothing else
    needs to store it."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Неподдерживаемый тип файла: {file.content_type}. Разрешены: PNG, JPEG, WebP",
        )
    for name, value in (("focalX", focal_x), ("focalY", focal_y)):
        if value is not None and not (0 <= value <= 1):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{name} должен быть в диапазоне 0-1")

    contents = await file.read()
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Пустой файл")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Файл слишком большой (максимум 10 МБ)")

    uploads_dir = Path(settings.uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)

    extension = _EXTENSION_BY_CONTENT_TYPE[file.content_type]
    filename = f"{uuid.uuid4().hex}{extension}"
    (uploads_dir / filename).write_bytes(contents)

    url = f"{settings.public_base_url}/uploads/{filename}"
    if focal_x is not None and focal_y is not None:
        url += f"?fx={focal_x}&fy={focal_y}"
    return url
