"""Import every model module here so Alembic's autogenerate (and Base.metadata) sees all tables."""

from app.models.content import (  # noqa: F401
    Chapter,
    ChapterPublication,
    Character,
    ChoiceOption,
    Outfit,
    PublishedNode,
    SceneNode,
    Season,
    Story,
    VariableDefinition,
)
from app.models.economy import CurrencyTransaction, DailyRewardState, Purchase, Wallet  # noqa: F401
from app.models.player import (  # noqa: F401
    Favorite,
    PlayerCgUnlock,
    PlayerChapterCompletion,
    PlayerChapterUnlock,
    PlayerChoiceUnlock,
    PlayerEndingUnlock,
    PlayerVariableValue,
    SaveSlot,
)
from app.models.user import CabinetLinkToken, PlayerProfile, RefreshToken, User  # noqa: F401
