"use client";

import type { Node, NodeProps } from "@xyflow/react";

import type { SceneNodeOut } from "@/lib/types";
import { NodeCard, OutputHandleRow } from "./shared";

export type ChoiceFlowNode = Node<SceneNodeOut, "choice">;

/** CHOICE has one output handle per `ChoiceOption` (already available as `node.choiceOptions` on
 * the `SceneNodeOut` passed as `data` - no separate fetch needed), each one addressed by that
 * option's own id (`connection.sourceHandle` in `SceneGraphView`'s `connectNodes` is literally a
 * `ChoiceOption.id`). Built from the same `OutputHandleRow` `ConditionGraphNode` uses, so the
 * node's height grows with the option count for free instead of needing height math kept in
 * sync with `choiceOptions.length`. */
export function ChoiceGraphNode({ data, selected }: NodeProps<ChoiceFlowNode>) {
  const options = [...data.choiceOptions].sort((a, b) => a.order - b.order);
  return (
    <NodeCard node={data} selected={selected}>
      {options.length === 0 ? (
        <p className="mt-1 text-[10px] italic text-neutral-400">нет вариантов ответа</p>
      ) : (
        options.map((option) => (
          <OutputHandleRow
            key={option.id}
            id={option.id}
            label={option.text.ru.slice(0, 20) || "(без текста)"}
            color="#9333ea"
          />
        ))
      )}
    </NodeCard>
  );
}
