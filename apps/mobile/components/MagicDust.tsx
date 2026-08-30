import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";

import { colors } from "../lib/theme";

const COUNT = 22;

type Speck = { left: number; top: number; size: number; duration: number; delay: number; gold: boolean };

// Deterministic scatter (not Math.random on every render) so specks don't
// relocate on re-render, but still look hand-sprinkled rather than gridded.
function makeSpeck(i: number): Speck {
  const rand = (n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    left: 2 + rand(1) * 96,
    // Concentrated around the card band (not the full heading-to-info
    // span), so the dust reads as clinging to the flying books rather than
    // filling the whole section.
    top: 8 + rand(2) * 82,
    size: 1.5 + rand(3) * 2.5,
    duration: 1400 + rand(4) * 1600,
    delay: rand(5) * 2000,
    gold: rand(6) > 0.25,
  };
}

function DustSpeck({ speck, reduceMotion }: { speck: Speck; reduceMotion: boolean }) {
  const twinkle = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, {
          toValue: 0.9,
          duration: speck.duration,
          delay: speck.delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(twinkle, {
          toValue: 0.1,
          duration: speck.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, speck, twinkle]);

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
          backgroundColor: speck.gold ? colors.accent : colors.text,
          opacity: reduceMotion ? 0.35 : twinkle,
        },
      ]}
    />
  );
}

/** Quiet magic dust around the flying-books carousel: small twinkling
 * specks, no comet heads, no trails, no wandering flight paths - just an
 * ambient shimmer that reads as highlighting the books rather than its own
 * animated cast of characters. */
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
