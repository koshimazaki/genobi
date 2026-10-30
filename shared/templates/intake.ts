import { inspectAudio, MAX_AUDIO_BYTES } from "../audio";
import { inspectImage, MAX_IMAGE_BYTES } from "../image";
import type { HouseTemplate, TemplateReference } from "./types";

/**
 * A template's asset intake (Box 2.2): what each reference takes, how a
 * dropped file is proved to be one, and the first turn an agent receives
 * when the gallery starts a template, with the one question it asks about
 * whatever is missing. Pure and portable: the gallery, the Director and the
 * tests read the same rules.
 */

/** A template track is WAV or MP3; it was WAV only before Box 2.2. */
export const TEMPLATE_AUDIO = {
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
} as const;
export const TEMPLATE_IMAGE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
export type TemplateMediaExt =
  | (typeof TEMPLATE_AUDIO)[keyof typeof TEMPLATE_AUDIO]
  | (typeof TEMPLATE_IMAGE)[keyof typeof TEMPLATE_IMAGE];
export const isTemplateAudioExt = (ext: string) =>
  Object.values(TEMPLATE_AUDIO).some((e) => e === ext);
export const isTemplateImageExt = (ext: string) =>
  Object.values(TEMPLATE_IMAGE).some((e) => e === ext);

/** The file picker's `accept` for each kind. */
export const TEMPLATE_ACCEPT: Record<TemplateReference["kind"], string> = {
  image: "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp",
  audio: "audio/wav,audio/mpeg,.wav,.mp3",
};

export interface TemplateMediaFacts {
  ext: TemplateMediaExt;
  /** Measured from the file's own header; audio only. */
  durationSeconds?: number;
}

/**
 * A dropped file for one reference, proved by its bytes rather than its name
 * or declared type: an image is a PNG, JPEG or WebP the shared reader
 * measures, a track a WAV or MP3 whose length the shared audio reader states.
 * FLAC and every other format are refused with the reference's own words.
 */
export async function readTemplateMedia(
  ref: Pick<TemplateReference, "label" | "kind">,
  bytes: Uint8Array,
): Promise<TemplateMediaFacts> {
  if (ref.kind === "image") {
    if (bytes.length > MAX_IMAGE_BYTES)
      throw new Error(`${ref.label}: use an image under 5 MB.`);
    let contentType: string;
    try {
      ({ contentType } = inspectImage(bytes));
    } catch {
      throw new Error(`${ref.label}: use a PNG, JPEG or WebP image.`);
    }
    return { ext: TEMPLATE_IMAGE[contentType as keyof typeof TEMPLATE_IMAGE] };
  }
  if (bytes.length > MAX_AUDIO_BYTES)
    throw new Error(`${ref.label}: use audio under 50 MB.`);
  const read = async (offset: number, length: number) =>
    bytes.slice(offset, offset + length).buffer as ArrayBuffer;
  let found: Awaited<ReturnType<typeof inspectAudio>>;
  try {
    found = await inspectAudio(bytes.length, read);
  } catch {
    throw new Error(`${ref.label}: use a WAV or MP3 with a readable length.`);
  }
  const ext = TEMPLATE_AUDIO[found.contentType as keyof typeof TEMPLATE_AUDIO];
  if (!ext) throw new Error(`${ref.label}: use a WAV or MP3 file.`);
  return { ext, durationSeconds: found.duration };
}

/** Where each reference stands when the agent starts. */
export type ReferenceState = "example" | "yours" | "missing";
export type ReferencePicks = Record<string, ReferenceState>;

/**
 * Whether a reference opens with an example: its own `example`, or the
 * Director's sample for its role (a character still, the 120 BPM pulse), as
 * `sampleReferences` in src/director/house-template.ts loads them. An
 * optional reference Genobi can make (`min: 0` with `madeWith`) takes only
 * its own example: the stand-in sample would answer the intake's question
 * for the person, as the 6-second pulse did for the anime teaser's
 * 20-second track. A required one keeps the sample, so it opens.
 */
export const hasExample = (ref: TemplateReference) =>
  !!ref.example ||
  ((ref.role === "character" || ref.role === "track") &&
    !(ref.min === 0 && ref.madeWith));

/** Every reference at its example when it has one, otherwise missing. */
export function startingPicks(template: HouseTemplate): ReferencePicks {
  return Object.fromEntries(
    template.references.map((ref) => [
      ref.id,
      hasExample(ref) ? "example" : "missing",
    ]),
  );
}

/** Joins names as a sentence does: "a, b and c". */
const list = (items: string[]) =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

/**
 * The one question for every missing reference Genobi can make: one line,
 * asked once, whose yes quotes the generation like any paid step. Undefined
 * when nothing that can be made is missing.
 */
export function missingQuestion(
  template: HouseTemplate,
  picks: ReferencePicks,
): string | undefined {
  const missing = template.references.filter(
    (ref) => picks[ref.id] === "missing" && ref.madeWith,
  );
  if (!missing.length) return undefined;
  const names = list(missing.map((ref) => `a ${lower(ref.label)}`));
  return `Do you have ${names}, or shall I generate ${missing.length > 1 ? "them" : "one"}?`;
}

/**
 * Refuses picks that do not fit the template: an unknown reference, or a
 * required one (min 1 or more) left missing.
 */
export function checkPicks(template: HouseTemplate, picks: ReferencePicks) {
  const unknown = Object.keys(picks).find(
    (id) => !template.references.some((ref) => ref.id === id),
  );
  if (unknown) throw new Error(`${template.name} has no reference ${unknown}`);
  for (const ref of template.references)
    if (ref.min > 0 && (picks[ref.id] ?? "missing") === "missing")
      throw new Error(`${ref.label} is required; drop one or keep the example`);
}

/**
 * The person's own text inside the agent's first turn, fenced as a quotation:
 * one line, control characters and double quotes replaced, so it reads as
 * their words and cannot close the quote and speak as the studio.
 */
export const personsWords = (text: string) =>
  text
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/["\u201c\u201d]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The first turn of a session the gallery starts: run the template's skill
 * on the open project (its references are already project assets), the
 * brief when the person edited it, what is there and whose it is, and the
 * single question about what is missing.
 */
export function intakePrompt(
  template: HouseTemplate,
  picks: ReferencePicks,
  brief?: string,
): string {
  checkPicks(template, picks);
  const where = (state: ReferenceState) =>
    template.references
      .filter((ref) => (picks[ref.id] ?? "missing") === state)
      .map((ref) => ref.label);
  const yours = where("yours"),
    examples = where("example"),
    missing = where("missing");
  const question = missingQuestion(template, picks);
  return [
    `Run the ${template.id} skill (genobi_skill with name "${template.id}") on my open Director project, ${template.name}. Link the project first; its references are project assets.`,
    brief
      ? `${template.inputs.subject.label}, in my words: "${personsWords(brief)}".`
      : "",
    yours.length ? `Mine: ${list(yours)}.` : "",
    examples.length ? `The template's examples: ${list(examples)}.` : "",
    missing.length ? `Missing: ${list(missing)}.` : "",
    question
      ? `Before anything else, ask me once, in one question: "${question}" A yes quotes the generation like any paid step.`
      : "",
    "Quote every paid step first and wait for my approval in the studio.",
  ]
    .filter(Boolean)
    .join(" ");
}
