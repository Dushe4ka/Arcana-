import { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Platform } from "react-native";

/** Whether the software keyboard is currently showing. Uses the "will" events
 * on iOS (fire before the keyboard animates in/out, matching its timing) and
 * falls back to "did" events on Android, which doesn't emit "will". */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return visible;
}

/** Animated bottom padding that tracks the keyboard's own show/hide animation
 * on iOS - driven by the same "will" events, using the real height and
 * duration iOS reports, so it can't drift out of sync with the keyboard (the
 * mismatch that made content visibly snap into place after hiding). Android
 * already resizes the window itself (windowSoftInputMode), so this stays 0
 * there rather than double-padding. */
export function useKeyboardPadding(): Animated.Value {
  const padding = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    const showSub = Keyboard.addListener("keyboardWillShow", (e) => {
      Animated.timing(padding, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener("keyboardWillHide", (e) => {
      Animated.timing(padding, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [padding]);

  return padding;
}
