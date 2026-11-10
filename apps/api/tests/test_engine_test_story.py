"""The technical «ARCANA ENGINE TEST» story is itself a regression suite: it must pass
narrative QA cleanly and be playable end to end through the real API."""

import pytest

from app.devtools.engine_test_story import SLUG, _id, seed_engine_test_story
from app.services import qa_service


@pytest.fixture
async def story(db_session, tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    return await seed_engine_test_story(db_session)


async def test_story_passes_narrative_qa_with_full_coverage(story, db_session):
    reports = await qa_service.analyze_story(db_session, str(story.id))
    assert [r["chapterIndex"] for r in reports] == [1, 2]
    for report in reports:
        problems = [i for i in report["issues"] if i["severity"] in ("error", "warning")]
        assert problems == [], problems
        assert report["stats"]["explorationComplete"] is True
    assert reports[0]["stats"]["coveragePercent"] == 100
    assert reports[0]["stats"]["reachableEndings"] == 2


async def test_seeding_twice_keeps_ids_stable(story, db_session):
    again = await seed_engine_test_story(db_session)
    assert again.id == story.id == _id("story") and again.slug == SLUG and again.is_test is True


async def test_assets_are_generated_as_real_media_files(story, tmp_path):
    from app.services.uploads_service import _sniff

    files = sorted((tmp_path / "engine-test").iterdir())
    assert len(files) == 16
    kinds = {_sniff(f.read_bytes()[:16]) for f in files}
    assert kinds == {"image/png", "audio/wav"}


async def test_full_playthrough_as_staff(story, client, make_user, auth_headers, db_session):
    from sqlalchemy import select

    from app.models.economy import Wallet

    tester = await make_user("tester@example.com", role="EDITOR")
    wallet = await db_session.scalar(select(Wallet).where(Wallet.user_id == tester.id))
    wallet.hard = 5
    await db_session.flush()
    headers = auth_headers(tester)

    async def post(path, **body):
        response = await client.post(f"/api/play/{path}", headers=headers, json=body or None)
        assert response.status_code == 200, response.text
        return response.json()

    view = await post(f"chapters/{_id('ch1')}/start", slotIndex=1)
    slot = view["saveSlot"]["id"]
    assert view["stage"]["music"]["url"].endswith("music_theme.wav")
    assert (view["stage"]["atmosphere"], view["stage"]["transition"]) == ("dust", "fade")

    view = await post(f"save-slots/{slot}/advance")
    assert view["isThought"] is True and view["staged"][0]["animation"] == "fade_in"
    view = await post(f"save-slots/{slot}/advance")
    assert view["stage"]["sfxUrl"].endswith("sfx_door.wav") and len(view["staged"]) == 2

    view = await post(f"save-slots/{slot}/advance")
    premium = next(o for o in view["options"] if o["costCurrency"] == "HARD")
    assert premium["costAmount"] == 5 and premium["affordable"] is True
    view = await post(f"save-slots/{slot}/choice", choiceOptionId=premium["id"])
    assert view["stage"]["cgUrl"].endswith("cg_dance.png") and view["stage"]["camera"]["zoom"] == 1.4
    assert view["stage"]["music"]["url"].endswith("music_romance.wav")
    assert (await client.get("/api/wallet", headers=headers)).json()["hard"] == 0

    view = await post(f"save-slots/{slot}/advance")
    assert "trust ≥ 10 выполнено" in view["text"]["ru"]
    view = await post(f"save-slots/{slot}/advance")
    assert view["stage"]["cgUrl"] is None and view["stage"]["atmosphere"] == "rain"
    assert view["stage"]["screenEffect"] == "shake" and view["stage"]["camera"]["focus"] == "right"

    timed = await post(f"save-slots/{slot}/advance")
    assert timed["timerSeconds"] == 10
    assert timed["timeoutOptionId"] in {o["id"] for o in timed["options"]}
    assert len(timed["options"]) == 2  # the courage-gated option is hidden on this route
    view = await post(f"save-slots/{slot}/choice", choiceOptionId=timed["timeoutOptionId"])
    view = await post(f"save-slots/{slot}/advance")
    assert view["staged"][0]["spriteUrl"].endswith("lia_dress_smile.png")  # wardrobe variable applied
    view = await post(f"save-slots/{slot}/advance")
    assert view["stage"]["music"] is None
    end = await post(f"save-slots/{slot}/advance")
    assert end["type"] == "END" and end["endingKey"] == "dawn"
    assert end["rewards"] == {"firstCompletion": True, "xp": 50, "soft": 30}
    assert end["nextChapter"]["unlockCost"] == 3 and end["nextChapter"]["unlocked"] is False

    second = await post(f"chapters/{end['nextChapter']['id']}/start", slotIndex=1)
    assert "симпатия ≥ 2" in second["text"]["ru"]
    assert (await client.get("/api/wallet", headers=headers)).json()["energy"] == 17
