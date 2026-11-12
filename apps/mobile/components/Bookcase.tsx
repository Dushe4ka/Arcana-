import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { router } from "expo-router";

import { ShelfBookCard } from "./ShelfBookCard";
import { fonts, wood } from "../lib/theme";
import { t } from "../lib/locale";
import type { StorySummary } from "../lib/types";

/* The bookcase is one painted cabinet (the owner's star-crowned bookcase) cut into pieces
 * so it can grow with the library:
 *
 *   crown      arch with the compass star and the garland     fixed
 *   wall-top   straight bottom of the arch compartment        STRETCHED, first shelf only
 *   wall       back wall + side posts of a regular shelf      STRETCHED to the shelf height
 *   plank      the board books stand on                       fixed, between shelves
 *   base       cabinet floor, feet and carved brackets        fixed, under the last shelf
 *
 * The stretched pieces carry only vertical wood grain and the plain stretch of the posts
 * (the stars on the posts are left out of them), so stretching them vertically does not
 * show - every shelf is exactly as tall as its books need, and the cabinet takes any number
 * of shelves. The first shelf sits inside the arch, right under the garland.
 *
 * All numbers below are pixels of the source art (assets/images/bookcase-star, 866 px wide). */
const ART_WIDTH = 866;
const CROWN = 377;
const PLANK = 19;
const BASE = 158;
/** How far below the top of the base piece the cabinet floor is. */
const BASE_FLOOR = 34;
const NICHE_LEFT = 106;
const NICHE_RIGHT = 100;

/* eslint-disable @typescript-eslint/no-require-imports */
const ART = {
  crown: require("../assets/images/bookcase-star/crown.png"),
  wallTop: require("../assets/images/bookcase-star/wall-top.png"),
  wall: require("../assets/images/bookcase-star/wall.png"),
  plank: require("../assets/images/bookcase-star/plank.png"),
  base: require("../assets/images/bookcase-star/base.png"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

export type BookcaseShelf = {
  /** Route param for "все" - app/(app)/library/[category].tsx. */
  category: string;
  label: string;
  stories: StorySummary[];
  /** Genre shelves spotlight their newest story; "continue" and "favourites" do not. */
  showBadge?: boolean;
  /** Genre shelves stand in the cabinet even before their first story arrives. */
  keepEmpty?: boolean;
};

export function Bookcase({
  shelves,
  onPressStory,
  onShelfLayout,
}: {
  shelves: BookcaseShelf[];
  onPressStory: (story: StorySummary) => void;
  /** Reports each shelf's vertical position inside the bookcase (for "jump to genre"). */
  onShelfLayout?: (category: string, y: number, height: number) => void;
}) {
  const { width: screen } = useWindowDimensions();
  // Edge to edge: the tips of the cornice reach the sides of the screen.
  const width = Math.min(screen, 640);
  const k = width / ART_WIDTH;
  const nicheLeft = NICHE_LEFT * k;
  const nicheWidth = width - (NICHE_LEFT + NICHE_RIGHT) * k;
  // Three books and a peek of the fourth, so the shelf visibly continues sideways.
  const bookWidth = Math.floor((nicheWidth - 10 - 2 * 10) / 3.25);
  const bookHeight = Math.round(bookWidth * 1.5);
  const shelfHeight = bookHeight + 40;

  const visible = shelves.filter((shelf) => shelf.keepEmpty || shelf.stories.length > 0);
  if (visible.length === 0) return null;

  return (
    <View style={[styles.case, { width }]}>
      {/* Every piece is stretched to its box: with the default "cover" a fractional height
          rounded differently on one shelf zooms that piece and shifts its posts sideways. */}
      <Image source={ART.crown} resizeMode="stretch" style={{ width, height: CROWN * k }} />
      {visible.map((shelf, index) => {
        const first = index === 0;
        const last = index === visible.length - 1;
        const floorInBase = last ? BASE_FLOOR * k : 0;
        const empty = shelf.stories.length === 0;
        const newestId =
          shelf.showBadge === false || empty
            ? null
            : shelf.stories.reduce((newest, story) => (new Date(story.createdAt) > new Date(newest.createdAt) ? story : newest)).id;
        const onLayout = (e: LayoutChangeEvent) => onShelfLayout?.(shelf.category, e.nativeEvent.layout.y, e.nativeEvent.layout.height);
        return (
          <View key={shelf.category} onLayout={onLayout}>
            <Image
              source={first ? ART.wallTop : ART.wall}
              resizeMode="stretch"
              style={{ width, height: shelfHeight - floorInBase }}
            />
            <Image
              source={last ? ART.base : ART.plank}
              resizeMode="stretch"
              style={{ width, height: (last ? BASE : PLANK) * k }}
            />

            {/* Everything standing in the niche: its bottom edge is the plank / cabinet floor. */}
            <View style={[styles.niche, { left: nicheLeft, width: nicheWidth, height: shelfHeight }]}>
              <View style={styles.plaqueRow} pointerEvents="box-none">
                <View style={styles.plaque}>
                  <Text style={styles.plaqueText} numberOfLines={1}>
                    {shelf.label}
                  </Text>
                </View>
                {empty ? null : (
                  <Pressable
                    hitSlop={14}
                    onPress={() => router.push(`/(app)/library/${shelf.category}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`${shelf.label}: показать все`}
                    style={styles.showAll}
                  >
                    <Text style={styles.showAllText}>все ›</Text>
                  </Pressable>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.books}
                contentContainerStyle={styles.booksRow}
              >
                {shelf.stories.map((story, i) => (
                  <ShelfBookCard
                    key={story.id}
                    storyId={story.id}
                    title={t(story.title)}
                    coverImageUrl={story.coverImageUrl}
                    isNew={story.id === newestId}
                    index={i}
                    width={bookWidth}
                    onShelf
                    onPress={() => onPressStory(story)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  case: { alignSelf: "center" },
  niche: { position: "absolute", top: 0, overflow: "hidden" },
  plaqueRow: { position: "absolute", top: 5, left: 0, right: 0, alignItems: "center", zIndex: 2 },
  plaque: {
    maxWidth: "62%",
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: "rgba(24,15,9,0.9)",
    borderWidth: 1,
    borderColor: wood.brass,
  },
  plaqueText: { color: wood.brass, fontSize: 14, fontFamily: fonts.grimoire, letterSpacing: 1 },
  showAll: { position: "absolute", right: 6, top: 0, minHeight: 24, justifyContent: "center" },
  showAllText: { color: "#e9d9b8", fontSize: 13, fontFamily: fonts.grimoireItalic },
  books: { position: "absolute", left: 0, right: 0, bottom: 0 },
  booksRow: { paddingHorizontal: 5, gap: 10, alignItems: "flex-end" },
});
