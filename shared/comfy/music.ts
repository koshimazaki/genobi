import graph from "../../workflows/minimax-music-3.json";
import type { ApiGraph } from "./slots";
import type { WorkflowTemplate } from "./workflow";

/**
 * MiniMax Music 3, text to music, as an open workflow: Comfy's official
 * `audio_minimax_music_3` template in API format, its one subgraph flattened
 * into nodes `37:*`, every node and value kept. The studio fills the caption,
 * the lyrics, `max_duration` (a ceiling: the encoder decides the length, and
 * `37:15.seconds` stays linked to the length it measured) and a fresh seed. See
 * `workflows/minimax-music-3.README.md`.
 */
export const musicWorkflow: WorkflowTemplate = {
  id: "minimax-music-3",
  file: "workflows/minimax-music-3.json",
  graph: graph as ApiGraph,
  slots: {
    caption: { path: "37:13.caption", kind: "text" },
    lyrics: { path: "37:13.lyrics", kind: "text" },
    duration: { path: "37:13.max_duration", kind: "number" },
    seed: { path: "37:38.seed", kind: "number" },
    // Model slots are filled only for a local ComfyUI, from its model map.
    unet_name: { path: "37:6.unet_name", kind: "model" },
    text_encoder: { path: "37:3.clip_name", kind: "model" },
    vae: { path: "37:7.vae_name", kind: "model" },
  },
  requiredNodes: [
    ...new Set(Object.values(graph as ApiGraph).map((n) => n.class_type)),
  ],
  // Comfy Cloud's names, as this account's `/api/object_info` listed them on
  // 27 October 2026; the template's own choices.
  requiredModels: [
    graph["37:6"].inputs.unet_name,
    graph["37:3"].inputs.clip_name,
    graph["37:7"].inputs.vae_name,
  ],
  // SaveAudioAdvanced, MP3 at V0.
  output: { nodeId: "35", media: "audio" },
};

/**
 * The values the music graph's slots receive: the caption and lyrics as
 * written (empty lyrics are sent empty), the requested seconds, and a fresh
 * seed for each run, so four runs of one setup are four different songs.
 */
export function musicValues(
  input: { lyrics?: string; duration: number },
  prompt: string,
  random: () => number = Math.random,
) {
  return {
    caption: prompt,
    lyrics: input.lyrics ?? "",
    duration: input.duration,
    seed: Math.floor(random() * 2 ** 48),
  };
}
