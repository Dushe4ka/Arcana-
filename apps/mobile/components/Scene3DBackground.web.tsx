/** Web build (development previews only): the three.js starfield and flying books need
 * expo-gl, which has no web counterpart here - the scene is simply left out. The phone
 * builds use Scene3DBackground.tsx. */
export function Scene3DBackground(_props: Record<string, unknown>) {
  return null;
}
