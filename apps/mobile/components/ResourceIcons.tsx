import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

/** A coffee bean, drawn with views: a tilted oval with the crease down its middle. */
export function BeanIcon({ size = 16, color = "#b98a5a", crease = "#3a2718" }: { size?: number; color?: string; crease?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size * 0.68,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          transform: [{ rotate: "28deg" }],
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <View style={{ width: Math.max(1.2, size * 0.1), height: size * 0.86, borderRadius: size, backgroundColor: crease, transform: [{ rotate: "9deg" }] }} />
      </View>
    </View>
  );
}

/** A small tarot card: gold outline with a star at its heart. */
export function CardIcon({ size = 16, color = "#d4af6a" }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={[styles.card, { width: size * 0.66, height: size * 0.96, borderColor: color, borderRadius: size * 0.14 }]}>
        <View style={{ width: size * 0.2, height: size * 0.2, backgroundColor: color, transform: [{ rotate: "45deg" }] }} />
      </View>
    </View>
  );
}

export function KeyIcon({ size = 16, color = "#e9d9b8" }: { size?: number; color?: string }) {
  return <Ionicons name="key" size={size} color={color} />;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.4, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
});
