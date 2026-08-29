/** A single dark, romantic-drama palette for the whole app (no light mode yet - this genre
 * reads best on a dark "midnight ballroom" background regardless of system theme). */
export const colors = {
  background: "#14101c",
  surface: "#1f1a2b",
  surfaceRaised: "#2a2338",
  border: "#3a3049",
  text: "#f3ece0",
  textMuted: "#a89bb8",
  accent: "#d4af6a",
  accentMuted: "#8a7550",
  danger: "#e08585",
  soft: "#7fc9c0",
  hard: "#d4af6a",
};

/** The three stops used for the gold gradient title/wordmark treatment (GoldTitle). */
export const goldGradient = ["#f6dfa0", "#d4af6a", "#9c7a3a"] as const;

/** A lighter, dreamier palette used only for the entry/login scene - a "first impression"
 * moment that contrasts with the darker in-app "midnight ballroom" mood. */
export const mysticColors = {
  gradientTop: "#2a2140",
  gradientMid: "#4a3768",
  gradientBottom: "#1a1428",
  card: "rgba(28, 22, 42, 0.72)",
  cardBorder: "rgba(212, 175, 106, 0.35)",
  text: "#f3ece0",
  textMuted: "#c9bfe0",
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
};

export const fonts = {
  display: "Cinzel_600SemiBold",
  displayBold: "Cinzel_700Bold",
};
