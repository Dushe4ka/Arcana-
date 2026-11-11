"""Turns a plain-text screenplay into scene nodes.

Writers keep stories in documents, not in a graph editor. This parser reads one small,
forgiving plain-text convention (TXT, Markdown or the text of a DOCX) and produces draft
nodes plus everything a human has to decide before it is saved: unknown speakers, new
variables, labels nobody defined, lines it could not classify. Nothing here guesses
silently, and nothing is ever published by an import. The full description for writers is
docs/story-format.md; in short, one construct per line:

    # Сезон 1                                  a whole story in one document:
    ## Глава 1: Бал                            season and chapter headings split it up
    Вечер. Зал наполнялся гостями.            narration
    Адриан: Добрый вечер.                     speech   (name before the first colon)
    Лия (мысли): Он смотрит на меня.          thought
    @фон: https://.../hall.jpg                direction for the NEXT line: фон, музыка,
    @музыка: стоп                             звук, атмосфера, эффект, переход, cg
    ? Как ответить?                           starts a choice (the text is the prompt)
    - Улыбнуться {доверие(Адриан) +2} -> тепло          option with an effect
    - Взять за руку [если смелость >= 1] -> рука        option shown only on a condition
    - Пригласить на танец [кристаллы 5] -> танец        paid option (кристаллы / монеты)
    {ключ = да; смелость +1}                  changes characteristics / flags right here
    [если доверие(Адриан) >= 2] -> признание | иначе -> холод     branch on a condition
    == тепло ==                               label: the next line can be jumped to
    -> финал                                  jump from the previous line
    === КОНЕЦ ===  or  === КОНЕЦ: Название === end of the chapter (optionally a named ending)
    // anything                               comment, ignored
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
_SEASON = re.compile(r"^#{1,3}\s*сезон\s+(\d+)\s*(?:[:.—–-]\s*(.*))?$", re.IGNORECASE)
_CHAPTER = re.compile(r"^#{1,4}\s*(?:глава|серия)\s+(\d+)\s*(?:[:.—–-]\s*(.*))?$", re.IGNORECASE)
_EFFECT_BLOCK = re.compile(r"\{([^{}]*)\}")
_IF_BLOCK = re.compile(r"\[\s*если\s+([^\[\]]+)\]", re.IGNORECASE)
_BRANCH = re.compile(
    r"^\[\s*если\s+([^\[\]]+)\]\s*->\s*([^|]+?)\s*(?:\|\s*иначе\s*->\s*(.+))?$", re.IGNORECASE
)
_VARIABLE = r"([^()=<>!≥≤≠+\-−;]+?)\s*(?:\(\s*([^()]+?)\s*\))?"
_EFFECT_EXPR = re.compile(rf"^{_VARIABLE}\s*(\+|-|−|=)\s*(.+)$")
_CONDITION_EXPR = re.compile(rf"^{_VARIABLE}\s*(>=|<=|!=|≥|≤|≠|>|<|=)\s*(.+)$")
_CONDITION_OPS = {
    ">=": "GTE",
    "≥": "GTE",
    "<=": "LTE",
    "≤": "LTE",
    "!=": "NEQ",
    "≠": "NEQ",
    ">": "GT",
    "<": "LT",
    "=": "EQ",
}
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
class VarRef:
    """A characteristic / relationship / flag as the writer named it. Resolved to a real
    variable definition (or a new one) when the import is applied."""

    name: str
    character: str | None
    value: float | bool | str

    @property
    def key(self) -> tuple[str, str]:
        return (self.name.casefold(), (self.character or "").casefold())


@dataclass
class DraftEffect:
    ref: VarRef
    op: str  # SET | INCREMENT | DECREMENT


@dataclass
class DraftCondition:
    ref: VarRef
    operator: str


@dataclass
class DraftOption:
    text: str
    target_label: str | None
    cost_currency: str | None = None
    cost_amount: int = 0
    line: int = 0
    effects: list[DraftEffect] = field(default_factory=list)
    conditions: list[DraftCondition] = field(default_factory=list)


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
    # EFFECT nodes
    effects: list[DraftEffect] = field(default_factory=list)
    # CONDITION nodes: "then" always jumps to a label; "else" jumps to a label or, when the
    # writer left it out, simply continues with the next line.
    conditions: list[DraftCondition] = field(default_factory=list)
    then_label: str | None = None
    else_label: str | None = None
    else_ref: int | None = None


@dataclass
class ParseResult:
    nodes: list[DraftNode] = field(default_factory=list)
    issues: list[dict] = field(default_factory=list)
    speakers: dict[str, int] = field(default_factory=dict)
    labels: dict[str, int] = field(default_factory=dict)
    # Every variable mentioned, by (name, character) -> the first reference seen.
    variables: dict[tuple[str, str], VarRef] = field(default_factory=dict)

    def issue(self, severity: str, line: int, message: str) -> None:
        self.issues.append({"severity": severity, "line": line, "message": message})

    @property
    def has_errors(self) -> bool:
        return any(i["severity"] == "error" for i in self.issues)


def docx_to_text(content: bytes) -> str:
    """Extracts paragraph text from a .docx with the standard library only. Paragraphs set
    in Word's heading styles come out as Markdown headings, so "Заголовок 1 / Заголовок 2"
    work as season and chapter headings without typing any # signs."""
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
        text = "".join(parts)
        style = paragraph.find(f"{namespace}pPr/{namespace}pStyle")
        level = re.search(
            r"(?:heading|заголовок)\s*([1-4])$|^([1-4])$",
            (style.get(f"{namespace}val") or "") if style is not None else "",
            re.IGNORECASE,
        )
        if level and text.strip() and not text.lstrip().startswith("#"):
            text = "#" * int(level.group(1) or level.group(2)) + " " + text.strip()
        lines.append(text)
    return "\n".join(lines)


def _clean(line: str) -> str:
    # Markdown emphasis marks around a line carry no meaning for the story.
    stripped = line.strip().replace("\u00a0", " ")
    if stripped.startswith(("**", "__")) and stripped.endswith(("**", "__")) and len(stripped) > 4:
        stripped = stripped[2:-2].strip()
    return stripped


def _scalar(raw: str) -> float | bool | str:
    text = raw.strip().strip("«»\"'")
    lowered = text.casefold()
    if lowered in ("да", "true", "истина", "есть"):
        return True
    if lowered in ("нет", "false", "ложь"):
        return False
    try:
        return float(text.replace(",", "."))
    except ValueError:
        return text


def _effects(result: ParseResult, body: str, line_no: int) -> list[DraftEffect]:
    effects = []
    for part in filter(None, (p.strip() for p in body.split(";"))):
        match = _EFFECT_EXPR.match(part)
        if not match:
            result.issue(
                "error",
                line_no,
                f"Не удалось разобрать изменение «{part}». Пример: доверие(Адриан) +2 или ключ = да",
            )
            continue
        name, character, sign, raw = match.groups()
        value = _scalar(raw)
        if sign != "=" and (isinstance(value, bool) or not isinstance(value, float)):
            result.issue("error", line_no, f"Прибавлять и вычитать можно только числа: «{part}»")
            continue
        ref = VarRef(name.strip(), character, value)
        result.variables.setdefault(ref.key, ref)
        effects.append(
            DraftEffect(ref, "SET" if sign == "=" else "INCREMENT" if sign == "+" else "DECREMENT")
        )
    return effects


def _conditions(result: ParseResult, body: str, line_no: int) -> list[DraftCondition]:
    conditions = []
    for part in filter(None, (p.strip() for p in re.split(r";|\sи\s", body))):
        match = _CONDITION_EXPR.match(part)
        if not match:
            result.issue(
                "error",
                line_no,
                f"Не удалось разобрать условие «{part}». Пример: доверие(Адриан) >= 2 или ключ = да",
            )
            continue
        name, character, operator, raw = match.groups()
        ref = VarRef(name.strip(), character, _scalar(raw))
        result.variables.setdefault(ref.key, ref)
        conditions.append(DraftCondition(ref, _CONDITION_OPS[operator]))
    return conditions


@dataclass
class ChapterDraft:
    season: int
    index: int
    title: str | None
    line: int
    result: ParseResult


def parse_document(text: str) -> tuple[list[ChapterDraft], list[dict]]:
    """Splits a whole-story document on its season / chapter headings and parses each
    chapter. Returns the chapters and the problems of the document's own structure."""
    issues: list[dict] = []
    if len(text) > MAX_SCRIPT_CHARS * 6:
        return [], [
            {"severity": "error", "line": 0, "message": "Документ слишком большой - разбейте его по сезонам"}
        ]
    chapters: list[ChapterDraft] = []
    season = 1
    current: tuple[int, int, str | None, int] | None = None
    buffer: list[tuple[int, str]] = []
    stray = 0

    def flush() -> None:
        nonlocal buffer
        if current is not None:
            s, i, title, line = current
            chapters.append(ChapterDraft(s, i, title, line, _parse_lines(buffer)))
        buffer = []

    for line_no, raw in enumerate(text.splitlines(), start=1):
        line = _clean(raw)
        if match := _SEASON.match(line):
            flush()
            current = None
            season = int(match.group(1))
            continue
        if match := _CHAPTER.match(line):
            flush()
            current = (season, int(match.group(1)), (match.group(2) or "").strip() or None, line_no)
            continue
        if current is None:
            if line and not line.startswith(("//", "#")):
                stray += 1
            continue
        buffer.append((line_no, raw))
    flush()

    if not chapters:
        issues.append(
            {
                "severity": "error",
                "line": 0,
                "message": "В документе нет заголовков глав. Начните каждую главу строкой «## Глава 1: Название»",
            }
        )
    if stray:
        issues.append(
            {
                "severity": "warning",
                "line": 0,
                "message": f"Строк до первого заголовка главы: {stray}. Они не будут импортированы",
            }
        )
    seen: set[tuple[int, int]] = set()
    for chapter in chapters:
        if (chapter.season, chapter.index) in seen:
            issues.append(
                {
                    "severity": "error",
                    "line": chapter.line,
                    "message": f"Сезон {chapter.season}, глава {chapter.index} встречается в документе дважды",
                }
            )
        seen.add((chapter.season, chapter.index))
    return chapters, issues


def parse_script(text: str) -> ParseResult:
    """Parses the text of ONE chapter."""
    if len(text) > MAX_SCRIPT_CHARS:
        result = ParseResult()
        result.issue("error", 0, "Текст слишком длинный для одной главы - разбейте его по главам")
        return result
    return _parse_lines(list(enumerate(text.splitlines(), start=1)))


def _parse_lines(lines: list[tuple[int, str]]) -> ParseResult:
    result = ParseResult()
    pending_directions: dict = {}
    pending_label: str | None = None
    open_choice: DraftNode | None = None
    # (node index, field) pairs waiting to be linked to whatever comes next.
    dangling: list[tuple[int, str]] = []

    def add(node: DraftNode) -> DraftNode:
        nonlocal pending_label, dangling
        index = len(result.nodes)
        if pending_label is not None:
            node.label = pending_label
            result.labels[pending_label.casefold()] = index
            pending_label = None
        for source, attribute in dangling:
            setattr(result.nodes[source], attribute, index)
        dangling = []
        result.nodes.append(node)
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

    def close_choice() -> None:
        nonlocal open_choice
        if open_choice is not None and not open_choice.options:
            result.issue("error", open_choice.line, "После «?» должны идти варианты выбора (строки с «- »)")
        open_choice = None

    for line_no, raw in lines:
        line = _clean(raw)
        # Markdown headings that are not season/chapter headings are notes to self.
        if not line or line.startswith(("//", "#")):
            continue

        if match := _END.match(line):
            close_choice()
            node = add(DraftNode("END", line_no))
            if match.group(2):
                node.data["endingTitle"] = {"ru": match.group(2).strip()}
            apply_directions(node, line_no)
            continue

        if match := _LABEL.match(line):
            close_choice()
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
            close_choice()
            links = [(source, attribute) for source, attribute in dangling]
            if not links:
                result.issue("error", line_no, "Переход «->» стоит не после реплики - не от чего переходить")
                continue
            for source, attribute in links:
                node = result.nodes[source]
                if attribute == "else_ref":
                    node.else_label = match.group(1).strip()
                else:
                    node.goto_label = match.group(1).strip()
            dangling = []
            continue

        if match := _BRANCH.match(line):
            close_choice()
            node = add(DraftNode("CONDITION", line_no))
            node.conditions = _conditions(result, match.group(1), line_no)
            node.then_label = match.group(2).strip()
            if match.group(3):
                node.else_label = match.group(3).strip()
            else:
                dangling = [(len(result.nodes) - 1, "else_ref")]
            apply_directions(node, line_no)
            continue

        if line.startswith("{") and line.endswith("}") and line.count("{") == 1:
            close_choice()
            node = add(DraftNode("EFFECT", line_no))
            node.effects = _effects(result, line[1:-1], line_no)
            apply_directions(node, line_no)
            dangling = [(len(result.nodes) - 1, "next_ref")]
            continue

        if line.startswith("?"):
            close_choice()
            open_choice = add(DraftNode("CHOICE", line_no))
            prompt = line[1:].strip()
            if prompt:
                open_choice.data["prompt"] = {"ru": prompt}
            apply_directions(open_choice, line_no)
            continue

        if open_choice is not None and (match := _OPTION.match(line)):
            body, target = match.group(1), match.group(2)
            option = DraftOption(text=body, target_label=target.strip() if target else None, line=line_no)
            for block in _EFFECT_BLOCK.findall(body):
                option.effects.extend(_effects(result, block, line_no))
            for block in _IF_BLOCK.findall(body):
                option.conditions.extend(_conditions(result, block, line_no))
            if cost := _COST.search(body):
                kind = cost.group(1).casefold()
                option.cost_currency = (
                    "HARD" if kind.startswith(("кристалл", "карт", "hard", "💎")) else "SOFT"
                )
                option.cost_amount = int(cost.group(2))
            option.text = _COST.sub("", _IF_BLOCK.sub("", _EFFECT_BLOCK.sub("", body))).strip()
            if not option.text:
                result.issue("error", line_no, "У варианта выбора нет текста")
                continue
            if not option.target_label:
                result.issue(
                    "error", line_no, f"У варианта «{option.text}» не указано, куда он ведёт (-> метка)"
                )
            open_choice.options.append(option)
            continue

        close_choice()
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
        dangling = [(len(result.nodes) - 1, "next_ref")]

    close_choice()
    if pending_label is not None:
        result.issue("error", 0, f"Метка «{pending_label}» стоит в самом конце - после неё ничего нет")
    if pending_directions:
        result.issue("warning", 0, "Ремарки (@...) в самом конце текста ни к чему не относятся")
    if dangling:
        last = result.nodes[dangling[0][0]]
        result.issue(
            "error", last.line, "Сценарий обрывается здесь: добавьте «=== КОНЕЦ ===» или переход «-> метка»"
        )
    if not result.nodes:
        result.issue("error", 0, "В тексте не найдено ни одной реплики")

    def check(label: str | None, line: int, what: str) -> None:
        if label and label.casefold() not in result.labels:
            result.issue("error", line, f"{what} на метку «{label}», которой нет в этой главе")

    referenced: set[str] = set()
    for node in result.nodes:
        for label, what in (
            (node.goto_label, "Переход"),
            (node.then_label, "Ветка «если»"),
            (node.else_label, "Ветка «иначе»"),
        ):
            check(label, node.line, what)
            if label:
                referenced.add(label.casefold())
        for option in node.options:
            check(option.target_label, option.line, f"Вариант «{option.text}» ведёт")
            if option.target_label:
                referenced.add(option.target_label.casefold())
    for label, index in result.labels.items():
        previous = result.nodes[index - 1] if index > 0 else None
        falls_through = previous is not None and index in (previous.next_ref, previous.else_ref)
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
