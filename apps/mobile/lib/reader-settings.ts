import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

/** Reading preferences. Stored on the device (they describe this phone and these eyes,
 * not the account) and applied instantly everywhere in the reader. */
export type ReaderSettings = {
  /** Characters per second for the typewriter; 0 shows each line at once. */
  textSpeed: number;
  /** Pause after a line finishes before auto-play moves on, in ms. */
  autoDelayMs: number;
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
  autoDelayMs: 1800,
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
