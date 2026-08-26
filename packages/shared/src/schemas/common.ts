import { z } from "zod";
import { CONDITION_OPERATORS, EFFECT_OPERATIONS, SUPPORTED_LOCALES } from "../enums";

/**
 * Localized text is stored as a JSON map of locale -> string, e.g. { "ru": "...", "en": "..." }.
 * The default locale (ru) is required so content is never blank; other locales are optional
 * until translated.
 */
export const localizedTextSchema = z
  .object({
    ru: z.string().min(1, "Русский текст обязателен"),
    en: z.string().optional(),
  })
  .catchall(z.string().optional());
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export const localeSchema = z.enum(SUPPORTED_LOCALES);

/** A single condition checked against a player's variable/relationship value. */
export const conditionSchema = z.object({
  variableKey: z.string().min(1),
  characterId: z.string().uuid().nullable().optional(),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.number(), z.boolean(), z.string()]),
});
export type Condition = z.infer<typeof conditionSchema>;

/** A list of conditions combined with AND semantics. Empty list = always true. */
export const conditionGroupSchema = z.array(conditionSchema).default([]);
export type ConditionGroup = z.infer<typeof conditionGroupSchema>;

/** A mutation applied to a player's variable/relationship value when a node/choice is taken. */
export const effectSchema = z.object({
  variableKey: z.string().min(1),
  characterId: z.string().uuid().nullable().optional(),
  op: z.enum(EFFECT_OPERATIONS),
  value: z.union([z.number(), z.boolean(), z.string()]),
});
export type Effect = z.infer<typeof effectSchema>;

export const effectListSchema = z.array(effectSchema).default([]);
export type EffectList = z.infer<typeof effectListSchema>;
