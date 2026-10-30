import { unzipSync, zipSync, strToU8 } from "fflate";
import { FEEDBACK_PATH } from "../../shared/director/feedback";
import {
  DIRECTOR_PROJECT_BYTES,
  DIRECTOR_PROJECT_LIMIT,
  type Project,
} from "../../shared/director/types";
import { feedbackJson, feedbackOf } from "./feedback-file";
import { manifestText, readManifest } from "./manifest";
import { BRIEF_PATH, briefFileEntries } from "./prompt-brief";
import { validateProject } from "./validate";
import { readWorldFiles, WORLD_PATHS } from "./world-files";
export interface Bundle {
  project: Project;
  files: Map<string, Uint8Array<ArrayBuffer>>;
}
const MAX_BYTES = DIRECTOR_PROJECT_BYTES;
export async function digest(bytes: Uint8Array<ArrayBuffer>) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function validateFiles(bundle: Bundle) {
  const { project, files } = bundle;
  validateProject(project);
  // The World Builder recipe and 3D scene, when the project carries them.
  readWorldFiles(bundle);
  for (const item of [
    ...Object.values(project.assets),
    ...Object.values(project.modules),
    ...briefFileEntries(bundle),
  ]) {
    const bytes = files.get(item.file.path);
    if (!bytes) throw new Error(`Missing file: ${item.file.path}`);
    if ((await digest(bytes)) !== item.file.sha256)
      throw new Error(`File changed: ${item.file.path}`);
  }
  return bundle;
}
const sampleUrls = import.meta.glob(
  "../../docs/director-bundle/example/**/*.{mp4,wav,png}",
  { query: "?url", import: "default", eager: true },
) as Record<string, string>;
const sampleText = import.meta.glob(
  "../../docs/director-bundle/example/**/*.{json,mjs,svg}",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
function exampleText() {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [path, text] of Object.entries(sampleText))
    files.set(path.split("/example/")[1], new TextEncoder().encode(text));
  return files;
}
/** Graphics recipes alone, without downloading unrelated starter media. */
export function loadExampleModules() {
  const text = exampleText();
  const project = validateProject(
    JSON.parse(new TextDecoder().decode(text.get("studio.json"))),
  );
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const module of Object.values(project.modules)) {
    const bytes = text.get(module.file.path);
    if (!bytes) throw new Error(`Missing recipe: ${module.file.path}`);
    files.set(module.file.path, bytes);
  }
  return { project: { modules: project.modules }, files };
}
export async function loadExample(): Promise<Bundle> {
  const files = exampleText();
  await Promise.all(
    Object.entries(sampleUrls).map(async ([path, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Example unavailable");
      files.set(
        path.split("/example/")[1],
        new Uint8Array(await response.arrayBuffer()),
      );
    }),
  );
  const project = validateProject(
    JSON.parse(new TextDecoder().decode(files.get("studio.json"))),
  );
  return validateFiles({ project, files });
}
export async function importBundle(
  file: File,
  current?: Bundle,
): Promise<Bundle> {
  if (file.size > MAX_BYTES)
    throw new Error(`Bundle limit is ${DIRECTOR_PROJECT_LIMIT}`);
  if (file.name.endsWith(".json")) {
    if (!current)
      throw new Error("Load the media ZIP before a standalone JSON manifest");
    return validateFiles({
      project: readManifest(new Uint8Array(await file.arrayBuffer())),
      files: current.files,
    });
  }
  let total = 0,
    count = 0,
    feedback = false;
  const raw = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(entry) {
      total += entry.originalSize;
      // `feedback.json` is derived from the manifest on every save, so it is
      // neither read back nor counted against the 128 files a project may use.
      if (entry.name === FEEDBACK_PATH && !feedback) {
        feedback = true;
        if (total > MAX_BYTES)
          throw new Error(
            `Unpacked bundle exceeds ${DIRECTOR_PROJECT_LIMIT} / 128 files`,
          );
        return false;
      }
      count++;
      if (total > MAX_BYTES || count > 128)
        throw new Error(
          `Unpacked bundle exceeds ${DIRECTOR_PROJECT_LIMIT} / 128 files`,
        );
      if (entry.name.endsWith("/")) return false;
      if (
        !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(entry.name)
      )
        throw new Error("Unsafe bundle path");
      return true;
    },
  });
  if (!raw["project.json"])
    throw new Error("ZIP needs project.json at its root");
  return validateFiles({
    project: readManifest(raw["project.json"]),
    files: new Map(
      Object.entries(raw).map(([name, bytes]) => [name, new Uint8Array(bytes)]),
    ),
  });
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
/**
 * The ZIP Download bundle writes: `project.json` (frame notes and the agent's
 * revision included, since they live in the manifest), every file the
 * manifest or brief names, the World Builder recipe and 3D scene when the
 * project carries them (`world-files.ts`), and `feedback.json` when it has an
 * agent's revision: the feedback, written afresh from the manifest each save.
 */
export function bundleZip(bundle: Bundle) {
  const files: Record<string, Uint8Array> = {
    "project.json": strToU8(manifestText(bundle.project)),
  };
  for (const item of [
    ...Object.values(bundle.project.assets),
    ...Object.values(bundle.project.modules),
    ...briefFileEntries(bundle),
  ])
    files[item.file.path] = bundle.files.get(item.file.path)!;
  if (bundle.files.has(BRIEF_PATH))
    files[BRIEF_PATH] = bundle.files.get(BRIEF_PATH)!;
  for (const path of WORLD_PATHS)
    if (bundle.files.has(path)) files[path] = bundle.files.get(path)!;
  if (bundle.project.feedbackBase)
    files[FEEDBACK_PATH] = strToU8(feedbackJson(feedbackOf(bundle)));
  return zipSync(files, { level: 0 });
}
export function saveBundle(bundle: Bundle) {
  download(
    new Blob([new Uint8Array(bundleZip(bundle))], { type: "application/zip" }),
    `${bundle.project.id}.zip`,
  );
}
