import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { apiRequest, ApiError } from "../../lib/api";
import { applyTokenPair, useAuthStore } from "../../lib/auth-store";
import { colors, radius } from "../../lib/theme";
import type { TokenPair } from "../../lib/types";

export default function SecurityScreen() {
  const logout = useAuthStore((s) => s.logout);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; repeat?: string }>({});
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const onChangePassword = async () => {
    const found: typeof errors = {};
    if (!current) found.current = "Введите текущий пароль";
    if (next.length < 8) found.next = "Минимум 8 символов";
    else if (next === current) found.next = "Новый пароль должен отличаться от текущего";
    if (repeat !== next) found.repeat = "Пароли не совпадают";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const pair = await apiRequest<TokenPair>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      await applyTokenPair(pair);
      setCurrent("");
      setNext("");
      setRepeat("");
      Alert.alert("Пароль изменён", "На остальных устройствах нужно будет войти заново с новым паролем.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setErrors({ current: err.message });
      else Alert.alert("Не получилось", err instanceof ApiError ? err.message : "Попробуйте позже");
    } finally {
      setSaving(false);
    }
  };

  const onLogoutEverywhere = () => {
    Alert.alert("Выйти на всех устройствах?", "Вы выйдете из аккаунта везде, включая это устройство.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Выйти везде",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            await apiRequest("/auth/logout-all", { method: "POST" });
            await logout();
            router.replace("/(auth)/login");
          } catch (err) {
            Alert.alert("Не получилось", err instanceof ApiError ? err.message : "Попробуйте позже");
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Смена пароля</Text>
          <TextField
            label="Текущий пароль"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            error={errors.current}
          />
          <TextField
            label="Новый пароль"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            error={errors.next}
          />
          <TextField
            label="Новый пароль ещё раз"
            value={repeat}
            onChangeText={setRepeat}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            error={errors.repeat}
          />
          <Button title="Сменить пароль" onPress={onChangePassword} loading={saving} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Активные сеансы</Text>
          <Text style={styles.hint}>
            Если вы входили на чужом телефоне или потеряли устройство, завершите все сеансы сразу.
          </Text>
          <Button title="Выйти на всех устройствах" onPress={onLogoutEverywhere} variant="secondary" loading={signingOut} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 20, paddingBottom: 48 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, gap: 14 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
});
