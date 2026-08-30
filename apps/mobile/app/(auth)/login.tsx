import { useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Pressable,
  ScrollView,
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
import { useKeyboardPadding, useKeyboardVisible } from "../../lib/use-keyboard-visible";
import { useTiltParallax } from "../../lib/use-tilt-parallax";

// Full uncropped hero photo (1152x1536).
const HERO_ASPECT = 1152 / 1536;
// Fraction down the hero where the wordmark sits - waist height on the figures.
const LOGO_TOP_FRACTION = 0.82;
// How far each layer drifts with device tilt. The photo moves least (it is
// "furthest"), the sparkle layer most, which is what reads as depth. Layers
// are oversized by this much on every edge so drifting never exposes a seam.
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
  const keyboardVisible = useKeyboardVisible();
  const keyboardPadding = useKeyboardPadding();

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

  // Oversized on every edge by its own parallax depth, so drifting under tilt
  // never exposes the background color at a seam.
  const overscan = (depth: number) => ({
    width: screenWidth + depth * 2,
    height: heroHeight + depth * 2,
    marginLeft: -depth,
    marginTop: -depth,
  });

  return (
    <View style={styles.flex}>
      {/* Photo layer. */}
      <Animated.View
        style={[styles.heroLayer, overscan(PHOTO_PARALLAX), parallaxStyle(PHOTO_PARALLAX)]}
        pointerEvents="none"
      >
        <Image source={heroImage} style={styles.heroImage} resizeMode="cover" />
      </Animated.View>

      {/* Sparkle layer - drifts further than the photo, creating depth. */}
      <Animated.View
        style={[styles.heroLayer, overscan(STAR_PARALLAX), parallaxStyle(STAR_PARALLAX)]}
        pointerEvents="none"
      >
        <Scene3DBackground bookCount={0} starCount={170} avoidCenterX={2.1} starOpacity={0.9} />
      </Animated.View>

      {/* Long, very gradual fade from the photo into the page background. */}
      <LinearGradient
        // Fine-grained smootherstep ramp (25 stops) instead of a handful of
        // large jumps - the eye reads even a "smooth" 15-20% opacity jump
        // between two stops as a hard edge once it lands over a small
        // vertical span, which is exactly what happened around the logo.
        colors={[
          "transparent",
          colors.background + "00",
          colors.background + "01",
          colors.background + "04",
          colors.background + "09",
          colors.background + "10",
          colors.background + "1a",
          colors.background + "27",
          colors.background + "36",
          colors.background + "46",
          colors.background + "58",
          colors.background + "6c",
          colors.background + "80",
          colors.background + "93",
          colors.background + "a7",
          colors.background + "b9",
          colors.background + "c9",
          colors.background + "d8",
          colors.background + "e5",
          colors.background + "ef",
          colors.background + "f6",
          colors.background + "fb",
          colors.background + "fe",
          colors.background,
          colors.background,
        ]}
        locations={[
          0, 0.042, 0.083, 0.125, 0.167, 0.208, 0.25, 0.292, 0.333, 0.375, 0.417, 0.458, 0.5,
          0.542, 0.583, 0.625, 0.667, 0.708, 0.75, 0.792, 0.833, 0.875, 0.917, 0.958, 1,
        ]}
        style={[styles.fade, { top: heroHeight * 0.42, height: heroHeight * 0.72 }]}
        pointerEvents="none"
      />

      <View style={[styles.logoWrap, { top: insets.top + heroHeight * LOGO_TOP_FRACTION - 14 }]} pointerEvents="none">
        <ShimmerLogo width={screenWidth * 0.78} />
      </View>

      <Animated.View style={[styles.kav, { paddingBottom: keyboardPadding }]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
          keyboardShouldPersistTaps="handled"
        >
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
              translucent={keyboardVisible}
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
                translucent={keyboardVisible}
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
        </ScrollView>
      </Animated.View>
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
    flexGrow: 1,
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
