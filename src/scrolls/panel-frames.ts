import { addFile, type ScrollBundle } from "./bundle";
import type { ScrollExample } from "./example-catalog";

/**
 * Loads an example plan's per-panel frames (World Builder first frames) as
 * uploaded style images tied to their panels, which `shared/scrolls/panel-frames.ts`
 * sends as each panel's own reference. A plan without frames is returned as is.
 */
export async function addPanelFrames(
  bundle: ScrollBundle,
  example: ScrollExample,
): Promise<ScrollBundle> {
  let next = bundle;
  const panels = example.plan?.panels ?? [];
  for (const [i, panel] of panels.entries()) {
    const cell = next.document.cells[i];
    if (!cell) break;
    const response = await fetch(`/scrolls/${panel.frame}`);
    if (!response.ok)
      throw new Error(`Could not load panel ${i + 1}'s 3D frame.`);
    const name = `P${String(i + 1).padStart(2, "0")} · ${cell.title} · 3D frame.png`;
    next = await addFile(
      next,
      new File([await response.blob()], name, { type: "image/png" }),
      "style",
      cell.id,
    );
  }
  return next;
}
