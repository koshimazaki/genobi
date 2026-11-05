import type { WorldCommand } from "../../shared/world-control";
import { RECIPE_REVISION_CONFLICT } from "../../shared/world-recipe-revision";
import type { SceneAdapter } from "./scene-adapter";

/** Fetch only this paired command's authorized bytes, then guard the actual commit. */
export async function attachAgentMedia(
  adapter: SceneAdapter,
  command: Extract<WorldCommand, { op: "attach-media" }>,
  path: string,
) {
  if (adapter.getRecipeRevision() !== command.expectedRevision)
    throw new Error(RECIPE_REVISION_CONFLICT);
  const response = await fetch(path);
  if (!response.ok)
    throw new Error(
      "The paired command's media is unavailable. Read its result before retrying.",
    );
  const blob = await response.blob();
  const sha256 = response.headers.get("X-Content-SHA256");
  const actual = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  if (!sha256 || sha256 !== actual)
    throw new Error("The paired media did not match its hash.");
  if (command.target === "audio") {
    if (!blob.type.startsWith("audio/"))
      throw new Error("Choose audio for Sound.");
    await adapter.configure(adapter.getRecipe(), {
      expectedRevision: command.expectedRevision,
      sound: { blob, label: command.assetId },
    });
  } else {
    if (!/^(image|video)\//.test(blob.type))
      throw new Error("Choose an image or video texture.");
    await adapter.setSurface(command.target, blob, {
      expectedRevision: command.expectedRevision,
    });
  }
  return {
    requestId: command.requestId,
    copyId: command.copyId,
    assetId: command.assetId,
    target: command.target,
    sha256,
    byteLength: blob.size,
    revision: adapter.getRecipeRevision(),
  };
}
