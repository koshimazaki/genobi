import type { Project } from "../../shared/director/types";
import { timecode, type TimeUnits } from "./timecode";

/**
 * Frame notes as pins on the frame ruler. A pin seeks to its frame and
 * selects the layer the note names; the ruler's own click does not also run.
 */
export default function NoteMarkers({
  project,
  pixels,
  units,
  disabled,
  seek,
  select,
}: {
  project: Project;
  pixels: number;
  units: TimeUnits;
  disabled: boolean;
  seek: (frame: number) => void;
  select: (id: string) => void;
}) {
  const { fps } = project.composition;
  const names = new Map(project.layers.map((l) => [l.id, l.name]));
  return (project.notes ?? []).map((n) => {
    const layer = n.layerId ? names.get(n.layerId) : undefined;
    const label = `Note at ${timecode(n.frame, fps, units)}${layer ? ` on ${layer}` : ""}${n.resolved ? " (resolved)" : ""}: ${n.text}`;
    return (
      <button
        key={n.id}
        type="button"
        className={`dir-note-marker ${n.resolved ? "is-resolved" : ""} ${n.author === "agent" ? "by-agent" : ""}`}
        style={{ left: n.frame * pixels }}
        data-note={n.id}
        aria-label={label.slice(0, 160)}
        title={label}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          seek(n.frame);
          if (n.layerId) select(n.layerId);
        }}
      />
    );
  });
}
