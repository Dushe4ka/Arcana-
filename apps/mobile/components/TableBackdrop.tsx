import { useEffect, type ComponentType } from "react";
import { Image, StyleSheet } from "react-native";

/* eslint-disable @typescript-eslint/no-require-imports */
const POSTER = require("../assets/tarot/table-poster.jpg");
const VIDEO = require("../assets/tarot/table.mp4");
/* eslint-enable @typescript-eslint/no-require-imports */

type VideoModule = {
  useVideoPlayer: (source: unknown, setup?: (player: { loop: boolean; muted: boolean; play: () => void }) => void) => unknown;
  VideoView: ComponentType<Record<string, unknown>>;
};

// expo-video is a native module: a binary built before it was added does not have it, and
// an over-the-air update must not crash such a build. Without it the table is a still image.
let video: VideoModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  video = require("expo-video") as VideoModule;
} catch {
  video = null;
}

function MovingTable({ mod }: { mod: VideoModule }) {
  const player = mod.useVideoPlayer(VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  // The setup callback can run before the view is attached; start again once it is.
  useEffect(() => {
    (player as { play: () => void }).play();
  }, [player]);
  const { VideoView } = mod;
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
      pointerEvents="none"
    />
  );
}

/** The fortune table: candles flickering on dark wood. The still frame sits underneath, so
 * there is never a black flash while the video starts. */
export function TableBackdrop({ still = false }: { still?: boolean }) {
  return (
    <>
      <Image source={POSTER} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {video && !still ? <MovingTable mod={video} /> : null}
    </>
  );
}
