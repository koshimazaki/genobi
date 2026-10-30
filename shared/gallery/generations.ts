import { durationRange } from "../controls";
import { readyEntry } from "../registry";
import type { GenerationSettings, HouseTemplate } from "../templates/types";
import type { AspectRatio } from "../types";

/**
 * The gallery's generation cards: the three template-gallery preview clips,
 * each a single FLUX 3 image-to-video run of one start image and one prompt
 * (docs/template-gallery.md, "Generation cards"). The owner supplies the
 * image and the prompt that made each clip; until a card has both it shows
 * the clip as preview footage, opens with an empty prompt and no start
 * image, and Generate waits for the person's own. Nothing here is guessed:
 * no prompt is written for a clip and no frame of it is shipped as its start.
 * A recorded card also carries the controls the owner ran it with, so its
 * drawer opens on that run; Generate still quotes and waits for confirmation.
 */

/**
 * The owner's record for one clip: `image` under /media/template-gallery/,
 * the prompt as they wrote it, and optionally the run's FLUX 3 controls.
 */
export interface GenerationRecord {
  image: string;
  prompt: string;
  settings?: GenerationSettings;
}

/** Filled by the owner. Leave a field empty rather than inventing it. */
export const generationRecords = {
  // Supplied by the owner on 29 October 2026: their start image and prompt,
  // and the controls they wrote after it (duration 20, 21:9, hd). The prompt
  // is theirs word for word, typos included.
  "character-piece": {
    image: "/media/template-gallery/character-piece-start.webp",
    prompt:
      "animate the character make it train ninja moves and tai-chi and shooting fireballs. It should come close to the screen so its whole face makes the extreme close-up showing weathered cybernetic eyes reflecting forest behind him in the iris, camera is still no movement, only character moves withing the scene. Making anime ninja style training moves and moves closer to camera at 15sec blinking eye at the end. Keep aesthethics as on the image1.",
    settings: { duration: 20, aspect: "21:9", resolution: "hd" },
  },
  "product-video": { image: "", prompt: "" },
  "audio-visual": { image: "", prompt: "" },
} as const satisfies Record<string, GenerationRecord>;

export type GenerationClip = keyof typeof generationRecords;

/** A card's name, from what the clip shows; never a claim about its making. */
const names: Record<GenerationClip, string> = {
  "character-piece": "Forest guardian",
  "product-video": "Toy creatures",
  "audio-visual": "Neon bloom",
};

/** The registry entry every generation card runs: FLUX 3 image to video. */
export const GENERATION_ENTRY = "flux-3-i2v";
/** The server's description limit (`server/validation.ts`). */
const PROMPT_LIMIT = 1200;
const IMAGE =
  /^\/media\/template-gallery\/[a-z0-9][a-z0-9-]{0,79}\.(png|jpe?g|webp)$/;
/** The ratios a generation card offers, each one FLUX 3 takes. */
const ASPECTS: readonly AspectRatio[] = ["16:9", "21:9", "9:16"];

/**
 * Settings from the record, each checked against what the card and its
 * registry entry offer: whole seconds in FLUX 3's range, one of the card's
 * ratios, one of the entry's resolutions. Anything else is refused.
 */
function readSettings(
  clip: string,
  settings: GenerationSettings | undefined,
): GenerationSettings | undefined {
  if (settings === undefined) return undefined;
  const controls = readyEntry(GENERATION_ENTRY)?.controls;
  if (!controls || controls.kind !== "video")
    throw new Error(`${GENERATION_ENTRY} is not a video entry`);
  if (typeof settings !== "object" || settings === null)
    throw new Error(`${clip}: settings must be an object`);
  const { duration, aspect, resolution, ...rest } = settings;
  if (Object.keys(rest).length)
    throw new Error(
      `${clip}: unknown settings ${Object.keys(rest).join(", ")}`,
    );
  if (duration !== undefined) {
    const { min, max } = durationRange(controls.duration);
    const offered =
      "choices" in controls.duration
        ? controls.duration.choices.includes(duration)
        : Number.isInteger(duration) && duration >= min && duration <= max;
    if (!offered)
      throw new Error(
        `${clip}: the duration must be whole seconds from ${min} to ${max}`,
      );
  }
  if (
    aspect !== undefined &&
    !(ASPECTS.includes(aspect) && controls.aspectRatios.includes(aspect))
  )
    throw new Error(`${clip}: the ratio must be ${ASPECTS.join(", ")}`);
  if (resolution !== undefined && !controls.resolutions.includes(resolution))
    throw new Error(
      `${clip}: the resolution must be ${controls.resolutions.join(", ")}`,
    );
  return {
    ...(duration !== undefined ? { duration } : {}),
    ...(aspect !== undefined ? { aspect } : {}),
    ...(resolution !== undefined ? { resolution } : {}),
  };
}

/**
 * A record from data someone edits by hand: an image path must be a PNG,
 * JPEG or WebP beside the clips, a prompt one paragraph within the server's
 * limit, and any settings values FLUX 3 image to video offers. Anything else
 * is refused rather than half-shown.
 */
export function readGenerationRecord(
  clip: string,
  value: GenerationRecord,
): GenerationRecord {
  const { image, prompt } = value;
  const settings = readSettings(clip, value.settings);
  if (typeof image !== "string" || (image && !IMAGE.test(image)))
    throw new Error(
      `${clip}: the start image must be a PNG, JPEG or WebP under /media/template-gallery/`,
    );
  if (
    typeof prompt !== "string" ||
    prompt.length > PROMPT_LIMIT ||
    /[\x00-\x09\x0b-\x1f\x7f]/.test(prompt)
  )
    throw new Error(
      `${clip}: the prompt must be plain text of at most ${PROMPT_LIMIT} characters`,
    );
  return { image, prompt: prompt.trim(), ...(settings ? { settings } : {}) };
}

/** One clip's card: a mechanical one-shot template on FLUX 3 image to video. */
export function generationTemplate(
  clip: GenerationClip,
  record: GenerationRecord = generationRecords[clip],
): HouseTemplate {
  const { image, prompt, settings } = readGenerationRecord(clip, record);
  return {
    id: `${clip}-generation`,
    name: names[clip],
    run: "mechanical",
    generation: {
      clip,
      prompt,
      recorded: !!image && !!prompt,
      ...(settings ? { settings } : {}),
    },
    description:
      "One start image and one prompt become one FLUX 3 image-to-video shot, run here.",
    tier: "premium",
    // A generation carries no house style: its prompt is sent as written.
    style: {
      name: "Generation",
      look: "",
      lighting: "",
      palette: "",
      swatches: [],
      negativeSpace: "",
    },
    inputs: {
      subject: { label: "Prompt", hint: "The whole prompt.", default: prompt },
      title: { label: "Title", hint: "Not used.", default: "" },
      aspects: [...ASPECTS],
    },
    references: [
      {
        id: "start",
        label: "Start image",
        kind: "image",
        role: "start",
        min: 1,
        max: 1,
        hint: "The first frame. FLUX 3 animates it from here.",
        ...(image ? { example: image as `/${string}` } : {}),
      },
    ],
    shots: [
      {
        id: "shot",
        label: "Shot",
        entry: GENERATION_ENTRY,
        // The recorded length, else FLUX 3's shortest; the drawer offers 5 to 20.
        length: { seconds: settings?.duration ?? 5 },
        camera: { "shot-sizes": null, angles: null, movements: null },
        action: "{subject}",
        references: ["start"],
      },
    ],
    tracks: [{ kind: "shots", id: "shots", name: "Shots" }],
    examples: [],
  };
}

export const generationTemplates: readonly HouseTemplate[] = (
  Object.keys(generationRecords) as GenerationClip[]
).map((clip) => generationTemplate(clip));
