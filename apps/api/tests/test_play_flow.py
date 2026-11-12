"""End-to-end tests of the live reader through its HTTP API: saves, branching, paid choices,
rollback, replay, rewards. These are the regression net for the bugs the engine rewrite fixed
(XP farming, charging before validating, variables shared between slots, double charges)."""

import pytest
from sqlalchemy import func, select

from app.models.content import ChoiceOption, SceneNode, VariableDefinition
from app.models.economy import CurrencyTransaction, Wallet
from app.models.player import PlayerChoiceUnlock


class StoryBuilder:
    """Tiny DSL for wiring scene graphs in tests."""

    def __init__(self, db, chapter):
        self.db = db
        self.chapter = chapter
        self.story_id = chapter.season.story_id

    async def node(self, node_type, **data):
        node = SceneNode(chapter_id=self.chapter.id, type=node_type, order=0, data=data)
        self.db.add(node)
        await self.db.flush()
        await self.db.refresh(node)
        return node

    async def say(self, text, **data):
        return await self.node("DIALOGUE", text={"ru": text}, **data)

    async def link(self, node, target, field="nextNodeId"):
        node.data = {**node.data, field: str(target.id)}
        await self.db.flush()

    async def option(self, node, text, target, **kwargs):
        option = ChoiceOption(
            node_id=node.id, text={"ru": text}, next_node_id=target.id if target else None, **kwargs
        )
        self.db.add(option)
        await self.db.flush()
        await self.db.refresh(option)
        return option

    async def variable(self, key, default=0, **kwargs):
        definition = VariableDefinition(
            story_id=self.story_id, key=key, label={"ru": key}, type="NUMBER", default_value=default, **kwargs
        )
        self.db.add(definition)
        await self.db.flush()
        return definition

    async def entry(self, node, chapter=None):
        """Sets the entry scene and publishes: call it last, once the graph is wired."""
        from app.services import publications_service

        chapter = chapter or self.chapter
        chapter.entry_node_id = node.id
        await self.db.flush()
        await publications_service.snapshot(self.db, chapter)


@pytest.fixture
def api(client, auth_headers):
    class Api:
        def __init__(self):
            self.headers = {}

        def as_user(self, user):
            self.headers = auth_headers(user)
            return self

        async def start(self, chapter, slot=1, expect=200, **body):
            r = await client.post(
                f"/api/play/chapters/{chapter.id}/start",
                headers=self.headers,
                json={"slotIndex": slot, **body},
            )
            assert r.status_code == expect, r.text
            return r.json()

        async def post(self, view, action, expect=200, **body):
            r = await client.post(
                f"/api/play/save-slots/{view['saveSlot']['id']}/{action}",
                headers=self.headers,
                json=body or None,
            )
            assert r.status_code == expect, r.text
            return r.json()

        async def get(self, view, suffix="", expect=200):
            r = await client.get(
                f"/api/play/save-slots/{view['saveSlot']['id']}{suffix}", headers=self.headers
            )
            assert r.status_code == expect, r.text
            return r.json()

        async def wallet(self):
            return (await client.get("/api/wallet", headers=self.headers)).json()

    return Api()


async def _branching_chapter(db_session, make_chapter):
    """intro -> choice{kind:+2 trust | cold} -> condition(trust>=2) -> warm END | cool END"""
    chapter = await make_chapter()
    b = StoryBuilder(db_session, chapter)
    await b.variable("trust", 0, min_value=0, max_value=10)
    warm_end = await b.node("END", endingKey="warm", rewardSoft=25)
    cool_end = await b.node("END", endingKey="cool")
    gate = await b.node(
        "CONDITION",
        when=[{"variableKey": "trust", "operator": "GTE", "value": 2}],
        thenNodeId=str(warm_end.id),
        elseNodeId=str(cool_end.id),
    )
    after = await b.say("После выбора")
    await b.link(after, gate)
    choice = await b.node("CHOICE", prompt={"ru": "Как ответить?"})
    kind = await b.option(
        choice, "Тепло", after, effects=[{"variableKey": "trust", "op": "INCREMENT", "value": 2}]
    )
    cold = await b.option(choice, "Холодно", after)
    intro = await b.say("Начало")
    await b.link(intro, choice)
    await b.entry(intro)
    return b, {"intro": intro, "choice": choice, "kind": kind, "cold": cold, "after": after}


async def test_full_playthrough_branches_on_choice_and_rewards_exactly_once(
    api, make_user, make_chapter, db_session
):
    b, n = await _branching_chapter(db_session, make_chapter)
    api.as_user(await make_user("flow@example.com"))
    before = await api.wallet()

    view = await api.start(b.chapter)
    assert (view["type"], view["text"]["ru"]) == ("DIALOGUE", "Начало")
    view = await api.post(view, "advance")
    assert view["type"] == "CHOICE" and [o["text"]["ru"] for o in view["options"]] == ["Тепло", "Холодно"]
    view = await api.post(view, "choice", choiceOptionId=str(n["kind"].id))
    assert view["text"]["ru"] == "После выбора"
    end = await api.post(view, "advance")

    assert end["type"] == "END" and end["endingKey"] == "warm"
    assert end["rewards"] == {"firstCompletion": True, "xp": 50, "soft": 25}
    after = await api.wallet()
    assert after["xp"] == before["xp"] + 50 and after["soft"] == before["soft"] + 25

    # Reloading the end screen, and replaying the whole chapter, must not pay out again.
    assert (await api.get(end))["rewards"]["firstCompletion"] is False
    replay = await api.post(end, "restart")
    assert replay["text"]["ru"] == "Начало"
    replay = await api.post(replay, "advance")
    replay = await api.post(replay, "choice", choiceOptionId=str(n["cold"].id))
    cool = await api.post(replay, "advance")
    assert cool["endingKey"] == "cool" and cool["rewards"] == {"firstCompletion": False, "xp": 0, "soft": 0}
    final = await api.wallet()
    assert (final["xp"], final["soft"]) == (after["xp"], after["soft"])


async def test_restart_resets_variables_to_how_the_chapter_started(api, make_user, make_chapter, db_session):
    b, n = await _branching_chapter(db_session, make_chapter)
    api.as_user(await make_user("restart@example.com"))
    view = await api.post(await api.start(b.chapter), "advance")
    view = await api.post(view, "choice", choiceOptionId=str(n["kind"].id))
    # Restart mid-chapter, then take the cold route: the +2 trust from the first run is gone.
    view = await api.post(view, "restart")
    view = await api.post(view, "advance")
    view = await api.post(view, "choice", choiceOptionId=str(n["cold"].id))
    assert (await api.post(view, "advance"))["endingKey"] == "cool"


async def test_save_slots_are_independent_playthroughs(api, make_user, make_chapter, db_session):
    b, n = await _branching_chapter(db_session, make_chapter)
    api.as_user(await make_user("slots@example.com"))
    one = await api.post(await api.start(b.chapter, slot=1), "advance")
    one = await api.post(one, "choice", choiceOptionId=str(n["kind"].id))

    two = await api.post(await api.start(b.chapter, slot=2), "advance")
    two = await api.post(two, "choice", choiceOptionId=str(n["cold"].id))

    assert (await api.post(two, "advance"))["endingKey"] == "cool"
    assert (await api.post(one, "advance"))["endingKey"] == "warm"


async def test_resume_returns_to_the_same_beat(api, make_user, make_chapter, db_session):
    b, _ = await _branching_chapter(db_session, make_chapter)
    api.as_user(await make_user("resume@example.com"))
    view = await api.post(await api.start(b.chapter), "advance")
    assert view["type"] == "CHOICE"
    # "Closing the app" = nothing but the slot id survives; both ways back land on the choice.
    assert (await api.get(view))["nodeId"] == view["nodeId"]
    assert (await api.start(b.chapter))["nodeId"] == view["nodeId"]


async def test_rollback_restores_position_and_variables(api, make_user, make_chapter, db_session):
    b, n = await _branching_chapter(db_session, make_chapter)
    api.as_user(await make_user("rollback@example.com"))
    start = await api.start(b.chapter)
    assert start["saveSlot"]["canRollback"] is False
    await api.post(start, "rollback", expect=400)

    choice = await api.post(start, "advance")
    after = await api.post(choice, "choice", choiceOptionId=str(n["kind"].id))
    assert after["saveSlot"]["canRollback"] is True

    back = await api.post(after, "rollback")
    assert back["type"] == "CHOICE" and back["nodeId"] == choice["nodeId"]
    # Having undone the warm choice, the cold route must see trust back at 0.
    view = await api.post(back, "choice", choiceOptionId=str(n["cold"].id))
    assert (await api.post(view, "advance"))["endingKey"] == "cool"


async def test_retry_with_stale_node_id_changes_nothing(api, make_user, make_chapter, db_session):
    b, n = await _branching_chapter(db_session, make_chapter)
    api.as_user(await make_user("retry@example.com"))
    start = await api.start(b.chapter)
    first = await api.post(start, "advance", nodeId=start["nodeId"])
    again = await api.post(start, "advance", nodeId=start["nodeId"])
    assert first["type"] == again["type"] == "CHOICE" and first["nodeId"] == again["nodeId"]

    chosen = await api.post(first, "choice", choiceOptionId=str(n["kind"].id), nodeId=first["nodeId"])
    repeat = await api.post(first, "choice", choiceOptionId=str(n["kind"].id), nodeId=first["nodeId"])
    assert chosen["nodeId"] == repeat["nodeId"] == str(n["after"].id)


async def _paid_chapter(db_session, make_chapter, *, cost=30, broken=False):
    chapter = await make_chapter()
    b = StoryBuilder(db_session, chapter)
    end = await b.node("END")
    scene = await b.say("Особая сцена")
    await b.link(scene, end)
    choice = await b.node("CHOICE")
    paid = await b.option(
        choice, "Премиум", None if broken else scene, cost_currency="SOFT", cost_amount=cost
    )
    free = await b.option(choice, "Обычный", end)
    await b.entry(choice)
    return b, paid, free


async def _spend_count(db_session, user):
    return await db_session.scalar(
        select(func.count())
        .select_from(CurrencyTransaction)
        .where(CurrencyTransaction.user_id == user.id, CurrencyTransaction.type == "SPEND")
    )


async def test_paid_choice_is_charged_once_even_after_rollback_and_replay(
    api, make_user, make_chapter, db_session
):
    b, paid, _ = await _paid_chapter(db_session, make_chapter)
    user = await make_user("paid@example.com")
    api.as_user(user)
    start = await api.start(b.chapter)
    option = next(o for o in start["options"] if o["id"] == str(paid.id))
    assert option == {**option, "costCurrency": "SOFT", "costAmount": 30, "affordable": True, "owned": False}
    balance = (await api.wallet())["soft"]

    scene = await api.post(start, "choice", choiceOptionId=str(paid.id))
    assert scene["text"]["ru"] == "Особая сцена"
    assert (await api.wallet())["soft"] == balance - 30

    back = await api.post(scene, "rollback")
    assert next(o for o in back["options"] if o["id"] == str(paid.id))["owned"] is True
    await api.post(back, "choice", choiceOptionId=str(paid.id))
    replay = await api.post(back, "restart")
    await api.post(replay, "choice", choiceOptionId=str(paid.id))

    assert (await api.wallet())["soft"] == balance - 30
    assert await _spend_count(db_session, user) == 1
    assert await db_session.scalar(select(func.count()).select_from(PlayerChoiceUnlock)) == 1


async def test_paid_choice_with_broken_continuation_charges_nothing(api, make_user, make_chapter, db_session):
    b, paid, _ = await _paid_chapter(db_session, make_chapter, broken=True)
    user = await make_user("broken@example.com")
    api.as_user(user)
    start = await api.start(b.chapter)
    balance = (await api.wallet())["soft"]
    await api.post(start, "choice", expect=400, choiceOptionId=str(paid.id))
    assert (await api.wallet())["soft"] == balance
    assert await _spend_count(db_session, user) == 0
    assert (await api.get(start))["nodeId"] == start["nodeId"]


async def test_unaffordable_paid_choice_is_refused_and_story_stays_put(
    api, make_user, make_chapter, db_session
):
    b, paid, _ = await _paid_chapter(db_session, make_chapter, cost=10_000)
    user = await make_user("poor@example.com")
    api.as_user(user)
    start = await api.start(b.chapter)
    assert next(o for o in start["options"] if o["id"] == str(paid.id))["affordable"] is False
    await api.post(start, "choice", expect=400, choiceOptionId=str(paid.id))
    wallet = await db_session.scalar(select(Wallet).where(Wallet.user_id == user.id))
    assert wallet.soft >= 0
    assert (await api.get(start))["type"] == "CHOICE"


async def test_option_from_another_node_is_rejected(api, make_user, make_chapter, db_session):
    b, paid, _ = await _paid_chapter(db_session, make_chapter)
    other, n = await _branching_chapter(db_session, make_chapter)
    api.as_user(await make_user("foreign@example.com"))
    start = await api.start(b.chapter)
    await api.post(start, "choice", expect=400, choiceOptionId=str(n["kind"].id))


async def test_variables_carry_into_next_chapter_and_replay_restores_them(
    api, make_user, make_chapter, make_story, db_session
):
    b, n = await _branching_chapter(db_session, make_chapter)
    story = await db_session.get(type(b.chapter.season).story.property.mapper.class_, b.story_id)
    second = await make_chapter(story=story, index=2)
    b2 = StoryBuilder(db_session, second)
    high = await b2.say("Доверие сохранилось")
    low = await b2.say("Доверия нет")
    gate = await b2.node(
        "CONDITION",
        when=[{"variableKey": "trust", "operator": "GTE", "value": 2}],
        thenNodeId=str(high.id),
        elseNodeId=str(low.id),
    )
    await b2.entry(gate)

    api.as_user(await make_user("carry@example.com"))
    view = await api.post(await api.start(b.chapter), "advance")
    view = await api.post(view, "choice", choiceOptionId=str(n["kind"].id))
    end = await api.post(view, "advance")
    assert end["nextChapter"]["id"] == str(second.id) and end["nextChapter"]["unlocked"] is True

    assert (await api.start(second))["text"]["ru"] == "Доверие сохранилось"

    # Going back to chapter 1 replays it from a clean slate; this time the cold route.
    view = await api.post(await api.start(b.chapter), "advance")
    view = await api.post(view, "choice", choiceOptionId=str(n["cold"].id))
    await api.post(view, "advance")
    assert (await api.start(second))["text"]["ru"] == "Доверия нет"


async def test_effect_entry_node_is_applied_once_across_reloads(api, make_user, make_chapter, db_session):
    chapter = await make_chapter()
    b = StoryBuilder(db_session, chapter)
    await b.variable("visits", 0)
    yes = await b.say("Ровно один раз")
    no = await b.say("Эффект задвоился")
    gate = await b.node(
        "CONDITION",
        when=[{"variableKey": "visits", "operator": "EQ", "value": 1}],
        thenNodeId=str(yes.id),
        elseNodeId=str(no.id),
    )
    fx = await b.node(
        "EFFECT", effects=[{"variableKey": "visits", "op": "INCREMENT", "value": 1}], nextNodeId=str(gate.id)
    )
    await b.entry(fx)
    api.as_user(await make_user("fx@example.com"))
    view = await api.start(chapter)
    for _ in range(3):
        view = await api.get(view)
    assert view["text"]["ru"] == "Ровно один раз"


async def test_chapter_unlock_spends_energy_once(api, make_user, make_chapter, db_session):
    chapter = await make_chapter(unlock_cost=5)
    b = StoryBuilder(db_session, chapter)
    await b.entry(await b.say("Платная глава"))
    api.as_user(await make_user("energy@example.com"))
    energy = (await api.wallet())["energy"]
    await api.start(chapter)
    await api.start(chapter)
    await api.start(chapter, slot=2)
    assert (await api.wallet())["energy"] == energy - 5


async def test_chapter_unlock_without_enough_energy_fails_cleanly(api, make_user, make_chapter, db_session):
    chapter = await make_chapter(unlock_cost=999)
    b = StoryBuilder(db_session, chapter)
    await b.entry(await b.say("Дорого"))
    api.as_user(await make_user("tired@example.com"))
    await api.start(chapter, expect=400)
    assert (await api.wallet())["energy"] == 20


async def test_unpublished_and_test_stories_are_hidden_from_players(api, make_user, make_chapter, db_session):
    draft = await make_chapter(story_status="DRAFT")
    await StoryBuilder(db_session, draft).entry(await StoryBuilder(db_session, draft).say("Черновик"))
    tech = await make_chapter()
    await StoryBuilder(db_session, tech).entry(await StoryBuilder(db_session, tech).say("Тест движка"))
    from app.models.content import Story

    (await db_session.get(Story, tech.season.story_id)).is_test = True
    await db_session.flush()

    api.as_user(await make_user("player@example.com"))
    await api.start(draft, expect=404)
    await api.start(tech, expect=404)

    api.as_user(await make_user("writer@example.com", role="WRITER"))
    assert (await api.start(tech))["text"]["ru"] == "Тест движка"


async def test_another_players_slot_is_invisible(api, make_user, make_chapter, db_session):
    b, _ = await _branching_chapter(db_session, make_chapter)
    api.as_user(await make_user("owner@example.com"))
    view = await api.start(b.chapter)
    api.as_user(await make_user("intruder@example.com"))
    await api.get(view, expect=404)
    await api.post(view, "advance", expect=404)
    await api.post(view, "rollback", expect=404)


async def test_dialogue_log_lists_beats_and_choices_in_order(api, make_user, make_chapter, db_session):
    b, n = await _branching_chapter(db_session, make_chapter)
    api.as_user(await make_user("log@example.com"))
    view = await api.post(await api.start(b.chapter), "advance")
    view = await api.post(view, "choice", choiceOptionId=str(n["kind"].id))
    log = await api.get(view, "/history")
    assert [(e["type"], e["text"]["ru"]) for e in log] == [
        ("DIALOGUE", "Начало"),
        ("CHOICE", "Тепло"),
        ("DIALOGUE", "После выбора"),
    ]


async def test_music_and_background_survive_resume(api, make_user, make_chapter, db_session):
    chapter = await make_chapter()
    b = StoryBuilder(db_session, chapter)
    second = await b.say("Тишина ещё не наступила")
    first = await b.say(
        "Заиграла музыка",
        backgroundImageUrl="https://example.test/bg.jpg",
        music={"action": "play", "url": "https://example.test/theme.mp3"},
        sfxUrl="https://example.test/door.mp3",
    )
    await b.link(first, second)
    await b.entry(first)
    api.as_user(await make_user("music@example.com"))
    view = await api.start(chapter)
    assert view["stage"]["sfxUrl"] == "https://example.test/door.mp3"
    view = await api.post(view, "advance")
    resumed = await api.get(view)
    assert resumed["stage"]["music"]["url"] == "https://example.test/theme.mp3"
    assert resumed["backgroundImageUrl"] == "https://example.test/bg.jpg"
    assert "sfxUrl" not in resumed["stage"]


async def test_auto_node_loop_is_reported_as_content_error(api, make_user, make_chapter, db_session):
    chapter = await make_chapter()
    b = StoryBuilder(db_session, chapter)
    a = await b.node("EFFECT", effects=[])
    c = await b.node("EFFECT", effects=[], nextNodeId=str(a.id))
    await b.link(a, c)
    await b.entry(a)
    api.as_user(await make_user("loop@example.com"))
    body = await api.start(chapter, expect=400)
    assert body["code"] == "AUTO_LOOP"


async def test_catalog_lists_test_stories_only_for_staff(
    client, make_user, auth_headers, make_chapter, db_session
):
    from app.models.content import Story

    chapter = await make_chapter()
    story = await db_session.get(Story, chapter.season.story_id)
    story.is_test = True
    await db_session.flush()

    assert (await client.get("/api/catalog/stories")).json() == []
    assert (await client.get(f"/api/catalog/stories/{story.id}")).status_code == 404
    player = await make_user("cat-player@example.com")
    assert (await client.get("/api/catalog/stories", headers=auth_headers(player))).json() == []

    editor = await make_user("cat-editor@example.com", role="EDITOR")
    listed = (await client.get("/api/catalog/stories", headers=auth_headers(editor))).json()
    assert [s["id"] for s in listed] == [str(story.id)] and listed[0]["isTest"] is True
    assert (
        await client.get(f"/api/catalog/stories/{story.id}", headers=auth_headers(editor))
    ).status_code == 200


async def test_catalog_returns_seasons_and_chapters_in_reading_order(client, make_chapter, db_session):
    from app.models.content import Chapter, Season, Story

    # Created deliberately out of order: chapter 3, then 1, then 2; season 2 before season 1.
    third = await make_chapter(index=3)
    season = third.season
    story_id = season.story_id
    story = await db_session.get(Story, story_id)
    await make_chapter(story=story, index=1)
    await make_chapter(story=story, index=2)
    season.index = 2
    await db_session.flush()
    first_season = Season(story_id=story_id, index=1, title={"ru": "Первый"})
    db_session.add(first_season)
    await db_session.flush()
    db_session.add(Chapter(season_id=first_season.id, index=1, title={"ru": "Пролог"}, status="PUBLISHED"))
    await db_session.flush()
    db_session.expunge_all()

    detail = (await client.get(f"/api/catalog/stories/{story_id}")).json()
    assert [s["index"] for s in detail["seasons"]] == [1, 2]
    assert [c["index"] for c in detail["seasons"][1]["chapters"]] == [1, 2, 3]


async def test_chapter_assets_list_the_live_versions_pictures_and_sounds(
    api, client, make_user, make_chapter, make_character, db_session
):
    from app.models.content import Story

    chapter = await make_chapter()
    story = await db_session.get(Story, chapter.season.story_id)
    liv = await make_character(story)
    liv.sprites = {"sad": "s/sad.png", "toga_sad": "s/toga_sad.png", "smile": "s/smile.png"}
    b = StoryBuilder(db_session, chapter)
    first = await b.say(
        "пепел",
        backgroundImageUrl="bg/ruins.jpg",
        music={"url": "m/theme.mp3", "action": "play"},
        staged=[{"characterId": str(liv.id), "sprite": "sad", "position": "left"}],
    )
    second = await b.say("тишина", sfxUrl="fx/thunder.mp3", cgImageUrl="cg/fire.jpg")
    await b.link(first, second)
    await b.entry(first)
    # A draft edit after publishing must not leak into what players download.
    first.data = {**first.data, "backgroundImageUrl": "bg/draft.jpg"}
    await db_session.flush()

    player = await make_user("assets@example.com")
    api.as_user(player)
    r = await client.get(f"/api/play/chapters/{chapter.id}/assets", headers=api.headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert sorted(body["images"]) == ["bg/ruins.jpg", "cg/fire.jpg", "s/sad.png", "s/toga_sad.png"]
    assert sorted(body["audio"]) == ["fx/thunder.mp3", "m/theme.mp3"]
