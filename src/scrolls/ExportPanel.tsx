import { studioStore } from "../studio/store";
import { useShell } from "../studio/ShellContext";
import { useScrollAgentExport } from "./agent-export";
import type { useScrolls } from "./useScrolls";

export default function ScrollExportPanel({
  s,
}: {
  s: ReturnType<typeof useScrolls>;
}) {
  const exportState = useScrollAgentExport(s);
  const shell = useShell();
  if (!exportState.available) return null;
  return (
    <section aria-label="Scroll agent connection">
      <div className="scroll-toolbar">
        <button
          disabled={!exportState.tabId}
          onClick={() => void exportState.link()}
        >
          Link agent to this Scroll
        </button>
        <button onClick={() => exportState.setEnabled(!exportState.enabled)}>
          {exportState.enabled
            ? "Disconnect Scroll agents"
            : "Enable Scroll agent connection"}
        </button>
      </div>
      {exportState.code && (
        <p>
          One-use link code: <code>{exportState.code}</code>. Give it to your
          agent for this open Scroll. It expires in ten minutes.
        </p>
      )}
      <p>
        Linked agents can inspect and edit this document, attach owned media,
        hand selected assets to Director, or export a media ZIP or JSON. Edits
        require its current revision. JSON needs its matching media bundle.
        Closing or disconnecting this tab ends its links.
      </p>
      {exportState.handoff && (
        <p>
          Director project ready: {exportState.handoff.destinationProjectId} ·
          revision {exportState.handoff.destinationRevision} ·{" "}
          {exportState.handoff.assetIds.length} assets.{" "}
          <button
            onClick={() => {
              if (
                studioStore.getState().director.bundle?.project.id !==
                exportState.handoff?.destinationProjectId
              ) {
                s.setMessage(
                  "Director changed after the handoff. Open that saved project from Director's project menu.",
                );
                return;
              }
              shell?.select("director");
            }}
          >
            Open Director
          </button>
        </p>
      )}
      {exportState.receipt && (
        <p>
          <a
            href={exportState.receipt.download}
            download={exportState.receipt.file}
          >
            Download requested Scroll{" "}
            {exportState.receipt.format === "scroll-json" ? "JSON" : "ZIP"}
          </a>{" "}
          · source revision {exportState.receipt.source.revision}
        </p>
      )}
    </section>
  );
}
