import { AppError } from "../../server/errors";
import type { ProviderResult } from "../provider";
import { CLOUD_BASE, type DestinationKind } from "./destination";
import type { ApiGraph, WorkflowSlot } from "./slots";
export type { WorkflowSlot } from "./slots";

/**
 * The `workflow` route: Genobi's own API-format graphs, run through Comfy API
 * v2 with the official SDK. Router (`shared/comfy/router.ts`) runs partner and
 * Router-hosted models by id and cannot run a graph, so the two routes sit
 * side by side under one Comfy key. The SDK needs Node APIs, so its client
 * lives in the adapters (`server/comfy-sdk.ts`) behind `WorkflowClient`, and
 * this module keeps what both adapters must agree on: the handle a job stores,
 * the job vocabulary a Comfy state maps to, and which failures are refusals.
 */
/** The node whose file is the run's result, and what kind of file it is. */
export interface WorkflowOutput {
  nodeId: string;
  media: "video" | "image" | "audio";
  /** Required named audio outputs; a completed job missing any is not Ready. */
  companions?: { nodeId: string; label: string }[];
}
/** Every shipped video graph ends in SaveVideo node `75`. */
export const VIDEO_OUTPUT: WorkflowOutput = { nodeId: "75", media: "video" };
export interface WorkflowTemplate {
  id: string;
  file: `workflows/${string}.json`;
  graph: ApiGraph;
  slots: Record<string, WorkflowSlot>;
  requiredNodes: string[];
  requiredModels: string[];
  /** Absent: `VIDEO_OUTPUT`. */
  output?: WorkflowOutput;
  /**
   * The only hosts that can run this graph, set on one that needs a custom
   * node pack neither Comfy Cloud nor a stock ComfyUI holds (the Openjutsu
   * swap: a Comfy deployment built for it). A run goes to the session's
   * location when it is one of these, and otherwise to the first listed
   * (`server/workflow-settings.ts`). Absent: the session's run location.
   */
  hosts?: readonly SwapHost[];
}
/** A host a pinned template can run on. */
export type SwapHost = "deployment";
/** An input file a graph loads, uploaded to the destination before the run. */
export interface WorkflowFile {
  bytes: Uint8Array;
  contentType: "image/png" | "image/jpeg" | "image/webp" | "video/mp4";
}
export interface WorkflowRunOptions {
  /** Sent as the submission's Idempotency-Key: the reserved job's id. */
  idempotencyKey: string;
  /**
   * Where the run goes: the session's run location, recorded in the take.
   * Absent: Comfy Cloud, as on the hosted Worker.
   */
  location?: DestinationKind;
  deployment?: { url: string; name: string };
  /** Files for the template's `image` and `video` slots, by slot name. */
  files?: Record<string, WorkflowFile>;
}
export interface WorkflowClient {
  /**
   * Submit a filled workflow once; resolves to a handle the job services store
   * where a Router job keeps its polling URL.
   */
  run(
    template: WorkflowTemplate,
    values: Record<string, unknown>,
    key: string,
    options: WorkflowRunOptions,
  ): Promise<string>;
  /**
   * One poll: the job state, and once it succeeded a signed URL for the
   * template's output (`VIDEO_OUTPUT` when none is named).
   */
  poll(
    handle: string,
    key: string,
    output?: WorkflowOutput,
  ): Promise<ProviderResult>;
  /**
   * The signed storage URL, fetched without the key.
   */
  download(url: string, key?: string): Promise<Response>;
  /**
   * Whether a run at this location has a client to go to; a quote asks first,
   * so an unset destination refuses before anything is reserved. Absent on a
   * single client, which takes whatever it is handed.
   */
  serves?(
    location: DestinationKind,
    deployment?: { url: string; name: string },
  ): boolean;
}

/** Said when a run reaches the stub: nothing left the server, so nothing was charged. */
export const WORKFLOW_NOT_YET =
  "This model runs as an open workflow through Comfy, which this build cannot submit yet. Nothing was sent or charged.";
const notYet = () => new AppError(503, WORKFLOW_NOT_YET, "cloud_unavailable");
/** Refuses every run before anything is sent; for tests and a build without the SDK. */
export class NotYetWorkflow implements WorkflowClient {
  async run(): Promise<string> {
    throw notYet();
  }
  async poll(): Promise<ProviderResult> {
    throw notYet();
  }
  async download(): Promise<Response> {
    throw notYet();
  }
}

/** Refusals raised before anything was sent: a known zero, not an uncertain charge. */
const UNSENT = new Set([
  "cloud_unavailable",
  "workflow_not_configured",
  "workflow_unsent",
]);
export const isUnsent = (error: unknown) =>
  error instanceof AppError && UNSENT.has(error.code);
export const unsent = (message: string) =>
  new AppError(
    503,
    `${message} Nothing was sent or charged.`,
    "workflow_unsent",
  );

const JOB_ID = /^[A-Za-z0-9_-]{1,128}$/;
const V2_PATH = /^\/api\/v2\/jobs\/([A-Za-z0-9_-]{1,128})$/;
/** Recorded by the earlier client, which posted to the pre-SDK /api/prompt. */
const LEGACY_PATH = /^\/api\/job\/([A-Za-z0-9_-]{1,128})\/status$/;

/** The handle a job stores: the v2 job URL on Comfy Cloud or a deployment. */
export function workflowHandle(id: unknown, base = CLOUD_BASE): string {
  if (typeof id !== "string" || !JOB_ID.test(id)) throw unconfirmed();
  return `${base}/api/v2/jobs/${id}`;
}

/**
 * The Comfy job id a stored handle names. Accepts the v2 job URL this client
 * stores under `base` (Comfy Cloud, or a deployment's own base URL) and, on
 * Comfy Cloud, the status URL the earlier client stored; nothing else: a
 * handle never chooses where a key is sent.
 */
export function workflowJobId(handle: unknown, base = CLOUD_BASE): string {
  let url: URL;
  try {
    url = new URL(String(handle));
  } catch {
    throw new AppError(502, "The provider returned an invalid URL.");
  }
  const root = new URL(base);
  const prefix = root.pathname.replace(/\/+$/, "");
  const path = url.pathname.startsWith(`${prefix}/`)
    ? url.pathname.slice(prefix.length)
    : "";
  const match =
    url.protocol === "https:" &&
    url.origin === root.origin &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash
      ? (V2_PATH.exec(path) ??
        (base === CLOUD_BASE ? LEGACY_PATH.exec(path) : null))
      : null;
  if (!match)
    throw new AppError(
      502,
      "The provider returned an unsupported delivery location.",
    );
  return match[1];
}

const LOCAL_HISTORY =
  /^\/(?:[A-Za-z0-9._~-]+\/)*history\/([A-Za-z0-9_-]{1,128})$/;

/**
 * The prompt id a local ComfyUI handle names: `{base}/history/{id}` on
 * http://127.0.0.1 or http://localhost, nothing else. The local client checks
 * the base is its own before it reads one.
 */
export function localJobId(handle: unknown): string | undefined {
  let url: URL;
  try {
    url = new URL(String(handle));
  } catch {
    return undefined;
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return undefined;
  return LOCAL_HISTORY.exec(url.pathname)?.[1];
}

/** The job id on a deployment's own base, or undefined for any other handle. */
export function deploymentJobId(handle: unknown, base: string) {
  try {
    return workflowJobId(handle, base);
  } catch {
    return undefined;
  }
}

/** The id a v2 job URL on any https host ends in; for the job's own record. */
const anyJobId = (handle: unknown) => {
  try {
    const url = new URL(String(handle));
    return url.protocol === "https:"
      ? /\/api\/v2\/jobs\/([A-Za-z0-9_-]{1,128})$/.exec(url.pathname)?.[1]
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The job id any workflow handle names: a local prompt id or a Comfy job id
 * on Cloud or a deployment. Read only from a handle a client just returned,
 * to record it; polling checks the address again.
 */
export const handleJobId = (handle: unknown) =>
  localJobId(handle) ?? anyJobId(handle) ?? workflowJobId(handle);

/** Comfy API v2 job states in the job services' vocabulary. */
const STATES: Record<string, string> = {
  queued: "Pending",
  running: "Generating",
  canceling: "Generating",
  succeeded: "Ready",
  failed: "Error",
  canceled: "stopped",
  expired: "Task not found",
};
export function workflowState(status: unknown): string {
  const mapped = typeof status === "string" ? STATES[status] : undefined;
  if (!mapped)
    throw new AppError(502, "Comfy Cloud returned an unexpected job state.");
  return mapped;
}

/** What the adapter reads off an SDK error, without importing the SDK. */
export interface ComfyFailure {
  httpStatus?: number;
  code?: string;
  details?: Record<string, unknown> | null;
}
const failureOf = (error: unknown): ComfyFailure =>
  error && typeof error === "object" ? (error as ComfyFailure) : {};

const byStatus: Record<number, string> = {
  401: "The API key was not accepted.",
  402: "Your Comfy account does not have enough credits.",
  403: "This key does not have access to Comfy Cloud.",
  429: "Comfy is busy. Please wait before trying again.",
};
export const unconfirmed = () =>
  new AppError(
    502,
    "Submission could not be confirmed. Check Comfy usage before trying again.",
    "submission_unknown",
  );
const refused = (status: number) =>
  new AppError(
    status === 429 ? 429 : 502,
    byStatus[status] ?? "Comfy Cloud could not complete the request.",
    `provider_${status}`,
  );

/**
 * A refusal in plain words. Node errors name the node's class, never the
 * provider's own text; a missing AKUSPACE LoRA gets the one fix it needs.
 */
function rejected(details: ComfyFailure["details"]): AppError {
  const nodes =
    details && typeof details === "object"
      ? ((details.node_errors as Record<string, unknown> | undefined) ??
        details)
      : {};
  const classes = Object.entries(nodes ?? {}).flatMap(([id, value]) => {
    const type = (value as { class_type?: unknown } | null)?.class_type;
    if (id === "900" || type === "LoraLoaderModelOnly")
      return ["LoraLoaderModelOnly"];
    return typeof type === "string" && /^[A-Za-z0-9_]{1,64}$/.test(type)
      ? [type]
      : [];
  });
  return new AppError(
    502,
    classes.includes("LoraLoaderModelOnly")
      ? "Comfy Cloud could not load the AKUSPACE LoRA. Import akuspace-ltx25-v0.5.safetensors into your Comfy Cloud library (Creator tier) and try again."
      : classes.length
        ? `Comfy Cloud refused this workflow at ${[...new Set(classes)].join(", ")}.`
        : "Comfy Cloud refused this workflow.",
    "workflow_rejected",
  );
}

/**
 * A failed submission. A refusal the server stated (4xx, node errors) is
 * final; a 5xx, a lost or unreadable answer, a timeout or a reused key is "could
 * not be confirmed" and is never retried, because the run may have started.
 */
export function submitError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const { httpStatus, code, details } = failureOf(error);
  if (typeof httpStatus !== "number" || httpStatus >= 500 || httpStatus < 400)
    return code === "missing_credentials"
      ? unsent("Workflows need a Comfy key.")
      : unconfirmed();
  if (code === "idempotency_key_reuse") return unconfirmed();
  if (
    code === "invalid_workflow" ||
    code === "workflow_format_ui" ||
    httpStatus === 422
  )
    return rejected(details);
  return refused(httpStatus);
}

/** A failed poll or link read: retryable unless the job is gone. */
export function pollError(error: unknown): AppError | "gone" {
  if (error instanceof AppError) return error;
  const { httpStatus } = failureOf(error);
  if (httpStatus === 404) return "gone";
  if (typeof httpStatus === "number" && byStatus[httpStatus])
    return refused(httpStatus);
  return new AppError(502, "Comfy Cloud could not complete the request.");
}
