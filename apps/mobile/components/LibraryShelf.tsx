import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { ShelfBookCard, BOOK_HEIGHT, BOOK_WIDTH } from "./ShelfBookCard";
import { SoftGlow } from "./SoftGlow";
import { colors, fonts, wood } from "../lib/theme";
import { t } from "../lib/locale";
import type { StorySummary } from "../lib/types";

const PLANK = 16;
const NICHE_TOP = 18;

/** One shelf of the bookcase: a brass plaque naming it, a shadowed wooden niche with the
 * books standing in it, and a thick plank they stand on. Titles are engraved under the plank,
 * so the books themselves stay clean. */
export function LibraryShelf({
  label,
  category,
  stories,
  onPressStory,
  showBadge = true,
}: {
  label: string;
  /** Route param for "Показать все" - app/(app)/library/[category].tsx. */
  category: string;
  stories: StorySummary[];
  onPressStory: (story: StorySummary) => void;
  /** "Продолжить чтение"/"Избранное" aren't about recency, so they skip the
   * "Новинка" spotlight genre shelves get. */
  showBadge?: boolean;
}) {
  if (stories.length === 0) return null;

  // Only the single most recently published story on this shelf gets the "Новинка" ribbon.
  const newestId = showBadge
    ? stories.reduce((newest, story) => (new Date(story.createdAt) > new Date(newest.createdAt) ? story : newest)).id
    : null;

  return (
    <View style={styles.bay}>
      <View style={styles.plaqueRow}>
        <View style={styles.plaque}>
          <Text style={styles.plaqueText} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Pressable
          hitSlop={12}
          onPress={() => router.push(`/(app)/library/${category}`)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: показать все`}
          style={styles.showAll}
        >
          <Text style={styles.showAllText}>все ›</Text>
        </Pressable>
      </View>

      <View style={styles.niche}>
        {/* Back wall of the niche: darker at the top where the shelf above shades it. */}
        <LinearGradient colors={[wood.shadow, wood.dark, wood.mid]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["rgba(0,0,0,0.55)", "transparent"]} style={styles.nicheShade} pointerEvents="none" />
        {/* A warm pool of candlelight on the back wall. */}
        <SoftGlow size={BOOK_HEIGHT * 1.5} strength={0.03} style={styles.glow} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {stories.map((story, index) => (
            <ShelfBookCard
              key={story.id}
              storyId={story.id}
              title={t(story.title)}
              coverImageUrl={story.coverImageUrl}
              isNew={story.id === newestId}
              index={index}
              titleOffset={PLANK + 8}
              onPress={() => onPressStory(story)}
            />
          ))}
        </ScrollView>

        {/* The plank sits across the whole niche, under the books' feet; it does not scroll. */}
        <View style={styles.plankWrap} pointerEvents="none">
          <View style={styles.plankHighlight} />
          <LinearGradient colors={[wood.edge, wood.light, wood.mid, wood.dark]} locations={[0, 0.2, 0.7, 1]} style={styles.plank} />
          <LinearGradient colors={["rgba(0,0,0,0.5)", "transparent"]} style={styles.plankShadow} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bay: { gap: 0 },
  plaqueRow: { alignItems: "center", justifyContent: "center", marginBottom: -11, zIndex: 2 },
  plaque: {
    maxWidth: "70%",
    paddingHorizontal: 18,
    paddingVertical: 4,
    borderRadius: 3,
    backgroundColor: "#1d140d",
    borderWidth: 1,
    borderColor: wood.brass,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  plaqueText: { color: wood.brass, fontSize: 16, fontFamily: fonts.grimoire, letterSpacing: 1.2 },
  showAll: { position: "absolute", right: 14, top: -2, minHeight: 28, justifyContent: "center" },
  showAllText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.grimoireItalic },
  niche: { overflow: "hidden", paddingTop: NICHE_TOP, paddingBottom: 14 },
  nicheShade: { position: "absolute", top: 0, left: 0, right: 0, height: 34 },
  glow: { position: "absolute", alignSelf: "center", top: NICHE_TOP - 20 },
  row: { paddingHorizontal: 18, gap: 14, alignItems: "flex-start" },
  plankWrap: { position: "absolute", left: 0, right: 0, top: NICHE_TOP + BOOK_HEIGHT },
  plankHighlight: { height: 1, backgroundColor: "rgba(233,217,184,0.45)" },
  plank: { height: PLANK },
  plankShadow: { height: 10 },
});

export const SHELF_BOOK_WIDTH = BOOK_WIDTH;
