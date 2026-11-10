from app.config import settings
from app.devtools.engine_test_story import _id, seed_engine_test_story


async def test_translation_round_trip_detects_stale_units_and_reaches_players_after_publish(
    client, make_user, auth_headers, db_session, tmp_path, monkeypatch
):
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    story = await seed_engine_test_story(db_session)
    headers = auth_headers(await make_user("translator@example.com", role="EDITOR"))
    url = f"/api/admin/stories/{story.id}/localization"

    exported = (await client.get(url, headers=headers, params={"locale": "en"})).json()
    # Only the story title was translated by hand in the seed.
    assert exported["summary"]["translated"] == 1
    assert exported["summary"]["total"] == exported["summary"]["missing"] + 1 > 30
    units = {u["key"]: u for u in exported["units"]}
    intro = units[f"node:{_id('ch1:intro')}:text"]
    thought = units[f"node:{_id('ch1:thought')}:text"]
    option = units[f"option:{_id('ch1:option:warm')}:text"]
    ending = units[f"node:{_id('ch1:end_dawn')}:endingTitle"]
    assert intro["context"] == "Реплика (сезон 1, глава 1)"
    assert f"story:{story.id}:title" in units and f"chapter:{_id('ch1')}:title" in units

    # The writer edits one Russian line after the file went out to the translator.
    await client.patch(
        f"/api/admin/scene-nodes/{_id('ch1:thought')}",
        headers=headers,
        json={"data": {"text": {"ru": "Переписанная мысль."}, "isThought": True, "nextNodeId": str(_id("ch1:enters"))}},
    )

    result = (
        await client.post(
            url,
            headers=headers,
            json={
                "locale": "en",
                "units": [
                    {"key": intro["key"], "sourceHash": intro["sourceHash"], "translation": "Narration: hall, music, dust."},
                    {"key": thought["key"], "sourceHash": thought["sourceHash"], "translation": "An outdated thought."},
                    {"key": option["key"], "sourceHash": option["sourceHash"], "translation": "Smile warmly"},
                    {"key": ending["key"], "sourceHash": ending["sourceHash"], "translation": "Ending: dawn together"},
                    {"key": "node:does-not-exist:text", "sourceHash": "x", "translation": "?"},
                    {"key": units[f"chapter:{_id('ch1')}:title"]["key"], "sourceHash": "x", "translation": ""},
                ],
            },
        )
    ).json()
    assert result == {
        "applied": 3,
        "unchanged": 1,
        "skippedStale": [thought["key"]],
        "unknownKeys": ["node:does-not-exist:text"],
    }

    again = (await client.get(url, headers=headers, params={"locale": "en"})).json()
    assert again["summary"]["translated"] == 4 and again["summary"]["stale"] == 0
    states = {u["key"]: u for u in again["units"]}
    assert states[intro["key"]]["translation"] == "Narration: hall, music, dust."
    assert states[thought["key"]]["state"] == "missing"

    # Players still read the published version: no English until the chapter is republished.
    start = {"slotIndex": 1, "restart": True}
    before = (await client.post(f"/api/play/chapters/{_id('ch1')}/start", headers=headers, json=start)).json()
    assert before["text"].get("en") is None
    assert (await client.post(f"/api/admin/chapters/{_id('ch1')}/publish", headers=headers)).status_code == 200
    after = (await client.post(f"/api/play/chapters/{_id('ch1')}/start", headers=headers, json=start)).json()
    assert after["text"]["en"] == "Narration: hall, music, dust." and after["text"]["ru"].startswith("Описание")

    # Editing the Russian original afterwards flags the existing translation as stale.
    await client.patch(
        f"/api/admin/scene-nodes/{_id('ch1:intro')}",
        headers=headers,
        json={"data": {**after_data(states, intro), "text": {**after["text"], "ru": "Совсем другой текст."}}},
    )
    final = (await client.get(url, headers=headers, params={"locale": "en"})).json()
    assert {u["key"]: u["state"] for u in final["units"]}[intro["key"]] == "stale"

    # Clearing a translation removes it.
    cleared = (
        await client.post(url, headers=headers, json={"locale": "en", "units": [{"key": option["key"], "translation": ""}]})
    ).json()
    assert cleared["applied"] == 1
    assert {u["key"]: u["state"] for u in (await client.get(url, headers=headers, params={"locale": "en"})).json()["units"]}[
        option["key"]
    ] == "missing"


def after_data(states, intro):
    return {"nextNodeId": str(_id("ch1:thought"))}


async def test_localization_rejects_bad_locales_and_players(client, make_user, auth_headers, make_chapter):
    chapter = await make_chapter()
    story_id = chapter.season.story_id
    editor = auth_headers(await make_user("loc-editor@example.com", role="EDITOR"))
    url = f"/api/admin/stories/{story_id}/localization"
    for bad in ("ru", "english", "EN", ""):
        assert (await client.get(url, headers=editor, params={"locale": bad})).status_code == 400
    assert (await client.get(url, headers=editor, params={"locale": "pt-BR"})).status_code == 200
    player = auth_headers(await make_user("loc-player@example.com"))
    assert (await client.get(url, headers=player, params={"locale": "en"})).status_code == 403
