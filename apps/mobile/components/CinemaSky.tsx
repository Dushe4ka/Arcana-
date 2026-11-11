import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { colors, fonts } from "../lib/theme";
import { t } from "../lib/locale";
import { useReduceMotion } from "../lib/use-reduce-motion";
import type { StorySummary } from "../lib/types";

const ORB = 104;
const ROW = 176;

// Deterministic pseudo-random: positions and rhythms stay put between renders.
function rand(index: number, salt: number) {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** One film adrift in the night sky: a round cover inside a soft halo, wandering on its own
 * slow path and breathing a little. No lines connect the films - each floats by itself. */
function FloatingFilm({
  story,
  index,
  left,
  top,
  still,
  onPress,
}: {
  story: StorySummary;
  index: number;
  left: number;
  top: number;
  still: boolean;
  onPress: () => void;
}) {
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) return;
    const wander = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(value, { toValue: -1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        { resetBeforeIteration: false },
      );
    // Different periods on each axis and for each film, so nothing moves in step.
    const loops = [
      wander(driftX, 5200 + rand(index, 1) * 3600),
      wander(driftY, 4300 + rand(index, 2) * 3200),
      wander(breath, 3000 + rand(index, 3) * 2000),
    ];
    const timer = setTimeout(() => loops.forEach((loop) => loop.start()), rand(index, 4) * 1200);
    return () => {
      clearTimeout(timer);
      loops.forEach((loop) => loop.stop());
    };
  }, [breath, driftX, driftY, index, still]);

  const rangeX = 10 + rand(index, 5) * 10;
  const rangeY = 8 + rand(index, 6) * 10;

  return (
    <Animated.View
      style={[
        styles.film,
        {
          left,
          top,
          transform: [
            { translateX: driftX.interpolate({ inputRange: [-1, 1], outputRange: [-rangeX, rangeX] }) },
            { translateY: driftY.interpolate({ inputRange: [-1, 1], outputRange: [-rangeY, rangeY] }) },
            { scale: breath.interpolate({ inputRange: [-1, 1], outputRange: [0.97, 1.03] }) },
          ],
        },
      ]}
    >
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t(story.title)} style={styles.filmPress}>
        <Animated.View style={[styles.halo, { opacity: breath.interpolate({ inputRange: [-1, 1], outputRange: [0.35, 0.8] }) }]} />
        <View style={styles.orb}>
          {story.coverImageUrl ? (
            <Image source={{ uri: story.coverImageUrl }} style={styles.cover} resizeMode="cover" />
          ) : (
            <LinearGradient colors={["#6f5348", "#3a2a20", "#14100d"]} style={styles.cover} />
          )}
          {/* A glint across the top of the glass. */}
          <LinearGradient colors={["rgba(255,247,230,0.28)", "transparent"]} style={styles.glint} pointerEvents="none" />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {t(story.title)}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function Twinkle({ index, width, height, still }: { index: number; width: number; height: number; still: boolean }) {
  const pulse = useRef(new Animated.Value(still ? 0.6 : 0)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400 + rand(index, 7) * 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.1, duration: 1400 + rand(index, 8) * 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), rand(index, 9) * 3000);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [index, pulse, still]);
  const size = 1.5 + rand(index, 10) * 2.5;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: rand(index, 11) * width,
        top: rand(index, 12) * height,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: index % 4 === 0 ? colors.accent : colors.text,
        opacity: pulse,
      }}
    />
  );
}

/** The cinema hall: mini-series floating in a starry sky. */
export function CinemaSky({ stories, onPressStory }: { stories: StorySummary[]; onPressStory: (story: StorySummary) => void }) {
  const { width } = useWindowDimensions();
  const still = useReduceMotion();
  const rows = Math.max(2, stories.length);
  const height = stories.length === 0 ? 260 : rows * ROW + 40;

  // A loose zigzag: left, right, a little off-centre, so it never reads as a grid.
  const positions = useMemo(
    () =>
      stories.map((_, i) => {
        const lanes = [0.1, 0.56, 0.3, 0.62, 0.14, 0.46];
        const lane = lanes[i % lanes.length] + (rand(i, 13) - 0.5) * 0.06;
        return { left: Math.max(8, Math.min(width - ORB - 36, lane * (width - 24))), top: 16 + i * ROW + (rand(i, 14) - 0.5) * 24 };
      }),
    [stories, width],
  );

  return (
    <View style={[styles.sky, { height }]}>
      <LinearGradient colors={["rgba(21,17,14,0)", "rgba(21,17,14,0.72)", "rgba(21,17,14,0.72)", "rgba(21,17,14,0)"]} locations={[0, 0.12, 0.88, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {Array.from({ length: 46 }, (_, i) => (
        <Twinkle key={i} index={i} width={width} height={height} still={still} />
      ))}
      {stories.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Небо пока пусто</Text>
          <Text style={styles.emptyText}>Мини-сериалы появятся здесь, как только выйдет первая премьера.</Text>
        </View>
      ) : (
        stories.map((story, index) => (
          <FloatingFilm
            key={story.id}
            story={story}
            index={index}
            left={positions[index].left}
            top={positions[index].top}
            still={still}
            onPress={() => onPressStory(story)}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sky: { overflow: "hidden" },
  film: { position: "absolute", width: ORB + 36 },
  filmPress: { alignItems: "center" },
  halo: {
    position: "absolute",
    top: -14,
    width: ORB + 28,
    height: ORB + 28,
    borderRadius: (ORB + 28) / 2,
    backgroundColor: "rgba(212,175,106,0.16)",
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(233,217,184,0.6)",
    backgroundColor: colors.surfaceRaised,
  },
  cover: { width: "100%", height: "100%" },
  glint: { position: "absolute", left: 0, right: 0, top: 0, height: "45%" },
  title: {
    marginTop: 10,
    color: colors.text,
    fontSize: 16,
    lineHeight: 18,
    fontFamily: fonts.grimoire,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowRadius: 8,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 24, fontFamily: fonts.grimoire, textAlign: "center" },
  emptyText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
});
