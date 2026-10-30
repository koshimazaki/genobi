import { strToU8 } from "fflate";
import type { DirectorCommand } from "../../shared/director/commands";
import { applyAgentCommand } from "../../shared/director/feedback";
import type { Project } from "../../shared/director/types";
import { digest, validateFiles, type Bundle } from "./bundle";
import {
  BRIEF_PATH,
  briefFileEntries,
  readBrief,
  writeBrief,
  type PromptBrief,
} from "./prompt-brief";
import { carryWorldFiles } from "./world-files";
import { readHostedStudio } from "../hosted-studio";

// The studio's side of the project copy on the local server: push the open
// bundle at its revision, read the copy back after a conflict, and apply a
// Director command from the copy's stream with the same `applyAgentCommand`
// the server ran. The hosted studio has no copy; `copyAvailable` says so.

export interface CopyEvent {
  projectId: string;
  revision: number;
  baseRevision: number | null;
  source: "snapshot" | "studio" | "command";
  command?: DirectorCommand;
}
export type PushResult =
  { ok: true; revision: number } | { ok: false; revision: number | null };

const route = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
const json = { "Content-Type": "application/json" };

async function failure(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: unknown;
  };
  return new Error(
    typeof body.error === "string"
      ? body.error.slice(0, 200)
      : `The project copy answered ${response.status}`,
  );
}

/**
 * True on the local server. The hosted Worker has no `/api/projects`, and a
 * bare Vite preview answers it with the page, so the shape is checked too.
 */
export async function copyAvailable(fetcher: typeof fetch = fetch) {
  if ((await readHostedStudio()) === true) return false;
  try {
    const response = await fetcher("/api/projects");
    const body = (await response.json()) as { projects?: unknown };
    return response.ok && Array.isArray(body.projects);
  } catch {
    return false;
  }
}

/** Every file the bundle needs, by SHA-256: assets, recipes, prompt fonts. */
function needed(bundle: Bundle) {
  const out = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const { file } of [
    ...Object.values(bundle.project.assets),
    ...Object.values(bundle.project.modules),
    ...briefFileEntries(bundle),
  ]) {
    const bytes = bundle.files.get(file.path);
    if (bytes) out.set(file.sha256, bytes);
  }
  return out;
}

/**
 * Push the bundle on top of `baseRevision`. Files go first, each once per
 * page (`uploaded`); a server that lost some asks for them by hash.
 */
export async function pushCopy(
  bundle: Bundle,
  baseRevision: number | null,
  uploaded: Set<string>,
  fetcher: typeof fetch = fetch,
): Promise<PushResult> {
  const { project } = bundle;
  const files = needed(bundle);
  const upload = async (sha: string) => {
    const bytes = files.get(sha);
    if (!bytes) throw new Error("A project file is missing from the studio");
    const response = await fetcher(`${route(project.id)}/files/${sha}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    if (!response.ok) throw await failure(response);
    uploaded.add(sha);
  };
  for (const sha of files.keys()) if (!uploaded.has(sha)) await upload(sha);
  const brief = bundle.files.has(BRIEF_PATH) ? readBrief(bundle) : null;
  const put = () =>
    fetcher(route(project.id), {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ baseRevision, project, brief }),
    });
  let response = await put();
  let body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as {
    code?: string;
    missing?: string[];
    revision?: number | null;
  };
  if (response.status === 409 && body.code === "files_missing") {
    for (const sha of body.missing ?? []) await upload(sha);
    response = await put();
    body = (await response
      .clone()
      .json()
      .catch(() => ({}))) as typeof body;
  }
  if (response.status === 409 && body.code === "revision_conflict")
    return { ok: false, revision: body.revision ?? null };
  if (!response.ok) throw await failure(response);
  return { ok: true, revision: project.revision };
}

/** What `GET /api/projects/:id` answers: the manifest and the brief. */
export interface CopyManifest {
  project: Project;
  brief: PromptBrief | null;
}

/**
 * The copy's manifest, or null when this session holds none (404). Read
 * before a page's first push of a project, so a reloaded page opens the copy
 * instead of pushing over it and meeting a 409; `readCopy` takes the answer
 * rather than reading the manifest again.
 */
export async function readManifest(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<CopyManifest | null> {
  const response = await fetcher(route(id));
  if (response.status === 404) return null;
  if (!response.ok) throw await failure(response);
  return (await response.json()) as CopyManifest;
}

/**
 * The copy as a bundle, reusing the studio's bytes wherever hashes match.
 * `manifest`: one just read, so it is not downloaded twice.
 */
export async function readCopy(
  id: string,
  local: Bundle | undefined,
  fetcher: typeof fetch = fetch,
  manifest?: CopyManifest,
): Promise<Bundle> {
  let copy = manifest;
  if (!copy) {
    const response = await fetcher(route(id));
    if (!response.ok) throw await failure(response);
    copy = (await response.json()) as CopyManifest;
  }
  const have = local ? needed(local) : new Map();
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  if (copy.brief) files.set(BRIEF_PATH, strToU8(JSON.stringify(copy.brief)));
  const shell = { project: copy.project, files };
  for (const { file } of [
    ...Object.values(copy.project.assets),
    ...Object.values(copy.project.modules),
    ...briefFileEntries(shell),
  ]) {
    let bytes = have.get(file.sha256);
    if (!bytes) {
      const got = await fetcher(`${route(id)}/files/${file.sha256}`);
      if (!got.ok) throw await failure(got);
      bytes = new Uint8Array(await got.arrayBuffer());
      if ((await digest(bytes)) !== file.sha256)
        throw new Error(`File changed: ${file.path}`);
    }
    files.set(file.path, bytes);
  }
  // The copy holds no 3D sources; the studio's own stay with the project.
  return validateFiles(carryWorldFiles(local, shell));
}

/**
 * The bundle after a streamed command, or undefined when the command does
 * not apply here or lands on another revision: the caller reloads instead.
 */
export function applyEvent(
  bundle: Bundle,
  event: CopyEvent,
): Bundle | undefined {
  if (!event.command || bundle.project.revision !== event.baseRevision) return;
  const brief = readBrief(bundle);
  // The server recorded the result as the agent's revision; so does this.
  const result = applyAgentCommand(
    { project: bundle.project, prompt: brief.text },
    event.command,
  );
  if (!result.ok || result.copy.project.revision !== event.revision) return;
  // A recipe the command brought in from the registry has no checked bytes
  // here: a file at its path that the project did not name (an imported ZIP
  // may hold one) was never held to its SHA-256. Only files the bundle
  // already names at that path and hash are trusted; otherwise reload, which
  // downloads the recipe from the copy by its hash.
  const named = new Set(
    [
      ...Object.values(bundle.project.assets),
      ...Object.values(bundle.project.modules),
    ].map((item) => `${item.file.path}\n${item.file.sha256}`),
  );
  const { modules } = result.copy.project;
  if (
    Object.values(modules).some(
      (m) =>
        !named.has(`${m.file.path}\n${m.file.sha256}`) ||
        !bundle.files.has(m.file.path),
    )
  )
    return;
  const next = { project: result.copy.project, files: bundle.files };
  if (result.copy.prompt === brief.text) return next;
  const written = writeBrief(next, { ...brief, text: result.copy.prompt });
  return {
    ...written,
    project: { ...written.project, revision: event.revision },
  };
}

/** A one-use code the person gives an agent to reach this project. */
export async function linkCode(id: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${route(id)}/link`, {
    method: "POST",
    headers: json,
  });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as { code: string; expiresAt: string };
}

export const eventsUrl = (id: string) => `${route(id)}/events`;
