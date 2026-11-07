import { studioStore } from "../studio/store";
import { openInDirector } from "./director";
import { attachScrollMedia } from "./live-media";
import { scrollDirectorReceipt } from "../../shared/scrolls/live-actions";
import {
  liveScrollEdit,
  scrollSnapshot,
  type LiveScrollRequest,
  type ScrollSnapshot,
  type ScrollLiveResult,
  type LiveScrollStatus,
  sameScrollContext,
} from "../../shared/scrolls/live";
import type { useScrolls } from "./useScrolls";
type ScrollState = ReturnType<typeof useScrolls>;
export function scrollLiveAdapter(current: () => ScrollState) {
  const mountId = current().currentMount();
  function snapshot(): ScrollSnapshot {
    const s = current(),
      bundle = s.current(),
      cell = s.currentCell();
    return scrollSnapshot({
      document: bundle.document,
      context: {
        documentId: bundle.document.id,
        revision: bundle.document.revision,
        // A selection whose cell was removed (Cells resized down) is no
        // selection; reporting it would fail every poll and drop the tab.
        cellId:
          cell && bundle.document.cells.some((c) => c.id === cell)
            ? cell
            : null,
      },
      director: studioStore.getState().director.bundle
        ? {
            id: studioStore.getState().director.bundle!.project.id,
            revision: studioStore.getState().director.bundle!.project.revision,
          }
        : null,
      availableAssetIds: bundle.document.assets
        .filter((a) => bundle.files.has(a.file.path))
        .map((a) => a.id),
    });
  }
  return {
    snapshot,
    async execute(
      request: LiveScrollRequest,
      job?: LiveScrollStatus,
      signal?: AbortSignal,
    ) {
      const s = current();
      let result: ScrollLiveResult | undefined, error: unknown;
      const ran = await s.run(async () => {
        try {
          const before = s.current();
          const guard = () => {
            signal?.throwIfAborted();
            if (s.currentMount() !== mountId)
              throw new Error(
                "This Scroll was reopened. Link and inspect its new browser connection.",
              );
            if (
              s.current() !== before ||
              !sameScrollContext(snapshot().context, request.context)
            )
              throw new Error(
                "The Scroll document, revision or selected cell changed. Inspect again.",
              );
          };
          guard();
          const document = liveScrollEdit(snapshot(), request);
          if (request.command.op === "attach-media") {
            if (!job)
              throw new Error(
                "This attachment has no dispatched media receipt.",
              );
            const attached = await attachScrollMedia(before, job, signal);
            guard();
            s.commit(attached.bundle, before);
            result = { ...snapshot(), attachment: attached.attachment };
            s.setMessage(
              `Agent attached ${request.command.name} · Scroll revision ${result.document.revision}`,
            );
          } else if (request.command.op === "handoff-director") {
            const receipt = await openInDirector(before, guard);
            const handoff = scrollDirectorReceipt.parse({
              destinationProjectId: receipt.destinationProjectId,
              destinationRevision: receipt.destinationRevision,
              assetIds: receipt.assetIds,
              layerIds: receipt.layerIds,
            });
            result = { ...snapshot(), handoff };
            s.setMessage(
              `Director ready · ${handoff.destinationProjectId} · revision ${handoff.destinationRevision}`,
            );
          } else {
            s.commit({ ...before, document }, before);
            if (
              s.currentCell() &&
              !document.cells.some((c) => c.id === s.currentCell())
            )
              s.setSelectedCell(null);
            result = snapshot();
            s.setMessage(
              `Agent edit applied · Scroll revision ${document.revision}`,
            );
          }
        } catch (caught) {
          error = caught;
          throw caught;
        }
      });
      if (!ran || !result)
        throw (
          error ?? new Error("Wait for the current Scroll operation to finish.")
        );
      return result;
    },
  };
}
