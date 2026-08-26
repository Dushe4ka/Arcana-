from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for request/response schemas: Python fields stay snake_case, but JSON in/out is
    camelCase - matching what the admin panel and mobile app (TypeScript) expect."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
