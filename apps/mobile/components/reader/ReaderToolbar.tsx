import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/theme";

export type ToolbarAction = "back" | "log" | "auto" | "skip" | "hide" | "settings";

const ITEMS: { action: ToolbarAction; label: string; hint: string }[] = [
  { action: "back", label: "Назад", hint: "Вернуться на одну реплику" },
  { action: "log", label: "Журнал", hint: "Прочитанные реплики" },
  { action: "auto", label: "Авто", hint: "Листать автоматически" },
  { action: "skip", label: "Пропуск", hint: "Быстро пролистать до выбора" },
  { action: "hide", label: "Скрыть", hint: "Убрать интерфейс и посмотреть сцену" },
  { action: "settings", label: "Настройки", hint: "Шрифт, скорость текста, звук" },
];

/** A single quiet row of text controls above the dialogue panel. Words, not icons: each
 * is self-explanatory at a glance and there is no icon font to ship. */
export function ReaderToolbar({
  onAction,
  active,
  disabled,
}: {
  onAction: (action: ToolbarAction) => void;
  active: Partial<Record<ToolbarAction, boolean>>;
  disabled: Partial<Record<ToolbarAction, boolean>>;
}) {
  return (
    <View style={styles.row} accessibilityRole="toolbar">
      {ITEMS.map((item) => {
        const isDisabled = Boolean(disabled[item.action]);
        const isActive = Boolean(active[item.action]);
        return (
          <Pressable
            key={item.action}
            onPress={() => onAction(item.action)}
            disabled={isDisabled}
            hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityHint={item.hint}
            accessibilityState={{ disabled: isDisabled, selected: isActive }}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Text style={[styles.label, isActive && styles.labelActive, isDisabled && styles.labelDisabled]}>
              {item.label}
            </Text>
            <View style={[styles.underline, isActive && styles.underlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  item: { alignItems: "center", minHeight: 30, justifyContent: "center" },
  pressed: { opacity: 0.6 },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.4,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowRadius: 6,
  },
  labelActive: { color: colors.accent },
  labelDisabled: { opacity: 0.35 },
  underline: { height: 1, alignSelf: "stretch", marginTop: 3, backgroundColor: "transparent" },
  underlineActive: { backgroundColor: colors.accent },
});
