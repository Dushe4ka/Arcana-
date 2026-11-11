import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

/** Reading preferences. Stored on the device (they describe this phone and these eyes,
 * not the account) and applied instantly everywhere in the reader. */
export type ReaderSettings = {
  /** Characters per second for the typewriter; 0 shows each line at once. */
  textSpeed: number;
  /** Auto-tap timer in seconds. 0 = automatic: the pause is derived from the length of the
   * line on screen and an average reading speed, so short lines pass quickly and long ones
   * stay long enough to be read. */
  autoTapSeconds: number;
  /** One-time hint about the hidden top menu has been shown. */
  menuHintSeen: boolean;
  fontScale: number;
  /** Opacity of the dialogue panel background, 0.5-1. */
  boxOpacity: number;
  musicVolume: number;
  sfxVolume: number;
  /** Turns off sprite idle motion, particles, camera moves and screen effects. */
  reduceMotion: boolean;
  vibration: boolean;
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  textSpeed: 45,
  autoTapSeconds: 0,
  menuHintSeen: false,
  fontScale: 1,
  boxOpacity: 0.9,
  musicVolume: 0.7,
  sfxVolume: 0.9,
  reduceMotion: false,
  vibration: true,
};

export const TEXT_SPEEDS = [
  { value: 25, label: "Медленно" },
  { value: 45, label: "Обычно" },
  { value: 90, label: "Быстро" },
  { value: 0, label: "Сразу" },
] as const;

export const AUTO_TAP_OPTIONS = [
  { value: 0, label: "Авто" },
  { value: 2, label: "2 с" },
  { value: 4, label: "4 с" },
  { value: 6, label: "6 с" },
  { value: 10, label: "10 с" },
] as const;

/** Average silent reading speed for Russian prose is roughly 1000-1200 characters a minute;
 * 17 characters per second sits in the middle of that range. */
const READING_CHARS_PER_SECOND = 17;

/** How long a fully shown line stays on screen before the auto-tap fires, in ms. */
export function autoTapDelayMs(text: string, autoTapSeconds: number): number {
  if (autoTapSeconds > 0) return autoTapSeconds * 1000;
  const reading = (text.length / READING_CHARS_PER_SECOND) * 1000;
  return Math.min(12000, Math.max(1200, 700 + reading));
}

/** Fast-forward speeds: pause per line in ms. Lines appear whole at both speeds. */
export const FAST_FORWARD = { fast: 420, veryFast: 90 } as const;

export const FONT_SCALES = [
  { value: 0.9, label: "Мелкий" },
  { value: 1, label: "Обычный" },
  { value: 1.15, label: "Крупный" },
  { value: 1.3, label: "Очень крупный" },
] as const;

const STORAGE_KEY = "arcana.reader-settings.v1";

type Store = ReaderSettings & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<ReaderSettings>) => void;
  reset: () => void;
};

function persist(settings: ReaderSettings) {
  SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(settings)).catch(() => {
    // Preferences are a convenience: failing to save them must never interrupt reading.
  });
}

function pick(state: Store): ReaderSettings {
  const { hydrated: _h, hydrate: _hy, update: _u, reset: _r, ...settings } = state;
  return settings;
}

export const useReaderSettings = create<Store>((set, get) => ({
  ...DEFAULT_READER_SETTINGS,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) set({ ...DEFAULT_READER_SETTINGS, ...(JSON.parse(raw) as Partial<ReaderSettings>) });
    } catch {
      // Corrupt or unreadable storage: keep defaults.
    }
    set({ hydrated: true });
  },
  update: (patch) => {
    set(patch);
    persist(pick(get()));
  },
  reset: () => {
    set(DEFAULT_READER_SETTINGS);
    persist(DEFAULT_READER_SETTINGS);
  },
}));
