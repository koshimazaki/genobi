import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MODEL_FILES,
  VOICE_MODEL,
  reuseModelFile,
  verifiedModelFile,
  type ModelFile,
} from "./voice-model";

/**
 * Finding a Qwen3-ASR-0.6B already on this machine before anything is
 * downloaded. Candidates come from, in order: GENOBI_VOICE_MODEL and the
 * configured model, earlier Genobi installs (`genobi-voice-*` children of
 * the default folders and of the chosen one), then a bounded search of the
 * home folder for folders named exactly `Qwen3-ASR-0.6B` (Spotlight's
 * `mdfind -name` on macOS, run without a shell and with a timeout; a
 * depth-limited walk elsewhere or when Spotlight fails). A candidate is only
 * offered once it verifies: a real folder (not a link) owned by this user and
 * not writable by others, holding every pinned file at its size and SHA-256.
 * Paths stay on this machine's local studio; nothing here is logged.
 */

/** Real, ours and not group- or other-writable: nobody else can swap a file. */
export const privateDirectory = (info?: Awaited<ReturnType<typeof lstat>>) =>
  !!info?.isDirectory() &&
  !(Number(info.mode) & 0o022) &&
  (typeof process.getuid !== "function" ||
    Number(info.uid) === process.getuid());

/**
 * Earlier installs in `parent`: our own private `genobi-voice-*` children.
 * Their model files are only candidates; each must still verify by size and
 * SHA-256 before it is linked into a new install.
 */
export async function previousVoiceModels(parent: string, exclude?: string) {
  const found: string[] = [];
  for (const name of await readdir(parent).catch(() => [] as string[])) {
    const folder = path.join(parent, name);
    if (!name.startsWith("genobi-voice-") || folder === exclude) continue;
    const model = path.join(folder, VOICE_MODEL);
    // Both the install and its model folder: real, ours, not shared-writable.
    const [outer, inner] = await Promise.all(
      [folder, model].map((p) => lstat(p).catch(() => undefined)),
    );
    if ([outer, inner].every(privateDirectory)) found.push(model);
  }
  return found;
}

/** The checkout this server runs from: `models/` beside it is the default. */
export const CHECKOUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Where a new install goes unless the person names a folder: a visible
 * `models/` folder beside the repository checkout, or the `Documents/Genobi` folder in the user's home directory
 * when the checkout cannot be written. Never a hidden dot-folder.
 */
export async function defaultVoiceFolder(
  checkout = CHECKOUT,
  home = os.homedir(),
) {
  const writable = (folder: string) =>
    access(folder, constants.W_OK).then(
      () => true,
      () => false,
    );
  const models = path.join(checkout, "models");
  const existing = await lstat(models).catch(() => undefined);
  if (
    existing
      ? privateOrOurs(existing) && (await writable(models))
      : await writable(checkout)
  )
    return models;
  return path.join(home, "Documents", "Genobi");
}
const privateOrOurs = (info: Awaited<ReturnType<typeof lstat>>) =>
  info.isDirectory() &&
  (typeof process.getuid !== "function" ||
    Number(info.uid) === process.getuid());

/** Folders the search never enters: dependencies, git, macOS Library, dot-folders. */
const SKIP = new Set(["node_modules", ".git", "Library"]);

export interface SearchOptions {
  home: string;
  platform?: NodeJS.Platform;
  /** How deep the walk goes below the home folder. */
  maxDepth?: number;
  /** How many folders the walk reads before it stops. */
  maxFolders?: number;
  /** How many candidates the search returns. */
  maxResults?: number;
  /** Spotlight; tests replace it. Resolves undefined when it cannot answer. */
  spotlight?: (home: string) => Promise<string[] | undefined>;
}

const spotlight = (home: string) =>
  new Promise<string[] | undefined>((resolve) =>
    execFile(
      "/usr/bin/mdfind",
      ["-onlyin", home, "-name", VOICE_MODEL],
      { timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout) =>
        resolve(error ? undefined : String(stdout).split("\n").filter(Boolean)),
    ),
  );

/** A depth-limited walk that never follows a link or enters a skipped folder. */
async function walk(
  home: string,
  maxDepth: number,
  maxFolders: number,
  maxResults: number,
) {
  const found: string[] = [];
  let read = 0;
  let level = [home];
  for (let depth = 0; depth <= maxDepth && level.length; depth++) {
    const next: string[] = [];
    for (const folder of level) {
      if (read++ >= maxFolders || found.length >= maxResults)
        return found.slice(0, maxResults);
      const entries = await readdir(folder, { withFileTypes: true }).catch(
        () => [],
      );
      for (const entry of entries) {
        // A Dirent for a link is never a directory, so links are not entered.
        if (!entry.isDirectory()) continue;
        const child = path.join(folder, entry.name);
        if (entry.name === VOICE_MODEL) found.push(child);
        else if (!entry.name.startsWith(".") && !SKIP.has(entry.name))
          next.push(child);
      }
    }
    level = next;
  }
  return found.slice(0, maxResults);
}

/** Folders named exactly `Qwen3-ASR-0.6B` under `home`, bounded. */
export async function searchVoiceModels(options: SearchOptions) {
  const home = path.resolve(options.home);
  const maxResults = options.maxResults ?? 8;
  const inside = (file: string) =>
    path.isAbsolute(file) &&
    path.basename(file) === VOICE_MODEL &&
    path.resolve(file).startsWith(`${home}${path.sep}`) &&
    !path
      .relative(home, file)
      .split(path.sep)
      .some((part) => part.startsWith(".") || SKIP.has(part));
  if ((options.platform ?? process.platform) === "darwin") {
    const answer = await (options.spotlight ?? spotlight)(home);
    if (answer) return answer.filter(inside).slice(0, maxResults);
  }
  return walk(
    home,
    options.maxDepth ?? 6,
    options.maxFolders ?? 20_000,
    maxResults,
  );
}

/**
 * A folder's identity for the verification cache: the folder and every
 * pinned file's inode, size and change time, or undefined when a file is
 * missing, a link, or the wrong size (refused without reading 1.9 GB).
 */
async function signature(folder: string, files: readonly ModelFile[]) {
  const outer = await lstat(folder).catch(() => undefined);
  if (!privateDirectory(outer)) return undefined;
  const parts = [`${outer!.ino}:${outer!.ctimeMs}`];
  for (const file of files) {
    const info = await lstat(path.join(folder, file.name)).catch(
      () => undefined,
    );
    if (!info?.isFile() || info.size !== file.size) return undefined;
    parts.push(`${file.name}:${info.ino}:${info.size}:${info.ctimeMs}`);
  }
  return parts.join("|");
}

/** Hashing 1.9 GB takes seconds: an unchanged folder is not hashed twice. */
const verified = new Map<string, string>();

/**
 * True when `folder` is a real private folder holding every pinned file at
 * its size and SHA-256. An install still re-verifies each file as it links
 * it; this check only decides what is offered.
 */
export async function verifiedVoiceModel(
  folder: string,
  signal: AbortSignal,
  files: readonly ModelFile[] = MODEL_FILES,
) {
  const before = await signature(folder, files);
  if (!before) return false;
  if (verified.get(folder) === before) return true;
  for (const file of files)
    if (!(await verifiedModelFile(path.join(folder, file.name), file, signal)))
      return false;
  if ((await signature(folder, files)) !== before) return false;
  verified.set(folder, before);
  return true;
}

/**
 * Fills `target` from the first source that holds the whole verified model,
 * linking (or copying) each file after verifying it again. Returns that
 * source, or undefined when none holds all of it; files already linked stay
 * in `target`, verified, for the download step to keep.
 */
export async function adoptVoiceModel(
  target: string,
  sources: string[],
  signal: AbortSignal,
  files: readonly ModelFile[] = MODEL_FILES,
) {
  for (const source of sources) {
    if (!(await signature(source, files))) continue;
    let complete = true;
    for (const file of files)
      if (
        !(await reuseModelFile(
          path.join(target, file.name),
          file,
          [source],
          signal,
        ))
      ) {
        complete = false;
        break;
      }
    if (complete) return source;
  }
  return undefined;
}

export interface FoundVoiceModel {
  /** The model folder, absolute; the studio sends it back to adopt it. */
  folder: string;
  /** The same folder with the home folder shown as `~`. */
  label: string;
  source: "configured" | "genobi" | "search";
}

export interface DiscoveryOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
  /** The model the server is configured with, if any. */
  configured?: string;
  /** Folders whose `genobi-voice-*` children are earlier installs. */
  parents?: string[];
  search?: Omit<SearchOptions, "home">;
  files?: readonly ModelFile[];
}

const label = (folder: string, home: string) =>
  folder.startsWith(`${home}${path.sep}`)
    ? `~${folder.slice(home.length)}`
    : folder;

/** Every verified Qwen3-ASR-0.6B on this machine, best first, no duplicates. */
export async function discoverVoiceModels(
  signal: AbortSignal,
  options: DiscoveryOptions = {},
): Promise<FoundVoiceModel[]> {
  const home = path.resolve(options.home ?? os.homedir());
  const env = options.env ?? process.env;
  const candidates: [string, FoundVoiceModel["source"]][] = [];
  for (const folder of [env.GENOBI_VOICE_MODEL?.trim(), options.configured])
    if (folder && path.isAbsolute(folder) && !/[\x00-\x1f]/.test(folder))
      candidates.push([path.resolve(folder), "configured"]);
  for (const parent of options.parents ?? [])
    for (const folder of await previousVoiceModels(parent))
      candidates.push([folder, "genobi"]);
  for (const folder of await searchVoiceModels({ ...options.search, home }))
    candidates.push([path.resolve(folder), "search"]);
  const found: FoundVoiceModel[] = [];
  const seen = new Set<string>();
  for (const [folder, source] of candidates) {
    if (signal.aborted) throw new Error("Search cancelled.");
    if (seen.has(folder)) continue;
    seen.add(folder);
    if (await verifiedVoiceModel(folder, signal, options.files))
      found.push({ folder, label: label(folder, home), source });
  }
  return found;
}
