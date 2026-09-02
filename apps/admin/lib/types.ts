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
