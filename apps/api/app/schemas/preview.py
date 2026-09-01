from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.common import VariableScalar


class PreviewResolveInput(CamelModel):
    node_id: str | None = None
    background_url: str | None = None
    values: dict[str, VariableScalar] = Field(default_factory=dict)


class PreviewChooseInput(CamelModel):
    node_id: str
    choice_option_id: str
    background_url: str | None = None
    values: dict[str, VariableScalar] = Field(default_factory=dict)


class PreviewViewOut(CamelModel):
    view: dict
    background_url: str | None = None
    values: dict[str, VariableScalar]
