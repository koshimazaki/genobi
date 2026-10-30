import { panels, type PanelId } from "../studio/presets";
import { timelineCommand } from "../timeline-keys";

/** Director keys answer in its own panels; Camera, 3D and Dual Swords keep theirs. */
export const ownedByDirector = (panel: string | undefined) =>
  !panel || panels[panel as PanelId]?.scope === "director";

export const directorShortcut = (
  event: KeyboardEvent,
  lastPointer: Element | null = null,
) => timelineCommand(event, ownedByDirector, lastPointer);
