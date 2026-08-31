import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { GlassSurface } from "./GlassSurface";
import { useFavoritesStore } from "../lib/favorites-store";
import { colors, radius } from "../lib/theme";

const COVER_ASPECT = 2 / 3;

export function ShelfBookCard({
  storyId,
  title,
  coverImageUrl,
  isNew = false,
  width = 104,
  onPress,
}: {
  storyId: string;
  title: string;
  coverImageUrl: string | null;
  isNew?: boolean;
  width?: number;
  onPress: () => void;
}) {
  const isFavorite = useFavoritesStore((s) => s.ids.includes(storyId));
  const toggleFavorite = useFavoritesStore((s) => s.toggle);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, { width }, pressed && styles.pressed]}
    >
      <View style={[styles.cover, { height: width / COVER_ASPECT }]}>
        {coverImageUrl ? (
          <Image source={{ uri: coverImageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.fallback} />
        )}

        {isNew ? (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>Новинка</Text>
          </View>
        ) : null}

        <Pressable
          hitSlop={8}
          style={({ pressed: favPressed }) => [styles.favoriteWrap, favPressed && styles.favoritePressed]}
          onPress={() => toggleFavorite(storyId)}
        >
          <GlassSurface style={styles.favorite} intensity={40}>
            <Ionicons
              name={isFavorite ? "star" : "star-outline"}
              size={14}
              color={isFavorite ? colors.accent : colors.text}
            />
          </GlassSurface>
        </Pressable>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  pressed: {
    opacity: 0.85,
  },
  cover: {
    width: "100%",
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(243,236,224,0.2)",
    backgroundColor: colors.surfaceRaised,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
  },
  newBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: colors.rose,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  newBadgeText: {
    color: colors.background,
    fontSize: 9,
    fontWeight: "700",
  },
  favoriteWrap: {
    position: "absolute",
    top: 6,
    right: 6,
  },
  favorite: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  favoritePressed: {
    opacity: 0.7,
  },
  title: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 15,
  },
});
