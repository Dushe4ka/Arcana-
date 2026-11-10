import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import (
    ContentStatus,
    CurrencyCode,
    SceneNodeType,
    StoryGenre,
    VariableType,
)
from app.models.mixins import TimestampMixin, UUIDPKMixin, _utcnow


class Story(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "stories"

    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    title: Mapped[dict] = mapped_column(JSONB)
    description: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[ContentStatus] = mapped_column(default=ContentStatus.DRAFT)
    # Single primary genre - drives which library shelf a story appears on in the app.
    genre: Mapped[StoryGenre] = mapped_column(default=StoryGenre.ROMANCE)
    # Technical/QA stories (e.g. "ARCANA ENGINE TEST"): never listed for players, even when
    # published - only staff accounts see and can play them.
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Always in reading order - clients render these lists as-is.
    seasons: Mapped[list["Season"]] = relationship(
        back_populates="story", cascade="all, delete-orphan", order_by="Season.index"
    )
    characters: Mapped[list["Character"]] = relationship(back_populates="story", cascade="all, delete-orphan")
    variable_definitions: Mapped[list["VariableDefinition"]] = relationship(
        back_populates="story", cascade="all, delete-orphan"
    )


class Season(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "seasons"
    __table_args__ = (UniqueConstraint("story_id", "index"),)

    story_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stories.id", ondelete="CASCADE")
    )
    index: Mapped[int] = mapped_column(Integer)
    title: Mapped[dict] = mapped_column(JSONB)

    story: Mapped[Story] = relationship(back_populates="seasons")
    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="season", cascade="all, delete-orphan", order_by="Chapter.index"
    )


class Chapter(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "chapters"
    __table_args__ = (UniqueConstraint("season_id", "index"),)

    season_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("seasons.id", ondelete="CASCADE")
    )
    index: Mapped[int] = mapped_column(Integer)
    title: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[ContentStatus] = mapped_column(default=ContentStatus.DRAFT)
    unlock_cost: Mapped[int] = mapped_column(Integer, default=0)
    entry_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scene_nodes.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
        unique=True,
    )

    # Which frozen publication (see ChapterPublication) players currently read. Null = never
    # published. Editing nodes never changes what players see until a new publication is made.
    published_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    season: Mapped[Season] = relationship(back_populates="chapters")
    entry_node: Mapped["SceneNode | None"] = relationship(foreign_keys=[entry_node_id], post_update=True)
    nodes: Mapped[list["SceneNode"]] = relationship(
        back_populates="chapter",
        foreign_keys="SceneNode.chapter_id",
        cascade="all, delete-orphan",
    )


class SceneNode(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "scene_nodes"

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[SceneNodeType] = mapped_column()
    order: Mapped[int] = mapped_column(Integer, default=0)
    # Type-specific payload, shape validated by Pydantic schemas (see app/schemas/content.py).
    data: Mapped[dict] = mapped_column(JSONB)
    # Graph editor node position (admin panel only) - null until an author drags the node at
    # least once. Never read by the reading engine.
    canvas_x: Mapped[int | None] = mapped_column(Integer, nullable=True)
    canvas_y: Mapped[int | None] = mapped_column(Integer, nullable=True)

    chapter: Mapped[Chapter] = relationship(back_populates="nodes", foreign_keys=[chapter_id])
    choice_options: Mapped[list["ChoiceOption"]] = relationship(
        back_populates="node", cascade="all, delete-orphan"
    )


class ChoiceOption(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "choice_options"

    node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scene_nodes.id", ondelete="CASCADE"), index=True
    )
    order: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[dict] = mapped_column(JSONB)
    cost_currency: Mapped[CurrencyCode | None] = mapped_column(nullable=True)
    cost_amount: Mapped[int] = mapped_column(Integer, default=0)
    # ConditionGroup - who can see this option.
    visible_when: Mapped[list] = mapped_column(JSONB, default=list)
    # EffectList - applied when this option is chosen.
    effects: Mapped[list] = mapped_column(JSONB, default=list)
    next_node_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    node: Mapped[SceneNode] = relationship(back_populates="choice_options")


class ChapterPublication(Base, UUIDPKMixin):
    """One published version of a chapter: an immutable copy of its scene graph taken at
    publish time (rows in `published_nodes`). Players always read a publication, never the
    editable nodes - so a writer can rework a live chapter safely, and a bad release can be
    rolled back by re-activating an earlier version."""

    __tablename__ = "chapter_publications"
    __table_args__ = (UniqueConstraint("chapter_id", "version"),)

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    entry_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    node_count: Mapped[int] = mapped_column(Integer, default=0)
    published_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class PublishedNode(Base, UUIDPKMixin):
    """A scene node as it was at publish time, with its choice options embedded. `node_id`
    is the id of the editable node it was copied from (ids are stable across versions, so
    saves keep pointing at the right beat after a republish)."""

    __tablename__ = "published_nodes"
    __table_args__ = (UniqueConstraint("chapter_id", "version", "node_id"),)

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chapters.id", ondelete="CASCADE")
    )
    version: Mapped[int] = mapped_column(Integer)
    node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    type: Mapped[SceneNodeType] = mapped_column()
    data: Mapped[dict] = mapped_column(JSONB)
    options: Mapped[list] = mapped_column(JSONB, default=list)


class Character(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "characters"

    story_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stories.id", ondelete="CASCADE")
    )
    name: Mapped[dict] = mapped_column(JSONB)
    first_name: Mapped[str | None] = mapped_column(String, nullable=True)
    last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    name_color: Mapped[str] = mapped_column(String, default="#E8B4BC")
    # Map of emotion/pose key -> sprite image URL.
    sprites: Mapped[dict] = mapped_column(JSONB, default=dict)
    # At most one protagonist per story (enforced in characters_service.update).
    is_protagonist: Mapped[bool] = mapped_column(Boolean, default=False)

    story: Mapped[Story] = relationship(back_populates="characters")
    variable_definitions: Mapped[list["VariableDefinition"]] = relationship(back_populates="character")


class Outfit(Base, UUIDPKMixin, TimestampMixin):
    """A purchasable/selectable outfit for one character - `key` matches the outfit column
    name already used in `Character.sprites` (e.g. "dress" -> sprite key "dress_smile"). Price
    and stat_effects are what the player-facing "Смена наряда" choice is built from; the
    sprite images themselves stay in Character.sprites, untouched by this table."""

    __tablename__ = "outfits"

    character_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("characters.id", ondelete="CASCADE")
    )
    key: Mapped[str] = mapped_column(String)
    label: Mapped[dict] = mapped_column(JSONB)
    price_hard: Mapped[int] = mapped_column(Integer, default=0)
    stat_effects: Mapped[list] = mapped_column(JSONB, default=list)

    character: Mapped[Character] = relationship()


class VariableDefinition(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "variable_definitions"
    __table_args__ = (UniqueConstraint("story_id", "key", "character_id"),)

    story_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stories.id", ondelete="CASCADE")
    )
    key: Mapped[str] = mapped_column(String)
    label: Mapped[dict] = mapped_column(JSONB)
    type: Mapped[VariableType] = mapped_column(default=VariableType.NUMBER)
    default_value: Mapped[Any] = mapped_column(JSONB)
    # Set when this is a relationship meter tied to one character; null = general characteristic.
    character_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=True,
    )
    min_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_value: Mapped[float | None] = mapped_column(Float, nullable=True)

    story: Mapped[Story] = relationship(back_populates="variable_definitions")
    character: Mapped[Character | None] = relationship(back_populates="variable_definitions")
