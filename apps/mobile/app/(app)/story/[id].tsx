import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { StoryGenre } from "@arcana/shared";

import { GlassSurface } from "../../../components/GlassSurface";
import { apiRequest, ApiError } from "../../../lib/api";
import { t } from "../../../lib/locale";
import { colors, homeGradient, radius } from "../../../lib/theme";
import type { ChapterSummary, PlayView, StoryDetail } from "../../../lib/types";

const DEFAULT_SLOT_INDEX = 1;

const GENRE_LABELS: Record<StoryGenre, string> = {
  FANTASY: "Фэнтези",
  ROMANCE: "Романтика",
  DRAMA: "Драма",
  MYSTERY: "Мистика",
  ADVENTURE: "Приключения",
};

// Same idea as the login/loading screens' hero fade, kept much shorter (18
// stops, not 60) after that experiment made the loading-screen gradient
// worse instead of smoother - the curve shape carries most of the benefit,
// stop count only helps up to a point and this stays well inside it.
const HERO_FADE_COLORS = [
  colors.background + "00",
  colors.background + "02",
  colors.background + "08",
  colors.background + "14",
  colors.background + "24",
  colors.background + "38",
  colors.background + "50",
  colors.background + "6a",
  colors.background + "84",
  colors.background + "9c",
  colors.background + "b2",
  colors.background + "c5",
  colors.background + "d6",
  colors.background + "e4",
  colors.background + "ef",
  colors.background + "f8",
  colors.background + "fd",
  colors.background,
] as const;
const HERO_FADE_LOCATIONS = [
  0, 0.06, 0.12, 0.18, 0.24, 0.3, 0.36, 0.42, 0.48, 0.54, 0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.95, 1,
] as const;

export default function StoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingChapterId, setStartingChapterId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiRequest<StoryDetail>(`/catalog/stories/${id}`, { auth: false });
      setStory(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить историю");
    }
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const startChapter = async (chapter: ChapterSummary) => {
    setStartingChapterId(chapter.id);
    try {
      const view = await apiRequest<PlayView>(`/play/chapters/${chapter.id}/start`, {
        method: "POST",
        body: JSON.stringify({ slotIndex: DEFAULT_SLOT_INDEX }),
      });
      router.push(`/read/${view.saveSlot.id}`);
    } catch (err) {
      Alert.alert(
        "Не удалось начать главу",
        err instanceof ApiError ? err.message : "Попробуйте позже",
      );
    } finally {
      setStartingChapterId(null);
    }
  };

  const BackButton = (
    <Pressable onPress={() => router.back()} hitSlop={8} style={[styles.backButton, { top: insets.top + 10 }]}>
      <GlassSurface style={styles.backGlass}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </GlassSurface>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={homeGradient} locations={[0, 0.28, 0.5, 0.75, 1]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={homeGradient} locations={[0, 0.28, 0.5, 0.75, 1]} style={StyleSheet.absoluteFill} />
        <Text style={styles.error}>{error ?? "История не найдена"}</Text>
        {BackButton}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        <View style={styles.hero}>
          {story.coverImageUrl ? (
            <Image source={{ uri: story.coverImageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroFallback]} />
          )}
          <LinearGradient
            colors={HERO_FADE_COLORS}
            locations={HERO_FADE_LOCATIONS}
            style={styles.heroFade}
            pointerEvents="none"
          />
        </View>

        <View style={styles.body}>
          <Text style={styles.genre}>{GENRE_LABELS[story.genre]}</Text>
          <Text style={styles.title}>{t(story.title)}</Text>
          {story.description ? <Text style={styles.description}>{t(story.description)}</Text> : null}

          {story.seasons.map((season) => (
            <View key={season.id} style={styles.season}>
              <Text style={styles.seasonTitle}>{t(season.title)}</Text>
              {season.chapters
                .filter((c) => c.status === "PUBLISHED")
                .map((chapter) => (
                  <GlassSurface key={chapter.id} style={styles.chapterCard} intensity={30}>
                    <View style={styles.chapterNumber}>
                      <Text style={styles.chapterNumberText}>{chapter.index}</Text>
                    </View>
                    <View style={styles.chapterInfo}>
                      <Text style={styles.chapterTitle} numberOfLines={1}>
                        {t(chapter.title)}
                      </Text>
                      <Text style={styles.chapterCost}>
                        {chapter.unlockCost > 0 ? `⚡ ${chapter.unlockCost}` : "Бесплатно"}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => startChapter(chapter)}
                      disabled={startingChapterId === chapter.id}
                      style={({ pressed }) => pressed && styles.playPressed}
                    >
                      <GlassSurface style={styles.playButton} intensity={60} tintColor="rgba(194,147,143,0.82)">
                        {startingChapterId === chapter.id ? (
                          <ActivityIndicator color={colors.background} size="small" />
                        ) : (
                          <Ionicons name="play" size={16} color={colors.background} />
                        )}
                      </GlassSurface>
                    </Pressable>
                  </GlassSurface>
                ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {BackButton}
    </View>
  );
}

const HERO_HEIGHT = 460;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 },
  container: { paddingBottom: 48 },
  hero: { height: HERO_HEIGHT },
  heroImage: { width: "100%", height: "100%" },
  heroFallback: { backgroundColor: colors.surfaceRaised },
  heroFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: HERO_HEIGHT * 0.85 },
  backButton: { position: "absolute", left: 14, zIndex: 10 },
  backGlass: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { paddingHorizontal: 20, marginTop: -36, gap: 6 },
  genre: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: "700" },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  season: { marginTop: 26, gap: 12 },
  seasonTitle: { color: colors.text, fontSize: 15, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  chapterCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radius.lg,
    padding: 14,
  },
  chapterNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  chapterNumberText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  chapterInfo: { flex: 1, gap: 4 },
  chapterTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  chapterCost: { color: colors.textMuted, fontSize: 12 },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  playPressed: { opacity: 0.8 },
  error: { color: colors.danger, textAlign: "center" },
});
