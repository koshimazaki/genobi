import type { Layer, Project } from "../../shared/director/types";
import { missingTrack } from "../../shared/director/track-slot";
import { findTemplate } from "./template-catalogue";

/** One "Add your media" slot: the layers a dropped or chosen file replaces. */
export interface MediaSlot {
  id: string;
  label: string;
  hint: string;
  layerIds: string[];
  accept: string;
  /** A locked layer is shown but not replaced until it is unlocked. */
  locked: boolean;
}

export const PICTURE_ACCEPT =
  "image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime";
/** WAV, MP3 and FLAC, the audio `checkAssetMedia` accepts, with extensions. */
export const TRACK_ACCEPT =
  "audio/wav,audio/x-wav,audio/mpeg,audio/flac,audio/x-flac,.wav,.mp3,.flac";

/**
 * The audio layer the Track slot replaces: a house template's `track` layer,
 * else the project's lowest audio layer (a remix template's soundtrack).
 */
export function trackLayer(project: Project) {
  const audio = project.layers.filter(
    (l): l is Extract<Layer, { kind: "audio" }> => l.kind === "audio",
  );
  return audio.find((l) => l.id === "track") ?? audio[0];
}

/** A remix template's picture slots whose layers are all present. */
export function pictureSlots(project: Project): MediaSlot[] {
  return (findTemplate(project.id)?.slots ?? [])
    .filter((slot) =>
      slot.layerIds.every((id) =>
        project.layers.some(
          (l) => l.id === id && (l.kind === "image" || l.kind === "video"),
        ),
      ),
    )
    .map((slot) => ({
      id: slot.id,
      label: slot.label,
      hint: slot.hint,
      layerIds: [...slot.layerIds],
      accept: PICTURE_ACCEPT,
      locked: false,
    }));
}

/**
 * Every slot "Make it yours" offers: the pictures, then the track. A house
 * template that declares a track the project has no lane for (opened without
 * a song) still offers it; the file then adds that lane.
 */
export function mediaSlots(project: Project): MediaSlot[] {
  const track = trackLayer(project),
    missing = track ? undefined : missingTrack(project);
  const slot = (layerId: string, hint: string, locked: boolean) => ({
    id: "track",
    label: "Track",
    hint,
    layerIds: [layerId],
    accept: TRACK_ACCEPT,
    locked,
  });
  return [
    ...pictureSlots(project),
    ...(track
      ? [
          slot(
            track.id,
            track.locked
              ? "Locked · unlock it in the advanced editor to replace it"
              : "WAV, MP3 or FLAC · replaces the soundtrack",
            track.locked,
          ),
        ]
      : missing
        ? [slot(missing.id, "WAV, MP3 or FLAC · adds the soundtrack", false)]
        : []),
  ];
}
