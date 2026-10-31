import { AppError, requireKey } from "../server/errors";
import { ComfySdkWorkflows, destinationFetch } from "../server/comfy-sdk";
import { ComfyLow } from "@comfyorg/sdk/low";
import { isComfyKey } from "../shared/provider";
import { parseWorkflowDestination } from "../shared/comfy/destination";
import {
  HOSTED_RUN_LOCATION,
  type RunLocationState,
} from "../shared/comfy/run-location";
import { entryFor, type Entry } from "../shared/registry";
import { isDeployModel } from "../shared/comfy/deploy-catalogue";
import {
  DEPLOY_FILE_TOKENS,
  deployInvalid,
} from "../shared/comfy/deploy-input";
import {
  HOSTED_DEPLOY_INPUT_BYTES,
  validDeploymentFile,
} from "../shared/comfy/deploy-file";
import {
  requireTemplateFor,
  workflowCatalogue,
} from "../shared/comfy/workflows";

import { workflowRun } from "../shared/comfy/runs";
import { composePrompt } from "../shared/presets";
import type { GenerateInput } from "../shared/types";
import { sha256Hex, type WorkflowPlan } from "../shared/take";
import { rateLimit } from "./storage";
import { MAX_DEPLOYMENT_SETTINGS } from "../shared/limits";

export { HOSTED_DEPLOY_INPUT_BYTES } from "../shared/comfy/deploy-file";
/** Unexpired input tickets one session may hold. */
const MAX_STAGED = 32;
const EXTENSIONS: Record<string, string> = {
  "video/webm": "webm",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/wav": "wav",
  "audio/flac": "flac",
  "audio/mpeg": "mp3",
};
interface Settings {
  url: string | null;
  template: string | null;
  revision: number;
}
const readSettings = (env: Env, session: string) =>
  env.DB.prepare(
    "SELECT url, template, revision FROM deployment_settings WHERE session=?",
  )
    .bind(session)
    .first<Settings>();
const deployment = (url: string) => {
  const parsed = parseWorkflowDestination("deployment", url);
  if (parsed.kind !== "deployment")
    throw deployInvalid("Register a deployment first.");
  return { url: parsed.url, name: new URL(parsed.url).hostname.split(".")[0] };
};
export function deploymentClient(url: string) {
  return new ComfySdkWorkflows({
    destination: parseWorkflowDestination("deployment", url),
    portableUploads: true,
  });
}
export async function deploymentState(
  env: Env,
  session: string,
): Promise<RunLocationState> {
  const saved = await readSettings(env, session);
  return {
    ...HOSTED_RUN_LOCATION,
    fixed: false,
    choices: ["cloud", "deployment"],
    revision: saved?.revision ?? 0,
    ...(saved?.url
      ? {
          location: "deployment",
          mode: "deployment",
          label: "Comfy API deployment",
          source: "session",
          deployment: deployment(saved.url),
        }
      : {}),
    note: "Workflow models use your registered deployment; API models keep their provider route. Use a Comfy key authorised for the deployment's workspace; that workspace pays for GPU time.",
  };
}
export async function deploymentCatalogue(env: Env, session: string) {
  const saved = await readSettings(env, session);
  return workflowCatalogue(
    (id) =>
      id === "ltx-deploy-layout-to-video"
        ? (saved?.template ?? undefined)
        : undefined,
    true,
    saved?.revision ?? 0,
    Boolean(saved?.url),
  );
}

/** Unpaid, same-origin settings; POSTs need a custom JSON header. */
export async function deploymentSettingsRoute(
  request: Request,
  env: Env,
  session: string,
  body: () => Promise<unknown>,
) {
  const path = new URL(request.url).pathname;
  if (
    request.method !== "POST" ||
    ![
      "/api/settings/run-location",
      "/api/settings/workflows/selection",
    ].includes(path)
  )
    return undefined;
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "Send JSON from the studio.");
  await rateLimit(
    env,
    "settingsPerIp",
    await sha256Hex(request.headers.get("cf-connecting-ip") || "local"),
  );
  await rateLimit(env, "settingsGlobal", "deployment-settings");
  await rateLimit(env, "edit", session);
  const value = await body();
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(value).length > 2048
  )
    throw new AppError(400, "Send a small settings object.");
  const v = value as Record<string, unknown>;
  if (path.endsWith("run-location")) {
    if (v.location !== "cloud" && v.location !== "deployment")
      throw new AppError(400, "Choose Comfy Cloud or a Comfy deployment.");
    const saved = await readSettings(env, session);
    // The default needs no durable record. Anonymous visitors cannot fill D1
    // by repeatedly choosing Cloud with a fresh cookie.
    if (v.location === "cloud" && !saved) return deploymentState(env, session);
    const url =
      v.location === "cloud"
        ? null
        : deployment(
            typeof v.deploymentUrl === "string"
              ? v.deploymentUrl
              : (saved?.url ?? ""),
          ).url;
    // At the ceiling a new session displaces the least recently saved one in
    // the same transaction, rather than refusing everyone until rows expire:
    // rotating cookies can then only push out an old endpoint, which its
    // owner re-enters. Jobs keep polling the endpoint recorded on their take.
    await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM deployment_settings WHERE session IN (
          SELECT session FROM deployment_settings ORDER BY updated_at LIMIT max(0,
            (SELECT count(*) FROM deployment_settings) - ? + 1))
        AND NOT EXISTS (SELECT 1 FROM deployment_settings WHERE session=?)`,
      ).bind(MAX_DEPLOYMENT_SETTINGS, session),
      env.DB.prepare(
        `INSERT INTO deployment_settings(session,url,revision,updated_at) VALUES(?,?,1,?)
        ON CONFLICT(session) DO UPDATE SET url=excluded.url, revision=deployment_settings.revision+1,updated_at=excluded.updated_at`,
      ).bind(session, url, Date.now()),
    ]);
    return deploymentState(env, session);
  }
  if (v.entry !== "ltx-deploy-layout-to-video")
    throw new AppError(
      400,
      "Only the deployment layout preset can be changed here.",
    );
  const { choice } = requireTemplateFor(v.entry, v.template);
  const result = await env.DB.prepare(
    "UPDATE deployment_settings SET template=?,revision=revision+1,updated_at=? WHERE session=? AND url IS NOT NULL",
  )
    .bind(choice.id, Date.now(), session)
    .run();
  if (!result.meta.changes) throw deployInvalid("Register a deployment first.");
  return deploymentCatalogue(env, session);
}

/** Read bounded bytes, including chunked requests, without trusting Content-Length. */
export async function deploymentUpload(
  request: Request,
  env: Env,
  session: string,
  token: string,
  key: string,
) {
  if (!isComfyKey(requireKey(key)))
    throw deployInvalid("Use a Comfy key for this deployment.");
  const saved = await readSettings(env, session);
  if (!saved?.url) throw deployInvalid("Register a deployment first.");
  const type = request.headers.get("content-type") ?? "";
  // Refuse an unknown role or type before reading up to 32 MB of it.
  if (
    !(DEPLOY_FILE_TOKENS as readonly string[]).includes(token) ||
    !EXTENSIONS[type]
  )
    throw deployInvalid(
      "Choose a matching WebM, PNG/JPEG/WebP or WAV/FLAC/MP3 input.",
    );
  // A session at its ticket cap uploads nothing; the insert below stays atomic.
  const staged = await env.DB.prepare(
    "SELECT count(*) AS n FROM deployment_assets WHERE session=? AND expires>?",
  )
    .bind(session, Date.now())
    .first<{ n: number }>();
  if ((staged?.n ?? 0) >= MAX_STAGED)
    throw new AppError(
      429,
      "Too many staged deployment inputs. Wait for tickets to expire.",
    );
  const reader = request.body?.getReader();
  if (
    !reader ||
    Number(request.headers.get("content-length")) > HOSTED_DEPLOY_INPUT_BYTES
  )
    throw new AppError(413, "Keep hosted deployment inputs under 32 MB each.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > HOSTED_DEPLOY_INPUT_BYTES)
        throw new AppError(
          413,
          "Keep hosted deployment inputs under 32 MB each.",
        );
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  // Only the signature is copied; the Blob takes the chunks, so the input is
  // held once rather than twice under the Worker's memory ceiling.
  const head = new Uint8Array(Math.min(length, 16));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= head.length) break;
    const part = chunk.subarray(0, head.length - offset);
    head.set(part, offset);
    offset += part.length;
  }
  if (!length || !validDeploymentFile(token, type, head))
    throw deployInvalid(
      "Choose a matching WebM, PNG/JPEG/WebP or WAV/FLAC/MP3 input.",
    );
  // The high-level SDK hashes with dynamically compiled WASM, disallowed in
  // workerd. The official low transport omits that optional dedup hint; Comfy
  // computes the authoritative content hash from the upload.
  let assetId: string;
  try {
    const low = new ComfyLow(saved.url, key, {
      fetch: destinationFetch(saved.url, fetch),
      clientInfo: "genobi",
    });
    const asset = await low.postAssets(
      new Blob(chunks),
      type,
      `genobi-${crypto.randomUUID()}.${EXTENSIONS[type]}`,
      { signal: AbortSignal.timeout(90_000) },
    );
    if (typeof asset.id !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(asset.id))
      throw new Error("Invalid asset receipt");
    assetId = asset.id;
  } catch {
    throw new AppError(
      502,
      "The deployment input upload failed. No generation was submitted.",
    );
  }
  const reference = { __type: "core/ASSET", info: { id: assetId } };
  const id = crypto.randomUUID();
  // Atomic per-session ticket bound, including concurrent uploads.
  const result = await env.DB.prepare(
    `INSERT INTO deployment_assets(id,session,url,token,reference,expires)
    SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM deployment_assets WHERE session=? AND expires>?) < ${MAX_STAGED}`,
  )
    .bind(
      id,
      session,
      saved.url,
      token,
      JSON.stringify(reference),
      Date.now() + 2 * 3600_000,
      session,
      Date.now(),
    )
    .run();
  if (!result.meta.changes)
    throw new AppError(
      429,
      "Too many staged deployment inputs. Wait for tickets to expire.",
    );
  return { id };
}

/** The current hosted plan, without reading or uploading any input assets. */
export async function workflowPlan(
  env: Env,
  session: string,
  entry: Entry,
): Promise<WorkflowPlan> {
  if (entry.status !== "ready" || entry.route !== "workflow") return {};
  const saved = await readSettings(env, session);
  const { choice } = requireTemplateFor(
    entry.id,
    entry.id === "ltx-deploy-layout-to-video"
      ? (saved?.template ?? undefined)
      : undefined,
  );
  const cloud: WorkflowPlan = { location: "cloud", workflow: choice.id };
  if (!saved?.url) {
    if (isDeployModel(entry.videoModel))
      throw deployInvalid("Register a Comfy deployment in Settings first.");
    return cloud;
  }
  if (choice.template.hosts && !choice.template.hosts.includes("deployment"))
    return cloud;
  return {
    location: "deployment",
    workflow: choice.id,
    deployment: deployment(saved.url),
  };
}

/** Freeze endpoint, preset and owned input references before the durable reservation. */
export async function deploymentPlan(
  env: Env,
  session: string,
  input: GenerateInput,
) {
  const entry = entryFor(input.generator, input.model);
  const plan = await workflowPlan(env, session, entry);
  if (!plan.deployment || entry.status !== "ready")
    return { plan, values: {} as Record<string, unknown> };
  const { values } = workflowRun(
    entry.model,
    input,
    composePrompt(input),
    plan.workflow,
    "deployment",
  );
  const refs = new Map<string, object>();
  for (const [token, id] of Object.entries(input.deploy?.assets ?? {})) {
    const row = await env.DB.prepare(
      "SELECT reference FROM deployment_assets WHERE id=? AND session=? AND url=? AND token=? AND expires>?",
    )
      .bind(id, session, plan.deployment.url, token, Date.now())
      .first<{ reference: string }>();
    if (!row)
      throw deployInvalid(
        "Reattach deployment inputs in this session before quoting.",
      );
    refs.set(id, JSON.parse(row.reference));
  }
  return {
    plan,
    values: Object.fromEntries(
      Object.entries(values).map(([path, value]) => [
        path,
        typeof value === "string" && refs.has(value) ? refs.get(value) : value,
      ]),
    ),
  };
}
