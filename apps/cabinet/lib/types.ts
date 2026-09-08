import type { LocalizedText } from "@arcana/shared";

export type WalletView = {
  soft: number;
  hard: number;
  energy: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
};

export type RelationshipStatView = {
  characterId: string;
  characterName: LocalizedText;
  characterNameColor: string;
  variableKey: string;
  label: LocalizedText;
  value: number | boolean | string;
  minValue: number | null;
  maxValue: number | null;
};

export type GeneralStatView = {
  variableKey: string;
  label: LocalizedText;
  value: number | boolean | string;
};

export type StoryStatsView = {
  storyId: string;
  storyTitle: LocalizedText;
  relationships: RelationshipStatView[];
  general: GeneralStatView[];
};

export type PackageView = {
  id: string;
  currency: string;
  amount: number;
  priceRubKopecks: number;
};
