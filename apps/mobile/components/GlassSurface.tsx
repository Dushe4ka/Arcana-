import type { PropsWithChildren } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tintColor?: string;
}>;

/** "Liquid glass" surface: a real native blur behind a warm translucent tint,
 * with a bright top rim to catch the light the way frosted glass does -
 * replaces the flat semi-transparent Views used for pills/cards before
 * expo-blur was added. Radius/size/padding come from the caller's `style`. */
export function GlassSurface({ style, intensity = 45, tintColor = "rgba(36,28,22,0.4)", children }: Props) {
  return (
    <View style={[styles.clip, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tintColor }]} />
      <View style={styles.rim} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  rim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
});
