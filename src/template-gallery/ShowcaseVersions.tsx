import { useState, type MouseEvent } from "react";
import { showcaseLink } from "../../shared/showcase/types";
import { showcaseForTemplate } from "../director/showcase";
import { openShowcase } from "./open-showcase";

// A plain click opens in place; a modified one opens a tab.
const plain = (e: MouseEvent) =>
  !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

/**
 * "How it was made": a mix template's recorded versions
 * (docs/director-bundle/showcase/), newest first (work in progress, then
 * the latest finished version), so a reviewer opens the current cut without
 * scrolling past v1. Each opens in the
 * Editor as an editable project of its own. Absent when the template has
 * no record.
 */
export default function ShowcaseVersions({ template }: { template: string }) {
  const record = showcaseForTemplate(template);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  if (!record) return null;
  return (
    <section className="template-recipe" aria-label="How it was made">
      <h3>How it was made</h3>
      <ol className="template-showcase">
        {record.pending?.map((p) => (
          <li key={`pending-${p.version}`}>
            <p>
              <strong>v{p.version} · in progress</strong>
            </p>
            <p>{p.summary}</p>
          </li>
        ))}
        {[...record.versions]
          // By number, not file order: a hand-kept record may be unsorted.
          .sort((a, b) => b.version - a.version)
          .map((v, i) => (
            <li key={v.version}>
              <p>
                <strong>
                  v{v.version} · {v.title}
                  {i === 0 && " · latest"}
                </strong>{" "}
                <span>
                  {v.pr ? `#${v.pr} · ` : ""}
                  {v.date.slice(0, 10)}
                </span>
              </p>
              <p>{v.summary}</p>
              <a
                className="template-secondary"
                href={showcaseLink(record.project, v.version)}
                aria-disabled={busy !== 0}
                onClick={(e) => {
                  if (!plain(e)) return;
                  e.preventDefault();
                  if (busy) return;
                  setBusy(v.version);
                  setError("");
                  openShowcase(record.project, v.version)
                    .catch((x) =>
                      setError(x instanceof Error ? x.message : `${x}`),
                    )
                    .finally(() => setBusy(0));
                }}
              >
                {busy === v.version
                  ? "Opening…"
                  : `Open v${v.version} in the editor`}
              </a>
            </li>
          ))}
      </ol>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
