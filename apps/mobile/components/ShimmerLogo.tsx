import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

import logo from "../assets/images/arcana-logo.png";
const LOGO_ASPECT = 1429 / 172;

type Props = {
  width: number;
};

/** The ARCANA wordmark with a light-sweep shimmer looping across the gold
 * letters - a small, fixed-aspect asset, so the sweep's alignment never
 * depends on how the background photo happens to be cropped. Uses the core
 * RN Animated API (not react-native-reanimated) - no extra native module to
 * version-match against whatever build of Expo Go the device happens to run. */
export function ShimmerLogo({ width }: Props) {
  const height = width / LOGO_ASPECT;
  const sweepWidth = width * 0.55;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 3200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-sweepWidth, width + sweepWidth],
  });

  return (
    <View style={{ width, height }}>
      <MaskedView
        style={{ width, height }}
        maskElement={<Image source={logo} style={{ width, height }} resizeMode="contain" />}
      >
        <Image source={logo} style={{ width, height }} resizeMode="contain" />
        <Animated.View style={[styles.sweep, { width: sweepWidth, height, transform: [{ translateX }] }]}>
          <LinearGradient
            colors={["transparent", "rgba(255,250,230,0.95)", "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  sweep: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});
