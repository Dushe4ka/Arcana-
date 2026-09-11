from pydantic import Field

from app.models.enums import PurchaseStatus
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


class PurchaseStatusOut(CamelModel):
    """Polled by the player cabinet's /wallet return page instead of the wallet balance -
    lets it tell "still processing" apart from "done" even when the webhook credits the
    wallet before the page's first balance read."""

    id: str
    status: PurchaseStatus
    amount: int
    currency: str
