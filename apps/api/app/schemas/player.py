from pydantic import Field

from app.schemas.base import CamelModel

MAX_SAVE_SLOTS = 3


class SubmitChoiceInput(CamelModel):
    """saveSlotId is taken from the URL (/play/save-slots/{id}/choice), not repeated in the body."""

    choice_option_id: str
    # The node the client believes it is answering. If the slot has already moved past it
    # (a retry after a lost response, a double tap), the server changes nothing and returns
    # the current view instead of failing or acting twice.
    node_id: str | None = None


class AdvanceInput(CamelModel):
    node_id: str | None = None


class StartChapterInput(CamelModel):
    """chapterId is taken from the URL (/play/chapters/{id}/start)."""

    slot_index: int = Field(default=1, ge=1, le=MAX_SAVE_SLOTS)
    # Start the chapter over even if this slot is in the middle of it.
    restart: bool = False
