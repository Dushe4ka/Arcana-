import type { LocalizedText } from "@arcana/shared";

/** View-model types returned by the API. These mirror apps/api/app/schemas/responses.py
 * and the play-engine views built in apps/api/app/services/play_service.py - the backend
 * has no OpenAPI-to-TS generation step yet, so these are kept in sync by hand. */

export type PublicUser = {
  id: string;
  email: string;
  role: "PLAYER" | "WRITER" | "EDITOR" | "ADMIN";
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = TokenPair & {
  user: PublicUser;
};

export type StorySummary = {
  id: string;
  slug: string;
  title: LocalizedText;
  description: LocalizedText | null;
  coverImageUrl: string | null;
  status: string;
};

export type ChapterSummary = {
  id: string;
  index: number;
  title: LocalizedText;
  status: string;
  unlockCost: number;
};

export type SeasonSummary = {
  id: string;
  index: number;
  title: LocalizedText;
  chapters: ChapterSummary[];
};

export type StoryDetail = StorySummary & {
  seasons: SeasonSummary[];
};

/** The lightweight save-slot shape embedded in every play-engine response (DialogueView,
 * ChoiceView, EndView) - built by play_service._to_save_slot_dto. */
export type SaveSlot = {
  id: string;
  slotIndex: number;
  storyId: string;
  chapterId: string | null;
  updatedAt: string;
};

/** The richer shape returned by GET /play/save-slots, used for the "continue" list. */
export type SaveSlotListItem = {
  id: string;
  slotIndex: number;
  storyId: string;
  chapterId: string | null;
  updatedAt: string;
  chapter: { id: string; title: LocalizedText; index: number } | null;
  story: { id: string; title: LocalizedText; coverImageUrl: string | null };
};

// Backend constants (apps/api/app/services/wallet_service.py) - not sent over the wire,
// mirrored here so the UI can show "next point in X min" without a second endpoint.
export const MAX_ENERGY = 40;
export const ENERGY_REGEN_MINUTES = 6;

export type Wallet = {
  id: string;
  userId: string;
  soft: number;
  hard: number;
  energy: number;
  energyUpdatedAt: string;
  updatedAt: string;
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

export type DialogueView = {
  type: "DIALOGUE";
  nodeId: string;
  speaker: CharacterTag | null;
  text: LocalizedText;
  isThought: boolean;
  backgroundImageUrl: string | null;
  staged: StagedCharacterView[];
  canAdvance: boolean;
  saveSlot: SaveSlot;
};

export type ChoiceOptionView = {
  id: string;
  text: LocalizedText;
  costCurrency: "SOFT" | "HARD" | null;
  costAmount: number;
  affordable: boolean;
};

export type ChoiceView = {
  type: "CHOICE";
  nodeId: string;
  prompt: LocalizedText | null;
  options: ChoiceOptionView[];
  saveSlot: SaveSlot;
};

export type EndView = {
  type: "END";
  saveSlot: SaveSlot;
};

export type PlayView = DialogueView | ChoiceView | EndView;

export type DailyRewardClaim = {
  streak: number;
  reward: { soft: number };
};
