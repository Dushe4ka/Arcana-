from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.database import get_db
from app.schemas.content import (
    ChoiceOptionCreateInput,
    ChoiceOptionUpdateInput,
    SceneNodeCreateInput,
    SceneNodeUpdateInput,
)
from app.schemas.responses import ChoiceOptionOut, SceneNodeOut
from app.services import scenes_service

router = APIRouter(
    prefix="/admin",
    tags=["admin:scenes"],
    dependencies=[Depends(require_roles("WRITER", "EDITOR", "ADMIN"))],
)


@router.get("/scene-nodes", response_model=list[SceneNodeOut])
async def list_nodes(
    chapter_id: str = Query(alias="chapterId"), db: AsyncSession = Depends(get_db)
):
    return await scenes_service.list_for_chapter(db, chapter_id)


@router.post(
    "/scene-nodes", status_code=status.HTTP_201_CREATED, response_model=SceneNodeOut
)
async def create_node(body: SceneNodeCreateInput, db: AsyncSession = Depends(get_db)):
    return await scenes_service.create_node(db, body)


@router.patch("/scene-nodes/{node_id}", response_model=SceneNodeOut)
async def update_node(
    node_id: str, body: SceneNodeUpdateInput, db: AsyncSession = Depends(get_db)
):
    return await scenes_service.update_node(db, node_id, body)


@router.delete("/scene-nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(node_id: str, db: AsyncSession = Depends(get_db)):
    await scenes_service.remove_node(db, node_id)


@router.post(
    "/choice-options",
    status_code=status.HTTP_201_CREATED,
    response_model=ChoiceOptionOut,
)
async def create_choice(
    body: ChoiceOptionCreateInput, db: AsyncSession = Depends(get_db)
):
    return await scenes_service.create_choice_option(db, body)


@router.patch("/choice-options/{option_id}", response_model=ChoiceOptionOut)
async def update_choice(
    option_id: str, body: ChoiceOptionUpdateInput, db: AsyncSession = Depends(get_db)
):
    return await scenes_service.update_choice_option(db, option_id, body)


@router.delete("/choice-options/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_choice(option_id: str, db: AsyncSession = Depends(get_db)):
    await scenes_service.remove_choice_option(db, option_id)
