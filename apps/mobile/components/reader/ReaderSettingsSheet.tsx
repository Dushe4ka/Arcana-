import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AUTO_TAP_OPTIONS, FONT_SCALES, TEXT_SPEEDS, useReaderSettings } from "../../lib/reader-settings";
import { colors, fonts, radius } from "../../lib/theme";

function Segments<T extends number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]} numberOfLines={1} adjustsFontSizeToFit>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const LEVELS = [0, 0.25, 0.5, 0.75, 1];

/** A five-step level control: large touch targets, no slider dependency. */
function Level({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <View style={styles.levelRow} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: `${Math.round(value * 100)}%` }}>
      {LEVELS.map((level) => (
        <Pressable key={level} onPress={() => onChange(level)} hitSlop={8} style={styles.levelHit}>
          <View style={[styles.levelBar, { height: 8 + level * 18 }, level <= value + 0.001 && level > 0 && styles.levelBarOn, level === 0 && styles.levelZero, level === 0 && value === 0 && styles.levelZeroOn]} />
        </Pressable>
      ))}
      <Text style={styles.levelValue}>{value === 0 ? "выкл" : `${Math.round(value * 100)}%`}</Text>
    </View>
  );
}

export function ReaderSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const settings = useReaderSettings();
  const sample = "Он улыбнулся — так, будто знал её ответ заранее.";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Закрыть настройки" />
      <SafeAreaView style={styles.sheet} edges={["bottom"]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={styles.title}>Настройки чтения</Text>
          <Pressable onPress={onClose} hitSlop={16} accessibilityRole="button">
            <Text style={styles.done}>Готово</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.preview, { backgroundColor: `rgba(20,16,13,${settings.boxOpacity})` }]}>
            <Text style={{ color: colors.text, fontSize: 16 * settings.fontScale, lineHeight: 23 * settings.fontScale }}>
              {sample}
            </Text>
          </View>

          <Text style={styles.section}>Размер текста</Text>
          <Segments label="Размер текста" options={FONT_SCALES} value={settings.fontScale as (typeof FONT_SCALES)[number]["value"]} onChange={(fontScale) => settings.update({ fontScale })} />

          <Text style={styles.section}>Скорость появления текста</Text>
          <Segments label="Скорость появления текста" options={TEXT_SPEEDS} value={settings.textSpeed as (typeof TEXT_SPEEDS)[number]["value"]} onChange={(textSpeed) => settings.update({ textSpeed })} />

          <Text style={styles.section}>Таймер автоклика</Text>
          <Segments
            label="Таймер автоклика"
            options={AUTO_TAP_OPTIONS}
            value={settings.autoTapSeconds as (typeof AUTO_TAP_OPTIONS)[number]["value"]}
            onChange={(autoTapSeconds) => settings.update({ autoTapSeconds })}
          />
          <Text style={styles.note}>
            {settings.autoTapSeconds === 0
              ? "«Авто» само подбирает паузу по длине реплики и средней скорости чтения: короткие фразы сменяются быстро, длинные остаются на экране дольше."
              : `Каждая реплика будет сменяться через ${settings.autoTapSeconds} с после того, как появится целиком.`}
          </Text>

          <Text style={styles.section}>Плотность панели текста</Text>
          <Segments
            label="Плотность панели текста"
            options={[
              { value: 0.6, label: "Лёгкая" },
              { value: 0.9, label: "Обычная" },
              { value: 1, label: "Сплошная" },
            ]}
            value={settings.boxOpacity}
            onChange={(boxOpacity) => settings.update({ boxOpacity })}
          />

          <Text style={styles.section}>Музыка</Text>
          <Level label="Громкость музыки" value={settings.musicVolume} onChange={(musicVolume) => settings.update({ musicVolume })} />
          <Text style={styles.section}>Звуки</Text>
          <Level label="Громкость звуков" value={settings.sfxVolume} onChange={(sfxVolume) => settings.update({ sfxVolume })} />

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Меньше движения</Text>
              <Text style={styles.switchHint}>Без покачивания персонажей, частиц, движения камеры и тряски. Экономит заряд.</Text>
            </View>
            <Switch
              value={settings.reduceMotion}
              onValueChange={(reduceMotion) => settings.update({ reduceMotion })}
              trackColor={{ true: colors.accentMuted, false: colors.border }}
              thumbColor={settings.reduceMotion ? colors.accent : colors.textMuted}
            />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchLabel}>Вибрация</Text>
              <Text style={styles.switchHint}>Короткий отклик в напряжённые моменты.</Text>
            </View>
            <Switch
              value={settings.vibration}
              onValueChange={(vibration) => settings.update({ vibration })}
              trackColor={{ true: colors.accentMuted, false: colors.border }}
              thumbColor={settings.vibration ? colors.accent : colors.textMuted}
            />
          </View>

          <Pressable onPress={settings.reset} style={styles.reset} hitSlop={10} accessibilityRole="button">
            <Text style={styles.resetText}>Вернуть настройки по умолчанию</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    maxHeight: "82%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentMuted,
  },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 24, paddingTop: 14, paddingBottom: 6 },
  title: { color: colors.text, fontSize: 20, fontFamily: fonts.displaySemiBold },
  done: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  body: { paddingHorizontal: 24, paddingBottom: 28, gap: 10 },
  preview: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16, marginTop: 10 },
  section: { color: colors.textMuted, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 14 },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  segments: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
  },
  segmentSelected: { borderColor: colors.accent, backgroundColor: "rgba(212,175,106,0.12)" },
  segmentText: { color: colors.textMuted, fontSize: 13 },
  segmentTextSelected: { color: colors.accent, fontWeight: "600" },
  levelRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, minHeight: 44 },
  levelHit: { width: 40, height: 44, alignItems: "center", justifyContent: "flex-end" },
  levelBar: { width: 22, borderRadius: 3, backgroundColor: colors.border },
  levelBarOn: { backgroundColor: colors.accent },
  levelZero: { height: 4, backgroundColor: colors.border },
  levelZeroOn: { backgroundColor: colors.danger },
  levelValue: { color: colors.textMuted, fontSize: 13, marginLeft: 6, marginBottom: 2, minWidth: 44 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 16 },
  switchText: { flex: 1, gap: 2 },
  switchLabel: { color: colors.text, fontSize: 15 },
  switchHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  reset: { marginTop: 22, alignSelf: "center", minHeight: 44, justifyContent: "center" },
  resetText: { color: colors.textMuted, fontSize: 13, textDecorationLine: "underline" },
});
