import {
  renderReadme,
  type RenderReport,
} from "../../shared/licensing/render-report";
import { download } from "./bundle";
import "./render-result.css";

export default function RenderResult({
  url,
  report,
  edit,
}: {
  url: string;
  report: RenderReport;
  edit: () => void;
}) {
  return (
    <section
      className="dir-render-result"
      aria-label="Finished video and usage report"
    >
      <h2>Finished video</h2>
      <video
        controls
        preload="metadata"
        src={url}
        aria-label="Rendered composition"
      />
      <p>{report.summary}</p>
      <p>
        <strong>{report.status}</strong> · Project revision {report.revision}
      </p>
      <div className="dir-result-actions">
        <a className="dir-primary" href={url} download="director-render.mp4">
          Download video ↓
        </a>
        <button
          onClick={() =>
            download(
              new Blob([renderReadme(report)], { type: "text/markdown" }),
              "README-render.md",
            )
          }
        >
          Download README ↓
        </button>
        <button onClick={edit}>Edit in Editor</button>
      </div>
      <details>
        <summary>What was used and what needs review</summary>
        <h3>Models</h3>
        {report.models.length ? (
          <ul>
            {report.models.map((model) => (
              <li key={model}>{model}</li>
            ))}
          </ul>
        ) : (
          <p>
            No recognized generation record; imported media may have other
            origins.
          </p>
        )}
        <h3>Creative libraries</h3>
        {report.libraryVersions.length ? (
          <ul>
            {report.libraryVersions.map((library) => (
              <li key={library}>{library}</li>
            ))}
          </ul>
        ) : (
          <p>No creative module engine recorded in active layers.</p>
        )}
        <h3>Preference and licence check</h3>
        <ul>
          {[...report.conflicts, ...report.gaps].map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <p>
          Only the recorded inventory is checked. Missing evidence stays
          unresolved.
        </p>
      </details>
    </section>
  );
}
