import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { STORY_GENRES, type StoryGenre } from "@arcana/shared";

import { ContinueSection } from "../../../components/ContinueSection";
import { GenreTabs } from "../../../components/GenreTabs";
import { GlassSurface } from "../../../components/GlassSurface";
import { HomeBackground } from "../../../components/HomeBackground";
import { HomeHeader } from "../../../components/HomeHeader";
import { LibraryShelf } from "../../../components/LibraryShelf";
import { apiRequest, ApiError } from "../../../lib/api";
import { useAuthStore } from "../../../lib/auth-store";
import { useFavoritesStore } from "../../../lib/favorites-store";
import { colors, fonts, homeGradient, radius } from "../../../lib/theme";
import { useWalletStore } from "../../../lib/wallet-store";
import type { SaveSlotListItem, StorySummary } from "../../../lib/types";

const GENRE_LABELS: Record<StoryGenre, string> = {
  FANTASY: "Фэнтези",
  ROMANCE: "Романтика",
  DRAMA: "Драма",
  MYSTERY: "Мистика",
  ADVENTURE: "Приключения",
};

export default function CatalogScreen() {
  const user = useAuthStore((s) => s.user);
  const wallet = useWalletStore((s) => s.wallet);
  const fetchWallet = useWalletStore((s) => s.fetch);
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const hydrateFavorites = useFavoritesStore((s) => s.hydrate);

  const [stories, setStories] = useState<StorySummary[]>([]);
  const [continueSlots, setContinueSlots] = useState<SaveSlotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGenre, setActiveGenre] = useState<StoryGenre>(STORY_GENRES[0]);
  const [activeSection, setActiveSection] = useState<"library" | "cinema">("library");

  const scrollRef = useRef<ScrollView>(null);
  const shelfOffsets = useRef<Partial<Record<StoryGenre, { y: number; height: number }>>>({});
  // Each shelf's onLayout y is relative to its immediate parent (`shelves`),
  // not to the scroll content root - this is that parent's own y within the
  // ScrollView, so it can be added back on to get an absolute scroll offset.
  const shelvesTop = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [storiesData, slotsData] = await Promise.all([
        apiRequest<StorySummary[]>("/catalog/stories", { auth: false }),
        apiRequest<SaveSlotListItem[]>("/play/save-slots"),
      ]);
      setStories(storiesData);
      setContinueSlots(slotsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить каталог");
    }
  }, []);

  useEffect(() => {
    fetchWallet();
    hydrateFavorites();
    load().finally(() => setLoading(false));
  }, [fetchWallet, hydrateFavorites, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchWallet(), load()]);
    setRefreshing(false);
  };

  const byGenre = useMemo(() => {
    const groups: Record<StoryGenre, StorySummary[]> = {
      FANTASY: [],
      ROMANCE: [],
      DRAMA: [],
      MYSTERY: [],
      ADVENTURE: [],
    };
    for (const story of stories) groups[story.genre].push(story);
    return groups;
  }, [stories]);

  const slotByStoryId = useMemo(() => {
    const map: Partial<Record<string, SaveSlotListItem>> = {};
    for (const slot of continueSlots) map[slot.storyId] = slot;
    return map;
  }, [continueSlots]);

  // Most-recently-played first - continueSlots itself has no guaranteed
  // order, and "continue reading" should lead with whichever book you were
  // just in, not whatever order the catalog happens to return.
  const continueStories = useMemo(() => {
    const byId = new Map(stories.map((story) => [story.id, story]));
    return [...continueSlots]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((slot) => byId.get(slot.storyId))
      .filter((story): story is StorySummary => story !== undefined);
  }, [continueSlots, stories]);

  // Ordered by favoriteIds (most recently favorited first, per the store),
  // not by filtering `stories` in catalog order.
  const favoriteStories = useMemo(() => {
    const byId = new Map(stories.map((story) => [story.id, story]));
    return favoriteIds.map((id) => byId.get(id)).filter((story): story is StorySummary => story !== undefined);
  }, [stories, favoriteIds]);

  const openStory = (story: StorySummary) => router.push(`/(app)/story/${story.id}`);
  // A story already in progress resumes its save slot; otherwise the
  // carousel card opens the story page to start it - lets the carousel
  // browse the whole library (not just started reads) while still
  // "continuing" the ones that already have a slot.
  const openCarouselStory = (story: StorySummary) => {
    const slot = slotByStoryId[story.id];
    if (slot) router.push(`/read/${slot.id}`);
    else openStory(story);
  };

  const onSelectGenre = (genre: StoryGenre) => {
    setActiveGenre(genre);
    const target = shelfOffsets.current[genre];
    if (target) {
      // Center the shelf in the visible scroll viewport instead of just
      // pinning its top near the top edge, which used to leave a short
      // shelf sitting near the bottom of the screen.
      const absoluteY = shelvesTop.current + target.y;
      const centeredY = Math.max(0, absoluteY - (viewportHeight - target.height) / 2);
      scrollRef.current?.scrollTo({ y: centeredY, animated: true });
    }
  };

  const onShelfLayout = (genre: StoryGenre) => (e: LayoutChangeEvent) => {
    shelfOffsets.current[genre] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height };
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={homeGradient} locations={[0, 0.28, 0.5, 0.75, 1]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <HomeBackground />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <HomeHeader user={user} wallet={wallet} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <ContinueSection stories={stories} slotByStoryId={slotByStoryId} onOpen={openCarouselStory} />

        <View style={styles.libraryHeading}>
          <View style={styles.sectionTabs}>
            <Pressable onPress={() => setActiveSection("library")} hitSlop={6}>
              <Text style={[styles.sectionTab, activeSection !== "library" && styles.sectionTabInactive]}>
                Библиотека
              </Text>
            </Pressable>
            <Pressable onPress={() => setActiveSection("cinema")} hitSlop={6}>
              <Text style={[styles.sectionTab, activeSection !== "cinema" && styles.sectionTabInactive]}>
                Кинозал
              </Text>
            </Pressable>
          </View>
        </View>

        {activeSection === "library" ? (
          <>
            <GenreTabs active={activeGenre} onSelect={onSelectGenre} />

            <View
              style={styles.shelves}
              onLayout={(e) => {
                shelvesTop.current = e.nativeEvent.layout.y;
              }}
            >
              <LibraryShelf
                label="Продолжить чтение"
                category="continue"
                stories={continueStories}
                onPressStory={openStory}
                showBadge={false}
              />
              <LibraryShelf
                label="Избранное"
                category="favorites"
                stories={favoriteStories}
                onPressStory={openStory}
                showBadge={false}
              />

              {STORY_GENRES.map((genre) => (
                <View key={genre} onLayout={onShelfLayout(genre)}>
                  <LibraryShelf
                    label={GENRE_LABELS[genre]}
                    category={genre}
                    stories={byGenre[genre]}
                    onPressStory={openStory}
                  />
                </View>
              ))}
            </View>

            {stories.length === 0 && !error ? (
              <Text style={styles.empty}>Пока нет опубликованных историй</Text>
            ) : null}
          </>
        ) : (
          <GlassSurface style={styles.cinemaComingSoon} intensity={25}>
            <Ionicons name="film-outline" size={22} color={colors.accentMuted} />
            <Text style={styles.cinemaComingSoonText}>Скоро здесь появятся мини-сериалы</Text>
          </GlassSurface>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  content: { paddingTop: 68, paddingBottom: 56, gap: 40 },
  error: { color: colors.danger, paddingHorizontal: 20 },
  libraryHeading: {
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTabs: { flexDirection: "row", alignItems: "center", gap: 18 },
  sectionTab: { color: colors.text, fontSize: 22, fontFamily: fonts.displayBold, letterSpacing: 0.2 },
  sectionTabInactive: { color: colors.textMuted, opacity: 0.85 },
  shelves: { gap: 32 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 20 },
  cinemaComingSoon: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    padding: 18,
  },
  cinemaComingSoonText: { color: colors.textMuted, fontSize: 13, flex: 1 },
});
