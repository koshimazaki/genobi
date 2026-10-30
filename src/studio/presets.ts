import type { LayoutPanelId } from "../../shared/ninja-layout";
import type { RailPreset } from "../../shared/saved-layouts";

export const presets = [
  {
    id: "gallery",
    label: "Gallery",
    icon: "grid",
    description: "Explore templates. Find a look. Make it yours.",
  },
  {
    id: "camera",
    label: "Camera",
    icon: "camera",
    description: "Frame an idea. Choose a model. Make a shot.",
  },
  {
    id: "director",
    label: "Director",
    icon: "play",
    description: "Start with a template. Make it yours.",
  },
  {
    id: "editor",
    label: "Editor",
    icon: "sliders",
    description: "The same project, opened up. Timing, layers and sound.",
  },
  {
    id: "world",
    label: "3D",
    icon: "cube",
    description: "Build a set. Move the camera. Capture guidance.",
  },
  {
    id: "dual",
    label: "Dual Swords",
    icon: "swords",
    description: "Two sources. Precise frames. Keep what works.",
  },
  {
    id: "scrolls",
    label: "Scrolls",
    icon: "scroll",
    description:
      "Plan characters, shots and sound. Choose what travels onward.",
  },
  {
    id: "tools",
    label: "Project Tools",
    icon: "wrench",
    description:
      "Optional workflows, scripts and agent commands for this project.",
  },
  {
    id: "ninja",
    label: "Ninja",
    icon: "ninja",
    description: "Your tools, your arrangement. Choose what you need.",
  },
] as const;
export type Preset = (typeof presets)[number]["id"];
export const panels = {
  scrolls: { title: "Scrolls", scope: "" },
  preview: { title: "Camera preview", scope: "" },
  composer: { title: "Camera direction", scope: "" },
  gallery: { title: "Gallery", scope: "" },
  prompt: { title: "Prompt", scope: "director" },
  inputs: { title: "Make it yours", scope: "director" },
  stage: { title: "Composition", scope: "director" },
  templates: { title: "Templates", scope: "director" },
  timeline: { title: "Timeline & layers", scope: "director" },
  tools: { title: "Project tools", scope: "director" },
  project: { title: "Assets", scope: "director" },
  inspirations: { title: "Inspirations", scope: "director" },
  file: { title: "Project", scope: "director" },
  world: { title: "World Builder", scope: "" },
  // 3D camera plates (#18): the plates, radar and playblast panel.
  plates: { title: "3D camera controls", scope: "" },
  plateView: { title: "3D camera viewer", scope: "" },
  dual: { title: "Dual Swords", scope: "" },
} as const satisfies Record<LayoutPanelId, { title: string; scope: string }>;
export type PanelId = keyof typeof panels;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Saved layouts (`shared/saved-layouts.ts`) name exactly these rail workspaces. */
export const RAILS_AGREE: Same<Exclude<Preset, "ninja">, RailPreset> = true;
export const layouts: Record<Exclude<Preset, "ninja">, PanelId[]> = {
  scrolls: ["scrolls"],
  gallery: [],
  camera: ["preview", "composer", "gallery"],
  director: ["file", "stage", "prompt", "project", "inspirations", "templates"],
  editor: ["file", "stage", "timeline", "project", "inspirations", "gallery"],
  world: ["world"],
  dual: ["dual", "project", "inspirations"],
  tools: ["tools"],
};
export const defaultNinja: PanelId[] = [
  "stage",
  "prompt",
  "tools",
  "project",
  "inspirations",
];
export function initialPreset(path: string, search: string): Preset {
  const selected = new URLSearchParams(search).get("workspace");
  if (presets.some((p) => p.id === selected)) return selected as Preset;
  const route = path.replace(/\/$/, "");
  if (route === "/scrolls") return "scrolls";
  if (route === "/director") return "director";
  if (route === "/dual-editor") return "dual";
  if (route === "/world-builder" || route === "/scene-adapter") return "world";
  if (new URLSearchParams(search).has("job")) return "camera";
  return "gallery";
}
