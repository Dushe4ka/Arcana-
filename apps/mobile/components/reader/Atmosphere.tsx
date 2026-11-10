import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";

import type { StageView } from "../../lib/types";

type Kind = NonNullable<StageView["atmosphere"]>;

/** Per-effect particle recipe. Counts are intentionally low: this is a mood layer behind
 * the text, and every particle is a native-driver transform, so it costs nothing on the
 * JS thread once started. */
const RECIPES: Record<Kind, { count: number; color: string; size: [number, number]; duration: [number, number]; drift: number; shape: "dot" | "streak" | "petal"; rise?: boolean }> = {
  rain: { count: 26, color: "rgba(200,215,235,0.42)", size: [1, 2], duration: [650, 1100], drift: -30, shape: "streak" },
  snow: { count: 22, color: "rgba(255,255,255,0.8)", size: [2, 5], duration: [5200, 9000], drift: 40, shape: "dot" },
  dust: { count: 16, color: "rgba(243,226,190,0.5)", size: [1.5, 3.5], duration: [9000, 15000], drift: 30, shape: "dot", rise: true },
  sparkles: { count: 14, color: "rgba(212,175,106,0.9)", size: [2, 4], duration: [3600, 6400], drift: 20, shape: "dot", rise: true },
  petals: { count: 12, color: "rgba(222,160,170,0.85)", size: [6, 10], duration: [6000, 10000], drift: 90, shape: "petal" },
  fog: { count: 0, color: "", size: [0, 0], duration: [0, 0], drift: 0, shape: "dot" },
};

// Deterministic pseudo-random so particles do not jump to new places on every re-render.
function seeded(index: number, salt: number) {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function Particle({ kind, index, width, height }: { kind: Kind; index: number; width: number; height: number }) {
  const recipe = RECIPES[kind];
  const progress = useRef(new Animated.Value(0)).current;
  const spec = useMemo(() => {
    const size = recipe.size[0] + seeded(index, 1) * (recipe.size[1] - recipe.size[0]);
    return {
      x: seeded(index, 2) * width,
      size,
      duration: recipe.duration[0] + seeded(index, 3) * (recipe.duration[1] - recipe.duration[0]),
      delay: seeded(index, 4) * recipe.duration[1],
      drift: recipe.drift * (0.4 + seeded(index, 5)),
      peak: 0.35 + seeded(index, 6) * 0.65,
    };
  }, [index, recipe, width]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: spec.duration, easing: Easing.linear, useNativeDriver: true }),
    );
    const timer = setTimeout(() => loop.start(), spec.delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [progress, spec]);

  const travel = height + 60;
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: recipe.rise ? [height * 0.9, height * 0.15] : [-30, travel],
  });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, spec.drift] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, spec.peak, spec.peak, 0] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", recipe.shape === "petal" ? "320deg" : "0deg"] });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: spec.x,
        top: 0,
        width: recipe.shape === "streak" ? 1.5 : spec.size,
        height: recipe.shape === "streak" ? 26 : recipe.shape === "petal" ? spec.size * 0.62 : spec.size,
        borderRadius: spec.size,
        backgroundColor: recipe.color,
        opacity,
        transform: [{ translateX }, { translateY }, { rotate: recipe.shape === "streak" ? "8deg" : rotate }],
      }}
    />
  );
}

function Fog() {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 14000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 14000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);
  return (
    <>
      {[0.5, 0.68, 0.84].map((top, i) => (
        <Animated.View
          key={top}
          style={{
            position: "absolute",
            left: "-30%",
            width: "160%",
            top: `${top * 100}%`,
            height: "22%",
            borderRadius: 400,
            backgroundColor: "rgba(214,208,200,0.13)",
            transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [i % 2 ? 40 : -40, i % 2 ? -40 : 40] }) }],
          }}
        />
      ))}
    </>
  );
}

export function Atmosphere({ kind, reduceMotion }: { kind: StageView["atmosphere"]; reduceMotion: boolean }) {
  const { width, height } = useWindowDimensions();
  if (!kind || reduceMotion) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {kind === "fog" ? (
        <Fog />
      ) : (
        Array.from({ length: RECIPES[kind].count }, (_, i) => (
          <Particle key={`${kind}-${i}`} kind={kind} index={i} width={width} height={height} />
        ))
      )}
    </View>
  );
}
