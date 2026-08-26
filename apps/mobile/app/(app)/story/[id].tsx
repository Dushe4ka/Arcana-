import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Button } from "../../../components/Button";
import { apiRequest, ApiError } from "../../../lib/api";
import { t } from "../../../lib/locale";
import { colors, radius } from "../../../lib/theme";
import type { ChapterSummary, PlayView, StoryDetail } from "../../../lib/types";

const DEFAULT_SLOT_INDEX = 1;

export default function StoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (error || !story) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "История не найдена"}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {story.coverImageUrl ? <Image source={{ uri: story.coverImageUrl }} style={styles.cover} /> : null}
      <Text style={styles.title}>{t(story.title)}</Text>
      {story.description ? <Text style={styles.description}>{t(story.description)}</Text> : null}

      {story.seasons.map((season) => (
        <View key={season.id} style={styles.season}>
          <Text style={styles.seasonTitle}>{t(season.title)}</Text>
          {season.chapters
            .filter((c) => c.status === "PUBLISHED")
            .map((chapter) => (
              <View key={chapter.id} style={styles.chapterRow}>
                <View style={styles.chapterInfo}>
                  <Text style={styles.chapterTitle}>
                    {chapter.index}. {t(chapter.title)}
                  </Text>
                  {chapter.unlockCost > 0 ? (
                    <Text style={styles.chapterCost}>⚡ {chapter.unlockCost} энергии</Text>
                  ) : (
                    <Text style={styles.chapterCost}>Бесплатно</Text>
                  )}
                </View>
                <Button
                  title="Играть"
                  onPress={() => startChapter(chapter)}
                  loading={startingChapterId === chapter.id}
                  variant="secondary"
                />
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 24 },
  container: { paddingBottom: 48 },
  cover: { width: "100%", height: 260 },
  title: { color: colors.accent, fontSize: 26, fontWeight: "700", paddingHorizontal: 20, marginTop: 18 },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 20, paddingHorizontal: 20, marginTop: 8 },
  season: { marginTop: 24, paddingHorizontal: 20, gap: 10 },
  seasonTitle: { color: colors.text, fontSize: 15, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  chapterInfo: { flex: 1, gap: 4 },
  chapterTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  chapterCost: { color: colors.textMuted, fontSize: 12 },
  error: { color: colors.danger, textAlign: "center" },
});
