import { Animated, Image, StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import heroImage from "../assets/images/login-hero.jpg";
import { LoadingOrbit } from "./LoadingOrbit";
import { LoadingProgressBar } from "./LoadingProgressBar";
import { ShimmerLogo } from "./ShimmerLogo";
import { colors } from "../lib/theme";

// Same photo, same framing math as the login screen (HERO_ASPECT,
// heroHeight, gradient stops, logo position) - this screen is meant to read
// as the exact same brand moment, just without the form.
const HERO_ASPECT = 1152 / 1536;
const LOGO_TOP_FRACTION = 0.82;
// Nudges the wordmark down a bit further than the login screen's copy of
// this layout - loading-screen-only, not shared with login.tsx.
const LOGO_TOP_NUDGE = 20;

/** App-boot screen shown while useBootProgress() restores the session and
 * warms the login screen's own assets. No inputs, no 3D scene (see
 * LoadingOrbit for why) - just the brand photo, the wordmark, the orbiting
 * stars, and a real progress readout. */
// ShimmerLogo's own fixed aspect ratio (see that component) - needed here to
// find its bottom edge so the orbit can be centered below it precisely.
const LOGO_ASPECT = 1429 / 172;
// Approximate height of the progress bar's own content (track + gap + %
// label) - needed to find its top edge from the other side.
const BAR_CONTENT_HEIGHT = 30;

export function LoadingScreen({ progress }: { progress: Animated.Value }) {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const heroHeight = screenWidth / HERO_ASPECT;
  const logoWidth = screenWidth * 0.78;
  const logoTop = insets.top + heroHeight * LOGO_TOP_FRACTION - 14 + LOGO_TOP_NUDGE;
  const logoBottom = logoTop + logoWidth / LOGO_ASPECT;
  const barTopFromBottom = insets.bottom + 20 + BAR_CONTENT_HEIGHT;

  return (
    <View style={styles.flex}>
      <View style={[styles.heroLayer, { height: heroHeight }]}>
        <Image source={heroImage} style={styles.heroImage} resizeMode="cover" />
      </View>

      <LinearGradient
        colors={[
          "transparent",
          colors.background + "00",
          colors.background + "01",
          colors.background + "04",
          colors.background + "09",
          colors.background + "10",
          colors.background + "1a",
          colors.background + "27",
          colors.background + "36",
          colors.background + "46",
          colors.background + "58",
          colors.background + "6c",
          colors.background + "80",
          colors.background + "93",
          colors.background + "a7",
          colors.background + "b9",
          colors.background + "c9",
          colors.background + "d8",
          colors.background + "e5",
          colors.background + "ef",
          colors.background + "f6",
          colors.background + "fb",
          colors.background + "fe",
          colors.background,
          colors.background,
        ]}
        locations={[
          0, 0.042, 0.083, 0.125, 0.167, 0.208, 0.25, 0.292, 0.333, 0.375, 0.417, 0.458, 0.5,
          0.542, 0.583, 0.625, 0.667, 0.708, 0.75, 0.792, 0.833, 0.875, 0.917, 0.958, 1,
        ]}
        style={[styles.fade, { top: heroHeight * 0.42, height: heroHeight * 0.72 }]}
        pointerEvents="none"
      />

      <View style={[styles.logoWrap, { top: logoTop }]} pointerEvents="none">
        <ShimmerLogo width={screenWidth * 0.78} />
      </View>

      <View style={[styles.orbitWrap, { top: logoBottom, bottom: barTopFromBottom }]} pointerEvents="none">
        <LoadingOrbit />
      </View>

      {/* Same paddingBottom the login screen's "Войти" button sits on
          (insets.bottom + 20 there) - same slot, same resting place. */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <LoadingProgressBar progress={progress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  heroLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  logoWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  orbitWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 32,
  },
});
