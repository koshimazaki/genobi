/**
 * "Send to Director": add an item to the open project's assets from wherever
 * it is (a library item, a Scrolls output) without opening the Director. The
 * add itself is `addToProjectAssets` or `addServedMediaToProjectAssets`, so
 * the rule, the hash deduplication and the Director's undo history are the
 * ones every other output uses. This module only words the answer and keeps
 * the project the add produced, so Undo reverts that add and nothing else.
 */
import { assetTab, type AddedAsset } from "./project-assets";
import { studioStore, type createStudioStore } from "./store";

type Store = ReturnType<typeof createStudioStore>;
type Bundle = NonNullable<ReturnType<Store["getState"]>["director"]["bundle"]>;

/** Anything that reached the Director and can be undone while unchanged. */
export interface DirectorEdit {
  message: string;
  /** The project right after the edit; Undo works while it is still open. */
  after?: Bundle;
}
export interface SentToDirector extends DirectorEdit {
  asset: AddedAsset;
}

/** True for a control inside the asset rail, whose tab should not move. */
export const inAssetRail = (from: Element) =>
  !!from.closest(".studio-asset-rail");

/** What the person reads: added, or already there, and under which tab. */
export function directorMessage(asset: AddedAsset) {
  return asset.added
    ? `Added to the Director's assets · ${assetTab(asset.use)}.`
    : `Already in the Director's assets · ${assetTab(asset.use)}.`;
}

export async function sendToDirector(
  add: () => Promise<AddedAsset>,
  store: Store = studioStore,
): Promise<SentToDirector> {
  const asset = await add();
  return {
    asset,
    message: directorMessage(asset),
    // A repeat changed nothing, so there is nothing to undo.
    after: asset.added ? store.getState().director.bundle : undefined,
  };
}

/** True while the project is still the one the add produced. */
export function canUndoSend(sent: DirectorEdit, store: Store = studioStore) {
  const state = store.getState();
  return (
    !!sent.after &&
    state.director.bundle === sent.after &&
    !Object.values(state.operations).some(Boolean)
  );
}

/**
 * Reverts the add through the Director's own undo. Refuses, changing
 * nothing, once anything else has edited the project since.
 */
export function undoSend(sent: DirectorEdit, store: Store = studioStore) {
  if (!canUndoSend(sent, store)) return false;
  store.getState().actions.undo();
  return true;
}
