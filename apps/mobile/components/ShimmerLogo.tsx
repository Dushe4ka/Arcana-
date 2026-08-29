import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import logo from "../assets/images/arcana-logo.png";
const LOGO_ASPECT = 1429 / 172;

type Props = {
  width: number;
};

/** The ARCANA wordmark with a light-sweep shimmer looping across the gold
 * letters - a small, fixed-aspect asset, so the sweep's alignment never
 * depends on how the background photo happens to be cropped. */
export function ShimmerLogo({ width }: Props) {
  const height = width / LOGO_ASPECT;
  const sweepWidth = width * 0.55;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [progress]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -sweepWidth + progress.value * (width + sweepWidth) }],
  }));

  return (
    <View style={{ width, height }}>
      <MaskedView
        style={{ width, height }}
        maskElement={<Image source={logo} style={{ width, height }} resizeMode="contain" />}
      >
        <Image source={logo} style={{ width, height }} resizeMode="contain" />
        <Animated.View style={[styles.sweep, { width: sweepWidth, height }, sweepStyle]}>
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
