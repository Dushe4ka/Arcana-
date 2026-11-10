"""Stateless chapter preview for authors. Runs the exact same narrative runtime as the live
reader (app/engine/runtime.py), but keeps the playthrough state on the client: nothing here
touches SaveSlot, Wallet or any player table."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine import loader, runtime, views
from app.engine.runtime import EngineError, EngineState, RestPoint, StoryGraph
from app.models.content import Chapter
from app.schemas.common import VariableScalar

PreviewResult = tuple[dict, dict[str, VariableScalar], str | None, dict]


def _http_error(exc: EngineError) -> HTTPException:
    code = status.HTTP_404_NOT_FOUND if exc.code == "MISSING_NODE" else status.HTTP_400_BAD_REQUEST
    return HTTPException(code, {"message": exc.message, "code": exc.code, "nodeId": exc.node_id})


async def _load(db: AsyncSession, chapter_id: str) -> tuple[Chapter, StoryGraph, dict]:
    chapter = await db.scalar(
        select(Chapter).where(Chapter.id == chapter_id).options(selectinload(Chapter.season))
    )
    if not chapter:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Глава не найдена")
    story_id = chapter.season.story_id
    graph = await loader.load_chapter_graph(db, story_id, chapter.id)
    characters = await loader.load_characters(db, story_id)
    return chapter, graph, characters


def _state(graph: StoryGraph, values: dict, background_url: str | None, stage: dict | None) -> EngineState:
    state = EngineState.from_json(
        {"values": {k: v for k, v in values.items() if k in graph.variables}, "stage": stage}
    )
    if background_url:
        state.stage["backgroundUrl"] = background_url
    return state


async def _run(db: AsyncSession, graph: StoryGraph, state: EngineState, node_id: str | None) -> RestPoint:
    for _ in range(4):
        try:
            return runtime.run_until_rest(graph, state, node_id)
        except EngineError as exc:
            if exc.code == "MISSING_NODE" and exc.node_id and exc.node_id not in graph.broken:
                if await loader.extend_with_node_chapter(db, graph, exc.node_id):
                    continue
            raise _http_error(exc) from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Слишком длинная цепочка переходов между главами")


def _result(graph: StoryGraph, rest: RestPoint, characters: dict) -> PreviewResult:
    view = views.build_view(graph, rest, characters, balances=None)
    return (
        view,
        runtime.effective_values(graph, rest.state),
        rest.state.stage.get("backgroundUrl"),
        rest.state.stage,
    )


async def resolve(
    db: AsyncSession,
    chapter_id: str,
    node_id: str | None,
    values: dict,
    background_url: str | None = None,
    stage: dict | None = None,
) -> PreviewResult:
    chapter, graph, characters = await _load(db, chapter_id)
    start_node_id = node_id or (str(chapter.entry_node_id) if chapter.entry_node_id else None)
    if not start_node_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "У главы не задана начальная сцена")
    rest = await _run(db, graph, _state(graph, values, background_url, stage), start_node_id)
    return _result(graph, rest, characters)


async def choose(
    db: AsyncSession,
    chapter_id: str,
    node_id: str,
    choice_option_id: str,
    values: dict,
    background_url: str | None = None,
    stage: dict | None = None,
) -> PreviewResult:
    _, graph, characters = await _load(db, chapter_id)
    state = _state(graph, values, background_url, stage)
    try:
        node = graph.node(node_id)
        option, state_after = runtime.take_option(graph, state, node, choice_option_id)
    except EngineError as exc:
        raise _http_error(exc) from exc
    rest = await _run(db, graph, state_after, option.next_node_id)
    return _result(graph, rest, characters)
