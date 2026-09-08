import type { LocalizedText } from "@arcana/shared";

export function rubles(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

export function localized(text: LocalizedText | string | null | undefined): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text.ru ?? Object.values(text)[0] ?? "";
}
