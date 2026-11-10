import io
import zipfile

from app.services import script_import
from app.services.script_import import parse_script

SCRIPT = """\
# Глава 1: Бал
@фон: https://example.test/hall.jpg
@музыка: https://example.test/theme.mp3
@атмосфера: пыль
Вечер. Зал наполнялся гостями.
Лия (мысли): Он смотрит на меня.
Адриан: Добрый вечер.

? Как ответить?
- Улыбнуться -> тепло
- Пригласить на танец [кристаллы 5] -> танец

== тепло ==
Адриан: Я рад, что вы пришли.
-> финал

== танец ==
@эффект: вспышка
@музыка: стоп
Они закружились в танце.

== финал ==
=== КОНЕЦ: Рассвет ===
"""


def test_parses_every_construct_and_links_the_graph():
    result = parse_script(SCRIPT)
    assert result.issues == []
    kinds = [n.type for n in result.nodes]
    assert kinds == ["DIALOGUE", "DIALOGUE", "DIALOGUE", "CHOICE", "DIALOGUE", "DIALOGUE", "END"]
    intro, thought, speech, choice, warm, dance, end = result.nodes

    assert intro.speaker_name is None and intro.data["backgroundImageUrl"] == "https://example.test/hall.jpg"
    assert intro.data["music"] == {"action": "play", "url": "https://example.test/theme.mp3"}
    assert intro.data["atmosphere"] == "dust"
    assert (thought.speaker_name, thought.data["isThought"]) == ("Лия", True)
    assert (intro.next_ref, thought.next_ref, speech.next_ref) == (1, 2, 3)

    assert choice.data["prompt"] == {"ru": "Как ответить?"}
    free, paid = choice.options
    assert (free.text, free.target_label, free.cost_amount) == ("Улыбнуться", "тепло", 0)
    assert (paid.text, paid.cost_currency, paid.cost_amount) == ("Пригласить на танец", "HARD", 5)

    assert warm.goto_label == "финал" and warm.next_ref is None
    assert dance.data["screenEffect"] == "flash" and dance.data["music"] == {"action": "stop"}
    assert dance.next_ref == 6  # falls through into the labelled END
    assert end.data["endingTitle"] == {"ru": "Рассвет"}
    assert result.speakers == {"Лия": 1, "Адриан": 2}
    assert set(result.labels) == {"тепло", "танец", "финал"}


def test_headings_with_colons_are_narration_not_speakers():
    result = parse_script("Глава 1: Встреча\nОчень длинная вводная фраза рассказчика: вот так.\n=== КОНЕЦ ===")
    assert result.speakers == {}
    assert [n.speaker_name for n in result.nodes] == [None, None, None]


def test_reports_every_ambiguity_with_its_line_number():
    result = parse_script(
        "Адриан: Привет.\n"
        "? Что дальше?\n"
        "- Уйти\n"                       # no target
        "- Остаться -> нигде\n"          # unknown label
        "== зал ==\n"
        "@атмосфера: метеоритный дождь\n"  # unknown value
        "Тишина.\n"                      # script ends without END
    )
    found = {(i["severity"], i["line"]) for i in result.issues}
    assert ("error", 3) in found and ("error", 4) in found and ("warning", 6) in found and ("error", 7) in found
    assert result.has_errors


def test_empty_duplicate_label_and_stray_goto():
    assert parse_script("# только комментарий").has_errors
    duplicate = parse_script("== а ==\nРаз.\n== а ==\nДва.\n=== КОНЕЦ ===")
    assert any("дважды" in i["message"] for i in duplicate.issues)
    stray = parse_script("-> никуда\nРаз.\n=== КОНЕЦ ===")
    assert any("не от чего" in i["message"] for i in stray.issues)


def test_docx_text_extraction():
    document = (
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>Адриан: </w:t></w:r><w:r><w:t>Добрый вечер.</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>=== КОНЕЦ ===</w:t></w:r></w:p></w:body></w:document>"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", document)
    text = script_import.docx_to_text(buffer.getvalue())
    assert text.splitlines() == ["Адриан: Добрый вечер.", "=== КОНЕЦ ==="]
    assert parse_script(text).issues == []


async def test_import_preview_then_commit_creates_a_publishable_playable_chapter(
    client, make_user, auth_headers, make_chapter, make_character, db_session
):
    from app.models.content import Story

    chapter = await make_chapter(chapter_status="DRAFT")
    story = await db_session.get(Story, chapter.season.story_id)
    adrian = await make_character(story, name={"ru": "Адриан Вельский"})
    writer = await make_user("importer@example.com", role="WRITER")
    headers = auth_headers(writer)
    base = f"/api/admin/chapters/{chapter.id}"

    preview = (await client.post(f"{base}/import/preview", headers=headers, json={"text": SCRIPT})).json()
    assert preview["canImport"] is True
    assert preview["counts"] == {"dialogue": 5, "choice": 1, "end": 1, "options": 2}
    speakers = {s["name"]: s for s in preview["speakers"]}
    assert speakers["Адриан"]["characterId"] == str(adrian.id)  # matched by first word of the full name
    assert speakers["Лия"]["characterId"] is None
    assert (await client.get(f"/api/admin/scene-nodes?chapterId={chapter.id}", headers=headers)).json() == []

    unmapped = await client.post(f"{base}/import", headers=headers, json={"text": SCRIPT, "speakers": {}})
    assert unmapped.status_code == 400

    done = await client.post(
        f"{base}/import",
        headers=headers,
        json={"text": SCRIPT, "speakers": {"Адриан": str(adrian.id), "Лия": "__create__"}},
    )
    assert done.status_code == 201, done.text
    assert done.json() == {"createdNodes": 7, "createdCharacters": 1, "entryNodeSet": True}

    qa = (await client.get(f"{base}/qa", headers=headers)).json()
    assert qa["publishable"] is True and qa["errorCount"] == 0, qa["issues"]
    assert qa["stats"]["coveragePercent"] == 100

    assert (await client.post(f"{base}/publish", headers=headers)).status_code == 200
    again = await client.post(f"{base}/import", headers=headers, json={"text": SCRIPT, "speakers": {}})
    assert again.status_code == 400  # never into a published chapter

    view = (await client.post(f"/api/play/chapters/{chapter.id}/start", headers=headers, json={"slotIndex": 1})).json()
    assert view["text"]["ru"] == "Вечер. Зал наполнялся гостями."
    assert view["stage"]["music"]["url"] == "https://example.test/theme.mp3"


async def test_import_refuses_text_with_errors_and_saves_nothing(client, make_user, auth_headers, make_chapter):
    chapter = await make_chapter(chapter_status="DRAFT")
    headers = auth_headers(await make_user("importer2@example.com", role="WRITER"))
    response = await client.post(
        f"/api/admin/chapters/{chapter.id}/import", headers=headers, json={"text": "Оборванная реплика.", "speakers": {}}
    )
    assert response.status_code == 400 and response.json()["issues"]
    assert (await client.get(f"/api/admin/scene-nodes?chapterId={chapter.id}", headers=headers)).json() == []


async def test_extract_text_endpoint_reads_txt_and_rejects_binary(client, make_user, auth_headers):
    headers = auth_headers(await make_user("importer3@example.com", role="WRITER"))
    ok = await client.post(
        "/api/admin/import/extract-text",
        headers=headers,
        files={"file": ("ch1.txt", "Адриан: Привет.\n".encode("cp1251"), "text/plain")},
    )
    assert ok.status_code == 200 and ok.json()["text"].startswith("Адриан: Привет.")
    bad = await client.post(
        "/api/admin/import/extract-text", headers=headers, files={"file": ("x.docx", b"PK\x03\x04garbage", "application/zip")}
    )
    assert bad.status_code == 400
