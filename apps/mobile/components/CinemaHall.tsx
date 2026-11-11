import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { colors, fonts } from "../lib/theme";
import { t } from "../lib/locale";
import { useReduceMotion } from "../lib/use-reduce-motion";
import type { StorySummary } from "../lib/types";

const SCREEN_BLACK = "#0c0a08";

/** The cinema hall: tonight's premiere as a full-width poster with the title set over it
 * in big italics, then the rest of the programme as a strip of posters - a film programme,
 * not a bookshelf. */
export function CinemaHall({ stories, onPressStory }: { stories: StorySummary[]; onPressStory: (story: StorySummary) => void }) {
  const { width } = useWindowDimensions();
  const still = useReduceMotion();
  // The poster drifts very slowly towards the viewer, like a projector settling.
  const zoom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(zoom, { toValue: 1, duration: 14000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(zoom, { toValue: 0, duration: 14000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, zoom]);

  if (stories.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyScreen}>
          <Text style={styles.kicker}>Скоро на экране</Text>
          <Text style={styles.emptyTitle}>Зал готовится к премьере</Text>
          <Text style={styles.emptyText}>Мини-сериалы появятся здесь, как только выйдет первый.</Text>
        </View>
      </View>
    );
  }

  // The newest series opens the programme.
  const sorted = [...stories].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const [premiere, ...rest] = sorted;
  const heroHeight = Math.min(520, Math.round(width * 1.18));
  const posterWidth = Math.round((width - 20 * 2 - 12 * 2) / 2.6);

  return (
    <View style={styles.hall}>
      <Pressable
        onPress={() => onPressStory(premiere)}
        accessibilityRole="button"
        accessibilityLabel={`Премьера: ${t(premiere.title)}`}
        style={[styles.hero, { height: heroHeight }]}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }] }]}
        >
          {premiere.coverImageUrl ? (
            <Image source={{ uri: premiere.coverImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={["#6f5348", "#3a2a20", SCREEN_BLACK]} style={StyleSheet.absoluteFill} />
          )}
        </Animated.View>
        {/* Letterbox: the image fades to black at both edges, the title sits on the lower fade. */}
        <LinearGradient
          colors={[SCREEN_BLACK, "rgba(12,10,8,0.15)", "rgba(12,10,8,0.1)", "rgba(12,10,8,0.82)", SCREEN_BLACK]}
          locations={[0, 0.16, 0.42, 0.78, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.heroText}>
          <Text style={styles.kicker}>Премьера</Text>
          <Text style={styles.heroTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>
            {t(premiere.title)}
          </Text>
          {t(premiere.description) ? (
            <Text style={styles.heroMeta} numberOfLines={2}>
              {t(premiere.description)}
            </Text>
          ) : null}
          <View style={styles.cta}>
            <Text style={styles.ctaText}>▶  Смотреть</Text>
          </View>
        </View>
      </Pressable>

      {rest.length > 0 ? (
        <>
          <View style={styles.stripHead}>
            <Text style={styles.stripTitle}>В программе</Text>
            <Text style={styles.stripCount}>{rest.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {rest.map((story, index) => (
              <Pressable
                key={story.id}
                onPress={() => onPressStory(story)}
                accessibilityRole="button"
                accessibilityLabel={t(story.title)}
                style={({ pressed }) => [{ width: posterWidth }, pressed && styles.pressed]}
              >
                <View style={[styles.poster, { height: Math.round(posterWidth * 1.45) }]}>
                  {story.coverImageUrl ? (
                    <Image source={{ uri: story.coverImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <LinearGradient colors={["#6f5348", "#3a2a20", "#14100d"]} style={StyleSheet.absoluteFill} />
                  )}
                  <LinearGradient colors={["transparent", "rgba(12,10,8,0.85)"]} style={styles.posterFade} pointerEvents="none" />
                  <Text style={styles.posterIndex}>{index + 2}</Text>
                </View>
                <Text style={styles.posterTitle} numberOfLines={2}>
                  {t(story.title)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hall: { backgroundColor: SCREEN_BLACK, paddingBottom: 28 },
  hero: { overflow: "hidden", justifyContent: "flex-end", backgroundColor: SCREEN_BLACK },
  heroText: { paddingHorizontal: 20, paddingBottom: 22, gap: 6 },
  kicker: { color: colors.accent, fontSize: 11, letterSpacing: 3.2, textTransform: "uppercase", fontWeight: "700" },
  heroTitle: { color: colors.text, fontSize: 46, lineHeight: 46, fontFamily: fonts.poster, letterSpacing: -0.4 },
  heroMeta: { color: colors.textMuted, fontSize: 13, lineHeight: 18, maxWidth: 320 },
  cta: { alignSelf: "flex-start", marginTop: 10, minHeight: 46, justifyContent: "center", paddingHorizontal: 22, backgroundColor: colors.text, borderRadius: 2 },
  ctaText: { color: SCREEN_BLACK, fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
  stripHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12 },
  stripTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  stripCount: { color: colors.textMuted, fontSize: 13 },
  strip: { paddingHorizontal: 20, gap: 12 },
  pressed: { opacity: 0.8 },
  poster: { borderRadius: 2, overflow: "hidden", backgroundColor: "#1a1613" },
  posterFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "45%" },
  posterIndex: { position: "absolute", left: 8, bottom: 2, color: colors.text, fontSize: 34, fontFamily: fonts.poster, opacity: 0.9 },
  posterTitle: { marginTop: 8, color: colors.text, fontSize: 13, fontWeight: "600", lineHeight: 16 },
  empty: { backgroundColor: SCREEN_BLACK, paddingHorizontal: 20, paddingVertical: 28 },
  emptyScreen: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 56, paddingHorizontal: 24, alignItems: "center", gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 28, lineHeight: 32, fontFamily: fonts.poster, textAlign: "center" },
  emptyText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
});
