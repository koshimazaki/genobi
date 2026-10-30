import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Asset } from "../../shared/director/types";
import { durationLabel } from "./clip-source";
import { drawPoster, posterKey, requestPoster } from "./poster";
import "./asset-inspector.css";

/**
 * A small image thumbnail or video poster frame, drawn once the card is near
 * the viewport. Sequential and cached by hash (`poster.ts`), so a project of
 * 60+ layers never preloads or decodes every file.
 */
export default function AssetThumbnail({
  asset,
  bytes,
  seconds = 0,
}: {
  asset: Asset;
  bytes?: Uint8Array<ArrayBuffer>;
  /** Source time of a video poster, normally its clip's in-point. */
  seconds?: number;
}) {
  const [url, setUrl] = useState("");
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  const element = useRef<HTMLSpanElement>(null);
  const owned = useRef("");
  useEffect(() => {
    const el = element.current;
    if (visible || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        setVisible(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);
  const key = posterKey(asset, seconds);
  useEffect(() => {
    if (!visible || !bytes || asset.kind === "audio") return;
    const abort = new AbortController();
    void requestPoster(
      key,
      drawPoster(asset, bytes, seconds),
      abort.signal,
    ).then((blob) => {
      if (abort.signal.aborted || blob === undefined) return;
      // Swap URLs only once the next poster exists, so a card never flashes.
      const previous = owned.current;
      owned.current = blob ? URL.createObjectURL(blob) : "";
      setUrl(owned.current);
      if (previous) URL.revokeObjectURL(previous);
    });
    return () => abort.abort();
    // `key` covers the file hash and source time; the asset object itself is
    // recreated by every project edit.
  }, [visible, key, bytes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      if (owned.current) URL.revokeObjectURL(owned.current);
      owned.current = "";
    },
    [],
  );
  return url ? (
    <img src={url} alt="" data-poster={asset.kind} />
  ) : (
    <span ref={element} className="dir-asset-placeholder">
      {asset.kind === "video"
        ? "Video"
        : asset.kind === "audio"
          ? "Audio"
          : "Image"}
    </span>
  );
}

/**
 * A card's fixed media box: the thumbnail plus a duration badge. The box keeps
 * its size whether the poster has loaded or not, so cards never shift.
 */
export function AssetFrame({
  asset,
  bytes,
  seconds,
  children,
}: {
  asset: Asset;
  bytes?: Uint8Array<ArrayBuffer>;
  seconds?: number;
  /** Laid over the thumbnail inside the same box: a playing preview. */
  children?: ReactNode;
}) {
  const duration =
    asset.durationSeconds !== undefined
      ? durationLabel(asset.durationSeconds)
      : "";
  return (
    <span className="dir-asset-frame" data-kind={asset.kind}>
      <AssetThumbnail asset={asset} bytes={bytes} seconds={seconds} />
      {children}
      {duration && (
        <span
          className="dir-asset-duration"
          aria-label={`Duration ${duration}`}
        >
          {duration}
        </span>
      )}
    </span>
  );
}
