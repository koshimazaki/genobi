import catalogue from "../../public/motion/presets.json";

export const motionPresets = catalogue.presets;
export function motionPreset(id: string) {
  return motionPresets.find((preset) => preset.id === id) ?? motionPresets[0];
}
export function frameCount(id: string) {
  return Math.ceil((motionPreset(id).durationMs * 30) / 1000);
}
