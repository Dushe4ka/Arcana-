"""Seeds the database with one admin account and one fully playable demo story, so the whole
pipeline (admin content -> API -> mobile reader) can be exercised end to end without
hand-crafting data first. Safe to re-run: it wipes and recreates the demo content each time.

Run with: python seed.py
"""

import asyncio

from sqlalchemy import select

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.content import (
    Chapter,
    Character,
    ChoiceOption,
    SceneNode,
    Season,
    Story,
    VariableDefinition,
)
from app.models.economy import DailyRewardState, Wallet
from app.models.enums import ContentStatus, SceneNodeType
from app.models.user import PlayerProfile, User

PLACEHOLDER_BG_NIGHT = "https://picsum.photos/seed/arcana-night-hall/1200/800"
PLACEHOLDER_BG_STREET = "https://picsum.photos/seed/arcana-street/1200/800"
PLACEHOLDER_BG_DANCE = "https://picsum.photos/seed/arcana-dance/1200/800"
PLACEHOLDER_SPRITE_DANTE = "https://picsum.photos/seed/arcana-dante/600/1200"
PLACEHOLDER_SPRITE_LIA = "https://picsum.photos/seed/arcana-lia/600/1200"
PLACEHOLDER_SPRITE_IRIS = "https://picsum.photos/seed/arcana-iris/600/1200"
PLACEHOLDER_COVER = "https://picsum.photos/seed/arcana-cover/800/1000"


async def seed_admin_user(db):
    email = "admin@arcana.app"
    existing = await db.scalar(select(User).where(User.email == email))
    if not existing:
        user = User(
            email=email, password_hash=hash_password("ChangeMe123!"), role="ADMIN"
        )
        db.add(user)
        await db.flush()
        db.add(PlayerProfile(user_id=user.id, display_name="Arcana Admin"))
        db.add(Wallet(user_id=user.id))
        db.add(DailyRewardState(user_id=user.id))
        await db.commit()
    print(
        f"Admin user ready: {email} / ChangeMe123! (change this password before going live)"
    )


async def seed_demo_story(db):
    slug = "mask-and-word"

    existing = await db.scalar(select(Story).where(Story.slug == slug))
    if existing:
        await db.delete(existing)
        await db.commit()

    story = Story(
        slug=slug,
        status=ContentStatus.PUBLISHED,
        title={"ru": "Маска и Слово", "en": "Mask and Word"},
        description={
            "ru": "Тайное общество «Arcana» открывает вам свои двери лишь на одну ночь. Кому вы отдадите своё внимание — обаятельному хозяину дома Данте или острой на язык Лие?",
            "en": "The secret Arcana society opens its doors to you for one night only. Who will you give your attention to — the charming host Dante, or the sharp-tongued Lia?",
        },
        cover_image_url=PLACEHOLDER_COVER,
    )
    db.add(story)
    await db.flush()

    dante = Character(
        story_id=story.id,
        name={"ru": "Данте Аркана", "en": "Dante Arcana"},
        name_color="#D4AF6A",
        sprites={
            "neutral": PLACEHOLDER_SPRITE_DANTE,
            "smile": PLACEHOLDER_SPRITE_DANTE,
        },
    )
    lia = Character(
        story_id=story.id,
        name={"ru": "Лия Северцева", "en": "Lia Severtseva"},
        name_color="#4FB3A9",
        sprites={"neutral": PLACEHOLDER_SPRITE_LIA, "smirk": PLACEHOLDER_SPRITE_LIA},
    )
    iris = Character(
        story_id=story.id,
        name={"ru": "Мадам Ирис", "en": "Madame Iris"},
        name_color="#B08BC7",
        sprites={"neutral": PLACEHOLDER_SPRITE_IRIS},
    )
    db.add_all([dante, lia, iris])
    await db.flush()

    confidence = VariableDefinition(
        story_id=story.id,
        key="confidence",
        label={"ru": "Уверенность", "en": "Confidence"},
        type="NUMBER",
        default_value=0,
        min_value=-10,
        max_value=10,
    )
    rel_dante = VariableDefinition(
        story_id=story.id,
        key="relationship",
        character_id=dante.id,
        label={"ru": "Отношения с Данте", "en": "Relationship with Dante"},
        type="NUMBER",
        default_value=0,
        min_value=0,
        max_value=100,
    )
    rel_lia = VariableDefinition(
        story_id=story.id,
        key="relationship",
        character_id=lia.id,
        label={"ru": "Отношения с Лией", "en": "Relationship with Lia"},
        type="NUMBER",
        default_value=0,
        min_value=0,
        max_value=100,
    )
    db.add_all([confidence, rel_dante, rel_lia])
    await db.flush()

    season = Season(
        story_id=story.id, index=1, title={"ru": "Сезон 1", "en": "Season 1"}
    )
    db.add(season)
    await db.flush()

    await seed_chapter_one(
        db, season.id, dante, lia, iris, confidence, rel_dante, rel_lia
    )
    await seed_chapter_two(db, season.id, dante, lia, rel_dante)

    print(f'Demo story ready: "{slug}"')


async def seed_chapter_one(
    db, season_id, dante, lia, iris, confidence, rel_dante, rel_lia
):
    chapter = Chapter(
        season_id=season_id,
        index=1,
        title={"ru": "Приглашение", "en": "The Invitation"},
        status=ContentStatus.PUBLISHED,
        unlock_cost=0,
    )
    db.add(chapter)
    await db.flush()

    def dialogue(
        order,
        speaker,
        text_ru,
        text_en,
        *,
        thought=False,
        bg=PLACEHOLDER_BG_NIGHT,
        staged=None,
    ):
        node = SceneNode(
            chapter_id=chapter.id,
            type=SceneNodeType.DIALOGUE,
            order=order,
            data={
                "speakerCharacterId": str(speaker) if speaker else None,
                "text": {"ru": text_ru, "en": text_en},
                "isThought": thought,
                "backgroundImageUrl": bg,
                "staged": staged or [],
                "nextNodeId": None,
            },
        )
        db.add(node)
        return node

    n1 = dialogue(
        1,
        None,
        "Конверт без обратного адреса лежал на вашем столе всё утро. Плотная бумага, восковая печать в виде глаза внутри треугольника.",
        "The envelope with no return address had been sitting on your desk all morning. Heavy paper, a wax seal shaped like an eye inside a triangle.",
        bg=PLACEHOLDER_BG_STREET,
    )
    n2 = dialogue(
        2,
        None,
        "«Сегодня. Полночь. Дом на набережной. Приходите одни» — вот и всё, что там написано.",
        '"Tonight. Midnight. The house on the embankment. Come alone." That\'s all it says.',
        thought=True,
        bg=PLACEHOLDER_BG_STREET,
    )
    n3 = dialogue(
        3,
        iris.id,
        "— Вы всё-таки пришли, — женщина в серебряной маске оглядывает вас с ног до головы. — Как вас представить гостям?",
        '"So you actually came," the woman in the silver mask looks you up and down. "How shall I announce you to the guests?"',
        staged=[
            {"characterId": str(iris.id), "sprite": "neutral", "position": "center"}
        ],
    )
    await db.flush()

    n4 = SceneNode(
        chapter_id=chapter.id, type=SceneNodeType.CHOICE, order=4, data={"prompt": None}
    )
    db.add(n4)
    await db.flush()

    n5 = dialogue(
        5,
        None,
        "Двери зала распахиваются. Свечи, тихая музыка и два взгляда, обращённых прямо на вас.",
        "The hall doors swing open. Candles, quiet music, and two pairs of eyes turn straight to you.",
    )
    n6 = dialogue(
        6,
        dante.id,
        "— Добро пожаловать в Arcana, — он склоняет голову ровно настолько, чтобы это выглядело как учтивость, а не смирение. — Я почти не сомневался, что вы придёте.",
        '"Welcome to Arcana," he tilts his head just enough for it to read as courtesy, not deference. "I was almost certain you\'d come."',
        staged=[
            {"characterId": str(dante.id), "sprite": "neutral", "position": "left"},
            {"characterId": str(lia.id), "sprite": "neutral", "position": "right"},
        ],
    )
    await db.flush()

    n7 = SceneNode(
        chapter_id=chapter.id,
        type=SceneNodeType.CHOICE,
        order=7,
        data={
            "prompt": {
                "ru": "Кому вы уделите внимание?",
                "en": "Who do you give your attention to?",
            }
        },
    )
    db.add(n7)
    await db.flush()

    n8 = dialogue(
        8,
        dante.id,
        "— Расскажите мне что-нибудь, чего не знает больше никто в этом зале, — говорит он тихо, будто это уже тайна на двоих.",
        '"Tell me something no one else in this room knows," he says quietly, as if it\'s already a secret shared between the two of you.',
        staged=[
            {"characterId": str(dante.id), "sprite": "smile", "position": "center"}
        ],
    )
    n9 = dialogue(
        9,
        lia.id,
        "— Данте всем так говорит в первые пять минут, — она едва заметно улыбается. — У вас есть вопрос получше?",
        '"Dante says that to everyone in the first five minutes," she smiles almost imperceptibly. "Got a better question?"',
        staged=[{"characterId": str(lia.id), "sprite": "smirk", "position": "center"}],
    )
    n10 = dialogue(
        10,
        None,
        "Вы улыбаетесь загадочно и не отвечаете ни ему, ни ей — и оба, кажется, заинтригованы этим даже больше, чем прямым ответом.",
        "You smile mysteriously and answer neither of them — and both seem more intrigued by that than they would by a straight answer.",
    )
    await db.flush()

    n11 = SceneNode(
        chapter_id=chapter.id,
        type=SceneNodeType.CONDITION,
        order=11,
        data={
            "when": [{"variableKey": confidence.key, "operator": "GT", "value": 0}],
            "thenNodeId": None,
            "elseNodeId": None,
        },
    )
    db.add(n11)
    await db.flush()

    n12 = dialogue(
        12,
        None,
        "Вы держитесь уверенно, и зал будто отвечает вам тем же — сегодняшняя ночь определённо ваша.",
        "You carry yourself with confidence, and the room seems to answer in kind — tonight is definitely yours.",
    )
    n13 = dialogue(
        13,
        None,
        "Сердце колотится где-то в горле, но вы остаётесь в зале — и это уже маленькая победа.",
        "Your heart is pounding somewhere in your throat, but you stay in the room — and that's already a small victory.",
        thought=True,
    )
    await db.flush()

    n14 = SceneNode(
        chapter_id=chapter.id,
        type=SceneNodeType.END,
        order=14,
        data={"unlocksNextChapter": True},
    )
    db.add(n14)
    await db.flush()

    # Wire up linear "next" pointers now that every node has an id.
    n1.data = {**n1.data, "nextNodeId": str(n2.id)}
    n2.data = {**n2.data, "nextNodeId": str(n3.id)}
    # n3 leads into the CHOICE node n4 - dialogue "next" points at a choice node id, which the
    # reading engine treats the same way (it just resolves whatever node comes next).
    n3.data = {**n3.data, "nextNodeId": str(n4.id)}
    n5.data = {**n5.data, "nextNodeId": str(n6.id)}
    n6.data = {**n6.data, "nextNodeId": str(n7.id)}
    n8.data = {**n8.data, "nextNodeId": str(n11.id)}
    n9.data = {**n9.data, "nextNodeId": str(n11.id)}
    n10.data = {**n10.data, "nextNodeId": str(n11.id)}
    n12.data = {**n12.data, "nextNodeId": str(n14.id)}
    n13.data = {**n13.data, "nextNodeId": str(n14.id)}
    n11.data = {**n11.data, "thenNodeId": str(n12.id), "elseNodeId": str(n13.id)}

    # Choice at n4: how do you introduce yourself to Madame Iris.
    db.add_all(
        [
            ChoiceOption(
                node_id=n4.id,
                order=1,
                text={
                    "ru": "Уверенно назвать своё полное имя",
                    "en": "Confidently give your full name",
                },
                effects=[
                    {"variableKey": confidence.key, "op": "INCREMENT", "value": 1}
                ],
                next_node_id=n5.id,
            ),
            ChoiceOption(
                node_id=n4.id,
                order=2,
                text={
                    "ru": "Молча протянуть приглашение",
                    "en": "Silently hand over the invitation",
                },
                effects=[
                    {"variableKey": confidence.key, "op": "DECREMENT", "value": 1}
                ],
                next_node_id=n5.id,
            ),
        ]
    )

    # Choice at n7: who do you talk to - this drives the relationship variables that later
    # chapters (and the CONDITION node above) branch on.
    db.add_all(
        [
            ChoiceOption(
                node_id=n7.id,
                order=1,
                text={"ru": "Заговорить с Данте", "en": "Talk to Dante"},
                effects=[
                    {
                        "variableKey": rel_dante.key,
                        "characterId": str(dante.id),
                        "op": "INCREMENT",
                        "value": 10,
                    }
                ],
                next_node_id=n8.id,
            ),
            ChoiceOption(
                node_id=n7.id,
                order=2,
                text={"ru": "Заговорить с Лией", "en": "Talk to Lia"},
                effects=[
                    {
                        "variableKey": rel_lia.key,
                        "characterId": str(lia.id),
                        "op": "INCREMENT",
                        "value": 10,
                    }
                ],
                next_node_id=n9.id,
            ),
            ChoiceOption(
                node_id=n7.id,
                order=3,
                text={
                    "ru": "Загадочно улыбнуться им обоим (платный выбор)",
                    "en": "Smile mysteriously at both of them (paid)",
                },
                cost_currency="HARD",
                cost_amount=5,
                effects=[
                    {
                        "variableKey": rel_dante.key,
                        "characterId": str(dante.id),
                        "op": "INCREMENT",
                        "value": 5,
                    },
                    {
                        "variableKey": rel_lia.key,
                        "characterId": str(lia.id),
                        "op": "INCREMENT",
                        "value": 5,
                    },
                ],
                next_node_id=n10.id,
            ),
        ]
    )

    chapter.entry_node_id = n1.id
    await db.commit()


async def seed_chapter_two(db, season_id, dante, lia, rel_dante):
    chapter = Chapter(
        season_id=season_id,
        index=2,
        title={"ru": "Первый танец", "en": "The First Dance"},
        status=ContentStatus.PUBLISHED,
        # Costs energy/tickets to unlock, unlike the free first chapter - this is the
        # ticket/energy gate the product spec asks for.
        unlock_cost=5,
    )
    db.add(chapter)
    await db.flush()

    n1 = SceneNode(
        chapter_id=chapter.id,
        type=SceneNodeType.DIALOGUE,
        order=1,
        data={
            "speakerCharacterId": None,
            "text": {
                "ru": "Оркестр заводит вальс. По негласному правилу Arcana первый танец нельзя разделить втроём.",
                "en": "The orchestra strikes up a waltz. By Arcana's unspoken rule, the first dance can't be shared three ways.",
            },
            "isThought": False,
            "backgroundImageUrl": PLACEHOLDER_BG_DANCE,
            "staged": [],
            "nextNodeId": None,
        },
    )
    db.add(n1)
    await db.flush()

    n2 = SceneNode(
        chapter_id=chapter.id,
        type=SceneNodeType.CONDITION,
        order=2,
        data={
            "when": [
                {
                    "variableKey": rel_dante.key,
                    "characterId": str(dante.id),
                    "operator": "GTE",
                    "value": 10,
                }
            ],
            "thenNodeId": None,
            "elseNodeId": None,
        },
    )
    db.add(n2)
    await db.flush()

    n3 = SceneNode(
        chapter_id=chapter.id,
        type=SceneNodeType.DIALOGUE,
        order=3,
        data={
            "speakerCharacterId": str(dante.id),
            "text": {
                "ru": "— Кажется, это моя привилегия, — Данте протягивает руку так, будто иначе и быть не могло.",
                "en": '"I believe this is my privilege," Dante offers his hand as though it could be no other way.',
            },
            "isThought": False,
            "backgroundImageUrl": PLACEHOLDER_BG_DANCE,
            "staged": [
                {"characterId": str(dante.id), "sprite": "smile", "position": "center"}
            ],
            "nextNodeId": None,
        },
    )
    n4 = SceneNode(
        chapter_id=chapter.id,
        type=SceneNodeType.DIALOGUE,
        order=4,
        data={
            "speakerCharacterId": str(lia.id),
            "text": {
                "ru": "— Ну надо же, — Лия скрещивает руки на груди, но в её голосе больше веселья, чем обиды. — В следующий раз я быстрее.",
                "en": '"Well, look at that," Lia crosses her arms, more amused than offended. "Next time I\'ll be faster."',
            },
            "isThought": False,
            "backgroundImageUrl": PLACEHOLDER_BG_DANCE,
            "staged": [
                {"characterId": str(lia.id), "sprite": "smirk", "position": "center"}
            ],
            "nextNodeId": None,
        },
    )
    db.add_all([n3, n4])
    await db.flush()

    n5 = SceneNode(
        chapter_id=chapter.id,
        type=SceneNodeType.END,
        order=5,
        data={"unlocksNextChapter": True},
    )
    db.add(n5)
    await db.flush()

    n1.data = {**n1.data, "nextNodeId": str(n2.id)}
    n2.data = {**n2.data, "thenNodeId": str(n3.id), "elseNodeId": str(n4.id)}
    n3.data = {**n3.data, "nextNodeId": str(n5.id)}
    n4.data = {**n4.data, "nextNodeId": str(n5.id)}

    chapter.entry_node_id = n1.id
    await db.commit()


async def main():
    async with SessionLocal() as db:
        await seed_admin_user(db)
        await seed_demo_story(db)
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(main())
