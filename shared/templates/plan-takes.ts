import { type ImageControls } from "../controls";
import { registry, type ReadyEntry } from "../registry";
import { NAMED_TAKE_IDS } from "../scene/named-takes";
import type { GenerateInput } from "../types";
import type { HouseTemplate, TemplateInputs, TemplateShot } from "./types";

/** A take's fixed grid (World Builder): 24 fps, 8k + 1 frames, 9 to 241. */
export const TAKE_FPS = 24;

/** A World Builder take on the shots lane, after the shots; never a run. */
export interface PlannedTake {
  id: string;
  label: string;
  take: string;
  start: number;
  seconds: number;
}

/** A still shot's entry: a ready image entry. */
export function isStillEntry(
  entry: (typeof registry)[number],
): entry is ReadyEntry & { controls: ImageControls } {
  return (
    entry.status === "ready" &&
    entry.generator === "image" &&
    entry.controls.kind === "image"
  );
}

/**
 * A still's run as the Image composer and `validateImage` write it: the
 * shot's description, the template's ratio, 1K, no grounding, and no
 * camera, since a template still frames itself in words. References travel
 * as data URLs only when a run is quoted, so the plan carries none.
 */
export function stillInput(
  entry: ReadyEntry & { controls: ImageControls },
  shot: TemplateShot,
  description: string,
  inputs: TemplateInputs,
): GenerateInput {
  if (Object.values(shot.camera).some(Boolean))
    throw new Error(`${shot.label} is a still; write its framing in words`);
  if (!entry.controls.aspectRatios.some((r) => r === inputs.aspect))
    throw new Error(`${entry.label} has no ${inputs.aspect} still`);
  if (shot.references.length && !entry.controls.references)
    throw new Error(`${entry.label} takes no reference images`);
  return {
    generator: "image",
    model: entry.videoModel,
    description,
    imageReferences: [],
    imageResolution: "1k",
    imageAspectRatio: inputs.aspect,
    imageGrounding: false,
    imageSafetyTolerance: 2,
    cameraEnabled: false,
    duration: 5,
    resolution: "hd",
    aspectRatio: "1:1",
    draft: false,
    upscaleFactor: 2,
    upscaleCreativity: 0,
  };
}

/** The template's takes and what names them; throws on the first break. */
export function checkTakes(template: HouseTemplate, shots: Set<string>) {
  const takes = new Set<string>();
  for (const take of template.takes ?? []) {
    if (
      !/^[a-z][a-z0-9-]{0,31}$/.test(take.id) ||
      takes.has(take.id) ||
      shots.has(take.id)
    )
      throw new Error(`${template.id}: bad or repeated take id ${take.id}`);
    if (!(NAMED_TAKE_IDS as readonly string[]).includes(take.take))
      throw new Error(`${take.label} names unknown take ${take.take}`);
    if (
      !Number.isInteger(take.frames) ||
      take.frames < 9 ||
      take.frames > 241 ||
      (take.frames - 1) % 8
    )
      throw new Error(`${take.label} must be 8k + 1 frames, 9 to 241`);
    takes.add(take.id);
  }
  for (const shot of template.shots)
    if (shot.firstFrameOf && !takes.has(shot.firstFrameOf))
      throw new Error(`${shot.label} names unknown take ${shot.firstFrameOf}`);
  for (const track of template.tracks)
    if (track.kind === "take-sound" && !takes.has(track.take))
      throw new Error(`${track.name} plays unknown take ${track.take}`);
  return takes;
}

/** The takes on the timeline, from `start`, in the template's order. */
export function planTakes(template: HouseTemplate, start: number) {
  return (template.takes ?? []).map((take): PlannedTake => {
    const seconds = take.frames / TAKE_FPS;
    const planned = { ...take, start, seconds };
    start += seconds;
    return planned;
  });
}
