import type { Job } from "../../shared/types";
import { useShell } from "../studio/ShellContext";
import { SendToDirector } from "../studio/SendToDirector";
import { importGalleryMedia } from "../director/import-gallery-media";
import { inAssetRail } from "../studio/send-to-director";

/**
 * A gallery or library card's Send to Director: the result is copied into
 * the project's assets (Project tab) without opening the Director, and the
 * asset rail opens on it. A Camera job's result carries its recipe, so the
 * project's Recreate restores the run.
 */
export default function AddToProject({
  url,
  filename,
  job,
}: {
  url: string;
  filename: string;
  job?: Job;
}) {
  const shell = useShell();
  if (!shell) return null;
  return (
    <SendToDirector
      icon
      send={(from) =>
        importGalleryMedia(url, filename, undefined, {
          keepTab: inAssetRail(from),
          ...(job ? { job } : {}),
        })
      }
      onSent={() => shell.setAssetsOpen(true)}
    />
  );
}
