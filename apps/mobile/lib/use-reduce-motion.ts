import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** True when the system "reduce motion" setting is on - decorative loops stay still. */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);
  return reduceMotion;
}
