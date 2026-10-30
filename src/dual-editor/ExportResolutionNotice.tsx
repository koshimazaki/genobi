import { exportResolution, type MixedSizing } from "./export-resolution";
import type { EditClip } from "./timeline-model";
import type { TimelineSource } from "./timeline-export";
export default function ExportResolutionNotice({
  clips,
  sources,
  copy,
  sizing,
}: {
  clips: EditClip[];
  sources: Map<string, TimelineSource>;
  copy: boolean;
  sizing: MixedSizing;
}) {
  const info = exportResolution(
    clips,
    new Map([...sources].map(([id, s]) => [id, s.engine])),
    sizing,
  );
  if (!info)
    return <p>Add a clip to see its native resolution. Up to 2 minutes.</p>;
  return (
    <div
      className="de-resolution-info"
      role="note"
      aria-label="Export resolution"
    >
      <strong>
        {copy && info.mixed
          ? "Different native resolutions"
          : `Export ${copy ? info.used[0].width : info.width} × ${copy ? info.used[0].height : info.height}`}{" "}
        · {copy ? "source timing" : `${info.frameRate} fps`}
      </strong>
      <p>
        {copy
          ? "Lossless source copy: original compressed picture and sound, without re-encoding. Cuts must use safe keyframe and audio packet boundaries."
          : "Native resolution · high-quality re-encode for exact cuts. This mode is lossy, 8-bit SDR; it does not preserve HDR."}
      </p>
      {info.mixed && (
        <p className="de-resolution-mismatch">
          {copy
            ? "Mixed dimensions cannot share one lossless video track. Choose Native exact cuts, then keep native size or scale to fit."
            : `Mixed resolutions → ${info.width} × ${info.height}. ${sizing === "native" ? "Keep native size: smaller clips are padded, never resized." : "Scale to fit: clips fill the canvas as far as their aspect ratio allows."}`}
        </p>
      )}
      <details>
        <summary>Source resolutions · {info.used.length}</summary>
        <ul>
          {info.used.map((s) => (
            <li key={s.id}>
              <span>{s.name}</span>{" "}
              <b>
                {s.width} × {s.height}
              </b>{" "}
              · {copy ? "Original pixels" : s.operation}
              {!copy && s.bars ? " · black borders" : ""}
            </li>
          ))}
        </ul>
      </details>
      <p>
        Frame PNGs keep native dimensions. Frame edits affect PNGs; timeline
        clips retain their original picture.
      </p>
    </div>
  );
}
