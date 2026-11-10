"""Turns a plain-text screenplay into scene nodes.

Writers keep stories in documents, not in a graph editor. This parser reads a deliberately
small, forgiving plain-text convention (TXT, Markdown or the text of a DOCX) and produces a
draft node list plus everything a human has to decide before it is saved: unknown speakers,
labels nobody defined, lines it could not classify. Nothing here guesses silently, and
nothing is ever published by an import.

The convention, one construct per line:

    Вечер. Зал наполнялся гостями.            narration
    Адриан: Добрый вечер.                     speech   (name before the first colon)
    Лия (мысли): Он смотрит на меня.          thought
    @фон: https://.../hall.jpg                direction for the NEXT line: фон, музыка,
    @музыка: стоп                             звук, атмосфера, эффект, переход, cg
    ? Как ответить?                           starts a choice (the text is the prompt)
    - Улыбнуться -> тепло                     option, jumps to label «тепло»
    - Пригласить на танец [кристаллы 5] -> танец     paid option (кристаллы / монеты)
    == тепло ==                               label: the next line can be jumped to
    -> финал                                  jump from the previous line
    === КОНЕЦ ===  or  === КОНЕЦ: Название === end of the chapter (optionally a named ending)
    # anything                                comment, ignored
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field
from xml.etree import ElementTree

MAX_SCRIPT_CHARS = 400_000
_SPEECH = re.compile(
    r"^([^:：\n]{1,60}?)\s*(\((мысли|думает|про себя|thought)\))?\s*[:：]\s*(.+)$", re.IGNORECASE
)
_LABEL = re.compile(r"^==\s*([^=]+?)\s*==$")
_END = re.compile(r"^===\s*(КОНЕЦ|END)\s*(?:[:：]\s*(.+?))?\s*===$", re.IGNORECASE)
_GOTO = re.compile(r"^->\s*(.+)$")
_OPTION = re.compile(r"^[-–—*]\s+(.+?)(?:\s*->\s*(.+))?$")
_COST = re.compile(r"\[\s*(кристалл\w*|монет\w*|hard|soft|💎|🪙)\s*(\d+)\s*\]", re.IGNORECASE)
_DIRECTION = re.compile(r"^@\s*([^:：]+?)\s*[:：]\s*(.+)$")

_ATMOSPHERES = {
    "нет": "none", "убрать": "none", "дождь": "rain", "снег": "snow", "туман": "fog",
    "пыль": "dust", "искры": "sparkles", "лепестки": "petals",
}  # fmt: skip
_EFFECTS = {"тряска": "shake", "вспышка": "flash", "сердце": "heartbeat", "расфокус": "blur_in"}
_TRANSITIONS = {"затемнение": "fade", "растворение": "dissolve", "сдвиг": "slide", "нет": "none"}
_STOP_WORDS = {"стоп", "stop", "нет", "выкл", "тишина"}


@dataclass
class DraftOption:
    text: str
    target_label: str | None
    cost_currency: str | None = None
    cost_amount: int = 0
    line: int = 0


@dataclass
class DraftNode:
    """One node to create. `next_ref` is the index of the node it continues to, or None."""

    type: str
    line: int
    data: dict = field(default_factory=dict)
    speaker_name: str | None = None
    options: list[DraftOption] = field(default_factory=list)
    next_ref: int | None = None
    goto_label: str | None = None
    label: str | None = None


@dataclass
class ParseResult:
    nodes: list[DraftNode] = field(default_factory=list)
    issues: list[dict] = field(default_factory=list)
    speakers: dict[str, int] = field(default_factory=dict)
    labels: dict[str, int] = field(default_factory=dict)

    def issue(self, severity: str, line: int, message: str) -> None:
        self.issues.append({"severity": severity, "line": line, "message": message})

    @property
    def has_errors(self) -> bool:
        return any(i["severity"] == "error" for i in self.issues)


def docx_to_text(content: bytes) -> str:
    """Extracts paragraph text from a .docx with the standard library only."""
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        if archive.getinfo("word/document.xml").file_size > 20 * 1024 * 1024:
            raise ValueError("Документ слишком большой")
        root = ElementTree.fromstring(archive.read("word/document.xml"))  # noqa: S314 - size-capped, no entities in docx
    lines = []
    for paragraph in root.iter(f"{namespace}p"):
        parts = []
        for node in paragraph.iter():
            if node.tag == f"{namespace}t" and node.text:
                parts.append(node.text)
            elif node.tag in (f"{namespace}br", f"{namespace}tab"):
                parts.append(" ")
        lines.append("".join(parts))
    return "\n".join(lines)


def _clean(line: str) -> str:
    # Markdown emphasis/heading marks around a line carry no meaning for the story.
    stripped = line.strip().replace(" ", " ")
    if stripped.startswith(("**", "__")) and stripped.endswith(("**", "__")) and len(stripped) > 4:
        stripped = stripped[2:-2].strip()
    return stripped


def parse_script(text: str) -> ParseResult:
    result = ParseResult()
    if len(text) > MAX_SCRIPT_CHARS:
        result.issue("error", 0, "Текст слишком длинный для одного импорта - разбейте его по главам")
        return result

    pending_directions: dict = {}
    pending_label: str | None = None
    open_choice: DraftNode | None = None
    # Indices of nodes waiting to be linked to whatever comes next.
    dangling: list[int] = []
    terminated = True  # nothing to link from yet

    def add(node: DraftNode) -> DraftNode:
        nonlocal pending_label, terminated, dangling
        index = len(result.nodes)
        if pending_label is not None:
            node.label = pending_label
            result.labels[pending_label.casefold()] = index
            pending_label = None
        for source in dangling:
            result.nodes[source].next_ref = index
        dangling = []
        result.nodes.append(node)
        terminated = False
        return node

    def apply_directions(node: DraftNode, line_no: int) -> None:
        nonlocal pending_directions
        if not pending_directions:
            return
        if node.type != "DIALOGUE":
            result.issue("warning", line_no, "Ремарка (@...) перед этим элементом не применима и пропущена")
        else:
            node.data.update(pending_directions)
        pending_directions = {}

    for line_no, raw in enumerate(text.splitlines(), start=1):
        line = _clean(raw)
        if not line or line.startswith("#"):
            continue

        if match := _END.match(line):
            open_choice = None
            node = add(DraftNode("END", line_no))
            if match.group(2):
                node.data["endingTitle"] = {"ru": match.group(2).strip()}
            apply_directions(node, line_no)
            terminated = True
            continue

        if match := _LABEL.match(line):
            open_choice = None
            name = match.group(1).strip()
            if name.casefold() in result.labels or (
                pending_label and pending_label.casefold() == name.casefold()
            ):
                result.issue("error", line_no, f"Метка «{name}» объявлена дважды")
            pending_label = name
            continue

        if match := _DIRECTION.match(line):
            _read_direction(
                result, pending_directions, match.group(1).strip().casefold(), match.group(2).strip(), line_no
            )
            continue

        if match := _GOTO.match(line):
            open_choice = None
            if not dangling:
                result.issue("error", line_no, "Переход «->» стоит не после реплики - не от чего переходить")
                continue
            for source in dangling:
                result.nodes[source].goto_label = match.group(1).strip()
            dangling = []
            terminated = True
            continue

        if line.startswith("?"):
            open_choice = add(DraftNode("CHOICE", line_no))
            prompt = line[1:].strip()
            if prompt:
                open_choice.data["prompt"] = {"ru": prompt}
            apply_directions(open_choice, line_no)
            terminated = True  # a choice continues only through its options
            continue

        if open_choice is not None and (match := _OPTION.match(line)):
            body, target = match.group(1), match.group(2)
            option = DraftOption(text=body, target_label=target.strip() if target else None, line=line_no)
            if cost := _COST.search(body):
                kind = cost.group(1).casefold()
                option.cost_currency = "HARD" if kind.startswith(("кристалл", "hard", "💎")) else "SOFT"
                option.cost_amount = int(cost.group(2))
                option.text = _COST.sub("", body).strip()
            if not option.text:
                result.issue("error", line_no, "У варианта выбора нет текста")
                continue
            if not option.target_label:
                result.issue(
                    "error", line_no, f"У варианта «{option.text}» не указано, куда он ведёт (-> метка)"
                )
            open_choice.options.append(option)
            continue

        if open_choice is not None and not open_choice.options:
            result.issue("error", open_choice.line, "После «?» должны идти варианты выбора (строки с «- »)")
        open_choice = None

        speech = _SPEECH.match(line)
        # "Глава 1: Встреча" style headings are not speech: a speaker name has no digits and
        # is short. Anything else before a colon is treated as part of a narration line.
        if speech and not any(ch.isdigit() for ch in speech.group(1)) and len(speech.group(1).split()) <= 3:
            name = speech.group(1).strip()
            node = add(
                DraftNode("DIALOGUE", line_no, {"text": {"ru": speech.group(4).strip()}}, speaker_name=name)
            )
            if speech.group(2):
                node.data["isThought"] = True
            result.speakers[name] = result.speakers.get(name, 0) + 1
        else:
            node = add(DraftNode("DIALOGUE", line_no, {"text": {"ru": line}}))
        apply_directions(node, line_no)
        dangling = [len(result.nodes) - 1]

    if open_choice is not None and not open_choice.options:
        result.issue("error", open_choice.line, "После «?» должны идти варианты выбора (строки с «- »)")
    if pending_label is not None:
        result.issue("error", 0, f"Метка «{pending_label}» стоит в самом конце - после неё ничего нет")
    if pending_directions:
        result.issue("warning", 0, "Ремарки (@...) в самом конце текста ни к чему не относятся")
    if dangling:
        last = result.nodes[dangling[0]]
        result.issue(
            "error",
            last.line,
            "Сценарий обрывается на этой реплике: добавьте «=== КОНЕЦ ===» или переход «-> метка»",
        )
    if not result.nodes:
        result.issue("error", 0, "В тексте не найдено ни одной реплики")

    for node in result.nodes:
        if node.goto_label and node.goto_label.casefold() not in result.labels:
            result.issue("error", node.line, f"Переход на метку «{node.goto_label}», которой нет в тексте")
        for option in node.options:
            if option.target_label and option.target_label.casefold() not in result.labels:
                result.issue(
                    "error",
                    option.line,
                    f"Вариант «{option.text}» ведёт на метку «{option.target_label}», которой нет",
                )
    referenced = {n.goto_label.casefold() for n in result.nodes if n.goto_label}
    referenced |= {o.target_label.casefold() for n in result.nodes for o in n.options if o.target_label}
    for label, index in result.labels.items():
        previous = result.nodes[index - 1] if index > 0 else None
        falls_through = previous is not None and previous.next_ref == index
        if label not in referenced and not falls_through and index != 0:
            result.issue(
                "warning",
                result.nodes[index].line,
                f"На метку «{result.nodes[index].label}» никто не переходит",
            )
    return result


def _read_direction(result: ParseResult, directions: dict, key: str, value: str, line_no: int) -> None:
    lowered = value.casefold()
    if key in ("фон", "background", "bg"):
        directions["backgroundImageUrl"] = value
    elif key in ("cg", "иллюстрация"):
        directions["cgImageUrl"] = "" if lowered in _STOP_WORDS | {"убрать", "скрыть"} else value
    elif key in ("музыка", "music"):
        directions["music"] = (
            {"action": "stop"} if lowered in _STOP_WORDS else {"action": "play", "url": value}
        )
    elif key in ("звук", "sfx", "sound"):
        directions["sfxUrl"] = value
    elif key in ("атмосфера", "погода"):
        if lowered in _ATMOSPHERES:
            directions["atmosphere"] = _ATMOSPHERES[lowered]
        else:
            result.issue(
                "warning", line_no, f"Неизвестная атмосфера «{value}». Доступны: {', '.join(_ATMOSPHERES)}"
            )
    elif key in ("эффект", "effect"):
        if lowered in _EFFECTS:
            directions["screenEffect"] = _EFFECTS[lowered]
        else:
            result.issue("warning", line_no, f"Неизвестный эффект «{value}». Доступны: {', '.join(_EFFECTS)}")
    elif key in ("переход", "transition"):
        if lowered in _TRANSITIONS:
            directions["transition"] = _TRANSITIONS[lowered]
        else:
            result.issue(
                "warning", line_no, f"Неизвестный переход «{value}». Доступны: {', '.join(_TRANSITIONS)}"
            )
    else:
        result.issue("warning", line_no, f"Неизвестная ремарка «@{key}» пропущена")
