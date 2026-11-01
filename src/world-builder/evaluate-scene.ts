import type { Prop, Recipe } from "./recipe";
import { modOf, modsAt, type Mods } from "./mod-routes";
import { orbitPosition } from "./prop-orbit";
import { loopedSpin, loopPeriod } from "./loop";
import { motionInstances, sceneObjects } from "./scene-instances";
import {
  clampRoomPoint,
  roomSurfaces,
  roomSurfaceId,
  ROOM_DIMENSION_RANGE,
} from "./scene-room";
import { WORLD_POSITION_LIMIT, PRIMITIVE_SCALE_RANGE } from "./scene-bounds";
import { evaluateMorphControl } from "./scene-morph-evaluation";
import type { EvaluatedMorphControl } from "./scene-morph-control";
import { transitionTransform } from "./scene-transition";
import { rotationAt, rotateSceneObject } from "./scene-rotation";
import {
  evaluateStateAudio,
  timelineStatePair,
  type StateAudioWeights,
} from "./scene-state-audio";
import {
  SCENE_CONTROL_DEFAULTS,
  SCENE_CONTROL_RANGES,
  SCENE_MAPPING_RANGES,
  type SceneControls,
  type SceneMappingProperty,
  type SceneMotion,
  type SceneRoom,
  type SceneStateKey,
  type SceneVector,
} from "./scene-state";
import {
  clampSceneValue as clamp,
  mixSceneValue as mix,
  mixSceneVector,
  mixSceneTransform,
  twistPoint,
  twistRotation,
} from "./scene-transform";

export interface EvaluatedScene {
  /** The requested frame on the bounded motion timeline. */
  frame: number;
  /** Authored timeline position after the bounded audio morph offset. */
  authoredFrame: number;
  objects: Prop[];
  room?: SceneRoom;
  controls: SceneControls;
  /** Legacy matrix for non-prop lights, avatar and playground, applied by the runtime. */
  mods: Mods;
  state: { from: string; to: string; progress: number } | null;
  morphControl?: EvaluatedMorphControl;
  stateAudio?: StateAudioWeights;
}
export interface SceneEvaluationOptions {
  audio?: boolean;
  /** Show authored transforms without baking time-driven offsets into editor changes. */
  editing?: boolean;
}

function sample(data: number[], frame: number) {
  const index = Math.floor(frame),
    fraction = frame - index;
  return mix(data[index] ?? 0, data[index + 1] ?? data[index] ?? 0, fraction);
}
function mappedOffsets(recipe: Recipe, frame: number, enabled: boolean) {
  const result: Partial<Record<SceneMappingProperty, number>> = {};
  if (!enabled || !recipe.motion) return result;
  for (const mapping of recipe.motion.mappings) {
    if (!mapping.enabled) continue;
    const data =
      mapping.source === "level"
        ? recipe.envelope
        : (recipe.bandEnvelopes[mapping.source] ?? []);
    result[mapping.property] =
      (result[mapping.property] ?? 0) +
      sample(data, frame) * mapping.amount * recipe.motion.intensity;
  }
  for (const property of Object.keys(result) as SceneMappingProperty[]) {
    const [lo, hi] = SCENE_MAPPING_RANGES[property];
    result[property] = clamp(result[property]!, lo, hi);
  }
  return result;
}

function evaluatedControls(
  from: SceneStateKey,
  to: SceneStateKey,
  t: number,
  offsets: Partial<Record<SceneMappingProperty, number>>,
) {
  const result = { ...SCENE_CONTROL_DEFAULTS };
  for (const property of Object.keys(result) as (keyof SceneControls)[]) {
    const [lo, hi] = SCENE_CONTROL_RANGES[property];
    result[property] = clamp(
      mix(
        from.controls?.[property] ?? result[property],
        to.controls?.[property] ?? result[property],
        t,
      ) + (offsets[property] ?? 0),
      lo,
      hi,
    );
  }
  return result;
}
function evaluatedRoom(
  motion: SceneMotion,
  from: SceneStateKey,
  to: SceneStateKey,
  t: number,
  offsets: Partial<Record<SceneMappingProperty, number>>,
): SceneRoom | undefined {
  if (!motion.room) return undefined;
  const base = motion.room;
  const dimensions = mixSceneVector(
    from.room?.dimensions ?? base.dimensions,
    to.room?.dimensions ?? base.dimensions,
    t,
  );
  for (const [index, property] of [
    "roomWidth",
    "roomHeight",
    "roomDepth",
  ].entries())
    dimensions[index] = clamp(
      dimensions[index] + (offsets[property as SceneMappingProperty] ?? 0),
      ...ROOM_DIMENSION_RANGE,
    );
  const source = clampRoomPoint(
    mixSceneVector(
      from.room?.source ?? base.source,
      to.room?.source ?? base.source,
      t,
    ),
    dimensions,
  );
  const listener = clampRoomPoint(
    mixSceneVector(
      from.room?.listener ?? base.listener,
      to.room?.listener ?? base.listener,
      t,
    ),
    dimensions,
  );
  return {
    ...base,
    center: [...base.center],
    dimensions,
    source,
    listener,
    absorption: { ...base.absorption },
  };
}

function applyInstanceControls(
  p: Prop,
  base: Prop,
  motion: SceneMotion,
  controls: SceneControls,
): Prop {
  const group = motion.instances!;
  const rows = Math.ceil(group.count / (group.columns * group.columns));
  // A voxel belongs to the same lattice layers even while its target shape changes.
  const layerX =
    group.columns === 1
      ? 0
      : base.x / (((group.columns - 1) / 2) * group.spacing);
  const layerY = rows === 1 ? 0 : base.y / (((rows - 1) / 2) * group.spacing);
  const ax = controls.twistX * layerX,
    ay = controls.twistY * layerY;
  const local = [
    p.x - motion.pivot[0],
    p.y - motion.pivot[1],
    p.z - motion.pivot[2],
  ] as SceneVector;
  const point = twistPoint(local, ax, ay);
  const rotation = twistRotation(p, ax, ay);
  const distance = (1 + controls.spread) * controls.scale;
  return {
    ...p,
    x: clamp(
      motion.pivot[0] + point[0] * distance,
      -WORLD_POSITION_LIMIT,
      WORLD_POSITION_LIMIT,
    ),
    y: clamp(
      motion.pivot[1] + point[1] * distance + controls.lift,
      -WORLD_POSITION_LIMIT,
      WORLD_POSITION_LIMIT,
    ),
    z: clamp(
      motion.pivot[2] + point[2] * distance,
      -WORLD_POSITION_LIMIT,
      WORLD_POSITION_LIMIT,
    ),
    scale: clamp(p.scale * controls.scale, ...PRIMITIVE_SCALE_RANGE),
    rotationX: rotation[0],
    rotation: rotation[1],
    rotationZ: rotation[2],
  };
}

/** Legacy orbit/spin/modulation stays numerically identical and is applied once. */
function applyPropMotion(
  p: Prop,
  recipe: Recipe,
  frame: number,
  mods: Mods,
  editing: boolean,
): Prop {
  const targets = ["primitives", `prop:${p.id}`];
  const [x, z] = editing
    ? [p.x, p.z]
    : orbitPosition(
        p,
        frame / recipe.fps,
        recipe.loop ? loopPeriod(recipe) : undefined,
      );
  const spin = editing
    ? 0
    : ((recipe.loop ? loopedSpin(p.spin, loopPeriod(recipe)) : p.spin) *
        frame) /
      recipe.fps;
  return {
    ...p,
    x,
    z,
    y: p.y + modOf(mods, targets, "height"),
    scale: p.scale * (1 + modOf(mods, targets, "scale")),
    rotation: (p.rotation ?? 0) + spin + modOf(mods, targets, "spin"),
  };
}

/**
 * Single source of evaluated geometry for Shot, RGB, depth and CPU acoustics.
 * Validated recipe in; a fresh snapshot out. No wall clock, mutation or integrator.
 */
export function evaluateScene(
  recipe: Recipe,
  requestedFrame: number,
  options: SceneEvaluationOptions = {},
): EvaluatedScene {
  if (!Number.isFinite(requestedFrame))
    throw new Error("Scene frame must be finite.");
  const motion = recipe.motion,
    editing = options.editing === true;
  const audio = options.audio !== false && !editing;
  const frame = motion
    ? recipe.loop
      ? ((requestedFrame % recipe.frames) + recipe.frames) % recipe.frames
      : clamp(requestedFrame, 0, recipe.frames - 1)
    : Math.max(0, requestedFrame);
  const mods: Mods = audio ? modsAt(recipe, frame) : new Map();
  const offsets = mappedOffsets(recipe, frame, audio);
  const morphControl =
    editing || motion?.stateAudio?.enabled
      ? undefined
      : evaluateMorphControl(recipe, frame, audio);
  const authoredFrame = morphControl
    ? frame
    : clamp(
        frame + (offsets.morph ?? 0) * (recipe.frames - 1),
        0,
        recipe.frames - 1,
      );
  const timelinePair = motion
    ? timelineStatePair(motion.stateKeys, authoredFrame)
    : undefined;
  const stateAudio =
    !editing && timelinePair
      ? evaluateStateAudio(recipe, frame, timelinePair, audio)
      : undefined;
  const pair = stateAudio ?? morphControl ?? timelinePair;
  const controls = pair
    ? evaluatedControls(pair.from, pair.to, pair.progress, offsets)
    : { ...SCENE_CONTROL_DEFAULTS };
  const instances = motion?.instances
    ? new Map(motionInstances(motion.instances).map((p) => [p.id, p]))
    : new Map<string, Prop>();
  const rotation = editing
    ? undefined
    : rotationAt(motion?.rotation, frame, recipe.frames, recipe.loop);
  const objects = sceneObjects(recipe).map((base) => {
    const from = pair?.from.objects[base.id],
      to = pair?.to.objects[base.id];
    let p =
      from && to
        ? {
            ...base,
            ...(motion && !editing
              ? transitionTransform(from, to, pair!.progress, base.id, motion)
              : mixSceneTransform(from, to, pair!.progress)),
          }
        : { ...base };
    if (motion && !editing && instances.has(p.id))
      p = applyInstanceControls(p, instances.get(p.id)!, motion, controls);
    p = applyPropMotion(p, recipe, frame, mods, editing);
    return rotation && motion
      ? rotateSceneObject(p, motion.pivot, rotation)
      : p;
  });
  const room =
    motion && pair
      ? evaluatedRoom(motion, pair.from, pair.to, pair.progress, offsets)
      : undefined;
  if (room?.visible) {
    const hidden = room.cutaway
      ? new Set([roomSurfaceId(room, "south"), roomSurfaceId(room, "ceiling")])
      : new Set<string>();
    objects.push(...roomSurfaces(room).filter((p) => !hidden.has(p.id)));
  }
  return {
    frame,
    authoredFrame,
    objects,
    room,
    controls,
    mods,
    ...(morphControl ? { morphControl: morphControl.metadata } : {}),
    ...(stateAudio ? { stateAudio: stateAudio.metadata } : {}),
    state: pair
      ? { from: pair.from.id, to: pair.to.id, progress: pair.progress }
      : null,
  };
}
