import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useFavoritesStore } from "../lib/favorites-store";
import { colors, fonts, wood } from "../lib/theme";

export const BOOK_WIDTH = 96;
export const BOOK_HEIGHT = 148;
// Books on a real shelf are not all the same height.
const HEIGHT_STEPS = [1, 0.94, 0.98, 0.9, 0.96];

/** A book: cover with a shadowed spine on the left and a sliver of page edge on the right.
 * On the bookcase (`onShelf`) books stand at slightly different heights with the title on
 * a label across the foot of the cover; in a grid (the "show all" screen) the title sits
 * underneath. */
export function ShelfBookCard({
  storyId,
  title,
  coverImageUrl,
  isNew = false,
  width = BOOK_WIDTH,
  index = 0,
  onShelf = false,
  onPress,
}: {
  storyId: string;
  title: string;
  coverImageUrl: string | null;
  isNew?: boolean;
  width?: number;
  index?: number;
  onShelf?: boolean;
  onPress: () => void;
}) {
  const isFavorite = useFavoritesStore((s) => s.ids.includes(storyId));
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const slot = (BOOK_HEIGHT * width) / BOOK_WIDTH;
  const height = Math.round(slot * (onShelf ? HEIGHT_STEPS[index % HEIGHT_STEPS.length] : 1));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
    >
      <View style={{ height: slot, justifyContent: "flex-end" }}>
        <View style={[styles.book, { height }]}>
          {coverImageUrl ? (
            <Image source={{ uri: coverImageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <LinearGradient colors={[wood.light, wood.mid, wood.dark]} style={styles.image} />
          )}
          {/* Spine: the cover curves away into shadow on the bound side. */}
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.15)", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.spine}
            pointerEvents="none"
          />
          <View style={styles.hinge} pointerEvents="none" />
          <View style={styles.pages} pointerEvents="none" />
          <View style={styles.gilt} pointerEvents="none" />

          {isNew ? (
            <View style={styles.ribbon}>
              <Text style={styles.ribbonText}>новинка</Text>
            </View>
          ) : null}

          {onShelf ? (
            <LinearGradient colors={["transparent", "rgba(12,8,5,0.92)"]} style={styles.label} pointerEvents="none">
              <Text style={styles.labelText} numberOfLines={2}>
                {title}
              </Text>
            </LinearGradient>
          ) : null}

          <Pressable
            hitSlop={10}
            style={({ pressed: favPressed }) => [styles.favorite, onShelf && styles.favoriteSmall, favPressed && styles.pressed]}
            onPress={() => toggleFavorite(storyId)}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? "Убрать из избранного" : "В избранное"}
          >
            <Ionicons name={isFavorite ? "star" : "star-outline"} size={onShelf ? 10 : 13} color={isFavorite ? colors.accent : colors.text} />
          </Pressable>
        </View>
      </View>
      {onShelf ? null : (
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  book: {
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
    overflow: "hidden",
    backgroundColor: wood.mid,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 3, height: 2 },
    elevation: 6,
  },
  image: { width: "100%", height: "100%" },
  spine: { position: "absolute", left: 0, top: 0, bottom: 0, width: 16 },
  hinge: { position: "absolute", left: 7, top: 0, bottom: 0, width: 1, backgroundColor: "rgba(233,217,184,0.22)" },
  pages: { position: "absolute", right: 0, top: 2, bottom: 2, width: 2, backgroundColor: "rgba(233,217,184,0.55)" },
  gilt: { position: "absolute", left: 0, right: 0, top: 0, height: 1, backgroundColor: "rgba(212,175,106,0.7)" },
  ribbon: {
    position: "absolute",
    top: 0,
    left: 12,
    paddingHorizontal: 4,
    paddingTop: 3,
    paddingBottom: 6,
    backgroundColor: "#6e2a35",
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  ribbonText: { color: "#e9d9b8", fontSize: 7.5, letterSpacing: 0.4, fontFamily: fonts.grimoire },
  favorite: {
    position: "absolute",
    top: 5,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,16,13,0.55)",
  },
  favoriteSmall: { width: 18, height: 18, borderRadius: 9, top: 4, right: 5 },
  title: { marginTop: 8, color: colors.text, fontSize: 13.5, lineHeight: 15, fontFamily: fonts.grimoire, textAlign: "center" },
  label: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 18, paddingBottom: 5, paddingHorizontal: 5 },
  labelText: { color: "#f3ece0", fontSize: 11.5, lineHeight: 12.5, fontFamily: fonts.grimoire, textAlign: "center" },
});
