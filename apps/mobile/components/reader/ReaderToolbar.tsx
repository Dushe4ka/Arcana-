import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/theme";

export type ToolbarAction = "exit" | "back" | "log" | "auto" | "skip" | "hide" | "settings";
export type SkipMode = "off" | "fast" | "veryFast";

/** The reader's menu. It is not on screen while reading: a tap on the upper part of the
 * screen brings it in at about the height of the character's head, and it leaves again on
 * its own. Words, not icons: each control explains itself and there is no icon font to ship. */
export function ReaderToolbar({
  onAction,
  auto,
  skip,
  canGoBack,
  canAutoplay,
}: {
  onAction: (action: ToolbarAction) => void;
  auto: boolean;
  skip: SkipMode;
  canGoBack: boolean;
  canAutoplay: boolean;
}) {
  const items: { action: ToolbarAction; label: string; hint: string; active?: boolean; disabled?: boolean }[] = [
    { action: "exit", label: "Выйти", hint: "Выйти из главы. Прогресс сохранён" },
    { action: "back", label: "Назад", hint: "Вернуться на одну реплику", disabled: !canGoBack },
    { action: "log", label: "Журнал", hint: "Прочитанные реплики" },
    { action: "auto", label: "Автоклик", hint: "Экран листается сам", active: auto, disabled: !canAutoplay },
    {
      action: "skip",
      label: skip === "veryFast" ? "Перемотка ×2" : "Перемотка",
      hint: "Перемотка: быстро, затем очень быстро, затем выключить",
      active: skip !== "off",
      disabled: !canAutoplay,
    },
    { action: "hide", label: "Скрыть", hint: "Убрать интерфейс и посмотреть сцену" },
    { action: "settings", label: "Настройки", hint: "Шрифт, скорость текста, автоклик, звук" },
  ];
  return (
    <View style={styles.row} accessibilityRole="toolbar">
      {items.map((item) => (
        <Pressable
          key={item.action}
          onPress={() => onAction(item.action)}
          disabled={item.disabled}
          hitSlop={{ top: 12, bottom: 12, left: 2, right: 2 }}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityHint={item.hint}
          accessibilityState={{ disabled: Boolean(item.disabled), selected: Boolean(item.active) }}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <Text
            style={[styles.label, item.active && styles.labelActive, item.disabled && styles.labelDisabled]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
          <View style={[styles.underline, item.active && styles.underlineActive]} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: 16,
    rowGap: 6,
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(20,16,13,0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentMuted,
  },
  item: { alignItems: "center", minHeight: 36, justifyContent: "center" },
  pressed: { opacity: 0.6 },
  label: {
    color: colors.text,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  labelActive: { color: colors.accent },
  labelDisabled: { opacity: 0.35 },
  underline: { height: 1, alignSelf: "stretch", marginTop: 3, backgroundColor: "transparent" },
  underlineActive: { backgroundColor: colors.accent },
});
