from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.common import VariableScalar


class PreviewResolveInput(CamelModel):
    node_id: str | None = None
    values: dict[str, VariableScalar] = Field(default_factory=dict)


class PreviewChooseInput(CamelModel):
    node_id: str
    choice_option_id: str
    values: dict[str, VariableScalar] = Field(default_factory=dict)


class PreviewViewOut(CamelModel):
    view: dict
    values: dict[str, VariableScalar]
