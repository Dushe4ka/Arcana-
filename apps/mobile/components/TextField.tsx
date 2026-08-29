import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius } from "../lib/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({ label, error, style, secureTextEntry, ...rest }: Props) {
  const [reveal, setReveal] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
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
            hitSlop={10}
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
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
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
