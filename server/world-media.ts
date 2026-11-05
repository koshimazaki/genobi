import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { checkGenerationInput } from "../shared/director/reference-role";
import type { WorldCommand } from "../shared/world-control";
import { AppError } from "./errors";
import { readMedia } from "./project-media";
import type { ProjectCopies } from "./projects";

export type WorldMediaCommand = Extract<WorldCommand, { op: "attach-media" }>;
export async function readWorldMedia(
  copies: ProjectCopies,
  session: string,
  command: WorldMediaCommand,
) {
  const { project } = copies.read(command.copyId, session);
  const asset = Object.hasOwn(project.assets, command.assetId)
    ? project.assets[command.assetId]
    : undefined;
  if (!asset)
    throw new AppError(404, "Project media not found.", "file_missing");
  if ((command.target === "audio") !== (asset.kind === "audio"))
    throw new AppError(
      400,
      "Choose audio for Sound or an image/video for a texture.",
      "invalid_media",
    );
  try {
    checkGenerationInput(
      { assetId: command.assetId, use: asset.use },
      command.allowInspirationAsInput,
    );
  } catch (error) {
    throw new AppError(400, (error as Error).message, "inspiration_input");
  }
  const file = copies.filePath(command.copyId, session, asset.file.sha256);
  const missing = () =>
    new AppError(404, "The project media bytes are missing.", "file_missing");
  const size = await stat(file).catch(() => {
    throw missing();
  });
  if (size.size > 64 * 1024 * 1024)
    throw new AppError(
      413,
      "World input limit: 64 MiB per file.",
      "media_too_large",
    );
  const media = await readMedia(file, asset.kind, missing);
  if (
    createHash("sha256").update(media.bytes).digest("hex") !== asset.file.sha256
  )
    throw new AppError(
      409,
      "The project file does not match its recorded hash.",
      "media_hash_mismatch",
    );
  return {
    bytes: media.bytes,
    contentType: media.contentType,
    sha256: asset.file.sha256,
  };
}
export type OwnedWorldMedia = Awaited<ReturnType<typeof readWorldMedia>>;
