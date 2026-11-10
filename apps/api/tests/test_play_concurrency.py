"""True concurrency: several database connections acting on one account at the same instant.
The regular fixtures share a single connection, so they cannot catch lost-update races."""

import asyncio
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core.security import hash_password
from app.models.content import Chapter, ChoiceOption, SceneNode, Season, Story
from app.models.economy import CurrencyTransaction, DailyRewardState, Wallet
from app.models.player import PlayerChapterUnlock
from app.models.user import User
from app.services import play_service, wallet_service


async def _seed(factory, *, unlock_cost=0):
    async with factory() as db:
        user = User(email=f"race-{uuid.uuid4().hex[:8]}@example.com", password_hash=hash_password("x"))
        story = Story(slug=f"race-{uuid.uuid4().hex[:8]}", title={"ru": "Гонка"}, genre="ROMANCE", status="PUBLISHED")
        db.add_all([user, story])
        await db.flush()
        db.add_all([Wallet(user_id=user.id, soft=100, energy=20), DailyRewardState(user_id=user.id)])
        season = Season(story_id=story.id, index=1, title={"ru": "1"})
        db.add(season)
        await db.flush()
        chapter = Chapter(season_id=season.id, index=1, title={"ru": "1"}, status="PUBLISHED", unlock_cost=unlock_cost)
        db.add(chapter)
        await db.flush()
        end = SceneNode(chapter_id=chapter.id, type="END", data={})
        choice = SceneNode(chapter_id=chapter.id, type="CHOICE", data={})
        db.add_all([end, choice])
        await db.flush()
        option = ChoiceOption(
            node_id=choice.id, text={"ru": "Платно"}, cost_currency="SOFT", cost_amount=60, next_node_id=end.id
        )
        db.add(option)
        chapter.entry_node_id = choice.id
        await db.commit()
        return str(user.id), str(chapter.id), str(option.id), str(choice.id)


async def _in_parallel(factory, count, action):
    async def one():
        async with factory() as db:
            try:
                return await action(db)
            except Exception as exc:  # noqa: BLE001 - losers of the race are expected to fail
                return exc

    return await asyncio.gather(*[one() for _ in range(count)])


async def test_simultaneous_paid_choice_requests_charge_once(db_session):
    # db_session is requested only for its schema reset; this test uses its own connections.
    await db_session.close()
    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    try:
        user_id, chapter_id, option_id, choice_node_id = await _seed(factory)
        async with factory() as db:
            view = await play_service.start_chapter(db, user_id, chapter_id, 1)
        slot_id = view["saveSlot"]["id"]

        # 60 of 100 coins: without row locks both requests would pass the balance check.
        results = await _in_parallel(
            factory, 5, lambda db: play_service.submit_choice(db, user_id, slot_id, option_id, choice_node_id)
        )
        assert all(isinstance(r, dict) and r["type"] == "END" for r in results), results

        async with factory() as db:
            wallet = await db.scalar(select(Wallet).where(Wallet.user_id == user_id))
            spends = await db.scalar(
                select(func.count()).select_from(CurrencyTransaction).where(CurrencyTransaction.user_id == user_id)
            )
            assert (wallet.soft, spends) == (40, 1)
            assert wallet.xp == play_service.CHAPTER_COMPLETE_XP
    finally:
        await engine.dispose()


async def test_simultaneous_chapter_starts_unlock_once(db_session):
    await db_session.close()
    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    try:
        user_id, chapter_id, _, _ = await _seed(factory, unlock_cost=7)
        results = await _in_parallel(factory, 5, lambda db: play_service.start_chapter(db, user_id, chapter_id, 1))
        assert all(isinstance(r, dict) for r in results), results
        assert len({r["saveSlot"]["id"] for r in results}) == 1

        async with factory() as db:
            wallet = await db.scalar(select(Wallet).where(Wallet.user_id == user_id))
            unlocks = await db.scalar(
                select(func.count()).select_from(PlayerChapterUnlock).where(PlayerChapterUnlock.user_id == user_id)
            )
            assert (wallet.energy, unlocks) == (13, 1)
    finally:
        await engine.dispose()


async def test_simultaneous_daily_reward_claims_pay_once(db_session):
    await db_session.close()
    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    try:
        user_id, _, _, _ = await _seed(factory)
        results = await _in_parallel(factory, 5, lambda db: wallet_service.claim_daily_reward(db, user_id))
        assert sum(isinstance(r, dict) for r in results) == 1
        async with factory() as db:
            wallet = await db.scalar(select(Wallet).where(Wallet.user_id == user_id))
            assert wallet.soft == 130
    finally:
        await engine.dispose()
