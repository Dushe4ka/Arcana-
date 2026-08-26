import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.errors import register_exception_handlers
from app.routers import auth, catalog, characters, play, scenes, stories, wallet

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
access_logger = logging.getLogger("arcana.http")

app = FastAPI(title="Arcana API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)


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
