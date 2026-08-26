import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Button } from "../../../components/Button";
import { useAuthStore } from "../../../lib/auth-store";
import { colors, radius } from "../../../lib/theme";
import { useWalletStore } from "../../../lib/wallet-store";
import { ApiError } from "../../../lib/api";

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { wallet, loading, fetch, claimDaily } = useWalletStore();
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const onClaim = async () => {
    setClaiming(true);
    try {
      const result = await claimDaily();
      Alert.alert(
        "Награда получена!",
        `День ${result.streak} подряд: +${result.reward.soft} монет`,
      );
    } catch (err) {
      Alert.alert("Не получилось", err instanceof ApiError ? err.message : "Попробуйте позже");
    } finally {
      setClaiming(false);
    }
  };

  const onLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.header}>Профиль</Text>

      <View style={styles.card}>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.role}>{roleLabel(user?.role)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Кошелёк</Text>
        {loading && !wallet ? (
          <Text style={styles.muted}>Загрузка…</Text>
        ) : wallet ? (
          <View style={styles.walletRow}>
            <WalletStat label="Монеты" value={wallet.soft} color={colors.soft} />
            <WalletStat label="Кристаллы" value={wallet.hard} color={colors.hard} />
            <WalletStat label="Энергия" value={wallet.energy} color={colors.text} />
          </View>
        ) : (
          <Text style={styles.muted}>Не удалось загрузить</Text>
        )}
        <Button title="Забрать награду за вход" onPress={onClaim} loading={claiming} variant="secondary" />
      </View>

      <Button title="Выйти" onPress={onLogout} variant="secondary" />
    </ScrollView>
  );
}

function WalletStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function roleLabel(role?: string): string {
  switch (role) {
    case "ADMIN":
      return "Администратор";
    case "EDITOR":
      return "Редактор";
    case "WRITER":
      return "Сценарист";
    default:
      return "Игрок";
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  header: { color: colors.accent, fontSize: 28, fontWeight: "700", marginBottom: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  },
  email: { color: colors.text, fontSize: 16, fontWeight: "600" },
  role: { color: colors.textMuted, fontSize: 13 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  muted: { color: colors.textMuted },
  walletRow: { flexDirection: "row", justifyContent: "space-between" },
  stat: { alignItems: "center", gap: 4 },
  statValue: { fontSize: 22, fontWeight: "700" },
  statLabel: { color: colors.textMuted, fontSize: 12 },
});
