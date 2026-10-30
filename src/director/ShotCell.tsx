import type { Layer, Project } from "../../shared/director/types";
import { useStudio } from "../studio/useStudio";
import AssetThumbnail from "./AssetThumbnail";

/** S01, S02…: a shot's place on the storyboard lane, for people and agents. */
export const shotCode = (index: number) =>
  `S${String(index + 1).padStart(2, "0")}`;

/**
 * A storyboard shot's cell: its own media thumbnail at its in-point, the shot
 * code and a caption line. A missing source says so instead of borrowing
 * another frame. The caption opens the Shot and lens picker.
 */
export default function ShotCell({
  layer,
  index,
  project,
  open,
  caption,
}: {
  layer: Layer;
  index: number;
  project: Project;
  open?: (layer: Layer, anchor: HTMLElement) => void;
  caption?: string;
}) {
  const files = useStudio((s) => s.director.bundle?.files);
  const asset = "assetId" in layer ? project.assets[layer.assetId] : undefined;
  const bytes = asset ? files?.get(asset.file.path) : undefined;
  const seconds =
    "sourceStartFrame" in layer
      ? layer.sourceStartFrame / project.composition.fps
      : 0;
  const text = caption ? `${caption} / ${layer.name}` : layer.name;
  return (
    <>
      <span className="dir-shot-thumb" aria-hidden="true">
        {asset && bytes ? (
          <AssetThumbnail asset={asset} bytes={bytes} seconds={seconds} />
        ) : (
          <span className="dir-shot-missing">Missing source</span>
        )}
      </span>
      <span className="dir-shot-code">{shotCode(index)}</span>
      {open ? (
        <button
          type="button"
          className="dir-shot-caption"
          aria-label={`Shot and lens for ${layer.name}`}
          title={`${text} · choose shot and lens`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            open(layer, e.currentTarget);
          }}
        >
          {text}
        </button>
      ) : (
        <span className="dir-shot-caption">{text}</span>
      )}
    </>
  );
}
