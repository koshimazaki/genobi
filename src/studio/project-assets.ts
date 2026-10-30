/**
 * One path for every output into the open project's assets: a 3D take or
 * first frame, a Dual Swords frame, a rendered or imported Director video, a
 * gallery result or saved video. Each is checked by the shared rule
 * (`checkAssetMedia`: type, size, control characters stripped from the
 * name), then imported through the studio's `import-asset` command, so it is
 * measured by the Director's importer, deduplicated by hash, undoable, and
 * pushed to the local project copy like any other edit. A session source is
 * read through its owner-checked route, never a supplied path.
 */
import {
  checkAssetMedia,
  assetContentType,
  type AssetUse,
} from "../../shared/director/asset-media";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_MEDIA_LIMIT,
} from "../../shared/director/types";
import { executeStudioCommand } from "./commands";
import { studioStore, type createStudioStore } from "./store";

type Store = ReturnType<typeof createStudioStore>;

export interface OutputMedia {
  blob: Blob;
  filename: string;
  /** `production` shows under Project, `reference` under Inspirations. */
  use: AssetUse;
  /**
   * Sent from inside the asset rail (its Library tab): the rail stays on
   * that tab, so the card's own answer and Undo stay in view.
   */
  keepTab?: boolean;
}
export interface AddedAsset {
  assetId: string;
  /** False when the project already held the same bytes for this use. */
  added: boolean;
  use: AssetUse;
  filename: string;
  /** The rail should stay where it is (`OutputMedia.keepTab`). */
  keepTab?: boolean;
}
export type AddAsset = (media: OutputMedia) => Promise<AddedAsset>;

const listeners = new Set<(asset: AddedAsset) => void>();
/** Told after every add, so the asset rail can show the tab it landed in. */
export function onAssetAdded(listener: (asset: AddedAsset) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const assetTab = (use: AssetUse) =>
  use === "reference" ? "Inspirations" : "Project";

/** What the person reads after an add, naming the tab it is under. */
export function addedMessage(asset: AddedAsset) {
  return asset.added
    ? `${asset.filename} added to project assets · ${assetTab(asset.use)}.`
    : `${asset.filename} is already in project assets · ${assetTab(asset.use)}.`;
}

export async function addToProjectAssets(
  media: OutputMedia,
  store: Store = studioStore,
): Promise<AddedAsset> {
  const checked = checkAssetMedia({
    filename: media.filename,
    contentType: media.blob.type,
    size: media.blob.size,
    use: media.use,
  });
  const before = store.getState().director.bundle;
  if (!before)
    throw new Error("The project is still opening. Try again in a moment.");
  const result = await executeStudioCommand(
    { op: "import-asset", revision: before.project.revision, use: checked.use },
    new File([media.blob], checked.filename, { type: checked.contentType }),
    store,
  );
  const receipt = result.receipt as { assetIds?: string[] };
  const assetId = receipt.assetIds?.[0];
  if (!assetId) throw new Error("The media did not reach the project.");
  const added: AddedAsset = {
    assetId,
    added: !Object.hasOwn(before.project.assets, assetId),
    use: checked.use,
    filename: checked.filename,
    ...(media.keepTab ? { keepTab: true } : {}),
  };
  store.getState().actions.workspace({ assetRole: checked.use });
  for (const listener of listeners) listener(added);
  return added;
}

/**
 * Copy media the studio already serves (a gallery result, a saved video) into
 * the project. The route checks ownership; this bounds the read and refuses
 * a type the project cannot hold before a byte is kept.
 */
export async function addServedMediaToProjectAssets(
  url: string,
  filename: string,
  use: AssetUse,
  store: Store = studioStore,
  options: { keepTab?: boolean } = {},
): Promise<AddedAsset> {
  const before = store.getState().director.bundle;
  if (!before) throw new Error("Open a project first.");
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.body)
    throw new Error("This result is unavailable. Try again later.");
  const type = assetContentType(response.headers.get("content-type"));
  if (!type) {
    await response.body.cancel();
    throw new Error("Choose a PNG, JPEG, WebP, MP4, MP3, WAV or FLAC result.");
  }
  if (Number(response.headers.get("content-length")) > DIRECTOR_MEDIA_BYTES) {
    await response.body.cancel();
    throw new Error(`Project media must be under ${DIRECTOR_MEDIA_LIMIT}.`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > DIRECTOR_MEDIA_BYTES)
        throw new Error(`Project media must be under ${DIRECTOR_MEDIA_LIMIT}.`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  if (store.getState().director.bundle !== before)
    throw new Error("Project changed. Add the result again.");
  return addToProjectAssets(
    { blob: new Blob(chunks, { type }), filename, use, ...options },
    store,
  );
}
