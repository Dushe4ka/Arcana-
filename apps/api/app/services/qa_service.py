"""Runs narrative QA (app/engine/narrative_qa.py) against chapters stored in the database."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine import loader, narrative_qa
from app.engine.narrative_qa import Report
from app.models.content import Chapter, SceneNode, Season


async def _external_ids(db: AsyncSession, graph, chapter_id) -> set[str]:
    """Jump targets that live in other chapters: they exist, so they are not broken links."""
    referenced: set[str] = set()
    for node in graph.nodes.values():
        referenced.update(narrative_qa._edges(node))  # noqa: SLF001 - same package family
    unknown = [r for r in referenced if r not in graph.nodes and r not in graph.broken]
    if not unknown:
        return set()
    try:
        rows = await db.scalars(
            select(SceneNode.id).where(SceneNode.id.in_(unknown), SceneNode.chapter_id != chapter_id)
        )
    except Exception:  # noqa: BLE001 - a non-uuid string stored as a target
        await db.rollback()
        return set()
    return {str(r) for r in rows}


async def _analyze(db: AsyncSession, chapter: Chapter, initial_states=None) -> Report:
    story_id = chapter.season.story_id
    entry_node_id = str(chapter.entry_node_id) if chapter.entry_node_id else None
    graph = await loader.load_chapter_graph(db, story_id, chapter.id)
    characters = await loader.load_characters(db, story_id)
    external = await _external_ids(db, graph, chapter.id)
    return narrative_qa.analyze_chapter(
        graph,
        str(chapter.id),
        entry_node_id,
        characters,
        external_node_ids=external,
        initial_states=initial_states,
    )


async def _story_chapters(db: AsyncSession, story_id) -> list[Chapter]:
    chapters = list(
        await db.scalars(
            select(Chapter)
            .join(Season, Chapter.season_id == Season.id)
            .where(Season.story_id == story_id)
            .options(selectinload(Chapter.season))
        )
    )
    chapters.sort(key=lambda c: (c.season.index, c.index))
    return chapters


async def _chain(db: AsyncSession, story_id, stop_at=None) -> list[tuple[Chapter, Report]]:
    """Analyses chapters in reading order, feeding each chapter the variable states players
    can actually finish the previous one with - so "this ending is unreachable" in chapter 5
    accounts for everything chapters 1-4 can set."""
    result = []
    carried = None
    for chapter in await _story_chapters(db, story_id):
        report = await _analyze(db, chapter, carried)
        result.append((chapter, report))
        if str(chapter.id) == str(stop_at):
            break
        # A chapter that cannot be finished contributes nothing; keep what we had.
        carried = report.end_states or carried
    return result


async def analyze_chapter(db: AsyncSession, chapter_id: str) -> Report:
    chapter = await db.scalar(
        select(Chapter).where(Chapter.id == chapter_id).options(selectinload(Chapter.season))
    )
    if not chapter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Глава не найдена")
    chain = await _chain(db, chapter.season.story_id, stop_at=chapter.id)
    return chain[-1][1]


async def analyze_story(db: AsyncSession, story_id: str) -> list[dict]:
    return [
        {
            "chapterId": str(chapter.id),
            "seasonIndex": chapter.season.index,
            "chapterIndex": chapter.index,
            "title": chapter.title,
            "status": getattr(chapter.status, "value", chapter.status),
            **report.to_json(),
        }
        for chapter, report in await _chain(db, story_id)
    ]


async def require_publishable(db: AsyncSession, chapter_id: str) -> None:
    report = await analyze_chapter(db, chapter_id)
    if not report.publishable:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            {
                "message": f"Главу нельзя опубликовать: найдено ошибок - {len(report.errors)}",
                "code": "QA_FAILED",
                "qa": report.to_json(),
            },
        )
