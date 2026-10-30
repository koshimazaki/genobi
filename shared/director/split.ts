import {
  checkReferences,
  LAYER_LIMIT,
  visualAt,
  type Layer,
  type Project,
} from "./types";
import { laneId } from "./tracks";

/** Split at an integer composition frame; preserve every remaining sample and pose. */
export function splitLayer(
  p: Project,
  id: string,
  frame: number,
  newId: string,
): Project {
  const layer = p.layers.find((l) => l.id === id);
  if (!layer) throw new Error("Layer not found");
  if (layer.locked) throw new Error("Unlock this layer first");
  const offset = frame - layer.startFrame;
  if (!Number.isInteger(frame) || offset <= 0 || offset >= layer.durationFrames)
    throw new Error("Place the playhead inside the selected clip to split");
  if (p.layers.length >= LAYER_LIMIT)
    throw new Error(`A project supports at most ${LAYER_LIMIT} layers`);
  const left = { ...layer, durationFrames: offset } as Layer;
  const right = {
    ...layer,
    id: newId,
    name: `${layer.name.slice(0, 110)} cut`,
    startFrame: frame,
    durationFrames: layer.durationFrames - offset,
    // Both halves stay on the original track.
    track: laneId(layer),
  } as Layer;
  if ("sourceStartFrame" in right) right.sourceStartFrame += offset;
  if ("moduleId" in right)
    right.animationOffsetFrames = (layer.animationOffsetFrames ?? 0) + offset;
  if (
    "opacity" in layer &&
    layer.motion &&
    "opacity" in left &&
    "opacity" in right
  ) {
    const before = visualAt(layer, frame - 1),
      after = visualAt(layer, frame);
    left.motion = {
      scaleTo: before.scale,
      xTo: before.position.x,
      yTo: before.position.y,
      opacityTo: before.opacity,
    };
    right.scale = after.scale;
    right.position = after.position;
    right.opacity = after.opacity;
  }
  const next = {
    ...p,
    revision: p.revision + 1,
    layers: p.layers.flatMap((l) => (l.id === id ? [left, right] : [l])),
  };
  checkReferences(next);
  return next;
}
