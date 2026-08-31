import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";

import { colors } from "../lib/theme";

const COUNT = 42;

type Speck = {
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  gold: boolean;
  bright: boolean;
};

// Deterministic scatter (not Math.random on every render) so specks don't
// relocate on re-render, but still look hand-sprinkled rather than gridded.
function makeSpeck(i: number): Speck {
  const rand = (n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  // A minority of "bright" motes - bigger, glowing, catching the light -
  // mixed with many small quiet ones, the way dust only really shows up
  // where a flashlight beam actually hits it.
  const bright = rand(7) > 0.76;
  return {
    left: 2 + rand(1) * 96,
    // Concentrated around the card band (not the full heading-to-info
    // span), so the dust reads as clinging to the flying books rather than
    // filling the whole section.
    top: 6 + rand(2) * 84,
    size: bright ? 3 + rand(3) * 3.5 : 1.2 + rand(3) * 1.8,
    duration: 1200 + rand(4) * 1800,
    delay: rand(5) * 2400,
    gold: rand(6) > 0.2,
    bright,
  };
}

function DustSpeck({ speck, reduceMotion }: { speck: Speck; reduceMotion: boolean }) {
  const peak = speck.bright ? 1 : 0.6;
  const twinkle = useRef(new Animated.Value(peak * 0.2)).current;
  const color = speck.gold ? colors.accent : colors.text;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, {
          toValue: peak,
          duration: speck.duration,
          delay: speck.delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(twinkle, {
          toValue: peak * 0.15,
          duration: speck.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, speck, twinkle, peak]);

  return (
    <Animated.View
      style={[
        styles.speck,
        {
          left: `${speck.left}%`,
          top: `${speck.top}%`,
          width: speck.size,
          height: speck.size,
          borderRadius: speck.size,
          backgroundColor: color,
          opacity: reduceMotion ? peak * 0.5 : twinkle,
        },
        speck.bright && {
          shadowColor: color,
          shadowOpacity: 0.9,
          shadowRadius: speck.size * 1.8,
          shadowOffset: { width: 0, height: 0 },
        },
      ]}
    />
  );
}

/** Magic dust around the flying-books carousel: many small twinkling
 * specks, a handful bigger and glowing - the "flashlight through the dark"
 * look, where most dust stays faint and only a few motes really catch the
 * light. No comet heads, no trails, no wandering flight paths. */
export function MagicDust() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const specks = useRef(Array.from({ length: COUNT }, (_, i) => makeSpeck(i))).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {specks.map((speck, i) => (
        <DustSpeck key={i} speck={speck} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  speck: {
    position: "absolute",
  },
});
