"""Import every model module here so Alembic's autogenerate (and Base.metadata) sees all tables."""

from app.models.content import (  # noqa: F401
    Chapter,
    Character,
    ChoiceOption,
    SceneNode,
    Season,
    Story,
    VariableDefinition,
)
from app.models.economy import CurrencyTransaction, DailyRewardState, Wallet  # noqa: F401
from app.models.player import PlayerChapterUnlock, PlayerVariableValue, SaveSlot  # noqa: F401
from app.models.user import PlayerProfile, RefreshToken, User  # noqa: F401
