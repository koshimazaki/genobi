import type { Bundle } from "../director/bundle";
import { audioLabel, RECENT_AUDIO, type RecentAudio } from "./audio-history";

/**
 * The open project's audio assets, newest first, as Sound tab choices. The
 * bytes are already in the tab (the project bundle); a choice wraps them in
 * a Blob only when picked, so listing copies nothing.
 */
export function projectAudio(bundle: Bundle | null | undefined): RecentAudio[] {
  if (!bundle) return [];
  const out: RecentAudio[] = [];
  for (const [id, asset] of Object.entries(bundle.project.assets).reverse()) {
    if (out.length >= RECENT_AUDIO) break;
    if (asset.kind !== "audio") continue;
    const bytes = bundle.files.get(asset.file.path);
    if (!bytes) continue;
    const layer = bundle.project.layers.find(
      (l) => "assetId" in l && l.assetId === id,
    );
    out.push({
      id: asset.file.sha256,
      label: audioLabel(
        layer?.name ?? asset.file.path.split("/").at(-1),
        "project",
      ),
      source: "project",
      bytes: bytes.byteLength,
      open: () => new Blob([bytes]),
    });
  }
  return out;
}
