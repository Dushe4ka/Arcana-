import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";
import { DeviceMotion } from "expo-sensors";

/** Tracks device tilt and returns a normalized (-1..1) x/y pair, smoothed so
 * the value drifts rather than jitters. Layers multiply it by their own depth
 * factor to get a parallax effect: nearer layers move more than farther ones.
 *
 * Falls back to a resting value of 0,0 wherever motion data is unavailable
 * (permission denied, simulator, no sensor), so callers never have to branch. */
export function useTiltParallax(enabled = true) {
  const tilt = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Motion-sensitive users get a still background rather than one that
    // drifts under every hand tremor.
    if (!enabled || reduceMotion) return;
    let subscription: { remove: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const available = await DeviceMotion.isAvailableAsync().catch(() => false);
      if (!available || cancelled) return;

      DeviceMotion.setUpdateInterval(60);
      subscription = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation) return;
        // gamma = left/right tilt, beta = front/back tilt. Clamp to a small
        // comfortable range so resting hand-held wobble maps to most of it.
        const x = Math.max(-1, Math.min(1, rotation.gamma / 0.6));
        const y = Math.max(-1, Math.min(1, (rotation.beta - 0.6) / 0.6));
        Animated.timing(tilt, {
          toValue: { x, y },
          duration: 180,
          useNativeDriver: true,
        }).start();
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, reduceMotion, tilt]);

  return tilt;
}
