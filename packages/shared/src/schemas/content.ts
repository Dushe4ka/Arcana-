import { z } from "zod";
import { CONTENT_STATUSES, VARIABLE_TYPES } from "../enums";
import { conditionGroupSchema, effectListSchema, localizedTextSchema } from "./common";

const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Только латиница в нижнем регистре и дефисы");

export const storyCreateSchema = z.object({
  slug: slugSchema,
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  coverImageUrl: z.string().url().nullable().optional(),
});
export type StoryCreateInput = z.infer<typeof storyCreateSchema>;

export const storyUpdateSchema = storyCreateSchema.partial().extend({
  status: z.enum(CONTENT_STATUSES).optional(),
});
export type StoryUpdateInput = z.infer<typeof storyUpdateSchema>;

export const seasonCreateSchema = z.object({
  storyId: z.string().uuid(),
  index: z.number().int().min(1),
  title: localizedTextSchema,
});
export type SeasonCreateInput = z.infer<typeof seasonCreateSchema>;

export const chapterCreateSchema = z.object({
  seasonId: z.string().uuid(),
  index: z.number().int().min(1),
  title: localizedTextSchema,
  /** Energy (or ticket) cost to unlock this chapter. 0 = free. */
  unlockCost: z.number().int().min(0).default(0),
});
export type ChapterCreateInput = z.infer<typeof chapterCreateSchema>;

export const chapterUpdateSchema = chapterCreateSchema.partial().extend({
  status: z.enum(CONTENT_STATUSES).optional(),
  entryNodeId: z.string().uuid().nullable().optional(),
});
export type ChapterUpdateInput = z.infer<typeof chapterUpdateSchema>;

export const characterCreateSchema = z.object({
  storyId: z.string().uuid(),
  name: localizedTextSchema,
  /** Hex color used for the speaker name tag in the reader UI. */
  nameColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#E8B4BC"),
  /** Map of emotion/pose key -> sprite image URL, e.g. { neutral: "...", smile: "..." }. */
  sprites: z.record(z.string(), z.string().url()).default({}),
});
export type CharacterCreateInput = z.infer<typeof characterCreateSchema>;

export const characterUpdateSchema = characterCreateSchema.partial().omit({ storyId: true });
export type CharacterUpdateInput = z.infer<typeof characterUpdateSchema>;

export const variableDefinitionCreateSchema = z.object({
  storyId: z.string().uuid(),
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "snake_case, начинается с буквы"),
  label: localizedTextSchema,
  type: z.enum(VARIABLE_TYPES).default("NUMBER"),
  defaultValue: z.union([z.number(), z.boolean(), z.string()]).default(0),
  /** If set, this variable is a relationship meter tied to a specific character. */
  characterId: z.string().uuid().nullable().optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
});
export type VariableDefinitionCreateInput = z.infer<typeof variableDefinitionCreateSchema>;

/** One character standing on stage during a dialogue beat. */
export const stagedCharacterSchema = z.object({
  characterId: z.string().uuid(),
  sprite: z.string().default("neutral"),
  position: z.enum(["left", "center", "right"]).default("center"),
});
export type StagedCharacter = z.infer<typeof stagedCharacterSchema>;

const baseNodeFields = {
  chapterId: z.string().uuid(),
  order: z.number().int().min(0).default(0),
};

export const dialogueNodeDataSchema = z.object({
  /** null speakerCharacterId = narrator line. */
  speakerCharacterId: z.string().uuid().nullable().default(null),
  text: localizedTextSchema,
  isThought: z.boolean().default(false),
  backgroundImageUrl: z.string().url().nullable().optional(),
  staged: z.array(stagedCharacterSchema).default([]),
  nextNodeId: z.string().uuid().nullable().default(null),
});
export type DialogueNodeData = z.infer<typeof dialogueNodeDataSchema>;

/**
 * Choice options are stored as separate rows (ChoiceOption in Prisma), not embedded in the
 * CHOICE node's JSON, so the admin panel can create/edit/reorder/delete individual options
 * and the future visual graph editor can address each one as its own node with its own edge.
 */
export const choiceOptionCreateSchema = z.object({
  nodeId: z.string().uuid(),
  text: localizedTextSchema,
  order: z.number().int().min(0).default(0),
  costCurrency: z.enum(["SOFT", "HARD"]).nullable().default(null),
  costAmount: z.number().int().min(0).default(0),
  visibleWhen: conditionGroupSchema,
  effects: effectListSchema,
  nextNodeId: z.string().uuid().nullable().default(null),
});
export type ChoiceOptionCreateInput = z.infer<typeof choiceOptionCreateSchema>;

export const choiceOptionUpdateSchema = choiceOptionCreateSchema.partial().omit({ nodeId: true });
export type ChoiceOptionUpdateInput = z.infer<typeof choiceOptionUpdateSchema>;

export const choiceNodeDataSchema = z.object({
  prompt: localizedTextSchema.optional(),
});
export type ChoiceNodeData = z.infer<typeof choiceNodeDataSchema>;

export const conditionNodeDataSchema = z.object({
  when: conditionGroupSchema,
  thenNodeId: z.string().uuid().nullable().default(null),
  elseNodeId: z.string().uuid().nullable().default(null),
});
export type ConditionNodeData = z.infer<typeof conditionNodeDataSchema>;

export const effectNodeDataSchema = z.object({
  effects: effectListSchema,
  nextNodeId: z.string().uuid().nullable().default(null),
});
export type EffectNodeData = z.infer<typeof effectNodeDataSchema>;

export const endNodeDataSchema = z.object({
  /** Marks the chapter complete and optionally unlocks the next chapter. */
  unlocksNextChapter: z.boolean().default(true),
});
export type EndNodeData = z.infer<typeof endNodeDataSchema>;

export const sceneNodeCreateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("DIALOGUE"), ...baseNodeFields, data: dialogueNodeDataSchema }),
  z.object({ type: z.literal("CHOICE"), ...baseNodeFields, data: choiceNodeDataSchema }),
  z.object({ type: z.literal("CONDITION"), ...baseNodeFields, data: conditionNodeDataSchema }),
  z.object({ type: z.literal("EFFECT"), ...baseNodeFields, data: effectNodeDataSchema }),
  z.object({ type: z.literal("END"), ...baseNodeFields, data: endNodeDataSchema }),
]);
export type SceneNodeCreateInput = z.infer<typeof sceneNodeCreateSchema>;

/** Maps a SceneNode's `type` to the zod schema that validates its `data` payload. */
export const sceneNodeDataSchemaByType = {
  DIALOGUE: dialogueNodeDataSchema,
  CHOICE: choiceNodeDataSchema,
  CONDITION: conditionNodeDataSchema,
  EFFECT: effectNodeDataSchema,
  END: endNodeDataSchema,
} as const;

/** Partial update: order can move, and `data` is re-validated server-side against the node's existing type. */
export const sceneNodeUpdateSchema = z.object({
  order: z.number().int().min(0).optional(),
  data: z.unknown().optional(),
});
export type SceneNodeUpdateInput = z.infer<typeof sceneNodeUpdateSchema>;
