import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Scene3DBackground } from "../../../components/Scene3DBackground";
import { StoryCard } from "../../../components/StoryCard";
import { apiRequest, ApiError } from "../../../lib/api";
import { colors, radius } from "../../../lib/theme";
import type { StorySummary } from "../../../lib/types";

// Below this count the list reads as broken (a lot of empty space under one
// card) rather than intentionally short, so a filler card explains it instead.
const SPARSE_THRESHOLD = 3;

export default function CatalogScreen() {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiRequest<StorySummary[]>("/catalog/stories", { auth: false });
      setStories(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить каталог");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Scene3DBackground coverUrls={stories.map((s) => s.coverImageUrl).filter((u): u is string => !!u)} />
      <Text style={styles.header}>Истории</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={stories}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <StoryCard story={item} onPress={() => router.push(`/(app)/story/${item.id}`)} />
        )}
        ListEmptyComponent={
          !error ? <Text style={styles.empty}>Пока нет опубликованных историй</Text> : null
        }
        ListFooterComponent={
          stories.length > 0 && stories.length < SPARSE_THRESHOLD ? (
            <View style={styles.comingSoon}>
              <Text style={styles.comingSoonTitle}>Скоро здесь появятся новые истории</Text>
              <Text style={styles.comingSoonHint}>Заглядывайте почаще — библиотека пополняется</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { color: colors.text, fontSize: 24, fontWeight: "700", paddingHorizontal: 20, marginBottom: 16 },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 14 },
  error: { color: colors.danger, paddingHorizontal: 20, marginBottom: 10 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 40 },
  comingSoon: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 20,
    marginTop: 4,
    alignItems: "center",
    gap: 4,
  },
  comingSoonTitle: { color: colors.textMuted, fontSize: 14, fontWeight: "600", textAlign: "center" },
  comingSoonHint: { color: colors.textMuted, fontSize: 12, textAlign: "center", opacity: 0.8 },
});
