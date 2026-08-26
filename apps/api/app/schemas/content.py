import re
from typing import Annotated, Literal

from pydantic import Field, field_validator

from app.schemas.base import CamelModel
from app.schemas.common import ConditionGroup, CurrencyCode, EffectList, LocalizedText

SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
VARIABLE_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")


# --- Stories / seasons / chapters -----------------------------------------------------------


class StoryCreateInput(CamelModel):
    slug: str = Field(min_length=2, max_length=80)
    title: LocalizedText
    description: LocalizedText | None = None
    cover_image_url: str | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError("Только латиница в нижнем регистре и дефисы")
        return v


class StoryUpdateInput(CamelModel):
    slug: str | None = None
    title: LocalizedText | None = None
    description: LocalizedText | None = None
    cover_image_url: str | None = None
    status: Literal["DRAFT", "PUBLISHED", "ARCHIVED"] | None = None


class SeasonCreateInput(CamelModel):
    story_id: str
    index: int = Field(ge=1)
    title: LocalizedText


class ChapterCreateInput(CamelModel):
    season_id: str
    index: int = Field(ge=1)
    title: LocalizedText
    # Energy (or ticket) cost to unlock this chapter. 0 = free.
    unlock_cost: int = Field(default=0, ge=0)


class ChapterUpdateInput(CamelModel):
    index: int | None = Field(default=None, ge=1)
    title: LocalizedText | None = None
    unlock_cost: int | None = Field(default=None, ge=0)
    status: Literal["DRAFT", "PUBLISHED", "ARCHIVED"] | None = None
    entry_node_id: str | None = None


# --- Characters / variables --------------------------------------------------------------


class CharacterCreateInput(CamelModel):
    story_id: str
    name: LocalizedText
    # Hex color used for the speaker name tag in the reader UI.
    name_color: str = Field(default="#E8B4BC", pattern=r"^#[0-9a-fA-F]{6}$")
    # Map of emotion/pose key -> sprite image URL, e.g. { neutral: "...", smile: "..." }.
    sprites: dict[str, str] = Field(default_factory=dict)


class CharacterUpdateInput(CamelModel):
    name: LocalizedText | None = None
    name_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    sprites: dict[str, str] | None = None


class VariableDefinitionCreateInput(CamelModel):
    story_id: str
    key: str = Field(min_length=1, max_length=40)
    label: LocalizedText
    type: Literal["NUMBER", "BOOLEAN", "STRING"] = "NUMBER"
    default_value: float | bool | str = 0
    # If set, this variable is a relationship meter tied to a specific character.
    character_id: str | None = None
    min_value: float | None = None
    max_value: float | None = None

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        if not VARIABLE_KEY_RE.match(v):
            raise ValueError("snake_case, начинается с буквы")
        return v


# --- Scene nodes ---------------------------------------------------------------------------


class StagedCharacter(CamelModel):
    """One character standing on stage during a dialogue beat."""

    character_id: str
    sprite: str = "neutral"
    position: Literal["left", "center", "right"] = "center"


class DialogueNodeData(CamelModel):
    # None speaker_character_id = narrator line.
    speaker_character_id: str | None = None
    text: LocalizedText
    is_thought: bool = False
    background_image_url: str | None = None
    staged: list[StagedCharacter] = Field(default_factory=list)
    next_node_id: str | None = None


class ChoiceNodeData(CamelModel):
    prompt: LocalizedText | None = None


class ConditionNodeData(CamelModel):
    when: ConditionGroup = Field(default_factory=list)
    then_node_id: str | None = None
    else_node_id: str | None = None


class EffectNodeData(CamelModel):
    effects: EffectList = Field(default_factory=list)
    next_node_id: str | None = None


class EndNodeData(CamelModel):
    # Marks the chapter complete and optionally unlocks the next chapter (reserved for future use).
    unlocks_next_chapter: bool = True


class DialogueNodeCreate(CamelModel):
    type: Literal["DIALOGUE"]
    chapter_id: str
    order: int = Field(default=0, ge=0)
    data: DialogueNodeData


class ChoiceNodeCreate(CamelModel):
    type: Literal["CHOICE"]
    chapter_id: str
    order: int = Field(default=0, ge=0)
    data: ChoiceNodeData


class ConditionNodeCreate(CamelModel):
    type: Literal["CONDITION"]
    chapter_id: str
    order: int = Field(default=0, ge=0)
    data: ConditionNodeData


class EffectNodeCreate(CamelModel):
    type: Literal["EFFECT"]
    chapter_id: str
    order: int = Field(default=0, ge=0)
    data: EffectNodeData


class EndNodeCreate(CamelModel):
    type: Literal["END"]
    chapter_id: str
    order: int = Field(default=0, ge=0)
    data: EndNodeData


SceneNodeCreateInput = Annotated[
    DialogueNodeCreate
    | ChoiceNodeCreate
    | ConditionNodeCreate
    | EffectNodeCreate
    | EndNodeCreate,
    Field(discriminator="type"),
]

# Maps a SceneNode's `type` to the Pydantic model that validates its `data` payload.
SCENE_NODE_DATA_SCHEMA_BY_TYPE = {
    "DIALOGUE": DialogueNodeData,
    "CHOICE": ChoiceNodeData,
    "CONDITION": ConditionNodeData,
    "EFFECT": EffectNodeData,
    "END": EndNodeData,
}


class SceneNodeUpdateInput(CamelModel):
    """Partial update: order can move, and `data` is re-validated server-side against the
    node's existing type."""

    order: int | None = Field(default=None, ge=0)
    data: dict | None = None


# --- Choice options ------------------------------------------------------------------------
# Stored as separate rows (ChoiceOption), not embedded in the CHOICE node's JSON, so the admin
# panel can create/edit/reorder/delete individual options and the future visual graph editor
# can address each one as its own node with its own edge.


class ChoiceOptionCreateInput(CamelModel):
    node_id: str
    text: LocalizedText
    order: int = Field(default=0, ge=0)
    cost_currency: CurrencyCode | None = None
    cost_amount: int = Field(default=0, ge=0)
    visible_when: ConditionGroup = Field(default_factory=list)
    effects: EffectList = Field(default_factory=list)
    next_node_id: str | None = None


class ChoiceOptionUpdateInput(CamelModel):
    text: LocalizedText | None = None
    order: int | None = Field(default=None, ge=0)
    cost_currency: CurrencyCode | None = None
    cost_amount: int | None = Field(default=None, ge=0)
    visible_when: ConditionGroup | None = None
    effects: EffectList | None = None
    next_node_id: str | None = None
