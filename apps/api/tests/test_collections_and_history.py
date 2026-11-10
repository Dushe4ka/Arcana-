from sqlalchemy import select

from app.devtools.engine_test_story import _id, seed_engine_test_story
from app.models.economy import Wallet


async def _play_premium_route(client, headers):
    async def post(path, **body):
        response = await client.post(f"/api/play/{path}", headers=headers, json=body or None)
        assert response.status_code == 200, response.text
        return response.json()

    view = await post(f"chapters/{_id('ch1')}/start", slotIndex=1)
    slot = view["saveSlot"]["id"]
    for _ in range(3):
        view = await post(f"save-slots/{slot}/advance")
    premium = next(o for o in view["options"] if o["costCurrency"] == "HARD")
    view = await post(f"save-slots/{slot}/choice", choiceOptionId=premium["id"])
    while view["type"] != "END":
        if view["type"] == "CHOICE":
            view = await post(f"save-slots/{slot}/choice", choiceOptionId=view["options"][0]["id"])
        else:
            view = await post(f"save-slots/{slot}/advance")
    return view


async def test_collections_list_reached_endings_and_seen_illustrations(
    client, make_user, auth_headers, db_session, tmp_path, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    await seed_engine_test_story(db_session)
    tester = await make_user("collector@example.com", role="EDITOR")
    (await db_session.scalar(select(Wallet).where(Wallet.user_id == tester.id))).hard = 5
    await db_session.flush()
    headers = auth_headers(tester)

    assert (await client.get("/api/me/collections", headers=headers)).json() == []

    end = await _play_premium_route(client, headers)
    [story] = (await client.get("/api/me/collections", headers=headers)).json()
    assert (story["chaptersCompleted"], story["chaptersTotal"]) == (1, 2)
    assert story["illustrations"]["total"] == 1
    assert [u.rsplit("/", 1)[-1] for u in story["illustrations"]["unlocked"]] == ["cg_dance.png"]

    endings = {e["nodeId"]: e for e in story["endings"]}
    assert len(endings) == 4  # two per chapter
    reached = endings[end["nodeId"]]
    assert reached["unlocked"] is True and reached["title"]["ru"].startswith("Финал:")
    locked = [e for e in endings.values() if not e["unlocked"]]
    assert len(locked) == 3 and all(e["title"] is None for e in locked)


async def test_wallet_history_is_signed_labelled_and_paged(
    client, make_user, auth_headers, db_session, tmp_path, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    await seed_engine_test_story(db_session)
    tester = await make_user("spender@example.com", role="EDITOR")
    (await db_session.scalar(select(Wallet).where(Wallet.user_id == tester.id))).hard = 5
    await db_session.flush()
    headers = auth_headers(tester)
    await _play_premium_route(client, headers)

    history = (await client.get("/api/wallet/transactions", headers=headers)).json()
    assert [(i["label"], i["currency"], i["amount"]) for i in history["items"]] == [
        ("Награда за главу", "SOFT", 30),
        ("Платный выбор", "HARD", -5),
    ]
    assert history["nextBefore"] is None

    first = (await client.get("/api/wallet/transactions?limit=1", headers=headers)).json()
    assert len(first["items"]) == 1 and first["nextBefore"]
    second = (
        await client.get("/api/wallet/transactions", headers=headers, params={"limit": 1, "before": first["nextBefore"]})
    ).json()
    assert second["items"][0]["label"] == "Платный выбор" and second["nextBefore"] is None

    other = await make_user("nosy@example.com")
    assert (await client.get("/api/wallet/transactions", headers=auth_headers(other))).json()["items"] == []
