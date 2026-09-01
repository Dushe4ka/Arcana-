from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.database import get_db
from app.schemas.preview import PreviewChooseInput, PreviewResolveInput, PreviewViewOut
from app.services import preview_service

router = APIRouter(
    prefix="/admin/preview",
    tags=["admin:preview"],
    dependencies=[Depends(require_roles("WRITER", "EDITOR", "ADMIN"))],
)


@router.post("/chapters/{chapter_id}", response_model=PreviewViewOut)
async def resolve_preview(chapter_id: str, body: PreviewResolveInput, db: AsyncSession = Depends(get_db)):
    view, values = await preview_service.resolve(db, chapter_id, body.node_id, body.values)
    return PreviewViewOut(view=view, values=values)


@router.post("/chapters/{chapter_id}/choose", response_model=PreviewViewOut)
async def choose_preview(chapter_id: str, body: PreviewChooseInput, db: AsyncSession = Depends(get_db)):
    view, values = await preview_service.choose(
        db, chapter_id, body.node_id, body.choice_option_id, body.values
    )
    return PreviewViewOut(view=view, values=values)
