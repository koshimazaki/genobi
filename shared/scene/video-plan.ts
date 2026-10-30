/** A local ComfyUI handoff, never a provider submission or a paid quote. */
import template from "../../docker/akuspace/workflows/akuspace-i2v.json";
import { playblastFrames, PLAYBLAST_FPS } from "../camera-path-playblast";
import type { ApiGraph } from "../comfy/slots";
import { roomAcoustics } from "./acoustics";
import { parseScene, fail, cleanText, number } from "./parse";
import { CHARACTER_MODELS } from "./character-catalog";
import type { SceneSpec } from "./types";

function inputName(value: unknown, fallback: string, suffix: RegExp) {
  const name = value === undefined ? fallback : value;
  if (
    typeof name !== "string" ||
    name.length > 100 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) ||
    !suffix.test(name)
  )
    fail("Use a short input filename without folders.");
  return name as string;
}

export function sceneVideoPlan(
  document: unknown,
  options: {
    firstFrame?: unknown;
    referenceAudio?: unknown;
    duration?: unknown;
    camera?: unknown;
    prompt?: unknown;
  } = {},
) {
  const scene = parseScene(document);
  const image = inputName(
    options.firstFrame,
    `${scene.id}-first-frame.png`,
    /\.(png|jpg|jpeg|webp)$/i,
  );
  const audio = inputName(
    options.referenceAudio,
    `${scene.id}-dry.wav`,
    /\.(wav|mp3|flac|ogg|m4a)$/i,
  );
  const frames = playblastFrames(
    number(options.duration ?? 5, 1, 10, "Duration"),
  );
  const camera = cleanText(
    options.camera ?? "A slow, steady push in.",
    500,
    "Camera",
  );
  const acoustics = roomAcoustics(scene);
  const room =
    acoustics?.nearestPreset.id ??
    (scene.content.kind === "acoustic-room" ? scene.content.room : undefined);
  const night = /city|tokyo|night/i.test(`${scene.id} ${scene.label}`);
  const treatment = room
    ? { mode: "room", preset: room, level: "mid" }
    : {
        mode: "outside",
        preset: night ? "outdoor_night" : "outdoor_day",
        level: "low",
      };
  const actors = scene.characters?.length
    ? `${scene.characters.length} actors: ${scene.characters.map((c) => `${c.id} (${c.asset}) ${c.pose}`).join(", ")}.`
    : "";
  const prompt = cleanText(
    options.prompt ??
      `${scene.summary} ${actors} Keep the first frame's layout and subject placement, replacing the primitive blockout with a cinematic finished scene. ${camera}`,
    1800,
    "Video prompt",
  );
  const graph = structuredClone(template) as ApiGraph;
  const inputs = (id: string) =>
    (graph[id] as { inputs: Record<string, unknown> }).inputs;
  inputs("90").image = image;
  inputs("40").audio = audio;
  inputs("30").value = frames;
  inputs("31").value = PLAYBLAST_FPS;
  inputs("41").duration = frames / PLAYBLAST_FPS;
  Object.assign(inputs("12"), {
    text: prompt,
    source_type: "none",
    space_mode: room ? "Room" : "Space",
    application: room ? "Moderate" : night ? "Night" : "Day",
    room_preset: room ?? "medium_room",
    effect_level: "mid",
    outdoor_time: night ? "night" : "day",
    sfx_level: "low",
  });
  inputs("65").filename_prefix = `video/${scene.id}-akuspace`;
  inputs("66").filename_prefix = `audio/${scene.id}-akuspace`;
  return {
    format: "genobi.scene-video-plan.v1",
    sceneId: scene.id,
    revision: scene.revision,
    execution: "local-comfy-handoff",
    submitted: false,
    conditioning: "first-frame-image",
    cameraConditioning: "prompt-only",
    firstFrame: image,
    referenceAudio: audio,
    frames,
    fps: PLAYBLAST_FPS,
    prompt,
    treatment,
    acoustics,
    graph,
    requiredInputs: [image, audio],
    notes: [
      "Upload the first-frame PNG and a real dry reference recording into ComfyUI input before running.",
      "This image-conditioned graph includes the AKUSPACE LoRA; it does not consume the camera-path JSON or playblast video.",
      "The camera prompt suggests motion; exact 3D motion/layout control is a separate integration.",
      "Use the pinned AKUSPACE Docker image and its verify command. Models, GPU and node readiness still need checking.",
      "No generation, provider submission or licence clearance is performed by exporting this plan.",
    ],
  };
}

export function sceneVideoReadme(
  scene: SceneSpec,
  plan: ReturnType<typeof sceneVideoPlan>,
) {
  return `# ${scene.label} — LTX + AKUSPACE\n\nPrepare-only kit. No job has been submitted.\n\n1. Open the AKUSPACE ComfyUI Docker image documented in docs/akuspace-docker.md.\n2. Put ${plan.firstFrame} and your own ${plan.referenceAudio} in ComfyUI's input folder. The dry recording is not included.\n3. Load workflow.json (API format), check models/nodes and inputs, then run only when ready.\n\n${plan.frames} frames at ${plan.fps} fps. Treatment: ${plan.treatment.preset}.\n\nPrompt: ${plan.prompt}\n\nThe first frame conditions the image-to-video graph. Camera-path JSON is a separate reference; this graph does not enforce the full 3D movement.\n\n${[...new Set(scene.characters?.map((c) => c.asset) ?? [])].map((id) => CHARACTER_MODELS[id].credit).join("\n\n")}\n\nSee public/world-assets/NOTICE.md for model notices.\n`;
}
