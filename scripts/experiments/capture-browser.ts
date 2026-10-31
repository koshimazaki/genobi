import { createWorld } from "../../src/world-builder/runtime";
import { decodeAudio } from "../../src/world-builder/audio";
import { exportTake, hash, png } from "../../src/world-builder/export-take";
import { withAudioCompanion } from "../../src/world-builder/take-audio";
import { buildAcousticSchedule } from "../../src/world-builder/acoustic-schedule";
import { renderDynamicRoomAudio } from "../../src/world-builder/dynamic-room-audio";
import { roomSoundReceipt } from "../../src/world-builder/room-sound-receipt";
import { evaluateScene } from "../../src/world-builder/evaluate-scene";
import { createStudy, type Cue, type Study } from "./recipes";
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
) {
  const source = await (await fetch("/__pilot_track")).blob();
  const track = await decodeAudio(source);
  assertAudioExcerpt(track, dimensions.frames);
  const { recipe, metadata } = createStudy(
    study,
    {
      envelope: track.envelope,
      bandEnvelopes: track.bands!,
    },
    dimensions,
    cues,
  );
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
    };
    await json("study.json", report);
    return report;
  } finally {
    world.dispose();
    canvas.remove();
  }
}
