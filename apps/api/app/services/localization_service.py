"""Translation workflow for a story's player-visible text.

Russian is the source language. `export` lists every translatable string with a stable key
and a hash of its current Russian text; a translator fills in `translation`; `apply` writes
translations back - but only where the Russian text is still the one that was translated.
If the original changed in the meantime, the unit is reported as stale instead of silently
attaching an out-of-date translation.

The hash of the source a translation was made from is stored next to it, inside the same
localized JSON value: {"ru": "...", "en": "...", "_src": {"en": "<hash>"}}. That keeps the
scheme additive - no new tables, and every reader that looks up a locale is unaffected.
"""

import hashlib
import re

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.models.content import Character, SceneNode, Season, Story, VariableDefinition

_LOCALE = re.compile(r"^[a-z]{2}(-[A-Z]{2})?$")
SOURCE_LOCALE = "ru"
# (node type, key inside node.data in either casing, unit suffix, human context)
_NODE_FIELDS = [
    ("DIALOGUE", ("text",), "text", "Реплика"),
    ("CHOICE", ("prompt",), "prompt", "Вопрос выбора"),
    ("END", ("endingTitle", "ending_title"), "endingTitle", "Название финала"),
]


def source_hash(text: str) -> str:
    return hashlib.sha256(text.strip().encode()).hexdigest()[:16]


def _check_locale(locale: str) -> None:
    if not _LOCALE.match(locale) or locale == SOURCE_LOCALE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Укажите язык перевода, например en, fr или pt-BR")


class _Unit:
    """One translatable string and how to write its translation back."""

    def __init__(self, key: str, context: str, holder, attribute: str, path: tuple[str, ...] = ()):
        self.key, self.context = key, context
        self._holder, self._attribute, self._path = holder, attribute, path

    def _container(self) -> dict | None:
        value = getattr(self._holder, self._attribute)
        for part in self._path:
            value = value.get(part) if isinstance(value, dict) else None
        return value if isinstance(value, dict) else None

    @property
    def text(self) -> dict | None:
        return self._container()

    def set_translation(self, locale: str, translation: str | None, src_hash: str) -> None:
        root = getattr(self._holder, self._attribute)
        new_root = dict(root)
        target = new_root
        for part in self._path:
            target[part] = dict(target[part])
            target = target[part]
        marks = dict(target.get("_src") or {})
        if translation:
            target[locale] = translation
            marks[locale] = src_hash
        else:
            target.pop(locale, None)
            marks.pop(locale, None)
        if marks:
            target["_src"] = marks
        else:
            target.pop("_src", None)
        setattr(self._holder, self._attribute, new_root)
        flag_modified(self._holder, self._attribute)


async def _units(db: AsyncSession, story_id: str) -> list[_Unit]:
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "История не найдена")
    units = [_Unit(f"story:{story.id}:title", "Название истории", story, "title")]
    if story.description:
        units.append(_Unit(f"story:{story.id}:description", "Описание истории", story, "description"))

    for character in await db.scalars(select(Character).where(Character.story_id == story.id)):
        units.append(_Unit(f"character:{character.id}:name", "Имя персонажа", character, "name"))
    for definition in await db.scalars(
        select(VariableDefinition).where(VariableDefinition.story_id == story.id)
    ):
        units.append(_Unit(f"variable:{definition.id}:label", "Название характеристики", definition, "label"))

    seasons = list(
        await db.scalars(
            select(Season).where(Season.story_id == story.id).options(selectinload(Season.chapters))
        )
    )
    for season in sorted(seasons, key=lambda s: s.index):
        units.append(_Unit(f"season:{season.id}:title", f"Название сезона {season.index}", season, "title"))
        for chapter in sorted(season.chapters, key=lambda c: c.index):
            where = f"сезон {season.index}, глава {chapter.index}"
            units.append(_Unit(f"chapter:{chapter.id}:title", f"Название главы ({where})", chapter, "title"))
            nodes = list(
                await db.scalars(
                    select(SceneNode)
                    .where(SceneNode.chapter_id == chapter.id)
                    .options(selectinload(SceneNode.choice_options))
                )
            )
            for node in sorted(nodes, key=lambda n: n.order):
                node_type = getattr(node.type, "value", node.type)
                for wanted_type, data_keys, suffix, label in _NODE_FIELDS:
                    if node_type != wanted_type:
                        continue
                    data_key = next(
                        (k for k in data_keys if isinstance((node.data or {}).get(k), dict)), None
                    )
                    if data_key:
                        units.append(
                            _Unit(f"node:{node.id}:{suffix}", f"{label} ({where})", node, "data", (data_key,))
                        )
                for option in sorted(node.choice_options, key=lambda o: o.order):
                    units.append(
                        _Unit(f"option:{option.id}:text", f"Вариант выбора ({where})", option, "text")
                    )
    return units


def _state(text: dict, locale: str) -> str:
    translation = text.get(locale)
    if not translation:
        return "missing"
    made_from = (text.get("_src") or {}).get(locale)
    # A translation entered before this workflow existed carries no mark: nothing says it
    # is out of date, so it counts as translated.
    if made_from is None:
        return "translated"
    return "stale" if made_from != source_hash(text.get(SOURCE_LOCALE, "")) else "translated"


async def export(db: AsyncSession, story_id: str, locale: str) -> dict:
    _check_locale(locale)
    rows = []
    for unit in await _units(db, story_id):
        text = unit.text
        if not text or not text.get(SOURCE_LOCALE):
            continue
        rows.append(
            {
                "key": unit.key,
                "context": unit.context,
                "source": text[SOURCE_LOCALE],
                "sourceHash": source_hash(text[SOURCE_LOCALE]),
                "translation": text.get(locale) or "",
                "state": _state(text, locale),
            }
        )
    summary = {state: sum(r["state"] == state for r in rows) for state in ("translated", "missing", "stale")}
    return {
        "storyId": str(story_id),
        "locale": locale,
        "summary": {"total": len(rows), **summary},
        "units": rows,
    }


async def apply(db: AsyncSession, story_id: str, locale: str, incoming: list[dict]) -> dict:
    _check_locale(locale)
    units = {unit.key: unit for unit in await _units(db, story_id)}
    applied, stale, unknown, unchanged = 0, [], [], 0
    for row in incoming:
        unit = units.get(row.get("key", ""))
        if unit is None or not unit.text or not unit.text.get(SOURCE_LOCALE):
            unknown.append(row.get("key", ""))
            continue
        current_hash = source_hash(unit.text[SOURCE_LOCALE])
        translation = (row.get("translation") or "").strip()
        if translation == (unit.text.get(locale) or "") and (
            not translation or (unit.text.get("_src") or {}).get(locale) == current_hash
        ):
            unchanged += 1
            continue
        if translation and row.get("sourceHash") != current_hash:
            # The Russian line was edited after this file was exported.
            stale.append(row["key"])
            continue
        unit.set_translation(locale, translation or None, current_hash)
        applied += 1
    await db.commit()
    return {"applied": applied, "unchanged": unchanged, "skippedStale": stale, "unknownKeys": unknown}
