import type { Layer, Project } from "../../shared/director/types";

export function addGraphics(project: Project, recipe: string, frame: number) {
  const original = project.layers.find(
    (l) => "moduleId" in l && l.moduleId === recipe,
  );
  if (!original) return;
  // The copy is independent: it must not join the original's moved track.
  const { track: _track, ...source } = structuredClone(original);
  const layer = {
    ...source,
    id: `layer-${crypto.randomUUID().slice(0, 8)}`,
    startFrame: frame,
    durationFrames: Math.min(
      original.durationFrames,
      project.composition.durationFrames - frame,
    ),
    locked: false,
    muted: false,
  };
  const layers: Layer[] = [...project.layers];
  const i =
    layer.kind === "filter" ? -1 : layers.findIndex((l) => l.kind === "filter");
  layers.splice(i < 0 ? layers.length : i, 0, layer);
  return { layer, layers };
}
