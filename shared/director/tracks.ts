import type { Layer, Project } from "./types";

// A track is a lane of clips. A layer without `track` owns a lane named by
// its own id, so v1 bundles keep one clip per lane. Layer order stays the
// stacking order; a track's clips are adjacent in that order.
export type TrackFamily = "audio" | "visual" | "graphics" | "filter";
export interface Lane {
  id: string;
  family: TrackFamily;
  layers: Layer[];
}

export const laneId = (l: Layer) => l.track ?? l.id;
export const trackFamily = (kind: Layer["kind"]): TrackFamily =>
  kind === "video" || kind === "image" ? "visual" : kind;

/** Bottom to top, matching stacking order. */
export function lanes(layers: Layer[]): Lane[] {
  const result: Lane[] = [];
  for (const l of layers) {
    const id = laneId(l),
      last = result.at(-1);
    if (last?.id === id) last.layers.push(l);
    else result.push({ id, family: trackFamily(l.kind), layers: [l] });
  }
  return result;
}

const PREFIX: Record<TrackFamily, string> = {
  visual: "V",
  audio: "A",
  graphics: "G",
  filter: "F",
};
/** V1, A1… counted from the bottom within each family. */
export function laneLabels(all: Lane[]) {
  const counts: Partial<Record<TrackFamily, number>> = {};
  return new Map(
    all.map((lane) => {
      const n = (counts[lane.family] ?? 0) + 1;
      counts[lane.family] = n;
      return [lane.id, `${PREFIX[lane.family]}${n}`];
    }),
  );
}

export function checkTracks(layers: Layer[]) {
  const seen = new Set<string>();
  for (const lane of lanes(layers)) {
    if (seen.has(lane.id))
      throw new Error(`Track ${lane.id} clips must be adjacent in layers`);
    seen.add(lane.id);
    for (const l of lane.layers)
      if (trackFamily(l.kind) !== lane.family)
        throw new Error(`Track ${lane.id} mixes ${lane.family} and ${l.kind}`);
    const sorted = [...lane.layers].sort((a, b) => a.startFrame - b.startFrame);
    sorted.forEach((l, i) => {
      const next = sorted[i + 1];
      if (next && l.startFrame + l.durationFrames > next.startFrame)
        throw new Error(`${l.name} overlaps ${next.name} on one track`);
    });
  }
}

/** Nearest start in [low, high] where a clip fits between the lane's others. */
export function fitStart(
  layers: Layer[],
  lane: string,
  ignore: string,
  duration: number,
  desired: number,
  low: number,
  high: number,
): number | undefined {
  const others = layers
    .filter((l) => l.id !== ignore && laneId(l) === lane)
    .sort((a, b) => a.startFrame - b.startFrame);
  let best: number | undefined;
  let gapStart = low;
  for (const edge of [...others, undefined]) {
    const gapEnd = edge ? Math.min(high + duration, edge.startFrame) : high;
    const latest = edge ? gapEnd - duration : gapEnd;
    if (latest >= gapStart) {
      const candidate = Math.max(gapStart, Math.min(latest, desired));
      if (
        best === undefined ||
        Math.abs(candidate - desired) < Math.abs(best - desired)
      )
        best = candidate;
    }
    if (edge)
      gapStart = Math.max(gapStart, edge.startFrame + edge.durationFrames);
  }
  return best;
}

/** Trim limits imposed by the clips either side on the same lane. */
export function laneNeighbours(layers: Layer[], layer: Layer) {
  const id = laneId(layer),
    end = layer.startFrame + layer.durationFrames;
  let before = 0,
    after = Infinity;
  for (const l of layers) {
    if (l.id === layer.id || laneId(l) !== id) continue;
    if (l.startFrame + l.durationFrames <= layer.startFrame)
      before = Math.max(before, l.startFrame + l.durationFrames);
    else if (l.startFrame >= end) after = Math.min(after, l.startFrame);
  }
  return { before, after };
}

export function newTrackId(layers: Layer[]) {
  const used = new Set(layers.flatMap((l) => [l.id, laneId(l)]));
  let n = 1;
  while (used.has(`track-${n}`)) n++;
  return `track-${n}`;
}

/**
 * Place a clip on another lane of the same family, or on a new lane at the
 * top of the stack. The clip joins the end of its lane's run in layer order.
 */
export function moveToLane(
  p: Project,
  id: string,
  startFrame: number,
  target: string | "new",
): Project {
  const layer = p.layers.find((l) => l.id === id);
  if (!layer) throw new Error("Layer not found");
  if (layer.locked) throw new Error("Unlock this layer first");
  const rest = p.layers.filter((l) => l.id !== id);
  const track = target === "new" ? newTrackId(p.layers) : target;
  const moved = { ...layer, startFrame, track } as Layer;
  let at = rest.length;
  if (target !== "new") {
    const members = rest.flatMap((l, i) => (laneId(l) === track ? [i] : []));
    if (!members.length) throw new Error("Track not found");
    if (trackFamily(rest[members[0]].kind) !== trackFamily(layer.kind))
      throw new Error(`Move ${layer.kind} clips to a matching track`);
    at = members.at(-1)! + 1;
  }
  const layers = [...rest.slice(0, at), moved, ...rest.slice(at)];
  if (startFrame + layer.durationFrames > p.composition.durationFrames)
    throw new Error(`Layer ${layer.name} extends beyond composition`);
  checkTracks(layers);
  return { ...p, revision: p.revision + 1, layers };
}

/** Swap a whole lane with its neighbour in stacking order. */
export function reorderLane(layers: Layer[], id: string, delta: 1 | -1) {
  const all = lanes(layers),
    i = all.findIndex((lane) => lane.layers.some((l) => l.id === id)),
    j = i + delta;
  if (i < 0 || j < 0 || j >= all.length) return layers;
  [all[i], all[j]] = [all[j], all[i]];
  return all.flatMap((lane) => lane.layers);
}
