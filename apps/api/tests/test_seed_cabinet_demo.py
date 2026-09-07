import pytest
from sqlalchemy import select

from app.models.user import User
from seed import seed_cabinet_demo, seed_demo_story


@pytest.mark.asyncio
async def test_seed_cabinet_demo_creates_player_with_stats(db_session):
    await seed_demo_story(db_session)
    await seed_cabinet_demo(db_session)

    user = await db_session.scalar(select(User).where(User.email == "player@arcana.app"))
    assert user is not None
    assert user.role.value == "PLAYER"

    # Running it twice must not raise (idempotent) and must not duplicate the user.
    await seed_cabinet_demo(db_session)
    users = list(await db_session.scalars(select(User).where(User.email == "player@arcana.app")))
    assert len(users) == 1


@pytest.mark.asyncio
async def test_seeded_player_stats_endpoint(db_session, client):
    await seed_demo_story(db_session)
    await seed_cabinet_demo(db_session)
    await db_session.commit()

    login = await client.post(
        "/api/auth/login",
        json={"email": "player@arcana.app", "password": "Player123!"},
    )
    assert login.status_code == 200
    token = login.json()["accessToken"]

    res = await client.get("/api/me/stats", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    stories = res.json()
    assert len(stories) == 1
    assert len(stories[0]["relationships"]) == 2
    assert len(stories[0]["general"]) == 1

    # The exact numbers the seed writes, not just the counts - catches a regression that
    # seeds wrong values.
    rel_by_name = {r["characterName"]["ru"]: r["value"] for r in stories[0]["relationships"]}
    assert rel_by_name["Данте Аркана"] == 40
    assert rel_by_name["Лия Северцева"] == 15

    general_by_key = {g["variableKey"]: g["value"] for g in stories[0]["general"]}
    assert general_by_key["confidence"] == 3


@pytest.mark.asyncio
async def test_seed_cabinet_demo_full_script_idempotent(db_session, client):
    # Two consecutive `python seed.py` runs: the second run's seed_demo_story deletes and
    # recreates the story (cascading away the slot / variable values) *before* seed_cabinet_demo
    # gets to rebuild them.
    await seed_demo_story(db_session)
    await seed_cabinet_demo(db_session)
    # A real second invocation is a fresh process with a fresh Session - drop the identity map
    # so seed_demo_story's story lookup + delete-cascade runs against clean ORM state.
    db_session.expunge_all()
    await seed_demo_story(db_session)
    await seed_cabinet_demo(db_session)
    await db_session.commit()

    users = list(await db_session.scalars(select(User).where(User.email == "player@arcana.app")))
    assert len(users) == 1

    login = await client.post(
        "/api/auth/login",
        json={"email": "player@arcana.app", "password": "Player123!"},
    )
    assert login.status_code == 200
    token = login.json()["accessToken"]

    res = await client.get("/api/me/stats", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert len(res.json()) == 1
