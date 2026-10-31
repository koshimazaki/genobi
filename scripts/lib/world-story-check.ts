import { PerspectiveCamera, Vector3 } from "three";
import {
  analyseBands,
  audioWav,
  rmsEnvelope,
} from "../../src/world-builder/audio";
import { avatarPoseAt } from "../../src/world-builder/avatar-path";
import { evaluateScene } from "../../src/world-builder/evaluate-scene";
import { exportTake } from "../../src/world-builder/export-take";
import {
  cameraAt,
  cameraFovAt,
  cameraTargetAt,
  validateRecipe,
} from "../../src/world-builder/recipe";
import { createWorld } from "../../src/world-builder/runtime";
import {
  avenueParts,
  descentParts,
} from "../../src/world-builder/story-descent-layout";
import { createStoryPreset } from "../../src/world-builder/story-presets";
import { withDescentView } from "../../src/world-builder/story-camera";

declare global {
  interface Window {
    writeStoryEvidence(name: string, bytes: number[]): Promise<void>;
    runWorldStoryProof(ids?: string[]): Promise<unknown[]>;
  }
}
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const digest = async (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
const write = async (name: string, blob: Blob) =>
  window.writeStoryEvidence(
    name,
    Array.from(new Uint8Array(await blob.arrayBuffer())),
  );

/** Original deterministic bass/hat test beat, subsequently measured by the app. */
function measuredBeat(frames: number) {
  const sampleRate = 48000,
    channel = new Float32Array(frames * 2000);
  let random = 441;
  for (let i = 0; i < channel.length; i++) {
    const time = i / sampleRate,
      beat = time % 0.5,
      hat = (time + 0.25) % 0.5;
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const bass =
      0.75 *
      Math.sin(2 * Math.PI * (62 * beat + 8 * (1 - Math.exp(-beat * 24)))) *
      Math.exp(-beat * 9) *
      Math.min(1, beat * 600);
    const hiss = ((random / 0xffffffff) * 2 - 1) * 0.65 * Math.exp(-hat * 35);
    channel[i] = Math.max(-0.95, Math.min(0.95, bass + hiss));
  }
  const channels = [channel];
  return {
    channels,
    sampleRate,
    envelope: rmsEnvelope(channels, sampleRate),
    bands: analyseBands(channels, sampleRate),
  };
}

window.runWorldStoryProof = async (ids) => {
  const reports = [];
  const known = ["endless-descent", "descent-follow", "bass-avenue"];
  check(
    !ids || ids.every((id) => known.includes(id)),
    "Unknown story proof view.",
  );
  for (const id of ids ?? known) {
    const descent = id !== "bass-avenue";
    const view = id === "endless-descent" ? "first-person" : "follow";
    const preset = createStoryPreset(descent ? "endless-descent" : id);
    const base = descent ? withDescentView(preset, view) : preset;
    const track = measuredBeat(base.frames);
    const recipe = validateRecipe({
      ...base,
      width: 640,
      height: 384,
      envelope: track.envelope,
      bandEnvelopes: track.bands,
    });
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const world = createWorld(canvas, () => {});
    const copy = document.createElement("canvas");
    copy.width = recipe.width;
    copy.height = recipe.height;
    const context = copy.getContext("2d", { willReadFrequently: true })!;
    const pixels = () => {
      context.drawImage(canvas, 0, 0);
      return context.getImageData(0, 0, recipe.width, recipe.height).data;
    };
    const hash = async () => digest(new Uint8Array(pixels()));
    const rgb: string[] = [],
      depth: string[] = [];
    const picks = descent
      ? ([
          [96, "City"],
          [212, "Cathedral"],
          [312, "Club"],
          [380, "DJ studio"],
        ] as const)
      : ([
          [0, "Street"],
          [48, "Bass squeeze"],
          [96, "Camera sway"],
          [144, "Taxi shuffle"],
        ] as const);
    const sheet = new OffscreenCanvas(
      recipe.width * 2,
      (recipe.height + 28) * 2,
    );
    const paper = sheet.getContext("2d")!;
    paper.fillStyle = "#0b1018";
    paper.fillRect(0, 0, sheet.width, sheet.height);
    paper.fillStyle = "#eef1e8";
    paper.font = "18px sans-serif";
    let minBodyHeight = Infinity,
      maxCameraStep = 0,
      previousY = Infinity;
    const projection = new PerspectiveCamera(
      60,
      recipe.width / recipe.height,
      0.05,
      600,
    );
    const characterPixels = [];
    try {
      world.configure(recipe);
      world.beginCapture();
      await world.renderFrame(0);
      const gl = canvas.getContext("webgl2")!;
      check(gl, "Real WebGL2 context is required.");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      for (let index = 0; index < picks.length; index++) {
        const [frame, label] = picks[index];
        await world.renderFrame(frame);
        const withCharacter = pixels();
        paper.drawImage(
          canvas,
          (index % 2) * recipe.width,
          Math.floor(index / 2) * (recipe.height + 28) + 28,
        );
        paper.fillText(
          `${label} · frame ${frame}`,
          (index % 2) * recipe.width + 12,
          Math.floor(index / 2) * (recipe.height + 28) + 20,
        );
        if (recipe.avatar) {
          world.configure({ ...recipe, avatar: false });
          await world.renderFrame(frame);
          const empty = pixels();
          let changed = 0;
          for (let i = 0; i < empty.length; i += 4)
            if (
              Math.abs(empty[i] - withCharacter[i]) +
                Math.abs(empty[i + 1] - withCharacter[i + 1]) +
                Math.abs(empty[i + 2] - withCharacter[i + 2]) >
              24
            )
              changed++;
          check(
            changed > 100,
            `Mannequin is missing or occluded at ${id}/${frame}.`,
          );
          characterPixels.push({ frame, changedPixels: changed });
          world.configure(recipe);
        }
      }
      await write(
        `${id}-contact.png`,
        await sheet.convertToBlob({ type: "image/png" }),
      );
      const roles = descent ? descentParts() : avenueParts();
      const audioChecks = [];
      for (const [source, role] of [
        ["low", "tower"],
        ["high", "taxi"],
      ] as const) {
        // Inspect each moving subject while it is actually in the saved shot.
        const start = id === "descent-follow" && source === "high" ? 160 : 0;
        const end = descent
          ? id === "descent-follow" && source === "high"
            ? 192
            : 96
          : recipe.frames;
        const visibleEnergy = track.bands[source].slice(start, end);
        const peak = start + visibleEnergy.indexOf(Math.max(...visibleEnergy));
        const quiet = {
          ...recipe,
          envelope: [],
          bandEnvelopes: { sub: [], low: [], mid: [], high: [] },
        };
        const driven = {
          ...quiet,
          bandEnvelopes: {
            ...quiet.bandEnvelopes,
            [source]: track.bands[source],
          },
        };
        const before = evaluateScene(quiet, peak).objects,
          after = evaluateScene(driven, peak).objects;
        const moving = { tower: 0, taxi: 0 };
        before.forEach((part, index) => {
          const change = [
            "x",
            "y",
            "z",
            "scale",
            "scaleX",
            "scaleY",
            "scaleZ",
          ].some(
            (field) =>
              Math.abs(
                ((part[field as keyof typeof part] as number) ?? 1) -
                  ((after[index][field as keyof typeof part] as number) ?? 1),
              ) > 1e-8,
          );
          if (change) {
            const changedRole = roles[index].role;
            check(
              changedRole === "tower" || changedRole === "taxi",
              `${source} moved static geometry.`,
            );
            moving[changedRole as "tower" | "taxi"]++;
          }
        });
        check(moving[role] > 0, `${source} did not move its authored subject.`);
        check(
          JSON.stringify(cameraAt(quiet, peak)) ===
            JSON.stringify(cameraAt(driven, peak)),
          "Audio changed camera travel.",
        );
        world.configure(quiet);
        await world.renderFrame(peak);
        const silentHash = await hash();
        world.configure(driven);
        await world.renderFrame(peak);
        const drivenHash = await hash();
        check(
          silentHash !== drivenHash,
          `${source} produces no visible response.`,
        );
        audioChecks.push({
          source,
          peakFrame: peak,
          measuredPeak: track.bands[source][peak],
          movingParts: moving,
          interpretation:
            "Whole-pose pull can also relax the other timed deformation.",
          staticPartsUnchanged: true,
          cameraUnchanged: true,
          visiblePixelChange: true,
        });
      }
      world.configure(recipe);
      const take = await exportTake(
        recipe,
        {
          async renderFrame(frame) {
            const result = await world.renderFrame(frame);
            const frameHash = await hash();
            if (rgb[frame])
              check(
                rgb[frame] === frameHash,
                `Repeated RGB frame changed ${id}/${frame}.`,
              );
            rgb[frame] = frameHash;
            if (frame < recipe.frames) {
              const position = cameraAt(recipe, frame);
              if (frame > 0) {
                if (descent)
                  check(
                    position[1] < previousY,
                    `Camera stops or rises at ${frame}.`,
                  );
                maxCameraStep = Math.max(
                  maxCameraStep,
                  Math.hypot(
                    ...position.map(
                      (v, axis) => v - cameraAt(recipe, frame - 1)[axis],
                    ),
                  ),
                );
              }
              previousY = position[1];
              projection.position.fromArray(position);
              projection.fov = cameraFovAt(recipe, frame);
              projection.lookAt(...cameraTargetAt(recipe, frame));
              projection.updateProjectionMatrix();
              projection.updateMatrixWorld();
              const p = avatarPoseAt(recipe, frame),
                feet = new Vector3(p.x, p.y, p.z).project(projection),
                head = new Vector3(p.x, p.y + 1.8, p.z).project(projection);
              if (recipe.avatar) {
                check(
                  Math.abs(feet.y) < 0.9 &&
                    Math.abs(head.y) < 0.9 &&
                    head.z < 1,
                  `Human reference left the frame at ${frame}.`,
                );
                minBodyHeight = Math.min(minBodyHeight, (head.y - feet.y) / 2);
              } else
                check(
                  cameraTargetAt(recipe, frame)[1] < position[1],
                  "POV must look down.",
                );
            }
            return result;
          },
          async renderDepthFrame(frame) {
            const result = await world.renderDepthFrame(frame);
            depth[frame] = await hash();
            check(
              depth[frame] !== rgb[frame],
              `Depth matches RGB at ${frame}.`,
            );
            return result;
          },
        },
        new AbortController().signal,
        (frame) => {
          if (frame % 48 === 1 || frame === recipe.frames)
            console.log(`STORY_PROOF ${id} capture ${frame}/${recipe.frames}`);
        },
        `world-story-${id}`,
      );
      // Keep the actual take available even if a later parity check fails.
      await write(`${id}-colour.webm`, take.video);
      await write(`${id}-depth.webm`, take.depth!);
      await write(
        `${id}-audio.wav`,
        audioWav(track, recipe.frames / recipe.fps),
      );
      for (let frame = recipe.frames - 1; frame >= 0; frame--) {
        await world.renderFrame(frame);
        check(
          (await hash()) === rgb[frame],
          `Reverse RGB seek changed ${id}/${frame}.`,
        );
        await world.renderDepthFrame(frame);
        check(
          (await hash()) === depth[frame],
          `Reverse depth seek changed ${id}/${frame}.`,
        );
        if (frame % 48 === 0)
          console.log(
            `STORY_PROOF ${id} reverse ${recipe.frames - frame}/${recipe.frames}`,
          );
      }
      const manifest = JSON.parse(await take.manifest.text());
      reports.push({
        id,
        view: descent ? view : "street",
        renderer,
        dimensions: [recipe.width, recipe.height],
        frameCount: manifest.frameCount,
        ltxTiming: manifest.ltxTiming,
        duration: manifest.duration,
        fullReverseRgbAndDepthParity: true,
        distinctRgbDepthFrames: recipe.frames,
        rgbFrameDigest: await digest(new TextEncoder().encode(rgb.join(""))),
        depthFrameDigest: await digest(
          new TextEncoder().encode(depth.join("")),
        ),
        ...(recipe.avatar
          ? { minimumReferenceHeightFraction: minBodyHeight }
          : { hiddenMannequin: true }),
        maxCameraStepMetres: maxCameraStep,
        characterPixels,
        audioChecks,
        audio:
          "Dry original deterministic 120 BPM bass/hat fixture, measured by analyseBands. This capture does not apply room convolution or drum-event detection.",
        recipeBytes: JSON.stringify(recipe).length,
      });
    } finally {
      world.endCapture();
      world.dispose();
      canvas.remove();
    }
  }
  return reports;
};
