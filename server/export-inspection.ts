import { unzipSync } from "fflate";
import type { ExportRequest } from "../shared/browser-export";
import { EXPORT_BYTES } from "../shared/browser-export";
import { inspectMp4 } from "../shared/mp4";
import {
  ARCHIVE_PATH,
  ARCHIVE_BYTES,
  BUNDLE_PATH,
  checkArchiveEntries,
  verifyArchiveIntegrity,
} from "../src/director/archive-integrity";
import { readManifest } from "../src/director/manifest";
import { briefFileEntries } from "../src/director/prompt-brief";
import { readWorldFiles } from "../src/director/world-files";
import { createHash } from "node:crypto";

/** The browser supplies an artifact, never a URL; inspect it before a receipt exists. */
export async function inspectExport(request: ExportRequest, bytes: Buffer) {
  if (!bytes.length || bytes.length > EXPORT_BYTES)
    throw new Error("Export must be nonempty and within 150 MiB.");
  if (request.format === "mp4") {
    await inspectMp4(
      bytes.length,
      async (offset, length) =>
        new Uint8Array(bytes.subarray(offset, offset + length)).buffer,
    );
    return { contentType: "video/mp4" as const, extension: "mp4" };
  }
  let total = 0;
  const seen = new Set<string>();
  const raw = unzipSync(bytes, {
    filter(entry) {
      total += entry.originalSize;
      if (seen.has(entry.name) || !BUNDLE_PATH.test(entry.name))
        throw new Error("Invalid export archive path.");
      seen.add(entry.name);
      if (total > EXPORT_BYTES || seen.size > 130)
        throw new Error("Export archive exceeds its limits.");
      if (entry.name === ARCHIVE_PATH && entry.originalSize > ARCHIVE_BYTES)
        throw new Error("Export archive index exceeds 64 KB.");
      return true;
    },
  });
  if (!raw["project.json"] || !raw[ARCHIVE_PATH])
    throw new Error(
      "Export requires a complete project archive with its integrity index.",
    );
  const files = Object.fromEntries(
    Object.entries(raw).map(([path, data]) => [path, new Uint8Array(data)]),
  );
  checkArchiveEntries(files);
  const project = readManifest(files["project.json"]);
  if (
    project.id !== request.source.id ||
    project.revision !== request.source.revision
  )
    throw new Error("Export archive names a different source revision.");
  await verifyArchiveIntegrity(files, project);
  const bundle = { project, files: new Map(Object.entries(files)) };
  readWorldFiles(bundle);
  for (const { file } of [
    ...Object.values(project.assets),
    ...Object.values(project.modules),
    ...briefFileEntries(bundle),
  ])
    if (
      !files[file.path] ||
      createHash("sha256").update(files[file.path]).digest("hex") !==
        file.sha256
    )
      throw new Error(`Export archive media missing or changed: ${file.path}`);
  return { contentType: "application/zip" as const, extension: "zip" };
}
