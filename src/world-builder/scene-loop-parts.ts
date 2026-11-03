import { evaluateScene } from "./evaluate-scene";
import type { Prop } from "./recipe";
import { motionInstances } from "./scene-instances";
import {
  sceneTransformOf,
  type SceneInstances,
  type SceneTransform,
} from "./scene-state";
import { compactLayouts, matchLayout } from "./motion-layout-utils";
import { resampleMorphParts } from "./morph-resample";
import type { SceneLoopSnapshot } from "./scene-loop-types";
import { canonical } from "../../shared/memory/state";

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Generated shells and external attachments are not silently reconstructed. */
export function assertLoopCompatibility(slots: SceneLoopSnapshot[]) {
  const first = slots[0].recipe;
  const zones = (slot: SceneLoopSnapshot) =>
    slot.recipe.motion?.acousticZones
      ? {
          zones: slot.recipe.motion.acousticZones,
          listener: slot.recipe.motion.acousticListener ?? "camera",
        }
      : undefined;
  const zoneParts = (slot: SceneLoopSnapshot) => ({
    generator: slot.recipe.motion?.instances?.generator,
    count: slot.recipe.motion?.instances?.count,
    primitives: slot.recipe.objects
      .map((part) => `${part.id}:${part.shape}`)
      .sort(),
  });
  const roomShell = (slot: SceneLoopSnapshot) => {
    const room = slot.recipe.motion?.room;
    if (!room) return undefined;
    const { dimensions: _d, source: _s, listener: _l, ...shell } = room;
    return shell;
  };
  for (const slot of slots) {
    const recipe = slot.recipe;
    if (recipe.scene === "neuro" || recipe.scene !== first.scene)
      throw new Error(
        "Use the same Stage or Playground scene for all loop slots; shader scenes do not have authored morph geometry.",
      );
    if (recipe.scene === "playground" && !same(recipe.layout, first.layout))
      throw new Error(
        "Keep one Playground layout across loop slots, or use authored Stage primitives.",
      );
    if (!same(zones(slot), zones(slots[0])))
      throw new Error(
        "Keep identical acoustic zones and listeners in every loop slot. Recall one scene and save different camera views, or use Save scene for separate stories.",
      );
    if (!same(roomShell(slot), roomShell(slots[0])))
      throw new Error(
        "Keep the same acoustic room shell across loop slots; its dimensions and source/listener positions may change.",
      );
    if (
      first.motion?.acousticZones &&
      !same(zoneParts(slot), zoneParts(slots[0]))
    )
      throw new Error(
        "Keep the same generated blocks and primitive identities in acoustic loop slots. Save scene preserves an independent architectural story.",
      );
    if (Object.keys(recipe.textures).length)
      throw new Error(
        "Loop composition currently supports untextured geometry. Remove attached textures before saving these slots, or capture the original scene separately.",
      );
    if (
      recipe.avatar !== first.avatar ||
      (recipe.avatar &&
        (recipe.avatarAsset !== first.avatarAsset ||
          !same(recipe.creatureReference, first.creatureReference) ||
          !same(recipe.avatarMotion, first.avatarMotion)))
    )
      throw new Error(
        "Use the same character model and motion sequence across loop slots. Character rigs cannot morph into a different model.",
      );
  }
}

const transform = (part: Prop): SceneTransform => ({
  ...sceneTransformOf(part),
  color: part.color,
});

/** Retained known primitives rebuild; authored boxes are split and matched explicitly. */
export function loopParts(slots: SceneLoopSnapshot[]) {
  const retainZoneIds = !!slots[0].recipe.motion?.acousticZones;
  const poses = slots.map(
    (slot) =>
      new Map(
        evaluateScene(slot.recipe, 0, { audio: false }).objects.map((part) => [
          part.id,
          part,
        ]),
      ),
  );
  const primitiveRows = slots.map((slot, index) =>
    slot.recipe.objects
      .map((part) => poses[index].get(part.id)!)
      .filter((part) => (part.presence ?? 1) > 0),
  );
  const definitions = new Map<
    string,
    { id: string; source: Prop; parts: (Prop | undefined)[] }
  >();
  const usedIds = new Set<string>();
  for (const [row, parts] of primitiveRows.entries()) {
    for (const part of parts) {
      const identity = `${part.id}:${part.shape}`;
      let entry = definitions.get(identity);
      if (!entry) {
        let id = part.id;
        let suffix = definitions.size;
        while (
          usedIds.has(id) ||
          id.startsWith("voxel-") ||
          id.startsWith("scene-room-")
        )
          id = `loop-part-${suffix++}`;
        usedIds.add(id);
        entry = {
          id,
          source: part,
          parts: Array.from({ length: slots.length }),
        };
        definitions.set(identity, entry);
      }
      entry.parts[row] = part;
    }
  }
  if (definitions.size > 24)
    throw new Error(
      "This loop needs more than 24 distinct primitives. Remove objects or use fewer saved states.",
    );
  const objects: Prop[] = [];
  const states: Record<string, SceneTransform>[] = slots.map(() =>
    Object.create(null),
  );
  for (const { id, source, parts } of definitions.values()) {
    objects.push({ ...source, id, spin: 0, orbit: 0, presence: undefined });
    const colorsChange = parts.some(
      (part) => part && part.color !== source.color,
    );
    parts.forEach((part, index) => {
      const value = transform(part ?? source);
      if (!colorsChange) delete value.color;
      if (!part) value.presence = 0;
      states[index][id] = value;
    });
  }
  const voxelRows = slots.map((slot, index) =>
    slot.recipe.motion?.instances
      ? motionInstances(slot.recipe.motion.instances)
          .map((part) => poses[index].get(part.id)!)
          .filter((part) => retainZoneIds || (part.presence ?? 1) > 0)
          .map(transform)
      : [],
  );
  const firstVoxel = voxelRows.findIndex((parts) => parts.length > 0);
  let instances: SceneInstances | undefined;
  if (firstVoxel >= 0) {
    const count = Math.max(
      ...slots.map((slot) => slot.recipe.motion?.instances?.count ?? 0),
    );
    instances = {
      ...slots[firstVoxel].recipe.motion!.instances!,
      count,
      ...(retainZoneIds
        ? {}
        : { columns: Math.min(8, Math.ceil(Math.cbrt(count))) }),
    };
    const reference = resampleMorphParts(voxelRows[firstVoxel], count);
    let previous = reference;
    const layouts = voxelRows.map((parts) => {
      // Zone-bearing scenes declare stable architecture. Retain authored IDs;
      // nearest-neighbour remapping could exchange a wall with a nearby prop.
      if (retainZoneIds) return structuredClone(parts);
      if (!parts.length)
        return reference.map((part) => ({ ...part, presence: 0 }));
      const layout = matchLayout(previous, resampleMorphParts(parts, count));
      previous = layout;
      return layout;
    });
    for (const [index, base] of motionInstances(instances).entries()) {
      const animateColor = layouts.some(
        (layout) => layout[index].color !== base.color,
      );
      layouts.forEach((layout, row) => {
        const part = { ...layout[index] };
        if (!animateColor) delete part.color;
        states[row][base.id] = part;
      });
    }
  }
  const ids = Object.keys(states[0]);
  const compact = compactLayouts(
    states.map((state) => ids.map((id) => state[id])),
    false,
  );
  const identityCounts = new Map<string, number>();
  for (const { source } of definitions.values())
    identityCounts.set(source.id, (identityCounts.get(source.id) ?? 0) + 1);
  const stablePrimitiveIds = new Set(
    [...definitions.values()]
      .filter(
        ({ id, source }) =>
          id === source.id && identityCounts.get(source.id) === 1,
      )
      .map(({ id }) => id),
  );
  return {
    objects,
    instances,
    stablePrimitiveIds,
    states: compact.map((layout) =>
      Object.fromEntries(ids.map((id, i) => [id, layout[i]])),
    ),
  };
}
