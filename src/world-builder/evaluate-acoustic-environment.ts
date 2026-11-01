import { avatarPoseAt } from "./avatar-path";
import { evaluateScene } from "./evaluate-scene";
import { cameraAt, type Recipe } from "./recipe";
import { acousticZoneAt, acousticZoneAbsorption } from "./scene-acoustic-zones";
import { clampRoomPoint } from "./scene-room";
import type { AcousticRoom } from "./scene-room-ir";
import type { SceneVector } from "./scene-state";

export interface AcousticZoneEvidence {
  id: string | null;
  label: string;
  kind: "room" | "outdoor" | "outside";
  approximation?: "shoebox" | "open-shaft-proxy";
  openingsAreaM2?: number;
}
export type AcousticEnvironment =
  | {
      kind: "room";
      room: AcousticRoom;
      zone: AcousticZoneEvidence;
    }
  | {
      kind: "dry";
      room: null;
      zone: AcousticZoneEvidence;
    };

/** World listener follows the same picture clock; a mannequin ear stays human-sized. */
export function acousticListenerAt(recipe: Recipe, frame: number): SceneVector {
  if (recipe.motion?.acousticListener === "avatar") {
    const pose = avatarPoseAt(recipe, frame);
    return [pose.x, pose.y + 1.65, pose.z];
  }
  return cameraAt(recipe, frame) as SceneVector;
}

/** One active enclosure at a time. Outside space is dry, never an inferred box. */
export function evaluateAcousticEnvironment(
  recipe: Recipe,
  frame: number,
): AcousticEnvironment {
  const zones = recipe.motion?.acousticZones;
  if (zones) {
    const listener = acousticListenerAt(recipe, frame);
    const zone = acousticZoneAt(zones, listener);
    if (!zone || zone.kind === "outdoor")
      return {
        kind: "dry",
        room: null,
        zone: {
          id: zone?.id ?? null,
          label: zone?.label ?? "Outside acoustic zones",
          kind: zone?.kind ?? "outside",
        },
      };
    const openingsAreaM2 = (zone.openings ?? []).reduce(
      (sum, opening) => sum + opening.areaM2,
      0,
    );
    return {
      kind: "room",
      room: {
        id: zone.id,
        dimensions: [...zone.dimensions],
        center: [...zone.center],
        source: [...zone.source],
        listener: clampRoomPoint(
          listener.map((v, axis) => v - zone.center[axis]) as SceneVector,
          zone.dimensions,
        ),
        absorption: acousticZoneAbsorption(zone),
        seed: zone.seed,
      },
      zone: {
        id: zone.id,
        label: zone.label,
        kind: "room",
        openingsAreaM2,
        approximation: openingsAreaM2 > 0 ? "open-shaft-proxy" : "shoebox",
      },
    };
  }
  const room = evaluateScene(recipe, frame).room;
  if (!room)
    return {
      kind: "dry",
      room: null,
      zone: { id: null, label: "No acoustic enclosure", kind: "outside" },
    };
  return {
    kind: "room",
    room: structuredClone({
      id: room.id,
      dimensions: room.dimensions,
      center: room.center,
      source: room.source,
      listener: room.listener,
      absorption: room.absorption,
      seed: room.seed,
    }),
    zone: {
      id: room.id,
      label: room.id,
      kind: "room",
      approximation: "shoebox",
      openingsAreaM2: 0,
    },
  };
}
