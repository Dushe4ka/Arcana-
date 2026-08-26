from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.economy import CurrencyTransaction, DailyRewardState, Wallet
from app.models.enums import CurrencyCode, TransactionType

MAX_ENERGY = 40
# One energy point regenerates every 6 minutes - full refill from empty takes 4 hours.
ENERGY_REGEN_MINUTES = 6

DAY = timedelta(days=1)


async def get_wallet(db: AsyncSession, user_id: str) -> Wallet:
    wallet = await _get_wallet_by_user(db, user_id)
    await _apply_energy_regen(db, wallet)
    return wallet


async def _get_wallet_by_user(db: AsyncSession, user_id: str) -> Wallet:
    wallet = await db.scalar(select(Wallet).where(Wallet.user_id == user_id))
    if not wallet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Кошелёк не найден")
    return wallet


async def _apply_energy_regen(db: AsyncSession, wallet: Wallet) -> None:
    """Recomputes energy based on elapsed time and persists it if it changed. Pure "lazy
    regen" - no cron needed."""
    if wallet.energy >= MAX_ENERGY:
        return

    now = datetime.now(UTC)
    elapsed_minutes = (now - wallet.energy_updated_at).total_seconds() / 60
    regenerated = int(elapsed_minutes // ENERGY_REGEN_MINUTES)
    if regenerated <= 0:
        return

    wallet.energy = min(MAX_ENERGY, wallet.energy + regenerated)
    wallet.energy_updated_at = wallet.energy_updated_at + timedelta(
        minutes=regenerated * ENERGY_REGEN_MINUTES
    )
    await db.commit()
    await db.refresh(wallet)


async def spend_energy(db: AsyncSession, user_id: str, amount: int) -> None:
    if amount <= 0:
        return
    wallet = await get_wallet(db, user_id)
    if wallet.energy < amount:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Недостаточно энергии для открытия этой главы"
        )
    wallet.energy -= amount
    await db.commit()


async def spend_currency(
    db: AsyncSession, user_id: str, currency: CurrencyCode, amount: int, reason: str
) -> None:
    if amount <= 0:
        return
    wallet = await _get_wallet_by_user(db, user_id)
    balance = wallet.soft if currency == "SOFT" else wallet.hard
    if balance < amount:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Недостаточно {'монет' if currency == 'SOFT' else 'кристаллов'}",
        )

    if currency == "SOFT":
        wallet.soft -= amount
    else:
        wallet.hard -= amount
    db.add(
        CurrencyTransaction(
            user_id=user_id,
            currency=currency,
            amount=amount,
            type=TransactionType.SPEND,
            reason=reason,
        )
    )
    await db.commit()


async def grant_currency(
    db: AsyncSession, user_id: str, currency: CurrencyCode, amount: int, reason: str
) -> None:
    if amount <= 0:
        return
    wallet = await _get_wallet_by_user(db, user_id)
    if currency == "SOFT":
        wallet.soft += amount
    else:
        wallet.hard += amount
    db.add(
        CurrencyTransaction(
            user_id=user_id,
            currency=currency,
            amount=amount,
            type=TransactionType.GRANT,
            reason=reason,
        )
    )
    await db.commit()


def _reward_for_streak_day(day: int) -> dict:
    """Simple 7-day escalating reward table, repeating after day 7."""
    day_in_cycle = ((day - 1) % 7) + 1
    return {"soft": 20 + day_in_cycle * 10}


async def claim_daily_reward(db: AsyncSession, user_id: str) -> dict:
    state = await db.scalar(
        select(DailyRewardState).where(DailyRewardState.user_id == user_id)
    )
    if not state:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Состояние наград не найдено")

    now = datetime.now(UTC)

    if state.last_claimed_at is not None and (now - state.last_claimed_at) < DAY:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Награда за сегодня уже получена"
        )

    streak_broken = (
        state.last_claimed_at is not None and (now - state.last_claimed_at) > 2 * DAY
    )
    next_streak = (
        1 if streak_broken or state.last_claimed_at is None else state.streak + 1
    )
    reward = _reward_for_streak_day(next_streak)

    state.streak = next_streak
    state.last_claimed_at = now

    wallet = await _get_wallet_by_user(db, user_id)
    wallet.soft += reward["soft"]
    db.add(
        CurrencyTransaction(
            user_id=user_id,
            currency=CurrencyCode.SOFT,
            amount=reward["soft"],
            type=TransactionType.EARN,
            reason=f"daily_reward_day_{next_streak}",
        )
    )
    await db.commit()

    return {"streak": next_streak, "reward": reward}
