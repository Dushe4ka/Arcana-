import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

/** A slow, continuous back-and-forth drift on both axes, normalized to the
 * same -1..1 range as useTiltParallax - a self-playing stand-in for
 * device-tilt parallax so the effect reads immediately without physically
 * tilting the phone. Different periods per axis (7s/9s) trace a lazy
 * Lissajous-ish path instead of a mechanical diagonal wobble. */
export function useAmbientDrift(enabled = true) {
  const drift = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Motion-sensitive users get a still background instead of a
    // perpetually drifting one.
    if (!enabled || reduceMotion) return;

    const wobble = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(value, { toValue: -1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        // Without this, Animated.loop snaps the value back to its pre-loop
        // start (0) at the top of every iteration before animating again -
        // the "jumps to the starting point" the reference build was doing.
        { resetBeforeIteration: false },
      );

    const loopX = wobble(drift.x, 7000);
    const loopY = wobble(drift.y, 9000);
    loopX.start();
    loopY.start();
    return () => {
      loopX.stop();
      loopY.stop();
    };
  }, [enabled, reduceMotion, drift]);

  return drift;
}
