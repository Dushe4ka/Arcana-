from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine.condition_engine import evaluate_condition_group
from app.models.content import Chapter, Character, ChoiceOption, SceneNode
from app.models.player import PlayerChapterUnlock, SaveSlot
from app.schemas.common import Condition, Effect
from app.schemas.content import (
    ChoiceNodeData,
    ConditionNodeData,
    DialogueNodeData,
    EffectNodeData,
)
from app.services import variables_service, wallet_service

MAX_AUTO_TRAVERSAL_STEPS = 100


# ---------------------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------------------


async def start_chapter(
    db: AsyncSession, user_id: str, chapter_id: str, slot_index: int
) -> dict:
    chapter = await db.scalar(
        select(Chapter)
        .where(Chapter.id == chapter_id)
        .options(selectinload(Chapter.season))
    )
    if not chapter or chapter.status.value != "PUBLISHED":
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Глава не найдена или ещё не опубликована"
        )
    if not chapter.entry_node_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "У главы не задана начальная сцена"
        )

    story_id = str(chapter.season.story_id)

    existing_unlock = await db.scalar(
        select(PlayerChapterUnlock).where(
            PlayerChapterUnlock.user_id == user_id,
            PlayerChapterUnlock.chapter_id == chapter_id,
        )
    )
    if not existing_unlock:
        if chapter.unlock_cost > 0:
            await wallet_service.spend_energy(db, user_id, chapter.unlock_cost)
        db.add(PlayerChapterUnlock(user_id=user_id, chapter_id=chapter_id))
        await db.commit()

    slot = await db.scalar(
        select(SaveSlot).where(
            SaveSlot.user_id == user_id,
            SaveSlot.story_id == story_id,
            SaveSlot.slot_index == slot_index,
        )
    )
    if not slot:
        slot = SaveSlot(
            user_id=user_id,
            story_id=story_id,
            slot_index=slot_index,
            chapter_id=chapter_id,
            current_node_id=chapter.entry_node_id,
        )
        db.add(slot)
        await db.commit()
        await db.refresh(slot)
    elif str(slot.chapter_id) != str(chapter_id):
        slot.chapter_id = chapter_id
        slot.current_node_id = chapter.entry_node_id
        await db.commit()

    return await _resolve_view(db, user_id, slot)


async def advance(db: AsyncSession, user_id: str, save_slot_id: str) -> dict:
    slot = await _get_owned_slot(db, user_id, save_slot_id)
    node = await _get_node(db, slot.current_node_id)

    if node.type.value != "DIALOGUE":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "В этой сцене нужно сделать выбор, а не просто продолжить",
        )
    data = DialogueNodeData.model_validate(node.data)
    if not data.next_node_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "У этой сцены нет продолжения")

    slot.current_node_id = data.next_node_id
    await db.commit()
    return await _resolve_view(db, user_id, slot)


async def submit_choice(
    db: AsyncSession, user_id: str, save_slot_id: str, choice_option_id: str
) -> dict:
    slot = await _get_owned_slot(db, user_id, save_slot_id)
    node = await _get_node(db, slot.current_node_id)

    if node.type.value != "CHOICE":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "В текущей сцене нет вариантов выбора"
        )

    option = await db.get(ChoiceOption, choice_option_id)
    if not option or str(option.node_id) != str(node.id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Этот вариант недоступен в текущей сцене"
        )

    context = await variables_service.load_context(db, user_id, str(slot.story_id))

    visible_when = [Condition.model_validate(c) for c in option.visible_when]
    if not evaluate_condition_group(visible_when, context.as_value_map()):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Этот вариант выбора сейчас недоступен"
        )

    if option.cost_currency and option.cost_amount > 0:
        await wallet_service.spend_currency(
            db,
            user_id,
            option.cost_currency.value,
            option.cost_amount,
            f"choice:{option.id}",
        )

    effects = [Effect.model_validate(e) for e in option.effects]
    await variables_service.apply_effects(db, user_id, str(slot.story_id), effects)

    if not option.next_node_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "У этого варианта не задано продолжение сюжета"
        )

    slot.current_node_id = option.next_node_id
    await db.commit()
    return await _resolve_view(db, user_id, slot)


async def get_current_view(db: AsyncSession, user_id: str, save_slot_id: str) -> dict:
    slot = await _get_owned_slot(db, user_id, save_slot_id)
    return await _resolve_view(db, user_id, slot)


# ---------------------------------------------------------------------------------------
# The reading engine loop
# ---------------------------------------------------------------------------------------


async def _resolve_view(db: AsyncSession, user_id: str, slot: SaveSlot) -> dict:
    story_id = str(slot.story_id)
    context = await variables_service.load_context(db, user_id, story_id)
    node_id = slot.current_node_id
    steps = 0

    while True:
        if not node_id:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "У этого сохранения нет текущей сцены"
            )
        steps += 1
        if steps > MAX_AUTO_TRAVERSAL_STEPS:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Обнаружен слишком длинный автоматический переход между сценами - возможен цикл в сюжете",
            )

        node = await _get_node(db, node_id)

        if node.type.value == "CONDITION":
            data = ConditionNodeData.model_validate(node.data)
            passes = evaluate_condition_group(data.when, context.as_value_map())
            node_id = data.then_node_id if passes else data.else_node_id
            continue

        if node.type.value == "EFFECT":
            data = EffectNodeData.model_validate(node.data)
            await variables_service.apply_effects(db, user_id, story_id, data.effects)
            context = await variables_service.load_context(db, user_id, story_id)
            node_id = data.next_node_id
            continue

        if str(slot.current_node_id) != str(node.id):
            slot.current_node_id = node.id
            await db.commit()

        if node.type.value == "END":
            return {"type": "END", "saveSlot": _to_save_slot_dto(slot)}

        if node.type.value == "DIALOGUE":
            data = DialogueNodeData.model_validate(node.data)
            return await _build_dialogue_view(db, node.id, data, slot)

        # CHOICE
        options = list(
            await db.scalars(
                select(ChoiceOption)
                .where(ChoiceOption.node_id == node.id)
                .order_by(ChoiceOption.order)
            )
        )
        data = ChoiceNodeData.model_validate(node.data)
        return await _build_choice_view(db, node.id, data, options, context, slot)


async def _build_dialogue_view(
    db: AsyncSession, node_id, data: DialogueNodeData, slot: SaveSlot
) -> dict:
    story_id = str(slot.story_id)
    characters = await _get_character_summaries(db, story_id)

    speaker = (
        characters.get(data.speaker_character_id) if data.speaker_character_id else None
    )
    staged = await _resolve_staged_characters(db, story_id, data.staged)

    return {
        "type": "DIALOGUE",
        "nodeId": str(node_id),
        "speaker": {
            "id": speaker["id"],
            "name": speaker["name"],
            "nameColor": speaker["nameColor"],
        }
        if speaker
        else None,
        "text": data.text.model_dump(),
        "isThought": data.is_thought,
        "backgroundImageUrl": data.background_image_url,
        "staged": staged,
        "canAdvance": bool(data.next_node_id),
        "saveSlot": _to_save_slot_dto(slot),
    }


async def _build_choice_view(
    db,
    node_id,
    data: ChoiceNodeData,
    options: list[ChoiceOption],
    context,
    slot: SaveSlot,
) -> dict:
    wallet = await wallet_service.get_wallet(db, str(slot.user_id))
    values = context.as_value_map()

    visible_options = []
    for option in options:
        visible_when = [Condition.model_validate(c) for c in option.visible_when]
        if not evaluate_condition_group(visible_when, values):
            continue
        balance = (
            wallet.hard
            if option.cost_currency and option.cost_currency.value == "HARD"
            else wallet.soft
        )
        visible_options.append(
            {
                "id": str(option.id),
                "text": option.text,
                "costCurrency": option.cost_currency.value
                if option.cost_currency
                else None,
                "costAmount": option.cost_amount,
                "affordable": not option.cost_currency
                or option.cost_amount == 0
                or balance >= option.cost_amount,
            }
        )

    return {
        "type": "CHOICE",
        "nodeId": str(node_id),
        "prompt": data.prompt.model_dump() if data.prompt else None,
        "options": visible_options,
        "saveSlot": _to_save_slot_dto(slot),
    }


async def _resolve_staged_characters(
    db: AsyncSession, story_id: str, staged: list
) -> list[dict]:
    if not staged:
        return []
    characters = await _get_character_summaries(db, story_id, with_sprites=True)

    result = []
    for s in staged:
        character = characters.get(s.character_id)
        sprites = character.get("sprites", {}) if character else {}
        result.append(
            {
                "characterId": s.character_id,
                "name": character["name"] if character else {"ru": "?"},
                "nameColor": character["nameColor"] if character else "#FFFFFF",
                "spriteUrl": sprites.get(s.sprite),
                "position": s.position,
            }
        )
    return result


async def _get_character_summaries(
    db: AsyncSession, story_id: str, with_sprites: bool = False
) -> dict:
    """Not cached: story rosters are small (a handful of characters), and always reflecting
    the latest admin edits (a re-uploaded sprite, a renamed character) matters more here than
    shaving a few milliseconds off a read that already does several queries."""
    characters = list(
        await db.scalars(select(Character).where(Character.story_id == story_id))
    )
    result = {}
    for c in characters:
        entry = {"id": str(c.id), "name": c.name, "nameColor": c.name_color}
        if with_sprites:
            entry["sprites"] = c.sprites
        result[str(c.id)] = entry
    return result


async def _get_owned_slot(
    db: AsyncSession, user_id: str, save_slot_id: str
) -> SaveSlot:
    slot = await db.get(SaveSlot, save_slot_id)
    if not slot or str(slot.user_id) != str(user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сохранение не найдено")
    return slot


async def _get_node(db: AsyncSession, node_id) -> SceneNode:
    if not node_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "У сохранения нет текущей сцены")
    node = await db.get(SceneNode, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сцена не найдена")
    return node


def _to_save_slot_dto(slot: SaveSlot) -> dict:
    return {
        "id": str(slot.id),
        "slotIndex": slot.slot_index,
        "storyId": str(slot.story_id),
        "chapterId": str(slot.chapter_id) if slot.chapter_id else None,
        "updatedAt": slot.updated_at.isoformat(),
    }
