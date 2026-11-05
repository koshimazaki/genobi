import { GALLERY_AUDIO, galleryMedia } from "../../shared/gallery/catalogue";
import { footageLabel, galleryBadge } from "../../shared/gallery/badges";
import type { HouseTemplate } from "../../shared/templates/types";
import type { ViewingClip } from "../components/VideoLightbox";

/**
 * A template's full-resolution cut (`media.video`, never the small hover
 * preview) as the lightbox shows it: its name, the card's model badge, and
 * the preview-footage label when the recipe did not make the footage.
 * Undefined while the card has no video yet.
 */
export function templateClip(template: HouseTemplate): ViewingClip | undefined {
  const media = galleryMedia(template);
  if (!media) return undefined;
  const badge = galleryBadge(template);
  return {
    url: media.video,
    mediaType: "video",
    label: template.name,
    heading: "Template",
    about: [
      media.demo && footageLabel(template),
      media.width && media.height && `${media.width}×${media.height}`,
      template.description,
    ]
      .filter(Boolean)
      .join(" · "),
    signature: { tag: badge.label, title: badge.detail },
    filename: `${template.id}.mp4`,
  };
}

/** Whether the full cut carries a track: those open with sound. */
export const templateSound = (template: HouseTemplate) =>
  GALLERY_AUDIO.has(template.id);
