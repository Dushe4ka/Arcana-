import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import CurrencyCode, PurchaseStatus, TransactionType
from app.models.mixins import TimestampMixin, UUIDPKMixin, _utcnow
from app.models.user import User

# Going from level N to N+1 costs LEVEL_XP_STEP * N xp (level 12 -> 13 costs 1200).
LEVEL_XP_STEP = 100


def compute_level(total_xp: int) -> tuple[int, int, int]:
    """Returns (level, xp_into_level, xp_for_next_level) for a cumulative xp total."""
    level = 1
    remaining = total_xp
    while True:
        needed = LEVEL_XP_STEP * level
        if remaining < needed:
            return level, remaining, needed
        remaining -= needed
        level += 1


class Wallet(Base, UUIDPKMixin):
    __tablename__ = "wallets"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    # Free-earned currency, e.g. coins won by playing.
    soft: Mapped[int] = mapped_column(Integer, default=100)
    # Premium currency bought with real money.
    hard: Mapped[int] = mapped_column(Integer, default=0)
    # Ticket/energy balance spent to unlock chapters. Regenerates over time.
    energy: Mapped[int] = mapped_column(Integer, default=20)
    energy_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # Cumulative experience - level/progress are derived (see compute_level), never stored.
    xp: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user: Mapped[User] = relationship(back_populates="wallet")

    @property
    def level(self) -> int:
        return compute_level(self.xp)[0]

    @property
    def xp_into_level(self) -> int:
        return compute_level(self.xp)[1]

    @property
    def xp_for_next_level(self) -> int:
        return compute_level(self.xp)[2]


class CurrencyTransaction(Base, UUIDPKMixin):
    __tablename__ = "currency_transactions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    currency: Mapped[CurrencyCode] = mapped_column()
    amount: Mapped[int] = mapped_column(Integer)
    type: Mapped[TransactionType] = mapped_column()
    reason: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class DailyRewardState(Base, UUIDPKMixin):
    __tablename__ = "daily_reward_states"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    streak: Mapped[int] = mapped_column(Integer, default=0)
    last_claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user: Mapped[User] = relationship(back_populates="daily_reward")


class Purchase(Base, UUIDPKMixin, TimestampMixin):
    """One HARD-currency purchase attempt via YooKassa. `provider_payment_id` is unique so a
    webhook can look up the purchase it's about; `status` starts PENDING and is only ever
    flipped to COMPLETED by payments_service.handle_webhook after re-confirming the payment's
    real status with YooKassa's own API (never from the webhook body directly)."""

    __tablename__ = "purchases"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    currency: Mapped[CurrencyCode] = mapped_column()
    amount: Mapped[int] = mapped_column(Integer)
    price_rub_kopecks: Mapped[int] = mapped_column(Integer)
    provider: Mapped[str] = mapped_column(String, default="yookassa")
    provider_payment_id: Mapped[str] = mapped_column(String, unique=True)
    status: Mapped[PurchaseStatus] = mapped_column(default=PurchaseStatus.PENDING)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
