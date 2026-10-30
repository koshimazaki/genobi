import {
  MEDIA_DURATION_EPSILON_SECONDS,
  type Layer,
  type Project,
} from "./types";
import { fitStart, laneId, laneNeighbours } from "./tracks";
import { gridFrame, type SnapGrid } from "./beat-grid";
export { gridFrame } from "./beat-grid";
export type EditEdge = "move" | "left" | "right";

// Integer pixels prevent fractional background tiles from drifting from clips.
export const framePixels = (fps: number, zoom: number) =>
  Math.max(2, Math.round(zoom / fps));

export function timelinePatch(
  project: Project,
  layer: Layer,
  edge: EditEdge,
  deltaFrames: number,
  grid: SnapGrid | number,
  toleranceFrames: number,
  lane = laneId(layer),
): Partial<Layer> {
  if (layer.locked) return {};
  const { durationFrames, fps } = project.composition;
  const end = layer.startFrame + layer.durationFrames;
  const minimum =
    "sourceStartFrame" in layer
      ? Math.max(0, layer.startFrame - layer.sourceStartFrame)
      : "moduleId" in layer
        ? Math.max(0, layer.startFrame - (layer.animationOffsetFrames ?? 0))
        : 0;
  const available =
    "sourceStartFrame" in layer
      ? Math.floor(
          ((project.assets[layer.assetId].durationSeconds ?? 0) +
            MEDIA_DURATION_EPSILON_SECONDS) *
            fps,
        ) - layer.sourceStartFrame
      : durationFrames;
  // Trims stop at the neighbouring clips on the same track.
  const { before, after } = laneNeighbours(project.layers, layer);
  const low =
    edge === "left"
      ? Math.max(minimum, before)
      : edge === "right"
        ? layer.startFrame + 1
        : 0;
  const high =
    edge === "left"
      ? end - 1
      : edge === "right"
        ? Math.min(durationFrames, layer.startFrame + available, after)
        : durationFrames - layer.durationFrames;
  const raw = (edge === "right" ? end : layer.startFrame) + deltaFrames;
  let target = gridFrame(raw, grid);
  let distance = Infinity;
  // A move can align either edge; a trim aligns its moving edge only.
  const offsets = edge === "move" ? [0, layer.durationFrames] : [0];
  for (const other of project.layers) {
    if (other.id === layer.id) continue;
    for (const boundary of [
      other.startFrame,
      other.startFrame + other.durationFrames,
    ])
      for (const offset of offsets) {
        const candidate = boundary - offset;
        const d = Math.abs(candidate - raw);
        if (
          candidate >= low &&
          candidate <= high &&
          d <= toleranceFrames &&
          d < distance
        ) {
          target = candidate;
          distance = d;
        }
      }
  }
  target = Math.max(low, Math.min(high, target));
  if (edge === "move") {
    const start = fitStart(
      project.layers,
      lane,
      layer.id,
      layer.durationFrames,
      target,
      low,
      high,
    );
    return start === undefined ? {} : { startFrame: start };
  }
  if (edge === "right") return { durationFrames: target - layer.startFrame };
  const diff = target - layer.startFrame;
  return {
    startFrame: target,
    durationFrames: end - target,
    ...("sourceStartFrame" in layer
      ? { sourceStartFrame: layer.sourceStartFrame + diff }
      : "moduleId" in layer
        ? { animationOffsetFrames: (layer.animationOffsetFrames ?? 0) + diff }
        : {}),
  };
}

export function alignedEdges(layers: Layer[], selected: Layer) {
  const result: { frame: number; ids: string[] }[] = [];
  for (const frame of [
    selected.startFrame,
    selected.startFrame + selected.durationFrames,
  ]) {
    const ids = layers
      .filter(
        (l) =>
          l.id !== selected.id &&
          (l.startFrame === frame || l.startFrame + l.durationFrames === frame),
      )
      .map((l) => l.id);
    if (ids.length) result.push({ frame, ids: [selected.id, ...ids] });
  }
  return result;
}
