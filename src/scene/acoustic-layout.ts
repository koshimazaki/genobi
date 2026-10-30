import data from "../../shared/akuspace-presets.json";
import type { AcousticSetting } from "../../shared/acoustic";

export interface AcousticViewerState {
  space_mode: "dry" | "room" | "outside" | "sfx";
  room_preset: string;
  outdoor_time: string;
  sfx_preset: string;
  effect_level: string;
  sfx_level: string;
}
export interface AcousticViewerMetrics {
  visual_amount: number;
}
export interface AcousticViewerPreset {
  mode: string;
  palette: string[];
  time_of_day?: string;
}
/** The original viewer's state and visual-amount calculation. */
export function acousticViewerValues(
  setting: AcousticSetting | null,
  palette: string[],
) {
  const state: AcousticViewerState = {
    space_mode: setting?.mode ?? "dry",
    room_preset: setting?.preset ?? "medium_room",
    outdoor_time: setting?.preset === "outdoor_night" ? "night" : "day",
    sfx_preset: "dual_delay",
    effect_level: setting?.level ?? "mid",
    sfx_level: setting?.level ?? "low",
  };
  const key = setting?.preset ?? "dry";
  const preset = (data.presets as Record<string, AcousticViewerPreset>)[key];
  const levels = data.levels as Record<string, { visual_amount: number }>;
  const metrics = {
    visual_amount: setting ? levels[setting.level].visual_amount : 0,
  };
  return { state, metrics, preset: { ...preset, palette } };
}
