/** ARCANA's three resources, named in one place.
 *
 *   Зёрна  - earned by reading (the API's "soft" currency)
 *   Карты  - the premium resource (the API's "hard" currency)
 *   Ключи  - open chapters (the API's "energy")
 *
 * Only the names live here: amounts, prices and rules are the server's. */
export const CURRENCY = {
  SOFT: { name: "Зёрна", genitive: "зёрен", glyph: "❖" },
  HARD: { name: "Карты", genitive: "карт", glyph: "✦" },
  ENERGY: { name: "Ключи", genitive: "ключей", glyph: "⚷" },
} as const;

export function costLabel(currency: "SOFT" | "HARD", amount: number): string {
  return `${CURRENCY[currency].glyph} ${amount}`;
}
