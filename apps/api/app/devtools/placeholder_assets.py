"""Generates license-free placeholder media (flat-colour PNGs, synthesised WAV tones) for
the technical test story, using only the standard library. Nothing here is real game art -
it exists so every engine feature can be exercised without borrowing anyone's assets."""

import math
import struct
import wave
import zlib
from pathlib import Path


def _png(width: int, height: int, row_at) -> bytes:
    """`row_at(y)` returns the RGBA bytes of one row; identical rows are cheap to repeat."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    compressor = zlib.compressobj(6)
    parts = []
    for y in range(height):
        parts.append(compressor.compress(b"\x00" + row_at(y)))
    parts.append(compressor.flush())
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", b"".join(parts)) + chunk(b"IEND", b"")
    )


def gradient_png(
    path: Path, top: tuple[int, int, int], bottom: tuple[int, int, int], size=(540, 960)
) -> None:
    width, height = size

    def row(y: int) -> bytes:
        t = y / (height - 1)
        pixel = bytes(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + b"\xff"
        return pixel * width

    path.write_bytes(_png(width, height, row))


def sprite_png(path: Path, body: tuple[int, int, int], accent: tuple[int, int, int]) -> None:
    """A simple standing silhouette on the project's 2000x4600 sprite canvas convention
    (scaled 1:4 to keep the file small - same aspect ratio, waist line at 50% height):
    head, shoulders-to-feet body and an accent band at the waist that differs per emotion."""
    width, height = 500, 1150
    clear = b"\x00\x00\x00\x00"
    body_px = bytes(body) + b"\xff"
    accent_px = bytes(accent) + b"\xff"
    cx = width // 2
    cache: dict[tuple[int, bytes], bytes] = {}

    def span(half: int, pixel: bytes) -> bytes:
        key = (half, pixel)
        if key not in cache:
            half = max(0, min(cx, half))
            cache[key] = clear * (cx - half) + pixel * (2 * half) + clear * (cx - half)
        return cache[key]

    def row(y: int) -> bytes:
        if 60 <= y < 300:  # head
            dy = y - 180
            return span(int(math.sqrt(max(0, 120 * 120 - dy * dy)) * 0.85), body_px)
        if 300 <= y < 340:  # neck
            return span(45, body_px)
        if 340 <= y < 1150:
            t = (y - 340) / 810
            half = int(190 - 60 * abs(t - 0.25))
            return span(half, accent_px if 545 <= y < 605 else body_px)  # accent at the waist line
        return clear * width

    path.write_bytes(_png(width, height, row))


def tone_wav(path: Path, notes: list[float], seconds: float, volume: float = 0.25) -> None:
    """A soft chord of sine waves with fade in/out, so it loops without a click."""
    rate = 22050
    total = int(rate * seconds)
    fade = int(rate * min(0.15, seconds / 4))
    frames = bytearray()
    for n in range(total):
        sample = sum(math.sin(2 * math.pi * f * n / rate) for f in notes) / len(notes)
        envelope = min(1.0, n / fade, (total - n) / fade)
        frames += struct.pack("<h", int(sample * envelope * volume * 32767))
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(bytes(frames))
