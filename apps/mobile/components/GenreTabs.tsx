import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { STORY_GENRES, type StoryGenre } from "@arcana/shared";

import { GlassSurface } from "./GlassSurface";
import { colors, fonts, radius } from "../lib/theme";

const GENRE_LABELS: Record<StoryGenre, string> = {
  FANTASY: "Фэнтези",
  ROMANCE: "Романтика",
  DRAMA: "Драма",
  MYSTERY: "Мистика",
  ADVENTURE: "Приключения",
};

export function GenreTabs({
  active,
  onSelect,
}: {
  active: StoryGenre;
  onSelect: (genre: StoryGenre) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {STORY_GENRES.map((genre) => {
        const isActive = genre === active;
        const label = <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{GENRE_LABELS[genre]}</Text>;
        return (
          <Pressable
            key={genre}
            onPress={() => onSelect(genre)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            {isActive ? (
              <View style={[styles.tab, styles.tabActive]}>{label}</View>
            ) : (
              <GlassSurface style={styles.tab} intensity={30} tintColor="rgba(243,236,224,0.14)">
                {label}
              </GlassSurface>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 20,
    gap: 10,
  },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(243,236,224,0.22)",
  },
  tabActive: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
  },
  tabText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.displaySemiBold,
  },
  tabTextActive: {
    color: colors.accent,
  },
});
