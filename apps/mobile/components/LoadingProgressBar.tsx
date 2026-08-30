import { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "../lib/theme";

const SCALE_MAX = 10;

/** Fill tracks real boot work (see useBootProgress) on a 0-10 scale, not a
 * fake timer - shown to the user as a live 0-100% readout. */
export function LoadingProgressBar({ progress }: { progress: Animated.Value }) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const id = progress.addListener(({ value }) => setPercent(Math.round((value / SCALE_MAX) * 100)));
    return () => progress.removeListener(id);
  }, [progress]);

  const fillWidth = progress.interpolate({
    inputRange: [0, SCALE_MAX],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  return (
    <View
      style={styles.wrapper}
      accessibilityRole="progressbar"
      accessibilityLabel="Загрузка"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: fillWidth }]} />
      </View>
      <Text style={styles.percent}>{percent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    alignItems: "center",
    gap: 10,
  },
  track: {
    width: "100%",
    height: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
  },
  percent: {
    color: colors.textMuted,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
});
