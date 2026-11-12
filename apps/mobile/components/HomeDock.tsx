import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BeanIcon } from "./ResourceIcons";
import { CARD_BACK } from "../lib/tarot";
import { colors } from "../lib/theme";

/** Two things always within reach on the home screen: the fortune deck rising from the
 * bottom edge as a half-circle, and a small coffee-bean button for earning beans. */
export function HomeDock() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.dock} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push("/(app)/tarot")}
        accessibilityRole="button"
        accessibilityLabel="Заглянуть в будущее: вытянуть карты"
        style={({ pressed }) => [styles.arch, { height: 58 + insets.bottom, paddingBottom: insets.bottom }, pressed && styles.pressed]}
      >
        <Image source={CARD_BACK} style={styles.card} />
      </Pressable>

      <Pressable
        onPress={() =>
          Alert.alert(
            "Зёрна за просмотр",
            "Скоро здесь можно будет посмотреть короткий ролик и получить кофейные зёрна. Показ рекламы ещё не подключён.",
          )
        }
        accessibilityRole="button"
        accessibilityLabel="Получить зёрна за просмотр рекламы"
        style={({ pressed }) => [styles.bean, { bottom: 14 + insets.bottom }, pressed && styles.pressed]}
      >
        <BeanIcon size={22} />
        <View style={styles.plus}>
          <Text style={styles.plusText}>+</Text>
        </View>
      </Pressable>
    </View>
  );
}

const ARCH = 108;

const styles = StyleSheet.create({
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  pressed: { opacity: 0.8 },
  // The top half of a circle, resting on the bottom edge of the screen.
  arch: {
    width: ARCH,
    borderTopLeftRadius: ARCH / 2,
    borderTopRightRadius: ARCH / 2,
    backgroundColor: "rgba(26,20,15,0.92)",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  card: {
    width: 34,
    height: 60,
    borderRadius: 4,
    marginBottom: -14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(212,175,106,0.8)",
    transform: [{ rotate: "-7deg" }],
  },
  bean: {
    position: "absolute",
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(26,20,15,0.92)",
    borderWidth: 1,
    borderColor: colors.accentMuted,
    elevation: 10,
  },
  plus: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  plusText: { color: "#1a1613", fontSize: 14, lineHeight: 16, fontWeight: "700" },
});
