"""Narrative QA: static and dynamic analysis of one chapter's scene graph, run before
publication. Pure - it works on the same `StoryGraph` the runtime interprets, so what it
checks is exactly what players would hit.

Two passes:

* structural - every reference, dead end, cycle and variable/character/sprite mention is
  checked without running the story;
* exploration - the runtime actually plays every reachable branch from the chapter entry
  (breadth-first over (node, variables) states, bounded), which finds problems that only
  exist for particular combinations of choices: a choice where every option is hidden,
  endings nobody can reach, scenes no combination of choices leads to.

Severity: `error` blocks publication, `warning` is shown but allowed, `info` is advisory.
"""

from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass, field

from app.engine import runtime
from app.engine.condition_engine import variable_lookup_key
from app.engine.runtime import EngineError, EngineState, NodeSpec, StoryGraph

MAX_EXPLORED_STATES = 4000
_NUMERIC_OPERATORS = {"GT", "GTE", "LT", "LTE"}
_AUTO_TYPES = {"CONDITION", "EFFECT"}


@dataclass
class Issue:
    severity: str
    code: str
    message: str
    node_id: str | None = None
    option_id: str | None = None

    def to_json(self) -> dict:
        data = asdict(self)
        return {
            "severity": data["severity"],
            "code": data["code"],
            "message": data["message"],
            "nodeId": data["node_id"],
            "optionId": data["option_id"],
        }


@dataclass
class Report:
    issues: list[Issue] = field(default_factory=list)
    stats: dict = field(default_factory=dict)
    # Distinct variable states players can finish this chapter with - the starting points
    # for analysing the next chapter.
    end_states: list[EngineState] = field(default_factory=list)

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def publishable(self) -> bool:
        return not self.errors

    def add(self, severity: str, code: str, message: str, node_id=None, option_id=None) -> None:
        self.issues.append(Issue(severity, code, message, node_id, option_id))

    def to_json(self) -> dict:
        order = {"error": 0, "warning": 1, "info": 2}
        issues = sorted(self.issues, key=lambda i: order[i.severity])
        return {
            "publishable": self.publishable,
            "errorCount": sum(i.severity == "error" for i in issues),
            "warningCount": sum(i.severity == "warning" for i in issues),
            "issues": [i.to_json() for i in issues],
            "stats": self.stats,
        }


def analyze_chapter(
    graph: StoryGraph,
    chapter_id: str,
    entry_node_id: str | None,
    characters: dict[str, dict],
    *,
    external_node_ids: set[str] | None = None,
    max_states: int = MAX_EXPLORED_STATES,
    initial_states: list[EngineState] | None = None,
) -> Report:
    """`graph` must contain this chapter's nodes; `external_node_ids` are ids that exist in
    other chapters (legal jump targets). `initial_states` are the variable states players
    can arrive with from earlier chapters; without them the chapter is explored from
    default values only."""
    report = Report()
    external = external_node_ids or set()
    nodes = {nid: n for nid, n in graph.nodes.items() if n.chapter_id == str(chapter_id)}

    for node_id, reason in graph.broken.items():
        report.add("error", "BROKEN_NODE", f"Данные сцены повреждены: {reason[:200]}", node_id)

    if not nodes and not graph.broken:
        report.add("error", "EMPTY_CHAPTER", "В главе нет ни одной сцены")
        return report

    if not entry_node_id:
        report.add("error", "NO_ENTRY", "У главы не выбрана начальная сцена")
    elif str(entry_node_id) not in nodes:
        report.add(
            "error", "NO_ENTRY", "Начальная сцена не найдена среди сцен этой главы", str(entry_node_id)
        )

    edges = {nid: _edges(node) for nid, node in nodes.items()}

    for node in nodes.values():
        _check_targets(report, node, nodes, external, graph)
        _check_variables(report, node, graph)
        _check_cast(report, node, characters)
        _check_choice(report, node)

    reachable = (
        _reachable(str(entry_node_id), edges) if entry_node_id and str(entry_node_id) in nodes else set()
    )
    if reachable:
        for node_id in nodes:
            if node_id not in reachable:
                report.add(
                    "warning", "UNREACHABLE", "В эту сцену не ведёт ни один переход от начала главы", node_id
                )
        _check_endings(report, nodes, edges, reachable, external)
        _check_auto_cycles(report, nodes, edges, reachable)

    exploration = (
        _explore(graph, nodes, entry_node_id, report, max_states, initial_states) if reachable else {}
    )
    report.stats = {
        "nodes": len(nodes),
        "reachableNodes": len(reachable),
        "choices": sum(n.type == "CHOICE" for n in nodes.values()),
        "endings": sum(n.type == "END" for n in nodes.values()),
        **exploration,
    }
    return report


# ---------------------------------------------------------------------------------------
# Structural pass
# ---------------------------------------------------------------------------------------


def _edges(node: NodeSpec) -> list[str]:
    data = node.data
    if node.type == "DIALOGUE":
        targets = [data.next_node_id]
    elif node.type == "EFFECT":
        targets = [data.next_node_id]
    elif node.type == "CONDITION":
        targets = [data.then_node_id, data.else_node_id]
    elif node.type == "CHOICE":
        targets = [o.next_node_id for o in node.options]
    else:
        targets = []
    return [str(t) for t in targets if t]


def _reachable(start: str, edges: dict[str, list[str]]) -> set[str]:
    seen = {start}
    queue = deque([start])
    while queue:
        for target in edges.get(queue.popleft(), []):
            if target in edges and target not in seen:
                seen.add(target)
                queue.append(target)
    return seen


def _check_targets(
    report: Report, node: NodeSpec, nodes: dict, external: set[str], graph: StoryGraph
) -> None:
    def check(target: str | None, what: str, option_id: str | None = None) -> None:
        if not target:
            report.add(
                "error", "DEAD_END", f"{what} никуда не ведёт - сюжет здесь оборвётся", node.id, option_id
            )
        elif str(target) in graph.broken:
            report.add("error", "MISSING_TARGET", f"{what} ведёт в повреждённую сцену", node.id, option_id)
        elif str(target) not in nodes and str(target) not in external:
            report.add("error", "MISSING_TARGET", f"{what} ведёт в несуществующую сцену", node.id, option_id)

    data = node.data
    if node.type == "DIALOGUE":
        check(data.next_node_id, "Реплика")
    elif node.type == "EFFECT":
        check(data.next_node_id, "Узел эффекта")
    elif node.type == "CONDITION":
        check(data.then_node_id, "Ветка «условие выполнено»")
        check(data.else_node_id, "Ветка «условие не выполнено»")
        if not data.when:
            report.add(
                "warning", "EMPTY_CONDITION", "Условие пустое - ветка «иначе» никогда не сработает", node.id
            )
    elif node.type == "CHOICE":
        if not node.options:
            report.add("error", "NO_OPTIONS", "У выбора нет ни одного варианта", node.id)
        for option in node.options:
            check(option.next_node_id, "Вариант выбора", option.id)


def _check_variables(report: Report, node: NodeSpec, graph: StoryGraph) -> None:
    def conditions(group, option_id=None):
        for condition in group:
            key = variable_lookup_key(condition.variable_key, condition.character_id)
            spec = graph.variables.get(key)
            if spec is None:
                report.add(
                    "error",
                    "UNDEFINED_VARIABLE",
                    f"Условие проверяет переменную «{condition.variable_key}», которой нет в истории",
                    node.id,
                    option_id,
                )
            elif condition.operator in _NUMERIC_OPERATORS and spec.type != "NUMBER":
                report.add(
                    "error",
                    "TYPE_MISMATCH",
                    f"Сравнение «больше/меньше» с нечисловой переменной «{condition.variable_key}» всегда ложно",
                    node.id,
                    option_id,
                )
        if _is_contradictory(group):
            report.add(
                "warning",
                "IMPOSSIBLE_CONDITION",
                "Условия противоречат друг другу и не выполнятся никогда",
                node.id,
                option_id,
            )

    def effects(effect_list, option_id=None):
        for effect in effect_list:
            key = variable_lookup_key(effect.variable_key, effect.character_id)
            spec = graph.variables.get(key)
            if spec is None:
                report.add(
                    "error",
                    "UNDEFINED_VARIABLE",
                    f"Эффект меняет переменную «{effect.variable_key}», которой нет в истории - он не сработает",
                    node.id,
                    option_id,
                )
            elif effect.op != "SET" and spec.type != "NUMBER":
                report.add(
                    "error",
                    "TYPE_MISMATCH",
                    f"Прибавлять/вычитать можно только у числовых переменных («{effect.variable_key}»)",
                    node.id,
                    option_id,
                )

    if node.type == "CONDITION":
        conditions(node.data.when)
    elif node.type == "EFFECT":
        effects(node.data.effects)
        if not node.data.effects:
            report.add("info", "EMPTY_EFFECT", "Узел эффекта ничего не меняет", node.id)
    elif node.type == "CHOICE":
        for option in node.options:
            conditions(option.visible_when, option.id)
            effects(option.effects, option.id)


def _is_contradictory(group) -> bool:
    """Catches the common impossible combinations on a single variable: two different EQ
    values, EQ with a NEQ of the same value, and an empty numeric interval."""
    by_key: dict[str, list] = {}
    for condition in group:
        by_key.setdefault(variable_lookup_key(condition.variable_key, condition.character_id), []).append(
            condition
        )
    for conditions in by_key.values():
        equals = [c.value for c in conditions if c.operator == "EQ"]
        if len({repr(v) for v in equals}) > 1:
            return True
        if any(c.operator == "NEQ" and c.value in equals for c in conditions):
            return True
        low, low_strict, high, high_strict = float("-inf"), False, float("inf"), False
        for c in conditions:
            if isinstance(c.value, bool) or not isinstance(c.value, int | float):
                continue
            if c.operator in ("GT", "GTE") and (c.value > low or (c.value == low and c.operator == "GT")):
                low, low_strict = c.value, c.operator == "GT"
            if c.operator in ("LT", "LTE") and (c.value < high or (c.value == high and c.operator == "LT")):
                high, high_strict = c.value, c.operator == "LT"
            if c.operator == "EQ":
                if c.value > low:
                    low, low_strict = c.value, False
                if c.value < high:
                    high, high_strict = c.value, False
        if low > high or (low == high and (low_strict or high_strict)):
            return True
    return False


def _check_cast(report: Report, node: NodeSpec, characters: dict[str, dict]) -> None:
    if node.type != "DIALOGUE":
        return
    data = node.data
    if data.speaker_character_id and data.speaker_character_id not in characters:
        report.add("error", "UNKNOWN_CHARACTER", "Говорящий персонаж не найден в этой истории", node.id)
    seen_positions: dict[str, int] = {}
    for staged in data.staged:
        character = characters.get(staged.character_id)
        if character is None:
            report.add(
                "error", "UNKNOWN_CHARACTER", "На сцене стоит персонаж, которого нет в этой истории", node.id
            )
            continue
        seen_positions[staged.position] = seen_positions.get(staged.position, 0) + 1
        sprites = character.get("sprites") or {}
        if staged.sprite not in sprites and not any(key.endswith(f"_{staged.sprite}") for key in sprites):
            name = (character.get("name") or {}).get("ru", "?")
            report.add(
                "warning",
                "MISSING_SPRITE",
                f"У персонажа «{name}» нет спрайта «{staged.sprite}» - он не будет виден",
                node.id,
            )
    if any(count > 1 for count in seen_positions.values()):
        report.add(
            "warning", "STAGE_OVERLAP", "Два персонажа стоят в одной позиции и перекроют друг друга", node.id
        )


def _check_choice(report: Report, node: NodeSpec) -> None:
    if node.type != "CHOICE" or not node.options:
        return
    if all(o.is_paid for o in node.options):
        report.add(
            "warning", "PAYWALL", "Все варианты платные - у игрока без валюты нет пути дальше", node.id
        )
    data = node.data
    if data.timer_seconds and not data.timeout_option_id:
        report.add(
            "error",
            "TIMER_WITHOUT_DEFAULT",
            "У выбора с таймером не задан вариант по истечении времени",
            node.id,
        )
    if data.timeout_option_id:
        option = next((o for o in node.options if o.id == str(data.timeout_option_id)), None)
        if option is None:
            report.add(
                "error", "BAD_TIMEOUT_OPTION", "Вариант по таймеру не принадлежит этому выбору", node.id
            )
        elif option.is_paid or option.visible_when:
            report.add(
                "error",
                "BAD_TIMEOUT_OPTION",
                "Вариант по таймеру должен быть бесплатным и доступным всегда",
                node.id,
                option.id,
            )


def _check_endings(report: Report, nodes: dict, edges: dict, reachable: set[str], external: set[str]) -> None:
    """A chapter must be finishable, and no reachable scene may be a trap with no way out."""
    exits = {nid for nid in reachable if nodes[nid].type == "END"}
    exits |= {nid for nid in reachable if any(t in external for t in edges[nid])}
    if not exits:
        report.add("error", "NO_ENDING", "От начала главы нельзя дойти ни до одного финала (узла END)")
        return
    reverse: dict[str, list[str]] = {}
    for source, targets in edges.items():
        for target in targets:
            reverse.setdefault(target, []).append(source)
    can_finish = set(exits)
    queue = deque(exits)
    while queue:
        for source in reverse.get(queue.popleft(), []):
            if source not in can_finish:
                can_finish.add(source)
                queue.append(source)
    for node_id in reachable - can_finish:
        # Nodes that already report DEAD_END/MISSING_TARGET are covered by those messages.
        if edges[node_id] and all(t in nodes for t in edges[node_id]):
            report.add(
                "error", "TRAP", "Из этой сцены невозможно дойти до финала главы (замкнутый круг)", node_id
            )


def _check_auto_cycles(report: Report, nodes: dict, edges: dict, reachable: set[str]) -> None:
    """A cycle made only of CONDITION/EFFECT nodes never stops to show the player anything."""
    auto = {nid for nid in reachable if nodes[nid].type in _AUTO_TYPES}
    state: dict[str, int] = {}
    reported: set[str] = set()

    for start in auto:
        if state.get(start):
            continue
        stack = [(start, iter(edges[start]))]
        state[start] = 1
        while stack:
            node_id, iterator = stack[-1]
            advanced = False
            for target in iterator:
                if target not in auto:
                    continue
                if state.get(target) == 1 and target not in reported:
                    reported.add(target)
                    report.add(
                        "error",
                        "AUTO_LOOP",
                        "Бесконечный цикл из условий/эффектов без единой реплики",
                        target,
                    )
                elif not state.get(target):
                    state[target] = 1
                    stack.append((target, iter(edges[target])))
                    advanced = True
                    break
            if not advanced:
                state[node_id] = 2
                stack.pop()


# ---------------------------------------------------------------------------------------
# Exploration pass
# ---------------------------------------------------------------------------------------


def _freeze(node_id: str, state: EngineState) -> tuple:
    return (node_id, tuple(sorted((k, repr(v)) for k, v in state.values.items())))


MAX_CARRIED_STATES = 200


def _explore(
    graph: StoryGraph, nodes: dict, entry_node_id, report: Report, max_states: int, initial_states=None
) -> dict:
    """Plays every branch reachable from the entry, from each possible starting state."""
    end_states: dict[tuple, EngineState] = {}
    visited_nodes: set[str] = set()
    taken_options: set[str] = set()
    endings: set[str] = set()
    soft_locks: set[str] = set()
    seen: set[tuple] = set()
    queue: deque[tuple[str, EngineState]] = deque()
    truncated = False

    def step(node_id: str | None, state: EngineState) -> None:
        try:
            rest = runtime.run_until_rest(graph, state, node_id)
        except EngineError:
            return  # the structural pass already reports these with precise wording
        visited_nodes.update(n for n in rest.trail if n in nodes)
        if rest.node.id not in nodes:
            return  # jumped into another chapter - that chapter's own report covers it
        key = _freeze(rest.node.id, rest.state)
        if key not in seen:
            seen.add(key)
            queue.append((rest.node.id, rest.state))

    for initial in initial_states or [EngineState()]:
        step(str(entry_node_id), EngineState(values=dict(initial.values)))

    while queue:
        if len(seen) > max_states:
            truncated = True
            break
        node_id, state = queue.popleft()
        node = nodes[node_id]
        if node.type == "END":
            endings.add(node_id)
            if len(end_states) < MAX_CARRIED_STATES:
                end_states.setdefault(_freeze("", state), EngineState(values=dict(state.values)))
        elif node.type == "DIALOGUE":
            if node.data.next_node_id:
                step(node.data.next_node_id, state)
        elif node.type == "CHOICE":
            options = runtime.visible_options(graph, state, node)
            if not options and node.options:
                soft_locks.add(node_id)
            for option in options:
                taken_options.add(option.id)
                if option.next_node_id:
                    step(option.next_node_id, runtime.apply_effects(graph, state, option.effects))

    for node_id in soft_locks:
        report.add(
            "error",
            "SOFT_LOCK",
            "Существует прохождение, при котором все варианты этого выбора скрыты условиями - игрок застрянет",
            node_id,
        )

    if not truncated:
        for node_id, node in nodes.items():
            if node.type == "END" and node_id not in endings:
                report.add(
                    "warning",
                    "UNREACHABLE_ENDING",
                    "Ни одна комбинация выборов не приводит к этому финалу",
                    node_id,
                )
            elif node_id not in visited_nodes and not any(
                i.node_id == node_id and i.code == "UNREACHABLE" for i in report.issues
            ):
                report.add(
                    "info",
                    "NEVER_VISITED",
                    "При стартовых значениях переменных в эту сцену не попасть (возможно, нужны значения из прошлых глав)",
                    node_id,
                )
            if node.type == "CHOICE":
                for option in node.options:
                    if option.id not in taken_options and node_id in visited_nodes:
                        report.add(
                            "info",
                            "OPTION_NEVER_VISIBLE",
                            "Этот вариант не появляется ни в одном прохождении со стартовыми значениями",
                            node_id,
                            option.id,
                        )
    else:
        report.add(
            "info",
            "EXPLORATION_TRUNCATED",
            f"Вариантов прохождения слишком много - проверено {max_states} состояний, покрытие неполное",
        )

    report.end_states = list(end_states.values())
    total = len(nodes)
    return {
        "exploredStates": len(seen),
        "explorationComplete": not truncated,
        "visitedNodes": len(visited_nodes),
        "coveragePercent": round(100 * len(visited_nodes) / total) if total else 0,
        "reachableEndings": len(endings),
    }
