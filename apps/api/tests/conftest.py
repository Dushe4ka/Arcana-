"""Shared pytest fixtures for the FastAPI test suite.

Tests run against a real Postgres database (SQLite can't represent the JSONB/native UUID
columns this schema uses everywhere) - point DATABASE_URL at a disposable database before
running pytest, e.g.:

    createdb arcana_test
    DATABASE_URL=postgresql+asyncpg://arcana:arcana_dev_password@localhost/arcana_test pytest

Never point it at the arcana_dev database you use for manual testing. The db_session fixture
drops and recreates the entire schema at the start of every single test, ensuring each test
runs against a fresh schema that matches the current models, regardless of prior test runs.

As a safety net against DATABASE_URL accidentally resolving to a real/dev database (e.g. via
.env), the db_session fixture refuses to run - and exits the whole test session immediately -
unless the resolved database name ends in "_test". If you ever see that exit message, it means
the guard did its job: point DATABASE_URL at a disposable *_test database and try again.
"""

import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import create_access_token, hash_password
from app.database import Base, get_db
from app.main import app
from app.models.content import Chapter, Season, Story
from app.models.user import User


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """One test = one transaction, rolled back at the end - tests never see each other's
    data, and nothing that happens here (including explicit .commit() calls made by the
    code under test) survives past the test."""
    db_url = settings.database_url
    db_name = db_url.rsplit("/", 1)[-1].split("?")[0]
    if not db_name.endswith("_test"):
        pytest.exit(
            f"Refusing to run tests against {db_name!r} - point DATABASE_URL at a *_test database "
            "(e.g. arcana_test), never the dev database."
        )

    engine = create_async_engine(settings.database_url, echo=False)

    # Drop and recreate schema - ensures every test starts fresh with the current models,
    # preventing silent failures when schema evolves (e.g., new columns added).
    async with engine.begin() as conn:
        # Drop all tables using CASCADE to handle foreign keys without explicit names
        await conn.exec_driver_sql("DROP SCHEMA public CASCADE")
        await conn.exec_driver_sql("CREATE SCHEMA public")
        await conn.run_sync(Base.metadata.create_all)

    # Get a connection for this test
    connection = await engine.connect()
    outer_transaction = await connection.begin()
    session_factory = async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        class_=AsyncSession,
        join_transaction_mode="create_savepoint",
    )
    session = session_factory()

    yield session

    # Cleanup
    await session.close()
    await outer_transaction.rollback()
    await connection.close()
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _get_db_override():
        yield db_session

    app.dependency_overrides[get_db] = _get_db_override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def make_user(db_session: AsyncSession):
    async def _make_user(email: str, role: str = "PLAYER", password: str = "TestPass123!") -> User:
        user = User(email=email, password_hash=hash_password(password), role=role)
        db_session.add(user)
        await db_session.flush()
        await db_session.refresh(user)
        return user

    return _make_user


@pytest.fixture
def auth_headers():
    def _auth_headers(user: User) -> dict[str, str]:
        # user.role is a genuine UserRole enum instance because make_user refreshes the user
        # after insert, which makes SQLAlchemy coerce the role into the enum - exactly matching
        # how every real User object behaves in production.
        token = create_access_token(str(user.id), user.email, user.role.value)
        return {"Authorization": f"Bearer {token}"}

    return _auth_headers


@pytest_asyncio.fixture
async def make_chapter(db_session: AsyncSession):
    async def _make_chapter(*, story_genre: str = "ROMANCE", chapter_status: str = "PUBLISHED") -> Chapter:
        story = Story(
            slug=f"test-story-{uuid.uuid4().hex[:8]}",
            title={"ru": "Тестовая история"},
            genre=story_genre,
        )
        db_session.add(story)
        await db_session.flush()

        season = Season(story_id=story.id, index=1, title={"ru": "Сезон 1"})
        db_session.add(season)
        await db_session.flush()

        chapter = Chapter(
            season_id=season.id,
            index=1,
            title={"ru": "Глава 1"},
            status=chapter_status,
            unlock_cost=0,
        )
        db_session.add(chapter)
        await db_session.flush()
        await db_session.refresh(chapter)
        chapter.season = season
        return chapter

    return _make_chapter
