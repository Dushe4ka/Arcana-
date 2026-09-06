"""apps/api/app/schemas/stats.py

Response shapes for the player cabinet's stats tab - a read-only view over
VariableDefinition/PlayerVariableValue, unrelated to the condition/effect engine's own
internal representation (see app/services/variables_service.py for that one).
"""

from app.schemas.base import CamelModel
from app.schemas.common import LocalizedText, VariableScalar


class RelationshipStatOut(CamelModel):
    character_id: str
    character_name: LocalizedText
    character_name_color: str
    variable_key: str
    label: LocalizedText
    value: VariableScalar
    min_value: float | None
    max_value: float | None


class GeneralStatOut(CamelModel):
    variable_key: str
    label: LocalizedText
    value: VariableScalar


class StoryStatsOut(CamelModel):
    story_id: str
    story_title: LocalizedText
    relationships: list[RelationshipStatOut]
    general: list[GeneralStatOut]
