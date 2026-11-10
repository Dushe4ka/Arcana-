import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiRequest, ApiError } from "../../lib/api";
import { t } from "../../lib/locale";
import { colors, fonts } from "../../lib/theme";
import type { HistoryEntry } from "../../lib/types";

/** Everything this playthrough has shown so far, oldest first, opened at the newest line. */
export function DialogueLog({
  slotId,
  visible,
  fontScale,
  onClose,
}: {
  slotId: string;
  visible: boolean;
  fontScale: number;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    setEntries(null);
    setError(null);
    apiRequest<HistoryEntry[]>(`/play/save-slots/${slotId}/history`)
      .then(setEntries)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить журнал"));
  }, [visible, slotId]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <Text style={styles.title}>Журнал</Text>
            <Pressable onPress={onClose} hitSlop={16} accessibilityRole="button" accessibilityLabel="Закрыть журнал">
              <Text style={styles.close}>Закрыть</Text>
            </Pressable>
          </View>
          {error ? (
            <Text style={styles.empty}>{error}</Text>
          ) : entries === null ? (
            <ActivityIndicator color={colors.accent} style={styles.loader} />
          ) : entries.length === 0 ? (
            <Text style={styles.empty}>Здесь появятся реплики, которые вы уже прочитали.</Text>
          ) : (
            <ScrollView
              ref={scroll}
              contentContainerStyle={styles.list}
              onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
            >
              {entries.map((entry, index) =>
                entry.type === "CHOICE" ? (
                  <View key={`${entry.nodeId}-${index}`} style={styles.choice}>
                    <Text style={styles.choiceLabel}>Ваш выбор</Text>
                    <Text style={[styles.choiceText, { fontSize: 15 * fontScale }]}>{t(entry.text)}</Text>
                  </View>
                ) : (
                  <View key={`${entry.nodeId}-${index}`} style={styles.line}>
                    {entry.speaker ? (
                      <Text style={[styles.speaker, { color: entry.speaker.nameColor }]}>{t(entry.speaker.name)}</Text>
                    ) : null}
                    <Text
                      style={[
                        styles.text,
                        { fontSize: 15 * fontScale, lineHeight: 22 * fontScale },
                        entry.isThought && styles.thought,
                      ]}
                    >
                      {t(entry.text)}
                    </Text>
                  </View>
                ),
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(16,13,11,0.96)" },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 22, fontFamily: fonts.displaySemiBold },
  close: { color: colors.accent, fontSize: 15 },
  loader: { marginTop: 48 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 48, paddingHorizontal: 32, fontSize: 15, lineHeight: 22 },
  list: { paddingHorizontal: 24, paddingVertical: 20, gap: 18 },
  line: { gap: 4 },
  speaker: { fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  text: { color: colors.text },
  thought: { fontStyle: "italic", color: colors.textMuted },
  choice: { borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: 12, gap: 2 },
  choiceLabel: { color: colors.accentMuted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  choiceText: { color: colors.accent },
});
