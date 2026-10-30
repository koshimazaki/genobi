import { defaultNinja, type PanelId } from "./presets";
import {
  MAX_LAYOUT_BYTES,
  parseLayoutText,
  type NinjaLayout,
  type NinjaPanel,
} from "../../shared/ninja-layout";
import { parseRails, type RailChoices } from "../../shared/saved-layouts";

export { MAX_LAYOUT_BYTES, type NinjaLayout, type NinjaPanel };
/** The working arrangement this browser opens Ninja with. */
export const NINJA_KEY = "genobi.ninja-layout.v1";
export function panelWidth(id: PanelId): "half" | "full" {
  return ["world", "dual", "timeline", "gallery", "file"].includes(id)
    ? "full"
    : "half";
}
export function defaultLayout(): NinjaLayout {
  return {
    format: "genobi.ninja-layout",
    version: 3,
    panels: defaultNinja.map((id) => ({ id, width: panelWidth(id) })),
  };
}
/** A layout is UI preferences only. Never serialize the project or connection. */
export const parseLayout = parseLayoutText;
/** Keeps `layout` as the arrangement Ninja reopens with; false when storage is blocked. */
export function storeWorkingLayout(layout: NinjaLayout) {
  try {
    localStorage.setItem(NINJA_KEY, JSON.stringify(layout));
    return true;
  } catch {
    return false;
  }
}
/** The Assets rail choices the last opened saved layout set, kept beside it. */
export const RAILS_KEY = "genobi.ninja-rails.v1";
/**
 * The rail choices to start with: those of the last opened saved layout, or
 * none (each workspace's own default) when none was opened or storage is
 * blocked or corrupt.
 */
export function readWorkingRails(): RailChoices {
  try {
    const text = localStorage.getItem(RAILS_KEY);
    return text ? parseRails(JSON.parse(text)) : {};
  } catch {
    return {};
  }
}
/**
 * Opens `layout` and its rail choices as the working arrangement. When
 * storage refuses either, the saved baseline stays as it was, so the shell
 * keeps showing unsaved changes and a reload is not mistaken for keeping it.
 */
export function openWorkingLayout(
  layout: NinjaLayout,
  rails: RailChoices,
  baseline: NinjaLayout,
) {
  let kept: boolean;
  try {
    localStorage.setItem(RAILS_KEY, JSON.stringify(rails));
    kept = storeWorkingLayout(layout);
  } catch {
    kept = false;
  }
  return { kept, saved: kept ? layout : baseline };
}
export function readLayout(): { layout: NinjaLayout; message: string } {
  try {
    const text = localStorage.getItem(NINJA_KEY);
    return {
      layout: text ? parseLayout(text) : defaultLayout(),
      message: text ? "Saved layout restored." : "",
    };
  } catch {
    return {
      layout: defaultLayout(),
      message: "Saved layout unavailable. You can load a layout JSON instead.",
    };
  }
}
export function movePanel(layout: NinjaLayout, from: PanelId, to: PanelId) {
  const start = layout.panels.findIndex((p) => p.id === from);
  const end = layout.panels.findIndex((p) => p.id === to);
  if (start < 0 || end < 0 || start === end) return layout;
  const next = [...layout.panels];
  next.splice(end, 0, next.splice(start, 1)[0]);
  return { ...layout, panels: next };
}

export function panelColumns(panel?: NinjaPanel) {
  return panel?.columns ?? (panel?.width === "full" ? 12 : 6);
}

export function resizePanel(columns: number, height: number) {
  const span = Math.max(4, Math.min(12, Math.round(columns)));
  return {
    columns: span,
    width: span === 12 ? ("full" as const) : ("half" as const),
    height: Math.max(200, Math.min(1600, Math.round(height / 8) * 8)),
  };
}
