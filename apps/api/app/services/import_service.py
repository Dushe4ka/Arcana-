"""Applies a parsed screenplay (app/services/script_import.py) to a draft chapter."""

import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import Chapter, Character, ChoiceOption, SceneNode
from app.models.enums import ContentStatus
from app.services import script_import
from app.services.script_import import ParseResult

CREATE = "__create__"
NARRATOR = "__narrator__"
MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024


async def extract_text(file: UploadFile) -> str:
    content = await file.read(MAX_IMPORT_FILE_BYTES + 1)
    if len(content) > MAX_IMPORT_FILE_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Файл слишком большой (максимум 5 МБ)")
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Пустой файл")
    if content[:4] == b"PK\x03\x04":
        try:
            return script_import.docx_to_text(content)
        except Exception as exc:  # noqa: BLE001 - any malformed archive/xml
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Не удалось прочитать DOCX-файл") from exc
    for encoding in ("utf-8-sig", "cp1251"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Поддерживаются файлы DOCX, TXT и Markdown")


async def _chapter(db: AsyncSession, chapter_id: str) -> Chapter:
    chapter = await db.scalar(
        select(Chapter).where(Chapter.id == chapter_id).options(selectinload(Chapter.season))
    )
    if not chapter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Глава не найдена")
    return chapter


def _match_speakers(parsed: ParseResult, characters: list[Character]) -> list[dict]:
    by_name: dict[str, Character] = {}
    for character in characters:
        for candidate in ((character.name or {}).get("ru"), character.first_name):
            if candidate:
                by_name.setdefault(candidate.casefold(), character)
                # "Адриан" in a script should find «Адриан Вельский».
                by_name.setdefault(candidate.split()[0].casefold(), character)
    speakers = []
    for name, count in sorted(parsed.speakers.items(), key=lambda item: -item[1]):
        match = by_name.get(name.casefold())
        speakers.append(
            {
                "name": name,
                "lines": count,
                "characterId": str(match.id) if match else None,
                "characterName": match.name if match else None,
            }
        )
    return speakers


async def preview(db: AsyncSession, chapter_id: str, text: str) -> dict:
    chapter = await _chapter(db, chapter_id)
    parsed = script_import.parse_script(text)
    characters = list(
        await db.scalars(select(Character).where(Character.story_id == chapter.season.story_id))
    )
    counts: dict[str, int] = {}
    for node in parsed.nodes:
        counts[node.type] = counts.get(node.type, 0) + 1
    return {
        "canImport": not parsed.has_errors and chapter.status == ContentStatus.DRAFT,
        "chapterIsDraft": chapter.status == ContentStatus.DRAFT,
        "counts": {
            "dialogue": counts.get("DIALOGUE", 0),
            "choice": counts.get("CHOICE", 0),
            "end": counts.get("END", 0),
            "options": sum(len(n.options) for n in parsed.nodes),
        },
        "speakers": _match_speakers(parsed, characters),
        "issues": parsed.issues,
        "sample": [
            {
                "line": n.line,
                "type": n.type,
                "speaker": n.speaker_name,
                "text": (n.data.get("text") or n.data.get("prompt") or n.data.get("endingTitle") or {}).get(
                    "ru", ""
                ),
                "options": [o.text for o in n.options],
                "label": n.label,
            }
            for n in parsed.nodes[:40]
        ],
    }


async def commit(db: AsyncSession, chapter_id: str, text: str, speaker_map: dict[str, str]) -> dict:
    chapter = await _chapter(db, chapter_id)
    if chapter.status != ContentStatus.DRAFT:
        # Imported text is unreviewed by definition; it must never land in front of players.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Импорт возможен только в черновик. Снимите главу с публикации или создайте новую.",
        )
    parsed = script_import.parse_script(text)
    if parsed.has_errors:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            {"message": "В тексте есть ошибки - исправьте их и повторите импорт", "issues": parsed.issues},
        )

    story_id = chapter.season.story_id
    characters = {
        str(c.id): c for c in await db.scalars(select(Character).where(Character.story_id == story_id))
    }
    resolved: dict[str, Character | None] = {}
    created = 0
    for name in parsed.speakers:
        choice = speaker_map.get(name)
        if choice is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Не указано, кто такой «{name}»")
        if choice == NARRATOR:
            resolved[name] = None
        elif choice == CREATE:
            character = Character(story_id=story_id, name={"ru": name}, first_name=name[:80])
            db.add(character)
            await db.flush()
            resolved[name] = character
            created += 1
        elif choice in characters:
            resolved[name] = characters[choice]
        else:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Персонаж для «{name}» не найден в этой истории"
            )

    base_order = (
        await db.scalar(select(func.max(SceneNode.order)).where(SceneNode.chapter_id == chapter.id))
    ) or 0
    had_nodes = bool(
        await db.scalar(select(func.count()).select_from(SceneNode).where(SceneNode.chapter_id == chapter.id))
    )
    ids = [uuid.uuid4() for _ in parsed.nodes]

    def target(label: str | None) -> uuid.UUID | None:
        return ids[parsed.labels[label.casefold()]] if label else None

    for index, draft in enumerate(parsed.nodes):
        data = dict(draft.data)
        if draft.type == "DIALOGUE":
            next_id = ids[draft.next_ref] if draft.next_ref is not None else target(draft.goto_label)
            data["nextNodeId"] = str(next_id) if next_id else None
            character = resolved.get(draft.speaker_name) if draft.speaker_name else None
            if draft.speaker_name and character is None:
                # Mapped to the narrator: keep who said it visible in the text itself.
                data["text"] = {"ru": f"{draft.speaker_name}: {data['text']['ru']}"}
            if character is not None:
                data["speakerCharacterId"] = str(character.id)
                poses = sorted((character.sprites or {}).keys())
                if poses:
                    pose = "neutral" if "neutral" in poses else poses[0]
                    position = "left" if character.is_protagonist else "right"
                    data["staged"] = [
                        {"characterId": str(character.id), "sprite": pose, "position": position}
                    ]
        db.add(
            SceneNode(
                id=ids[index],
                chapter_id=chapter.id,
                type=draft.type,
                order=base_order + 1 + index,
                data=data,
            )
        )
    await db.flush()
    for index, draft in enumerate(parsed.nodes):
        for order, option in enumerate(draft.options):
            db.add(
                ChoiceOption(
                    node_id=ids[index],
                    order=order,
                    text={"ru": option.text},
                    cost_currency=option.cost_currency,
                    cost_amount=option.cost_amount,
                    next_node_id=target(option.target_label),
                )
            )
    if not chapter.entry_node_id and not had_nodes:
        chapter.entry_node_id = ids[0]
    await db.commit()
    return {"createdNodes": len(ids), "createdCharacters": created, "entryNodeSet": not had_nodes}
