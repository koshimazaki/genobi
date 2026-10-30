import type { Project } from "../../shared/director/types";
import { useStudio } from "../studio/useStudio";
import { clipsOf, rangeLabel, sourceRange } from "./clip-source";

/**
 * The selected asset's clips with the part of the source each one shows.
 * Choosing one selects that clip and opens its inspector: the drawer's way
 * back to the timeline.
 */
export default function AssetClips({
  project,
  assetId,
}: {
  project: Project;
  assetId: string;
}) {
  const actions = useStudio((s) => s.actions);
  const clips = clipsOf(project, assetId);
  if (!clips.length) return null;
  const asset = project.assets[assetId];
  return (
    <ul className="dir-asset-clips" aria-label="Clips using this asset">
      {clips.map((clip) => {
        const range = sourceRange(clip, asset, project.composition.fps);
        return (
          <li key={clip.id}>
            <button
              type="button"
              onClick={() =>
                actions.workspace({
                  selected: clip.id,
                  inspectorOpen: true,
                  drawerOpen: false,
                })
              }
            >
              Select {clip.name}
              {range ? ` · ${rangeLabel(range)}` : ""}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
