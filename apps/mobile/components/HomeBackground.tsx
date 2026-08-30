import { Animated, Image, StyleSheet, View, useWindowDimensions } from "react-native";

import { Scene3DBackground } from "./Scene3DBackground";
import { useAmbientDrift } from "../lib/use-ambient-drift";

const PHOTO_PARALLAX = 14;
const STAR_PARALLAX = 30;

/** Fixed backdrop behind the whole home screen: the user-supplied castle-
 * balcony illustration with a slow self-playing parallax drift (an ambient
 * stand-in for device-tilt parallax - reads immediately without physically
 * tilting the phone), a warm scrim underneath for text legibility, and the
 * existing twinkling starfield drifting further for a sense of depth. */
export function HomeBackground() {
  const { width, height } = useWindowDimensions();
  const drift = useAmbientDrift();

  const parallaxStyle = (depth: number) => ({
    transform: [
      { translateX: drift.x.interpolate({ inputRange: [-1, 1], outputRange: [-depth, depth] }) },
      { translateY: drift.y.interpolate({ inputRange: [-1, 1], outputRange: [-depth * 0.6, depth * 0.6] }) },
    ],
  });

  // Oversized on every edge by its own parallax depth, so drifting under
  // tilt never exposes a seam at the screen edge.
  const overscan = (depth: number) => ({
    width: width + depth * 2,
    height: height + depth * 2,
    marginLeft: -depth,
    marginTop: -depth,
  });

  return (
    <>
      <Animated.View
        style={[styles.layer, overscan(PHOTO_PARALLAX), parallaxStyle(PHOTO_PARALLAX)]}
        pointerEvents="none"
      >
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require("../assets/images/home-hero-bg.jpg")}
          style={styles.image}
          resizeMode="cover"
        />
      </Animated.View>

      <View style={styles.scrim} pointerEvents="none" />

      <Animated.View
        style={[styles.layer, overscan(STAR_PARALLAX), parallaxStyle(STAR_PARALLAX)]}
        pointerEvents="none"
      >
        <Scene3DBackground bookCount={0} starCount={140} starOpacity={0.9} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", top: 0, left: 0 },
  image: { width: "100%", height: "100%" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,14,10,0.38)" },
});
