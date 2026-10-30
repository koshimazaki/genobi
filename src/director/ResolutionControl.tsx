import { useState } from "react";
import { inspectMp4 } from "../../shared/mp4";
import {
  COMPOSITION_RESOLUTIONS,
  matchAssetResolution,
} from "../../shared/director/resolution";
import type { Bundle } from "./bundle";

/** Match reads the actual bundled videos, including old imported manifests
 * with no dimension metadata. Only the resolved size crosses the command API.
 */
export default function ResolutionControl({
  bundle,
  busy,
  command,
  report,
}: {
  bundle: Bundle;
  busy: boolean;
  command: (command: unknown) => string;
  report: (error: unknown) => void;
}) {
  const [reading, setReading] = useState(false);
  const c = bundle.project.composition;
  const current = `${c.width}x${c.height}`;
  async function change(value: string) {
    setReading(true);
    try {
      const size =
        value === "match"
          ? matchAssetResolution(
              c,
              await Promise.all(
                Object.values(bundle.project.assets)
                  .filter((a) => a.kind === "video")
                  .map(async (a) => {
                    const bytes = bundle.files.get(a.file.path);
                    if (!bytes)
                      throw new Error(`Missing video: ${a.file.path}`);
                    return inspectMp4(
                      bytes.length,
                      async (offset, length) =>
                        bytes.slice(offset, offset + length).buffer,
                    );
                  }),
              ),
            )
          : (() => {
              const [width, height] = value.split("x").map(Number);
              return { width, height };
            })();
      if (size.width === c.width && size.height === c.height) return;
      const error = command({ op: "set-resolution", ...size });
      if (error) throw new Error(error);
    } catch (error) {
      report(error);
    } finally {
      setReading(false);
    }
  }
  return (
    <label className="dir-resolution">
      Resolution
      <select
        aria-label="Composition resolution"
        value={current}
        disabled={busy || reading}
        onChange={(e) => void change(e.target.value)}
      >
        {!COMPOSITION_RESOLUTIONS.some(
          (r) => `${r.width}x${r.height}` === current,
        ) && (
          <option value={current}>
            {c.width} × {c.height}
          </option>
        )}
        {COMPOSITION_RESOLUTIONS.map((r) => (
          <option key={r.width} value={`${r.width}x${r.height}`}>
            {r.width} × {r.height}
          </option>
        ))}
        <option value="match">Match assets</option>
      </select>
    </label>
  );
}
