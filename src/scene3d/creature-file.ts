/** The owner's canonical model; bytes stay in this tab, never in a scene file. */
import { CREATURE_SHA256 } from "../../shared/scene/creature-reference";
export { CREATURE_SHA256 } from "../../shared/scene/creature-reference";
export const CREATURE_MAX_BYTES = 64 * 1024 * 1024;

/** Inspect before GLTFLoader: even an embedded image must not fetch a URL. */
export function creatureDocument(bytes: ArrayBuffer) {
  if (bytes.byteLength < 20 || bytes.byteLength > CREATURE_MAX_BYTES)
    throw new Error("Choose the original Creature VRM (up to 64 MB).");
  const header = new DataView(bytes);
  const length = header.getUint32(12, true);
  if (
    header.getUint32(0, true) !== 0x46546c67 ||
    header.getUint32(4, true) !== 2 ||
    header.getUint32(8, true) !== bytes.byteLength ||
    header.getUint32(16, true) !== 0x4e4f534a ||
    length > 2 * 1024 * 1024 ||
    length + 20 > bytes.byteLength
  )
    throw new Error("This is not a valid binary VRM.");
  const doc = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 20, length)),
  );
  if (!doc.extensions?.VRM?.humanoid?.humanBones?.length)
    throw new Error(
      "Choose the original VRM 0 creature with its humanoid rig.",
    );
  if (
    [...(doc.buffers ?? []), ...(doc.images ?? [])].some(
      (entry) => entry.uri !== undefined,
    )
  )
    throw new Error("The creature must contain its own buffers and images.");
  return doc;
}

export async function readCreature(file: File) {
  if (file.size > CREATURE_MAX_BYTES)
    throw new Error("Creature VRM limit is 64 MB.");
  const bytes = await file.arrayBuffer();
  creatureDocument(bytes);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== CREATURE_SHA256)
    throw new Error(
      "Choose the original Glitch Candies Creature VRM. Other avatars need their own rig and rights review.",
    );
  return bytes;
}
