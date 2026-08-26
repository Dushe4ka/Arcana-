import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import CurrencyCode, TransactionType
from app.models.mixins import UUIDPKMixin, _utcnow
from app.models.user import User


class Wallet(Base, UUIDPKMixin):
    __tablename__ = "wallets"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    # Free-earned currency, e.g. coins won by playing.
    soft: Mapped[int] = mapped_column(Integer, default=100)
    # Premium currency bought with real money.
    hard: Mapped[int] = mapped_column(Integer, default=0)
    # Ticket/energy balance spent to unlock chapters. Regenerates over time.
    energy: Mapped[int] = mapped_column(Integer, default=20)
    energy_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user: Mapped[User] = relationship(back_populates="wallet")


class CurrencyTransaction(Base, UUIDPKMixin):
    __tablename__ = "currency_transactions"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    currency: Mapped[CurrencyCode] = mapped_column()
    amount: Mapped[int] = mapped_column(Integer)
    type: Mapped[TransactionType] = mapped_column()
    reason: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class DailyRewardState(Base, UUIDPKMixin):
    __tablename__ = "daily_reward_states"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    last_claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    user: Mapped[User] = relationship(back_populates="daily_reward")
