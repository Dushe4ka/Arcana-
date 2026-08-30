import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { colors } from "../lib/theme";

const COUNT = 6;
const BASE_RADIUS = 22;
const SCATTER_RADIUS = 64;
const SPIN_DURATION = 5200;
const SCATTER_CYCLE = [
  { toValue: 0, duration: 0 },
  { toValue: 1, duration: 550 },
  { toValue: 1, duration: 350 },
  { toValue: 0, duration: 550 },
  { toValue: 0, duration: 500 },
] as const;

/** One star riding a rotating pivot at a fixed radius - rotating the parent
 * sweeps it around a circle without needing sin/cos. `scatter` (shared
 * across all stars) grows that radius so the whole ring periodically bursts
 * outward and pulls back in; because each star sits at a different angle
 * already, "further along its own radius" reads as "flies off in its own
 * direction" without needing a second, independent animation per star. */
function OrbitStar({ index, rotation, scatter }: { index: number; rotation: Animated.Value; scatter: Animated.Value }) {
  const baseAngle = `${(360 / COUNT) * index}deg`;
  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const radius = scatter.interpolate({ inputRange: [0, 1], outputRange: [BASE_RADIUS, SCATTER_RADIUS] });

  return (
    <Animated.View style={[styles.pivot, { transform: [{ rotate: baseAngle }, { rotate: spin }] }]}>
      <Animated.View style={{ transform: [{ translateX: radius }] }}>
        <View style={styles.tangent}>
          <LinearGradient
            colors={["transparent", colors.accent + "b0"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.tail}
          />
          <View style={styles.head} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** The loading screen's centerpiece: a ring of comet-tailed stars circling a
 * fixed point, periodically bursting outward and gathering back in. Plain RN
 * Animated (rotate/translateX/opacity only, all native-driver-safe) - no
 * three.js/expo-gl, since this renders on the very first screen at cold
 * start and that GL stack was the root cause of the startup crashes fixed
 * earlier in this project. */
export function LoadingOrbit({ size = 140 }: { size?: number }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const scatter = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    const spinLoop = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: SPIN_DURATION, easing: Easing.linear, useNativeDriver: true }),
    );
    const scatterLoop = Animated.loop(
      Animated.sequence(
        SCATTER_CYCLE.map(({ toValue, duration }) =>
          Animated.timing(scatter, { toValue, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ),
      ),
    );
    spinLoop.start();
    scatterLoop.start();
    return () => {
      spinLoop.stop();
      scatterLoop.stop();
    };
  }, [reduceMotion, rotation, scatter]);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
      {reduceMotion ? (
        <View style={styles.head} />
      ) : (
        Array.from({ length: COUNT }, (_, i) => (
          <OrbitStar key={i} index={i} rotation={rotation} scatter={scatter} />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pivot: {
    position: "absolute",
  },
  tangent: {
    width: 26,
    height: 2,
    transform: [{ rotate: "90deg" }],
    alignItems: "flex-end",
  },
  tail: {
    position: "absolute",
    right: 2,
    top: -1,
    width: 22,
    height: 2,
    borderRadius: 1,
  },
  head: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
