/** Shared "split on first underscore" rule for deriving the pose axis from a `Character.sprites`
 * key: `${outfit}_${pose}` for a character with outfits, or a bare pose name with no underscore
 * for one without. Single source of truth for NodeEditorPanel.tsx's dialogue-staging form,
 * WardrobeMatrix.tsx's outfit grid, and the chapter editor's quick-add dialogue creation - a pose
 * picked/derived in any of those always lines up with the same pose names. Outfit names entered
 * through WardrobeMatrix are validated to never contain an underscore themselves, so this split
 * is unambiguous for anything uploaded through that UI - a legacy hand-typed key with an
 * underscore inside the pose name itself could misparse, but that only affects which pose bucket
 * it's grouped under, never what gets saved. */
export function derivePoses(sprites: Record<string, string>): string[] {
  const poses = new Set<string>();
  for (const key of Object.keys(sprites)) {
    const underscoreIndex = key.indexOf("_");
    poses.add(underscoreIndex === -1 ? key : key.slice(underscoreIndex + 1));
  }
  return Array.from(poses);
}
