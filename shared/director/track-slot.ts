// The audio lane a project's template declares but the project lacks: a house
// template opened without its optional track (the anime teaser from the
// gallery with no song dropped). Portable, so every adapter reads one rule.
import { findHouseTemplate } from "../templates/catalogue";
import { laneId } from "./tracks";
import type { Project } from "./types";

export interface MissingTrack {
  id: string;
  name: string;
  /** Lanes the template stacks above the track, bottom to top. */
  below: string[];
}

export function missingTrack(project: Project): MissingTrack | undefined {
  if (project.layers.some((l) => l.kind === "audio")) return undefined;
  const tracks = findHouseTemplate(project.id)?.tracks ?? [];
  const i = tracks.findIndex((t) => t.kind === "audio");
  if (i < 0) return undefined;
  const track = tracks[i];
  if (project.layers.some((l) => l.id === track.id || laneId(l) === track.id))
    return undefined;
  return {
    id: track.id,
    name: track.name,
    below: tracks.slice(i + 1).map((t) => t.id),
  };
}
