import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../lib/theme";

/** A chapter-heading rule from an old book: the title between two hairlines that fade
 * outwards, each ending in a small diamond. */
export function GrimoireHeading({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <View style={styles.wrap} accessibilityRole="header">
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <View style={styles.row}>
        <View style={styles.line} />
        <Text style={styles.diamond}>◆</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.diamond}>◆</Text>
        <View style={styles.line} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, gap: 4, alignItems: "center" },
  eyebrow: { color: colors.accentMuted, fontSize: 10, letterSpacing: 3, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch" },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.accentMuted },
  diamond: { color: colors.accent, fontSize: 7 },
  title: { color: colors.text, fontSize: 22, fontFamily: fonts.grimoire, letterSpacing: 0.6, textAlign: "center" },
});
