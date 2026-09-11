import type { ElementType, ReactNode } from "react";

// Shared surface for every content card in the cabinet: the dark surface, rounded corners,
// and the single gilt hairline across the top edge (see DESIGN_NOTES.md "Card treatment").
// `as` picks the semantic element (BalanceCard/StoryStatsSection use `section`, PackageCard
// uses `article`) without duplicating the styling.
const CARD_CLASSNAME =
  "relative overflow-hidden rounded-[22px] bg-surface p-6 before:absolute before:inset-x-0 before:top-0 before:h-px before:opacity-60 before:bg-[linear-gradient(90deg,transparent,var(--accent)_50%,transparent)] before:content-['']";

export function Card({
  as: Tag = "section",
  children,
}: {
  as?: ElementType;
  children: ReactNode;
}) {
  return <Tag className={CARD_CLASSNAME}>{children}</Tag>;
}
