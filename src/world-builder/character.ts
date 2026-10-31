import { LOCAL_MOTIONS } from "../scene3d/creature-slots";
import type { CharacterPose } from "../../shared/scene/characters";
import type { WalkState } from "./walk-motion";
import { walkPose } from "./walk-motion";
/** Builder adapter for #112's fixed character catalogue and local VRM loader. */
import * as T from "three";
import { characterGroup, prepareCharacters } from "../scene3d/characters";
import { localCreature } from "../scene3d/creature";
import {
  creatureMotionReceipt,
  creatureMotions,
} from "../scene3d/creature-fbx";
import { disposeMaterial } from "../scene3d/material-resources";
import { CREATURE_SHA256 } from "../../shared/scene/creature-reference";
import type { Recipe } from "./recipe";
import { blobActor, blobCycle } from "./blob";
import { firstClip, motionClips } from "./motion";
import { loopedMotionAt } from "./loop";

function assertCreature(recipe: Recipe) {
  if (recipe.avatarAsset !== "creature") return;
  if (!localCreature())
    throw new Error(
      "Load the local Creature VRM under Scene → Creature model & motion.",
    );
  for (const clip of motionClips(recipe.avatarMotion))
    if (LOCAL_MOTIONS.includes(clip) && !creatureMotions.has(clip))
      throw new Error(
        `Assign a local FBX to the ${clip} motion slot before preview or capture.`,
      );
  const reference = recipe.creatureReference;
  if (reference && reference.sha256 !== CREATURE_SHA256)
    throw new Error("Reattach the Creature VRM matching this recipe.");
  const motions = creatureMotionReceipt();
  for (const [pose, expected] of Object.entries(reference?.motions ?? {}))
    if (motions[pose]?.sha256 !== expected.sha256)
      throw new Error(
        `Reattach the saved ${pose} FBX motion before preview or capture.`,
      );
}

export function createBuilderCharacter(world: T.Scene, onTheme = () => {}) {
  let actor: ReturnType<typeof characterGroup> | undefined;
  let blob: ReturnType<typeof blobActor> | undefined;
  let signature = "";
  let disposed = false;
  const root = new T.Group();
  world.add(root);
  function clear() {
    blob?.dispose();
    (actor?.group ?? blob?.group)?.traverse((node) => {
      if (!(node instanceof T.Mesh)) return;
      node.geometry.dispose();
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        disposeMaterial(material);
      if (node instanceof T.SkinnedMesh) node.skeleton.dispose();
    });
    root.clear();
    actor = undefined;
    blob = undefined;
    signature = "";
    lastPose = undefined;
  }
  const visible = (r: Recipe) =>
    r.avatar && r.avatarAsset !== "mannequin" && r.scene !== "neuro";
  const signatureOf = (r: Recipe) =>
    JSON.stringify([
      r.avatarAsset,
      r.creatureReference,
      creatureMotionReceipt(),
    ]);
  /** Load assets without touching the live actor; the caller guards the commit. */
  async function prepare(r: Recipe): Promise<() => void> {
    if (disposed) throw new Error("Scene was closed.");
    const spec = {
      characters: [
        {
          id: "builder-subject",
          asset:
            r.avatarAsset === "blob" ? ("mannequin" as const) : r.avatarAsset,
          pose: firstClip(r.avatarMotion),
          position: [0, 0, 0] as [number, number, number],
          rotationY: 0,
          scale: 1,
        },
      ],
    };
    if (visible(r)) {
      assertCreature(r);
      if (r.avatarAsset !== "blob" && signatureOf(r) !== signature)
        await prepareCharacters(spec);
    }
    if (disposed) throw new Error("Scene was closed.");
    return () => {
      if (disposed) throw new Error("Scene was closed.");
      const show = visible(r);
      if (show) {
        // A local model or motion attachment may have changed during preload.
        assertCreature(r);
        const next = signatureOf(r);
        if (next !== signature) {
          // Construct before clearing: a failed clone keeps the current actor.
          const nextBlob =
            r.avatarAsset === "blob" ? blobActor(onTheme) : undefined;
          const nextActor = nextBlob ? undefined : characterGroup(spec);
          clear();
          blob = nextBlob;
          actor = nextActor;
          root.add((actor ?? blob)!.group);
          signature = next;
        }
      }
      root.visible = show;
    };
  }
  let lastPose: CharacterPose | undefined,
    started = 0;
  return {
    prepare,
    root,
    freeze: () => blob?.freeze(),
    thaw: () => blob?.thaw(),
    appearance: () => blob?.appearance(),
    /** Sample the recipe's motion at a frame of the take's grid. */
    sample(r: Recipe, frame: number) {
      root.visible = visible(r);
      const { clip, time, hold } = loopedMotionAt(r, frame, (name) =>
        actor ? actor.duration(name as CharacterPose) : blobCycle(name),
      );
      actor?.setPose(clip);
      actor?.sample(hold ? Math.min(time, actor.duration(clip) * 0.999) : time);
      blob?.sample(time, clip);
    },
    walk(r: Recipe, seconds: number, state: WalkState) {
      if (!visible(r)) return;
      const pose = walkPose(
        r.avatarAsset,
        firstClip(r.avatarMotion),
        state,
        creatureMotions,
      );
      if (pose !== lastPose || state.restart) {
        lastPose = pose;
        started = seconds;
      }
      const elapsed = Math.max(0, seconds - started);
      actor?.setPose(pose);
      const oneShot = state.jumping
        ? 1.1
        : state.action && state.action !== "ninja"
          ? 2
          : 0;
      actor?.sample(
        oneShot
          ? Math.min(0.999, elapsed / oneShot) * actor.duration(pose)
          : elapsed,
        true,
      );
      blob?.sample(elapsed, pose);
    },
    assertReady(r: Recipe) {
      if (!visible(r)) return;
      assertCreature(r);
      if ((!actor && !blob) || !signature)
        throw new Error(
          "Character not ready. Re-select it after loading its files.",
        );
    },
    dispose() {
      disposed = true;
      clear();
      root.removeFromParent();
    },
  };
}
