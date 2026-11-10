import type { LocalizedText, StoryGenre } from "@arcana/shared";

export type { StoryGenre };

/** View-model types returned by the API. These mirror apps/api/app/schemas/responses.py
 * and the play-engine views built in apps/api/app/services/play_service.py - the backend
 * has no OpenAPI-to-TS generation step yet, so these are kept in sync by hand. */

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
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
  genre: StoryGenre;
  createdAt: string;
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
  xp: number;
  // Derived server-side from xp (apps/api/app/models/economy.py: compute_level) - never
  // sent as raw xp thresholds, always as ready-to-render progress.
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  updatedAt: string;
};

export type CharacterTag = {
  id: string;
  name: LocalizedText;
  nameColor: string;
};

export type SpriteAnimation = "none" | "fade_in" | "slide_in" | "bounce" | "shake" | "nod" | "lean_in";

export type StagedCharacterView = {
  characterId: string;
  name: LocalizedText;
  nameColor: string;
  spriteUrl: string | null;
  position: "left" | "center" | "right";
  animation: SpriteAnimation | null;
};

/** What is on stage right now. The first five fields persist from beat to beat on the
 * server (so a resumed save restores them); the optional ones are one-shot cues of the
 * beat being shown. Mirrors apps/api/app/engine/views.py. */
export type StageView = {
  backgroundUrl: string | null;
  music: { url: string; loop: boolean; volume: number } | null;
  atmosphere: "rain" | "snow" | "fog" | "dust" | "sparkles" | "petals" | null;
  camera: { zoom: number; focus: "left" | "center" | "right" } | null;
  cgUrl: string | null;
  sfxUrl?: string;
  screenEffect?: "shake" | "flash" | "heartbeat" | "blur_in";
  transition?: "none" | "fade" | "dissolve" | "slide";
  musicFadeMs?: number;
  cameraDurationMs?: number;
};

export type PlaySaveSlot = SaveSlot & { canRollback: boolean };

export type DialogueView = {
  type: "DIALOGUE";
  nodeId: string;
  speaker: CharacterTag | null;
  text: LocalizedText;
  isThought: boolean;
  backgroundImageUrl: string | null;
  staged: StagedCharacterView[];
  canAdvance: boolean;
  stage: StageView;
  saveSlot: PlaySaveSlot;
};

export type ChoiceOptionView = {
  id: string;
  text: LocalizedText;
  costCurrency: "SOFT" | "HARD" | null;
  costAmount: number;
  affordable: boolean;
  /** Bought on an earlier playthrough - choosing it again costs nothing. */
  owned: boolean;
};

export type ChoiceView = {
  type: "CHOICE";
  nodeId: string;
  prompt: LocalizedText | null;
  options: ChoiceOptionView[];
  timerSeconds: number | null;
  timeoutOptionId: string | null;
  backgroundImageUrl: string | null;
  stage: StageView;
  saveSlot: PlaySaveSlot;
};

export type EndView = {
  type: "END";
  nodeId: string;
  endingKey: string | null;
  endingTitle: LocalizedText | null;
  stage: StageView;
  rewards: { firstCompletion: boolean; xp: number; soft: number };
  nextChapter: {
    id: string;
    index: number;
    seasonIndex: number;
    title: LocalizedText;
    unlockCost: number;
    unlocked: boolean;
  } | null;
  saveSlot: PlaySaveSlot;
};

export type PlayView = DialogueView | ChoiceView | EndView;

export type HistoryEntry =
  | {
      type: "DIALOGUE";
      nodeId: string;
      speaker: { name: LocalizedText; nameColor: string } | null;
      text: LocalizedText;
      isThought: boolean;
    }
  | { type: "CHOICE"; nodeId: string; text: LocalizedText };

export type DailyRewardClaim = {
  streak: number;
  reward: { soft: number };
};

/** GET /me/collections - one entry per story the player has started. */
export type StoryCollection = {
  storyId: string;
  storyTitle: LocalizedText;
  coverImageUrl: string | null;
  chaptersCompleted: number;
  chaptersTotal: number;
  endings: {
    nodeId: string;
    seasonIndex: number;
    chapterIndex: number;
    unlocked: boolean;
    /** null while the ending is still locked - it is not spoiled. */
    title: LocalizedText | null;
  }[];
  illustrations: { unlocked: string[]; total: number };
};
