import type { Layer } from "../../shared/director/types";
import type { View } from "./channel-layout";

/** Channel dot colours from the shared tokens, so both themes follow. */
export const CHANNEL_COLORS: Record<Layer["kind"] | View, string> = {
  video: "var(--camera-angle)",
  image: "var(--camera-shot)",
  audio: "var(--acoustic)",
  graphics: "var(--prompt-character)",
  filter: "var(--prompt-action)",
  // Camera and action: Genobi's teal and terracotta, for contrast.
  camera: "var(--intel)",
  action: "var(--prompt-scene)",
  markers: "var(--camera-light)",
  rhythm: "var(--soft)",
};
