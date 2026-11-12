"""Validates and stores uploaded media (images, GIF sprites, audio)."""

import asyncio
import io
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps

from app.config import settings

MB = 1024 * 1024
MAX_IMAGE_BYTES = 10 * MB
MAX_AUDIO_BYTES = 20 * MB
MAX_UPLOAD_BYTES = MAX_AUDIO_BYTES

# Images are shown on phones: nothing is ever drawn taller than a phone screen (about
# 2400-2600 px), so a 2000x4600 sprite canvas is cut to half its size - 7.6 MB became
# 1.7 MB, and the character no longer appears seconds late while the phone downloads it.
# Landscape backgrounds (shown cropped to the screen height) are left as they are.
MAX_IMAGE_HEIGHT = 2400
MAX_IMAGE_WIDTH = 4096
# WAV is uncompressed: a three-minute track is 16 MB, most of a chapter's download. It is
# re-encoded to AAC (.m4a), which iOS and Android both play, at a bitrate where the
# difference is not audible on a phone - about a fifth of the size.
AUDIO_BITRATE = "192k"


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
    original = contents
    if kind == "audio/wav":
        encoded = await encode_wav_to_m4a(contents)
        if encoded is not None:
            contents, extension = encoded, ".m4a"

    uploads_dir = Path(settings.uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    stem = uuid.uuid4().hex
    filename = f"{stem}{extension}"
    smaller = shrink_image(contents, kind)
    if smaller is not None:
        contents = smaller
    if contents is not original:
        # The untouched upload is kept next to the served file, so nothing the author
        # uploaded is ever lost.
        originals = uploads_dir / "originals"
        originals.mkdir(exist_ok=True)
        (originals / f"{stem}{_KINDS[kind][0]}").write_bytes(original)
    (uploads_dir / filename).write_bytes(contents)

    url = f"{settings.public_base_url}/uploads/{filename}"
    if focal_x is not None and focal_y is not None:
        url += f"?fx={focal_x}&fy={focal_y}"
    return url


def shrink_image(contents: bytes, kind: str) -> bytes | None:
    """Scales a PNG/JPEG down to what a phone can show, in the same format. Returns None
    when the image is already small enough (or is not a still PNG/JPEG), so the original
    bytes are stored untouched."""
    if kind not in ("image/png", "image/jpeg"):
        return None
    try:
        with Image.open(io.BytesIO(contents)) as image:
            width, height = image.size
            scale = min(1.0, MAX_IMAGE_HEIGHT / height, MAX_IMAGE_WIDTH / width)
            if scale >= 1.0:
                return None
            image = ImageOps.exif_transpose(image)
            size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
            resized = image.resize(size, Image.Resampling.LANCZOS)
            out = io.BytesIO()
            if kind == "image/png":
                resized.save(out, "PNG", optimize=True)
            else:
                resized.convert("RGB").save(out, "JPEG", quality=88, optimize=True, progressive=True)
            return out.getvalue()
    except (OSError, ValueError, Image.DecompressionBombError):
        # Unreadable by Pillow but it passed the magic-byte check: store it as uploaded.
        return None


async def encode_wav_to_m4a(contents: bytes) -> bytes | None:
    """WAV -> AAC in an .m4a container via ffmpeg. Returns None when ffmpeg is not installed
    or cannot read the file, so the WAV is stored as uploaded instead of failing."""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return None
    with tempfile.TemporaryDirectory() as tmp:
        source, target = Path(tmp) / "in.wav", Path(tmp) / "out.m4a"
        source.write_bytes(contents)
        process = await asyncio.create_subprocess_exec(
            ffmpeg,
            "-nostdin",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            AUDIO_BITRATE,
            "-movflags",
            "+faststart",
            str(target),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        if await process.wait() != 0 or not target.exists():
            return None
        return target.read_bytes()
