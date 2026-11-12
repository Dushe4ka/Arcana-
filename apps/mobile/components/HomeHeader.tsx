import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { GlassSurface } from "./GlassSurface";
import { BeanIcon, CardIcon, KeyIcon } from "./ResourceIcons";
import { CURRENCY } from "../lib/currency";
import { colors, radius } from "../lib/theme";
import type { PublicUser, Wallet } from "../lib/types";

function ResourcePill({ icon, value, name }: { icon: ReactNode; value: number; name: string }) {
  return (
    <View accessible accessibilityLabel={`${name}: ${value}`}>
      <GlassSurface style={styles.pill}>
        {icon}
        <Text style={styles.pillValue}>{value}</Text>
      </GlassSurface>
    </View>
  );
}

export function HomeHeader({ user, wallet }: { user: PublicUser | null; wallet: Wallet | null }) {
  const initial = (user?.displayName || user?.email || "?").charAt(0).toUpperCase();
  const level = wallet?.level ?? 1;
  const xpFraction = wallet ? wallet.xpIntoLevel / wallet.xpForNextLevel : 0;

  return (
    <GlassSurface style={styles.row} intensity={20} tintColor="rgba(36,28,22,0.28)">
      <Pressable
        onPress={() => router.push("/(app)/(tabs)/profile")}
        style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
      </Pressable>

      <View style={styles.identity}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user?.displayName || "Гость"}
          </Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>{level}</Text>
          </View>
        </View>
        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${Math.min(100, xpFraction * 100)}%` }]} />
        </View>
        {wallet ? (
          <Text style={styles.xpLabel}>
            {wallet.xpIntoLevel} / {wallet.xpForNextLevel} XP
          </Text>
        ) : null}
      </View>

      {/* The three resources: coffee beans, cards, keys. */}
      {wallet ? (
        <View style={styles.pills}>
          <ResourcePill icon={<BeanIcon size={15} />} value={wallet.soft} name={CURRENCY.SOFT.name} />
          <ResourcePill icon={<CardIcon size={15} />} value={wallet.hard} name={CURRENCY.HARD.name} />
          <ResourcePill icon={<KeyIcon size={14} />} value={wallet.energy} name={CURRENCY.ENERGY.name} />
        </View>
      ) : null}
    </GlassSurface>
  );
}

const AVATAR_SIZE = 48;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.lg,
    gap: 10,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  pressed: {
    opacity: 0.75,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.accent, fontSize: 18, fontWeight: "700" },
  identity: {
    flex: 1,
    gap: 6,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  // flexShrink: 1 - without it this Text refuses to shrink below its own
  // content width (RN's row-item default), so a long display name pushed
  // levelBadge right out past `identity`'s box and into the currency pills.
  name: { color: colors.text, fontSize: 15, fontWeight: "700", flexShrink: 1 },
  levelBadge: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.level,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  levelText: { color: colors.background, fontSize: 11, fontWeight: "700" },
  xpTrack: {
    height: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    overflow: "hidden",
  },
  xpFill: {
    height: "100%",
    backgroundColor: colors.level,
    borderRadius: radius.sm,
  },
  xpLabel: { color: colors.textMuted, fontSize: 11 },
  pills: {
    flexDirection: "row",
    gap: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  pillValue: { color: colors.text, fontSize: 13, fontWeight: "600" },
});
