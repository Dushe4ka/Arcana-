import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { colors, radius } from "../lib/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
  /** Fades the field's background so a photo behind it stays visible - used
   * while the keyboard is open, so the raised keyboard doesn't turn the whole
   * lower screen into a wall of opaque boxes. */
  translucent?: boolean;
};

export function TextField({ label, error, style, secureTextEntry, translucent, ...rest }: Props) {
  const [reveal, setReveal] = useState(false);
  const bgOpacity = useRef(new Animated.Value(translucent ? 0.4 : 1)).current;

  useEffect(() => {
    Animated.timing(bgOpacity, {
      toValue: translucent ? 0.4 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [translucent, bgOpacity]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <Animated.View style={[styles.inputBg, { opacity: bgOpacity }]} />
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, secureTextEntry && styles.inputWithIcon, style]}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secureTextEntry && !reveal}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setReveal((v) => !v)}
            style={styles.icon}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={reveal ? "Скрыть пароль" : "Показать пароль"}
          >
            <Ionicons name={reveal ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
  inputRow: {
    position: "relative",
    justifyContent: "center",
  },
  inputBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  inputWithIcon: {
    paddingRight: 44,
  },
  icon: {
    position: "absolute",
    right: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
});
