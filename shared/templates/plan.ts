import { readAcoustic } from "../acoustic";
import { cameraSections, termsFor } from "../camera";
import { fitControls, type VideoControls } from "../controls";
import { composePrompt } from "../presets";
import { registry, type ReadyEntry } from "../registry";
import type { GenerateInput } from "../types";
import { checkRunKind } from "./run-kind";
import {
  checkTakes,
  isStillEntry,
  planTakes,
  stillInput,
  type PlannedTake,
} from "./plan-takes";
import type {
  HouseTemplate,
  TemplateInputs,
  TemplateShot,
  Tier,
} from "./types";

export const SUBJECT_LIMIT = 240;
export const TITLE_LIMIT = 40;
/** Four-on-the-floor: the kick lands on every beat, so a bar starts on one. */
export const BEATS_PER_BAR = 4;
export const TIER_LABEL: Record<Tier, string> = {
  open: "Open",
  "semi-open": "Semi-open",
  premium: "Premium",
};

const INPUT_KEYS = ["subject", "title", "aspect", "bpm", "acoustic"];
// Control characters become spaces before length and emptiness are checked.
const clean = (text: string) =>
  text
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A template's inputs from untrusted data: unknown keys, wrong types, empty
 * or over-long text, a ratio the template does not offer and a tempo or room
 * it does not read are refused; anything absent takes the template's default.
 */
export function readInputs(
  template: HouseTemplate,
  value: unknown = {},
): TemplateInputs {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Template inputs must be an object");
  const v = value as Record<string, unknown>;
  const unknown = Object.keys(v).find((key) => !INPUT_KEYS.includes(key));
  if (unknown) throw new Error(`Unknown template input: ${unknown}`);
  const spec = template.inputs;
  const text = (key: "subject" | "title", limit: number) => {
    if (v[key] === undefined) return spec[key].default;
    const raw = v[key];
    const cleaned = typeof raw === "string" ? clean(raw) : "";
    if (!cleaned || cleaned.length > limit)
      throw new Error(`${spec[key].label} must be 1 to ${limit} characters`);
    return cleaned;
  };
  const aspect = v.aspect ?? spec.aspects[0];
  if (!spec.aspects.some((a) => a === aspect))
    throw new Error(`${template.name} takes ${spec.aspects.join(" or ")}`);
  const inputs: TemplateInputs = {
    subject: text("subject", SUBJECT_LIMIT),
    title: text("title", TITLE_LIMIT),
    aspect: aspect as TemplateInputs["aspect"],
  };
  if (spec.bpm) {
    const bpm = v.bpm ?? spec.bpm.default;
    if (
      typeof bpm !== "number" ||
      !Number.isFinite(bpm) ||
      bpm < spec.bpm.min ||
      bpm > spec.bpm.max
    )
      throw new Error(
        `Tempo must be ${spec.bpm.min} to ${spec.bpm.max} beats per minute`,
      );
    inputs.bpm = bpm;
  } else if (v.bpm !== undefined)
    throw new Error(`${template.name} does not take a tempo`);
  if (spec.acoustic) {
    const acoustic =
      v.acoustic === undefined ? spec.acoustic : readAcoustic(v.acoustic);
    if (!acoustic) throw new Error("Choose a room AKUSPACE offers");
    inputs.acoustic = acoustic;
  } else if (v.acoustic !== undefined)
    throw new Error(`${template.name} does not take a room`);
  return inputs;
}

const entryOf = (id: string) => {
  const entry = registry.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown registry entry: ${id}`);
  return entry;
};

function videoEntry(shot: TemplateShot) {
  const entry = entryOf(shot.entry);
  if (isStillEntry(entry)) return entry;
  if (
    entry.status !== "ready" ||
    entry.generator !== "video" ||
    entry.controls.kind !== "video"
  )
    throw new Error(
      `${shot.label} needs a ready video entry, or an image entry for a still`,
    );
  return entry as ReadyEntry & { controls: VideoControls };
}

/** Every registry entry a template uses: its shots', then its references'. */
export const templateEntries = (template: HouseTemplate) => [
  ...new Set([
    ...template.shots.map((s) => s.entry),
    ...template.references.flatMap((r) => (r.madeWith ? [r.madeWith] : [])),
  ]),
];

/**
 * The tier rule, shared by templates and run provenance (`shared/provenance.ts`):
 * a closed shot is Premium; otherwise no closed step is Open, one is
 * Semi-open and more than one is Premium.
 */
export function tierFrom(closedShot: boolean, closedSteps: number): Tier {
  if (closedShot) return "premium";
  return closedSteps === 0
    ? "open"
    : closedSteps === 1
      ? "semi-open"
      : "premium";
}

/**
 * Open: every entry has open weights. Semi-open: the shots are open and one
 * reference step (or a mix's optional upscale) is not. Premium: a closed shot, or more than one closed step.
 */
export function tierOf(template: HouseTemplate): Tier {
  const upscale = template.mix?.upscale?.entry;
  const closed = new Set([
    ...template.references.flatMap((r) =>
      r.madeWith && !entryOf(r.madeWith).open ? [r.madeWith] : [],
    ),
    // A mix's optional upscale is a step: a closed upscaler would make an
    // open mix Semi-open.
    ...(upscale && !entryOf(upscale).open ? [upscale] : []),
  ]);
  return tierFrom(
    template.shots.some((s) => !entryOf(s.entry).open),
    closed.size,
  );
}

/** Structural rules the type system cannot hold. Throws on the first break. */
export function checkTemplate(template: HouseTemplate) {
  const ids = (list: readonly { id: string }[], what: string) => {
    const seen = new Set<string>();
    for (const { id } of list) {
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(id) || seen.has(id))
        throw new Error(`${template.id}: bad or repeated ${what} id ${id}`);
      seen.add(id);
    }
    return seen;
  };
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(template.id))
    throw new Error(`Bad template id ${template.id}`);
  if (!template.shots.length) throw new Error(`${template.id} has no shots`);
  const references = ids(template.references, "reference");
  const shots = ids(template.shots, "shot");
  ids(template.tracks, "track");
  for (const shot of template.shots)
    for (const id of shot.references)
      if (!references.has(id))
        throw new Error(`${shot.label} names unknown reference ${id}`);
  const swatches = template.style.swatches.length;
  for (const track of template.tracks) {
    if (track.kind === "type" && !shots.has(track.from))
      throw new Error(`${track.name} enters on unknown shot ${track.from}`);
    if (
      (track.kind === "type" || track.kind === "graphics") &&
      !(track.swatch >= 0 && track.swatch < swatches)
    )
      throw new Error(`${track.name} names a missing swatch`);
    if (track.kind === "audio" && !references.has(track.reference))
      throw new Error(`${track.name} plays unknown reference`);
  }
  checkTakes(template, shots);
  if (template.tracks.filter((t) => t.kind === "shots").length !== 1)
    throw new Error(`${template.id} needs exactly one shots track`);
  if (tierOf(template) !== template.tier)
    throw new Error(
      `${template.id} is ${tierOf(template)}, not ${template.tier}`,
    );
  checkRunKind(template);
}

/** A shot's place on the timeline: whole seconds, or bars at the tempo. */
export function slotSeconds(shot: TemplateShot, bpm?: number) {
  if ("seconds" in shot.length) return shot.length.seconds;
  if (!bpm) throw new Error(`${shot.label} is cut on the beat; give a tempo`);
  return (shot.length.bars * BEATS_PER_BAR * 60) / bpm;
}

/** The shortest length an entry offers that covers a slot. */
export function coverSeconds(
  duration: VideoControls["duration"],
  seconds: number,
) {
  const covers = (n: number) => n >= seconds - 1e-9;
  const chosen =
    "choices" in duration
      ? duration.choices.find(covers)
      : Math.max(duration.min, Math.ceil(seconds - 1e-9));
  if (chosen === undefined || !covers(chosen) || chosen > durationMax(duration))
    throw new Error(`No offered length covers ${seconds.toFixed(2)} s`);
  return chosen;
}
const durationMax = (duration: VideoControls["duration"]) =>
  "choices" in duration ? duration.choices.at(-1)! : duration.max;

export interface PlannedShot {
  id: string;
  label: string;
  entry: ReadyEntry;
  /** Where the shot sits on the timeline, in seconds. */
  start: number;
  seconds: number;
  /** The run that would make it, already within the entry's controls. */
  input: GenerateInput;
  /** The prompt that run would send, as `composePrompt` writes it. */
  prompt: string;
  references: readonly string[];
}
export interface TemplatePlan {
  template: HouseTemplate;
  inputs: TemplateInputs;
  shots: PlannedShot[];
  /** World Builder takes after the shots: on the timeline, never runs. */
  takes: PlannedTake[];
  seconds: number;
}

/** The shot's paragraph before the camera: action, then the house style. */
export function shotDescription(
  template: HouseTemplate,
  shot: TemplateShot,
  subject: string,
) {
  // A callback keeps `$$` and `$&` in a subject literal.
  const action = shot.action.replaceAll("{subject}", () => subject);
  const { look, lighting, palette, negativeSpace } = template.style;
  return [
    action.charAt(0).toUpperCase() + action.slice(1),
    look,
    lighting,
    palette,
    negativeSpace,
  ].join(" ");
}

/**
 * A template is a function of its inputs: the same template and inputs give
 * the same runs and prompts, and other inputs change only what they name.
 * Nothing here submits anything; each run still needs a quote and approval.
 */
export function planTemplate(
  template: HouseTemplate,
  value: unknown = {},
): TemplatePlan {
  checkTemplate(template);
  const inputs = readInputs(template, value);
  let start = 0;
  const shots = template.shots.map((shot): PlannedShot => {
    const entry = videoEntry(shot);
    if (isStillEntry(entry)) {
      const seconds = slotSeconds(shot, inputs.bpm);
      const input = stillInput(
        entry,
        shot,
        shotDescription(template, shot, inputs.subject),
        inputs,
      );
      if (fitControls(entry.controls, input) !== input)
        throw new Error(
          `${shot.label} asks ${entry.label} for what it cannot take`,
        );
      const planned = {
        id: shot.id,
        label: shot.label,
        entry,
        start,
        seconds,
        input,
        prompt: composePrompt(input),
        references: shot.references,
      };
      start += seconds;
      return planned;
    }
    // An entry without camera control: its prompt carries the camera.
    if (!entry.controls.camera && Object.values(shot.camera).some(Boolean))
      throw new Error(
        `${entry.label} takes no camera; write it into ${shot.label}'s action`,
      );
    for (const section of cameraSections) {
      const id = shot.camera[section.id];
      if (id && !termsFor(section, entry.videoModel).some((t) => t.id === id))
        throw new Error(`${entry.label} has no ${id} for ${shot.label}`);
    }
    const seconds = slotSeconds(shot, inputs.bpm);
    const input: GenerateInput = {
      generator: "video",
      model: entry.videoModel,
      description: shotDescription(template, shot, inputs.subject),
      camera: shot.camera,
      cameraEnabled: entry.controls.camera,
      duration: coverSeconds(entry.controls.duration, seconds),
      resolution: "hd",
      aspectRatio: inputs.aspect,
      draft: false,
      acoustic: entry.controls.acoustic ? (inputs.acoustic ?? null) : null,
      upscaleFactor: 2,
      upscaleCreativity: 0,
    };
    if (fitControls(entry.controls, input) !== input)
      throw new Error(
        `${shot.label} asks ${entry.label} for what it cannot take`,
      );
    const planned = {
      id: shot.id,
      label: shot.label,
      entry,
      start,
      seconds,
      input,
      prompt: composePrompt(input),
      references: shot.references,
    };
    start += seconds;
    return planned;
  });
  const takes = planTakes(template, start);
  const end = takes.at(-1);
  return {
    template,
    inputs,
    shots,
    takes,
    seconds: end ? end.start + end.seconds : start,
  };
}
