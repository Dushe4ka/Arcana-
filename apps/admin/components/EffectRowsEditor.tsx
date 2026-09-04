"use client";

type Row = { variableKey: string; characterId: string | null; op: string; value: string };

const EFFECT_OPS = ["SET", "INCREMENT", "DECREMENT"];
const CONDITION_OPS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE"];

/** Parses a free-text value input into the number/boolean/string the backend's
 * `VariableScalar` union expects - "true"/"false" become booleans, anything that parses as
 * a finite number becomes a number, everything else stays a string. This is a deliberate v1
 * simplification (no per-variable type lookup) - see the plan's Task 3 note. */
function parseValue(raw: string): number | boolean | string {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const asNumber = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(asNumber)) return asNumber;
  return raw;
}

export function EffectRowsEditor({
  rows,
  onChange,
  mode = "effect",
}: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  mode?: "effect" | "condition";
}) {
  const ops = mode === "condition" ? CONDITION_OPS : EFFECT_OPS;
  const update = (index: number, patch: Partial<Row>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 p-2 text-sm">
          <input
            value={row.variableKey}
            onChange={(e) => update(i, { variableKey: e.target.value })}
            placeholder="ключ переменной"
            className="w-32 rounded border border-neutral-300 px-2 py-1"
          />
          <select
            value={row.op}
            onChange={(e) => update(i, { op: e.target.value })}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            {ops.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="значение"
            className="w-24 rounded border border-neutral-300 px-2 py-1"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="text-red-600 underline"
          >
            Удалить
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { variableKey: "", characterId: null, op: ops[0], value: "" }])}
        className="text-sm text-neutral-600 underline"
      >
        {mode === "condition" ? "+ Добавить условие" : "+ Добавить эффект"}
      </button>
    </div>
  );
}

export { parseValue };
export type { Row as EffectRow };
