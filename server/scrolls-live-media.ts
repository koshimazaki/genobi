import { scrollAttach, scrollMediaInput } from "../shared/scrolls/live-actions";
import type { ProjectCopies } from "./projects";
import { ProjectMediaStaging } from "./project-media-stage";
import { AppError } from "./errors";
export async function prepareScrollMedia(
  copies: ProjectCopies,
  caller: string,
  value: unknown,
) {
  const command = scrollAttach.parse(value);
  const { receipt, bytes } = await new ProjectMediaStaging(copies).read(
    command.copyId,
    caller,
    command.receiptId,
  );
  // Recheck the current grant after the disk read; a receipt itself grants nothing.
  copies.read(command.copyId, caller);
  if (
    (command.role === "audio") !== (receipt.kind === "audio") ||
    receipt.kind === "video"
  )
    throw new AppError(
      400,
      "Scrolls accepts images for character/panel/style and audio for sound; MP4 stays in Director.",
    );
  return {
    bytes,
    input: scrollMediaInput.parse({
      sha256: receipt.sha256,
      byteLength: receipt.byteLength,
      contentType: receipt.contentType,
    }),
  };
}
