import { StyleSheet, View, type ViewStyle } from "react-native";

/** A pool of warm light with a soft edge. React Native has no radial gradient, so the
 * falloff is built from concentric translucent discs - no hard rim on any platform. */
export function SoftGlow({ size, color = "212,175,106", strength = 0.05, style }: { size: number; color?: string; strength?: number; style?: ViewStyle }) {
  const steps = [1, 0.82, 0.64, 0.46, 0.28];
  return (
    <View pointerEvents="none" style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      {steps.map((step) => (
        <View
          key={step}
          style={[
            styles.disc,
            { width: size * step, height: size * step, borderRadius: (size * step) / 2, backgroundColor: `rgba(${color},${strength})` },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ disc: { position: "absolute" } });
