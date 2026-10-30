import { digest, type Bundle } from "./bundle";
import type { PromptReference } from "./prompt-brief";
import {
  DIRECTOR_PROJECT_BYTES,
  DIRECTOR_PROJECT_LIMIT,
} from "../../shared/director/types";
export async function importPromptFont(
  bundle: Bundle,
  file: File,
): Promise<{
  bundle: Bundle;
  reference: Omit<PromptReference, "id" | "label">;
}> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Font limit is 5 MB.");
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  if (!ext || !["ttf", "otf", "woff", "woff2"].includes(ext))
    throw new Error("Choose TTF, OTF, WOFF or WOFF2.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = Array.from(bytes.slice(0, 4))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  if (
    !(
      {
        ttf: ["00010000", "74727565"],
        otf: ["4f54544f"],
        woff: ["774f4646"],
        woff2: ["774f4632"],
      }[ext] ?? []
    ).includes(signature)
  )
    throw new Error("This file is not a supported font.");
  if (
    [...bundle.files.values()].reduce((n, b) => n + b.length, 0) +
      bytes.length >
    DIRECTOR_PROJECT_BYTES
  )
    throw new Error(`Project limit is ${DIRECTOR_PROJECT_LIMIT}.`);
  const sha256 = await digest(bytes),
    path = `brief/fonts/${sha256}.${ext}`;
  const files = new Map(bundle.files);
  files.set(path, bytes);
  return {
    bundle: { ...bundle, files },
    reference: {
      font: { name: file.name.slice(0, 120), file: { path, sha256 } },
    },
  };
}
