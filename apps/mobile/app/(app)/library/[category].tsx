import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { STORY_GENRES, type StoryGenre } from "@arcana/shared";

import { GlassSurface } from "../../../components/GlassSurface";
import { HomeBackground } from "../../../components/HomeBackground";
import { ShelfBookCard } from "../../../components/ShelfBookCard";
import { apiRequest, ApiError } from "../../../lib/api";
import { t } from "../../../lib/locale";
import { colors, fonts } from "../../../lib/theme";
import type { SaveSlotListItem, StorySummary } from "../../../lib/types";

const GENRE_LABELS: Record<StoryGenre, string> = {
  FANTASY: "Фэнтези",
  ROMANCE: "Романтика",
  DRAMA: "Драма",
  MYSTERY: "Мистика",
  ADVENTURE: "Приключения",
};

const TITLES: Record<string, string> = {
  continue: "Продолжить чтение",
  favorites: "Избранное",
  ...GENRE_LABELS,
};

function isGenre(value: string): value is StoryGenre {
  return (STORY_GENRES as readonly string[]).includes(value);
}

/** The "Показать все" destination for any shelf on the home screen - a
 * scrollable 2-per-row grid of the same category, no shelf/horizontal-
 * scroll framing. Re-fetches rather than taking the list as a route param:
 * every other screen in this app owns its own data the same way, and a
 * full story list doesn't fit cleanly into a URL param anyway. */
export default function LibraryCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = (category && TITLES[category]) || "Библиотека";
  const cardGap = 16;
  const cardWidth = (screenWidth - 20 * 2 - cardGap) / 2;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (category === "favorites") {
          const favorites = await apiRequest<StorySummary[]>("/favorites");
          if (!cancelled) setStories(favorites);
        } else if (category === "continue") {
          const [slots, catalog] = await Promise.all([
            apiRequest<SaveSlotListItem[]>("/play/save-slots"),
            apiRequest<StorySummary[]>("/catalog/stories", { auth: false }),
          ]);
          const byId = new Map(catalog.map((story) => [story.id, story]));
          const ordered = [...slots]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .map((slot) => byId.get(slot.storyId))
            .filter((story): story is StorySummary => story !== undefined);
          if (!cancelled) setStories(ordered);
        } else if (category && isGenre(category)) {
          const catalog = await apiRequest<StorySummary[]>("/catalog/stories", { auth: false });
          if (!cancelled) setStories(catalog.filter((story) => story.genre === category));
        } else {
          if (!cancelled) setStories([]);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Не удалось загрузить список");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

  const openStory = (story: StorySummary) => router.push(`/(app)/story/${story.id}`);

  return (
    <View style={styles.screen}>
      <HomeBackground />

      <Pressable onPress={() => router.back()} hitSlop={8} style={[styles.backButton, { top: insets.top + 10 }]}>
        <GlassSurface style={styles.backGlass}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </GlassSurface>
      </Pressable>

      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.title}>{title}</Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" style={styles.spinner} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : stories.length === 0 ? (
          <Text style={styles.empty}>Здесь пока пусто</Text>
        ) : (
          <View style={styles.grid}>
            {stories.map((story) => (
              <ShelfBookCard
                key={story.id}
                storyId={story.id}
                title={t(story.title)}
                coverImageUrl={story.coverImageUrl}
                width={cardWidth}
                onPress={() => openStory(story)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  backButton: { position: "absolute", left: 14, zIndex: 10 },
  backGlass: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  container: { paddingHorizontal: 20, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 26, fontFamily: fonts.displayBold, marginBottom: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  spinner: { marginTop: 40 },
  error: { color: colors.danger, marginTop: 20 },
  empty: { color: colors.textMuted, marginTop: 20 },
});
