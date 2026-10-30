import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, link, lstat, open, rm } from "node:fs/promises";
import path from "node:path";
/** Official Qwen snapshot, checked 21 Oct 2026. Never execute remote model code. */
export const VOICE_MODEL = "Qwen3-ASR-0.6B";
export const MODEL_REVISION = "5eb144179a02acc5e5ba31e748d22b0cf3e303b0";
export interface ModelFile {
  name: string;
  size: number;
  sha256: string;
}
/**
 * Sizes and SHA-256 of every file at MODEL_REVISION. The model weights match
 * the Hub's LFS id; the small files were hashed on 27 Oct 2026 from the same
 * revision and their git blob ids match the Hub tree.
 */
export const MODEL_FILES: readonly ModelFile[] = [
  [
    "chat_template.json",
    1161,
    "75a8cfca24f00de72d796fbfed6858fc9614ef3dabd8696684cc3bc03a9c58ff",
  ],
  [
    "config.json",
    6193,
    "76d3ae4601ce939830b2517f4a6cadb86cc51316c3900af6b020b051c21a478c",
  ],
  [
    "generation_config.json",
    142,
    "1da527824d81e07118facff437e03f2e24a23311e3bdeb2368973fe77e5f275c",
  ],
  [
    "merges.txt",
    1671853,
    "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5",
  ],
  [
    "model.safetensors",
    1876091704,
    "79d6cbd4c98c7bbffe9db2edac07f56cd6637d0d5944b27f6c2b8353840323ea",
  ],
  [
    "preprocessor_config.json",
    330,
    "45e120a4eda2c20c5d7f2ea9354e63536bf35e27aa573fb7cdf78017b378770d",
  ],
  [
    "tokenizer_config.json",
    12487,
    "4942d005604266809309cabc9f4e9cb89ce855d59b14681fdc0e1cc62ea26c4c",
  ],
  [
    "vocab.json",
    2776833,
    "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910",
  ],
].map(([name, size, sha256]) => ({ name, size, sha256 }) as ModelFile);
export const MODEL_BYTES = MODEL_FILES.reduce((n, file) => n + file.size, 0);

/**
 * True only for a regular file of ours (not a link) at the pinned size whose
 * bytes hash to the pinned SHA-256. Anything else is downloaded again.
 */
export async function verifiedModelFile(
  file: string,
  expected: ModelFile,
  signal: AbortSignal,
  identity: FileIdentity = {},
) {
  // O_NOFOLLOW refuses a link at the last component; the checks and the hash
  // then read the one opened file, so nothing can swap it in between.
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  ).catch(() => undefined);
  if (!handle) return false;
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.size !== expected.size ||
      (typeof process.getuid === "function" && info.uid !== process.getuid())
    )
      return false;
    identity.dev = info.dev;
    identity.ino = info.ino;
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(4 * 1024 * 1024);
    for (;;) {
      if (signal.aborted) throw new Error("Installation cancelled.");
      const { bytesRead } = await handle.read(buffer, 0, buffer.length);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest("hex") === expected.sha256;
  } catch (error) {
    if (signal.aborted)
      throw new Error("Installation cancelled.", { cause: error });
    return false;
  } finally {
    await handle.close();
  }
}

/**
 * Fills `folder` with the pinned model. Each file is kept when it already
 * verifies there, linked (or copied) from the first `sources` folder where it
 * verifies, and downloaded otherwise; a partial or wrong-size file is removed
 * and fetched again. Progress counts reused bytes, so a model already on disk
 * reaches the full size without a request. Returns the bytes downloaded.
 */
export async function downloadVoiceModel(
  folder: string,
  signal: AbortSignal,
  progress: (bytes: number) => void,
  sources: string[] = [],
  files: readonly ModelFile[] = MODEL_FILES,
) {
  let received = 0;
  let downloaded = 0;
  for (const expected of files) {
    const target = path.join(folder, expected.name);
    if (await reuseModelFile(target, expected, sources, signal)) {
      received += expected.size;
      progress(received);
      continue;
    }
    if (signal.aborted) throw new Error("Installation cancelled.");
    await rm(target, { force: true });
    const count = await fetchModelFile(target, expected, signal, (bytes) => {
      progress(received + bytes);
    });
    received += count;
    downloaded += count;
  }
  return downloaded;
}

/** The device and inode of the file a verification read. */
export interface FileIdentity {
  dev?: number;
  ino?: number;
}

/** Keeps a verified file at `target`, or links (or copies) one from `sources`. */
export async function reuseModelFile(
  target: string,
  expected: ModelFile,
  sources: string[],
  signal: AbortSignal,
) {
  if (await verifiedModelFile(target, expected, signal)) return true;
  for (const source of sources) {
    const file = path.join(source, expected.name);
    const verified: FileIdentity = {};
    if (!(await verifiedModelFile(file, expected, signal, verified))) continue;
    await rm(target, { force: true });
    // A hard link is instant and is the verified file itself; a copy (where
    // linking is refused) is hashed again before it counts.
    const linked = await link(file, target).then(
      () => true,
      () => copyFile(file, target).then(() => false),
    );
    // A link must be the very file just verified (the device and inode of
    // the handle that was hashed); otherwise, or for a copy, it is hashed again.
    const now = linked ? await lstat(target).catch(() => undefined) : undefined;
    if (now && now.dev === verified.dev && now.ino === verified.ino)
      return true;
    if (await verifiedModelFile(target, expected, signal)) return true;
  }
  return false;
}

async function fetchModelFile(
  target: string,
  expected: ModelFile,
  signal: AbortSignal,
  progress: (bytes: number) => void,
) {
  const response = await fetch(
    `https://huggingface.co/Qwen/${VOICE_MODEL}/resolve/${MODEL_REVISION}/${expected.name}`,
    { signal: AbortSignal.any([signal, AbortSignal.timeout(60 * 60_000)]) },
  );
  if (!response.ok || !response.body)
    throw new Error(
      "The model download failed. Try again when your connection is ready.",
    );
  const file = await open(target, "wx", 0o600);
  const hash = createHash("sha256");
  let count = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value: part } = await reader.read();
      if (done) break;
      count += part.byteLength;
      if (count > expected.size)
        throw new Error(
          "The downloaded model did not match the expected size.",
        );
      await file.writeFile(part);
      hash.update(part);
      progress(count);
    }
    if (count !== expected.size || hash.digest("hex") !== expected.sha256)
      throw new Error("The downloaded model failed verification.");
  } finally {
    await file.close();
  }
  return count;
}
