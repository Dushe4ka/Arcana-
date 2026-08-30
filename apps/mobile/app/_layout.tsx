import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { LoadingScreen } from "../components/LoadingScreen";
import { useBootProgress } from "../lib/use-boot-progress";
import { colors } from "../lib/theme";

const DISMISS_DURATION = 380;

export default function RootLayout() {
  const { progress, ready } = useBootProgress();
  const [dismissing, setDismissing] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ready) return;
    setDismissing(true);
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: DISMISS_DURATION,
      useNativeDriver: true,
    }).start(() => setDismissing(false));
  }, [ready, overlayOpacity]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* Stack only mounts once ready, so its status-based redirects
          ((auth)/_layout, (app)/_layout, index) always see an already-
          resolved session instead of racing hydrate(). */}
      {ready && <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />}
      {(!ready || dismissing) && (
        <Animated.View
          style={ready ? [StyleSheet.absoluteFill, { opacity: overlayOpacity }] : styles.fill}
          pointerEvents={ready ? "none" : "auto"}
        >
          <LoadingScreen progress={progress} />
        </Animated.View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
