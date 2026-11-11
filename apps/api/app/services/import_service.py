"""Applies parsed screenplays (app/services/script_import.py) to draft chapters: one chapter
at a time, or a whole story document with season and chapter headings."""

import re
import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.content import Chapter, Character, ChoiceOption, SceneNode, Season, Story, VariableDefinition
from app.models.enums import ContentStatus
from app.services import script_import
from app.services.script_import import ChapterDraft, ParseResult, VarRef

CREATE = "__create__"
NARRATOR = "__narrator__"
MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024

_TRANSLIT = dict(
    zip(
        "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
        ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f",
         "h", "c", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"],
        strict=True,
    )
)  # fmt: skip


def variable_key(name: str) -> str:
    """A snake_case latin key for a variable the writer named in Russian."""
    latin = "".join(_TRANSLIT.get(ch, ch) for ch in name.casefold())
    key = re.sub(r"[^a-z0-9]+", "_", latin).strip("_")
    if not key or not key[0].isalpha():
        key = f"v_{key}" if key else "variable"
    return key[:40]


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


# ---------------------------------------------------------------------------------------
# Resolving the names a writer used to real characters and variables
# ---------------------------------------------------------------------------------------


class _Cast:
    def __init__(self, characters: list[Character]):
        self.by_id = {str(c.id): c for c in characters}
        self.by_name: dict[str, Character] = {}
        for character in characters:
            self.remember(character)

    def remember(self, character: Character, alias: str | None = None) -> None:
        for candidate in (alias, (character.name or {}).get("ru"), character.first_name):
            if candidate:
                self.by_name.setdefault(candidate.casefold(), character)
                # "Адриан" in a script should find «Адриан Вельский».
                self.by_name.setdefault(candidate.split()[0].casefold(), character)

    def find(self, name: str | None) -> Character | None:
        return self.by_name.get(name.casefold()) if name else None


def _speakers(parsed_list: list[ParseResult], cast: _Cast) -> list[dict]:
    totals: dict[str, int] = {}
    for parsed in parsed_list:
        for name, count in parsed.speakers.items():
            totals[name] = totals.get(name, 0) + count
    result = []
    for name, count in sorted(totals.items(), key=lambda item: -item[1]):
        match = cast.find(name)
        result.append(
            {
                "name": name,
                "lines": count,
                "characterId": str(match.id) if match else None,
                "characterName": match.name if match else None,
            }
        )
    return result


def _variable_type(ref: VarRef) -> str:
    if isinstance(ref.value, bool):
        return "BOOLEAN"
    return "NUMBER" if isinstance(ref.value, float) else "STRING"


class _Variables:
    def __init__(self, definitions: list[VariableDefinition]):
        self.definitions: dict[tuple[str, str | None], VariableDefinition] = {}
        for d in definitions:
            character_id = str(d.character_id) if d.character_id else None
            self.definitions[(d.key.casefold(), character_id)] = d
            label = (d.label or {}).get("ru")
            if label:
                self.definitions.setdefault((label.casefold(), character_id), d)

    def find(self, ref: VarRef, character: Character | None) -> VariableDefinition | None:
        character_id = str(character.id) if character else None
        return self.definitions.get((ref.name.casefold(), character_id)) or self.definitions.get(
            (variable_key(ref.name), character_id)
        )


def _variables(parsed_list: list[ParseResult], cast: _Cast, variables: _Variables) -> list[dict]:
    seen: dict[tuple[str, str], VarRef] = {}
    for parsed in parsed_list:
        for key, ref in parsed.variables.items():
            seen.setdefault(key, ref)
    result = []
    for ref in seen.values():
        character = cast.find(ref.character)
        existing = variables.find(ref, character) if (character or not ref.character) else None
        result.append(
            {
                "name": ref.name,
                "character": ref.character,
                "exists": existing is not None,
                "type": existing.type.value if existing is not None else _variable_type(ref),
            }
        )
    return result


def _summary(parsed: ParseResult) -> dict:
    counts: dict[str, int] = {}
    for node in parsed.nodes:
        counts[node.type] = counts.get(node.type, 0) + 1
    return {
        "dialogue": counts.get("DIALOGUE", 0),
        "choice": counts.get("CHOICE", 0),
        "condition": counts.get("CONDITION", 0),
        "effect": counts.get("EFFECT", 0),
        "end": counts.get("END", 0),
        "options": sum(len(n.options) for n in parsed.nodes),
    }


def _sample(parsed: ParseResult, limit: int = 40) -> list[dict]:
    rows = []
    for n in parsed.nodes[:limit]:
        if n.type == "CONDITION":
            text = "если " + " и ".join(f"{c.ref.name}" for c in n.conditions)
        elif n.type == "EFFECT":
            text = "меняет: " + ", ".join(e.ref.name for e in n.effects)
        else:
            text = (n.data.get("text") or n.data.get("prompt") or n.data.get("endingTitle") or {}).get(
                "ru", ""
            )
        rows.append(
            {
                "line": n.line,
                "type": n.type,
                "speaker": n.speaker_name,
                "text": text,
                "options": [o.text for o in n.options],
                "label": n.label,
            }
        )
    return rows


# ---------------------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------------------


class _Writer:
    """Creates characters and variables on demand and writes parsed chapters. One writer per
    request, so a character or variable introduced in chapter 1 is reused in chapter 5."""

    def __init__(
        self, db: AsyncSession, story_id, cast: _Cast, variables: _Variables, speaker_map: dict[str, str]
    ):
        self.db, self.story_id, self.cast, self.variables, self.speaker_map = (
            db,
            story_id,
            cast,
            variables,
            speaker_map,
        )
        self.resolved: dict[str, Character | None] = {}
        self.created_characters = 0
        self.created_variables = 0

    async def speaker(self, name: str) -> Character | None:
        if name in self.resolved:
            return self.resolved[name]
        choice = self.speaker_map.get(name)
        if choice is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Не указано, кто такой «{name}»")
        if choice == NARRATOR:
            character = None
        elif choice == CREATE:
            character = Character(story_id=self.story_id, name={"ru": name}, first_name=name[:80])
            self.db.add(character)
            await self.db.flush()
            self.cast.remember(character, name)
            self.created_characters += 1
        elif choice in self.cast.by_id:
            character = self.cast.by_id[choice]
            self.cast.remember(character, name)
        else:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Персонаж для «{name}» не найден в этой истории"
            )
        self.resolved[name] = character
        return character

    async def variable(self, ref: VarRef) -> tuple[VariableDefinition, str | None]:
        character = self.cast.find(ref.character)
        if ref.character and character is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"В «{ref.name}({ref.character})» указан персонаж «{ref.character}», которого нет в истории",
            )
        character_id = str(character.id) if character else None
        definition = self.variables.find(ref, character)
        if definition is None:
            kind = _variable_type(ref)
            definition = VariableDefinition(
                story_id=self.story_id,
                key=variable_key(ref.name),
                label={"ru": ref.name[:1].upper() + ref.name[1:]},
                type=kind,
                default_value={"NUMBER": 0, "BOOLEAN": False, "STRING": ""}[kind],
                character_id=character.id if character else None,
            )
            self.db.add(definition)
            await self.db.flush()
            self.variables.definitions[(definition.key.casefold(), character_id)] = definition
            self.variables.definitions[(ref.name.casefold(), character_id)] = definition
            self.created_variables += 1
        return definition, character_id

    async def _effects(self, effects) -> list[dict]:
        result = []
        for effect in effects:
            definition, character_id = await self.variable(effect.ref)
            result.append(
                {
                    "variableKey": definition.key,
                    "characterId": character_id,
                    "op": effect.op,
                    "value": effect.ref.value,
                }
            )
        return result

    async def _conditions(self, conditions) -> list[dict]:
        result = []
        for condition in conditions:
            definition, character_id = await self.variable(condition.ref)
            result.append(
                {
                    "variableKey": definition.key,
                    "characterId": character_id,
                    "operator": condition.operator,
                    "value": condition.ref.value,
                }
            )
        return result

    async def write(self, chapter: Chapter, parsed: ParseResult) -> int:
        base_order = (
            await self.db.scalar(select(func.max(SceneNode.order)).where(SceneNode.chapter_id == chapter.id))
        ) or 0
        had_nodes = bool(
            await self.db.scalar(
                select(func.count()).select_from(SceneNode).where(SceneNode.chapter_id == chapter.id)
            )
        )
        # Resolve every speaker first, so a missing mapping fails before anything is written.
        for name in parsed.speakers:
            await self.speaker(name)
        ids = [uuid.uuid4() for _ in parsed.nodes]

        def target(label: str | None) -> uuid.UUID | None:
            return ids[parsed.labels[label.casefold()]] if label else None

        def ref_or_label(ref: int | None, label: str | None) -> str | None:
            value = ids[ref] if ref is not None else target(label)
            return str(value) if value else None

        for index, draft in enumerate(parsed.nodes):
            data = dict(draft.data)
            if draft.type == "DIALOGUE":
                data["nextNodeId"] = ref_or_label(draft.next_ref, draft.goto_label)
                character = self.resolved.get(draft.speaker_name) if draft.speaker_name else None
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
            elif draft.type == "EFFECT":
                data["effects"] = await self._effects(draft.effects)
                data["nextNodeId"] = ref_or_label(draft.next_ref, draft.goto_label)
            elif draft.type == "CONDITION":
                data["when"] = await self._conditions(draft.conditions)
                data["thenNodeId"] = str(target(draft.then_label)) if draft.then_label else None
                data["elseNodeId"] = ref_or_label(draft.else_ref, draft.else_label)
            self.db.add(
                SceneNode(
                    id=ids[index],
                    chapter_id=chapter.id,
                    type=draft.type,
                    order=base_order + 1 + index,
                    data=data,
                )
            )
        await self.db.flush()
        for index, draft in enumerate(parsed.nodes):
            for order, option in enumerate(draft.options):
                self.db.add(
                    ChoiceOption(
                        node_id=ids[index],
                        order=order,
                        text={"ru": option.text},
                        cost_currency=option.cost_currency,
                        cost_amount=option.cost_amount,
                        effects=await self._effects(option.effects),
                        visible_when=await self._conditions(option.conditions),
                        next_node_id=target(option.target_label),
                    )
                )
        if not chapter.entry_node_id and not had_nodes and ids:
            chapter.entry_node_id = ids[0]
        return len(ids)


async def _context(db: AsyncSession, story_id) -> tuple[_Cast, _Variables]:
    characters = list(await db.scalars(select(Character).where(Character.story_id == story_id)))
    definitions = list(
        await db.scalars(select(VariableDefinition).where(VariableDefinition.story_id == story_id))
    )
    return _Cast(characters), _Variables(definitions)


async def _chapter(db: AsyncSession, chapter_id: str) -> Chapter:
    chapter = await db.scalar(
        select(Chapter).where(Chapter.id == chapter_id).options(selectinload(Chapter.season))
    )
    if not chapter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Глава не найдена")
    return chapter


# --- one chapter -------------------------------------------------------------------------


async def preview(db: AsyncSession, chapter_id: str, text: str) -> dict:
    chapter = await _chapter(db, chapter_id)
    parsed = script_import.parse_script(text)
    cast, variables = await _context(db, chapter.season.story_id)
    return {
        "canImport": not parsed.has_errors and chapter.status == ContentStatus.DRAFT,
        "chapterIsDraft": chapter.status == ContentStatus.DRAFT,
        "counts": _summary(parsed),
        "speakers": _speakers([parsed], cast),
        "variables": _variables([parsed], cast, variables),
        "issues": parsed.issues,
        "sample": _sample(parsed),
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
    cast, variables = await _context(db, chapter.season.story_id)
    writer = _Writer(db, chapter.season.story_id, cast, variables, speaker_map)
    had_entry = bool(chapter.entry_node_id)
    created = await writer.write(chapter, parsed)
    await db.commit()
    return {
        "createdNodes": created,
        "createdCharacters": writer.created_characters,
        "createdVariables": writer.created_variables,
        "entryNodeSet": not had_entry and bool(chapter.entry_node_id),
    }


# --- a whole story document --------------------------------------------------------------


async def _story_chapters(db: AsyncSession, story_id) -> dict[tuple[int, int], Chapter]:
    chapters = await db.scalars(
        select(Chapter)
        .join(Season, Chapter.season_id == Season.id)
        .where(Season.story_id == story_id)
        .options(selectinload(Chapter.season))
    )
    return {(c.season.index, c.index): c for c in chapters}


async def _targets(db: AsyncSession, story_id, drafts: list[ChapterDraft]) -> list[dict]:
    existing = await _story_chapters(db, story_id)
    rows = []
    for draft in drafts:
        chapter = existing.get((draft.season, draft.index))
        issues = list(draft.result.issues)
        if chapter is None:
            target = "new"
        else:
            node_count = await db.scalar(
                select(func.count()).select_from(SceneNode).where(SceneNode.chapter_id == chapter.id)
            )
            if chapter.status != ContentStatus.DRAFT:
                target = "blocked"
                issues.insert(
                    0,
                    {
                        "severity": "error",
                        "line": draft.line,
                        "message": "Эта глава уже опубликована - импорт идёт только в черновик",
                    },
                )
            elif node_count:
                target = "blocked"
                issues.insert(
                    0,
                    {
                        "severity": "error",
                        "line": draft.line,
                        "message": f"В этой главе уже есть сцены ({node_count}). Импорт не перезаписывает готовую главу",
                    },
                )
            else:
                target = "empty"
        rows.append(
            {
                "season": draft.season,
                "index": draft.index,
                "title": draft.title
                or (chapter.title.get("ru") if chapter else None)
                or f"Глава {draft.index}",
                "target": target,
                "counts": _summary(draft.result),
                "issues": issues,
                "ok": target != "blocked" and not draft.result.has_errors,
            }
        )
    return rows


async def preview_story(db: AsyncSession, story_id: str, text: str) -> dict:
    if not await db.get(Story, story_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "История не найдена")
    drafts, issues = script_import.parse_document(text)
    cast, variables = await _context(db, story_id)
    chapters = await _targets(db, story_id, drafts)
    parsed_list = [d.result for d in drafts]
    return {
        "canImport": bool(chapters)
        and all(c["ok"] for c in chapters)
        and not any(i["severity"] == "error" for i in issues),
        "issues": issues,
        "chapters": chapters,
        "speakers": _speakers(parsed_list, cast),
        "variables": _variables(parsed_list, cast, variables),
    }


async def commit_story(db: AsyncSession, story_id: str, text: str, speaker_map: dict[str, str]) -> dict:
    """All or nothing: every chapter of the document is created, or none is."""
    if not await db.get(Story, story_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "История не найдена")
    drafts, issues = script_import.parse_document(text)
    chapters = await _targets(db, story_id, drafts)
    if not chapters or any(i["severity"] == "error" for i in issues) or not all(c["ok"] for c in chapters):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            {
                "message": "В документе есть ошибки - исправьте их и повторите импорт",
                "issues": issues,
                "chapters": chapters,
            },
        )
    cast, variables = await _context(db, story_id)
    writer = _Writer(db, story_id, cast, variables, speaker_map)
    existing = await _story_chapters(db, story_id)
    seasons = {s.index: s for s in await db.scalars(select(Season).where(Season.story_id == story_id))}
    # Resolve the whole cast up front: a character may be referenced in a characteristic
    # ("доверие(Адриан)") chapters before their first line of dialogue.
    for draft in drafts:
        for name in draft.result.speakers:
            await writer.speaker(name)
    created_chapters, created_nodes = 0, 0
    for draft in drafts:
        season = seasons.get(draft.season)
        if season is None:
            season = Season(story_id=story_id, index=draft.season, title={"ru": f"Сезон {draft.season}"})
            db.add(season)
            await db.flush()
            seasons[draft.season] = season
        chapter = existing.get((draft.season, draft.index))
        if chapter is None:
            chapter = Chapter(
                season_id=season.id, index=draft.index, title={"ru": draft.title or f"Глава {draft.index}"}
            )
            db.add(chapter)
            await db.flush()
            created_chapters += 1
        elif draft.title:
            chapter.title = {**(chapter.title or {}), "ru": draft.title}
        created_nodes += await writer.write(chapter, draft.result)
    await db.commit()
    return {
        "createdChapters": created_chapters,
        "filledChapters": len(drafts) - created_chapters,
        "createdNodes": created_nodes,
        "createdCharacters": writer.created_characters,
        "createdVariables": writer.created_variables,
    }
