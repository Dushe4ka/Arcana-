/** A single dark, romantic-drama palette for the whole app (no light mode yet - this genre
 * reads best on a dark "midnight ballroom" background regardless of system theme).
 * Warm neutral near-black (not purple-tinted) + gold accent, matching the
 * "Premium dark + gold accent" pairing ui-ux-pro-max's color data recommends
 * for this brief - the previous palette leaned purple/eggplant. */
export const colors = {
  background: "#1a1613",
  surface: "#241f1a",
  surfaceRaised: "#2f2820",
  border: "#4a3f30",
  text: "#f3ece0",
  textMuted: "#b8a99a",
  accent: "#d4af6a",
  accentMuted: "#8a7550",
  danger: "#e08585",
  soft: "#7fc9c0",
  hard: "#d4af6a",
  /** Dusty rose used only for the home screen's "Читать" CTA and carousel
   * accents, sampled from the reference mock - kept out of the shared accent
   * so other screens' primary buttons stay gold. */
  rose: "#c2938f",
  roseMuted: "#8a655f",
  /** Soft violet used only for level/XP on the home header, sampled from the
   * user's reference screenshot - explicitly brought back for this one spot
   * by request, everything else stays on the gold accent. */
  level: "#a78bda",
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
};

/** Warm rose-brown vignette sampled from the user's bookcase reference photo -
 * scoped to the home screen background only (not `colors.background`, which
 * stays the near-black tone every other screen uses). */
export const homeGradient = ["#241a15", "#6f5348", "#9c7768", "#6a4d3f", "#201712"] as const;

/** ui-ux-pro-max's "Classic Elegant" pairing (Playfair Display + Inter),
 * matching this brief's premium-romantic mood - loaded via useFonts() in
 * useBootProgress, applied only to headline-scale titles (16px+). Small
 * captions stay on the system font: Playfair's hairlines get illegible
 * below that size. Body copy stays on the system font too for now - only
 * the display face changed in this pass. */
export const fonts = {
  displaySemiBold: "PlayfairDisplay_600SemiBold",
  displayBold: "PlayfairDisplay_700Bold",
  /** The cinema hall's poster voice: big bold italics set over the image. */
  poster: "PlayfairDisplay_700Bold_Italic",
  /** The "Гримуар" voice of the library: an old-book serif for shelf plaques, section
   * headings and titles on the home screen. */
  grimoire: "CormorantGaramond_600SemiBold",
  grimoireBold: "CormorantGaramond_700Bold",
  grimoireItalic: "CormorantGaramond_500Medium_Italic",
};

/** Bookcase woods - all inside the app's chocolate / coffee range, so the furniture
 * belongs to the same room as the rest of the interface. */
export const wood = {
  shadow: "#150e09",
  dark: "#22160e",
  mid: "#3a2718",
  light: "#553c26",
  edge: "#7a5b3a",
  brass: "#d4af6a",
  brassDim: "#8a7550",
};
