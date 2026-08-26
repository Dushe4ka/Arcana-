from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import ChoiceOption, SceneNode
from app.schemas.content import (
    SCENE_NODE_DATA_SCHEMA_BY_TYPE,
    ChoiceOptionCreateInput,
    ChoiceOptionUpdateInput,
    SceneNodeCreateInput,
    SceneNodeUpdateInput,
)


async def list_for_chapter(db: AsyncSession, chapter_id: str) -> list[SceneNode]:
    result = await db.scalars(
        select(SceneNode)
        .where(SceneNode.chapter_id == chapter_id)
        .options(selectinload(SceneNode.choice_options))
    )
    nodes = list(result)
    nodes.sort(key=lambda n: n.order)
    for node in nodes:
        node.choice_options.sort(key=lambda o: o.order)
    return nodes


async def create_node(db: AsyncSession, data: SceneNodeCreateInput) -> SceneNode:
    node = SceneNode(
        chapter_id=data.chapter_id,
        type=data.type,
        order=data.order,
        data=data.data.model_dump(),
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return node


async def update_node(
    db: AsyncSession, node_id: str, data: SceneNodeUpdateInput
) -> SceneNode:
    node = await _require_node(db, node_id)

    new_data = node.data
    if data.data is not None:
        schema = SCENE_NODE_DATA_SCHEMA_BY_TYPE[node.type.value]
        try:
            validated = schema.model_validate(data.data)
        except Exception as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                {
                    "message": f"Некорректные данные для узла типа {node.type.value}",
                    "issues": str(exc),
                },
            ) from exc
        new_data = validated.model_dump()

    if data.order is not None:
        node.order = data.order
    node.data = new_data
    await db.commit()
    await db.refresh(node)
    return node


async def remove_node(db: AsyncSession, node_id: str) -> None:
    node = await _require_node(db, node_id)
    await db.delete(node)
    await db.commit()


# --- Choice options -----------------------------------------------------------------------


async def create_choice_option(
    db: AsyncSession, data: ChoiceOptionCreateInput
) -> ChoiceOption:
    node = await _require_node(db, data.node_id)
    if node.type.value != "CHOICE":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Варианты выбора можно добавлять только к узлам типа CHOICE",
        )

    option = ChoiceOption(**data.model_dump())
    db.add(option)
    await db.commit()
    await db.refresh(option)
    return option


async def update_choice_option(
    db: AsyncSession, option_id: str, data: ChoiceOptionUpdateInput
) -> ChoiceOption:
    option = await _require_choice(db, option_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(option, field, value)
    await db.commit()
    await db.refresh(option)
    return option


async def remove_choice_option(db: AsyncSession, option_id: str) -> None:
    option = await _require_choice(db, option_id)
    await db.delete(option)
    await db.commit()


# --- helpers -------------------------------------------------------------------------------


async def _require_node(db: AsyncSession, node_id: str) -> SceneNode:
    node = await db.get(SceneNode, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сцена не найдена")
    return node


async def _require_choice(db: AsyncSession, option_id: str) -> ChoiceOption:
    option = await db.get(ChoiceOption, option_id)
    if not option:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Вариант выбора не найден")
    return option
