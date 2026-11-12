import type { ImageSourcePropType } from "react-native";

/** The fortune deck. Adding a card is one line here plus its image in assets/tarot;
 * nothing else in the app needs to know how many cards there are. */
export type TarotCard = {
  id: string;
  name: string;
  image: ImageSourcePropType;
  /** height / width of the artwork, so a card is never stretched or cropped. */
  aspect: number;
};

/* eslint-disable @typescript-eslint/no-require-imports */
export const CARD_BACK: ImageSourcePropType = require("../assets/tarot/back.jpg");
export const CARD_BACK_ASPECT = 1137 / 640;

export const TAROT_DECK: TarotCard[] = [
  { id: "emperor", name: "Император", image: require("../assets/tarot/emperor.jpg"), aspect: 1136 / 640 },
  { id: "lovers", name: "Влюблённые", image: require("../assets/tarot/lovers.jpg"), aspect: 1136 / 640 },
  { id: "hermit", name: "Отшельник", image: require("../assets/tarot/hermit.jpg"), aspect: 1135 / 640 },
  { id: "wheel", name: "Колесо Фортуны", image: require("../assets/tarot/wheel.jpg"), aspect: 960 / 640 },
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
