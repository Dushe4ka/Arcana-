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
};
