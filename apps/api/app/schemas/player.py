from pydantic import Field

from app.schemas.base import CamelModel

MAX_SAVE_SLOTS = 3


class SubmitChoiceInput(CamelModel):
    """saveSlotId is taken from the URL (/play/save-slots/{id}/choice), not repeated in the body."""

    choice_option_id: str


class StartChapterInput(CamelModel):
    """chapterId is taken from the URL (/play/chapters/{id}/start)."""

    slot_index: int = Field(default=1, ge=1, le=MAX_SAVE_SLOTS)
