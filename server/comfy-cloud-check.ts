import { AppError, requireKey } from "./errors";
import { isComfyKey, type Fetcher } from "../shared/provider";
import { CLOUD_BASE } from "../shared/comfy/destination";
import { cloudReadiness, isObjectInfo } from "../shared/comfy/readiness";
import type { WorkflowTemplate } from "../shared/comfy/workflow";
import {
  workflowTemplates,
  type WorkflowCatalogue,
} from "../shared/comfy/workflows";

/** Bounds apply to streamed responses too; object_info can be large. */
export const COMFY_INFO_MAX_BYTES = 16 * 1024 * 1024;
const unavailable = () =>
  new AppError(
    502,
    "Comfy Cloud's node catalogue could not be checked. Availability remains unknown; no generation was submitted.",
    "workflow_check_unavailable",
  );

async function readInfo(response: Response) {
  if (
    Number(response.headers.get("content-length")) > COMFY_INFO_MAX_BYTES ||
    !response.body
  ) {
    await response.body?.cancel().catch(() => {});
    throw unavailable();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > COMFY_INFO_MAX_BYTES) throw unavailable();
      parts.push(decoder.decode(next.value, { stream: true }));
    }
    parts.push(decoder.decode());
    const info: unknown = JSON.parse(parts.join(""));
    if (!isObjectInfo(info)) throw unavailable();
    return info;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/**
 * Explicit read only. Cloud's node discovery remains on its documented v1
 * endpoint (X-API-Key); job execution stays on the existing SDK v2 adapter.
 * Never infer that endpoint exists on a deployment, persist a key, or follow
 * a redirect. Nothing in this helper uploads inputs or starts a GPU job.
 */
export async function checkComfyCloud(
  templates: readonly WorkflowTemplate[],
  value: unknown,
  fetcher: Fetcher = fetch,
) {
  const key = requireKey(value);
  if (!isComfyKey(key))
    throw new AppError(
      400,
      "Connect a Comfy API key to check Comfy Cloud workflows.",
      "invalid_key",
    );
  let response: Response;
  try {
    response = await fetcher(`${CLOUD_BASE}/api/object_info`, {
      method: "GET",
      headers: { "X-API-Key": key, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw unavailable();
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if (response.status === 401 || response.status === 403)
      throw new AppError(
        response.status,
        "This Comfy key could not read the Cloud node catalogue. Check the account and Cloud API access.",
        "workflow_check_access",
      );
    if (response.status === 429)
      throw new AppError(
        429,
        "Comfy Cloud refused the catalogue check. Check your subscription or try again later.",
        "workflow_check_limited",
      );
    throw unavailable();
  }
  try {
    return cloudReadiness(
      templates,
      await readInfo(response),
      new Date().toISOString(),
    );
  } catch {
    throw unavailable();
  }
}

/** Keep the report scoped to templates this runtime actually offers. */
export async function checkedCloudCatalogue(
  catalogue: WorkflowCatalogue,
  key: unknown,
  fetcher?: Fetcher,
) {
  const offered = new Set(catalogue.templates.map((template) => template.id));
  const templates = workflowTemplates
    .filter((choice) => offered.has(choice.id))
    .map((choice) => choice.template);
  return {
    ...catalogue,
    cloud: await checkComfyCloud(templates, key, fetcher),
  };
}
