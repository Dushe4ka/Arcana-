from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Character, VariableDefinition
from app.schemas.content import (
    CharacterCreateInput,
    CharacterUpdateInput,
    VariableDefinitionCreateInput,
)


async def list_for_story(db: AsyncSession, story_id: str) -> list[Character]:
    result = await db.scalars(select(Character).where(Character.story_id == story_id))
    return list(result)


async def create(db: AsyncSession, data: CharacterCreateInput) -> Character:
    character = Character(**data.model_dump())
    db.add(character)
    await db.commit()
    await db.refresh(character)
    return character


async def update(
    db: AsyncSession, character_id: str, data: CharacterUpdateInput
) -> Character:
    character = await db.get(Character, character_id)
    if not character:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Персонаж не найден")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(character, field, value)
    await db.commit()
    await db.refresh(character)
    return character


async def remove(db: AsyncSession, character_id: str) -> None:
    character = await db.get(Character, character_id)
    if not character:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Персонаж не найден")
    await db.delete(character)
    await db.commit()


async def list_variables(db: AsyncSession, story_id: str) -> list[VariableDefinition]:
    result = await db.scalars(
        select(VariableDefinition).where(VariableDefinition.story_id == story_id)
    )
    return list(result)


async def create_variable(
    db: AsyncSession, data: VariableDefinitionCreateInput
) -> VariableDefinition:
    variable = VariableDefinition(**data.model_dump())
    db.add(variable)
    await db.commit()
    await db.refresh(variable)
    return variable


async def remove_variable(db: AsyncSession, variable_id: str) -> None:
    variable = await db.get(VariableDefinition, variable_id)
    if not variable:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Переменная не найдена")
    await db.delete(variable)
    await db.commit()
