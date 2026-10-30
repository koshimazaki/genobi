import { useShell } from "../studio/ShellContext";
import { SendToDirector } from "../studio/SendToDirector";
import { importGalleryMedia } from "../director/import-gallery-media";
import { inAssetRail } from "../studio/send-to-director";

/**
 * A gallery or library card's Send to Director: the result is copied into
 * the project's assets (Project tab) without opening the Director, and the
 * asset rail opens on it.
 */
export default function AddToProject({
  url,
  filename,
}: {
  url: string;
  filename: string;
}) {
  const shell = useShell();
  if (!shell) return null;
  return (
    <SendToDirector
      icon
      send={(from) =>
        importGalleryMedia(url, filename, undefined, {
          keepTab: inAssetRail(from),
        })
      }
      onSent={() => shell.setAssetsOpen(true)}
    />
  );
}
