import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { t } from "../lib/locale";
import { colors, radius } from "../lib/theme";
import type { StorySummary } from "../lib/types";

export function StoryCard({ story, onPress }: { story: StorySummary; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {story.coverImageUrl ? (
        <Image source={{ uri: story.coverImageUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverFallback]} />
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {t(story.title)}
        </Text>
        {story.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {t(story.description)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  cover: {
    width: 88,
    height: 110,
  },
  coverFallback: {
    backgroundColor: colors.surfaceRaised,
  },
  body: {
    flex: 1,
    padding: 14,
    gap: 6,
    justifyContent: "center",
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
