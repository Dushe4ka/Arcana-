import enum


class UserRole(str, enum.Enum):
    PLAYER = "PLAYER"
    WRITER = "WRITER"
    EDITOR = "EDITOR"
    ADMIN = "ADMIN"


class ContentStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class StoryGenre(str, enum.Enum):
    FANTASY = "FANTASY"
    ROMANCE = "ROMANCE"
    DRAMA = "DRAMA"
    MYSTERY = "MYSTERY"
    ADVENTURE = "ADVENTURE"


class StoryFormat(str, enum.Enum):
    """Which section of the app a story lives in: the library (novels) or the cinema hall
    (short mini-series). The reading engine treats both the same."""

    NOVEL = "NOVEL"
    SERIES = "SERIES"


class SceneNodeType(str, enum.Enum):
    DIALOGUE = "DIALOGUE"
    CHOICE = "CHOICE"
    CONDITION = "CONDITION"
    EFFECT = "EFFECT"
    END = "END"


class CurrencyCode(str, enum.Enum):
    SOFT = "SOFT"
    HARD = "HARD"


class VariableType(str, enum.Enum):
    NUMBER = "NUMBER"
    BOOLEAN = "BOOLEAN"
    STRING = "STRING"


class TransactionType(str, enum.Enum):
    EARN = "EARN"
    SPEND = "SPEND"
    PURCHASE = "PURCHASE"
    GRANT = "GRANT"


class PurchaseStatus(str, enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELED = "CANCELED"
