import re
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.base import CamelModel
from app.schemas.common import ConditionGroup, CurrencyCode, EffectList, LocalizedText

SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
VARIABLE_KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")


# --- Stories / seasons / chapters -----------------------------------------------------------


STORY_GENRES = Literal["FANTASY", "ROMANCE", "DRAMA", "MYSTERY", "ADVENTURE"]


class StoryCreateInput(CamelModel):
    slug: str = Field(min_length=2, max_length=80)
    title: LocalizedText
    description: LocalizedText | None = None
    cover_image_url: str | None = None
    genre: STORY_GENRES
    is_test: bool = False

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
    genre: STORY_GENRES | None = None
    is_test: bool | None = None
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
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    # Hex color used for the speaker name tag in the reader UI.
    name_color: str = Field(default="#E8B4BC", pattern=r"^#[0-9a-fA-F]{6}$")
    # Map of emotion/pose key -> sprite image URL, e.g. { neutral: "...", smile: "..." }.
    sprites: dict[str, str] = Field(default_factory=dict)


class CharacterUpdateInput(CamelModel):
    name: LocalizedText | None = None
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    name_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    sprites: dict[str, str] | None = None
    # At most one protagonist per story - enforced in characters_service.update.
    is_protagonist: bool | None = None


class OutfitCreateInput(CamelModel):
    key: str = Field(min_length=1, max_length=40)
    label: LocalizedText
    price_hard: int = Field(default=0, ge=0)
    stat_effects: EffectList = Field(default_factory=list)


class OutfitUpdateInput(CamelModel):
    label: LocalizedText | None = None
    price_hard: int | None = Field(default=None, ge=0)
    stat_effects: EffectList | None = None


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


SpriteAnimation = Literal["none", "fade_in", "slide_in", "bounce", "shake", "nod", "lean_in"]
ScreenEffect = Literal["shake", "flash", "heartbeat", "blur_in"]
Atmosphere = Literal["none", "rain", "snow", "fog", "dust", "sparkles", "petals"]
SceneTransition = Literal["none", "fade", "dissolve", "slide"]


class StagedCharacter(CamelModel):
    """One character standing on stage during a dialogue beat."""

    character_id: str
    sprite: str = "neutral"
    position: Literal["left", "center", "right"] = "center"
    # One-shot entrance/reaction animation played when this beat is shown. Purely
    # presentational - never affects story state.
    animation: SpriteAnimation | None = None


class MusicCue(CamelModel):
    """Background music direction. `play` keeps looping across later beats until another cue
    replaces or stops it (same persistence rule as backgrounds); `stop` fades it out."""

    action: Literal["play", "stop"] = "play"
    url: str | None = None
    loop: bool = True
    volume: float = Field(default=1.0, ge=0, le=1)
    fade_ms: int = Field(default=800, ge=0, le=10000)

    @model_validator(mode="after")
    def _play_needs_url(self):
        if self.action == "play" and not self.url:
            raise ValueError("Для запуска музыки нужно выбрать трек")
        return self


class CameraCue(CamelModel):
    """Camera framing that persists until the next cue. zoom=1 and focus=center is the
    neutral framing."""

    zoom: float = Field(default=1.0, ge=1.0, le=2.0)
    focus: Literal["left", "center", "right"] = "center"
    duration_ms: int = Field(default=900, ge=0, le=10000)


class DialogueNodeData(CamelModel):
    # None speaker_character_id = narrator line.
    speaker_character_id: str | None = None
    text: LocalizedText
    is_thought: bool = False
    background_image_url: str | None = None
    staged: list[StagedCharacter] = Field(default_factory=list)
    next_node_id: str | None = None
    # --- Stage directions. All optional; an absent field means "keep whatever is already
    # on stage", so authors only set them on the beat where something changes. ---
    music: MusicCue | None = None
    sfx_url: str | None = None
    # Full-screen illustration shown instead of sprites. None = keep, "" = hide.
    cg_image_url: str | None = None
    # Persistent weather/particles layer. None = keep, "none" = clear.
    atmosphere: Atmosphere | None = None
    camera: CameraCue | None = None
    screen_effect: ScreenEffect | None = None
    transition: SceneTransition | None = None


class ChoiceNodeData(CamelModel):
    prompt: LocalizedText | None = None
    # Optional countdown: when it runs out the client submits `timeout_option_id` (which must
    # be a free, unconditional option of this node - enforced by narrative QA).
    timer_seconds: int | None = Field(default=None, ge=3, le=120)
    timeout_option_id: str | None = None


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
    # Stable key + title for endings a story wants to track ("multiple endings" collection).
    ending_key: str | None = Field(default=None, max_length=60)
    ending_title: LocalizedText | None = None
    # Soft-currency reward granted the first time this chapter is completed (never on replays).
    reward_soft: int = Field(default=0, ge=0, le=100000)


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
    DialogueNodeCreate | ChoiceNodeCreate | ConditionNodeCreate | EffectNodeCreate | EndNodeCreate,
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
    node's existing type. canvas_x/canvas_y follow the same "omitted = don't touch" rule as
    order/data - there's no way to distinguish "clear the position" from "didn't send it" in
    this scheme, which is fine here since a node's position is never meant to go back to
    unset once the author has placed it on the canvas."""

    order: int | None = Field(default=None, ge=0)
    data: dict | None = None
    canvas_x: int | None = None
    canvas_y: int | None = None


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
