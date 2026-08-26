from typing import Literal

from pydantic import ConfigDict, Field

from app.schemas.base import CamelModel

ConditionOperator = Literal["EQ", "NEQ", "GT", "GTE", "LT", "LTE"]
EffectOperation = Literal["SET", "INCREMENT", "DECREMENT"]
CurrencyCode = Literal["SOFT", "HARD"]
VariableScalar = float | bool | str


class LocalizedText(CamelModel):
    """Localized text is stored as a JSON map of locale -> string, e.g. {"ru": "...", "en": "..."}.
    The default locale (ru) is required so content is never blank; other locales are optional
    until translated."""

    model_config = ConfigDict(extra="allow")

    ru: str = Field(min_length=1)
    en: str | None = None


class Condition(CamelModel):
    """A single condition checked against a player's variable/relationship value."""

    variable_key: str = Field(min_length=1)
    character_id: str | None = None
    operator: ConditionOperator
    value: VariableScalar


class Effect(CamelModel):
    """A mutation applied to a player's variable/relationship value when a node/choice is taken."""

    variable_key: str = Field(min_length=1)
    character_id: str | None = None
    op: EffectOperation
    value: VariableScalar


ConditionGroup = list[Condition]
EffectList = list[Effect]
