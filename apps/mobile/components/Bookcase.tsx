import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { wood } from "../lib/theme";

/** The cabinet the shelves live in: a carved cornice on top, wooden posts down both sides
 * and a plinth at the bottom. The shelves themselves (LibraryShelf) are its children. */
export function Bookcase({ children }: { children: ReactNode }) {
  return (
    <View style={styles.case}>
      <View style={styles.cornice}>
        <LinearGradient colors={[wood.edge, wood.light, wood.mid]} style={StyleSheet.absoluteFill} />
        <View style={styles.corniceLine} />
        <Text style={styles.ornament}>◆ ✦ ◆</Text>
      </View>
      <View style={styles.body}>
        <LinearGradient colors={[wood.light, wood.mid, wood.dark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.post, styles.postLeft]} />
        <LinearGradient colors={[wood.dark, wood.mid, wood.light]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.post, styles.postRight]} />
        <View style={styles.shelves}>{children}</View>
      </View>
      <LinearGradient colors={[wood.light, wood.mid, wood.shadow]} style={styles.plinth} />
    </View>
  );
}

const POST = 9;

const styles = StyleSheet.create({
  case: {
    marginHorizontal: 12,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: wood.dark,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: wood.brassDim,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cornice: { height: 30, alignItems: "center", justifyContent: "center" },
  corniceLine: { position: "absolute", left: 0, right: 0, bottom: 0, height: 1, backgroundColor: "rgba(212,175,106,0.55)" },
  ornament: { color: wood.brass, fontSize: 9, letterSpacing: 6 },
  body: { paddingHorizontal: POST },
  post: { position: "absolute", top: 0, bottom: 0, width: POST },
  postLeft: { left: 0 },
  postRight: { right: 0 },
  shelves: { paddingTop: 20, paddingBottom: 6, gap: 26 },
  plinth: { height: 18 },
});
