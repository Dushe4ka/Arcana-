import { useState } from "react";
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Link, router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import heroImage from "../../assets/images/login-hero.jpg";
import { Button } from "../../components/Button";
import { Scene3DBackground } from "../../components/Scene3DBackground";
import { ShimmerLogo } from "../../components/ShimmerLogo";
import { TextField } from "../../components/TextField";
import { useAuthStore } from "../../lib/auth-store";
import { colors } from "../../lib/theme";

// The hero photo is 1152x1536 (0.75 aspect) - the hero container is sized to
// match that aspect exactly so resizeMode="cover" never has to crop it.
const HERO_ASPECT = 1152 / 1536;
// Fraction down the hero photo where the wordmark sits - roughly waist height
// on the two figures, below their heads and hands.
const LOGO_TOP_FRACTION = 0.6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  const emailError = emailTouched && email && !EMAIL_PATTERN.test(email.trim())
    ? "Похоже, email введён неверно"
    : undefined;

  const submit = async () => {
    setEmailTouched(true);
    if (!EMAIL_PATTERN.test(email.trim())) return;
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

  const onForgotPassword = () => {
    Alert.alert(
      "Восстановление пароля",
      "Самостоятельное восстановление пока не готово. Напишите в поддержку — support@arcana.app.",
    );
  };

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <ImageBackground source={heroImage} style={styles.hero} resizeMode="cover">
        <Scene3DBackground bookCount={0} starCount={150} />
        <View style={[styles.logoWrap, { top: `${LOGO_TOP_FRACTION * 100}%` }]} pointerEvents="none">
          <ShimmerLogo width={screenWidth * 0.78} />
        </View>
        <LinearGradient
          colors={["transparent", colors.background + "80", colors.background + "e6"]}
          locations={[0, 0.4, 1]}
          style={styles.fade}
        />
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
              onBlur={() => setEmailTouched(true)}
              error={emailError}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <View>
              <TextField
                label="Пароль"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
              />
              <Text onPress={onForgotPassword} style={styles.forgotLink}>
                Забыли пароль?
              </Text>
            </View>
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
  logoWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fade: {
    height: "45%",
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
  forgotLink: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "right",
    marginTop: 6,
    textDecorationLine: "underline",
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
