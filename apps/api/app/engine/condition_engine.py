from app.schemas.common import (
    Condition,
    ConditionGroup,
    Effect,
    EffectList,
    VariableScalar,
)


def variable_lookup_key(variable_key: str, character_id: str | None = None) -> str:
    """Composite key used to look up a variable value: the definition key plus an optional
    character id."""
    return f"{variable_key}::{character_id or ''}"


def evaluate_condition_group(
    conditions: ConditionGroup, values: dict[str, VariableScalar]
) -> bool:
    """Evaluates a group of conditions with AND semantics (every condition must pass).
    An empty group always passes - most dialogue/effect nodes have no gating."""
    return all(_evaluate_condition(c, values) for c in conditions)


def _evaluate_condition(
    condition: Condition, values: dict[str, VariableScalar]
) -> bool:
    key = variable_lookup_key(condition.variable_key, condition.character_id)
    current = values.get(key)
    target = condition.value

    op = condition.operator
    if op == "EQ":
        return current == target
    if op == "NEQ":
        return current != target
    if op in ("GT", "GTE", "LT", "LTE"):
        if not isinstance(current, int | float) or isinstance(current, bool):
            return False
        if not isinstance(target, int | float) or isinstance(target, bool):
            return False
        if op == "GT":
            return current > target
        if op == "GTE":
            return current >= target
        if op == "LT":
            return current < target
        return current <= target
    return False


class VariableBounds:
    def __init__(self, min_value: float | None, max_value: float | None):
        self.min_value = min_value
        self.max_value = max_value


def apply_effect(
    effect: Effect, current: VariableScalar | None, bounds: VariableBounds | None
) -> VariableScalar:
    """Applies a single effect to a current value and returns the new value, clamped to the
    variable's configured min/max (numeric variables only)."""
    if effect.op == "SET":
        next_value: VariableScalar = effect.value
    else:
        current_number = (
            current
            if isinstance(current, int | float) and not isinstance(current, bool)
            else 0
        )
        delta_number = (
            effect.value
            if isinstance(effect.value, int | float)
            and not isinstance(effect.value, bool)
            else 0
        )
        next_value = (
            current_number + delta_number
            if effect.op == "INCREMENT"
            else current_number - delta_number
        )

    if (
        isinstance(next_value, int | float)
        and not isinstance(next_value, bool)
        and bounds
    ):
        if bounds.min_value is not None:
            next_value = max(bounds.min_value, next_value)
        if bounds.max_value is not None:
            next_value = min(bounds.max_value, next_value)

    return next_value


def effect_list_keys(effects: EffectList) -> list[str]:
    return [variable_lookup_key(e.variable_key, e.character_id) for e in effects]
