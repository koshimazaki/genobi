import type { Job, Source } from "../shared/types";
import { isImage } from "../shared/image";

/** What a Camera gallery card holds, for its Images · Videos · Audio filter. */
export type GalleryKind = "image" | "video" | "audio";
export type GalleryKindChoice = "all" | GalleryKind;

export const GALLERY_KINDS: { id: GalleryKind; label: string }[] = [
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
];

/** A job's kind follows its generator: Image and Edit make images, music makes audio. */
export const jobKind = (job: Pick<Job, "generator">): GalleryKind =>
  isImage(job.generator)
    ? "image"
    : job.generator === "audio"
      ? "audio"
      : "video";

/** Catalogue sources recorded before images and audio carry no media type: video. */
export const sourceKind = (source: Pick<Source, "mediaType">): GalleryKind =>
  source.mediaType ?? "video";

/** The kinds the gallery holds, in chip order. */
export const presentKinds = (
  jobs: Pick<Job, "generator">[],
  sources: Pick<Source, "mediaType">[],
): GalleryKind[] => {
  const present = new Set([...jobs.map(jobKind), ...sources.map(sourceKind)]);
  return GALLERY_KINDS.map((k) => k.id).filter((id) => present.has(id));
};

/** Lower-case plural for sentences: "images", "videos", "audio". */
export const kindNoun = (kind: GalleryKind) =>
  GALLERY_KINDS.find((k) => k.id === kind)!.label.toLowerCase();
