import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { HomeBackground } from "../../../components/HomeBackground";
import { HomeHeader } from "../../../components/HomeHeader";
import { LibraryShelf } from "../../../components/LibraryShelf";
import { apiRequest, ApiError } from "../../../lib/api";
import { useAuthStore } from "../../../lib/auth-store";
import { colors, homeGradient } from "../../../lib/theme";
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

  const [stories, setStories] = useState<StorySummary[]>([]);
  const [continueSlots, setContinueSlots] = useState<SaveSlotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGenre, setActiveGenre] = useState<StoryGenre>(STORY_GENRES[0]);

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
    load().finally(() => setLoading(false));
  }, [fetchWallet, load]);

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
          <View style={styles.libraryTitleRow}>
            <Text style={styles.libraryTitle}>Библиотека</Text>
            <Pressable
              hitSlop={8}
              onPress={() => Alert.alert("Библиотека", "Управление библиотекой пока не готово. Загляните позже.")}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            </Pressable>
          </View>
          <Pressable
            hitSlop={6}
            onPress={() => Alert.alert("Библиотека", "Полный каталог пока не готов. Загляните позже.")}
          >
            <View style={styles.showAll}>
              <Text style={styles.showAllText}>Показать все</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </Pressable>
        </View>

        <GenreTabs active={activeGenre} onSelect={onSelectGenre} />

        <View
          style={styles.shelves}
          onLayout={(e) => {
            shelvesTop.current = e.nativeEvent.layout.y;
          }}
        >
          {STORY_GENRES.map((genre) => (
            <View key={genre} onLayout={onShelfLayout(genre)}>
              <LibraryShelf label={GENRE_LABELS[genre]} stories={byGenre[genre]} onPressStory={openStory} />
            </View>
          ))}
        </View>

        {stories.length === 0 && !error ? (
          <Text style={styles.empty}>Пока нет опубликованных историй</Text>
        ) : null}
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
  libraryTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  libraryTitle: { color: colors.text, fontSize: 21, fontWeight: "700", letterSpacing: 0.2 },
  showAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  showAllText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  shelves: { gap: 32 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 20 },
});
