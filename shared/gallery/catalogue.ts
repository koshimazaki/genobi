import { houseTemplates, mixTemplates } from "../templates/catalogue";
import { mixFrames } from "../templates/mix";
import { generationTemplates } from "./generations";
import { slotSeconds, templateEntries } from "../templates/plan";
import type { HouseTemplate } from "../templates/types";
import type { AspectRatio } from "../types";

/**
 * Preview clips under public/media/template-gallery/. Preview footage only:
 * never claim these clips were made by the recipes. Length and frame size as
 * measured from the bundled files (ffprobe); the poster is a frame of the
 * same size. Link previews need the size. `made` names the registry entries
 * that made a clip, only where the owner has said so; the footage line reads
 * it, never the badge. The owner named every clip's model on 30 October 2026:
 * the three supplied clips are FLUX 3 image to video, the H3 one MiniMax H3.
 */
const previews: Readonly<
  Record<
    string,
    { seconds: number; width: number; height: number; made?: string[] }
  >
> = {
  "character-piece": {
    seconds: 20.04,
    width: 960,
    height: 406,
    made: ["flux-3-i2v"],
  },
  // The two creatures. Plays on the Toy creatures generation card and on
  // Product video's watch page (no longer a gallery card).
  "product-video": {
    seconds: 20.04,
    width: 960,
    height: 406,
    made: ["flux-3-i2v"],
  },
  // The lotus figure. Plays on the Neon bloom generation card and in the
  // Genobi teaser.
  "audio-visual": {
    seconds: 29,
    width: 960,
    height: 410,
    made: ["flux-3-i2v"],
  },
  // The owner's three MiniMax H3 open-weights clips (the Dimensions mix
  // clips) side by side, 30 October 2026. docs/template-gallery.md.
  "audio-visual-h3": {
    seconds: 13.5,
    width: 960,
    height: 406,
    made: ["minimax-h3"],
  },
};

/** A house card whose preview clip is not named after the card. */
const HOUSE_CLIP: Readonly<Record<string, string>> = {
  "audio-visual": "audio-visual-h3",
};
const houseClip = (id: string) => HOUSE_CLIP[id] ?? id;

/**
 * The registry entries that made a mix's bundled footage, where every clip
 * came from one model. A mix not listed shows mixed media and names none.
 */
const MIX_FOOTAGE: Readonly<Record<string, string[]>> = {
  "dimensions-mix": ["minimax-h3"],
  // Teaser v3 (30 October 2026): the generated footage is the owner's
  // MiniMax H3 creature clips and one FLUX 3 image-to-video run (the forest
  // guardian); everything else is studio screen recordings.
  "genobi-teaser": ["minimax-h3", "flux-3-i2v"],
  // Bloom (30 October 2026): the owner's two MiniMax H3 (open weights)
  // takes of the Bloom character sheet, nothing else.
  "bloom-teaser": ["minimax-h3"],
  // Adaptive reverb (30 October 2026): one LTX-2.5 (open weights) take with
  // the AKUSPACE LoRA, nothing else.
  "adaptive-reverb": ["ltx-2-5-akuspace"],
};

/**
 * The registry entries that made the footage a card plays, when known: a
 * mix's clips, a generation card's clip, or a house card's preview clip,
 * named by the file the card plays. Empty when unknown, and for a card whose
 * footage is its own recipe's example.
 */
export function footageEntries(template: HouseTemplate): string[] {
  if (template.mix) return MIX_FOOTAGE[template.id] ?? [];
  if (template.generation)
    return previews[template.generation.clip]?.made ?? [];
  if (template.examples[0]) return [];
  return previews[houseClip(template.id)]?.made ?? [];
}

/** The owner's gallery order; Director and agent catalogues keep their order. */
export const GALLERY_ORDER: readonly string[] = [
  "genobi-teaser",
  "dimensions-mix",
  "bloom-teaser",
  "adaptive-reverb",
  "character-piece-generation",
  "product-video-generation",
  "sheet-to-shot",
];

/** What each finished piece is for, on cards and drawer titles. */
export const GALLERY_SUBTITLE: Readonly<Record<string, string>> = {
  "genobi-teaser": "Product teaser",
  "dimensions-mix": "Anime teaser",
  "bloom-teaser": "Sheet to shot",
  "adaptive-reverb": "3D · LTX template",
};

/**
 * House templates kept for saved projects, links and agents but not shown
 * as gallery cards. Falling room left the gallery on 29 October 2026: its
 * fall was the wrong example, and a flying one will replace it once the
 * creature's fly clip has an owner-assigned model (docs/templates.md).
 * Anime teaser and Product video left it on 30 October 2026: the Dimensions
 * mix is the anime teaser, and the Genobi teaser is the product video. Their
 * skills, agents, MCP tools and Director links still open them. The Neon
 * bloom generation card (`audio-visual-generation`) left it on 30 October
 * 2026 for Bloom, the anime teaser; its watch page and links still open.
 * The Audio-visual card left it the same day for Adaptive reverb, the 3D +
 * LTX template; the template, its skill and its links stay. Character piece
 * also left: its FLUX 3 footage is represented by Forest guardian.
 */
export const NOT_IN_GALLERY: ReadonlySet<string> = new Set([
  "falling-room",
  "anime-teaser",
  "product-video",
  "audio-visual-generation",
  "audio-visual",
  "character-piece",
]);

/**
 * A full gallery render that is not at its cut's size: Dimensions mix uses
 * the owner's upscaled render (30 October 2026), at 1920 × 1080. These are
 * watch/embed dimensions, independent of the lightweight card encode.
 */
const MIX_PREVIEW_SIZE: Readonly<
  Record<string, { width: number; height: number }>
> = { "dimensions-mix": { width: 1920, height: 1080 } };

/** A worked example's frame size from its aspect, 1280 wide or tall. */
function frameOf(aspect: AspectRatio) {
  const [w, h] = aspect.split(":").map(Number);
  return w >= h
    ? { width: 1280, height: Math.round((1280 * h) / w) }
    : { width: Math.round((1280 * w) / h), height: 1280 };
}

/**
 * A card's footage. A generation card plays its clip, labelled preview
 * footage until the owner records the image and prompt that made it.
 */
export function galleryMedia(template: HouseTemplate) {
  const media = fullGalleryMedia(template);
  if (!media) return undefined;
  return {
    ...media,
    preview: media.video.replace(/\.mp4$/, ".preview.mp4"),
    previewPoster: media.video.replace(/\.mp4$/, ".preview.jpg"),
  };
}

/** Full files and measured dimensions stay canonical for sharing and imports. */
function fullGalleryMedia(template: HouseTemplate) {
  const generation = template.generation;
  if (generation) {
    const clip = previews[generation.clip];
    if (!clip) return undefined;
    return {
      video: `/media/template-gallery/${generation.clip}.mp4`,
      poster: `/media/template-gallery/${generation.clip}.jpg`,
      demo: !generation.recorded,
      aspect: "cinematic",
      width: clip.width,
      height: clip.height,
    };
  }
  const example = template.examples[0];
  if (example)
    return {
      video: example.video,
      poster: example.poster,
      demo: false,
      aspect: example.aspect,
      // A recorded preview names its own size when it differs. Otherwise a
      // mix's preview is its own render, at the cut's size, unless the
      // owner's upscaled render replaced it (MIX_PREVIEW_SIZE).
      ...(example.size ??
        (template.mix
          ? (MIX_PREVIEW_SIZE[template.id] ?? {
              width: template.mix.cut.width,
              height: template.mix.cut.height,
            })
          : frameOf(example.aspect))),
    };
  const clip = houseClip(template.id);
  const preview = previews[clip];
  if (!preview) return undefined;
  return {
    video: `/media/template-gallery/${clip}.mp4`,
    poster: `/media/template-gallery/${clip}.jpg`,
    demo: true,
    aspect: "cinematic",
    width: preview.width,
    height: preview.height,
  };
}

/** Bundled previews with audio tracks, verified from their streams. */
export const GALLERY_AUDIO: ReadonlySet<string> = new Set([
  "genobi-teaser",
  "dimensions-mix",
  "bloom-teaser",
  "adaptive-reverb",
  "character-piece-generation",
]);

export const templateSeconds = (template: HouseTemplate) =>
  template.mix
    ? mixFrames(template.mix.cut) / template.mix.cut.fps
    : template.shots.reduce(
        (sum, shot) => sum + slotSeconds(shot, template.inputs.bpm?.default),
        0,
      ) +
      // A World Builder take plays after the shots.
      (template.takes ?? []).reduce((sum, take) => sum + take.frames / 24, 0);

/** What a card's badge shows: its footage's length when it has footage. */
export function gallerySeconds(template: HouseTemplate) {
  if (template.generation)
    return previews[template.generation.clip]?.seconds ?? 0;
  return galleryMedia(template)?.demo
    ? previews[houseClip(template.id)].seconds
    : templateSeconds(template);
}

export function templateTools(template: HouseTemplate) {
  // These identify recipe steps, not the provenance of the preview footage.
  // A generation runs through the Camera's paid path and opens no project.
  if (template.generation) return ["Camera"];
  return [
    "Director",
    ...(template.shots.some((s) => Object.values(s.camera).some(Boolean))
      ? ["Camera"]
      : []),
  ];
}

/** A card's kind: a multi-step template, or one generation run in place. */
export const galleryKind = (template: HouseTemplate) =>
  template.generation ? "generation" : "template";
export const KIND_LABEL = {
  template: "Template",
  generation: "Generation",
} as const;

export const emptyFilters = {
  kind: "",
  tool: "",
  style: "",
  format: "",
  length: "",
  model: "",
  tier: "",
  /** "open": only cards whose recipe and shown footage are open. */
  open: "",
};
export type GalleryFilters = typeof emptyFilters;
export function matchesFilters(
  template: HouseTemplate,
  filters: GalleryFilters,
) {
  const seconds = templateSeconds(template);
  return (
    (!filters.kind || galleryKind(template) === filters.kind) &&
    (!filters.tool || templateTools(template).includes(filters.tool)) &&
    (!filters.style || template.style.name === filters.style) &&
    (!filters.format ||
      template.inputs.aspects.some((a) => a === filters.format)) &&
    (!filters.length ||
      (filters.length === "short" ? seconds <= 10 : seconds > 10)) &&
    (!filters.model || templateEntries(template).includes(filters.model)) &&
    (!filters.tier || template.tier === filters.tier) &&
    (!filters.open || openOnly(template))
  );
}

/**
 * The "Open only" toggle: an Open tier, and no borrowed preview footage,
 * since that footage was not made by the card's open recipe.
 */
export const openOnly = (template: HouseTemplate) =>
  template.tier === "open" && !galleryMedia(template)?.demo;

const catalogueOrder: readonly HouseTemplate[] = [
  ...mixTemplates,
  ...houseTemplates.filter((t) => !NOT_IN_GALLERY.has(t.id)),
  ...generationTemplates.filter((t) => !NOT_IN_GALLERY.has(t.id)),
];
const rank = (t: HouseTemplate) => {
  const i = GALLERY_ORDER.indexOf(t.id);
  return i < 0 ? GALLERY_ORDER.length : i;
};
/**
 * Every gallery card: the mix templates, the house templates shown in the
 * gallery and the generation cards (`generations.ts`), in `GALLERY_ORDER`.
 */
export const galleryTemplates: readonly HouseTemplate[] = [
  ...catalogueOrder,
].sort((a, b) => rank(a) - rank(b));
/** A gallery card by id: a mix, a house template or a generation card. */
export const findGalleryTemplate = (id: string | null | undefined) =>
  galleryTemplates.find((t) => t.id === id);
export const directorLink = (id: string) =>
  `/director?example=${encodeURIComponent(id)}`;
export const editorLink = (id: string) =>
  `${directorLink(id)}&workspace=editor`;
export const watchLink = (id: string) => `/watch/${encodeURIComponent(id)}`;
export const embedLink = (id: string) => `/embed/${encodeURIComponent(id)}`;
