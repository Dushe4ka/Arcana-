import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { Asset } from "expo-asset";

import heroImage from "../assets/images/login-hero.jpg";
import logoImage from "../assets/images/arcana-logo.png";
import { useAuthStore } from "./auth-store";

const STEP_DURATION = 260;

/** Drives the app-boot loading screen off real work instead of a fake timer:
 * restoring the session, then warming the two image assets the very next
 * screen needs, so nothing flashes in unloaded once the app becomes
 * interactive. Weighted 3/4/3 so the bar still moves meaningfully even
 * though session restore itself is near-instant. */
export function useBootProgress(): { progress: Animated.Value; ready: boolean } {
  const progress = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    let cancelled = false;

    const advanceTo = (value: number) =>
      new Promise<void>((resolve) => {
        Animated.timing(progress, {
          toValue: value,
          duration: STEP_DURATION,
          useNativeDriver: false,
        }).start(() => resolve());
      });

    (async () => {
      try {
        await hydrate();
        if (cancelled) return;
        await advanceTo(3);

        await Asset.loadAsync(heroImage).catch(() => {});
        if (cancelled) return;
        await advanceTo(7);

        await Asset.loadAsync(logoImage).catch(() => {});
        if (cancelled) return;
        await advanceTo(10);
      } catch {
        // Session restore itself failing shouldn't strand the user on the
        // loading screen forever - fall through to the app; auth-dependent
        // screens already handle a signed-out/unknown session.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrate, progress]);

  return { progress, ready };
}
