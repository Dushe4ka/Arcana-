import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import UUIDPKMixin, _utcnow


class PlayerVariableValue(Base, UUIDPKMixin):
    __tablename__ = "player_variable_values"
    __table_args__ = (UniqueConstraint("user_id", "variable_definition_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    variable_definition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("variable_definitions.id", ondelete="CASCADE")
    )
    value: Mapped[Any] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class SaveSlot(Base, UUIDPKMixin):
    __tablename__ = "save_slots"
    __table_args__ = (UniqueConstraint("user_id", "story_id", "slot_index"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    story_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stories.id", ondelete="CASCADE")
    )
    slot_index: Mapped[int] = mapped_column(Integer)
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapters.id", ondelete="SET NULL"),
        nullable=True,
    )
    current_node_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Last non-null background shown in this save slot - a dialogue node with no background
    # of its own inherits this instead of falling back to a blank screen, so authors only
    # need to set background_image_url on the node where it actually changes.
    current_background_url: Mapped[str | None] = mapped_column(String, nullable=True)
    # The narrative engine's full state for this playthrough (variables, stage, rollback
    # history, visited path, per-chapter start snapshots) - see play_service for the shape.
    # Each slot is an independent playthrough: nothing here is shared between slots.
    state: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    story: Mapped["Story"] = relationship()  # noqa: F821
    chapter: Mapped["Chapter | None"] = relationship()  # noqa: F821


class PlayerChapterUnlock(Base, UUIDPKMixin):
    __tablename__ = "player_chapter_unlocks"
    __table_args__ = (UniqueConstraint("user_id", "chapter_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE")
    )
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PlayerChoiceUnlock(Base, UUIDPKMixin):
    """A paid choice option this player already bought. Entitlements are per account, not per
    save slot: replaying, rolling back or retrying after a network error never charges twice."""

    __tablename__ = "player_choice_unlocks"
    __table_args__ = (UniqueConstraint("user_id", "choice_option_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    choice_option_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("choice_options.id", ondelete="CASCADE")
    )
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PlayerChapterCompletion(Base, UUIDPKMixin):
    """First time a player reached an END node of a chapter - the idempotency anchor for
    completion rewards (XP, soft currency), so replays and reloads never pay out again."""

    __tablename__ = "player_chapter_completions"
    __table_args__ = (UniqueConstraint("user_id", "chapter_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE")
    )
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    times_completed: Mapped[int] = mapped_column(Integer, default=1)


class PlayerEndingUnlock(Base, UUIDPKMixin):
    """An END node this player has reached - the basis for "endings found" collections."""

    __tablename__ = "player_ending_unlocks"
    __table_args__ = (UniqueConstraint("user_id", "node_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    story_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stories.id", ondelete="CASCADE")
    )
    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE")
    )
    node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scene_nodes.id", ondelete="CASCADE")
    )
    ending_key: Mapped[str | None] = mapped_column(String, nullable=True)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Favorite(Base, UUIDPKMixin):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "story_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    story_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stories.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    story: Mapped["Story"] = relationship()  # noqa: F821
