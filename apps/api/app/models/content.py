import uuid
from typing import Any

from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import ContentStatus, CurrencyCode, SceneNodeType, VariableType
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Story(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "stories"

    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    title: Mapped[dict] = mapped_column(JSONB)
    description: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[ContentStatus] = mapped_column(default=ContentStatus.DRAFT)

    seasons: Mapped[list["Season"]] = relationship(
        back_populates="story", cascade="all, delete-orphan"
    )
    characters: Mapped[list["Character"]] = relationship(
        back_populates="story", cascade="all, delete-orphan"
    )
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
        back_populates="season", cascade="all, delete-orphan"
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

    season: Mapped[Season] = relationship(back_populates="chapters")
    entry_node: Mapped["SceneNode | None"] = relationship(foreign_keys=[entry_node_id])
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

    chapter: Mapped[Chapter] = relationship(
        back_populates="nodes", foreign_keys=[chapter_id]
    )
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
    next_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    node: Mapped[SceneNode] = relationship(back_populates="choice_options")


class Character(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "characters"

    story_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stories.id", ondelete="CASCADE")
    )
    name: Mapped[dict] = mapped_column(JSONB)
    name_color: Mapped[str] = mapped_column(String, default="#E8B4BC")
    # Map of emotion/pose key -> sprite image URL.
    sprites: Mapped[dict] = mapped_column(JSONB, default=dict)

    story: Mapped[Story] = relationship(back_populates="characters")
    variable_definitions: Mapped[list["VariableDefinition"]] = relationship(
        back_populates="character"
    )


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
    character: Mapped[Character | None] = relationship(
        back_populates="variable_definitions"
    )
