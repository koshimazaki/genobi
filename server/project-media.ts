// What an agent hands into a linked project copy (`server/project-takes.ts`):
// a finished take or a local media tool's result (`server/project-derived.ts`),
// read once from the studio's store and measured by the shared readers, the
// same path for both, so the Director gets the length its clips are held to.
import { open, stat } from "node:fs/promises";
import { inspectStoredAudio } from "../shared/audio";
import { DIRECTOR_ID } from "../shared/director/commands";
import type { Derivation, Project } from "../shared/director/types";
import { inspectImage } from "../shared/image";
import { inspectMp4 } from "../shared/mp4";
import { AppError } from "./errors";
import { bounded, tooLarge } from "./project-bundle";
import { FILE_BYTES } from "./projects";

/** One input of a derived file, with its bytes' hash to find in the project. */
export type DerivedInput = Derivation["sources"][number] & { sha256?: string };

export interface HandIn {
  assetId: string;
  generationId: string;
  kind: "video" | "image" | "audio";
  contentType: string;
  bytes: Buffer;
  durationSeconds?: number;
  prompt: string;
  /** The generation record's `tool`: who made the file and how. */
  tool: string;
  recipe?: Project["generations"][number]["recipe"];
  /** A media tool's result: its operation and inputs, in order. */
  derived?: { operation: Derivation["operation"]; sources: DerivedInput[] };
}

/**
 * The asset and generation ids for a hand-in: `take-<job id>` for a take,
 * `derived-<source id>` for a media tool's result. The same file twice gets
 * the same ids, so a second hand-in answers with the asset already there.
 */
export function handInIds(prefix: "take" | "derived", id: string) {
  const slug = id.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const assetId = `${prefix}-${slug}`.slice(0, 64);
  const generationId = (
    prefix === "take" ? `gen-${slug}` : `gen-${prefix}-${slug}`
  ).slice(0, 64);
  if (!DIRECTOR_ID.test(assetId) || !DIRECTOR_ID.test(generationId))
    throw new AppError(400, "That id cannot name an asset.", "invalid_take");
  return { assetId, generationId };
}

/**
 * A stored file's bytes, bounded by what a project copy keeps, with its type
 * and length from the shared readers: an image's own type, a song's or a
 * WAV cut's measured length, an MP4's duration.
 */
export async function readMedia(
  filePath: string,
  kind: HandIn["kind"],
  missing: () => AppError,
) {
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    throw missing();
  }
  if (size > FILE_BYTES) throw tooLarge();
  const handle = await open(filePath, "r");
  let bytes: Buffer;
  try {
    bytes = Buffer.alloc(size);
    await handle.read(bytes, 0, size, 0);
  } finally {
    await handle.close();
  }
  try {
    if (kind === "image")
      return { bytes, contentType: inspectImage(bytes).contentType };
    const read = async (offset: number, length: number) =>
      new Uint8Array(bytes.subarray(offset, offset + length)).buffer;
    if (kind === "audio") {
      // A production asset with its measured length, ready for an audio
      // track (`add-clip`) and for `genobi_audio_analysis`.
      const { duration, contentType } = await inspectStoredAudio(size, read);
      return { bytes, contentType, durationSeconds: duration };
    }
    const { duration } = await inspectMp4(size, read);
    return { bytes, contentType: "video/mp4", durationSeconds: duration };
  } catch (error) {
    throw new AppError(422, bounded(error), "take_refused");
  }
}

/**
 * The project asset already holding an input's bytes, a production asset
 * first, so the derived file's record names it as an input.
 */
export function holding(project: Project, input: DerivedInput) {
  if (!input.sha256) return undefined;
  const same = Object.entries(project.assets).filter(
    ([, asset]) =>
      asset.kind === input.kind && asset.file.sha256 === input.sha256,
  );
  return (same.find(([, asset]) => asset.use === "production") ?? same[0])?.[0];
}
