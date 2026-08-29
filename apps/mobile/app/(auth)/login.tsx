import { useState } from "react";
import {
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import heroImage from "../../assets/images/login-hero.jpg";
import { Button } from "../../components/Button";
import { Scene3DBackground } from "../../components/Scene3DBackground";
import { ShimmerLogo } from "../../components/ShimmerLogo";
import { TextField } from "../../components/TextField";
import { useAuthStore } from "../../lib/auth-store";
import { colors } from "../../lib/theme";
import { useTiltParallax } from "../../lib/use-tilt-parallax";

// Full uncropped hero photo (1152x1536).
const HERO_ASPECT = 1152 / 1536;
// Fraction down the hero where the wordmark sits - waist height on the figures.
const LOGO_TOP_FRACTION = 0.82;
// How far each layer drifts with device tilt. The photo moves least (it is
// "furthest"), the sparkle layer most, which is what reads as depth.
const PHOTO_PARALLAX = 10;
const STAR_PARALLAX = 26;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tilt = useTiltParallax();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  const heroHeight = screenWidth / HERO_ASPECT;

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

  const parallaxStyle = (depth: number) => ({
    transform: [
      {
        translateX: tilt.x.interpolate({
          inputRange: [-1, 1],
          outputRange: [depth, -depth],
        }),
      },
      {
        translateY: tilt.y.interpolate({
          inputRange: [-1, 1],
          outputRange: [depth * 0.6, -depth * 0.6],
        }),
      },
    ],
  });

  return (
    <View style={styles.flex}>
      {/* Photo layer - slightly oversized so parallax drift never exposes an edge. */}
      <Animated.View
        style={[
          styles.heroLayer,
          { height: heroHeight + PHOTO_PARALLAX * 3, marginTop: -PHOTO_PARALLAX },
          parallaxStyle(PHOTO_PARALLAX),
        ]}
        pointerEvents="none"
      >
        <Image source={heroImage} style={styles.heroImage} resizeMode="cover" />
      </Animated.View>

      {/* Sparkle layer - drifts further than the photo, creating depth. */}
      <Animated.View
        style={[styles.heroLayer, { height: heroHeight }, parallaxStyle(STAR_PARALLAX)]}
        pointerEvents="none"
      >
        <Scene3DBackground bookCount={0} starCount={150} avoidCenterX={2.1} />
      </Animated.View>

      {/* Long, very gradual fade from the photo into the page background. */}
      <LinearGradient
        colors={[
          "transparent",
          colors.background + "12",
          colors.background + "38",
          colors.background + "70",
          colors.background + "a8",
          colors.background + "d8",
          colors.background,
        ]}
        locations={[0, 0.2, 0.36, 0.52, 0.68, 0.84, 1]}
        style={[styles.fade, { top: heroHeight * 0.42, height: heroHeight * 0.72 }]}
        pointerEvents="none"
      />

      <View style={[styles.logoWrap, { top: insets.top + heroHeight * LOGO_TOP_FRACTION - 14 }]} pointerEvents="none">
        <ShimmerLogo width={screenWidth * 0.78} />
      </View>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
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
              autoComplete="email"
              returnKeyType="next"
            />
            <View>
              <TextField
                label="Пароль"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={submit}
              />
              <View style={styles.linkRow}>
                <Pressable
                  onPress={() => router.push("/(auth)/register")}
                  style={styles.linkHit}
                  accessibilityRole="button"
                  accessibilityLabel="Создать аккаунт"
                >
                  <Text style={styles.linkText}>Создать аккаунт</Text>
                </Pressable>
                <Pressable
                  onPress={onForgotPassword}
                  style={styles.linkHit}
                  accessibilityRole="button"
                  accessibilityLabel="Забыли пароль?"
                >
                  <Text style={styles.linkText}>Забыли пароль?</Text>
                </Pressable>
              </View>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Войти" onPress={submit} loading={loading} disabled={!email || !password} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  // Transparent: this sits above the absolutely-positioned photo layers, so an
  // opaque background here would paint over them.
  kav: { flex: 1 },
  heroLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  logoWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 28,
    gap: 16,
  },
  subtitle: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 14,
  },
  form: {
    gap: 12,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  linkHit: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  linkText: {
    color: colors.textMuted,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
});
