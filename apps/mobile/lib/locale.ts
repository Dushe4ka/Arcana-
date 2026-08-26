import type { LocalizedText } from "@arcana/shared";

/** Picks a localized string for the given locale, falling back to Russian (the one locale
 * every piece of content is required to have) and then to the first available value. */
export function t(text: LocalizedText | null | undefined, locale: string = "ru"): string {
  if (!text) return "";
  return text[locale] ?? text.ru ?? Object.values(text)[0] ?? "";
}
