import { directorLink } from "../../shared/gallery/catalogue";
import { requestVersionOpen } from "../director/version-open-request";

/** The mix template the card opens, with its skill in the Genobi plugin. */
export const LAYOUT_TO_MOTION_TEMPLATE = "audio-reactive-drop";

/**
 * Audio Reactive · Layout to Motion, beside the LTX models: not a registry
 * entry and never a submission. Its one button opens the Director on the
 * Audio Reactive template with Make my version open, where the agent takes
 * over and quotes every paid step.
 */
export default function LayoutToMotionCard({
  onOpen,
}: {
  /** Closes the model popover before the studio moves to Director. */
  onOpen?: () => void;
}) {
  return (
    <div
      className="family-model__route"
      aria-label="Audio Reactive · Layout to Motion"
      role="group"
    >
      <strong>Audio Reactive · Layout to Motion</strong>
      <p>
        This route builds the scene in 3D and renders it with LTX-2.5
        Layout-to-Render through the agent, on the hosted deployment (Comfy
        Deploy genobi-ltx-world-v2, which scales to zero between jobs) that the
        studio and the site share. It runs nothing from here: open it in
        Director, drop your reference and say what it replaces, and the agent
        quotes every paid step.
      </p>
      <button
        type="button"
        onClick={() => {
          onOpen?.();
          requestVersionOpen(LAYOUT_TO_MOTION_TEMPLATE);
          history.pushState(null, "", directorLink(LAYOUT_TO_MOTION_TEMPLATE));
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
      >
        Open in Director
      </button>
    </div>
  );
}
