import { createWorld, type WorldRuntime } from "./runtime";
import { createGeometryPreview } from "./geometry-preview";
import { SCENE_CAPABILITIES } from "./capabilities";
import { parameterSchema, type Recipe } from "./recipe";
import { MOVE_SECONDS } from "./take-duration";

/** Only initialization falls back; rendering failures remain visible to the caller. */
export function createBuilderRuntime(
  canvas: HTMLCanvasElement,
  edit: (patch: Partial<Recipe>, previewFrame?: number) => void,
) {
  try {
    return createWorld(canvas, edit);
  } catch {
    return createGeometryPreview(canvas, edit);
  }
}

export function describeBuilderRuntime(world: WorldRuntime) {
  return {
    version: 1,
    renderers:
      world.kind === "geometry"
        ? ["geometry-preview"]
        : ["stage", "neuro", "playground"],
    parameters: parameterSchema,
    seconds: MOVE_SECONDS,
    capabilities:
      world.kind === "geometry"
        ? [
            "recipe-json",
            "camera",
            "manual-shot-camera",
            "camera-path-v1",
            "analytic-camera-modifiers",
            "audio-camera-response",
            "audio-envelope",
            "measured-sub-envelope",
            "audio-mod-matrix",
            "scene-library",
            "scene-state-interpolation-v1",
            "bounded-voxel-morphs",
            "audio-scene-mappings",
            "spectral-morph-routing-v1",
            "authored-morph-composer",
            "morph-transition-paths-v1",
            "dark-grid-stage",
            "independent-scene-loop-slots",
            "retained-part-presence-color",
          ]
        : [...SCENE_CAPABILITIES],
  };
}
