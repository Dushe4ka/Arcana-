from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles
from app.database import get_db
from app.schemas.content import (
    CharacterCreateInput,
    CharacterUpdateInput,
    VariableDefinitionCreateInput,
)
from app.schemas.responses import CharacterOut, VariableDefinitionOut
from app.services import characters_service

router = APIRouter(
    prefix="/admin",
    tags=["admin:characters"],
    dependencies=[Depends(require_roles("WRITER", "EDITOR", "ADMIN"))],
)


@router.get("/characters", response_model=list[CharacterOut])
async def list_characters(
    story_id: str = Query(alias="storyId"), db: AsyncSession = Depends(get_db)
):
    return await characters_service.list_for_story(db, story_id)


@router.post(
    "/characters", status_code=status.HTTP_201_CREATED, response_model=CharacterOut
)
async def create_character(
    body: CharacterCreateInput, db: AsyncSession = Depends(get_db)
):
    return await characters_service.create(db, body)


@router.patch("/characters/{character_id}", response_model=CharacterOut)
async def update_character(
    character_id: str, body: CharacterUpdateInput, db: AsyncSession = Depends(get_db)
):
    return await characters_service.update(db, character_id, body)


@router.delete("/characters/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(character_id: str, db: AsyncSession = Depends(get_db)):
    await characters_service.remove(db, character_id)


@router.get("/variables", response_model=list[VariableDefinitionOut])
async def list_variables(
    story_id: str = Query(alias="storyId"), db: AsyncSession = Depends(get_db)
):
    return await characters_service.list_variables(db, story_id)


@router.post(
    "/variables",
    status_code=status.HTTP_201_CREATED,
    response_model=VariableDefinitionOut,
)
async def create_variable(
    body: VariableDefinitionCreateInput, db: AsyncSession = Depends(get_db)
):
    return await characters_service.create_variable(db, body)


@router.delete("/variables/{variable_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_variable(variable_id: str, db: AsyncSession = Depends(get_db)):
    await characters_service.remove_variable(db, variable_id)
