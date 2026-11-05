import { z } from "zod";
import { strToU8 } from "fflate";
import { FEEDBACK_PATH } from "../../shared/director/feedback";
import {
  DIRECTOR_PROJECT_BYTES,
  DIRECTOR_PROJECT_LIMIT,
  type Project,
} from "../../shared/director/types";
import { digest } from "./file-hash";

export const ARCHIVE_PATH = "archive.json";
export const ARCHIVE_BYTES = 64_000;
export const BUNDLE_FILE_LIMIT = 128;
export const BUNDLE_PATH =
  /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;
const integrity = z.strictObject({
  version: z.literal(1),
  projectId: z.string().min(1).max(80),
  revision: z.number().int().nonnegative(),
  files: z
    .array(
      z.strictObject({
        path: z.string().regex(BUNDLE_PATH).max(1024),
        byteLength: z.number().int().nonnegative().max(DIRECTOR_PROJECT_BYTES),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1)
    .max(BUNDLE_FILE_LIMIT + 1),
});
export type ArchiveFiles = Record<string, Uint8Array<ArrayBuffer>>;

/** Save and restore use the same bounds, including all companion metadata. */
export function checkArchiveEntries(files: ArchiveFiles) {
  let total = 0,
    count = 0;
  for (const [path, bytes] of Object.entries(files)) {
    if (!BUNDLE_PATH.test(path)) throw new Error("Unsafe bundle path");
    total += bytes.byteLength;
    if (path !== ARCHIVE_PATH && path !== FEEDBACK_PATH) count++;
    if (total > DIRECTOR_PROJECT_BYTES || count > BUNDLE_FILE_LIMIT)
      throw new Error(
        `Unpacked bundle exceeds ${DIRECTOR_PROJECT_LIMIT} / 128 files`,
      );
  }
}

/** The index covers source metadata as well as named media; it is not a signature. */
export async function addArchiveIntegrity(
  files: ArchiveFiles,
  project: Project,
) {
  checkArchiveEntries(files);
  const entries = [];
  for (const [path, bytes] of Object.entries(files))
    entries.push({
      path,
      byteLength: bytes.length,
      sha256: await digest(bytes),
    });
  const index = strToU8(
    JSON.stringify(
      integrity.parse({
        version: 1,
        projectId: project.id,
        revision: project.revision,
        files: entries,
      }),
    ),
  );
  if (index.length > ARCHIVE_BYTES)
    throw new Error("Archive index exceeds 64 KB");
  files[ARCHIVE_PATH] = index;
  checkArchiveEntries(files);
}

/** Legacy bundles remain readable. A new archive must match every indexed entry. */
export async function verifyArchiveIntegrity(
  files: ArchiveFiles,
  project: Project,
) {
  const bytes = files[ARCHIVE_PATH];
  if (!bytes) return;
  if (bytes.length > ARCHIVE_BYTES)
    throw new Error("Archive index exceeds 64 KB");
  let index: z.infer<typeof integrity>;
  try {
    index = integrity.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new Error("Invalid archive index");
  }
  if (index.projectId !== project.id || index.revision !== project.revision)
    throw new Error("Archive names a different project revision");
  const seen = new Set<string>();
  for (const entry of index.files) {
    if (entry.path === ARCHIVE_PATH || seen.has(entry.path))
      throw new Error("Duplicate or recursive archive entry");
    seen.add(entry.path);
    const file = files[entry.path];
    if (
      !file ||
      file.length !== entry.byteLength ||
      (await digest(file)) !== entry.sha256
    )
      throw new Error(`Archive file missing or changed: ${entry.path}`);
  }
  if (
    Object.keys(files).some((path) => path !== ARCHIVE_PATH && !seen.has(path))
  )
    throw new Error("Archive contains an unindexed file");
}
