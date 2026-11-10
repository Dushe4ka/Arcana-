"""«ARCANA ENGINE TEST» - a technical story that exercises every engine feature.

NOT canon, NOT a release: it is flagged `is_test`, so players never see it; staff accounts
can open it in the app and in the admin preview. Re-running the seed rebuilds it with the
same ids (uuid5), so links and existing staff saves keep working.

    python -m app.devtools.engine_test_story
"""

import asyncio
import uuid
from pathlib import Path

from sqlalchemy import select

from app.config import settings
from app.devtools import placeholder_assets as art
from app.models.content import Chapter, Character, ChoiceOption, SceneNode, Season, Story, VariableDefinition
from app.models.enums import ContentStatus, StoryGenre
from app.services import publications_service

SLUG = "arcana-engine-test"
_NS = uuid.uuid5(uuid.NAMESPACE_URL, "https://arcana.app/engine-test")
ASSET_DIR = "engine-test"


def _id(name: str) -> uuid.UUID:
    return uuid.uuid5(_NS, name)


def _assets() -> dict[str, str]:
    """Writes the placeholder media into the uploads folder (idempotent) and returns URLs."""
    folder = Path(settings.uploads_dir) / ASSET_DIR
    folder.mkdir(parents=True, exist_ok=True)
    files = {
        "bg_hall": lambda p: art.gradient_png(p, (58, 40, 30), (20, 14, 12)),
        "bg_garden": lambda p: art.gradient_png(p, (30, 44, 62), (12, 16, 24)),
        "cg_dance": lambda p: art.gradient_png(p, (120, 70, 60), (40, 18, 24)),
        "cover": lambda p: art.gradient_png(p, (90, 66, 40), (26, 22, 19), size=(360, 540)),
        "lia_neutral": lambda p: art.sprite_png(p, (176, 132, 120), (212, 175, 106)),
        "lia_smile": lambda p: art.sprite_png(p, (176, 132, 120), (240, 210, 150)),
        "lia_dress_neutral": lambda p: art.sprite_png(p, (120, 40, 52), (212, 175, 106)),
        "lia_dress_smile": lambda p: art.sprite_png(p, (120, 40, 52), (240, 210, 150)),
        "adrian_neutral": lambda p: art.sprite_png(p, (70, 82, 104), (180, 190, 205)),
        "adrian_smile": lambda p: art.sprite_png(p, (70, 82, 104), (212, 175, 106)),
        "adrian_surprised": lambda p: art.sprite_png(p, (70, 82, 104), (224, 133, 133)),
        "stranger_neutral": lambda p: art.sprite_png(p, (60, 52, 70), (167, 139, 218)),
    }
    sounds = {
        "music_theme": lambda p: art.tone_wav(p, [220.0, 277.18, 329.63], 4.0, 0.18),
        "music_romance": lambda p: art.tone_wav(p, [196.0, 246.94, 293.66, 369.99], 4.0, 0.18),
        "sfx_door": lambda p: art.tone_wav(p, [90.0, 135.0], 0.35, 0.5),
        "sfx_chime": lambda p: art.tone_wav(p, [880.0, 1318.5], 0.5, 0.3),
    }
    urls = {}
    for name, make in {**files, **sounds}.items():
        path = folder / f"{name}.{'wav' if name in sounds else 'png'}"
        if not path.exists():
            make(path)
        urls[name] = f"{settings.public_base_url}/uploads/{ASSET_DIR}/{path.name}"
    return urls


class _Builder:
    def __init__(self, db, chapter: Chapter, prefix: str):
        # Nodes are created back to front (targets first), so count the order down to list
        # them in reading order in the editor.
        self.db, self.chapter, self.prefix, self.order = db, chapter, prefix, 1000

    def node(self, name: str, node_type: str, **data) -> uuid.UUID:
        node_id = _id(f"{self.prefix}:{name}")
        clean = {k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in data.items() if v is not None}
        self.db.add(
            SceneNode(id=node_id, chapter_id=self.chapter.id, type=node_type, order=self.order, data=clean)
        )
        self.order -= 1
        return node_id

    def say(self, name: str, text: str, next_node=None, **data) -> uuid.UUID:
        return self.node(name, "DIALOGUE", text={"ru": text}, nextNodeId=next_node, **data)

    def option(
        self, choice_id: uuid.UUID, name: str, text: str, next_node, order: int, **kwargs
    ) -> uuid.UUID:
        option_id = _id(f"{self.prefix}:option:{name}")
        self.db.add(
            ChoiceOption(
                id=option_id,
                node_id=choice_id,
                text={"ru": text},
                next_node_id=next_node,
                order=order,
                **kwargs,
            )
        )
        return option_id


def _fx(key: str, op: str, value, character=None) -> dict:
    return {
        "variableKey": key,
        "characterId": str(character) if character else None,
        "op": op,
        "value": value,
    }


def _when(key: str, operator: str, value, character=None) -> dict:
    return {
        "variableKey": key,
        "characterId": str(character) if character else None,
        "operator": operator,
        "value": value,
    }


async def seed_engine_test_story(db) -> Story:
    existing = await db.scalar(select(Story).where(Story.slug == SLUG))
    if existing:
        await db.delete(existing)
        await db.commit()

    a = _assets()
    story = Story(
        id=_id("story"),
        slug=SLUG,
        status=ContentStatus.PUBLISHED,
        genre=StoryGenre.ROMANCE,
        is_test=True,
        title={"ru": "ARCANA ENGINE TEST", "en": "ARCANA ENGINE TEST"},
        description={
            "ru": "Технический сценарий для проверки движка. Не является историей ARCANA и не показывается игрокам."
        },
        cover_image_url=a["cover"],
    )
    db.add(story)
    await db.flush()

    lia, adrian, stranger = _id("char:lia"), _id("char:adrian"), _id("char:stranger")
    db.add_all(
        [
            Character(
                id=lia,
                story_id=story.id,
                name={"ru": "Тест-героиня"},
                name_color="#E8B4BC",
                is_protagonist=True,
                sprites={
                    "neutral": a["lia_neutral"],
                    "smile": a["lia_smile"],
                    "dress_neutral": a["lia_dress_neutral"],
                    "dress_smile": a["lia_dress_smile"],
                },
            ),
            Character(
                id=adrian,
                story_id=story.id,
                name={"ru": "Тест-герой"},
                name_color="#D4AF6A",
                sprites={
                    "neutral": a["adrian_neutral"],
                    "smile": a["adrian_smile"],
                    "surprised": a["adrian_surprised"],
                },
            ),
            Character(
                id=stranger,
                story_id=story.id,
                name={"ru": "Тест-незнакомка"},
                name_color="#A78BDA",
                sprites={"neutral": a["stranger_neutral"]},
            ),
        ]
    )
    await db.flush()
    db.add_all(
        [
            VariableDefinition(
                story_id=story.id, key="courage", label={"ru": "Смелость"}, type="NUMBER",
                default_value=0, min_value=0, max_value=10,
            ),
            VariableDefinition(
                story_id=story.id, key="trust", label={"ru": "Доверие"}, type="NUMBER",
                default_value=0, min_value=0, max_value=100, character_id=adrian,
            ),
            VariableDefinition(
                story_id=story.id, key="romance", label={"ru": "Симпатия"}, type="NUMBER",
                default_value=0, min_value=0, max_value=10, character_id=adrian,
            ),
            VariableDefinition(
                story_id=story.id, key="outfit", label={"ru": "Наряд"}, type="STRING",
                default_value="", character_id=lia,
            ),
            VariableDefinition(
                story_id=story.id, key="saw_garden", label={"ru": "Была в саду"}, type="BOOLEAN", default_value=False,
            ),
        ]
    )  # fmt: skip

    season = Season(id=_id("season"), story_id=story.id, index=1, title={"ru": "Проверка движка"})
    db.add(season)
    await db.flush()
    one = Chapter(id=_id("ch1"), season_id=season.id, index=1, title={"ru": "Все механики"}, unlock_cost=0)
    two = Chapter(id=_id("ch2"), season_id=season.id, index=2, title={"ru": "Последствия"}, unlock_cost=3)
    db.add_all([one, two])
    await db.flush()

    lia_left = {"characterId": str(lia), "position": "left"}
    adrian_right = {"characterId": str(adrian), "position": "right"}

    # ----- Chapter 1: built back to front so every node can point at an existing target -----
    b = _Builder(db, one, "ch1")
    end_alone = b.node(
        "end_alone", "END", endingKey="alone", endingTitle={"ru": "Финал: одна в саду"}, rewardSoft=10
    )
    end_dawn = b.node(
        "end_dawn", "END", endingKey="dawn", endingTitle={"ru": "Финал: рассвет вдвоём"}, rewardSoft=30
    )
    line_alone = b.say(
        "line_alone", "Музыка стихла. Она осталась одна.", end_alone, music={"action": "stop", "fadeMs": 1500}
    )
    line_dawn = b.say(
        "line_dawn", "Он остался до рассвета.", end_dawn,
        speakerCharacterId=adrian, staged=[{**lia_left, "sprite": "smile"}, {**adrian_right, "sprite": "smile"}],
        music={"action": "stop", "fadeMs": 1500},
    )  # fmt: skip
    final_gate = b.node(
        "final_gate",
        "CONDITION",
        when=[_when("romance", "GTE", 2, adrian)],
        thenNodeId=line_dawn,
        elseNodeId=line_alone,
    )
    dressed = b.say(
        "dressed", "Наряд сменился — спрайт подобран по переменной outfit.", final_gate,
        speakerCharacterId=lia, staged=[{**lia_left, "sprite": "smile", "animation": "bounce"}],
    )  # fmt: skip
    wardrobe = b.node("wardrobe", "EFFECT", effects=[_fx("outfit", "SET", "dress", lia)], nextNodeId=dressed)

    after_timed = b.say(
        "after_timed", "Выбор с таймером пройден.", wardrobe, staged=[{**lia_left, "sprite": "neutral"}]
    )
    timed = b.node("timed", "CHOICE", prompt={"ru": "Ответить, пока он не ушёл (10 секунд)"})
    silent = b.option(timed, "silent", "Промолчать", after_timed, 0)
    b.option(
        timed, "speak", "Окликнуть его", after_timed, 1, effects=[_fx("romance", "INCREMENT", 1, adrian)]
    )
    b.option(
        timed, "bold", "Взять его за руку (нужна смелость)", after_timed, 2,
        visible_when=[_when("courage", "GTE", 1)], effects=[_fx("romance", "INCREMENT", 2, adrian)],
    )  # fmt: skip
    garden = b.say(
        "garden", "Сад. Смена фона с растворением, дождь, тряска экрана и камера на правую сторону.", timed,
        backgroundImageUrl=a["bg_garden"], transition="dissolve", atmosphere="rain", screenEffect="shake",
        camera={"zoom": 1.25, "focus": "right", "durationMs": 1200}, cgImageUrl="",
        staged=[{**lia_left, "sprite": "neutral"}, {**adrian_right, "sprite": "surprised", "animation": "shake"}],
    )  # fmt: skip
    mark_garden = b.node("mark_garden", "EFFECT", effects=[_fx("saw_garden", "SET", True)], nextNodeId=garden)

    trusted = b.say(
        "trusted", "«Я рад, что вы пришли», — условие trust ≥ 10 выполнено.", mark_garden,
        speakerCharacterId=adrian, staged=[{**adrian_right, "sprite": "smile", "animation": "nod"}],
    )  # fmt: skip
    distant = b.say(
        "distant", "«Что ж…» — условие trust ≥ 10 не выполнено.", mark_garden,
        speakerCharacterId=adrian, staged=[{**adrian_right, "sprite": "neutral"}],
    )  # fmt: skip
    trust_gate = b.node(
        "trust_gate",
        "CONDITION",
        when=[_when("trust", "GTE", 10, adrian)],
        thenNodeId=trusted,
        elseNodeId=distant,
    )
    cg_scene = b.say(
        "cg_scene", "Особая сцена: иллюстрация на весь экран, приближение камеры, новая музыка.", trust_gate,
        cgImageUrl=a["cg_dance"], camera={"zoom": 1.4, "focus": "center", "durationMs": 2000},
        music={"action": "play", "url": a["music_romance"], "fadeMs": 1200}, atmosphere="sparkles", sfxUrl=a["sfx_chime"],
    )  # fmt: skip
    first = b.node("first_choice", "CHOICE", prompt={"ru": "Как ответить?"})
    b.option(
        first, "warm", "Тепло улыбнуться", trust_gate, 0,
        effects=[_fx("trust", "INCREMENT", 10, adrian), _fx("romance", "INCREMENT", 1, adrian)],
    )  # fmt: skip
    b.option(first, "ironic", "Отшутиться", trust_gate, 1, effects=[_fx("courage", "INCREMENT", 1)])
    b.option(
        first, "premium", "Пригласить на танец", cg_scene, 2, cost_currency="HARD", cost_amount=5,
        effects=[_fx("romance", "INCREMENT", 2, adrian), _fx("trust", "INCREMENT", 10, adrian)],
    )  # fmt: skip
    enters = b.say(
        "enters", "«Добрый вечер». Появление персонажа из-за края экрана и звук двери.", first,
        speakerCharacterId=adrian, sfxUrl=a["sfx_door"],
        staged=[{**lia_left, "sprite": "neutral"}, {**adrian_right, "sprite": "neutral", "animation": "slide_in"}],
    )  # fmt: skip
    thought = b.say(
        "thought", "Внутренний монолог: текст оформлен как мысль.", enters,
        speakerCharacterId=lia, isThought=True, staged=[{**lia_left, "sprite": "neutral", "animation": "fade_in"}],
    )  # fmt: skip
    intro = b.say(
        "intro", "Описание от рассказчика: фон, музыка и пыль в луче света.", thought,
        backgroundImageUrl=a["bg_hall"], transition="fade", atmosphere="dust",
        music={"action": "play", "url": a["music_theme"], "fadeMs": 1000},
    )  # fmt: skip
    timed_node = await _flush_and_get(db, timed)
    timed_node.data = {**timed_node.data, "timerSeconds": 10, "timeoutOptionId": str(silent)}

    # ----- Chapter 2: consequences carried over from chapter 1 -----
    b2 = _Builder(db, two, "ch2")
    end_together = b2.node("end_together", "END", endingKey="together", endingTitle={"ru": "Финал: вместе"})
    end_apart = b2.node("end_apart", "END", endingKey="apart", endingTitle={"ru": "Финал: порознь"})
    decide = b2.node("decide", "CHOICE", prompt={"ru": "Чем закончится проверка?"})
    b2.option(decide, "stay", "Остаться", end_together, 0, visible_when=[_when("romance", "GTE", 1, adrian)])
    b2.option(decide, "leave", "Уйти", end_apart, 1)
    remembered = b2.say(
        "remembered", "Переменные из первой главы перенесены: симпатия ≥ 2.", decide,
        speakerCharacterId=adrian, staged=[{**adrian_right, "sprite": "smile"}], backgroundImageUrl=a["bg_garden"],
    )  # fmt: skip
    forgotten = b2.say(
        "forgotten", "Переменные из первой главы перенесены: симпатия < 2.", decide,
        speakerCharacterId=stranger, staged=[{"characterId": str(stranger), "position": "center", "sprite": "neutral"}],
        backgroundImageUrl=a["bg_hall"],
    )  # fmt: skip
    carry_gate = b2.node(
        "carry_gate",
        "CONDITION",
        when=[_when("romance", "GTE", 2, adrian)],
        thenNodeId=remembered,
        elseNodeId=forgotten,
    )

    # Nodes must exist before a chapter can point at one as its entry (FK on entry_node_id).
    await db.flush()
    one.entry_node_id = intro
    two.entry_node_id = carry_gate
    one.status = ContentStatus.PUBLISHED
    two.status = ContentStatus.PUBLISHED
    await db.flush()
    for chapter in (one, two):
        await publications_service.snapshot(db, chapter)
    await db.commit()
    return story


async def _flush_and_get(db, node_id: uuid.UUID) -> SceneNode:
    await db.flush()
    return await db.get(SceneNode, node_id)


async def _main() -> None:
    from app.database import SessionLocal

    async with SessionLocal() as db:
        story = await seed_engine_test_story(db)
        print(f"Engine test story ready: {story.slug} (visible to staff accounts only)")


if __name__ == "__main__":
    asyncio.run(_main())
