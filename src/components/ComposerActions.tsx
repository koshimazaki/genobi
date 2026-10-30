import type { Generator, VideoModel } from "../../shared/types";
import { acousticSwitch, entryFor } from "../../shared/registry";
import { takesCamera } from "../../shared/controls";
import { isImage, isKlein } from "../../shared/image";
import Icon from "./Icon";

/**
 * The buttons beside the mode badge. Camera controls, in the accent, on every
 * entry that takes the camera: every video entry, and all FLUX image entries, whose stills keep
 * the framing. Acoustic space, in `--acoustic` blue, follows the ACOUSTIC
 * SPACE switch: it shows while the AKUSPACE workflow is held, as the blue
 * prompt line does, and goes when the switch is turned off.
 */
export default function ComposerActions({
  generator,
  model,
  onOpenCamera,
  onOpenAcoustic,
  onOpenBoxes,
}: {
  generator: Generator;
  model: VideoModel;
  onOpenCamera: () => void;
  onOpenAcoustic: () => void;
  onOpenBoxes?: () => void;
}) {
  const entry = entryFor(generator, model);
  if (!takesCamera(entry.controls))
    return <div className="composer-top__actions" />;
  const acoustic = acousticSwitch(entry)?.on;
  const boxes = isImage(generator) && isKlein(model) && onOpenBoxes;
  return (
    <div
      className="composer-top__actions"
      data-boxes={boxes ? true : undefined}
    >
      {boxes && (
        <button
          className="camera-open text-button"
          onClick={onOpenBoxes}
          aria-label="Bounding boxes"
        >
          <Icon name="expand" size={15} />{" "}
          <span className="composer-action-label">Bounding boxes</span>
        </button>
      )}
      {acoustic && (
        <button
          className="camera-open acoustic-open text-button"
          onClick={onOpenAcoustic}
          aria-haspopup="dialog"
        >
          <Icon
            name="acoustic"
            size={15}
            style={{
              transform: "scale(1.2)",
              marginInline: "calc(1.5 * var(--unit))",
            }}
          />{" "}
          Acoustic space <Icon name="chevron" size={12} />
        </button>
      )}
      <button
        className="camera-open text-button"
        onClick={onOpenCamera}
        aria-label="Camera controls"
        aria-haspopup="dialog"
      >
        <Icon name="camera" size={15} />{" "}
        <span className="composer-action-label">Camera controls</span>{" "}
        <Icon name="chevron" size={12} />
      </button>
    </div>
  );
}
