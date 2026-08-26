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
