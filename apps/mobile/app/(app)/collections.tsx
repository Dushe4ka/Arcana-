import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { Button } from "../../components/Button";
import { apiRequest, ApiError } from "../../lib/api";
import { t } from "../../lib/locale";
import { colors, fonts, radius } from "../../lib/theme";
import type { StoryCollection } from "../../lib/types";

const GAP = 10;
const COLUMNS = 3;

export default function CollectionsScreen() {
  const { width } = useWindowDimensions();
  const [stories, setStories] = useState<StoryCollection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStories(await apiRequest<StoryCollection[]>("/me/collections"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить коллекции");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (error && !stories) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Button title="Попробовать снова" onPress={load} />
      </View>
    );
  }
  if (!stories) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (stories.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Здесь пока пусто</Text>
        <Text style={styles.emptyText}>
          Начните любую историю — финалы, до которых вы дойдёте, и иллюстрации, которые увидите, останутся здесь.
        </Text>
      </View>
    );
  }

  const tile = (width - 40 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {stories.map((story) => {
          const endingsFound = story.endings.filter((e) => e.unlocked).length;
          const lockedCgs = Math.max(0, story.illustrations.total - story.illustrations.unlocked.length);
          return (
            <View key={story.storyId} style={styles.story}>
              <Text style={styles.storyTitle}>{t(story.storyTitle)}</Text>
              <Text style={styles.progress}>
                Пройдено глав: {story.chaptersCompleted} из {story.chaptersTotal}
              </Text>

              {story.endings.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Финалы · {endingsFound} из {story.endings.length}
                  </Text>
                  {story.endings.map((ending) => (
                    <View key={ending.nodeId} style={styles.ending}>
                      <View style={[styles.endingMark, ending.unlocked && styles.endingMarkOn]} />
                      <View style={styles.endingText}>
                        <Text style={[styles.endingTitle, !ending.unlocked && styles.locked]}>
                          {ending.title ? t(ending.title) : "Ещё не открыт"}
                        </Text>
                        <Text style={styles.endingMeta}>
                          Сезон {ending.seasonIndex}, глава {ending.chapterIndex}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {story.illustrations.total > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Иллюстрации · {story.illustrations.unlocked.length} из {story.illustrations.total}
                  </Text>
                  <View style={styles.grid}>
                    {story.illustrations.unlocked.map((url) => (
                      <Pressable
                        key={url}
                        onPress={() => setViewing(url)}
                        accessibilityRole="imagebutton"
                        accessibilityLabel="Открыть иллюстрацию"
                      >
                        <Image source={{ uri: url }} style={[styles.tile, { width: tile, height: tile * 1.5 }]} />
                      </Pressable>
                    ))}
                    {Array.from({ length: lockedCgs }, (_, i) => (
                      <View
                        key={`locked-${i}`}
                        style={[styles.tile, styles.tileLocked, { width: tile, height: tile * 1.5 }]}
                        accessibilityLabel="Иллюстрация ещё не открыта"
                      >
                        <Text style={styles.tileLockedText}>?</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Full-screen viewer: the illustration alone, tap anywhere to close. */}
      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable
          style={styles.viewer}
          onPress={() => setViewing(null)}
          accessibilityRole="button"
          accessibilityLabel="Закрыть иллюстрацию"
        >
          {viewing ? <Image source={{ uri: viewing }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "stretch", justifyContent: "center", padding: 32, gap: 14 },
  error: { color: colors.danger, textAlign: "center", fontSize: 15 },
  emptyTitle: { color: colors.text, fontSize: 22, textAlign: "center", fontFamily: fonts.displaySemiBold },
  emptyText: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: "center" },
  container: { padding: 20, paddingBottom: 48, gap: 32 },
  story: { gap: 6 },
  storyTitle: { color: colors.text, fontSize: 24, lineHeight: 30, fontFamily: fonts.displaySemiBold },
  progress: { color: colors.textMuted, fontSize: 13 },
  section: { marginTop: 16, gap: 10 },
  sectionTitle: { color: colors.accent, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  ending: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  endingMark: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.border },
  endingMarkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  endingText: { flex: 1, gap: 1 },
  endingTitle: { color: colors.text, fontSize: 16 },
  endingMeta: { color: colors.textMuted, fontSize: 12 },
  locked: { color: colors.textMuted, fontStyle: "italic" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tile: { borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  tileLocked: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  tileLockedText: { color: colors.accentMuted, fontSize: 22, fontFamily: fonts.displaySemiBold },
  viewer: { flex: 1, backgroundColor: "#000" },
});
