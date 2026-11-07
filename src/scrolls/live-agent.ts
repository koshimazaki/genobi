import {
  liveScrollEdit,
  scrollSnapshot,
  type LiveScrollRequest,
  type ScrollSnapshot,
} from "../../shared/scrolls/live";
import type { useScrolls } from "./useScrolls";
type ScrollState = ReturnType<typeof useScrolls>;
export function scrollLiveAdapter(current: () => ScrollState) {
  const mountId = current().currentMount();
  function snapshot(): ScrollSnapshot {
    const s = current(),
      bundle = s.current();
    return scrollSnapshot({
      document: bundle.document,
      context: {
        documentId: bundle.document.id,
        revision: bundle.document.revision,
        cellId: s.currentCell(),
      },
      availableAssetIds: bundle.document.assets
        .filter((a) => bundle.files.has(a.file.path))
        .map((a) => a.id),
    });
  }
  return {
    snapshot,
    async execute(request: LiveScrollRequest) {
      const s = current();
      let result: ScrollSnapshot | undefined, error: unknown;
      const ran = await s.run(async () => {
        try {
          if (s.currentMount() !== mountId)
            throw new Error(
              "This Scroll was reopened. Link and inspect its new browser connection.",
            );
          const before = s.current(),
            document = liveScrollEdit(snapshot(), request);
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
