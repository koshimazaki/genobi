import { useEffect, useRef, useState } from "react";
import type { CloudReadiness } from "../../shared/comfy/readiness";
import type { WorkflowCatalogue } from "../../shared/comfy/workflows";
import "../styles/workflow-check.css";

type Report = WorkflowCatalogue & { cloud: CloudReadiness };
const LABEL = {
  compatible: "Node and model metadata matches",
  blocked: "Missing resources",
  unknown: "Availability incomplete",
  "deployment-required": "Requires a Comfy deployment",
};

/** An explicit account check, independent of the chosen generation destination. */
export function CloudWorkflowCheck({
  apiKey,
  connectionRevision,
}: {
  apiKey: string;
  connectionRevision: string;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    pending.current?.abort();
    setReport(null);
    setMessage("");
    setBusy(false);
    return () => pending.current?.abort();
  }, [apiKey, connectionRevision]);

  const check = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setReport(null);
    setMessage("");
    try {
      const response = await fetch("/api/settings/workflows?check=cloud", {
        headers: apiKey ? { "x-byo-key": apiKey } : {},
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw new Error(
          data.error || "The Cloud check could not be completed.",
        );
      if (
        data.cloud?.destination !== "cloud" ||
        !data.cloud.templates ||
        !Array.isArray(data.templates)
      )
        throw new Error(
          "This server does not support Cloud workflow checks yet.",
        );
      setReport(data as Report);
      setMessage("Comfy Cloud catalogue checked. No generation was submitted.");
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error ? error.message : "The Cloud check failed.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <div className="workflow-check">
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => void check()}
      >
        {busy ? "Checking Comfy Cloud…" : "Check Comfy Cloud workflows"}
      </button>
      <p className="settings-note">
        Read this account’s node and model availability before a render.
      </p>
      <p className="settings-note" role="status">
        {message}
      </p>
      {report && (
        <details>
          <summary>
            Workflow compatibility ({Object.keys(report.cloud.templates).length}
            )
          </summary>
          <p className="settings-note">{report.cloud.note}</p>
          <ul>
            {report.templates.map((template) => {
              const result = report.cloud.templates[template.id];
              if (!result) return null;
              const missing = [...result.missingNodes, ...result.missingModels];
              const unknown = [...result.unknownNodes, ...result.unknownModels];
              return (
                <li key={template.id}>
                  <strong>{template.label}</strong>
                  <span>{LABEL[result.status]}</span>
                  {missing.length > 0 && (
                    <small>Not listed: {missing.join(", ")}.</small>
                  )}
                  {unknown.length > 0 && (
                    <small>Not verified: {unknown.join(", ")}.</small>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
