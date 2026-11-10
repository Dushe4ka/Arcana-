"""The live reader: persistence and economy around the pure narrative runtime.

Every player action (start / advance / choice / rollback / restart) follows the same shape:

1. lock the save slot row, so two requests for one playthrough run strictly one after another;
2. run the deterministic runtime (app/engine/runtime.py) in memory;
3. write the new slot state, wallet changes, entitlements and rewards;
4. commit exactly once.

If anything fails, nothing is written - a player is never charged for a choice that did not
move the story forward, and never moves forward without being charged.

Slot state (`SaveSlot.state`, JSONB):

    {
      "v": 1,
      "values": {"<variable lookup key>": value},   # only explicitly changed variables
      "stage": {"backgroundUrl", "music", "atmosphere", "camera", "cgUrl"},
      "history": [{"nodeId", "chapterId", "values", "stage"}],   # rollback snapshots
      "path": [{"n": nodeId} | {"n": nodeId, "o": optionId}],    # visited beats, for the log
      "chapterStarts": {"<chapterId>": {"values", "stage"}}       # for restart / replay
    }
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine import loader, runtime, views
from app.engine.runtime import EngineError, EngineState, RestPoint, StoryGraph
from app.models.content import Chapter, ChapterPublication, PublishedNode, Season, Story
from app.models.enums import ContentStatus, TransactionType
from app.models.player import (
    PlayerCgUnlock,
    PlayerChapterCompletion,
    PlayerChapterUnlock,
    PlayerChoicePick,
    PlayerChoiceUnlock,
    PlayerEndingUnlock,
    SaveSlot,
)
from app.services import wallet_service

STAFF_ROLES = {"WRITER", "EDITOR", "ADMIN"}
CHAPTER_COMPLETE_XP = 50
MAX_HISTORY = 30
MAX_PATH = 300

_ERROR_STATUS = {
    "MISSING_NODE": status.HTTP_404_NOT_FOUND,
    "OPTION_HIDDEN": status.HTTP_403_FORBIDDEN,
}


def _http_error(exc: EngineError) -> HTTPException:
    return HTTPException(
        _ERROR_STATUS.get(exc.code, status.HTTP_400_BAD_REQUEST),
        {"message": exc.message, "code": exc.code, "nodeId": exc.node_id},
    )


# ---------------------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------------------


async def start_chapter(
    db: AsyncSession,
    user_id: str,
    chapter_id: str,
    slot_index: int,
    *,
    restart: bool = False,
    role: str = "PLAYER",
) -> dict:
    chapter, entry_node_id = await _get_playable_chapter(db, chapter_id, role)
    story_id = chapter.season.story_id

    await _ensure_chapter_unlocked(db, user_id, chapter)

    slot = await db.scalar(
        select(SaveSlot)
        .where(
            SaveSlot.user_id == user_id,
            SaveSlot.story_id == story_id,
            SaveSlot.slot_index == slot_index,
        )
        .with_for_update()
    )
    graph = StoryGraph(nodes={}, variables=await loader.load_variables(db, story_id))

    if slot is None:
        slot = await _create_slot(db, user_id, story_id, slot_index)
    box = _StateBox(slot.state)

    if slot.chapter_id is None and not box.history and not slot.current_node_id:
        state = EngineState()
        box.set_chapter_start(chapter.id, state)
    else:
        same_chapter = str(slot.chapter_id) == str(chapter.id)
        if same_chapter and not restart and not await _is_at_end(db, slot):
            # Plain resume: pick up exactly where this playthrough stopped.
            view = await _current_view(db, user_id, slot)
            await db.commit()
            return view

        saved_start = box.chapter_start(chapter.id)
        going_back = same_chapter or restart or await _is_earlier_chapter(db, chapter, slot.chapter_id)
        if going_back and saved_start is not None:
            # Restart / replay of an earlier chapter: restore the variables it began with.
            state = saved_start
        else:
            # Moving forward (or a save from before snapshots existed): variables carry
            # over, the stage starts clean.
            state = _carry_over(box.engine_state())
            box.set_chapter_start(chapter.id, state)
        box.clear_progress()

    rest = await _run(db, graph, state, entry_node_id)
    outcome = await _arrive(db, user_id, slot, box, rest)
    await db.commit()
    return await _view(db, user_id, slot, graph, rest, box, outcome)


async def advance(
    db: AsyncSession, user_id: str, save_slot_id: str, expected_node_id: str | None = None
) -> dict:
    slot = await _get_owned_slot(db, user_id, save_slot_id, lock=True)
    graph, box, here = await _open(db, slot)

    if _is_stale(slot, expected_node_id):
        # A retry of a request that already went through - answer with where we are now.
        await db.commit()
        return await _view(db, user_id, slot, graph, here, box)

    if here.node.type != "DIALOGUE":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "В этой сцене нужно сделать выбор, а не просто продолжить"
        )
    if not here.node.data.next_node_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "У этой сцены нет продолжения")

    box.push_history(here)
    rest = await _run(db, graph, here.state, here.node.data.next_node_id)
    outcome = await _arrive(db, user_id, slot, box, rest)
    await db.commit()
    return await _view(db, user_id, slot, graph, rest, box, outcome)


async def submit_choice(
    db: AsyncSession,
    user_id: str,
    save_slot_id: str,
    choice_option_id: str,
    expected_node_id: str | None = None,
) -> dict:
    slot = await _get_owned_slot(db, user_id, save_slot_id, lock=True)
    graph, box, here = await _open(db, slot)

    if _is_stale(slot, expected_node_id):
        await db.commit()
        return await _view(db, user_id, slot, graph, here, box)

    try:
        option, state_after = runtime.take_option(graph, here.state, here.node, choice_option_id)
    except EngineError as exc:
        raise _http_error(exc) from exc

    # Run the story forward BEFORE charging: a broken continuation aborts with nothing spent.
    rest = await _run(db, graph, state_after, option.next_node_id)

    if option.is_paid:
        await _charge_once(db, user_id, option)

    await db.execute(
        pg_insert(PlayerChoicePick)
        .values(user_id=user_id, choice_option_id=option.id)
        .on_conflict_do_nothing(index_elements=["user_id", "choice_option_id"])
    )
    box.push_history(here)
    box.push_path(here.node.id, option.id)
    outcome = await _arrive(db, user_id, slot, box, rest)
    await db.commit()
    return await _view(db, user_id, slot, graph, rest, box, outcome)


async def restart_chapter(db: AsyncSession, user_id: str, save_slot_id: str, role: str = "PLAYER") -> dict:
    """Restarts the slot's current chapter from its first scene with the variables it
    originally started with."""
    slot = await _get_owned_slot(db, user_id, save_slot_id)
    if not slot.chapter_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "В этом сохранении нет начатой главы")
    return await start_chapter(db, user_id, str(slot.chapter_id), slot.slot_index, restart=True, role=role)


async def rollback(db: AsyncSession, user_id: str, save_slot_id: str) -> dict:
    """Steps one beat back, restoring variables and the stage exactly as they were. Purchases
    and completion rewards are account-level facts and are deliberately NOT undone - the
    player simply keeps the entitlement, so replaying the same paid choice is free."""
    slot = await _get_owned_slot(db, user_id, save_slot_id, lock=True)
    box = _StateBox(slot.state)
    snapshot = box.pop_history()
    if snapshot is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Дальше назад вернуться нельзя")

    slot.current_node_id = snapshot["nodeId"]
    if snapshot.get("chapterId"):
        slot.chapter_id = snapshot["chapterId"]
    box.set_engine_state(EngineState.from_json(snapshot))
    box.pop_path_to(snapshot["nodeId"])
    _save(slot, box)
    await db.commit()
    return await _current_view(db, user_id, slot)


async def get_current_view(db: AsyncSession, user_id: str, save_slot_id: str) -> dict:
    slot = await _get_owned_slot(db, user_id, save_slot_id, lock=True)
    view = await _current_view(db, user_id, slot)
    await db.commit()
    return view


async def get_history(db: AsyncSession, user_id: str, save_slot_id: str) -> list[dict]:
    """The dialogue log: every beat this playthrough went through, oldest first."""
    slot = await _get_owned_slot(db, user_id, save_slot_id)
    path = _StateBox(slot.state).path
    node_ids = {entry["n"] for entry in path}
    nodes = {str(n.node_id): n for n in await _published_nodes(db, node_ids)} if node_ids else {}
    options = {str(o["id"]): o for n in nodes.values() for o in n.options or []}
    characters = await loader.load_characters(db, slot.story_id)

    log = []
    for entry in path:
        node = nodes.get(entry["n"])
        if node is None:
            continue
        if entry.get("o"):
            option = options.get(entry["o"])
            if option is not None:
                log.append({"type": "CHOICE", "nodeId": entry["n"], "text": option["text"]})
            continue
        if getattr(node.type, "value", node.type) != "DIALOGUE":
            continue
        data = node.data or {}
        speaker_id = data.get("speakerCharacterId") or data.get("speaker_character_id")
        speaker = characters.get(str(speaker_id)) if speaker_id else None
        log.append(
            {
                "type": "DIALOGUE",
                "nodeId": entry["n"],
                "speaker": {"name": speaker["name"], "nameColor": speaker["nameColor"]} if speaker else None,
                "text": data.get("text"),
                "isThought": bool(data.get("isThought") or data.get("is_thought")),
            }
        )
    return log


# ---------------------------------------------------------------------------------------
# Slot state container
# ---------------------------------------------------------------------------------------


class _StateBox:
    """Typed access to the slot's JSON state. Always works on a private copy; `_save` writes
    a fresh dict back so SQLAlchemy sees the JSONB column as changed."""

    def __init__(self, raw: dict | None):
        raw = raw or {}
        self._engine = EngineState.from_json(raw)
        self.history: list[dict] = [dict(h) for h in raw.get("history") or []]
        self.path: list[dict] = [dict(p) for p in raw.get("path") or []]
        self._chapter_starts: dict[str, dict] = dict(raw.get("chapterStarts") or {})

    def engine_state(self) -> EngineState:
        return self._engine.clone()

    def set_engine_state(self, state: EngineState) -> None:
        self._engine = state.clone()

    def chapter_start(self, chapter_id) -> EngineState | None:
        raw = self._chapter_starts.get(str(chapter_id))
        return EngineState.from_json(raw) if raw is not None else None

    def set_chapter_start(self, chapter_id, state: EngineState) -> None:
        self._chapter_starts[str(chapter_id)] = state.to_json()

    def clear_progress(self) -> None:
        self.history = []
        self.path = []

    def push_history(self, rest: RestPoint) -> None:
        self.history.append(
            {"nodeId": rest.node.id, "chapterId": rest.node.chapter_id, **rest.state.to_json()}
        )
        del self.history[:-MAX_HISTORY]

    def pop_history(self) -> dict | None:
        return self.history.pop() if self.history else None

    def push_path(self, node_id: str, option_id: str | None = None) -> None:
        entry = {"n": node_id, "o": option_id} if option_id else {"n": node_id}
        if self.path and self.path[-1] == entry:
            return
        self.path.append(entry)
        del self.path[:-MAX_PATH]

    def pop_path_to(self, node_id: str) -> None:
        """Drops log entries after the last visit of `node_id` (used by rollback)."""
        for index in range(len(self.path) - 1, -1, -1):
            if self.path[index] == {"n": node_id}:
                del self.path[index + 1 :]
                return

    def to_json(self) -> dict:
        return {
            "v": runtime.STATE_VERSION,
            **self._engine.to_json(),
            "history": self.history,
            "path": self.path,
            "chapterStarts": self._chapter_starts,
        }


def _carry_over(state: EngineState) -> EngineState:
    """Variables travel into the next chapter; music/background/camera do not."""
    return EngineState(values=dict(state.values))


def _save(slot: SaveSlot, box: _StateBox) -> None:
    slot.state = box.to_json()
    slot.current_background_url = box.engine_state().stage.get("backgroundUrl")


def _is_stale(slot: SaveSlot, expected_node_id: str | None) -> bool:
    return bool(expected_node_id) and str(slot.current_node_id) != str(expected_node_id)


# ---------------------------------------------------------------------------------------
# Running the engine against the database
# ---------------------------------------------------------------------------------------


async def _run(db: AsyncSession, graph: StoryGraph, state: EngineState, node_id: str | None) -> RestPoint:
    """`runtime.run_until_rest` over a lazily loaded graph: whenever the runtime asks for a
    node that is not in memory yet, fetch it (plus its direct successors, which the walk
    will almost certainly need next) and run again. The runtime is pure, so re-running
    from the same state is safe."""
    for _ in range(runtime.MAX_AUTO_TRAVERSAL_STEPS + 2):
        try:
            return runtime.run_until_rest(graph, state, node_id)
        except EngineError as exc:
            if exc.code == "MISSING_NODE" and exc.node_id and exc.node_id not in graph.broken:
                if await loader.extend_with_published_nodes(db, graph, [exc.node_id]):
                    if exc.node_id in graph.nodes:
                        await loader.extend_with_published_nodes(
                            db, graph, loader.successors(graph, exc.node_id)
                        )
                        continue
            raise _http_error(exc) from exc
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Слишком длинная цепочка автоматических переходов")


async def _open(db: AsyncSession, slot: SaveSlot) -> tuple[StoryGraph, _StateBox, RestPoint]:
    """Loads the slot's chapter graph and re-derives the resting point the player is at."""
    if not slot.current_node_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "У этого сохранения нет текущей сцены")
    graph = StoryGraph(nodes={}, variables=await loader.load_variables(db, slot.story_id))
    box = _StateBox(slot.state)
    try:
        here = await _run(db, graph, box.engine_state(), str(slot.current_node_id))
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        if detail.get("code") != "MISSING_NODE" or detail.get("nodeId") != str(slot.current_node_id):
            raise
        here = await _recover(db, slot, graph, box)
    return graph, box, here


async def _recover(db: AsyncSession, slot: SaveSlot, graph: StoryGraph, box: _StateBox) -> RestPoint:
    """The beat this save was standing on no longer exists in the live version of the
    chapter (it was removed in a newer publication). Rather than a dead save, put the player
    on the most recent beat of their own history that still exists - with the variables they
    had there - or, failing that, at the start of the chapter with their current variables."""
    while (snapshot := box.pop_history()) is not None:
        try:
            rest = await _run(db, graph, EngineState.from_json(snapshot), snapshot["nodeId"])
        except HTTPException:
            continue
        box.pop_path_to(snapshot["nodeId"])
        return rest

    chapter = await db.get(Chapter, slot.chapter_id) if slot.chapter_id else None
    publication = await _live_publication(db, chapter) if chapter else None
    if publication is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Эта глава больше недоступна")
    box.clear_progress()
    return await _run(db, graph, _carry_over(box.engine_state()), str(publication.entry_node_id))


async def _current_view(db: AsyncSession, user_id: str, slot: SaveSlot) -> dict:
    opened_graph, box, here = await _open(db, slot)
    outcome = None
    if here.node.id != str(slot.current_node_id):
        # The stored pointer was on an automatic node (older save, or content edited under
        # the player): settle on the real resting node once, so effects are not re-applied.
        outcome = await _arrive(db, user_id, slot, box, here)
    return await _view(db, user_id, slot, opened_graph, here, box, outcome)


async def _arrive(
    db: AsyncSession, user_id: str, slot: SaveSlot, box: _StateBox, rest: RestPoint
) -> dict | None:
    """Persists arrival at a resting node and pays out completion rewards when it is an END."""
    slot.current_node_id = rest.node.id
    slot.chapter_id = rest.node.chapter_id
    box.set_engine_state(rest.state)
    if rest.node.type == "DIALOGUE":
        box.push_path(rest.node.id)
    _save(slot, box)
    cg_url = rest.state.stage.get("cgUrl")
    if cg_url:
        # Seen once = kept in the gallery for good, whatever happens to this playthrough.
        await db.execute(
            pg_insert(PlayerCgUnlock)
            .values(user_id=user_id, story_id=slot.story_id, image_url=cg_url)
            .on_conflict_do_nothing(index_elements=["user_id", "image_url"])
        )
    if rest.node.type == "END":
        return await _complete_chapter(db, user_id, slot, rest)
    return None


async def _complete_chapter(db: AsyncSession, user_id: str, slot: SaveSlot, rest: RestPoint) -> dict:
    """Idempotent: the unique (user, chapter) row decides whether rewards are due. A replay,
    a reload of the end screen or a concurrent duplicate request can never pay twice."""
    inserted = await db.scalar(
        pg_insert(PlayerChapterCompletion)
        .values(user_id=user_id, chapter_id=rest.node.chapter_id)
        .on_conflict_do_nothing(index_elements=["user_id", "chapter_id"])
        .returning(PlayerChapterCompletion.id)
    )
    await db.execute(
        pg_insert(PlayerEndingUnlock)
        .values(
            user_id=user_id,
            story_id=slot.story_id,
            chapter_id=rest.node.chapter_id,
            node_id=rest.node.id,
            ending_key=rest.node.data.ending_key,
        )
        .on_conflict_do_nothing(index_elements=["user_id", "node_id"])
    )
    if inserted is None:
        completion = await db.scalar(
            select(PlayerChapterCompletion).where(
                PlayerChapterCompletion.user_id == user_id,
                PlayerChapterCompletion.chapter_id == rest.node.chapter_id,
            )
        )
        if completion is not None:
            completion.times_completed += 1
        return {"firstCompletion": False, "xp": 0, "soft": 0}

    reward_soft = rest.node.data.reward_soft
    await wallet_service.grant_xp(
        db, user_id, CHAPTER_COMPLETE_XP, reason=f"chapter_complete:{rest.node.chapter_id}", commit=False
    )
    if reward_soft > 0:
        await wallet_service.grant_currency(
            db,
            user_id,
            "SOFT",
            reward_soft,
            reason=f"chapter_complete:{rest.node.chapter_id}",
            transaction_type=TransactionType.EARN,
            commit=False,
        )
    return {"firstCompletion": True, "xp": CHAPTER_COMPLETE_XP, "soft": reward_soft}


async def _charge_once(db: AsyncSession, user_id: str, option) -> None:
    """Charges for a paid option unless this account already owns it."""
    owned = await db.scalar(
        select(PlayerChoiceUnlock.id).where(
            PlayerChoiceUnlock.user_id == user_id, PlayerChoiceUnlock.choice_option_id == option.id
        )
    )
    if owned:
        return
    await wallet_service.spend_currency(
        db, user_id, option.cost_currency, option.cost_amount, f"choice:{option.id}", commit=False
    )
    db.add(PlayerChoiceUnlock(user_id=user_id, choice_option_id=option.id))


# ---------------------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------------------


async def _view(
    db: AsyncSession,
    user_id: str,
    slot: SaveSlot,
    graph: StoryGraph,
    rest: RestPoint,
    box: _StateBox,
    outcome: dict | None = None,
) -> dict:
    characters = await loader.load_characters(db, slot.story_id)
    balances = None
    owned: set[str] = set()
    if rest.node.type == "CHOICE":
        wallet = await wallet_service.get_wallet(db, user_id)
        balances = {"SOFT": wallet.soft, "HARD": wallet.hard}
        paid_ids = [o.id for o in rest.node.options if o.is_paid]
        if paid_ids:
            owned = {
                str(option_id)
                for option_id in await db.scalars(
                    select(PlayerChoiceUnlock.choice_option_id).where(
                        PlayerChoiceUnlock.user_id == user_id,
                        PlayerChoiceUnlock.choice_option_id.in_(paid_ids),
                    )
                )
            }

    view = views.build_view(graph, rest, characters, balances=balances or {}, owned_option_ids=owned)
    view["saveSlot"] = _to_save_slot_dto(slot, can_rollback=bool(box.history))
    if rest.node.type == "END":
        view["rewards"] = outcome or {"firstCompletion": False, "xp": 0, "soft": 0}
        view["nextChapter"] = await _next_chapter(db, user_id, rest.node.chapter_id)
    return view


async def _next_chapter(db: AsyncSession, user_id: str, chapter_id: str) -> dict | None:
    chapter = await db.scalar(
        select(Chapter).where(Chapter.id == chapter_id).options(selectinload(Chapter.season))
    )
    if chapter is None:
        return None
    candidates = list(
        await db.scalars(
            select(Chapter)
            .join(Season, Chapter.season_id == Season.id)
            .where(
                Season.story_id == chapter.season.story_id,
                Chapter.status == ContentStatus.PUBLISHED,
                Chapter.published_version.is_not(None),
            )
            .options(selectinload(Chapter.season))
        )
    )
    here = (chapter.season.index, chapter.index)
    later = sorted(
        (c for c in candidates if (c.season.index, c.index) > here), key=lambda c: (c.season.index, c.index)
    )
    if not later:
        return None
    nxt = later[0]
    unlocked = await db.scalar(
        select(PlayerChapterUnlock.id).where(
            PlayerChapterUnlock.user_id == user_id, PlayerChapterUnlock.chapter_id == nxt.id
        )
    )
    return {
        "id": str(nxt.id),
        "index": nxt.index,
        "seasonIndex": nxt.season.index,
        "title": nxt.title,
        "unlockCost": nxt.unlock_cost,
        "unlocked": bool(unlocked) or nxt.unlock_cost == 0,
    }


def _to_save_slot_dto(slot: SaveSlot, *, can_rollback: bool = False) -> dict:
    return {
        "id": str(slot.id),
        "slotIndex": slot.slot_index,
        "storyId": str(slot.story_id),
        "chapterId": str(slot.chapter_id) if slot.chapter_id else None,
        "updatedAt": slot.updated_at.isoformat(),
        "canRollback": can_rollback,
    }


# ---------------------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------------------


async def _live_publication(db: AsyncSession, chapter: Chapter) -> ChapterPublication | None:
    if chapter.published_version is None:
        return None
    return await db.scalar(
        select(ChapterPublication).where(
            ChapterPublication.chapter_id == chapter.id,
            ChapterPublication.version == chapter.published_version,
        )
    )


async def _published_nodes(db: AsyncSession, node_ids) -> list[PublishedNode]:
    """The live copies of the given nodes (whatever version each one's chapter has live)."""
    return list(
        await db.scalars(
            select(PublishedNode)
            .join(Chapter, Chapter.id == PublishedNode.chapter_id)
            .where(
                PublishedNode.node_id.in_(list(node_ids)), PublishedNode.version == Chapter.published_version
            )
        )
    )


async def _get_playable_chapter(db: AsyncSession, chapter_id: str, role: str) -> tuple[Chapter, str]:
    """Returns the chapter and the entry node of the version players currently read."""
    not_found = HTTPException(status.HTTP_404_NOT_FOUND, "Глава не найдена или ещё не опубликована")
    try:
        chapter = await db.scalar(
            select(Chapter).where(Chapter.id == chapter_id).options(selectinload(Chapter.season))
        )
    except Exception as exc:  # noqa: BLE001 - malformed uuid in the URL
        raise not_found from exc
    if not chapter or chapter.status != ContentStatus.PUBLISHED:
        raise not_found
    story = await db.get(Story, chapter.season.story_id)
    is_staff = role in STAFF_ROLES
    if story is None or (story.is_test and not is_staff):
        raise not_found
    if story.status != ContentStatus.PUBLISHED and not is_staff:
        raise not_found
    publication = await _live_publication(db, chapter)
    if publication is None:
        raise not_found
    return chapter, str(publication.entry_node_id)


async def _ensure_chapter_unlocked(db: AsyncSession, user_id: str, chapter: Chapter) -> None:
    """Spends energy and records the unlock inside the caller's transaction. For a paid
    chapter the wallet row is locked BEFORE re-checking the unlock, so of two simultaneous
    requests the second one waits, then sees the first one's unlock and pays nothing."""

    async def already_unlocked() -> bool:
        return bool(
            await db.scalar(
                select(PlayerChapterUnlock.id).where(
                    PlayerChapterUnlock.user_id == user_id, PlayerChapterUnlock.chapter_id == chapter.id
                )
            )
        )

    if await already_unlocked():
        return
    if chapter.unlock_cost > 0:
        await wallet_service.lock_wallet(db, user_id)
        if await already_unlocked():
            return
        await wallet_service.spend_energy(db, user_id, chapter.unlock_cost, commit=False)
    await db.execute(
        pg_insert(PlayerChapterUnlock)
        .values(user_id=user_id, chapter_id=chapter.id)
        .on_conflict_do_nothing(index_elements=["user_id", "chapter_id"])
    )


async def _create_slot(db: AsyncSession, user_id: str, story_id, slot_index: int) -> SaveSlot:
    """Creates the slot inside a savepoint: if a concurrent request created the same
    (user, story, index) slot first, fall back to that row instead of failing."""
    slot = SaveSlot(user_id=user_id, story_id=story_id, slot_index=slot_index, state={})
    try:
        async with db.begin_nested():
            db.add(slot)
            await db.flush()
        return slot
    except IntegrityError:
        existing = await db.scalar(
            select(SaveSlot)
            .where(
                SaveSlot.user_id == user_id,
                SaveSlot.story_id == story_id,
                SaveSlot.slot_index == slot_index,
            )
            .with_for_update()
        )
        if existing is None:
            raise
        return existing


async def _is_at_end(db: AsyncSession, slot: SaveSlot) -> bool:
    if not slot.current_node_id:
        return True
    nodes = await _published_nodes(db, [slot.current_node_id])
    return not nodes or getattr(nodes[0].type, "value", nodes[0].type) == "END"


async def _is_earlier_chapter(db: AsyncSession, target: Chapter, current_chapter_id) -> bool:
    if not current_chapter_id:
        return False
    current = await db.scalar(
        select(Chapter).where(Chapter.id == current_chapter_id).options(selectinload(Chapter.season))
    )
    if current is None:
        return False
    return (target.season.index, target.index) < (current.season.index, current.index)


async def _get_owned_slot(
    db: AsyncSession, user_id: str, save_slot_id: str, *, lock: bool = False
) -> SaveSlot:
    query = select(SaveSlot).where(SaveSlot.id == save_slot_id)
    if lock:
        query = query.with_for_update()
    try:
        slot = await db.scalar(query)
    except Exception as exc:  # noqa: BLE001 - malformed uuid in the URL
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сохранение не найдено") from exc
    if not slot or str(slot.user_id) != str(user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сохранение не найдено")
    return slot
