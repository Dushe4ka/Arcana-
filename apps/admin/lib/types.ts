import type { LocalizedText, StoryGenre, ContentStatus } from "@arcana/shared";

export type StoryOut = {
  id: string;
  slug: string;
  title: LocalizedText;
  description: LocalizedText | null;
  coverImageUrl: string | null;
  status: ContentStatus;
  genre: StoryGenre;
  createdAt: string;
  updatedAt: string;
};

export type ChapterOut = {
  id: string;
  seasonId: string;
  index: number;
  title: LocalizedText;
  status: ContentStatus;
  unlockCost: number;
  entryNodeId: string | null;
};

export type SeasonOut = {
  id: string;
  storyId: string;
  index: number;
  title: LocalizedText;
  chapters: ChapterOut[];
};

export type CharacterOut = {
  id: string;
  storyId: string;
  name: LocalizedText;
  nameColor: string;
  sprites: Record<string, string>;
};

export type StoryDetailOut = StoryOut & {
  seasons: SeasonOut[];
  characters: CharacterOut[];
};

export type ChoiceOptionOut = {
  id: string;
  nodeId: string;
  order: number;
  text: LocalizedText;
  costCurrency: "SOFT" | "HARD" | null;
  costAmount: number;
  visibleWhen: Array<{ variableKey: string; characterId: string | null; operator: string; value: number | boolean | string }>;
  effects: Array<{ variableKey: string; characterId: string | null; op: string; value: number | boolean | string }>;
  nextNodeId: string | null;
};

export type SceneNodeOut = {
  id: string;
  chapterId: string;
  type: "DIALOGUE" | "CHOICE" | "CONDITION" | "EFFECT" | "END";
  order: number;
  data: Record<string, unknown>;
  canvasX: number | null;
  canvasY: number | null;
  choiceOptions: ChoiceOptionOut[];
};

export type CharacterTag = {
  id: string;
  name: LocalizedText;
  nameColor: string;
};

export type StagedCharacterView = {
  characterId: string;
  name: LocalizedText;
  nameColor: string;
  spriteUrl: string | null;
  position: "left" | "center" | "right";
};

export type PreviewDialogueView = {
  type: "DIALOGUE";
  nodeId: string;
  speaker: CharacterTag | null;
  text: LocalizedText;
  isThought: boolean;
  backgroundImageUrl: string | null;
  staged: StagedCharacterView[];
  canAdvance: boolean;
  nextNodeId: string | null;
};

export type PreviewChoiceOptionView = {
  id: string;
  text: LocalizedText;
  costCurrency: "SOFT" | "HARD" | null;
  costAmount: number;
  affordable: boolean;
};

export type PreviewChoiceView = {
  type: "CHOICE";
  nodeId: string;
  prompt: LocalizedText | null;
  options: PreviewChoiceOptionView[];
};

export type PreviewEndView = {
  type: "END";
  nodeId: string;
};

export type PreviewNodeView = PreviewDialogueView | PreviewChoiceView | PreviewEndView;

export type PreviewStepOut = {
  view: PreviewNodeView;
  backgroundUrl: string | null;
  values: Record<string, number | boolean | string>;
};
