/** The reader's audio engine: one looping music channel with crossfades, plus one-shot
 * sound effects. Driven entirely by the stage state the server sends with every beat, so
 * resuming a save restores the right track without any client-side bookkeeping.
 *
 * `expo-audio` is a native module. An app binary built before it was added does not contain
 * it, and an over-the-air JS update must not crash such a build - so the module is loaded
 * defensively and every call degrades to silence when it is missing. */

type Player = {
  volume: number;
  loop: boolean;
  play: () => void;
  pause: () => void;
  remove: () => void;
};

type AudioModule = {
  createAudioPlayer: (source: { uri: string } | null) => Player;
  setAudioModeAsync: (mode: Record<string, unknown>) => Promise<void>;
};

let audioModule: AudioModule | null | undefined;

function loadModule(): AudioModule | null {
  if (audioModule !== undefined) return audioModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must not be a static import, see the file comment
    audioModule = require("expo-audio") as AudioModule;
    // Story music should respect the hardware silent switch being off? No: a reader who
    // put headphones on expects sound; the in-app volume sliders are the control.
    audioModule.setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
  } catch {
    audioModule = null;
  }
  return audioModule;
}

export type MusicState = { url: string; loop: boolean; volume: number } | null;

const FADE_STEP_MS = 50;

class AudioEngine {
  private music: { player: Player; url: string; base: number } | null = null;
  private fades = new Map<Player, ReturnType<typeof setInterval>>();
  private musicVolume = 0.7;
  private sfxVolume = 0.9;
  private paused = false;

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.music && !this.fades.has(this.music.player)) {
      this.safe(() => (this.music!.player.volume = this.music!.base * music));
    }
  }

  /** Makes the music channel match `target`: starts, swaps (crossfade) or stops a track.
   * Calling it again with the track that is already playing does nothing, so it is safe to
   * call on every beat. */
  syncMusic(target: MusicState, fadeMs = 800) {
    const mod = loadModule();
    if (!mod) return;
    if (this.music && target && this.music.url === target.url) {
      this.music.base = target.volume;
      this.music.player.loop = target.loop;
      return;
    }
    if (this.music) {
      const old = this.music.player;
      this.music = null;
      this.fade(old, 0, fadeMs, () => this.safe(() => old.remove()));
    }
    if (!target) return;
    try {
      const player = mod.createAudioPlayer({ uri: target.url });
      player.loop = target.loop;
      player.volume = 0;
      this.music = { player, url: target.url, base: target.volume };
      if (!this.paused) player.play();
      this.fade(player, target.volume * this.musicVolume, fadeMs);
    } catch {
      this.music = null;
    }
  }

  playSfx(url: string) {
    const mod = loadModule();
    if (!mod || this.paused || this.sfxVolume <= 0) return;
    try {
      const player = mod.createAudioPlayer({ uri: url });
      player.volume = this.sfxVolume;
      player.play();
      // One-shots are short; release the native player once it has certainly finished.
      setTimeout(() => this.safe(() => player.remove()), 15000);
    } catch {
      // A missing or undecodable effect is not worth interrupting the story for.
    }
  }

  /** App went to the background / reader lost focus. */
  pause() {
    this.paused = true;
    if (this.music) this.safe(() => this.music!.player.pause());
  }

  resume() {
    this.paused = false;
    if (this.music) this.safe(() => this.music!.player.play());
  }

  /** Leaving the reader: fade out and release everything. */
  stopAll(fadeMs = 400) {
    this.syncMusic(null, fadeMs);
  }

  private fade(player: Player, to: number, ms: number, done?: () => void) {
    const existing = this.fades.get(player);
    if (existing) clearInterval(existing);
    let from = 0;
    this.safe(() => (from = player.volume));
    const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      const value = from + ((to - from) * step) / steps;
      this.safe(() => (player.volume = Math.max(0, Math.min(1, value))));
      if (step >= steps) {
        clearInterval(timer);
        this.fades.delete(player);
        done?.();
      }
    }, FADE_STEP_MS);
    this.fades.set(player, timer);
  }

  private safe(action: () => void) {
    try {
      action();
    } catch {
      // The native player may already be released.
    }
  }
}

export const audioEngine = new AudioEngine();
