import {
  END_CARD_MODULE,
  legacyEndCards,
  upgradeEndCard,
} from "../../shared/templates/mix-end-card-upgrade";
import { loadExample, validateFiles, type Bundle } from "./bundle";
import type { createStudioStore } from "../studio/store";

/** Preserve any edit or copy reload that lands while the recipe loads. */
export async function upgradeOpenedBundle(
  store: ReturnType<typeof createStudioStore>,
  upgrade = upgradeBundle,
): Promise<string | undefined> {
  const opened = store.getState().director.bundle;
  if (!opened) return;
  const result = await upgrade(opened);
  if (!result || store.getState().director.bundle !== opened) return;
  store.getState().actions.commit(result.bundle, opened);
  return result.note;
}

export interface BundleUpgrade {
  bundle: Bundle;
  /** One line for the person: what changed and how to take it back. */
  note: string;
}

/**
 * Bring a bundle saved by an older studio up to date as it opens: today, a
 * Dimensions mix whose end card is still the baked `mix-end.mp4` capture
 * gets the editable `end-card` layer over it (shared/templates/
 * mix-end-card-upgrade.ts), with the registry's own recipe file. Undefined
 * when nothing needs changing, so a current bundle opens untouched.
 */
export async function upgradeBundle(
  bundle: Bundle,
  example: () => Promise<Bundle> = loadExample,
): Promise<BundleUpgrade | undefined> {
  if (!legacyEndCards(bundle.project).length) return undefined;
  const base = await example();
  const module = base.project.modules[END_CARD_MODULE];
  const file = module && base.files.get(module.file.path);
  if (!module || !file) return undefined;
  const result = upgradeEndCard(bundle.project, module);
  if (!result) return undefined;
  const files = new Map(bundle.files);
  files.set(module.file.path, file);
  const names = result.covers
    .map((id) => bundle.project.layers.find((l) => l.id === id)?.name ?? id)
    .join(", ");
  return {
    bundle: await validateFiles({ project: result.project, files }),
    note: `The end card is now the editable End card layer; the baked capture (${names}) stays under it. Undo puts it back.`,
  };
}
