import {
  arenaMediaUrl,
  type Arena,
  type ArenaDraft,
  type ArenaMedia,
} from "../../shared/arena";
import { LIBRARY_ASSET_DRAG } from "../studio/media-drop";

/** Arena media dragged out carries a library id the studio's drops resolve. */
export const ARENA_ASSET_PREFIX = "arena:";
const ARENA_ID = /^arena:([0-9a-f-]{36})\/([a-f0-9]{64})$/;

export function writeArenaDrag(
  transfer: DataTransfer,
  arenaId: string,
  media: ArenaMedia,
) {
  const url = new URL(arenaMediaUrl(arenaId, media.hash), location.origin);
  const extension =
    media.contentType === "video/mp4"
      ? "mp4"
      : media.contentType === "image/jpeg"
        ? "jpg"
        : media.contentType.split("/")[1];
  const name = `${media.label.replace(/\.[a-z0-9]{2,4}$/i, "") || "arena"}.${extension}`;
  transfer.effectAllowed = "copy";
  transfer.setData(LIBRARY_ASSET_DRAG, `arena:${arenaId}/${media.hash}`);
  // Outside the studio: a desktop drop saves the file (Chromium), others get the link.
  transfer.setData("DownloadURL", `${media.contentType}:${name}:${url.href}`);
  transfer.setData("text/uri-list", url.href);
}

/** The asset a dragged Arena id names, for `useEditorAssets().resolve`. */
export function arenaAsset(id: string) {
  const match = ARENA_ID.exec(id);
  if (!match) return undefined;
  return {
    id,
    name: "Arena media",
    url: arenaMediaUrl(match[1], match[2]),
    origin: "director" as const,
  };
}

/** Saves the comparison's metadata as JSON; media stays in local storage. */
export function exportRecord(arena: Arena, draft: ArenaDraft) {
  const blob = new Blob([JSON.stringify({ ...arena, ...draft }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "arena-comparison.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
