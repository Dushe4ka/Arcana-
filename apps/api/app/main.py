import logging
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.core.errors import register_exception_handlers
from app.routers import (
    auth,
    catalog,
    characters,
    favorites,
    play,
    preview,
    scenes,
    stats,
    stories,
    uploads,
    wallet,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
access_logger = logging.getLogger("arcana.http")

app = FastAPI(title="Arcana API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    access_logger.info(
        "%s %s %s %.0fms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


app.include_router(auth.router, prefix="/api")
app.include_router(stories.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(characters.router, prefix="/api")
app.include_router(scenes.router, prefix="/api")
app.include_router(play.router, prefix="/api")
app.include_router(wallet.router, prefix="/api")
app.include_router(favorites.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")
app.include_router(preview.router, prefix="/api")

# `app` must stay a real FastAPI instance - tests (see tests/conftest.py) rely on
# `app.dependency_overrides`, which only exists on a `FastAPI` instance, not on the
# `CORSMiddleware`-wrapped ASGI callable below.
#
# The `CORSMiddleware` registered above via `app.add_middleware(...)` still never sees
# a genuinely unhandled exception that happens during FastAPI's own response-model
# serialization: that failure point is *outside* even the catch-all `@app.exception_handler
# (Exception)` registered in `register_exception_handlers`, and is caught only by
# Starlette's `ServerErrorMiddleware`, which is structurally always the outermost layer,
# above anything added via `app.add_middleware()`. Starlette's own docs recommend wrapping
# the whole ASGI app externally with CORSMiddleware to guarantee CORS headers even on that
# class of error: https://www.starlette.io/middleware/#cors-headers-on-error-responses
#
# So `asgi_app` (not `app`) is what should actually be served - see CLAUDE.md.
asgi_app = CORSMiddleware(
    app=app,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
