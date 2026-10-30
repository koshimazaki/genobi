import { cameraSections, termsFor, type CameraSelection } from "./camera";
import type { VideoModel } from "./types";
/**
 * The selection the chosen model's panel can show: a term that model leaves
 * out (Macro or Dutch angle on LTX, Pull back on FLUX) is cleared, so the
 * panel, the preview and the request agree. The same object when nothing
 * changes. A still keeps its movement parked for the next video run (it never
 * writes one), so only its framing is fitted; the movement is checked when the
 * composer returns to video.
 */
export function fitCamera(
  selection: CameraSelection,
  model: VideoModel,
  still = false,
): CameraSelection {
  let fitted = selection;
  for (const section of cameraSections) {
    if (still && section.id === "movements") continue;
    const id = selection[section.id];
    if (id && !termsFor(section, model).some((item) => item.id === id))
      fitted = { ...fitted, [section.id]: null };
  }
  return fitted;
}
