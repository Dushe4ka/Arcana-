export const SUPPORTED_LOCALES = ["ru", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "ru";

export const USER_ROLES = ["PLAYER", "WRITER", "EDITOR", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const VARIABLE_TYPES = ["NUMBER", "BOOLEAN", "STRING"] as const;
export type VariableType = (typeof VARIABLE_TYPES)[number];

/** SOFT = earned for free by playing, HARD = premium currency bought for real money. */
export const CURRENCY_CODES = ["SOFT", "HARD"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const SCENE_NODE_TYPES = [
  "DIALOGUE",
  "CHOICE",
  "CONDITION",
  "EFFECT",
  "END",
] as const;
export type SceneNodeType = (typeof SCENE_NODE_TYPES)[number];

export const CONDITION_OPERATORS = [
  "EQ",
  "NEQ",
  "GT",
  "GTE",
  "LT",
  "LTE",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const EFFECT_OPERATIONS = ["SET", "INCREMENT", "DECREMENT"] as const;
export type EffectOperation = (typeof EFFECT_OPERATIONS)[number];

export const TRANSACTION_TYPES = ["EARN", "SPEND", "PURCHASE", "GRANT"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
