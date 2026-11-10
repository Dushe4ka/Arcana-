import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import type { StagedCharacterView } from "../../lib/types";

const useNativeDriver = true;

/** One character on stage. Motion is deliberately small - it should read as a living
 * person standing there, never pull the eye away from the text:
 *  - a slow "breathing" scale anchored at the feet while idle;
 *  - a one-shot entrance/reaction animation when the beat asks for one;
 *  - a short crossfade whenever the sprite image itself changes (new emotion or outfit). */
export function StageSprite({
  staged,
  reduceMotion,
  speaking,
}: {
  staged: StagedCharacterView;
  reduceMotion: boolean;
  speaking: boolean;
}) {
  const breath = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const offsetX = useRef(new Animated.Value(0)).current;
  const offsetY = useRef(new Animated.Value(0)).current;
  const lean = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      breath.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver }),
        Animated.timing(breath, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, reduceMotion]);

  // Replays whenever the image (new emotion/outfit) or the requested animation changes:
  // the new sprite always fades in, plus the beat's one-shot move if it has one.
  useEffect(() => {
    const side = staged.position === "left" ? -1 : 1;
    const animation = reduceMotion ? "none" : (staged.animation ?? "none");
    offsetX.setValue(animation === "slide_in" ? side * 160 : 0);
    offsetY.setValue(0);
    lean.setValue(1);
    opacity.setValue(reduceMotion ? 1 : 0);

    const parts: Animated.CompositeAnimation[] = [
      Animated.timing(opacity, {
        toValue: 1,
        duration: reduceMotion ? 0 : animation === "fade_in" ? 600 : 220,
        useNativeDriver,
      }),
    ];
    if (animation === "slide_in") {
      parts.push(Animated.timing(offsetX, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver }));
    } else if (animation === "bounce") {
      parts.push(
        Animated.sequence([
          Animated.timing(offsetY, { toValue: -18, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver }),
          Animated.timing(offsetY, { toValue: 0, duration: 220, easing: Easing.bounce, useNativeDriver }),
        ]),
      );
    } else if (animation === "shake") {
      parts.push(
        Animated.sequence(
          [10, -10, 7, -7, 3, 0].map((x) => Animated.timing(offsetX, { toValue: x, duration: 55, useNativeDriver })),
        ),
      );
    } else if (animation === "nod") {
      parts.push(
        Animated.sequence([
          Animated.timing(offsetY, { toValue: 10, duration: 160, useNativeDriver }),
          Animated.timing(offsetY, { toValue: 0, duration: 220, useNativeDriver }),
        ]),
      );
    } else if (animation === "lean_in") {
      parts.push(Animated.timing(lean, { toValue: 1.05, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver }));
    }
    const running = Animated.parallel(parts);
    running.start();
    return () => running.stop();
  }, [staged.spriteUrl, staged.animation, staged.position, reduceMotion]);

  if (!staged.spriteUrl) return null;

  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.008] });

  return (
    <Animated.Image
      source={{ uri: staged.spriteUrl }}
      resizeMode="contain"
      style={[
        styles.sprite,
        staged.position === "left" && styles.left,
        staged.position === "center" && styles.center,
        staged.position === "right" && styles.right,
        {
          // A character who is not the one speaking steps back visually.
          opacity: Animated.multiply(opacity, speaking ? 1 : 0.82),
          transform: [
            { translateX: offsetX },
            { translateY: offsetY },
            { scale: Animated.multiply(breathScale, lean) },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  // Scaled by the sprite's own 2000x4600 canvas aspect ratio, at 90% of the stage height.
  sprite: { position: "absolute", bottom: 0, height: "90%", aspectRatio: 2000 / 4600 },
  left: { left: "-8%" },
  center: { alignSelf: "center" },
  right: { right: "-8%" },
});
