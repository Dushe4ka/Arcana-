import { Image } from "react-native";
import type * as FileSystem from "expo-file-system";

import { apiRequest } from "./api";

/** Downloads a whole chapter before its first line: every sprite, background and
 * illustration into the image cache, every track and sound effect onto the device. Without
 * it a character's 2 MB sprite started downloading on the very line that shows them, and
 * music streamed from the server while it played.
 *
 * `expo-file-system` is a native module, loaded defensively like `expo-audio` (see
 * lib/audio.ts): without it audio simply keeps streaming. */

type ChapterAssets = { images: string[]; audio: string[] };

let fsModule: typeof FileSystem | null | undefined;
function loadFs(): typeof FileSystem | null {
  if (fsModule !== undefined) return fsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must not be a static import, see the file comment
    fsModule = require("expo-file-system") as typeof FileSystem;
  } catch {
    fsModule = null;
  }
  return fsModule;
}

const localAudio = new Map<string, string>();
/** Chapters fully downloaded during this app session - reopening one starts at once. */
const prepared = new Set<string>();

/** The on-device copy of a track if it has been downloaded, otherwise the URL itself. */
export function audioSource(url: string): string {
  return localAudio.get(url) ?? url;
}

export function isChapterPrepared(chapterId: string): boolean {
  return prepared.has(chapterId);
}

async function cacheAudio(url: string): Promise<void> {
  const fs = loadFs();
  const name = url.split("?")[0].split("/").pop();
  if (!fs || !name) return;
  const dir = new fs.Directory(fs.Paths.cache, "story-audio");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new fs.File(dir, name);
  // Upload names are unique per file, so a file already on disk is this very track.
  if (!file.exists) await fs.File.downloadFileAsync(url, file, { idempotent: true });
  localAudio.set(url, file.uri);
}

/** Downloads everything the chapter can show or play, a few files at a time. One file that
 * fails does not stop the rest - it will simply load on demand while reading. */
export async function preloadChapter(
  chapterId: string,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const assets = await apiRequest<ChapterAssets>(`/play/chapters/${chapterId}/assets`);
  const tasks: (() => Promise<unknown>)[] = [
    ...assets.images.map((url) => () => Image.prefetch(url)),
    ...assets.audio.map((url) => () => cacheAudio(url)),
  ];
  let done = 0;
  onProgress(done, tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task().catch(() => undefined);
      done += 1;
      onProgress(done, tasks.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker));
  prepared.add(chapterId);
}
