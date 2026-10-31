// What a project copy holds, checked by the studio's own readers: the files
// its manifest names and its prompt brief.
import { createHash, randomInt } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8 } from "fflate";
import type { DirectorCopy } from "../shared/director/commands";
import {
  TRUSTED_RECIPES,
  TRUSTED_RECIPE_SOURCES,
} from "../shared/director/graphic-commands";
import { DIRECTOR_PROJECT_LIMIT, type Project } from "../shared/director/types";
import {
  BRIEF_PATH,
  readBrief,
  type PromptBrief,
} from "../src/director/prompt-brief";
import { AppError } from "./errors";

/** Every SHA-256 the bundle needs: assets, recipes and the prompt's fonts. */
export function requiredFiles(project: Project, brief: PromptBrief | null) {
  return new Set([
    ...Object.values(project.assets).map((a) => a.file.sha256),
    ...Object.values(project.modules).map((m) => m.file.sha256),
    ...(brief?.references ?? []).flatMap((r) =>
      r.font ? [r.font.file.sha256] : [],
    ),
  ]);
}

/** The prompt brief, checked by the studio's own reader. */
export function checkBrief(
  project: Project,
  value: unknown,
): PromptBrief | null {
  if (value === null) return null;
  const bytes = strToU8(JSON.stringify(value));
  try {
    return readBrief({ project, files: new Map([[BRIEF_PATH, bytes]]) });
  } catch (error) {
    throw new AppError(400, bounded(error), "invalid_project");
  }
}

// Validation messages name ids and fields, never paths or keys; still bounded.
export const bounded = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .slice(0, 300);

export async function exists(file: string) {
  return stat(file).then(
    () => true,
    () => false,
  );
}
/** Bytes of the files in `dir`, leaving out the names in `skip`. */
export async function directoryBytes(dir: string, skip = new Set<string>()) {
  let total = 0;
  for (const name of await readdir(dir).catch(() => [] as string[]))
    if (!skip.has(name))
      total += (await stat(path.join(dir, name)).catch(() => ({ size: 0 })))
        .size;
  return total;
}

/** `length` characters drawn from `alphabet` by a cryptographic source. */
export const randomToken = (alphabet: string, length: number) =>
  Array.from({ length }, () =>
    alphabet.charAt(randomInt(alphabet.length)),
  ).join("");

/** Write a copy's record atomically, readable by this user only. */
export async function writeCopy(dir: string, record: unknown) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "copy.json");
  await writeFile(`${file}.tmp`, JSON.stringify(record), { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}

/** Drop files the manifest no longer names. */
export async function pruneFiles(files: string, keep: Set<string>) {
  for (const name of await readdir(files).catch(() => [] as string[]))
    if (!keep.has(name)) await rm(path.join(files, name), { force: true });
}

export const tooLarge = () =>
  new AppError(
    413,
    `Project media exceeds ${DIRECTOR_PROJECT_LIMIT}.`,
    "project_too_large",
  );
export const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const exactKeys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));

/** Bytes of the files in `dir` that `names` lists. */
export async function namedBytes(dir: string, names: Set<string>) {
  let total = 0;
  for (const name of names)
    total += (await stat(path.join(dir, name)).catch(() => ({ size: 0 }))).size;
  return total;
}

/** Where the trusted recipes' files live: beside the registry that names them. */
const REPOSITORY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * After a command: the copy's prompt brief with the command's prompt, and the
 * files of any recipe it brought in from the registry (`add-graphic` on a
 * recipe the copy did not hold), copied from the repository and checked
 * against their SHA-256. The whole copy the manifest names, files already
 * staged included, stays within `limit` bytes, whether or not one is copied.
 */
export async function afterCommand(
  dir: string,
  { project, prompt }: DirectorCopy,
  stored: PromptBrief | null,
  limit: number,
) {
  const brief =
    stored || prompt
      ? checkBrief(project, {
          version: 1,
          references: [],
          ...stored,
          text: prompt,
        })
      : null;
  const files = path.join(dir, "files");
  const copies = new Map<string, Buffer>();
  for (const m of Object.values(project.modules)) {
    const target = path.join(files, m.file.sha256);
    if (copies.has(target) || (await exists(target))) continue;
    const trusted = Object.entries(TRUSTED_RECIPES).find(
      ([, t]) => t.file.sha256 === m.file.sha256,
    );
    if (!trusted)
      throw new AppError(422, "A recipe file is missing.", "command_refused");
    const bytes = await readFile(
      path.join(REPOSITORY_DIR, TRUSTED_RECIPE_SOURCES[trusted[0]]),
    );
    if (createHash("sha256").update(bytes).digest("hex") !== m.file.sha256)
      throw new AppError(500, "A recipe file changed.", "recipe_changed");
    copies.set(target, bytes);
  }
  // Missing files stat as 0 bytes here, so the copies are added once.
  let total = await namedBytes(files, requiredFiles(project, brief));
  for (const bytes of copies.values()) total += bytes.length;
  if (total > limit) throw tooLarge();
  for (const [target, bytes] of copies) {
    await mkdir(files, { recursive: true, mode: 0o700 });
    await writeFile(`${target}.tmp`, bytes, { mode: 0o600 });
    await rename(`${target}.tmp`, target);
  }
  return brief;
}
