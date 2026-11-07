import {
  scrollAttach,
  scrollMediaInput,
} from "../../shared/scrolls/live-actions";
import type { LiveScrollStatus } from "../../shared/scrolls/live";
import { digest } from "../director/file-hash";
import { addFile } from "./bundle";
import type { ScrollBundle } from "./files";
/** Both the server and browser inspect bytes; receipt metadata cannot synthesize an asset. */
export async function attachScrollMedia(
  before: ScrollBundle,
  job: LiveScrollStatus,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const command = scrollAttach.parse(job.request.command),
    media = scrollMediaInput.parse(job.media);
  if (media.sha256 !== command.receiptId)
    throw new Error("Media receipt hash changed.");
  const response = await fetcher(
    `/api/exports/scrolls/commands/${job.id}/media`,
    { signal },
  );
  if (!response.ok)
    throw new Error(
      "The owned media is no longer available. Inspect before staging again.",
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.length !== media.byteLength ||
    (await digest(bytes)) !== media.sha256
  )
    throw new Error("Downloaded media does not match its inspected receipt.");
  signal?.throwIfAborted();
  const bundle = await addFile(
    before,
    new File([bytes], command.name, { type: media.contentType }),
    command.role,
    command.cellId,
  );
  const asset = bundle.document.assets.at(-1)!;
  return {
    bundle,
    attachment: { assetId: asset.id, sha256: asset.file.sha256 },
  };
}
