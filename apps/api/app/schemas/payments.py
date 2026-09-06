from pydantic import Field

from app.schemas.base import CamelModel


class PackageOut(CamelModel):
    id: str
    currency: str
    amount: int
    price_rub_kopecks: int


class CreatePurchaseInput(CamelModel):
    package_id: str = Field(min_length=1)


class CreatePurchaseOut(CamelModel):
    confirmation_url: str
