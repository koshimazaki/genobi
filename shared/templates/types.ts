import type { AcousticSetting } from "../acoustic";
import type { CameraSelection } from "../camera";
import type { AspectRatio, VideoResolution } from "../types";
import type { MixMedia, MixSpec } from "./mix";

/**
 * How open a template's models are (ledger 376, issue #20). `tierOf` in
 * `plan.ts` derives it from the registry entries the template uses; the
 * declared value must agree. The agent half of the label belongs to a run's
 * provenance, not to the template.
 */
export type Tier = "open" | "semi-open" | "premium";

export interface Swatch {
  name: string;
  hex: `#${string}`;
}

/**
 * The house style: the brief pieces every shot's prompt repeats word for word,
 * so the same template with other inputs keeps the same look.
 */
export interface HouseStyle {
  name: string;
  /** The set and its materials, one sentence. */
  look: string;
  lighting: string;
  /** One sentence naming the swatches; the hex values colour plates and type. */
  palette: string;
  swatches: Swatch[];
  /** Where the frame stays empty, and what it is kept for. */
  negativeSpace: string;
}

/**
 * The text inputs a template takes. Media inputs (character stills, a track)
 * are `references`, assigned as project assets in the Director.
 */
export interface TemplateInputs {
  /** What the shots show, repeated verbatim in every shot's prompt. */
  subject: string;
  /** The words set in the type track: a product name, a name or a title. */
  title: string;
  aspect: AspectRatio;
  /** The track's tempo; only beat-locked templates read it. */
  bpm?: number;
  /** The AKUSPACE room; only Acoustic Space shots read it. */
  acoustic?: AcousticSetting;
}

/** What each input means for one template, and its default. */
export interface InputSpec {
  subject: { label: string; hint: string; default: string };
  title: { label: string; hint: string; default: string };
  /** The variants the template offers; the first is the default. */
  aspects: readonly AspectRatio[];
  bpm?: { default: number; min: number; max: number };
  acoustic?: AcousticSetting;
}

export interface TemplateReference {
  id: string;
  label: string;
  kind: "image" | "audio";
  /** What the media holds for the template. */
  /** `start`: a generation card's start image (`shared/gallery/generations.ts`). */
  role: "product" | "character" | "storyboard" | "track" | "start";
  min: number;
  max: number;
  hint: string;
  /**
   * The registry entry that can make this reference when the person has
   * none. Absent: bring your own. Counted by `tierOf` as a step.
   */
  madeWith?: string;
  /** How many candidates `madeWith` makes for the person to choose from. */
  candidates?: number;
  /**
   * An app-relative example the template opens with in its place (the
   * gallery's drop zone and the Director's sample). Absent: the Director's
   * sample for the role, if it has one (`sampleReferences`).
   */
  example?: `/${string}`;
}

export interface TemplateShot {
  id: string;
  label: string;
  /** The registry entry (`shared/registry.ts`) that renders the shot. */
  entry: string;
  /**
   * Whole seconds the entry offers, or bars of the track: a beat-locked shot
   * is cut on a downbeat and generated at the shortest offered length that
   * covers it.
   */
  length: { seconds: number } | { bars: number };
  /** Terms from `shared/camera.ts`, written in the entry's own wording. */
  camera: CameraSelection;
  /** What happens, present tense; `{subject}` is replaced by the input. */
  action: string;
  /** Ids of this template's references the shot's plan carries. */
  references: readonly string[];
  /**
   * A still's extra reference: the first frame of this template's take
   * (`takes`), when the project holds one (World Builder's Send first frame).
   */
  firstFrameOf?: string;
}

/**
 * A World Builder take the template plays on its shots lane: a named take
 * (`shared/scene/named-takes.ts`) the person or an agent's hand-off sets up
 * and the person captures. It is not a run, so the planner prices nothing
 * for it; its MP4 replaces its plate like a shot's clip.
 */
export interface TemplateTake {
  id: string;
  label: string;
  /** The named take's id. */
  take: string;
  /** The take's length on its own 24 fps grid, 8k + 1 frames. */
  frames: number;
}

/** The Director lanes a template opens with, bottom to top. */
export type TemplateTrack =
  | { kind: "audio"; id: string; name: string; reference: string }
  | { kind: "shots"; id: string; name: string }
  | {
      kind: "graphics";
      id: string;
      name: string;
      /** The p5 rings module from the Director's example bundle. */
      module: "rings";
      /** The swatch the module draws in. */
      swatch: number;
      count: number;
      opacity: number;
    }
  | {
      /**
       * The take's WAV after Apply room: no lane until that file is in the
       * project's assets, as an optional track not yet supplied.
       */
      kind: "take-sound";
      id: string;
      name: string;
      take: string;
    }
  | {
      kind: "type";
      id: string;
      name: string;
      /** The shot the words enter on; they stay to the end. */
      from: string;
      size: number;
      swatch: number;
    };

/**
 * A finished example, filled by the worked-examples box (issue #20). Paths
 * are app-relative; inputs record what made it.
 */
export interface TemplateExample {
  id: string;
  video: string;
  poster: string;
  /** Measured preview size when it differs from the current composition. */
  size?: { width: number; height: number };
  aspect: AspectRatio;
  inputs: TemplateInputs;
}

/**
 * How the gallery's Generate runs a template (`run-kind.ts`). `mechanical`:
 * one generation its recipe fully describes (prompt, references, model,
 * controls), run in place in the gallery through the Camera's paid path.
 * `agent`: editing steps (several shots, trims, a cut to a track), so
 * Generate starts an agent session on the template's project. `mix`: a
 * finished edit of bundled media with nothing to generate, so there is no
 * Generate; the gallery and the Director open the cut as it is. Absent
 * means `agent`.
 */
export type RunKind = "mechanical" | "agent" | "mix";

/**
 * A mix template's cut (`mix.ts`) and the bundled media it plays, each at an
 * app-relative URL with the bundle path it takes in the project.
 */
export interface TemplateMix {
  cut: MixSpec;
  media: Record<string, Omit<MixMedia, "sha256"> & { url: `/${string}` }>;
  /**
   * An optional last step: upscale the rendered mix with a registry upscale
   * entry. Opt-in (`optIn` is the literal `true`, so no template can make it
   * automatic): the person asks for it, then it is quoted and confirmed like
   * any run. Counted by `tierOf` as a step.
   */
  upscale?: MixUpscale;
}

export interface MixUpscale {
  /** A ready registry entry whose generator is `upscale`. */
  entry: string;
  /** The amount offered, inside the entry's 1.5× to 3×. */
  factor: number;
  optIn: true;
}

/**
 * A single generation the gallery shows beside an existing clip
 * (`shared/gallery/generations.ts`): one start image and one prompt, run
 * mechanically. `recorded` is true only when the owner supplied both, the
 * only time the card may say the clip was made from them.
 */
export interface TemplateGeneration {
  /** The clip's file name under public/media/template-gallery/. */
  clip: string;
  /** The owner's prompt, sent as written; empty until supplied. */
  prompt: string;
  recorded: boolean;
  /** The owner's controls for the run, when recorded; the drawer opens on them. */
  settings?: GenerationSettings;
}

/**
 * The FLUX 3 image-to-video controls a generation was made with, each one of
 * the values its registry entry offers (`shared/gallery/generations.ts`).
 */
export interface GenerationSettings {
  /** Whole seconds. */
  duration?: number;
  aspect?: AspectRatio;
  resolution?: VideoResolution;
}

export interface HouseTemplate {
  id: string;
  name: string;
  /** Declared, never inferred; absent is `agent`. */
  run?: RunKind;
  /** Present on a gallery generation card only, never on a house template. */
  generation?: TemplateGeneration;
  /** Present on a mix template (`run: "mix"`) only. */
  mix?: TemplateMix;
  /** One line for a gallery card. */
  description: string;
  tier: Tier;
  style: HouseStyle;
  inputs: InputSpec;
  references: readonly TemplateReference[];
  shots: readonly TemplateShot[];
  tracks: readonly TemplateTrack[];
  examples: readonly TemplateExample[];
  /** World Builder takes after the shots, free to make (`TemplateTake`). */
  takes?: readonly TemplateTake[];
}
