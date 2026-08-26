import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";

import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { useAuthStore } from "../../lib/auth-store";
import { colors } from "../../lib/theme";

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    clearError();
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(app)/(tabs)");
    } catch {
      // error text already set on the store
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Arcana</Text>
        <Text style={styles.subtitle}>Тайное общество ждёт вашего возвращения</Text>

        <View style={styles.form}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label="Пароль"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Войти" onPress={submit} loading={loading} disabled={!email || !password} />
        </View>

        <Link href="/(auth)/register" style={styles.link}>
          <Text style={styles.linkText}>Ещё нет приглашения? Создать аккаунт</Text>
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
    fontSize: 40,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 2,
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
