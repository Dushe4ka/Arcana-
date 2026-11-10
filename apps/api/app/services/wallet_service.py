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


async def _get_wallet_by_user(db: AsyncSession, user_id: str, *, for_update: bool = False) -> Wallet:
    query = select(Wallet).where(Wallet.user_id == user_id)
    if for_update:
        query = query.with_for_update()
    wallet = await db.scalar(query)
    if not wallet:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Кошелёк не найден")
    return wallet


async def lock_wallet(db: AsyncSession, user_id: str) -> Wallet:
    """Takes the wallet row lock for the rest of the current transaction."""
    return await _get_wallet_by_user(db, user_id, for_update=True)


async def _apply_energy_regen(db: AsyncSession, wallet: Wallet) -> None:
    """Recomputes energy based on elapsed time and persists it if it changed. Pure "lazy
    regen" - no cron needed."""
    if _regen_in_place(wallet):
        await db.commit()
        await db.refresh(wallet)


def _regen_in_place(wallet: Wallet) -> bool:
    if wallet.energy >= MAX_ENERGY:
        return False
    elapsed_minutes = (datetime.now(UTC) - wallet.energy_updated_at).total_seconds() / 60
    regenerated = int(elapsed_minutes // ENERGY_REGEN_MINUTES)
    if regenerated <= 0:
        return False
    wallet.energy = min(MAX_ENERGY, wallet.energy + regenerated)
    wallet.energy_updated_at = wallet.energy_updated_at + timedelta(
        minutes=regenerated * ENERGY_REGEN_MINUTES
    )
    return True


# Every mutation below locks the wallet row (SELECT ... FOR UPDATE) so two concurrent requests
# can never both pass the balance check and overdraw it. `commit=False` lets a caller make
# the wallet change part of a larger atomic operation (e.g. "charge for a choice AND move
# the story forward") - the caller then owns the commit.


async def spend_energy(db: AsyncSession, user_id: str, amount: int, *, commit: bool = True) -> None:
    if amount <= 0:
        return
    wallet = await _get_wallet_by_user(db, user_id, for_update=True)
    _regen_in_place(wallet)
    if wallet.energy < amount:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Недостаточно энергии для открытия этой главы")
    if wallet.energy >= MAX_ENERGY:
        # Regen is measured from the moment energy first drops below the cap.
        wallet.energy_updated_at = datetime.now(UTC)
    wallet.energy -= amount
    if commit:
        await db.commit()


async def spend_currency(
    db: AsyncSession, user_id: str, currency: CurrencyCode, amount: int, reason: str, *, commit: bool = True
) -> None:
    if amount <= 0:
        return
    wallet = await _get_wallet_by_user(db, user_id, for_update=True)
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
    if commit:
        await db.commit()


async def grant_xp(db: AsyncSession, user_id: str, amount: int, reason: str, *, commit: bool = True) -> None:
    if amount <= 0:
        return
    wallet = await _get_wallet_by_user(db, user_id, for_update=True)
    wallet.xp += amount
    if commit:
        await db.commit()


async def grant_currency(
    db: AsyncSession,
    user_id: str,
    currency: CurrencyCode,
    amount: int,
    reason: str,
    *,
    transaction_type: TransactionType = TransactionType.GRANT,
    commit: bool = True,
) -> None:
    if amount <= 0:
        return
    wallet = await _get_wallet_by_user(db, user_id, for_update=True)
    if currency == "SOFT":
        wallet.soft += amount
    else:
        wallet.hard += amount
    db.add(
        CurrencyTransaction(
            user_id=user_id,
            currency=currency,
            amount=amount,
            type=transaction_type,
            reason=reason,
        )
    )
    if commit:
        await db.commit()


def _reward_for_streak_day(day: int) -> dict:
    """Simple 7-day escalating reward table, repeating after day 7."""
    day_in_cycle = ((day - 1) % 7) + 1
    return {"soft": 20 + day_in_cycle * 10}


async def claim_daily_reward(db: AsyncSession, user_id: str) -> dict:
    # Locked so two simultaneous taps can't both pass the "already claimed today" check.
    state = await db.scalar(
        select(DailyRewardState).where(DailyRewardState.user_id == user_id).with_for_update()
    )
    if not state:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Состояние наград не найдено")

    now = datetime.now(UTC)

    if state.last_claimed_at is not None and (now - state.last_claimed_at) < DAY:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Награда за сегодня уже получена")

    streak_broken = state.last_claimed_at is not None and (now - state.last_claimed_at) > 2 * DAY
    next_streak = 1 if streak_broken or state.last_claimed_at is None else state.streak + 1
    reward = _reward_for_streak_day(next_streak)

    state.streak = next_streak
    state.last_claimed_at = now

    wallet = await _get_wallet_by_user(db, user_id, for_update=True)
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
