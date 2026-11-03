import { canonical } from "../../shared/memory/state";
import { evaluateScene } from "./evaluate-scene";
import { cameraAt, cameraTargetAt, cameraFovAt, type Recipe } from "./recipe";

export async function sceneDigest(value: unknown) {
  const bytes = new TextEncoder().encode(canonical(value));
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}

/** Stored beside the existing per-pass hashes and frozen recipe, never the live editor. */
export async function sceneCaptureInfo(recipe: Recipe) {
  if (!recipe.motion) return undefined;
  const first = evaluateScene(recipe, 0);
  return {
    evaluator: "genobi-scene-v1",
    motionVersion: recipe.motion.version,
    recipeSha256: await sceneDigest(recipe),
    analysis: recipe.bandEnvelopes.sub?.length
      ? "builder-level-crossover-sub-envelope-v2"
      : "builder-level-crossover-envelope-v1",
    controlEnvelopeSha256: await sceneDigest({
      level: recipe.envelope,
      ...recipe.bandEnvelopes,
    }),
    firstGeometrySha256: await sceneDigest({
      objects: first.objects,
      room: first.room,
      camera: {
        position: cameraAt(recipe, 0),
        target: cameraTargetAt(recipe, 0),
        fov: cameraFovAt(recipe, 0),
      },
    }),
    stateIds: recipe.motion.stateKeys.map((key) => key.id),
    instanceCount: recipe.motion.instances?.count ?? 0,
    acousticRoom: recipe.motion.room?.id ?? null,
    controlAudioRole: "motion-control",
    depthRole: "aligned-guide-pass-not-automatic-LTX-conditioning",
  };
}
