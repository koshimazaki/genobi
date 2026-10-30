import { entryLabel, readyEntry } from "./registry";

/**
 * Why the OmniRef four offer one length and shape, and where the others are.
 * Comfy's template turns its Duration into the 17k+5 frame grid and notes a
 * 15 s run at 1344 × 768, but ships 5 s to avoid running out of memory; no
 * longer or other-shaped Cloud run, or its cost, has been measured here.
 * The Router row is named from the registry, so the hint cannot drift from
 * the menu. It lives apart from `shared/h3.ts`, which the registry's own
 * imports reach (through `music.ts`), so importing the registry there would
 * be a cycle.
 */
export const h3OmniFixed = () =>
  `124 frames at 24 fps, 1344 × 768: OmniRef's one proven recipe. For 4–15 s, other ratios or 2K, choose ${entryLabel(readyEntry("minimax-h3-router")!)}.`;
