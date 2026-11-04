import { createWorld } from "../../src/world-builder/runtime";
import { decodeAudio } from "../../src/world-builder/audio";
import { exportTake, hash, png } from "../../src/world-builder/export-take";
import { withAudioCompanion } from "../../src/world-builder/take-audio";
import { buildAcousticSchedule } from "../../src/world-builder/acoustic-schedule";
import { renderDynamicRoomAudio } from "../../src/world-builder/dynamic-room-audio";
import { roomSoundReceipt } from "../../src/world-builder/room-sound-receipt";
import { evaluateScene } from "../../src/world-builder/evaluate-scene";
import { createStudy, type Cue, type Study } from "./recipes";
import { studyRegions } from "./regions";
import { SCENE_MAPPING_RANGES } from "../../src/world-builder/scene-state";

export interface Reactivity {
  /** "auto": per band, scale so the 95th percentile is 0.8, clamped to 1. */
  bandGain: number | "auto";
  /** Multiplies every mapping amount within its range; >1 sets intensity 1. */
  motionGain: number;
  /** Camera radius override in world units; null keeps the study's own. */
  radius?: number | null;
  /** Camera orbit in degrees over the take; null keeps the study's own. */
  orbit?: number | null;
  /** Place the idle mannequin in the scene (room studies: a listener to read scale). */
  avatar?: boolean;
  /** Camera elevation in degrees; null keeps the study's own. */
  elevation?: number | null;
  /** Moving-average window in frames applied to each band before gain (1 = off): slower, gentler motion. */
  bandSmooth?: number;
  /** Peak follower: instant attack, exponential release over this many frames (0 = off). Holds a hit instead of jittering. */
  bandRelease?: number;
  /** Stage look override ("studio" draws a lit floor so the ground turns with the camera). */
  stage?: string | null;
  /** Band that drives the open/closed blend and every "low" mapping; null keeps the study's own ("low"). */
  band?: "sub" | "low" | "mid" | "high" | "level" | null;
}

function percentile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  );
}

function smooth(values: number[], window: number) {
  if (!(window > 1)) return values;
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const lo = Math.max(0, i - half),
      hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += values[k];
    return sum / (hi - lo + 1);
  });
}

function follow(values: number[], release: number) {
  if (!(release > 0)) return values;
  const decay = Math.exp(-1 / release);
  let v = 0;
  return values.map((x) => (v = Math.max(x, v * decay)));
}

export function scaleBands<T extends Record<string, number[] | undefined>>(
  bands: T,
  gain: number | "auto",
  window = 1,
  release = 0,
): { bands: T; gains: Record<string, number> } {
  const gains: Record<string, number> = {};
  const out = { ...bands };
  for (const [name, raw] of Object.entries(bands)) {
    if (!raw?.length) continue;
    const data = follow(smooth(raw, window), release);
    const p95 = percentile(data, 0.95);
    const g = gain === "auto" ? (p95 > 0 ? 0.8 / p95 : 1) : gain;
    gains[name] = Number(g.toFixed(4));
    (out as Record<string, number[]>)[name] = data.map((v) =>
      Math.min(1, Math.max(0, v * g)),
    );
  }
  return { bands: out, gains };
}
import { assertAudioExcerpt, serializeRecipe } from "./contracts";

declare global {
  interface Window {
    savePilotFile(name: string, bytes: number[]): Promise<void>;
  }
}

export async function captureStudy(
  study: Study,
  dimensions: { width: number; height: number; frames: number },
  cues?: Cue[],
  reactivity: Reactivity = {
    bandGain: 1,
    motionGain: 1,
    radius: null,
    orbit: null,
  },
) {
  const source = await (await fetch("/__pilot_track")).blob();
  const track = await decodeAudio(source);
  assertAudioExcerpt(track, dimensions.frames);
  const scaled = scaleBands(
    track.bands!,
    reactivity.bandGain,
    reactivity.bandSmooth ?? 1,
    reactivity.bandRelease ?? 0,
  );
  const { recipe, metadata } = createStudy(
    study,
    {
      envelope: track.envelope,
      bandEnvelopes: scaled.bands,
    },
    dimensions,
    cues,
  );
  if (recipe.motion && reactivity.motionGain !== 1) {
    for (const mapping of recipe.motion.mappings) {
      const [lo, hi] = SCENE_MAPPING_RANGES[mapping.property];
      mapping.amount = Math.min(
        hi,
        Math.max(lo, mapping.amount * reactivity.motionGain),
      );
    }
    if (reactivity.motionGain > 1) recipe.motion.intensity = 1;
    // A band-driven open/closed blend scales with the same knob (bounded at 2).
    const blend = recipe.motion.morphControl;
    if (blend?.enabled)
      blend.progress.amount = Math.min(
        2,
        blend.progress.amount * reactivity.motionGain,
      );
  }
  // Retarget the walls' driver: the blend's progress source and the "low"
  // room/size mappings follow the chosen band; mid/high mappings keep theirs.
  if (reactivity.band && recipe.motion) {
    const blend = recipe.motion.morphControl;
    if (blend?.enabled) blend.progress.source = reactivity.band;
    for (const mapping of recipe.motion.mappings)
      if (mapping.source === "low") mapping.source = reactivity.band;
  }
  // A camera pushed by the low band (falling, cathedral) follows the same band.
  const push = recipe.cameraMotion?.audio;
  if (reactivity.band && push?.enabled && push.source === "low")
    push.source = reactivity.band;
  if (reactivity.radius != null) recipe.radius = reactivity.radius;
  if (reactivity.orbit != null) recipe.orbit = reactivity.orbit;
  if (reactivity.elevation != null) recipe.elevation = reactivity.elevation;
  if (reactivity.stage === "studio" || reactivity.stage === "dark-grid")
    recipe.stageLook = reactivity.stage;
  // A study that casts its own figure (fruit-dance, room-walls, pyramid-inside)
  // keeps its pose and clip; the flag only adds the idle listener elsewhere.
  if (reactivity.avatar && !recipe.avatar) {
    recipe.avatar = true;
    recipe.avatarAsset = "mannequin";
    recipe.avatarMotion = "idle";
    // Inside the room, a step off centre so the camera sees the figure against the far wall.
    recipe.avatarPose = { x: -1.1, y: 0, z: 0.6, yaw: 0.6 };
  }
  Object.assign(metadata, {
    reactivity: {
      radius: recipe.radius,
      orbit: recipe.orbit,
      avatar: recipe.avatar,
      elevation: recipe.elevation,
      bandSmooth: reactivity.bandSmooth ?? 1,
      bandRelease: reactivity.bandRelease ?? 0,
      stage: recipe.stageLook ?? null,
      bandGain: reactivity.bandGain,
      band: recipe.motion?.morphControl?.progress.source ?? null,
      bandGainsApplied: scaled.gains,
      motionGain: reactivity.motionGain,
      intensity: recipe.motion?.intensity ?? null,
      mappings: recipe.motion?.mappings ?? [],
      blendAmount: recipe.motion?.morphControl?.progress.amount ?? null,
    },
  });
  const recipeFile = serializeRecipe(recipe);
  const save = async (name: string, blob: Blob) =>
    window.savePilotFile(
      `${study}/${name}`,
      Array.from(new Uint8Array(await blob.arrayBuffer())),
    );
  const json = (name: string, data: unknown) =>
    save(
      name,
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const world = createWorld(canvas, () => {});
  try {
    if (world.kind !== "webgl")
      throw new Error("Real WebGL is required for pilot captures.");
    world.configure(recipe);
    const samples = [
      ...new Set([
        0,
        Math.floor(recipe.frames / 2),
        recipe.frames - 1,
        ...recipe.motion!.stateKeys.map((key) => key.frame),
      ]),
    ].sort((a, b) => a - b);
    const hashes: Record<string, string> = {};
    for (const frame of samples) {
      await world.renderFrame(frame);
      const image = await png(canvas);
      hashes[frame] = await hash(image);
      await save(`frame-${String(frame).padStart(3, "0")}.png`, image);
    }
    for (const frame of [...samples].reverse()) {
      await world.renderFrame(frame);
      if ((await hash(await png(canvas))) !== hashes[frame])
        throw new Error(`Non-deterministic frame ${frame}.`);
    }
    world.beginCapture();
    const take = await exportTake(
      recipe,
      world,
      new AbortController().signal,
      (frame) => {
        if (frame === 1 || frame % 48 === 0 || frame === recipe.frames)
          console.log(`PILOT ${study}: ${frame}/${recipe.frames} frames`);
      },
      study,
    );
    world.endCapture();
    await withAudioCompanion(take, track, recipe.frames);
    for (const [name, blob] of [
      ["rgb.webm", take.video],
      ["depth.webm", take.depth],
      ["first.png", take.first],
      ["depth-first.png", take.depthFirst],
      ["control.wav", take.audio],
      ["capture.json", take.manifest],
    ] as const)
      if (blob) await save(name, blob);
    await save(
      "recipe.json",
      new Blob([recipeFile.text], { type: "application/json" }),
    );
    const measuredFrames = samples.map((frame) => {
      const evaluated = evaluateScene(recipe, frame);
      return {
        frame,
        objectCount: evaluated.objects.length,
        room: evaluated.room ?? null,
      };
    });
    let sound: unknown = null;
    if (recipe.motion?.room) {
      // This explicit control copy is emitted sound; wet output never feeds analysis.
      const schedule = buildAcousticSchedule(recipe, { maxIRSeconds: 4 });
      const rendered = await renderDynamicRoomAudio(track, schedule, {
        wet: 1,
        dry: 0,
        tail: "extend",
        onProgress: (done, total) => {
          if (done === total)
            console.log(`PILOT ${study}: ${total} CPU room responses rendered`);
        },
      });
      const receipt = await roomSoundReceipt(
        recipe,
        {
          label: "Explicit copy of pilot control excerpt",
          origin: "control-copy",
          blob: source,
          sha256: await hash(source),
          track,
        },
        rendered,
      );
      await save("room-wet.wav", rendered.wav);
      await json("room-sound.json", receipt);
      sound = {
        snapshots: schedule.snapshots.length,
        tailSeconds: rendered.tailSeconds,
        approximation: schedule.approximation,
        irs: rendered.irs,
        output: receipt.output,
      };
    }
    const report = {
      ...metadata,
      renderer: world.kind,
      frameCount: recipe.frames,
      fps: recipe.fps,
      duration: recipe.frames / recipe.fps,
      lastSampleSeconds: (recipe.frames - 1) / recipe.fps,
      recipeBytes: recipeFile.bytes,
      reverseSeekExact: true,
      sampleFrameHashes: hashes,
      measuredFrames,
      sound,
      // Frame-0 swap rectangles; keyframes.mjs copies them into keyframes.json.
      regions: studyRegions(study, recipe),
    };
    await json("study.json", report);
    return report;
  } finally {
    world.dispose();
    canvas.remove();
  }
}
