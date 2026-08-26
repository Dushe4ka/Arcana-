"""Read/response schemas: every route that returns an ORM object goes through one of these
(response_model=...), so FastAPI knows how to serialize it and so the OpenAPI docs describe
the real response shape for whoever builds the admin panel or mobile app against this API."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import ConfigDict
from pydantic.alias_generators import to_camel

from app.schemas.base import CamelModel
from app.schemas.common import LocalizedText


class ORMModel(CamelModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


class ChoiceOptionOut(ORMModel):
    id: uuid.UUID
    node_id: uuid.UUID
    order: int
    text: LocalizedText
    cost_currency: str | None
    cost_amount: int
    visible_when: list[dict[str, Any]]
    effects: list[dict[str, Any]]
    next_node_id: uuid.UUID | None


class SceneNodeOut(ORMModel):
    id: uuid.UUID
    chapter_id: uuid.UUID
    type: str
    order: int
    data: dict[str, Any]
    choice_options: list[ChoiceOptionOut] = []


class CharacterOut(ORMModel):
    id: uuid.UUID
    story_id: uuid.UUID
    name: LocalizedText
    name_color: str
    sprites: dict[str, str]


class VariableDefinitionOut(ORMModel):
    id: uuid.UUID
    story_id: uuid.UUID
    key: str
    label: LocalizedText
    type: str
    default_value: Any
    character_id: uuid.UUID | None
    min_value: float | None
    max_value: float | None


class ChapterOut(ORMModel):
    id: uuid.UUID
    season_id: uuid.UUID
    index: int
    title: LocalizedText
    status: str
    unlock_cost: int
    entry_node_id: uuid.UUID | None


class ChapterDetailOut(ChapterOut):
    nodes: list[SceneNodeOut] = []


class SeasonOut(ORMModel):
    id: uuid.UUID
    story_id: uuid.UUID
    index: int
    title: LocalizedText
    chapters: list[ChapterOut] = []


class StoryOut(ORMModel):
    id: uuid.UUID
    slug: str
    title: LocalizedText
    description: LocalizedText | None
    cover_image_url: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class StoryPublicDetailOut(StoryOut):
    """Used by the public catalog - no variable definitions (those are authoring metadata,
    not something the mobile app needs)."""

    seasons: list[SeasonOut] = []
    characters: list[CharacterOut] = []


class StoryDetailOut(StoryOut):
    """Used by the admin panel - includes everything a writer needs to see."""

    seasons: list[SeasonOut] = []
    characters: list[CharacterOut] = []
    variable_definitions: list[VariableDefinitionOut] = []


class SaveSlotChapterSummary(ORMModel):
    id: uuid.UUID
    title: LocalizedText
    index: int


class SaveSlotStorySummary(ORMModel):
    id: uuid.UUID
    title: LocalizedText
    cover_image_url: str | None


class SaveSlotOut(ORMModel):
    id: uuid.UUID
    slot_index: int
    story_id: uuid.UUID
    chapter_id: uuid.UUID | None
    updated_at: datetime
    chapter: SaveSlotChapterSummary | None = None


class SaveSlotWithStoryOut(SaveSlotOut):
    story: SaveSlotStorySummary


class WalletOut(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    soft: int
    hard: int
    energy: int
    energy_updated_at: datetime
    updated_at: datetime
