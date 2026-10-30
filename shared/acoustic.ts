/**
 * Acoustic Space: the AKUSPACE treatment for LTX-2.5, in the vocabulary the
 * LoRA was trained on. `akuspace-presets.json` is a verbatim copy of
 * `nodes/audio/presets.json` from ComfyUI-Koshi-Nodes (version 4, release
 * 0.5), and `acousticCaption` and `appendAcoustic` port the node's
 * `build_caption` and `compose_prompt` (`nodes/audio/conditioning.py`), so the
 * text this studio appends is the text the AKUSPACE Prompt node emits for the
 * same settings, byte for byte. Comfy Cloud runs no custom nodes: the
 * workflow is the plain LTX-2.5 graph plus a core LoRA loader, and the prompt
 * it receives already carries the treatment.
 *
 * The node's `source_type` stays at its "none" default (the effect-only
 * caption), and Off (dry) is not a choice here: it bypasses the LoRA, which is
 * LTX-2.5 Fast on Router.
 */
import data from "./akuspace-presets.json";

export const AKUSPACE_RELEASE = data.release.display_version;
export const AKUSPACE_WORKFLOWS_URL =
  "https://github.com/koshimazaki/ComfyUI-Koshi-Nodes/tree/main/workflows/akuspace";

interface PresetSpec {
  mode: string;
  label: string;
  short_label: string;
  description: string;
  caption_where?: string;
  caption_character?: string;
  caption_tail?: string;
  time_of_day?: string;
}
interface LevelSpec {
  label: string;
  caption_word: string;
}
const PRESETS: Record<string, PresetSpec> = data.presets;
const LEVELS: Record<string, LevelSpec> = data.levels;
const SCHEMA = data.control_schema;
const TRIGGER =
  data.model_profiles.find(
    (profile) => profile.id === data.default_model_profile,
  )?.trigger ?? data.trigger;

export type AcousticMode = "room" | "outside" | "sfx";
export type AcousticLevel = "low" | "mid" | "high";
/**
 * One treatment: the node's mode, the presets.json key it resolves to (a room,
 * `outdoor_day` / `outdoor_night`, or `dual_delay`), and the trained level.
 */
export interface AcousticSetting {
  mode: AcousticMode;
  preset: string;
  level: AcousticLevel;
  /** Custom wording, without the separately protected AKUSPACE trigger. */
  text?: string;
}

/**
 * The dialog's sections follow the node's modes, with the node's own labels
 * and the presets and levels its control schema lists for each.
 */
export const acousticSections = [
  {
    id: "room",
    label: "Room",
    presets: SCHEMA.room_presets,
    levels: SCHEMA.reverb_levels,
    level: "mid",
  },
  {
    id: "outside",
    label: "Space",
    presets: SCHEMA.outdoor_times.map((time) => `outdoor_${time}`),
    levels: SCHEMA.outdoor_levels,
    level: SCHEMA.outdoor_level,
  },
  {
    id: "sfx",
    label: "Sound effects",
    presets: SCHEMA.sfx_presets,
    levels: SCHEMA.sfx_levels,
    level: SCHEMA.sfx_levels[0],
  },
] as const satisfies readonly {
  id: AcousticMode;
  label: string;
  presets: readonly string[];
  levels: readonly string[];
  level: string;
}[];
export type AcousticSection = (typeof acousticSections)[number];

/** The node's defaults: Room, medium room, moderate. */
export const defaultAcoustic: AcousticSetting = {
  mode: "room",
  preset: "medium_room",
  level: "mid",
};

export const acousticPreset = (key: string) => PRESETS[key];
export const levelLabel = (level: string) => LEVELS[level]?.label ?? level;
export const sectionFor = (mode: AcousticMode) =>
  acousticSections.find((section) => section.id === mode)!;

/** The setting a tile chooses: its section's mode, and the level carried over when that section has it. */
export function chooseAcoustic(
  section: AcousticSection,
  preset: string,
  current: AcousticSetting | null,
): AcousticSetting {
  const levels: readonly string[] = section.levels;
  const level =
    current && levels.includes(current.level) ? current.level : section.level;
  return {
    mode: section.id,
    preset,
    level: level as AcousticLevel,
    ...(current?.text !== undefined ? { text: current.text } : {}),
  };
}

/** `resolve_preset_key`: an unknown preset falls back as the node's does. */
function resolvePresetKey({ mode, preset }: AcousticSetting): string {
  if (mode === "outside")
    return preset === "outdoor_night" ? "outdoor_night" : "outdoor_day";
  const has = (list: readonly string[]) => list.includes(preset);
  if (mode === "sfx") return has(SCHEMA.sfx_presets) ? preset : "dual_delay";
  return has(SCHEMA.room_presets) ? preset : "medium_room";
}

/** `resolve_level_key`: only levels the v0.5 training manifest holds. */
function resolveLevelKey(mode: string, level: string): string {
  const has = (list: readonly string[]) => list.includes(level);
  if (mode === "outside")
    return has(SCHEMA.outdoor_levels) ? level : SCHEMA.outdoor_level;
  if (mode === "sfx") return has(SCHEMA.sfx_levels) ? level : "low";
  return has(SCHEMA.reverb_levels) ? level : "mid";
}

/** `build_caption` with no source: the trained caption grammar, trigger first. */
export function acousticCaption(setting: AcousticSetting): string {
  if (setting.text !== undefined) return `${TRIGGER} ${setting.text.trim()}`;
  const preset = PRESETS[resolvePresetKey(setting)];
  const level = LEVELS[resolveLevelKey(preset.mode, setting.level)];
  let caption =
    `${TRIGGER} ${preset.caption_where}, ` +
    `${level.caption_word} ${preset.caption_character}`;
  if (preset.caption_tail) caption += `, ${preset.caption_tail}`;
  return caption;
}

/** `compose_prompt`: the treatment follows the visual prompt; it never replaces it. */
export function appendAcoustic(base: string, treatment: string): string {
  const prompt = base.trim();
  const suffix = treatment.trim();
  if (!prompt) return suffix;
  if (!suffix) return prompt;
  const separator = /[,.;:]$/.test(prompt) ? " " : ", ";
  return `${prompt}${separator}${suffix}`;
}

/** A tile's name with its level: `Medium room · Moderate`. */
export function acousticLabel(setting: AcousticSetting): string {
  return `${PRESETS[resolvePresetKey(setting)].label} · ${levelLabel(setting.level)}`;
}

/**
 * A request's treatment, rebuilt from known values only, or undefined when it
 * names a mode, preset or level the node does not offer.
 */
export function readAcoustic(value: unknown): AcousticSetting | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const { mode, preset, level, text } = value as Record<string, unknown>;
  const section = acousticSections.find((item) => item.id === mode);
  if (!section || typeof preset !== "string" || typeof level !== "string")
    return;
  const presets: readonly string[] = section.presets;
  const levels: readonly string[] = section.levels;
  if (!presets.includes(preset) || !levels.includes(level)) return;
  if (
    text !== undefined &&
    (typeof text !== "string" ||
      !text.trim() ||
      text.length > ACOUSTIC_TEXT_LIMIT)
  )
    return;
  return {
    mode: section.id,
    preset,
    level: level as AcousticLevel,
    ...(text !== undefined ? { text: text as string } : {}),
  };
}

export const ACOUSTIC_TEXT_LIMIT = 600;
/** Editable wording excludes the protected model trigger. */
export const acousticText = (setting: AcousticSetting) =>
  acousticCaption(setting).slice(TRIGGER.length + 1);
