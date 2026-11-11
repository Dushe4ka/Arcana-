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
    assert preview["counts"] == {"dialogue": 5, "choice": 1, "condition": 0, "effect": 0, "end": 1, "options": 2}
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
    assert done.json() == {"createdNodes": 7, "createdCharacters": 1, "createdVariables": 0, "entryNodeSet": True}

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


STORY_DOC = """\
Это вступление автора, в игру не попадёт.

# Сезон 1

## Глава 1: Бал
// комментарий для команды
Вечер. Зал наполнялся гостями.
Адриан: Добрый вечер.
? Как ответить?
- Улыбнуться {доверие(Адриан) +2; смелость +1} -> дальше
- Промолчать -> дальше
- Взять за руку [если смелость >= 1] [кристаллы 5] {доверие(Адриан) +3} -> дальше

== дальше ==
{была на балу = да}
[если доверие(Адриан) >= 2] -> тепло | иначе -> холод

== тепло ==
Адриан: Я рад, что вы пришли.
=== КОНЕЦ: Тёплый вечер ===

== холод ==
Адриан: Что ж.
=== КОНЕЦ: Холодный вечер ===

## Глава 2: Сад
[если была на балу = да] -> помнит
Лия (мысли): Странно, я здесь впервые.
=== КОНЕЦ ===

== помнит ==
Лия (мысли): Я помню этот сад.
=== КОНЕЦ ===

# Сезон 2
## Серия 1: Возвращение
Прошёл год.
=== КОНЕЦ ===
"""


def test_document_is_split_into_chapters_with_effects_conditions_and_branches():
    chapters, issues = script_import.parse_document(STORY_DOC)
    assert [(c.season, c.index, c.title) for c in chapters] == [(1, 1, "Бал"), (1, 2, "Сад"), (2, 1, "Возвращение")]
    assert [i["severity"] for i in issues] == ["warning"]  # the author's preface line
    assert all(c.result.issues == [] for c in chapters), [c.result.issues for c in chapters]

    ball = chapters[0].result
    assert [n.type for n in ball.nodes] == ["DIALOGUE", "DIALOGUE", "CHOICE", "EFFECT", "CONDITION", "DIALOGUE", "END", "DIALOGUE", "END"]
    smile, silent, hand = ball.nodes[2].options
    assert [(e.ref.name, e.ref.character, e.op, e.ref.value) for e in smile.effects] == [
        ("доверие", "Адриан", "INCREMENT", 2.0),
        ("смелость", None, "INCREMENT", 1.0),
    ]
    assert (smile.text, silent.effects) == ("Улыбнуться", [])
    assert hand.text == "Взять за руку" and (hand.cost_currency, hand.cost_amount) == ("HARD", 5)
    assert [(c.ref.name, c.operator, c.ref.value) for c in hand.conditions] == [("смелость", "GTE", 1.0)]

    effect, gate = ball.nodes[3], ball.nodes[4]
    assert effect.label == "дальше" and effect.next_ref == 4
    assert (effect.effects[0].ref.name, effect.effects[0].op, effect.effects[0].ref.value) == ("была на балу", "SET", True)
    assert (gate.then_label, gate.else_label) == ("тепло", "холод")

    garden = chapters[1].result
    # No "иначе": the branch simply continues with the next line.
    assert garden.nodes[0].type == "CONDITION" and garden.nodes[0].then_label == "помнит" and garden.nodes[0].else_ref == 1


def test_bad_expressions_and_unknown_branch_targets_are_reported():
    result = parse_script("{доверие хорошо}\n- вне выбора\n[если ключ = да] -> нигде\nКонец.\n=== КОНЕЦ ===")
    messages = " | ".join(i["message"] for i in result.issues)
    assert "Не удалось разобрать изменение" in messages and "нигде" in messages


def test_variable_keys_are_latin_snake_case():
    from app.services.import_service import variable_key

    assert variable_key("Доверие") == "doverie"
    assert variable_key("была на балу") == "byla_na_balu"
    assert variable_key("5 шагов") == "v_5_shagov"


async def test_whole_story_document_import_builds_playable_linked_chapters(
    client, make_user, auth_headers, make_story
):
    story = await make_story()
    headers = auth_headers(await make_user("story-importer@example.com", role="EDITOR"))
    base = f"/api/admin/stories/{story.id}"

    preview = (await client.post(f"{base}/import/preview", headers=headers, json={"text": STORY_DOC})).json()
    assert preview["canImport"] is True
    assert [(c["season"], c["index"], c["title"], c["target"]) for c in preview["chapters"]] == [
        (1, 1, "Бал", "new"), (1, 2, "Сад", "new"), (2, 1, "Возвращение", "new"),
    ]
    assert preview["chapters"][0]["counts"] == {"dialogue": 4, "choice": 1, "condition": 1, "effect": 1, "end": 2, "options": 3}
    assert {s["name"] for s in preview["speakers"]} == {"Адриан", "Лия"}
    assert {(v["name"], v["character"], v["exists"], v["type"]) for v in preview["variables"]} == {
        ("доверие", "Адриан", False, "NUMBER"), ("смелость", None, False, "NUMBER"), ("была на балу", None, False, "BOOLEAN"),
    }

    done = await client.post(
        f"{base}/import", headers=headers, json={"text": STORY_DOC, "speakers": {"Адриан": "__create__", "Лия": "__create__"}}
    )
    assert done.status_code == 201, done.text
    assert done.json() == {"createdChapters": 3, "filledChapters": 0, "createdNodes": 16, "createdCharacters": 2, "createdVariables": 3}

    detail = (await client.get(base, headers=headers)).json()
    assert [(s["index"], [c["title"]["ru"] for c in s["chapters"]]) for s in detail["seasons"]] == [(1, ["Бал", "Сад"]), (2, ["Возвращение"])]
    assert sorted(v["key"] for v in detail["variableDefinitions"]) == ["byla_na_balu", "doverie", "smelost"]

    qa = (await client.get(f"{base}/qa", headers=headers)).json()
    assert [(c["publishable"], c["errorCount"]) for c in qa] == [(True, 0)] * 3, qa
    # Chapter 1 always sets the flag, so chapter 2's "never been here" branch can't happen -
    # narrative QA, fed with chapter 1's real outcomes, notices that on its own.
    assert [c["stats"]["coveragePercent"] for c in qa] == [100, 60, 100]
    assert "NEVER_VISITED" in {i["code"] for i in qa[1]["issues"]}

    # The graph sees the deferred consequences the document describes.
    graph = (await client.get(f"{base}/graph", headers=headers)).json()
    labels = {n["id"]: n["label"] for n in graph["nodes"]}
    links = {(labels[i["from"]], labels[i["to"]], i["crossChapter"]) for i in graph["influences"]}
    assert ("Улыбнуться", "Доверие (Адриан) ≥ 2", False) in links
    assert ("Была на балу = да", "Была на балу = да", True) in links

    # Play it: publish both chapters of season 1 and check the flag carries into chapter 2.
    ch1, ch2 = (c["id"] for c in detail["seasons"][0]["chapters"])
    for chapter_id in (ch1, ch2):
        assert (await client.post(f"/api/admin/chapters/{chapter_id}/publish", headers=headers)).status_code == 200
    assert (await client.post(f"{base}/publish", headers=headers)).status_code == 200

    async def post(path, **body):
        response = await client.post(f"/api/play/{path}", headers=headers, json=body or None)
        assert response.status_code == 200, response.text
        return response.json()

    view = await post(f"chapters/{ch1}/start", slotIndex=1)
    slot = view["saveSlot"]["id"]
    view = await post(f"save-slots/{slot}/advance")
    view = await post(f"save-slots/{slot}/advance")
    assert [o["text"]["ru"] for o in view["options"]] == ["Улыбнуться", "Промолчать"]  # the gated one is hidden
    view = await post(f"save-slots/{slot}/choice", choiceOptionId=view["options"][0]["id"])
    assert view["text"]["ru"] == "Я рад, что вы пришли." and view["speaker"]["name"]["ru"] == "Адриан"
    end = await post(f"save-slots/{slot}/advance")
    assert end["endingTitle"]["ru"] == "Тёплый вечер"
    second = await post(f"chapters/{ch2}/start", slotIndex=1)
    assert second["text"]["ru"] == "Я помню этот сад." and second["isThought"] is True

    # Importing the same document again never overwrites finished chapters.
    again = (await client.post(f"{base}/import/preview", headers=headers, json={"text": STORY_DOC})).json()
    assert again["canImport"] is False and {c["target"] for c in again["chapters"]} == {"blocked"}
    refused = await client.post(f"{base}/import", headers=headers, json={"text": STORY_DOC, "speakers": {}})
    assert refused.status_code == 400


async def test_story_import_is_all_or_nothing(client, make_user, auth_headers, make_story):
    story = await make_story()
    headers = auth_headers(await make_user("story-importer2@example.com", role="EDITOR"))
    broken = "## Глава 1: Целая\nРеплика.\n=== КОНЕЦ ===\n## Глава 2: Оборванная\nРеплика без конца."
    response = await client.post(f"/api/admin/stories/{story.id}/import", headers=headers, json={"text": broken, "speakers": {}})
    assert response.status_code == 400
    assert (await client.get(f"/api/admin/stories/{story.id}", headers=headers)).json()["seasons"] == []
    no_headings = await client.post(f"/api/admin/stories/{story.id}/import/preview", headers=headers, json={"text": "Просто текст."})
    assert no_headings.json()["canImport"] is False


def test_docx_heading_styles_become_chapter_headings():
    document = (
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Сезон 1</w:t></w:r></w:p>'
        '<w:p><w:pPr><w:pStyle w:val="2"/></w:pPr><w:r><w:t>Глава 1: Бал</w:t></w:r></w:p>'
        "<w:p><w:r><w:t>Вечер.</w:t></w:r></w:p><w:p><w:r><w:t>=== КОНЕЦ ===</w:t></w:r></w:p></w:body></w:document>"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", document)
    chapters, issues = script_import.parse_document(script_import.docx_to_text(buffer.getvalue()))
    assert [(c.season, c.index, c.title) for c in chapters] == [(1, 1, "Бал")] and issues == []
