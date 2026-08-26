import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../components/Button";
import { apiRequest, ApiError } from "../../lib/api";
import { t } from "../../lib/locale";
import { colors, radius } from "../../lib/theme";
import type { PlayView, StagedCharacterView } from "../../lib/types";

export default function ReadingScreen() {
  const { slotId } = useLocalSearchParams<{ slotId: string }>();
  const [view, setView] = useState<PlayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiRequest<PlayView>(`/play/save-slots/${slotId}`);
      setView(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить сцену");
    }
  }, [slotId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const advance = async () => {
    if (view?.type !== "DIALOGUE" || !view.canAdvance || busy) return;
    setBusy(true);
    try {
      const data = await apiRequest<PlayView>(`/play/save-slots/${slotId}/advance`, { method: "POST" });
      setView(data);
    } catch (err) {
      Alert.alert("Ошибка", err instanceof ApiError ? err.message : "Попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  };

  const choose = async (choiceOptionId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await apiRequest<PlayView>(`/play/save-slots/${slotId}/choice`, {
        method: "POST",
        body: JSON.stringify({ choiceOptionId }),
      });
      setView(data);
    } catch (err) {
      Alert.alert("Не получилось", err instanceof ApiError ? err.message : "Попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (error || !view) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.errorText}>{error ?? "Сцена не найдена"}</Text>
        <Button title="Назад" onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  const background =
    view.type === "DIALOGUE" && view.backgroundImageUrl ? view.backgroundImageUrl : undefined;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: false }} />
      <ImageBackground
        source={background ? { uri: background } : undefined}
        style={styles.background}
        imageStyle={styles.backgroundImage}
      >
        <View style={styles.scrim} />

        {view.type !== "END" && (
          <View style={styles.stage} pointerEvents="none">
            {view.type === "DIALOGUE" &&
              view.staged.map((s) => <StagedSprite key={s.characterId} staged={s} />)}
          </View>
        )}

        <SafeAreaView style={styles.foreground} edges={["bottom"]}>
          {view.type === "DIALOGUE" && (
            <Pressable style={styles.tapArea} onPress={advance} disabled={!view.canAdvance || busy}>
              <DialogueBox view={view} busy={busy} />
            </Pressable>
          )}

          {view.type === "CHOICE" && <ChoicePanel view={view} busy={busy} onChoose={choose} />}

          {view.type === "END" && (
            <View style={styles.endPanel}>
              <Text style={styles.endTitle}>Конец главы</Text>
              <Button title="К списку глав" onPress={() => router.back()} />
            </View>
          )}
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

function StagedSprite({ staged }: { staged: StagedCharacterView }) {
  if (!staged.spriteUrl) return null;
  return (
    <ImageBackground
      source={{ uri: staged.spriteUrl }}
      style={[
        styles.sprite,
        staged.position === "left" && styles.spriteLeft,
        staged.position === "center" && styles.spriteCenter,
        staged.position === "right" && styles.spriteRight,
      ]}
      resizeMode="contain"
    />
  );
}

function DialogueBox({
  view,
  busy,
}: {
  view: Extract<PlayView, { type: "DIALOGUE" }>;
  busy: boolean;
}) {
  return (
    <View style={[styles.dialogueBox, view.isThought && styles.thoughtBox]}>
      {view.speaker ? (
        <Text style={[styles.speakerName, { color: view.speaker.nameColor }]}>{t(view.speaker.name)}</Text>
      ) : null}
      <Text style={[styles.dialogueText, view.isThought && styles.thoughtText]}>{t(view.text)}</Text>
      {view.canAdvance && !busy ? <Text style={styles.advanceHint}>▼ нажмите, чтобы продолжить</Text> : null}
    </View>
  );
}

function ChoicePanel({
  view,
  busy,
  onChoose,
}: {
  view: Extract<PlayView, { type: "CHOICE" }>;
  busy: boolean;
  onChoose: (id: string) => void;
}) {
  return (
    <View style={styles.choicePanel}>
      {view.prompt ? <Text style={styles.choicePrompt}>{t(view.prompt)}</Text> : null}
      {view.options.map((option) => (
        <Pressable
          key={option.id}
          onPress={() => onChoose(option.id)}
          disabled={busy || !option.affordable}
          style={({ pressed }) => [
            styles.choiceOption,
            !option.affordable && styles.choiceOptionDisabled,
            pressed && option.affordable && styles.choiceOptionPressed,
          ]}
        >
          <Text style={styles.choiceOptionText}>{t(option.text)}</Text>
          {option.costCurrency ? (
            <Text style={styles.choiceOptionCost}>
              {option.costCurrency === "HARD" ? "💎" : "🪙"} {option.costAmount}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 16,
    padding: 24,
  },
  errorText: { color: colors.danger, textAlign: "center", fontSize: 15 },
  background: { flex: 1, backgroundColor: "#0a0812" },
  backgroundImage: { resizeMode: "cover" },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(10,8,18,0.25)" },
  stage: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingBottom: 20,
  },
  sprite: { width: "34%", height: "78%" },
  spriteLeft: { alignSelf: "flex-start" },
  spriteCenter: { alignSelf: "center" },
  spriteRight: { alignSelf: "flex-end" },
  foreground: { justifyContent: "flex-end" },
  tapArea: { paddingHorizontal: 16, paddingBottom: 16 },
  dialogueBox: {
    backgroundColor: "rgba(20,16,28,0.92)",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    minHeight: 120,
    gap: 8,
  },
  thoughtBox: {
    borderColor: colors.accentMuted,
    borderStyle: "dashed",
  },
  speakerName: { fontSize: 15, fontWeight: "700" },
  dialogueText: { color: colors.text, fontSize: 16, lineHeight: 23 },
  thoughtText: { fontStyle: "italic", color: colors.textMuted },
  advanceHint: { color: colors.textMuted, fontSize: 12, alignSelf: "flex-end" },
  choicePanel: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  choicePrompt: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
  },
  choiceOption: {
    backgroundColor: "rgba(31,26,43,0.94)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  choiceOptionPressed: { opacity: 0.8 },
  choiceOptionDisabled: { borderColor: colors.border, opacity: 0.5 },
  choiceOptionText: { color: colors.text, fontSize: 15, flex: 1 },
  choiceOptionCost: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  endPanel: { alignItems: "center", padding: 32, gap: 20 },
  endTitle: { color: colors.accent, fontSize: 24, fontWeight: "700" },
});
