from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import AuthenticatedUser, get_current_user
from app.database import get_db
from app.schemas.player import StartChapterInput, SubmitChoiceInput
from app.schemas.responses import SaveSlotOut, SaveSlotWithStoryOut
from app.services import play_service, saves_service

router = APIRouter(
    prefix="/play", tags=["play"], dependencies=[Depends(get_current_user)]
)


@router.get("/save-slots")
async def list_save_slots(
    user: AuthenticatedUser = Depends(get_current_user),
    story_id: str | None = Query(default=None, alias="storyId"),
    db: AsyncSession = Depends(get_db),
):
    if story_id:
        slots = await saves_service.list_for_story(db, user.user_id, story_id)
        return [SaveSlotOut.model_validate(s) for s in slots]
    slots = await saves_service.list_all_for_user(db, user.user_id)
    return [SaveSlotWithStoryOut.model_validate(s) for s in slots]


@router.get("/save-slots/{save_slot_id}")
async def get_current(
    save_slot_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await play_service.get_current_view(db, user.user_id, save_slot_id)


@router.delete("/save-slots/{save_slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_save_slot(
    save_slot_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await saves_service.remove(db, user.user_id, save_slot_id)


@router.post("/save-slots/{save_slot_id}/advance")
async def advance(
    save_slot_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await play_service.advance(db, user.user_id, save_slot_id)


@router.post("/save-slots/{save_slot_id}/choice")
async def submit_choice(
    save_slot_id: str,
    body: SubmitChoiceInput,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await play_service.submit_choice(
        db, user.user_id, save_slot_id, body.choice_option_id
    )


@router.post("/chapters/{chapter_id}/start")
async def start_chapter(
    chapter_id: str,
    body: StartChapterInput,
    user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await play_service.start_chapter(
        db, user.user_id, chapter_id, body.slot_index
    )
