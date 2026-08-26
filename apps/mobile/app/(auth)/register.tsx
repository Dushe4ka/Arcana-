import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";

import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { useAuthStore } from "../../lib/auth-store";
import { colors } from "../../lib/theme";

export default function RegisterScreen() {
  const register = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    clearError();
    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim());
      router.replace("/(app)/(tabs)");
    } catch {
      // error text already set on the store
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = displayName.length >= 2 && email.includes("@") && password.length >= 8;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Приглашение</Text>
        <Text style={styles.subtitle}>Представьтесь, прежде чем войти в зал</Text>

        <View style={styles.form}>
          <TextField label="Как вас представить?" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
          <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" />
          <TextField
            label="Пароль (минимум 8 символов)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Создать аккаунт" onPress={submit} loading={loading} disabled={!canSubmit} />
        </View>

        <Link href="/(auth)/login" style={styles.link}>
          <Text style={styles.linkText}>Уже есть аккаунт? Войти</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 48,
    gap: 28,
  },
  title: {
    color: colors.accent,
    fontSize: 32,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 15,
  },
  form: {
    gap: 16,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  link: {
    alignSelf: "center",
  },
  linkText: {
    color: colors.textMuted,
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
