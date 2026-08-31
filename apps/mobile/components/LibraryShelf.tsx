import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ShelfBookCard } from "./ShelfBookCard";
import { colors, fonts } from "../lib/theme";
import { t } from "../lib/locale";
import type { StorySummary } from "../lib/types";

/** One genre's row of covers - cards float directly on the ambient home
 * background (no wood-shelf illustration), each with its own glass-style
 * border, matching the "Показать все" section header pattern from the grid
 * reference. */
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

  // Only the single most recently published story on this shelf gets the
  // "Новинка" badge, matching the reference (a spotlight on the newest
  // addition, not a broad recency window every seeded story would trip).
  const newestId = showBadge
    ? stories.reduce((newest, story) => (new Date(story.createdAt) > new Date(newest.createdAt) ? story : newest))
        .id
    : null;

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text style={styles.label}>{label}</Text>
        <Pressable hitSlop={6} onPress={() => router.push(`/(app)/library/${category}`)}>
          <View style={styles.showAll}>
            <Text style={styles.showAllText}>Показать все</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </View>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {stories.map((story) => (
          <ShelfBookCard
            key={story.id}
            storyId={story.id}
            title={t(story.title)}
            coverImageUrl={story.coverImageUrl}
            isNew={story.id === newestId}
            onPress={() => onPressStory(story)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 16,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  label: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.displaySemiBold,
  },
  showAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  showAllText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  row: {
    paddingHorizontal: 20,
    gap: 16,
  },
});
