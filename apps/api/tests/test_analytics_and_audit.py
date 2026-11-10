import uuid

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.core import audit
from app.core.security import create_access_token, hash_password
from app.devtools.engine_test_story import _id, seed_engine_test_story
from app.models.user import AdminAuditLog, User


async def _play(client, headers, first_choice: str, *, finish: bool):
    async def post(path, **body):
        response = await client.post(f"/api/play/{path}", headers=headers, json=body or None)
        assert response.status_code == 200, response.text
        return response.json()

    view = await post(f"chapters/{_id('ch1')}/start", slotIndex=1)
    slot = view["saveSlot"]["id"]
    while view["type"] == "DIALOGUE":
        view = await post(f"save-slots/{slot}/advance")
    option = next(o for o in view["options"] if o["text"]["ru"] == first_choice)
    view = await post(f"save-slots/{slot}/choice", choiceOptionId=option["id"])
    # Picking again after a rollback must not count the player twice.
    view = await post(f"save-slots/{slot}/rollback")
    view = await post(f"save-slots/{slot}/choice", choiceOptionId=option["id"])
    while finish and view["type"] != "END":
        if view["type"] == "CHOICE":
            view = await post(f"save-slots/{slot}/choice", choiceOptionId=view["options"][0]["id"])
        else:
            view = await post(f"save-slots/{slot}/advance")


async def test_story_analytics_counts_players_not_taps(
    client, make_user, auth_headers, db_session, tmp_path, monkeypatch
):
    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    story = await seed_engine_test_story(db_session)
    readers = [await make_user(f"reader{i}@example.com", role="WRITER") for i in range(3)]
    await _play(client, auth_headers(readers[0]), "Тепло улыбнуться", finish=True)
    await _play(client, auth_headers(readers[1]), "Тепло улыбнуться", finish=False)
    await _play(client, auth_headers(readers[2]), "Отшутиться", finish=True)

    data = (await client.get(f"/api/admin/stories/{story.id}/analytics", headers=auth_headers(readers[0]))).json()
    first, second = data["chapters"]
    assert (first["started"], first["completed"], first["completionPercent"], first["reachPercent"]) == (3, 2, 67, 100)
    assert (second["started"], second["reachPercent"]) == (0, 0)

    choice = next(c for c in first["choices"] if c["prompt"]["ru"] == "Как ответить?")
    split = {o["text"]["ru"]: (o["players"], o["percent"], o["paid"]) for o in choice["options"]}
    assert split == {
        "Тепло улыбнуться": (2, 67, False),
        "Отшутиться": (1, 33, False),
        "Пригласить на танец": (0, 0, True),
    }
    assert choice["players"] == 3

    player = await make_user("not-staff@example.com")
    forbidden = await client.get(f"/api/admin/stories/{story.id}/analytics", headers=auth_headers(player))
    assert forbidden.status_code == 403


def test_audit_scope():
    class _Request:
        def __init__(self, method, path):
            self.method = method
            self.url = type("U", (), {"path": path})()

    assert audit.should_audit(_Request("POST", "/api/admin/chapters/x/publish"))
    assert audit.should_audit(_Request("DELETE", "/api/admin/stories/x"))
    assert not audit.should_audit(_Request("GET", "/api/admin/stories"))
    assert not audit.should_audit(_Request("POST", "/api/admin/preview/chapters/x"))
    assert not audit.should_audit(_Request("POST", "/api/admin/chapters/x/import/preview"))
    assert not audit.should_audit(_Request("POST", "/api/play/chapters/x/start"))


async def test_admin_changes_are_written_to_the_audit_log(db_session):
    # Real committed data and the real app wiring (no shared-transaction override), because
    # the audit writer uses its own database session.
    from app.main import app

    await db_session.close()
    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    try:
        async with factory() as db:
            admin = User(email=f"audit-{uuid.uuid4().hex[:6]}@example.com", password_hash=hash_password("x"), role="ADMIN")
            db.add(admin)
            await db.commit()
        headers = {"Authorization": f"Bearer {create_access_token(str(admin.id), admin.email, 'ADMIN')}"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/admin/stories",
                headers=headers,
                json={"slug": f"audited-{uuid.uuid4().hex[:6]}", "title": {"ru": "Аудит"}, "genre": "DRAMA"},
            )
            assert created.status_code == 201
            await client.get("/api/admin/stories", headers=headers)
            await client.delete(f"/api/admin/stories/{created.json()['id']}", headers=headers)
            await client.post("/api/admin/stories", json={"slug": "anon", "title": {"ru": "x"}, "genre": "DRAMA"})
            log = (await client.get("/api/admin/audit-log", headers=headers)).json()

        assert [(e["method"], e["statusCode"]) for e in log] == [("DELETE", 204), ("POST", 201)]
        assert all(e["userEmail"] == admin.email for e in log)
        async with factory() as db:
            assert len(list(await db.scalars(select(AdminAuditLog)))) == 2
    finally:
        await engine.dispose()
