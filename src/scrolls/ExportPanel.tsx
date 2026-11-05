import { useScrollAgentExport } from "./agent-export";
import type { useScrolls } from "./useScrolls";

export default function ScrollExportPanel({
  s,
}: {
  s: ReturnType<typeof useScrolls>;
}) {
  const exportState = useScrollAgentExport(s);
  if (!exportState.available) return null;
  return (
    <section aria-label="Scroll agent exports">
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
            : "Enable Scroll agent exports"}
        </button>
      </div>
      {exportState.code && (
        <p>
          One-use link code: <code>{exportState.code}</code>. Give it to your
          agent for this open Scroll. It expires in ten minutes.
        </p>
      )}
      <p>
        Linked agents can export this document as a media ZIP or JSON. JSON
        needs its matching media bundle. Closing or disconnecting this tab ends
        its links.
      </p>
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
