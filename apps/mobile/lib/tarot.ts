import type { ImageSourcePropType } from "react-native";

/** The fortune deck. Adding a card is one line here plus its image in assets/tarot;
 * nothing else in the app needs to know how many cards there are. */
export type TarotCard = {
  id: string;
  name: string;
  image: ImageSourcePropType;
};

/* eslint-disable @typescript-eslint/no-require-imports */
export const CARD_BACK: ImageSourcePropType = require("../assets/tarot/back.jpg");
/** Every card on the table has the same frame: the proportion of the card back (9:16).
 * Card art is exported at 9:16 like the back. */
export const CARD_ASPECT = 1137 / 640;

export const TAROT_DECK: TarotCard[] = [
  { id: "magician", name: "Маг", image: require("../assets/tarot/magician.jpg") },
  { id: "high-priestess", name: "Верховная Жрица", image: require("../assets/tarot/high-priestess.jpg") },
  { id: "empress", name: "Императрица", image: require("../assets/tarot/empress.jpg") },
  { id: "emperor", name: "Император", image: require("../assets/tarot/emperor.jpg") },
  { id: "hierophant", name: "Иерофант", image: require("../assets/tarot/hierophant.jpg") },
  { id: "lovers", name: "Влюблённые", image: require("../assets/tarot/lovers.jpg") },
  { id: "chariot", name: "Колесница", image: require("../assets/tarot/chariot.jpg") },
  { id: "justice", name: "Справедливость", image: require("../assets/tarot/justice.jpg") },
  { id: "hermit", name: "Отшельник", image: require("../assets/tarot/hermit.jpg") },
  { id: "wheel", name: "Колесо Фортуны", image: require("../assets/tarot/wheel.jpg") },
  { id: "strength", name: "Сила", image: require("../assets/tarot/strength.jpg") },
  { id: "hanged-man", name: "Повешенный", image: require("../assets/tarot/hanged-man.jpg") },
  { id: "death", name: "Смерть", image: require("../assets/tarot/death.jpg") },
  { id: "temperance", name: "Умеренность", image: require("../assets/tarot/temperance.jpg") },
  { id: "devil", name: "Дьявол", image: require("../assets/tarot/devil.jpg") },
  { id: "tower", name: "Башня", image: require("../assets/tarot/tower.jpg") },
];
/* eslint-enable @typescript-eslint/no-require-imports */

/** Two different cards, every possible pair equally likely.
 *
 * The first index is uniform over all `count` cards; the second is uniform over the
 * remaining `count - 1` (drawn from 0..count-2 and shifted past the first). So each ordered
 * pair has probability 1 / (count * (count - 1)), and each unordered pair - a combination,
 * which is what the player sees - exactly 2 / (count * (count - 1)). */
export function drawPair(count: number, random: () => number = Math.random): [number, number] {
  if (count < 2) throw new Error("A draw needs at least two cards in the deck");
  const first = Math.min(count - 1, Math.floor(random() * count));
  let second = Math.min(count - 2, Math.floor(random() * (count - 1)));
  if (second >= first) second += 1;
  return [first, second];
}
