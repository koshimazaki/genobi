import { useEffect, useState } from "react";
import type { Asset } from "../../shared/director/types";
import VideoLightbox from "../components/VideoLightbox";
import { durationLabel } from "../director/clip-source";
import { mediaType, useObjectUrl } from "../director/media-playback";

export interface LightboxItem {
  id: string;
  asset: Asset;
  bytes?: Uint8Array<ArrayBuffer>;
  name: string;
  /** The card's fact line ("Used · Main", a source span), shown again here. */
  meta: string;
  mark?: string;
}

const KIND = { image: "Image", video: "Video", audio: "Audio" } as const;

/**
 * The light view of a project asset: Camera's lightbox (image and video) with
 * a plain audio player for sound, previous / next through the collection it
 * was opened from, and the card's facts plus the media's measured size.
 */
export default function AssetLightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: readonly LightboxItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const [size, setSize] = useState("");
  const url = useObjectUrl(
    item?.bytes,
    !!item,
    item ? mediaType(item.asset.file.path) : "",
  );
  useEffect(() => setSize(""), [url]);
  if (!item || !url) return null;
  const about = [
    KIND[item.asset.kind],
    item.asset.durationSeconds !== undefined &&
      durationLabel(item.asset.durationSeconds),
    size,
    item.meta,
    item.mark,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <VideoLightbox
      clip={{
        url,
        mediaType: item.asset.kind,
        label: item.name,
        filename: item.name,
        heading: "Asset",
        about,
      }}
      onClose={onClose}
      onMeasure={(width, height) => width && setSize(`${width}×${height}`)}
      nav={
        items.length > 1
          ? {
              position: `${index + 1} / ${items.length}`,
              onStep: (offset) =>
                onIndex((index + offset + items.length) % items.length),
            }
          : undefined
      }
    />
  );
}
