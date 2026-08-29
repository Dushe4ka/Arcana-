import { useState } from "react";
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import heroImage from "../../assets/images/login-hero.jpg";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { useAuthStore } from "../../lib/auth-store";
import { colors } from "../../lib/theme";

// The hero photo is 1152x1536 (0.75 aspect) with the ARCANA title baked into
// its top band - the hero container below is sized close to that aspect so
// resizeMode="cover" crops from the sides rather than the top, and never
// clips the title.
const HERO_ASPECT = 1152 / 1536;

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
    <View style={styles.flex}>
      <ImageBackground source={heroImage} style={styles.hero} resizeMode="cover">
        <LinearGradient colors={["transparent", colors.background]} style={styles.fade} />
      </ImageBackground>

      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  hero: {
    aspectRatio: HERO_ASPECT,
    justifyContent: "flex-end",
  },
  fade: {
    height: 140,
  },
  sheet: {
    flex: 1,
  },
  sheetContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 24,
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
