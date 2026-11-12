import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { colors, fonts } from "../lib/theme";
import { t } from "../lib/locale";
import { useReduceMotion } from "../lib/use-reduce-motion";
import type { StorySummary } from "../lib/types";

const VEIL = "rgba(26,20,15,";

/** The cinema hall: the newest mini-series as a wide poster with its title over the image,
 * then the rest of the programme as a strip of posters. Everything sits on a translucent
 * veil, so the room behind stays visible - same voice (Cormorant) as the library. */
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
      <View style={[styles.hall, styles.empty]}>
        <Text style={styles.kicker}>Скоро на экране</Text>
        <Text style={styles.emptyTitle}>Зал готовится к премьере</Text>
        <Text style={styles.emptyText}>Мини-сериалы появятся здесь, как только выйдет первый.</Text>
      </View>
    );
  }

  // The newest series opens the programme.
  const sorted = [...stories].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const [premiere, ...rest] = sorted;
  const inner = width - 24;
  const heroHeight = Math.min(440, Math.round(inner * 1.05));
  const posterWidth = Math.round((inner - 16 * 2 - 12 * 2) / 2.6);

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
            <LinearGradient colors={["rgba(111,83,72,0.75)", "rgba(58,42,32,0.6)", `${VEIL}0.4)`]} style={StyleSheet.absoluteFill} />
          )}
        </Animated.View>
        {/* The image melts into the veil at the bottom, where the title sits. */}
        <LinearGradient
          colors={[`${VEIL}0)`, `${VEIL}0.15)`, `${VEIL}0.86)`]}
          locations={[0, 0.45, 1]}
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
            <Text style={styles.ctaText}>Смотреть</Text>
          </View>
        </View>
      </Pressable>

      {rest.length > 0 ? (
        <>
          <View style={styles.stripHead}>
            <View style={styles.rule} />
            <Text style={styles.stripTitle}>В программе</Text>
            <View style={styles.rule} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {rest.map((story) => (
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
                    <LinearGradient colors={["#6f5348", "#3a2a20", "#1a1613"]} style={StyleSheet.absoluteFill} />
                  )}
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
  hall: {
    marginHorizontal: 12,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: `${VEIL}0.46)`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(212,175,106,0.5)",
    paddingBottom: 20,
  },
  hero: { overflow: "hidden", justifyContent: "flex-end" },
  heroText: { paddingHorizontal: 18, paddingBottom: 18, gap: 4 },
  kicker: { color: colors.accent, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" },
  heroTitle: { color: colors.text, fontSize: 38, lineHeight: 40, fontFamily: fonts.grimoireBold, letterSpacing: 0.3 },
  heroMeta: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  cta: {
    alignSelf: "flex-start",
    marginTop: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "rgba(212,175,106,0.14)",
  },
  ctaText: { color: colors.accent, fontSize: 18, fontFamily: fonts.grimoire, letterSpacing: 0.6 },
  stripHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.accentMuted },
  stripTitle: { color: colors.text, fontSize: 19, fontFamily: fonts.grimoire, letterSpacing: 0.5 },
  strip: { paddingHorizontal: 16, gap: 12 },
  pressed: { opacity: 0.8 },
  poster: { borderRadius: 4, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(212,175,106,0.4)" },
  posterTitle: { marginTop: 8, color: colors.text, fontSize: 15, lineHeight: 17, fontFamily: fonts.grimoire, textAlign: "center" },
  empty: { paddingVertical: 48, paddingHorizontal: 24, alignItems: "center", gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 26, lineHeight: 30, fontFamily: fonts.grimoireBold, textAlign: "center" },
  emptyText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
});
