/**
 * The LTX prompt as the LTX-2.5 prompt guide orders it (Lightricks,
 * https://ltx.io/blog/ltx-2-5-prompt-guide, 10 August 2026): establish the
 * shot, set the scene, describe the action, define the characters, identify
 * the camera movement, describe the audio, written as one flowing
 * present-tense paragraph. The studio fills those six places from its pickers
 * (Shot, Light, Movement) and four free-text gaps (Scene, Character, Action,
 * Audio), and the browser joins them into the one description a request
 * already carries. The servers never compose it; they record the parts
 * (`ltxPrompt`) beside the description so Recreate brings the gaps back.
 */
import {
  acousticCaption,
  appendAcoustic,
  type AcousticSetting,
} from "./acoustic";
import {
  cameraClauses,
  isH3CameraModel,
  isLtxModel,
  type CameraEdits,
  type CameraSelection,
} from "./camera";
import {
  emptyLight,
  hasLight,
  lightSentences,
  readLight,
  type LightEdits,
  type LightSelection,
} from "./light";
import type { Generator, VideoModel } from "./types";

/** The request's description limit, which the composed paragraph must keep. */
export const DESCRIPTION_LIMIT = 1200;

/**
 * The four gaps as the tabs show them (the owner's order); the paragraph
 * still puts Action before Character, as the guide does. Each hint is the
 * guide's own wording for that element.
 */
export const ltxSlots = [
  {
    id: "scene",
    label: "Scene",
    color: "--prompt-scene",
    hint: "Describe lighting conditions, color palette, surface textures, and atmosphere.",
  },
  {
    id: "character",
    label: "Character",
    color: "--prompt-character",
    hint: "Include age, hairstyle, clothing, and distinguishing features. Express emotion through physical cues, not abstract labels.",
  },
  {
    id: "action",
    label: "Action",
    color: "--prompt-action",
    hint: "Write the core action as a natural sequence, flowing clearly from beginning to end.",
  },
  {
    id: "audio",
    label: "Audio",
    color: "--prompt-audio",
    hint: "Describe ambient sound, music, speech, or singing. Place spoken dialogue in quotation marks.",
  },
] as const;
export type SlotId = (typeof ltxSlots)[number]["id"];
export type LtxSlots = Record<SlotId, string>;
export const emptySlots: LtxSlots = {
  scene: "",
  character: "",
  action: "",
  audio: "",
};

/** What a take records: the main field as typed, the gaps and the Light choice. */
export interface LtxPrompt extends LtxSlots {
  main: string;
  light: LightSelection;
  lightEdits: LightEdits;
}

/** Every part of the paragraph, each with its theme colour token. */
export const promptParts = {
  shot: { label: "Shot", color: "--camera-shot" },
  angle: { label: "Angle", color: "--camera-angle" },
  main: { label: "Prompt", color: "--text" },
  scene: { label: "Scene", color: "--prompt-scene" },
  light: { label: "Light", color: "--camera-light" },
  action: { label: "Action", color: "--prompt-action" },
  character: { label: "Character", color: "--prompt-character" },
  movement: { label: "Movement", color: "--camera-movement" },
  audio: { label: "Audio", color: "--prompt-audio" },
} as const;
export type PartId = keyof typeof promptParts;

export interface Segment {
  part: PartId;
  text: string;
  /** What joins it to the text before it. */
  separator: string;
  /**
   * The AKUSPACE caption: sent verbatim, never reworded or cut, since the
   * server refuses a composed Acoustic Space run without it whole.
   */
  verbatim?: true;
}

export interface LtxPromptState {
  generator: Generator;
  model: VideoModel;
  description: string;
  cameraEnabled: boolean;
  camera: CameraSelection;
  cameraEdits: CameraEdits;
  acoustic: AcousticSetting | null;
  slots: LtxSlots;
  light: LightSelection;
  lightEdits: LightEdits;
}

/**
 * Whether the paragraph is composed: an LTX video with a gap or a Light
 * choice. Otherwise the request is exactly the one sent before the gaps
 * existed: the main text, with the pickers' sentences appended by
 * `composePrompt`.
 */
export const composesLtx = (state: LtxPromptState) =>
  state.generator === "video" &&
  isLtxModel(state.model) &&
  (ltxSlots.some(({ id }) => state.slots[id].trim()) || hasLight(state.light));

/** Text that already ends a sentence. */
const CLOSED = /[.!?…"'”’)\]]$/;

/** One line, no doubled spaces, opened with a capital and closed with a full stop. */
function sentence(text: string) {
  const flat = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*[,;:]+$/, "");
  if (!flat) return "";
  const opened = flat.charAt(0).toUpperCase() + flat.slice(1);
  return CLOSED.test(opened) ? opened : `${opened}.`;
}

const segment = (part: PartId, text: string): Segment[] =>
  text ? [{ part, text, separator: " " }] : [];

/**
 * The paragraph in parts. Composed, in the guide's order: Shot (size, then
 * angle) → the main text → Scene and Light → Action → Character → Movement →
 * Audio, which opens with the Acoustic Space caption when there is one. An
 * empty gap leaves only its picker's sentence. Not composed, the parts of
 * today's prompt in today's order: `composePrompt`'s, which for H3 puts the
 * shot size and angle before the text.
 */
export function ltxSegments(state: LtxPromptState): Segment[] {
  const camera = state.cameraEnabled
    ? cameraClauses(state.camera, state.cameraEdits, state.model)
    : [];
  const clause = (id: string) =>
    camera.find(({ section }) => section.id === id)?.text.trim() ?? "";
  const caption = state.acoustic ? acousticCaption(state.acoustic) : "";
  if (!composesLtx(state)) {
    const main = segment("main", state.description.trim());
    const framing = [
      ...segment("shot", clause("shot-sizes")),
      ...segment("angle", clause("angles")),
    ];
    // H3's order (`h3Paragraph`): composition, the text, then the move.
    const visual: Segment[] = [
      ...(isH3CameraModel(state.model)
        ? [...framing, ...main]
        : [...main, ...framing]),
      ...segment("movement", clause("movements")),
    ];
    const text = visual.map((s) => s.text).join(" ");
    if (caption) {
      const joined = appendAcoustic(text, caption);
      visual.push({
        part: "audio",
        text: caption.trim(),
        separator: text
          ? joined.slice(text.length, -caption.trim().length)
          : "",
      });
    }
    if (visual[0]) visual[0] = { ...visual[0], separator: "" };
    return visual;
  }
  const parts: Segment[] = [
    ...segment("shot", sentence(clause("shot-sizes"))),
    ...segment("angle", sentence(clause("angles"))),
    ...segment("main", sentence(state.description)),
    ...segment("scene", sentence(state.slots.scene)),
    ...lightSentences(state.light, state.lightEdits).flatMap(({ text }) =>
      segment("light", sentence(text)),
    ),
    ...segment("action", sentence(state.slots.action)),
    ...segment("character", sentence(state.slots.character)),
    ...segment("movement", sentence(clause("movements"))),
    // The trained caption keeps its own words, character for character; the
    // gap's text follows it after a full stop when it has no closing mark.
    ...(caption
      ? [
          {
            part: "audio" as const,
            text: caption,
            separator: " ",
            verbatim: true as const,
          },
        ]
      : []),
    ...(sentence(state.slots.audio)
      ? [
          {
            part: "audio" as const,
            text: sentence(state.slots.audio),
            separator: !caption || CLOSED.test(caption) ? " " : ". ",
          },
        ]
      : []),
  ];
  if (parts[0]) parts[0] = { ...parts[0], separator: "" };
  return parts;
}

export const joinSegments = (segments: readonly Segment[]) =>
  segments.map((s) => `${s.separator}${s.text}`).join("");

export interface Fitted {
  /** What the request carries: the paragraph, cut to the limit if it must be. */
  text: string;
  /** The paragraph's full length before any cut. */
  length: number;
  /** Characters past the limit; 0 when it fits. */
  over: number;
  /** The parts that lose text to the cut, in order. */
  cut: PartId[];
  /**
   * True when the cut would reach the Acoustic Space caption, which the
   * workflow's LoRA needs whole, so the run is held until the text is shorter.
   */
  blocked: boolean;
}

/**
 * Fits the composed paragraph to the 1,200-character description limit. A
 * paragraph that is too long loses its end, at a word boundary where one is
 * near, and says which parts lost text.
 */
export function fitSegments(segments: readonly Segment[]): Fitted {
  const full = joinSegments(segments);
  if (full.length <= DESCRIPTION_LIMIT)
    return {
      text: full,
      length: full.length,
      over: 0,
      cut: [],
      blocked: false,
    };
  let text = full.slice(0, DESCRIPTION_LIMIT);
  const space = text.lastIndexOf(" ");
  if (space > DESCRIPTION_LIMIT - 60) text = text.slice(0, space);
  text = text.trimEnd();
  const cut: PartId[] = [];
  let blocked = false;
  let end = 0;
  for (const item of segments) {
    end += item.separator.length + item.text.length;
    if (end <= text.length) continue;
    if (!cut.includes(item.part)) cut.push(item.part);
    if (item.verbatim) blocked = true;
  }
  return {
    text,
    length: full.length,
    over: full.length - DESCRIPTION_LIMIT,
    cut,
    blocked,
  };
}

/** The gaps and Light a request records, or nothing when it is not composed. */
export function ltxRecord(state: LtxPromptState): LtxPrompt | undefined {
  if (!composesLtx(state)) return undefined;
  const lightEdits: LightEdits = {};
  for (const { term, text } of lightSentences(state.light, state.lightEdits))
    if (text !== term.ltx) lightEdits[term.id] = text;
  return {
    main: state.description,
    ...state.slots,
    light: state.light,
    lightEdits,
  };
}

/** Room for a gap: the description's own limit. */
export const SLOT_LIMIT = DESCRIPTION_LIMIT;

/**
 * A recorded `ltxPrompt` from a request, a saved take or a catalogue setup:
 * exactly the known fields, each gap and the main text a string of at most
 * 1,200 characters, and a valid Light choice. Anything else is null.
 */
export function readLtxPrompt(value: unknown): LtxPrompt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const fields = ["main", ...ltxSlots.map(({ id }) => id)] as const;
  const allowed = new Set<string>([...fields, "light", "lightEdits"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;
  const texts: Record<string, string> = {};
  for (const field of fields) {
    const text = record[field];
    if (typeof text !== "string" || text.length > SLOT_LIMIT) return null;
    texts[field] = text;
  }
  const light = readLight(record.light ?? emptyLight, record.lightEdits ?? {});
  if (!light) return null;
  return { ...(texts as Omit<LtxPrompt, "light" | "lightEdits">), ...light };
}

/**
 * Why the server would refuse a composed request, or null when it would take
 * it: the one rule `validateInput` applies and the composer holds Generate on,
 * so the two cannot disagree. The record must read as `readLtxPrompt` reads
 * it, and with an Acoustic Space treatment the description must hold the
 * caption exactly as `acousticCaption` writes it.
 */
export function composedRefusal(
  description: string,
  ltxPrompt: unknown,
  acoustic: AcousticSetting | null | undefined,
): string | null {
  if (!readLtxPrompt(ltxPrompt))
    return "Keep each prompt gap under 1,200 characters and choose supported light.";
  if (acoustic && !description.includes(acousticCaption(acoustic)))
    return "Keep the Acoustic Space caption in the prompt.";
  return null;
}
